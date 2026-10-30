CREATE TYPE "public"."modo_conversa" AS ENUM('pergunte', 'jurisprudencia');--> statement-breakpoint
CREATE TABLE "conversas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"titulo" text NOT NULL,
	"modo" "modo_conversa" DEFAULT 'pergunte' NOT NULL,
	"processo_id" uuid,
	"fixada" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD COLUMN "conversa_id" uuid;--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD COLUMN "partes" jsonb;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversas" ADD CONSTRAINT "conversas_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conversas_user_idx" ON "conversas" USING btree ("organization_id","user_id","updated_at");--> statement-breakpoint
ALTER TABLE "mensagens_ia" ADD CONSTRAINT "mensagens_ia_conversa_id_conversas_id_fk" FOREIGN KEY ("conversa_id") REFERENCES "public"."conversas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_ia_conversa_idx" ON "mensagens_ia" USING btree ("organization_id","conversa_id","created_at");--> statement-breakpoint
CREATE POLICY "conversas_tenant_isolation" ON "conversas" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));--> statement-breakpoint
-- O Perguntar antigo era uma conversa só por pessoa: vira a primeira conversa dela.
INSERT INTO "conversas" ("organization_id", "user_id", "titulo", "created_at", "updated_at")
SELECT "organization_id", "user_id", 'Conversa anterior', min("created_at"), max("created_at")
FROM "mensagens_ia" WHERE "processo_id" IS NULL
GROUP BY "organization_id", "user_id";--> statement-breakpoint
UPDATE "mensagens_ia" m SET "conversa_id" = c."id"
FROM "conversas" c
WHERE m."processo_id" IS NULL AND m."conversa_id" IS NULL AND c."organization_id" = m."organization_id" AND c."user_id" = m."user_id";
