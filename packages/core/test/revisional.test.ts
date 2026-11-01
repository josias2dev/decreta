/**
 * Revisional bancária: a taxa do contrato contra a média do Banco Central. As
 * conversões de taxa conferem com as tabelas de juros compostos (1% a.m. =
 * 12,68% a.a.; 2% a.m. = 26,82% a.a.); as razões foram feitas à mão.
 */
import { describe, expect, test } from "bun:test";
import { compararTaxas, memoriaDaRevisional, taxaAoAno } from "../src/revisional.ts";

describe("revisional bancária", () => {
  test("taxa mensal em anual, pelos juros compostos", () => {
    expect(taxaAoAno(1)).toBeCloseTo(12.68, 2);
    expect(taxaAoAno(2)).toBeCloseTo(26.82, 2);
  });

  test("diferença em pontos e quantas vezes a média; marca quando passa de uma vez e meia", () => {
    // À mão: 4,50 − 3,91 = 0,59 p.p.; 4,50 / 3,91 = 1,1509.
    expect(compararTaxas(4.5, 3.91)).toEqual({ diferencaEmPontos: 0.59, vezesAMedia: 1.1509, acimaDeUmaVezEMeia: false });
    // 6,00 / 3,91 = 1,5345.
    expect(compararTaxas(6, 3.91)).toEqual({ diferencaEmPontos: 2.09, vezesAMedia: 1.5345, acimaDeUmaVezEMeia: true });
  });

  test("o quadro para anexar e o tópico para a inicial, sem citar julgado de memória", () => {
    const texto = memoriaDaRevisional({
      banco: "ITAÚ UNIBANCO S.A.",
      modalidade: "Crédito pessoal não consignado - Prefixado",
      mes: "2024-03",
      contratoAoMes: 6,
      bancoAoMes: 3.91,
      bancoAoAno: 58.54,
      periodos: 20,
    });
    expect(texto).toContain("## Quadro comparativo · taxa do contrato e taxa média do Banco Central");
    expect(texto).toContain("- Taxa do contrato: 6,00% ao mês (101,22% ao ano).");
    expect(texto).toContain("- Taxa média do ITAÚ UNIBANCO S.A. em 03/2024 (Banco Central): 3,91% ao mês (58,54% ao ano), média de 20 janelas semanais.");
    expect(texto).toContain("- Diferença: 2,09 pontos percentuais ao mês; o contrato cobra 1,53 vez a média.");
    expect(texto).toContain("## Da taxa de juros acima da média de mercado");
    expect(texto).toContain("[JURISPRUDÊNCIA:");
    expect(texto).not.toMatch(/REsp|AgInt|Súmula \d/);
  });
});
