/**
 * O que a IA escreveu num campo de texto ou sugeriu como base legal: a procedência
 * (modelo e impressão das instruções, como nas análises e nas peças), o resultado
 * e se a pessoa usou. O texto só entra no campo com o clique em Usar; `usadoEm`
 * guarda esse clique.
 */
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { clientes, organizationId, processos, situacaoIa, tenantPolicy, type Procedencia } from "./dominio.ts";

export interface ConteudoDoTextoDaIa {
  texto?: string | null;
  dicas?: string[];
  /** O que o modelo escreveu e a conferência trocou por [a completar]. */
  trocados?: string[];
  fundamento?: string;
  explicacao?: string;
  recusa?: string;
}

export const textosDaIa = pgTable(
  "textos_da_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    /** "resultado-decisao", "mensagem-cliente", "instrucoes-peca", "resumo-atendimento", "observacoes" ou "base-legal". */
    campo: text("campo").notNull(),
    /** "escrever", "melhorar", "orientar" ou, na base legal, "sugerir". */
    modo: text("modo").notNull(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    situacao: situacaoIa("situacao").notNull(),
    conteudo: jsonb("conteudo").$type<ConteudoDoTextoDaIa>().notNull().default({}),
    erro: text("erro"),
    procedencia: jsonb("procedencia").$type<Procedencia>(),
    pedidaPor: text("pedida_por").references(() => user.id, { onDelete: "set null" }),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("textos_da_ia_dia_idx").on(t.organizationId, t.createdAt), tenantPolicy("textos_da_ia")],
).enableRLS();
