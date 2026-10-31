/**
 * Higiene de documento: comandos escondidos para IA. Petição com prompt
 * oculto para manipular a IA do tribunal já rendeu multa e ofício à OAB; o
 * mesmo truque pode mirar a IA do escritório num documento da parte
 * contrária. Aqui se procura o que a pessoa não vê e a máquina lê: texto
 * marcado como oculto, fonte branca, fonte minúscula, texto invisível do PDF,
 * instrução nas propriedades do arquivo ou no código de um campo do Word e
 * frases que falam com uma IA.
 *
 * Achar não bloqueia nada: a tela avisa, e o texto continua indo à IA como
 * dado, nunca como instrução.
 */
import JSZip from "jszip";
import { getDocumentProxy, getResolvedPDFJS } from "unpdf";

export type TipoDeAchado = "texto_oculto" | "fonte_branca" | "fonte_minuscula" | "texto_invisivel" | "codigo_de_campo" | "metadados" | "comando_para_ia";

export interface AchadoNoDocumento {
  tipo: TipoDeAchado;
  /** O texto escondido (ou a frase suspeita), cortado para caber num aviso. */
  trecho: string;
}

const semAcento = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const IA = String.raw`(ia|inteligencia artificial|modelo de linguagem|llm|chatgpt|gpt|gemini|claude|copilot|assistente virtual|assistente de ia)`;

/** Lidos sobre o texto sem acento e em minúsculas. */
const PADROES: readonly RegExp[] = [
  // "Ignore as instruções anteriores", "desconsidere as orientações acima".
  /\b(ignor|desconsider|esquec)\w* (de )?(todas |todos )?(as |os )?(instrucoes|orientacoes|regras|comandos|ordens|mensagens) (anteriores|acima|previas|precedentes)\b/,
  /\b(ignore|disregard|forget)\b.{0,20}\b(previous|prior|above|earlier)\b.{0,20}\b(instructions|prompts|messages|rules)\b/,
  // "Se você for uma IA", "caso este texto seja lido por inteligência artificial".
  new RegExp(String.raw`\b(se|caso) (voce|este texto|este documento|esta peca)\b.{0,40}\b(for|seja|e|esteja)\b.{0,30}\b${IA}\b`),
  new RegExp(String.raw`\b(voce|vc) e (um|uma) ${IA}\b`),
  // "Instrução para a IA", "nota ao assistente virtual".
  new RegExp(String.raw`\b(instrucao|instrucoes|nota|mensagem|aviso|recado|ordem)\b.{0,15}\b(para|ao|a)\b.{0,5}\b(${IA.slice(1, -1)}|modelo|assistente)\b`),
  // Vocativo no começo da frase: "Assistente de IA: resuma…".
  /^(assistente( virtual| de ia)?|ia|chatgpt|llm|claude|gemini|copilot)\s*[:,]/,
  /\b(if you are|you are|as) an? (ai|language model|llm|assistant|chatbot)\b/,
  /\b(note|instruction|message)s? (to|for) (the )?(ai|model|assistant|llm)\b/,
  /\b(system prompt|prompt do sistema)\b/,
];

const TETO_DO_TRECHO = 300;
const cortar = (t: string) => (t.length > TETO_DO_TRECHO ? `${t.slice(0, TETO_DO_TRECHO - 1).trimEnd()}…` : t);
const limpar = (t: string) => t.replace(/\s+/g, " ").trim();

/** As frases que falam com uma IA ou mandam ignorar instruções. */
export function comandosParaIa(texto: string): string[] {
  return texto
    .split(/(?<=[.!?;])\s+|\n+/)
    .map(limpar)
    .filter((f) => f && PADROES.some((p) => p.test(semAcento(f))))
    .map(cortar);
}

/** Texto escondido só vira aviso se for frase, não um rótulo branco num cabeçalho de tabela. */
const TEXTO_MINIMO_ESCONDIDO = 20;

function escondidos(tipo: TipoDeAchado, textos: string[]): AchadoNoDocumento[] {
  const t = limpar(textos.join(" "));
  return t && (t.length >= TEXTO_MINIMO_ESCONDIDO || comandosParaIa(t).length) ? [{ tipo, trecho: cortar(t) }] : [];
}

/** Onde texto escondido é comum e inocente (campo do Word, camada de OCR, faixa colorida no PDF): só a frase que fala com uma IA vira aviso. */
const soComandos = (tipo: TipoDeAchado, textos: string[]): AchadoNoDocumento[] => comandosParaIa(textos.join("\n")).map((trecho) => ({ tipo, trecho }));

const visivel = (textos: string[]): AchadoNoDocumento[] => soComandos("comando_para_ia", textos);

export async function varrerDocumento(bytes: Uint8Array, mime: string): Promise<AchadoNoDocumento[]> {
  if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return varrerDocx(bytes);
  if (mime === "application/pdf") return varrerPdf(bytes);
  if (mime === "text/plain") return visivel([new TextDecoder().decode(bytes)]);
  return [];
}

const ENTIDADES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decodificar = (xml: string) => xml.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === "#" ? String.fromCodePoint(Number(e[1] === "x" ? `0${e.slice(1)}` : e.slice(1))) : (ENTIDADES[e] ?? m)));

/** Cor quase branca (FFFFFF, FEFEFE): some no papel branco. */
const quaseBranca = (hex: string) => /^[0-9a-f]{6}$/i.test(hex) && [0, 2, 4].every((i) => Number.parseInt(hex.slice(i, i + 2), 16) >= 0xf0);

