/** Jeito do escritório (Fase 5.7): os sócios descrevem como fazem cada peça, e a peça gerada segue. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

const JEITO = {
  geral: { estilo: "Frases curtas, sem latim.", teses: "", evitar: "" },
  contestacao: { estilo: "", teses: "Prescrição sempre em preliminar.", evitar: "Pedir perícia sem quesitos." },
};

describe.skipIf(!hasTestDatabase)("jeito do escritório", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    }));
    const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    const cliente = await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte" } }));
    processoId = (await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: "Marina Duarte × Seguradora Alfa", clienteId: cliente.id, partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }] } }))).id;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("o jeito fica guardado no escritório e a contestação gerada segue o geral e o dela", async () => {
    expect((await call("/escritorio", { method: "PUT", json: { jeito: JEITO } })).status).toBe(200);
    expect((await json(call("/escritorio"))).jeito).toEqual(JEITO);

    ia.respostas["gerar-documento"] = "# Contestação";
    await (await call("/pecas", { method: "POST", json: { processoId, tipo: "contestacao", instrucoes: "" } })).text();
    const pedido = JSON.stringify(ia.pedidos["gerar-documento"]);
    expect(pedido).toContain("Estilo: Frases curtas, sem latim.");
    expect(pedido).toContain("Teses que o escritório usa: Prescrição sempre em preliminar.");

    // A réplica só leva o geral.
    await (await call("/pecas", { method: "POST", json: { processoId, tipo: "replica", instrucoes: "" } })).text();
    const daReplica = JSON.stringify(ia.pedidos["gerar-documento"]);
    expect(daReplica).toContain("Estilo: Frases curtas, sem latim.");
    expect(daReplica).not.toContain("Prescrição sempre em preliminar.");
  });

  test("tipo de peça que não existe no catálogo não entra", async () => {
    const r = await call("/escritorio", { method: "PUT", json: { jeito: { inventada: { estilo: "x", teses: "", evitar: "" } } } });
    expect(r.status).toBe(400);
  });
});
