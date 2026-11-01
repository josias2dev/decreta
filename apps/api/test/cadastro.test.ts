/**
 * Cadastro aberto (POST /api/cadastro): a pessoa, o escritório e a sessão
 * nascem de uma vez, sem convite; o onboarding fica pendente até a pessoa
 * concluir pelas telas.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { slugDoNome } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { tetoDeSaida } from "../src/servicos/em-avaliacao.ts";
import { AVISOS, motivoParaBarrar, SEM_LIMITES } from "../src/servicos/uso-ia.ts";

describe("slug do nome do escritório", () => {
  test("sem acento, em minúsculas e com hífen; vazio vira 'escritorio'", () => {
    expect(slugDoNome("Souza & Mendes Advocacia")).toBe("souza-mendes-advocacia");
    expect(slugDoNome("  Dra. Beatriz Souza — Advocacia  ")).toBe("dra-beatriz-souza-advocacia");
    expect(slugDoNome("@@@")).toBe("escritorio");
    expect(slugDoNome("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("escritório em avaliação", () => {
  test("o teto de saída vale por escritório e para todos juntos, e volta depois de um dia", () => {
    let agora = 0;
    const teto = tetoDeSaida({ porEscritorio: 2, todos: 3 }, () => agora);
    expect([teto.permitir("a"), teto.permitir("a"), teto.permitir("a")]).toEqual([true, true, false]);
    expect([teto.permitir("b"), teto.permitir("c")]).toEqual([true, false]);
    agora = 24 * 60 * 60_000 + 1;
    expect(teto.permitir("c")).toBe(true);
  });

  test("a IA para no teto menor, e só para quem está em avaliação", () => {
    const limites = { ...SEM_LIMITES, demonstracao: { mensagensPorDia: 0, tetoUsd: 0.5 } };
    const uso = { mensagensNoMinuto: 0, mensagensHoje: 0, gastoPessoaUsd: 0.5, gastoEscritorioUsd: 0.5, gastoSiteUsd: 0.5 };
    expect(motivoParaBarrar(limites, uso, { demonstracao: false, emAvaliacao: true, mensagem: false })).toBe(AVISOS.emAvaliacao);
    expect(motivoParaBarrar(limites, uso, { demonstracao: false, emAvaliacao: false, mensagem: false })).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("cadastro aberto", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const enviados: string[] = [];
  const convites: string[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const beatriz = { nome: "Beatriz Souza", email: "Beatriz@Souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia" };

  const cadastrar = (json: unknown, ip = "203.0.113.7") =>
    app.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify(json) });
  const comSessao = (cookie: string, path: string, init: RequestInit = {}) => app.request(`/api/app${path}`, { ...init, headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie } });
  const cookieDe = (r: Response) => r.headers.get("set-cookie")?.split(";")[0] ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env, { mailer: { enabled: true, send: async (e) => void convites.push(e.to) } });
    const wameow = {
      url: "http://wameow.local",
      token: "token-de-teste",
      fetch: (async (_url: string, init: RequestInit) => {
        enviados.push(String(init.body));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    };
    const rotas = createRotas({ db: t.db, auth, ia: null, wameow, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("cria a pessoa como sócia, o escritório e a sessão; o onboarding fica pendente e o registro guarda a criação", async () => {
    const r = await cadastrar(beatriz);
    expect(r.status).toBe(201);
    const corpo = await json(r);
    expect(corpo).toMatchObject({ ok: true, escritorio: { slug: "souza-mendes-advocacia" } });
    const cookie = cookieDe(r);
    expect(cookie).toMatch(/^better-auth\.session_token=/);

    const eu = await json(comSessao(cookie, "/eu"));
    expect(eu.usuario).toMatchObject({ nome: "Beatriz Souza", apelido: "Beatriz", papel: "owner" });
    expect(eu.escritorio).toMatchObject({ nome: "Souza & Mendes Advocacia", pessoas: 1, onboarding: true });

    const [u] = await t.owner<{ email: string; email_verified: boolean }[]>`select email, email_verified from "user" where email = 'beatriz@souza.adv.br'`;
    expect(u).toMatchObject({ email: "beatriz@souza.adv.br", email_verified: true });
    const [esc] = await t.owner<{ tribunal: string; onboarding_concluido_em: Date | null }[]>`select tribunal, onboarding_concluido_em from escritorios where organization_id = ${corpo.escritorio.id}`;
    expect(esc).toMatchObject({ tribunal: "TJSC", onboarding_concluido_em: null });
    const registro = await t.owner<{ acao: string; detalhes: Record<string, unknown> }[]>`select acao, detalhes from auditoria where organization_id = ${corpo.escritorio.id} order by created_at`;
    expect(registro.map((x) => x.acao)).toEqual(["escritorio.criado", "login"]);
    expect(registro[0]!.detalhes).toMatchObject({ escritorio: "Souza & Mendes Advocacia", slug: "souza-mendes-advocacia" });
  });

  test("e-mail já cadastrado: 409 sem criar outro escritório", async () => {
    const r = await cadastrar({ ...beatriz, email: "BEATRIZ@souza.adv.br", escritorio: "Outro Escritório" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erro: "email_em_uso", detalhe: "Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova." });
    expect((await t.owner<{ n: number }[]>`select count(*)::int as n from organization`)[0]!.n).toBe(1);
  });

  test("mesmo nome de escritório: o endereço ganha um sufixo", async () => {
    const r = await cadastrar({ nome: "Carla Mendes", email: "carla@mendes.adv.br", senha: "outra-senha-longa-456", escritorio: "Souza & Mendes Advocacia" });
    expect(r.status).toBe(201);
    expect((await json(r)).escritorio.slug).toBe("souza-mendes-advocacia-2");
  });

  test("dados inválidos: senha curta, e-mail torto ou escritório sem nome dão 400", async () => {
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", senha: "curta" })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "sem-arroba" })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", escritorio: " " })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", nome: "B" })).status).toBe(400);
  });

  test("concluir o onboarding: /eu deixa de dizer pendente", async () => {
    const r = await cadastrar({ nome: "Diego Freitas", email: "diego@freitas.adv.br", senha: "senha-do-diego-789", escritorio: "Freitas Advogados" });
    const cookie = cookieDe(r);
    expect((await json(comSessao(cookie, "/eu"))).escritorio.onboarding).toBe(true);
    expect((await comSessao(cookie, "/escritorio/onboarding", { method: "POST" })).status).toBe(200);
    expect((await json(comSessao(cookie, "/eu"))).escritorio.onboarding).toBe(false);
  });

  test("pedido de formulário de outro site não cria conta nem abre sessão", async () => {
    const r = await app.request("/api/cadastro", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://site-de-fora.example", "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({ nome: "Gil Prado", email: "gil@prado.adv.br", senha: "senha-do-gil-12345", escritorio: "Prado Advocacia" }),
    });
    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await t.owner<{ n: number }[]>`select count(*)::int as n from "user" where email = 'gil@prado.adv.br'`)[0]!.n).toBe(0);
  });

  test("corpo grande demais recebe 413; senha acima de 128 caracteres, 400", async () => {
    const grande = await app.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": "203.0.113.21" }, body: JSON.stringify({ nome: "x".repeat(20_000) }) });
    expect(grande.status).toBe(413);
    expect((await cadastrar({ ...beatriz, email: "longa@souza.adv.br", senha: "s".repeat(129) }, "203.0.113.21")).status).toBe(400);
  });

  test("em avaliação, o WhatsApp do Decreta para no teto do dia e volta quando o escritório é liberado", async () => {
    const r = await cadastrar({ nome: "Helena Dias", email: "helena@dias.adv.br", senha: "senha-da-helena-123", escritorio: "Dias Advocacia" }, "203.0.113.30");
    const cookie = cookieDe(r);
    const orgId = (await json(r)).escritorio.id as string;
    const eu = await json(comSessao(cookie, "/eu"));
    expect((await comSessao(cookie, `/equipe/${eu.usuario.id}`, { method: "PUT", body: JSON.stringify({ whatsapp: "(47) 99123-4567" }) })).status).toBe(200);
    const antes = enviados.length;
    for (let i = 0; i < 10; i++) expect((await comSessao(cookie, "/avisos/teste", { method: "POST" })).status).toBe(200);
    const barrado = await comSessao(cookie, "/avisos/teste", { method: "POST" });
    expect(barrado.status).toBe(429);
    expect((await json(barrado)).erro).toBe("teto_em_avaliacao");
    expect(enviados.length - antes).toBe(10);

    await t.owner`update organization set em_avaliacao = false where id = ${orgId}`;
    expect((await comSessao(cookie, "/avisos/teste", { method: "POST" })).status).toBe(200);
  });

  test("em avaliação, os convites por e-mail param no teto do dia", async () => {
    const r = await cadastrar({ nome: "Igor Lima", email: "igor@lima.adv.br", senha: "senha-do-igor-1234", escritorio: "Lima Advocacia" }, "203.0.113.31");
    const cookie = cookieDe(r);
    const convidar = (i: number) => app.request("/api/auth/organization/invite-member", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: JSON.stringify({ email: `pessoa${i}@exemplo.adv.br`, role: "member" }) });
    const antes = convites.length;
    for (let i = 0; i < 5; i++) expect((await convidar(i)).status).toBe(200);
    expect((await convidar(5)).status).toBe(429);
    expect(convites.length - antes).toBe(5);
  });

  test("limite por endereço: o 11º pedido na hora recebe 429", async () => {
    for (let i = 0; i < 10; i++) expect((await cadastrar({}, "203.0.113.99")).status).toBe(400);
    const r = await cadastrar({ nome: "Elisa Ramos", email: "elisa@ramos.adv.br", senha: "senha-da-elisa-000", escritorio: "Ramos Advocacia" }, "203.0.113.99");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("3600");
  });
});
