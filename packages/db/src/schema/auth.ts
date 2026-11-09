/**
 * Tabelas do Better Auth (núcleo + organizações + verificação em duas etapas).
 *
 * Os nomes das propriedades seguem os campos que o Better Auth espera: o
 * adapter do Drizzle mapeia por propriedade, não por coluna.
 *
 * Estas tabelas NÃO têm RLS: sessão e convite precisam ser lidos antes de se
 * saber qual é o escritório ativo. O isolamento por escritório começa no
 * domínio (ver `dominio.ts`).
 */
import type { DescontoDoEscritorio, FuncionalidadesDoPlano, LimitesDoPlano, MarcaDoEscritorio, TetosDaIaDoEscritorio } from "@decreta/core";
import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** A situação do escritório na assinatura (a mesma lista de `SITUACOES_DO_ESCRITORIO` em @decreta/core; um teste confere). Todo escritório que já existia nasce cortesia. */
export const situacaoDoEscritorio = pgEnum("situacao_do_escritorio", ["teste", "ativo", "inadimplente", "so_leitura", "bloqueado", "cancelado", "cortesia"]);

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** Plugin twoFactor: login pede o código do app autenticador. */
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  /** A versão dos Termos de Uso e da Política de Privacidade (`VERSAO_DOS_TERMOS`) que a pessoa aceitou ao criar a conta, e quando. Nulo nas contas anteriores ao aceite. */
  termosVersao: text("termos_versao"),
  termosAceitosEm: timestamp("termos_aceitos_em", { withTimezone: true }),
  /** Suspensa pela equipe do Decreta (abuso): não entra em escritório nenhum até ser reativada. O resto do escritório segue. */
  suspensaEm: timestamp("suspensa_em", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

/** Segredo TOTP e códigos de recuperação (cifrados pelo Better Auth). */
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * Os planos do Decreta, editados no painel da plataforma (ver `@decreta/core/plano.ts`). Sem RLS, como a
 * `organization`: o login e a moldura das telas leem o plano antes de saber o escritório, e nada aqui é de um
 * escritório. Só o painel grava, e nunca muda uma versão: mudar o preço cria a versão seguinte (`substituidoEm`
 * na anterior), e quem já assina continua na versão em que assinou.
 */
export const planos = pgTable(
  "planos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    codigo: text("codigo").notNull(),
    versao: integer("versao").notNull(),
    nome: text("nome").notNull(),
    mensalCentavos: integer("mensal_centavos"),
    anualCentavos: integer("anual_centavos"),
    pessoasIncluidas: integer("pessoas_incluidas"),
    pessoaExtraCentavos: integer("pessoa_extra_centavos"),
    limites: jsonb("limites").$type<LimitesDoPlano>().notNull().default({}),
    funcionalidades: jsonb("funcionalidades").$type<FuncionalidadesDoPlano>().notNull().default({}),
    padrao: boolean("padrao").notNull().default(false),
    criadoEm: timestamp("criado_em", { withTimezone: true }).notNull().defaultNow(),
    /** O e-mail do operador. Nulo no plano que a migração criou. */
    criadoPor: text("criado_por"),
    substituidoEm: timestamp("substituido_em", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("planos_codigo_versao_idx").on(t.codigo, t.versao),
    // Um plano padrão só, entre as versões vivas.
    uniqueIndex("planos_um_padrao_idx").on(t.padrao).where(sql`${t.padrao} and ${t.substituidoEm} is null`),
  ],
);

/** O tenant: um escritório de advocacia. */
export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: text("metadata"),
    timezone: text("timezone").notNull().default("America/Sao_Paulo"),
    /** Nasceu pelo cadastro aberto e ainda não foi liberado: tetos menores no que sai para terceiros e na IA (ver `servicos/em-avaliacao.ts`). */
    emAvaliacao: boolean("em_avaliacao").notNull().default(false),
    /**
     * Quando um sócio encerrou o escritório. Preenchido, ninguém entra, a captura e o WhatsApp
     * param, e os dados são apagados de vez 30 dias depois (`DIAS_ATE_APAGAR` na rotina de encerramento).
     */
    encerradoEm: timestamp("encerrado_em", { withTimezone: true }),

    /* A assinatura. Ficam aqui, e não numa tabela com RLS, porque a moldura das telas, o login e as rotinas
       precisam da situação antes de saber de qual escritório são (como `emAvaliacao` e `encerradoEm`). */
    /** A situação de base. A de hoje sai das datas abaixo (`estadoDaAssinatura`). Todo escritório anterior à cobrança é cortesia e nunca é travado. */
    situacao: situacaoDoEscritorio("situacao").notNull().default("cortesia"),
    /** O último dia do teste. Fica preenchido depois de o escritório assinar: é por ele que se conta a conversão do teste. */
    testeAte: date("teste_ate", { mode: "string" }),
    /** O vencimento da fatura em atraso mais antiga; nulo sem atraso. */
    inadimplenteDesde: date("inadimplente_desde", { mode: "string" }),
    /** Quem cancelou: o último dia do período já pago. */
    acessoAte: date("acesso_ate", { mode: "string" }),
    cancelamentoPedidoEm: timestamp("cancelamento_pedido_em", { withTimezone: true }),
    /** A primeira mensalidade paga. */
    assinouEm: timestamp("assinou_em", { withTimezone: true }),
    /** O que o escritório paga por mês, em centavos, para o MRR. */
    valorMensalCentavos: integer("valor_mensal_centavos"),
    /** O link de assinatura do Asaas (a página de pagamento é dele: o Decreta nunca toca em dado de cartão) e o valor com que foi criado. */
    asaasLinkId: text("asaas_link_id"),
    asaasLinkUrl: text("asaas_link_url"),
    asaasLinkValorCentavos: integer("asaas_link_valor_centavos"),
    asaasClienteId: text("asaas_cliente_id"),
    /** A assinatura viva. Cancelada, volta a nulo e o id passa para `asaasAssinaturasEncerradas`. */
    asaasAssinaturaId: text("asaas_assinatura_id"),
    /** As assinaturas que já acabaram: um aviso atrasado delas não reabre nada nem desfaz o cancelamento. */
    asaasAssinaturasEncerradas: text("asaas_assinaturas_encerradas").array().notNull().default(sql`'{}'::text[]`),
    /** Quando a emissão automática de NFS-e foi configurada na assinatura do Asaas (só com `NFSE_ATIVA`). */
    nfseConfiguradaEm: timestamp("nfse_configurada_em", { withTimezone: true }),
    /** O valor que a assinatura viva cobra no Asaas, para a rotina saber quando o plano ou o desconto mudaram o preço. */
    asaasAssinaturaValorCentavos: integer("asaas_assinatura_valor_centavos"),

    /* A licença: plano + pessoas a mais + o que a equipe combinou. Muda só pelo painel da plataforma. */
    /** A versão do plano. Nula: o plano padrão. */
    planoId: uuid("plano_id").references(() => planos.id, { onDelete: "restrict" }),
    pessoasExtras: integer("pessoas_extras").notNull().default(0),
    /** O valor combinado com a equipe, no lugar do preço do plano. */
    valorCombinadoCentavos: integer("valor_combinado_centavos"),
    /** O desconto por um número de meses (dado pela equipe ou por um cupom). */
    desconto: jsonb("desconto").$type<DescontoDoEscritorio>(),
    /** Piloto, parceiro ou indicação: só para a equipe. */
    marca: text("marca").$type<MarcaDoEscritorio>(),
    /** Os tetos de IA próprios do escritório, acima ou abaixo do padrão. */
    tetosIa: jsonb("tetos_ia").$type<TetosDaIaDoEscritorio>(),
  },
  (t) => [index("organization_asaas_assinatura_idx").on(t.asaasAssinaturaId), index("organization_asaas_link_idx").on(t.asaasLinkId), index("organization_asaas_cliente_idx").on(t.asaasClienteId)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("member_org_idx").on(t.organizationId), index("member_user_idx").on(t.userId)],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("invitation_org_idx").on(t.organizationId)],
);
