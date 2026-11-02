/**
 * Calendário forense: o que tira um dia da contagem de prazo.
 *
 * - Feriados nacionais (Leis 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023)
 *   e a Sexta-feira da Paixão.
 * - Dias sem expediente forense de cada tribunal com calendário próprio
 *   (`REGRAS_DOS_TRIBUNAIS`, com a fonte e a data da conferência de cada um).
 *   Onde há expediente reduzido (Quarta-feira de Cinzas), o dia conta no meio
 *   do prazo, mas não pode ser o primeiro nem o último (CPC, art. 224, § 1º).
 *   Tribunal sem calendário próprio usa só o nacional e o recesso, e o
 *   calendário avisa (`proprio`).
 * - Recesso forense de 20 de dezembro a 6 de janeiro, sem expediente
 *   (Resolução CNJ 244/2016), e suspensão dos prazos de 20 de dezembro a 20
 *   de janeiro (CPC, art. 220; CLT, art. 775-A): de 7 a 20 de janeiro sai
 *   publicação, mas o prazo só começa a correr no dia 21.
 *
 * Aqui entra só o que vale todo ano (lei, regimento, ou o mesmo padrão nos
 * atos de anos diferentes). Ponte e suspensão de um ano só, feriado municipal
 * e feriado estadual de uma seção ou comarca entram como `extras`,
 * cadastrados pelo escritório (tabela `suspensoes`). Confira o calendário
 * oficial do ano antes de confiar só nesta lista.
 */
import { diaDe, somarDias, type Dia } from "./datas.ts";

export type TipoDeFeriado = "nacional" | "forense" | "recesso" | "local" | "reduzido";

export interface Feriado {
  dia: Dia;
  nome: string;
  tipo: TipoDeFeriado;
}

/** Sigla do tribunal. Os de `TRIBUNAIS_COM_CALENDARIO` têm calendário próprio; os outros usam só o nacional e o recesso. */
export type Tribunal = "TJSC" | "TRT12" | "TRF1" | "TRF2" | "TRF3" | "TRF4" | "TRF5" | "TRF6" | "TJSP" | "TJRJ" | "TJMG" | (string & {});

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function pascoa(ano: number): Dia {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return diaDe(ano, mes, dia);
}

export function feriadosNacionais(ano: number): Feriado[] {
  const p = pascoa(ano);
  const fixo = (mes: number, dia: number, nome: string): Feriado => ({ dia: diaDe(ano, mes, dia), nome, tipo: "nacional" });
  const lista: Feriado[] = [
    fixo(1, 1, "Confraternização Universal"),
    { dia: somarDias(p, -2), nome: "Sexta-feira da Paixão", tipo: "nacional" },
    fixo(4, 21, "Tiradentes"),
    fixo(5, 1, "Dia do Trabalho"),
    fixo(9, 7, "Independência"),
    fixo(10, 12, "Nossa Senhora Aparecida"),
    fixo(11, 2, "Finados"),
    fixo(11, 15, "Proclamação da República"),
    fixo(12, 25, "Natal"),
  ];
  // Dia Nacional de Zumbi e da Consciência Negra, feriado desde a Lei 14.759/2023.
  if (ano >= 2024) lista.push(fixo(11, 20, "Consciência Negra"));
  return lista.sort((x, y) => x.dia.localeCompare(y.dia));
}

/** O feriado nacional mais próximo depois de `hoje` (hoje não conta, mesmo sendo feriado). */
export function proximoFeriadoNacional(hoje: Dia): Feriado {
  const ano = Number(hoje.slice(0, 4));
  return [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].find((f) => f.dia > hoje)!;
}

type Regra = (ano: number) => Feriado[];

const forense = (dia: Dia, nome: string): Feriado => ({ dia, nome, tipo: "forense" });
const emOrdem = (lista: Feriado[]) => lista.sort((a, b) => a.dia.localeCompare(b.dia));

/** Dias, antes (negativo) ou depois da Páscoa, que o calendário de cada tribunal usa. */
const CARNAVAL_SEGUNDA = -48;
const CARNAVAL_TERCA = -47;
const CINZAS = -46;
const QUARTA_SANTA = -4;
const QUINTA_SANTA = -3;
const CORPUS_CHRISTI = 60;

