/**
 * Legislação federal pelo normas.leg.br (Congresso, licença CC BY 4.0): a norma
 * em JSON-LD, com o texto compilado por dispositivo ("…;13105!art927_par5") e
 * cada versão datada. Nem toda norma vem por dispositivo (a CLT e o CDC vêm só
 * com os dados); aí dá para dizer que a lei existe, não o que o artigo diz.
 * O portal avisa que o texto não tem valor legal oficial: o oficial é o DOU.
 */

export const NORMAS_URL = "https://normas.leg.br";

export interface DispositivoDaNorma {
  /** Como o normas.leg.br identifica: "art12_cpt", "art246_cpt_inc1". */
  id: string;
  /** O texto em vigor (a última versão), sem HTML. */
  texto: string;
  revogado: boolean;
  /** AAAA-MM-DD da versão em vigor. */
  desde: string | null;
  url: string;
}

export interface NormaDoNormasLeg {
  urn: string;
  /** "Lei nº 13.105 de 16/03/2015" */
  nome: string;
  /** "Código de Processo Civil (2015) (CPC)" */
  apelido: string | null;
  atualizadoEm: string | null;
  url: string;
  /** Se veio o texto por dispositivo. */
  porDispositivo: boolean;
  dispositivos: Map<string, DispositivoDaNorma>;
}

export class ErroNormas extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroNormas";
  }
}

/** As normas que as citações chamam pela sigla (a mesma do extrator de citações). */
const URNS: Record<string, string> = {
  CF: "urn:lex:br:federal:constituicao:1988-10-05;1988",
  CPC: "urn:lex:br:federal:lei:2015-03-16;13105",
  CC: "urn:lex:br:federal:lei:2002-01-10;10406",
  CDC: "urn:lex:br:federal:lei:1990-09-11;8078",
  CTN: "urn:lex:br:federal:lei:1966-10-25;5172",
  CP: "urn:lex:br:federal:decreto.lei:1940-12-07;2848",
  CPP: "urn:lex:br:federal:decreto.lei:1941-10-03;3689",
  CLT: "urn:lex:br:federal:decreto.lei:1943-05-01;5452",
  LINDB: "urn:lex:br:federal:decreto.lei:1942-09-04;4657",
};

/** "CPC" → URN; "LEI-12527-2011" → "urn:lex:br:federal:lei:2011;12527" (o portal aceita sem o dia). */
export function urnDaNorma(sigla: string): string | null {
  const lei = /^LEI-(\d+)-(\d{4})$/.exec(sigla);
  if (lei) return `urn:lex:br:federal:lei:${lei[2]};${lei[1]}`;
  return URNS[sigla] ?? null;
}

interface No {
  legislationIdentifier?: unknown;
  "@id"?: unknown;
  name?: unknown;
  alternateName?: unknown;
  dateModified?: unknown;
  hasPart?: No | No[];
  workExample?: Versao | Versao[];
}
interface Versao {
  legislationType?: unknown;
  legislationDate?: unknown;
  text?: unknown;
}

const lista = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const semHtml = (t: string) => t.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

function emVigor(no: No, id: string): DispositivoDaNorma | null {
  // As versões em ordem de data; a última é a que vale hoje.
  const versoes = lista(no.workExample).filter((v) => typeof v.text === "string");
  const atual = versoes.sort((a, b) => String(a.legislationDate ?? "").localeCompare(String(b.legislationDate ?? ""))).at(-1);
  if (!atual) return null;
  const texto = semHtml(String(atual.text));
  return {
    id,
    texto,
    revogado: /Repeal/.test(String(atual.legislationType)) || /^\(revogad[oa]\)/i.test(texto),
    desde: typeof atual.legislationDate === "string" ? atual.legislationDate : null,
    url: typeof no["@id"] === "string" ? no["@id"] : `${NORMAS_URL}/?urn=${no.legislationIdentifier}`,
  };
}

/** A resposta do portal; `null` se a norma não existe (o portal devolve só a URN). */
export function lerNorma(json: unknown): NormaDoNormasLeg | null {
  const raiz = json as No | null;
  if (!raiz || typeof raiz.legislationIdentifier !== "string" || typeof raiz.name !== "string") return null;
  const dispositivos = new Map<string, DispositivoDaNorma>();
  const andar = (no: No) => {
    const urn = String(no.legislationIdentifier ?? "");
    // O incluído por lei posterior vem com o sufixo da lei: "art53_cpt_inc1_ali4,lei-13894-2019-10-29".
    const id = urn.includes("!") ? urn.split("!")[1]!.split(",")[0]! : null;
    const d = id ? emVigor(no, id) : null;
    if (id && d) dispositivos.set(id, d);
    for (const filho of lista(no.hasPart)) andar(filho);
  };
  andar(raiz);
  const apelido = lista(raiz.alternateName as string | string[] | undefined).find((n) => typeof n === "string" && !/^[A-Z]+-\d/.test(n)) ?? null;
  return {
    urn: raiz.legislationIdentifier,
    nome: raiz.name,
    apelido,
    atualizadoEm: typeof raiz.dateModified === "string" ? raiz.dateModified : null,
    url: `${NORMAS_URL}/?urn=${raiz.legislationIdentifier}`,
    porDispositivo: dispositivos.size > 0,
    dispositivos,
  };
}

/**
 * O dispositivo como a citação escreve ("art12", "art246_inc1", "art927_par1u").
 * No portal, o texto do artigo fica no caput ("art12_cpt"), e o inciso do caput
 * passa por ele ("art246_cpt_inc1").
 */
export function acharDispositivo(norma: Pick<NormaDoNormasLeg, "dispositivos">, id: string): DispositivoDaNorma | null {
  const [artigo, segundo, ...resto] = id.split("_");
  const peloCaput = segundo && segundo !== "cpt" && !segundo.startsWith("par") ? [artigo, "cpt", segundo, ...resto].join("_") : null;
  for (const candidato of [id, peloCaput, `${id}_cpt`]) {
    const d = candidato ? norma.dispositivos.get(candidato) : undefined;
    if (d) return d;
  }
  return null;
}

export interface OpcoesNormas {
  fetch?: typeof fetch;
  timeout?: number;
}

export async function baixarNorma(urn: string, opcoes: OpcoesNormas = {}): Promise<NormaDoNormasLeg | null> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const res = await fetchImpl(`${NORMAS_URL}/api/public/normas?urn=${encodeURIComponent(urn)}&tipo_documento=maior-detalhe`, {
    headers: { accept: "application/json" },
    // O CPC inteiro tem 4 MB.
    signal: AbortSignal.timeout(opcoes.timeout ?? 120_000),
  });
  if (!res.ok) throw new ErroNormas(`O normas.leg.br respondeu HTTP ${res.status}`, res.status);
  return lerNorma(await res.json().catch(() => null));
}
