/**
 * O modo observar: o que um modelo ou prompt candidato leu de uma publicação,
 * guardado à parte para nunca chegar ao escritório. Só o necessário para
 * comparar com a decisão da pessoa: o resumo e o teor não ficam aqui.
 */
import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organizationId, publicacoes, situacaoIa, tenantPolicy, type Procedencia } from "./dominio.ts";

export interface LeituraDoCandidato {
  geraPrazo: boolean;
  tipo: string;
  dias: number | null;
  contagem: "uteis" | "corridos";
}

export const observacoesDaIa = pgTable(
  "observacoes_da_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    publicacaoId: uuid("publicacao_id")
      .notNull()
      .references(() => publicacoes.id, { onDelete: "cascade" }),
    /** O alias do modelo e, se houver prompt novo, a impressão dele. */
    candidato: text("candidato").notNull(),
    situacao: situacaoIa("situacao").notNull(),
    conteudo: jsonb("conteudo").$type<LeituraDoCandidato>(),
    erro: text("erro"),
    procedencia: jsonb("procedencia").$type<Procedencia>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("observacoes_da_ia_unica").on(t.publicacaoId, t.candidato), index("observacoes_da_ia_dia_idx").on(t.organizationId, t.createdAt), tenantPolicy("observacoes_da_ia")],
).enableRLS();
