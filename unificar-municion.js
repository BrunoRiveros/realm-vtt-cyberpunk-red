// Unifica la munición del catálogo: deja una sola versión de cada variante
// (sin importar el calibre), le pone nombre en español y borra las copias.
//
// Uso:
//   node unificar-municion.js              (solo muestra lo que haría)
//   node unificar-municion.js --confirmar  (respalda, renombra y borra)

import fs from "node:fs/promises";

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

// keep: el objeto que se conserva (y se renombra a "nombre").
// borrar: las copias de otros calibres con el mismo efecto.
const GRUPOS = [
  {
    nombre: "Munición básica",
    keep: "Basic Rifle",
    borrar: ["Basic Arrow", "Basic H Pistol", "Basic M Pistol", "Basic Slug", "Basic VH Pistol"]
  },
  {
    nombre: "Munición perforante",
    keep: "Armor-Piercing Rifle",
    borrar: [
      "Armor-Piercing Arrow", "Armor-Piercing Grenade", "Armor-Piercing H Pistol",
      "Armor-Piercing M Pistol", "Armor-Piercing Rocket", "Armor-Piercing Slug",
      "Armor-Piercing VH Pistol"
    ]
  },
  {
    nombre: "Munición expansiva",
    keep: "Expansive Rifle",
    borrar: [
      "Expansive Arrow", "Expansive H Pistol", "Expansive M Pistol",
      "Expansive Slug", "Expansive VH Pistol"
    ]
  },
  {
    // Incendiary VH Pistol no tiene el efecto de incendio: no se usa de base.
    nombre: "Munición incendiaria",
    keep: "Incendiary Rifle",
    borrar: [
      "Incendiary Arrow", "Incendiary Grenade", "Incendiary H Pistol",
      "Incendiary M Pistol", "Incendiary VH Pistol"
    ]
  },
  {
    nombre: "Munición de goma",
    keep: "Rubber Rifle",
    borrar: ["Rubber Arrow", "Rubber H Pistol", "Rubber M Pistol", "Rubber Slug", "Rubber VH Pistol"]
  },
  {
    // Los nombres originales tienen doble espacio en algunos casos.
    nombre: "Munición inteligente mejorada",
    keep: "Improved Smart Ammunition Rifle",
    borrar: [
      "Improved Smart Ammunition  Arrow", "Improved Smart Ammunition  H Pistol",
      "Improved Smart Ammunition  Smart Rocket", "Improved Smart Ammunition VH Pistol"
    ]
  },
  { nombre: "Munición venenosa", keep: "Poison Arrow", borrar: ["Poison Grenade"] },
  { nombre: "Munición de biotoxina", keep: "Biotoxin Arrow", borrar: ["Biotoxin Grenade"] },
  { nombre: "Munición de sueño", keep: "Sleep Arrow", borrar: ["Sleep Grenade"] },
  { nombre: "Cartucho básico", keep: "Basic Shell", borrar: [] },
  { nombre: "Cartucho incendiario", keep: "Incendiary Shell", borrar: [] },
  {
    nombre: "Cartucho incendiario de lanzallamas",
    keep: "Incendiary Flamethrower Shell",
    borrar: []
  }
];

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

  const municion = todos.filter(
    r =>
      r.campaignId === CAMPAIGN_ID &&
      r.recordType === RECORD_TYPE &&
      r.data?.type === "ammo"
  );

  // Busca un objeto por nombre exacto. Falla si no existe o está repetido,
  // antes de tocar nada.
  function buscar(nombre) {
    const encontrados = municion.filter(r => r.name === nombre);
    if (encontrados.length !== 1) {
      throw new Error(
        `Se esperaba 1 munición llamada "${nombre}" y hay ${encontrados.length}. No se cambió nada.`
      );
    }
    return encontrados[0];
  }

  const renombrar = [];
  const borrar = [];

  for (const grupo of GRUPOS) {
    const keep = buscar(grupo.keep);
    if (keep.name !== grupo.nombre) {
      renombrar.push({ record: keep, nombre: grupo.nombre });
    }
    for (const nombre of grupo.borrar) {
      borrar.push(buscar(nombre));
    }
  }

  console.log(`Munición en el catálogo: ${municion.length}`);
  console.log(`\nSe renombran ${renombrar.length}:`);
  for (const { record, nombre } of renombrar) {
    console.log(`  ${record._id}  ${record.name}  ->  ${nombre}`);
  }
  console.log(`\nSe borran ${borrar.length}:`);
  for (const r of borrar) {
    console.log(`  ${r._id}  ${r.name}`);
  }
  console.log(`\nQuedarían ${municion.length - borrar.length} objetos de munición.`);

  if (!confirmar) {
    console.log("\nNo se cambió nada. Repite con --confirmar para aplicarlo.");
    return;
  }

  // Respaldo de todo lo que se toca antes de cambiar nada.
  const backupFile = `backup-municion-${Date.now()}.json`;
  await fs.writeFile(
    backupFile,
    JSON.stringify(
      { renombrados: renombrar.map(x => x.record), borrados: borrar },
      null,
      2
    )
  );
  console.log(`\nRespaldo guardado en ${backupFile}`);

  let renombrados = 0;

  for (const { record, nombre } of renombrar) {
    const response = await fetch(`${BASE}/records/${record._id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ name: nombre })
    });

    if (response.ok) {
      renombrados++;
      console.log(`Renombrado: ${record.name} -> ${nombre}`);
    } else {
      const text = await response.text();
      console.error(`Falló renombrar ${record.name} (${response.status}): ${text}`);
      process.exitCode = 1;
    }
  }

  let borrados = 0;

  for (const r of borrar) {
    const response = await fetch(`${BASE}/records/${r._id}`, {
      method: "DELETE",
      headers
    });

    if (response.ok) {
      borrados++;
      console.log(`Borrado: ${r.name}`);
    } else {
      const text = await response.text();
      console.error(`Falló borrar ${r.name} (${response.status}): ${text}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nRenombrados ${renombrados} de ${renombrar.length}.`);
  console.log(`Borrados ${borrados} de ${borrar.length}.`);
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
