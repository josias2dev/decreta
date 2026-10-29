/**
 * Domínio do escritório.
 *
 * Toda tabela daqui carrega `organization_id` e tem RLS: o papel `app_user`
 * (com que a aplicação conecta) só enxerga as linhas do escritório gravado em
 * `app.org_id` na transação corrente (ver `withTenant` em `../client.ts`).
 * Sem `app.org_id` a política não casa nada: esquecer o escopo devolve zero
 * linhas em vez de vazar dados de outro escritório.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgPolicy,
  pgRole,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { organization, user } from "./auth.ts";

/** Papel sem login criado na migration 0000; o usuário de conexão herda dele. */
export const appUser = pgRole("app_user").existing();

const tenantMatch = sql`organization_id = current_setting('app.org_id', true)`;

/** Política única por tabela: lê e grava só dentro do escritório ativo. */
export function tenantPolicy(table: string) {
  return pgPolicy(`${table}_tenant_isolation`, { as: "permissive", for: "all", to: appUser, using: tenantMatch, withCheck: tenantMatch });
}

export function organizationId() {
  return text("organization_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });
}

/** Pessoa do escritório (usuário do Better Auth). Some quem sai: o registro fica sem responsável. */
const pessoa = (nome: string) => text(nome).references(() => user.id, { onDelete: "set null" });

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Escritório e equipe                                                 */
/* ------------------------------------------------------------------ */

export interface Timbre {
  /** Nome que vai no cabeçalho das peças (ex.: "Souza & Mendes Advocacia"). */
  nome: string;
  /** OAB da sociedade (ex.: "OAB/SC 1.234"). */
  registro?: string;
  endereco?: string;
  contato?: string;
  /** Fonte do corpo do texto. */
  fonte?: "Arial" | "Times New Roman" | "Calibri" | "Garamond";
  tamanho?: number;
  /** Cor de destaque do cabeçalho, em hexadecimal. */
  cor?: string;
  /** Logo em PNG, guardado nos documentos do escritório. */
  logoDocumentoId?: string;
}

export interface Avisos {
  /** Resumo da manhã no WhatsApp de cada pessoa (com o número cadastrado). */
  manha: boolean;
  /** Hora local do resumo, "07:30". */
  hora: string;
}

/** Configuração do escritório, uma linha por organização. */
export const escritorios = pgTable(
  "escritorios",
  {
    organizationId: text("organization_id")
      .primaryKey()
      .references(() => organization.id, { onDelete: "cascade" }),
    /** Tribunal principal (calendário padrão de prazos). */
    tribunal: text("tribunal").notNull().default("TJSC"),
    timbre: jsonb("timbre").$type<Timbre>(),
    avisos: jsonb("avisos").$type<Avisos>().notNull().default({ manha: true, hora: "07:30" }),
    /** Captura diária do DJEN pelas OABs da equipe. */
    capturaDjen: boolean("captura_djen").notNull().default(true),
    /** Atualização dos andamentos pelo DataJud. */
    capturaDatajud: boolean("captura_datajud").notNull().default(true),
    updatedAt: updatedAt(),
  },
  () => [tenantPolicy("escritorios")],
).enableRLS();

/** O que o escritório sabe de cada pessoa da equipe além do login. */
export const equipe = pgTable(
  "equipe",
  {
    organizationId: organizationId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Como aparece nas listas ("Beatriz"). */
    apelido: text("apelido"),
    /** "Advogada · sócia", "Estagiário". */
    cargo: text("cargo"),
    oabNumero: text("oab_numero"),
    oabUf: text("oab_uf"),
    /** WhatsApp para o resumo da manhã, 55 + DDD + número. */
    whatsapp: text("whatsapp"),
    avisoManha: boolean("aviso_manha").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.organizationId, t.userId] }), tenantPolicy("equipe")],
).enableRLS();

/** Feriado municipal ou ato do tribunal que o calendário nacional não conhece. */
export const tipoSuspensao = pgEnum("tipo_suspensao", ["local", "forense", "recesso", "reduzido"]);

export const suspensoes = pgTable(
  "suspensoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    dia: date("dia", { mode: "string" }).notNull(),
    motivo: text("motivo").notNull(),
    tipo: tipoSuspensao("tipo").notNull().default("local"),
    /** Vazio: vale para todos os tribunais. */
    tribunal: text("tribunal"),
    /** Vazio: vale para todas as comarcas. */
    comarca: text("comarca"),
    createdAt: createdAt(),
  },
  (t) => [index("suspensoes_dia_idx").on(t.organizationId, t.dia), tenantPolicy("suspensoes")],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Clientes e casos                                                    */
