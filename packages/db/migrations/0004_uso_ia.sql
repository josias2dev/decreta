CREATE TYPE "public"."origem_uso_ia" AS ENUM('tela', 'fundo');--> statement-breakpoint
CREATE TABLE "uso_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text,
	"user_id" text,
	"metodo" text NOT NULL,
	"origem" "origem_uso_ia" NOT NULL,
	"mensagem" boolean DEFAULT false NOT NULL,
	"tokens_entrada" integer DEFAULT 0 NOT NULL,
	"tokens_saida" integer DEFAULT 0 NOT NULL,
	"custo_usd" numeric(12, 6) DEFAULT 0 NOT NULL,
	"estimado" boolean DEFAULT false NOT NULL,
	"em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "uso_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uso_ia" ADD CONSTRAINT "uso_ia_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "uso_ia_dia_idx" ON "uso_ia" USING btree ("em");--> statement-breakpoint
CREATE INDEX "uso_ia_pessoa_idx" ON "uso_ia" USING btree ("organization_id","user_id","em");--> statement-breakpoint
CREATE POLICY "uso_ia_tenant_isolation" ON "uso_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- O teto do site soma o gasto de todos os escritórios, que o RLS esconde de cada um.
-- Esta função (do dono, que não passa pelo RLS) devolve só a soma: nenhuma linha, nenhum escritório.
CREATE FUNCTION "gasto_da_ia_no_site"(desde timestamptz) RETURNS numeric
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum("custo_usd"), 0) FROM "uso_ia" WHERE "origem" = 'tela' AND "em" >= desde
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "gasto_da_ia_no_site"(timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "gasto_da_ia_no_site"(timestamptz) TO app_user;
