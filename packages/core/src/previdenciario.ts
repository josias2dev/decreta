/**
 * Previdenciário. O INSS não tem API de tabelas, então os parâmetros anuais
 * (teto do RGPS e salário mínimo) ficam aqui e são atualizados a cada
 * janeiro: o teto pela portaria interministerial MPS/MF do ano (2026:
 * Portaria 13/2026) e o salário mínimo pelo decreto (2026: Decreto
 * 12.797/2025, conferido na série 1619 do SGS).
 *
 * A linha do tempo junta, dos documentos já lidos do processo, os laudos e
 * atestados, o CNIS e as decisões de indeferimento, em ordem de data. É
 * calculada na hora e não fica gravada: são dados de saúde (LGPD, art. 11).
 */

/** [vigente desde AAAA-MM-DD, valor em R$] */
const SALARIO_MINIMO: Array<[string, number]> = [
  ["2020-01-01", 1039],
  ["2020-02-01", 1045],
  ["2021-01-01", 1100],
  ["2022-01-01", 1212],
  ["2023-01-01", 1302],
  ["2023-05-01", 1320],
  ["2024-01-01", 1412],
  ["2025-01-01", 1518],
  ["2026-01-01", 1621],
];

const TETO_RGPS: Array<[string, number]> = [
  ["2020-01-01", 6101.06],
  ["2021-01-01", 6433.57],
  ["2022-01-01", 7087.22],
  ["2023-01-01", 7507.49],
  ["2024-01-01", 7786.02],
  ["2025-01-01", 8157.41],
  ["2026-01-01", 8475.55],
];

export interface ParametrosPrevidenciarios {
  teto: number;
  salarioMinimo: number;
  /** AAAA-MM-DD de quando cada valor passou a valer. */
  tetoDesde: string;
  salarioMinimoDesde: string;
}

const vigente = (tabela: Array<[string, number]>, dia: string) => tabela.filter(([desde]) => desde <= dia).at(-1);

/** O teto e o salário mínimo do dia (AAAA-MM-DD); antes de 2020, a tabela não tem. */
export function parametrosPrevidenciarios(dia: string): ParametrosPrevidenciarios | null {
  const teto = vigente(TETO_RGPS, dia);
  const sm = vigente(SALARIO_MINIMO, dia);
  if (!teto || !sm) return null;
  return { teto: teto[1], salarioMinimo: sm[1], tetoDesde: teto[0], salarioMinimoDesde: sm[0] };
}

/** Benefício nunca abaixo do salário mínimo (CF, art. 201, § 2º) nem acima do teto. */
export function entreMinimoETeto(valor: number, dia: string): number {
  const p = parametrosPrevidenciarios(dia);
  if (!p) return valor;
  return Math.min(p.teto, Math.max(p.salarioMinimo, valor));
}

export type TipoNaLinhaDoTempo = "indeferimento" | "cnis" | "laudo";

export interface DocumentoLido {
  id: string;
  nome: string;
  texto: string | null;
  evento: number | null;
  /** AAAA-MM-DD em que o documento entrou no Decreta. */
  criadoEm: string;
}

export interface MarcoPrevidenciario {
  data: string;
  tipo: TipoNaLinhaDoTempo;
  documentoId: string;
  nome: string;
  evento: number | null;
  /** A data saiu do texto; senão, é o dia em que o documento entrou. */
  dataNoTexto: boolean;
  trecho: string | null;
}

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** A ordem importa: a decisão de indeferimento fala da perícia, mas é decisão. */
/** [tipo, como reconhecer, as linhas que importam em ordem de preferência] */
const TIPOS: Array<[TipoNaLinhaDoTempo, RegExp, RegExp[]]> = [
  ["indeferimento", /indeferi|comunicacao de decisao|nao foi reconhecido o direito/, [/^motivo/i, /indefer/i]],
  ["cnis", /\bcnis\b|cadastro nacional de informacoes sociais|extrato previdenciario/, [/v[ií]nculo|remunera/i]],
  ["laudo", /laudo|pericia medica|atestado|exame medico|relatorio medico/, [/conclus/i, /incapacidade|\bCID\b/i]],
];

const DATA_COM_ROTULO = /(?:data d[ao] per[ií]cia|data do exame|emitid[oa] em|data da decis[aã]o|data)\s{0,3}:?\s{0,3}(\d{2})\/(\d{2})\/(\d{4})/i;
const QUALQUER_DATA = /\b(\d{2})\/(\d{2})\/(\d{4})\b/;

function dataDoTexto(texto: string): string | null {
  const m = DATA_COM_ROTULO.exec(texto) ?? QUALQUER_DATA.exec(texto);
  if (!m) return null;
  const [, d, mes, a] = m;
  const dia = `${a}-${mes}-${d}`;
  return Number(mes) >= 1 && Number(mes) <= 12 && Number(d) >= 1 && Number(d) <= 31 ? dia : null;
}

export function linhaDoTempoPrevidenciaria(documentos: DocumentoLido[]): MarcoPrevidenciario[] {
  const marcos: MarcoPrevidenciario[] = [];
  for (const doc of documentos) {
    const texto = doc.texto ?? "";
    const assunto = normal(`${doc.nome}\n${texto.slice(0, 3000)}`);
    const achado = TIPOS.find(([, re]) => re.test(assunto));
    if (!achado) continue;
    const [tipo, , preferidas] = achado;
    const data = dataDoTexto(texto);
    const linhas = texto.split("\n").map((l) => l.trim());
    const trecho = preferidas.map((re) => linhas.find((l) => re.test(l))).find(Boolean);
    marcos.push({ data: data ?? doc.criadoEm, tipo, documentoId: doc.id, nome: doc.nome, evento: doc.evento, dataNoTexto: !!data, trecho: trecho ? trecho.slice(0, 280) : null });
  }
  return marcos.sort((a, b) => a.data.localeCompare(b.data));
}
