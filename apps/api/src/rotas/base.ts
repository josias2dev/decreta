/** O que toda rota das telas tem: a sessão, o escritório ativo e os serviços. */
import type { Database, Tx } from "@decreta/db";
import { withTenant } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import type { Ia } from "@decreta/ia";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { Auth } from "../auth.ts";
import type { Mailer } from "../email.ts";
import type { DepsDaCaptura } from "../servicos/captura.ts";
import type { Wameow } from "../servicos/avisos.ts";

export type Vars = {
  orgId: string;
  orgNome: string;
  /** Escritório de demonstração: sem DJEN nem DataJud. */
  demonstracao: boolean;
  timezone: string;
  userId: string;
  userNome: string;
  papel: string;
};

export type Ambiente = { Variables: Vars };
export type C = Context<Ambiente>;

/** Evento para as rotinas de fundo (Inngest): sugerir prazo, capturar agora, atualizar do DataJud, ler um documento. */
export type Pedido =
  | { nome: "publicacao.nova"; organizationId: string; publicacaoId: string }
  | { nome: "captura.djen"; organizationId: string }
  | { nome: "processo.datajud"; organizationId: string; processoId: string }
  | { nome: "documento.ler"; organizationId: string; documentoId: string };

export interface DepsDasRotas {
  db: Database;
  auth: Auth;
  ia: Ia | null;
  arquivos: Armazenamento;
  mailer: Mailer;
  telas: string;
  captura: DepsDaCaptura;
  wameow?: Wameow;
  maxArquivoBytes: number;
  enfileirar: (p: Pedido) => Promise<void>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export function tenant<T>(c: C, deps: { db: Database }, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant(deps.db, c.get("orgId"), fn);
}

export async function corpo<S extends z.ZodType>(c: C, schema: S): Promise<z.infer<S>> {
  const json = await c.req.json().catch(() => null);
  const r = schema.safeParse(json);
  if (!r.success) {
    const detalhe = r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ");
    throw new HTTPException(400, { res: Response.json({ erro: "dados_invalidos", detalhe }, { status: 400 }) });
  }
  return r.data;
}

export function falha(status: 400 | 403 | 404 | 409 | 422 | 503, erro: string, detalhe?: string): never {
  throw new HTTPException(status, { res: Response.json({ erro, detalhe }, { status }) });
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id da URL: formato errado é 404, não 500 do Postgres. */
export function id(c: C, nome = "id"): string {
  const v = c.req.param(nome) ?? "";
  if (!UUID.test(v)) falha(404, "nao_encontrado");
  return v;
}

export const ehSocio = (papel: string) => papel === "owner" || papel === "admin";

export function ip(c: C): string | null {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}
