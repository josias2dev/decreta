/**
 * Índices para os cálculos: o SGS do Banco Central e o SIDRA do IBGE. As
 * respostas são trechos das reais (IPCA de 2023), conferidas uma vez na fonte.
 */
import { describe, expect, test } from "bun:test";
import { buscarNoSgs, ErroSgs, ErroSidra, ipcaNoSidra, serieMensalDoSgs, SGS } from "../src/index.ts";

/** O SGS, série 433, de 01/01/2023 a 31/03/2023. */
const IPCA_TRIMESTRE = [
  { data: "01/01/2023", valor: "0.53" },
  { data: "01/02/2023", valor: "0.84" },
  { data: "01/03/2023", valor: "0.71" },
];

function fetchFalso(responder: (url: URL) => Response) {
  const urls: URL[] = [];
  const f = (async (entrada: string | URL) => {
    const url = new URL(String(entrada));
    urls.push(url);
    return responder(url);
  }) as unknown as typeof fetch;
  return { f, urls };
}

describe("SGS do Banco Central", () => {
  test("os códigos das séries, conferidos na fonte", () => {
    expect(SGS).toEqual({ ipca: 433, inpc: 188, ipcae: 10764, selicDiaria: 11, selic: 4390, trDiaria: 226, fatorSelic: 29541, fatorIpca: 29542, taxaLegal: 29543 });
  });

  test("lê a série mensal com as datas no formato do pedido e os valores em número", async () => {
    const { f, urls } = fetchFalso(() => Response.json(IPCA_TRIMESTRE));
    expect(await serieMensalDoSgs(SGS.ipca, "2023-01", "2023-03", { fetch: f })).toEqual([
      { mes: "2023-01", valor: 0.53 },
      { mes: "2023-02", valor: 0.84 },
      { mes: "2023-03", valor: 0.71 },
    ]);
    expect(urls[0]!.toString()).toBe("https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/01/2023&dataFinal=31/03/2023");
  });

  test("a SELIC do mês (4390) chega fora de ordem e sai ordenada", async () => {
    const { f } = fetchFalso(() =>
      Response.json([
        { data: "01/10/2026", valor: "1.07" },
        { data: "01/09/2026", valor: "1.08" },
      ]),
    );
    expect(await serieMensalDoSgs(SGS.selic, "2026-09", "2026-10", { fetch: f })).toEqual([
      { mes: "2026-09", valor: 1.08 },
      { mes: "2026-10", valor: 1.07 },
    ]);
  });

  test("série diária pede de 10 em 10 anos, que é o máximo que a API aceita", async () => {
    const { f, urls } = fetchFalso((url) => Response.json([{ data: url.searchParams.get("dataInicial"), valor: "0.050788" }]));
    const lidos = await buscarNoSgs(SGS.selicDiaria, "2010-01-01", "2026-10-30", { fetch: f });
    expect(urls.map((u) => [u.searchParams.get("dataInicial"), u.searchParams.get("dataFinal")])).toEqual([
      ["01/01/2010", "31/12/2019"],
      ["01/01/2020", "30/10/2026"],
    ]);
    expect(lidos.map((l) => l.data)).toEqual(["2010-01-01", "2020-01-01"]);
  });

  test("a TR do mês é a da janela do dia 1º ao dia 1º do mês seguinte", async () => {
    // Como a fonte responde em março de 2024: três janelas começam em 01/03 (fevereiro tem 29 dias).
    const { f } = fetchFalso(() =>
      Response.json([
        { data: "01/02/2024", dataFim: "01/03/2024", valor: "0.0079" },
        { data: "02/02/2024", dataFim: "02/03/2024", valor: "0.0151" },
        { data: "01/03/2024", dataFim: "30/03/2024", valor: "0.0331" },
        { data: "01/03/2024", dataFim: "31/03/2024", valor: "0.0331" },
        { data: "01/03/2024", dataFim: "01/04/2024", valor: "0.0331" },
      ]),
    );
    expect(await serieMensalDoSgs(SGS.trDiaria, "2024-02", "2024-03", { fetch: f })).toEqual([
      { mes: "2024-02", valor: 0.0079 },
      { mes: "2024-03", valor: 0.0331 },
    ]);
  });

  test("período sem valores (404 \"Value(s) not found\") é lista vazia; erro de verdade vira ErroSgs", async () => {
    const vazio = fetchFalso(() => Response.json({ erro: { statusCode: 404, detail: "SGSNegocioException: Value(s) not found" } }, { status: 404 }));
    expect(await serieMensalDoSgs(SGS.taxaLegal, "2020-01", "2020-12", { fetch: vazio.f })).toEqual([]);
    const janela = fetchFalso(() => Response.json({ error: "O sistema aceita uma janela de consulta de, no máximo, 10 anos em séries de periodicidade diária" }, { status: 406 }));
    await expect(buscarNoSgs(99999, "2000-01-01", "2026-01-01", { fetch: janela.f })).rejects.toThrow("O sistema aceita uma janela de consulta de, no máximo, 10 anos");
    const fora = fetchFalso(() => new Response("<html>Requisição inválida</html>", { status: 400 }));
    await expect(serieMensalDoSgs(SGS.inpc, "2023-01", "2023-03", { fetch: fora.f })).rejects.toBeInstanceOf(ErroSgs);
  });
});

describe("SIDRA do IBGE", () => {
  test("o IPCA da tabela 1737 (variável 63), para conferir o do SGS", async () => {
    const { f, urls } = fetchFalso(() =>
      Response.json([
        { NC: "Nível Territorial (Código)", V: "Valor", D3C: "Mês (Código)" },
        { NC: "1", MN: "%", V: "0.53", D2C: "63", D3C: "202301", D3N: "janeiro 2023" },
        { NC: "1", MN: "%", V: "0.84", D2C: "63", D3C: "202302", D3N: "fevereiro 2023" },
        { NC: "1", MN: "%", V: "...", D2C: "63", D3C: "202303", D3N: "março 2023" },
      ]),
    );
    expect(await ipcaNoSidra("2023-01", "2023-03", { fetch: f })).toEqual([
      { mes: "2023-01", valor: 0.53 },
      { mes: "2023-02", valor: 0.84 },
    ]);
    expect(urls[0]!.toString()).toBe("https://apisidra.ibge.gov.br/values/t/1737/n1/all/v/63/p/202301-202303");
  });

  test("SIDRA fora do ar vira ErroSidra", async () => {
    const { f } = fetchFalso(() => new Response("", { status: 500 }));
    await expect(ipcaNoSidra("2023-01", "2023-03", { fetch: f })).rejects.toBeInstanceOf(ErroSidra);
  });
});
