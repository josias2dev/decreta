import { describe, expect, test } from "bun:test";
import { armazenamentoEmDisco, armazenamentoEmMemoria, blocos, extrairTexto, gerarDocx, MIME_DOCX, nomeDoArquivo, trechos } from "../src/index.ts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PECA = `# Excelentíssimo Senhor Doutor Juiz de Direito da 2ª Vara Cível da Comarca de Joinville

Autos n. 5004321-25.2026.8.24.0038

**Marina Duarte**, já qualificada nos autos, vem manifestar-se sobre o laudo pericial do evento 87.

## I – Do laudo

O perito concluiu pela incapacidade parcial e permanente.
A ré impugnou o laudo no evento 89 [COMPLETAR: resumo da impugnação].

## II – Dos pedidos

- a homologação do laudo;
- o julgamento antecipado do mérito.

[cidade], [data].`;

describe("peça em Markdown", () => {
  test("blocos", () => {
    const b = blocos(PECA);
    expect(b.map((x) => x.tipo)).toEqual(["enderecamento", "paragrafo", "paragrafo", "secao", "paragrafo", "secao", "item", "item", "paragrafo"]);
    expect(b[4]).toMatchObject({ texto: "O perito concluiu pela incapacidade parcial e permanente. A ré impugnou o laudo no evento 89 [COMPLETAR: resumo da impugnação]." });
  });

  test("trechos com negrito e marcação para revisar", () => {
    expect(trechos("**Marina**, já *qualificada*, [COMPLETAR: CPF].")).toEqual([
      { texto: "Marina", negrito: true },
      { texto: ", já " },
      { texto: "qualificada", italico: true },
      { texto: ", " },
      { texto: "[COMPLETAR: CPF]", marcar: true, negrito: true },
      { texto: "." },
    ]);
  });
});

describe("DOCX no timbre", () => {
  test("gera um .docx válido com o texto, o timbre e a marcação amarela", async () => {
    const bytes = await gerarDocx({
      titulo: "Manifestação sobre laudo pericial",
      texto: PECA,
      timbre: { nome: "Souza & Mendes Advocacia", registro: "OAB/SC 1.234", endereco: "Rua das Palmeiras, 100, Joinville/SC", contato: "(47) 3000-0000" },
    });
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const texto = await extrairTexto(bytes, MIME_DOCX);
    expect(texto).toContain("EXCELENTÍSSIMO SENHOR DOUTOR JUIZ");
    expect(texto).toContain("I – DO LAUDO");
    expect(texto).toContain("a homologação do laudo;");
    const zip = new TextDecoder("latin1").decode(bytes);
    expect(zip).toContain("word/header1.xml");
  });

  test("nome do arquivo", () => {
    expect(nomeDoArquivo('Réplica: "Banco" / Ana')).toBe("Réplica Banco Ana.docx");
  });
});

describe("armazenamento", () => {
  test("disco não deixa sair da pasta", async () => {
    const dir = await mkdtemp(join(tmpdir(), "decreta-"));
    const a = armazenamentoEmDisco(dir);
    await a.put("org/doc", new Uint8Array([1, 2, 3]), "application/pdf");
    expect([...(await a.read("org/doc"))]).toEqual([1, 2, 3]);
    await expect(a.put("../fora", new Uint8Array([1]), "text/plain")).rejects.toThrow();
  });

  test("memória", async () => {
    const a = armazenamentoEmMemoria();
    await a.put("x", new Uint8Array([9]), "text/plain");
    expect(a.arquivos.get("x")?.mime).toBe("text/plain");
  });

  test("texto de .txt", async () => {
    expect(await extrairTexto(new TextEncoder().encode("linha  \n\n\n\nfim"), "text/plain")).toBe("linha\n\nfim");
    expect(await extrairTexto(new Uint8Array([1]), "image/png")).toBeNull();
  });
});

/** PDF mínimo com uma página de texto por item, montado à mão (sem biblioteca de PDF). */
function pdfDeTeste(paginas: string[]): Uint8Array {
  const objs: string[] = [];
  const kids = paginas.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs.push("<< /Type /Catalog /Pages 2 0 R >>");
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${paginas.length} >>`);
  objs.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  paginas.forEach((texto, i) => {
    const conteudo = `BT /F1 12 Tf 72 720 Td (${texto}) Tj ET`;
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`);
    objs.push(`<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`);
  });
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe("folhas do PDF", () => {
  test("PDF de várias páginas leva a marca de cada folha, para a IA citar a folha", async () => {
    const texto = await extrairTexto(pdfDeTeste(["Conclusao do perito", "Resposta aos quesitos"]), "application/pdf");
    expect(texto).toContain("[fl. 1]\nConclusao do perito");
    expect(texto).toContain("[fl. 2]\nResposta aos quesitos");
  });

  test("PDF de uma página fica sem marca", async () => {
    expect(await extrairTexto(pdfDeTeste(["Procuracao"]), "application/pdf")).toBe("Procuracao");
  });
});
