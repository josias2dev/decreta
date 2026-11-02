/**
 * Eventos do funil (visita, cadastro, primeira publicação...): só o nome, o
 * instante e, quando houver, o escritório. Nenhum dado pessoal: sem cookie,
 * sem IP, sem identificador de pessoa.
 *
 * O servidor só escreve aqui: a política deixa a aplicação inserir (do site, sem
 * escritório, ou do próprio escritório da transação) e não deixa ler nenhuma linha.
 * Quem lê é a função `contagem_de_eventos`, que devolve só totais por nome.
 * O evento de um escritório que foi apagado fica, sem o escritório (`set null`):
 * os totais do funil continuam certos.
 */
import { sql } from "drizzle-orm";
import { index, pgPolicy, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization } from "./auth.ts";
import { appUser } from "./dominio.ts";

export const eventos = pgTable(
  "eventos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nome: text("nome").notNull(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("eventos_nome_em_idx").on(t.nome, t.em),
    // Os eventos do servidor valem uma vez por escritório; os do site (sem escritório) se repetem.
    uniqueIndex("eventos_uma_vez_por_escritorio").on(t.organizationId, t.nome),
    pgPolicy("eventos_insercao", {
      as: "permissive",
      for: "insert",
      to: appUser,
      withCheck: sql`organization_id is null or organization_id = current_setting('app.org_id', true)`,
    }),
  ],
).enableRLS();
