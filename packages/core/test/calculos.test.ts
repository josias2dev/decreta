/**
 * Atualização monetária. Os valores esperados vêm de fora do código: as
 * variações anuais publicadas pelo IBGE (IPCA 2023 = 4,62%, INPC 2023 =
 * 3,71%, IPCA-E 2023 = 4,72%) e exemplos com números redondos feitos à mão.
 */
import { describe, expect, test } from "bun:test";
import { atualizar, divergencias, indicesNecessarios, memoriaDaAtualizacao, type Serie } from "../src/calculos.ts";

/** Variações mensais de 2023, como o SGS do Banco Central e o SIDRA publicam. */
const mensal = (valores: number[], ano = 2023): Serie => valores.map((valor, i) => ({ mes: `${ano}-${String(i + 1).padStart(2, "0")}`, valor }));
const IPCA_2023 = mensal([0.53, 0.84, 0.71, 0.61, 0.23, -0.08, 0.12, 0.23, 0.26, 0.24, 0.28, 0.56]);
const INPC_2023 = mensal([0.46, 0.77, 0.64, 0.53, 0.36, -0.1, -0.09, 0.2, 0.11, 0.12, 0.1, 0.55]);
const IPCAE_2023 = mensal([0.55, 0.76, 0.69, 0.57, 0.51, 0.04, -0.07, 0.28, 0.35, 0.21, 0.33, 0.4]);

const umAno = { parcelas: [{ descricao: "Parcela", valor: 1000, vencimento: "2023-01-15" }], dataDoCalculo: "2024-01-10" };

describe("atualização por índice", () => {
  test("de janeiro a dezembro de 2023, o IPCA acumula os 4,62% do IBGE", () => {
    const r = atualizar({ ...umAno, regime: { tipo: "contratual", indice: "ipca", jurosAoMes: 0 } }, { ipca: IPCA_2023 });
    expect(r.linhas[0]!.fator).toBeCloseTo(1.0462, 4);
    expect(r.total.corrigido).toBeCloseTo(1046.2, 0);
  });

  test("INPC e IPCA-E de 2023 batem com os 3,71% e 4,72% do IBGE", () => {
    const inpc = atualizar({ ...umAno, regime: { tipo: "contratual", indice: "inpc", jurosAoMes: 0 } }, { inpc: INPC_2023 });
    const ipcae = atualizar({ ...umAno, regime: { tipo: "contratual", indice: "ipcae", jurosAoMes: 0 } }, { ipcae: IPCAE_2023 });
    expect(inpc.linhas[0]!.fator).toBeCloseTo(1.0371, 4);
    expect(ipcae.linhas[0]!.fator).toBeCloseTo(1.0472, 4);
  });

  test("índice contratual com juros simples de 1% ao mês, contados da citação", () => {
    // À mão: 1.000 × 1,01 × 1,02 × 0,995 = 1.025,049 → R$ 1.025,05.
    // Juros de 3 meses (jan a mar): 3% de 1.025,05 = 30,75. Da citação em fevereiro: 2% = 20,50.
    const ipca = mensal([1, 2, -0.5]);
    const pedido = { parcelas: [{ descricao: "Aluguel de janeiro", valor: 1000, vencimento: "2023-01-15" }], dataDoCalculo: "2023-04-20", regime: { tipo: "contratual" as const, indice: "ipca" as const, jurosAoMes: 1 } };
    const r = atualizar(pedido, { ipca });
    expect(r.linhas[0]).toMatchObject({ corrigido: 1025.05, jurosPercentual: 3, juros: 30.75, total: 1055.8 });
    const daCitacao = atualizar({ ...pedido, jurosDesde: "2023-02-10" }, { ipca });
    expect(daCitacao.total).toEqual({ valor: 1000, corrigido: 1025.05, juros: 20.5, total: 1045.55 });
  });

  test("débito civil: IPCA mais Taxa Legal, e a taxa negativa vira juro zero", () => {
    // À mão: 1.000 × 1,01 × 1,02 = 1.030,20. Taxa Legal 0,5% em setembro e −0,2% (vale 0) em outubro:
    // juros de 0,5% sobre 1.030,20 = 5,151 → 5,15. Total 1.035,35.
    const r = atualizar(
      { parcelas: [{ descricao: "Indenização", valor: 1000, vencimento: "2024-09-05" }], dataDoCalculo: "2024-11-12", regime: { tipo: "civil" } },
      { ipca: mensal([1, 2], 2024).map((v, i) => ({ ...v, mes: `2024-${i === 0 ? "09" : "10"}` })), taxaLegal: [{ mes: "2024-09", valor: 0.5 }, { mes: "2024-10", valor: -0.2 }] },
    );
    expect(r.linhas[0]).toMatchObject({ corrigido: 1030.2, jurosPercentual: 0.5, juros: 5.15, total: 1035.35 });
    expect(r.ressalvas).toEqual([]);
  });

  test("débito civil antes da Lei 14.905: corrige pelo IPCA e avisa que os juros de antes de 09/2024 ficaram de fora", () => {
    // À mão: 1.000 × 1,01⁴ = 1.040,60401 → 1.040,60. Taxa Legal de 0,5% em setembro e em outubro: 1% = 10,41.
    const ipca = ["2024-07", "2024-08", "2024-09", "2024-10"].map((mes) => ({ mes, valor: 1 }));
    const r = atualizar(
      { parcelas: [{ descricao: "Indenização", valor: 1000, vencimento: "2024-07-10" }], dataDoCalculo: "2024-11-12", regime: { tipo: "civil" } },
      { ipca, taxaLegal: [{ mes: "2024-09", valor: 0.5 }, { mes: "2024-10", valor: 0.5 }] },
    );
    expect(r.linhas[0]).toMatchObject({ corrigido: 1040.6, jurosPercentual: 1, juros: 10.41, total: 1051.01 });
    expect(r.ressalvas).toEqual(["Juros de 07/2024 a 08/2024 não calculados: antes de 30/08/2024 (Lei 14.905/2024), a taxa depende do título. Para esse período, use o regime de índice contratual."]);
  });

  test("mês sem índice publicado é erro, dizendo qual falta", () => {
    expect(() => atualizar({ ...umAno, regime: { tipo: "contratual", indice: "ipca", jurosAoMes: 0 } }, { ipca: IPCA_2023.slice(0, 11) })).toThrow("Faltam valores de IPCA para 12/2023.");
  });
});

