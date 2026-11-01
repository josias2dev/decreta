/**
 * Avaliação da IA contra o conjunto-ouro: casos inventados com a resposta
 * certa. Os modelos mudam a cada poucos meses; sem uma régua fixa, a sugestão
 * de prazo pode piorar sem ninguém perceber.
 *
 * - Prazo: a IA lê a publicação e diz o ato e os dias; o motor de prazos conta;
 *   o caso só passa se o vencimento cair no dia exato do gabarito.
 * - Resumo: nota pela rubrica (o que precisa aparecer e o que não pode).
 * - Citações: todo evento, folha ou artigo citado precisa estar no material.
 */
import { calendarioPara, contarPrazo, dataDaPublicacao, extrairCitacoes, formatarDia, type Dia, type Feriado } from "@decreta/core";
import { IaRecusou, resumirAutos, sugerirPrazo, type ResumoDosAutos, type SugestaoDePrazo } from "./acoes.ts";
import type { Ia } from "./gateway.ts";

export interface CasoDePrazo {
  id: string;
  /** O que o caso testa ("feriado de Finados no começo do prazo"). */
  sobre: string;
  publicacao: { texto: string; tipoComunicacao: string | null; tipoDocumento: string | null; orgao: string | null; disponibilizadaEm: Dia };
  tribunal: string;
  /** Feriados municipais e atos do tribunal que só o escritório conhece. */
  feriadosLocais?: Feriado[];
  esperado: { geraPrazo: false } | { geraPrazo: true; /** O ato, em expressão regular sobre o texto sem acento. */ ato: string; dias: number; fim: Dia };
  /** A resposta certa da IA para este caso. */
  gabarito: SugestaoDePrazo;
}

export interface ItemDaRubrica {
  item: string;
  /** Expressão regular sobre a resposta inteira, sem acento e em minúsculas. */
  padrao: string;
}

export interface CasoDeResumo {
  id: string;
  sobre: string;
  /** Os autos, como `textoDoProcesso` monta. */
  contexto: string;
  rubrica: ItemDaRubrica[];
  /** O que não pode aparecer (fato inventado, conclusão errada). */
  proibido?: ItemDaRubrica[];
  gabarito: ResumoDosAutos;
}

export interface ConjuntoOuro {
  prazos: CasoDePrazo[];
  resumos: CasoDeResumo[];
}

export interface ResultadoDoCaso {
  id: string;
  tipo: "prazo" | "resumo";
  acertou: boolean;
  /** De 0 a 1. No prazo, 1 ou 0. */
  nota: number;
  falhas: string[];
  citacoesForaDaFonte: string[];
}

export interface Placar {
  casos: ResultadoDoCaso[];
  prazos: { acertos: number; total: number };
  resumos: { nota: number; total: number };
  citacoesForaDaFonte: number;
}

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Todo texto de uma resposta estruturada, junto. */
export function textoDaResposta(r: unknown): string {
  if (typeof r === "string") return r;
  if (Array.isArray(r)) return r.map(textoDaResposta).join("\n");
  if (r && typeof r === "object") return Object.values(r).map(textoDaResposta).join("\n");
  return "";
}

/**
 * As citações da resposta que não estão no material: "evento 412" quando os
 * autos vão até o 89, ou "art. 186 do CC" que nenhum documento traz.
 */
export function citacoesForaDoMaterial(resposta: string, material: string, permitidas: readonly string[] = []): string[] {
  const eventos = new Set([...material.matchAll(/evento\s+(\d+)/gi)].map((m) => m[1]));
  const fora = new Set<string>();
  for (const m of resposta.matchAll(/evento\s+(\d+)/gi)) if (!eventos.has(m[1])) fora.add(`evento ${m[1]}`);
  const leis = new Set([...extrairCitacoes(material).map((c) => c.chave), ...permitidas]);
  for (const c of extrairCitacoes(resposta)) if (!leis.has(c.chave)) fora.add(c.trecho);
  return [...fora];
}

