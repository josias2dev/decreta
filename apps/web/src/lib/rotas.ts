/** O que o roteador precisa saber das telas sem carregar as telas. */
export const VISTAS_DA_AGENDA = ["lista", "semana", "mes"] as const;
export type VistaDaAgenda = (typeof VISTAS_DA_AGENDA)[number];

export type AbaDoProcesso = "resumo" | "movimentacoes" | "prazos" | "documentos" | "calculos" | "chat";
export const ABAS_DO_PROCESSO: readonly AbaDoProcesso[] = ["resumo", "movimentacoes", "prazos", "documentos", "calculos", "chat"];
