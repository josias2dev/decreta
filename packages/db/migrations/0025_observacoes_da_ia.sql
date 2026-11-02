CREATE TABLE "observacoes_da_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"publicacao_id" uuid NOT NULL,
	"candidato" text NOT NULL,
	"situacao" "situacao_ia" NOT NULL,
	"conteudo" jsonb,
	"erro" text,
	"procedencia" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observacoes_da_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "observacoes_da_ia" ADD CONSTRAINT "observacoes_da_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observacoes_da_ia" ADD CONSTRAINT "observacoes_da_ia_publicacao_id_publicacoes_id_fk" FOREIGN KEY ("publicacao_id") REFERENCES "public"."publicacoes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "observacoes_da_ia_unica" ON "observacoes_da_ia" USING btree ("publicacao_id","candidato");--> statement-breakpoint
CREATE INDEX "observacoes_da_ia_dia_idx" ON "observacoes_da_ia" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "observacoes_da_ia_tenant_isolation" ON "observacoes_da_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));