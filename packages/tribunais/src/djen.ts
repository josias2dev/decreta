/**
 * Diário de Justiça Eletrônico Nacional (DJEN), pela API pública de
 * comunicações do CNJ (comunicaapi.pje.jus.br). A busca é por OAB e período
 * de disponibilização; cada comunicação vira uma publicação do escritório.
 *
 * A API limita o ritmo: entre páginas há uma pausa, e 429 espera e tenta de
 * novo. Campo que mudar de nome não derruba a captura: o que não se lê fica
 * vazio, e a publicação chega com o texto que veio.
 */
import { createHash } from "node:crypto";
import { formatarCnj, limparCnj, nomeProprio } from "@decreta/core";
import JSZip from "jszip";
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
    motivo_cancelamento: texto,
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
  /** Identifica a comunicação na certidão de publicação do DJEN. */
  hash?: string;
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
    ...(i.hash ? { hash: i.hash } : {}),
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
  /** Caderno: a versão que já foi lida; a mesma versão não é baixada de novo. */
  versaoLida?: number;
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

/* ------------------------------------------------------------------ */

export const DJEN_CADERNO_URL = "https://comunicaapi.pje.jus.br/api/v1/caderno";

const cadernoSchema = z
  .object({
    status: texto,
    versao: z.coerce.number(),
    total_comunicacoes: z.coerce.number().optional(),
    hash: z.string(),
    url: z.string().url(),
  })
  .loose();

export interface CadernoDjen {
  tribunal: string;
  /** AAAA-MM-DD da disponibilização. */
  dia: string;
  /** Sobe quando o tribunal cancela ou corrige comunicações do dia. */
  versao: number;
  total: number;
  hash: string;
}

/** Comunicação que o tribunal cancelou depois de disponibilizar. */
export interface CanceladaNoDjen {
  idExterno: string;
  motivo: string | null;
}

/**
 * O caderno do dia de um tribunal: todas as comunicações disponibilizadas
 * naquele dia, num ZIP com um JSON por página, no mesmo formato da consulta.
 * Sai a partir das 03:00. O ZIP é conferido pelo SHA-256 anunciado e lido um
 * arquivo por vez (o do TJSC passa de 50 MB aberto). Dia sem caderno (fim de
 * semana, feriado, ainda não saiu): null. A versão sobe quando o tribunal
 * cancela ou corrige: com `versaoLida`, só a versão nova é baixada.
 */
