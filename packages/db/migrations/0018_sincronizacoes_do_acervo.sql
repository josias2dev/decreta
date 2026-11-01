CREATE TABLE "acervo_sincronizacoes" (
	"especie" text PRIMARY KEY NOT NULL,
	"primeira_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultima_em" timestamp with time zone DEFAULT now() NOT NULL
);
