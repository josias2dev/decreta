/**
 * Carga do acervo de jurisprudência à mão (a rotina do Inngest roda toda
 * segunda): os temas repetitivos do STJ, do Portal de Dados Abertos. Serve
 * para o primeiro deploy e para quando a carga semanal falhou.
 *
 *   bun --env-file=.env apps/api/src/scripts/acervo.ts
 */
import { createDatabase } from "@decreta/db";
import { readEnv } from "../env.ts";
import { sincronizarTemasDoStj } from "../servicos/acervo.ts";

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 2 });
try {
  const { temas } = await sincronizarTemasDoStj({ db });
  console.log(`✓ ${temas} temas do STJ no acervo`);
} finally {
  await close();
}
