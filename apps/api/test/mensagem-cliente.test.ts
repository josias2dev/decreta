/**
 * Cliente no WhatsApp (Fase 3): a IA escreve, o advogado aprova e só então a
 * mensagem sai, com o nome do escritório e o rodapé contra o golpe. Banco de
 * verdade (RLS), IA de mentira e um wameow falso que guarda o que receberia.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { analises, clientes, prazos, processos, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { createRotas } from "../src/rotas/index.ts";
import type { Wameow } from "../src/servicos/avisos.ts";
import { iaFalsa } from "./ia-falsa.ts";

const BRIEFING = {
  decidiu: "O juízo abriu 15 dias úteis para as partes falarem sobre o laudo pericial do evento 87.",
  fazer: ["Protocolar a manifestação sobre o laudo"],
  aFavor: ["O laudo confirma a incapacidade parcial (evento 87)."],
  contra: ["A ré impugnou o valor da causa (evento 89)."],
  recusa: null,
};
const RASCUNHO = "Olá, Marina. O juiz pediu que as partes falem sobre o laudo do perito. Vamos preparar a resposta e combinamos os detalhes com você.";

/** Um wameow de mentira: guarda cada envio e pode falhar de propósito. */
function wameowFalso() {
  const enviados: { number: string; text: string }[] = [];
  const estado = { falhar: false };
  const w: Wameow = {
    url: "http://wameow.local",
    token: "token-de-teste",
    fetch: (async (_url: string, init: RequestInit) => {
      if (estado.falhar) return new Response("fora do ar", { status: 500 });
      enviados.push(JSON.parse(String(init.body)));
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  };
  return { w, enviados, estado };
}

describe.skipIf(!hasTestDatabase)("mensagem ao cliente no WhatsApp", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let auth: ReturnType<typeof createAuth>;
  const ia = iaFalsa();
  const zap = wameowFalso();
  const pedidos: Pedido[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const escritorio = { cookie: "", orgId: "", prazoId: "", clienteId: "", userId: "" };
  const demo = { cookie: "", orgId: "", prazoId: "", clienteId: "", userId: "" };

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, cookie = escritorio.cookie) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  async function entrar(alvo: typeof escritorio, email: string, slug: string, nome: string) {
    const { organizationId } = await criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "41.233", oabUf: "SC" } });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    alvo.cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: alvo.cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
    alvo.orgId = organizationId;
    alvo.userId = (await t.owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;
    // Uma cliente inventada, com processo, prazo e o briefing pronto.
    await withTenant(t.db, organizationId, async (tx) => {
      const [cl] = await tx.insert(clientes).values({ organizationId, nome: "Marina Duarte", telefone: "(47) 99123-4567" }).returning();
      const [p] = await tx.insert(processos).values({ organizationId, titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: "5001234-56.2026.8.24.0038", clienteId: cl!.id }).returning();
      const [pz] = await tx.insert(prazos).values({ organizationId, processoId: p!.id, tipo: "Manifestação sobre laudo pericial", dias: 15, publicadoEm: "2026-10-29", inicio: "2026-10-30", fim: "2026-11-23" }).returning();
      await tx.insert(analises).values({ organizationId, alvo: "prazo", alvoId: pz!.id, acao: "briefing-prazo", situacao: "pronto", conteudo: BRIEFING, base: "b" });
      alvo.clienteId = cl!.id;
      alvo.prazoId = pz!.id;
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    auth = createAuth(t.db, env);
    const rotas = createRotas({
      db: t.db,
      auth,
      ia,
      arquivos: armazenamentoEmMemoria(),
      mailer: createLogMailer(() => {}),
      telas: "https://decreta.local",
      captura: { db: t.db, datajudKey: "" },
      wameow: zap.w,
      maxArquivoBytes: 5e6,
      enfileirar: async (p) => void pedidos.push(p),
      log: () => {},
    });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    await entrar(escritorio, "beatriz@souza.adv.br", "souza-mendes", "Souza & Mendes Advocacia");
    await entrar(demo, "teste@decreta.site", SLUG_DA_DEMONSTRACAO, "Escritório de Demonstração");
  });

  afterAll(async () => {
    await t?.drop();
  });

  let mensagemId = "";

  test("a IA escreve o rascunho a partir do briefing e nada sai no WhatsApp", async () => {
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    const r = await call(`/prazos/${escritorio.prazoId}/mensagem-cliente`, { method: "POST" });
    expect(r.status).toBe(201);
    const m = await json(r);
    expect(m).toMatchObject({ situacao: "rascunho", tipo: "decisao", texto: RASCUNHO, para: "(47) 99123-4567" });
    expect(m.previa).toStartWith("*Souza & Mendes Advocacia*");
    mensagemId = m.id;
    expect(zap.enviados).toHaveLength(0);
  });

  test("editar o rascunho não envia", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: `${RASCUNHO} Qualquer dúvida, fale com a Beatriz.` } });
    expect(r.status).toBe(200);
    expect((await json(r)).texto).toEndWith("fale com a Beatriz.");
    expect(zap.enviados).toHaveLength(0);
  });

  test("sem o número oficial do escritório não envia (o rodapé contra o golpe precisa dele)", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(422);
    expect((await json(r)).erro).toBe("sem_numero_oficial");
    expect(zap.enviados).toHaveLength(0);
    expect((await call("/escritorio", { method: "PUT", json: { whatsappOficial: "(47) 3433-1000" } })).status).toBe(200);
    expect((await json(call("/escritorio"))).whatsappOficial).toBe("(47) 3433-1000");
  });

  test("quem não tem OAB cadastrada não aprova", async () => {
    await t.owner`update equipe set oab_numero = null where user_id = ${escritorio.userId}`;
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    await t.owner`update equipe set oab_numero = '41.233' where user_id = ${escritorio.userId}`;
    expect(r.status).toBe(403);
    expect((await json(r)).erro).toBe("sem_oab");
    expect(zap.enviados).toHaveLength(0);
  });

  test("o advogado aprova: sai uma vez, com o nome do escritório e o rodapé, e fica registrado quem e quando", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(200);
    const m = await json(r);
    expect(m).toMatchObject({ situacao: "enviada", aprovadaPor: { id: escritorio.userId } });
    expect(m.aprovadaEm).toBeTruthy();
    expect(zap.enviados).toHaveLength(1);
    const [enviado] = zap.enviados;
    expect(enviado!.number).toBe("5547991234567");
    expect(enviado!.text).toStartWith("*Souza & Mendes Advocacia*\n\nOlá, Marina.");
    expect(enviado!.text).toContain("fale com a Beatriz.");
    expect(enviado!.text).toContain("Este escritório nunca pede Pix para liberar valores.");
    expect(enviado!.text).toContain("(47) 3433-1000");

    const [linha] = await t.owner<{ aprovada_por: string; aprovada_em: Date; texto_ia: string; enviado: string }[]>`select aprovada_por, aprovada_em, texto_ia, enviado from mensagens_cliente where id = ${mensagemId}`;
    expect(linha).toMatchObject({ aprovada_por: escritorio.userId, texto_ia: RASCUNHO, enviado: enviado!.text });
    const registro = await t.owner<{ acao: string }[]>`select acao from auditoria where organization_id = ${escritorio.orgId} and acao = 'mensagem_cliente.enviada'`;
    expect(registro).toHaveLength(1);

    // Já saiu: não sai de novo nem muda.
    expect((await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} })).status).toBe(409);
    expect((await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: "Outro texto qualquer." } })).status).toBe(409);
    expect(zap.enviados).toHaveLength(1);
  });

  test("o WhatsApp fora do ar deixa a mensagem como falhou, para tentar de novo", async () => {
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    const m = await json(call(`/prazos/${escritorio.prazoId}/mensagem-cliente`, { method: "POST" }));
    zap.estado.falhar = true;
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} });
    zap.estado.falhar = false;
    expect(r.status).toBe(503);
    const lista = await json(call(`/mensagens-cliente?cliente=${escritorio.clienteId}`));
    expect(lista.itens.find((x: { id: string }) => x.id === m.id)).toMatchObject({ situacao: "falhou" });
    expect((await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} })).status).toBe(200);
  });

  test("o rascunho é do escritório: outro escritório não vê nem envia", async () => {
    expect((await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: "Texto de outro escritório." } }, demo.cookie)).status).toBe(404);
    expect((await json(call(`/mensagens-cliente?cliente=${escritorio.clienteId}`, {}, demo.cookie))).itens).toEqual([]);
  });

  test("a demonstração nunca manda WhatsApp", async () => {
    const antes = zap.enviados.length;
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    await call("/escritorio", { method: "PUT", json: { whatsappOficial: "(47) 3433-1000" } }, demo.cookie);
    const m = await json(call(`/prazos/${demo.prazoId}/mensagem-cliente`, { method: "POST" }, demo.cookie));
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} }, demo.cookie);
    expect(r.status).toBe(403);
    expect((await json(r)).erro).toBe("demonstracao");
    expect(zap.enviados).toHaveLength(antes);
  });
});
