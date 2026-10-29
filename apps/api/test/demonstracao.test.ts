/** A demonstração sobe inteira e as telas mostram o que o design mostra. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { apagarDemonstracao, criarDemonstracao, documentoValido } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { cnpjValido, cpfValido } from "@decreta/core";

describe.skipIf(!hasTestDatabase)("escritório de demonstração", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  const arquivos = armazenamentoEmMemoria();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const call = async (path: string) => {
    const r = await app.request(`/api/app${path}`, { headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(r.status).toBe(200);
    return (await r.json()) as any;
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    // O "hoje" do design: quinta, 29/10/2026.
    const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@demo.decreta.app", password: "demonstracao-123" }) });
    expect(r.status).toBe(200);
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("documentos inventados têm verificadores válidos", () => {
    expect(cpfValido(documentoValido("318204567"))).toBe(true);
    expect(cnpjValido(documentoValido("418273650001"))).toBe(true);
  });

  test("Hoje com vencido, de hoje, audiências e publicações", async () => {
    const h = await call("/hoje");
    expect(h.contadores).toMatchObject({ vencidos: 1, vencemHoje: 3, publicacoesNovas: 7, audienciasHoje: 2 });
    expect(h.itens[0]).toMatchObject({ titulo: "Contestação trabalhista", urgencia: "vencido" });
    expect(h.itens.map((i: { titulo: string }) => i.titulo)).toContain("Cobrar documentos do cliente novo");
  });

  test("a sugestão da Marina vence em 23/11, a confirmar", async () => {
    const p = await call("/prazos?quando=abertos");
    const marina = p.itens.find((i: { tipo: string }) => i.tipo === "Manifestação sobre laudo pericial");
    expect(marina).toMatchObject({ fim: "2026-11-23", situacao: "a_confirmar", origem: "DJEN · 28/10" });
    expect(p.itens.find((i: { tipo: string }) => i.tipo === "Alegações finais").situacao).toBe("peca_em_revisao");
    const prazo = await call(`/prazos/${marina.id}`);
    expect(prazo.briefing).toMatchObject({ situacao: "pronto", desatualizada: false });
    expect(prazo.desconsiderados.map((d: { dia: string }) => d.dia)).toEqual(["2026-11-02", "2026-11-20"]);
  });

  test("caixa de publicações e resumo dos autos desatualizado pela petição da ré", async () => {
    const pubs = await call("/publicacoes");
    expect(pubs.contagens).toMatchObject({ nova: 7, pendente: 3 });
    const marina = pubs.itens.find((i: { partes: string }) => i.partes.startsWith("Marina"));
    expect(marina).toMatchObject({ titulo: "Intimação · laudo pericial", selo: { tipo: "prazo", texto: "Prazo sugerido · 23/11" } });
    const processo = await call(`/processos/${marina.processoId}`);
    expect(processo.cnj).toBe("5004321-25.2026.8.24.0038");
    expect(processo.resumo).toMatchObject({ situacao: "pronto", desatualizada: true });
    expect(processo.novidades).toEqual(["petição da ré, evento 89"]);
    const docs = await call(`/documentos?processo=${marina.processoId}`);
    expect(docs.itens.length).toBeGreaterThanOrEqual(8);
  });

  test("recriar apaga só a demonstração", async () => {
    expect(await apagarDemonstracao(t.db)).toBe(true);
    expect((await t.owner`select count(*)::int as n from processos`)[0]!.n).toBe(0);
    expect((await t.owner`select count(*)::int as n from "user"`)[0]!.n).toBe(0);
  });
});
