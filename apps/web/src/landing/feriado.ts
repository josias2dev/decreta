/**
 * O teste do feriado: o texto da seção, sempre com o próximo feriado nacional.
 * Sai pronto no build e é recalculado ao abrir a página, para nunca convidar a
 * digitar uma data que já passou.
 */
import type { Feriado } from "../../../../packages/core/src/calendario.ts";
import { formatarDia, nomeDoDiaDaSemana } from "../../../../packages/core/src/datas.ts";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

export function dadosDoFeriado(f: Feriado, aviso: string) {
  return {
    data: formatarDia(f.dia),
    dia: f.dia.slice(8, 10),
    mes: `${MESES[Number(f.dia.slice(5, 7)) - 1]} de ${f.dia.slice(0, 4)}`,
    semana: nomeDoDiaDaSemana(f.dia),
    nome: f.nome,
    aviso,
  };
}
