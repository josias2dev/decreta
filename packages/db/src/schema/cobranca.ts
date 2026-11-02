/**
 * A cobrança da assinatura (ver `servicos/cobranca.ts` na API).
 *
 * - `faturas`: as mensalidades do escritório, como o Asaas avisou. Tem RLS como todo o domínio.
 * - `eventos_de_cobranca`: os avisos (webhooks) do Asaas já tratados, um por id. É o que faz um aviso
 *   repetido não mudar nada. Também tem RLS: o escritório vem do próprio aviso.
 * - `auditoria_da_plataforma`: o que a equipe do Decreta fez em cada escritório pelo painel da
 *   plataforma. A aplicação só grava; quem lê é a função `plataforma_auditoria`.
 *
 * O Decreta guarda o valor, o vencimento, a situação e o link da fatura. Nenhum dado de cartão passa por aqui.
 */
import { sql } from "drizzle-orm";
import { date, index, integer, jsonb, pgEnum, pgPolicy, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { appUser, organizationId, tenantPolicy } from "./dominio.ts";

export const situacaoDaFatura = pgEnum("situacao_da_fatura", ["pendente", "paga", "atrasada", "estornada", "removida"]);

export const faturas = pgTable(
  "faturas",
  {
    /** O id da cobrança no Asaas (`pay_...`). */
    id: text("id").primaryKey(),
    organizationId: organizationId(),
    vencimento: date("vencimento", { mode: "string" }).notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    situacao: situacaoDaFatura("situacao").notNull().default("pendente"),
    /** `boleto`, `pix`, `cartao` ou `indefinida` (o cliente escolhe na página do Asaas). */
    forma: text("forma"),
    /** A página da fatura no Asaas, onde se paga e se escolhe a forma de pagamento. */
    link: text("link"),
    pagaEm: date("paga_em", { mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("faturas_org_idx").on(t.organizationId, t.vencimento), tenantPolicy("faturas")],
).enableRLS();

export const eventosDeCobranca = pgTable(
  "eventos_de_cobranca",
  {
    /** O id do aviso, do Asaas. */
    id: text("id").primaryKey(),
    organizationId: organizationId(),
    evento: text("evento").notNull(),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("eventos_de_cobranca_org_idx").on(t.organizationId, t.recebidoEm), tenantPolicy("eventos_de_cobranca")],
).enableRLS();

export const auditoriaDaPlataforma = pgTable(
  "auditoria_da_plataforma",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** O e-mail do operador que agiu. */
    operador: text("operador").notNull(),
    acao: text("acao").notNull(),
    /** O escritório que sofreu a ação; some junto com ele (a ação fica, sem o escritório). */
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    detalhes: jsonb("detalhes").$type<Record<string, unknown>>().notNull().default({}),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("auditoria_da_plataforma_em_idx").on(t.em),
    pgPolicy("auditoria_da_plataforma_insercao", { as: "permissive", for: "insert", to: appUser, withCheck: sql`true` }),
  ],
).enableRLS();
