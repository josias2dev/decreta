/**
 * O tipo do arquivo pela assinatura dos primeiros bytes, não pelo que o
 * remetente declarou: no link de envio sem login, o cabeçalho é de quem manda.
 */
export type TipoAceito = "image/jpeg" | "image/png" | "image/webp" | "application/pdf";

/** O PDF pode ter lixo antes do cabeçalho; os leitores aceitam até 1 KB. */
const INICIO_DO_PDF = 1024;

const ascii = (b: Uint8Array, de: number, ate: number) => String.fromCharCode(...b.subarray(de, Math.min(ate, b.length)));

export function tipoPelosBytes(b: Uint8Array): TipoAceito | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  if (b.length >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WEBP") return "image/webp";
  if (b.length >= 5 && ascii(b, 0, INICIO_DO_PDF).includes("%PDF-")) return "application/pdf";
  return null;
}
