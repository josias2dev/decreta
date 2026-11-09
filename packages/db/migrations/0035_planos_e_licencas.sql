CREATE TABLE "planos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"versao" integer NOT NULL,
	"nome" text NOT NULL,
	"mensal_centavos" integer,
	"anual_centavos" integer,
	"pessoas_incluidas" integer,
	"pessoa_extra_centavos" integer,
	"limites" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"funcionalidades" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_por" text,
	"substituido_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "recusas_da_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"motivo" text NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recusas_da_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ajustes_da_plataforma" (
	"chave" text PRIMARY KEY NOT NULL,
	"valor" jsonb NOT NULL,
	"mudado_por" text NOT NULL,
	"mudado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ajustes_da_plataforma" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cupons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"valor" integer NOT NULL,
	"meses" integer NOT NULL,
	"valido_ate" date,
	"limite_de_usos" integer,
	"usos" integer DEFAULT 0 NOT NULL,
	"nota" text,
	"criado_por" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"desativado_em" timestamp with time zone,
	CONSTRAINT "cupons_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
ALTER TABLE "cupons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "notas_da_plataforma" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"operador" text NOT NULL,
	"texto" text NOT NULL,
	"contato" text,
	"proximo_passo" text,
	"retorno_em" date,
	"retorno_feito_em" timestamp with time zone,
	"criada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notas_da_plataforma" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "asaas_assinatura_valor_centavos" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "plano_id" uuid;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "pessoas_extras" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "valor_combinado_centavos" integer;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "desconto" jsonb;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "marca" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "tetos_ia" jsonb;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "suspensa_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recusas_da_ia" ADD CONSTRAINT "recusas_da_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recusas_da_ia" ADD CONSTRAINT "recusas_da_ia_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_da_plataforma" ADD CONSTRAINT "notas_da_plataforma_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "planos_codigo_versao_idx" ON "planos" USING btree ("codigo","versao");--> statement-breakpoint
CREATE UNIQUE INDEX "planos_um_padrao_idx" ON "planos" USING btree ("padrao") WHERE "planos"."padrao" and "planos"."substituido_em" is null;--> statement-breakpoint
CREATE INDEX "recusas_da_ia_em_idx" ON "recusas_da_ia" USING btree ("em");--> statement-breakpoint
CREATE INDEX "notas_da_plataforma_org_idx" ON "notas_da_plataforma" USING btree ("organization_id","criada_em");--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_plano_id_planos_id_fk" FOREIGN KEY ("plano_id") REFERENCES "public"."planos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE POLICY "recusas_da_ia_tenant_isolation" ON "recusas_da_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "ajustes_da_plataforma_fora_de_escritorio" ON "ajustes_da_plataforma" AS PERMISSIVE FOR ALL TO "app_user" USING (coalesce(current_setting('app.org_id', true), '') = '') WITH CHECK (coalesce(current_setting('app.org_id', true), '') = '');--> statement-breakpoint
CREATE POLICY "cupons_fora_de_escritorio" ON "cupons" AS PERMISSIVE FOR ALL TO "app_user" USING (coalesce(current_setting('app.org_id', true), '') = '') WITH CHECK (coalesce(current_setting('app.org_id', true), '') = '');--> statement-breakpoint
CREATE POLICY "notas_da_plataforma_fora_de_escritorio" ON "notas_da_plataforma" AS PERMISSIVE FOR ALL TO "app_user" USING (coalesce(current_setting('app.org_id', true), '') = '') WITH CHECK (coalesce(current_setting('app.org_id', true), '') = '');--> statement-breakpoint
-- O plano de sempre (PLANO_INICIAL em @decreta/core): sem preço, sem limite e com tudo ligado. Todo escritório que já existe fica nele.
INSERT INTO "planos" ("codigo", "versao", "nome", "padrao") VALUES ('escritorio', 1, 'Escritório', true);--> statement-breakpoint
UPDATE "organization" SET "plano_id" = (SELECT "id" FROM "planos" WHERE "codigo" = 'escritorio' AND "versao" = 1);--> statement-breakpoint

-- Como as funções de 0029 e 0034: devolvem só ids, datas e TOTAIS, e o servidor só as chama para quem está em PLATAFORMA_EMAILS.

-- O que cada escritório usa contra os limites do plano: processos monitorados, OABs, espaço dos arquivos e o WhatsApp do dia.
CREATE FUNCTION "plataforma_consumo"(p_dia date, p_de timestamptz, p_ate timestamptz) RETURNS TABLE (
  "organization_id" text, "processos" integer, "oabs" integer, "arquivos_bytes" bigint, "whatsapp_hoje" integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT o."id",
    (SELECT count(*)::integer FROM "processos" p WHERE p."organization_id" = o."id" AND p."situacao" IN ('ativo', 'suspenso')),
    (SELECT count(*)::integer FROM "equipe" e WHERE e."organization_id" = o."id" AND e."oab_numero" IS NOT NULL),
    (SELECT coalesce(sum(d."tamanho"), 0)::bigint FROM "documentos" d WHERE d."organization_id" = o."id"),
    (SELECT count(*)::integer FROM "avisos_enviados" a WHERE a."organization_id" = o."id" AND a."tipo" = 'manha' AND a."ok" AND a."dia" = p_dia)
      + (SELECT count(*)::integer FROM "mensagens_cliente" m WHERE m."organization_id" = o."id" AND m."aprovada_em" >= p_de AND m."aprovada_em" < p_ate AND m."situacao"::text IN ('enviando', 'enviada'))
  FROM "organization" o
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_consumo"(date, timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_consumo"(date, timestamptz, timestamptz) TO app_user;--> statement-breakpoint

-- Quantas vezes a IA foi recusada por um limite, por escritório, dia de São Paulo e motivo.
CREATE FUNCTION "plataforma_recusas_ia"(p_de timestamptz, p_ate timestamptz) RETURNS TABLE ("organization_id" text, "dia" date, "motivo" text, "total" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r."organization_id", (r."em" AT TIME ZONE 'America/Sao_Paulo')::date, r."motivo", count(*)::integer
  FROM "recusas_da_ia" r WHERE r."em" >= p_de AND r."em" < p_ate GROUP BY 1, 2, 3
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_recusas_ia"(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_recusas_ia"(timestamptz, timestamptz) TO app_user;--> statement-breakpoint

-- A lista das faturas do Decreta (as mensalidades, não os honorários do escritório): com a forma e o link da página de pagamento do Asaas, para reenviar.
CREATE FUNCTION "plataforma_lista_de_faturas"(p_de date, p_ate date) RETURNS TABLE (
  "id" text, "organization_id" text, "assinatura_id" text, "vencimento" date, "valor_centavos" integer, "situacao" text, "forma" text, "link" text, "paga_em" date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."id", f."organization_id", f."assinatura_id", f."vencimento", f."valor_centavos", f."situacao"::text, f."forma", f."link", f."paga_em"
  FROM "faturas" f WHERE (f."vencimento" BETWEEN p_de AND p_ate OR f."paga_em" BETWEEN p_de AND p_ate) AND f."situacao" <> 'removida'
  ORDER BY f."vencimento" DESC
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_lista_de_faturas"(date, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_lista_de_faturas"(date, date) TO app_user;
