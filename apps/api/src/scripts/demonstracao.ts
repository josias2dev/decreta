/**
 * Escritório de demonstração com dados inventados (nenhum dado de cliente de
 * verdade), para mostrar o Decreta e testar as telas.
 *
 *   bun run demonstracao                       cria, se ainda não existe
 *   bun run demonstracao --recriar             apaga e cria de novo, com as datas de hoje
 *   bun run demonstracao --senha <senha>       senha das quatro pessoas (sem ela, sai uma na tela)
 *
 * Entra-se como beatriz@demo.decreta.app (sócia), rafael@, tiago@ ou camila@.
 * O resumo da manhã fica desligado e ninguém tem WhatsApp: nada sai daqui.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { hojeEm } from "@decreta/core";
import { createDatabase, organization } from "@decreta/db";
import { armazenamentoDoEnv } from "@decreta/documentos";
import { eq } from "drizzle-orm";
import { createAuth } from "../auth.ts";
import { apagarDemonstracao, criarDemonstracao } from "../demonstracao.ts";
import { ESCRITORIO } from "../demonstracao/dados.ts";
import { readEnv } from "../env.ts";

const { values: a } = parseArgs({ options: { recriar: { type: "boolean", default: false }, senha: { type: "string" } } });

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 2 });
try {
  const [existe] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, ESCRITORIO.slug));
  if (existe && !a.recriar) {
    console.log("A demonstração já existe. Use --recriar para apagar e criar de novo com as datas de hoje.");
  } else {
    if (existe) await apagarDemonstracao(db);
    const senha = a.senha ?? randomBytes(9).toString("base64url");
    if (senha.length < 10) throw new Error("a senha precisa de pelo menos 10 caracteres");
    const r = await criarDemonstracao(db, createAuth(db, env), { hoje: hojeEm(), senha, arquivos: armazenamentoDoEnv(env) });
    console.log(`Demonstração criada (${r.organizationId}).`);
    console.log(`Entre em ${env.WEB_ORIGIN.replace(/\/$/, "")}/entrar com ${r.emails.join(", ")}${a.senha ? "" : ` e a senha ${senha}`}.`);
  }
} finally {
  await close();
}
