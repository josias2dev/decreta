/**
 * Taxas médias de juros por banco e modalidade, publicadas pelo Banco Central
 * na Olinda (olinda.bcb.gov.br, serviço taxaJuros v2, OData, sem chave). É o
 * parâmetro da revisional bancária: a taxa do contrato contra a do mesmo
 * banco, na mesma modalidade e no mesmo mês.
 *
 * As modalidades de imobiliário são mensais (TaxasJurosMensalPorMes); as
 * demais saem em janelas de 5 dias úteis (TaxasJurosDiariaPorInicioPeriodo), e
 * a taxa do mês é a média das janelas que começam nele. Conferido na fonte em
 * 31/10/2026: a Olinda recusa o apóstrofo codificado (%27) no filtro.
 */
import { z } from "zod";

export const OLINDA_TAXAS_URL = "https://olinda.bcb.gov.br/olinda/servico/taxaJuros/versao/v2/odata";

export type SegmentoBcb = "Pessoa Física" | "Pessoa Jurídica";
export interface ModalidadeBcb {
  modalidade: string;
  segmento: SegmentoBcb;
  /** Publicada por mês (imobiliário); as outras, por janelas diárias. */
  mensal: boolean;
}

const pf = (modalidade: string, mensal = false): ModalidadeBcb => ({ modalidade, segmento: "Pessoa Física", mensal });
const pj = (modalidade: string): ModalidadeBcb => ({ modalidade, segmento: "Pessoa Jurídica", mensal: false });

/** As modalidades da ParametrosConsulta, como a Olinda escreve (31/10/2026). */
export const MODALIDADES_BCB: ModalidadeBcb[] = [
  pf("Cartão de crédito - rotativo total - Prefixado"),
  pf("Cartão de crédito - parcelado - Prefixado"),
  pf("Cheque especial - Prefixado"),
  pf("Crédito pessoal consignado INSS - Prefixado"),
  pf("Crédito pessoal consignado privado - Prefixado"),
  pf("Crédito pessoal consignado público - Prefixado"),
  pf("Crédito pessoal não consignado - Prefixado"),
  pf("Desconto de cheques - Prefixado"),
  pf("Aquisição de veículos - Prefixado"),
  pf("Aquisição de outros bens - Prefixado"),
  pf("Arrendamento mercantil de veículos - Prefixado"),
  pf("Financiamento imobiliário com taxas de mercado - Prefixado", true),
  pf("Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em TR", true),
  pf("Financiamento imobiliário com taxas de mercado - Pós-fixado referenciado em IPCA", true),
  pf("Financiamento imobiliário com taxas reguladas - Prefixado", true),
  pf("Financiamento imobiliário com taxas reguladas - Pós-fixado referenciado em TR", true),
  pf("Financiamento imobiliário com taxas reguladas - Pós-fixado referenciado em IPCA", true),
  pj("Capital de giro com prazo até 365 dias - Prefixado"),
  pj("Capital de giro com prazo até 365 dias - Pós-fixado referenciado em juros flutuantes"),
  pj("Capital de giro com prazo superior a 365 dias - Prefixado"),
  pj("Capital de giro com prazo superior a 365 dias - Pós-fixado referenciado em juros flutuantes"),
  pj("Cheque especial - Prefixado"),
  pj("Conta garantida - Prefixado"),
  pj("Conta garantida - Pós-fixado referenciado em juros flutuantes"),
  pj("Desconto de duplicatas - Prefixado"),
  pj("Desconto de cheques - Prefixado"),
  pj("Antecipação de faturas de cartão de crédito - Prefixado"),
  pj("Vendor - Prefixado"),
  pj("Adiantamento sobre contratos de câmbio (ACC) - Pós-fixado referenciado em moeda estrangeira"),
];

