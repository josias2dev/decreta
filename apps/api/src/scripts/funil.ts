/**
 * O funil por período: visitas, cliques, cadastros e os marcos de uso. Lê só
 * totais por nome de evento (a função `contagem_de_eventos`), nenhuma linha.
 *
 *   bun run funil                              os últimos 30 dias
 *   bun run funil --dias 7                     os últimos 7 dias, contando hoje
 *   bun run funil --de 2026-10-01 --ate 2026-10-31
 */
import { parseArgs } from "node:util";
import { hojeEm, periodoDoFunil, textoDoFunil } from "@decreta/core";
import { createDatabase } from "@decreta/db";
import { readEnv } from "../env.ts";
import { contarEventos } from "../eventos.ts";

const { values: a } = parseArgs({ options: { dias: { type: "string" }, de: { type: "string" }, ate: { type: "string" } } });

let periodo: ReturnType<typeof periodoDoFunil>;
try {
  periodo = periodoDoFunil(a, hojeEm());
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
const { de, ate } = periodo;
const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 1 });
try {
  console.log(textoDoFunil(de, ate, await contarEventos(db, de, ate)));
} finally {
  await close();
}
