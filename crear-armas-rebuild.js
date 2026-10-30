// Crea el catálogo de armas con rebuild: cada arma básica con su accesorio
// Power / Smart / Tech Rebuild ya instalado. Very Heavy Pistol, Precision
// Rifle y Sniper Rifle llevan además +1d6 al daño en disparos apuntados.
//
// Uso:
//   node crear-armas-rebuild.js              (solo muestra lo que haría)
//   node crear-armas-rebuild.js --confirmar  (respalda, reemplaza y crea)

import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

// Carga REALM_EMAIL y REALM_PASSWORD desde el .env junto a este script.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const BASE = "https://utilities.realmvtt.com";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";
const RECORD_TYPE = "items";
const PAGE_SIZE = 100;

// Arma base -> rebuilds que se le instalan.
const COMBINACIONES = [
  { arma: "Medium Pistol", rebuilds: ["Power", "Smart"] },
  { arma: "Heavy Pistol", rebuilds: ["Power", "Tech"] },
  { arma: "Very Heavy Pistol", rebuilds: ["Power", "Tech"], apuntado: true },
  { arma: "SMG", rebuilds: ["Power", "Smart"] },
  { arma: "Heavy SMG", rebuilds: ["Power", "Smart"] },
  { arma: "Shotgun", rebuilds: ["Power", "Tech", "Smart"] },
  { arma: "Assault Rifle", rebuilds: ["Power"] },
  { arma: "Precision Rifle", rebuilds: ["Power", "Tech"], apuntado: true },
  { arma: "Sniper Rifle", rebuilds: ["Power", "Tech", "Smart"], apuntado: true },
  { arma: "Grenade Launcher", rebuilds: ["Smart"] },
  { arma: "Rocket Launcher", rebuilds: ["Smart"] }
];

// Precision Rifle no existe en el catálogo: es un Assault Rifle sin autofire,
// con cargador de 6 y costo 1.000.
function crearPrecisionRifle(assaultRifle) {
  const rifle = structuredClone(assaultRifle);
  rifle.name = "Precision Rifle";
  Object.assign(rifle.data, {
    magazine: 6,
    rof: 1,
    cost: 1000,
    concealable: false,
    autofire: false,
    suppressiveFire: false,
    autofireDamage: "",
    afMultiplierMax: "",
    af0to6: 0,
    af7to12: 0,
    af13to25: 0,
    af26to50: 0,
    af51to100: 0
  });
  // Mismos campos visibles que un arma sin autofire (como el Sniper Rifle).
  Object.assign(rifle.fields, {
    afDvProperties: { hidden: true },
    autoFireBtn: { hidden: true },
    suppressiveFireBtn: { hidden: true },
    afDmgBtn: { hidden: true },
    singleDmgBtn: { hidden: false },
    singleDmgBtnWhenAf: { hidden: true }
  });
  return rifle;
}

// Modificador "Disparo Letal": +1d6 al daño en disparos apuntados.
function modificadorApuntado() {
  return {
    _id: randomUUID(),
    name: "Modifier",
    unidentifiedName: "Modifier",
    recordType: "records",
    identified: true,
    data: {
      type: "damageBonus",
      field: "aimed",
      valueType: "string",
      value: "1d6",
      active: true,
      itemOnly: true
    },
    fields: {
      itemOnly: { hidden: false },
      active: { hidden: false },
      field: { hidden: false },
      value: { hidden: false },
      valueType: { hidden: false },
      noDerivedAttributes: { hidden: true },
      smartBonus: { hidden: true },
      stat: { hidden: true },
      statBonus: { hidden: true },
      statMaximum: { hidden: true },
      statMinimum: { hidden: true },
      statPenalty: { hidden: true },
      statSet: { hidden: true }
    }
  };
}

function tieneModificadorApuntado(arma) {
  return (arma.data.modifiers || []).some(
    m =>
      m.data?.type === "damageBonus" &&
      m.data?.field === "aimed" &&
      m.data?.value === "1d6"
  );
}

// Los registros anidados (accesorio y sus modificadores) necesitan IDs nuevos.
function regenerarIds(value) {
  if (Array.isArray(value)) {
    value.forEach(regenerarIds);
  } else if (value && typeof value === "object") {
    if ("_id" in value) value._id = randomUUID();
    for (const child of Object.values(value)) {
      regenerarIds(child);
    }
  }
}

