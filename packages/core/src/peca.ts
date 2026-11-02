/**
 * O texto da peça, em Markdown simples, como a IA escreve, a tela mostra e o
 * DOCX imprime (@decreta/documentos):
 *   "# "  endereçamento;  "## " título de seção;  "### " subtítulo
 *   "- "  item de lista;  "1. " item numerado
 *   **negrito**, *itálico* e as marcas em amarelo para revisar: [COMPLETAR: ...],
 *   [A COMPROVAR: ...], [JURISPRUDÊNCIA: ...] e o campo em branco, como [CPF]
 */

export type Trecho = { texto: string; negrito?: boolean; italico?: boolean; marcar?: boolean };

/** Palavras que, no começo do colchete, dizem que ele é um campo por preencher ("[nome da empresa]", "[cidade]"). */
const CAMPOS = /^(?:nome|cidade|data|valor|n[úu]mero|endere[çc]o|cpf|cnpj|rg|oab|vara|comarca|autora?|r[ée]u?|advogad[oa]|representante|cep|profiss[ãa]o|estado civil|nacionalidade|qualifica[çc][ãa]o|local|assinatura|dia|m[êe]s|ano|processo|inserir|preencher|digite|informar|incluir|completar)\b/iu;
/** Colchete que é do texto, não um campo: a supressão em citação, o sic, a referência e o grifo. */
const COLCHETE_COMUM = /^(?:\.{3}|…|sic|fls?\.?\s*\d*|evento\s+\d+|grifo.*|destaque.*|negrito.*|\^?\d+)$/iu;

/** O conteúdo do colchete é um campo em branco: vazio, em maiúsculas ou com o nome de um campo. */
export function ehCampoEmBranco(conteudo: string): boolean {
  const c = conteudo.trim();
  if (!c) return true;
  if (COLCHETE_COMUM.test(c)) return false;
  return CAMPOS.test(c) || /^[\p{Lu}\s_./-]{2,}$/u.test(c);
}

/** **negrito**, *itálico*, as marcas de revisão e os campos em branco em trechos. */
export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]\n]{0,300}\])/g;
  let fim = 0;
  for (const m of linha.matchAll(re)) {
    const t = m[0];
    const colchete = t.startsWith("[");
    // Colchete comum fica no texto em volta, sem virar trecho à parte.
    if (colchete && !/^\[(?:COMPLETAR|A COMPROVAR|JURISPRUD[ÊE]NCIA)/.test(t) && !ehCampoEmBranco(t.slice(1, -1))) continue;
    if (m.index! > fim) saida.push({ texto: linha.slice(fim, m.index) });
    if (t.startsWith("**")) saida.push({ texto: t.slice(2, -2), negrito: true });
    else if (t.startsWith("*")) saida.push({ texto: t.slice(1, -1), italico: true });
    else saida.push({ texto: t, marcar: true, negrito: true });
    fim = m.index! + t.length;
  }
  if (fim < linha.length) saida.push({ texto: linha.slice(fim) });
  return saida.filter((t) => t.texto.length > 0);
}

/** Quantos [COMPLETAR: ...], [A COMPROVAR: ...], [JURISPRUDÊNCIA: ...] e campos em branco ainda faltam no texto. */
export function lacunas(texto: string): number {
  return texto.split("\n").reduce((n, linha) => n + trechos(linha).filter((t) => t.marcar).length, 0);
}

/** Cada marca [JURISPRUDÊNCIA: tese] do texto: é o que a busca no acervo preenche. */
export function marcasDeJurisprudencia(texto: string): { tese: string; inicio: number; fim: number }[] {
  return [...texto.matchAll(/\[JURISPRUD[ÊE]NCIA\s*:?\s*([^\]\n]*)\]/g)].map((m) => ({ tese: m[1]!.trim(), inicio: m.index!, fim: m.index! + m[0].length }));
}

/** A etiqueta vazada de outro sistema, fechada ou cortada, como `<mention id="1">`. */
export const ETIQUETA_INTERNA = /<\/?[a-zA-Z][\w:-]*(?:\s[^<>\n]*)?\/?>|<\/?(?:mention|cite|citation|source|ref)\b[^<>\n]{0,120}/g;
/** O aviso que a tela põe quando a geração cai no meio. */
export const AVISO_DE_QUEDA = /\[A geração parou no meio[^\]]*\]/g;

/**
 * O texto que sai no DOCX: o que falta comprovar vira [COMPLETAR: ...], e as
 * marcas internas somem. A referência a um arquivo do escritório sem evento
 * nos autos ("documento "x.pdf"") não diz nada a quem lê a peça, e sai também;
 * "(evento 87, fl. 3)" é referência aos autos e fica.
 */
export function limparParaDocx(texto: string): string {
  return texto
    .replace(/\[A COMPROVAR\s*:?\s*([^\]]*)\]/g, (_, falta: string) => `[COMPLETAR: ${falta.trim() || "fato a comprovar"}]`)
    .replace(ETIQUETA_INTERNA, "")
    .replace(AVISO_DE_QUEDA, "")
    .replace(/\s*\(\s*documento\s+["“][^"”\n]{1,120}["”](?:,\s*(?:fls?|folhas?)\.?\s*\d+(?:\s*(?:-|a|e)\s*\d+)?)?\s*\)/giu, "");
}

export type Bloco =
  | { tipo: "enderecamento" | "secao" | "subtitulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "item"; texto: string; numerado: boolean };

/** O bloco e onde ele está no texto: é o que leva um aviso até o parágrafo certo. */
export type BlocoNoTexto = Bloco & { inicio: number; fim: number };

export function blocosComPosicao(markdown: string): BlocoNoTexto[] {
  const saida: BlocoNoTexto[] = [];
  let paragrafo: string[] = [];
  let inicio = 0;
  let fim = 0;
  const fechar = () => {
    if (paragrafo.length) saida.push({ tipo: "paragrafo", texto: paragrafo.join(" ").trim(), inicio, fim });
    paragrafo = [];
  };
  let posicao = 0;
  for (const bruta of markdown.split("\n")) {
    const comeco = posicao;
    posicao += bruta.length + 1;
    const linha = bruta.trim();
    const ate = comeco + bruta.trimEnd().length;
    if (!linha) {
      fechar();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
    if (titulo) {
      fechar();
      const nivel = titulo[1]!.length;
      saida.push({ tipo: nivel === 1 ? "enderecamento" : nivel === 2 ? "secao" : "subtitulo", texto: titulo[2]!.trim(), inicio: comeco, fim: ate });
      continue;
    }
    const item = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(linha);
    if (item) {
      fechar();
      saida.push({ tipo: "item", texto: item[2]!.trim(), numerado: item[1] !== undefined, inicio: comeco, fim: ate });
      continue;
    }
    if (!paragrafo.length) inicio = comeco;
    paragrafo.push(linha);
    fim = ate;
  }
  fechar();
  return saida;
}

export function blocos(markdown: string): Bloco[] {
  return blocosComPosicao(markdown).map(({ inicio: _i, fim: _f, ...b }) => b);
}
