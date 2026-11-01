/**
 * O acervo no Perguntar (modo Jurisprudência): a busca por texto nos temas e
 * súmulas guardados e a conferência de cada citação que a IA aponta. A IA dá a
 * chave e o trecho; o rótulo, a situação e a fonte vêm do banco. Tudo local:
 * nenhuma fonte externa é chamada daqui, nem na demonstração.
 */
import { extrairCitacoes } from "@decreta/core";
import { acervoDocumentos, type Database } from "@decreta/db";
import type { CitacaoNoAcervo, DocumentoDoAcervoNaIa, FiltroDeJurisprudencia, Lista } from "@decreta/ia";
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { fonteDo, seloDoDocumento, verificarCitacoes, type CitacaoVerificada, type DepsDoAcervo } from "./acervo.ts";
import { consultaDeTexto } from "./modelos.ts";
import { rotuloDoPrecedente } from "./radar.ts";

/** Quantos documentos a busca devolve sem a IA pedir. */
const LIMITE = 8;

/** O que a busca lê de cada documento: a tese e a questão julgada. É a mesma expressão do índice `acervo_documentos_busca_idx`. */
export const vetorDoAcervo = sql`to_tsvector('portuguese', coalesce(${acervoDocumentos.texto}, '') || ' ' || coalesce(${acervoDocumentos.questao}, ''))`;

/** Os temas e súmulas que mais têm as palavras da busca (qualquer uma conta; as que têm mais vêm antes). Os cancelados vão para o fim. */
export async function buscarNoAcervo(db: Database, f: FiltroDeJurisprudencia): Promise<Lista<DocumentoDoAcervoNaIa>> {
  const q = consultaDeTexto(f.busca);
  if (!q) return { total: 0, itens: [] };
  const consulta = sql`to_tsquery('portuguese', ${q})`;
  const linhas = await db
    .select({ d: acervoDocumentos, total: sql<number>`count(*) over ()::int` })
    .from(acervoDocumentos)
    .where(and(sql`${vetorDoAcervo} @@ ${consulta}`, f.tribunal ? like(acervoDocumentos.chave, `%:${f.tribunal}:%`) : undefined))
    .orderBy(asc(acervoDocumentos.cancelado), desc(sql`ts_rank(${vetorDoAcervo}, ${consulta})`), asc(acervoDocumentos.chave))
    .limit(f.limite ?? LIMITE);
  return { total: linhas[0]?.total ?? 0, itens: linhas.map(({ d }) => documentoNaIa(d)) };
}

/**
 * Iguala o que não muda o sentido: maiúsculas, espaços e quebras de linha,
 * aspas curvas e retas, travessões e a palavra partida no fim da linha.
 */
export function normalizarTrecho(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[“”«»„]/g, '"')
    .replace(/[‘’‚]/g, "'")
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, "$1$2")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

/** O trecho está, letra por letra (depois de normalizar), no texto guardado. Aspas e reticências nas pontas não contam. */
function ehLiteral(texto: string, trecho: string): boolean {
  const t = normalizarTrecho(trecho).replace(/^["'\s.…]+|["'\s.…]+$/g, "");
  return t.length > 0 && normalizarTrecho(texto).includes(t);
}

/**
 * A conferência sem IA de uma citação: o documento existe no acervo, o trecho
 * está no texto guardado e a súmula ou o tema continua valendo. Se o trecho
 * sustenta a afirmação, quem confere é o segundo passo de IA, depois desta.
 */
export async function conferirCitacaoNoAcervo(db: Database, p: { chave: string; trecho: string }): Promise<CitacaoNoAcervo> {
  const rotulo = rotuloDoPrecedente(p.chave);
  const [d] = await db.select().from(acervoDocumentos).where(eq(acervoDocumentos.chave, p.chave));
  if (!d) return { chave: p.chave, rotulo, trecho: p.trecho, literal: null, selo: "nao_verificada", motivo: FORA_DO_ACERVO, texto: null, fonte: null };
  const base = seloDoDocumento(rotulo, d);
  const literal = ehLiteral(d.texto ?? "", p.trecho);
  const ressalvas = literal ? [] : [NAO_LITERAL];
  return {
    chave: d.chave,
    rotulo,
    trecho: p.trecho,
    literal,
    selo: base.selo === "verificada" && ressalvas.length ? "com_ressalva" : base.selo,
    motivo: [base.motivo, ...ressalvas].join(" "),
    texto: d.texto,
    fonte: fonteDo(d),
  };
}

/**
 * Nenhuma citação sem selo: súmula, tema, artigo de lei ou processo que a IA
 * escreveu no texto por conta própria (fora de citar) é conferido só no acervo
 * guardado. Se a conferência falhar, cada uma sai como não verificada.
 */
export async function citacoesDoTexto(deps: DepsDoAcervo, organizationId: string, texto: string, jaCitadas: ReadonlySet<string>): Promise<CitacaoVerificada[]> {
  try {
    return (await verificarCitacoes(deps, organizationId, texto, { soAcervo: true })).filter((c) => !jaCitadas.has(c.chave));
  } catch (err) {
    deps.log?.("as citações da resposta não foram conferidas", { error: err instanceof Error ? err.message : String(err) });
    return extrairCitacoes(texto)
      .filter((c) => !jaCitadas.has(c.chave))
      .map((c) => ({ chave: c.chave, trecho: c.trecho, inicio: c.inicio, selo: "nao_verificada" as const, motivo: "Não deu para conferir agora. Confira na fonte antes de usar.", texto: null, fonte: null }));
  }
}

const FORA_DO_ACERVO = "Não está no acervo do Decreta. Confira na fonte antes de usar.";
const NAO_LITERAL = "O trecho citado não está no texto guardado: compare com a tese ao lado.";

function documentoNaIa(d: typeof acervoDocumentos.$inferSelect): DocumentoDoAcervoNaIa {
  return { chave: d.chave, rotulo: rotuloDoPrecedente(d.chave), situacao: d.situacao, cancelado: d.cancelado, texto: d.texto, questao: d.questao, fonte: fonteDo(d) };
}
