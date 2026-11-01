/**
 * Cálculos do escritório: a atualização monetária, a revisional bancária e o
 * resumo do PJe-Calc. Guardam o que foi pedido (`entrada`), o que saiu
 * (`resultado`) e a memória de cálculo em Markdown simples, a mesma que vira
 * DOCX no timbre e entra no pedido da peça. Tem RLS como todo o domínio.
 */
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { documentos, organizationId, processos, tenantPolicy } from "./dominio.ts";

export const tipoCalculo = pgEnum("tipo_calculo", ["atualizacao", "revisional", "pjecalc"]);

export const calculos = pgTable(
  "calculos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    tipo: tipoCalculo("tipo").notNull(),
    titulo: text("titulo").notNull(),
    entrada: jsonb("entrada").$type<Record<string, unknown>>().notNull().default({}),
    resultado: jsonb("resultado").$type<Record<string, unknown>>().notNull().default({}),
    /** A memória de cálculo em Markdown simples (o formato das peças). */
    memoria: text("memoria").notNull(),
    /** O DOCX da memória anexado ao processo, ou o relatório do PJe-Calc. */
    documentoId: uuid("documento_id").references(() => documentos.id, { onDelete: "set null" }),
    criadoPor: text("criado_por").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("calculos_processo_idx").on(t.organizationId, t.processoId, t.createdAt), tenantPolicy("calculos")],
).enableRLS();
