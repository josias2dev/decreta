/**
 * Prazo interno: a data que o escritório se dá para terminar antes do fatal.
 * Conta para trás a partir do fatal, só em dias com expediente completo: dia sem
 * expediente ou com expediente reduzido não conta nem recebe o interno, que recua
 * para o dia anterior. A suspensão de janeiro conta, porque o fórum abre nela e o
 * que se protege aqui é o trabalho do escritório, não a contagem do prazo.
 *
 * Prazo curto demais não vira uma data disfarçada: o interno pode cair antes de
 * hoje, e aí `passou` e `aviso` dizem isso.
 */
import type { Calendario, Feriado } from "./calendario.ts";
import { fimDeSemana, formatarDia, somarDias, type Dia } from "./datas.ts";
import { juntarIntervalos, temExpediente } from "./prazos.ts";

/** O máximo de dias úteis de antecedência que o escritório pode escolher. */
export const MAX_DIAS_DO_INTERNO = 15;

export interface PedidoDoPrazoInterno {
  fatal: Dia;
  /** Dias úteis antes do fatal. Zero: o escritório não usa prazo interno. */
  antecedencia: number;
  hoje: Dia;
  calendario: Calendario;
}

export interface PrazoInterno {
  dia: Dia;
  fatal: Dia;
  antecedencia: number;
  /** "2 dias úteis antes do fatal, sem contar 20/11/2026 (Consciência Negra)". */
  regra: string;
  /** O interno ficou antes de hoje. */
  passou: boolean;
  /** A frase que diz isso, quando passou. */
  aviso: string | null;
}

const diasUteis = (n: number) => `${n} ${n === 1 ? "dia útil" : "dias úteis"}`;

/** Sem fatal pela frente (ou sem antecedência) não há interno: `null`. */
export function prazoInterno({ fatal, antecedencia, hoje, calendario: cal }: PedidoDoPrazoInterno): PrazoInterno | null {
  if (antecedencia < 1 || fatal < hoje) return null;
  const fora: Feriado[] = [];
  let dia = fatal;
  // Um ano inteiro sem expediente é calendário quebrado, não prazo longo.
  for (let faltam = antecedencia, passos = 0; faltam > 0 && passos < 400 * antecedencia; passos++) {
    dia = somarDias(dia, -1);
    if (temExpediente(dia, cal) && !cal.reduzido(dia)) {
      faltam--;
      continue;
    }
    const motivo = fimDeSemana(dia) ? null : (cal.semExpediente(dia) ?? cal.reduzido(dia));
    if (motivo) fora.push(motivo);
  }
  const semContar = fora.length ? `, sem contar ${juntarIntervalos(fora).texto}` : "";
  const passou = dia < hoje;
  return {
    dia,
    fatal,
    antecedencia,
    regra: `${diasUteis(antecedencia)} antes do fatal${semContar}`,
    passou,
    aviso: passou ? `Já passou: o interno era ${formatarDia(dia)}. ${antecedencia === 1 ? "Não cabe" : "Não cabem"} mais ${diasUteis(antecedencia)} antes do fatal de ${formatarDia(fatal)}.` : null,
  };
}
