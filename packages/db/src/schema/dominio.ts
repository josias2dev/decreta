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

/** O jeito do escritório por tipo de peça ("geral" para todas). */
export type JeitoDoEscritorio = Record<string, { estilo: string; teses: string; evitar: string }>;

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
    /** Até quando o DataJud tem dados de cada tribunal da carteira ("TJSC" → instante), pela última conferência. */
    datajudAte: jsonb("datajud_ate").$type<Record<string, string>>().notNull().default({}),
    /** O número oficial do escritório, que vai no rodapé de toda mensagem ao cliente (contra o golpe do falso advogado). */
    whatsappOficial: text("whatsapp_oficial"),
    /** Como o escritório faz cada peça (estilo, teses, o que evitar), pelo tipo do catálogo; "geral" vale para todas. */
    jeito: jsonb("jeito").$type<JeitoDoEscritorio>().notNull().default({}),
    /** O nível de automação escolhido por ação ("rascunho-da-peca" → "sugestao"); o que falta vale o padrão. */
    automacao: jsonb("automacao").$type<Record<string, string>>().notNull().default({}),
    /**
     * Quando o escritório terminou (ou pulou de vez) a configuração inicial das telas.
     * Nulo = pendente. Nasce preenchido por padrão: só o cadastro aberto zera, para
     * os escritórios que já existem e os do script e da demonstração não passarem por ela.
     */
    onboardingConcluidoEm: timestamp("onboarding_concluido_em", { withTimezone: true }).defaultNow(),
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
    /** "Advogada", "Estagiário". */
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
    /** O cliente recusou o uso de IA (Recomendação CFOAB 001/2024, item 4.3.2): nada dos casos dele vai a um modelo. */
    semIa: boolean("sem_ia").notNull().default(false),
    /** O termo de uso de IA assinado (item 4.3.1 da mesma recomendação): o arquivo na pasta do cliente e quando foi registrado. */
    termoIaDocumentoId: uuid("termo_ia_documento_id").references((): AnyPgColumn => documentos.id, { onDelete: "set null" }),
    termoIaEm: timestamp("termo_ia_em", { withTimezone: true }),
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
    /** Sistema do tribunal ("eproc", "PJe"), para o link "Abrir no ...". */
    sistema: text("sistema"),
    /** "Instrução · laudo juntado": escrito pela equipe. */
    fase: text("fase"),
    situacao: situacaoProcesso("situacao").notNull().default("ativo"),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "set null" }),
    /** De que lado o cliente está. */
    poloCliente: polo("polo_cliente").notNull().default("ativo"),
    responsavelId: pessoa("responsavel_id"),
    distribuidoEm: date("distribuido_em", { mode: "string" }),
    ultimaMovimentacaoEm: timestamp("ultima_movimentacao_em", { withTimezone: true }),
    datajudEm: timestamp("datajud_em", { withTimezone: true }),
    /** Quando o tribunal mandou este processo ao DataJud pela última vez: o DataJud chega com dias ou semanas de atraso. */
    datajudAtualizadoEm: timestamp("datajud_atualizado_em", { withTimezone: true }),
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
export const autorMovimentacao = pgEnum("autor_movimentacao", ["juizo", "partes", "cartorio"]);

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
    /** Quem praticou o ato: o juízo (decisão, despacho, intimação) ou as partes (petições). */
    autor: autorMovimentacao("autor"),
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
    /** Hash da comunicação no DJEN: é por ele que sai a certidão de publicação. */
    hash: text("hash"),
    /** A certidão do DJEN já baixada (chave no armazenamento): a prova da data fica com o escritório. */
    certidao: text("certidao"),
    /** O tribunal cancelou a comunicação depois de disponibilizar (aparece numa versão nova do caderno). */
    canceladaEm: timestamp("cancelada_em", { withTimezone: true }),
    motivoCancelamento: text("motivo_cancelamento"),
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
    /** Dupla intimação: o dia em que o sistema do tribunal intimou também. A conta vale pelo marco que vence primeiro (Tema 1.180 do STJ, sem tese). */
    intimadoNoSistemaEm: date("intimado_no_sistema_em", { mode: "string" }),
    inicio: date("inicio", { mode: "string" }).notNull(),
    fim: date("fim", { mode: "string" }).notNull(),
    /** O que ficou fora da conta, para mostrar e auditar. */
    desconsiderados: jsonb("desconsiderados").$type<DiaDesconsiderado[]>().notNull().default([]),
    /** A pessoa digitou a data final (suspensão que o sistema não conhece): vale a dela, não a da conta. */
    fimDigitado: boolean("fim_digitado").notNull().default(false),
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

