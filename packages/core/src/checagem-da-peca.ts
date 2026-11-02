/**
 * "Antes de protocolar": o que a peça ainda não pode levar ao juízo, achado por
 * código, sem IA. Colchete por preencher, campo em branco, frase quebrada, marca
 * interna vazada, força de jurisprudência sem citação e qualificação diferente do
 * cadastro. Não bloqueia nada: vira uma lista que leva ao ponto do texto.
 *
 * Os exemplos reais estão nos testes: "ocorreu em, o protocolo realizado na data
 * de assegura" e `<mention ...>` no corpo da peça.
 */
import { extrairCitacoes } from "./citacoes.ts";
import { AVISO_DE_QUEDA, blocosComPosicao, ehCampoEmBranco, ETIQUETA_INTERNA } from "./peca.ts";

export type TipoDoPonto = "completar" | "jurisprudencia" | "a_comprovar" | "colchete" | "campo_vazio" | "frase_quebrada" | "marca_interna" | "forca_sem_citacao" | "qualificacao";

export interface PontoDaPeca {
  tipo: TipoDoPonto;
  /** Como está escrito no texto. */
  trecho: string;
  inicio: number;
  fim: number;
  mensagem: string;
}

/** Uma parte como o cadastro diz: o tipo sai daqui, nunca da interpretação do texto. */
export interface ParteDoCadastro {
  nome: string;
  /** Nulo quando o cadastro não diz. */
  tipo: "pf" | "pj" | null;
  polo: "ativo" | "passivo" | "terceiro";
  cliente: boolean;
}

type Achado = Omit<PontoDaPeca, "inicio" | "fim"> & { inicio: number };

const naoLetra = String.raw`(?<![\p{L}\d.])`;
const PREPOSICOES = "em|de|do|da|dos|das|no|na|nos|nas|para|por|pelo|pela|com|ao|aos|sob|sobre|entre";
const PREPOSICAO_SOLTA = new RegExp(String.raw`${naoLetra}(${PREPOSICOES})\s*([,;.])(?!\d)`, "giu");
/** Até onde o aposto pode ir: "para, querendo, apresentar" fecha a vírgula logo depois. */
const APOSTO_FECHADO = /^(?:\s+[^\s,.;:]+){1,8},/u;
/** "na data de assegura": depois de "data de" vem o que a data é, nunca um verbo. */
const DATA_E_VERBO = /\bdata\s+de\s+(?:assegura|garante|comprova|demonstra|prova|confirma|afirma|alega|sustenta|requer|pede|foi|é|está|ocorreu|houve|tem|há)\b/giu;
/** A última palavra de um parágrafo que parou no meio. */
const FIM_CORTADO = new RegExp(String.raw`${naoLetra}(?:${PREPOSICOES}|que|e|ou|o|a|os|as|um|uma|à|às|conforme)$`, "iu");
const PALAVRAS_DO_PARAGRAFO_LONGO = 6;

const CAMPO_VAZIO: readonly [RegExp, string][] = [
  [/,(?:[^\S\n]*,)+/g, "Vírgulas soltas: há um campo em branco aqui."],
  [/(?<=[\p{L}\d])[^\S\n]+,/gu, "Vírgula solta: há um campo em branco aqui."],
  [/,[^\S\n]*\.(?!\.)|(?<!\.)\.\.(?!\.)/g, "Pontuação repetida: há um campo em branco aqui."],
  [/R\$[^\S\n]*(?:,\d{0,2}|\.(?!\d))/g, "Valor em branco."],
  [/R\$[^\S\n]*[Xx]+(?:[.,][Xx]+)*|\bn[º°]\.?[^\S\n]*[Xx]{2,}\b|\b[Xx]{4,}\b|\bxxx\b/gu, "Número por preencher."],
  [/\b(?:CPF|CNPJ|RG|CEP|OAB|CTPS|PIS)(?:\/MF)?[^\S\n]*(?:(?:sob[^\S\n]+o[^\S\n]+)?n[º°o]?\.?[^\S\n]*|:[^\S\n]*)(?:[,;.](?![^\S\n]*\d)|$)/gmu, "Documento em branco."],
  [/\bn[º°]\.?[^\S\n]*[,;.](?![^\S\n]*\d)/gu, "Número em branco."],
  [/_+(?:\/_+)+|_{3,}/g, "Campo em branco."],
  [/\([^\S\n]*\)/g, "Parênteses vazios: faltou o que ia dentro."],
];

