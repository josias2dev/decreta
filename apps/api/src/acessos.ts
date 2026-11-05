/**
 * O dia em que cada pessoa usou o app, para o painel da plataforma (último acesso, pessoas ativas, celular ou
 * computador). Uma linha por pessoa, escritório e dia: o primeiro pedido do dia grava, os outros nem chegam ao
 * banco, porque a API lembra o que já gravou. Falhar nunca derruba o pedido.
 */
import { hojeEm, type Dia } from "@decreta/core";
import { acessos, withTenant, type Database } from "@decreta/db";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

const CELULAR = /Mobi|Android|iPhone|iPad|iPod/i;
export const aparelhoDoNavegador = (userAgent: string | null | undefined) => (userAgent && CELULAR.test(userAgent) ? "celular" : "computador");

/** O último dia gravado de cada pessoa em cada escritório, nesta API. Um processo só: cabe na memória. */
const gravados = new Map<string, Dia>();

export async function registrarAcesso(db: Database, p: { organizationId: string; userId: string; userAgent?: string | null; agora?: Date }, log?: Log): Promise<void> {
  const dia = hojeEm("America/Sao_Paulo", p.agora);
  const chave = `${p.organizationId}:${p.userId}`;
  if (gravados.get(chave) === dia) return;
  gravados.set(chave, dia);
  try {
    await withTenant(db, p.organizationId, (tx) => tx.insert(acessos).values({ organizationId: p.organizationId, userId: p.userId, dia, aparelho: aparelhoDoNavegador(p.userAgent) }).onConflictDoNothing());
  } catch (err) {
    gravados.delete(chave);
    log?.("acesso não foi gravado", { organizationId: p.organizationId, error: err instanceof Error ? err.message : String(err) });
  }
}
