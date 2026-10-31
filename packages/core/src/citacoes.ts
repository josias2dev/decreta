/**
 * As citações de uma peça (súmulas, temas, precedentes, artigos de lei e
 * números de processo), achadas no texto para conferir no acervo. Achar não é
 * conferir: a chave diz o que procurar, não se existe.
 */

import { lerCnj } from "./cnj.ts";

export type TipoDeCitacao = "sumula" | "sumula_vinculante" | "tema" | "dispositivo" | "precedente" | "processo" | "oj";

export interface Citacao {
  tipo: TipoDeCitacao;
  /** A forma única de procurar no acervo: "sumula:STJ:297". */
  chave: string;
  /** Como está escrito na peça. */
  trecho: string;
  /** Posição do trecho no texto. */
  inicio: number;
}

/** "nº", "n.", "n°", "no": o que vem antes do número, quando vem. */
const NUMERO = String.raw`(?:n[º°o]?\.?\s*)?(\d[\d.]*)`;
const TRIBUNAL = String.raw`(STF|STJ|TST|TSE|STM|TJ[A-Z]{2,3}|TRT-?\d{1,2}|TRF-?\d)`;

const SUMULA = new RegExp(String.raw`s[úu]mula(\s+vinculante)?\s+${NUMERO}(?:\s*(?:do|da|\/)\s*${TRIBUNAL})?`, "giu");

/** "Tema 1.031 do STJ", "Tema Repetitivo nº 952/STJ" e "Tema 69 da Repercussão Geral" (do STF). */
const TEMA = new RegExp(String.raw`tema\s+(?:repetitivo\s+)?${NUMERO}\s*(?:(?:do|\/)\s*(STJ|STF)|da\s+repercuss[ãa]o\s+geral)`, "giu");

/**
 * "REsp 1.737.412/SE", "AgInt no AREsp nº 1.234.567/SC", "ADI 3.159". Sem a bandeira "i": "re" e "ms" minúsculos são palavras.
 * O recurso interno ("AgInt no") entra na mesma leitura, para o AREsp de dentro não virar outra citação.
 */
const PRECEDENTE =
  /\b((?:(?:AgInt|AgRg|EDcl|EDv|EAREsp|EREsp)\s+no\s+)?(?:AREsp|EREsp|REsp|ARE|RE|ADI|ADC|ADO|ADPF|RHC|HC|RMS|MS|CC|Rcl|AI))\s*(?:n[º°o]?\.?\s*)?(\d{1,3}(?:\.\d{3})+|\d+)(?:\s*\/\s*([A-Z]{2})\b)?/gu;

const CNJ = /\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/gu;

/** "OJ 394 da SBDI-1", "Orientação Jurisprudencial nº 142 da SDI-2" (TST). */
const OJ = /\b(?:OJ|orienta[çc][ãa]o\s+jurisprudencial)\s+(?:n[º°o]?\.?\s*)?(\d+)\s+da\s+S(?:B)?DI-?([12])\b/giu;

/** O nome ou a sigla da norma, e a sigla na chave. "CPC" antes de "CPP" antes de "CP"; "Lei nº 12.527/2011" fica para o fim. */
const NORMAS: readonly [string, string][] = [
  [String.raw`constitui[çc][ãa]o(?:\s+federal|\s+da\s+rep[úu]blica)?|CF(?:\/88)?|CRFB(?:\/88)?`, "CF"],
  [String.raw`c[óo]digo\s+de\s+processo\s+civil|CPC(?:\/2015|\/15)?`, "CPC"],
  [String.raw`c[óo]digo\s+de\s+processo\s+penal|CPP`, "CPP"],
  [String.raw`c[óo]digo\s+civil|CC(?:\/2002|\/02)?|CCB`, "CC"],
  [String.raw`c[óo]digo\s+de\s+defesa\s+do\s+consumidor|CDC`, "CDC"],
  [String.raw`c[óo]digo\s+tribut[áa]rio\s+nacional|CTN`, "CTN"],
  [String.raw`c[óo]digo\s+penal|CP`, "CP"],
  [String.raw`consolida[çc][ãa]o\s+das\s+leis\s+do\s+trabalho|CLT`, "CLT"],
  [String.raw`LINDB|lei\s+de\s+introdu[çc][ãa]o\s+[àa]s\s+normas\s+do\s+direito\s+brasileiro`, "LINDB"],
];
const NORMA = String.raw`(${NORMAS.map(([re]) => `(?:${re})`).join("|")}|lei\s+(?:complementar\s+)?(?:n[º°o]?\.?\s*)?(\d[\d.]*)\s*\/\s*(\d{2,4}))(?![\p{L}\d])`;

