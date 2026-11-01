CREATE TABLE "acervo_documentos" (
	"chave" text PRIMARY KEY NOT NULL,
	"fonte" text NOT NULL,
	"situacao" text NOT NULL,
	"cancelado" boolean DEFAULT false NOT NULL,
	"texto" text,
	"url" text NOT NULL,
	"hash" text NOT NULL,
	"atualizado_na_fonte" text,
	"capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "acervo_normas" (
	"sigla" text PRIMARY KEY NOT NULL,
	"urn" text NOT NULL,
	"nome" text NOT NULL,
	"apelido" text,
	"url" text NOT NULL,
	"por_dispositivo" boolean NOT NULL,
	"dispositivos" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"atualizado_na_fonte" text,
	"capturado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "verificacao" jsonb;