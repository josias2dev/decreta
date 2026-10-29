/**
 * Contagem de prazo processual. A IA sugere o tipo e a quantidade de dias;
 * a data final sai sempre daqui, e uma pessoa confirma.
 *
 * Regras (CPC, arts. 219, 220 e 224; Lei 11.419/2006, art. 4º):
 * - Publicação no diário eletrônico (DJEN): considera-se publicada no primeiro
 *   dia com expediente depois da disponibilização.
 * - O prazo começa no primeiro dia útil depois da publicação (exclui o dia do
 *   começo, inclui o do vencimento).
 * - Em dias úteis, só contam os dias com expediente e sem suspensão.
 * - Em dias corridos, contam todos, menos os de suspensão; se o último cair em
 *   dia sem expediente, vai para o primeiro dia útil seguinte.
 * - Começo e vencimento não caem em dia de expediente reduzido (art. 224, § 1º).
 */
import type { Calendario, Feriado } from "./calendario.ts";
import { fimDeSemana, somarDias, type Dia } from "./datas.ts";

export type Contagem = "uteis" | "corridos";

/** Há expediente forense no dia (pode haver publicação). */
export function temExpediente(dia: Dia, cal: Calendario): boolean {
  return !fimDeSemana(dia) && cal.semExpediente(dia) === null;
}

/** O dia conta como dia útil de prazo. */
export function ehDiaUtil(dia: Dia, cal: Calendario): boolean {
  return temExpediente(dia, cal) && cal.suspenso(dia) === null;
}

/** Pode começar ou vencer um prazo no dia: útil e com expediente completo. */
function podeAbrirOuFechar(dia: Dia, cal: Calendario): boolean {
  return ehDiaUtil(dia, cal) && cal.reduzido(dia) === null;
}

function proximo(dia: Dia, ok: (d: Dia) => boolean): Dia {
  let d = somarDias(dia, 1);
  // Um ano inteiro sem dia útil é calendário quebrado, não prazo longo.
  for (let i = 0; i < 400; i++, d = somarDias(d, 1)) if (ok(d)) return d;
  throw new Error(`calendário sem dia útil depois de ${dia}`);
}

/** Data da publicação de algo disponibilizado no diário eletrônico no dia `disponibilizacao`. */
export function dataDaPublicacao(disponibilizacao: Dia, cal: Calendario): Dia {
  return proximo(disponibilizacao, (d) => temExpediente(d, cal));
}

/** Primeiro dia do prazo: o primeiro dia útil (com expediente completo) depois da publicação. */
export function inicioDoPrazo(publicacao: Dia, cal: Calendario): Dia {
  return proximo(publicacao, (d) => podeAbrirOuFechar(d, cal));
}

export interface PedidoDeContagem {
  /** Data da publicação (não a da disponibilização). */
  publicacao: Dia;
  dias: number;
  contagem: Contagem;
  calendario: Calendario;
}

export interface ResultadoDaContagem {
  publicacao: Dia;
  inicio: Dia;
  fim: Dia;
  dias: number;
  contagem: Contagem;
  /** Feriados, recessos e suspensões (fora fins de semana) entre o início e o fim que ficaram fora da conta ou empurraram o vencimento. */
  desconsiderados: Feriado[];
  /** O vencimento caiu em dia sem expediente e foi para o dia útil seguinte (só em dias corridos ou expediente reduzido). */
  prorrogadoDe: Dia | null;
}

export function contarPrazo({ publicacao, dias, contagem, calendario: cal }: PedidoDeContagem): ResultadoDaContagem {
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) throw new RangeError("o prazo precisa ter de 1 a 3650 dias");
  const inicio = inicioDoPrazo(publicacao, cal);
  const desconsiderados: Feriado[] = [];
  const anotar = (d: Dia) => {
    if (fimDeSemana(d)) return;
    const motivo = cal.semExpediente(d) ?? cal.suspenso(d);
    if (motivo) desconsiderados.push(motivo);
  };

  let fim = inicio;
  if (contagem === "uteis") {
    let contados = 1;
    while (contados < dias) {
      fim = somarDias(fim, 1);
      if (ehDiaUtil(fim, cal)) contados++;
      else anotar(fim);
    }
  } else {
    let contados = 1;
    while (contados < dias) {
      fim = somarDias(fim, 1);
      if (cal.suspenso(fim)) anotar(fim);
      else contados++;
    }
  }

  let prorrogadoDe: Dia | null = null;
  if (!podeAbrirOuFechar(fim, cal)) {
    prorrogadoDe = fim;
    const reduzido = cal.reduzido(fim);
    if (reduzido) desconsiderados.push(reduzido);
    else anotar(fim);
    const original = fim;
    fim = proximo(fim, (d) => podeAbrirOuFechar(d, cal));
    for (let d = somarDias(original, 1); d < fim; d = somarDias(d, 1)) anotar(d);
  }

  return { publicacao, inicio, fim, dias, contagem, desconsiderados: unicos(desconsiderados), prorrogadoDe };
}

function unicos(lista: Feriado[]): Feriado[] {
  const vistos = new Set<string>();
  return lista.filter((f) => (vistos.has(f.dia) ? false : (vistos.add(f.dia), true)));
}

/** Dias úteis de `de` (exclusive) até `ate` (inclusive). Zero ou negativo quando `ate` não vem depois. */
export function diasUteisEntre(de: Dia, ate: Dia, cal: Calendario): number {
  const sinal = ate >= de ? 1 : -1;
  const [a, b] = sinal > 0 ? [de, ate] : [ate, de];
  let n = 0;
  for (let d = somarDias(a, 1); d <= b; d = somarDias(d, 1)) if (ehDiaUtil(d, cal)) n++;
  return n * sinal;
}

export type Urgencia = "vencido" | "hoje" | "breve" | "prazo" | "cumprido";

/** Até 3 dias úteis para vencer é "breve" (âmbar). */
export const DIAS_UTEIS_BREVE = 3;

export function urgenciaDoPrazo(prazo: { fim: Dia; situacao: "aberto" | "cumprido" | "descartado" }, hoje: Dia, cal: Calendario): Urgencia {
  if (prazo.situacao !== "aberto") return "cumprido";
  if (prazo.fim < hoje) return "vencido";
  if (prazo.fim === hoje) return "hoje";
  return diasUteisEntre(hoje, prazo.fim, cal) <= DIAS_UTEIS_BREVE ? "breve" : "prazo";
}

/** "Começa em 30/10, primeiro dia útil depois da publicação. Fora da conta: fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra)." */
export function explicarContagem(r: ResultadoDaContagem): string {
  const dm = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const partes = [`Começa em ${dm(r.inicio)}, primeiro dia útil depois da publicação.`];
  const fora = r.desconsiderados.map((f) => `${dm(f.dia)} (${f.nome})`);
  if (r.contagem === "uteis") {
    partes.push(fora.length ? `Fora da conta: fins de semana, ${juntar(fora)}.` : "Fora da conta: só os fins de semana.");
  } else if (fora.length) {
    partes.push(`Dias corridos; não contam: ${juntar(fora)}.`);
  } else {
    partes.push("Dias corridos.");
  }
  if (r.prorrogadoDe) partes.push(`O vencimento caía em ${dm(r.prorrogadoDe)}, sem expediente completo, e passou para ${dm(r.fim)}.`);
  return partes.join(" ");
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}