/** Como o juízo decidiu, do ponto de vista do nosso cliente. */
export const resultadoDecisao = pgEnum("resultado_decisao", ["procedente", "parcialmente_procedente", "improcedente", "sem_merito", "acordo_homologado", "outro"]);
export const tipoDecisao = pgEnum("tipo_decisao", ["sentenca", "acordao"]);

/**
 * Sentença ou acórdão do processo, com o resultado confirmado por uma pessoa.
 * A IA lê a decisão e sugere; aqui fica só o que alguém confirmou.
 */
export const resultados = pgTable(
  "resultados",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    publicacaoId: uuid("publicacao_id").references(() => publicacoes.id, { onDelete: "set null" }),
    tipo: tipoDecisao("tipo").notNull().default("sentenca"),
    resultado: resultadoDecisao("resultado").notNull(),
    /** Data da publicação da decisão. */
    decididoEm: date("decidido_em", { mode: "string" }).notNull(),
    /** Uma ou duas frases: o que ganhamos e o que perdemos. */
    resumo: text("resumo"),
    confirmadoPor: pessoa("confirmado_por"),
    confirmadoEm: timestamp("confirmado_em", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("resultados_publicacao_uq").on(t.organizationId, t.publicacaoId),
    index("resultados_processo_idx").on(t.organizationId, t.processoId, t.decididoEm),
    tenantPolicy("resultados"),
  ],
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

/** Leitura pela IA de foto ou PDF escaneado. Vazio: o texto saiu direto do arquivo, ou o arquivo não tem texto para ler. */
export const leituraDocumento = pgEnum("leitura_documento", ["pendente", "pronta", "falhou"]);

/** Texto escondido ou frase dirigida a uma IA achados no arquivo (`varrerDocumento` de @decreta/documentos). */
export interface AlertaDoDocumento {
  tipo: "texto_oculto" | "fonte_branca" | "fonte_minuscula" | "texto_invisivel" | "codigo_de_campo" | "metadados" | "comando_para_ia";
  trecho: string;
}

export const documentos = pgTable(
  "documentos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    clienteId: uuid("cliente_id").references(() => clientes.id, { onDelete: "cascade" }),
    /** Pasta de quem ainda está na triagem; ao virar cliente, o documento passa para o cliente. */
    negocioId: uuid("negocio_id").references((): AnyPgColumn => negocios.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    mime: text("mime").notNull(),
    tamanho: integer("tamanho").notNull(),
    paginas: integer("paginas"),
    /** Onde o arquivo está no armazenamento (disco ou R2). */
    chave: text("chave").notNull(),
    /** Texto extraído (PDF, DOCX), para a IA e a busca. */
    texto: text("texto"),
    /** Comandos escondidos para IA: a tela avisa, e a IA lê o documento como dado, nunca como instrução. */
    alertas: jsonb("alertas").$type<AlertaDoDocumento[]>().notNull().default([]),
    leitura: leituraDocumento("leitura"),
    origem: origemDocumento("origem").notNull().default("upload"),
    evento: integer("evento"),
    enviadoPor: pessoa("enviado_por"),
    createdAt: createdAt(),
  },
  (t) => [
    index("documentos_processo_idx").on(t.organizationId, t.processoId),
    index("documentos_cliente_idx").on(t.organizationId, t.clienteId),
    index("documentos_negocio_idx").on(t.organizationId, t.negocioId),
    tenantPolicy("documentos"),
  ],
).enableRLS();

export const situacaoPeca = pgEnum("situacao_peca", ["rascunho", "revisada"]);

/** Selo de cada citação da peça, conferida no acervo. */
export type SeloDaCitacao = "verificada" | "com_ressalva" | "nao_verificada";

export interface VerificacaoDaPeca {
  em: string;
  /** sha256 do texto conferido: mudou o texto, a verificação deixa de valer. */
  hashDoTexto: string;
  resumo: { verificadas: number; comRessalva: number; naoVerificadas: number };
  citacoes: {
    chave: string;
    trecho: string;
    inicio: number;
    selo: SeloDaCitacao;
    motivo: string;
    texto: string | null;
    fonte: { nome: string; url: string; capturadoEm: string } | null;
  }[];
}

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
    /** Quem marcou como revisada e quando. Mudou o texto depois, volta a rascunho e isto se apaga. */
    revisadaPor: pessoa("revisada_por"),
    revisadaEm: timestamp("revisada_em", { withTimezone: true }),
    /** Modelos do escritório que a IA seguiu na última geração. */
    modelos: jsonb("modelos").$type<string[]>().notNull().default([]),
    /** O texto como a IA entregou na última geração; nulo na peça escrita à mão. */
    textoGerado: text("texto_gerado"),
    /** A última verificação das citações ("Verificar peça"), com o hash do texto que foi conferido. */
    verificacao: jsonb("verificacao").$type<VerificacaoDaPeca>(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("pecas_processo_idx").on(t.organizationId, t.processoId), tenantPolicy("pecas")],
).enableRLS();

