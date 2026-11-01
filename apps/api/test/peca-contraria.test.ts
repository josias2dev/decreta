/** Leitura da peça contrária (Fase 5.5): os pontos a rebater ficam no prazo e entram na peça que responde. */
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

const CONTESTACAO = "[fl. 1]\nCONTESTAÇÃO. A Seguradora Alfa alega a prescrição ânua do art. 206, § 1º, II, do Código Civil.\n\n[fl. 2]\nNo mérito, diz que a invalidez é parcial. Pede a improcedência.";
const LEITURA = {
  peca: "Contestação da Seguradora Alfa (evento 52)",
  pedidos: "A improcedência do pedido.",
  pontos: [
    { tese: "Prescrição ânua.", rebater: "A ciência inequívoca da invalidez só veio com o laudo.", fonte: "(evento 52, fl. 1)" },
    { tese: "Invalidez parcial.", rebater: "Pedir a perícia judicial.", fonte: "(evento 52, fl. 2)" },
  ],
  recusa: null,
};

describe.skipIf(!hasTestDatabase)("leitura da peça contrária", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  let outroProcessoId = "";
  let prazoId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const documento = async (processo: string, nome: string, evento: number, texto: string) => {
    const [d] = await t.owner`insert into documentos (organization_id, processo_id, nome, mime, tamanho, chave, texto, evento)
      values (${orgId}, ${processo}, ${nome}, 'application/pdf', 1000, ${`teste/${nome}`}, ${texto}, ${evento}) returning id`;
    return d!.id as string;
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
    const cliente = await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte" } }));
    const novoProcesso = async (titulo: string) =>
      (await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo, clienteId: cliente.id, partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }] } }))).id as string;
    processoId = await novoProcesso("Marina Duarte × Seguradora Alfa");
    outroProcessoId = await novoProcesso("Marina Duarte × Banco Delta");
    prazoId = (await json(call("/prazos", { method: "POST", json: { processoId, tipo: "Réplica à contestação", dias: 15, contagem: "uteis", publicadoEm: "2026-10-28" } }))).id;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("a contestação vira pontos a rebater, guardados no prazo", async () => {
    const docId = await documento(processoId, "Contestação.pdf", 52, CONTESTACAO);
    ia.respostas["ler-peca-contraria"] = LEITURA;
    const r = await call(`/ia/peca-contraria/${prazoId}`, { method: "POST", json: { documentoId: docId } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ situacao: "pronto", conteudo: { pontos: LEITURA.pontos }, fonte: "Contestação.pdf · evento 52" });
    expect(JSON.stringify(ia.pedidos["ler-peca-contraria"])).toContain("[fl. 2]");

    const prazo = await json(call(`/prazos/${prazoId}`));
    expect(prazo.pecaContraria).toMatchObject({ situacao: "pronto", conteudo: { peca: LEITURA.peca } });
    // A leitura não toma o lugar do briefing.
    expect(prazo.briefing).toBeNull();
  });

  test("a peça que responde ao prazo leva os pontos a rebater", async () => {
    ia.respostas["gerar-documento"] = "# Réplica";
    const g = await call("/pecas", { method: "POST", json: { processoId, prazoId, tipo: "replica", instrucoes: "" } });
    await g.text();
    const pedido = JSON.stringify(ia.pedidos["gerar-documento"]);
    expect(pedido).toContain("Pontos da outra parte a rebater");
    expect(pedido).toContain("Como rebater: A ciência inequívoca da invalidez só veio com o laudo.");
  });

  test("documento de outro processo não serve", async () => {
    const docId = await documento(outroProcessoId, "Recurso.pdf", 12, CONTESTACAO);
    expect((await call(`/ia/peca-contraria/${prazoId}`, { method: "POST", json: { documentoId: docId } })).status).toBe(404);
  });
});
