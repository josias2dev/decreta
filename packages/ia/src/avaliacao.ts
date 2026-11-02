/**
 * Avaliação da IA contra o conjunto-ouro: casos inventados com a resposta
 * certa. Os modelos mudam a cada poucos meses; sem uma régua fixa, a sugestão
 * de prazo pode piorar sem ninguém perceber.
 *
 * - Prazo: a IA lê a publicação e diz o ato e os dias; o motor de prazos conta;
 *   o caso só passa se o vencimento cair no dia exato do gabarito.
 * - Resumo: nota pela rubrica (o que precisa aparecer e o que não pode).
 * - Citações: todo evento, folha ou artigo citado precisa estar no material.
 * - Peça: a IA escreve e liga os fatos, e a régua é a mesma do produto: a checagem
 *   por código, a conferência dos fatos e a rubrica. Prova inventada, frase
 *   quebrada, marca interna, parte errada e julgado de memória reprovam.
 */
import { calendarioPara, checarPeca, conferirFatos, contarPrazo, dataDaPublicacao, extrairCitacoes, extrairFontes, formatarDia, MARCA_DA_FOLHA, trechoNaFonte, type Dia, type FatoListado, type Feriado, type FonteDoFato, type ParteDoCadastro } from "@decreta/core";
import { IaRecusou, resumirAutos, sugerirPrazo, type ResumoDosAutos, type SugestaoDePrazo } from "./acoes.ts";
import { textoDoProcesso, type ContextoDoProcesso } from "./contexto.ts";
import type { Ia } from "./gateway.ts";
import { ligarFatosDaPeca } from "./peca-que-prova.ts";
import { gerarPeca, tipoDePeca } from "./pecas.ts";

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

export interface CasoDePeca {
  id: string;
  sobre: string;
  /** Do catálogo ("contestacao"). */
  tipo: string;
  instrucoes: string;
  /** Os autos, com os documentos que a peça pode usar. */
  autos: ContextoDoProcesso;
  /** As partes como o cadastro diz, e a qualificação que vai no pedido. */
  partes: ParteDoCadastro[];
  qualificacao: string;
  rubrica: ItemDaRubrica[];
  /** O que não pode aparecer: a prova inventada, a afirmação sem base. */
  proibido: ItemDaRubrica[];
  /** A peça certa e a ligação de cada fato ao trecho. */
  gabarito: { texto: string; fatos: FatoListado[] };
}

export interface ConjuntoOuro {
  prazos: CasoDePrazo[];
  resumos: CasoDeResumo[];
  pecas: CasoDePeca[];
}