/**
 * "art. 927, parágrafo único, do Código Civil", "art. 8º, § 3º, III, da Lei nº 12.527/2011".
 * Sem a norma ao lado não entra: "o art. 5º" sozinho não diz de qual lei.
 */
const DISPOSITIVO = new RegExp(
  String.raw`\bart(?:igo)?\.?\s*(\d[\d.]*)\s*(?:º|°|o\b)?(?:-([A-Z]))?` +
    String.raw`(?:\s*,\s*(?:§\s*(\d+)\s*º?|par[áa]grafo\s+([úu]nico|\d+)\s*º?))?` +
    String.raw`(?:\s*,\s*(?:inc(?:iso)?\.?\s*)?([IVXLC]+)\b)?` +
    String.raw`\s*,?\s*d[oa]\s+${NORMA}`,
  "giu",
);

const ROMANOS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };
const arabico = (romano: string) =>
  [...romano.toUpperCase()].reduce((total, c, i, letras) => {
    const valor = ROMANOS[c]!;
    return total + (valor < (ROMANOS[letras[i + 1] ?? ""] ?? 0) ? -valor : valor);
  }, 0);

function siglaDaNorma(nome: string, numero?: string, ano?: string): string {
  if (numero && ano) return `LEI-${semPontos(numero)}-${ano.length === 2 ? (Number(ano) > 30 ? "19" : "20") + ano : ano}`;
  return NORMAS.find(([re]) => new RegExp(`^(?:${re})$`, "iu").test(nome))![1];
}

const semPontos = (n: string) => String(Number(n.replace(/\./g, "")));
const tribunal = (t: string) => t.toUpperCase().replace("-", "");

export function extrairCitacoes(texto: string): Citacao[] {
  const saida: Citacao[] = [];
  for (const m of texto.matchAll(SUMULA)) {
    const vinculante = !!m[1];
    const trib = m[3] ? tribunal(m[3]) : vinculante ? "STF" : null;
    if (!trib) continue;
    const tipo = vinculante ? "sumula_vinculante" : "sumula";
    saida.push({ tipo, chave: `${tipo}:${trib}:${semPontos(m[2]!)}`, trecho: m[0], inicio: m.index! });
  }
  for (const m of texto.matchAll(TEMA)) {
    const trib = m[2] ? m[2].toUpperCase() : "STF";
    saida.push({ tipo: "tema", chave: `tema:${trib}:${semPontos(m[1]!)}`, trecho: m[0], inicio: m.index! });
  }
  for (const m of texto.matchAll(DISPOSITIVO)) {
    const [, art, letra, par, parNome, inc, norma, numero, ano] = m;
    // Como no LexML: "art927_par1u" (parágrafo único), "art8_par3_inc3" (inciso em arábico).
    const paragrafo = par ?? (parNome && /nico$/i.test(parNome) ? "1u" : parNome);
    const dispositivo = `art${semPontos(art!)}${letra ? `-${letra.toUpperCase()}` : ""}${paragrafo ? `_par${paragrafo}` : ""}${inc ? `_inc${arabico(inc)}` : ""}`;
    saida.push({ tipo: "dispositivo", chave: `dispositivo:${siglaDaNorma(norma!.trim(), numero, ano)}:${dispositivo}`, trecho: m[0], inicio: m.index! });
  }
  for (const m of texto.matchAll(PRECEDENTE)) {
    const classe = m[1]!.replace(/\s+/g, " ");
    saida.push({ tipo: "precedente", chave: `precedente:${classe}:${semPontos(m[2]!)}`, trecho: m[0], inicio: m.index! });
  }
  for (const m of texto.matchAll(CNJ)) {
    // Dígito verificador errado é número digitado errado: não há processo a conferir.
    const cnj = lerCnj(m[0]);
    if (cnj) saida.push({ tipo: "processo", chave: `processo:${cnj.digitos}`, trecho: m[0], inicio: m.index! });
  }
  for (const m of texto.matchAll(OJ)) {
    saida.push({ tipo: "oj", chave: `oj:SBDI-${m[2]}:${Number(m[1])}`, trecho: m[0], inicio: m.index! });
  }
  return saida.sort((a, b) => a.inicio - b.inicio);
}
