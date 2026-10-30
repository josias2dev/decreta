import { describe, expect, test } from "bun:test";
import { enderecoEmTexto } from "@decreta/core";
import {
  buscarCep,
  buscarCnpj,
  buscarDjenDoProcesso,
  buscarNoDataJud,
  buscarNoDjen,
  comarcaDoOrgao,
  ErroDaReceita,
  ErroDjen,
  ErroDoCep,
  instante,
  lerComunicacao,
  nomeDoMunicipio,
  nomeDoSistema,
  nomesDaOab,
  orgaoSemComarca,
  partesDoDjen,
  textoLimpo,
  type ComunicacaoDjen,
} from "../src/index.ts";
import datajud from "./fixtures/datajud.json";
import djen from "./fixtures/djen.json";

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("DJEN", () => {
  test("lê a comunicação, com texto limpo, CNJ com máscara e advogados", async () => {
    const urls: string[] = [];
    const lidas = await buscarNoDjen(
      { oab: "45.678", uf: "sc", de: "2026-10-27", ate: "2026-10-28" },
      {
        fetch: (async (url: URL) => {
          urls.push(url.toString());
          return resposta(djen);
        }) as unknown as typeof fetch,
        dormir: async () => {},
      },
    );
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("numeroOab=45678");
    expect(urls[0]).toContain("ufOab=SC");
    expect(lidas).toHaveLength(2);
    const [a, b] = lidas;
    expect(a).toMatchObject({
      idExterno: "412345678",
      disponibilizadaEm: "2026-10-28",
      tribunal: "TJSC",
      tipoDocumento: "Despacho",
      cnj: "5004321-25.2026.8.24.0038",
      advogados: [{ nome: "Beatriz Souza", oab: "45678", uf: "SC" }],
      classe: "Procedimento Comum Cível",
      destinatarios: [
        { nome: "Marina Duarte", polo: "ativo" },
        { nome: "Seguradora Alfa S.A.", polo: "passivo" },
      ],
    });
    expect(a!.texto).toBe(
      "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias.\n\nApós, voltem conclusos para sentença.",
    );
    expect(b).toMatchObject({ idExterno: "412345999", disponibilizadaEm: "2026-10-27", cnj: null, texto: "" });
  });

  test("pagina até acabar e espera no 429", async () => {
    let chamadas = 0;
    const esperas: number[] = [];
    const item = (id: number) => ({ ...djen.items[0], id });
    const lidas = await buscarNoDjen(
      { oab: "1", uf: "SC", de: "2026-10-28", ate: "2026-10-28" },
      {
        porPagina: 2,
        fetch: (async (url: URL) => {
          chamadas++;
          if (chamadas === 2) return resposta({}, 429);
          const pagina = Number(url.searchParams.get("pagina"));
          return resposta({ count: 3, items: pagina === 1 ? [item(1), item(2)] : [item(3)] });
        }) as unknown as typeof fetch,
        dormir: async (ms) => void esperas.push(ms),
      },
    );
    expect(lidas.map((l) => l.idExterno)).toEqual(["1", "2", "3"]);
    expect(esperas).toContain(2000);
  });

  test("erro do servidor vira ErroDjen", async () => {
    const busca = buscarNoDjen({ oab: "1", uf: "SC", de: "2026-10-28", ate: "2026-10-28" }, { fetch: (async () => resposta({}, 403)) as unknown as typeof fetch, dormir: async () => {} });
    await expect(busca).rejects.toBeInstanceOf(ErroDjen);
  });

  test("texto com entidades e quebras", () => {
    expect(textoLimpo("Fulano&nbsp;de&nbsp;Tal<br>Rua &amp; Cia&#46;")).toBe("Fulano de Tal\nRua & Cia.");
    expect(lerComunicacao({ id: 1 })).toBeNull();
  });
});

