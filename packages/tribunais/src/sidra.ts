/**
 * IPCA na fonte primária, o SIDRA do IBGE (apisidra.ibge.gov.br, sem chave):
 * tabela 1737, variável 63 (variação mensal). Serve para conferir o IPCA que
 * o cálculo leu do SGS do Banco Central. A primeira linha da resposta é o
 * cabeçalho; mês ainda sem dado vem com "..." e fica de fora.
 */
import type { Serie } from "@decreta/core";
import { z } from "zod";

export const SIDRA_URL = "https://apisidra.ibge.gov.br/values";

export class ErroSidra extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroSidra";
  }
}

const linhaSchema = z.object({ V: z.string(), D3C: z.string() }).loose();

/** O IPCA mês a mês, de `de` a `ate` (AAAA-MM). */
export async function ipcaNoSidra(de: string, ate: string, opcoes: { fetch?: typeof fetch; timeout?: number } = {}): Promise<Serie> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const periodo = `${de.replace("-", "")}-${ate.replace("-", "")}`;
  const res = await fetchImpl(`${SIDRA_URL}/t/1737/n1/all/v/63/p/${periodo}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
  if (!res.ok) throw new ErroSidra(`O SIDRA respondeu HTTP ${res.status}`, res.status);
  const linhas = z.array(linhaSchema).safeParse(await res.json().catch(() => null));
  if (!linhas.success) throw new ErroSidra("O SIDRA respondeu num formato desconhecido");
  return linhas.data
    .filter((l) => /^\d{6}$/.test(l.D3C) && /^-?\d+(\.\d+)?$/.test(l.V))
    .map((l) => ({ mes: `${l.D3C.slice(0, 4)}-${l.D3C.slice(4, 6)}`, valor: Number(l.V) }));
}
