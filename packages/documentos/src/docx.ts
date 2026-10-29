/**
 * Peça em DOCX no timbre do escritório (a lógica do Padronizador do
 * protótipo): A4, margens de 3 cm à esquerda e no alto e 2 cm à direita e
 * embaixo, corpo justificado com recuo de primeira linha e entrelinha 1,5,
 * cabeçalho com o nome (e o logo) do escritório e rodapé com endereço,
 * contato e número da página.
 *
 * O texto chega em Markdown simples, como a IA escreve e a tela edita:
 *   "# "  endereçamento (negrito, caixa alta, sem recuo, espaço depois)
 *   "## " título de seção (negrito, caixa alta)
 *   "### " subtítulo (negrito)
 *   "- "  item de lista;  "1. " item numerado
 *   **negrito**, *itálico* e [COMPLETAR: ...] (marcado em amarelo para revisar)
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  TabStopType,
  TextRun,
  convertMillimetersToTwip,
} from "docx";

export interface TimbreDoDocumento {
  nome: string;
  registro?: string;
  endereco?: string;
  contato?: string;
  fonte?: string;
  tamanho?: number;
  cor?: string;
  /** PNG do logo, com a largura e a altura em pixels. */
  logo?: { bytes: Uint8Array; largura: number; altura: number };
}

export interface PecaParaDocx {
  titulo: string;
  texto: string;
  timbre: TimbreDoDocumento;
}

const PRETO = "1C1C22";

type Trecho = { texto: string; negrito?: boolean; italico?: boolean; marcar?: boolean };

/** **negrito**, *itálico* e [COMPLETAR: ...] / [JURISPRUDÊNCIA: ...] em trechos. */
export function trechos(linha: string): Trecho[] {
  const saida: Trecho[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[(?:COMPLETAR|JURISPRUD[ÊE]NCIA)[^\]]*\])/g;
  let fim = 0;
  for (const m of linha.matchAll(re)) {
    if (m.index! > fim) saida.push({ texto: linha.slice(fim, m.index) });
    const t = m[0];
    if (t.startsWith("**")) saida.push({ texto: t.slice(2, -2), negrito: true });
    else if (t.startsWith("*")) saida.push({ texto: t.slice(1, -1), italico: true });
    else saida.push({ texto: t, marcar: true, negrito: true });
    fim = m.index! + t.length;
  }
  if (fim < linha.length) saida.push({ texto: linha.slice(fim) });
  return saida.filter((t) => t.texto.length > 0);
}

type Bloco =
  | { tipo: "enderecamento" | "secao" | "subtitulo"; texto: string }
  | { tipo: "paragrafo"; texto: string }
  | { tipo: "item"; texto: string; numerado: boolean };

export function blocos(markdown: string): Bloco[] {
  const saida: Bloco[] = [];
  let paragrafo: string[] = [];
  const fechar = () => {
    if (paragrafo.length) saida.push({ tipo: "paragrafo", texto: paragrafo.join(" ").trim() });
    paragrafo = [];
  };
  for (const bruta of markdown.replace(/\r/g, "").split("\n")) {
    const linha = bruta.trim();
    if (!linha) {
      fechar();
      continue;
    }
    const titulo = /^(#{1,3})\s+(.*)$/.exec(linha);
    if (titulo) {
      fechar();
      const nivel = titulo[1]!.length;
      saida.push({ tipo: nivel === 1 ? "enderecamento" : nivel === 2 ? "secao" : "subtitulo", texto: titulo[2]!.trim() });
      continue;
    }
    const item = /^(?:[-*•]|(\d+)[.)])\s+(.*)$/.exec(linha);
    if (item) {
      fechar();
      saida.push({ tipo: "item", texto: item[2]!.trim(), numerado: item[1] !== undefined });
      continue;
    }
    paragrafo.push(linha);
  }
  fechar();
  return saida;
}

function runs(texto: string, base: { font: string; size: number; maiusculas?: boolean; negrito?: boolean }): TextRun[] {
  return trechos(texto).map(
    (t) =>
      new TextRun({
        text: base.maiusculas ? t.texto.toLocaleUpperCase("pt-BR") : t.texto,
        bold: base.negrito || t.negrito,
        italics: t.italico,
        highlight: t.marcar ? "yellow" : undefined,
        font: base.font,
        size: base.size,
        color: PRETO,
      }),
  );
}

