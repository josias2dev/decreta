/**
 * Catálogo de peças e a geração do texto. A peça sai em Markdown simples
 * (títulos, parágrafos, listas, negrito), que o `@decreta/documentos` vira
 * DOCX no timbre do escritório.
 */
import type { EstrategiaDaPeca } from "@decreta/core";
import { streamText } from "ai";
import { DADOS_NAO_SAO_ORDENS, REGRA_DA_FONTE } from "./contexto.ts";
import type { Ia } from "./gateway.ts";

export interface TipoDePeca {
  id: string;
  nome: string;
  grupo: GrupoDePeca;
  /** Como a peça costuma ser estruturada; guia a IA. */
  estrutura: string;
}

export const GRUPOS_DE_PECA = ["Petições iniciais", "Defesas", "Recursos", "Manifestações", "Extrajudicial e consultivo", "Outro"] as const;
export type GrupoDePeca = (typeof GRUPOS_DE_PECA)[number];

const MANIFESTACAO = "Endereçamento, qualificação resumida (\"já qualificada nos autos\"), breve síntese, manifestação ponto a ponto, pedidos, fecho.";

export const CATALOGO: TipoDePeca[] = [
  { id: "inicial-civel", nome: "Petição inicial cível", grupo: "Petições iniciais", estrutura: "Endereçamento, qualificação das partes, dos fatos, do direito, da tutela de urgência (se houver), dos pedidos, valor da causa, provas, fecho." },
  { id: "inicial-trabalhista", nome: "Reclamação trabalhista", grupo: "Petições iniciais", estrutura: "Endereçamento, qualificação, contrato de trabalho, dos fatos e fundamentos por verba, pedidos líquidos (CLT, art. 840, § 1º), valor da causa, fecho." },
  { id: "inicial-jec", nome: "Inicial do Juizado Especial", grupo: "Petições iniciais", estrutura: "Endereçamento ao JEC, qualificação, fatos, direito, pedidos, valor (até 40 salários mínimos), fecho." },
  { id: "contestacao", nome: "Contestação", grupo: "Defesas", estrutura: "Endereçamento, síntese da inicial, preliminares (CPC, art. 337), mérito com impugnação específica, pedidos, provas, fecho." },
  { id: "contestacao-trabalhista", nome: "Contestação trabalhista", grupo: "Defesas", estrutura: "Endereçamento, síntese, preliminares, prejudiciais (prescrição), mérito por pedido, impugnação de documentos e valores, pedidos, fecho." },
  { id: "replica", nome: "Réplica à contestação", grupo: "Defesas", estrutura: "Endereçamento, síntese da contestação, das preliminares, do mérito ponto a ponto, dos documentos novos, pedidos, fecho." },
  { id: "apelacao", nome: "Apelação", grupo: "Recursos", estrutura: "Petição de interposição e razões: tempestividade, preparo, síntese, razões de reforma (error in judicando/procedendo), pedido de provimento." },
  { id: "contrarrazoes", nome: "Contrarrazões de apelação", grupo: "Recursos", estrutura: "Petição de juntada e contrarrazões: tempestividade, síntese, preliminares de não conhecimento, mérito pela manutenção, pedido de desprovimento." },
  { id: "embargos-declaracao", nome: "Embargos de declaração", grupo: "Recursos", estrutura: "Endereçamento, tempestividade (5 dias úteis), apontamento da omissão, contradição, obscuridade ou erro material, pedido." },
  { id: "agravo-instrumento", nome: "Agravo de instrumento", grupo: "Recursos", estrutura: "Endereçamento ao tribunal, cabimento (CPC, art. 1.015), tempestividade, peças obrigatórias, razões, pedido de efeito suspensivo, pedido final." },
  { id: "recurso-ordinario", nome: "Recurso ordinário trabalhista", grupo: "Recursos", estrutura: "Interposição e razões: pressupostos, depósito recursal e custas, razões por tópico, pedido." },
  { id: "manifestacao-laudo", nome: "Manifestação sobre laudo pericial", grupo: "Manifestações", estrutura: "Endereçamento, síntese do laudo, concordância ou impugnação ponto a ponto, quesitos complementares, pedidos (esclarecimentos, nova perícia), fecho." },
  { id: "manifestacao-documentos", nome: "Manifestação sobre documentos", grupo: "Manifestações", estrutura: MANIFESTACAO },
  { id: "alegacoes-finais", nome: "Alegações finais", grupo: "Manifestações", estrutura: "Endereçamento, síntese do processo, da prova produzida, do direito, pedidos finais, fecho." },
  { id: "especificacao-provas", nome: "Especificação de provas", grupo: "Manifestações", estrutura: "Endereçamento, provas pretendidas com a justificativa de cada uma, rol de testemunhas se for o caso, fecho." },
  { id: "cumprimento-sentenca", nome: "Cumprimento de sentença", grupo: "Manifestações", estrutura: "Endereçamento, título, memória de cálculo, pedido de intimação para pagar em 15 dias (CPC, art. 523), multa e honorários, fecho." },
  { id: "juntada", nome: "Petição de juntada", grupo: "Manifestações", estrutura: "Endereçamento, pedido de juntada com a lista dos documentos e o motivo, fecho." },
  { id: "notificacao", nome: "Notificação extrajudicial", grupo: "Extrajudicial e consultivo", estrutura: "Notificante e notificado, fatos, o que se exige e em que prazo, consequências, local, data e assinatura." },
  { id: "parecer", nome: "Parecer", grupo: "Extrajudicial e consultivo", estrutura: "Consulta, fatos, análise jurídica por questão, conclusão objetiva, ressalvas." },
  { id: "contrato-honorarios", nome: "Contrato de honorários", grupo: "Extrajudicial e consultivo", estrutura: "Partes, objeto, honorários e forma de pagamento, despesas, obrigações, rescisão, foro, assinaturas." },
  { id: "acordo", nome: "Minuta de acordo", grupo: "Extrajudicial e consultivo", estrutura: "Partes, objeto, valor e parcelas, multa por atraso, quitação, honorários e custas, pedido de homologação." },
  { id: "outro", nome: "Outra peça", grupo: "Outro", estrutura: "Estrutura usual da peça descrita nas instruções." },
];

