/**
 * O texto que a IA escreve num campo só chega à tela depois desta conferência:
 * data, valor, nome ou número que não está na fonte (o rascunho da pessoa e o
 * contexto que foi à IA) vira [a completar]. O prompt pede a mesma coisa; quem
 * garante é o código. O que ele não pega: número por extenso ("quinze dias") e
 * nome de uma palavra só no começo da frase.
 */
import { datasDe, valoresDe, type DataNoTexto } from "./conferencia-dos-fatos.ts";

/** Os campos que têm IA: uma rota e um componente só, e o campo diz o contexto e o prompt. */
export const CAMPOS_COM_IA = ["resultado-decisao", "mensagem-cliente", "instrucoes-peca", "resumo-atendimento", "observacoes"] as const;
export type CampoComIa = (typeof CAMPOS_COM_IA)[number];

export const MODOS_DO_CAMPO = ["escrever", "melhorar", "orientar"] as const;
export type ModoDoCampo = (typeof MODOS_DO_CAMPO)[number];

export const A_COMPLETAR = "[a completar]";

/** Como o modelo pode escrever a marca: "[A COMPLETAR]", "[completar: data]", "[a preencher]". */
const MARCA_DO_MODELO = /\[\s*(?:a\s+)?(?:completar|preencher|confirmar|informar)(?:\s*:[^\]\n]*)?\s*\]/giu;
const MARCA = /\[a completar\]/giu;

export interface PedacoDoTexto {
  texto: string;
  marca: boolean;
}

/** O texto em pedaços, com a marca à parte, para a tela destacar. */
export function pedacosDoTexto(texto: string): PedacoDoTexto[] {
  const pedacos: PedacoDoTexto[] = [];
  let de = 0;
  for (const m of texto.matchAll(MARCA)) {
    if (m.index > de) pedacos.push({ texto: texto.slice(de, m.index), marca: false });
    pedacos.push({ texto: m[0], marca: true });
    de = m.index + m[0].length;
  }
  if (de < texto.length) pedacos.push({ texto: texto.slice(de), marca: false });
  return pedacos;
}

export const contarACompletar = (texto: string) => [...texto.matchAll(MARCA)].length;

