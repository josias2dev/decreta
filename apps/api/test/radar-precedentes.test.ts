/**
 * Radar de precedentes × carteira (Fase 5.4): a sincronização do BNP anota o
 * que mudou (precedente novo ou situação nova), e o radar liga cada novidade
 * aos processos do escritório que ela pode afetar — mesmo alcance de tribunal
 * e o assunto do processo na questão julgada. O BNP aqui é de mentira.
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
import { cruzarRadar, sincronizarPrecedentesDoBnp } from "../src/servicos/radar.ts";

type Bruto = Record<string, unknown>;
const IRDR_37 = { id: "tjsc-irdr-37", nr: 37, orgao: "TJSC", tipo: "IRDR", situacao: "Admitido", tese: "-", questao: "<p>Definir a possibilidade de utilização da Central Nacional de Indisponibilidade de Bens (CNIB) como instrumento de busca de patrimônio.</p>", ultimaAtualizacao: "10/01/2025" };
const IRR_12 = { id: "tst-irr-12", nr: 12, orgao: "TST", tipo: "IRR", situacao: "Afetado", tese: "-", questao: "Saber se as horas extras habituais integram a base de cálculo do adicional noturno.", ultimaAtualizacao: "20/10/2026" };
const SUMULA_297 = { id: "stj-sum-297", nr: 297, orgao: "STJ", tipo: "SUM", situacao: "Vigente", tese: "<p>O Código de Defesa do Consumidor é aplicável às instituições financeiras.</p>", ultimaAtualizacao: "01/04/2025" };

/** O BNP de mentira: uma lista por órgão e espécie, contando os pedidos. */
function bnp(listas: Record<string, Bruto[]>) {
  const pedidos: string[] = [];
  const fetch = (async (url: string, init?: RequestInit) => {
    if (!String(url).includes("pangeabnp")) throw new Error(`pedido inesperado: ${url}`);
    const { filtro } = JSON.parse(String(init?.body)) as { filtro: { orgaos: string[]; tipos: string[]; pagina: number } };
    const especie = `${filtro.orgaos[0]}/${filtro.tipos[0]}`;
    pedidos.push(especie);
    const lista = filtro.pagina === 1 ? (listas[especie] ?? []) : [];
    return Response.json({ total: (listas[especie] ?? []).length, resultados: lista });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, pedidos };
}

describe.skipIf(!hasTestDatabase)("radar de precedentes", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  const processo: Record<string, string> = {};
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const sem = async () => {};

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  /** Um processo do escritório da sessão, com o tribunal, o assunto e a situação. */
  async function novoProcesso(nome: string, tribunal: string, assunto: string, situacao = "ativo") {
    const p = await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: nome, partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }] } }));
    await t.owner`update processos set tribunal = ${tribunal}, assunto = ${assunto}, situacao = ${situacao}, tipo = 'judicial' where id = ${p.id}`;
    return p.id as string;
  }

  async function entrar(email: string) {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    for (const [slug, nome, email] of [
      ["outro", "Escritório Vizinho", "carla@vizinho.adv.br"],
      ["souza", "Souza & Mendes Advocacia", "beatriz@souza.adv.br"],
    ] as const) {
      const { organizationId } = await criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: "Dona", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" } });
      cookie = await entrar(email);
      await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
      processo[`${slug}:cnib`] = await novoProcesso("Marina Duarte × Banco Alfa", "TJSC", "Indisponibilidade de bens");
    }
    // Daqui em diante, a sessão é do Souza & Mendes.
    processo.horas = await novoProcesso("João Pereira × Metalúrgica Beta", "TRT12", "Horas extras");
    processo.foraDoAlcance = await novoProcesso("Ana Lima × Comércio Gama", "TRT12", "Indisponibilidade de bens");
    processo.outroAssunto = await novoProcesso("Paulo Reis × Seguradora Delta", "TJSC", "Seguro");
    processo.arquivado = await novoProcesso("Rui Costa × Banco Ômega", "TJSC", "Indisponibilidade de bens", "arquivado");
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("a primeira carga de cada espécie é a base: guarda tudo e nada vira novidade", async () => {
    // A data de atualização do BNP não diz quando o precedente mudou: o BNP inteiro aparece como recente.
    const f = bnp({ "TJSC/IRDR": [IRDR_37], "STJ/SUM": [{ ...SUMULA_297, ultimaAtualizacao: "30/10/2026" }] });
    expect(await sincronizarPrecedentesDoBnp({ db: t.db, fetch: f.fetch, dormir: sem })).toEqual({ precedentes: 2, novidades: 0 });
    // Todas as espécies que o plano pede, de cada órgão.
    expect(f.pedidos.toSorted()).toEqual(
      ["STF/RG", "STF/SV", "STF/SUM", "STJ/SUM", "STJ/IAC", "STJ/SIRDR", "TST/IRR", "TST/IAC", "TJSC/IRDR", "TJSC/IAC", "TRT12/IRDR", "TRT12/IAC", "TRF04/IRDR", "TRF04/IAC"].toSorted(),
    );
    const guardados = await t.owner`select chave, situacao, questao, texto from acervo_documentos order by chave`;
    expect(guardados.map((d) => [d.chave, d.situacao])).toEqual([
      ["irdr:TJSC:37", "Admitido"],
      ["sumula:STJ:297", "Vigente"],
    ]);
    expect(guardados[0]!.questao).toBe("Definir a possibilidade de utilização da Central Nacional de Indisponibilidade de Bens (CNIB) como instrumento de busca de patrimônio.");
    expect(await t.owner`select * from acervo_novidades`).toEqual([]);
    expect(await cruzarRadar({ db: t.db }, new Date(0))).toEqual({ avisos: 0 });
  });

  test("precedente que aparece numa espécie já carregada é novidade, e o radar o liga ao processo do mesmo alcance cujo assunto está na questão julgada", async () => {
    const f = bnp({ "TJSC/IRDR": [IRDR_37], "TST/IRR": [IRR_12], "STJ/SUM": [SUMULA_297] });
    expect(await sincronizarPrecedentesDoBnp({ db: t.db, fetch: f.fetch, dormir: sem })).toEqual({ precedentes: 3, novidades: 1 });
    const novidades = await t.owner`select chave, situacao_antes, situacao from acervo_novidades`;
    expect(novidades.map((n) => [n.chave, n.situacao_antes, n.situacao])).toEqual([["irr:TST:12", null, "Afetado"]]);
    expect(await cruzarRadar({ db: t.db }, new Date(0))).toEqual({ avisos: 1 });
    const { itens } = await json(call(`/radar?processo=${processo.horas}`));
    expect(itens).toEqual([
      expect.objectContaining({
        chave: "irr:TST:12",
        rotulo: "IRR 12 do TST",
        situacao: "Afetado",
        texto: "Saber se as horas extras habituais integram a base de cálculo do adicional noturno.",
        url: "https://pangeabnp.pdpj.jus.br/pesquisa?orgao=tst&tipo=IRR&nr=12",
        motivo: 'Novo no Banco Nacional de Precedentes. O assunto do processo, "Horas extras", aparece na questão julgada.',
      }),
    ]);
  });

  test("a situação que muda vira novidade e alcança só o tribunal do precedente, ativo ou suspenso", async () => {
    const desde = new Date();
    const f = bnp({ "TJSC/IRDR": [{ ...IRDR_37, situacao: "Acórdão Publicado", tese: "<p>É possível usar a CNIB.</p>", ultimaAtualizacao: "28/10/2026" }], "TST/IRR": [IRR_12], "STJ/SUM": [SUMULA_297] });
    expect(await sincronizarPrecedentesDoBnp({ db: t.db, fetch: f.fetch, dormir: sem })).toEqual({ precedentes: 3, novidades: 1 });
    expect(await cruzarRadar({ db: t.db }, desde)).toEqual({ avisos: 2 });
    const { itens } = await json(call("/radar"));
    expect(itens.map((i: any) => [i.processo.id, i.chave, i.situacao]).toSorted()).toEqual(
      [
        [processo["souza:cnib"], "irdr:TJSC:37", "Acórdão Publicado"],
        [processo.horas, "irr:TST:12", "Afetado"],
      ].toSorted(),
    );
    const cnib = itens.find((i: any) => i.chave === "irdr:TJSC:37");
    expect(cnib).toMatchObject({
      rotulo: "IRDR 37 do TJSC",
      texto: "É possível usar a CNIB.",
      motivo: 'Passou de "Admitido" para "Acórdão Publicado" no Banco Nacional de Precedentes. O assunto do processo, "Indisponibilidade de bens", aparece na questão julgada.',
      processo: { id: processo["souza:cnib"], titulo: "Marina Duarte × Banco Alfa" },
    });
  });

  test("cada escritório vê só os avisos dos seus processos", async () => {
    const vizinho = await t.owner`select count(*)::int as n from radar_precedentes where processo_id = ${processo["outro:cnib"]!}`;
    expect(vizinho[0]!.n).toBe(1);
    const { itens } = await json(call(`/radar?processo=${processo["outro:cnib"]}`));
    expect(itens).toEqual([]);
  });

  test("o aviso descartado não volta quando o radar roda de novo", async () => {
    const { itens } = await json(call(`/radar?processo=${processo.horas}`));
    expect((await call(`/radar/${itens[0].id}/descartar`, { method: "POST" })).status).toBe(200);
    expect(await cruzarRadar({ db: t.db }, new Date(0))).toEqual({ avisos: 0 });
    expect((await json(call(`/radar?processo=${processo.horas}`))).itens).toEqual([]);
    const auditoria = await t.owner`select acao from auditoria where acao = 'radar.descartado'`;
    expect(auditoria).toHaveLength(1);
  });
});
