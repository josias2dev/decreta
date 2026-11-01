/** O que toda rota das telas tem: a sessão, o escritório ativo e os serviços. */
import type { Database, Tx } from "@decreta/db";
import { withTenant } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import type { Ia, MetodoIa } from "@decreta/ia";
import { type SQL, sql } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { z } from "zod";
import type { Auth } from "../auth.ts";
import type { Mailer } from "../email.ts";
import { ipDoPedido } from "../limitador.ts";
import type { DepsDaCaptura } from "../servicos/captura.ts";
import type { Wameow } from "../servicos/avisos.ts";
import { AVISOS, iaMedida, LimiteDaIa, motivoParaBarrar, registrarMensagem, reservarVez, SEM_LIMITES, usoDoDia, type LimitesDaIa } from "../servicos/uso-ia.ts";

export type Vars = {
  orgId: string;
  orgNome: string;
  /** Escritório de demonstração: sem DJEN nem DataJud. */
  demonstracao: boolean;
  /** Nasceu pelo cadastro aberto e ainda não foi liberado (ver `servicos/em-avaliacao.ts`). */
  emAvaliacao: boolean;
  timezone: string;
  userId: string;
  userNome: string;
  papel: string;
  /** A IA da rota, medida em nome da pessoa. Só existe nas rotas com `comLimiteDaIa`. */
  ia?: Ia;
};

export type Ambiente = { Variables: Vars };
export type C = Context<Ambiente>;

/** Evento para as rotinas de fundo (Inngest): sugerir prazo, capturar agora, atualizar do DataJud, ler um documento, preparar o rascunho do prazo confirmado. */
export type Pedido =
  | { nome: "publicacao.nova"; organizationId: string; publicacaoId: string }
  | { nome: "captura.djen"; organizationId: string }
  | { nome: "processo.datajud"; organizationId: string; processoId: string }
  | { nome: "documento.ler"; organizationId: string; documentoId: string }
  | { nome: "prazo.confirmado"; organizationId: string; prazoId: string };

/** Prazo confirmado: pede o rascunho da peça sugerida. Na demonstração, não (nada sai para a IA de verdade). A falha não desfaz a confirmação. */
export async function pedirRascunho(c: C, deps: DepsDasRotas, prazoId: string): Promise<void> {
  if (c.get("demonstracao")) return;
  await deps.enfileirar({ nome: "prazo.confirmado", organizationId: c.get("orgId"), prazoId }).catch((err) => deps.log("pedido do rascunho falhou", { prazoId, error: err instanceof Error ? err.message : String(err) }));
}

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
  /** Limites da IA nas telas. Sem eles (testes), só mede. */
  limites?: LimitesDaIa;
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

export function falha(status: 400 | 403 | 404 | 409 | 410 | 422 | 429 | 503, erro: string, detalhe?: string): never {
  throw new HTTPException(status, { res: Response.json({ erro, detalhe }, { status }) });
}

