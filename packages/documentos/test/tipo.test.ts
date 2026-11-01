/** O tipo do arquivo sai da assinatura dos bytes, não do que o remetente declarou. */
import { describe, expect, test } from "bun:test";
import { tipoPelosBytes } from "../src/index.ts";

const ascii = (s: string) => new TextEncoder().encode(s);

describe("tipo pelos bytes", () => {
  test("reconhece JPEG, PNG, WebP e PDF pela assinatura", () => {
    expect(tipoPelosBytes(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]))).toBe("image/jpeg");
    expect(tipoPelosBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))).toBe("image/png");
    expect(tipoPelosBytes(new Uint8Array([...ascii("RIFF"), 0x24, 0, 0, 0, ...ascii("WEBPVP8 ")]))).toBe("image/webp");
    expect(tipoPelosBytes(ascii("%PDF-1.7\n%âãÏÓ\n1 0 obj"))).toBe("application/pdf");
    // Alguns PDFs têm lixo antes do cabeçalho; o leitor tolera até 1 KB.
    expect(tipoPelosBytes(ascii(`${"\n".repeat(20)}%PDF-1.4`))).toBe("application/pdf");
  });

  test("executável, texto e arquivo vazio não são aceitos, seja qual for o nome", () => {
    expect(tipoPelosBytes(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBeNull();
    expect(tipoPelosBytes(ascii("<html><script>alert(1)</script>"))).toBeNull();
    expect(tipoPelosBytes(ascii("oi"))).toBeNull();
    expect(tipoPelosBytes(new Uint8Array())).toBeNull();
    // "%PDF-" longe demais do início não vale.
    expect(tipoPelosBytes(ascii(`${"x".repeat(2000)}%PDF-1.4`))).toBeNull();
  });
});
