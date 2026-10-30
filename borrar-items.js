
// Borra todos los items de la campaña cuyo data.<campo> sea igual a <valor>.
//
// Uso:
//   node borrar-items.js <campo> <valor>              (solo muestra la lista)
//   node borrar-items.js <campo> <valor> --confirmar  (respalda y borra)
//   --excluir "Nombre 1,Nombre 2"                     (conserva esos items)
//
// Ejemplo:
//   node borrar-items.js cyberwareInstallSlot fashionware
//   node borrar-items.js type gear --excluir "Techtool,Medtech Bag"

import fs from "node:fs/promises";

// Carga REALM_EMAIL y REALM_PASSWORD desde .env si existe.
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const BASE = "https://utilities.realmvtt.com";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";
const RECORD_TYPE = "items";
const PAGE_SIZE = 100;

// Lee un campo con puntos dentro de data, ej. "cyberwareInstallSlot" o "a.b".
function getPath(obj, path) {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

async function main() {
  const args = process.argv.slice(2);
  const confirmar = args.includes("--confirmar");

  // --excluir recibe una lista de nombres exactos separados por comas.
  const excluirIndex = args.indexOf("--excluir");
  const excluir =
    excluirIndex === -1
      ? []
      : (args[excluirIndex + 1] || "").split(",").map(n => n.trim()).filter(Boolean);

  const [campo, valor] = args.filter(
    (a, i) =>
      a !== "--confirmar" &&
      i !== excluirIndex &&
      (excluirIndex === -1 || i !== excluirIndex + 1)
  );

  if (!campo || valor === undefined) {
    throw new Error(
      'Uso: node borrar-items.js <campo> <valor> [--excluir "Nombre 1,Nombre 2"] [--confirmar]'
    );
  }

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

  // Filtrar localmente por data.<campo>, comparando como texto.
  const coincidencias = todos.filter(
    r =>
      r.campaignId === CAMPAIGN_ID &&
      r.recordType === RECORD_TYPE &&
      String(getPath(r.data, campo)) === valor &&
      !excluir.includes(r.name)
  );

  // Avisar si un nombre a excluir no existe (probablemente mal escrito).
  for (const nombre of excluir) {
    if (!todos.some(r => r.name === nombre)) {
      throw new Error(`No existe ningún item llamado "${nombre}". No se borró nada.`);
    }
  }

  console.log(`Items revisados: ${todos.length}`);
  if (excluir.length > 0) {
    console.log(`Excluidos: ${excluir.length}`);
  }
  console.log(`Coinciden con data.${campo} = "${valor}": ${coincidencias.length}`);

  for (const r of coincidencias) {
    console.log(`  ${r._id}  ${r.name}`);
  }

  if (coincidencias.length === 0) return;

  if (!confirmar) {
    console.log("\nNo se borró nada. Repite con --confirmar para borrarlos.");
    return;
  }

  // Respaldo antes de borrar.
  const backupFile = `backup-borrados-${Date.now()}.json`;
  await fs.writeFile(backupFile, JSON.stringify(coincidencias, null, 2));
  console.log(`\nRespaldo guardado en ${backupFile}`);

  let borrados = 0;

  for (const r of coincidencias) {
    const response = await fetch(`${BASE}/records/${r._id}`, {
      method: "DELETE",
      headers
    });

    if (response.ok) {
      borrados++;
      console.log(`Borrado: ${r.name}`);
    } else {
      const text = await response.text();
      console.error(`Falló ${r.name} (${response.status}): ${text}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nBorrados ${borrados} de ${coincidencias.length}.`);
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
