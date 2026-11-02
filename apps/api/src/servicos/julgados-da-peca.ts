/**
 * O julgado do acervo dentro da peça. Para a marca [JURISPRUDÊNCIA: tese], busca
 * os candidatos e diz o papel de cada um; a pessoa escolhe; o servidor monta a
 * citação a partir do banco, nunca o modelo. A frase que o julgado sustenta passa
 * pela conferência de força. Sem resultado, a marca continua, com a explicação.
 */
import { forcaSemBase, fraseAntesDaMarca } from "@decreta/core";
import { acervoDocumentos, type Database, type JulgadoDaPeca } from "@decreta/db";
import { citarNoAcervo, papelDosJulgados, type Ia, type PapelDoJulgado } from "@decreta/ia";
import { sql } from "drizzle-orm";
import { seloDoDocumento } from "./acervo.ts";
import { buscarNoAcervo, conferirCitacaoNoAcervo, ehLiteral } from "./jurisprudencia.ts";

/** Quantos candidatos por tese: o bastante para ver os dois lados, sem virar pesquisa. */
const CANDIDATOS = 8;

const NOMES: Record<string, [string, string]> = {
  sumula: ["súmula", "súmulas"],
  sumula_vinculante: ["súmula vinculante", "súmulas vinculantes"],
  tema: ["tema", "temas"],
};
const ORDEM_DOS_TIPOS = ["sumula", "sumula_vinculante", "tema"];

export interface CoberturaDoAcervo {
  /** "STJ: 2 súmulas e 1 tema" */
  tem: string[];
  naoCobre: string[];
}