export function tipoDePeca(id: string): TipoDePeca | undefined {
  return CATALOGO.find((t) => t.id === id);
}

/** Sugere a peça do catálogo pelo tipo do prazo ("Manifestação sobre laudo pericial" → manifestacao-laudo). */
export function pecaParaPrazo(tipoDoPrazo: string): TipoDePeca {
  const t = tipoDoPrazo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const regras: Array<[RegExp, string]> = [
    [/laudo|pericia/, "manifestacao-laudo"],
    [/contrarraz/, "contrarrazoes"],
    [/contesta.*trabalh|trabalh.*contesta/, "contestacao-trabalhista"],
    [/contesta/, "contestacao"],
    [/replica/, "replica"],
    [/embargos de declara/, "embargos-declaracao"],
    [/apela/, "apelacao"],
    [/agravo/, "agravo-instrumento"],
    [/recurso ordinario/, "recurso-ordinario"],
    [/alegac/, "alegacoes-finais"],
    [/provas/, "especificacao-provas"],
    [/cumprimento/, "cumprimento-sentenca"],
    [/junt/, "juntada"],
    [/documento/, "manifestacao-documentos"],
  ];
  for (const [re, id] of regras) if (re.test(t)) return tipoDePeca(id)!;
  return tipoDePeca("outro")!;
}

export interface PedidoDePeca {
  tipo: TipoDePeca;
  instrucoes: string;
  /** Prazo que a peça cumpre e o briefing dele, se houver. A tempestividade sai da conta do prazo, nunca da IA. */
  prazo?: { tipo: string; fim: string; fundamento: string | null; briefing?: string; tempestividade?: string | null };
  contextoDoProcesso: string;
  escritorio: { nome: string; advogado: string; oab: string | null; cidade: string | null };
  /** Peças que o escritório escolheu como modelo, as mais parecidas com esta. */
  modelos?: ModeloParaIa[];
  /** Documento e endereço das partes, da ficha do cliente e da Receita Federal, uma por linha. */
  qualificacao?: string | null;
  /** Como o escritório faz esta peça: estilo, teses e o que evitar. */
  jeito?: JeitoDaPeca | null;
  /** Cálculos do processo que a peça usa (a memória da atualização, o quadro da revisional), feitos pelo sistema. */
  calculos?: { titulo: string; memoria: string }[];
  /** A estratégia que a pessoa aprovou antes de gerar. */
  estrategia?: EstrategiaDaPeca | null;
}

