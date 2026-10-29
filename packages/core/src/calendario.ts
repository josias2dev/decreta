/**
 * Calendário forense: o que tira um dia da contagem de prazo.
 *
 * - Feriados nacionais (Leis 662/1949, 6.802/1980, 10.607/2002 e 14.759/2023)
 *   e a Sexta-feira da Paixão.
 * - Dias sem expediente forense comuns ao TJSC e ao TRT12: segunda e terça de
 *   Carnaval, Quinta-feira Santa, Corpus Christi e 8 de dezembro (Dia da
 *   Justiça). A Quarta-feira de Cinzas tem expediente reduzido: conta no meio
 *   do prazo, mas não pode ser o primeiro nem o último dia (CPC, art. 224, § 1º).
 * - Recesso forense de 20 de dezembro a 6 de janeiro, sem expediente
 *   (Resolução CNJ 244/2016), e suspensão dos prazos de 20 de dezembro a 20
 *   de janeiro (CPC, art. 220; CLT, art. 775-A): de 7 a 20 de janeiro sai
 *   publicação, mas o prazo só começa a correr no dia 21.
 *
 * Cada tribunal publica a própria resolução do ano, e cada comarca tem os
 * feriados municipais: esses entram como `extras`, cadastrados pelo
 * escritório (tabela `suspensoes`). Confira o calendário oficial do ano antes
 * de confiar só nesta lista.
 */
import { diaDe, somarDias, type Dia } from "./datas.ts";

export type TipoDeFeriado = "nacional" | "forense" | "recesso" | "local" | "reduzido";

export interface Feriado {
  dia: Dia;
  nome: string;
  tipo: TipoDeFeriado;
}

/** Tribunais com calendário conhecido aqui. Outros usam só o nacional e o recesso. */
export type Tribunal = "TJSC" | "TRT12" | (string & {});

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

/** Dias sem expediente (ou com expediente reduzido) no TJSC e no TRT12. */
export function feriadosForenses(ano: number, tribunal: Tribunal): Feriado[] {
  if (tribunal !== "TJSC" && tribunal !== "TRT12") return [];
  const p = pascoa(ano);
  return [
    { dia: somarDias(p, -48), nome: "Carnaval", tipo: "forense" },
    { dia: somarDias(p, -47), nome: "Carnaval", tipo: "forense" },
    { dia: somarDias(p, -46), nome: "Quarta-feira de Cinzas (expediente a partir das 14h)", tipo: "reduzido" },
    { dia: somarDias(p, -3), nome: "Quinta-feira Santa", tipo: "forense" },
    { dia: somarDias(p, 60), nome: "Corpus Christi", tipo: "forense" },
    { dia: diaDe(ano, 12, 8), nome: "Dia da Justiça", tipo: "forense" },
  ];
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