/** TJSC e TRT12: as regras que já estavam aqui (Carnaval, Quinta-feira Santa, Corpus Christi, Dia da Justiça; Cinzas com expediente reduzido). */
const santaCatarina: Regra = (ano) => {
  const p = pascoa(ano);
  return [
    forense(somarDias(p, CARNAVAL_SEGUNDA), "Carnaval"),
    forense(somarDias(p, CARNAVAL_TERCA), "Carnaval"),
    { dia: somarDias(p, CINZAS), nome: "Quarta-feira de Cinzas (expediente a partir das 14h)", tipo: "reduzido" },
    forense(somarDias(p, QUINTA_SANTA), "Quinta-feira Santa"),
    forense(somarDias(p, CORPUS_CHRISTI), "Corpus Christi"),
    forense(diaDe(ano, 12, 8), "Dia da Justiça"),
  ];
};

/**
 * Justiça Federal, TRF1 a TRF6: Lei 5.010/1966, art. 62 (Planalto, conferido
 * em 02/11/2026). I: 20/12 a 06/01 (o recesso, abaixo); II: Semana Santa, da
 * quarta-feira ao domingo de Páscoa; III: segunda e terça de Carnaval; IV:
 * 11/08, 1º e 2/11 e 8/12 (redação da Lei 6.741/1979). O 2/11 já é nacional.
 * Os atos de 2026 de cada região confirmam as mesmas datas (conferidos em
 * 02/11/2026): TRF1, Portaria Presi 5/2026; TRF2, Portaria PRES 844/2025;
 * TRF3, Portaria CATRF3R 48/2025; TRF4, calendário de feriados 2026
 * (atualizado em 30/03/2026); TRF5, Ato 626/2025; TRF6, Portaria Presi 1/2026.
 *
 * Fora, porque não valem para toda a região nem todo ano: Corpus Christi
 * (municipal em Porto Alegre e Belo Horizonte; ponto facultativo no TRF1, no
 * TRF2 e no TRF5), Quarta-feira de Cinzas (ponto facultativo ou expediente a
 * partir das 14h, conforme o ato do ano) e os feriados estaduais e municipais
 * de cada seção, como o São Jorge (23/04, SJRJ) e a Data Magna do RS (20/09).
 */
const justicaFederal: Regra = (ano) => {
  const p = pascoa(ano);
  return emOrdem([
    forense(somarDias(p, CARNAVAL_SEGUNDA), "Carnaval"),
    forense(somarDias(p, CARNAVAL_TERCA), "Carnaval"),
    forense(somarDias(p, QUARTA_SANTA), "Quarta-feira Santa"),
    forense(somarDias(p, QUINTA_SANTA), "Quinta-feira Santa"),
    forense(diaDe(ano, 8, 11), "Dia do Advogado"),
    forense(diaDe(ano, 11, 1), "Dia de Todos os Santos"),
    forense(diaDe(ano, 12, 8), "Dia da Justiça"),
  ]);
};

/**
 * TJMG: Lei Complementar estadual 59/2001, art. 313, § 5º (texto da ALMG,
 * conferido em 02/11/2026): são feriados na Justiça do Estado o 8/12, de 20/12
 * a 06/01, a Semana Santa (quarta-feira ao domingo de Páscoa) e a segunda, a
 * terça e a quarta-feira de Carnaval (Cinzas inteira, sem expediente reduzido).
 * A Portaria Conjunta 1.798/PR/2026 e a 1.377/PR/2022 trazem a mesma lista.
 *
 * Fora: o Dia do Funcionário Público (a data muda por ano; em 2026, 30/10),
 * as pontes (em 2026, 20/04 e 07/12), o Corpus Christi (só onde é feriado
 * municipal; em Belo Horizonte, 04/06/2026) e os feriados municipais.
 */
const minasGerais: Regra = (ano) => {
  const p = pascoa(ano);
  return emOrdem([
    forense(somarDias(p, CARNAVAL_SEGUNDA), "Carnaval"),
    forense(somarDias(p, CARNAVAL_TERCA), "Carnaval"),
    forense(somarDias(p, CINZAS), "Quarta-feira de Cinzas"),
    forense(somarDias(p, QUARTA_SANTA), "Quarta-feira Santa"),
    forense(somarDias(p, QUINTA_SANTA), "Quinta-feira Santa"),
    forense(diaDe(ano, 12, 8), "Dia da Justiça"),
  ]);
};

