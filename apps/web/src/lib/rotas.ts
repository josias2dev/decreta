/** O que o roteador precisa saber das telas sem carregar as telas. */
export const VISTAS_DA_AGENDA = ["lista", "semana", "mes"] as const;
export type VistaDaAgenda = (typeof VISTAS_DA_AGENDA)[number];

export type AbaDoProcesso = "resumo" | "movimentacoes" | "prazos" | "documentos" | "calculos" | "chat";
export const ABAS_DO_PROCESSO: readonly AbaDoProcesso[] = ["resumo", "movimentacoes", "prazos", "documentos", "calculos", "chat"];

export type AbaDaConfiguracao = "escritorio" | "pecas" | "avisos" | "calendario" | "ia" | "plano" | "registro" | "dados";
/** As abas a que um endereço abre direto (o Asaas devolve a pessoa para `?aba=plano`). */
export const ABAS_DO_ENDERECO: readonly AbaDaConfiguracao[] = ["plano", "dados"];