describe("DataJud", () => {
  test("lê classe, órgão e movimentos em ordem, com chave estável", async () => {
    let pedido: { url: string; auth: string | null; body: unknown } | null = null;
    const p = await buscarNoDataJud("5004321-25.2026.8.24.0038", {
      apiKey: "chave-publica",
      fetch: (async (url: string, init: RequestInit) => {
        pedido = { url, auth: new Headers(init.headers).get("authorization"), body: JSON.parse(String(init.body)) };
        return resposta(datajud);
      }) as unknown as typeof fetch,
    });
    expect(pedido!).toMatchObject({
      url: "https://api-publica.datajud.cnj.jus.br/api_publica_tjsc/_search",
      auth: "APIKey chave-publica",
      body: { query: { match: { numeroProcesso: "50043212520268240038" } } },
    });
    expect(p).toMatchObject({ classe: "Procedimento Comum Cível", orgao: "2ª Vara Cível da Comarca de Joinville", assunto: "Seguro", distribuidoEm: "2026-02-10", sigilo: false, sistema: "eproc", municipioIbge: 4209102 });
    expect(p!.movimentos.map((m) => m.titulo)).toEqual(["Distribuição", "Juntada de laudo pericial", "Petição"]);
    expect(p!.movimentos[0]).toMatchObject({ codigo: 26, descricao: "Sorteio", chave: "datajud:26:2026-02-10T09:30:00.000Z" });
  });

  test("processo que o tribunal ainda não enviou", async () => {
    const p = await buscarNoDataJud("5004321-25.2026.8.24.0038", { apiKey: "k", fetch: (async () => resposta({ hits: { hits: [] } })) as unknown as typeof fetch });
    expect(p).toBeNull();
  });

  test("datas compactas do DataJud", () => {
    expect(instante("20260210093000")).toBe("2026-02-10T12:30:00.000Z");
    expect(instante("2026-10-21T10:00:00.000Z")).toBe("2026-10-21T10:00:00.000Z");
    expect(instante("lixo")).toBeNull();
  });
});

describe("sistema e comarca", () => {
  test("o nome do sistema como o tribunal escreve", () => {
    expect(nomeDoSistema("Pje")).toBe("PJe");
    expect(nomeDoSistema("Eproc")).toBe("eproc");
    expect(nomeDoSistema("SAJ")).toBe("e-SAJ");
    expect(nomeDoSistema("Outros")).toBeNull();
    expect(nomeDoSistema(undefined)).toBeNull();
  });

  test("a cidade escrita no nome do órgão, e só quando é cidade", () => {
    expect(comarcaDoOrgao("2ª Vara Cível da Comarca de Joinville")).toBe("Joinville");
    expect(comarcaDoOrgao("1ª VARA DO TRABALHO DE JARAGUÁ DO SUL")).toBe("Jaraguá do Sul");
    expect(comarcaDoOrgao("Foro Regional de Santo Amaro")).toBe("Santo Amaro");
    expect(comarcaDoOrgao("Subseção Judiciária de Itajaí")).toBe("Itajaí");
    expect(comarcaDoOrgao("Blumenau - 3ª Vara Cível")).toBe("Blumenau");
    expect(comarcaDoOrgao("Vara da Fazenda Pública")).toBeNull();
    expect(comarcaDoOrgao(null)).toBeNull();
  });

  test("o órgão sem a cidade, para ir ao lado da comarca", () => {
    expect(orgaoSemComarca("2ª Vara Cível da Comarca de Joinville")).toBe("2ª Vara Cível");
    expect(orgaoSemComarca("Blumenau - 3ª Vara Cível")).toBe("3ª Vara Cível");
    expect(orgaoSemComarca("1ª Vara do Trabalho de Jaraguá do Sul")).toBe("1ª Vara do Trabalho de Jaraguá do Sul");
    expect(orgaoSemComarca(null)).toBeNull();
  });

  test("cidade pelo código IBGE, uma consulta só por código", async () => {
    const urls: string[] = [];
    const f = (async (url: string) => {
      urls.push(url);
      return resposta({ id: 4208203, nome: "Itajaí" });
    }) as unknown as typeof fetch;
    expect(await nomeDoMunicipio(4208203, { fetch: f })).toBe("Itajaí");
    expect(await nomeDoMunicipio(4208203, { fetch: f })).toBe("Itajaí");
    expect(urls).toEqual(["https://servicodados.ibge.gov.br/api/v1/localidades/municipios/4208203"]);
    expect(await nomeDoMunicipio(1, { fetch: (async () => resposta({}, 500)) as unknown as typeof fetch })).toBeNull();
    expect(await nomeDoMunicipio(2, { fetch: (async () => Promise.reject(new Error("fora"))) as unknown as typeof fetch })).toBeNull();
  });
});