export async function lerCaderno(
  tribunal: string,
  dia: string,
  aoLer: (lote: ComunicacaoDjen[], canceladas: CanceladaNoDjen[]) => Promise<void>,
  opcoes: OpcoesDjen = {},
): Promise<CadernoDjen | null> {
  const fetchImpl = opcoes.fetch ?? fetch;
  /** Para as mensagens de erro, que vão à tela: 29/10/2026. */
  const quando = dia.split("-").reverse().join("/");
  const res = await fetchImpl(`${DJEN_CADERNO_URL}/${tribunal}/${dia}/D`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new ErroDjen(`DJEN respondeu HTTP ${res.status} ao caderno ${tribunal} de ${quando}`, res.status);
  const meta = cadernoSchema.safeParse(await res.json().catch(() => null));
  if (!meta.success) throw new ErroDjen(`DJEN devolveu o caderno ${tribunal} de ${quando} num formato desconhecido`);
  if (meta.data.status && meta.data.status !== "Processado") return null;
  const caderno = { tribunal, dia, versao: meta.data.versao, total: meta.data.total_comunicacoes ?? 0 };
  if (opcoes.versaoLida != null && meta.data.versao <= opcoes.versaoLida) return { ...caderno, hash: meta.data.hash.toLowerCase() };

  const arquivo = await fetchImpl(meta.data.url, { signal: AbortSignal.timeout(120_000) });
  if (!arquivo.ok) throw new ErroDjen(`o arquivo do caderno ${tribunal} de ${quando} respondeu HTTP ${arquivo.status}`, arquivo.status);
  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (hash !== meta.data.hash.toLowerCase()) throw new ErroDjen(`o caderno ${tribunal} de ${quando} não bate com o hash anunciado`);

  const zip = await JSZip.loadAsync(bytes);
  const nomes = Object.values(zip.files)
    .filter((f) => !f.dir && f.name.endsWith(".json"))
    .map((f) => f.name)
    .sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
  for (const nome of nomes) {
    const corpo = respostaSchema.safeParse(JSON.parse(await zip.files[nome]!.async("string")));
    if (!corpo.success) throw new ErroDjen(`o arquivo ${nome} do caderno ${tribunal} de ${quando} veio num formato desconhecido`);
    const lote = corpo.data.items.map(lerComunicacao).filter((c): c is ComunicacaoDjen => !!c);
    const canceladas = corpo.data.items
      .map((bruto) => itemSchema.safeParse(bruto).data)
      .filter((i) => i?.ativo === false)
      .map((i) => ({ idExterno: i!.id, motivo: i!.motivo_cancelamento ?? null }));
    if (lote.length || canceladas.length) await aoLer(lote, canceladas);
  }
  return { ...caderno, hash };
}

/**
 * A certidão de publicação que o próprio DJEN emite, em PDF: prova a data em
 * que a comunicação foi disponibilizada. Comunicação desconhecida: null.
 */
export async function certidaoDoDjen(hash: string, opcoes: OpcoesDjen = {}): Promise<Uint8Array | null> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const res = await fetchImpl(`${DJEN_URL}/${encodeURIComponent(hash)}/certidao`, { headers: { accept: "application/pdf" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new ErroDjen(`DJEN respondeu HTTP ${res.status} à certidão`, res.status);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new ErroDjen("a certidão do DJEN não veio em PDF");
  return bytes;
}

const enviosSchema = z.array(z.object({ instituicoes: z.array(z.object({ sigla: z.string(), dataUltimoEnvio: z.string().nullish() })) }));

/**
 * Quando cada tribunal enviou comunicações ao DJEN pela última vez
 * ("TJSC" → "2026-10-30"), para a saúde da captura separar o tribunal que não
 * enviou do caderno que não deu para ler. Uma chamada serve a todos.
 */
export async function ultimosEnviosAoDjen(opcoes: OpcoesDjen = {}): Promise<Map<string, string>> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const res = await fetchImpl(`${DJEN_URL}/tribunal`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 30_000) });
  if (!res.ok) throw new ErroDjen(`DJEN respondeu HTTP ${res.status} à lista de tribunais`, res.status);
  const lista = enviosSchema.safeParse(await res.json().catch(() => null));
  if (!lista.success) throw new ErroDjen("DJEN devolveu a lista de tribunais num formato desconhecido");
  const envios = new Map<string, string>();
  for (const t of lista.data.flatMap((uf) => uf.instituicoes)) {
    const dia = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(t.dataUltimoEnvio ?? "");
    if (dia) envios.set(t.sigla, `${dia[3]}-${dia[2]}-${dia[1]}`);
  }
  return envios;
}

/* ------------------------------------------------------------------ */

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

/**
 * Quem o DJEN diz que é dono da OAB: os nomes que aparecem com esse número nas
 * comunicações, do mais visto ao menos. Serve para conferir a OAB da equipe,
 * que, digitada errada, faz a captura voltar vazia sem aviso.
 */
export function nomesDaOab(itens: ComunicacaoDjen[], oab: { numero: string; uf: string }): { nome: string; publicacoes: number }[] {
  const alvo = `${oab.numero.replace(/\D/g, "")}/${oab.uf.toUpperCase()}`;
  const nomes = new Map<string, { nome: string; publicacoes: number }>();
  for (const i of itens) {
    const vistos = new Set<string>();
    for (const a of i.advogados) {
      if (!a.oab || chaveDaOab(a) !== alvo) continue;
      const chave = chaveDoNome(a.nome);
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const n = nomes.get(chave) ?? { nome: a.nome, publicacoes: 0 };
      n.publicacoes++;
      nomes.set(chave, n);
    }
  }
  return [...nomes.values()].sort((a, b) => b.publicacoes - a.publicacoes);
}
