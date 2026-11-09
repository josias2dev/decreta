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
 * - `ajustes_da_plataforma`, `cupons` e `notas_da_plataforma`: o que o painel guarda da equipe do Decreta. Têm RLS
 *   que só deixa ler e gravar FORA de um escritório (`foraDeEscritorio`): dentro da transação de um escritório
 *   (`withTenant`), elas não existem. As notas são da equipe sobre o escritório, e o escritório nunca as vê.
 */
import { sql } from "drizzle-orm";
import { date, index, integer, pgPolicy, pgTable, primaryKey, text, timestamp, jsonb, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { appUser, tenantPolicy } from "./dominio.ts";

/** Lê e grava só quem não está dentro de um escritório: o painel da plataforma e as rotinas, nunca uma rota das telas. */
const foraDeEscritorio = (tabela: string) => {
  const fora = sql`coalesce(current_setting('app.org_id', true), '') = ''`;
  return pgPolicy(`${tabela}_fora_de_escritorio`, { as: "permissive", for: "all", to: appUser, using: fora, withCheck: fora });
};

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

/** Os ajustes que o dono muda no painel (ver `AJUSTES_DA_PLATAFORMA` em @decreta/core). Só o que foi mudado: sem linha, vale o padrão do `.env`. */
export const ajustesDaPlataforma = pgTable(
  "ajustes_da_plataforma",
  {
    chave: text("chave").primaryKey(),
    valor: jsonb("valor").$type<number>().notNull(),
    mudadoPor: text("mudado_por").notNull(),
    mudadoEm: timestamp("mudado_em", { withTimezone: true }).notNull().defaultNow(),
  },
  () => [foraDeEscritorio("ajustes_da_plataforma")],
).enableRLS();

/** Os cupons de desconto: para parceiros (uma subseção da OAB) e para indicação entre escritórios. */
export const cupons = pgTable(
  "cupons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Em maiúsculas, sem espaço (`normalizarCodigoDoCupom`). */
    codigo: text("codigo").notNull().unique(),
    /** `percentual` (de 1 a 100) ou `valor` (em centavos). */
    tipo: text("tipo").$type<"percentual" | "valor">().notNull(),
    valor: integer("valor").notNull(),
    meses: integer("meses").notNull(),
    validoAte: date("valido_ate", { mode: "string" }),
    limiteDeUsos: integer("limite_de_usos"),
    usos: integer("usos").notNull().default(0),
    nota: text("nota"),
    criadoPor: text("criado_por").notNull(),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    desativadoEm: timestamp("desativado_em", { withTimezone: true }),
  },
  () => [foraDeEscritorio("cupons")],
).enableRLS();

/** As anotações da equipe sobre um escritório, como um CRM leve: com quem falar, o próximo passo e quando voltar. */
export const notasDaPlataforma = pgTable(
  "notas_da_plataforma",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    operador: text("operador").notNull(),
    texto: text("texto").notNull(),
    contato: text("contato"),
    proximoPasso: text("proximo_passo"),
    /** O dia de voltar a falar com o escritório: entra em "Precisa de atenção hoje". */
    retornoEm: date("retorno_em", { mode: "string" }),
    retornoFeitoEm: timestamp("retorno_feito_em", { withTimezone: true }),
    criadaEm: timestamp("criada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notas_da_plataforma_org_idx").on(t.organizationId, t.criadaEm), foraDeEscritorio("notas_da_plataforma")],
).enableRLS();
