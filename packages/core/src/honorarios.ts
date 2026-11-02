/**
 * Honorários: as contas do dinheiro do escritório e do cliente.
 *
 * Todo valor é um número inteiro de centavos, nunca um número de ponto
 * flutuante: R$ 1.234,56 é 123456. O percentual de êxito vai em pontos-base
 * (centésimos de ponto percentual): 30% são 3000, e 12,5% são 1250. As contas
 * com percentual usam BigInt, para o produto de um valor grande por um
 * percentual nunca passar do que o número inteiro seguro aguenta.
 */
import { diferencaEmDias, ehDia, formatarDia, somarDias, type Dia } from "./datas.ts";

/* ------------------------------------------------------------------ */
/* Dinheiro em centavos                                                */
/* ------------------------------------------------------------------ */

/** O teto de um valor aceito: R$ 90 bilhões, bem abaixo do que o inteiro seguro guarda. */
export const TETO_EM_CENTAVOS = 9_000_000_000_000;

const COM_VIRGULA = /^(\d{1,3}(?:\.\d{3})*|\d+)(?:,(\d{1,2}))?$/;
const COM_PONTO = /^(\d+)\.(\d{1,2})$/;

/**
 * "1.234,56", "1234,5", "1234.56" ou "R$ 10" viram centavos, sem passar por
 * número de ponto flutuante. Texto que não é dinheiro (ou tem mais de dois
 * decimais) devolve `null`.
 */
export function centavosDoTexto(texto: string): number | null {
  const limpo = texto.replace(/R\$/gi, "").replace(/\s+/g, "");
  if (!limpo) return null;
  let inteiro: string;
  let fracao: string;
  const virgula = COM_VIRGULA.exec(limpo);
  const ponto = COM_PONTO.exec(limpo);
  if (virgula) {
    inteiro = virgula[1]!.replaceAll(".", "");
    fracao = virgula[2] ?? "";
  } else if (ponto) {
    inteiro = ponto[1]!;
    fracao = ponto[2]!;
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(limpo)) {
    inteiro = limpo.replaceAll(".", "");
    fracao = "";
  } else return null;
  const centavos = Number(inteiro) * 100 + Number(fracao.padEnd(2, "0"));
  return Number.isSafeInteger(centavos) && centavos <= TETO_EM_CENTAVOS ? centavos : null;
}

