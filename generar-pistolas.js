
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";

const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";
const WEAPON_NAME = "Medium Pistol";

const ATTACHMENTS = [
  "Power Rebuild",
  "Smart Rebuild",
  "Tech Rebuild"
];

async function main() {
  const raw = JSON.parse(
    await fs.readFile("./items-test.json", "utf8")
  );

  const records = Array.isArray(raw) ? raw : raw.data;

  if (!Array.isArray(records)) {
    throw new Error("No encuentro la lista de registros en items-test.json");
  }

  const weapon = records.find(
    item => item.name?.trim() === WEAPON_NAME &&
            item.data?.type === "ranged weapon"
  );

  if (!weapon) {
    throw new Error(`No se encontró el arma: ${WEAPON_NAME}`);
  }

  const variants = [];

  for (const attachmentName of ATTACHMENTS) {
    const attachment = records.find(
      item => item.name?.trim() === attachmentName &&
              item.data?.type === "weapon attachment"
    );

    if (!attachment) {
      throw new Error(`No se encontró el attachment: ${attachmentName}`);
    }

    // Clonar el arma y el attachment para no alterar los originales.
    const variant = structuredClone(weapon);
    const embeddedAttachment = structuredClone(attachment);

    variant.name = `${WEAPON_NAME} - ${attachmentName}`;
    variant.campaignId = CAMPAIGN_ID;

    // El nuevo registro debe tener su propia identidad.
    delete variant._id;
    delete variant.createdAt;
    delete variant.updatedAt;
    delete variant.moduleId;
    delete variant.sourceId;
    delete variant.locked;

    // Generar IDs nuevos para el attachment anidado y sus modificadores.
    function regenerateNestedIds(value) {
      if (Array.isArray(value)) {
        value.forEach(regenerateNestedIds);
      } else if (value && typeof value === "object") {
        if ("_id" in value) value._id = randomUUID();

        for (const child of Object.values(value)) {
          regenerateNestedIds(child);
        }
      }
    }

    regenerateNestedIds(embeddedAttachment);

    // El arma contiene un único attachment, como en la estructura del ruleset.
    variant.data.attachments = [embeddedAttachment];
    variant.data.slotsUsed = Number(embeddedAttachment.data.slots || 0);
    variant.data.maxSlots = Number(variant.data.maxSlots || 3);

    if (variant.fields?.attachments) {
      variant.fields.attachments.hidden = false;
    }

    if (variant.fields?.attachmentsProperties) {
      variant.fields.attachmentsProperties.hidden = false;
    }

    variants.push(variant);
  }

  await fs.writeFile(
    "./pistolas-preview.json",
    JSON.stringify(variants, null, 2),
    "utf8"
  );

  console.log("Variantes generadas:");
  variants.forEach(item => console.log(`- ${item.name}`));
  console.log("\nArchivo creado: pistolas-preview.json");
  console.log("No se ha subido ni modificado ningún registro.");
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
