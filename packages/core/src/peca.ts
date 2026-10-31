/**
 * O texto da peça, em Markdown simples, como a IA escreve, a tela mostra e o
 * DOCX imprime (@decreta/documentos):
 *   "# "  endereçamento;  "## " título de seção;  "### " subtítulo
 *   "- "  item de lista;  "1. " item numerado
 *   **negrito**, *itálico* e [COMPLETAR: ...] (marcado em amarelo para revisar)
 */

export type Trecho = { texto: string; negrito?: boolean; italico?: boolean; marcar?: boolean };

/** **negrito**, *itálico* e [COMPLETAR: ...] / [JURISPRUDÊNCIA: ...] em trechos. */
export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[(?:COMPLETAR|JURISPRUD[ÊE]NCIA)[^\]]*\])/g;
  let fim = 0;
  for (const m of linha.matchAll(re)) {
    if (m.index! > fim) saida.push({ texto: linha.slice(fim, m.index) });
    const t = m[0];
    if (t.startsWith("**")) saida.push({ texto: t.slice(2, -2), negrito: true });
    else if (t.startsWith("*")) saida.push({ texto: t.slice(1, -1), italico: true });
    else saida.push({ texto: t, marcar: true, negrito: true });
    fim = m.index! + t.length;
  }
  if (fim < linha.length) saida.push({ texto: linha.slice(fim) });
  return saida.filter((t) => t.texto.length > 0);
}

/** Quantos [COMPLETAR: ...] e [JURISPRUDÊNCIA: ...] ainda faltam no texto. */
export function lacunas(texto: string): number {
  return texto.split("\n").reduce((n, linha) => n + trechos(linha).filter((t) => t.marcar).length, 0);
}

export type Bloco =
  | { tipo: "enderecamento" | "secao" | "subtitulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "item"; texto: string; numerado: boolean };

export function blocos(markdown: string): Bloco[] {
  const saida: Bloco[] = [];
  let paragrafo: string[] = [];
  const fechar = () => {
    if (paragrafo.length) saida.push({ tipo: "paragrafo", texto: paragrafo.join(" ").trim() });
    paragrafo = [];
  };
  for (const bruta of markdown.replace(/\r/g, "").split("\n")) {
    const linha = bruta.trim();
    if (!linha) {
      fechar();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
    if (titulo) {
      fechar();
      const nivel = titulo[1]!.length;
      saida.push({ tipo: nivel === 1 ? "enderecamento" : nivel === 2 ? "secao" : "subtitulo", texto: titulo[2]!.trim() });
      continue;
    }
    const item = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(linha);
    if (item) {
      fechar();
      saida.push({ tipo: "item", texto: item[2]!.trim(), numerado: item[1] !== undefined });
      continue;
    }
    paragrafo.push(linha);
  }
  fechar();
  return saida;
}
