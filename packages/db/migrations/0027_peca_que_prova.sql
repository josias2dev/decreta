ALTER TABLE "pecas" ADD COLUMN "conferencia" jsonb;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "estrategia" jsonb;--> statement-breakpoint
ALTER TABLE "pecas" ADD COLUMN "julgados" jsonb DEFAULT '[]'::jsonb NOT NULL;