-- A página aberta de cobertura mostra, por tribunal, a última leitura do DJEN. Os cadernos são de cada escritório e o RLS
-- não deixa a aplicação ver os de todos: esta função (do dono, que não passa pelo RLS) devolve só o tribunal, as datas e
-- nada de escritório. A demonstração (`fora`) fica de fora, porque os cadernos dela são inventados.
CREATE FUNCTION "cobertura_do_djen"(fora text) RETURNS TABLE ("tribunal" text, "dia" text, "lido_em" timestamptz, "ultimo_envio" text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    c."tribunal",
    (max(c."dia") FILTER (WHERE c."situacao" = 'lido'))::text,
    max(c."lido_em") FILTER (WHERE c."situacao" = 'lido'),
    max(c."ultimo_envio")::text
  FROM "cadernos_djen" c
  JOIN "organization" o ON o."id" = c."organization_id"
  WHERE o."slug" <> fora
  GROUP BY c."tribunal"
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION "cobertura_do_djen"(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "cobertura_do_djen"(text) TO app_user;