export async function avaliarPrazo(ia: Ia, caso: CasoDePrazo): Promise<ResultadoDoCaso> {
  const falhas: string[] = [];
  const cal = calendarioPara({ tribunal: caso.tribunal, extras: caso.feriadosLocais });
  const publicadaEm = dataDaPublicacao(caso.publicacao.disponibilizadaEm, cal);
  let s: SugestaoDePrazo | null = null;
  try {
    s = await sugerirPrazo(ia, { publicacao: { ...caso.publicacao, publicadaEm } });
  } catch (err) {
    falhas.push(err instanceof IaRecusou ? `a IA recusou: ${err.motivo}` : `a IA falhou: ${err instanceof Error ? err.message : String(err)}`);
  }
  const e = caso.esperado;
  if (s) {
    if (!e.geraPrazo) {
      if (s.geraPrazo) falhas.push(`não gera prazo, mas a IA sugeriu ${s.tipo} em ${s.dias ?? "?"} dias`);
    } else if (!s.geraPrazo || !s.dias) {
      falhas.push(`gera ${e.dias} dias e vence em ${formatarDia(e.fim)}, mas a IA disse que não gera prazo`);
    } else {
      if (!new RegExp(e.ato).test(semAcento(s.tipo))) falhas.push(`o ato devia casar com /${e.ato}/; a IA disse "${s.tipo}"`);
      const fim = contarPrazo({ publicacao: publicadaEm, dias: s.dias, contagem: s.contagem, calendario: cal }).fim;
      if (fim !== e.fim) falhas.push(`vence em ${formatarDia(e.fim)}; com a sugestão (${s.dias} dias ${s.contagem === "uteis" ? "úteis" : "corridos"}) venceria em ${formatarDia(fim)}`);
    }
  }
  return { id: caso.id, tipo: "prazo", acertou: falhas.length === 0, nota: falhas.length ? 0 : 1, falhas, citacoesForaDaFonte: [] };
}

export async function avaliarResumo(ia: Ia, caso: CasoDeResumo): Promise<ResultadoDoCaso> {
  let resposta: ResumoDosAutos | null = null;
  const falhas: string[] = [];
  try {
    resposta = await resumirAutos(ia, caso.contexto);
  } catch (err) {
    falhas.push(err instanceof IaRecusou ? `a IA recusou: ${err.motivo}` : `a IA falhou: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (!resposta) return { id: caso.id, tipo: "resumo", acertou: false, nota: 0, falhas, citacoesForaDaFonte: [] };
  const texto = textoDaResposta(resposta);
  const normal = semAcento(texto);
  const faltou = caso.rubrica.filter((r) => !new RegExp(r.padrao).test(normal));
  const sobrou = (caso.proibido ?? []).filter((r) => new RegExp(r.padrao).test(normal));
  for (const r of faltou) falhas.push(`faltou: ${r.item}`);
  for (const r of sobrou) falhas.push(`não podia: ${r.item}`);
  const fora = citacoesForaDoMaterial(texto, caso.contexto);
  if (fora.length) falhas.push(`citou fora dos autos: ${fora.join(", ")}`);
  const total = caso.rubrica.length + (caso.proibido?.length ?? 0);
  const nota = total ? (total - faltou.length - sobrou.length) / total : 1;
  return { id: caso.id, tipo: "resumo", acertou: falhas.length === 0, nota, falhas, citacoesForaDaFonte: fora };
}

/** Roda todos os casos, um de cada vez (a IA de verdade tem limite por minuto). */
export async function avaliarConjunto(ia: Ia, conjunto: ConjuntoOuro): Promise<Placar> {
  const casos: ResultadoDoCaso[] = [];
  for (const c of conjunto.prazos) casos.push(await avaliarPrazo(ia, c));
  for (const c of conjunto.resumos) casos.push(await avaliarResumo(ia, c));
  const resumos = casos.filter((c) => c.tipo === "resumo");
  return {
    casos,
    prazos: { acertos: casos.filter((c) => c.tipo === "prazo" && c.acertou).length, total: conjunto.prazos.length },
    resumos: { nota: resumos.length ? resumos.reduce((s, c) => s + c.nota, 0) / resumos.length : 1, total: resumos.length },
    citacoesForaDaFonte: casos.reduce((s, c) => s + c.citacoesForaDaFonte.length, 0),
  };
}

export function placarEmTexto(p: Placar): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const linhas = [
    `Prazos no dia exato: ${p.prazos.acertos} de ${p.prazos.total}`,
    `Resumos pela rubrica: ${pct(p.resumos.nota)} (${p.resumos.total} casos)`,
    `Citações fora da fonte: ${p.citacoesForaDaFonte}`,
  ];
  const erros = p.casos.filter((c) => !c.acertou);
  if (erros.length) linhas.push("", "Erros:", ...erros.map((c) => `- ${c.id}: ${c.falhas.join("; ")}`));
  return linhas.join("\n");
}
