/**
 * PJe-Calc (CSJT): o programa roda offline no Windows e não tem API; o
 * arquivo .PJC não tem formato público. O que dá para ler é o relatório em
 * PDF: daqui sai o resumo (partes, data da liquidação e os totais por
 * credor), lido pelo rótulo de cada linha e pelo último valor dela. Rótulo
 * que não aparecer fica nulo; texto sem o resumo do PJe-Calc devolve null.
 */
import { reais as emReais } from "./calculos.ts";
import { nomeProprio } from "./documentos.ts";

export interface ResumoDoPjeCalc {
  processo: string | null;
  reclamante: string | null;
  reclamado: string | null;
  /** AAAA-MM-DD */
  dataLiquidacao: string | null;
  brutoDevido: number | null;
  liquidoReclamante: number | null;
  fgts: number | null;
  contribuicaoSocial: number | null;
  irpf: number | null;
  /** Soma das linhas de honorários (advocatícios e periciais). */
  honorarios: number | null;
  custas: number | null;
  totalReclamado: number | null;
}

const VALOR = /(-?\d{1,3}(?:\.\d{3})*,\d{2})/g;
const reais = (t: string) => Number(t.replace(/\./g, "").replace(",", "."));

const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

/** O último valor das linhas que começam pelo rótulo (somados, se houver mais de uma). */
function valor(linhas: string[], rotulo: RegExp, somar = false): number | null {
  const achados = linhas
    .filter((l) => rotulo.test(normal(l)))
    .map((l) => [...l.matchAll(VALOR)].at(-1)?.[1])
    .filter((v): v is string => !!v)
    .map(reais);
  if (!achados.length) return null;
  return somar ? Math.round(achados.reduce((s, v) => s + v, 0) * 100) / 100 : achados[0]!;
}

/** O resumo em Markdown simples, como as peças: entra na tela e no pedido da peça. */
export function memoriaDoPjeCalc(r: ResumoDoPjeCalc): string {
  const cabeca = [
    r.processo && `Processo ${r.processo}.`,
    r.dataLiquidacao && `Liquidação em ${r.dataLiquidacao.slice(8, 10)}/${r.dataLiquidacao.slice(5, 7)}/${r.dataLiquidacao.slice(0, 4)}.`,
    r.reclamante && `Reclamante: ${r.reclamante}.`,
    r.reclamado && `Reclamado: ${r.reclamado}.`,
  ].filter(Boolean);
  const itens: Array<[string, number | null]> = [
    ["Bruto devido ao reclamante", r.brutoDevido],
    ["Líquido devido ao reclamante", r.liquidoReclamante],
    ["Depósito de FGTS", r.fgts],
    ["Contribuição social", r.contribuicaoSocial],
    ["Imposto de renda", r.irpf],
    ["Honorários", r.honorarios],
    ["Custas", r.custas],
  ];
  return [
    "## Resumo do cálculo do PJe-Calc",
    cabeca.join(" "),
    itens
      .filter(([, v]) => v !== null)
      .map(([nome, v]) => `- ${nome}: ${emReais(v!)}`)
      .join("\n"),
    r.totalReclamado !== null ? `**Total devido pelo reclamado: ${emReais(r.totalReclamado)}**` : "",
    "Fonte: relatório do PJe-Calc anexado ao processo, com o arquivo .PJC.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const campo = (texto: string, rotulo: RegExp) => rotulo.exec(texto)?.[1]?.trim() || null;

export function resumoDoPjeCalc(texto: string): ResumoDoPjeCalc | null {
  const linhas = texto.split("\n").map((l) => l.trim());
  const comum = normal(texto);
  if (!/RESUMO DO CALCULO|TOTAL DEVIDO PELO RECLAMADO/.test(comum)) return null;
  const inicioDoResumo = linhas.findIndex((l) => /^RESUMO DO CALCULO/.test(normal(l)));
  const doResumo = inicioDoResumo >= 0 ? linhas.slice(inicioDoResumo) : linhas;
  const liquidacao = /Data Liquida[çc][ãa]o:\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(texto);
  const reclamante = campo(texto, /Reclamante:\s*([^\n]+)/i);
  const reclamado = campo(texto, /Reclamad[oa]:\s*([^\n]+)/i);
  return {
    processo: campo(texto, /Processo:\s*(\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})/i),
    reclamante: reclamante ? nomeProprio(reclamante) : null,
    reclamado: reclamado ? nomeProprio(reclamado) : null,
    dataLiquidacao: liquidacao ? `${liquidacao[3]}-${liquidacao[2]}-${liquidacao[1]}` : null,
    // A primeira linha "Total" do resumo fecha o bruto devido ao reclamante.
    brutoDevido: valor(doResumo, /^TOTAL\s+-?\d/),
    liquidoReclamante: valor(linhas, /^LIQUIDO DEVIDO AO RECLAMANTE/),
    fgts: valor(linhas, /^DEPOSITO FGTS|^FGTS/),
    contribuicaoSocial: valor(linhas, /^CONTRIBUICAO SOCIAL/, true),
    irpf: valor(linhas, /^IRPF|^IMPOSTO DE RENDA/),
    honorarios: valor(linhas, /^HONORARIOS/, true),
    custas: valor(linhas, /^CUSTAS/, true),
    totalReclamado: valor(linhas, /^TOTAL DEVIDO PELO RECLAMADO/),
  };
}