async function varrerDocx(bytes: Uint8Array): Promise<AchadoNoDocumento[]> {
  const zip = await JSZip.loadAsync(bytes);
  const partes = Object.keys(zip.files).filter((n) => /^word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(n));
  const oculto: string[] = [];
  const branco: string[] = [];
  const minusculo: string[] = [];
  const paragrafos: string[] = [];
  /** O código dos campos (QUOTE, DOCPROPERTY, HYPERLINK…): o Word imprime o resultado, não o código. */
  const campos: string[] = [];
  const codigo = (t: string) => limpar(decodificar(t).replace(/_/g, " "));
  for (const nome of partes.sort()) {
    const xml = await zip.file(nome)!.async("string");
    for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
      const instrucoes = [...p.matchAll(/<w:instrText(?: [^>]*)?>([^<]*)<\/w:instrText>/g)].map((m) => m[1]).join("");
      if (instrucoes.trim()) campos.push(codigo(instrucoes));
      for (const m of p.matchAll(/<w:fldSimple [^>]*w:instr="([^"]*)"/g)) campos.push(codigo(m[1]!));
      let linha = "";
      for (const r of p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? []) {
        const texto = decodificar((r.match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
        if (!texto) continue;
        const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(r)?.[1] ?? "";
        const cor = /<w:color w:val="([0-9A-Fa-f]{6})"/.exec(props)?.[1];
        const fundo = /<w:(highlight w:val|shd [^>]*w:fill)="([^"]+)"/.exec(props)?.[2];
        const tamanho = Number(/<w:sz w:val="(\d+)"/.exec(props)?.[1] ?? 99);
        // Tamanho em meios-pontos: 4 é 2 pt, ilegível no papel.
        if (/<w:(spec)?[vV]anish(?: w:val="(true|1|on)")?\/>/.test(props)) oculto.push(texto);
        else if (cor && quaseBranca(cor) && (!fundo || fundo === "auto" || fundo === "none" || quaseBranca(fundo) || fundo === "white")) branco.push(texto);
        else if (tamanho <= 4) minusculo.push(texto);
        else linha += texto;
      }
      paragrafos.push(linha);
    }
  }
  const propriedades: string[] = [];
  for (const nome of ["docProps/core.xml", "docProps/custom.xml", "docProps/app.xml"]) {
    const xml = await zip.file(nome)?.async("string");
    if (xml) propriedades.push(...(xml.match(/>[^<]+</g) ?? []).map((t) => decodificar(t.slice(1, -1))));
  }
  return [
    ...escondidos("texto_oculto", oculto),
    ...escondidos("fonte_branca", branco),
    ...escondidos("fonte_minuscula", minusculo),
    ...campos.flatMap((c) => soComandos("codigo_de_campo", [c])),
    ...propriedades.flatMap((p) => comandosParaIa(p)).map((trecho) => ({ tipo: "metadados" as const, trecho })),
    ...visivel(paragrafos),
  ];
}

/** Abaixo de 2 pt, ninguém lê no papel. */
const FONTE_MINIMA_PDF = 2;

/** Modos de texto do PDF que pintam com a cor de preenchimento (0, 2, 4, 6); 3 e 7 não pintam nada. */
const PREENCHE = new Set([0, 2, 4, 6]);
const INVISIVEL = new Set([3, 7]);

async function varrerPdf(bytes: Uint8Array): Promise<AchadoNoDocumento[]> {
  const pdf = await getDocumentProxy(bytes.slice());
  const { OPS } = await getResolvedPDFJS();
  const minusculo: string[] = [];
  const linhas: string[] = [];
  const branco: string[] = [];
  const invisivel: string[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n);
    const conteudo = await pagina.getTextContent();
    for (const item of conteudo.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const altura = Math.hypot(item.transform[2] ?? 0, item.transform[3] ?? 0);
      (altura < FONTE_MINIMA_PDF ? minusculo : linhas).push(item.str);
    }
    // A cor e o modo do texto, que o getTextContent não dá: o estado gráfico segue os operadores, com q/Q.
    const ops = await pagina.getOperatorList();
    let estado = { cor: "#000000", modo: 0 };
    const pilha: (typeof estado)[] = [];
    ops.fnArray.forEach((fn, i) => {
      const args = ops.argsArray[i] as unknown[];
      if (fn === OPS.save) pilha.push(estado);
      else if (fn === OPS.restore) estado = pilha.pop() ?? estado;
      else if (fn === OPS.setFillRGBColor) estado = { ...estado, cor: String(args[0]) };
      else if (fn === OPS.setTextRenderingMode) estado = { ...estado, modo: Number(args[0]) };
      else if (fn === OPS.showText || fn === OPS.showSpacedText) {
        const texto = (args[0] as unknown[]).map((g) => (g && typeof g === "object" && "unicode" in g ? String(g.unicode) : "")).join("");
        if (INVISIVEL.has(estado.modo)) invisivel.push(texto);
        else if (PREENCHE.has(estado.modo) && quaseBranca(estado.cor.replace("#", ""))) branco.push(texto);
      }
    });
  }
  // No PDF não dá para saber o fundo (texto branco em faixa colorida é comum), e o escaneado traz o OCR invisível: só comando vira aviso.
  const escondidosNoPdf = [...soComandos("fonte_branca", branco), ...soComandos("texto_invisivel", invisivel)];
  const jaAvisado = (trecho: string) => escondidosNoPdf.some((e) => trecho.includes(e.trecho) || e.trecho.includes(trecho));
  return [...escondidos("fonte_minuscula", minusculo), ...escondidosNoPdf, ...visivel([linhas.join(" ")]).filter((a) => !jaAvisado(a.trecho))];
}
