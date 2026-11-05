/**
 * O que o painel da plataforma guarda para si (ver `servicos/plataforma.ts` na API).
 *
 * - `acessos`: uma linha por pessoa, escritório e dia em que a pessoa usou o app. É dela que saem o
 *   último acesso, as pessoas ativas no dia, na semana e no mês, e o aparelho (celular ou computador).
 *   Tem RLS como todo o domínio; o painel lê pela função `plataforma_acessos`, que só devolve datas e ids.
 * - `fotos_da_plataforma`: os números do Decreta inteiro tirados uma vez por dia (MRR, escritórios por
 *   situação, pessoas). O banco só guarda a situação de hoje de cada escritório: sem a foto, não haveria
 *   como desenhar o MRR mês a mês. Só totais, nenhum dado de escritório. A aplicação não lê nem grava a
 *   tabela direto: passa pelas funções `plataforma_gravar_foto` e `plataforma_fotos`.
 */
import { date, index, pgTable, primaryKey, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { tenantPolicy } from "./dominio.ts";

export const acessos = pgTable(
  "acessos",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** O dia de São Paulo. */
    dia: date("dia", { mode: "string" }).notNull(),
    /** `celular` ou `computador`, pelo navegador do primeiro acesso do dia. */
    aparelho: text("aparelho").notNull(),
    primeiroEm: timestamp("primeiro_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId, t.dia] }), index("acessos_dia_idx").on(t.dia), tenantPolicy("acessos")],
).enableRLS();

/** Os números de um dia, como o painel os calculou (ver `NumerosDaFoto` na API). */
export type NumerosDaFoto = Record<string, number>;

export const fotosDaPlataforma = pgTable("fotos_da_plataforma", {
  dia: date("dia", { mode: "string" }).primaryKey(),
  numeros: jsonb("numeros").$type<NumerosDaFoto>().notNull(),
  tiradaEm: timestamp("tirada_em", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();
