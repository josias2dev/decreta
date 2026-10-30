/**
 * O que preenche os cadastros: a empresa pelo CNPJ (também o CNPJ com letras),
 * o endereço pelo CEP, o documento repetido, a OAB no Diário e a qualificação
 * das partes para a peça. As fontes são de mentira; empresas, endereços e
 * documentos são inventados.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { paraQualificar, qualificacaoDasPartes } from "../src/servicos/cadastros.ts";

const CNPJ = "74.061.928/0001-12";
const CNPJ_COM_LETRAS = "74.A1B.2C3/D001-44";
const CNPJ_BAIXADO = "85.172.639/0001-07";
const CNPJ_FORA = "96.283.741/0001-04";
const CPF = "427.315.698-91";

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const empresa = (cnpj: string, extra: Record<string, unknown> = {}) => ({
  cnpj,
  razao_social: "LOJAS PEDRA BRANCA LTDA",
  nome_fantasia: "PEDRA BRANCA",
  descricao_situacao_cadastral: "ATIVA",
  data_situacao_cadastral: "2012-05-04",
  data_inicio_atividade: "2012-05-04",
  cnae_fiscal_descricao: "Comércio varejista de móveis",
  natureza_juridica: "Sociedade Empresária Limitada",
  descricao_tipo_de_logradouro: "RUA",
  logradouro: "DAS ARAUCARIAS",
  numero: "455",
  bairro: "AMERICA",
  municipio: "JOINVILLE",
  uf: "SC",
  cep: "89204000",
  ddd_telefone_1: "4734330000",
  ...extra,
});

describe.skipIf(!hasTestDatabase)("preencher os cadastros", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const fora = new Set<string>();
  const fetchFalso = (async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    if (fora.has(url.host)) throw new TypeError("fetch failed");
    const cnpj = /\/api\/cnpj\/v1\/(\w+)$/.exec(url.pathname)?.[1];
    if (cnpj === "74061928000112") return resposta(empresa(cnpj));
    if (cnpj === "74A1B2C3D00144") return resposta(empresa(cnpj, { razao_social: "MALHARIA FIO AZUL LTDA" }));
    if (cnpj === "85172639000107") return resposta(empresa(cnpj, { razao_social: "AUTO PECAS ROTA 101 LTDA", descricao_situacao_cadastral: "BAIXADA", data_situacao_cadastral: "2025-06-30" }));
    if (cnpj === "96283741000104") return resposta({}, 502);
    if (url.host === "open.cnpja.com") return resposta({}, 503);
    if (url.host === "viacep.com.br") return url.pathname.includes("89204000") ? resposta({ cep: "89204-000", logradouro: "Rua das Araucárias", bairro: "América", localidade: "Joinville", uf: "SC" }) : resposta({ erro: true });
    if (url.pathname.startsWith("/api/cep/v1/")) return resposta({}, 404);
    if (url.host === "comunicaapi.pje.jus.br") {
      const oab = url.searchParams.get("numeroOab");
      if (oab !== "41233") return resposta({ count: 0, items: [] });
      return resposta({
        count: 1,
        items: [{ id: 9, data_disponibilizacao: "2026-10-28", siglaTribunal: "TJSC", texto: "Intime-se.", destinatarios: [], destinatarioadvogados: [{ advogado: { nome: "BEATRIZ SOUZA", numero_oab: "41233", uf_oab: "SC" } }] }],
      });
    }
    return resposta({}, 404);
  }) as unknown as typeof fetch;

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
    const captura = { db: t.db, datajudKey: "", fetch: fetchFalso, djen: { dormir: async () => {} } };
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes-cadastros", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41233", oabUf: "SC" } }));
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("CNPJ: a empresa da Receita, e depois o aviso de que já é cliente", async () => {
    expect((await call("/consultas/cnpj/74061928000113")).status).toBe(422);
    const c = await json(call(`/consultas/cnpj/${encodeURIComponent(CNPJ)}`));
    expect(c).toMatchObject({
      cnpj: CNPJ,
      fonte: "achou",
      cliente: null,
      exemplo: false,
      empresa: { razaoSocial: "Lojas Pedra Branca Ltda", nomeFantasia: "Pedra Branca", ativa: true, situacao: "Ativa", telefone: "(47) 3433-0000", enderecoEmTexto: "Rua das Araucarias, 455, America, Joinville/SC, CEP 89204-000" },
    });
    const { id } = await json(call("/clientes", { method: "POST", json: { nome: "Lojas Pedra Branca Ltda", tipo: "pj", documento: CNPJ } }));
    expect((await json(call(`/consultas/cnpj/74061928000112`))).cliente).toEqual({ id, nome: "Lojas Pedra Branca Ltda" });
    // Na edição do próprio cliente, ele não conta como repetido.
    expect((await json(call(`/consultas/cnpj/74061928000112?ignorar=${id}`))).cliente).toBeNull();
  });

  test("CNPJ com letras é aceito na consulta e no cadastro", async () => {
    const c = await json(call(`/consultas/cnpj/${encodeURIComponent(CNPJ_COM_LETRAS.toLowerCase())}`));
    expect(c).toMatchObject({ cnpj: CNPJ_COM_LETRAS, fonte: "achou", empresa: { cnpj: "74A1B2C3D00144", razaoSocial: "Malharia Fio Azul Ltda" } });
    const r = await call("/clientes", { method: "POST", json: { nome: "Malharia Fio Azul Ltda", tipo: "pj", documento: "74.a1b.2c3/d001-44" } });
    expect(r.status).toBe(201);
    const cl = await json(call(`/clientes/${(await json(r)).id}`));
    expect(cl.documento).toBe(CNPJ_COM_LETRAS);
    expect((await t.owner<{ documento: string }[]>`select documento from clientes where nome = 'Malharia Fio Azul Ltda'`)[0]!.documento).toBe("74A1B2C3D00144");
  });

  test("CNPJ baixado vem marcado; Receita fora do ar não trava o cadastro", async () => {
    expect(await json(call(`/consultas/cnpj/85172639000107`))).toMatchObject({ fonte: "achou", empresa: { ativa: false, situacao: "Baixada", situacaoDesde: "2025-06-30" } });
    expect(await json(call(`/consultas/cnpj/${encodeURIComponent(CNPJ_FORA)}`))).toMatchObject({ fonte: "falhou", empresa: null, cliente: null });
  });

  test("CPF repetido avisa na hora, e a edição não deixa repetir", async () => {
    expect((await call("/consultas/cpf/42731569890")).status).toBe(422);
    expect(await json(call(`/consultas/cpf/${encodeURIComponent(CPF)}`))).toEqual({ cpf: CPF, cliente: null });
    const { id } = await json(call("/clientes", { method: "POST", json: { nome: "Helena Brandt", tipo: "pf", documento: CPF } }));
    expect(await json(call("/consultas/cpf/42731569891"))).toEqual({ cpf: CPF, cliente: { id, nome: "Helena Brandt" } });
    const outro = await json(call("/clientes", { method: "POST", json: { nome: "Otto Brandt", tipo: "pf" } }));
    const r = await call(`/clientes/${outro.id}`, { method: "PUT", json: { documento: CPF } });
    expect(r.status).toBe(409);
    expect((await call(`/clientes/${id}`, { method: "PUT", json: { documento: CPF, telefone: "(47) 99123-0000" } })).status).toBe(200);
  });

  test("CEP: o endereço, o que não existe e a fonte fora do ar", async () => {
    expect((await call("/consultas/cep/8920400")).status).toBe(422);
    expect(await json(call("/consultas/cep/89204-000"))).toEqual({
      cep: "89204-000",
      fonte: "achou",
      endereco: { logradouro: "Rua das Araucárias", numero: null, complemento: null, bairro: "América", cidade: "Joinville", uf: "SC", cep: "89204-000" },
      exemplo: false,
    });
    expect(await json(call("/consultas/cep/89299998"))).toMatchObject({ fonte: "nao_achou", endereco: null });
    fora.add("viacep.com.br").add("brasilapi.com.br");
    expect(await json(call("/consultas/cep/89299997"))).toMatchObject({ fonte: "falhou", endereco: null });
    fora.clear();
  });

  test("OAB: o nome que o Diário mostra com o número", async () => {
    expect((await call("/consultas/oab?numero=41233&uf=XX")).status).toBe(422);
    expect(await json(call("/consultas/oab?numero=41.233&uf=sc"))).toEqual({ oab: "OAB/SC 41233", fonte: "achou", nomes: [{ nome: "Beatriz Souza", publicacoes: 1 }], dias: 60, exemplo: false });
    expect(await json(call("/consultas/oab?numero=41234&uf=SC"))).toMatchObject({ fonte: "nao_achou", nomes: [] });
    fora.add("comunicaapi.pje.jus.br");
    expect(await json(call("/consultas/oab?numero=41233&uf=SC"))).toMatchObject({ fonte: "falhou" });
    fora.clear();
  });

  test("a parte com CNPJ entra na qualificação da peça com a sede da Receita", async () => {
    const cliente = await json(call("/clientes", { method: "POST", json: { nome: "Helena Brandt Kühn", tipo: "pf", documento: "318.204.567-90", endereco: "Rua Ipê Amarelo, 80, Glória, Joinville/SC" } }));
    const p = await json(call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: "Helena × Lojas Pedra Branca", clienteId: cliente.id, partes: [{ nome: "Helena Brandt Kühn", polo: "ativo", cliente: true }] } }));
    expect((await call(`/processos/${p.id}/partes`, { method: "POST", json: { nome: "Lojas Pedra Branca", polo: "passivo", documento: "74.061.928/0001-13" } })).status).toBe(400);
    expect((await call(`/processos/${p.id}/partes`, { method: "POST", json: { nome: "Lojas Pedra Branca", polo: "passivo", documento: CNPJ } })).status).toBe(201);
    await call(`/processos/${p.id}/partes`, { method: "POST", json: { nome: "Auto Peças Rota 101", polo: "passivo", documento: CNPJ_BAIXADO } });
    const dados = await withTenant(t.db, orgId, (tx) => paraQualificar(tx, p.id));
    expect(dados.empresas).toEqual([
      { nome: "Lojas Pedra Branca", cnpj: "74061928000112" },
      { nome: "Auto Peças Rota 101", cnpj: "85172639000107" },
    ]);
    const q = await qualificacaoDasPartes({ fetch: fetchFalso }, dados, false);
    expect(q).toBe(
      [
        "- Helena Brandt Kühn (cliente): CPF 318.204.567-90; endereço: Rua Ipê Amarelo, 80, Glória, Joinville/SC.",
        "- Lojas Pedra Branca: Lojas Pedra Branca Ltda, sociedade empresária limitada, inscrita no CNPJ sob o nº 74.061.928/0001-12, com sede em Rua das Araucarias, 455, America, Joinville/SC, CEP 89204-000 (dados da Receita Federal).",
        "- Auto Peças Rota 101: Auto Pecas Rota 101 Ltda, sociedade empresária limitada, inscrita no CNPJ sob o nº 85.172.639/0001-07, com sede em Rua das Araucarias, 455, America, Joinville/SC, CEP 89204-000 (dados da Receita Federal). Atenção: na Receita a empresa está baixada desde 30/06/2025.",
      ].join("\n"),
    );
  });
});
