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

/** Para as listas com processos de vários lugares: lê as suspensões uma vez só e monta um calendário por tribunal e comarca. */
export async function calendariosDoEscritorio(tx: Tx, organizationId: string): Promise<(p: { tribunal: string | null; comarca: string | null }) => Calendario> {
  const [linhas, padrao] = await Promise.all([tx.select().from(suspensoes), tribunalPadrao(tx, organizationId)]);
  const prontos = new Map<string, Calendario>();
  return ({ tribunal, comarca }) => {
    const t = tribunal ?? padrao;
    const chave = `${t}|${comarca ?? ""}`;
    let cal = prontos.get(chave);
    if (!cal) {
      const extras: Feriado[] = linhas.filter((l) => (!l.tribunal || l.tribunal === t) && (comarca ? !l.comarca || l.comarca === comarca : !l.comarca)).map((l) => ({ dia: l.dia, nome: l.motivo, tipo: l.tipo }));
      cal = calendarioPara({ tribunal: t, extras });
      prontos.set(chave, cal);
    }
    return cal;
  };
}
