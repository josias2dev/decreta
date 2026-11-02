/**
 * A estratégia da peça, antes de escrever: as teses com a evidência de cada uma,
 * as provas, os capítulos e as perguntas que mudam a peça. A pessoa edita, reordena
 * e remove. A evidência é conferida por código: o trecho está mesmo no documento?
 */
import { localizarTrecho, type FonteDoFato } from "./conferencia-dos-fatos.ts";

export interface EvidenciaDaTese {
  /** A referência da fonte ("D1"); nula na evidência que a pessoa escreveu. */
  fonte: string | null;
  /** "Laudo pericial.docx · evento 87" */
  rotulo: string;
  trecho: string;
  /** O trecho está mesmo na fonte? */
  confere: boolean;
  documentoId: string | null;
  folha: number | null;
}

export interface TeseDaEstrategia {
  id: string;
  titulo: string;
  fundamento: string;
  evidencias: EvidenciaDaTese[];
  /** A prova que falta para sustentar a tese. */
  falta: string | null;
}

export interface ProvaDaEstrategia {
  id: string;
  descricao: string;
  /** De onde vem; nula na prova a produzir. */
  rotulo: string | null;
}

export interface CapituloDaEstrategia {
  id: string;
  titulo: string;
  resumo: string;
}

export interface PerguntaDaEstrategia {
  id: string;
  pergunta: string;
  /** O que muda na peça conforme a resposta. */
  muda: string;
  resposta: string;
}

export interface EstrategiaDaPeca {
  teoria: string;
  teses: TeseDaEstrategia[];
  provas: ProvaDaEstrategia[];
  capitulos: CapituloDaEstrategia[];
  perguntas: PerguntaDaEstrategia[];
}

/** O que a IA devolve, antes da conferência. */
export interface EstrategiaBruta {
  teoria: string;
  teses: { titulo: string; fundamento: string; evidencias: { fonte: string; trecho: string }[]; falta: string | null }[];
  provas: { descricao: string; fonte: string | null }[];
  capitulos: { titulo: string; resumo: string }[];
  perguntas: { pergunta: string; muda: string | null }[];
}

/** Mais perguntas que isso já não é "só o que muda a peça". */
const MAXIMO_DE_PERGUNTAS = 3;

export function conferirEstrategia(bruta: EstrategiaBruta, fontes: readonly FonteDoFato[]): EstrategiaDaPeca {
  const fonteDe = (ref: string | null) => (ref ? fontes.find((f) => f.ref === ref) : undefined);
  return {
    teoria: bruta.teoria.trim(),
    teses: bruta.teses.map((t, i) => ({
      id: `t${i + 1}`,
      titulo: t.titulo.trim(),
      fundamento: t.fundamento.trim(),
      falta: t.falta?.trim() || null,
      evidencias: t.evidencias.map((e) => {
        const f = fonteDe(e.fonte);
        const achado = f ? localizarTrecho(f.texto, e.trecho) : null;
        return { fonte: f?.ref ?? null, rotulo: f?.rotulo ?? "Fonte que não está nos autos", trecho: e.trecho.trim(), confere: !!achado, documentoId: f?.documentoId ?? null, folha: achado?.folha ?? null };
      }),
    })),
    provas: bruta.provas.map((p, i) => ({ id: `p${i + 1}`, descricao: p.descricao.trim(), rotulo: fonteDe(p.fonte)?.rotulo ?? null })),
    capitulos: bruta.capitulos.map((c, i) => ({ id: `c${i + 1}`, titulo: c.titulo.trim(), resumo: c.resumo.trim() })),
    // Pergunta que não diz o que muda na peça não entra.
    perguntas: bruta.perguntas
      .filter((q) => q.muda?.trim())
      .slice(0, MAXIMO_DE_PERGUNTAS)
      .map((q, i) => ({ id: `q${i + 1}`, pergunta: q.pergunta.trim(), muda: q.muda!.trim(), resposta: "" })),
  };
}
