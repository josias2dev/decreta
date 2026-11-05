CREATE TABLE "acessos" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"dia" date NOT NULL,
	"aparelho" text NOT NULL,
	"primeiro_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acessos_organization_id_user_id_dia_pk" PRIMARY KEY("organization_id","user_id","dia")
);
--> statement-breakpoint
ALTER TABLE "acessos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fotos_da_plataforma" (
	"dia" date PRIMARY KEY NOT NULL,
	"numeros" jsonb NOT NULL,
	"tirada_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fotos_da_plataforma" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acessos" ADD CONSTRAINT "acessos_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acessos_dia_idx" ON "acessos" USING btree ("dia");--> statement-breakpoint
CREATE POLICY "acessos_tenant_isolation" ON "acessos" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- O painel da plataforma lê o que o RLS esconde de um escritório para o outro só por estas funções (do dono, que
-- não passa pelo RLS). Como as de 0029, elas devolvem datas, ids e TOTAIS: nenhuma linha de cliente, processo,
-- publicação, documento, peça ou conversa sai daqui. O servidor só as chama para quem está em PLATAFORMA_EMAILS.

-- Os dias em que cada pessoa usou o app no período (para pessoas ativas e o aparelho).
CREATE FUNCTION "plataforma_acessos"(p_de date, p_ate date) RETURNS TABLE ("organization_id" text, "user_id" text, "dia" date, "aparelho" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a."organization_id", a."user_id", a."dia", a."aparelho" FROM "acessos" a WHERE a."dia" BETWEEN p_de AND p_ate
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_acessos"(date, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_acessos"(date, date) TO app_user;--> statement-breakpoint

-- O último dia de uso de cada pessoa em cada escritório, desde sempre.
CREATE FUNCTION "plataforma_ultimos_acessos"() RETURNS TABLE ("organization_id" text, "user_id" text, "ultimo" date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT a."organization_id", a."user_id", max(a."dia") FROM "acessos" a GROUP BY 1, 2
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_ultimos_acessos"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_ultimos_acessos"() TO app_user;--> statement-breakpoint

-- Quantas vezes cada escritório usou cada funcionalidade no período. Só contagens.
CREATE FUNCTION "plataforma_uso"(p_de timestamptz, p_ate timestamptz) RETURNS TABLE ("organization_id" text, "funcionalidade" text, "total" integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT organization_id, 'processos', count(*)::integer FROM processos WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'clientes', count(*)::integer FROM clientes WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'publicacoes', count(*)::integer FROM publicacoes WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'publicacoes_tratadas', count(*)::integer FROM publicacoes WHERE tratada_em >= p_de AND tratada_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'prazos_sugeridos', count(*)::integer FROM prazos WHERE origem = 'ia' AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'prazos_confirmados', count(*)::integer FROM prazos WHERE confirmado_em >= p_de AND confirmado_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'prazos_data_digitada', count(*)::integer FROM prazos WHERE fim_digitado AND confirmado_em >= p_de AND confirmado_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'prazos_descartados', count(*)::integer FROM prazos WHERE situacao = 'descartado' AND updated_at >= p_de AND updated_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'pecas', count(*)::integer FROM pecas WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'pecas_revisadas', count(*)::integer FROM pecas WHERE revisada_em >= p_de AND revisada_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'retornos_uteis', count(*)::integer FROM retornos_ia WHERE util AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'retornos_errados', count(*)::integer FROM retornos_ia WHERE NOT util AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'conversas', count(*)::integer FROM conversas WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'mensagens_chat', count(*)::integer FROM uso_ia WHERE mensagem AND organization_id IS NOT NULL AND em >= p_de AND em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'documentos', count(*)::integer FROM documentos WHERE origem = 'upload' AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'audiencias', count(*)::integer FROM audiencias WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'tarefas', count(*)::integer FROM tarefas WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'tarefas_concluidas', count(*)::integer FROM tarefas WHERE concluida_em >= p_de AND concluida_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'atendimentos', count(*)::integer FROM atendimentos WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'contratos_honorarios', count(*)::integer FROM contratos_honorarios WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'pagamentos_honorarios', count(*)::integer FROM pagamentos_honorarios WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'alvaras', count(*)::integer FROM alvaras WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'negocios', count(*)::integer FROM negocios WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'mensagens_cliente', count(*)::integer FROM mensagens_cliente WHERE enviada_em >= p_de AND enviada_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'assinaturas', count(*)::integer FROM assinaturas WHERE enviada_em >= p_de AND enviada_em < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'calculos', count(*)::integer FROM calculos WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'radar', count(*)::integer FROM radar_precedentes WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'avisos_enviados', count(*)::integer FROM avisos_enviados WHERE ok AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'avisos_falhos', count(*)::integer FROM avisos_enviados WHERE NOT ok AND created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'exportacoes', count(*)::integer FROM exportacoes WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'modelos', count(*)::integer FROM modelos WHERE created_at >= p_de AND created_at < p_ate GROUP BY 1
  UNION ALL SELECT organization_id, 'mcp', count(*)::integer FROM tokens_mcp WHERE usado_em >= p_de AND usado_em < p_ate GROUP BY 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_uso"(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_uso"(timestamptz, timestamptz) TO app_user;--> statement-breakpoint

-- O gasto da IA por escritório, dia de São Paulo e funcionalidade.
CREATE FUNCTION "plataforma_ia"(p_de timestamptz, p_ate timestamptz) RETURNS TABLE (
  "organization_id" text, "dia" date, "metodo" text, "origem" text, "chamadas" integer, "mensagens" integer, "custo_usd" double precision, "custo_estimado_usd" double precision
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u."organization_id", (u."em" AT TIME ZONE 'America/Sao_Paulo')::date, u."metodo", u."origem"::text,
    count(*) FILTER (WHERE NOT u."mensagem")::integer, count(*) FILTER (WHERE u."mensagem")::integer,
    coalesce(sum(u."custo_usd"), 0)::double precision, coalesce(sum(u."custo_usd") FILTER (WHERE u."estimado"), 0)::double precision
  FROM "uso_ia" u WHERE u."em" >= p_de AND u."em" < p_ate GROUP BY 1, 2, 3, 4
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_ia"(timestamptz, timestamptz) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_ia"(timestamptz, timestamptz) TO app_user;--> statement-breakpoint

-- As faturas do Decreta que vencem ou foram pagas no período: valor, datas e situação, sem link nem forma.
CREATE FUNCTION "plataforma_faturas"(p_de date, p_ate date) RETURNS TABLE (
  "id" text, "organization_id" text, "vencimento" date, "valor_centavos" integer, "situacao" text, "paga_em" date
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."id", f."organization_id", f."vencimento", f."valor_centavos", f."situacao"::text, f."paga_em"
  FROM "faturas" f WHERE f."vencimento" BETWEEN p_de AND p_ate OR f."paga_em" BETWEEN p_de AND p_ate
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_faturas"(date, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_faturas"(date, date) TO app_user;--> statement-breakpoint

-- Os marcos do funil de cada escritório (cadastro, OAB, primeira publicação, primeiro prazo confirmado), com a data.
CREATE FUNCTION "plataforma_marcos"() RETURNS TABLE ("organization_id" text, "nome" text, "em" timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT e."organization_id", e."nome", e."em" FROM "eventos" e WHERE e."organization_id" IS NOT NULL
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_marcos"() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_marcos"() TO app_user;--> statement-breakpoint

-- A foto do dia: só totais. Gravar de novo no mesmo dia troca a foto pela mais recente.
CREATE FUNCTION "plataforma_gravar_foto"(p_dia date, p_numeros jsonb) RETURNS void
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO "fotos_da_plataforma" ("dia", "numeros", "tirada_em") VALUES (p_dia, p_numeros, now())
  ON CONFLICT ("dia") DO UPDATE SET "numeros" = excluded."numeros", "tirada_em" = excluded."tirada_em"
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_gravar_foto"(date, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_gravar_foto"(date, jsonb) TO app_user;--> statement-breakpoint

CREATE FUNCTION "plataforma_fotos"(p_de date, p_ate date) RETURNS TABLE ("dia" date, "numeros" jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT f."dia", f."numeros" FROM "fotos_da_plataforma" f WHERE f."dia" BETWEEN p_de AND p_ate ORDER BY f."dia"
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "plataforma_fotos"(date, date) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "plataforma_fotos"(date, date) TO app_user;