/**
 * Cada "marcar como revisada" (Recomendação CFOAB 001/2024, item 3.7): a versão
 * da IA e a final daquele momento, quem e quando. Não se apaga quando o texto
 * muda depois.
 */
export const revisoesDePeca = pgTable(
  "revisoes_de_peca",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    pecaId: uuid("peca_id")
      .notNull()
      .references(() => pecas.id, { onDelete: "cascade" }),
    textoGerado: text("texto_gerado"),
    textoFinal: text("texto_final").notNull(),
    revisadaPor: pessoa("revisada_por"),
    revisadaEm: timestamp("revisada_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("revisoes_de_peca_peca_idx").on(t.organizationId, t.pecaId), tenantPolicy("revisoes_de_peca")],
).enableRLS();

/**
 * Banco de teses: as peças que o escritório escolheu como modelo. Ao gerar uma
 * peça, a IA recebe as mais parecidas e segue a estrutura e os argumentos.
 */
export const modelos = pgTable(
  "modelos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    titulo: text("titulo").notNull(),
    /** Do catálogo ("contestacao"). */
    tipo: text("tipo").notNull(),
    /** A tese em uma ou duas frases ("Seguro de vida: doença preexistente não alegada na proposta"). */
    tese: text("tese"),
    /** "Seguro de vida", "Revisional de aposentadoria". */
    assunto: text("assunto"),
    texto: text("texto").notNull(),
    /** A peça do Decreta de onde veio, quando veio de uma. */
    pecaId: uuid("peca_id").references(() => pecas.id, { onDelete: "set null" }),
    criadoPor: pessoa("criado_por"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("modelos_tipo_idx").on(t.organizationId, t.tipo),
    index("modelos_busca_idx").using("gin", sql`to_tsvector('portuguese', ${t.titulo} || ' ' || coalesce(${t.tese}, '') || ' ' || coalesce(${t.assunto}, '') || ' ' || ${t.texto})`),
    tenantPolicy("modelos"),
  ],
).enableRLS();

/** De quem é a análise: a IA sempre fala de alguma coisa do escritório. */
export const alvoIa = pgEnum("alvo_ia", ["processo", "prazo", "publicacao", "audiencia", "cliente", "atendimento", "negocio"]);
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
export const modoConversa = pgEnum("modo_conversa", ["pergunte", "jurisprudencia"]);

/**
 * Conversa do Perguntar: de uma pessoa só (as rotas filtram por `userId`; o
 * RLS isola o escritório). `processoId` é o processo de onde ela começou, se
 * começou de um.
 */
export const conversas = pgTable(
  "conversas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** "Prazos desta semana": a IA dá o nome depois da primeira resposta; a pessoa pode trocar. */
    titulo: text("titulo").notNull(),
    modo: modoConversa("modo").notNull().default("pergunte"),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "set null" }),
    fixada: boolean("fixada").notNull().default(false),
    createdAt: createdAt(),
    /** Última mensagem: ordena o histórico. */
    updatedAt: updatedAt(),
  },
  (t) => [index("conversas_user_idx").on(t.organizationId, t.userId, t.updatedAt), tenantPolicy("conversas")],
).enableRLS();

