-- Os códigos do jeito antigo (mandados do celular) não valem mais: vivem 10 minutos e não têm o número.
DELETE FROM "whatsapp_codigos";--> statement-breakpoint
ALTER TABLE "whatsapp_codigos" ADD COLUMN "telefone" text NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_codigos" ADD COLUMN "tentativas" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_vinculos" ADD COLUMN "boas_vindas_em" timestamp with time zone;--> statement-breakpoint
-- Quem ligou do jeito antigo já recebeu as boas-vindas na hora.
UPDATE "whatsapp_vinculos" SET "boas_vindas_em" = "verificado_em";
