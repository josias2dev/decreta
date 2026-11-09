CREATE TABLE "propostas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"tipo" text NOT NULL,
	"argumentos" jsonb NOT NULL,
	"texto" text NOT NULL,
	"impressao" text NOT NULL,
	"situacao" text DEFAULT 'pendente' NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"decidida_em" timestamp with time zone,
	"resultado" jsonb,
	"wamid" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "propostas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "whatsapp_codigos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" text NOT NULL,
	"user_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_desconhecidos" (
	"hash" text PRIMARY KEY NOT NULL,
	"respondido_em" timestamp with time zone,
	"mensagens" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"wamid" text,
	"chave" text,
	"direcao" text NOT NULL,
	"tipo" text NOT NULL,
	"texto" text,
	"detalhes" jsonb,
	"situacao" text NOT NULL,
	"erro" text,
	"origem" text,
	"conversa_id" uuid,
	"responde" text,
	"categoria" text,
	"revisao" text,
	"duracao_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "whatsapp_mensagens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "whatsapp_vinculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"telefone" text NOT NULL,
	"bsuid" text,
	"organization_id" text NOT NULL,
	"verificado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"renovar_ate" timestamp with time zone NOT NULL,
	"ultima_entrada_em" timestamp with time zone,
	"pausado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversas" ADD COLUMN "canal" text DEFAULT 'tela' NOT NULL;--> statement-breakpoint
ALTER TABLE "equipe" ADD COLUMN "aviso_quinze_horas" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "equipe" ADD COLUMN "aviso_prazo_curto" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "propostas" ADD CONSTRAINT "propostas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_codigos" ADD CONSTRAINT "whatsapp_codigos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_codigos" ADD CONSTRAINT "whatsapp_codigos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_mensagens" ADD CONSTRAINT "whatsapp_mensagens_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_vinculos" ADD CONSTRAINT "whatsapp_vinculos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "whatsapp_vinculos" ADD CONSTRAINT "whatsapp_vinculos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "propostas_pessoa_idx" ON "propostas" USING btree ("organization_id","user_id","situacao","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_codigos_hash_uq" ON "whatsapp_codigos" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "whatsapp_codigos_user_idx" ON "whatsapp_codigos" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_mensagens_wamid_uq" ON "whatsapp_mensagens" USING btree ("wamid");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_mensagens_chave_uq" ON "whatsapp_mensagens" USING btree ("organization_id","chave");--> statement-breakpoint
CREATE INDEX "whatsapp_mensagens_pessoa_idx" ON "whatsapp_mensagens" USING btree ("organization_id","user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_vinculos_user_uq" ON "whatsapp_vinculos" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_vinculos_telefone_uq" ON "whatsapp_vinculos" USING btree ("telefone");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_vinculos_bsuid_uq" ON "whatsapp_vinculos" USING btree ("bsuid");--> statement-breakpoint
CREATE POLICY "propostas_tenant_isolation" ON "propostas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "whatsapp_mensagens_tenant_isolation" ON "whatsapp_mensagens" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- O status que a Meta manda depois (entregue, lida, falhou) traz só o id da mensagem: a função acha o escritório dela, e mais nada.
CREATE FUNCTION "whatsapp_escritorio_da_mensagem"(p_wamid text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT organization_id FROM whatsapp_mensagens WHERE wamid = p_wamid LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "whatsapp_escritorio_da_mensagem"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "whatsapp_escritorio_da_mensagem"(text) TO app_user;--> statement-breakpoint
-- A lista do painel da plataforma: quem conversa com o Decreta pelo WhatsApp, de qual escritório, quando e se algo falhou.
-- Sem o conteúdo: ele só abre conversa a conversa, com motivo, e fica no registro da plataforma e no do escritório.
CREATE FUNCTION "plataforma_conversas_whatsapp"(p_limite integer, p_antes timestamptz) RETURNS TABLE (
  organization_id text, escritorio text, user_id text, pessoa text, telefone text, ultima_em timestamptz,
  mensagens bigint, falhas bigint, ultima_direcao text, ultima_situacao text, pausado boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH por_pessoa AS (
    SELECT m.organization_id, m.user_id, max(m.created_at) AS ultima_em, count(*) AS mensagens,
           count(*) FILTER (WHERE m.situacao = 'falhou') AS falhas
    FROM whatsapp_mensagens m
    WHERE m.user_id IS NOT NULL AND coalesce(m.origem, '') <> 'laboratorio'
    GROUP BY m.organization_id, m.user_id
  )
  SELECT p.organization_id, o.name, p.user_id, u.name, v.telefone, p.ultima_em, p.mensagens, p.falhas,
         (SELECT direcao FROM whatsapp_mensagens x WHERE x.organization_id = p.organization_id AND x.user_id = p.user_id AND coalesce(x.origem, '') <> 'laboratorio' ORDER BY x.created_at DESC LIMIT 1),
         (SELECT situacao FROM whatsapp_mensagens x WHERE x.organization_id = p.organization_id AND x.user_id = p.user_id AND coalesce(x.origem, '') <> 'laboratorio' ORDER BY x.created_at DESC LIMIT 1),
         v.pausado_em IS NOT NULL
  FROM por_pessoa p
  JOIN organization o ON o.id = p.organization_id
  JOIN "user" u ON u.id = p.user_id
  LEFT JOIN whatsapp_vinculos v ON v.user_id = p.user_id
  WHERE p_antes IS NULL OR p.ultima_em < p_antes
  ORDER BY p.ultima_em DESC
  LIMIT least(greatest(p_limite, 1), 200)
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_conversas_whatsapp"(integer, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_conversas_whatsapp"(integer, timestamptz) TO app_user;