describe("Fazenda Pública", () => {
  const serie = (inicio: string, valores: number[]) => {
    const [a, m] = inicio.split("-").map(Number) as [number, number];
    return valores.map((valor, i) => {
      const n = m - 1 + i;
      return { mes: `${a + Math.floor(n / 12)}-${String((n % 12) + 1).padStart(2, "0")}`, valor };
    });
  };
  const parcela = (vencimento: string) => [{ descricao: "Diferenças", valor: 1000, vencimento }];

  test("EC 113: a SELIC entra uma vez só, somada mês a mês (juros simples), sem juros à parte", () => {
    // À mão: 1,0 + 1,1 + 0,9 = 3,0% → R$ 1.030,00 (a conta composta daria 1.030,29).
    const r = atualizar({ parcelas: parcela("2022-01-10"), dataDoCalculo: "2022-04-05", regime: { tipo: "fazenda" } }, { selic: serie("2022-01", [1, 1.1, 0.9]) });
    expect(r.linhas[0]).toMatchObject({ corrigido: 1030, juros: 0, total: 1030 });
    expect(r.linhas[0]!.fator).toBeCloseTo(1.03, 10);
  });

  test("antes de 12/2021 corrige pelo IPCA-E e avisa que os juros da poupança ficaram de fora", () => {
    // À mão: 1.000 × 1,005 × 1,005 = 1.010,025; × (1 + 2% de SELIC) = 1.030,2255 → 1.030,23.
    const r = atualizar(
      { parcelas: parcela("2021-10-20"), dataDoCalculo: "2022-02-01", regime: { tipo: "fazenda" } },
      { ipcae: serie("2021-10", [0.5, 0.5]), selic: serie("2021-12", [1, 1]) },
    );
    expect(r.linhas[0]!.total).toBe(1030.23);
    expect(r.ressalvas).toEqual([
      "De 10/2021 a 11/2021, antes da EC 113/2021, o valor foi corrigido pelo IPCA-E (Tema 810 do STF); os juros da poupança desse período não estão no cálculo.",
    ]);
  });

  test("requisitório (EC 136/2025): da expedição em diante, IPCA mais 2% ao ano, limitado à SELIC", () => {
    // À mão: SELIC de jan e fev = 2,1% → 1.021,00 na expedição (março).
    // Depois, 2 meses: IPCA 1,005 × 1,005 = 1,010025 e juros de 2 × 2/12 = 0,3333%:
    // 1.021 × 1,010025 × 1,0033333 = 1.034,67. Pela SELIC (0,9 + 0,8 = 1,7%): 1.038,36. Vale o menor.
    const base = { parcelas: parcela("2022-01-10"), dataDoCalculo: "2022-05-02", regime: { tipo: "fazenda" as const, expedicao: "2022-03-15" } };
    const ipca = serie("2022-03", [0.5, 0.5]);
    const r = atualizar(base, { selic: serie("2022-01", [1, 1.1, 0.9, 0.8]), ipca });
    expect(r.linhas[0]!.total).toBe(1034.67);
    expect(r.linhas[0]!.criterio).toContain("IPCA + 2% a.a.");
    // Com a SELIC abaixo (0,1 + 0,1 = 0,2%): 1.021 × 1,002 = 1.023,042 → 1.023,04.
    const comTeto = atualizar(base, { selic: serie("2022-01", [1, 1.1, 0.1, 0.1]), ipca });
    expect(comTeto.linhas[0]!.total).toBe(1023.04);
    expect(comTeto.linhas[0]!.criterio).toContain("limitado à SELIC");
  });
});

