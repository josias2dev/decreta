/**
 * Financeiro do escritório: honorários por caso, as parcelas e os pagamentos,
 * a cobrança pelo Asaas do próprio escritório, o alvará que vira honorário com
 * prestação de contas e repasse, e a assinatura eletrônica. Tem RLS como todo o
 * domínio.
 *
 * Todo valor é um número inteiro de centavos (`bigint`), nunca ponto flutuante.
 * Não existe coluna "recebido" nas parcelas: o recebido é a soma dos
 * pagamentos marcados, e é impossível aparecer recebido sem pagamento.
 */
import { sql } from "drizzle-orm";
import { bigint, boolean, date, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { alvaras, clientes, documentos, mensagensCliente, organizationId, processos, tenantPolicy } from "./dominio.ts";

const pessoa = (nome: string) => text(nome).references(() => user.id, { onDelete: "set null" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const centavos = (nome: string) => bigint(nome, { mode: "number" });

/* ------------------------------------------------------------------ */
/* Honorários                                                          */
/* ------------------------------------------------------------------ */

export const tipoDeContrato = pgEnum("tipo_contrato_honorarios", ["fixo", "mensal", "exito", "hibrido"]);
export const situacaoDoContrato = pgEnum("situacao_contrato_honorarios", ["ativo", "encerrado", "cancelado"]);
export const tipoDeParcela = pgEnum("tipo_parcela_honorarios", ["fixo", "mensal", "exito", "avulso"]);
export const formaDePagamento = pgEnum("forma_pagamento_honorarios", ["pix", "boleto", "cartao", "transferencia", "dinheiro", "retido_no_alvara", "outro"]);
export const origemDoPagamento = pgEnum("origem_pagamento_honorarios", ["manual", "asaas"]);

/** O contrato de honorários de um cliente ou de um processo: valor fixo, mensal, percentual de êxito ou híbrido. */
export const contratosHonorarios = pgTable(
  "contratos_honorarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "set null" }),
    titulo: text("titulo").notNull(),
    tipo: tipoDeContrato("tipo").notNull(),
    situacao: situacaoDoContrato("situacao").notNull().default("ativo"),
    /** O valor fixo combinado (a entrada, no híbrido), em centavos. */
    valorFixo: centavos("valor_fixo"),
    /** A mensalidade, em centavos. */
    mensalidade: centavos("mensalidade"),
    /** O percentual de êxito em pontos-base (30% = 3000). O valor só entra quando sai o resultado. */
    exitoBp: integer("exito_bp"),
    inicio: date("inicio", { mode: "string" }).notNull(),
    observacoes: text("observacoes"),
    /** O contrato escrito, na pasta do cliente. */
    documentoId: uuid("documento_id").references(() => documentos.id, { onDelete: "set null" }),
    /** Pix Automático da mensalidade, no Asaas do escritório: a autorização, a situação dela ("CREATED", "ACTIVE"...) e o QR Code para o cliente autorizar. */
    pixAutomaticoId: text("pix_automatico_id"),
    pixAutomaticoSituacao: text("pix_automatico_situacao"),
    pixAutomaticoQr: jsonb("pix_automatico_qr").$type<{ payload: string; imagem: string | null }>(),
    criadoPor: pessoa("criado_por"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("contratos_honorarios_cliente_idx").on(t.organizationId, t.clienteId),
    index("contratos_honorarios_processo_idx").on(t.organizationId, t.processoId),
    tenantPolicy("contratos_honorarios"),
  ],
).enableRLS();

/** Cada cobrança do contrato, com vencimento próprio. O êxito nasce sem valor e sem vencimento. */
export const parcelasHonorarios = pgTable(
  "parcelas_honorarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    contratoId: uuid("contrato_id")
      .notNull()
      .references(() => contratosHonorarios.id, { onDelete: "cascade" }),
    tipo: tipoDeParcela("tipo").notNull(),
    numero: integer("numero").notNull().default(1),
    descricao: text("descricao").notNull(),
    /** Em centavos. Nulo no êxito que ainda não tem resultado. */
    valor: centavos("valor"),
    vencimento: date("vencimento", { mode: "string" }),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    motivoCancelamento: text("motivo_cancelamento"),
    /** A cobrança emitida no Asaas do escritório: id, link de pagamento e a data que ela leva. */
    cobrancaProvedor: text("cobranca_provedor"),
    cobrancaId: text("cobranca_id"),
    cobrancaLink: text("cobranca_link"),
    cobrancaVencimento: date("cobranca_vencimento", { mode: "string" }),
    cobrancaEmitidaEm: timestamp("cobranca_emitida_em", { withTimezone: true }),
    cobrancaEmitidaPor: pessoa("cobranca_emitida_por"),
    /** O alvará de onde veio o honorário de êxito, e a prestação de contas que o calculou. */
    alvaraId: uuid("alvara_id").references(() => alvaras.id),
    prestacaoId: uuid("prestacao_id").references((): AnyPgColumn => prestacoesDeContas.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("parcelas_honorarios_contrato_idx").on(t.organizationId, t.contratoId),
    index("parcelas_honorarios_vencimento_idx").on(t.organizationId, t.vencimento),
    uniqueIndex("parcelas_honorarios_cobranca_uq").on(t.organizationId, t.cobrancaId).where(sql`${t.cobrancaId} is not null`),
    tenantPolicy("parcelas_honorarios"),
  ],
).enableRLS();

/**
 * Um pagamento marcado, por uma pessoa ou pela baixa do Asaas. O recebido do
 * escritório é a soma destes. Estornar não apaga: fica a data, quem e por quê.
 */
export const pagamentosHonorarios = pgTable(
  "pagamentos_honorarios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    parcelaId: uuid("parcela_id")
      .notNull()
      .references(() => parcelasHonorarios.id, { onDelete: "cascade" }),
    valor: centavos("valor").notNull(),
    pagoEm: date("pago_em", { mode: "string" }).notNull(),
    forma: formaDePagamento("forma").notNull().default("outro"),
    origem: origemDoPagamento("origem").notNull().default("manual"),
    /** O pagamento no provedor ("asaas:pay_123"): o mesmo pagamento nunca é baixado duas vezes. */
    externoId: text("externo_id"),
    observacao: text("observacao"),
    registradoPor: pessoa("registrado_por"),
    estornadoEm: timestamp("estornado_em", { withTimezone: true }),
    estornadoPor: pessoa("estornado_por"),
    motivoEstorno: text("motivo_estorno"),
    createdAt: createdAt(),
  },
  (t) => [
    index("pagamentos_honorarios_parcela_idx").on(t.organizationId, t.parcelaId),
    uniqueIndex("pagamentos_honorarios_externo_uq").on(t.organizationId, t.externoId).where(sql`${t.externoId} is not null`),
    tenantPolicy("pagamentos_honorarios"),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Cobrança e assinatura do escritório                                  */
/* ------------------------------------------------------------------ */

export type AmbienteDoProvedor = "sandbox" | "producao";

/** A régua de lembretes: cada passo é "N dias antes (negativo) ou depois do vencimento" e o texto que o escritório aprovou. */
export interface ReguaDeLembretes {
  ligada: boolean;
  passos: { dias: number; texto: string }[];
  aprovadaPor?: string | null;
  aprovadaEm?: string | null;
}

/**
 * As contas do escritório nos provedores: cada escritório usa o próprio Asaas e a
 * própria ZapSign. As chaves ficam cifradas (ver `cofre.ts` da API), nunca saem
 * pela API nem aparecem em log. Uma linha por escritório.
 */
export const cobrancaConfig = pgTable(
  "cobranca_config",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    asaasChave: text("asaas_chave"),
    asaasAmbiente: text("asaas_ambiente").$type<AmbienteDoProvedor>().notNull().default("producao"),
    /** O webhook que o Decreta criou no Asaas do escritório, e o hash do segredo que o Asaas manda de volta. */
    asaasWebhookId: text("asaas_webhook_id"),
    asaasWebhookTokenHash: text("asaas_webhook_token_hash"),
    asaasConferidaEm: timestamp("asaas_conferida_em", { withTimezone: true }),
    /** O escritório pode usar Pix Automático nas mensalidades (CNPJ ativo há mais de 6 meses). */
    pixAutomatico: boolean("pix_automatico").notNull().default(false),
    regua: jsonb("regua").$type<ReguaDeLembretes>().notNull().default({ ligada: false, passos: [] }),
    zapsignChave: text("zapsign_chave"),
    zapsignAmbiente: text("zapsign_ambiente").$type<AmbienteDoProvedor>().notNull().default("producao"),
    zapsignLigada: boolean("zapsign_ligada").notNull().default(false),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy("cobranca_config")],
).enableRLS();

/** Cada aviso do provedor (webhook) já tratado, por id: o mesmo evento chega mais de uma vez e é tratado uma só. */
export const eventosCobranca = pgTable(
  "eventos_cobranca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    provedor: text("provedor").notNull(),
    externoId: text("externo_id").notNull(),
    tipo: text("tipo").notNull(),
    /** O recurso do aviso (o id da cobrança no provedor). */
    recurso: text("recurso"),
    resultado: text("resultado"),
    recebidoEm: timestamp("recebido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("eventos_cobranca_uq").on(t.organizationId, t.provedor, t.externoId), index("eventos_cobranca_recurso_idx").on(t.organizationId, t.recurso), tenantPolicy("eventos_cobranca")],
).enableRLS();

/** O lembrete de cobrança de uma parcela: a mensagem em rascunho (que o advogado aprova) e o passo da régua que a gerou. */
export const lembretesDeCobranca = pgTable(
  "lembretes_de_cobranca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    parcelaId: uuid("parcela_id")
      .notNull()
      .references(() => parcelasHonorarios.id, { onDelete: "cascade" }),
    mensagemId: uuid("mensagem_id")
      .notNull()
      .references(() => mensagensCliente.id, { onDelete: "cascade" }),
    /** Nulo no lembrete pedido à mão. */
    passo: integer("passo"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("lembretes_de_cobranca_passo_uq").on(t.organizationId, t.parcelaId, t.passo).where(sql`${t.passo} is not null`),
    index("lembretes_de_cobranca_parcela_idx").on(t.organizationId, t.parcelaId),
    tenantPolicy("lembretes_de_cobranca"),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Do alvará ao honorário                                              */
/* ------------------------------------------------------------------ */

/**
 * A conta de um alvará sacado, confirmada por uma pessoa: o que caiu na conta, a
 * parte do honorário de êxito e a do cliente, com o percentual do contrato daquele
 * momento. É o que a prestação de contas em DOCX mostra.
 */
export const prestacoesDeContas = pgTable(
  "prestacoes_de_contas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    alvaraId: uuid("alvara_id")
      .notNull()
      .references(() => alvaras.id),
    contratoId: uuid("contrato_id").references(() => contratosHonorarios.id, { onDelete: "set null" }),
    parcelaId: uuid("parcela_id").references((): AnyPgColumn => parcelasHonorarios.id, { onDelete: "set null" }),
    valorAlvara: centavos("valor_alvara").notNull(),
    valorRecebido: centavos("valor_recebido").notNull(),
    exitoBp: integer("exito_bp"),
    honorario: centavos("honorario").notNull(),
    cliente: centavos("cliente").notNull(),
    semContrato: boolean("sem_contrato").notNull().default(false),
    /** O honorário já ficou com o escritório no saque (marcado por quem confirmou). */
    retidoNoSaque: boolean("retido_no_saque").notNull().default(false),
    observacao: text("observacao"),
    confirmadaPor: pessoa("confirmada_por"),
    confirmadaEm: timestamp("confirmada_em", { withTimezone: true }).notNull().defaultNow(),
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    canceladaPor: pessoa("cancelada_por"),
    motivoCancelamento: text("motivo_cancelamento"),
    /** O último DOCX da prestação guardado na pasta do cliente. */
    documentoId: uuid("documento_id").references(() => documentos.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("prestacoes_de_contas_alvara_uq").on(t.organizationId, t.alvaraId).where(sql`${t.canceladaEm} is null`), index("prestacoes_de_contas_org_idx").on(t.organizationId, t.confirmadaEm), tenantPolicy("prestacoes_de_contas")],
).enableRLS();

/** O repasse da parte do cliente: data, valor, conta e favorecido. Pode ter mais de um favorecido por alvará. */
export const repassesDeAlvara = pgTable(
  "repasses_de_alvara",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    prestacaoId: uuid("prestacao_id")
      .notNull()
      .references(() => prestacoesDeContas.id, { onDelete: "cascade" }),
    favorecido: text("favorecido").notNull(),
    favorecidoDocumento: text("favorecido_documento"),
    /** Banco, agência e conta, ou a chave Pix, como a pessoa escreveu. */
    conta: text("conta").notNull(),
    valor: centavos("valor").notNull(),
    repassadoEm: date("repassado_em", { mode: "string" }).notNull(),
    observacao: text("observacao"),
    registradoPor: pessoa("registrado_por"),
    estornadoEm: timestamp("estornado_em", { withTimezone: true }),
    estornadoPor: pessoa("estornado_por"),
    motivoEstorno: text("motivo_estorno"),
    createdAt: createdAt(),
  },
  (t) => [index("repasses_de_alvara_prestacao_idx").on(t.organizationId, t.prestacaoId), tenantPolicy("repasses_de_alvara")],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Assinatura eletrônica                                               */
/* ------------------------------------------------------------------ */

export const situacaoDaAssinatura = pgEnum("situacao_assinatura", ["enviada", "assinada", "cancelada"]);

export interface Signatario {
  nome: string;
  email?: string;
  telefone?: string;
  /** Do provedor: "new", "link-opened" ou "signed". */
  situacao: string;
  link?: string;
}

/**
 * Um documento do escritório (contrato de honorários, procuração, termo de IA) enviado
 * para assinatura pela ZapSign do escritório. O arquivo assinado volta para a pasta do cliente.
 */
export const assinaturas = pgTable(
  "assinaturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    documentoId: uuid("documento_id")
      .notNull()
      .references(() => documentos.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    provedor: text("provedor").notNull().default("zapsign"),
    /** O token do documento no provedor. */
    token: text("token").notNull(),
    situacao: situacaoDaAssinatura("situacao").notNull().default("enviada"),
    signatarios: jsonb("signatarios").$type<Signatario[]>().notNull().default([]),
    enviadaPor: pessoa("enviada_por"),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }).notNull().defaultNow(),
    assinadaEm: timestamp("assinada_em", { withTimezone: true }),
    /** A cópia assinada, guardada na pasta do cliente. */
    documentoAssinadoId: uuid("documento_assinado_id").references(() => documentos.id, { onDelete: "set null" }),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("assinaturas_token_uq").on(t.organizationId, t.provedor, t.token), index("assinaturas_documento_idx").on(t.organizationId, t.documentoId), tenantPolicy("assinaturas")],
).enableRLS();
