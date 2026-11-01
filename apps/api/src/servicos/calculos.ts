/**
 * O que os cálculos buscam fora e o que entregam à peça. Os índices saem do
 * SGS do Banco Central (só as séries e os meses que o cálculo usa), e o IPCA é
 * conferido no SIDRA do IBGE; a memória diz de onde veio cada um e se a
 * conferência bateu. A peça do catálogo recebe a memória do cálculo que lhe
 * cabe (o cumprimento de sentença, a da atualização; a inicial, a revisional).
 */
import { divergencias, indicesNecessarios, mesEmTexto, numeroBr, type Indice, type Indices, type PedidoDeAtualizacao, type Serie } from "@decreta/core";
import { calculos, type Tx } from "@decreta/db";
import { ipcaNoSidra, serieMensalDoSgs, SGS } from "@decreta/tribunais";
import { and, desc, eq, inArray } from "drizzle-orm";

const CODIGOS: Record<Indice | "taxaLegal", number> = { ipca: SGS.ipca, inpc: SGS.inpc, ipcae: SGS.ipcae, selic: SGS.selic, tr: SGS.trDiaria, taxaLegal: SGS.taxaLegal };

const FONTES: Record<Exclude<Indice | "taxaLegal", "ipca">, string> = {
  inpc: "INPC: série 188 do SGS do Banco Central.",
  ipcae: "IPCA-E: série 10764 do SGS do Banco Central.",
  selic: "SELIC: série 4390 do SGS do Banco Central (taxa do mês).",
  tr: "TR: série 226 do SGS do Banco Central (janela do dia 1º ao dia 1º do mês seguinte).",
  taxaLegal: "Taxa Legal: série 29543 do SGS do Banco Central (Lei 14.905/2024).",
};

/** Uma fonte pública que não respondeu: o cálculo não sai, e a tela pede para tentar depois. */
export class FonteFora extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FonteFora";
  }
}

async function conferirIpca(sgs: Serie, de: string, ate: string, fetchImpl: typeof fetch): Promise<string> {
  const base = "IPCA: série 433 do SGS do Banco Central";
  const doIbge = await ipcaNoSidra(de, ate, { fetch: fetchImpl }).catch(() => null);
  if (!doIbge) return `${base}; o SIDRA/IBGE não respondeu, e a conferência ficou por fazer.`;
  const diferentes = divergencias(sgs, doIbge);
  if (!diferentes.length) return `${base}, conferida no SIDRA/IBGE (tabela 1737): confere.`;
  const meses = diferentes.map((d) => `${mesEmTexto(d.mes)} (SGS ${numeroBr(d.a)}%; SIDRA ${d.b === null ? "sem o mês" : `${numeroBr(d.b)}%`})`);
  return `${base}; no SIDRA/IBGE, diverge em ${meses.join(", ")}. Confira antes de usar.`;
}

/** As séries do cálculo, e as linhas de "Fontes" da memória. */
export async function indicesDaAtualizacao(pedido: PedidoDeAtualizacao, fetchImpl: typeof fetch): Promise<{ indices: Indices; fontes: string[] }> {
  const { indices, de, ate } = indicesNecessarios(pedido);
  if (de > ate || !indices.length) return { indices: {}, fontes: [] };
  const lidos: Indices = {};
  for (const i of indices) {
    try {
      lidos[i] = await serieMensalDoSgs(CODIGOS[i], de, ate, { fetch: fetchImpl });
    } catch (err) {
      throw new FonteFora(err instanceof Error ? err.message : String(err));
    }
  }
  const fontes: string[] = [];
  for (const i of indices) fontes.push(i === "ipca" ? await conferirIpca(lidos.ipca!, de, ate, fetchImpl) : FONTES[i]);
  return { indices: lidos, fontes };
}

/** Que cálculos cada peça do catálogo lê. */
const CALCULOS_DA_PECA: Record<string, Array<"atualizacao" | "revisional" | "pjecalc">> = {
  "cumprimento-sentenca": ["atualizacao", "pjecalc"],
  "inicial-civel": ["revisional"],
  "inicial-jec": ["revisional"],
};

/** O cálculo mais recente de cada tipo que a peça lê, com a memória. */
export async function calculosParaPeca(tx: Tx, processoId: string, tipoDaPeca: string): Promise<{ titulo: string; memoria: string }[]> {
  const tipos = CALCULOS_DA_PECA[tipoDaPeca];
  if (!tipos) return [];
  const linhas = await tx
    .select({ tipo: calculos.tipo, titulo: calculos.titulo, memoria: calculos.memoria })
    .from(calculos)
    .where(and(eq(calculos.processoId, processoId), inArray(calculos.tipo, tipos)))
    .orderBy(desc(calculos.createdAt));
  return tipos.flatMap((t) => linhas.find((l) => l.tipo === t) ?? []).map(({ titulo, memoria }) => ({ titulo, memoria }));
}
