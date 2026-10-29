/** O calendário de prazos de um processo: tribunal + feriados e suspensões que o escritório cadastrou. */
import { calendarioPara, type Calendario, type Feriado } from "@decreta/core";
import { escritorios, suspensoes, type Tx } from "@decreta/db";
import { and, eq, isNull, or } from "drizzle-orm";

export async function tribunalPadrao(tx: Tx, organizationId: string): Promise<string> {
  const [e] = await tx.select({ tribunal: escritorios.tribunal }).from(escritorios).where(eq(escritorios.organizationId, organizationId));
  return e?.tribunal ?? "TJSC";
}

export async function calendarioDoEscritorio(tx: Tx, tribunal: string, comarca?: string | null): Promise<Calendario> {
  const linhas = await tx
    .select()
    .from(suspensoes)
    .where(and(or(isNull(suspensoes.tribunal), eq(suspensoes.tribunal, tribunal)), comarca ? or(isNull(suspensoes.comarca), eq(suspensoes.comarca, comarca)) : isNull(suspensoes.comarca)));
  const extras: Feriado[] = linhas.map((l) => ({ dia: l.dia, nome: l.motivo, tipo: l.tipo }));
  return calendarioPara({ tribunal, extras });
}
