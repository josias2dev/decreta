/**
 * O cenário dos testes do Financeiro: dois escritórios com banco de verdade (RLS), a equipe do primeiro
 * (uma sócia, um sócio, uma advogada com acesso liberado, um advogado e uma estagiária sem acesso) e
 * servidores de mentira para o Asaas e a ZapSign. Nada aqui fala com os serviços de verdade.
 */
import { randomBytes } from "node:crypto";
import { hojeEm } from "@decreta/core";
import { clientes, processos, withTenant } from "@decreta/db";
import { createTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { expect } from "bun:test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarCofre } from "../src/cofre.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { rotasDoAvisoDoAsaas } from "../src/rotas/cobranca-aviso.ts";
import { createRotas } from "../src/rotas/index.ts";
import type { Wameow } from "../src/servicos/avisos.ts";

export const SENHA = "senha-bem-longa-123";
export const HOJE = hojeEm("America/Sao_Paulo");
export const CHAVE_DE_TESTE = "$aact_hmlg_CHAVE_DE_MENTIRA_SO_PARA_OS_TESTES";
export const CHAVE_DA_ZAPSIGN = "c7f35c84-7893-4087-b4fb-d1f06c23aaaa-8f3e2d1c-bbbb-4cde-9fa0-0123456789ab";

export interface Chamada {
  servico: "asaas" | "zapsign" | "arquivo";
  metodo: string;
  caminho: string;
  cabecalhos: Record<string, string>;
  corpo: any;
}

/** Os servidores de mentira. `falhas` troca a resposta de um caminho (por "MÉTODO /caminho") para testar o erro. */
export function provedoresDeMentira() {
  const chamadas: Chamada[] = [];
  const falhas = new Map<string, { status: number; corpo: unknown }>();
  const clientesDoAsaas = new Map<string, string>();
  const cobrancas = new Map<string, { id: string; value: number; dueDate: string; externalReference: string }>();
  const webhooks: { id: string; authToken: string; url: string; events: string[] }[] = [];
  const documentosDaZapSign = new Map<string, { status: string; signers: { name: string; token: string; status: string }[] }>();
  let n = 0;

  const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

  const f = (async (url: string, init: RequestInit = {}) => {
    const u = new URL(url);
    const metodo = init.method ?? "GET";
    const cabecalhos = Object.fromEntries(new Headers(init.headers).entries());
    const corpo = init.body ? JSON.parse(String(init.body)) : null;
    const servico = u.host.endsWith("asaas.com") ? "asaas" : u.host.endsWith("api.zapsign.com.br") ? "zapsign" : "arquivo";
    const caminho = u.pathname + u.search;
    chamadas.push({ servico, metodo, caminho, cabecalhos, corpo });
    const falha = falhas.get(`${metodo} ${u.pathname}`);
    if (falha) return json(falha.status, falha.corpo);

    if (servico === "arquivo") return new Response(new Uint8Array([37, 80, 68, 70, 45, 49]), { status: 200 });

    if (servico === "asaas") {
      if (cabecalhos["access_token"] !== CHAVE_DE_TESTE) return json(401, { errors: [{ code: "invalid_access_token", description: "A chave de API informada não é válida." }] });
      const p = u.pathname.replace(/^\/v3/, "");
      if (metodo === "GET" && p === "/customers") {
        const ref = u.searchParams.get("externalReference");
        const achado = ref ? clientesDoAsaas.get(ref) : undefined;
        return json(200, { data: achado ? [{ id: achado }] : [], totalCount: achado ? 1 : 0 });
      }
      if (metodo === "POST" && p === "/customers") {
        const id = `cus_${++n}`;
        clientesDoAsaas.set(corpo.externalReference, id);
        return json(200, { id });
      }
      if (metodo === "POST" && p === "/payments") {
        if (corpo.dueDate < HOJE) return json(400, { errors: [{ code: "invalid_object", description: "A data de vencimento não pode ser anterior à data atual." }] });
        const id = `pay_${++n}`;
        cobrancas.set(id, { id, value: corpo.value, dueDate: corpo.dueDate, externalReference: corpo.externalReference });
        return json(200, { id, status: "PENDING", invoiceUrl: `https://sandbox.asaas.com/i/${id}`, dueDate: corpo.dueDate, value: corpo.value });
      }
      if (metodo === "DELETE" && p.startsWith("/payments/")) {
        const id = p.slice("/payments/".length);
        return cobrancas.delete(id) ? json(200, { deleted: true, id }) : json(404, { errors: [{ code: "invalid_object", description: "Cobrança não encontrada." }] });
      }
      if (metodo === "POST" && p === "/webhooks") {
        const id = `wh_${++n}`;
        webhooks.push({ id, authToken: corpo.authToken, url: corpo.url, events: corpo.events });
        return json(200, { id, hasAuthToken: true });
      }
      if (metodo === "DELETE" && p.startsWith("/webhooks/")) return json(200, { deleted: true });
      if (metodo === "POST" && p === "/pix/automatic/authorizations") return json(200, { id: `aut_${++n}`, status: "CREATED", payload: "00020126pixautomatico", encodedImage: "iVBORw0KGgo=" });
    }

    if (servico === "zapsign") {
      if (cabecalhos["authorization"] !== `Bearer ${CHAVE_DA_ZAPSIGN}`) return json(401, { detail: "Invalid token." });
      if (metodo === "POST" && u.pathname === "/api/v1/docs/") {
        const token = `doc_${++n}`;
        const signers = (corpo.signers as { name: string }[]).map((s, i) => ({ name: s.name, token: `sig_${n}_${i}`, sign_url: `https://app.zapsign.com.br/verificar/sig_${n}_${i}`, status: "new" }));
        documentosDaZapSign.set(token, { status: "pending", signers });
        return json(200, { token, status: "pending", signers });
      }
      const m = /^\/api\/v1\/docs\/([^/]+)\/$/.exec(u.pathname);
      if (metodo === "GET" && m) {
        const d = documentosDaZapSign.get(m[1]!);
        if (!d) return json(404, { detail: "Not found." });
        return json(200, { token: m[1], status: d.status, signed_file: d.status === "signed" ? "https://zapsign.s3.amazonaws.com/assinado.pdf?x=1" : null, signers: d.signers.map((s) => ({ ...s, sign_url: `https://app.zapsign.com.br/verificar/${s.token}` })) });
      }
    }
    return json(404, { erro: `sem resposta de mentira para ${metodo} ${u.host}${u.pathname}` });
  }) as unknown as typeof fetch;

  return {
    fetch: f,
    chamadas,
    falhas,
    cobrancas,
    webhooks,
    /** Assina o documento de mentira, como se todos tivessem assinado na ZapSign. */
    assinarTudo: (token: string) => {
      const d = documentosDaZapSign.get(token)!;
      d.status = "signed";
      d.signers.forEach((s) => (s.status = "signed"));
    },
    chamadasDe: (servico: Chamada["servico"]) => chamadas.filter((c) => c.servico === servico),
  };
}

/** Um wameow falso que guarda o que receberia. */
export function wameowDeMentira() {
  const enviados: { number: string; text: string }[] = [];
  const w: Wameow = {
    url: "http://wameow.local",
    token: "token-de-teste",
    fetch: (async (_url: string, init: RequestInit) => {
      enviados.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  };
  return { w, enviados };
}

/** A resposta da API nos testes: o corpo JSON sai como `any`, porque cada teste confere os campos que lhe interessam. */
export type Resposta = Omit<Response, "json"> & { json(): Promise<any> };

export interface Cenario {
  t: TestDatabase;
  app: ReturnType<typeof createApp>;
  env: ReturnType<typeof readEnv>;
  provedores: ReturnType<typeof provedoresDeMentira>;
  zap: ReturnType<typeof wameowDeMentira>;
  arquivos: ReturnType<typeof armazenamentoEmMemoria>;
  pedidos: Pedido[];
  cofre?: ReturnType<typeof criarCofre>;
  /** O que a API escreveu no log. */
  logs: { msg: string; extra?: Record<string, unknown> }[];
  souza: { orgId: string; beatriz: string; rafael: string; camila: string; tiago: string; clienteId: string; processoId: string; cookies: Record<"beatriz" | "rafael" | "camila" | "tiago" | "bianca", string>; userIds: Record<"beatriz" | "rafael" | "camila" | "tiago" | "bianca", string> };
  mendes: { orgId: string; cookie: string; clienteId: string; processoId: string };
  demo: { orgId: string; cookie: string };
  /** Pede à API como a pessoa: `com("beatriz", "/financeiro")`. */
  com: (quem: "beatriz" | "rafael" | "camila" | "tiago" | "bianca" | "mendes" | "demo", caminho: string, init?: { metodo?: string; json?: unknown }) => Promise<Resposta>;
  json: (r: Resposta | Promise<Resposta>) => Promise<any>;
  /** O aviso de pagamento do Asaas, direto no endereço público, sem sessão. */
  aviso: (orgId: string, corpo: unknown, cabecalhos?: Record<string, string>) => Promise<Resposta>;
  encerrar: () => Promise<void>;
}

/**
 * Souza & Mendes: Beatriz (sócia, owner), Rafael (sócio, admin), Camila (advogada com o Financeiro liberado),
 * Tiago (advogado, sem Financeiro) e Bianca (estagiária, sem OAB e sem Financeiro). Mendes Advogados é o outro
 * escritório, com um cliente e um processo dele.
 */
export async function montarCenario(opcoes: { cofre?: boolean; wameow?: boolean } = {}): Promise<Cenario> {
  const t = await createTestDatabase();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const auth = createAuth(t.db, env);
  const arquivos = armazenamentoEmMemoria();
  const provedores = provedoresDeMentira();
  const zap = wameowDeMentira();
  const pedidos: Pedido[] = [];
  const cofre = opcoes.cofre === false ? undefined : criarCofre(randomBytes(32).toString("hex"));
  const logs: Cenario["logs"] = [];
  const log = (msg: string, extra?: Record<string, unknown>) => void logs.push({ msg, extra });
  const rotas = createRotas({
    db: t.db,
    auth,
    ia: null,
    arquivos,
    mailer: createLogMailer(() => {}),
    telas: "https://decreta.local",
    captura: { db: t.db, datajudKey: "" },
    wameow: opcoes.wameow === false ? undefined : zap.w,
    maxArquivoBytes: 5e6,
    enfileirar: async (p) => {
      pedidos.push(p);
    },
    log,
    cofre,
    fetchDosProvedores: provedores.fetch,
    enderecoDaApi: "https://api.decreta.local",
  });
  const app = createApp({ db: t.db, env, auth, rotas, avisoDoAsaas: rotasDoAvisoDoAsaas({ db: t.db, log }), log });

  const novo = (nome: string, slug: string, email: string, pessoa: string, oab = true) => criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: pessoa, senha: SENHA, cargo: "Advogada", ...(oab ? { oabNumero: "41233", oabUf: "SC" } : {}), whatsapp: "5547991234567" } });
  const { organizationId: souzaId, userId: beatriz } = await novo("Souza & Mendes Advocacia", "souza-mendes", "beatriz@souza.adv.br", "Beatriz Souza");
  const { organizationId: mendesId } = await novo("Mendes Advogados", "mendes", "tiago@mendes.adv.br", "Tiago Mendes");
  const { organizationId: demoId } = await novo("Demonstração", SLUG_DA_DEMONSTRACAO, "teste@decreta.site", "Sócia da Demonstração");
  // Quem entra no Souza vem de outro escritório (cada um com a conta própria) e é posto como membro.
  const outros = {
    rafael: (await novo("Rafael Freitas Advocacia", "rafael-freitas", "rafael@freitas.adv.br", "Rafael Freitas")).userId,
    camila: (await novo("Camila Azevedo Advocacia", "camila-azevedo", "camila@azevedo.adv.br", "Camila Azevedo")).userId,
    tiago: (await novo("Tiago Martins Advocacia", "tiago-martins", "tiago@martins.adv.br", "Tiago Martins")).userId,
    bianca: (await novo("Bianca Dias Estágio", "bianca-dias", "bianca@dias.adv.br", "Bianca Dias", false)).userId,
  };
  await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${souzaId}, ${outros.rafael}, 'admin')`;
  await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${souzaId}, ${outros.camila}, 'member')`;
  await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${souzaId}, ${outros.tiago}, 'member')`;
  await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${souzaId}, ${outros.bianca}, 'member')`;
  // O perfil de quem entrou: OAB (Camila e Tiago são advogados) e o Financeiro liberado só para a Camila.
  await t.owner`insert into equipe (organization_id, user_id, oab_numero, oab_uf, financeiro) values (${souzaId}, ${outros.camila}, '52104', 'SC', true) on conflict (organization_id, user_id) do update set oab_numero = '52104', oab_uf = 'SC', financeiro = true`;
  await t.owner`insert into equipe (organization_id, user_id, oab_numero, oab_uf) values (${souzaId}, ${outros.tiago}, '45678', 'SC') on conflict (organization_id, user_id) do update set oab_numero = '45678', oab_uf = 'SC'`;

  const entrar = async (email: string, orgId: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    expect(r.status).toBe(200);
    const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    return cookie;
  };
  const cookies = {
    beatriz: await entrar("beatriz@souza.adv.br", souzaId),
    rafael: await entrar("rafael@freitas.adv.br", souzaId),
    camila: await entrar("camila@azevedo.adv.br", souzaId),
    tiago: await entrar("tiago@martins.adv.br", souzaId),
    bianca: await entrar("bianca@dias.adv.br", souzaId),
  };
  const cookieMendes = await entrar("tiago@mendes.adv.br", mendesId);
  const cookieDemo = await entrar("teste@decreta.site", demoId);

  const caso = (orgId: string, cliente: string, processo: string, cnj: string) =>
    withTenant(t.db, orgId, async (tx) => {
      const [cl] = await tx.insert(clientes).values({ organizationId: orgId, nome: cliente, documento: "52998224725", telefone: "(47) 99123-4567", email: "cliente@exemplo.com.br" }).returning();
      const [p] = await tx.insert(processos).values({ organizationId: orgId, titulo: processo, cnj, clienteId: cl!.id }).returning();
      return { clienteId: cl!.id, processoId: p!.id };
    });
  const casoSouza = await caso(souzaId, "Marina Duarte", "Marina Duarte × Seguradora Alfa S.A.", "5001234-56.2026.8.24.0038");
  const casoMendes = await caso(mendesId, "Hotel Mar Azul Ltda.", "Hotel Mar Azul × Banco Beta", "5007777-12.2026.8.24.0038");

  const cookieDe = { ...cookies, mendes: cookieMendes, demo: cookieDemo };
  const com: Cenario["com"] = async (quem, caminho, init = {}) =>
    app.request(`/api/app${caminho}`, {
      method: init.metodo ?? (init.json !== undefined ? "POST" : "GET"),
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: cookieDe[quem] },
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });

  return {
    t,
    app,
    env,
    provedores,
    zap,
    arquivos,
    pedidos,
    cofre,
    logs,
    souza: { orgId: souzaId, beatriz, rafael: outros.rafael, camila: outros.camila, tiago: outros.tiago, ...casoSouza, cookies, userIds: { beatriz, ...outros } },
    mendes: { orgId: mendesId, cookie: cookieMendes, ...casoMendes },
    demo: { orgId: demoId, cookie: cookieDemo },
    com,
    json: async (r) => (await r).json(),
    aviso: async (orgId, corpo, cabecalhos = {}) => app.request(`/api/cobranca/asaas/${orgId}`, { method: "POST", headers: { "content-type": "application/json", ...cabecalhos }, body: JSON.stringify(corpo) }),
    encerrar: () => t.drop(),
  };
}
