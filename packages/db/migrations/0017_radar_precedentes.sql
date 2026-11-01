CREATE TABLE "acervo_novidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chave" text NOT NULL,
	"situacao_antes" text,
	"situacao" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "radar_precedentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"rotulo" text NOT NULL,
	"situacao" text NOT NULL,
	"texto" text,
	"url" text NOT NULL,
	"motivo" text NOT NULL,
	"descartado_por" text,
	"descartado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "radar_precedentes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "acervo_documentos" ADD COLUMN "questao" text;--> statement-breakpoint
ALTER TABLE "radar_precedentes" ADD CONSTRAINT "radar_precedentes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_precedentes" ADD CONSTRAINT "radar_precedentes_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "radar_precedentes" ADD CONSTRAINT "radar_precedentes_descartado_por_user_id_fk" FOREIGN KEY ("descartado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acervo_novidades_em_idx" ON "acervo_novidades" USING btree ("em");--> statement-breakpoint
CREATE UNIQUE INDEX "radar_precedentes_uq" ON "radar_precedentes" USING btree ("organization_id","processo_id","chave","situacao");--> statement-breakpoint
CREATE INDEX "radar_precedentes_processo_idx" ON "radar_precedentes" USING btree ("organization_id","processo_id");--> statement-breakpoint
CREATE POLICY "radar_precedentes_tenant_isolation" ON "radar_precedentes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));