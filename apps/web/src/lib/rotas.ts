/** O que o roteador precisa saber das telas sem carregar as telas. */
export const VISTAS_DA_AGENDA = ["lista", "semana", "mes"] as const;
export type VistaDaAgenda = (typeof VISTAS_DA_AGENDA)[number];

export type AbaDoProcesso = "resumo" | "movimentacoes" | "prazos" | "documentos" | "honorarios" | "calculos" | "chat";
export const ABAS_DO_PROCESSO: readonly AbaDoProcesso[] = ["resumo", "movimentacoes", "prazos", "documentos", "honorarios", "calculos", "chat"];

/** As abas do painel da plataforma; a Visão geral é a de quando o endereço não diz. */
export const ABAS_DA_PLATAFORMA = ["visao", "escritorios", "planos", "faturas", "pessoas", "uso", "ia", "conversao", "acoes"] as const;
export type AbaDaPlataforma = (typeof ABAS_DA_PLATAFORMA)[number];

export type AbaDaConfiguracao = "escritorio" | "pecas" | "avisos" | "calendario" | "financeiro" | "ia" | "plano" | "registro" | "dados";
/** As abas a que um endereço abre direto (o Asaas devolve a pessoa para `?aba=plano`; a caixa de Publicações, sem busca, manda para `?aba=avisos`). */
export const ABAS_DO_ENDERECO: readonly AbaDaConfiguracao[] = ["plano", "dados", "avisos"];

/** Os filtros da tela do Financeiro; "abertas" é a de quando não se escolhe nenhuma. */
export const SITUACOES_DO_FINANCEIRO = ["abertas", "atraso", "pagas", "todas"] as const;
export type SituacaoDoFinanceiro = (typeof SITUACOES_DO_FINANCEIRO)[number];
