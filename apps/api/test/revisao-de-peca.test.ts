/**
 * Registro de revisão da peça (Recomendação CFOAB 001/2024, item 3.7): cada
 * "marcar como revisada" guarda a versão que a IA gerou, a versão final, quem
 * revisou e quando, e o registro fica mesmo quando o texto muda depois.
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
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

const GERADO = "# Manifestação\n\nPrimeiro parágrafo da IA.\n\nSegundo parágrafo da IA.\n\nTerceiro parágrafo da IA.";
const REVISTO = "# Manifestação\n\nPrimeiro parágrafo da IA.\n\nSegundo parágrafo, reescrito pela advogada.";

describe.skipIf(!hasTestDatabase)("registro de revisão da peça", () => {
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
  const revisar = (pecaId: string) => call(`/pecas/${pecaId}`, { method: "PUT", json: { situacao: "revisada" } });

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

  test("a revisão guarda a versão da IA, a final, quem e quando, e fica depois que o texto muda", async () => {
    ia.respostas["gerar-documento"] = GERADO;
    const g = await call("/pecas", { method: "POST", json: { processoId, tipo: "manifestacao-laudo", instrucoes: "" } });
    expect(g.status).toBe(200);
    const pecaId = g.headers.get("x-peca-id")!;
    expect(await g.text()).toBe(GERADO);

    expect((await call(`/pecas/${pecaId}`, { method: "PUT", json: { texto: REVISTO } })).status).toBe(200);
    expect((await revisar(pecaId)).status).toBe(200);
    const revisada = await json(call(`/pecas/${pecaId}`));
    expect(revisada.revisoes).toHaveLength(1);
    const [r] = revisada.revisoes;
    expect(r).toMatchObject({ por: { nome: "Beatriz Souza", oab: "OAB/SC 41.233" }, geradaPorIa: true, paragrafos: 3, mudaram: 1 });
    expect(Date.now() - new Date(r.em).getTime()).toBeLessThan(60_000);
    expect(await json(call(`/pecas/${pecaId}/revisoes/${r.id}`))).toEqual({ id: r.id, textoGerado: GERADO, textoFinal: REVISTO });

    const auditoria = await t.owner<{ detalhes: Record<string, unknown> }[]>`select detalhes from auditoria where organization_id = ${orgId} and acao = 'peca.revisada'`;
    expect(auditoria.map((a) => a.detalhes)).toEqual([{ pecaId, revisaoId: r.id, geradaPorIa: true, paragrafos: 3, mudaram: 1 }]);

    // Mexeu depois de revisar: volta a rascunho, e a revisão anterior continua no registro.
    await call(`/pecas/${pecaId}`, { method: "PUT", json: { texto: `${REVISTO}\n\nPedido final.` } });
    const editada = await json(call(`/pecas/${pecaId}`));
    expect(editada).toMatchObject({ situacao: "rascunho", revisao: null });
    expect(editada.revisoes.map((x: { id: string }) => x.id)).toEqual([r.id]);

    await revisar(pecaId);
    const deNovo = await json(call(`/pecas/${pecaId}`));
    expect(deNovo.revisoes.map((x: { mudaram: number; paragrafos: number }) => [x.paragrafos, x.mudaram])).toEqual([
      [4, 2],
      [3, 1],
    ]);
  });

  test("a peça escrita à mão fica registrada como revisão sem IA", async () => {
    const m = await json(call("/pecas/manual", { method: "POST", json: { processoId, tipo: "manifestacao-laudo", texto: "# Manifestação\n\nTexto da advogada." } }));
    await revisar(m.id);
    const [r] = (await json(call(`/pecas/${m.id}`))).revisoes;
    expect(r).toMatchObject({ geradaPorIa: false, paragrafos: 2, mudaram: 2 });
    expect(await json(call(`/pecas/${m.id}/revisoes/${r.id}`))).toMatchObject({ textoGerado: null, textoFinal: "# Manifestação\n\nTexto da advogada." });
  });

  test("a revisão de uma peça não abre pelo id de outra", async () => {
    const m = await json(call("/pecas/manual", { method: "POST", json: { processoId, tipo: "manifestacao-laudo", texto: "Outra." } }));
    await revisar(m.id);
    const [r] = (await json(call(`/pecas/${m.id}`))).revisoes;
    const outra = await json(call("/pecas/manual", { method: "POST", json: { processoId, tipo: "manifestacao-laudo", texto: "Mais uma." } }));
    expect((await call(`/pecas/${outra.id}/revisoes/${r.id}`)).status).toBe(404);
  });
});
