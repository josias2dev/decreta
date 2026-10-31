ALTER TABLE "clientes" ADD COLUMN "termo_ia_documento_id" uuid;--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "termo_ia_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_termo_ia_documento_id_documentos_id_fk" FOREIGN KEY ("termo_ia_documento_id") REFERENCES "public"."documentos"("id") ON DELETE set null ON UPDATE no action;