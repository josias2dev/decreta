/**
 * Os índices na demonstração. A demonstração nunca chama API externa: os
 * cálculos de lá leem um retrato das séries públicas (indices.json, tirado do
 * SGS e da Olinda do Banco Central em 31/10/2026). Este fetch responde como as
 * fontes reais respondem, para o cálculo seguir o mesmo caminho da produção.
 * Período fora do retrato responde como a fonte responde a período sem dado.
 */
import retrato from "./indices.json";

type Retrato = {
  series: Record<string, Array<[string, number]>>;
  olinda: { modalidade: string; mes: string; taxas: Array<[string, string, number, number, number]> };
};
const { series, olinda } = retrato as unknown as Retrato;

const proximoMes = (mes: string) => {
  const [a, m] = mes.split("-").map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};
const br = (mes: string) => `01/${mes.slice(5, 7)}/${mes.slice(0, 4)}`;

function sgs(codigo: string, de: string, ate: string): Response {
  const valores = (series[codigo] ?? []).filter(([mes]) => mes >= de && mes <= ate);
  if (!valores.length) return Response.json({ erro: { statusCode: 404, detail: "Value(s) not found" } }, { status: 404 });
  // A TR (226) é diária: o retrato guarda a janela do dia 1º ao dia 1º do mês seguinte.
  return Response.json(valores.map(([mes, valor]) => ({ data: br(mes), ...(codigo === "226" ? { dataFim: br(proximoMes(mes)) } : {}), valor: String(valor) })));
}

function olindaDoRetrato(url: string): Response {
  const filtro = decodeURIComponent(url.split("$filter=")[1] ?? "");
  if (!filtro.includes(`Modalidade eq '${olinda.modalidade}'`) || !filtro.includes(`'${olinda.mes}-01'`)) return Response.json({ value: [] });
  const cnpj8 = /cnpj8 eq '(\d{8})'/.exec(filtro)?.[1];
  // Uma linha por janela da média, para o leitor chegar à mesma média e contagem.
  const value = olinda.taxas
    .filter(([, c]) => !cnpj8 || c === cnpj8)
    .flatMap(([instituicao, c, aoMes, aoAno, periodos]) =>
      Array.from({ length: periodos }, () => ({ InicioPeriodo: `${olinda.mes}-01`, Segmento: "PESSOA FÍSICA", Modalidade: olinda.modalidade, InstituicaoFinanceira: instituicao, cnpj8: c, TaxaJurosAoMes: aoMes, TaxaJurosAoAno: aoAno })),
    );
  return Response.json({ value });
}

/** Responde pelo SGS, pelo SIDRA e pela Olinda com o retrato; o resto não existe aqui. */
export const fetchDaDemonstracao = (async (entrada: string | URL) => {
  const url = String(entrada);
  const pedido = /bcdata\.sgs\.(\d+)\/dados\?formato=json&dataInicial=\d\d\/(\d\d)\/(\d{4})&dataFinal=\d\d\/(\d\d)\/(\d{4})/.exec(url);
  if (pedido) return sgs(pedido[1]!, `${pedido[3]}-${pedido[2]}`, `${pedido[5]}-${pedido[4]}`);
  const sidra = /apisidra\.ibge\.gov\.br\/values\/t\/1737\/.*\/p\/(\d{6})-(\d{6})/.exec(url);
  if (sidra) {
    const [de, ate] = [sidra[1]!, sidra[2]!].map((p) => `${p.slice(0, 4)}-${p.slice(4)}`) as [string, string];
    return Response.json([{ V: "Valor", D3C: "Mês (Código)" }, ...(series["433"] ?? []).filter(([mes]) => mes >= de && mes <= ate).map(([mes, valor]) => ({ V: String(valor), D3C: mes.replace("-", "") }))]);
  }
  if (url.startsWith("https://olinda.bcb.gov.br/")) return olindaDoRetrato(url);
  return Response.json({ erro: "fora da demonstração" }, { status: 404 });
}) as unknown as typeof fetch;

/** O mês e a modalidade da revisional que a demonstração tem. */
export const REVISIONAL_DA_DEMONSTRACAO = { modalidade: olinda.modalidade, mes: olinda.mes };
