CREATE TYPE "public"."alvo_ia" AS ENUM('processo', 'prazo', 'publicacao', 'audiencia', 'cliente', 'atendimento');--> statement-breakpoint
CREATE TYPE "public"."canal_atendimento" AS ENUM('presencial', 'telefone', 'whatsapp', 'video', 'email');--> statement-breakpoint
CREATE TYPE "public"."contagem" AS ENUM('uteis', 'corridos');--> statement-breakpoint
CREATE TYPE "public"."etapa_alvara" AS ENUM('novo', 'aguardando_saque', 'sacado', 'repassado', 'finalizado');--> statement-breakpoint
CREATE TYPE "public"."etapa_negocio" AS ENUM('triagem', 'repassado', 'concluido', 'desistiu');--> statement-breakpoint
CREATE TYPE "public"."fonte" AS ENUM('djen', 'datajud', 'manual');--> statement-breakpoint
CREATE TYPE "public"."origem_documento" AS ENUM('upload', 'peca', 'captura');--> statement-breakpoint
CREATE TYPE "public"."origem_prazo" AS ENUM('ia', 'manual');--> statement-breakpoint
CREATE TYPE "public"."papel_mensagem" AS ENUM('pessoa', 'ia');--> statement-breakpoint
CREATE TYPE "public"."polo" AS ENUM('ativo', 'passivo', 'terceiro');--> statement-breakpoint
CREATE TYPE "public"."situacao_audiencia" AS ENUM('marcada', 'realizada', 'cancelada', 'redesignada');--> statement-breakpoint
CREATE TYPE "public"."situacao_ia" AS ENUM('pronto', 'recusa', 'erro');--> statement-breakpoint
CREATE TYPE "public"."situacao_pasta" AS ENUM('completa', 'faltam_documentos', 'sem_pasta');--> statement-breakpoint
CREATE TYPE "public"."situacao_peca" AS ENUM('rascunho', 'revisada');--> statement-breakpoint
CREATE TYPE "public"."situacao_prazo" AS ENUM('aberto', 'cumprido', 'descartado');--> statement-breakpoint
CREATE TYPE "public"."situacao_processo" AS ENUM('ativo', 'suspenso', 'arquivado', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."situacao_publicacao" AS ENUM('nova', 'pendente', 'lida', 'vinculada');--> statement-breakpoint
CREATE TYPE "public"."tipo_caso" AS ENUM('judicial', 'extrajudicial');--> statement-breakpoint
CREATE TYPE "public"."tipo_pessoa" AS ENUM('pf', 'pj');--> statement-breakpoint
CREATE TYPE "public"."tipo_suspensao" AS ENUM('local', 'forense', 'recesso', 'reduzido');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" text,
	"timezone" text DEFAULT 'America/Sao_Paulo' NOT NULL,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"two_factor_enabled" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "alvaras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"valor_recebido" numeric(14, 2),
	"etapa" "etapa_alvara" DEFAULT 'novo' NOT NULL,
	"expedido_em" date,
	"sacado_em" date,
	"repassado_em" date,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "alvaras" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "analises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"alvo" "alvo_ia" NOT NULL,
	"alvo_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"situacao" "situacao_ia" NOT NULL,
	"conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fonte" text,
	"base" text NOT NULL,
	"erro" text,
	"pedida_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "atendimentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"processo_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	"canal" "canal_atendimento" DEFAULT 'presencial' NOT NULL,
	"resumo" text NOT NULL,
	"autor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "atendimentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "audiencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"publicacao_id" uuid,
	"em" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"local" text,
	"por_video" boolean DEFAULT false NOT NULL,
	"responsavel_id" text,
	"situacao" "situacao_audiencia" DEFAULT 'marcada' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audiencias" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"nome" text,
	"acao" text NOT NULL,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "avisos_enviados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"dia" date NOT NULL,
	"ok" boolean NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "avisos_enviados" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "capturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"fonte" "fonte" NOT NULL,
	"iniciada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"terminada_em" timestamp with time zone,
	"encontradas" integer DEFAULT 0 NOT NULL,
	"novas" integer DEFAULT 0 NOT NULL,
	"erro" text
);
--> statement-breakpoint
ALTER TABLE "capturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_pessoa" DEFAULT 'pf' NOT NULL,
	"documento" text,
	"telefone" text,
	"email" text,
	"endereco" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clientes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid,
	"cliente_id" uuid,
	"nome" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho" integer NOT NULL,
	"chave" text NOT NULL,
	"texto" text,
	"origem" "origem_documento" DEFAULT 'upload' NOT NULL,
	"evento" integer,
	"enviado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "documentos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "equipe" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"apelido" text,
	"cargo" text,
	"oab_numero" text,
	"oab_uf" text,
	"whatsapp" text,
	"aviso_manha" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "equipe_organization_id_user_id_pk" PRIMARY KEY("organization_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "equipe" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "escritorios" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"tribunal" text DEFAULT 'TJSC' NOT NULL,
	"timbre" jsonb,
	"avisos" jsonb DEFAULT '{"manha":true,"hora":"07:30"}'::jsonb NOT NULL,
	"captura_djen" boolean DEFAULT true NOT NULL,
	"captura_datajud" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "escritorios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mensagens_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid,
	"user_id" text NOT NULL,
	"papel" "papel_mensagem" NOT NULL,
	"texto" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "movimentacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"em" timestamp with time zone NOT NULL,
	"evento" integer,
	"titulo" text NOT NULL,
	"descricao" text,
	"fonte" "fonte" DEFAULT 'manual' NOT NULL,
	"codigo" integer,
	"chave" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "movimentacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "negocios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"assunto" text NOT NULL,
	"area" text,
	"pasta" "situacao_pasta" DEFAULT 'sem_pasta' NOT NULL,
	"etapa" "etapa_negocio" DEFAULT 'triagem' NOT NULL,
	"checklist" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"responsavel_id" text,
	"cliente_id" uuid,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "negocios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "partes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"polo" "polo" NOT NULL,
	"papel" text,
	"documento" text,
	"advogados" text,
	"cliente" boolean DEFAULT false NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "partes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pecas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"prazo_id" uuid,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"instrucoes" text,
	"texto" text DEFAULT '' NOT NULL,
	"situacao" "situacao_peca" DEFAULT 'rascunho' NOT NULL,
	"criada_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pecas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prazos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"publicacao_id" uuid,
	"tipo" text NOT NULL,
	"fundamento" text,
	"dias" integer NOT NULL,
	"contagem" "contagem" DEFAULT 'uteis' NOT NULL,
	"publicado_em" date NOT NULL,
	"inicio" date NOT NULL,
	"fim" date NOT NULL,
	"desconsiderados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"situacao" "situacao_prazo" DEFAULT 'aberto' NOT NULL,
	"origem" "origem_prazo" DEFAULT 'manual' NOT NULL,
	"responsavel_id" text,
	"confirmado_por" text,
	"confirmado_em" timestamp with time zone,
	"cumprido_por" text,
	"cumprido_em" timestamp with time zone,
	"motivo_descarte" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prazos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"cnj" text,
	"titulo" text NOT NULL,
	"tipo" "tipo_caso" DEFAULT 'judicial' NOT NULL,
	"tribunal" text,
	"classe" text,
	"assunto" text,
	"orgao" text,
	"comarca" text,
	"valor_causa" numeric(14, 2),
	"situacao" "situacao_processo" DEFAULT 'ativo' NOT NULL,
	"cliente_id" uuid,
	"polo_cliente" "polo" DEFAULT 'ativo' NOT NULL,
	"responsavel_id" text,
	"distribuido_em" date,
	"ultima_movimentacao_em" timestamp with time zone,
	"datajud_em" timestamp with time zone,
	"segredo" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "processos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "publicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"fonte" "fonte" DEFAULT 'djen' NOT NULL,
	"id_externo" text NOT NULL,
	"disponibilizada_em" date NOT NULL,
	"publicada_em" date NOT NULL,
	"tribunal" text,
	"orgao" text,
	"tipo_comunicacao" text,
	"tipo_documento" text,
	"classe" text,
	"cnj" text,
	"processo_id" uuid,
	"texto" text NOT NULL,
	"destinatarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"advogados" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"link" text,
	"situacao" "situacao_publicacao" DEFAULT 'nova' NOT NULL,
	"tratada_por" text,
	"tratada_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "publicacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "suspensoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"dia" date NOT NULL,
	"motivo" text NOT NULL,
	"tipo" "tipo_suspensao" DEFAULT 'local' NOT NULL,
	"tribunal" text,
	"comarca" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suspensoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"titulo" text NOT NULL,
	"detalhe" text,
	"dia" date NOT NULL,
	"responsavel_id" text,
	"processo_id" uuid,
	"cliente_id" uuid,
	"negocio_id" uuid,
	"concluida_em" timestamp with time zone,
	"criada_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tarefas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alvaras" ADD CONSTRAINT "alvaras_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alvaras" ADD CONSTRAINT "alvaras_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analises" ADD CONSTRAINT "analises_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analises" ADD CONSTRAINT "analises_pedida_por_user_id_fk" FOREIGN KEY ("pedida_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "atendimentos" ADD CONSTRAINT "atendimentos_autor_id_user_id_fk" FOREIGN KEY ("autor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiencias" ADD CONSTRAINT "audiencias_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiencias" ADD CONSTRAINT "audiencias_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiencias" ADD CONSTRAINT "audiencias_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audiencias" ADD CONSTRAINT "audiencias_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos_enviados" ADD CONSTRAINT "avisos_enviados_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avisos_enviados" ADD CONSTRAINT "avisos_enviados_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "capturas" ADD CONSTRAINT "capturas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_enviado_por_user_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe" ADD CONSTRAINT "equipe_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipe" ADD CONSTRAINT "equipe_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "escritorios" ADD CONSTRAINT "escritorios_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes" ADD CONSTRAINT "movimentacoes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partes" ADD CONSTRAINT "partes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partes" ADD CONSTRAINT "partes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_prazo_id_prazos_id_fk" FOREIGN KEY ("prazo_id") REFERENCES "public"."prazos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_criada_por_user_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_confirmado_por_user_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prazos" ADD CONSTRAINT "prazos_cumprido_por_user_id_fk" FOREIGN KEY ("cumprido_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processos" ADD CONSTRAINT "processos_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD CONSTRAINT "publicacoes_tratada_por_user_id_fk" FOREIGN KEY ("tratada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspensoes" ADD CONSTRAINT "suspensoes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_criada_por_user_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitation_org_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_org_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_user_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "alvaras_etapa_idx" ON "alvaras" USING btree ("organization_id","etapa");--> statement-breakpoint
CREATE INDEX "analises_alvo_idx" ON "analises" USING btree ("organization_id","alvo","alvo_id","acao","created_at");--> statement-breakpoint
CREATE INDEX "atendimentos_cliente_idx" ON "atendimentos" USING btree ("organization_id","cliente_id","em");--> statement-breakpoint
CREATE INDEX "audiencias_em_idx" ON "audiencias" USING btree ("organization_id","em");--> statement-breakpoint
CREATE INDEX "audiencias_processo_idx" ON "audiencias" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "auditoria_criada_idx" ON "auditoria" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "avisos_enviados_uq" ON "avisos_enviados" USING btree ("organization_id","user_id","tipo","dia");--> statement-breakpoint
CREATE INDEX "capturas_fonte_idx" ON "capturas" USING btree ("organization_id","fonte","iniciada_em");--> statement-breakpoint
CREATE INDEX "clientes_nome_idx" ON "clientes" USING btree ("organization_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "clientes_documento_idx" ON "clientes" USING btree ("organization_id","documento");--> statement-breakpoint
CREATE INDEX "documentos_processo_idx" ON "documentos" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "documentos_cliente_idx" ON "documentos" USING btree ("organization_id","cliente_id");--> statement-breakpoint
CREATE INDEX "mensagens_ia_processo_idx" ON "mensagens_ia" USING btree ("organization_id","processo_id","created_at");--> statement-breakpoint
CREATE INDEX "mensagens_ia_user_idx" ON "mensagens_ia" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "movimentacoes_chave_uq" ON "movimentacoes" USING btree ("organization_id","processo_id","chave");--> statement-breakpoint
CREATE INDEX "movimentacoes_processo_idx" ON "movimentacoes" USING btree ("organization_id","processo_id","em");--> statement-breakpoint
CREATE INDEX "negocios_etapa_idx" ON "negocios" USING btree ("organization_id","etapa");--> statement-breakpoint
CREATE INDEX "partes_processo_idx" ON "partes" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "pecas_processo_idx" ON "pecas" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "prazos_fim_idx" ON "prazos" USING btree ("organization_id","situacao","fim");--> statement-breakpoint
CREATE INDEX "prazos_processo_idx" ON "prazos" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "prazos_responsavel_idx" ON "prazos" USING btree ("organization_id","responsavel_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "processos_cnj_uq" ON "processos" USING btree ("organization_id","cnj");--> statement-breakpoint
CREATE INDEX "processos_cliente_idx" ON "processos" USING btree ("organization_id","cliente_id");--> statement-breakpoint
CREATE INDEX "processos_responsavel_idx" ON "processos" USING btree ("organization_id","responsavel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publicacoes_externo_uq" ON "publicacoes" USING btree ("organization_id","fonte","id_externo");--> statement-breakpoint
CREATE INDEX "publicacoes_situacao_idx" ON "publicacoes" USING btree ("organization_id","situacao","disponibilizada_em");--> statement-breakpoint
CREATE INDEX "publicacoes_processo_idx" ON "publicacoes" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE INDEX "suspensoes_dia_idx" ON "suspensoes" USING btree ("organization_id","dia");--> statement-breakpoint
CREATE INDEX "tarefas_dia_idx" ON "tarefas" USING btree ("organization_id","dia");--> statement-breakpoint
CREATE POLICY "alvaras_tenant_isolation" ON "alvaras" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "analises_tenant_isolation" ON "analises" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "atendimentos_tenant_isolation" ON "atendimentos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "audiencias_tenant_isolation" ON "audiencias" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "auditoria_tenant_isolation" ON "auditoria" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "avisos_enviados_tenant_isolation" ON "avisos_enviados" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "capturas_tenant_isolation" ON "capturas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "clientes_tenant_isolation" ON "clientes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "documentos_tenant_isolation" ON "documentos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "equipe_tenant_isolation" ON "equipe" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "escritorios_tenant_isolation" ON "escritorios" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "mensagens_ia_tenant_isolation" ON "mensagens_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "movimentacoes_tenant_isolation" ON "movimentacoes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "negocios_tenant_isolation" ON "negocios" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "partes_tenant_isolation" ON "partes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "pecas_tenant_isolation" ON "pecas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "prazos_tenant_isolation" ON "prazos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "processos_tenant_isolation" ON "processos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "publicacoes_tenant_isolation" ON "publicacoes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "suspensoes_tenant_isolation" ON "suspensoes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "tarefas_tenant_isolation" ON "tarefas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));