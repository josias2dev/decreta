/**
 * Exportação dos dados do escritório: um sócio pede, uma rotina de fundo monta
 * os arquivos ZIP (planilhas CSV e os documentos) e os guarda no armazenamento
 * por alguns dias. Tem RLS como todo o domínio.
 */
import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.ts";
import { organizationId, tenantPolicy } from "./dominio.ts";

export const situacaoExportacao = pgEnum("situacao_exportacao", ["pedida", "pronta", "falhou"]);

/** Um arquivo ZIP da exportação. O escritório grande vira mais de um, para a memória do servidor aguentar. */
export interface ParteDaExportacao {
  /** 1, 2, 3... */
  n: number;
  nome: string;
  /** Onde está no armazenamento. */
  chave: string;
  tamanho: number;
}

export const exportacoes = pgTable(
  "exportacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    pedidaPor: text("pedida_por").references(() => user.id, { onDelete: "set null" }),
    situacao: situacaoExportacao("situacao").notNull().default("pedida"),
    partes: jsonb("partes").$type<ParteDaExportacao[]>().notNull().default([]),
    /** Quantos documentos do escritório entraram nos arquivos. */
    documentos: integer("documentos").notNull().default(0),
    erro: text("erro"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    prontaEm: timestamp("pronta_em", { withTimezone: true }),
    /** Os arquivos saem do armazenamento depois disso. */
    expiraEm: timestamp("expira_em", { withTimezone: true }),
  },
  (t) => [index("exportacoes_org_idx").on(t.organizationId, t.createdAt), tenantPolicy("exportacoes")],
).enableRLS();
