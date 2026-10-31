CREATE TABLE "revisoes_de_peca" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"peca_id" uuid NOT NULL,
	"texto_gerado" text,
	"texto_final" text NOT NULL,
	"revisada_por" text,
	"revisada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "revisoes_de_peca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "texto_gerado" text;--> statement-breakpoint
ALTER TABLE "revisoes_de_peca" ADD CONSTRAINT "revisoes_de_peca_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_de_peca" ADD CONSTRAINT "revisoes_de_peca_peca_id_pecas_id_fk" FOREIGN KEY ("peca_id") REFERENCES "public"."pecas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisoes_de_peca" ADD CONSTRAINT "revisoes_de_peca_revisada_por_user_id_fk" FOREIGN KEY ("revisada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revisoes_de_peca_peca_idx" ON "revisoes_de_peca" USING btree ("organization_id","peca_id");--> statement-breakpoint
CREATE POLICY "revisoes_de_peca_tenant_isolation" ON "revisoes_de_peca" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));