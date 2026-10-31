/**
 * Consulta pelo número para o Novo processo: DataJud (classe, vara, comarca),
 * DJEN (partes e advogados) e o cadastro (o cliente e o lado dele), com as
 * fontes de mentira. E as partes que chegam depois, pelo Diário.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dvCnj } from "@decreta/core";
import { withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { atualizarDoDataJud, conferirDataJudDoEscritorio, gravarComunicacoes, type DepsDaCaptura } from "../src/servicos/captura.ts";

const CNJ = "5004321-25.2026.8.24.0038";
/** Outro número válido do TJSC, para o processo que a captura completa. */
const OUTRO = `5007777-${dvCnj("5007777", "2026", "8", "24", "0038")}.2026.8.24.0038`;

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const DATAJUD = {
  hits: {
    hits: [
      {
        _source: {
          numeroProcesso: "50043212520268240038",
          classe: { codigo: 7, nome: "Procedimento Comum Cível" },
          sistema: { codigo: 4, nome: "Eproc" },
          grau: "G1",
          dataAjuizamento: "20260210093000",
          dataHoraUltimaAtualizacao: "2026-10-16T08:00:00.000Z",
          nivelSigilo: 0,
          orgaoJulgador: { codigo: 1234, nome: "2ª VARA CÍVEL DA COMARCA DE JOINVILLE", codigoMunicipioIBGE: 4209102 },
          assuntos: [{ codigo: 10437, nome: "Seguro" }],
          movimentos: [
            { codigo: 26, nome: "Distribuição", dataHora: "2026-02-10T09:30:00.000Z" },
            { codigo: 85, nome: "Petição", dataHora: "2026-10-20T14:00:00.000Z" },
          ],
        },
      },
    ],
  },
};

const DJEN = {
  count: 2,
  items: [
    {
      id: 1,
      data_disponibilizacao: "2026-10-28",
      siglaTribunal: "TJSC",
      nomeOrgao: "2ª Vara Cível da Comarca de Joinville",
      nomeClasse: "PROCEDIMENTO COMUM CÍVEL",
      numeroprocessocommascara: CNJ,
      texto: "Intime-se a autora.",
      destinatarios: [{ nome: "MARINA DUARTE", polo: "A" }],
      destinatarioadvogados: [{ advogado: { nome: "BEATRIZ SOUZA", numero_oab: "41233", uf_oab: "SC" } }],
    },
    {
      id: 2,
      data_disponibilizacao: "2026-10-21",
      siglaTribunal: "TJSC",
      nomeOrgao: "2ª Vara Cível da Comarca de Joinville",
      numeroprocessocommascara: CNJ,
      texto: "Intime-se a ré.",
      destinatarios: [{ nome: "SEGURADORA ALFA S.A.", polo: "P" }],
      destinatarioadvogados: [{ advogado: { nome: "OTÁVIO REIS", numero_oab: "30111", uf_oab: "SC" } }],
    },
  ],
};

