/**
 * Índices e taxas do Sistema Gerenciador de Séries Temporais (SGS) do Banco
 * Central, pela API pública e sem chave em api.bcb.gov.br/dados/serie. Os
 * códigos foram conferidos na fonte em 31/10/2026: IPCA 433, INPC 188,
 * IPCA-E 10764, SELIC diária 11 e mensal 4390, TR diária 226 e, da Lei
 * 14.905/2024, o fator SELIC 29541, o fator IPCA 29542 e a Taxa Legal 29543.
 *
 * Série diária aceita no máximo 10 anos por pedido: o período longo vai em
 * janelas. Período sem valor responde 404 "Value(s) not found", que aqui é
 * lista vazia. A SELIC mensal chega fora de ordem; sai sempre ordenada.
 */
import type { Serie } from "@decreta/core";
import { z } from "zod";

export const SGS_URL = "https://api.bcb.gov.br/dados/serie";

export const SGS = { ipca: 433, inpc: 188, ipcae: 10764, selicDiaria: 11, selic: 4390, trDiaria: 226, fatorSelic: 29541, fatorIpca: 29542, taxaLegal: 29543 } as const;

/** As séries diárias usadas aqui (e o CDI e a SELIC anualizada, para quem pedir). */
const DIARIAS = new Set<number>([SGS.selicDiaria, SGS.trDiaria, 12, 1178]);

export interface ValorDoSgs {
  /** AAAA-MM-DD */
  data: string;
  valor: number;
  /** Fim da janela, nas séries que têm (a TR). */
  dataFim?: string;
}

export interface OpcoesSgs {
  fetch?: typeof fetch;
  timeout?: number;
}

export class ErroSgs extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroSgs";
  }
}

const itemSchema = z.object({ data: z.string(), valor: z.string(), dataFim: z.string().optional() }).loose();

const iso = (br: string) => `${br.slice(6, 10)}-${br.slice(3, 5)}-${br.slice(0, 2)}`;
const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Último dia da janela de 10 anos que começa em `de`. */
function fimDaJanela(de: string): string {
  const d = new Date(`${de}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 10);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const diaSeguinte = (dia: string) => new Date(new Date(`${dia}T00:00:00Z`).getTime() + 86_400_000).toISOString().slice(0, 10);

async function pedir(codigo: number, de: string, ate: string, opcoes: OpcoesSgs): Promise<ValorDoSgs[]> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const url = `${SGS_URL}/bcdata.sgs.${codigo}/dados?formato=json&dataInicial=${br(de)}&dataFinal=${br(ate)}`;
  const res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
  const corpo = (await res.json().catch(() => null)) as unknown;
  if (res.status === 404 && /not found/i.test(JSON.stringify(corpo ?? ""))) return [];
  if (!res.ok) {
    const motivo = z.object({ error: z.string() }).safeParse(corpo);
    throw new ErroSgs(motivo.success ? motivo.data.error : `O Banco Central respondeu HTTP ${res.status} na série ${codigo}`, res.status);
  }
  const lista = z.array(itemSchema).safeParse(corpo);
  if (!lista.success) throw new ErroSgs(`O Banco Central respondeu num formato desconhecido na série ${codigo}`);
  return lista.data.map((i) => ({ data: iso(i.data), valor: Number(i.valor), ...(i.dataFim ? { dataFim: iso(i.dataFim) } : {}) }));
}

/** Os valores da série de `de` a `ate` (AAAA-MM-DD), em ordem de data. */
export async function buscarNoSgs(codigo: number, de: string, ate: string, opcoes: OpcoesSgs = {}): Promise<ValorDoSgs[]> {
  const janelas: Array<[string, string]> = [];
  if (DIARIAS.has(codigo)) {
    for (let inicio = de; inicio <= ate; ) {
      const fim = fimDaJanela(inicio) < ate ? fimDaJanela(inicio) : ate;
      janelas.push([inicio, fim]);
      inicio = diaSeguinte(fim);
    }
  } else janelas.push([de, ate]);
  const todos: ValorDoSgs[] = [];
  for (const [a, b] of janelas) todos.push(...(await pedir(codigo, a, b, opcoes)));
  return todos.sort((x, y) => x.data.localeCompare(y.data));
}

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};

/**
 * A série mês a mês, de `de` a `ate` (AAAA-MM). Na TR diária (226), o valor do
 * mês é o da janela do dia 1º ao dia 1º do mês seguinte (depois de fevereiro,
 * outras janelas também começam no dia 1º e terminam nos dias 29 a 31).
 */
export async function serieMensalDoSgs(codigo: number, de: string, ate: string, opcoes: OpcoesSgs = {}): Promise<Serie> {
  const valores = await buscarNoSgs(codigo, `${de}-01`, ultimoDia(ate), opcoes);
  const doMes = (v: ValorDoSgs) => !DIARIAS.has(codigo) || (v.data.endsWith("-01") && (!v.dataFim || v.dataFim.endsWith("-01")));
  return valores.filter(doMes).map((v) => ({ mes: v.data.slice(0, 7), valor: v.valor }));
}
