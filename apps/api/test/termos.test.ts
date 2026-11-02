/**
 * Aceite dos Termos de Uso e da Política de Privacidade: o cadastro e o
 * convite só criam a conta com o aceite, e ele fica gravado com a versão e a data.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { VERSAO_DOS_TERMOS } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";

describe.skipIf(!hasTestDatabase)("aceite dos termos", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const beatriz = { nome: "Beatriz Souza", email: "beatriz@souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia" };

  const cadastrar = (json: unknown, ip: string) =>
    app.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify(json) });
  const contas = async (email: string) => (await t.owner<{ n: number }[]>`select count(*)::int as n from "user" where email = ${email}`)[0]!.n;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env, { mailer: { enabled: true, send: async () => {} } });
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("cadastro sem o aceite é recusado e não cria conta nem escritório", async () => {
    const r = await cadastrar(beatriz, "203.0.113.1");
    expect(r.status).toBe(400);
    expect(((await r.json()) as { detalhe: string }).detalhe).toBe("Aceite os Termos de Uso e a Política de Privacidade para criar a conta.");
    expect(await contas(beatriz.email)).toBe(0);
    expect((await t.owner<{ n: number }[]>`select count(*)::int as n from organization`)[0]!.n).toBe(0);
  });

  test("aceite de uma versão que não é a atual também é recusado", async () => {
    for (const termos of ["2020-01-01", "", true, null]) expect((await cadastrar({ ...beatriz, termos }, "203.0.113.2")).status).toBe(400);
    expect(await contas(beatriz.email)).toBe(0);
  });

  test("com o aceite a conta nasce com a versão e a data gravadas, e o registro do escritório diz a versão", async () => {
    const antes = Date.now();
    const r = await cadastrar({ ...beatriz, termos: VERSAO_DOS_TERMOS }, "203.0.113.3");
    expect(r.status).toBe(201);
    const [u] = await t.owner<{ termos_versao: string; termos_aceitos_em: Date }[]>`select termos_versao, termos_aceitos_em from "user" where email = ${beatriz.email}`;
    expect(u!.termos_versao).toBe(VERSAO_DOS_TERMOS);
    expect(u!.termos_aceitos_em.getTime()).toBeGreaterThanOrEqual(antes - 1000);
    expect(u!.termos_aceitos_em.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
    const { escritorio } = (await r.json()) as { escritorio: { id: string } };
    const [criado] = await t.owner<{ detalhes: Record<string, unknown> }[]>`select detalhes from auditoria where organization_id = ${escritorio.id} and acao = 'escritorio.criado'`;
    expect(criado!.detalhes).toMatchObject({ termos: VERSAO_DOS_TERMOS });
  });

  describe("quem entra por convite", () => {
    let cookieSocia = "";
    const entrarComConvite = (email: string, extra: Record<string, unknown> = {}) =>
      app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
        body: JSON.stringify({ email, password: "senha-bem-longa-123", name: "Rafael Lima", ...extra }),
      });

    beforeAll(async () => {
      const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: beatriz.email, password: beatriz.senha }) });
      cookieSocia = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      const convite = await app.request("/api/auth/organization/invite-member", { method: "POST", headers: { "content-type": "application/json", cookie: cookieSocia, origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "rafael@souza.adv.br", role: "member" }) });
      expect(convite.status).toBe(200);
    });

    test("sem o aceite a conta não é criada, mesmo com convite", async () => {
      const r = await entrarComConvite("rafael@souza.adv.br");
      expect(r.status).toBe(400);
      expect(((await r.json()) as { code: string }).code).toBe("SEM_ACEITE");
      expect(await contas("rafael@souza.adv.br")).toBe(0);
      expect((await entrarComConvite("rafael@souza.adv.br", { termosVersao: "2020-01-01" })).status).toBe(400);
      expect(await contas("rafael@souza.adv.br")).toBe(0);
    });

    test("com o aceite a conta nasce com a versão e a data; a pessoa não escolhe a data", async () => {
      const r = await entrarComConvite("rafael@souza.adv.br", { termosVersao: VERSAO_DOS_TERMOS });
      expect(r.status).toBe(200);
      const [u] = await t.owner<{ termos_versao: string; termos_aceitos_em: Date | null }[]>`select termos_versao, termos_aceitos_em from "user" where email = 'rafael@souza.adv.br'`;
      expect(u!.termos_versao).toBe(VERSAO_DOS_TERMOS);
      expect(Math.abs(u!.termos_aceitos_em!.getTime() - Date.now())).toBeLessThan(10_000);
    });

    test("a data do aceite não vem do pedido: quem manda a data não cria a conta", async () => {
      await app.request("/api/auth/organization/invite-member", { method: "POST", headers: { "content-type": "application/json", cookie: cookieSocia, origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "tiago@souza.adv.br", role: "member" }) });
      const r = await entrarComConvite("tiago@souza.adv.br", { termosVersao: VERSAO_DOS_TERMOS, termosAceitosEm: "2001-01-01T00:00:00Z" });
      expect(r.status).toBe(400);
      expect(await contas("tiago@souza.adv.br")).toBe(0);
    });
  });
});
