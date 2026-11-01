/**
 * Conector MCP somente leitura (Fase 5.10): um assistente de fora consulta o
 * escritório pelo protocolo MCP, com um token pessoal e as mesmas permissões
 * de quem o criou. Só as ferramentas de leitura do Perguntar.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { rotasDoMcp } from "../src/rotas/mcp.ts";
import { createRotas } from "../src/rotas/index.ts";

describe.skipIf(!hasTestDatabase)("conector MCP somente leitura", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let token = "";
  let tokenId = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  let n = 0;
  const mcp = (method: string, params: unknown = {}, chave = token) =>
    app.request("/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${chave}` },
      // Notificação vai sem id.
      body: JSON.stringify({ jsonrpc: "2.0", ...(method.startsWith("notifications/") ? {} : { id: ++n }), method, params }),
    });

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, mcp: rotasDoMcp({ db: t.db, log: () => {} }), log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    }));
    const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    const processo = async (nome: string, titulo: string, semIa = false) => {
      const cliente = await json(call("/clientes", { method: "POST", json: { nome } }));
      if (semIa) await t.owner`update clientes set sem_ia = true where id = ${cliente.id}`;
      await call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo, clienteId: cliente.id, partes: [{ nome, polo: "ativo", cliente: true }] } });
    };
    await processo("Marina Duarte", "Marina Duarte × Seguradora Alfa");
    await processo("Paula Ramos", "Paula Ramos × Banco Delta", true);
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("a pessoa cria o token, que aparece uma vez; a lista não mostra o segredo", async () => {
    const r = await call("/mcp/tokens", { method: "POST", json: { nome: "Claude no computador" } });
    expect(r.status).toBe(201);
    ({ id: tokenId, token } = (await r.json()) as { id: string; token: string });
    expect(token).toStartWith("dcmcp.");
    const lista = await json(call("/mcp/tokens"));
    expect(lista.itens).toEqual([{ id: tokenId, nome: "Claude no computador", criadoEm: expect.any(String), usadoEm: null }]);
    expect(JSON.stringify(lista)).not.toContain(token);
  });

  test("o assistente conhece o servidor e vê só as ferramentas de leitura", async () => {
    const ini = await json(mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "teste", version: "1" } }));
    expect(ini.result).toMatchObject({ protocolVersion: "2025-06-18", serverInfo: { name: "decreta" }, capabilities: { tools: {} } });
    expect((await mcp("notifications/initialized")).status).toBe(202);
    const { result } = await json(mcp("tools/list"));
    const nomes = result.tools.map((f: { name: string }) => f.name);
    expect(nomes).toContain("buscarProcessos");
    expect(nomes).toContain("lerProcesso");
    expect(nomes).not.toContain("proporTarefa");
    expect(result.tools.every((f: { annotations: { readOnlyHint: boolean }; inputSchema: { type: string } }) => f.annotations.readOnlyHint && f.inputSchema.type === "object")).toBe(true);
  });

  test("a consulta devolve os dados do escritório, sem o cliente que recusou a IA", async () => {
    const r = await json(mcp("tools/call", { name: "buscarProcessos", arguments: {} }));
    const texto = r.result.content[0].text as string;
    expect(r.result.isError).toBeFalsy();
    expect(texto).toContain("Marina Duarte × Seguradora Alfa");
    expect(texto).not.toContain("Paula Ramos");
    const [uso] = await t.owner<{ usado_em: Date | null }[]>`select usado_em from tokens_mcp where id = ${tokenId}`;
    expect(uso?.usado_em).not.toBeNull();
  });

  test("ferramenta que escreve ou que não existe não roda", async () => {
    const r = await json(mcp("tools/call", { name: "proporTarefa", arguments: { titulo: "x" } }));
    expect(r.error.code).toBe(-32602);
  });

  test("sem token, com token errado, revogado ou de quem saiu do escritório: 401", async () => {
    expect((await app.request("/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })).status).toBe(401);
    expect((await mcp("tools/list", {}, `dcmcp.${orgId}.${"x".repeat(43)}`)).status).toBe(401);

    const outro = await json(call("/mcp/tokens", { method: "POST", json: { nome: "Outro" } }));
    expect((await call(`/mcp/tokens/${outro.id}`, { method: "DELETE" })).status).toBe(200);
    expect((await mcp("tools/list", {}, outro.token)).status).toBe(401);

    await t.owner`delete from member where organization_id = ${orgId}`;
    expect((await mcp("tools/list")).status).toBe(401);
  });
});
