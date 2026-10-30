// Crea el NPC "Plantilla Arsenal": copia del NPC "Plantilla" (Simple) con
// munición y granadas a 990 unidades, sin armas. Antes crea en el catálogo
// la munición explosiva que falta: "Granada básica" (6d6) y "Misil básico" (8d6).
//
// Uso:
//   node crear-plantilla-arsenal.js              (solo muestra lo que haría)
//   node crear-plantilla-arsenal.js --confirmar  (crea los registros)

// Carga REALM_EMAIL y REALM_PASSWORD desde el .env junto a este script.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const BASE = "https://utilities.realmvtt.com";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";
const PAGE_SIZE = 100;

const NPC_BASE = "Plantilla";
const NPC_NUEVO = "Plantilla Arsenal";
const CANTIDAD = 990;

const MUNICION = [
  "Munición básica",
  "Munición perforante",
  "Munición incendiaria",
  "Munición inteligente mejorada",
  "Cartucho básico",
  "Flashbang Grenade",
  "Smoke Grenade",
  "Granada básica",
  "Misil básico"
];

// Munición explosiva que no existe en el catálogo. Al dispararla, el daño
// sale del arma (Grenade Launcher 6d6, Rocket Launcher 8d6); al lanzarla a
// mano, sale de useDamage. isExplosive hace que el daño atraviese la cobertura.
const NUEVA_MUNICION = [
  {
    name: "Granada básica",
    useDamage: "6d6",
    cost: 50,
    portrait: "/images/bdffd908-35d0-46ed-99f1-57c8fb49577c_Grenade.webp"
  },
  {
    name: "Misil básico",
    useDamage: "8d6",
    cost: 50,
    portrait: "/images/0b873e34-ea4d-4bde-8f7d-6e68a6bb4e57_Rocket.webp"
  }
];

function crearMunicionExplosiva(plantilla, { name, useDamage, cost, portrait }) {
  return {
    name,
    recordType: "items",
    campaignId: CAMPAIGN_ID,
    identified: true,
    category: plantilla.category,
    shared: plantilla.shared,
    unidentifiedName: plantilla.unidentifiedName,
    portrait,
    data: {
      type: "ammo",
      rounds: 1,
      cost,
      quantity: 1,
      damage: "",
      useDamage,
      isExplosive: true,
      isShell: 0,
      unidentifiedDescription: "",
      hasUseBtn: false,
      priceCategory: "premium"
    },
    fields: structuredClone(plantilla.fields)
  };
}

// Copia de un item del catálogo como entrada de inventario, igual que al
// soltarlo sobre la ficha del NPC (onDropItem en npcs/main-2.html).
function itemDeInventario(item, count) {
  const d = item.data || {};
  const isAmmoWithValues =
    d.type === "ammo" &&
    ((d.effects && d.effects.length > 0) ||
      (d.conditions && d.conditions.length > 0) ||
      d.checkSkill ||
      d.checkDV ||
      d.healing ||
      d.useDamage);
  const isConsumable = d.consumable || false;
  const hasUseBtn = d.hasUseBtn || false;
  const isDrug = d.type === "drug";

  return {
    ...item,
    icon: "IconBox",
    data: {
      ...d,
      fromId: item._id,
      count
    },
    fields: {
      ...item.fields,
      useBtn: {
        hidden: !isConsumable && !hasUseBtn && !isAmmoWithValues && !isDrug
      }
    }
  };
}

