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
import { regraDaContagem, type Rito } from "./conferencia.ts";
import { diferencaEmDias, fimDeSemana, formatarDia, somarDias, type Dia } from "./datas.ts";

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

export interface ContaComDoisMarcos {
  /** A conta que vale: a que vence primeiro. */
  conta: ResultadoDaContagem;
  pelo: "publicacao" | "sistema";
  /** A conta pelo outro marco, para mostrar ao lado. `null` sem intimação pelo sistema. */
  outra: ResultadoDaContagem | null;
}

/**
 * Dupla intimação: publicação no DJEN e intimação pelo sistema do tribunal.
 * Pela Res. CNJ 455/2022 (art. 11, § 3º) vale o DJEN, mas o STJ ainda não
 * fixou a tese do Tema 1.180: até lá, conta pelos dois marcos e vale o que
 * vence primeiro. No empate, o DJEN.
 */
export function contarComDoisMarcos({ intimacaoNoSistema, ...pedido }: PedidoDeContagem & { intimacaoNoSistema: Dia | null }): ContaComDoisMarcos {
  const djen = contarPrazo(pedido);
  if (!intimacaoNoSistema) return { conta: djen, pelo: "publicacao", outra: null };
  const sistema = contarPrazo({ ...pedido, publicacao: intimacaoNoSistema });
  return sistema.fim < djen.fim ? { conta: sistema, pelo: "sistema", outra: djen } : { conta: djen, pelo: "publicacao", outra: sistema };
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

/**
 * O tópico de tempestividade da peça, montado pela conta do motor (nunca pela
 * IA): disponibilização, publicação, início, dias excluídos e vencimento.
 */
export function textoDaTempestividade(r: ResultadoDaContagem, o: { rito: Rito; disponibilizacao: Dia | null; certidao?: boolean }): string {
  // A certidão de publicação do DJEN prova a data; a pessoa anexa a que o Decreta guardou.
  const prova = o.certidao ? ", conforme a certidão de publicação emitida pelo próprio DJEN (anexa)," : "";
  const partes = [
    o.disponibilizacao
      ? `A intimação foi disponibilizada no Diário de Justiça Eletrônico Nacional (DJEN) em ${formatarDia(o.disponibilizacao)}${prova} e considera-se publicada em ${formatarDia(r.publicacao)}, primeiro dia útil seguinte (Lei 11.419/2006, art. 4º, § 3º).`
      : `A intimação foi publicada em ${formatarDia(r.publicacao)}.`,
  ];
  // "Dias úteis (CPC, art. 219)" vira "15 dias úteis (...)", e no prazo de um dia, "1 dia útil (...)".
  const regra = regraDaContagem(o.rito, r.contagem)
    .replace(/^Dias/, r.dias === 1 ? "dia" : "dias")
    .replace(/^dia úteis/, "dia útil")
    .replace(/^dia corridos/, "dia corrido");
  // O dia do vencimento prorrogado (e os que vêm depois dele) entram na frase da prorrogação.
  const fora = juntarIntervalos(r.desconsiderados.filter((f) => !r.prorrogadoDe || f.dia < r.prorrogadoDe));
  const dias = fora.dias === 1 ? `o dia ${fora.texto}` : `os dias ${fora.texto}`;
  const excluidos = r.contagem === "uteis" ? (fora.dias ? `, excluídos os sábados, os domingos e ${dias}` : ", excluídos os sábados e os domingos") : fora.dias ? `, excluídos ${dias}` : "";
  partes.push(`O prazo de ${r.dias} ${regra} começou a correr em ${formatarDia(r.inicio)} (Lei 11.419/2006, art. 4º, § 4º) e termina em ${formatarDia(r.fim)}${excluidos}.`);
  if (r.prorrogadoDe) partes.push(`O último dia cairia em ${formatarDia(r.prorrogadoDe)}, sem expediente forense completo, e passou para ${formatarDia(r.fim)} (CPC, art. 224, § 1º).`);
  partes.push(`Apresentada até ${formatarDia(r.fim)}, a presente peça é tempestiva.`);
  return partes.join(" ");
}

/** Dias seguidos com o mesmo motivo viram "de 16/02/2026 a 17/02/2026 (Carnaval)"; o fim de semana no meio não separa. */
function juntarIntervalos(lista: Feriado[]): { texto: string; dias: number } {
  const blocos: { de: Dia; ate: Dia; nome: string }[] = [];
  for (const f of [...lista].sort((a, b) => a.dia.localeCompare(b.dia))) {
    const ultimo = blocos.at(-1);
    if (ultimo && ultimo.nome === f.nome && diferencaEmDias(ultimo.ate, f.dia) <= 3) ultimo.ate = f.dia;
    else blocos.push({ de: f.dia, ate: f.dia, nome: f.nome });
  }
  // "Suspensão (CPC, art. 220)" vira "Suspensão, CPC, art. 220" para não abrir parênteses dentro de parênteses.
  const nome = (n: string) => n.replace(/\s*\(([^)]*)\)\s*$/, ", $1");
  const itens = blocos.map((b) => (b.de === b.ate ? `${formatarDia(b.de)} (${nome(b.nome)})` : `de ${formatarDia(b.de)} a ${formatarDia(b.ate)} (${nome(b.nome)})`));
  return { texto: juntar(itens), dias: lista.length };
}

function juntar(itens: string[]): string {
  if (itens.length <= 1) return itens.join("");
  return `${itens.slice(0, -1).join(", ")} e ${itens.at(-1)}`;
}
