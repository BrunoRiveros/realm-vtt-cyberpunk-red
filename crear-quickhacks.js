// Reemplaza los quickhacks del catálogo de habilidades (categoría
// "Quickhacks") por la tabla de quickhacks de la campaña. Todos se lanzan con
// Interface contra su DV. Los que tienen un efecto o daño equivalente en el
// sistema lo llevan; el resto queda en la descripción, a nivel narrativo.
// "Contrahackeo" no se toca.
//
// Uso:
//   node crear-quickhacks.js              (solo muestra lo que haría)
//   node crear-quickhacks.js --confirmar  (respalda, borra y crea)

import fs from "node:fs/promises";

// Carga REALM_EMAIL y REALM_PASSWORD desde el .env junto a este script.
try {
  process.loadEnvFile(new URL(".env", import.meta.url));
} catch {
  // Sin .env: se usan las variables de entorno del sistema.
}

const BASE = "https://utilities.realmvtt.com";
const CAMPAIGN_ID = "6ab3253c6bfcb4cb1c796f08";
const CATEGORIA = "Quickhacks ";
const CONSERVAR = ["Contrahackeo"];

// efecto: nombre de un efecto del sistema que se puede aplicar con su botón.
// danio: daño que ignora armadura.
const QUICKHACKS = [
  {
    nombre: "Señuelo",
    dv: 6,
    costo: 1,
    tag: "Cobertura",
    texto:
      "El objetivo se mueve o mira hacia una posición elegida. El objetivo no irá a lugares dañinos. No funciona en combate. No genera alerta."
  },
  {
    nombre: "Choque Sónico",
    dv: 6,
    costo: 1,
    tag: "Cobertura",
    texto:
      "El objetivo queda sordo y sus comunicaciones se cortan por 3 rondas. No puede pedir ayuda. No genera alerta."
  },
  {
    nombre: "Pedir Refuerzos",
    dv: 6,
    costo: 1,
    tag: "Cobertura",
    texto:
      "Simula una llamada de auxilio. Los enemigos cercanos podrían moverse hacia la posición del objetivo o actuar de una manera acorde a su entrenamiento. No funciona en combate. No genera alerta."
  },
  {
    nombre: "Reiniciar Óptica",
    dv: 6,
    costo: 1,
    tag: "Control",
    texto:
      "El objetivo recibe un -2 a todas las tiradas que dependan de la vista por 3 rondas."
  },
  {
    nombre: "Sobrecalentamiento",
    dv: 8,
    costo: 2,
    tag: "Combate",
    texto:
      "El objetivo sufre \"Fuego Fuerte\" hasta que use una Acción en apagarse. No se acumula.",
    efecto: "On Fire (Strong)"
  },
  {
    nombre: "Cortocircuito",
    dv: 8,
    costo: 2,
    tag: "Combate",
    texto:
      "Inflige 2d6 de daño directo a humanos. Contra Mechs, Robots o Drones inflige 3d6. Ignora armadura.",
    danio: "2d6"
  },
  {
    nombre: "Fallo de Ciberware",
    dv: 8,
    costo: 2,
    tag: "Control",
    texto: "Desactiva una pieza de ciberware no fundamental por 3 rondas."
  },
  {
    nombre: "Fallo de Arma",
    dv: 8,
    costo: 2,
    tag: "Control",
    texto:
      "El arma que empuña el objetivo se encasquilla. No puede disparar con ella hasta que gaste una Acción en desencasquillarla. Además, el arma pierde los efectos de su rebuild (Power, Tech o Smart) durante 3 rondas.",
    efecto: "Weapon Malfunction"
  },
  {
    nombre: "Entorpecer Movimiento",
    dv: 10,
    costo: 3,
    tag: "Control",
    texto:
      "El MOVE del objetivo se vuelve 1 y recibe un -2 a Esquivar por 3 rondas.",
    efecto: "Entorpecer Movimiento"
  },
  {
    nombre: "Colapso de Sinapsis",
    dv: 10,
    costo: 3,
    tag: "Combate",
    texto: "Inflige 6d6 de daño directo. Ignora armadura.",
    danio: "6d6"
  },
  {
    nombre: "Ciberpsicosis",
    dv: 12,
    costo: 4,
    tag: "Ultimate",
    texto:
      "El objetivo entra en frenesí y ataca a la persona más cercana (sea aliado o enemigo) durante 3 rondas. Si está solo, se queda aturdido gritando. Ocupa 2 ranuras."
  },
  {
    nombre: "System Collapse",
    dv: 12,
    costo: 4,
    tag: "Ultimate",
    texto:
      "El objetivo cae Inconsciente de inmediato. Es silencioso. Se despierta si recibe cualquier daño o si un aliado usa su Acción en sacudirlo. Ocupa 2 ranuras.",
    efecto: "Unconscious"
  },
  {
    nombre: "Suicidio",
    dv: 12,
    costo: 4,
    tag: "Ultimate",
    texto:
      "El objetivo usa su propia arma para realizar un disparo apuntado a su cabeza. Ocupa 2 ranuras."
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

  async function listar(path, extra = {}) {
    const params = new URLSearchParams({
      campaignId: CAMPAIGN_ID,
      $limit: "500",
      ...extra
    });
    const response = await fetch(`${BASE}${path}?${params}`, { headers });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`No se pudo listar ${path} (${response.status}): ${text}`);
    }
    const page = JSON.parse(text);
    return Array.isArray(page) ? page : page.data;
  }

  const habilidades = await listar("/records", { recordType: "abilities" });
  const efectos = await listar("/effects");

  const actuales = habilidades.filter(
    h => h.category === CATEGORIA && !CONSERVAR.includes(h.name)
  );

  // Referencias a efectos, igual que las guarda la ficha: JSON con _id y name.
  function refEfecto(nombre) {
    const encontrados = efectos.filter(e => e.name === nombre);
    if (encontrados.length !== 1) {
      throw new Error(
        `Se esperaba 1 efecto "${nombre}" y hay ${encontrados.length}. No se cambió nada.`
      );
    }
    return JSON.stringify({ _id: encontrados[0]._id, name: encontrados[0].name });
  }

  const portrait = actuales.find(h => h.portrait)?.portrait;
  const base = actuales[0] || habilidades.find(h => h.name === "Contrahackeo");

  const nuevos = QUICKHACKS.map(q => ({
    name: q.nombre,
    recordType: "abilities",
    campaignId: CAMPAIGN_ID,
    identified: true,
    category: CATEGORIA,
    portrait,
    shared: base?.shared,
    unidentifiedName: base?.unidentifiedName,
    data: {
      isAttack: false,
      rollWithInterface: true,
      checkDV: q.dv,
      effects: q.efecto ? [refEfecto(q.efecto)] : [],
      conditions: [],
      ...(q.danio ? { damage: q.danio, ignoreArmor: "Ignore Full Armor" } : {}),
      description:
        `<p><strong>DV:</strong> ${q.dv} · <strong>Costo RED:</strong> ${q.costo} · <strong>Tag:</strong> ${q.tag}</p>` +
        `<p>${q.texto}</p>`
    }
  }));

  console.log(`Se borran ${actuales.length} quickhacks actuales:`);
  for (const h of actuales) console.log(`  ${h._id}  ${h.name}`);
  console.log(`\nSe crean ${nuevos.length}:`);
  for (const q of QUICKHACKS) {
    const extra = [q.danio && `daño ${q.danio} sin armadura`, q.efecto && `efecto ${q.efecto}`]
      .filter(Boolean)
      .join(", ");
    console.log(`  DV ${String(q.dv).padStart(2)}  ${q.nombre}${extra ? `  [${extra}]` : "  (narrativo)"}`);
  }

  if (!confirmar) {
    console.log("\nNo se cambió nada. Repite con --confirmar para aplicarlo.");
    return;
  }

  const backupFile = `backup-quickhacks-${Date.now()}.json`;
  await fs.writeFile(backupFile, JSON.stringify(actuales, null, 2));
  console.log(`\nRespaldo guardado en ${backupFile}`);

  for (const h of actuales) {
    const response = await fetch(`${BASE}/records/${h._id}`, {
      method: "DELETE",
      headers
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falló borrar ${h.name} (${response.status}): ${text}. Se detuvo antes de crear.`);
    }
    console.log(`Borrado: ${h.name}`);
  }

  let creados = 0;
  for (const q of nuevos) {
    const response = await fetch(`${BASE}/records`, {
      method: "POST",
      headers,
      body: JSON.stringify(q)
    });
    if (response.ok) {
      creados++;
      console.log(`Creado: ${q.name}`);
    } else {
      const text = await response.text();
      console.error(`Falló crear ${q.name} (${response.status}): ${text}`);
      process.exitCode = 1;
    }
  }

  console.log(`\nCreados ${creados} de ${nuevos.length}.`);
}

main().catch(error => {
  console.error("ERROR:", error.message);
  process.exitCode = 1;
});
