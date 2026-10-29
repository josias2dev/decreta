CREATE TYPE "public"."leitura_documento" AS ENUM('pendente', 'pronta', 'falhou');--> statement-breakpoint
CREATE TYPE "public"."resultado_decisao" AS ENUM('procedente', 'parcialmente_procedente', 'improcedente', 'sem_merito', 'acordo_homologado', 'outro');--> statement-breakpoint
CREATE TYPE "public"."tipo_decisao" AS ENUM('sentenca', 'acordao');--> statement-breakpoint
ALTER TYPE "public"."alvo_ia" ADD VALUE 'negocio';--> statement-breakpoint
CREATE TABLE "modelos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"titulo" text NOT NULL,
	"tipo" text NOT NULL,
	"tese" text,
	"assunto" text,
	"texto" text NOT NULL,
	"peca_id" uuid,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "modelos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "resultados" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"publicacao_id" uuid,
	"tipo" "tipo_decisao" DEFAULT 'sentenca' NOT NULL,
	"resultado" "resultado_decisao" NOT NULL,
	"decidido_em" date NOT NULL,
	"resumo" text,
	"confirmado_por" text,
	"confirmado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "resultados" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "retornos_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"acao" text NOT NULL,
	"analise_id" uuid,
	"peca_id" uuid,
	"user_id" text NOT NULL,
	"util" boolean NOT NULL,
	"comentario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "retornos_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "negocio_id" uuid;--> statement-breakpoint
ALTER TABLE "documentos" ADD COLUMN "leitura" "leitura_documento";--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "revisada_por" text;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "revisada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "modelos" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modelos" ADD CONSTRAINT "modelos_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_confirmado_por_user_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retornos_ia" ADD CONSTRAINT "retornos_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retornos_ia" ADD CONSTRAINT "retornos_ia_analise_id_analises_id_fk" FOREIGN KEY ("analise_id") REFERENCES "public"."analises"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retornos_ia" ADD CONSTRAINT "retornos_ia_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retornos_ia" ADD CONSTRAINT "retornos_ia_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "modelos_tipo_idx" ON "modelos" USING btree ("organization_id","tipo");--> statement-breakpoint
CREATE INDEX "modelos_busca_idx" ON "modelos" USING gin (to_tsvector('portuguese', "titulo" || ' ' || coalesce("tese", '') || ' ' || coalesce("assunto", '') || ' ' || "texto"));--> statement-breakpoint
CREATE UNIQUE INDEX "resultados_publicacao_uq" ON "resultados" USING btree ("organization_id","publicacao_id");--> statement-breakpoint
CREATE INDEX "resultados_processo_idx" ON "resultados" USING btree ("organization_id","processo_id","decidido_em");--> statement-breakpoint
CREATE UNIQUE INDEX "retornos_ia_analise_uq" ON "retornos_ia" USING btree ("organization_id","analise_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "retornos_ia_peca_uq" ON "retornos_ia" USING btree ("organization_id","peca_id","user_id");--> statement-breakpoint
CREATE INDEX "retornos_ia_criado_idx" ON "retornos_ia" USING btree ("organization_id","created_at");--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_negocio_id_negocios_id_fk" FOREIGN KEY ("negocio_id") REFERENCES "public"."negocios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_revisada_por_user_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documentos_negocio_idx" ON "documentos" USING btree ("organization_id","negocio_id");--> statement-breakpoint
CREATE POLICY "modelos_tenant_isolation" ON "modelos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "resultados_tenant_isolation" ON "resultados" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "retornos_ia_tenant_isolation" ON "retornos_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));