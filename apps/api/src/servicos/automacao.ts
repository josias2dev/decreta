/** O nível de automação que o escritório escolheu para uma ação (com o padrão e as travas). */
import { nivelDaAcao, type AcaoAutomatizavel, type NivelDeAutomacao } from "@decreta/core";
import { escritorios, type Tx } from "@decreta/db";
import { eq } from "drizzle-orm";

export async function nivelNoEscritorio(tx: Tx, organizationId: string, acao: AcaoAutomatizavel): Promise<NivelDeAutomacao> {
  const [e] = await tx.select({ automacao: escritorios.automacao }).from(escritorios).where(eq(escritorios.organizationId, organizationId));
  return nivelDaAcao(e?.automacao ?? {}, acao);
}
