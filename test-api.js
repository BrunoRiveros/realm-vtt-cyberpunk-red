
import readline from "node:readline/promises";
import fs from "node:fs/promises";

// Carga REALM_EMAIL, REALM_PASSWORD y REALM_CAMPAIGN_ID desde el .env junto a
// este script, sin importar desde qué carpeta se ejecute.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // Sin .env: se piden los datos por consola.
}

const BASE = "https://utilities.realmvtt.com";
const PAGE_SIZE = 50;

async function fetchAllRecords(headers, campaignId) {
  const allRecords = [];
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const url = new URL(`${BASE}/records`);
    url.searchParams.set("recordType", "items");
    url.searchParams.set("campaignId", campaignId);
    url.searchParams.set("$limit", String(PAGE_SIZE));
    url.searchParams.set("$skip", String(skip));

    const response = await fetch(url, { headers });
    const result = await response.json();

    if (!response.ok) {
      throw new Error("No se pudieron consultar los objetos: " +
        JSON.stringify(result));
    }

    // Sin paginación, la API devuelve el arreglo completo de una vez.
    if (Array.isArray(result)) {
      allRecords.push(...result);
      break;
    }

    if (!Array.isArray(result.data)) {
      throw new Error("Respuesta inesperada: " +
        JSON.stringify(result).slice(0, 1000));
    }

    allRecords.push(...result.data);
    total = result.total ?? allRecords.length;

    console.log(`Descargados ${allRecords.length} de ${total}`);

    if (result.data.length === 0) break;
    skip += result.data.length;
  }

  return allRecords;
}

// Diagnóstico: muestra qué recordType tienen los registros de la campaña,
// por si los objetos no están guardados como "items".
async function printRecordTypes(headers, campaignId) {
  const url = new URL(`${BASE}/records`);
  url.searchParams.set("campaignId", campaignId);
  url.searchParams.set("$limit", String(PAGE_SIZE));

  const response = await fetch(url, { headers });
  const result = await response.json();
  const records = Array.isArray(result) ? result : result.data ?? [];

  if (records.length === 0) {
    console.log("\nLa campaña no tiene ningún registro (de ningún tipo).");
    return;
  }

  const counts = {};
  for (const record of records) {
    counts[record.recordType] = (counts[record.recordType] ?? 0) + 1;
  }

  console.log(`\nNo hay "items", pero la campaña tiene ${result.total ?? records.length} registros de estos tipos (muestra de ${records.length}):`);
  console.log(counts);
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  try {
    const email = process.env.REALM_EMAIL ||
      await rl.question("Email de Realm VTT: ");
    const password = process.env.REALM_PASSWORD ||
      await rl.question("Contrasena de Realm VTT: ");

    const authResponse = await fetch(`${BASE}/authentication`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: "local",
        email,
        password
      })
    });

    const auth = await authResponse.json();

    if (!authResponse.ok || !auth.accessToken) {
      throw new Error(
        `Falló el inicio de sesión (${authResponse.status}): ` +
        JSON.stringify(auth)
      );
    }

    const headers = {
      Authorization: `Bearer ${auth.accessToken}`
    };

    let campaignId = process.env.REALM_CAMPAIGN_ID;

    if (!campaignId) {
      const campaignsResponse = await fetch(`${BASE}/campaigns`, {
        headers
      });
      const campaigns = await campaignsResponse.json();

      if (!campaignsResponse.ok) {
        throw new Error("No se pudieron consultar las campañas: " +
          JSON.stringify(campaigns));
      }

      await fs.writeFile(
        "campaigns-test.json",
        JSON.stringify(campaigns, null, 2),
        "utf8"
      );

      console.log("\nCampañas guardadas en campaigns-test.json");
      console.log(JSON.stringify(campaigns, null, 2));

      campaignId = await rl.question(
        "\nCopia y pega el ID de la campaña que contiene tus armas: "
      );
    }

    const allRecords = await fetchAllRecords(headers, campaignId.trim());

    if (allRecords.length === 0) {
      await printRecordTypes(headers, campaignId.trim());
    }

    await fs.writeFile(
      "items-test.json",
      JSON.stringify({
        total: allRecords.length,
        data: allRecords
      }, null, 2),
      "utf8"
    );

    console.log(`\n${allRecords.length} registros guardados en items-test.json`);
  } finally {
    rl.close();
  }
}

main().catch(error => {
  console.error("\nERROR:", error.message);
  process.exitCode = 1;
});