async function main() {
  const confirmar = process.argv.includes("--confirmar");

  const email = process.env.REALM_EMAIL;
  const password = process.env.REALM_PASSWORD;

  if (!email || !password) {
    throw new Error("Faltan REALM_EMAIL o REALM_PASSWORD.");
  }

  const authResponse = await fetch(`${BASE}/authentication`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      strategy: "local",
      email,
      password
    })
  });

  const authText = await authResponse.text();

  if (!authResponse.ok) {
    throw new Error(`Error de autenticación: ${authText}`);
  }

  const { accessToken } = JSON.parse(authText);

  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  async function listar(path, extra = {}) {
    const todos = [];
    for (let skip = 0; ; skip += PAGE_SIZE) {
      const params = new URLSearchParams({
        campaignId: CAMPAIGN_ID,
        $limit: String(PAGE_SIZE),
        $skip: String(skip),
        ...extra
      });
      const response = await fetch(`${BASE}${path}?${params}`, { headers });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`No se pudo listar ${path} (${response.status}): ${text}`);
      }
      const page = JSON.parse(text);
      todos.push(...page.data);
      if (page.data.length === 0 || todos.length >= page.total) break;
    }
    return todos;
  }

  async function crear(path, payload) {
    const response = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload)
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Falló crear ${payload.name} (${response.status}): ${text}`);
    }
    return JSON.parse(text);
  }

  const items = await listar("/records", { recordType: "items" });
  const npcs = await listar("/npcs");

  const municionCatalogo = items.filter(r => r.data?.type === "ammo");

  function buscarMunicion(nombre) {
    const encontrados = municionCatalogo.filter(r => r.name.trim() === nombre);
    if (encontrados.length > 1) {
      throw new Error(`Hay ${encontrados.length} municiones "${nombre}". No se cambió nada.`);
    }
    return encontrados[0];
  }

  // Validaciones antes de tocar nada.
  const bases = npcs.filter(n => n.name === NPC_BASE);
  if (bases.length !== 1) {
    throw new Error(`Se esperaba 1 NPC "${NPC_BASE}" y hay ${bases.length}. No se cambió nada.`);
  }
  if (npcs.some(n => n.name === NPC_NUEVO)) {
    throw new Error(`Ya existe el NPC "${NPC_NUEVO}". No se cambió nada.`);
  }

  const plantillaMunicion = buscarMunicion("Flashbang Grenade");
  if (!plantillaMunicion) {
    throw new Error('No existe "Flashbang Grenade" para usar de base. No se cambió nada.');
  }

  const porCrear = NUEVA_MUNICION.filter(m => !buscarMunicion(m.name));
  const faltantes = MUNICION.filter(
    n => !buscarMunicion(n) && !porCrear.some(m => m.name === n)
  );
  if (faltantes.length > 0) {
    throw new Error(`No existen en el catálogo: ${faltantes.join(", ")}. No se cambió nada.`);
  }

  console.log(`Munición nueva en el catálogo (${porCrear.length}):`);
  for (const m of porCrear) {
    console.log(`  ${m.name}  (${m.useDamage}, explosiva)`);
  }
  console.log(`\nNPC "${NPC_NUEVO}" (copia de "${NPC_BASE}", Simple), sin armas.`);
  console.log(`Inventario (${MUNICION.length}), ${CANTIDAD} de cada uno:`);
  for (const n of MUNICION) {
    console.log(`  ${n}`);
  }

  if (!confirmar) {
    console.log("\nNo se cambió nada. Repite con --confirmar para aplicarlo.");
    return;
  }

  for (const m of porCrear) {
    const creado = await crear("/records", crearMunicionExplosiva(plantillaMunicion, m));
    municionCatalogo.push(creado);
    console.log(`\nCreado en el catálogo: ${creado.name} (${creado._id})`);
  }

  const base = bases[0];
  const npc = {
    name: NPC_NUEVO,
    campaignId: CAMPAIGN_ID,
    identified: base.identified ?? true,
    category: base.category,
    unidentifiedName: base.unidentifiedName,
    data: {
      ...structuredClone(base.data),
      inventory: MUNICION.map(n => itemDeInventario(buscarMunicion(n), CANTIDAD))
    },
    fields: structuredClone(base.fields)
  };
  if (base.portrait !== undefined) npc.portrait = base.portrait;

  const creado = await crear("/npcs", npc);
  console.log(`Creado el NPC: ${creado.name} (${creado._id})`);
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
