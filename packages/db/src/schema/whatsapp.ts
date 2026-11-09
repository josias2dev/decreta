/**
 * O agente do Decreta no WhatsApp oficial (ver `apps/api/src/whatsapp`).
 *
 * - `whatsapp_vinculos`: o WhatsApp de cada pessoa, provado pelo código que ela mandou do próprio
 *   número. Sem RLS, como `member`: a mensagem chega antes de se saber o escritório.
 * - `whatsapp_codigos`: os códigos de ligar, só o hash, com validade curta e uso único. Sem RLS.
 * - `whatsapp_desconhecidos`: números sem vínculo que escreveram (o hash), para a resposta fixa
 *   sair no máximo uma vez a cada 30 dias. Sem RLS e sem o número.
 * - `whatsapp_mensagens`: o que entrou e saiu, com o status de entrega. Tem RLS; o status que a Meta
 *   manda depois acha o escritório pela função `whatsapp_escritorio_da_mensagem`.
 * - `propostas`: a única forma de o agente escrever. A IA propõe, o código congela o que será feito
 *   e a pessoa toca no botão. Tem RLS.
 */
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";
import { conversas, organizationId, tenantPolicy } from "./dominio.ts";

const criadoEm = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const mudadoEm = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const whatsappVinculos = pgTable(
  "whatsapp_vinculos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** 55 + DDD + número, como veio da Meta. */
    telefone: text("telefone").notNull(),
    /** O id da pessoa na Meta quando ela usa nome de usuário (o telefone pode não vir no webhook). */
    bsuid: text("bsuid"),
    /** O escritório das perguntas livres. Quem é de mais de um troca pela lista. */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    verificadoEm: timestamp("verificado_em", { withTimezone: true }).notNull().defaultNow(),
    /** Passou daqui, o agente só manda o aviso para renovar: um WhatsApp tomado não fica com o vínculo para sempre. */
    renovarAte: timestamp("renovar_ate", { withTimezone: true }).notNull(),
    /** A última mensagem da pessoa: com menos de 24 h, a janela está aberta e sai texto livre. */
    ultimaEntradaEm: timestamp("ultima_entrada_em", { withTimezone: true }),
    /** A equipe do Decreta pausou o agente (suporte assumiu a conversa): chega, mas a IA não responde. */
    pausadoEm: timestamp("pausado_em", { withTimezone: true }),
    createdAt: criadoEm(),
    updatedAt: mudadoEm(),
  },
  (t) => [uniqueIndex("whatsapp_vinculos_user_uq").on(t.userId), uniqueIndex("whatsapp_vinculos_telefone_uq").on(t.telefone), uniqueIndex("whatsapp_vinculos_bsuid_uq").on(t.bsuid)],
);

export const whatsappCodigos = pgTable(
  "whatsapp_codigos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** sha256 do código, sem o "DECRETA" e sem o hífen. */
    hash: text("hash").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    createdAt: criadoEm(),
  },
  (t) => [uniqueIndex("whatsapp_codigos_hash_uq").on(t.hash), index("whatsapp_codigos_user_idx").on(t.userId)],
);

export const whatsappDesconhecidos = pgTable("whatsapp_desconhecidos", {
  /** sha256 do número: o Decreta não guarda o telefone de quem não é da equipe. */
  hash: text("hash").primaryKey(),
  respondidoEm: timestamp("respondido_em", { withTimezone: true }),
  mensagens: integer("mensagens").notNull().default(0),
  updatedAt: mudadoEm(),
});

export type DirecaoDaMensagem = "entrada" | "saida";
/** Entrada: recebida (esperando o turno) → respondida. Saída: enviando → enviada → entregue → lida, ou falhou. */
export type SituacaoDaMensagem = "recebida" | "respondida" | "ignorada" | "enviando" | "enviada" | "entregue" | "lida" | "falhou";
/** De onde a saída veio: a resposta do agente, um aviso (resumo, 15h, prazo curto), o suporte do Decreta ou o Laboratório. */
export type OrigemDaMensagem = "agente" | "aviso" | "suporte" | "laboratorio";

