/**
 * Auditoria da carteira: a varredura que roda antes do resumo da manhã e acha
 * o que se perde num escritório sem controladoria. A lista é curta e
 * ordenada pelo risco, para não virar mais um aviso que ninguém lê.
 */

export type MotivoDaAuditoria = "prazo_sem_dono" | "publicacao_sem_processo" | "alvara_parado" | "documento_faltando" | "processo_parado";

export interface AchadoDaAuditoria {
  motivo: MotivoDaAuditoria;
  /** Id do que precisa de atenção (prazo, publicação, alvará, cliente ou processo). */
  id: string;
  titulo: string;
  /** O porquê, em uma frase. */
  detalhe: string;
  /** Onde resolver, nas telas: "/prazos/ID". */
  caminho: string;
  /** Há quantos dias está assim; ordena dentro do mesmo motivo. */
  dias: number;
  /** Quem responde pelo processo; sem dono, vai para todos. */
  responsavelId: string | null;
}

/** Do que pode custar um prazo para o que só custa dinheiro ou tempo. */
const ORDEM: readonly MotivoDaAuditoria[] = ["prazo_sem_dono", "publicacao_sem_processo", "alvara_parado", "documento_faltando", "processo_parado"];

export const ROTULO_DA_AUDITORIA: Record<MotivoDaAuditoria, string> = {
  prazo_sem_dono: "Prazo sem responsável",
  publicacao_sem_processo: "Publicação sem processo",
  alvara_parado: "Alvará parado",
  documento_faltando: "Documento faltando",
  processo_parado: "Processo parado",
};

/** Sem andamento há 120 dias: perto do risco de extinção por abandono (CPC, art. 485, II e III) e da prescrição intercorrente (art. 921). */
export const DIAS_PARA_PROCESSO_PARADO = 120;
/** Alvará expedido há 30 dias e ainda não sacado. */
export const DIAS_PARA_ALVARA_PARADO = 30;
/** Quantos achados entram no resumo: mais que isso ninguém lê. */
export const ACHADOS_NO_RESUMO = 8;

export const processoParado = (diasSemAndamento: number) => diasSemAndamento >= DIAS_PARA_PROCESSO_PARADO;

export function priorizarAchados(achados: readonly AchadoDaAuditoria[], teto = ACHADOS_NO_RESUMO): { itens: AchadoDaAuditoria[]; total: number } {
  const ordenados = [...achados].sort((a, b) => ORDEM.indexOf(a.motivo) - ORDEM.indexOf(b.motivo) || b.dias - a.dias);
  return { itens: ordenados.slice(0, teto), total: achados.length };
}
