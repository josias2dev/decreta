/**
 * Carga do acervo de jurisprudência à mão (as rotinas do Inngest rodam toda
 * segunda e nos dias 2 e 17): os temas repetitivos do STJ, do Portal de Dados
 * Abertos, e os precedentes do BNP, com o radar cruzando o que mudou com os
 * processos. Serve para o primeiro deploy e para quando a carga falhou.
 *
 *   bun --env-file=.env apps/api/src/scripts/acervo.ts
 */
import { createDatabase } from "@decreta/db";
import { readEnv } from "../env.ts";
import { sincronizarTemasDoStj } from "../servicos/acervo.ts";
import { cruzarRadar, sincronizarPrecedentesDoBnp } from "../servicos/radar.ts";

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 2 });
const log = (msg: string, extra?: Record<string, unknown>) => console.error(msg, extra ?? "");
try {
  const { temas } = await sincronizarTemasDoStj({ db });
  console.log(`✓ ${temas} temas do STJ no acervo`);
  const desde = new Date();
  const bnp = await sincronizarPrecedentesDoBnp({ db, log });
  console.log(`✓ ${bnp.precedentes} precedentes do BNP no acervo, ${bnp.novidades} novidades`);
  const { avisos } = await cruzarRadar({ db, log }, desde);
  console.log(`✓ ${avisos} avisos no radar`);
} finally {
  await close();
}
