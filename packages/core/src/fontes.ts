/**
 * De onde saiu cada afirmação da IA. O resumo, o briefing e o chat terminam
 * cada fato com a fonte entre parênteses, "(evento 87, fl. 3)", e a tela vira
 * isso num toque que abre o documento na folha. A folha é a marca "[fl. N]"
 * que a leitura do PDF põe no começo de cada página.
 */

export interface FonteCitada {
  /** Como está escrito, sem os parênteses: "evento 87, fl. 3". */
  trecho: string;
  /** Posição do trecho no texto. */
  inicio: number;
  evento: number | null;
  folha: number | null;
  /** Nome do documento, quando a citação é pelo nome ("documento "Procuração""). */
  documento: string | null;
}

/** A marca da página no texto lido de um PDF: "[fl. 3]". */
export const MARCA_DA_FOLHA = (n: number) => `[fl. ${n}]`;

const FOLHA = String.raw`(?:,\s*(?:fls?|folhas?)\.?\s*(\d+)(?:\s*(?:-|a|e)\s*\d+)?)?`;
const POR_EVENTO = new RegExp(String.raw`\(\s*(evento\s+(\d+)${FOLHA})\s*\)`, "giu");
const POR_NOME = new RegExp(String.raw`\(\s*(documento\s+["“]([^"”]{1,120})["”]${FOLHA})\s*\)`, "giu");

export function extrairFontes(texto: string): FonteCitada[] {
  const fontes: FonteCitada[] = [];
  for (const m of texto.matchAll(POR_EVENTO)) {
    fontes.push({ trecho: m[1]!, inicio: m.index! + m[0].indexOf(m[1]!), evento: Number(m[2]), folha: m[3] ? Number(m[3]) : null, documento: null });
  }
  for (const m of texto.matchAll(POR_NOME)) {
    fontes.push({ trecho: m[1]!, inicio: m.index! + m[0].indexOf(m[1]!), evento: null, folha: m[3] ? Number(m[3]) : null, documento: m[2]!.trim() });
  }
  return fontes.sort((a, b) => a.inicio - b.inicio);
}

export interface DocumentoComFolhas {
  id: string;
  nome: string;
  evento: number | null;
  paginas: number | null;
}

const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

/** O documento que a fonte aponta e a página a abrir; `null` quando nenhum documento do processo casa. */
export function documentoDaFonte(f: FonteCitada, docs: readonly DocumentoComFolhas[]): { id: string; pagina: number | null } | null {
  const candidatos = f.evento != null ? docs.filter((d) => d.evento === f.evento) : f.documento ? docs.filter((d) => igual(d.nome, f.documento!)) : [];
  if (!candidatos.length) return null;
  const naFolha = f.folha != null ? candidatos.find((d) => d.paginas == null || d.paginas >= f.folha!) : undefined;
  const d = naFolha ?? candidatos[0]!;
  const pagina = f.folha != null && naFolha && (d.paginas == null || d.paginas >= f.folha) ? f.folha : null;
  return { id: d.id, pagina };
}
