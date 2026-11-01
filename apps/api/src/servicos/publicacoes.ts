import { analises, clientes, processos, publicacoes, type Tx } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

/** A fila e as novas tentativas terminam bem antes disso. */
const LEITURA_PARADA_DEPOIS_MS = 3_600_000;
/** A espera dobra a cada falha (1, 2, 4, 8 e 16 horas): a sexta falha é mais de um dia depois da primeira. */
const FALHAS_ATE_DESISTIR = 6;
const RELEITURAS_POR_RODADA = 20;

/** Chegou há tempo demais para ainda não ter leitura nenhuma: a rotina de fundo não rodou. */
export function leituraParada(chegouEm: Date): boolean {
  return Date.now() - chegouEm.getTime() > LEITURA_PARADA_DEPOIS_MS;
}

/**
 * O que a IA deve ler de novo sozinha, das mais antigas para as mais novas. A falta de
 * teor fica de fora: a resposta seria a mesma. Cliente que recusou a IA nunca entra.
 */
export async function publicacoesParaReler(tx: Tx): Promise<{ publicacaoId: string; nuncaLida: boolean }[]> {
  const novas = await tx
    .select({ id: publicacoes.id, chegouEm: publicacoes.createdAt })
    .from(publicacoes)
    .leftJoin(processos, eq(processos.id, publicacoes.processoId))
    .leftJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(and(eq(publicacoes.situacao, "nova"), isNull(publicacoes.canceladaEm), sql`coalesce(${clientes.semIa}, false) = false`))
    .orderBy(asc(publicacoes.createdAt));
  if (!novas.length) return [];
  const leituras = await tx
    .select({ alvoId: analises.alvoId, situacao: analises.situacao, em: analises.createdAt })
    .from(analises)
    .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, novas.map((p) => p.id))))
    .orderBy(desc(analises.createdAt));
  const pendentes: { publicacaoId: string; nuncaLida: boolean }[] = [];
  for (const p of novas) {
    const dela = leituras.filter((l) => l.alvoId === p.id);
    const ultima = dela[0];
    if (!ultima) {
      if (leituraParada(p.chegouEm)) pendentes.push({ publicacaoId: p.id, nuncaLida: true });
      continue;
    }
    const falhas = dela.filter((l) => l.situacao === "erro").length;
    if (ultima.situacao !== "erro" || falhas >= FALHAS_ATE_DESISTIR) continue;
    if (Date.now() - ultima.em.getTime() >= 2 ** (falhas - 1) * LEITURA_PARADA_DEPOIS_MS) pendentes.push({ publicacaoId: p.id, nuncaLida: false });
  }
  return pendentes.slice(0, RELEITURAS_POR_RODADA);
}

/** "Intimação · laudo pericial"; sem repetir quando o assunto é o próprio tipo ("Citação", não "Citação · citação"). */
export function tituloDaPublicacao(tipo: string | null, assunto: string | null): string {
  const t = tipo ?? "Comunicação";
  return assunto && assunto.toLocaleLowerCase("pt-BR") !== t.toLocaleLowerCase("pt-BR") ? `${t} · ${assunto}` : t;
}