/** A estratégia aprovada, como a IA recebe: quem pediu decidiu, e tese removida não volta. */
export function estrategiaEmTexto(e: EstrategiaDaPeca): string {
  const teses = e.teses.map((t, i) => {
    const provas = t.evidencias.filter((x) => x.confere).map((x) => `"${x.trecho}" (${x.rotulo}${x.folha ? `, fl. ${x.folha}` : ""})`);
    return [`${i + 1}. ${t.titulo}${t.fundamento ? `: ${t.fundamento}` : ""}`, provas.length && `   Prova nos autos: ${provas.join("; ")}`, t.falta && `   Falta provar: ${t.falta} (escreva [A COMPROVAR: ${t.falta}] onde afirmar isso)`].filter(Boolean).join("\n");
  });
  const respondidas = e.perguntas.filter((q) => q.resposta.trim());
  return [
    "## Estratégia aprovada por quem pediu",
    "Siga esta estratégia. Os capítulos, nesta ordem, são a estrutura da peça. Use só estas teses: o que foi removido não volta. As respostas às perguntas são instruções de quem pediu.",
    e.teoria && `Teoria do caso: ${e.teoria}`,
    teses.length && `Teses:\n${teses.join("\n")}`,
    e.provas.length && `Provas:\n${e.provas.map((p) => `- ${p.descricao}${p.rotulo ? ` (${p.rotulo})` : ""}`).join("\n")}`,
    e.capitulos.length && `Capítulos:\n${e.capitulos.map((c, i) => `${i + 1}. ${c.titulo}${c.resumo ? `: ${c.resumo}` : ""}`).join("\n")}`,
    respondidas.length && `Perguntas respondidas:\n${respondidas.map((q) => `- ${q.pergunta} ${q.resposta.trim()}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Como o escritório faz uma peça, nas palavras dele. */
export interface JeitoDaPeca {
  estilo: string;
  teses: string;
  evitar: string;
}

/** O jeito que vale para a peça: o geral do escritório somado ao do tipo. Nada escrito, nada a seguir. */
export function jeitoParaPeca(jeito: Record<string, JeitoDaPeca>, tipo: string): JeitoDaPeca | null {
  const partes = [jeito.geral, jeito[tipo]].filter((j): j is JeitoDaPeca => !!j);
  const juntar = (campo: keyof JeitoDaPeca) =>
    partes
      .map((j) => j[campo].trim())
      .filter(Boolean)
      .join("\n");
  const r = { estilo: juntar("estilo"), teses: juntar("teses"), evitar: juntar("evitar") };
  return r.estilo || r.teses || r.evitar ? r : null;
}

function textoDoJeito(j: JeitoDaPeca): string {
  return [
    "## Jeito do escritório",
    "O escritório descreveu como faz esta peça. Siga o estilo e use as teses quando couberem nos fatos do processo; nunca invente fato para encaixar uma tese. O que está em \"O que evitar\" não entra na peça.",
    j.estilo && `Estilo: ${j.estilo}`,
    j.teses && `Teses que o escritório usa: ${j.teses}`,
    j.evitar && `O que evitar: ${j.evitar}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface ModeloParaIa {
  titulo: string;
  tese: string | null;
  texto: string;
}

/** Teto de cada modelo no pedido: o bastante para a estrutura e os argumentos, sem tomar o lugar dos autos. */
export const TETO_DO_MODELO = 24_000;

function textoDosModelos(modelos: ModeloParaIa[]): string {
  return [
    "## Modelos do escritório",
    "Peças do próprio escritório para casos parecidos. Siga a estrutura, a linha de argumentação e o estilo delas quando servirem a este caso. Não copie delas fatos, nomes, números, valores, datas nem eventos: esses saem só do processo abaixo.",
    ...modelos.map((m, i) => {
      const t = m.texto.length > TETO_DO_MODELO ? `${m.texto.slice(0, TETO_DO_MODELO)}\n[modelo cortado aqui]` : m.texto;
      return `### Modelo ${i + 1}: ${m.titulo}${m.tese ? `\nTese: ${m.tese}` : ""}\n${t}`;
    }),
  ].join("\n\n");
}