export interface TaxaDoBanco {
  instituicao: string;
  cnpj8: string;
  /** Em % ao mês: a média das janelas do mês, nas modalidades diárias. */
  taxaAoMes: number;
  taxaAoAno: number;
  /** Quantas janelas entraram na média (1 nas mensais). */
  periodos: number;
}

export class ErroOlinda extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ErroOlinda";
  }
}

const linhaSchema = z
  .object({ InstituicaoFinanceira: z.string(), cnpj8: z.string(), TaxaJurosAoMes: z.number(), TaxaJurosAoAno: z.number(), Segmento: z.string().nullish() })
  .loose();

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase();
const aspas = (t: string) => `'${t.replace(/'/g, "''")}'`;
const duasCasas = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/** As taxas do mês (AAAA-MM) na modalidade, por banco, da menor para a maior. */
export async function taxasDoMesNaOlinda(
  busca: { modalidade: string; mes: string; cnpj8?: string; segmento?: SegmentoBcb },
  opcoes: { fetch?: typeof fetch; timeout?: number } = {},
): Promise<TaxaDoBanco[]> {
  const modalidade = MODALIDADES_BCB.find((m) => m.modalidade === busca.modalidade);
  if (!modalidade) throw new ErroOlinda(`Modalidade que o Banco Central não publica: ${busca.modalidade}`);
  const [a, m] = busca.mes.split("-").map(Number) as [number, number];
  const ultimo = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
  const filtros = [
    `Modalidade eq ${aspas(busca.modalidade)}`,
    ...(modalidade.mensal ? [`anoMes eq ${aspas(busca.mes)}`] : [`InicioPeriodo ge ${aspas(`${busca.mes}-01`)}`, `InicioPeriodo le ${aspas(ultimo)}`]),
    ...(busca.cnpj8 ? [`cnpj8 eq ${aspas(busca.cnpj8.replace(/\D/g, ""))}`] : []),
  ];
  const recurso = modalidade.mensal ? "TaxasJurosMensalPorMes" : "TaxasJurosDiariaPorInicioPeriodo";
  // encodeURIComponent deixa o apóstrofo como está, que é o que a Olinda aceita.
  const url = `${OLINDA_TAXAS_URL}/${recurso}?$format=json&$top=10000&$filter=${encodeURIComponent(filtros.join(" and "))}`;
  const res = await (opcoes.fetch ?? fetch)(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(opcoes.timeout ?? 60_000) });
  const texto = await res.text();
  if (!res.ok) throw new ErroOlinda(/"mensagem"\s*:\s*"([^"]+)"/.exec(texto)?.[1] ?? `A Olinda respondeu HTTP ${res.status}`, res.status);
  let corpo: unknown = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    throw new ErroOlinda("A Olinda respondeu num formato desconhecido");
  }
  const lista = z.object({ value: z.array(linhaSchema) }).safeParse(corpo);
  if (!lista.success) throw new ErroOlinda("A Olinda respondeu num formato desconhecido");

  const segmento = busca.segmento ? semAcento(busca.segmento) : null;
  const porBanco = new Map<string, { instituicao: string; mes: number[]; ano: number[] }>();
  for (const l of lista.data.value) {
    if (segmento && l.Segmento && semAcento(l.Segmento) !== segmento) continue;
    const b = porBanco.get(l.cnpj8) ?? { instituicao: l.InstituicaoFinanceira, mes: [], ano: [] };
    b.mes.push(l.TaxaJurosAoMes);
    b.ano.push(l.TaxaJurosAoAno);
    porBanco.set(l.cnpj8, b);
  }
  const media = (v: number[]) => duasCasas(v.reduce((s, x) => s + x, 0) / v.length);
  return [...porBanco]
    .map(([cnpj8, b]) => ({ instituicao: b.instituicao, cnpj8, taxaAoMes: media(b.mes), taxaAoAno: media(b.ano), periodos: b.mes.length }))
    .sort((x, y) => x.taxaAoMes - y.taxaAoMes || x.instituicao.localeCompare(y.instituicao));
}