/* ------------------------------------------------------------------ */

export const tipoPessoa = pgEnum("tipo_pessoa", ["pf", "pj"]);

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    nome: text("nome").notNull(),
    tipo: tipoPessoa("tipo").notNull().default("pf"),
    /** CPF ou CNPJ, só dígitos. */
    documento: text("documento"),
    telefone: text("telefone"),
    email: text("email"),
    endereco: text("endereco"),
    observacoes: text("observacoes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("clientes_nome_idx").on(t.organizationId, sql`lower(${t.nome})`),
    index("clientes_documento_idx").on(t.organizationId, t.documento),
    tenantPolicy("clientes"),
  ],
).enableRLS();

export const tipoCaso = pgEnum("tipo_caso", ["judicial", "extrajudicial"]);
export const situacaoProcesso = pgEnum("situacao_processo", ["ativo", "suspenso", "arquivado", "encerrado"]);
export const polo = pgEnum("polo", ["ativo", "passivo", "terceiro"]);

export const processos = pgTable(
  "processos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    /** Número CNJ com máscara. Vazio nos casos extrajudiciais. */
    cnj: text("cnj"),
    /** "Marina Duarte × Seguradora Alfa S.A." */
    titulo: text("titulo").notNull(),
    tipo: tipoCaso("tipo").notNull().default("judicial"),
    tribunal: text("tribunal"),
    classe: text("classe"),
    assunto: text("assunto"),
    /** Órgão julgador ("2ª Vara Cível"). */
    orgao: text("orgao"),
    comarca: text("comarca"),
    valorCausa: numeric("valor_causa", { precision: 14, scale: 2 }),
    situacao: situacaoProcesso("situacao").notNull().default("ativo"),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** De que lado o cliente está. */
    poloCliente: polo("polo_cliente").notNull().default("ativo"),
    responsavelId: pessoa("responsavel_id"),
    distribuidoEm: date("distribuido_em", { mode: "string" }),
    ultimaMovimentacaoEm: timestamp("ultima_movimentacao_em", { withTimezone: true }),
    datajudEm: timestamp("datajud_em", { withTimezone: true }),
    segredo: boolean("segredo").notNull().default(false),
    observacoes: text("observacoes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("processos_cnj_uq").on(t.organizationId, t.cnj),
    index("processos_cliente_idx").on(t.organizationId, t.clienteId),
    index("processos_responsavel_idx").on(t.organizationId, t.responsavelId),
    tenantPolicy("processos"),
  ],
).enableRLS();

export const partes = pgTable(
  "partes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    polo: polo("polo").notNull(),
    /** "Autora", "Ré", "Perito". */
    papel: text("papel"),
    documento: text("documento"),
    advogados: text("advogados"),
    /** É o cliente do escritório. */
    cliente: boolean("cliente").notNull().default(false),
    ordem: integer("ordem").notNull().default(0),
  },
  (t) => [index("partes_processo_idx").on(t.organizationId, t.processoId), tenantPolicy("partes")],
).enableRLS();

export const fonte = pgEnum("fonte", ["djen", "datajud", "manual"]);

export const movimentacoes = pgTable(
  "movimentacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    em: timestamp("em", { withTimezone: true }).notNull(),
    /** Número do evento no processo eletrônico, quando se sabe. */
    evento: integer("evento"),
    titulo: text("titulo").notNull(),
    descricao: text("descricao"),
    fonte: fonte("fonte").notNull().default("manual"),
    /** Código da tabela processual unificada do CNJ. */
    codigo: integer("codigo"),
    /** Identidade da movimentação na fonte: a captura não grava a mesma duas vezes. */
    chave: text("chave").notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("movimentacoes_chave_uq").on(t.organizationId, t.processoId, t.chave),
    index("movimentacoes_processo_idx").on(t.organizationId, t.processoId, t.em),
    tenantPolicy("movimentacoes"),
  ],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Publicações e prazos                                                */
/* ------------------------------------------------------------------ */

/** nova: chegou; pendente: alguém abriu e deixou para depois; lida: não gera prazo; vinculada: virou prazo ou audiência. */
export const situacaoPublicacao = pgEnum("situacao_publicacao", ["nova", "pendente", "lida", "vinculada"]);

export interface Destinatario {
  nome: string;
  polo?: string;
}

export interface AdvogadoIntimado {
  nome: string;
  oab?: string;
  uf?: string;
}

