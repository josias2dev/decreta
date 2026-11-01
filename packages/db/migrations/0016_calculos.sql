CREATE TYPE "public"."tipo_calculo" AS ENUM('atualizacao', 'revisional', 'pjecalc');--> statement-breakpoint
CREATE TABLE "calculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"processo_id" uuid,
	"tipo" "tipo_calculo" NOT NULL,
	"titulo" text NOT NULL,
	"entrada" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resultado" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"memoria" text NOT NULL,
	"documento_id" uuid,
	"criado_por" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calculos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "calculos" ADD CONSTRAINT "calculos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculos" ADD CONSTRAINT "calculos_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculos" ADD CONSTRAINT "calculos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculos" ADD CONSTRAINT "calculos_criado_por_user_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calculos_processo_idx" ON "calculos" USING btree ("organization_id","processo_id","created_at");--> statement-breakpoint
CREATE POLICY "calculos_tenant_isolation" ON "calculos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));