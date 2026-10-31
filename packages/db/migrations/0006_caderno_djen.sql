CREATE TYPE "public"."situacao_caderno" AS ENUM('lido', 'ausente', 'erro');--> statement-breakpoint
CREATE TABLE "cadernos_djen" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"tribunal" text NOT NULL,
	"dia" date NOT NULL,
	"situacao" "situacao_caderno" NOT NULL,
	"versao" integer,
	"total" integer DEFAULT 0 NOT NULL,
	"casadas" integer DEFAULT 0 NOT NULL,
	"novas" integer DEFAULT 0 NOT NULL,
	"canceladas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"lido_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cadernos_djen" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD COLUMN "hash" text;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD COLUMN "certidao" text;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD COLUMN "cancelada_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "publicacoes" ADD COLUMN "motivo_cancelamento" text;--> statement-breakpoint
ALTER TABLE "cadernos_djen" ADD CONSTRAINT "cadernos_djen_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cadernos_djen_uq" ON "cadernos_djen" USING btree ("organization_id","tribunal","dia");--> statement-breakpoint
CREATE POLICY "cadernos_djen_tenant_isolation" ON "cadernos_djen" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));