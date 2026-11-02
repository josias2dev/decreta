CREATE TABLE "textos_da_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"campo" text NOT NULL,
	"modo" text NOT NULL,
	"processo_id" uuid,
	"cliente_id" uuid,
	"situacao" "situacao_ia" NOT NULL,
	"conteudo" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"erro" text,
	"procedencia" jsonb,
	"pedida_por" text,
	"usado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "textos_da_ia" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "textos_da_ia" ADD CONSTRAINT "textos_da_ia_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_da_ia" ADD CONSTRAINT "textos_da_ia_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_da_ia" ADD CONSTRAINT "textos_da_ia_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "textos_da_ia" ADD CONSTRAINT "textos_da_ia_pedida_por_user_id_fk" FOREIGN KEY ("pedida_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "textos_da_ia_dia_idx" ON "textos_da_ia" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE POLICY "textos_da_ia_tenant_isolation" ON "textos_da_ia" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));