/**
 * Previdenciário: os parâmetros anuais que o Decreta mantém (o INSS não tem
 * API) e a linha do tempo dos documentos já lidos. O salário mínimo confere
 * com a série 1619 do SGS (R$ 1.039 em jan/2020, 1.045 a partir de fev/2020,
 * 1.302 e 1.320 em 2023, 1.621 em 2026) e o teto, com as portarias
 * interministeriais de cada ano. Os documentos são inventados.
 */
import { describe, expect, test } from "bun:test";
import { entreMinimoETeto, linhaDoTempoPrevidenciaria, parametrosPrevidenciarios } from "../src/previdenciario.ts";

describe("parâmetros previdenciários", () => {
  test("teto e salário mínimo do dia, com as trocas no meio do ano", () => {
    expect(parametrosPrevidenciarios("2026-03-10")).toMatchObject({ teto: 8475.55, salarioMinimo: 1621 });
    expect(parametrosPrevidenciarios("2025-12-31")).toMatchObject({ teto: 8157.41, salarioMinimo: 1518 });
    expect(parametrosPrevidenciarios("2024-06-01")).toMatchObject({ teto: 7786.02, salarioMinimo: 1412 });
    expect(parametrosPrevidenciarios("2023-04-30")).toMatchObject({ teto: 7507.49, salarioMinimo: 1302 });
    expect(parametrosPrevidenciarios("2023-05-01")).toMatchObject({ teto: 7507.49, salarioMinimo: 1320 });
    expect(parametrosPrevidenciarios("2020-01-15")).toMatchObject({ teto: 6101.06, salarioMinimo: 1039 });
    expect(parametrosPrevidenciarios("2020-02-01")).toMatchObject({ salarioMinimo: 1045 });
    expect(parametrosPrevidenciarios("2019-12-31")).toBeNull();
  });

  test("benefício fica entre o salário mínimo e o teto", () => {
    expect(entreMinimoETeto(9000, "2026-05-01")).toBe(8475.55);
    expect(entreMinimoETeto(1200, "2026-05-01")).toBe(1621);
    expect(entreMinimoETeto(3000.5, "2026-05-01")).toBe(3000.5);
  });
});

describe("linha do tempo do previdenciário", () => {
  const docs = [
    { id: "d1", nome: "Laudo pericial.pdf", evento: 45, criadoEm: "2025-04-01", texto: "LAUDO MÉDICO PERICIAL\nPericiada: Ana Ribeiro Lopes\nData da perícia: 12/03/2025\nConclusão: há incapacidade parcial e permanente para a atividade habitual." },
    {
      id: "d2",
      nome: "extrato.pdf",
      evento: 1,
      criadoEm: "2025-02-10",
      texto: "CADASTRO NACIONAL DE INFORMAÇÕES SOCIAIS - CNIS\nExtrato Previdenciário emitido em 05/01/2025\nVínculo: Metalúrgica Vento Sul Ltda. de 02/05/2008 a 30/09/2024",
    },
    { id: "d3", nome: "Comunicação de decisão.pdf", evento: 1, criadoEm: "2025-02-10", texto: "Comunicação de Decisão\nEm 20/11/2024, informamos que foi indeferido o pedido de auxílio por incapacidade temporária.\nMotivo: não constatação de incapacidade laborativa." },
    { id: "d4", nome: "Procuração.pdf", evento: 1, criadoEm: "2025-02-10", texto: "PROCURAÇÃO AD JUDICIA" },
    { id: "d5", nome: "Atestado médico.jpg", evento: null, criadoEm: "2025-05-20", texto: "Atesto para os devidos fins que a paciente necessita de afastamento." },
  ];

  test("indeferimento, CNIS e laudos em ordem de data, com o trecho que importa", () => {
    expect(linhaDoTempoPrevidenciaria(docs)).toEqual([
      { data: "2024-11-20", tipo: "indeferimento", documentoId: "d3", nome: "Comunicação de decisão.pdf", evento: 1, dataNoTexto: true, trecho: "Motivo: não constatação de incapacidade laborativa." },
      { data: "2025-01-05", tipo: "cnis", documentoId: "d2", nome: "extrato.pdf", evento: 1, dataNoTexto: true, trecho: "Vínculo: Metalúrgica Vento Sul Ltda. de 02/05/2008 a 30/09/2024" },
      { data: "2025-03-12", tipo: "laudo", documentoId: "d1", nome: "Laudo pericial.pdf", evento: 45, dataNoTexto: true, trecho: "Conclusão: há incapacidade parcial e permanente para a atividade habitual." },
      // Sem data no texto: vale o dia em que o documento entrou.
      { data: "2025-05-20", tipo: "laudo", documentoId: "d5", nome: "Atestado médico.jpg", evento: null, dataNoTexto: false, trecho: null },
    ]);
  });
});