/** Por que a IA não pode atender esta pessoa agora (ver `motivoParaBarrar`), ou `null`. */
export async function motivoDaIa(c: C, deps: DepsDasRotas, mensagem = false): Promise<string | null> {
  const uso = await usoDoDia(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId") });
  return motivoParaBarrar(deps.limites ?? SEM_LIMITES, uso, { demonstracao: c.get("demonstracao"), emAvaliacao: c.get("emAvaliacao"), mensagem });
}

/**
 * Toda rota que chama a IA passa por aqui antes: confere os limites do dia
 * (e, com `mensagem`, conta a mensagem do chat), guarda uma vez para a pessoa
 * enquanto a resposta chega e deixa em `c.get("ia")` a IA que grava o gasto.
 * Sem passar por aqui a rota não tem IA (`iaDaRota` responde "desligada").
 */
export function comLimiteDaIa(deps: DepsDasRotas, opcoes: { mensagem?: MetodoIa } = {}): MiddlewareHandler<Ambiente> {
  return async (c, next) => {
    if (!deps.ia) return next();
    const limites = deps.limites ?? SEM_LIMITES;
    const quem = { organizationId: c.get("orgId"), userId: c.get("userId") };
    const devolver = reservarVez(quem.userId, limites.simultaneos);
    if (!devolver) throw new LimiteDaIa(AVISOS.simultaneos);
    try {
      const motivo = await motivoDaIa(c, deps, !!opcoes.mensagem);
      if (motivo) {
        deps.log("limite da IA", { userId: quem.userId, organizationId: quem.organizationId, motivo });
        throw new LimiteDaIa(motivo);
      }
      if (opcoes.mensagem) await registrarMensagem(deps.db, quem, opcoes.mensagem);
      c.set("ia", iaMedida(deps, deps.ia, { ...quem, origem: "tela" }, limites.preco));
      await next();
    } catch (err) {
      devolver();
      throw err;
    }
    // A resposta que chega aos poucos devolve a vez quando termina (ou quando a pessoa fecha a tela).
    // Só JSON comum volta na hora: o NDJSON do Perguntar também tem "json" no nome, mas chega aos poucos.
    const res = c.res;
    if (!res.body || /^application\/json\b/i.test(res.headers.get("content-type") ?? "")) return devolver();
    const leitor = res.body.getReader();
    c.res = new Response(
      new ReadableStream<Uint8Array>({
        async pull(controle) {
          try {
            const { done, value } = await leitor.read();
            if (done) {
              devolver();
              controle.close();
            } else controle.enqueue(value);
          } catch (err) {
            devolver();
            controle.error(err);
          }
        },
        cancel(motivo) {
          devolver();
          return leitor.cancel(motivo);
        },
      }),
      { status: res.status, statusText: res.statusText, headers: res.headers },
    );
  };
}

/** A IA desta rota, já medida e dentro dos limites (ver `comLimiteDaIa`). */
export function iaDaRota(c: C): Ia {
  return c.get("ia") ?? falha(503, "ia_desligada", "A IA ainda não foi ligada neste servidor.");
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Id da URL: formato errado é 404, não 500 do Postgres. */
/** Um id na query (`?processo=`): UUID ou nada; outra coisa é 400, não 500. */
export function queryId(c: C, nome: string): string | undefined {
  const v = c.req.query(nome);
  if (v === undefined || v === "") return undefined;
  if (!UUID.test(v)) falha(400, "id_invalido", `${nome}: id inválido.`);
  return v;
}

export function id(c: C, nome = "id"): string {
  const v = c.req.param(nome) ?? "";
  if (!UUID.test(v)) falha(404, "nao_encontrado");
  return v;
}

export const ehSocio = (papel: string) => papel === "owner" || papel === "admin";

export function ip(c: C): string | null {
  return ipDoPedido(c);
}

const COM_ACENTO = "áàâãäéèêëíìîïóòôõöúùûüçñ";
const SEM_ACENTO = "aaaaaeeeeiiiiooooouuuucn";

/** O texto no banco em minúsculas e sem acento, para comparar com `palavrasDaBusca`. */
export const semAcentoNoBanco = (texto: SQL) => sql`translate(lower(${texto}), ${COM_ACENTO}, ${SEM_ACENTO})`;

/** O que a pessoa digitou, inteiro, em minúsculas e sem acento, pronto para o LIKE contra `semAcentoNoBanco`. */
export const termoSemAcento = (busca: string) => `%${busca.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[%_\\]/g, "")}%`;

/**
 * O que a pessoa digitou, em palavras sem acento e em minúsculas: cada uma
 * precisa aparecer, em qualquer ordem ("laudo marina" acha "Laudo pericial"
 * do processo da Marina). Tira os curingas do LIKE e os separadores comuns.
 */
export function palavrasDaBusca(busca: string): string[] {
  return busca
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[\s%_\\·•,;:()\[\]"'/–—-]+/)
    .filter(Boolean)
    .slice(0, 8);
}
