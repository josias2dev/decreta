/**
 * Taxas de juros por banco e modalidade na Olinda do Banco Central. As linhas
 * são trechos das respostas reais (crédito pessoal não consignado de março de
 * 2024; Bradesco, imobiliário pela TR), conferidas uma vez na fonte.
 */
import { describe, expect, test } from "bun:test";
import { ErroOlinda, MODALIDADES_BCB, taxasDoMesNaOlinda } from "../src/index.ts";

const diaria = (InicioPeriodo: string, FimPeriodo: string, InstituicaoFinanceira: string, cnpj8: string, TaxaJurosAoMes: number, TaxaJurosAoAno: number, Segmento = "PESSOA FÍSICA") => ({
  InicioPeriodo,
  FimPeriodo,
  codigoSegmento: null,
  Segmento,
  codigoModalidade: null,
  Modalidade: "Crédito pessoal não consignado - Prefixado",
  Posicao: 40,
  InstituicaoFinanceira,
  TaxaJurosAoMes,
  TaxaJurosAoAno,
  cnpj8,
});

function fetchFalso(corpo: unknown, status = 200) {
  const urls: string[] = [];
  const f = (async (url: string) => {
    urls.push(String(url));
    return typeof corpo === "string" ? new Response(corpo, { status }) : Response.json(corpo, { status });
  }) as unknown as typeof fetch;
  return { f, urls };
}

describe("taxas de juros na Olinda (Banco Central)", () => {
  test("modalidade diária: a média das janelas do mês por banco, com o filtro que a Olinda entende", async () => {
    const { f, urls } = fetchFalso({
      value: [
        diaria("2024-03-01", "2024-03-07", "ITAÚ UNIBANCO S.A.", "60701190", 4.11, 62.2),
        diaria("2024-03-04", "2024-03-08", "ITAÚ UNIBANCO S.A.", "60701190", 4.1, 61.9),
        diaria("2024-03-05", "2024-03-11", "ITAÚ UNIBANCO S.A.", "60701190", 4.04, 60.8),
        diaria("2024-03-01", "2024-03-07", "BCO DO BRASIL S.A.", "00000000", 3.5, 51.11),
      ],
    });
    const taxas = await taxasDoMesNaOlinda({ modalidade: "Crédito pessoal não consignado - Prefixado", mes: "2024-03" }, { fetch: f });
    // À mão: (4,11 + 4,10 + 4,04) / 3 = 4,0833 → 4,08; (62,20 + 61,90 + 60,80) / 3 = 61,6333 → 61,63.
    expect(taxas).toEqual([
      { instituicao: "BCO DO BRASIL S.A.", cnpj8: "00000000", taxaAoMes: 3.5, taxaAoAno: 51.11, periodos: 1 },
      { instituicao: "ITAÚ UNIBANCO S.A.", cnpj8: "60701190", taxaAoMes: 4.08, taxaAoAno: 61.63, periodos: 3 },
    ]);
    const url = urls[0]!;
    expect(url.startsWith("https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata/TaxasJurosDiariaPorInicioPeriodo?$format=json&$top=10000&$filter=")).toBe(true);
    // A Olinda recusa o apóstrofo codificado (%27): ele vai como está.
    expect(url).toContain("'");
    expect(decodeURIComponent(url.split("$filter=")[1]!)).toBe("Modalidade eq 'Crédito pessoal não consignado - Prefixado' and InicioPeriodo ge '2024-03-01' and InicioPeriodo le '2024-03-31'");
  });

  test("um banco só (pelo CNPJ de 8 dígitos) e o segmento, quando a modalidade existe para PF e PJ", async () => {
    const { f, urls } = fetchFalso({
      value: [diaria("2024-03-01", "2024-03-07", "ITAÚ UNIBANCO S.A.", "60701190", 8.1, 154.6), diaria("2024-03-01", "2024-03-07", "ITAÚ UNIBANCO S.A.", "60701190", 6.2, 105.9, "PESSOA JURÍDICA")],
    });
    const taxas = await taxasDoMesNaOlinda({ modalidade: "Cheque especial - Prefixado", mes: "2024-03", cnpj8: "60.701.190", segmento: "Pessoa Física" }, { fetch: f });
    expect(taxas).toEqual([{ instituicao: "ITAÚ UNIBANCO S.A.", cnpj8: "60701190", taxaAoMes: 8.1, taxaAoAno: 154.6, periodos: 1 }]);
    expect(decodeURIComponent(urls[0]!)).toContain("and cnpj8 eq '60701190'");
  });

  test("imobiliário é mensal: lê a taxa do mês por banco", async () => {
    const { f, urls } = fetchFalso({
      value: [{ Mes: "Mar-2024", Modalidade: "Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR", Posicao: 5, InstituicaoFinanceira: "BCO BRADESCO S.A.", TaxaJurosAoMes: 0.84, TaxaJurosAoAno: 10.55, cnpj8: "60746948", anoMes: "2024-03" }],
    });
    const taxas = await taxasDoMesNaOlinda({ modalidade: "Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR", mes: "2024-03" }, { fetch: f });
    expect(taxas).toEqual([{ instituicao: "BCO BRADESCO S.A.", cnpj8: "60746948", taxaAoMes: 0.84, taxaAoAno: 10.55, periodos: 1 }]);
    expect(decodeURIComponent(urls[0]!)).toContain("/TaxasJurosMensalPorMes?$format=json&$top=10000&$filter=Modalidade eq 'Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR' and anoMes eq '2024-03'");
  });

  test("modalidade fora da lista e erro da Olinda viram ErroOlinda", async () => {
    await expect(taxasDoMesNaOlinda({ modalidade: "Consórcio", mes: "2024-03" }, { fetch: fetchFalso({ value: [] }).f })).rejects.toBeInstanceOf(ErroOlinda);
    const { f } = fetchFalso('/*{\n  "codigo" : 400,\n  "mensagem" : "The URI is malformed."\n}*/', 400);
    await expect(taxasDoMesNaOlinda({ modalidade: "Cheque especial - Prefixado", mes: "2024-03" }, { fetch: f })).rejects.toThrow("The URI is malformed.");
  });

  test("a lista de modalidades é a da ParametrosConsulta, com as mensais marcadas", () => {
    expect(MODALIDADES_BCB).toHaveLength(29);
    expect(MODALIDADES_BCB.filter((m) => m.mensal)).toHaveLength(6);
    expect(MODALIDADES_BCB).toContainEqual({ modalidade: "Crédito pessoal consignado INSS - Prefixado", segmento: "Pessoa Física", mensal: false });
  });
});
