/**
 * O cenário dos testes do agente do WhatsApp: os dados da demonstração num escritório comum (com o slug
 * da demonstração, o agente trataria tudo como inventado), a API da tela, a IA de mentira e o canal da
 * memória, que guarda o que sairia e nunca fala com ninguém.
 *
 * A mensagem entra como a Meta entrega, já lida e conferida pelo adaptador (que tem os próprios testes),
 * e as rotinas rodam na hora, sem o debounce do Inngest.
 */
import { randomBytes } from "node:crypto";
import { organization, user, withTenant, type Tx } from "@decreta/db";
import { createTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { canalEmMemoria, MODELOS, textoDaSaida, type Conteudo, type MensagemNaMemoria } from "../src/whatsapp/canal.ts";
import { processarDecisao, processarMensagens, receberDoWebhook, type PedidoDoWhatsapp } from "../src/whatsapp/entrada.ts";
import type { DepsDoAgente } from "../src/whatsapp/tipos.ts";
import { pessoaDoUsuario, type PessoaNoWhatsapp } from "../src/whatsapp/vinculo.ts";
import { iaFalsa, type IaFalsa } from "./ia-falsa.ts";

export const SENHA = "demonstracao-123";
export const NUMERO_DO_DECRETA = "5547999990000";
export const TELEFONES = { beatriz: "5547991230001", rafael: "5547991230002", tiago: "5547991230003", camila: "5547991230004" } as const;
export const EMAILS = { beatriz: "teste@decreta.site", rafael: "rafael@demo.decreta.app", tiago: "tiago@demo.decreta.app", camila: "camila@demo.decreta.app" } as const;
export type Quem = keyof typeof TELEFONES;

export type Enviada = MensagemNaMemoria;

/** Os botões (ou os itens da lista, ou os botões do modelo) de uma mensagem que saiu, com o id que volta no toque. */
export function botoesDe(m: Enviada | undefined): { id: string; titulo: string }[] {
  const s = m?.saida;
  if (s?.tipo === "botoes") return s.botoes;
  if (s?.tipo === "lista") return s.itens;
  if (s?.tipo === "modelo") return MODELOS[s.nome].botoes.map((titulo, i) => ({ titulo, id: s.botoes?.[i] ?? "" }));
  return [];
}
export const titulosDe = (m: Enviada | undefined) => botoesDe(m).map((b) => b.titulo);
export const textoDe = (m: Enviada | undefined) => (m ? textoDaSaida(m.saida) : "");
/** O prazo de que a mensagem fala, pelo link dele. */
export const prazoDo = (m: Enviada | undefined) => /\/prazos\/([0-9a-f-]{36})/.exec(textoDe(m))?.[1] ?? "";

export interface CenarioDoWhatsapp {
  t: TestDatabase;
  organizationId: string;
  ia: IaFalsa;
  canal: ReturnType<typeof canalEmMemoria>;
  /** O agente das rotinas. Trocável no meio do teste (ligar a cobrança, por exemplo). */
  agente: DepsDoAgente;
  /** Os prazos que pediram o rascunho da peça (o evento `prazo.confirmado`). */
  rascunhos: string[];
  /** O que o agente registrou no log. */
  logs: { msg: string; extra?: Record<string, unknown> }[];
  ids: Record<Quem, string>;
  cookies: Record<Quem, string>;
  /** A API da tela, como a pessoa logada. */
  call(path: string, init?: RequestInit & { json?: unknown }, quem?: Quem): Promise<Response>;
  json<T = any>(r: Response | Promise<Response>): Promise<T>;
  /** Uma mensagem chega da Meta. Devolve o que o agente mandou por causa dela. */
  chega(telefone: string, conteudo: Conteudo, opcoes?: { responde?: string | null; wamid?: string }): Promise<Enviada[]>;
  escreve(quem: Quem | string, texto: string): Promise<Enviada[]>;
  /** O toque num botão (ou num item de lista) da mensagem. */
  toca(quem: Quem, m: Enviada | undefined, titulo: string): Promise<Enviada[]>;
  /** Entra de novo na tela (a sessão vence em dias: o teste que anda semanas no relógio entra outra vez). */
  entrar(quem: Quem): Promise<void>;
  /** Liga o WhatsApp da pessoa como na tela: o código que a tela dá, mandado do WhatsApp dela. */
  ligar(quem: Quem): Promise<Enviada[]>;
  /** A pessoa como o agente a vê agora. */
  pessoa(quem: Quem): Promise<PessoaNoWhatsapp>;
  noEscritorio<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  /** Liga a cobrança e deixa o escritório só para leitura enquanto `fn` roda. */
  soLeitura<T>(fn: () => Promise<T>): Promise<T>;
  drop(): Promise<void>;
}

export async function montarCenarioDoWhatsapp(hoje: string): Promise<CenarioDoWhatsapp> {
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const t = await createTestDatabase();
  const auth = createAuth(t.db, env);
  const arquivos = armazenamentoEmMemoria();
  const { organizationId } = await criarDemonstracao(t.db, auth, { hoje, senha: SENHA, arquivos });
  await t.db.update(organization).set({ slug: "escritorio-do-teste" }).where(eq(organization.id, organizationId));
  const ia = iaFalsa();
  const canal = canalEmMemoria();
  const rascunhos: string[] = [];
  const logs: CenarioDoWhatsapp["logs"] = [];
  const whatsapp = { canal, numero: NUMERO_DO_DECRETA, phoneNumberId: "123", appSecret: "segredo", verifyToken: "token", suporte: "suporte@decreta.site" };
  const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {}, whatsapp });
  const app = createApp({ db: t.db, env, auth, rotas, log: () => {} });

  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
    return cookie;
  };
  const ids = {} as Record<Quem, string>;
  const cookies = {} as Record<Quem, string>;
  for (const quem of Object.keys(EMAILS) as Quem[]) {
    const [u] = await t.db.select({ id: user.id }).from(user).where(eq(user.email, EMAILS[quem]));
    ids[quem] = u!.id;
    cookies[quem] = await entrar(EMAILS[quem]);
  }

  let n = 0;
  const c: CenarioDoWhatsapp = {
    t,
    organizationId,
    ia,
    canal,
    rascunhos,
    logs,
    ids,
    cookies,
    agente: { db: t.db, canal, log: (msg, extra) => void logs.push({ msg, extra }), ia, arquivos, telas: "https://decreta.local", suporte: "suporte@decreta.site", cobrancaAtiva: false, origem: "agente", pedirRascunho: async (_org, prazoId) => void rascunhos.push(prazoId) },
    call: (path, init = {}, quem = "beatriz") =>
      Promise.resolve(app.request(`/api/app${path}`, { ...init, headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: cookies[quem] }, body: init.json !== undefined ? JSON.stringify(init.json) : init.body })),
    async json<T>(r: Response | Promise<Response>): Promise<T> {
      return (await r).json() as Promise<T>;
    },
    async chega(telefone, conteudo, opcoes = {}) {
      const antes = canal.enviadas.length;
      const enfileirar = async (p: PedidoDoWhatsapp) => {
        if (p.tipo === "mensagem") await processarMensagens(c.agente, p);
        else await processarDecisao(c.agente, p);
      };
      await receberDoWebhook(c.agente, [{ tipo: "mensagem", wamid: opcoes.wamid ?? `wamid.teste.${++n}`, de: { telefone, bsuid: null, nome: null }, em: new Date(), responde: opcoes.responde ?? null, conteudo }], enfileirar);
      return canal.enviadas.slice(antes);
    },
    escreve: (quem, texto) => c.chega(quem in TELEFONES ? TELEFONES[quem as Quem] : quem, { tipo: "texto", texto }),
    async toca(quem, m, titulo) {
      const b = botoesDe(m).find((x) => x.titulo === titulo);
      if (!m || !b) throw new Error(`sem o botão "${titulo}" em: ${JSON.stringify(m?.saida)}`);
      return c.chega(TELEFONES[quem], { tipo: "escolha", id: b.id, titulo }, { responde: m.wamid });
    },
    async entrar(quem) {
      cookies[quem] = await entrar(EMAILS[quem]);
    },
    async ligar(quem) {
      const r = await c.json(c.call("/whatsapp/codigo", { method: "POST" }, quem));
      return c.escreve(quem, r.codigo);
    },
    async pessoa(quem) {
      const p = await pessoaDoUsuario(t.db, ids[quem], { cobrancaAtiva: c.agente.cobrancaAtiva, organizationId });
      if (!p) throw new Error(`${quem} não tem o WhatsApp ligado`);
      return p;
    },
    noEscritorio: (fn) => withTenant(t.db, organizationId, fn),
    async soLeitura(fn) {
      const [antes] = await t.db.select({ situacao: organization.situacao }).from(organization).where(eq(organization.id, organizationId));
      await t.db.update(organization).set({ situacao: "so_leitura" }).where(eq(organization.id, organizationId));
      c.agente = { ...c.agente, cobrancaAtiva: true };
      try {
        return await fn();
      } finally {
        c.agente = { ...c.agente, cobrancaAtiva: false };
        await t.db.update(organization).set({ situacao: antes!.situacao }).where(eq(organization.id, organizationId));
      }
    },
    drop: () => t.drop(),
  };
  return c;
}
