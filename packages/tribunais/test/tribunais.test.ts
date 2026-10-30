import { describe, expect, test } from "bun:test";
import { buscarDjenDoProcesso, buscarNoDataJud, buscarNoDjen, comarcaDoOrgao, ErroDjen, instante, lerComunicacao, nomeDoMunicipio, nomeDoSistema, orgaoSemComarca, partesDoDjen, textoLimpo, type ComunicacaoDjen } from "../src/index.ts";
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
});
