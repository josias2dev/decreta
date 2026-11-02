/** O ajuste por conversa: as trocas aplicadas pelo código e o antes e depois, com o que saiu e o que entrou. */
import { describe, expect, test } from "bun:test";
import { aplicarTrocas, diferencas } from "../src/diferenca.ts";

describe("aplicar as trocas da IA", () => {
  test("só o trecho pedido muda; o resto fica letra por letra", () => {
    const antes = "# Juiz\n\nA ré entregou o produto.\n\nRequer a improcedência.";
    const r = aplicarTrocas(antes, [{ de: "entregou o produto", para: "entregou o produto em 05/10/2026" }]);
    expect(r).toEqual({ texto: "# Juiz\n\nA ré entregou o produto em 05/10/2026.\n\nRequer a improcedência.", naoAplicadas: [] });
  });

  test("o trecho que não está no texto não é aplicado e fica listado", () => {
    const r = aplicarTrocas("A ré entregou.", [
      { de: "o autor reclamou", para: "o autor não reclamou" },
      { de: "entregou", para: "cumpriu" },
    ]);
    expect(r).toEqual({ texto: "A ré cumpriu.", naoAplicadas: ["o autor reclamou"] });
  });

  test("o trecho copiado com outro espaço ou quebra de linha ainda casa", () => {
    const r = aplicarTrocas("A ré entregou\no produto no prazo.", [{ de: "entregou o  produto", para: "cumpriu" }]);
    expect(r.texto).toBe("A ré cumpriu no prazo.");
  });

  test("apareceu mais de uma vez: muda a primeira", () => {
    expect(aplicarTrocas("ré e ré", [{ de: "ré", para: "autora" }]).texto).toBe("autora e ré");
  });
});

describe("o antes e o depois", () => {
  test("mostra o que saiu e o que entrou, palavra por palavra, com o resto igual", () => {
    expect(diferencas("A ré entregou o produto no prazo.", "A ré entregou o aparelho fora do prazo.")).toEqual([
      { tipo: "igual", texto: "A ré entregou o " },
      { tipo: "removido", texto: "produto no" },
      { tipo: "adicionado", texto: "aparelho fora do" },
      { tipo: "igual", texto: " prazo." },
    ]);
  });

  test("parágrafo novo e parágrafo que sai", () => {
    expect(diferencas("Um.\n\nDois.\n\nTrês.", "Um.\n\nTrês.\n\nQuatro.")).toEqual([
      { tipo: "igual", texto: "Um.\n\n" },
      { tipo: "removido", texto: "Dois.\n\n" },
      { tipo: "igual", texto: "Três." },
      { tipo: "adicionado", texto: "\n\nQuatro." },
    ]);
  });

  test("textos iguais não têm diferença", () => {
    expect(diferencas("Igual.", "Igual.")).toEqual([{ tipo: "igual", texto: "Igual." }]);
  });

  test("juntar as partes dá os dois textos de volta, mesmo numa peça longa", () => {
    const paragrafo = (i: number) => `Parágrafo ${i} com umas palavras a mais para pesar no texto da peça.`;
    const antes = Array.from({ length: 800 }, (_, i) => paragrafo(i)).join("\n\n");
    const depois = antes.replace(paragrafo(400), "Parágrafo reescrito.").replace(paragrafo(100), `${paragrafo(100)} Frase nova.`);
    const partes = diferencas(antes, depois);
    expect(partes.filter((p) => p.tipo !== "adicionado").map((p) => p.texto).join("")).toBe(antes);
    expect(partes.filter((p) => p.tipo !== "removido").map((p) => p.texto).join("")).toBe(depois);
    expect(partes.filter((p) => p.tipo === "adicionado").map((p) => p.texto).join(" ")).toContain("Frase nova.");
  });
});