/**
 * O que a IA consultou para responder, na ordem: cada ferramenta com o pedido
 * e o resultado (é o que vira cartão na tela), e o texto entre elas. No fim,
 * as citações que a IA escreveu no texto por conta própria, com o selo de cada
 * uma (nenhuma citação aparece sem selo no Perguntar).
 */
export type ParteDaMensagem =
  | { tipo: "texto"; texto: string }
  | { tipo: "ferramenta"; id: string; nome: string; entrada: unknown; saida: unknown; erro?: string }
  | { tipo: "citacoes"; itens: VerificacaoDaPeca["citacoes"] };

/** Conversa com a IA: o chat do processo (com `processoId`) ou uma conversa do Perguntar (com `conversaId`). */
export const mensagensIa = pgTable(
  "mensagens_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "cascade" }),
    conversaId: uuid("conversa_id").references(() => conversas.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    papel: papelMensagem("papel").notNull(),
    texto: text("texto").notNull(),
    partes: jsonb("partes").$type<ParteDaMensagem[]>(),
    createdAt: createdAt(),
  },
  (t) => [
    index("mensagens_ia_processo_idx").on(t.organizationId, t.processoId, t.createdAt),
    index("mensagens_ia_user_idx").on(t.organizationId, t.userId, t.createdAt),
    index("mensagens_ia_conversa_idx").on(t.organizationId, t.conversaId, t.createdAt),
    tenantPolicy("mensagens_ia"),
  ],
).enableRLS();

/**
 * "Útil" ou "errado" de quem usou uma saída da IA (uma análise ou uma peça).
 * Os "errado" de cada mês viram ajuste nas instruções da IA.
 */