describe("partes pelo DJEN", () => {
  const comunicacao = (c: Partial<ComunicacaoDjen>): ComunicacaoDjen => ({
    idExterno: crypto.randomUUID(),
    disponibilizadaEm: "2026-10-28",
    tribunal: "TJSC",
    orgao: "2ª Vara Cível da Comarca de Joinville",
    tipoComunicacao: "Intimação",
    tipoDocumento: null,
    classe: "Procedimento Comum Cível",
    cnj: "5004321-25.2026.8.24.0038",
    texto: "",
    link: null,
    destinatarios: [],
    advogados: [],
    ...c,
  });

  test("busca pelo número, sem máscara", async () => {
    const urls: string[] = [];
    const lidas = await buscarDjenDoProcesso("5004321-25.2026.8.24.0038", {
      fetch: (async (url: URL) => {
        urls.push(url.toString());
        return resposta(djen);
      }) as unknown as typeof fetch,
      dormir: async () => {},
    });
    expect(urls[0]).toContain("numeroProcesso=50043212520268240038");
    expect(urls[0]).not.toContain("numeroOab");
    expect(lidas).toHaveLength(2);
  });

  test("junta as partes, dá a cada lado os advogados dele e acha o lado da equipe", () => {
    const r = partesDoDjen(
      [
        comunicacao({ destinatarios: [{ nome: "Marina Duarte", polo: "ativo" }], advogados: [{ nome: "Beatriz Souza", oab: "41233", uf: "SC" }] }),
        comunicacao({ destinatarios: [{ nome: "Seguradora Alfa S.A.", polo: "passivo" }], advogados: [{ nome: "Otávio Reis", oab: "30111", uf: "SC" }] }),
        // As duas partes juntas: os advogados não dizem de quem são.
        comunicacao({ disponibilizadaEm: "2026-10-29", orgao: "Gabinete", destinatarios: [{ nome: "MARINA DUARTE", polo: "ativo" }, { nome: "Seguradora Alfa S.A.", polo: "passivo" }], advogados: [{ nome: "Perito Qualquer" }] }),
      ],
      [{ numero: "41.233", uf: "sc" }],
    );
    expect(r.partes).toEqual([
      { nome: "Marina Duarte", polo: "ativo", advogados: [{ nome: "Beatriz Souza", oab: "41233", uf: "SC" }] },
      { nome: "Seguradora Alfa S.A.", polo: "passivo", advogados: [{ nome: "Otávio Reis", oab: "30111", uf: "SC" }] },
    ]);
    expect(r.poloDaEquipe).toBe("ativo");
    expect(r).toMatchObject({ orgao: "Gabinete", classe: "Procedimento Comum Cível", publicacoes: 3 });
  });

  test("sem a OAB da equipe, o lado fica em aberto", () => {
    const r = partesDoDjen([comunicacao({ destinatarios: [{ nome: "Padaria Bom Grão Ltda.", polo: "passivo" }], advogados: [{ nome: "Outra Pessoa", oab: "1", uf: "PR" }] })], [{ numero: "41233", uf: "SC" }]);
    expect(r.poloDaEquipe).toBeNull();
    expect(r.partes).toHaveLength(1);
    expect(partesDoDjen([]).partes).toEqual([]);
  });

  test("a OAB e os nomes que aparecem com ela", () => {
    const r = nomesDaOab(
      [
        comunicacao({ advogados: [{ nome: "Beatriz Souza", oab: "41233", uf: "SC" }, { nome: "Otávio Reis", oab: "30111", uf: "SC" }] }),
        comunicacao({ advogados: [{ nome: "BEATRIZ SOUZA", oab: "41233", uf: "SC" }] }),
        // Mesmo número em outro estado é outra pessoa.
        comunicacao({ advogados: [{ nome: "Carlos Prado", oab: "41233", uf: "PR" }] }),
      ],
      { numero: "41.233", uf: "sc" },
    );
    expect(r).toEqual([{ nome: "Beatriz Souza", publicacoes: 2 }]);
    expect(nomesDaOab([], { numero: "1", uf: "SC" })).toEqual([]);
  });
});

