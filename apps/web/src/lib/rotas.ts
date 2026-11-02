/** O que o roteador precisa saber das telas sem carregar as telas. */
export const VISTAS_DA_AGENDA = ["lista", "semana", "mes"] as const;
export type VistaDaAgenda = (typeof VISTAS_DA_AGENDA)[number];

export type AbaDoProcesso = "resumo" | "movimentacoes" | "prazos" | "documentos" | "honorarios" | "calculos" | "chat";
export const ABAS_DO_PROCESSO: readonly AbaDoProcesso[] = ["resumo", "movimentacoes", "prazos", "documentos", "honorarios", "calculos", "chat"];

/** Os filtros da tela do Financeiro; "abertas" é a de quando não se escolhe nenhuma. */
export const SITUACOES_DO_FINANCEIRO = ["abertas", "atraso", "pagas", "todas"] as const;
export type SituacaoDoFinanceiro = (typeof SITUACOES_DO_FINANCEIRO)[number];