describe("o que buscar e a memória de cálculo", () => {
  test("conferência de duas fontes do mesmo índice: aponta o mês que diverge e o que falta numa delas", () => {
    const sgs = mensal([0.53, 0.84, 0.71]);
    const sidra = mensal([0.53, 0.83]);
    expect(divergencias(sgs, sidra)).toEqual([
      { mes: "2023-02", a: 0.84, b: 0.83 },
      { mes: "2023-03", a: 0.71, b: null },
    ]);
    expect(divergencias(sgs, mensal([0.53, 0.84, 0.71]))).toEqual([]);
  });

  test("os índices e os meses que cada regime pede", () => {
    const parcelas = [
      { descricao: "A", valor: 10, vencimento: "2024-03-10" },
      { descricao: "B", valor: 10, vencimento: "2024-05-10" },
    ];
    expect(indicesNecessarios({ parcelas, dataDoCalculo: "2024-11-12", jurosDesde: "2024-02-01", regime: { tipo: "civil" } })).toEqual({ indices: ["ipca", "taxaLegal"], de: "2024-02", ate: "2024-10" });
    expect(indicesNecessarios({ parcelas, dataDoCalculo: "2024-11-12", regime: { tipo: "fazenda", expedicao: "2024-08-01" } })).toEqual({ indices: ["selic", "ipca"], de: "2024-03", ate: "2024-10" });
    expect(indicesNecessarios({ parcelas: [{ descricao: "C", valor: 1, vencimento: "2021-06-01" }], dataDoCalculo: "2024-11-12", regime: { tipo: "fazenda" } })).toEqual({ indices: ["ipcae", "selic"], de: "2021-06", ate: "2024-10" });
    expect(indicesNecessarios({ parcelas, dataDoCalculo: "2024-11-12", regime: { tipo: "contratual", indice: "nenhum", jurosAoMes: 1 } })).toEqual({ indices: [], de: "2024-03", ate: "2024-10" });
  });

  test("a memória lista cada parcela com o critério, os totais em reais, as ressalvas e as fontes", () => {
    const pedido = { parcelas: [{ descricao: "Aluguel de janeiro", valor: 1000, vencimento: "2023-01-15" }], dataDoCalculo: "2023-04-20", regime: { tipo: "contratual" as const, indice: "ipca" as const, jurosAoMes: 1 } };
    const r = atualizar(pedido, { ipca: mensal([1, 2, -0.5]) });
    const texto = memoriaDaAtualizacao(pedido, r, { titulo: "Atualização do débito", processo: "5004321-25.2026.8.24.0038", fontes: ["IPCA: SGS 433 do Banco Central, conferido no SIDRA/IBGE (tabela 1737)."] });
    expect(texto).toStartWith("## Memória de cálculo · Atualização do débito");
    expect(texto).toContain("Processo 5004321-25.2026.8.24.0038. Cálculo em 20/04/2023.");
    expect(texto).toContain("**Aluguel de janeiro**, vencida em 15/01/2023: R$ 1.000,00 × 1,025049 = R$ 1.025,05; juros de 3,00% = R$ 30,75; total R$ 1.055,80.");
    expect(texto).toContain("IPCA de 01/2023 a 03/2023; juros simples de 1,00% ao mês de 01/2023 a 03/2023");
    expect(texto).toContain("**Total atualizado: R$ 1.055,80** (principal R$ 1.000,00; correção R$ 25,05; juros R$ 30,75).");
    expect(texto).toContain("- IPCA: SGS 433 do Banco Central, conferido no SIDRA/IBGE (tabela 1737).");
  });
});
