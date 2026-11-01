/**
 * Revisional bancária: a taxa do contrato contra a taxa média que o Banco
 * Central publica para o mesmo banco, modalidade e mês (a Olinda, em
 * @decreta/tribunais). Sai um quadro para anexar e um tópico para a inicial,
 * em Markdown simples, como as peças. Julgado não é citado de memória: o
 * tópico deixa a marca [JURISPRUDÊNCIA: …] para a pesquisa.
 */
import { mesEmTexto, numeroBr } from "./calculos.ts";

/** Taxa mensal em anual, por juros compostos: (1 + i)¹² − 1, em %. */
export function taxaAoAno(aoMes: number): number {
  return ((1 + aoMes / 100) ** 12 - 1) * 100;
}

export interface Comparacao {
  diferencaEmPontos: number;
  vezesAMedia: number;
  /** A referência mais usada nos tribunais para dizer que a taxa discrepa da média. */
  acimaDeUmaVezEMeia: boolean;
}

export function compararTaxas(contratoAoMes: number, mediaAoMes: number): Comparacao {
  const vezes = contratoAoMes / mediaAoMes;
  return {
    diferencaEmPontos: Math.round((contratoAoMes - mediaAoMes) * 100) / 100,
    vezesAMedia: Math.round(vezes * 10_000) / 10_000,
    acimaDeUmaVezEMeia: vezes > 1.5,
  };
}

export interface DadosDaRevisional {
  banco: string;
  modalidade: string;
  /** AAAA-MM */
  mes: string;
  contratoAoMes: number;
  bancoAoMes: number;
  bancoAoAno: number;
  /** Janelas semanais na média (1 nas modalidades mensais). */
  periodos: number;
}

export function memoriaDaRevisional(d: DadosDaRevisional): string {
  const c = compararTaxas(d.contratoAoMes, d.bancoAoMes);
  const vezes = `${numeroBr(Math.floor(c.vezesAMedia * 100) / 100)} vez${c.vezesAMedia >= 2 ? "es" : ""}`;
  const media = d.periodos > 1 ? `, média de ${d.periodos} janelas semanais` : "";
  return [
    "## Quadro comparativo · taxa do contrato e taxa média do Banco Central",
    `Modalidade: ${d.modalidade}. Mês da contratação: ${mesEmTexto(d.mes)}.`,
    [
      `- Taxa do contrato: ${numeroBr(d.contratoAoMes)}% ao mês (${numeroBr(taxaAoAno(d.contratoAoMes))}% ao ano).`,
      `- Taxa média do ${d.banco} em ${mesEmTexto(d.mes)} (Banco Central): ${numeroBr(d.bancoAoMes)}% ao mês (${numeroBr(d.bancoAoAno)}% ao ano)${media}.`,
      `- Diferença: ${numeroBr(c.diferencaEmPontos)} pontos percentuais ao mês; o contrato cobra ${vezes} a média.`,
    ].join("\n"),
    "Fonte: Banco Central do Brasil, taxas de juros por instituição financeira (Olinda, serviço taxaJuros).",
    "## Da taxa de juros acima da média de mercado",
    `O contrato [COMPLETAR: número e data do contrato] fixou juros remuneratórios de ${numeroBr(d.contratoAoMes)}% ao mês. Para a mesma modalidade (${d.modalidade}) e o mesmo mês, o Banco Central divulgou a taxa média de ${numeroBr(d.bancoAoMes)}% ao mês praticada pela própria instituição ré, conforme o quadro anexo.`,
    c.acimaDeUmaVezEMeia
      ? `A taxa contratada equivale a ${vezes} a média, discrepância que caracteriza a abusividade e autoriza a revisão para a taxa média divulgada pelo Banco Central. [JURISPRUDÊNCIA: abusividade da taxa de juros que discrepa substancialmente da média de mercado divulgada pelo Banco Central]`
      : `A taxa contratada supera a média em ${numeroBr(c.diferencaEmPontos)} pontos percentuais ao mês. [COMPLETAR: avaliar se a diferença basta para a revisão no caso concreto] [JURISPRUDÊNCIA: parâmetro de abusividade da taxa de juros em relação à média de mercado]`,
  ].join("\n\n");
}
