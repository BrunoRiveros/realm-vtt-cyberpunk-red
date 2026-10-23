
import fs from "node:fs";
import path from "node:path";

const backupFile = "backup-6ab31f156bfcb4cb1c796eff.json";
const outputDir = "cyberpunk-red-local";

if (!fs.existsSync(backupFile)) {
  throw new Error(`No se encuentra ${backupFile}`);
}

const source = JSON.parse(fs.readFileSync(backupFile, "utf8"));

if (!source.records || !source.settings) {
  throw new Error("El respaldo no contiene records y settings.");
}

if (fs.existsSync(outputDir)) {
  throw new Error(
    `Ya existe ${outputDir}. Renómbrala o elimínala antes de continuar.`
  );
}

fs.mkdirSync(outputDir, { recursive: true });

const usedNames = new Set();

function safeName(value) {
  return String(value || "unnamed")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "unnamed";
}

function writeSourceFile(relativePath, content) {
  const fullPath = path.join(outputDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
}

function uniqueFile(folder, base, extension) {
  let name = `${base}.${extension}`;
  let index = 2;

  while (usedNames.has(name)) {
    name = `${base}-${index++}.${extension}`;
  }

  usedNames.add(name);
  return path.posix.join(folder, name);
}

function convertRecords(records) {
  const list = Array.isArray(records)
    ? records
    : Object.values(records);

  return list.map((record, index) => {
    const converted = structuredClone(record);
    const recordName = safeName(record.name || `record-${index + 1}`);

    if (Array.isArray(converted.tabs)) {
      converted.tabs = converted.tabs.map((tab, tabIndex) => {
        const convertedTab = { ...tab };

        if (typeof convertedTab.layout === "string") {
          const file = uniqueFile(
            `records/${recordName}`,
            safeName(tab.name || `tab-${tabIndex + 1}`),
            "html"
          );

          writeSourceFile(file, convertedTab.layout);
          delete convertedTab.layout;
          convertedTab.file = file;
        }

        return convertedTab;
      });
    }

    return converted;
  });
}

const config = {
  name: source.name,
  description: source.description || "",
  version: source.version || 1,
  compatibility: source.compatibility || [],
  records: convertRecords(source.records),
  settings: source.settings
};

writeSourceFile(
  "ruleset.config.json",
  JSON.stringify(config, null, 2)
);

writeSourceFile(
  "BACKUP-INFO.txt",
  [
    `Ruleset original: ${source.name}`,
    `ID original: ${source._id}`,
    `Secciones convertidas: ${config.records.length}`,
    "",
    "Proyecto generado desde un respaldo de la API de Realm VTT.",
    "Revisa los scripts y la configuracion antes de compilar.",
    "Este proceso no modifica el ruleset alojado en Realm VTT."
  ].join("\n")
);

console.log("Conversión inicial completada.");
console.log("Proyecto:", outputDir);
console.log("Secciones:", config.records.length);
console.log(
  "Pestañas con HTML extraído:",
  config.records.reduce(
    (total, record) =>
      total + (record.tabs || []).filter(tab => tab.file).length,
    0
  )
);
console.log(
  "Ajustes principales:",
  Object.keys(config.settings)
);
console.log(
  "\nImportante: esta conversión extrae los layouts de las pestañas."
);
console.log(
  "Aún hay que verificar los scripts y referencias de settings antes de compilar."
);
