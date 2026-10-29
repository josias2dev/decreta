/**
 * Diário de Justiça Eletrônico Nacional (DJEN), pela API pública de
 * comunicações do CNJ (comunicaapi.pje.jus.br). A busca é por OAB e período
 * de disponibilização; cada comunicação vira uma publicação do escritório.
 *
 * A API limita o ritmo: entre páginas há uma pausa, e 429 espera e tenta de
 * novo. Campo que mudar de nome não derruba a captura: o que não se lê fica
 * vazio, e a publicação chega com o texto que veio.
 */
import { formatarCnj, limparCnj, nomeProprio } from "@decreta/core";
import { z } from "zod";

export const DJEN_URL = "https://comunicaapi.pje.jus.br/api/v1/comunicacao";

const texto = z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional());

const advogadoSchema = z.object({ nome: texto, numero_oab: texto, uf_oab: texto }).loose();

const itemSchema = z
  .object({
    id: z.union([z.number(), z.string()]).transform(String),
    data_disponibilizacao: texto,
    datadisponibilizacao: texto,
    siglaTribunal: texto,
    tipoComunicacao: texto,
    nomeOrgao: texto,
    texto: texto,
    numero_processo: texto,
    numeroprocessocommascara: texto,
    link: texto,
    tipoDocumento: texto,
    nomeClasse: texto,
    hash: texto,
    ativo: z.boolean().optional(),
    destinatarios: z.array(z.object({ nome: texto, polo: texto }).loose()).optional().catch([]),
    destinatarioadvogados: z.array(z.object({ advogado: advogadoSchema.optional() }).loose()).optional().catch([]),
  })
  .loose();

const respostaSchema = z
  .object({
    count: z.number().optional(),
    items: z.array(z.unknown()).default([]),
  })
  .loose();

export interface ComunicacaoDjen {
  idExterno: string;
  /** AAAA-MM-DD */
  disponibilizadaEm: string;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  classe: string | null;
  /** Com máscara do CNJ. */
  cnj: string | null;
  texto: string;
  link: string | null;
  destinatarios: { nome: string; polo?: string }[];
  advogados: { nome: string; oab?: string; uf?: string }[];
}

/** "28/10/2026" ou "2026-10-28..." → "2026-10-28". */
function dia(...valores: Array<string | undefined>): string | null {
  for (const v of valores) {
    if (!v) continue;
    const br = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(v);
    if (br) return `${br[3]}-${br[2]}-${br[1]}`;
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(v);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

/** O texto do DJEN vem com HTML simples (<br>, <p>, entidades): vira texto corrido. */
export function textoLimpo(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const POLOS: Record<string, string> = { A: "ativo", P: "passivo" };

export function lerComunicacao(bruto: unknown): ComunicacaoDjen | null {
  const r = itemSchema.safeParse(bruto);
  if (!r.success) return null;
  const i = r.data;
  if (i.ativo === false) return null;
  const disponibilizadaEm = dia(i.data_disponibilizacao, i.datadisponibilizacao);
  if (!disponibilizadaEm) return null;
  const numero = i.numeroprocessocommascara ?? i.numero_processo;
  return {
    idExterno: i.id,
    disponibilizadaEm,
    tribunal: i.siglaTribunal ?? null,
    orgao: i.nomeOrgao ? nomeProprio(i.nomeOrgao) : null,
    tipoComunicacao: i.tipoComunicacao ?? null,
    tipoDocumento: i.tipoDocumento ?? null,
    classe: i.nomeClasse ? nomeProprio(i.nomeClasse) : null,
    cnj: numero && limparCnj(numero).length === 20 ? formatarCnj(numero) : null,
    texto: textoLimpo(i.texto ?? ""),
    link: i.link ?? null,
    destinatarios: (i.destinatarios ?? []).filter((d) => d.nome).map((d) => ({ nome: nomeProprio(d.nome!), polo: d.polo ? (POLOS[d.polo] ?? d.polo) : undefined })),
    advogados: (i.destinatarioadvogados ?? [])
      .map((d) => d.advogado)
      .filter((a): a is z.infer<typeof advogadoSchema> => !!a?.nome)
      .map((a) => ({ nome: nomeProprio(a.nome!), oab: a.numero_oab, uf: a.uf_oab })),
  };
}

export interface BuscaDjen {
  oab: string;
  uf: string;
  /** AAAA-MM-DD */
  de: string;
  ate: string;
}

export interface OpcoesDjen {
  fetch?: typeof fetch;
  /** Pausa entre páginas, em ms (a API limita o ritmo). */
  pausa?: number;
  porPagina?: number;
  /** Teto de páginas por busca: um advogado com mais que isso num dia é exceção. */
  maxPaginas?: number;
  dormir?: (ms: number) => Promise<void>;
}

export class ErroDjen extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Todas as comunicações da OAB no período. */
export async function buscarNoDjen(busca: BuscaDjen, opcoes: OpcoesDjen = {}): Promise<ComunicacaoDjen[]> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const porPagina = opcoes.porPagina ?? 100;
  const maxPaginas = opcoes.maxPaginas ?? 20;
  const saida: ComunicacaoDjen[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = new URL(DJEN_URL);
    url.searchParams.set("numeroOab", busca.oab.replace(/\D/g, ""));
    url.searchParams.set("ufOab", busca.uf.toUpperCase());
    url.searchParams.set("dataDisponibilizacaoInicio", busca.de);
    url.searchParams.set("dataDisponibilizacaoFim", busca.ate);
    url.searchParams.set("pagina", String(pagina));
    url.searchParams.set("itensPorPagina", String(porPagina));

    let res: Response | null = null;
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(30_000) });
      if (res.status !== 429 && res.status < 500) break;
      await dormir(2_000 * 2 ** tentativa);
    }
    if (!res || !res.ok) throw new ErroDjen(`DJEN respondeu HTTP ${res?.status ?? "sem resposta"}`, res?.status);
    const corpo = respostaSchema.safeParse(await res.json().catch(() => null));
    if (!corpo.success) throw new ErroDjen("DJEN devolveu um formato desconhecido");

    for (const bruto of corpo.data.items) {
      const c = lerComunicacao(bruto);
      if (c && !vistos.has(c.idExterno)) {
        vistos.add(c.idExterno);
        saida.push(c);
      }
    }
    const total = corpo.data.count ?? 0;
    if (corpo.data.items.length < porPagina || (total && pagina * porPagina >= total)) break;
    await dormir(opcoes.pausa ?? 1_000);
  }
  return saida;
}
