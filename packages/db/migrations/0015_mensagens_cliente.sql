CREATE TYPE "public"."situacao_mensagem_cliente" AS ENUM('rascunho', 'enviada', 'falhou', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."tipo_mensagem_cliente" AS ENUM('decisao', 'documentos');--> statement-breakpoint
CREATE TABLE "mensagens_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"cliente_id" uuid NOT NULL,
	"processo_id" uuid,
	"prazo_id" uuid,
	"tipo" "tipo_mensagem_cliente" NOT NULL,
	"situacao" "situacao_mensagem_cliente" DEFAULT 'rascunho' NOT NULL,
	"texto_ia" text,
	"texto" text NOT NULL,
	"itens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"enviado" text,
	"para" text,
	"link_hash" text,
	"link_expira_em" timestamp with time zone,
	"recebidos" integer DEFAULT 0 NOT NULL,
	"criada_por" text,
	"aprovada_por" text,
	"aprovada_em" timestamp with time zone,
	"enviada_em" timestamp with time zone,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "escritorios" ADD COLUMN "whatsapp_oficial" text;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_processo_id_processos_id_fk" FOREIGN KEY ("processo_id") REFERENCES "public"."processos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_prazo_id_prazos_id_fk" FOREIGN KEY ("prazo_id") REFERENCES "public"."prazos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_criada_por_user_id_fk" FOREIGN KEY ("criada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens_cliente" ADD CONSTRAINT "mensagens_cliente_aprovada_por_user_id_fk" FOREIGN KEY ("aprovada_por") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mensagens_cliente_cliente_idx" ON "mensagens_cliente" USING btree ("organization_id","cliente_id","created_at");--> statement-breakpoint
CREATE INDEX "mensagens_cliente_prazo_idx" ON "mensagens_cliente" USING btree ("organization_id","prazo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mensagens_cliente_link_uq" ON "mensagens_cliente" USING btree ("organization_id","link_hash");--> statement-breakpoint
CREATE POLICY "mensagens_cliente_tenant_isolation" ON "mensagens_cliente" AS PERMISSIVE FOR ALL TO "app_user" USING (organization_id = current_setting('app.org_id', true)) WITH CHECK (organization_id = current_setting('app.org_id', true));