/** Responde pela URL; o que não estiver na lista cai como rede fora do ar. */
const rotas = (r: Record<string, () => Response>) =>
  (async (url: URL | string) => {
    const u = url.toString();
    const achou = Object.entries(r).find(([k]) => u.startsWith(k));
    if (!achou) throw new TypeError("fetch failed");
    return achou[1]();
  }) as unknown as typeof fetch;

describe("CNPJ", () => {
  // Empresa inventada; o CNPJ só tem os verificadores certos.
  const brasilApi = {
    cnpj: "11222333000181",
    razao_social: "PADARIA BOM GRAO LTDA",
    nome_fantasia: "BOM GRAO",
    descricao_situacao_cadastral: "ATIVA",
    data_situacao_cadastral: "2015-03-02",
    data_inicio_atividade: "2015-03-02",
    cnae_fiscal_descricao: "Fabricação de produtos de panificação",
    natureza_juridica: "Sociedade Empresária Limitada",
    descricao_tipo_de_logradouro: "RUA",
    logradouro: "DAS PALMEIRAS",
    numero: "120",
    complemento: "SALA 3",
    bairro: "CENTRO",
    municipio: "JOINVILLE",
    uf: "SC",
    cep: "89201100",
    ddd_telefone_1: "4734550000",
    email: "CONTATO@BOMGRAO.EXEMPLO",
    qsa: [{ nome_socio: "NAO LIDO" }],
  };

  test("pela BrasilAPI, com endereço e situação", async () => {
    const e = await buscarCnpj("11.222.333/0001-81", { fetch: rotas({ "https://brasilapi.com.br/api/cnpj/v1/11222333000181": () => resposta(brasilApi) }) });
    expect(e).toEqual({
      cnpj: "11222333000181",
      razaoSocial: "Padaria Bom Grao Ltda",
      nomeFantasia: "Bom Grao",
      situacao: "Ativa",
      ativa: true,
      situacaoDesde: "2015-03-02",
      abertura: "2015-03-02",
      atividade: "Fabricação de produtos de panificação",
      naturezaJuridica: "Sociedade Empresária Limitada",
      endereco: { logradouro: "Rua das Palmeiras", numero: "120", complemento: "Sala 3", bairro: "Centro", cidade: "Joinville", uf: "SC", cep: "89201-100" },
      telefone: "4734550000",
      email: "contato@bomgrao.exemplo",
      fonte: "BrasilAPI",
    });
    expect(enderecoEmTexto(e!.endereco!)).toBe("Rua das Palmeiras, 120, Sala 3, Centro, Joinville/SC, CEP 89201-100");
  });

  test("BrasilAPI fora: vale o CNPJá; baixada vem marcada", async () => {
    const e = await buscarCnpj("12.ABC.345/01DE-35", {
      fetch: rotas({
        "https://brasilapi.com.br": () => resposta({ message: "erro" }, 502),
        "https://open.cnpja.com/office/12ABC34501DE35": () =>
          resposta({
            taxId: "12ABC34501DE35",
            alias: null,
            founded: "2026-08-10",
            statusDate: "2026-09-30",
            status: { id: 8, text: "Baixada" },
            company: { name: "TRANSPORTES SERRA DOURADA LTDA", nature: { text: "Sociedade Empresária Limitada" } },
            address: { street: "Avenida Brasil", number: "900", details: null, district: "Centro", city: "Blumenau", state: "SC", zip: "89010000" },
            phones: [{ area: "47", number: "33220000" }],
            emails: [],
            mainActivity: { text: "Transporte rodoviário de carga" },
          }),
      }),
    });
    expect(e).toMatchObject({ cnpj: "12ABC34501DE35", razaoSocial: "Transportes Serra Dourada Ltda", situacao: "Baixada", ativa: false, situacaoDesde: "2026-09-30", telefone: "4733220000", email: null, fonte: "CNPJá" });
    expect(e!.endereco).toMatchObject({ cidade: "Blumenau", cep: "89010-000" });
  });

  test("as duas dizem que não existe: null; nenhuma responde: erro", async () => {
    const naoTem = rotas({ "https://brasilapi.com.br": () => resposta({ type: "not_found" }, 404), "https://open.cnpja.com": () => resposta({}, 404) });
    expect(await buscarCnpj("52.930.471/0001-00", { fetch: naoTem })).toBeNull();
    expect(buscarCnpj("63.718.294/0001-01", { fetch: rotas({}) })).rejects.toBeInstanceOf(ErroDaReceita);
  });

  test("guarda a resposta por um dia", async () => {
    let pedidos = 0;
    const contar = rotas({ "https://brasilapi.com.br": () => (pedidos++, resposta({ ...brasilApi, cnpj: "41827365000171" })) });
    await buscarCnpj("41827365000171", { fetch: contar, agora: () => 0 });
    await buscarCnpj("41827365000171", { fetch: contar, agora: () => 3_600_000 });
    expect(pedidos).toBe(1);
    await buscarCnpj("41827365000171", { fetch: contar, agora: () => 90_000_000 });
    expect(pedidos).toBe(2);
  });
});

