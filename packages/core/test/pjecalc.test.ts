/**
 * O resumo do relatório do PJe-Calc (o texto do PDF). O leiaute não tem
 * documentação pública: a amostra segue o resumo do relatório, com nomes,
 * número e valores inventados; os totais foram somados à mão.
 */
import { describe, expect, test } from "bun:test";
import { memoriaDoPjeCalc, resumoDoPjeCalc } from "../src/pjecalc.ts";

const RELATORIO = `PLANILHA DE CÁLCULO
Processo: 0001234-56.2025.5.12.0016
Reclamante: JOÃO PEREIRA DA SILVA
Reclamado: TRANSPORTES SERRA DOURADA LTDA
Período do Cálculo: 02/05/2020 a 30/09/2024 Data Ajuizamento: 15/01/2025 Data Liquidação: 30/09/2026
RESUMO DO CÁLCULO
Descrição do Bruto Devido ao Reclamante Valor Corrigido Juros Total
HORAS EXTRAS 50% 18.450,32 2.103,40 20.553,72
REFLEXOS EM FÉRIAS + 1/3 2.050,10 233,72 2.283,82
Total 20.500,42 2.337,12 22.837,54
Descrição de Débitos do Reclamado por Credor Valor
LÍQUIDO DEVIDO AO RECLAMANTE 19.871,20
DEPÓSITO FGTS 1.640,02
CONTRIBUIÇÃO SOCIAL SOBRE SALÁRIOS DEVIDOS 2.512,13
IRPF DEVIDO PELO RECLAMANTE 454,32
HONORÁRIOS LÍQUIDOS PARA PATRONO DO RECLAMANTE 3.425,63
HONORÁRIOS PERICIAIS 1.500,00
CUSTAS JUDICIAIS DEVIDAS PELO RECLAMADO 456,75
Total Devido pelo Reclamado 29.860,05`;

describe("resumo do PJe-Calc", () => {
  test("partes, datas e os totais por credor", () => {
    // À mão: 19.871,20 + 1.640,02 + 2.512,13 + 454,32 + 3.425,63 + 1.500,00 + 456,75 = 29.860,05.
    expect(resumoDoPjeCalc(RELATORIO)).toEqual({
      processo: "0001234-56.2025.5.12.0016",
      reclamante: "João Pereira da Silva",
      reclamado: "Transportes Serra Dourada Ltda",
      dataLiquidacao: "2026-09-30",
      brutoDevido: 22837.54,
      liquidoReclamante: 19871.2,
      fgts: 1640.02,
      contribuicaoSocial: 2512.13,
      irpf: 454.32,
      honorarios: 4925.63,
      custas: 456.75,
      totalReclamado: 29860.05,
    });
  });

  test("o resumo em texto, para a peça e a tela", () => {
    const texto = memoriaDoPjeCalc(resumoDoPjeCalc(RELATORIO)!);
    expect(texto).toStartWith("## Resumo do cálculo do PJe-Calc");
    expect(texto).toContain("Liquidação em 30/09/2026. Reclamante: João Pereira da Silva. Reclamado: Transportes Serra Dourada Ltda.");
    expect(texto).toContain("- Líquido devido ao reclamante: R$ 19.871,20");
    expect(texto).toContain("- Honorários: R$ 4.925,63");
    expect(texto).toContain("**Total devido pelo reclamado: R$ 29.860,05**");
  });

  test("texto que não é do PJe-Calc devolve null", () => {
    expect(resumoDoPjeCalc("PROCURAÇÃO AD JUDICIA\nOutorgante: Fulano")).toBeNull();
  });
});