export const publicacoes = pgTable(
  "publicacoes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    fonte: fonte("fonte").notNull().default("djen"),
    /** Id da comunicação no DJEN. */
    idExterno: text("id_externo").notNull(),
    disponibilizadaEm: date("disponibilizada_em", { mode: "string" }).notNull(),
    publicadaEm: date("publicada_em", { mode: "string" }).notNull(),
    tribunal: text("tribunal"),
    orgao: text("orgao"),
    /** "Intimação", "Citação", "Edital". */
    tipoComunicacao: text("tipo_comunicacao"),
    /** "Despacho", "Decisão", "Sentença". */
    tipoDocumento: text("tipo_documento"),
    classe: text("classe"),
    cnj: text("cnj"),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "set null" }),
    texto: text("texto").notNull(),
    destinatarios: jsonb("destinatarios").$type<Destinatario[]>().notNull().default([]),
    advogados: jsonb("advogados").$type<AdvogadoIntimado[]>().notNull().default([]),
    link: text("link"),
    situacao: situacaoPublicacao("situacao").notNull().default("nova"),
    tratadaPor: pessoa("tratada_por"),
    tratadaEm: timestamp("tratada_em", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("publicacoes_externo_uq").on(t.organizationId, t.fonte, t.idExterno),
    index("publicacoes_situacao_idx").on(t.organizationId, t.situacao, t.disponibilizadaEm),
    index("publicacoes_processo_idx").on(t.organizationId, t.processoId),
    tenantPolicy("publicacoes"),
  ],
).enableRLS();

export const contagem = pgEnum("contagem", ["uteis", "corridos"]);
export const situacaoPrazo = pgEnum("situacao_prazo", ["aberto", "cumprido", "descartado"]);
export const origemPrazo = pgEnum("origem_prazo", ["ia", "manual"]);

export interface DiaDesconsiderado {
  dia: string;
  nome: string;
  tipo: string;
}

export const prazos = pgTable(
  "prazos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    publicacaoId: uuid("publicacao_id").references(() => publicacoes.id, { onDelete: "set null" }),
    /** "Manifestação sobre laudo pericial". */
    tipo: text("tipo").notNull(),
    /** "art. 477, § 1º, CPC". */
    fundamento: text("fundamento"),
    dias: integer("dias").notNull(),
    contagem: contagem("contagem").notNull().default("uteis"),
    publicadoEm: date("publicado_em", { mode: "string" }).notNull(),
    inicio: date("inicio", { mode: "string" }).notNull(),
    fim: date("fim", { mode: "string" }).notNull(),
    /** O que ficou fora da conta, para mostrar e auditar. */
    desconsiderados: jsonb("desconsiderados").$type<DiaDesconsiderado[]>().notNull().default([]),
    situacao: situacaoPrazo("situacao").notNull().default("aberto"),
    origem: origemPrazo("origem").notNull().default("manual"),
    responsavelId: pessoa("responsavel_id"),
    /** A data final é sempre confirmada por uma pessoa. */
    confirmadoPor: pessoa("confirmado_por"),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }),
    cumpridoPor: pessoa("cumprido_por"),
    cumpridoEm: timestamp("cumprido_em", { withTimezone: true }),
    motivoDescarte: text("motivo_descarte"),
    observacoes: text("observacoes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("prazos_fim_idx").on(t.organizationId, t.situacao, t.fim),
    index("prazos_processo_idx").on(t.organizationId, t.processoId),
    index("prazos_responsavel_idx").on(t.organizationId, t.responsavelId, t.situacao),
    tenantPolicy("prazos"),
  ],
).enableRLS();

export const situacaoAudiencia = pgEnum("situacao_audiencia", ["marcada", "realizada", "cancelada", "redesignada"]);

export interface ItemDeChecklist {
  texto: string;
  feito: boolean;
}

export const audiencias = pgTable(
  "audiencias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    publicacaoId: uuid("publicacao_id").references(() => publicacoes.id, { onDelete: "set null" }),
    em: timestamp("em", { withTimezone: true }).notNull(),
    /** "Conciliação", "Instrução e julgamento". */
    tipo: text("tipo").notNull(),
    /** Por vídeo: o link; presencial: o endereço. */
    local: text("local"),
    porVideo: boolean("por_video").notNull().default(false),
    responsavelId: pessoa("responsavel_id"),
    situacao: situacaoAudiencia("situacao").notNull().default("marcada"),
    checklist: jsonb("checklist").$type<ItemDeChecklist[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("audiencias_em_idx").on(t.organizationId, t.em), index("audiencias_processo_idx").on(t.organizationId, t.processoId), tenantPolicy("audiencias")],
).enableRLS();