/**
 * TJSP: o mesmo padrão nos provimentos do Conselho Superior da Magistratura
 * que fixam o expediente de 2023 (Provimento 2.678/2022), 2024 (2.728/2023) e
 * 2026 (2.813/2025, DJe de 25/11/2025), lidos em 02/11/2026: segunda e terça
 * de Carnaval, Cinzas com expediente diferenciado (em 2026, atendimento a
 * partir das 13h; vale como reduzido), Endoenças (Quinta-feira Santa), Corpus
 * Christi, 9/07 (Data Magna, Lei estadual 9.497/1997) e 8/12 (Dia da Justiça).
 *
 * Fora: o 28/10 (Dia do Servidor; a data muda por ano), as pontes de cada ano
 * (em 2026, 20/04, 05/06, 10/07 e 07/12) e os feriados municipais por comarca.
 */
const saoPaulo: Regra = (ano) => {
  const p = pascoa(ano);
  return emOrdem([
    forense(somarDias(p, CARNAVAL_SEGUNDA), "Carnaval"),
    forense(somarDias(p, CARNAVAL_TERCA), "Carnaval"),
    { dia: somarDias(p, CINZAS), nome: "Quarta-feira de Cinzas (atendimento a partir das 13h)", tipo: "reduzido" },
    forense(somarDias(p, QUINTA_SANTA), "Quinta-feira Santa"),
    forense(somarDias(p, CORPUS_CHRISTI), "Corpus Christi"),
    forense(diaDe(ano, 7, 9), "Data Magna do Estado de São Paulo"),
    forense(diaDe(ano, 12, 8), "Dia da Justiça"),
  ]);
};

/**
 * TJRJ: Lei de Organização e Divisão Judiciárias (Lei estadual 10.633/2024),
 * art. 83, I a V (ALERJ, conferido em 02/11/2026; é o texto do art. 66 da Lei
 * 6.956/2015, que ela revogou): não há expediente em 8/12, na segunda, na terça
 * e na quarta-feira da semana do Carnaval, na quinta e na sexta da Semana
 * Santa e nos feriados nacionais, estaduais e municipais. O São Jorge (23/04)
 * é o feriado estadual (Lei estadual 5.198/2008), que consta do calendário do
 * TJRJ (2024) e do ato do TRF2 para a SJRJ (2026).
 *
 * Fora: o Corpus Christi (só onde a lei do município prevê), os pontos
 * facultativos do Estado (inciso II, por decreto de cada ano) e as pontes.
 */
const rioDeJaneiro: Regra = (ano) => {
  const p = pascoa(ano);
  return emOrdem([
    forense(somarDias(p, CARNAVAL_SEGUNDA), "Carnaval"),
    forense(somarDias(p, CARNAVAL_TERCA), "Carnaval"),
    forense(somarDias(p, CINZAS), "Quarta-feira de Cinzas"),
    forense(somarDias(p, QUINTA_SANTA), "Quinta-feira Santa"),
    forense(diaDe(ano, 4, 23), "Dia de São Jorge"),
    forense(diaDe(ano, 12, 8), "Dia da Justiça"),
  ]);
};

/**
 * Tribunais com calendário próprio. TJPR e TJRS ficam de fora de propósito:
 * o PR fixa o calendário por decreto judiciário de cada ano (o de 2026, Decreto
 * 621/2025, só tem a terça de Carnaval e muda o Dia da Justiça para 18/12) e o
 * RS por ato anual do Órgão Especial, que não consegui abrir. Sem regra fixa
 * conferida, a conta avisa em vez de adivinhar.
 */
const REGRAS_DOS_TRIBUNAIS = new Map<string, Regra>([
  ["TJSC", santaCatarina],
  ["TRT12", santaCatarina],
  ["TRF1", justicaFederal],
  ["TRF2", justicaFederal],
  ["TRF3", justicaFederal],
  ["TRF4", justicaFederal],
  ["TRF5", justicaFederal],
  ["TRF6", justicaFederal],
  ["TJSP", saoPaulo],
  ["TJRJ", rioDeJaneiro],
  ["TJMG", minasGerais],
]);