const MARCAS_INTERNAS: readonly RegExp[] = [
  ETIQUETA_INTERNA,
  AVISO_DE_QUEDA,
  /\{\{[^{}\n]*\}\}|\$\{[^{}\n]*\}|\{[a-zA-Z_][\w.]*\}/g,
  /【[^】\n]*】/g,
  /\[\^?\d+\]|\[fls?\.?\s*\d+\]/g,
  /^```.*$/gm,
  /^[^\S\n]*\|.*\|[^\S\n]*$/gm,
  /\b(?:nota\s+(?:interna|ao\s+advogad[oa]|para\s+[oa]\s+advogad[oa]|da\s+ia)|observa[çc][ãa]o\s+(?:interna|ao\s+advogad[oa]|para\s+[oa]\s+advogad[oa])|aten[çc][ãa]o,?\s+advogad[oa])\b/giu,
  /\b(?:aqui\s+est[áa]\s+[ao]\s+\p{L}+|como\s+(?:uma\s+)?(?:intelig[êe]ncia\s+artificial|modelo\s+de\s+linguagem)|espero\s+que\s+(?:isso\s+)?ajude)\b/giu,
  /\bcomo\s+(?:uma\s+)?IA\b/gu,
];

const FORCA =
  /jurisprud[êe]ncia\s+(?:consolidada|pac[íi]fica|dominante|un[íi]ssona|remansosa|majorit[áa]ria|firme|assente|mansa)|entendimento\s+(?:consolidado|pac[íi]fico|dominante|un[âa]nime|majorit[áa]rio|firme|assente)|orienta[çc][ãa]o\s+(?:consolidada|pac[íi]fica|dominante|majorit[áa]ria|firme)|\b(?:consolidou(?!\s+a\s+propriedade)|pacificou|uniformizou|sedimentou)\b/giu;

/**
 * A palavra de força da frase que o trecho do julgado não diz ("consolidou",
 * "entendimento pacífico"). Nulo quando a frase não tem força a mais ou quando o
 * próprio trecho fala nesses termos.
 */
export function forcaSemBase(afirmacao: string, trecho: string): string | null {
  const m = new RegExp(FORCA.source, "iu").exec(afirmacao);
  if (!m) return null;
  return /consolid|pac[íi]fic|dominante|uniformiz|sediment|reiterad|firme/iu.test(trecho) ? null : m[0];
}

/** A frase logo antes da marca do julgado: é ela que o julgado precisa sustentar. Sem frase no parágrafo, nulo. */
export function fraseAntesDaMarca(texto: string, inicioDaMarca: number): string | null {
  const paragrafo = texto.slice(texto.lastIndexOf("\n", inicioDaMarca - 1) + 1, inicioDaMarca).trim();
  const partes = paragrafo.split(/(?<=[.!?])\s+(?=[\p{Lu}"“(])/u).filter(Boolean);
  return partes.at(-1) ?? null;
}

/** Letras sem acento e em minúsculas, uma a uma: a posição no texto continua a mesma. */
const dobrar = (t: string) => t.replace(/\p{L}/gu, (c) => c.normalize("NFD")[0]!).toLowerCase();

/** A frase em volta do trecho. "art. 14" e "1.737" não terminam frase: o ponto precisa vir antes de um começo de frase. */
function fraseEmVolta(texto: string, inicio: number, fim: number): string {
  const antes = texto.slice(0, inicio);
  let de = 0;
  for (const m of antes.matchAll(/[.!?]\s+(?=[\p{Lu}"“(])|\n/gu)) de = m.index! + m[0].length;
  const depois = /[.!?](?=\s+[\p{Lu}"“(]|\s*$)|\n/u.exec(texto.slice(fim));
  return texto.slice(de, depois ? fim + depois.index + depois[0].length : texto.length);
}

const NOME_CURTO_DEMAIS = 4;
const JANELA_DA_QUALIFICACAO = 200;
const FISICA = /pessoa fisica|\bcpf\b|portador|solteir|casad[oa]\b|divorciad|viuv/;
const JURIDICA = /pessoa juridica|\bcnpj\b|razao social|sociedade empres/;
const PAPEIS_ATIVOS = /^,?\s*(?:ja qualificad[oa]\s*,?\s*)?(autora?|requerente|reclamante|exequente)\b/;
const PAPEIS_PASSIVOS = /^,?\s*(?:ja qualificad[oa]\s*,?\s*)?(re|reu|requerid[oa]|reclamad[oa]|executad[oa])\b/;

function qualificacao(texto: string, partes: readonly ParteDoCadastro[]): Achado[] {
  const dobrado = dobrar(texto);
  const achados: Achado[] = [];
  const nomes = partes.map((p) => dobrar(p.nome.trim())).filter((n) => n.length >= NOME_CURTO_DEMAIS);
  for (const parte of partes) {
    const nome = dobrar(parte.nome.trim());
    if (nome.length < NOME_CURTO_DEMAIS) continue;
    let de = dobrado.indexOf(nome);
    let avisou = false;
    while (de >= 0 && !avisou) {
      const depois = de + nome.length;
      // A qualificação desta parte vai até o fim da frase, a próxima parte ou o representante dela.
      let janela = dobrado.slice(depois, depois + JANELA_DA_QUALIFICACAO);
      const corte = janela.search(/[.!?](?=\s+[a-z"“(]|\s*$)|\n|\brepresentad[oa]\b|\bem face d|\bcontra\b/);
      if (corte >= 0) janela = janela.slice(0, corte);
      for (const outro of nomes) {
        const i = outro === nome ? -1 : janela.indexOf(outro);
        if (i >= 0) janela = janela.slice(0, i);
      }
      const original = texto.slice(de, depois);
      const ativo = PAPEIS_ATIVOS.exec(janela)?.[1];
      const passivo = PAPEIS_PASSIVOS.exec(janela)?.[1];
      if (parte.tipo === "pj" && FISICA.test(janela)) {
        achados.push({ tipo: "qualificacao", trecho: original, inicio: de, mensagem: `O cadastro diz que ${parte.nome} é pessoa jurídica, e a peça a qualifica como pessoa física.` });
        avisou = true;
      } else if (parte.tipo === "pf" && JURIDICA.test(janela)) {
        achados.push({ tipo: "qualificacao", trecho: original, inicio: de, mensagem: `O cadastro diz que ${parte.nome} é pessoa física, e a peça a qualifica como pessoa jurídica.` });
        avisou = true;
      } else if (parte.polo === "passivo" && ativo) {
        achados.push({ tipo: "qualificacao", trecho: original, inicio: de, mensagem: `O cadastro põe ${parte.nome} no polo passivo, e a peça a chama de "${ativo}".` });
        avisou = true;
      } else if (parte.polo === "ativo" && passivo) {
        achados.push({ tipo: "qualificacao", trecho: original, inicio: de, mensagem: `O cadastro põe ${parte.nome} no polo ativo, e a peça a chama de "${passivo}".` });
        avisou = true;
      }
      de = dobrado.indexOf(nome, depois);
    }
  }
  return achados;
}

export function checarPeca(texto: string, opcoes: { partes?: readonly ParteDoCadastro[] } = {}): PontoDaPeca[] {
  const achados: Achado[] = [];

  for (const m of texto.matchAll(/\[(COMPLETAR|A COMPROVAR|JURISPRUD[ÊE]NCIA)\s*:?\s*([^\]\n]*)\]/g)) {
    const falta = m[2]!.trim();
    if (m[1] === "COMPLETAR") achados.push({ tipo: "completar", trecho: m[0], inicio: m.index!, mensagem: falta ? `Falta completar: ${falta}.` : "Falta completar este ponto." });
    else if (m[1] === "A COMPROVAR") achados.push({ tipo: "a_comprovar", trecho: m[0], inicio: m.index!, mensagem: falta ? `Fato a comprovar: ${falta}.` : "Fato a comprovar." });
    else achados.push({ tipo: "jurisprudencia", trecho: m[0], inicio: m.index!, mensagem: falta ? `Falta o julgado sobre: ${falta}.` : "Falta o julgado deste ponto." });
  }

  for (const re of MARCAS_INTERNAS) for (const m of texto.matchAll(re)) achados.push({ tipo: "marca_interna", trecho: m[0], inicio: m.index!, mensagem: "Marca interna no texto. Apague antes de protocolar." });

  for (const m of texto.matchAll(/\[([^\]\n]{0,300})\]/g)) {
    if (/^(?:COMPLETAR|A COMPROVAR|JURISPRUD[ÊE]NCIA)/.test(m[1]!)) continue;
    if (ehCampoEmBranco(m[1]!)) achados.push({ tipo: "colchete", trecho: m[0], inicio: m.index!, mensagem: `Campo sem preencher: ${m[0]}.` });
  }

  for (const [re, mensagem] of CAMPO_VAZIO) for (const m of texto.matchAll(re)) achados.push({ tipo: "campo_vazio", trecho: m[0], inicio: m.index!, mensagem });

  for (const m of texto.matchAll(PREPOSICAO_SOLTA)) {
    if (m[2] === "," && APOSTO_FECHADO.test(texto.slice(m.index! + m[0].length))) continue;
    achados.push({ tipo: "frase_quebrada", trecho: m[0], inicio: m.index!, mensagem: `Frase quebrada: falta o que vem depois de "${m[1]}".` });
  }
  for (const m of texto.matchAll(DATA_E_VERBO)) achados.push({ tipo: "frase_quebrada", trecho: m[0], inicio: m.index!, mensagem: "Frase quebrada: falta a data." });
  for (const b of blocosComPosicao(texto)) {
    if (b.tipo !== "paragrafo" || b.texto.split(/\s+/).length < PALAVRAS_DO_PARAGRAFO_LONGO) continue;
    const m = FIM_CORTADO.exec(b.texto);
    if (m) achados.push({ tipo: "frase_quebrada", trecho: m[0], inicio: b.fim - m[0].length, mensagem: "O parágrafo termina no meio da frase." });
  }

  for (const m of texto.matchAll(FORCA)) {
    const frase = fraseEmVolta(texto, m.index!, m.index! + m[0].length);
    const citaJulgado = extrairCitacoes(frase).some((c) => c.tipo !== "dispositivo");
    if (citaJulgado || /\[JURISPRUD[ÊE]NCIA/.test(frase)) continue;
    achados.push({ tipo: "forca_sem_citacao", trecho: m[0], inicio: m.index!, mensagem: `"${m[0]}" sem julgado que sustente. Cite do acervo ou tire a palavra.` });
  }

  if (opcoes.partes?.length) achados.push(...qualificacao(texto, opcoes.partes));

  // Um trecho pode cair em duas regras: fica a que começa antes (e, empatando, a mais longa).
  const ordenados = achados.sort((a, b) => a.inicio - b.inicio || b.trecho.length - a.trecho.length);
  const saida: PontoDaPeca[] = [];
  let ate = 0;
  for (const a of ordenados) {
    if (a.inicio < ate) continue;
    ate = a.inicio + a.trecho.length;
    saida.push({ ...a, fim: ate });
  }
  return saida;
}
