/**
 * Acervo de jurisprudência e legislação: temas do STJ, precedentes do BNP e
 * leis do normas.leg.br. São dados públicos e iguais para todos os escritórios,
 * por isso, ao contrário do domínio, estas tabelas não têm `organization_id`
 * nem RLS. Nada de cliente ou de escritório entra aqui; o que cada escritório
 * conferiu fica na peça (`pecas.verificacao`).
 */
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Um tema ou precedente, pela chave da citação: "tema:STJ:952", "sumula:STJ:297", "sumula_vinculante:STF:13", "irdr:TJSC:37". */
export const acervoDocumentos = pgTable(
  "acervo_documentos",
  {
    chave: text("chave").primaryKey(),
    /** "stj_dados_abertos" ou "cnj_bnp". */
    fonte: text("fonte").notNull(),
    /** Como a fonte escreve: "Trânsito em Julgado", "Vigente", "Cancelado"… */
    situacao: text("situacao").notNull(),
    cancelado: boolean("cancelado").notNull().default(false),
    /** A tese ou o enunciado. */
    texto: text("texto"),
    /** A questão submetida a julgamento (BNP): o que o radar cruza com o assunto dos processos. */
    questao: text("questao"),
    url: text("url").notNull(),
    /** sha256 da situação e do texto: prova o que o Decreta mostrou. */
    hash: text("hash").notNull(),
    atualizadoNaFonte: text("atualizado_na_fonte"),
    capturadoEm: timestamp("capturado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  // A busca do Perguntar (modo Jurisprudência) na tese e na questão: a mesma expressão de `vetorDoAcervo` na API.
  (t) => [index("acervo_documentos_busca_idx").using("gin", sql`to_tsvector('portuguese', coalesce(${t.texto}, '') || ' ' || coalesce(${t.questao}, ''))`)],
);

export interface DispositivoNoAcervo {
  texto: string;
  revogado: boolean;
  desde: string | null;
  url: string;
}

/** Uma lei pela sigla da citação ("CPC", "LEI-12527-2011"), com o texto em vigor de cada dispositivo. */
export const acervoNormas = pgTable("acervo_normas", {
  sigla: text("sigla").primaryKey(),
  urn: text("urn").notNull(),
  nome: text("nome").notNull(),
  apelido: text("apelido"),
  url: text("url").notNull(),
  /** Nem toda norma vem por dispositivo no normas.leg.br (a CLT e o CDC, não). */
  porDispositivo: boolean("por_dispositivo").notNull(),
  dispositivos: jsonb("dispositivos").$type<Record<string, DispositivoNoAcervo>>().notNull().default({}),
  atualizadoNaFonte: text("atualizado_na_fonte"),
  capturadoEm: timestamp("capturado_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * As espécies do BNP já carregadas ("STF/RG", "TJSC/IRDR"). A primeira carga de
 * uma espécie é a base do radar: só o que aparece ou muda depois vira novidade.
 */
export const acervoSincronizacoes = pgTable("acervo_sincronizacoes", {
  especie: text("especie").primaryKey(),
  primeiraEm: timestamp("primeira_em", { withTimezone: true }).notNull().defaultNow(),
  ultimaEm: timestamp("ultima_em", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * O que mudou no BNP desde a última sincronização: precedente novo ou situação
 * nova ("Admitido", "Acórdão Publicado", "Cancelado"). É daqui que o radar parte.
 */
export const acervoNovidades = pgTable(
  "acervo_novidades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chave: text("chave").notNull(),
    /** Vazia quando o precedente é novo no acervo. */
    situacaoAntes: text("situacao_antes"),
    situacao: text("situacao").notNull(),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("acervo_novidades_em_idx").on(t.em)],
);
