import { describe, expect, test } from "bun:test";
import JSZip from "jszip";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { armazenamentoEmDisco, armazenamentoEmMemoria, compactarEmZip } from "../src/index.ts";

const bytes = (...n: number[]) => new Uint8Array(n);

describe("apagar tudo de um escritório no armazenamento", () => {
  test("em memória, sai só o que começa com o prefixo inteiro, e volta quantos eram", async () => {
    const a = armazenamentoEmMemoria();
    for (const chave of ["org-a/doc1", "org-a/certidoes/p1.pdf", "org-a/exportacoes/e1/parte-1.zip", "org-b/doc1", "org-ab/doc1"]) await a.put(chave, bytes(1), "text/plain");
    expect(await a.apagarPrefixo("org-a/")).toBe(3);
    expect([...a.arquivos.keys()].sort()).toEqual(["org-ab/doc1", "org-b/doc1"]);
    expect(await a.apagarPrefixo("org-a/")).toBe(0);
  });

  test("em disco, a pasta do escritório some com as subpastas e as outras ficam", async () => {
    const dir = await mkdtemp(join(tmpdir(), "decreta-"));
    const a = armazenamentoEmDisco(dir);
    await a.put("org-a/doc1", bytes(1), "text/plain");
    await a.put("org-a/certidoes/p1.pdf", bytes(2), "application/pdf");
    await a.put("org-b/doc1", bytes(3), "text/plain");
    expect(await a.apagarPrefixo("org-a/")).toBe(2);
    expect(await readdir(dir)).toEqual(["org-b"]);
    expect([...(await a.read("org-b/doc1"))]).toEqual([3]);
    // Escritório que nunca guardou nada: nada a apagar, sem erro.
    expect(await a.apagarPrefixo("org-z/")).toBe(0);
  });

  test("prefixo que não é de um escritório só é recusado, para nunca apagar o armazenamento inteiro", async () => {
    const dir = await mkdtemp(join(tmpdir(), "decreta-"));
    for (const a of [armazenamentoEmDisco(dir), armazenamentoEmMemoria()]) {
      await a.put("org-a/doc1", bytes(1), "text/plain");
      for (const ruim of ["", "/", "org-a", "org-a/certidoes/", "../", "..", "./", "org a/", "org-a/../"]) await expect(a.apagarPrefixo(ruim)).rejects.toThrow(/prefixo/);
      expect([...(await a.read("org-a/doc1"))]).toEqual([1]);
    }
  });
});

describe("ZIP da exportação", () => {
  test("guarda os nomes com acento, o texto em UTF-8 e os bytes exatos dos arquivos", async () => {
    const pdf = bytes(37, 80, 68, 70, 0, 255, 128);
    const zip = await compactarEmZip([
      { nome: "planilhas/clientes.csv", conteudo: "nome;documento\nJosé da Conceição;12345678900\n" },
      { nome: "documentos/Procuração do João.pdf", conteudo: pdf, comprimir: false },
    ]);
    const lido = await JSZip.loadAsync(zip);
    expect(Object.keys(lido.files).sort()).toEqual(["documentos/Procuração do João.pdf", "planilhas/clientes.csv"]);
    expect(await lido.file("planilhas/clientes.csv")!.async("string")).toBe("nome;documento\nJosé da Conceição;12345678900\n");
    expect([...(await lido.file("documentos/Procuração do João.pdf")!.async("uint8array"))]).toEqual([...pdf]);
  });

  test("recusa nome que sairia da pasta ao extrair", async () => {
    for (const nome of ["../fora.txt", "/absoluto.txt", "a/../../fora.txt", "a\\b.txt", ""]) await expect(compactarEmZip([{ nome, conteudo: "x" }])).rejects.toThrow(/nome/);
  });
});