describe.skipIf(!hasTestDatabase)("consulta pelo número", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let clienteId = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  /** Quem está fora do ar nesta rodada. */
  const fora = new Set<string>();
  const pedidos: string[] = [];
  const fetchFalso = (async (entrada: string | URL, init?: RequestInit) => {
    const url = new URL(String(entrada));
    pedidos.push(url.host);
    if (fora.has(url.host)) return resposta({}, 503);
    // O maior @timestamp do índice: até quando o DataJud tem dados do tribunal.
    if (url.host === "api-publica.datajud.cnj.jus.br" && String(init?.body).includes("@timestamp")) return resposta({ hits: { hits: [{ _source: { "@timestamp": "2026-10-16T21:20:30.894Z" } }] } });
    if (url.host === "api-publica.datajud.cnj.jus.br") return resposta(DATAJUD);
    if (url.host === "comunicaapi.pje.jus.br") return resposta(url.searchParams.get("numeroProcesso") === "50043212520268240038" ? DJEN : { count: 0, items: [] });
    if (url.host === "servicodados.ibge.gov.br") return resposta({ id: 4209102, nome: "Joinville" });
    return resposta({}, 404);
  }) as unknown as typeof fetch;
  let captura: DepsDaCaptura;

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
    // Sem pausa entre tentativas: um 503 do DJEN não segura o teste.
    captura = { db: t.db, datajudKey: "chave", fetch: fetchFalso, djen: { dormir: async () => {} } };
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" } }));
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    clienteId = (await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte", tipo: "pf" } }))).id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("número com o dígito errado é 422", async () => {
    expect((await call("/processos/consulta?cnj=5004321-26.2026.8.24.0038")).status).toBe(422);
  });

  test("traz vara, comarca e sistema do DataJud, partes do DJEN e o cliente do cadastro", async () => {
    const c = await json(call(`/processos/consulta?cnj=${encodeURIComponent(CNJ)}`));
    expect(c).toMatchObject({
      cnj: CNJ,
      tribunal: "TJSC",
      cadastrado: null,
      exemplo: false,
      fontes: { datajud: "achou", djen: "achou" },
      classe: "Procedimento Comum Cível",
      assunto: "Seguro",
      orgao: "2ª Vara Cível",
      comarca: "Joinville",
      sistema: "eproc",
      distribuidoEm: "2026-02-10",
      movimentacoes: 2,
      ultimaMovimentacao: { titulo: "Petição" },
      poloCliente: "ativo",
      cliente: { id: clienteId, nome: "Marina Duarte" },
    });
    expect(c.partes).toEqual([
      { nome: "Marina Duarte", polo: "ativo", advogados: "Beatriz Souza (OAB/SC 41233)", cliente: { id: clienteId, nome: "Marina Duarte" } },
      { nome: "Seguradora Alfa S.A.", polo: "passivo", advogados: "Otávio Reis (OAB/SC 30111)", cliente: null },
    ]);
  });

  test("DataJud fora do ar: o DJEN preenche o que dá, e a tela sabe o que faltou", async () => {
    fora.add("api-publica.datajud.cnj.jus.br");
    try {
      const c = await json(call(`/processos/consulta?cnj=${CNJ}`));
      expect(c).toMatchObject({ fontes: { datajud: "falhou", djen: "achou" }, classe: "Procedimento Comum Cível", orgao: "2ª Vara Cível", comarca: "Joinville", sistema: null, poloCliente: "ativo" });
      expect(c.partes).toHaveLength(2);
    } finally {
      fora.delete("api-publica.datajud.cnj.jus.br");
    }
  });

  test("processo sem publicação e DJEN fora do ar", async () => {
    fora.add("comunicaapi.pje.jus.br");
    try {
      const c = await json(call(`/processos/consulta?cnj=${CNJ}`));
      expect(c).toMatchObject({ fontes: { datajud: "achou", djen: "falhou" }, partes: [], poloCliente: null, cliente: null, comarca: "Joinville" });
    } finally {
      fora.delete("comunicaapi.pje.jus.br");
    }
  });

  test("já cadastrado aparece na consulta", async () => {
    const r = await call("/processos", { method: "POST", json: { cnj: CNJ, clienteId, poloCliente: "ativo", partes: [{ nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true }] } });
    expect(r.status).toBe(201);
    const { id } = await json(r);
    const c = await json(call(`/processos/consulta?cnj=${CNJ}`));
    expect(c.cadastrado).toEqual({ id, titulo: "Marina Duarte" });
  });

  test("Trazer partes do Diário: acrescenta quem falta e os advogados de quem está sem", async () => {
    const { id } = (await t.owner<{ id: string }[]>`select id from processos where cnj = ${CNJ}`)[0]!;
    const r = await json(call(`/processos/${id}/partes/djen`, { method: "POST" }));
    expect(r).toEqual({ novas: 1, atualizadas: 1, encontradas: 2 });
    const ficha = await json(call(`/processos/${id}`));
    expect(ficha.partes).toMatchObject([
      { nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true, advogados: "Beatriz Souza (OAB/SC 41233)" },
      { nome: "Seguradora Alfa S.A.", polo: "passivo", papel: "Réu", cliente: false, advogados: "Otávio Reis (OAB/SC 30111)" },
    ]);
    // De novo não duplica.
    expect(await json(call(`/processos/${id}/partes/djen`, { method: "POST" }))).toEqual({ novas: 0, atualizadas: 0, encontradas: 2 });
  });

  test("a rotina do DataJud completa a comarca e o sistema", async () => {
    const { id } = (await t.owner<{ id: string }[]>`select id from processos where cnj = ${CNJ}`)[0]!;
    await t.owner`update processos set comarca = null, sistema = null where id = ${id}`;
    await atualizarDoDataJud(captura, orgId, id);
    const ficha = await json(call(`/processos/${id}`));
    expect(ficha).toMatchObject({ comarca: "Joinville", sistema: "eproc", classe: "Procedimento Comum Cível" });
    await t.owner`update processos set orgao = null where id = ${id}`;
    await atualizarDoDataJud(captura, orgId, id);
    expect(await json(call(`/processos/${id}`))).toMatchObject({ orgao: "2ª Vara Cível", comarca: "Joinville" });
  });

  test("a ficha diz quando o tribunal mandou o processo ao DataJud (a fonte vai na tela)", async () => {
    const { id } = (await t.owner<{ id: string }[]>`select id from processos where cnj = ${CNJ}`)[0]!;
    await atualizarDoDataJud(captura, orgId, id);
    const ficha = await json(call(`/processos/${id}`));
    expect(ficha.datajudAtualizadoEm).toBe("2026-10-16T08:00:00.000Z");
    expect(ficha.datajudEm).not.toBeNull();
  });

  test("até quando o DataJud tem dados do tribunal: conferido pela rotina, vai na ficha", async () => {
    const { id } = (await t.owner<{ id: string }[]>`select id from processos where cnj = ${CNJ}`)[0]!;
    expect((await json(call(`/processos/${id}`))).datajudAte).toBeNull();
    expect(await conferirDataJudDoEscritorio(captura, orgId)).toEqual({ TJSC: "2026-10-16T21:20:30.894Z" });
    expect((await json(call(`/processos/${id}`))).datajudAte).toBe("2026-10-16T21:20:30.894Z");
    // DataJud fora do ar: a última conferência continua valendo.
    fora.add("api-publica.datajud.cnj.jus.br");
    expect(await conferirDataJudDoEscritorio(captura, orgId)).toEqual({ TJSC: "2026-10-16T21:20:30.894Z" });
    fora.delete("api-publica.datajud.cnj.jus.br");
  });

  test("publicação nova de um processo sem a outra parte traz as partes para a ficha", async () => {
    const r = await call("/processos", { method: "POST", json: { cnj: OUTRO, poloCliente: "passivo" } });
    expect(r.status).toBe(201);
    const { id } = await json(r);
    await withTenant(t.db, orgId, (tx) =>
      gravarComunicacoes(tx, orgId, "41233/SC", [
        {
          idExterno: "djen-outro-1",
          disponibilizadaEm: "2026-10-28",
          tribunal: "TJSC",
          orgao: null,
          tipoComunicacao: "Intimação",
          tipoDocumento: null,
          classe: null,
          cnj: OUTRO,
          texto: "Cite-se.",
          link: null,
          destinatarios: [
            { nome: "Lojas Pedra Branca Ltda.", polo: "ativo" },
            { nome: "Padaria Bom Grão Ltda.", polo: "passivo" },
          ],
          advogados: [],
        },
      ]),
    );
    const ficha = await json(call(`/processos/${id}`));
    expect(ficha.partes.map((p: { nome: string; papel: string }) => `${p.nome} · ${p.papel}`)).toEqual(["Lojas Pedra Branca Ltda. · Autor", "Padaria Bom Grão Ltda. · Réu"]);
  });
});
