
import fs from "node:fs/promises";

const BASE = "https://utilities.realmvtt.com";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";

async function main() {
  const email = process.env.REALM_EMAIL;
  const password = process.env.REALM_PASSWORD;

  if (!email || !password) {
    throw new Error(
      "Faltan REALM_EMAIL o REALM_PASSWORD en las variables de entorno."
    );
  }

  const raw = JSON.parse(
    await fs.readFile("./pistolas-preview.json", "utf8")
  );

  if (!Array.isArray(raw) || raw.length !== 3) {
    throw new Error(
      "Se esperaba un archivo con exactamente 3 variantes."
    );
  }

  // Subimos solamente la primera: Power Rebuild.
  const variant = raw[0];

  if (!variant.name || !variant.data?.attachments?.length) {
    throw new Error("La primera variante no tiene el formato esperado.");
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
    throw new Error(
      `Error de autenticación (${authResponse.status}): ${authText}`
    );
  }

  const auth = JSON.parse(authText);

  if (!auth.accessToken) {
    throw new Error("La autenticación no devolvió accessToken.");
  }

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.accessToken}`
  };

  // Evita crear otra copia si ya existe una pistola con ese nombre.
  const params = new URLSearchParams({
    recordType: "items",
    campaignId: CAMPAIGN_ID,
    name: variant.name
  });

  const checkResponse = await fetch(
    `${BASE}/records?${params}`,
    { headers }
  );

  const checkText = await checkResponse.text();

  if (!checkResponse.ok) {
    throw new Error(
      `Error al comprobar duplicados (${checkResponse.status}): ${checkText}`
    );
  }

  const existing = JSON.parse(checkText);

  if (existing.data?.length) {
    throw new Error(
      `Ya existe "${variant.name}". No se ha creado otra copia.`
    );
  }

  // Solo enviamos los campos del registro, no el _id anterior.
  const payload = {
    name: variant.name,
    recordType: "items",
    campaignId: CAMPAIGN_ID,
    identified: variant.identified ?? true,
    data: variant.data,
    fields: variant.fields
  };

  if (variant.portrait !== undefined) {
    payload.portrait = variant.portrait;
  }

  if (variant.unidentifiedName !== undefined) {
    payload.unidentifiedName = variant.unidentifiedName;
  }

  if (variant.shared !== undefined) {
    payload.shared = variant.shared;
  }

  if (variant.category !== undefined) {
    payload.category = variant.category;
  }

  console.log(`Subiendo: ${payload.name}`);

  const response = await fetch(`${BASE}/records`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload)
  });

  const resultText = await response.text();

  if (!response.ok) {
    throw new Error(
      `Error al crear el registro (${response.status}): ${resultText}`
    );
  }

  const result = JSON.parse(resultText);

  console.log("\nRegistro creado según la respuesta de la API:");
  console.log("Nombre:", result.name ?? payload.name);
  console.log("ID:", result._id ?? "(la API no devolvió _id)");
  console.log("\nComprueba ahora el registro dentro de Realm VTT.");
}

main().catch(error => {
  console.error("\nERROR:", error.message);
  process.exitCode = 1;
});
