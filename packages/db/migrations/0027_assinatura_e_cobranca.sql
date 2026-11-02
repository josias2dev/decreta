CREATE TYPE "public"."situacao_do_escritorio" AS ENUM('teste', 'ativo', 'inadimplente', 'so_leitura', 'bloqueado', 'cancelado', 'cortesia');--> statement-breakpoint
CREATE TYPE "public"."situacao_da_fatura" AS ENUM('pendente', 'paga', 'atrasada', 'estornada', 'removida');--> statement-breakpoint
CREATE TABLE "auditoria_da_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operador" text NOT NULL,
	"acao" text NOT NULL,
	"organization_id" text,
	"detalhes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auditoria_da_plataforma" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "eventos_de_cobranca" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"evento" text NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eventos_de_cobranca" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "faturas" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"vencimento" date NOT NULL,
	"valor_centavos" integer NOT NULL,
	"situacao" "situacao_da_fatura" DEFAULT 'pendente' NOT NULL,
	"forma" text,
	"link" text,
	"paga_em" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "faturas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "situacao" "situacao_do_escritorio" DEFAULT 'cortesia' NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "teste_ate" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "inadimplente_desde" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "acesso_ate" date;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "cancelamento_pedido_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "assinou_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "valor_mensal_centavos" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_link_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_link_url" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_link_valor_centavos" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_cliente_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_assinatura_id" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "nfse_configurada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "auditoria_da_plataforma" ADD CONSTRAINT "auditoria_da_plataforma_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_de_cobranca" ADD CONSTRAINT "eventos_de_cobranca_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "faturas" ADD CONSTRAINT "faturas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_da_plataforma_em_idx" ON "auditoria_da_plataforma" USING btree ("em");--> statement-breakpoint
CREATE INDEX "eventos_de_cobranca_org_idx" ON "eventos_de_cobranca" USING btree ("organization_id","recebido_em");--> statement-breakpoint
CREATE INDEX "faturas_org_idx" ON "faturas" USING btree ("organization_id","vencimento");--> statement-breakpoint
CREATE INDEX "organization_asaas_assinatura_idx" ON "organization" USING btree ("asaas_assinatura_id");--> statement-breakpoint
CREATE INDEX "organization_asaas_link_idx" ON "organization" USING btree ("asaas_link_id");--> statement-breakpoint
CREATE INDEX "organization_asaas_cliente_idx" ON "organization" USING btree ("asaas_cliente_id");--> statement-breakpoint
CREATE POLICY "auditoria_da_plataforma_insercao" ON "auditoria_da_plataforma" AS PERMISSIVE FOR INSERT TO "app_user" WITH CHECK (true);--> statement-breakpoint
CREATE POLICY "eventos_de_cobranca_tenant_isolation" ON "eventos_de_cobranca" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "faturas_tenant_isolation" ON "faturas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- O painel da plataforma enxerga todos os escritórios, que o RLS esconde uns dos outros. Estas funções (do dono, que não
-- passa pelo RLS) devolvem só o que é da conta e do uso: nome, situação, datas e TOTAIS. Nenhuma linha de cliente,
-- processo ou publicação sai delas, e o servidor só as chama para quem está em PLATAFORMA_EMAILS.
CREATE FUNCTION "plataforma_escritorios"() RETURNS TABLE (
  "id" text, "nome" text, "slug" text, "criado_em" timestamptz, "em_avaliacao" boolean, "encerrado_em" timestamptz,
  "situacao" "situacao_do_escritorio", "teste_ate" date, "inadimplente_desde" date, "acesso_ate" date,
  "cancelamento_pedido_em" timestamptz, "assinou_em" timestamptz, "valor_mensal_centavos" integer,
  "pessoas" integer, "processos" integer, "ia_mes_usd" double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o."id", o."name", o."slug", o."created_at", o."em_avaliacao", o."encerrado_em",
    o."situacao", o."teste_ate", o."inadimplente_desde", o."acesso_ate",
    o."cancelamento_pedido_em", o."assinou_em", o."valor_mensal_centavos",
    (SELECT count(*)::integer FROM "member" m WHERE m."organization_id" = o."id"),
    (SELECT count(*)::integer FROM "processos" p WHERE p."organization_id" = o."id"),
    (SELECT coalesce(sum(u."custo_usd"), 0)::double precision FROM "uso_ia" u
      WHERE u."organization_id" = o."id" AND u."em" >= (date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'))
  FROM "organization" o
  ORDER BY o."created_at" DESC
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_escritorios"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_escritorios"() TO app_user;--> statement-breakpoint
-- A aplicação só grava em "auditoria_da_plataforma"; quem lê é esta função.
CREATE FUNCTION "plataforma_auditoria"(limite integer) RETURNS TABLE (
  "id" uuid, "operador" text, "acao" text, "organization_id" text, "escritorio" text, "detalhes" jsonb, "em" timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a."id", a."operador", a."acao", a."organization_id", o."name", a."detalhes", a."em"
  FROM "auditoria_da_plataforma" a LEFT JOIN "organization" o ON o."id" = a."organization_id"
  ORDER BY a."em" DESC LIMIT least(greatest(limite, 1), 500)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_auditoria"(integer) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_auditoria"(integer) TO app_user;