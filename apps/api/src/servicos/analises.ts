/**
 * Análises da IA guardadas: cada pedido grava o resultado (pronto, recusa ou
 * erro) com a impressão digital do que a IA leu. A tela mostra a última e
 * avisa quando o material mudou desde então.
 */
import { analises, withTenant, type Database, type Tx } from "@decreta/db";
import { colherChamadas, IaRecusou, type ChamadaDaIa } from "@decreta/ia";
import { and, desc, eq } from "drizzle-orm";
import { procedenciaDe } from "./procedencia.ts";

export type Alvo = (typeof analises.$inferInsert)["alvo"];

export interface AnaliseNaTela {
  id: string;
  acao: string;
  situacao: "pronto" | "recusa" | "erro";
  conteudo: Record<string, unknown>;
  fonte: string | null;
  em: string;
  /** Há movimentação, publicação ou documento novo desde a análise. */
  desatualizada: boolean;
  erro: string | null;
}

export async function ultimaAnalise(tx: Tx, alvo: Alvo, alvoId: string, acao: string) {
  const [a] = await tx
    .select()
    .from(analises)
    .where(and(eq(analises.alvo, alvo), eq(analises.alvoId, alvoId), eq(analises.acao, acao)))
    .orderBy(desc(analises.createdAt))
    .limit(1);
  return a ?? null;
}

export function naTela(a: typeof analises.$inferSelect | null, baseAtual?: string): AnaliseNaTela | null {
  if (!a) return null;
  return {
    id: a.id,
    acao: a.acao,
    situacao: a.situacao,
    conteudo: a.conteudo,
    fonte: a.fonte,
    em: a.createdAt.toISOString(),
    desatualizada: baseAtual !== undefined && a.situacao === "pronto" && a.base !== baseAtual,
    erro: a.erro,
  };
}

export interface PedidoDeAnalise<E> {
  organizationId: string;
  alvo: Alvo;
  alvoId: string;
  acao: string;
  userId?: string | null;
  /** Lê o que a IA precisa (dentro do escopo do escritório). `null` = o alvo não existe. */
  preparar: (tx: Tx) => Promise<{ entrada: E; base: string; fonte: string } | null>;
  /** Chama a IA, fora da transação: pode levar dezenas de segundos. */
  executar: (entrada: E) => Promise<Record<string, unknown>>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/** Roda e grava. Devolve a análise como a tela mostra, ou `null` se o alvo não existe. */
export async function analisar<E>(db: Database, p: PedidoDeAnalise<E>): Promise<AnaliseNaTela | null> {
  const preparado = await withTenant(db, p.organizationId, p.preparar);
  if (!preparado) return null;
  let situacao: AnaliseNaTela["situacao"] = "pronto";
  let conteudo: Record<string, unknown> = {};
  let erro: string | null = null;
  const chamadas: ChamadaDaIa[] = [];
  try {
    conteudo = await colherChamadas(chamadas, () => p.executar(preparado.entrada));
  } catch (err) {
    if (err instanceof IaRecusou) {
      situacao = "recusa";
      conteudo = { recusa: err.motivo };
    } else {
      situacao = "erro";
      erro = err instanceof Error ? err.message.slice(0, 500) : String(err);
      p.log?.("ia falhou", { acao: p.acao, alvoId: p.alvoId, error: erro });
    }
  }
  const [linha] = await withTenant(db, p.organizationId, (tx) =>
    tx
      .insert(analises)
      .values({ organizationId: p.organizationId, alvo: p.alvo, alvoId: p.alvoId, acao: p.acao, situacao, conteudo, fonte: preparado.fonte, base: preparado.base, erro, procedencia: procedenciaDe(chamadas), pedidaPor: p.userId ?? null })
      .returning(),
  );
  return naTela(linha!, preparado.base);
}
