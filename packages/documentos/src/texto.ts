/**
 * Texto de um arquivo anexado (PDF ou DOCX), para a IA ler e a busca achar.
 * PDF escaneado sem camada de texto volta vazio: a tela avisa que precisa de
 * OCR em vez de a IA tirar conclusão de um documento que não leu.
 */
import { MARCA_DA_FOLHA } from "@decreta/core";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const MIMES_COM_TEXTO = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

/** Teto do texto guardado por documento (~150 páginas de petição). */
export const TETO_DO_TEXTO = 400_000;

export async function extrairTexto(bytes: Uint8Array, mime: string): Promise<string | null> {
  return (await lerDocumento(bytes, mime)).texto;
}

/** Texto e número de páginas (só PDF diz as páginas). */
export async function lerDocumento(bytes: Uint8Array, mime: string): Promise<{ texto: string | null; paginas: number | null }> {
  let texto: string | null = null;
  let paginas: number | null = null;
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(bytes.slice());
    paginas = pdf.numPages;
    const r = await extractText(pdf, { mergePages: false });
    const folhas = Array.isArray(r.text) ? r.text : [r.text];
    // Com mais de uma página, cada uma começa com "[fl. N]": a IA cita a folha e a tela abre nela.
    // Escaneado (nenhuma folha com texto) continua vazio, para a leitura pela IA entrar.
    const temTexto = folhas.some((t) => t.trim());
    texto = !temTexto ? "" : folhas.length > 1 ? folhas.map((t, i) => `${MARCA_DA_FOLHA(i + 1)}\n${t.trim()}`).join("\n\n") : (folhas[0] ?? "");
  } else if (mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    const r = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    texto = r.value;
  } else if (mime === "text/plain") {
    texto = new TextDecoder().decode(bytes);
  }
  if (texto === null) return { texto: null, paginas };
  const limpo = texto.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { texto: limpo.slice(0, TETO_DO_TEXTO), paginas };
}