/** O que o acervo tem e o que não tem: a pessoa precisa saber onde a busca não chega. */
export async function coberturaDoAcervo(db: Database, tribunalDoProcesso: string | null): Promise<CoberturaDoAcervo> {
  const linhas = await db
    .select({ tipo: sql<string>`split_part(${acervoDocumentos.chave}, ':', 1)`, tribunal: sql<string>`split_part(${acervoDocumentos.chave}, ':', 2)`, n: sql<number>`count(*)::int` })
    .from(acervoDocumentos)
    .groupBy(sql`1`, sql`2`);
  const porTribunal = new Map<string, { tipo: string; n: number }[]>();
  for (const l of linhas) porTribunal.set(l.tribunal, [...(porTribunal.get(l.tribunal) ?? []), { tipo: l.tipo, n: l.n }]);
  const posicao = (t: string) => {
    const i = ORDEM_DOS_TIPOS.indexOf(t);
    return i < 0 ? ORDEM_DOS_TIPOS.length : i;
  };
  const tem = [...porTribunal.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tribunal, tipos]) => {
      const partes = [...tipos].sort((a, b) => posicao(a.tipo) - posicao(b.tipo)).map(({ tipo, n }) => `${n} ${(NOMES[tipo] ?? ["precedente", "precedentes"])[n === 1 ? 0 : 1]}`);
      return `${tribunal}: ${partes.length > 1 ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}` : partes[0]}`;
    });
  const naoCobre = [
    tribunalDoProcesso && !porTribunal.has(tribunalDoProcesso) ? `Nada do ${tribunalDoProcesso}, o tribunal deste processo.` : null,
    "Acórdãos com número de processo, de qualquer tribunal.",
    porTribunal.has("TST") ? null : "Súmulas e OJs do TST.",
    "Os TJs, TRFs e TRTs que não aparecem na lista.",
  ].filter((x): x is string => !!x);
  return { tem, naoCobre };
}

export interface CandidatoDaTese {
  chave: string;
  rotulo: string;
  tribunal: string;
  selo: "verificada" | "com_ressalva" | "nao_verificada";
  motivo: string;
  situacao: string;
  /** O trecho que mostra o papel do julgado, do texto guardado. */
  trecho: string;
  texto: string | null;
  questao: string | null;
  /** Nulo sem a leitura da IA: sem inventar lado. */
  papel: PapelDoJulgado | null;
  porque: string | null;
  fonte: { nome: string; url: string; capturadoEm: string };
}

export interface BuscaDaTese {
  tese: string;
  itens: CandidatoDaTese[];
  /** Quantos apontam para cada lado. */
  lados: { aFavor: number; contra: number; tangenciam: number };
  /** A IA não leu os candidatos: aparecem sem papel. */
  semLeitura: boolean;
  cobertura: CoberturaDoAcervo;
  /** Quando não há resultado: por quê, e o que acontece com a marca. */
  explicacao: string | null;
}

const ORDEM_DO_PAPEL: Record<PapelDoJulgado, number> = { enfrenta: 0, contraponto: 1, tangencia: 2 };

export async function buscarJulgados(deps: { db: Database; ia: Ia | null; log: (msg: string, extra?: Record<string, unknown>) => void }, a: { tese: string; tribunalDoProcesso: string | null; podeLer: boolean }, signal?: AbortSignal): Promise<BuscaDaTese> {
  const [{ itens }, cobertura] = await Promise.all([buscarNoAcervo(deps.db, { busca: a.tese, limite: CANDIDATOS }), coberturaDoAcervo(deps.db, a.tribunalDoProcesso)]);
  const lidos = new Map<string, { papel: PapelDoJulgado; porque: string; trecho: string }>();
  let semLeitura = !a.podeLer || !deps.ia;
  if (!semLeitura && itens.length) {
    try {
      for (const l of await papelDosJulgados(deps.ia!, { tese: a.tese, candidatos: itens }, signal)) lidos.set(l.chave, l);
    } catch (err) {
      semLeitura = true;
      deps.log("a leitura dos julgados falhou", { error: err instanceof Error ? err.message : String(err) });
    }
  }
  const candidatos = itens.map((d): CandidatoDaTese => {
    const lido = lidos.get(d.chave);
    return {
      chave: d.chave,
      rotulo: d.rotulo,
      tribunal: d.chave.split(":")[1] ?? "",
      ...seloDoDocumento(d.rotulo, d),
      situacao: d.situacao,
      // O trecho é o que a IA apontou só se ele está no texto guardado.
      trecho: lido && ehLiteral(d.texto ?? "", lido.trecho) ? lido.trecho : (d.texto ?? ""),
      texto: d.texto,
      questao: d.questao,
      papel: lido?.papel ?? null,
      porque: lido?.porque ?? null,
      fonte: d.fonte,
    };
  });
  const ordem = (c: CandidatoDaTese) => (c.papel ? ORDEM_DO_PAPEL[c.papel] : 3);
  const ordenados = candidatos.map((c, i) => [c, i] as const).sort(([x, i], [y, j]) => ordem(x) - ordem(y) || i - j).map(([c]) => c);
  const conta = (p: PapelDoJulgado) => candidatos.filter((c) => c.papel === p).length;
  return {
    tese: a.tese,
    itens: ordenados,
    lados: { aFavor: conta("enfrenta"), contra: conta("contraponto"), tangenciam: conta("tangencia") },
    semLeitura,
    cobertura,
    explicacao: candidatos.length ? null : "Nada no acervo sobre esta tese. A marca continua no texto: pesquise nos tribunais e complete à mão, ou troque as palavras da tese e busque de novo.",
  };
}

/** A marca da tese no texto, onde ela está. */
export function marcaDaTese(texto: string, tese: string): { inicio: number; fim: number } | null {
  for (const m of texto.matchAll(/\[JURISPRUD[ÊE]NCIA\s*:?\s*([^\]\n]*)\]/g)) {
    if (m[1]!.trim().toLocaleLowerCase("pt-BR") === tese.trim().toLocaleLowerCase("pt-BR")) return { inicio: m.index!, fim: m.index! + m[0].length };
  }
  return null;
}

export class ForaDoAcervo extends Error {}

const SEM_A_IA = "Sem a IA, ninguém conferiu se o trecho sustenta a frase: confira você.";

/**
 * Confere os julgados escolhidos e monta a citação a partir do banco. O trecho só
 * entra na citação se está no texto guardado; se não, vale o texto guardado.
 */
export async function montarJulgados(deps: { db: Database; ia: Ia | null }, a: { texto: string; tese: string; marca: { inicio: number; fim: number }; escolhidos: { chave: string; trecho: string }[]; podeLer: boolean }, signal?: AbortSignal): Promise<{ texto: string; julgados: JulgadoDaPeca[] }> {
  const afirmacao = fraseAntesDaMarca(a.texto, a.marca.inicio) ?? a.tese;
  const em = new Date().toISOString();
  const conferir = (p: { chave: string; trecho: string }) => conferirCitacaoNoAcervo(deps.db, p);
  const julgados: JulgadoDaPeca[] = [];
  for (const [i, e] of a.escolhidos.entries()) {
    const c = await conferir(e);
    if (!c.texto && c.selo === "nao_verificada") throw new ForaDoAcervo(e.chave);
    const conferida = deps.ia && a.podeLer ? await citarNoAcervo(deps.ia, conferir, { chave: e.chave, trecho: e.trecho, afirmacao }, i + 1, signal) : { ...c, sustenta: null, selo: "com_ressalva" as const, motivo: `${c.motivo} ${SEM_A_IA}` };
    const trecho = conferida.literal ? e.trecho : (conferida.texto ?? e.trecho);
    const forca = forcaSemBase(afirmacao, trecho);
    julgados.push({
      chave: conferida.chave,
      rotulo: conferida.rotulo,
      tese: a.tese,
      afirmacao,
      trecho,
      citacao: `${conferida.rotulo}, "${trecho}"`,
      selo: conferida.selo,
      motivo: conferida.motivo,
      sustenta: conferida.sustenta,
      fonte: conferida.fonte,
      avisoDeForca: forca ? `A frase diz "${forca}", e o trecho não diz isso. Confira ou tire a palavra.` : null,
      em,
    });
  }
  const citacao = `Nesse sentido: ${julgados.map((j) => j.citacao).join("; ")}.`;
  return { texto: `${a.texto.slice(0, a.marca.inicio)}${citacao}${a.texto.slice(a.marca.fim)}`, julgados };
}