/** 123456 → "R$ 1.234,56". */
export function formatarCentavos(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const inteiro = String(Math.trunc(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${negativo ? "-" : ""}R$ ${inteiro},${String(abs % 100).padStart(2, "0")}`;
}

/** 123456 → "1234.56": o formato que as colunas de valor em reais do banco (numeric) leem. */
export function textoDoCentavo(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** "1234.56" (a coluna numeric do banco, em reais) → 123456. Sem número de ponto flutuante. */
export function centavosDoNumeric(texto: string | null | undefined): number | null {
  if (texto == null || texto === "") return null;
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(texto.trim());
  if (!m) return null;
  const centavos = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -centavos : centavos;
}

/** "30" → 3000; "12,5" → 1250; de 0,01% a 100%. Fora disso, `null`. */
export function paraBasePontos(texto: string): number | null {
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(texto.replace(/%/g, "").replace(/\s+/g, ""));
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return bp >= 1 && bp <= 10_000 ? bp : null;
}

/** 1250 → "12,5%"; 3000 → "30%". */
export function formatarBasePontos(bp: number): string {
  const inteiro = Math.trunc(bp / 100);
  const fracao = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return `${inteiro}${fracao ? `,${fracao}` : ""}%`;
}

/* ------------------------------------------------------------------ */
/* Êxito                                                               */
/* ------------------------------------------------------------------ */

/**
 * O honorário de êxito sobre o que caiu na conta: o percentual do valor,
 * arredondado para o centavo mais perto (a metade sobe). O cliente leva o resto,
 * então as duas partes somam sempre o valor inteiro.
 */
export function calcularExito(baseCentavos: number, basePontos: number): { honorario: number; cliente: number } {
  if (!Number.isSafeInteger(baseCentavos) || baseCentavos < 0) throw new Error("O valor precisa ser um número inteiro de centavos, de zero para cima.");
  if (!Number.isInteger(basePontos) || basePontos < 1 || basePontos > 10_000) throw new Error("O percentual de êxito vai de 0,01% a 100%.");
  const honorario = Number((BigInt(baseCentavos) * BigInt(basePontos) + 5_000n) / 10_000n);
  return { honorario, cliente: baseCentavos - honorario };
}

/* ------------------------------------------------------------------ */
/* Parcelas                                                            */
/* ------------------------------------------------------------------ */

/**
 * Divide o total em `n` partes. O que sobra da divisão em centavos vai, um centavo
 * por parcela, para as primeiras, e a soma fecha no total.
 */
export function dividirEmParcelas(totalCentavos: number, n: number): number[] {
  if (!Number.isInteger(n) || n < 1) throw new Error("Pelo menos uma parcela.");
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos < n) throw new Error("O valor não dá um centavo para cada parcela.");
  const base = Math.floor(totalCentavos / n);
  const resto = totalCentavos % n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

/** O mesmo dia em cada mês a partir do primeiro vencimento; o dia 31 vira o último dia do mês que não o tem. */
export function vencimentosMensais(primeiro: Dia, n: number): Dia[] {
  const [a, m, d] = primeiro.split("-").map(Number) as [number, number, number];
  return Array.from({ length: n }, (_, i) => {
    const total = m - 1 + i;
    const ano = a + Math.floor(total / 12);
    const mes = total % 12;
    const ultimo = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
    return `${String(ano).padStart(4, "0")}-${String(mes + 1).padStart(2, "0")}-${String(Math.min(d, ultimo)).padStart(2, "0")}`;
  });
}

export type TipoDeContrato = "fixo" | "mensal" | "exito" | "hibrido";

export interface PlanoDoContrato {
  tipo: TipoDeContrato;
  fixo?: { valor: number; parcelas: number; primeiroVencimento: Dia };
  mensal?: { valor: number; meses: number; primeiroVencimento: Dia };
  exitoBp?: number;
}

export interface ParcelaPlanejada {
  tipo: "fixo" | "mensal" | "exito";
  numero: number;
  descricao: string;
  valor: number | null;
  vencimento: Dia | null;
}

/** O máximo de parcelas ou de mensalidades criadas de uma vez. */
export const MAXIMO_DE_PARCELAS = 60;

const mesDoDia = (dia: Dia) => `${dia.slice(5, 7)}/${dia.slice(0, 4)}`;

/**
 * As parcelas que o contrato gera. O valor fixo vira parcelas com vencimento mensal (a soma
 * fecha no centavo), a mensalidade vira uma parcela por mês, e o êxito nasce sem valor e sem
 * vencimento: guarda só o percentual, e o valor entra quando sai o resultado.
 */
export function planejarParcelas(plano: PlanoDoContrato): ParcelaPlanejada[] {
  const { tipo, fixo, mensal, exitoBp } = plano;
  if (exitoBp !== undefined && tipo !== "exito" && tipo !== "hibrido") throw new Error("Êxito só no contrato de êxito ou no híbrido.");
  if (fixo && tipo !== "fixo" && tipo !== "hibrido") throw new Error("Valor fixo só no contrato fixo ou no híbrido.");
  if (mensal && tipo !== "mensal" && tipo !== "hibrido") throw new Error("Mensalidade só no contrato mensal ou no híbrido.");
  if (tipo === "fixo" && !fixo) throw new Error("Informe o valor e as parcelas.");
  if (tipo === "mensal" && !mensal) throw new Error("Informe a mensalidade.");
  if (tipo === "hibrido" && !fixo && !mensal) throw new Error("O contrato híbrido combina o êxito com um valor fixo ou uma mensalidade.");
  if ((tipo === "exito" || tipo === "hibrido") && exitoBp === undefined) throw new Error("Informe o percentual de êxito.");
  if (exitoBp !== undefined && (!Number.isInteger(exitoBp) || exitoBp < 1 || exitoBp > 10_000)) throw new Error("O percentual de êxito vai de 0,01% a 100%.");

  const parcelas: ParcelaPlanejada[] = [];
  if (fixo) {
    if (!Number.isInteger(fixo.parcelas) || fixo.parcelas < 1 || fixo.parcelas > MAXIMO_DE_PARCELAS) throw new Error(`De 1 a ${MAXIMO_DE_PARCELAS} parcelas.`);
    if (!Number.isSafeInteger(fixo.valor) || fixo.valor <= 0) throw new Error("O valor precisa ser maior que zero.");
    if (!ehDia(fixo.primeiroVencimento)) throw new Error("Vencimento inválido.");
    const valores = dividirEmParcelas(fixo.valor, fixo.parcelas);
    const datas = vencimentosMensais(fixo.primeiroVencimento, fixo.parcelas);
    valores.forEach((valor, i) => parcelas.push({ tipo: "fixo", numero: i + 1, descricao: fixo.parcelas === 1 ? "Honorários" : `Honorários · parcela ${i + 1}/${fixo.parcelas}`, valor, vencimento: datas[i]! }));
  }
  if (mensal) {
    if (!Number.isInteger(mensal.meses) || mensal.meses < 1 || mensal.meses > MAXIMO_DE_PARCELAS) throw new Error(`De 1 a ${MAXIMO_DE_PARCELAS} meses.`);
    if (!Number.isSafeInteger(mensal.valor) || mensal.valor <= 0) throw new Error("O valor precisa ser maior que zero.");
    if (!ehDia(mensal.primeiroVencimento)) throw new Error("Vencimento inválido.");
    vencimentosMensais(mensal.primeiroVencimento, mensal.meses).forEach((vencimento, i) => parcelas.push({ tipo: "mensal", numero: i + 1, descricao: `Mensalidade · ${mesDoDia(vencimento)}`, valor: mensal.valor, vencimento }));
  }
  if (exitoBp !== undefined) parcelas.push({ tipo: "exito", numero: 1, descricao: `Honorário de êxito (${formatarBasePontos(exitoBp)})`, valor: null, vencimento: null });
  return parcelas;
}

export type SituacaoDaParcela = "sem_valor" | "a_vencer" | "em_atraso" | "parcial" | "paga" | "cancelada";

export interface DadosDaParcela {
  /** Nulo no honorário de êxito que ainda não tem resultado. */
  valor: number | null;
  vencimento: Dia | null;
  /** A soma dos pagamentos marcados (os estornados não entram). */
  pago: number;
  cancelada: boolean;
}

/**
 * Paga só quando os pagamentos marcados cobrem o valor. Em atraso é o que
 * venceu e ainda tem saldo, mesmo com pagamento parcial.
 */
export function situacaoDaParcela(p: DadosDaParcela, hoje: Dia): SituacaoDaParcela {
  if (p.cancelada) return "cancelada";
  if (p.valor === null) return "sem_valor";
  if (p.pago >= p.valor) return "paga";
  if (p.vencimento !== null && p.vencimento < hoje) return "em_atraso";
  return p.pago > 0 ? "parcial" : "a_vencer";
}

export interface VencimentoDaCobranca {
  sugerido: Dia | null;
  precisaEscolher: boolean;
  motivo: string | null;
}

/**
 * A data que a cobrança sugere é a da parcela, nunca a de hoje. Parcela que já
 * venceu (ou que não tem data) não sugere nada: a cobrança pede uma data de hoje em
 * diante, e é a pessoa quem escolhe.
 */
export function vencimentoDaCobranca(vencimentoDaParcela: Dia | null, hoje: Dia): VencimentoDaCobranca {
  if (vencimentoDaParcela === null) return { sugerido: null, precisaEscolher: true, motivo: "A parcela não tem vencimento: escolha a data da cobrança." };
  if (vencimentoDaParcela < hoje) {
    return {
      sugerido: null,
      precisaEscolher: true,
      motivo: `O vencimento da parcela (${formatarDia(vencimentoDaParcela)}) já passou, e a cobrança precisa de uma data de hoje em diante. Escolha a nova data.`,
    };
  }
  return { sugerido: vencimentoDaParcela, precisaEscolher: false, motivo: null };
}

/** Quantos dias a parcela está vencida (zero se não está). */
export function diasEmAtraso(vencimento: Dia | null, hoje: Dia): number {
  return vencimento !== null && vencimento < hoje ? diferencaEmDias(vencimento, hoje) : 0;
}

/** O dia depois de `dias` dias do vencimento, para a régua de lembretes (negativo, antes). */
export function diaDoLembrete(vencimento: Dia, dias: number): Dia {
  return somarDias(vencimento, dias);
}

/* ------------------------------------------------------------------ */
/* Do alvará ao honorário                                              */
/* ------------------------------------------------------------------ */

export interface ContaDoAlvara {
  /** O valor sobre o qual a conta foi feita: o que caiu na conta, ou o do alvará quando ainda não se sabe. */
  base: number;
  baseEhRecebido: boolean;
  /** O recebido menos o valor do alvará (negativo: caiu menos). Nulo enquanto não há valor recebido. */
  diferenca: number | null;
  honorario: number;
  cliente: number;
  /** Sem contrato com honorário de êxito: nada para o escritório, e o valor todo é do cliente. */
  semContrato: boolean;
  /** O que falta para a conta valer: o valor recebido. A conta de estimativa não se confirma. */
  falta: "valor_recebido" | null;
}

/** A parte do escritório e a do cliente num alvará sacado, a partir do que caiu na conta. */
export function calcularAlvara(a: { valorAlvara: number; valorRecebido: number | null; exitoBp: number | null }): ContaDoAlvara {
  const recebidoValido = a.valorRecebido !== null && a.valorRecebido > 0;
  const base = recebidoValido ? a.valorRecebido! : a.valorAlvara;
  const semContrato = !a.exitoBp;
  const partes = semContrato ? { honorario: 0, cliente: base } : calcularExito(base, a.exitoBp!);
  return {
    base,
    baseEhRecebido: recebidoValido,
    diferenca: recebidoValido ? a.valorRecebido! - a.valorAlvara : null,
    ...partes,
    semContrato,
    falta: recebidoValido ? null : "valor_recebido",
  };
}

export interface ConferenciaDeRepasses {
  repassado: number;
  falta: number;
  excede: number;
  completo: boolean;
}

/** Os repasses (um ou mais favorecidos) contra a parte do cliente: não podem passar dela. */
export function conferirRepasses(parteDoCliente: number, repasses: { valor: number }[]): ConferenciaDeRepasses {
  const repassado = repasses.reduce((s, r) => s + r.valor, 0);
  return { repassado, falta: Math.max(parteDoCliente - repassado, 0), excede: Math.max(repassado - parteDoCliente, 0), completo: repassado === parteDoCliente };
}

/* ------------------------------------------------------------------ */
/* O resumo do Financeiro                                              */
/* ------------------------------------------------------------------ */

export interface ParcelaParaResumo extends DadosDaParcela {
  id: string;
  clienteId: string | null;
  processoId: string | null;
}

export interface GrupoDoResumo {
  id: string;
  aReceber: number;
  emAtraso: number;
  recebido: number;
}

export interface ResumoDoFinanceiro {
  /** O que falta receber das parcelas com valor: o que vence e o que já venceu. */
  aReceber: number;
  aVencer: number;
  emAtraso: number;
  parcelasEmAtraso: number;
  /** Só o que tem pagamento marcado. */
  recebido: number;
  porMes: { mes: string; aReceber: number; emAtraso: number }[];
  porCliente: GrupoDoResumo[];
  porProcesso: GrupoDoResumo[];
}

/** Soma o financeiro. Parcela cancelada e êxito sem valor ficam fora do que se espera receber; o recebido é sempre o dos pagamentos marcados. */
export function resumirFinanceiro(parcelas: ParcelaParaResumo[], hoje: Dia): ResumoDoFinanceiro {
  const r: ResumoDoFinanceiro = { aReceber: 0, aVencer: 0, emAtraso: 0, parcelasEmAtraso: 0, recebido: 0, porMes: [], porCliente: [], porProcesso: [] };
  const meses = new Map<string, { mes: string; aReceber: number; emAtraso: number }>();
  const clientes = new Map<string, GrupoDoResumo>();
  const processos = new Map<string, GrupoDoResumo>();
  const grupo = (mapa: Map<string, GrupoDoResumo>, id: string | null) => {
    if (id === null) return null;
    let g = mapa.get(id);
    if (!g) mapa.set(id, (g = { id, aReceber: 0, emAtraso: 0, recebido: 0 }));
    return g;
  };
  for (const p of parcelas) {
    if (p.cancelada) continue;
    const falta = p.valor === null ? 0 : Math.max(p.valor - p.pago, 0);
    const atrasada = falta > 0 && p.vencimento !== null && p.vencimento < hoje;
    const gs = [grupo(clientes, p.clienteId), grupo(processos, p.processoId)];
    r.recebido += p.pago;
    for (const g of gs) if (g) g.recebido += p.pago;
    if (falta === 0) continue;
    r.aReceber += falta;
    for (const g of gs) if (g) g.aReceber += falta;
    if (atrasada) {
      r.emAtraso += falta;
      r.parcelasEmAtraso++;
      for (const g of gs) if (g) g.emAtraso += falta;
    } else r.aVencer += falta;
    if (p.vencimento !== null) {
      const mes = p.vencimento.slice(0, 7);
      const m = meses.get(mes) ?? { mes, aReceber: 0, emAtraso: 0 };
      m.aReceber += falta;
      if (atrasada) m.emAtraso += falta;
      meses.set(mes, m);
    }
  }
  const ordem = (a: GrupoDoResumo, b: GrupoDoResumo) => b.emAtraso - a.emAtraso || b.aReceber - a.aReceber || b.recebido - a.recebido || a.id.localeCompare(b.id);
  r.porMes = [...meses.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  r.porCliente = [...clientes.values()].sort(ordem);
  r.porProcesso = [...processos.values()].sort(ordem);
  return r;
}

/* ------------------------------------------------------------------ */
/* Alvará parado                                                       */
/* ------------------------------------------------------------------ */

/**
 * Dias na etapa até o alvará chamar atenção: o dinheiro sacado é do cliente e sai logo. A tela de
 * Alvarás e o Perguntar usam os mesmos números.
 */
export const DIAS_NA_ETAPA_DO_ALVARA = { novo: 15, aguardando_saque: 15, sacado: 5 } as const;

/* ------------------------------------------------------------------ */
/* Lembretes de cobrança (a régua)                                     */
/* ------------------------------------------------------------------ */

export interface PassoDaRegua {
  /** Dias a partir do vencimento: -3 é três dias antes, 0 é o dia, 3 é três dias depois. */
  dias: number;
  texto: string;
}

/** Os textos de partida da régua: o escritório os lê, ajusta e aprova antes de ligar. */
export const PASSOS_PADRAO_DA_REGUA: PassoDaRegua[] = [
  { dias: -3, texto: "Olá, {cliente}. Passando para lembrar que os honorários ({descricao}), no valor de {valor}, vencem em {vencimento}.\n{link}" },
  { dias: 0, texto: "Olá, {cliente}. Hoje vence o pagamento dos honorários ({descricao}), no valor de {valor}.\n{link}\nQualquer dúvida, é só responder esta mensagem." },
  { dias: 3, texto: "Olá, {cliente}. Não identificamos o pagamento dos honorários ({descricao}), de {valor}, que venceram em {vencimento}. Se já pagou, desconsidere esta mensagem.\n{link}" },
];

export interface DadosDoLembrete {
  cliente: string;
  descricao: string;
  valorCentavos: number;
  vencimento: Dia;
  /** O link de pagamento da cobrança emitida. Sem cobrança, a linha do link sai do texto. */
  link: string | null;
  escritorio: string;
}

/**
 * Preenche os campos do texto que o escritório aprovou: {cliente}, {descricao}, {valor},
 * {vencimento}, {link} e {escritorio}. Sem link, a linha do link sai. Um campo que o texto
 * não conhece fica como está, para quem aprova a mensagem ver.
 */
export function preencherLembrete(texto: string, d: DadosDoLembrete): string {
  const valores: Record<string, string> = {
    cliente: d.cliente,
    descricao: d.descricao,
    valor: formatarCentavos(d.valorCentavos),
    vencimento: formatarDia(d.vencimento),
    link: d.link ?? "",
    escritorio: d.escritorio,
  };
  return texto
    .split("\n")
    .flatMap((linha) => {
      if (!d.link && linha.includes("{link}") && linha.replaceAll("{link}", "").trim() === "") return [];
      return [linha.replace(/\{([a-z]+)\}/g, (inteiro, campo: string) => valores[campo] ?? inteiro).trimEnd()];
    })
    .join("\n")
    .trim();
}
