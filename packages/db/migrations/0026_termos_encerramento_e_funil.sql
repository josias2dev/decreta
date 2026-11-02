CREATE TYPE "public"."situacao_exportacao" AS ENUM('pedida', 'pronta', 'falhou');--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"organization_id" text,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exportacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"pedida_por" text,
	"situacao" "situacao_exportacao" DEFAULT 'pedida' NOT NULL,
	"partes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documentos" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"pronta_em" timestamp with time zone,
	"expira_em" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exportacoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "encerrado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "termos_versao" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "termos_aceitos_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exportacoes" ADD CONSTRAINT "exportacoes_pedida_por_user_id_fk" FOREIGN KEY ("pedida_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "eventos_nome_em_idx" ON "eventos" USING btree ("nome","em");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_uma_vez_por_escritorio" ON "eventos" USING btree ("organization_id","nome");--> statement-breakpoint
CREATE INDEX "exportacoes_org_idx" ON "exportacoes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "eventos_insercao" ON "eventos" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (organization_id is null or organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "exportacoes_tenant_isolation" ON "exportacoes" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- A aplicação só grava em "eventos"; a política não deixa ler nenhuma linha. O funil sai desta função
-- (do dono, que não passa pelo RLS), que devolve só o total de cada nome: nenhuma linha, nenhum escritório.
CREATE FUNCTION "contagem_de_eventos"(de timestamptz, ate timestamptz) RETURNS TABLE ("nome" text, "total" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e."nome", count(*)::integer FROM "eventos" e WHERE e."em" >= de AND e."em" < ate GROUP BY e."nome"
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "contagem_de_eventos"(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "contagem_de_eventos"(timestamptz, timestamptz) TO app_user;