function crearVariante(arma, accesorio, nombre, apuntado) {
  const variante = structuredClone(arma);
  const instalado = structuredClone(accesorio);
  regenerarIds(instalado);
  instalado.name = instalado.name.trim();
  // Smart Rebuild trae un modificador vacío: se descarta.
  instalado.data.modifiers = (instalado.data.modifiers || []).filter(
    m => m.data?.type
  );

  variante.name = nombre;
  variante.data.quality = "average";
  variante.data.attachments = [instalado];
  variante.data.slotsUsed = Number(instalado.data.slots || 0);
  variante.data.maxSlots = Number(variante.data.maxSlots || 3);

  variante.data.modifiers = structuredClone(variante.data.modifiers || []);
  regenerarIds(variante.data.modifiers);
  if (apuntado && !tieneModificadorApuntado(variante)) {
    variante.data.modifiers.push(modificadorApuntado());
  }

  variante.fields = {
    ...variante.fields,
    attachments: { hidden: false },
    attachmentsProperties: { hidden: false }
  };

  return {
    name: variante.name,
    recordType: RECORD_TYPE,
    campaignId: CAMPAIGN_ID,
    identified: variante.identified ?? true,
    category: variante.category,
    portrait: variante.portrait,
    shared: variante.shared,
    unidentifiedName: variante.unidentifiedName,
    data: variante.data,
    fields: variante.fields
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

  // Descargar todos los items de la campaña, página por página.
  const todos = [];

  for (let skip = 0; ; skip += PAGE_SIZE) {
    const params = new URLSearchParams({
      campaignId: CAMPAIGN_ID,
      recordType: RECORD_TYPE,
      $limit: String(PAGE_SIZE),
      $skip: String(skip)
    });

    const response = await fetch(`${BASE}/records?${params}`, { headers });
    const text = await response.text();

    if (!response.ok) {
      throw new Error(`No se pudo listar (${response.status}): ${text}`);
    }

    const page = JSON.parse(text);
    todos.push(...page.data);

    if (page.data.length === 0 || todos.length >= page.total) break;
  }

  // Busca un registro por nombre exacto (sin espacios sobrantes) y tipo.
  // Falla si no existe o está repetido, antes de tocar nada.
  function buscar(nombre, tipo) {
    const encontrados = todos.filter(
      r => r.name.trim() === nombre && r.data?.type === tipo
    );
    if (encontrados.length !== 1) {
      throw new Error(
        `Se esperaba 1 "${nombre}" (${tipo}) y hay ${encontrados.length}. No se cambió nada.`
      );
    }
    return encontrados[0];
  }

  const accesorios = {};
  for (const rebuild of ["Power", "Smart", "Tech"]) {
    accesorios[rebuild] = buscar(`${rebuild} Rebuild`, "weapon attachment");
  }

  const crear = [];
  for (const { arma, rebuilds, apuntado } of COMBINACIONES) {
    const base =
      arma === "Precision Rifle"
        ? crearPrecisionRifle(buscar("Assault Rifle", "ranged weapon"))
        : buscar(arma, "ranged weapon");

    for (const rebuild of rebuilds) {
      const nombre = `${arma} - ${rebuild} Rebuild`;
      crear.push(crearVariante(base, accesorios[rebuild], nombre, apuntado));
    }
  }

  // Variantes que ya existen con el mismo nombre: se reemplazan.
  const nombres = new Set(crear.map(v => v.name));
  const reemplazar = todos.filter(r => nombres.has(r.name.trim()));

  console.log(`Se crean ${crear.length} armas:`);
  for (const v of crear) {
    const apuntado = tieneModificadorApuntado(v) ? "  [+1d6 apuntado]" : "";
    console.log(`  ${v.name}${apuntado}`);
  }
  if (reemplazar.length > 0) {
    console.log(`\nSe reemplazan ${reemplazar.length} que ya existen:`);
    for (const r of reemplazar) {
      console.log(`  ${r._id}  ${r.name}`);
    }
  }

  if (!confirmar) {
    const previewFile = "armas-rebuild-preview.json";
    await fs.writeFile(previewFile, JSON.stringify(crear, null, 2));
    console.log(`\nVista previa guardada en ${previewFile}`);
    console.log("No se cambió nada. Repite con --confirmar para aplicarlo.");
    return;
  }

  // Respaldo de lo que se reemplaza antes de cambiar nada.
  if (reemplazar.length > 0) {
    const backupFile = `backup-armas-rebuild-${Date.now()}.json`;
    await fs.writeFile(backupFile, JSON.stringify(reemplazar, null, 2));
    console.log(`\nRespaldo guardado en ${backupFile}`);
  }

  for (const r of reemplazar) {
    const response = await fetch(`${BASE}/records/${r._id}`, {
      method: "DELETE",
      headers
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(
        `Falló borrar ${r.name} (${response.status}): ${text}. Se detuvo antes de crear.`
      );
    }
    console.log(`Borrado: ${r.name}`);
  }

  let creados = 0;

  for (const v of crear) {
    const response = await fetch(`${BASE}/records`, {
      method: "POST",
      headers,
      body: JSON.stringify(v)
    });

    if (response.ok) {
      creados++;
      console.log(`Creado: ${v.name}`);
    } else {
      const text = await response.text();
      console.error(`Falló crear ${v.name} (${response.status}): ${text}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nCreados ${creados} de ${crear.length}.`);
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
