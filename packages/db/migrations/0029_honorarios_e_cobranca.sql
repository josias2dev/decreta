CREATE TYPE "public"."forma_pagamento_honorarios" AS ENUM('pix', 'boleto', 'cartao', 'transferencia', 'dinheiro', 'retido_no_alvara', 'outro');--> statement-breakpoint
CREATE TYPE "public"."origem_pagamento_honorarios" AS ENUM('manual', 'asaas');--> statement-breakpoint
CREATE TYPE "public"."situacao_assinatura" AS ENUM('enviada', 'assinada', 'cancelada');--> statement-breakpoint
CREATE TYPE "public"."situacao_contrato_honorarios" AS ENUM('ativo', 'encerrado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."tipo_contrato_honorarios" AS ENUM('fixo', 'mensal', 'exito', 'hibrido');--> statement-breakpoint
CREATE TYPE "public"."tipo_parcela_honorarios" AS ENUM('fixo', 'mensal', 'exito', 'avulso');--> statement-breakpoint
ALTER TYPE "public"."tipo_mensagem_cliente" ADD VALUE 'cobranca';--> statement-breakpoint
CREATE TABLE "assinaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"documento_id" uuid NOT NULL,
	"cliente_id" uuid,
	"provedor" text DEFAULT 'zapsign' NOT NULL,
	"token" text NOT NULL,
	"situacao" "situacao_assinatura" DEFAULT 'enviada' NOT NULL,
	"signatarios" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enviada_por" text,
	"enviada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"assinada_em" timestamp with time zone,
	"documento_assinado_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assinaturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cobranca_config" (
	"organization_id" text PRIMARY KEY NOT NULL,
	"asaas_chave" text,
	"asaas_ambiente" text DEFAULT 'producao' NOT NULL,
	"asaas_webhook_id" text,
	"asaas_webhook_token_hash" text,
	"asaas_conferida_em" timestamp with time zone,
	"pix_automatico" boolean DEFAULT false NOT NULL,
	"regua" jsonb DEFAULT '{"ligada":false,"passos":[]}'::jsonb NOT NULL,
	"zapsign_chave" text,
	"zapsign_ambiente" text DEFAULT 'producao' NOT NULL,
	"zapsign_ligada" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cobranca_config" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contratos_honorarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"cliente_id" uuid,
	"processo_id" uuid,
	"titulo" text NOT NULL,
	"tipo" "tipo_contrato_honorarios" NOT NULL,
	"situacao" "situacao_contrato_honorarios" DEFAULT 'ativo' NOT NULL,
	"valor_fixo" bigint,
	"mensalidade" bigint,
	"exito_bp" integer,
	"inicio" date NOT NULL,
	"observacoes" text,
	"documento_id" uuid,
	"pix_automatico_id" text,
	"pix_automatico_situacao" text,
	"pix_automatico_qr" jsonb,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "eventos_cobranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"provedor" text NOT NULL,
	"externo_id" text NOT NULL,
	"tipo" text NOT NULL,
	"recurso" text,
	"resultado" text,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos_cobranca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "lembretes_de_cobranca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"parcela_id" uuid NOT NULL,
	"mensagem_id" uuid NOT NULL,
	"passo" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lembretes_de_cobranca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "pagamentos_honorarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"parcela_id" uuid NOT NULL,
	"valor" bigint NOT NULL,
	"pago_em" date NOT NULL,
	"forma" "forma_pagamento_honorarios" DEFAULT 'outro' NOT NULL,
	"origem" "origem_pagamento_honorarios" DEFAULT 'manual' NOT NULL,
	"externo_id" text,
	"observacao" text,
	"registrado_por" text,
	"estornado_em" timestamp with time zone,
	"estornado_por" text,
	"motivo_estorno" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pagamentos_honorarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "parcelas_honorarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"contrato_id" uuid NOT NULL,
	"tipo" "tipo_parcela_honorarios" NOT NULL,
	"numero" integer DEFAULT 1 NOT NULL,
	"descricao" text NOT NULL,
	"valor" bigint,
	"vencimento" date,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"cobranca_provedor" text,
	"cobranca_id" text,
	"cobranca_link" text,
	"cobranca_vencimento" date,
	"cobranca_emitida_em" timestamp with time zone,
	"cobranca_emitida_por" text,
	"alvara_id" uuid,
	"prestacao_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "prestacoes_de_contas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"alvara_id" uuid NOT NULL,
	"contrato_id" uuid,
	"parcela_id" uuid,
	"valor_alvara" bigint NOT NULL,
	"valor_recebido" bigint NOT NULL,
	"exito_bp" integer,
	"honorario" bigint NOT NULL,
	"cliente" bigint NOT NULL,
	"sem_contrato" boolean DEFAULT false NOT NULL,
	"retido_no_saque" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"confirmada_por" text,
	"confirmada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" text,
	"motivo_cancelamento" text,
	"documento_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "repasses_de_alvara" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"prestacao_id" uuid NOT NULL,
	"favorecido" text NOT NULL,
	"favorecido_documento" text,
	"conta" text NOT NULL,
	"valor" bigint NOT NULL,
	"repassado_em" date NOT NULL,
	"observacao" text,
	"registrado_por" text,
	"estornado_em" timestamp with time zone,
	"estornado_por" text,
	"motivo_estorno" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repasses_de_alvara" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "equipe" ADD COLUMN "financeiro" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "processos" ADD COLUMN "honorario_dispensado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_enviada_por_user_id_fk" FOREIGN KEY ("enviada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assinaturas" ADD CONSTRAINT "assinaturas_documento_assinado_id_documentos_id_fk" FOREIGN KEY ("documento_assinado_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_config" ADD CONSTRAINT "cobranca_config_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ADD CONSTRAINT "contratos_honorarios_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ADD CONSTRAINT "contratos_honorarios_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ADD CONSTRAINT "contratos_honorarios_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ADD CONSTRAINT "contratos_honorarios_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contratos_honorarios" ADD CONSTRAINT "contratos_honorarios_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_cobranca" ADD CONSTRAINT "eventos_cobranca_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_de_cobranca" ADD CONSTRAINT "lembretes_de_cobranca_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_de_cobranca" ADD CONSTRAINT "lembretes_de_cobranca_parcela_id_parcelas_honorarios_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcelas_honorarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lembretes_de_cobranca" ADD CONSTRAINT "lembretes_de_cobranca_mensagem_id_mensagens_cliente_id_fk" FOREIGN KEY ("mensagem_id") REFERENCES "public"."mensagens_cliente"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_honorarios" ADD CONSTRAINT "pagamentos_honorarios_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_honorarios" ADD CONSTRAINT "pagamentos_honorarios_parcela_id_parcelas_honorarios_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcelas_honorarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_honorarios" ADD CONSTRAINT "pagamentos_honorarios_registrado_por_user_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pagamentos_honorarios" ADD CONSTRAINT "pagamentos_honorarios_estornado_por_user_id_fk" FOREIGN KEY ("estornado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ADD CONSTRAINT "parcelas_honorarios_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ADD CONSTRAINT "parcelas_honorarios_contrato_id_contratos_honorarios_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos_honorarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ADD CONSTRAINT "parcelas_honorarios_cobranca_emitida_por_user_id_fk" FOREIGN KEY ("cobranca_emitida_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ADD CONSTRAINT "parcelas_honorarios_alvara_id_alvaras_id_fk" FOREIGN KEY ("alvara_id") REFERENCES "public"."alvaras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcelas_honorarios" ADD CONSTRAINT "parcelas_honorarios_prestacao_id_prestacoes_de_contas_id_fk" FOREIGN KEY ("prestacao_id") REFERENCES "public"."prestacoes_de_contas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_alvara_id_alvaras_id_fk" FOREIGN KEY ("alvara_id") REFERENCES "public"."alvaras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_contrato_id_contratos_honorarios_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contratos_honorarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_parcela_id_parcelas_honorarios_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcelas_honorarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_confirmada_por_user_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_cancelada_por_user_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prestacoes_de_contas" ADD CONSTRAINT "prestacoes_de_contas_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_de_alvara" ADD CONSTRAINT "repasses_de_alvara_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_de_alvara" ADD CONSTRAINT "repasses_de_alvara_prestacao_id_prestacoes_de_contas_id_fk" FOREIGN KEY ("prestacao_id") REFERENCES "public"."prestacoes_de_contas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_de_alvara" ADD CONSTRAINT "repasses_de_alvara_registrado_por_user_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repasses_de_alvara" ADD CONSTRAINT "repasses_de_alvara_estornado_por_user_id_fk" FOREIGN KEY ("estornado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "assinaturas_token_uq" ON "assinaturas" USING btree ("organization_id","provedor","token");--> statement-breakpoint
CREATE INDEX "assinaturas_documento_idx" ON "assinaturas" USING btree ("organization_id","documento_id");--> statement-breakpoint
CREATE INDEX "contratos_honorarios_cliente_idx" ON "contratos_honorarios" USING btree ("organization_id","cliente_id");--> statement-breakpoint
CREATE INDEX "contratos_honorarios_processo_idx" ON "contratos_honorarios" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_cobranca_uq" ON "eventos_cobranca" USING btree ("organization_id","provedor","externo_id");--> statement-breakpoint
CREATE INDEX "eventos_cobranca_recurso_idx" ON "eventos_cobranca" USING btree ("organization_id","recurso");--> statement-breakpoint
CREATE UNIQUE INDEX "lembretes_de_cobranca_passo_uq" ON "lembretes_de_cobranca" USING btree ("organization_id","parcela_id","passo") WHERE "lembretes_de_cobranca"."passo" is not null;--> statement-breakpoint
CREATE INDEX "lembretes_de_cobranca_parcela_idx" ON "lembretes_de_cobranca" USING btree ("organization_id","parcela_id");--> statement-breakpoint
CREATE INDEX "pagamentos_honorarios_parcela_idx" ON "pagamentos_honorarios" USING btree ("organization_id","parcela_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pagamentos_honorarios_externo_uq" ON "pagamentos_honorarios" USING btree ("organization_id","externo_id") WHERE "pagamentos_honorarios"."externo_id" is not null;--> statement-breakpoint
CREATE INDEX "parcelas_honorarios_contrato_idx" ON "parcelas_honorarios" USING btree ("organization_id","contrato_id");--> statement-breakpoint
CREATE INDEX "parcelas_honorarios_vencimento_idx" ON "parcelas_honorarios" USING btree ("organization_id","vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "parcelas_honorarios_cobranca_uq" ON "parcelas_honorarios" USING btree ("organization_id","cobranca_id") WHERE "parcelas_honorarios"."cobranca_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "prestacoes_de_contas_alvara_uq" ON "prestacoes_de_contas" USING btree ("organization_id","alvara_id") WHERE "prestacoes_de_contas"."cancelada_em" is null;--> statement-breakpoint
CREATE INDEX "prestacoes_de_contas_org_idx" ON "prestacoes_de_contas" USING btree ("organization_id","confirmada_em");--> statement-breakpoint
CREATE INDEX "repasses_de_alvara_prestacao_idx" ON "repasses_de_alvara" USING btree ("organization_id","prestacao_id");--> statement-breakpoint
CREATE POLICY "assinaturas_tenant_isolation" ON "assinaturas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "cobranca_config_tenant_isolation" ON "cobranca_config" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "contratos_honorarios_tenant_isolation" ON "contratos_honorarios" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "eventos_cobranca_tenant_isolation" ON "eventos_cobranca" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "lembretes_de_cobranca_tenant_isolation" ON "lembretes_de_cobranca" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "pagamentos_honorarios_tenant_isolation" ON "pagamentos_honorarios" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "parcelas_honorarios_tenant_isolation" ON "parcelas_honorarios" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "prestacoes_de_contas_tenant_isolation" ON "prestacoes_de_contas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "repasses_de_alvara_tenant_isolation" ON "repasses_de_alvara" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));