export const TRIBUNAIS_COM_CALENDARIO: readonly string[] = [...REGRAS_DOS_TRIBUNAIS.keys()];

const sigla = (tribunal: string) => tribunal.trim().toUpperCase();

/** O tribunal tem calendário próprio aqui (senão a conta usa só os feriados nacionais e o recesso). */
export function temCalendarioProprio(tribunal: Tribunal): boolean {
  return REGRAS_DOS_TRIBUNAIS.has(sigla(tribunal));
}

/** Dias sem expediente (ou com expediente reduzido) do tribunal, além dos feriados nacionais. Vazio sem calendário próprio. */
export function feriadosForenses(ano: number, tribunal: Tribunal): Feriado[] {
  return REGRAS_DOS_TRIBUNAIS.get(sigla(tribunal))?.(ano) ?? [];
}

/** Suspensão dos prazos no fim de ano (CPC, art. 220): de 20/12 a 20/01, inclusive. */
export function emSuspensaoDeFimDeAno(dia: Dia): boolean {
  const md = dia.slice(5);
  return md >= "12-20" || md <= "01-20";
}

/** Recesso forense, sem expediente (Resolução CNJ 244/2016): de 20/12 a 06/01. */
export function emRecesso(dia: Dia): boolean {
  const md = dia.slice(5);
  return md >= "12-20" || md <= "01-06";
}

export interface Calendario {
  /** Por que o fórum está fechado no dia (feriado, recesso), ou `null` se há expediente. Fim de semana não entra aqui. */
  semExpediente(dia: Dia): Feriado | null;
  /** Por que o prazo não corre no dia, mesmo com expediente (suspensão de fim de ano, suspensão do tribunal). */
  suspenso(dia: Dia): Feriado | null;
  /** Dia com expediente reduzido: conta no meio do prazo, mas não começa nem termina nele. */
  reduzido(dia: Dia): Feriado | null;
  tribunal: Tribunal;
  /** O tribunal tem calendário próprio aqui. Falso: a conta usou só os feriados nacionais e o recesso. */
  proprio: boolean;
}

export interface OpcoesDoCalendario {
  tribunal: Tribunal;
  /**
   * Feriados municipais da comarca e atos do tribunal. `local` e `forense`
   * fecham o fórum; `recesso` só suspende o prazo (há expediente);
   * `reduzido` é expediente parcial.
   */
  extras?: readonly Feriado[];
}

export function calendarioPara({ tribunal, extras = [] }: OpcoesDoCalendario): Calendario {
  const porAno = new Map<number, { fechados: Map<Dia, Feriado>; reduzidos: Map<Dia, Feriado> }>();
  const doAno = (ano: number) => {
    let c = porAno.get(ano);
    if (!c) {
      const fechados = new Map<Dia, Feriado>();
      const reduzidos = new Map<Dia, Feriado>();
      for (const f of [...feriadosNacionais(ano), ...feriadosForenses(ano, tribunal)]) {
        (f.tipo === "reduzido" ? reduzidos : fechados).set(f.dia, f);
      }
      c = { fechados, reduzidos };
      porAno.set(ano, c);
    }
    return c;
  };
  const extrasPorDia = new Map<Dia, Feriado>();
  for (const f of extras) extrasPorDia.set(f.dia, f);

  return {
    tribunal,
    proprio: temCalendarioProprio(tribunal),
    semExpediente(dia) {
      const extra = extrasPorDia.get(dia);
      if (extra && extra.tipo !== "reduzido" && extra.tipo !== "recesso") return extra;
      const f = doAno(Number(dia.slice(0, 4))).fechados.get(dia);
      if (f) return f;
      if (emRecesso(dia)) return { dia, nome: "Recesso forense", tipo: "recesso" };
      return null;
    },
    suspenso(dia) {
      const extra = extrasPorDia.get(dia);
      if (extra?.tipo === "recesso") return extra;
      if (emSuspensaoDeFimDeAno(dia)) return { dia, nome: "Suspensão dos prazos de fim de ano (CPC, art. 220)", tipo: "recesso" };
      return null;
    },
    reduzido(dia) {
      const extra = extrasPorDia.get(dia);
      if (extra?.tipo === "reduzido") return extra;
      return doAno(Number(dia.slice(0, 4))).reduzidos.get(dia) ?? null;
    },
  };
}
