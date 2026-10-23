
import { writeFile } from "node:fs/promises";
import { createAuthenticatedClient } from "./src/auth.js";
import { prompt } from "./src/prompts.js";

const client = await createAuthenticatedClient({});

const response = await client.listOwnedRulesets();
const rulesets = Array.isArray(response)
  ? response
  : response.data || [];

if (rulesets.length === 0) {
  throw new Error("No se encontraron rulesets.");
}

console.log("\nRulesets disponibles:");
rulesets.forEach((r, i) => {
  console.log(`${i + 1}. ${r.name} [${r._id}]`);
});

const answer = await prompt(
  "\nIntroduce el número del ruleset que quieres exportar: "
);

const index = Number(answer) - 1;

if (!Number.isInteger(index) || index < 0 || index >= rulesets.length) {
  throw new Error("Selección no válida.");
}

const selected = rulesets[index];
const result = await client.getRuleset(selected._id);

if (!result || !result.records || !result.settings) {
  throw new Error(
    "La respuesta no contiene records y settings. No se guardó la copia."
  );
}

const output = `backup-${selected._id}.json`;

await writeFile(
  output,
  JSON.stringify(result, null, 2),
  "utf8"
);

console.log(`\nCopia guardada: ${output}`);
console.log(`Ubicación: ${process.cwd()}\\${output}`);
console.log("Número de secciones en records:",
  Object.keys(result.records).length);
console.log("Claves de settings:",
  Object.keys(result.settings));