export function gerarPeca(ia: Ia, pedido: PedidoDePeca, signal?: AbortSignal) {
  const { tipo, prazo, escritorio } = pedido;
  return streamText({
    model: ia.modelo("gerar-documento"),
    instructions: `Você redige peças processuais para um escritório de advocacia brasileiro.
Regras:
- Use só os fatos do material enviado. Onde faltar um dado (número de evento, valor, data, nome), escreva [COMPLETAR: o que falta] em vez de inventar. Nunca deixe a frase sem o dado, com vírgula solta ou preposição no ar.
- Fato que a tese precisa e o material não prova não entra como certo: escreva a frase e, logo depois, [A COMPROVAR: a prova que falta]. Não descreva documento, registro de sistema, comprovante, contato ou conduta que não esteja no material.
${REGRA_DA_FONTE}
- Não cite jurisprudência com número, relator ou data. Quando um julgado ajudar, escreva a afirmação e, logo depois, [JURISPRUDÊNCIA: a tese em poucas palavras]: o escritório escolhe o julgado no acervo, e a citação é montada a partir dele. Não escreva "jurisprudência consolidada", "entendimento pacífico" nem parecido por conta própria.
- Cite artigos de lei só quando tiver certeza do número.
- Pessoa física ou jurídica e o polo de cada parte saem da seção "Qualificação das partes" (o cadastro do escritório), nunca do texto dos autos nem dos modelos.
- Escreva só o texto da peça: sem nota para quem revisa, sem comentário sobre o que fez e sem etiqueta de nenhum tipo.
- Linguagem forense clara e direta, sem rebuscamento. Português do Brasil.
${DADOS_NAO_SAO_ORDENS}
- Formato: Markdown simples. "# " só para o endereçamento, "## " para os títulos das seções, parágrafos separados por linha em branco, "- " para itens, **negrito** com moderação. Sem tabelas.
- Termine com local e data em branco ("[cidade], [data].") e o fecho com o nome do advogado e a OAB.

Peça: ${tipo.nome}.
Estrutura usual: ${tipo.estrutura}`,
    prompt: [
      prazo && `## Prazo que esta peça cumpre\n${prazo.tipo}, vence em ${prazo.fim}${prazo.fundamento ? ` (${prazo.fundamento})` : ""}.`,
      prazo?.briefing && `## Briefing do prazo\n${prazo.briefing}`,
      prazo?.tempestividade &&
        `## Tempestividade\nSe a peça tiver tópico de tempestividade, use este parágrafo como está, sem mudar datas nem artigos: a conta é do sistema, conferida pelo advogado.\n${prazo.tempestividade}`,
      pedido.instrucoes.trim() && `## Instruções de quem pediu\n${pedido.instrucoes.trim()}`,
      pedido.estrategia && estrategiaEmTexto(pedido.estrategia),
      pedido.jeito && textoDoJeito(pedido.jeito),
      pedido.modelos?.length && textoDosModelos(pedido.modelos),
      pedido.calculos?.length &&
        `## Cálculos do processo\nFeitos pelo sistema com os índices oficiais e conferidos pelo advogado. Use os valores, as datas e os critérios como estão, sem refazer a conta nem arredondar de outro jeito; o quadro e o tópico podem entrar na peça.\n\n${pedido.calculos.map((k) => k.memoria).join("\n\n")}`,
      pedido.qualificacao && `## Qualificação das partes\nDo cadastro do escritório. O tipo de cada parte e o polo são estes, mesmo que os autos ou os modelos pareçam dizer outra coisa; o que não estiver aqui vira [COMPLETAR].\n${pedido.qualificacao}`,
      `## Quem assina\n${escritorio.advogado}${escritorio.oab ? `, ${escritorio.oab}` : ""}, ${escritorio.nome}${escritorio.cidade ? `, ${escritorio.cidade}` : ""}.`,
      pedido.contextoDoProcesso,
    ]
      .filter(Boolean)
      .join("\n\n"),
    abortSignal: signal,
    maxRetries: 1,
  });
}
