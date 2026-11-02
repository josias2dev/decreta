/**
 * O funil de aquisição e ativação: os nomes dos eventos e a conta que o
 * `bun run funil` imprime. Os eventos não carregam dado pessoal: só o nome, o
 * instante e, quando houver, o escritório (ver `eventos` em @decreta/db).
 */
import { diferencaEmDias, ehDia, formatarDia, somarDias, type Dia } from "./datas.ts";

/** O que o site (a landing) pode mandar, sem login. Lista fechada: nome fora dela é recusado. */
export const EVENTOS_DO_SITE = ["visita", "clicou_demonstracao", "clicou_criar_conta"] as const;
/** O que só o servidor grava, uma vez por escritório. */
export const EVENTOS_DO_SERVIDOR = ["cadastro_concluido", "oab_cadastrada", "primeira_publicacao", "primeiro_prazo_confirmado"] as const;
/** Quem foi embora: o escritório encerrou a conta e, 30 dias depois, os dados foram apagados. */
export const EVENTOS_DE_SAIDA = ["escritorio_encerrado", "escritorio_apagado"] as const;

export type EventoDoSite = (typeof EVENTOS_DO_SITE)[number];
export type NomeDeEvento = EventoDoSite | (typeof EVENTOS_DO_SERVIDOR)[number] | (typeof EVENTOS_DE_SAIDA)[number];

export const ehEventoDoSite = (nome: unknown): nome is EventoDoSite => typeof nome === "string" && (EVENTOS_DO_SITE as readonly string[]).includes(nome);

/** A escada, na ordem em que a pessoa avança; a demonstração é um ramo à parte. */
const ESCADA: { nome: NomeDeEvento; rotulo: string }[] = [
  { nome: "visita", rotulo: "Visitas ao site" },
  { nome: "clicou_criar_conta", rotulo: "Clicaram em criar conta" },
  { nome: "cadastro_concluido", rotulo: "Cadastros concluídos" },
  { nome: "oab_cadastrada", rotulo: "OAB cadastrada" },
  { nome: "primeira_publicacao", rotulo: "Primeira publicação" },
  { nome: "primeiro_prazo_confirmado", rotulo: "Primeiro prazo confirmado" },
];
const FORA_DA_ESCADA: { nome: NomeDeEvento; rotulo: string }[] = [
  { nome: "clicou_demonstracao", rotulo: "Clicaram na demonstração" },
  { nome: "escritorio_encerrado", rotulo: "Escritórios encerrados" },
];

export interface EtapaDoFunil {
  nome: NomeDeEvento;
  rotulo: string;
  total: number;
  /** A fração do passo anterior (0 a 1); nula na primeira etapa e depois de um passo sem nenhum evento. */
  doAnterior: number | null;
}

export function montarFunil(totais: Record<string, number>): EtapaDoFunil[] {
  return ESCADA.map((e, i) => {
    const total = totais[e.nome] ?? 0;
    const anterior = i === 0 ? null : (totais[ESCADA[i - 1]!.nome] ?? 0);
    return { ...e, total, doAnterior: anterior ? total / anterior : null };
  });
}

const DIAS_PADRAO = 30;
const MAX_DIAS = 366;

/**
 * O período do `bun run funil`: `--dias N` para trás a partir de hoje, ou `--de` e `--ate`
 * (os dois dias entram). Sem nada, os últimos 30 dias. Argumento errado lança com a frase que vai para a tela.
 */
export function periodoDoFunil(a: { dias?: string; de?: string; ate?: string }, hoje: Dia): { de: Dia; ate: Dia } {
  if (a.dias !== undefined && (a.de !== undefined || a.ate !== undefined)) throw new Error("Use --dias ou --de e --ate, não os dois.");
  if (a.dias !== undefined) {
    const dias = Number(a.dias);
    if (!/^\d+$/.test(a.dias) || dias < 1 || dias > MAX_DIAS) throw new Error(`--dias é um número de 1 a ${MAX_DIAS}.`);
    return { de: somarDias(hoje, 1 - dias), ate: hoje };
  }
  if (a.de !== undefined && !ehDia(a.de)) throw new Error("--de precisa ser um dia no formato AAAA-MM-DD.");
  if (a.ate !== undefined && !ehDia(a.ate)) throw new Error("--ate precisa ser um dia no formato AAAA-MM-DD.");
  const ate = a.ate ?? hoje;
  const de = a.de ?? somarDias(ate, 1 - DIAS_PADRAO);
  if (de > ate) throw new Error("--de vem depois de --ate.");
  return { de, ate };
}

const percentual = (fracao: number) => `${(fracao * 100).toFixed(1).replace(".", ",")}%`;
const linha = (rotulo: string, total: number) => `${rotulo.padEnd(25)}${String(total).padStart(10)}`;

/** O que o `bun run funil` imprime para o período (`de` e `ate` inclusive). */
export function textoDoFunil(de: Dia, ate: Dia, totais: Record<string, number>): string {
  const dias = diferencaEmDias(de, ate) + 1;
  return [
    `Funil de ${formatarDia(de)} a ${formatarDia(ate)} (${dias} ${dias === 1 ? "dia" : "dias"})`,
    "",
    ...montarFunil(totais).map((e) => `${linha(e.rotulo, e.total)}${e.doAnterior === null ? "" : `   ${percentual(e.doAnterior)} do passo anterior`}`),
    "",
    ...FORA_DA_ESCADA.map((e) => linha(e.rotulo, totais[e.nome] ?? 0)),
    "",
    "Cada número conta os eventos do período, não as pessoas: quem criou a conta hoje pode ter visitado o site semana passada. Os passos do site não têm identificador de ninguém.",
  ].join("\n");
}