export interface ResultadoDoCaso {
  id: string;
  tipo: "prazo" | "resumo" | "peca";
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
  /** `problemas`: o que a checagem por código e a conferência acharam nas peças. Precisa ser zero. */
  pecas: { nota: number; total: number; problemas: number };
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
  // A folha precisa existir no material (a marca [fl. N] da leitura do PDF).
  for (const f of extrairFontes(resposta)) if (f.folha != null && !material.includes(MARCA_DA_FOLHA(f.folha)) && (f.evento == null || eventos.has(String(f.evento)))) fora.add(f.trecho);
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
    if (!trechoNaFonte(s.trecho, caso.publicacao.texto)) falhas.push(`o trecho citado não está na publicação: "${s.trecho}"`);
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

/** O material do caso, com as mesmas referências que a tela usa: é contra ele que o código confere. */
function fontesDoCaso(caso: CasoDePeca): FonteDoFato[] {
  const { autos } = caso;
  const documentos = (autos.documentos ?? []).map((d, i): FonteDoFato => ({ ref: `D${i + 1}`, tipo: "documento", rotulo: d.evento != null ? `${d.nome} · evento ${d.evento}` : d.nome, texto: d.texto, nome: d.nome, evento: d.evento }));
  const andamentos = autos.movimentacoes.map((m) => `${m.em.slice(0, 10)} (evento ${m.evento ?? "?"}): ${m.titulo}${m.descricao ? `. ${m.descricao}` : ""}`).join("\n");
  return [
    ...documentos,
    ...(andamentos ? [{ ref: "A", tipo: "andamento", rotulo: "Andamentos do processo", texto: andamentos } satisfies FonteDoFato] : []),
    { ref: "C", tipo: "cadastro", rotulo: "Cadastro do processo", texto: `${autos.processo.cnj ?? "sem número"} ${autos.processo.titulo}` },
    { ref: "I", tipo: "instrucoes", rotulo: "Instruções de quem pediu", texto: caso.instrucoes },
  ];
}

/** O que a checagem por código não aceita numa peça entregue; [COMPLETAR], [A COMPROVAR] e a marca do julgado são o jeito certo de dizer que falta. */
const NAO_PODE_SAIR: ReadonlySet<string> = new Set(["frase_quebrada", "marca_interna", "campo_vazio", "qualificacao", "forca_sem_citacao"]);

export async function avaliarPeca(ia: Ia, caso: CasoDePeca): Promise<ResultadoDoCaso> {
  const tipo = tipoDePeca(caso.tipo);
  if (!tipo) throw new Error(`tipo de peça desconhecido: ${caso.tipo}`);
  const fontes = fontesDoCaso(caso);
  let texto: string;
  let listados: FatoListado[];
  try {
    texto = await gerarPeca(ia, { tipo, instrucoes: caso.instrucoes, contextoDoProcesso: textoDoProcesso(caso.autos), qualificacao: caso.qualificacao, escritorio: { nome: "Escritório de Teste", advogado: "Advogada de Teste", oab: "OAB/SC 12.345", cidade: caso.autos.processo.comarca } }).text;
    listados = await ligarFatosDaPeca(ia, { texto, fontes });
  } catch (err) {
    return { id: caso.id, tipo: "peca", acertou: false, nota: 0, falhas: [`a IA falhou: ${err instanceof Error ? err.message : String(err)}`], citacoesForaDaFonte: [] };
  }
  const r = conferirFatos({ texto, fontes, listados });
  const problemas = [
    ...checarPeca(r.texto, { partes: caso.partes })
      .filter((p) => NAO_PODE_SAIR.has(p.tipo))
      .map((p) => `${p.mensagem} ("${p.trecho}")`),
    ...r.avisos.map((a) => a.mensagem),
    ...r.fatos.filter((f) => f.situacao === "com_aviso" && f.motivo).map((f) => f.motivo!),
  ];
  const normal = semAcento(texto);
  const faltou = caso.rubrica.filter((x) => !new RegExp(x.padrao).test(normal));
  const sobrou = caso.proibido.filter((x) => new RegExp(x.padrao).test(normal));
  const falhas = [...problemas.map((p) => `conferência: ${p}`), ...faltou.map((x) => `faltou: ${x.item}`), ...sobrou.map((x) => `não podia: ${x.item}`)];
  const total = caso.rubrica.length + caso.proibido.length;
  return { id: caso.id, tipo: "peca", acertou: falhas.length === 0, nota: total ? (total - faltou.length - sobrou.length) / total : 1, falhas, citacoesForaDaFonte: problemas };
}

/** Roda todos os casos, um de cada vez (a IA de verdade tem limite por minuto). */
export async function avaliarConjunto(ia: Ia, conjunto: ConjuntoOuro): Promise<Placar> {
  const casos: ResultadoDoCaso[] = [];
  for (const c of conjunto.prazos) casos.push(await avaliarPrazo(ia, c));
  for (const c of conjunto.resumos) casos.push(await avaliarResumo(ia, c));
  for (const c of conjunto.pecas) casos.push(await avaliarPeca(ia, c));
  const resumos = casos.filter((c) => c.tipo === "resumo");
  const pecas = casos.filter((c) => c.tipo === "peca");
  return {
    casos,
    prazos: { acertos: casos.filter((c) => c.tipo === "prazo" && c.acertou).length, total: conjunto.prazos.length },
    resumos: { nota: resumos.length ? resumos.reduce((s, c) => s + c.nota, 0) / resumos.length : 1, total: resumos.length },
    pecas: { nota: pecas.length ? pecas.reduce((s, c) => s + c.nota, 0) / pecas.length : 1, total: pecas.length, problemas: pecas.reduce((s, c) => s + c.citacoesForaDaFonte.length, 0) },
    citacoesForaDaFonte: resumos.reduce((s, c) => s + c.citacoesForaDaFonte.length, 0),
  };
}

export function placarEmTexto(p: Placar): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const linhas = [
    `Prazos no dia exato: ${p.prazos.acertos} de ${p.prazos.total}`,
    `Resumos pela rubrica: ${pct(p.resumos.nota)} (${p.resumos.total} casos)`,
    `Peças pela rubrica: ${pct(p.pecas.nota)} (${p.pecas.total} casos), ${p.pecas.problemas} ${p.pecas.problemas === 1 ? "problema" : "problemas"} na conferência por código`,
    `Citações fora da fonte: ${p.citacoesForaDaFonte}`,
  ];
  const erros = p.casos.filter((c) => !c.acertou);
  if (erros.length) linhas.push("", "Erros:", ...erros.map((c) => `- ${c.id}: ${c.falhas.join("; ")}`));
  return linhas.join("\n");
}