export const retornosIa = pgTable(
  "retornos_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    /** A ação da IA avaliada ("briefing-prazo", "gerar-documento"). */
    acao: text("acao").notNull(),
    analiseId: uuid("analise_id").references(() => analises.id, { onDelete: "cascade" }),
    pecaId: uuid("peca_id").references(() => pecas.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    util: boolean("util").notNull(),
    /** O que estava errado, nas palavras de quem viu. */
    comentario: text("comentario"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("retornos_ia_analise_uq").on(t.organizationId, t.analiseId, t.userId),
    uniqueIndex("retornos_ia_peca_uq").on(t.organizationId, t.pecaId, t.userId),
    index("retornos_ia_criado_idx").on(t.organizationId, t.createdAt),
    tenantPolicy("retornos_ia"),
  ],
).enableRLS();

/** "tela": alguém pediu (conta nos tetos do dia). "fundo": a rotina sozinha (prazo da publicação nova), que nunca é barrada. */
export const origemDoUso = pgEnum("origem_uso_ia", ["tela", "fundo"]);

/**
 * O que a IA gastou, chamada por chamada, e cada mensagem mandada no chat. É
 * daqui que saem os limites do dia (ver apps/api/src/servicos/uso-ia.ts). Só
 * números: nada do que foi perguntado ou respondido. A pessoa não apaga nada
 * daqui (apagar a conversa não devolve o limite), e a linha fica mesmo se o
 * escritório ou a pessoa sair, para o gasto do dia continuar certo.
 */
export const usoIa = pgTable(
  "uso_ia",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").references(() => organization.id, { onDelete: "set null" }),
    userId: pessoa("user_id"),
    /** O `X-Gateway-Method` da chamada ("perguntar", "gerar-documento"...). */
    metodo: text("metodo").notNull(),
    origem: origemDoUso("origem").notNull(),
    /** Uma mensagem mandada no chat (Perguntar ou chat do processo), gravada antes de a IA responder. */
    mensagem: boolean("mensagem").notNull().default(false),
    tokensEntrada: integer("tokens_entrada").notNull().default(0),
    tokensSaida: integer("tokens_saida").notNull().default(0),
    custoUsd: numeric("custo_usd", { precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    /** O custo saiu dos tokens, pelo preço de referência (a resposta não trouxe o custo). */
    estimado: boolean("estimado").notNull().default(false),
    /** Pelo relógio da API (o mesmo das contas do limite), não pelo do banco. */
    em: timestamp("em", { withTimezone: true }).notNull(),
  },
  (t) => [index("uso_ia_dia_idx").on(t.em), index("uso_ia_pessoa_idx").on(t.organizationId, t.userId, t.em), tenantPolicy("uso_ia")],
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

export const situacaoCaderno = pgEnum("situacao_caderno", ["lido", "ausente", "erro"]);

/**
 * O caderno diário do DJEN de cada tribunal, lido para este escritório: o
 * caderno é baixado uma vez para todos, mas cada escritório guarda só o que
 * casou com ele. É daqui que sai a saúde da captura.
 */
export const cadernosDjen = pgTable(
  "cadernos_djen",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    tribunal: text("tribunal").notNull(),
    dia: date("dia", { mode: "string" }).notNull(),
    /** "ausente": o tribunal não publicou caderno nesse dia (ou ainda não saiu). */
    situacao: situacaoCaderno("situacao").notNull(),
    versao: integer("versao"),
    /** Comunicações no caderno inteiro do tribunal. */
    total: integer("total").notNull().default(0),
    /** As do escritório (pela OAB da equipe ou pelo número de processo da carteira). */
    casadas: integer("casadas").notNull().default(0),
    novas: integer("novas").notNull().default(0),
    canceladas: integer("canceladas").notNull().default(0),
    erro: text("erro"),
    /** O último envio do tribunal ao DJEN quando este caderno foi conferido (/comunicacao/tribunal). */
    ultimoEnvio: date("ultimo_envio", { mode: "string" }),
    lidoEm: timestamp("lido_em", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("cadernos_djen_uq").on(t.organizationId, t.tribunal, t.dia), tenantPolicy("cadernos_djen")],
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

export const tipoMensagemCliente = pgEnum("tipo_mensagem_cliente", ["decisao", "documentos"]);
export const situacaoMensagemCliente = pgEnum("situacao_mensagem_cliente", ["rascunho", "enviada", "falhou", "descartada"]);

/**
 * Mensagem do escritório ao cliente no WhatsApp: o que uma decisão significa
 * para ele, ou a lista dos documentos que faltam com o link de envio. Nasce
 * rascunho; só sai quando um advogado aprova, e fica registrado quem e quando.
 */
export const mensagensCliente = pgTable(
  "mensagens_cliente",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "cascade" }),
    processoId: uuid("processo_id").references(() => processos.id, { onDelete: "set null" }),
    prazoId: uuid("prazo_id").references(() => prazos.id, { onDelete: "set null" }),
    tipo: tipoMensagemCliente("tipo").notNull(),
    situacao: situacaoMensagemCliente("situacao").notNull().default("rascunho"),
    /** O rascunho como a IA escreveu, para comparar com o que o advogado aprovou. */
    textoIa: text("texto_ia"),
    /** O corpo que o advogado revisa; o nome do escritório e o rodapé entram no envio. */
    texto: text("texto").notNull(),
    /** Documentos pedidos ao cliente, como ele lê ("Procuração assinada"). */
    itens: jsonb("itens").$type<string[]>().notNull().default([]),
    /** O texto inteiro como saiu, com o link de envio escondido. */
    enviado: text("enviado"),
    para: text("para"),
    /** Link de envio sem login: só o hash do segredo, e até quando vale. */
    linkHash: text("link_hash"),
    linkExpiraEm: timestamp("link_expira_em", { withTimezone: true }),
    recebidos: integer("recebidos").notNull().default(0),
    criadaPor: pessoa("criada_por"),
    aprovadaPor: pessoa("aprovada_por"),
    aprovadaEm: timestamp("aprovada_em", { withTimezone: true }),
    enviadaEm: timestamp("enviada_em", { withTimezone: true }),
    erro: text("erro"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("mensagens_cliente_cliente_idx").on(t.organizationId, t.clienteId, t.createdAt),
    index("mensagens_cliente_prazo_idx").on(t.organizationId, t.prazoId),
    uniqueIndex("mensagens_cliente_link_uq").on(t.organizationId, t.linkHash),
    tenantPolicy("mensagens_cliente"),
  ],
).enableRLS();

/**
 * Radar de precedentes (Fase 5.4): um precedente do BNP que mudou e pode
 * afetar um processo do escritório, porque o assunto do processo aparece na
 * questão julgada. É um "confira": o advogado lê e descarta o que não serve.
 */
export const radarPrecedentes = pgTable(
  "radar_precedentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    processoId: uuid("processo_id")
      .notNull()
      .references(() => processos.id, { onDelete: "cascade" }),
    /** A chave do precedente no acervo: "irdr:TJSC:37". */
    chave: text("chave").notNull(),
    /** "IRDR 37 do TJSC" */
    rotulo: text("rotulo").notNull(),
    situacao: text("situacao").notNull(),
    /** A questão ou a tese, como estava no BNP quando o radar achou. */
    texto: text("texto"),
    url: text("url").notNull(),
    /** Por que o radar ligou o precedente ao processo. */
    motivo: text("motivo").notNull(),
    descartadoPor: pessoa("descartado_por"),
    descartadoEm: timestamp("descartado_em", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("radar_precedentes_uq").on(t.organizationId, t.processoId, t.chave, t.situacao),
    index("radar_precedentes_processo_idx").on(t.organizationId, t.processoId),
    tenantPolicy("radar_precedentes"),
  ],
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

/**
 * Token pessoal do conector MCP (só leitura): um assistente de fora (Claude,
 * por exemplo) consulta o escritório com as permissões de quem criou o token.
 * O banco guarda só o hash; o token aparece uma vez, na criação.
 */
export const tokensMcp = pgTable(
  "tokens_mcp",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: organizationId(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    nome: text("nome").notNull(),
    hash: text("hash").notNull(),
    usadoEm: timestamp("usado_em", { withTimezone: true }),
    /** O token vence sozinho: quem esqueceu um no computador não deixa a porta aberta para sempre. */
    expiraEm: timestamp("expira_em", { withTimezone: true })
      .notNull()
      .default(sql`now() + interval '90 days'`),
    revogadoEm: timestamp("revogado_em", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("tokens_mcp_hash_uq").on(t.hash), index("tokens_mcp_pessoa_idx").on(t.organizationId, t.userId), tenantPolicy("tokens_mcp")],
).enableRLS();
