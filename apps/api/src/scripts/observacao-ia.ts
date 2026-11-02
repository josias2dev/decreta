/**
 * O placar do modo observar: o modelo atual e o candidato contra o que as
 * pessoas decidiram. Só contagens, sem dado de cliente. Não chama a IA.
 *
 *   bun run observacao
 */
import { createDatabase } from "@decreta/db";
import { readEnv } from "../env.ts";
import { placarDaObservacao, placarEmTexto } from "../servicos/observacao.ts";

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 1 });
console.log(placarEmTexto(await placarDaObservacao(db)));
await close();
