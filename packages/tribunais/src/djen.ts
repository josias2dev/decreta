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
  /** Espera por página, em ms. */
  timeout?: number;
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
  return paginar(
    { numeroOab: busca.oab.replace(/\D/g, ""), ufOab: busca.uf.toUpperCase(), dataDisponibilizacaoInicio: busca.de, dataDisponibilizacaoFim: busca.ate },
    opcoes,
  );
}

/**
 * As comunicações de um processo, pelo número: é daqui que saem as partes e os
 * advogados (o DataJud não traz nomes). Processo sem publicação volta vazio.
 */
export async function buscarDjenDoProcesso(cnj: string, opcoes: OpcoesDjen = {}): Promise<ComunicacaoDjen[]> {
  return paginar({ numeroProcesso: limparCnj(cnj) }, { maxPaginas: 3, ...opcoes });
}

async function paginar(filtro: Record<string, string>, opcoes: OpcoesDjen): Promise<ComunicacaoDjen[]> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const porPagina = opcoes.porPagina ?? 100;
  const maxPaginas = opcoes.maxPaginas ?? 20;
  const saida: ComunicacaoDjen[] = [];
  const vistos = new Set<string>();

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const url = new URL(DJEN_URL);
    for (const [k, v] of Object.entries(filtro)) url.searchParams.set(k, v);
    url.searchParams.set("pagina", String(pagina));
    url.searchParams.set("itensPorPagina", String(porPagina));

    let res: Response | null = null;
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      res = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
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

export interface AdvogadoDjen {
  nome: string;
  oab?: string;
  uf?: string;
}

export interface ParteDjen {
  nome: string;
  polo: "ativo" | "passivo" | "terceiro";
  /** Os advogados que receberam intimação junto com esta parte, e só com ela. */
  advogados: AdvogadoDjen[];
}

export interface PartesDoDjen {
  partes: ParteDjen[];
  /** O lado em que a OAB da equipe aparece, quando dá para dizer. */
  poloDaEquipe: "ativo" | "passivo" | null;
  orgao: string | null;
  classe: string | null;
  publicacoes: number;
}

const chaveDoNome = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const chaveDaOab = (a: AdvogadoDjen) => (a.oab ? `${a.oab.replace(/\D/g, "")}/${(a.uf ?? "").toUpperCase()}` : chaveDoNome(a.nome));

/**
 * Junta as partes de todas as comunicações. O DJEN não diz de quem é cada
 * advogado; quando a comunicação vai a um lado só, os advogados dela são desse
 * lado. Com a OAB da equipe entre eles, esse é o lado do cliente.
 */
export function partesDoDjen(itens: ComunicacaoDjen[], oabsDaEquipe: { numero: string; uf: string }[] = []): PartesDoDjen {
  const equipe = new Set(oabsDaEquipe.map((o) => `${o.numero.replace(/\D/g, "")}/${o.uf.toUpperCase()}`));
  const partes = new Map<string, { nome: string; polos: Map<string, number>; advogados: Map<string, AdvogadoDjen> }>();
  const votos = { ativo: 0, passivo: 0 };
  for (const i of itens) {
    const polos = new Set<string>();
    for (const d of i.destinatarios) {
      const polo = d.polo === "ativo" || d.polo === "passivo" ? d.polo : "terceiro";
      polos.add(polo);
      const chave = chaveDoNome(d.nome);
      if (!chave) continue;
      const p = partes.get(chave) ?? { nome: d.nome, polos: new Map(), advogados: new Map() };
      p.polos.set(polo, (p.polos.get(polo) ?? 0) + 1);
      partes.set(chave, p);
    }
    if (polos.size !== 1) continue;
    const [polo] = polos;
    for (const d of i.destinatarios) {
      const p = partes.get(chaveDoNome(d.nome));
      for (const a of i.advogados) if (p && a.nome) p.advogados.set(chaveDaOab(a), a);
    }
    if ((polo === "ativo" || polo === "passivo") && i.advogados.some((a) => equipe.has(chaveDaOab(a)))) votos[polo]++;
  }
  const lista: ParteDjen[] = [...partes.values()].map((p) => ({
    nome: p.nome,
    polo: [...p.polos.entries()].sort((a, b) => b[1] - a[1])[0]![0] as ParteDjen["polo"],
    advogados: [...p.advogados.values()],
  }));
  const ordem = { ativo: 0, passivo: 1, terceiro: 2 };
  lista.sort((a, b) => ordem[a.polo] - ordem[b.polo]);
  const recente = [...itens].sort((a, b) => b.disponibilizadaEm.localeCompare(a.disponibilizadaEm))[0];
  return {
    partes: lista,
    poloDaEquipe: votos.ativo > votos.passivo ? "ativo" : votos.passivo > votos.ativo ? "passivo" : null,
    orgao: recente?.orgao ?? null,
    classe: recente?.classe ?? null,
    publicacoes: itens.length,
  };
}
