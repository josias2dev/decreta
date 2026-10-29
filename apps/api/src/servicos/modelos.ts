/**
 * Banco de teses: escolhe, entre os modelos do escritório, os que a IA segue ao
 * gerar uma peça. Primeiro os do mesmo tipo; entre eles e os outros, os que têm
 * mais palavras em comum com o caso (busca de texto do Postgres, em português).
 */
import { modelos, type Tx } from "@decreta/db";
import { desc, eq, or, sql } from "drizzle-orm";

/** Quantos modelos vão no pedido da peça: dois bastam para a IA pegar o jeito sem estourar o contexto. */
export const MODELOS_POR_PECA = 2;

const vetor = sql`to_tsvector('portuguese', ${modelos.titulo} || ' ' || coalesce(${modelos.tese}, '') || ' ' || coalesce(${modelos.assunto}, '') || ' ' || ${modelos.texto})`;

/** "Laudo pericial; perícia médica" → "laudo | pericial | pericia | medica" (qualquer palavra conta). */
export function consultaDeTexto(texto: string): string | null {
  const palavras = new Set(
    texto
      .toLocaleLowerCase("pt-BR")
      .split(/[^\p{L}]+/u)
      .filter((p) => p.length >= 4),
  );
  const lista = [...palavras].slice(0, 16);
  return lista.length ? lista.join(" | ") : null;
}

export async function modelosParaPeca(tx: Tx, pedido: { tipo: string; sobre: string }, limite = MODELOS_POR_PECA) {
  const q = consultaDeTexto(pedido.sobre);
  const consulta = q ? sql`to_tsquery('portuguese', ${q})` : null;
  const nota = consulta ? sql<number>`(case when ${modelos.tipo} = ${pedido.tipo} then 1 else 0 end) + ts_rank(${vetor}, ${consulta})` : sql<number>`case when ${modelos.tipo} = ${pedido.tipo} then 1 else 0 end`;
  return tx
    .select({ id: modelos.id, titulo: modelos.titulo, tese: modelos.tese, texto: modelos.texto })
    .from(modelos)
    .where(consulta ? or(eq(modelos.tipo, pedido.tipo), sql`${vetor} @@ ${consulta}`) : eq(modelos.tipo, pedido.tipo))
    .orderBy(desc(nota), desc(modelos.updatedAt))
    .limit(limite);
}

/** Busca da tela de modelos: todas as palavras, no título, na tese, no assunto ou no texto. */
export function buscaNosModelos(texto: string) {
  const t = texto.trim();
  if (!t) return undefined;
  return or(sql`${vetor} @@ plainto_tsquery('portuguese', ${t})`, sql`${modelos.titulo} ilike ${`%${t.replace(/[%_]/g, "")}%`}`);
}
