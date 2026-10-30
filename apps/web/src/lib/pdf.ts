/**
 * pdf.js, carregado só quando alguém abre um PDF. No servidor o worker é um
 * arquivo do build, e os decodificadores das imagens escaneadas (JBIG2, JPEG
 * 2000) ficam em /pdfjs/ (vite.config.ts). Na prévia, que é um HTML só, o
 * worker roda na própria página (previa/main.ts).
 */
import type * as Pdfjs from "pdfjs-dist";

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";

let carregando: Promise<typeof Pdfjs> | null = null;

export function carregarPdfjs(): Promise<typeof Pdfjs> {
  carregando ??= (async () => {
    const pdfjs = await import("pdfjs-dist");
    // A prévia (previa/main.ts) já deixou o worker na página.
    if (import.meta.env.MODE !== "previa") pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    return pdfjs;
  })().catch((erro: unknown) => {
    // Rede caiu no meio: a próxima tentativa carrega de novo.
    carregando = null;
    throw erro;
  });
  return carregando;
}

export async function abrirPdf(bytes: ArrayBuffer) {
  const pdfjs = await carregarPdfjs();
  // Os decodificadores ficam num endereço fixo do build (os nomes são os que o pdf.js procura).
  return pdfjs.getDocument({ data: new Uint8Array(bytes), wasmUrl: "/pdfjs/" });
}
