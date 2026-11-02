/**
 * Eventos do funil (ver `eventos` em @decreta/db): só o nome, o instante e,
 * quando houver, o escritório. Gravar nunca derruba a ação: a falha vai para o
 * log e a ação segue, como no registro de auditoria.
 */
import { instanteLocal, somarDias, type Dia, type NomeDeEvento } from "@decreta/core";
import { eventos, withTenant, type Database } from "@decreta/db";
import { sql } from "drizzle-orm";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** Um evento sem escritório: o que o site mandou (uma visita, um clique) ou o de um escritório que acabou de ser apagado. Nenhum dado da pessoa. */
export async function registrarEventoSemEscritorio(db: Database, nome: NomeDeEvento, log?: Log): Promise<void> {
  try {
    await db.insert(eventos).values({ nome });
  } catch (err) {
    log?.("evento não foi gravado", { nome, error: err instanceof Error ? err.message : String(err) });
  }
}

/** Um marco do escritório, gravado uma vez só (o segundo pedido não faz nada). */
export async function registrarEvento(db: Database, nome: NomeDeEvento, organizationId: string, log?: Log): Promise<void> {
  try {
    await withTenant(db, organizationId, (tx) => tx.insert(eventos).values({ nome, organizationId }).onConflictDoNothing());
  } catch (err) {
    log?.("evento não foi gravado", { nome, organizationId, error: err instanceof Error ? err.message : String(err) });
  }
}

/** O total de cada evento, de todos os escritórios, do primeiro minuto de `de` ao último de `ate` (dias de São Paulo). */
export async function contarEventos(db: Database, de: Dia, ate: Dia): Promise<Record<string, number>> {
  const linhas = await db.execute<{ nome: string; total: number }>(sql`select nome, total from contagem_de_eventos(${instanteLocal(de).toISOString()}::timestamptz, ${instanteLocal(somarDias(ate, 1)).toISOString()}::timestamptz)`);
  return Object.fromEntries([...linhas].map((l) => [l.nome, l.total]));
}
