ALTER TABLE "prazos" ADD COLUMN "intimado_no_sistema_em" date;--> statement-breakpoint
ALTER TABLE "prazos" ADD COLUMN "fim_digitado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "prazos" SET "fim_digitado" = true WHERE "observacoes" LIKE '%Data final digitada à mão%';
