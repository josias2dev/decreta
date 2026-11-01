/**
 * Banco Nacional de Precedentes (Res. CNJ 444/2022, "para consulta pelo
 * público em geral"), pelo front público Pangea (pangeabnp.pdpj.jus.br): súmulas,
 * vinculantes, repercussão geral, repetitivos, IRDR e IAC de 93 órgãos. A API
 * não é documentada; o pedido é o mesmo que o site faz. O BNP é atualizado duas
 * vezes por mês, e a listagem só funciona com ordenação cronológica.
 */
import { z } from "zod";

export const BNP_URL = "https://pangeabnp.pdpj.jus.br";

export interface PrecedenteDoBnp {
  /** Como o BNP identifica: "stj-sum-297". */
  id: string;
  orgao: string;
  /** "SUM", "SV", "RG", "RR", "IRDR", "IAC", "OJ"… */
  tipo: string;
  numero: number;
  /** Como o tribunal escreve: "Vigente", "Cancelado", "APROVADO", "Admitido"… */
  situacao: string;
  cancelado: boolean;
  /** A tese ou o enunciado, sem HTML. */
  texto: string | null;
  /** AAAA-MM-DD */
  atualizadoEm: string | null;
  /** A página do precedente no Pangea. */
  url: string;
}

export class ErroBnp extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroBnp";
  }
}

export interface OpcoesBnp {
  fetch?: typeof fetch;
  timeout?: number;
  porPagina?: number;
  /** Pausa entre páginas, em ms: no máximo um pedido por segundo. */
  pausa?: number;
  dormir?: (ms: number) => Promise<void>;
}

const texto = z.preprocess((v) => (v == null ? undefined : String(v)), z.string().optional());

const itemSchema = z
  .object({ id: z.string(), nr: z.coerce.number(), orgao: z.string(), tipo: z.string(), situacao: texto, alertaSituacao: texto, tese: texto, questao: texto, ultimaAtualizacao: texto })
  .loose();

const paginaSchema = z.object({ total: z.number(), resultados: z.array(z.unknown()) }).loose();

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " ", "#39": "'" };
const semHtml = (t: string) =>
  t
    .replace(/<br\s*\/?>|<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, e: string) => ENTIDADES[e]!)
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

/** Na súmula vinculante, o enunciado vem em "questao" e a tese vem "não informado". */
function textoDoPrecedente(tese?: string, questao?: string): string | null {
  const t = tese && !/^n[ãa]o informado$/i.test(semHtml(tese)) ? semHtml(tese) : questao ? semHtml(questao) : "";
  return t || null;
}

const dia = (ddmmaaaa?: string) => /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmaaaa ?? "")?.slice(1).reverse().join("-") ?? null;

function precedente(bruto: unknown): PrecedenteDoBnp {
  const p = itemSchema.safeParse(bruto);
  if (!p.success) throw new ErroBnp("O BNP respondeu num formato desconhecido");
  const { id, nr, orgao, tipo, situacao = "", alertaSituacao, tese, questao, ultimaAtualizacao } = p.data;
  return {
    id,
    orgao,
    tipo,
    numero: nr,
    situacao,
    cancelado: alertaSituacao === "cancelado" || /^cancelad/i.test(situacao),
    texto: textoDoPrecedente(tese, questao),
    atualizadoEm: dia(ultimaAtualizacao),
    url: `${BNP_URL}/pesquisa?orgao=${orgao.toLowerCase()}&tipo=${encodeURIComponent(tipo)}&nr=${nr}`,
  };
}

async function pesquisar(filtro: Record<string, unknown>, opcoes: OpcoesBnp): Promise<{ total: number; resultados: PrecedenteDoBnp[] }> {
  const fetchImpl = opcoes.fetch ?? fetch;
  const res = await fetchImpl(`${BNP_URL}/api/v1/precedentes`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ filtro }),
    signal: AbortSignal.timeout(opcoes.timeout ?? 90_000),
  });
  if (!res.ok) throw new ErroBnp(`O BNP respondeu HTTP ${res.status}`, res.status);
  const pagina = paginaSchema.safeParse(await res.json().catch(() => null));
  if (!pagina.success) throw new ErroBnp("O BNP respondeu num formato desconhecido");
  return { total: pagina.data.total, resultados: pagina.data.resultados.map(precedente) };
}

/** Um precedente pelo número. `null` se o BNP não tem (o que não quer dizer que não exista). */
export async function buscarNoBnp(busca: { orgao: string; tipo: string; numero: number }, opcoes: OpcoesBnp = {}): Promise<PrecedenteDoBnp | null> {
  const { resultados } = await pesquisar({ orgaos: [busca.orgao], tipos: [busca.tipo], nr: String(busca.numero), cancelados: true, ordenacao: "Text", pagina: 1, tamanhoPagina: 10 }, opcoes);
  return resultados.find((p) => p.numero === busca.numero && p.orgao === busca.orgao && p.tipo === busca.tipo) ?? null;
}

/** Uma espécie inteira de um órgão (as súmulas do STJ, os IRDRs do TJSC), com as canceladas. */
export async function listarNoBnp(busca: { orgao: string; tipo: string }, opcoes: OpcoesBnp = {}): Promise<PrecedenteDoBnp[]> {
  const dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const porPagina = opcoes.porPagina ?? 100;
  const todos: PrecedenteDoBnp[] = [];
  for (let pagina = 1; ; pagina++) {
    if (pagina > 1) await dormir(opcoes.pausa ?? 1000);
    const { total, resultados } = await pesquisar({ orgaos: [busca.orgao], tipos: [busca.tipo], cancelados: true, ordenacao: "Crono-Asc", pagina, tamanhoPagina: porPagina }, opcoes);
    todos.push(...resultados);
    if (!resultados.length || todos.length >= total) return todos;
  }
}
