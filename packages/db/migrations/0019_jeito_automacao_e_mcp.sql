CREATE TABLE "tokens_mcp" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"nome" text NOT NULL,
	"hash" text NOT NULL,
	"usado_em" timestamp with time zone,
	"revogado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tokens_mcp" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escritorios" ADD COLUMN "jeito" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "escritorios" ADD COLUMN "automacao" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tokens_mcp" ADD CONSTRAINT "tokens_mcp_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tokens_mcp" ADD CONSTRAINT "tokens_mcp_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tokens_mcp_hash_uq" ON "tokens_mcp" USING btree ("hash");--> statement-breakpoint
CREATE INDEX "tokens_mcp_pessoa_idx" ON "tokens_mcp" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE POLICY "tokens_mcp_tenant_isolation" ON "tokens_mcp" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));