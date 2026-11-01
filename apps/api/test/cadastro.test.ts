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

describe("slug do nome do escritório", () => {
  test("sem acento, em minúsculas e com hífen; vazio vira 'escritorio'", () => {
    expect(slugDoNome("Souza & Mendes Advocacia")).toBe("souza-mendes-advocacia");
    expect(slugDoNome("  Dra. Beatriz Souza — Advocacia  ")).toBe("dra-beatriz-souza-advocacia");
    expect(slugDoNome("@@@")).toBe("escritorio");
    expect(slugDoNome("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe.skipIf(!hasTestDatabase)("cadastro aberto", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
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
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
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

  test("limite por endereço: o 11º pedido na hora recebe 429", async () => {
    for (let i = 0; i < 10; i++) expect((await cadastrar({}, "203.0.113.99")).status).toBe(400);
    const r = await cadastrar({ nome: "Elisa Ramos", email: "elisa@ramos.adv.br", senha: "senha-da-elisa-000", escritorio: "Ramos Advocacia" }, "203.0.113.99");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("3600");
  });
});
