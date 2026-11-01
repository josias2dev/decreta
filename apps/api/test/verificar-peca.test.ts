/**
 * "Verificar peça": cada citação da minuta ganha um selo — verificada, com
 * ressalva ou não verificada — conferida no acervo (temas do STJ, BNP e
 * normas.leg.br), com as fontes de mentira. Fora do acervo é "não verificada",
 * nunca "inexistente".
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { sincronizarTemasDoStj, verificarCitacoes } from "../src/servicos/acervo.ts";

const CABECALHO =
  "sequencialPrecedente,tipoPrecedente,numeroPrecedente,dataPrimeiraAfetacao,dataJulgamento,dataPublicacaoAcordao,situacao,informacoesComplementares,questaoSubmetidaAJulgamento,teseFirmada,anotacoesNUGEPNAC,delimitacaoJulgado,entendimentoAnterior,referenciaLegislativa,referenciaSumular,sumulaOriginada,audienciaPublica,dataAudienciaPublica,orgaoJulgador,Assuntos,numeroRepercussaoGeralSTF,descricaoRepercussaoGeral";
const TEMAS = [
  CABECALHO,
  '1200,Tema,952,2016-04-20,2016-12-14,2016-12-19,Trânsito em Julgado,,Reajuste por faixa etária.,"O reajuste é válido desde que haja previsão contratual.",,,,,,,,,S2,,381,',
  "77,Tema,56,2008-09-01,,,Cancelado,,Questão cancelada.,,,,,,,,,,S2,,,",
].join("\r\n");

const URN_CPC = "urn:lex:br:federal:lei:2015-03-16;13105";
const dispositivo = (sufixo: string, versoes: [string, string, string][]) => ({
  legislationIdentifier: `${URN_CPC}!${sufixo}`,
  "@id": `https://normas.leg.br/?urn=${URN_CPC}!${sufixo}`,
  workExample: versoes.map(([legislationType, legislationDate, text]) => ({ legislationType, legislationDate, text })),
});
const CPC = {
  legislationIdentifier: URN_CPC,
  name: "Lei nº 13.105 de 16/03/2015",
  alternateName: ["LEI-13105-2015-03-16", "Código de Processo Civil (2015) (CPC)"],
  dateModified: "2025-03-13",
  hasPart: [
    dispositivo("art927_par5", [["Original_Version", "2015-03-16", "Os tribunais darão publicidade a seus precedentes."]]),
    dispositivo("art246_cpt_inc1", [
      ["Original_Version", "2015-03-16", "pelo correio;"],
      ["Repeal_Version", "2021-08-26", "(Revogado)"],
    ]),
  ],
};
const CDC = { legislationIdentifier: "urn:lex:br:federal:lei:1990-09-11;8078", name: "Lei nº 8.078 de 11/09/1990", alternateName: ["LEI-8078-1990-09-11", "Código de Defesa do Consumidor"] };

const SUMULAS: Record<string, object> = {
  "297": { id: "stj-sum-297", nr: 297, orgao: "STJ", situacao: "Vigente", tipo: "SUM", tese: "<p>O Código de Defesa do Consumidor é aplicável às instituições financeiras.</p>", ultimaAtualizacao: "01/04/2025" },
  "61": { alertaSituacao: "cancelado", id: "stj-sum-61", nr: 61, orgao: "STJ", situacao: "Cancelado", tipo: "SUM", tese: "<p>O seguro de vida cobre o suicídio não premeditado.</p>", ultimaAtualizacao: "01/04/2025" },
};

/** As três fontes de mentira, contando os pedidos de cada uma. */
function fontes() {
  const pedidos = { stj: 0, bnp: 0, normas: 0 };
  const fetch = (async (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("dadosabertos.web.stj.jus.br")) {
      pedidos.stj++;
      if (u.includes("package_show")) return Response.json({ success: true, result: { resources: [{ name: "Temas.csv", url: "https://dadosabertos.web.stj.jus.br/temas.csv", last_modified: "2026-10-25T11:06:22" }] } });
      return new Response(TEMAS);
    }
    if (u.includes("pangeabnp")) {
      pedidos.bnp++;
      const { filtro } = JSON.parse(String(init?.body)) as { filtro: { nr: string } };
      const s = SUMULAS[filtro.nr];
      return Response.json({ total: s ? 1 : 0, resultados: s ? [s] : [] });
    }
    if (u.includes("normas.leg.br")) {
      pedidos.normas++;
      return Response.json(u.includes("13105") ? CPC : u.includes("8078") ? CDC : { urn: "?" });
    }
    throw new Error(`pedido inesperado: ${u}`);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, pedidos };
}

