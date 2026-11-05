/**
 * O que os testes da cobrança têm em comum: a API inteira (as telas, o painel da plataforma e o aviso do
 * Asaas) montada sobre um banco de teste e um Asaas de mentira, e os atalhos para criar escritório, entrar
 * e chamar uma rota.
 */
import { expect } from "bun:test";
import { randomBytes } from "node:crypto";
import type { TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio, type EscritorioNovo } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { rotasDaPlataforma } from "../src/rotas/plataforma.ts";
import { criarClienteAsaas, type ConfigDaNfse } from "../src/servicos/asaas.ts";
import { emailsDaPlataforma } from "../src/servicos/plataforma.ts";
import { asaasFalso, CHAVE_DO_ASAAS, TOKEN_DO_ASAAS } from "./asaas-falso.ts";

export const SENHA = "senha-bem-longa-123";

export function montarApi(t: TestDatabase, opcoes: { ativa: boolean; operadores?: string; doisFatores?: boolean; emailLigado?: boolean; token?: string; asaas?: ReturnType<typeof asaasFalso>; nfse?: ConfigDaNfse; log?: (msg: string, extra?: Record<string, unknown>) => void }) {
  const env = readEnv({
    DATABASE_URL: "postgres://unused@localhost/unused",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://localhost:8787",
    PLATAFORMA_EMAILS: opcoes.operadores ?? "",
    COBRANCA_ATIVA: opcoes.ativa ? "1" : "",
  });
  const mailer = createLogMailer(() => {});
  const auth = createAuth(t.db, env, { mailer });
  const asaas = opcoes.asaas ?? asaasFalso();
  const cliente = criarClienteAsaas({ apiKey: CHAVE_DO_ASAAS, ambiente: "sandbox", fetch: asaas.fetch });
  const operadores = emailsDaPlataforma(env.PLATAFORMA_EMAILS);
  const enfileiradas: unknown[] = [];
  const rotas = createRotas({
    db: t.db,
    auth,
    ia: null,
    arquivos: armazenamentoEmMemoria(),
    mailer,
    telas: "https://decreta.local",
    captura: { db: t.db, datajudKey: "", cobrancaAtiva: opcoes.ativa },
    maxArquivoBytes: 5e6,
    enfileirar: async (p) => void enfileiradas.push(p),
    log: opcoes.log ?? (() => {}),
    cobranca: { ativa: opcoes.ativa, asaas: cliente },
    plataformaEmails: operadores,
  });
  const app = createApp({
    db: t.db,
    env,
    auth,
    rotas,
    plataforma: rotasDaPlataforma({ db: t.db, auth, emails: operadores, log: () => {}, exigirDoisFatores: opcoes.doisFatores ?? false, emailLigado: opcoes.emailLigado ?? false, telas: "https://decreta.local", config: { cotacaoUsd: 5, tetos: { siteUsd: 4, avaliacaoUsd: 0.5 } } }),
    plataformaEmails: operadores,
    cobranca: { ativa: opcoes.ativa, token: opcoes.token === undefined ? TOKEN_DO_ASAAS : opcoes.token, asaas: cliente, nfse: opcoes.nfse ?? null },
    log: opcoes.log ?? (() => {}),
  });

  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const com = (cookie: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const daPlataforma = (cookie: string | null, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/plataforma${path}`, {
      method: init.method ?? (init.json !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  /** O aviso do Asaas, com o token certo (ou o que a chamada disser). */
  const aviso = (corpo: unknown, token: string | null = opcoes.token === undefined ? TOKEN_DO_ASAAS : opcoes.token, ip?: string) =>
    app.request("/api/cobranca/asaas", { method: "POST", headers: { "content-type": "application/json", ...(token ? { "asaas-access-token": token } : {}), ...(ip ? { "x-forwarded-for": ip } : {}) }, body: JSON.stringify(corpo) });
  const novo = (e: Omit<EscritorioNovo, "dono"> & { email: string; pessoa: string }) => criarEscritorio(t.db, auth, { nome: e.nome, slug: e.slug, cadastroAberto: e.cadastroAberto, assinatura: e.assinatura, dono: { email: e.email, nome: e.pessoa, senha: SENHA } });

  return { env, app, auth, mailer, asaas, enfileiradas, json, com, daPlataforma, entrar, aviso, novo };
}

/** Muda a assinatura do escritório direto no banco (como dono): o cenário do teste. */
export async function porNaAssinatura(t: TestDatabase, organizationId: string, campos: Partial<{ situacao: string; teste_ate: string | null; inadimplente_desde: string | null; acesso_ate: string | null; asaas_link_id: string | null; asaas_assinatura_id: string | null; assinou_em: string | null; valor_mensal_centavos: number | null; em_avaliacao: boolean }>) {
  for (const [coluna, valor] of Object.entries(campos)) {
    await t.owner.unsafe(`update organization set "${coluna}" = ${coluna === "situacao" ? `'${valor}'::situacao_do_escritorio` : "$1"} where id = '${organizationId}'`, coluna === "situacao" ? [] : [valor as never]);
  }
}

export const organizacao = async (t: TestDatabase, organizationId: string) => (await t.owner`select * from organization where id = ${organizationId}`)[0] as Record<string, any>;

/** Uma coluna `date` do banco como `AAAA-MM-DD` (o driver devolve `Date`). */
export const dia = (v: unknown): string | null => (v == null ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v));

export const faturasDe = async (t: TestDatabase, organizationId: string) =>
  (await t.owner`select id, situacao::text as situacao, valor_centavos, to_char(vencimento, 'YYYY-MM-DD') as vencimento, forma, to_char(paga_em, 'YYYY-MM-DD') as paga_em from faturas where organization_id = ${organizationId} order by vencimento, id`) as unknown as { id: string; situacao: string; valor_centavos: number; vencimento: string; forma: string | null; paga_em: string | null }[];
