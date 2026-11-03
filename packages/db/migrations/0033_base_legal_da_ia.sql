ALTER TABLE "prazos" ADD COLUMN "fundamento_da_ia" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Os prazos que já existem: o artigo é o que a IA leu da publicação, e ninguém escreveu outro por cima.
UPDATE "prazos" p SET "fundamento_da_ia" = true
WHERE p."fundamento" IS NOT NULL AND p."publicacao_id" IS NOT NULL AND EXISTS (
  SELECT 1 FROM "analises" a
  WHERE a."organization_id" = p."organization_id" AND a."alvo" = 'publicacao' AND a."alvo_id" = p."publicacao_id" AND a."acao" = 'sugerir-prazo' AND a."conteudo"->>'fundamento' = p."fundamento"
);
--> statement-breakpoint
-- Função com os poderes do dono: uma tabela temporária de quem chama não pode passar à frente das de verdade.
ALTER FUNCTION "gasto_da_ia_no_site"(timestamptz) SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION "contagem_de_eventos"(timestamptz, timestamptz) SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION "cobertura_do_djen"(text) SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION "plataforma_escritorios"() SET search_path = public, pg_temp;
--> statement-breakpoint
ALTER FUNCTION "plataforma_auditoria"(integer) SET search_path = public, pg_temp;