const PECA = [
  "# Excelentíssimo Senhor Doutor Juiz",
  "Conforme o Tema 952 do STJ e a Súmula 297 do STJ, aplica-se o art. 927, § 5º, do CPC.",
  "O Tema 56 do STJ e a Súmula 61 do STJ não socorrem a ré, nem a Súmula 9999 do STJ.",
  "A citação pelo art. 246, I, do CPC não vale mais. O fornecedor responde pelo art. 14 do CDC, e o art. 9.999 do CPC nada diz.",
  "Ver o REsp 1.737.412/SE e a Súmula 331 do TST.",
].join("\n\n");

describe.skipIf(!hasTestDatabase)("verificar peça", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let processoId = "";
  let pecaId = "";
  const f = fontes();
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
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "", fetch: f.fetch }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const { organizationId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    });
    const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
    const cliente = await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte" } }));
    processoId = (await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: "Marina Duarte × Banco Alfa", clienteId: cliente.id, partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }] } }))).id;
    pecaId = (await json(call("/pecas/manual", { method: "POST", json: { processoId, tipo: "outro", texto: PECA } }))).id;
    // A carga semanal dos temas do STJ; o BNP e as leis vêm sob demanda.
    expect(await sincronizarTemasDoStj({ db: t.db, fetch: f.fetch })).toEqual({ temas: 2 });
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("cada citação com o selo, o motivo e o link da fonte oficial", async () => {
    const r = await call(`/pecas/${pecaId}/verificar`, { method: "POST" });
    expect(r.status).toBe(200);
    const { citacoes, resumo } = await json(r);
    expect(citacoes.map((c: any) => [c.trecho, c.selo, c.motivo])).toEqual([
      ["Tema 952 do STJ", "verificada", "STJ, Tema 952: Trânsito em Julgado."],
      ["Súmula 297 do STJ", "verificada", "STJ, Súmula 297: Vigente."],
      ["art. 927, § 5º, do CPC", "verificada", "Em vigor no texto compilado do Código de Processo Civil (2015) (CPC)."],
      ["Tema 56 do STJ", "com_ressalva", "STJ, Tema 56: Cancelado. Não use como precedente sem conferir."],
      ["Súmula 61 do STJ", "com_ressalva", "STJ, Súmula 61: Cancelado. Não use como precedente sem conferir."],
      ["Súmula 9999 do STJ", "nao_verificada", "Não está no Banco Nacional de Precedentes. Confira na fonte antes de usar."],
      ["art. 246, I, do CPC", "com_ressalva", "Revogado em 26/08/2021."],
      ["art. 14 do CDC", "com_ressalva", "A lei existe, mas a fonte não traz o texto de cada artigo. Confira o artigo no Diário Oficial."],
      ["art. 9.999 do CPC", "nao_verificada", "Este dispositivo não aparece no texto compilado do Código de Processo Civil (2015) (CPC). Confira na fonte antes de usar."],
      ["REsp 1.737.412/SE", "nao_verificada", "Acórdãos ainda não estão no acervo. Confira na fonte antes de usar."],
      ["Súmula 331 do TST", "nao_verificada", "As súmulas e OJs do TST ainda não estão no acervo. Confira na fonte antes de usar."],
    ]);
    expect(resumo).toEqual({ verificadas: 3, comRessalva: 4, naoVerificadas: 4 });
    const tema = citacoes.find((c: any) => c.chave === "tema:STJ:952");
    expect(tema.fonte).toMatchObject({ nome: "STJ, Portal de Dados Abertos", url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=952&cod_tema_final=952" });
    expect(tema.texto).toBe("O reajuste é válido desde que haja previsão contratual.");
    expect(citacoes.find((c: any) => c.chave === "sumula:STJ:297").fonte.url).toBe("https://pangeabnp.pdpj.jus.br/pesquisa?orgao=stj&tipo=SUM&nr=297");
    expect(citacoes.find((c: any) => c.chave === "dispositivo:CPC:art927_par5").fonte.url).toBe(`https://normas.leg.br/?urn=${URN_CPC}!art927_par5`);
  });

  test("a segunda verificação usa o acervo guardado: só volta à fonte o que não estava lá", async () => {
    const antes = { ...f.pedidos };
    await call(`/pecas/${pecaId}/verificar`, { method: "POST" });
    // Só a Súmula 9999, que o BNP não tem, é perguntada de novo; leis e súmulas achadas ficam no acervo.
    expect({ stj: f.pedidos.stj - antes.stj, bnp: f.pedidos.bnp - antes.bnp, normas: f.pedidos.normas - antes.normas }).toEqual({ stj: 0, bnp: 1, normas: 0 });
  });

  test("precedente guardado há mais de 15 dias volta ao BNP: a súmula pode ter sido cancelada", async () => {
    await t.owner`update acervo_documentos set capturado_em = now() - interval '16 days' where chave = 'sumula:STJ:297'`;
    SUMULAS["297"] = { ...SUMULAS["297"], situacao: "Cancelado", alertaSituacao: "cancelado" };
    const { citacoes } = await json(call(`/pecas/${pecaId}/verificar`, { method: "POST" }));
    expect(citacoes.find((c: any) => c.chave === "sumula:STJ:297")).toMatchObject({ selo: "com_ressalva", motivo: "STJ, Súmula 297: Cancelado. Não use como precedente sem conferir." });
    SUMULAS["297"] = { ...SUMULAS["297"], situacao: "Vigente", alertaSituacao: undefined };
    await t.owner`update acervo_documentos set capturado_em = now() - interval '16 days' where chave = 'sumula:STJ:297'`;
    await call(`/pecas/${pecaId}/verificar`, { method: "POST" });
  });

  test("a peça guarda a última verificação, que deixa de valer quando o texto muda", async () => {
    const peca = await json(call(`/pecas/${pecaId}`));
    expect(peca.verificacao).toMatchObject({ resumo: { verificadas: 3, comRessalva: 4, naoVerificadas: 4 }, atual: true });
    await call(`/pecas/${pecaId}`, { method: "PUT", json: { texto: `${PECA}\n\nPedido final.` } });
    expect((await json(call(`/pecas/${pecaId}`))).verificacao.atual).toBe(false);
  });

  test("a demonstração só confere no acervo guardado: nunca chama as fontes", async () => {
    const auth = createAuth(t.db, env);
    const { organizationId } = await criarEscritorio(t.db, auth, {
      nome: "Escritório de demonstração",
      slug: SLUG_DA_DEMONSTRACAO,
      dono: { email: "demo@decreta.local", nome: "Sócia da Demonstração", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "1.234", oabUf: "SC" },
    });
    const outras = fontes();
    const citacoes = await verificarCitacoes({ db: t.db, fetch: outras.fetch }, organizationId, "A Súmula 297 do STJ, a Súmula 500 do STJ e o art. 1º do CTN.");
    expect(outras.pedidos).toEqual({ stj: 0, bnp: 0, normas: 0 });
    expect(citacoes.map((c) => [c.trecho, c.selo])).toEqual([
      ["Súmula 297 do STJ", "verificada"],
      ["Súmula 500 do STJ", "nao_verificada"],
      ["art. 1º do CTN", "nao_verificada"],
    ]);
  });
});