export const tarefas = pgTable(
  "tarefas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    titulo: text("titulo").notNull(),
    detalhe: text("detalhe"),
    dia: date("dia", { mode: "string" }).notNull(),
    responsavelId: pessoa("responsavel_id"),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    negocioId: uuid("negocio_id").references((): AnyPgColumn => negocios.id, { onDelete: "cascade" }),
    concluidaEm: timestamp("concluida_em", { withTimezone: true }),
    criadaPor: pessoa("criada_por"),
    createdAt: createdAt(),
  },
  (t) => [index("tarefas_dia_idx").on(t.organizationId, t.dia), tenantPolicy("tarefas")],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Documentos, peças e IA                                              */
/* ------------------------------------------------------------------ */

export const origemDocumento = pgEnum("origem_documento", ["upload", "peca", "captura"]);

export const documentos = pgTable(
  "documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    /** Onde o arquivo está no armazenamento (disco ou R2). */
    chave: text("chave").notNull(),
    /** Texto extraído (PDF, DOCX), para a IA e a busca. */
    texto: text("texto"),
    origem: origemDocumento("origem").notNull().default("upload"),
    evento: integer("evento"),
    enviadoPor: pessoa("enviado_por"),
    createdAt: createdAt(),
  },
  (t) => [
    index("documentos_processo_idx").on(t.organizationId, t.processoId),
    index("documentos_cliente_idx").on(t.organizationId, t.clienteId),
    tenantPolicy("documentos"),
  ],
).enableRLS();

export const situacaoPeca = pgEnum("situacao_peca", ["rascunho", "revisada"]);

export const pecas = pgTable(
  "pecas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    prazoId: uuid("prazo_id").references(() => prazos.id, { onDelete: "set null" }),
    /** Do catálogo ("Manifestação sobre laudo pericial"). */
    tipo: text("tipo").notNull(),
    titulo: text("titulo").notNull(),
    instrucoes: text("instrucoes"),
    /** Texto da peça em Markdown simples (títulos, parágrafos, listas, negrito). */
    texto: text("texto").notNull().default(""),
    situacao: situacaoPeca("situacao").notNull().default("rascunho"),
    criadaPor: pessoa("criada_por"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pecas_processo_idx").on(t.organizationId, t.processoId), tenantPolicy("pecas")],
).enableRLS();

/** De quem é a análise: a IA sempre fala de alguma coisa do escritório. */
export const alvoIa = pgEnum("alvo_ia", ["processo", "prazo", "publicacao", "audiencia", "cliente", "atendimento"]);
export const situacaoIa = pgEnum("situacao_ia", ["pronto", "recusa", "erro"]);

/**
 * Saída da IA guardada: o briefing de um prazo, o resumo dos autos, a sugestão
 * de prazo de uma publicação. `base` é a impressão digital do que a IA leu;
 * mudou (movimentação nova), a tela mostra "desatualizado".
 */
export const analises = pgTable(
  "analises",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    alvo: alvoIa("alvo").notNull(),
    alvoId: uuid("alvo_id").notNull(),
    /** Ação da IA (o mesmo nome do `X-Gateway-Method`): "briefing-prazo", "resumo-autos"... */
    acao: text("acao").notNull(),
    situacao: situacaoIa("situacao").notNull(),
    conteudo: jsonb("conteudo").$type<Record<string, unknown>>().notNull().default({}),
    /** "DJEN · 28/10/2026", "Autos · eventos 85 a 89". */
    fonte: text("fonte"),
    base: text("base").notNull(),
    erro: text("erro"),
    pedidaPor: pessoa("pedida_por"),
    createdAt: createdAt(),
  },
  (t) => [index("analises_alvo_idx").on(t.organizationId, t.alvo, t.alvoId, t.acao, t.createdAt), tenantPolicy("analises")],
).enableRLS();

export const papelMensagem = pgEnum("papel_mensagem", ["pessoa", "ia"]);

/** Conversa com a IA: o chat do processo (com `processoId`) ou o Perguntar geral de cada pessoa. */
export const mensagensIa = pgTable(
  "mensagens_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    papel: papelMensagem("papel").notNull(),
    texto: text("texto").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("mensagens_ia_processo_idx").on(t.organizationId, t.processoId, t.createdAt), index("mensagens_ia_user_idx").on(t.organizationId, t.userId, t.createdAt), tenantPolicy("mensagens_ia")],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Atendimento, novos negócios e alvarás                               */
