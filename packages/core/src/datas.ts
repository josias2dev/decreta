/**
 * Datas do calendário forense como texto ISO (`AAAA-MM-DD`), sem fuso: um
 * prazo vence num dia, não num instante. As contas usam UTC só por dentro,
 * para o horário de verão nunca empurrar um dia para o vizinho.
 */

export type Dia = string;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function ehDia(valor: unknown): valor is Dia {
  if (typeof valor !== "string" || !ISO.test(valor)) return false;
  const d = new Date(`${valor}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === valor;
}

function utc(dia: Dia): Date {
  return new Date(`${dia}T00:00:00Z`);
}

export function somarDias(dia: Dia, n: number): Dia {
  const d = utc(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo … 6 = sábado. */
export function diaDaSemana(dia: Dia): number {
  return utc(dia).getUTCDay();
}

export function fimDeSemana(dia: Dia): boolean {
  const s = diaDaSemana(dia);
  return s === 0 || s === 6;
}

/** Dias corridos de `de` até `ate` (negativo se `ate` vem antes). */
export function diferencaEmDias(de: Dia, ate: Dia): number {
  return Math.round((utc(ate).getTime() - utc(de).getTime()) / 86_400_000);
}

export function diaDe(ano: number, mes: number, dia: number): Dia {
  return `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** O dia de hoje no fuso do escritório. */
export function hojeEm(timeZone = "America/Sao_Paulo", agora: Date = new Date()): Dia {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(agora);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${p("year")}-${p("month")}-${p("day")}`;
}

/** O dia (no fuso do escritório) de um instante. */
export function diaDoInstante(instante: Date | string, timeZone = "America/Sao_Paulo"): Dia {
  return hojeEm(timeZone, typeof instante === "string" ? new Date(instante) : instante);
}

const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

/** 23/11/2026 */
export function formatarDia(dia: Dia): string {
  const [a, m, d] = dia.split("-");
  return `${d}/${m}/${a}`;
}

/** 23/11 */
export function formatarDiaCurto(dia: Dia): string {
  const [, m, d] = dia.split("-");
  return `${d}/${m}`;
}

/** "29 out", com o ano só quando não é o corrente. */
export function diaPorExtensoCurto(dia: Dia, hoje?: Dia): string {
  const [a, m, d] = dia.split("-");
  const base = `${Number(d)} ${MESES_CURTOS[Number(m) - 1]}`;
  return hoje && hoje.slice(0, 4) !== a ? `${base} ${a}` : base;
}

/** "quinta, 29 de outubro" */
export function diaPorExtenso(dia: Dia): string {
  const [, m, d] = dia.split("-");
  const semana = SEMANA[diaDaSemana(dia)]!.replace("-feira", "");
  return `${semana}, ${Number(d)} de ${MESES[Number(m) - 1]}`;
}

export function nomeDoDiaDaSemana(dia: Dia): string {
  return SEMANA[diaDaSemana(dia)]!;
}
