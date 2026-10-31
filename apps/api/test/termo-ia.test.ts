/**
 * Termo de uso de IA do cliente (Recomendação CFOAB 001/2024, itens 4.1.1,
 * 4.2.1 e 4.3.1): o DOCX sai no timbre com os cinco pontos, o assinado fica na
 * pasta do cliente, e a conferência da pasta cobra enquanto falta. E o modelo
 * de política interna de IA do escritório (item 3.6), também no timbre.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria, lerDocumento, MIME_DOCX } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

describe.skipIf(!hasTestDatabase)("termo de uso de IA do cliente", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let clienteId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const termoNaConferencia = (ficha: { conferencia: { conteudo: { itens: { item: string }[] } } }) => ficha.conferencia.conteudo.itens.find((i) => i.item === "termo_ia");
  const conferir = async () => {
    ia.respostas["conferir-pasta"] = { itens: [{ item: "procuracao", situacao: "certo", detalhe: "Procuração com poderes gerais.", documento: "procuracao.txt" }], outros: [], resumo: "A pasta está quase pronta.", recusa: null };
    const r = await call(`/clientes/${clienteId}/conferir`, { method: "POST" });
    expect(r.status).toBe(200);
    return ((await r.json()) as { conteudo: { itens: { item: string; situacao: string; detalhe: string; documento: string | null }[] } }).conteudo.itens;
  };

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
    clienteId = (await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte" } }))).id;
    const form = new FormData();
    form.set("arquivo", new File(["Procuração. Outorgante: Marina Duarte. Poderes da cláusula ad judicia."], "procuracao.txt", { type: "text/plain" }));
    form.set("clienteId", clienteId);
    await call("/documentos", { method: "POST", body: form });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("o termo sai em DOCX no timbre, com os cinco pontos da recomendação, o cliente e o advogado", async () => {
    const r = await call(`/clientes/${clienteId}/termo-ia`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe(MIME_DOCX);
    const { texto } = await lerDocumento(new Uint8Array(await r.arrayBuffer()), MIME_DOCX);
    // Os títulos de seção saem em caixa alta, como nas peças.
    for (const ponto of ["1. PARA QUE USAMOS A IA", "2. BENEFÍCIOS E LIMITES", "3. RISCOS", "4. MEDIDAS DE SEGURANÇA", "5. REVISÃO HUMANA", "6. SUA ESCOLHA"]) expect(texto).toContain(ponto);
    expect(texto).toContain("Marina Duarte");
    expect(texto).toContain("Souza & Mendes Advocacia");
    expect(texto).toContain("Beatriz Souza, OAB/SC 41.233");
    // A retenção dita ao cliente é a que vale em todas as rotas: a da Anthropic guarda até 30 dias.
    expect(texto).toContain("nenhum guarda o pedido por mais de 30 dias. A lista dos fornecedores está em https://decreta.local/seguranca.");
    expect(texto).not.toContain("retenção zero");
  });

  test("a política interna de IA do escritório sai em DOCX no timbre, com quem responde e o que falta decidir", async () => {
    const r = await call("/escritorio/politica-ia");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe(MIME_DOCX);
    expect(decodeURIComponent(r.headers.get("content-disposition") ?? "")).toContain("Política interna de uso de inteligência artificial");
    const { texto } = await lerDocumento(new Uint8Array(await r.arrayBuffer()), MIME_DOCX);
    for (const secao of ["1. OBJETIVO E ALCANCE", "2. FERRAMENTAS AUTORIZADAS", "4. REVISÃO HUMANA", "5. SIGILO E PROTEÇÃO DE DADOS", "9. TREINAMENTO E REVISÃO"]) expect(texto).toContain(secao);
    expect(texto).toContain("Recomendação nº 001/2024");
    expect(texto).toContain("Souza & Mendes Advocacia");
    expect(texto).toContain("Beatriz Souza, OAB/SC 41.233");
    expect(texto).toContain("[COMPLETAR: responsável]");
    expect(texto).toContain("https://decreta.local/seguranca");
    expect(texto).not.toContain("retenção zero");
  });

  test("sem o termo assinado, a ficha diz que falta e a conferência da pasta cobra", async () => {
    expect((await json(call(`/clientes/${clienteId}`))).termoIa).toBeNull();
    const termo = (await conferir()).find((i) => i.item === "termo_ia");
    expect(termo).toMatchObject({ situacao: "falta", documento: null });
    expect(termo!.detalhe).toContain("Recomendação CFOAB 001/2024");
  });

  test("o termo assinado fica na pasta do cliente, aparece na ficha e conta na conferência", async () => {
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "termo-assinado.jpg", { type: "image/jpeg" }));
    form.set("clienteId", clienteId);
    form.set("termoIa", "1");
    const r = await call("/documentos", { method: "POST", body: form });
    expect(r.status).toBe(201);
    const ficha = await json(call(`/clientes/${clienteId}`));
    expect(ficha.termoIa.documento.nome).toBe("termo-assinado.jpg");
    expect(ficha.documentos.map((d: { id: string }) => d.id)).toContain(ficha.termoIa.documento.id);
    const auditoria = await t.owner<{ acao: string }[]>`select acao from auditoria where organization_id = ${orgId} and acao = 'cliente.termo_ia'`;
    expect(auditoria).toHaveLength(1);
    // A conferência que já existe mostra o termo na hora, pelo cadastro, sem outra chamada à IA.
    expect(termoNaConferencia(ficha)).toMatchObject({ situacao: "certo", documento: "termo-assinado.jpg" });
    expect((await conferir()).find((i) => i.item === "termo_ia")).toMatchObject({ situacao: "certo", documento: "termo-assinado.jpg" });
  });

  test("apagar o arquivo do termo volta a cobrar", async () => {
    const { termoIa } = await json(call(`/clientes/${clienteId}`));
    expect((await call(`/documentos/${termoIa.documento.id}`, { method: "DELETE" })).status).toBe(200);
    const ficha = await json(call(`/clientes/${clienteId}`));
    expect(ficha.termoIa).toBeNull();
    expect(termoNaConferencia(ficha)).toMatchObject({ situacao: "falta", documento: null });
  });
});
