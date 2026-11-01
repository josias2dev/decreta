/**
 * Rascunho pronto quando chega a intimação (Fase 5.3): confirmado o prazo, a
 * peça sugerida já fica em rascunho, preparada em segundo plano. Nada é
 * enviado nem protocolado: é um rascunho para o advogado revisar.
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
import type { Pedido } from "../src/rotas/base.ts";
import { createRotas } from "../src/rotas/index.ts";
import { rascunhoDoPrazo } from "../src/servicos/rascunho.ts";
import { iaMedida } from "../src/servicos/uso-ia.ts";
import { iaFalsa } from "./ia-falsa.ts";

const GERADO = "# Excelentíssimo Senhor Juiz\n\n## Da manifestação\n\nA autora concorda com o laudo.";

describe.skipIf(!hasTestDatabase)("rascunho pronto quando o prazo é confirmado", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  let clienteId = "";
  const ia = iaFalsa();
  const pedidos: Pedido[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  /** Um prazo que a IA sugeriu e ninguém confirmou ainda. */
  const prazoSugerido = async (tipo: string) => {
    const [p] = await t.owner`insert into prazos (organization_id, processo_id, tipo, dias, publicado_em, inicio, fim, origem)
      values (${orgId}, ${processoId}, ${tipo}, 15, '2026-10-28', '2026-10-29', '2026-11-19', 'ia') returning id`;
    return p!.id as string;
  };
  const deps = () => ({ db: t.db, ia, log: () => {} });

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async (p) => void pedidos.push(p), log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    }));
    const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    clienteId = (await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte" } }))).id;
    processoId = (await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: "Marina Duarte × Seguradora Alfa", clienteId, partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }] } }))).id;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("confirmar o prazo pede o rascunho, e o rascunho fica pronto com a peça sugerida", async () => {
    const prazoId = await prazoSugerido("Manifestação sobre laudo pericial");
    expect((await call(`/prazos/${prazoId}/confirmar`, { method: "POST" })).status).toBe(200);
    expect(pedidos).toContainEqual({ nome: "prazo.confirmado", organizationId: orgId, prazoId });

    ia.respostas["gerar-documento"] = GERADO;
    const r = await rascunhoDoPrazo(deps(), orgId, prazoId);
    expect(r.situacao).toBe("pronto");
    const pecaId = r.situacao === "pronto" ? r.pecaId : "";
    const peca = await json(call(`/pecas/${pecaId}`));
    expect(peca).toMatchObject({ prazoId, tipo: "manifestacao-laudo", situacao: "rascunho", texto: GERADO, revisao: null });
    expect(JSON.stringify(ia.pedidos["gerar-documento"])).toContain("Manifestação sobre laudo pericial, vence em");

    const prazo = await json(call(`/prazos/${prazoId}`));
    expect(prazo.pecas).toEqual([expect.objectContaining({ id: pecaId, situacao: "rascunho", preparadaPelaIa: true })]);

    const [registro] = await t.owner<{ acao: string; detalhes: Record<string, unknown> }[]>`select acao, detalhes from auditoria where organization_id = ${orgId} and acao = 'peca.preparada'`;
    expect(registro?.detalhes).toEqual({ pecaId, prazoId, tipo: "manifestacao-laudo" });
  });

  test("o rascunho escrito sozinho também guarda de onde veio", async () => {
    const prazoId = await prazoSugerido("Réplica");
    await call(`/prazos/${prazoId}/confirmar`, { method: "POST" });
    ia.respostas["gerar-documento"] = GERADO;
    const r = await rascunhoDoPrazo({ ...deps(), ia: iaMedida({ db: t.db }, ia, { organizationId: orgId, userId: null, origem: "fundo" }) }, orgId, prazoId);
    if (r.situacao !== "pronto") throw new Error(r.situacao);
    const [p] = await t.owner<{ procedencia: { chamadas: unknown[] } }[]>`select procedencia from pecas where id = ${r.pecaId}`;
    expect(p!.procedencia.chamadas).toEqual([expect.objectContaining({ metodo: "gerar-documento", modelo: "modelo-de-teste" })]);
  });

  test("não refaz o rascunho de quem já tem peça, nem prepara antes de confirmar", async () => {
    const prazoId = await prazoSugerido("Contrarrazões ao recurso");
    expect(await rascunhoDoPrazo(deps(), orgId, prazoId)).toEqual({ situacao: "nao-confirmado" });
    await call(`/prazos/${prazoId}/confirmar`, { method: "POST" });
    expect((await rascunhoDoPrazo(deps(), orgId, prazoId)).situacao).toBe("pronto");
    const chamadas = ia.chamadas.length;
    expect(await rascunhoDoPrazo(deps(), orgId, prazoId)).toEqual({ situacao: "ja-tem-peca" });
    expect(ia.chamadas.length).toBe(chamadas);
  });

  test("no nível de sugestão, o rascunho não é escrito sozinho", async () => {
    const r = await call("/escritorio", { method: "PUT", json: { automacao: { "rascunho-da-peca": "sugestao" } } });
    expect(r.status).toBe(200);
    expect((await json(call("/escritorio"))).automacao).toMatchObject({ "rascunho-da-peca": "sugestao", "leitura-da-sentenca": "automatico", prazo: "confirmar" });
    const prazoId = await prazoSugerido("Alegações finais");
    await call(`/prazos/${prazoId}/confirmar`, { method: "POST" });
    const chamadas = ia.chamadas.length;
    expect(await rascunhoDoPrazo(deps(), orgId, prazoId)).toEqual({ situacao: "so-sugestao" });
    expect(ia.chamadas.length).toBe(chamadas);
    await call("/escritorio", { method: "PUT", json: { automacao: {} } });
  });

  test("prazo, mensagem ao cliente e valores não saem do exigir confirmação", async () => {
    expect((await call("/escritorio", { method: "PUT", json: { automacao: { prazo: "automatico" } } })).status).toBe(400);
  });

  test("o cliente que recusou a IA fica sem rascunho, e a IA nem é chamada", async () => {
    await t.owner`update clientes set sem_ia = true where id = ${clienteId}`;
    const prazoId = await prazoSugerido("Réplica à contestação");
    await call(`/prazos/${prazoId}/confirmar`, { method: "POST" });
    const chamadas = ia.chamadas.length;
    expect(await rascunhoDoPrazo(deps(), orgId, prazoId)).toEqual({ situacao: "cliente-sem-ia" });
    expect(ia.chamadas.length).toBe(chamadas);
    const [n] = await t.owner<{ n: number }[]>`select count(*)::int as n from pecas where prazo_id = ${prazoId}`;
    expect(n!.n).toBe(0);
    await t.owner`update clientes set sem_ia = false where id = ${clienteId}`;
  });
});
