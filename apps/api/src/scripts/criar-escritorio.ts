/**
 * Cria um escritório e a primeira pessoa dele (sócia, papel owner). O resto da
 * equipe entra por convite, pela tela da Equipe.
 *
 *   bun run escritorio:criar --nome "Souza & Freitas Advocacia" --slug souza-freitas \
 *     --email beatriz@exemplo.adv.br --pessoa "Beatriz Souza" --oab 12345/SC [--tribunal TJSC]
 *
 * Sem --senha, sai uma senha provisória na tela: a pessoa entra com ela, troca
 * em Configurações › Segurança e liga a verificação em duas etapas.
 */
import { randomBytes } from "node:crypto";
import { parseArgs } from "node:util";
import { createDatabase } from "@decreta/db";
import { createAuth } from "../auth.ts";
import { readEnv } from "../env.ts";
import { criarEscritorio } from "../escritorio-novo.ts";

const { values: a } = parseArgs({
  options: {
    nome: { type: "string" },
    slug: { type: "string" },
    email: { type: "string" },
    pessoa: { type: "string" },
    oab: { type: "string" },
    cargo: { type: "string", default: "Advogada · sócia" },
    tribunal: { type: "string", default: "TJSC" },
    senha: { type: "string" },
  },
});

function exigir(valor: string | undefined, nome: string): string {
  if (!valor) throw new Error(`faltou --${nome}`);
  return valor;
}

const oab = a.oab ? /^([\d.]+)\s*\/?\s*([A-Za-z]{2})$/.exec(a.oab.trim()) : null;
if (a.oab && !oab) throw new Error("--oab no formato 12345/SC");
const slug = exigir(a.slug, "slug");
if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) throw new Error("--slug só com letras minúsculas, números e hífen");

const env = readEnv();
const { db, close } = createDatabase(env.DATABASE_URL, { max: 1 });
try {
  const senha = a.senha ?? randomBytes(12).toString("base64url");
  const r = await criarEscritorio(db, createAuth(db, env), {
    nome: exigir(a.nome, "nome"),
    slug,
    tribunal: a.tribunal,
    dono: { email: exigir(a.email, "email"), nome: exigir(a.pessoa, "pessoa"), senha, cargo: a.cargo, oabNumero: oab?.[1], oabUf: oab?.[2]?.toUpperCase() },
  });
  console.log(`Escritório criado (${r.organizationId}).`);
  console.log(`Entre em ${env.WEB_ORIGIN.replace(/\/$/, "")}/entrar com ${a.email}${a.senha ? "" : ` e a senha provisória ${senha}`}.`);
  if (!a.senha) console.log("Troque a senha no primeiro acesso e ligue a verificação em duas etapas.");
} finally {
  await close();
}