/* ------------------------------------------------------------------ */

export const canalAtendimento = pgEnum("canal_atendimento", ["presencial", "telefone", "whatsapp", "video", "email"]);

export const atendimentos = pgTable(
  "atendimentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "set null" }),
    em: timestamp("em", { withTimezone: true }).notNull().defaultNow(),
    canal: canalAtendimento("canal").notNull().default("presencial"),
    resumo: text("resumo").notNull(),
    autorId: pessoa("autor_id"),
    createdAt: createdAt(),
  },
  (t) => [index("atendimentos_cliente_idx").on(t.organizationId, t.clienteId, t.em), tenantPolicy("atendimentos")],
).enableRLS();

/** Situação da pasta de quem chegou: completa, faltam documentos, sem pasta. */
export const situacaoPasta = pgEnum("situacao_pasta", ["completa", "faltam_documentos", "sem_pasta"]);
export const etapaNegocio = pgEnum("etapa_negocio", ["triagem", "repassado", "concluido", "desistiu"]);

export const negocios = pgTable(
  "negocios",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    nome: text("nome").notNull(),
    telefone: text("telefone"),
    /** "Revisional de aposentadoria", "Indenização por acidente". */
    assunto: text("assunto").notNull(),
    area: text("area"),
    pasta: situacaoPasta("pasta").notNull().default("sem_pasta"),
    etapa: etapaNegocio("etapa").notNull().default("triagem"),
    checklist: jsonb("checklist").$type<ItemDeChecklist[]>().notNull().default([]),
    responsavelId: pessoa("responsavel_id"),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    observacoes: text("observacoes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("negocios_etapa_idx").on(t.organizationId, t.etapa), tenantPolicy("negocios")],
).enableRLS();

export const etapaAlvara = pgEnum("etapa_alvara", ["novo", "aguardando_saque", "sacado", "repassado", "finalizado"]);

export const alvaras = pgTable(
  "alvaras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    descricao: text("descricao").notNull(),
    valor: numeric("valor", { precision: 14, scale: 2 }).notNull(),
    /** O que caiu na conta depois do saque. */
    valorRecebido: numeric("valor_recebido", { precision: 14, scale: 2 }),
    etapa: etapaAlvara("etapa").notNull().default("novo"),
    expedidoEm: date("expedido_em", { mode: "string" }),
    sacadoEm: date("sacado_em", { mode: "string" }),
    repassadoEm: date("repassado_em", { mode: "string" }),
    observacoes: text("observacoes"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("alvaras_etapa_idx").on(t.organizationId, t.etapa), tenantPolicy("alvaras")],
).enableRLS();

/* ------------------------------------------------------------------ */
/* Rotinas e registro                                                  */
/* ------------------------------------------------------------------ */

/** Cada busca no DJEN ou no DataJud: o que achou e se falhou. */
export const capturas = pgTable(
  "capturas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    fonte: fonte("fonte").notNull(),
    iniciadaEm: timestamp("iniciada_em", { withTimezone: true }).notNull().defaultNow(),
    terminadaEm: timestamp("terminada_em", { withTimezone: true }),
    encontradas: integer("encontradas").notNull().default(0),
    novas: integer("novas").notNull().default(0),
    erro: text("erro"),
  },
  (t) => [index("capturas_fonte_idx").on(t.organizationId, t.fonte, t.iniciadaEm), tenantPolicy("capturas")],
).enableRLS();

/** Resumo da manhã já enviado: um por pessoa por dia, mesmo se a rotina rodar de novo. */
export const avisosEnviados = pgTable(
  "avisos_enviados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tipo: text("tipo").notNull(),
    dia: date("dia", { mode: "string" }).notNull(),
    ok: boolean("ok").notNull(),
    erro: text("erro"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("avisos_enviados_uq").on(t.organizationId, t.userId, t.tipo, t.dia), tenantPolicy("avisos_enviados")],
).enableRLS();

/** Quem fez o quê: confirmou prazo, gerou peça, apagou cliente. */
export const auditoria = pgTable(
  "auditoria",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: pessoa("user_id"),
    nome: text("nome"),
    acao: text("acao").notNull(),
    detalhes: jsonb("detalhes").$type<Record<string, unknown>>().notNull().default({}),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("auditoria_criada_idx").on(t.organizationId, t.createdAt), tenantPolicy("auditoria")],
).enableRLS();
