/**
 * A trava da resposta do WhatsApp: "precisão absurda" como propriedade do código, e não como pedido nas
 * instruções. Depois que a IA escreve, toda data, número de processo, quantidade de dias e valor em reais
 * da resposta precisa estar numa das fontes do turno: o que as ferramentas devolveram, o histórico da
 * conversa, as instruções de "Agora" (a data de hoje, o calendário) e o que a pessoa escreveu.
 *
 * As fontes chegam como texto (o JSON das ferramentas, inclusive): datas em 2026-12-03, instantes em
 * UTC, 03/12/2026, "3 de dezembro"; valores em centavos, em reais ou "R$ 1.234,56"; dias como
 * `"dias":15` ou "15 (quinze) dias". Hora, contagem de itens e ano solto ficam de fora.
 */
import { hojeEm } from "@decreta/core";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

const DATA_NUMERICA = /\b(\d{1,2})\/(\d{1,2})(?:\/(?:\d{4}|\d{2}))?\b/g;
const DATA_POR_EXTENSO = new RegExp(`\\b(\\d{1,2})º? de (${MESES.join("|")})\\b`, "gi");
const DATA_ISO = /\b(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2}))?/g;
const CNJ = /\b\d{7}-?\d{2}\.?\d{4}\.?\d\.?\d{2}\.?\d{4}\b/g;
const DIAS = /\b(\d{1,3})\s*(?:\([^)]{1,30}\)\s*)?dias?\b/gi;
const DIAS_NO_JSON = /"dias"\s*:\s*(\d+)/g;
const REAIS = /R\$\s?(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})?)/g;
const CENTAVOS_NO_JSON = /"[A-Za-z]*[Cc]entavos"\s*:\s*(\d+)/g;
const REAIS_NO_JSON = /"(?:valor[A-Za-z]*|[a-z]+Valor|total)"\s*:\s*(\d+(?:\.\d+)?)/g;

const diaMes = (d: string | number, m: string | number) => `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
const valida = (d: number, m: number) => d >= 1 && d <= 31 && m >= 1 && m <= 12;
const centavosDeReais = (s: string) => Math.round(Number(s.replace(/\./g, "").replace(",", ".")) * 100);

/** Cada coisa conferível de um texto: a chave normalizada e como apareceu. */
interface Achado {
  chave: string;
  como: string;
}

function datasDe(texto: string): Achado[] {
  const r: Achado[] = [];
  for (const m of texto.matchAll(DATA_NUMERICA)) if (valida(Number(m[1]), Number(m[2]))) r.push({ chave: `data:${diaMes(m[1]!, m[2]!)}`, como: m[0] });
  for (const m of texto.matchAll(DATA_POR_EXTENSO)) r.push({ chave: `data:${diaMes(m[1]!, MESES.indexOf(m[2]!.toLowerCase()) + 1)}`, como: m[0] });
  return r;
}

function cnjsDe(texto: string): Achado[] {
  return [...texto.matchAll(CNJ)].map((m) => ({ chave: `cnj:${m[0].replace(/\D/g, "")}`, como: m[0] }));
}

function diasDe(texto: string): Achado[] {
  return [...texto.matchAll(DIAS)].map((m) => ({ chave: `dias:${Number(m[1])}`, como: `${Number(m[1])} dias` }));
}

function valoresDe(texto: string): Achado[] {
  return [...texto.matchAll(REAIS)].map((m) => ({ chave: `centavos:${centavosDeReais(m[1]!)}`, como: m[0] }));
}

/** Tudo o que as fontes sustentam, como chaves. */
function sustentado(fontes: string[], timezone: string): Set<string> {
  const chaves = new Set<string>();
  for (const f of fontes) {
    for (const a of [...datasDe(f), ...cnjsDe(f), ...diasDe(f), ...valoresDe(f)]) chaves.add(a.chave);
    for (const m of f.matchAll(DATA_ISO)) {
      chaves.add(`data:${diaMes(m[3]!, m[2]!)}`);
      // O instante vale pelo dia no fuso do escritório (02h30 em UTC é 23h30 da véspera em Brasília).
      if (m[4]) {
        const local = hojeEm(timezone, new Date(m[0]));
        chaves.add(`data:${diaMes(local.slice(8, 10), local.slice(5, 7))}`);
      }
    }
    for (const m of f.matchAll(/\b\d{20}\b/g)) chaves.add(`cnj:${m[0]}`);
    for (const m of f.matchAll(DIAS_NO_JSON)) chaves.add(`dias:${Number(m[1])}`);
    for (const m of f.matchAll(CENTAVOS_NO_JSON)) chaves.add(`centavos:${Number(m[1])}`);
    for (const m of f.matchAll(REAIS_NO_JSON)) chaves.add(`centavos:${Math.round(Number(m[1]) * 100)}`);
  }
  return chaves;
}

/** O que a resposta afirma e nenhuma fonte sustenta, como apareceu na resposta, sem repetir. */
export function naoConferem(resposta: string, fontes: string[], timezone: string): string[] {
  const chaves = sustentado(fontes, timezone);
  const achados = [...datasDe(resposta), ...cnjsDe(resposta), ...diasDe(resposta), ...valoresDe(resposta)].sort((a, b) => resposta.indexOf(a.como) - resposta.indexOf(b.como));
  const vistos = new Set<string>();
  const r: string[] = [];
  for (const a of achados) {
    if (chaves.has(a.chave) || vistos.has(a.chave)) continue;
    vistos.add(a.chave);
    r.push(a.como);
  }
  return r;
}