export async function gerarDocx(peca: PecaParaDocx): Promise<Uint8Array> {
  const { timbre } = peca;
  const font = timbre.fonte ?? "Arial";
  const size = Math.round((timbre.tamanho ?? 12) * 2);
  const cor = (timbre.cor ?? "2F2E38").replace("#", "").toUpperCase();
  const entrelinha = 360;

  const corpo: Paragraph[] = [];
  for (const b of blocos(peca.texto)) {
    switch (b.tipo) {
      case "enderecamento":
        corpo.push(new Paragraph({ children: runs(b.texto, { font, size, maiusculas: true, negrito: true }), spacing: { line: entrelinha, after: 720 } }));
        break;
      case "secao":
        corpo.push(new Paragraph({ children: runs(b.texto, { font, size, maiusculas: true, negrito: true }), spacing: { line: entrelinha, before: 240, after: 120 }, keepNext: true }));
        break;
      case "subtitulo":
        corpo.push(new Paragraph({ children: runs(b.texto, { font, size, negrito: true }), spacing: { line: entrelinha, before: 120, after: 120 }, keepNext: true }));
        break;
      case "item":
        corpo.push(
          new Paragraph({
            children: runs(b.texto, { font, size }),
            numbering: { reference: b.numerado ? "numerada" : "marcadores", level: 0 },
            alignment: AlignmentType.JUSTIFIED,
            spacing: { line: entrelinha, after: 80 },
          }),
        );
        break;
      default:
        corpo.push(
          new Paragraph({
            children: runs(b.texto, { font, size }),
            alignment: AlignmentType.JUSTIFIED,
            indent: { firstLine: convertMillimetersToTwip(25) },
            spacing: { line: entrelinha, after: 160 },
          }),
        );
    }
  }

  const cabecalho: Paragraph[] = [];
  const nome = new TextRun({ text: timbre.nome.toLocaleUpperCase("pt-BR"), bold: true, font, size: 22, color: cor, characterSpacing: 20 });
  const registro = timbre.registro ? [new TextRun({ text: `\t${timbre.registro}`, font, size: 16, color: "6B6A76" })] : [];
  cabecalho.push(
    new Paragraph({
      children: timbre.logo
        ? [
            new ImageRun({
              type: "png",
              data: timbre.logo.bytes,
              transformation: { width: Math.round((timbre.logo.largura / timbre.logo.altura) * 36), height: 36 },
            }),
            new TextRun({ text: "  " }),
            nome,
            ...registro,
          ]
        : [nome, ...registro],
      tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(160) }],
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: cor, space: 6 } },
      spacing: { after: 240 },
    }),
  );

  const rodapeLinha = [timbre.endereco, timbre.contato].filter(Boolean).join("  ·  ");
  const rodape = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: rodapeLinha, font, size: 15, color: "6B6A76" }),
          new TextRun({ children: ["\t", PageNumber.CURRENT, " de ", PageNumber.TOTAL_PAGES], font, size: 15, color: "6B6A76" }),
        ],
        tabStops: [{ type: TabStopType.RIGHT, position: convertMillimetersToTwip(160) }],
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: "D4D4DC", space: 6 } },
      }),
    ],
  });

  const doc = new Document({
    title: peca.titulo,
    creator: timbre.nome,
    description: "Gerado no Decreta",
    styles: { default: { document: { run: { font, size } } } },
    numbering: {
      config: [
        {
          reference: "marcadores",
          levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertMillimetersToTwip(10), hanging: convertMillimetersToTwip(5) } } } }],
        },
        {
          reference: "numerada",
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: convertMillimetersToTwip(10), hanging: convertMillimetersToTwip(6) } } } }],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: convertMillimetersToTwip(210), height: convertMillimetersToTwip(297) },
            margin: {
              top: convertMillimetersToTwip(30),
              left: convertMillimetersToTwip(30),
              right: convertMillimetersToTwip(20),
              bottom: convertMillimetersToTwip(20),
              header: convertMillimetersToTwip(12),
              footer: convertMillimetersToTwip(10),
            },
          },
        },
        headers: { default: new Header({ children: cabecalho }) },
        footers: { default: rodape },
        children: corpo,
      },
    ],
  });
  return new Uint8Array(await Packer.toBuffer(doc));
}

export const MIME_DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** "Manifestação sobre laudo – Marina Duarte.docx", sem caractere que o Windows recusa. */
export function nomeDoArquivo(titulo: string): string {
  return `${titulo.replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}.docx`;
}
