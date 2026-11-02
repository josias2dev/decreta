/**
 * A conta aberta: a contagem do motor (`contarPrazo`) dia a dia, da publicação
 * ao vencimento, com o motivo de cada dia ter contado ou ficado de fora. É o que
 * a landing desenha no calendário, sem servidor e sem login.
 */
import { calendarioPara, type Tribunal } from "./calendario.ts";
import { fimDeSemana, somarDias, type Dia } from "./datas.ts";
import { contarPrazo, ehDiaUtil, type Contagem } from "./prazos.ts";

export type TipoDoDia =
  /** O dia da publicação: a contagem exclui o dia do começo. */
  | "publicacao"
  | "contado"
  | "fim_de_semana"
  | "feriado"
  | "suspensao"
  /** O prazo já acabou de contar, mas o último dia não podia vencer: é onde ele passa a vencer. */
  | "vencimento";

export interface DiaDaConta {
  dia: Dia;
  tipo: TipoDoDia;
  /** A posição na contagem, de 1 até o total de dias. Só nos dias contados. */
  n?: number;
  /** O nome do feriado ou da suspensão. */
  motivo?: string;
  vence?: true;
}

export interface PedidoDaContaAberta {
  publicacao: Dia;
  dias: number;
  contagem: Contagem;
  tribunal: Tribunal;
}

export interface ContaAberta {
  tribunal: Tribunal;
  /** O tribunal tem calendário próprio. Falso: a conta usou só os feriados nacionais e o recesso. */
  proprio: boolean;
  publicacao: Dia;
  inicio: Dia;
  fim: Dia;
  dias: number;
  contagem: Contagem;
  /** O último dia caiu sem expediente completo e o vencimento passou para `fim`. */
  prorrogadoDe: Dia | null;
  /** Um item por dia, da publicação a `fim`, sem pular nenhum. */
  linha: DiaDaConta[];
}

export function abrirConta({ publicacao, dias, contagem, tribunal }: PedidoDaContaAberta): ContaAberta {
  const calendario = calendarioPara({ tribunal });
  const r = contarPrazo({ publicacao, dias, contagem, calendario });
  const linha: DiaDaConta[] = [{ dia: publicacao, tipo: "publicacao" }];
  /** O último dia da contagem: `fim`, ou o dia de onde o vencimento foi empurrado. */
  const ultimoContado = r.prorrogadoDe ?? r.fim;
  const conta = (d: Dia) => d >= r.inicio && d <= ultimoContado && (contagem === "uteis" ? ehDiaUtil(d, calendario) : !calendario.suspenso(d));
  let n = 0;
  for (let d = somarDias(publicacao, 1); d <= r.fim; d = somarDias(d, 1)) {
    if (conta(d)) {
      n++;
      linha.push({ dia: d, tipo: "contado", n, ...(d === r.fim ? { vence: true as const } : {}) });
      continue;
    }
    const motivo = (calendario.semExpediente(d) ?? calendario.suspenso(d))?.nome;
    const comMotivo = motivo ? { motivo } : {};
    if (d === r.fim) linha.push({ dia: d, tipo: "vencimento", vence: true });
    else if (fimDeSemana(d)) linha.push({ dia: d, tipo: "fim_de_semana", ...comMotivo });
    else if (calendario.semExpediente(d)?.tipo === "recesso" || (!calendario.semExpediente(d) && calendario.suspenso(d))) linha.push({ dia: d, tipo: "suspensao", ...comMotivo });
    else linha.push({ dia: d, tipo: "feriado", ...comMotivo });
  }
  return { tribunal, proprio: calendario.proprio, publicacao, inicio: r.inicio, fim: r.fim, dias, contagem, prorrogadoDe: r.prorrogadoDe, linha };
}