export const whatsappMensagens = pgTable(
  "whatsapp_mensagens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    /** O id da mensagem na Meta (nulo só na saída que ainda não saiu). */
    wamid: text("wamid"),
    /** A saída: a chave que impede a mesma mensagem de sair duas vezes quando a rotina repete o passo. */
    chave: text("chave"),
    direcao: text("direcao").$type<DirecaoDaMensagem>().notNull(),
    /** texto, escolha, audio, documento, botoes, lista, link, modelo... */
    tipo: text("tipo").notNull(),
    /** O que a pessoa escreveu ou o que o Decreta mandou, como ela vê. Apagado em 30 dias (`apagarConteudoAntigo`). */
    texto: text("texto"),
    /** Os botões, os itens da lista, o modelo e os parâmetros, o id da mídia que chegou. */
    detalhes: jsonb("detalhes").$type<Record<string, unknown>>(),
    situacao: text("situacao").$type<SituacaoDaMensagem>().notNull(),
    erro: text("erro"),
    origem: text("origem").$type<OrigemDaMensagem>(),
    /** A conversa do turno (na tela de conversas, cada turno mostra o que a IA consultou). */
    conversaId: uuid("conversa_id").references(() => conversas.id, { onDelete: "set null" }),
    /** A mensagem a que esta responde (o toque num botão traz a que tinha o botão). */
    responde: text("responde"),
    /** A categoria de cobrança que a Meta informou no status (service, utility, marketing, general_purpose_ai...). */
    categoria: text("categoria"),
    /**
     * Por que esta resposta precisa ser revista pela equipe do Decreta: a trava barrou ("trava: 24/04"), a
     * pessoa reagiu com 👎 ou disse que está errado. Cada revisão confirmada vira caso do avaliador.
     */
    revisao: text("revisao"),
    /** Quanto o turno levou, do começo até a resposta pronta (a primeira saída do turno). */
    duracaoMs: integer("duracao_ms"),
    createdAt: criadoEm(),
    updatedAt: mudadoEm(),
  },
  (t) => [
    uniqueIndex("whatsapp_mensagens_wamid_uq").on(t.wamid),
    uniqueIndex("whatsapp_mensagens_chave_uq").on(t.organizationId, t.chave),
    index("whatsapp_mensagens_pessoa_idx").on(t.organizationId, t.userId, t.createdAt),
    tenantPolicy("whatsapp_mensagens"),
  ],
).enableRLS();

export type TipoDeProposta = "confirmar_prazo" | "confirmar_e_ficar" | "outra_conta" | "sem_prazo" | "prazo_cumprido" | "desfazer_cumprido" | "criar_tarefa" | "aprovar_texto";
export type SituacaoDaProposta = "pendente" | "feita" | "recusada" | "vencida" | "substituida";

export const propostas = pgTable(
  "propostas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tipo: text("tipo").$type<TipoDeProposta>().notNull(),
    /** O que será feito, congelado na hora da proposta: o toque executa exatamente isto. */
    argumentos: jsonb("argumentos").$type<Record<string, unknown>>().notNull(),
    /** O texto que a pessoa viu ao tocar, montado pelo código. */
    texto: text("texto").notNull(),
    /** Como estava o que a proposta muda: mudou até o toque, a proposta não vale (alguém confirmou na tela, a IA releu). */
    impressao: text("impressao").notNull(),
    situacao: text("situacao").$type<SituacaoDaProposta>().notNull().default("pendente"),
    expiraEm: timestamp("expira_em", { withTimezone: true }).notNull(),
    decididaEm: timestamp("decidida_em", { withTimezone: true }),
    resultado: jsonb("resultado").$type<Record<string, unknown>>(),
    /** A mensagem que levou os botões. */
    wamid: text("wamid"),
    createdAt: criadoEm(),
  },
  (t) => [index("propostas_pessoa_idx").on(t.organizationId, t.userId, t.situacao, t.createdAt), tenantPolicy("propostas")],
).enableRLS();
