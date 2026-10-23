
// Carga REALM_EMAIL y REALM_PASSWORD desde .env si existe.
try {
  process.loadEnvFile(".env");
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const BASE = "https://utilities.realmvtt.com";
const RECORD_ID = "6ab3ea3d1c689ac5a671f0fd";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";

async function main() {
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

  // Verificar el registro antes de borrarlo.
  const checkResponse = await fetch(
    `${BASE}/records/${RECORD_ID}`,
    { headers }
  );

  const checkText = await checkResponse.text();

  if (!checkResponse.ok) {
    throw new Error(
      `No se pudo verificar el registro (${checkResponse.status}): ${checkText}`
    );
  }

  const record = JSON.parse(checkText);

  if (
    record._id !== RECORD_ID ||
    record.name !== "Techhair" ||
    record.recordType !== "items" ||
    record.campaignId !== CAMPAIGN_ID
  ) {
    throw new Error(
      "Los datos no coinciden con Techhair. No se borró nada."
    );
  }

  console.log("Registro verificado:");
  console.log(record.name, record._id, record.campaignId);

  // Borrado del registro exacto.
  const deleteResponse = await fetch(
    `${BASE}/records/${RECORD_ID}`,
    {
      method: "DELETE",
      headers
    }
  );

  const deleteText = await deleteResponse.text();

  if (!deleteResponse.ok) {
    throw new Error(
      `El borrado falló (${deleteResponse.status}): ${deleteText}`
    );
  }

  console.log("La API aceptó el borrado.");
  console.log("Respuesta:", deleteText || "(sin contenido)");
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