describe("CEP", () => {
  test("pela ViaCEP, e pela BrasilAPI quando a ViaCEP cai", async () => {
    const via = rotas({ "https://viacep.com.br/ws/89201100/json/": () => resposta({ cep: "89201-100", logradouro: "Rua das Palmeiras", bairro: "Centro", localidade: "Joinville", uf: "SC" }) });
    expect(await buscarCep("89201-100", { fetch: via })).toEqual({ logradouro: "Rua das Palmeiras", numero: null, complemento: null, bairro: "Centro", cidade: "Joinville", uf: "SC", cep: "89201-100" });
    const brasil = rotas({ "https://brasilapi.com.br/api/cep/v1/89010000": () => resposta({ cep: "89010000", street: "Avenida Brasil", neighborhood: "Centro", city: "Blumenau", state: "SC" }) });
    expect(await buscarCep("89010000", { fetch: brasil })).toMatchObject({ logradouro: "Avenida Brasil", cidade: "Blumenau", cep: "89010-000" });
  });

  test("CEP que não existe é null; sem resposta é erro", async () => {
    const naoTem = rotas({ "https://viacep.com.br": () => resposta({ erro: "true" }), "https://brasilapi.com.br": () => resposta({}, 404) });
    expect(await buscarCep("99999-998", { fetch: naoTem })).toBeNull();
    expect(await buscarCep("123", { fetch: naoTem })).toBeNull();
    expect(buscarCep("89999-997", { fetch: rotas({}) })).rejects.toBeInstanceOf(ErroDoCep);
  });
});