const LINK = /https?:\/\/\S*[\w/]|www\.\S*\w|\b[\w-]+\.(?:com|net|org|ly)(?:\.br)?\b(?:\/\S*\w)?/giu;
const ARTIGO = /\barts?\.?\s{0,3}\d+(?:\.\d+)*[º°]?(?:-[A-Z])?(?:\s{0,3},\s{0,3}§\s{0,3}\d+[º°]?)?(?:,(?=\s+d[oa]\s))?/giu;
const HORA = /(?<![\d:/.-])(\d{1,2})(?::(\d{2})|h(\d{2})?(?:min)?)(?![\p{L}\d])/giu;
const DATA_CURTA = /(?<![\d/.-])(\d{1,2})\/(\d{1,2})(?![\d/])/g;
/** "15 dias", "15 (quinze) dias": o fato que mais pesa, e por isso só vale escrito assim na fonte. */
const DIAS = /(?<![\d.,/-])(\d+)\s{0,3}(?:\([^)\n]{1,40}\)\s{0,3})?dias?(?![\p{L}\d])/giu;
const VALOR_EM_REAIS = /R\$\s*[\d.,]+/g;
const POR_CENTO = /(\d+(?:,\d+)?)\s{0,3}por\s+cento/giu;
const NUMERO = /\d+(?:[.,/:-]\d+)*/gu;
/** Data inteira: os pedaços dela não provam um número solto, só o ano. */
const FORMATO_DE_DATA = /^(?:\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|\d{1,2}[.-]\d{1,2}[.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/;
/** Ordinal de uso comum: não é fato do caso. */
const ORDINAL_COMUM = /^[º°ªao]?\s{1,3}(?:grau|via|inst[âa]ncia)(?![\p{L}\d])/iu;

const PALAVRA = String.raw`\p{Lu}[\p{Ll}'’-]+`;
const NOME = new RegExp(String.raw`(?<![\p{L}\d])${PALAVRA}(?:[^\S\n]+(?:(?:de|da|do|dos|das|e)[^\S\n]+)?${PALAVRA})*(?![\p{L}\d])`, "gu");
const SO_AS_PALAVRAS = new RegExp(PALAVRA, "gu");
const COMECO_DE_FRASE = /(?:^|[.!?:;)("“'‘\n]\s*|^\s*[-*•]\s*)$/;

/** O que se escreve com letra maiúscula sem ser nome de gente ou de empresa. Comparado sem acento e em minúsculas. */
const COMUNS = new Set(
  `tribunal tribunais justica vara civel criminal trabalho federal estadual superior supremo regional comarca juiz juiza juizo juizado especial turma camara desembargador desembargadora relator relatora ministro ministra
  ministerio publico publica defensoria procuradoria fazenda previdencia social secretaria cartorio forum codigo civil processo penal consumidor constituicao lei decreto sumula tema artigo
  recurso apelacao agravo embargos contestacao replica sentenca acordao decisao despacho intimacao audiencia perito pericia laudo peticao
  advogado advogada escritorio cliente autor autora reu parte partes senhor senhora doutor doutora dr dra sr sra excelentissimo prezado prezada ola bom boa dia tarde noite atenciosamente
  whatsapp decreta pix resumo pedidos documentos pendentes proximos passos diario oficial uniao estado municipio nacional
  segunda terca quarta quinta sexta sabado domingo janeiro fevereiro marco abril maio junho julho agosto setembro outubro novembro dezembro`
    .split(/\s+/),
);

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

const semZeros = (d: string) => d.replace(/^0+(?=\d)/, "");

const digitos = (t: string) => semZeros(t.replace(/\D/g, ""));

/** Os números da fonte, cada um inteiro: com e sem os centavos. De uma data, só o ano; de uma hora, nada: os pedaços não provam outro número. */
function numerosDe(fonte: string): Set<string> {
  const numeros = new Set<string>();
  for (const [token] of fonte.replace(HORA, " ").matchAll(NUMERO)) {
    if (FORMATO_DE_DATA.test(token)) {
      const ano = /\d{4}/.exec(token);
      if (ano) numeros.add(ano[0]);
      continue;
    }
    numeros.add(digitos(token));
    numeros.add(digitos(token.replace(/[,.]\d{1,2}$/, "")));
  }
  return numeros;
}

/** Todas as datas, também o dd/mm sem preposição antes: "Prevista para 20/05" é data. */
function todasAsDatas(t: string): DataNoTexto[] {
  const curtas = [...t.matchAll(DATA_CURTA)].filter((m) => Number(m[1]) >= 1 && Number(m[1]) <= 31 && Number(m[2]) >= 1 && Number(m[2]) <= 12);
  return [...datasDe(t), ...curtas.map((m) => ({ texto: m[0], inicio: m.index, dia: Number(m[1]), mes: Number(m[2]), ano: null }))];
}

/** As chaves dos valores da fonte, entendendo "30 por cento" como 30%. */
function valoresDaFonte(fonte: string): Set<string> {
  const porCento = [...fonte.matchAll(POR_CENTO)].map((m) => `p:${Number(m[1]!.replace(",", "."))}`);
  return new Set([...valoresDe(fonte).map((v) => v.chave), ...porCento]);
}

/** "R$ 1.200" quando o rascunho diz só "1.200". Número pequeno não conta: "15" pode ser qualquer outra coisa. */
function valorEscritoSemOSimbolo(valor: string, soltos: Set<string>): boolean {
  const [inteiro, centavos] = valor.replace(/^R\$\s*/, "").split(",");
  const semCentavos = digitos(inteiro!);
  if (semCentavos.length < 3) return false;
  return soltos.has(digitos(valor)) || ((!centavos || /^0+$/.test(centavos)) && soltos.has(semCentavos));
}

const horaDe = (m: RegExpMatchArray) => `${semZeros(m[1]!)}:${m[2] ?? m[3] ?? "00"}`;
const horasDe = (fonte: string) => new Set([...fonte.matchAll(HORA)].map(horaDe));

const palavrasDe = (fonte: string) => new Set(semAcento(fonte).split(/[^\p{L}\d]+/u));

export interface TextoConferido {
  texto: string;
  /** O que saiu do texto, na ordem em que estava. */
  trocados: string[];
  aCompletar: number;
}

interface Achado {
  inicio: number;
  fim: number;
  texto: string;
  naFonte: boolean;
}

/**
 * `rascunho` é o que a pessoa escreveu; `contexto`, o que veio dos autos. Só o
 * rascunho autoriza link: texto de documento pode ter sido escrito para enganar a IA.
 */
export function conferirTextoDoCampo(bruto: string, fontes: { rascunho: string; contexto?: string }): TextoConferido {
  const texto = bruto.replace(MARCA_DO_MODELO, A_COMPLETAR);
  const fonte = `${fontes.rascunho}\n${fontes.contexto ?? ""}`;
  const datas = todasAsDatas(fonte);
  const valores = valoresDaFonte(fonte);
  const numeros = numerosDe(fonte);
  const numerosSemReais = numerosDe(fonte.replace(VALOR_EM_REAIS, " "));
  const diasDaFonte = new Set([...fonte.matchAll(DIAS)].map((m) => semZeros(m[1]!)));
  const horas = horasDe(fonte);
  const palavras = palavrasDe(fonte);
  const rascunho = semAcento(fontes.rascunho);
  const estaNaFonte = (trecho: string) => (trecho.match(NUMERO) ?? []).every((n) => numeros.has(digitos(n)));

  // Os mais específicos primeiro: o que já foi achado não é lido de novo como número solto.
  const achados: Achado[] = [];
  const tomados: [number, number][] = [...texto.matchAll(MARCA)].map((m) => [m.index, m.index + m[0].length]);
  const achar = (inicio: number, trecho: string, naFonte: boolean) => {
    const fim = inicio + trecho.length;
    if (tomados.some(([a, b]) => inicio < b && fim > a)) return;
    tomados.push([inicio, fim]);
    achados.push({ inicio, fim, texto: trecho, naFonte });
  };

  for (const m of texto.matchAll(LINK)) achar(m.index, m[0], rascunho.includes(semAcento(m[0])));
  for (const m of texto.matchAll(ARTIGO)) achar(m.index, m[0], estaNaFonte(m[0]));
  for (const d of todasAsDatas(texto)) achar(d.inicio, d.texto, datas.some((o) => o.dia === d.dia && o.mes === d.mes && (d.ano === null || o.ano === null || o.ano === d.ano)));
  for (const v of valoresDe(texto)) achar(v.inicio, v.texto, valores.has(v.chave) || (v.chave.startsWith("r:") && valorEscritoSemOSimbolo(v.texto, numerosSemReais)));
  for (const m of texto.matchAll(HORA)) achar(m.index, m[0], horas.has(horaDe(m)));
  for (const m of texto.matchAll(DIAS)) achar(m.index, m[1]!, diasDaFonte.has(semZeros(m[1]!)));
  for (const m of texto.matchAll(NUMERO)) {
    const depois = texto.slice(m.index + m[0].length, m.index + m[0].length + 16);
    // "1." e "2)" no começo da linha são numeração de lista.
    const noComecoDaLinha = !texto.slice(texto.lastIndexOf("\n", m.index) + 1, m.index).trim();
    if ((noComecoDaLinha && /^[.)]\s/.test(depois)) || ORDINAL_COMUM.test(depois)) continue;
    achar(m.index, m[0], estaNaFonte(m[0]));
  }
  for (const m of texto.matchAll(NOME)) {
    const nomes = m[0].match(SO_AS_PALAVRAS)!;
    const comeco = COMECO_DE_FRASE.test(texto.slice(Math.max(0, m.index - 3), m.index));
    // No começo da frase, a primeira palavra pode ser só a maiúscula de costume.
    const aConferir = comeco ? nomes.slice(1) : nomes;
    achar(m.index, m[0], aConferir.every((n) => COMUNS.has(semAcento(n)) || palavras.has(semAcento(n))));
  }

  const fora = achados.filter((a) => !a.naFonte).sort((a, b) => a.inicio - b.inicio);
  let saida = "";
  let de = 0;
  for (const a of fora) {
    saida += texto.slice(de, a.inicio) + A_COMPLETAR;
    de = a.fim;
  }
  saida += texto.slice(de);
  return { texto: saida, trocados: fora.map((a) => a.texto), aCompletar: contarACompletar(saida) };
}
