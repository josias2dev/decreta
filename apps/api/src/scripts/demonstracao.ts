/**
 * Escritório de demonstração com dados inventados (nenhum dado de cliente de
 * verdade), para mostrar o Decreta e testar as telas.
 *
 *   bun run demonstracao                       cria, se ainda não existe
 *   bun run demonstracao --recriar             apaga e cria de novo, com as datas de hoje
 *   bun run demonstracao --renovar             refaz os dados com as datas de hoje, sem mexer nas contas
 *   bun run demonstracao --senha <senha>       senha das quatro pessoas (sem ela, vale DEMONSTRACAO_SENHA
 *                                             do .env; sem as duas, sai uma na tela)
 *
 * Entra-se como teste@decreta.site (a sócia) ou rafael@, tiago@ e camila@demo.decreta.app.
 * O resumo da manhã fica desligado e a busca no DJEN e no DataJud não roda para
 * esse escritório. O WhatsApp oficial liga, para testar o agente com os dados
 * inventados, e o vínculo atravessa a renovação.
 *
 * O `--renovar` é o do decreta-demonstracao.timer, toda madrugada: quem estava
 * dentro continua dentro (e com o WhatsApp ligado), a senha volta para
 * DEMONSTRACAO_SENHA e o que foi mexido no dia volta ao começo.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { hojeEm } from "@decreta/core";
import { createDatabase, organization } from "@decreta/db";
import { armazenamentoDoEnv } from "@decreta/documentos";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth.ts";
import { apagarDemonstracao, criarDemonstracao, renovarDemonstracao } from "../demonstracao.ts";
import { ESCRITORIO } from "../demonstracao/dados.ts";
import { readEnv } from "../env.ts";

const { values: a } = parseArgs({ options: { recriar: { type: "boolean", default: false }, renovar: { type: "boolean", default: false }, senha: { type: "string" } } });

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 2 });
const arquivos = armazenamentoDoEnv(env);
const pedida = a.senha ?? (env.DEMONSTRACAO_SENHA || undefined);
try {
  const [existe] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, ESCRITORIO.slug));
  if (pedida !== undefined && pedida.length < 8) throw new Error("a senha precisa de pelo menos 8 caracteres");
  if (a.renovar) {
    await renovarDemonstracao(db, createAuth(db, env), { hoje: hojeEm(), senha: pedida, arquivos });
    console.log(`Demonstração renovada com as datas de ${hojeEm()}.`);
  } else if (existe && !a.recriar) {
    console.log("A demonstração já existe. Use --renovar para refazer as datas ou --recriar para apagar tudo, contas inclusive.");
  } else {
    if (existe) await apagarDemonstracao(db, { arquivos });
    const senha = pedida ?? randomBytes(9).toString("base64url");
    const r = await criarDemonstracao(db, createAuth(db, env), { hoje: hojeEm(), senha, arquivos });
    console.log(`Demonstração criada (${r.organizationId}).`);
    console.log(`Entre em ${env.WEB_ORIGIN.replace(/\/$/, "")}/entrar com ${r.emails.join(", ")}${pedida ? "" : ` e a senha ${senha}`}.`);
  }
} finally {
  await close();
}
