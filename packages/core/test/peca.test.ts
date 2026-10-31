import { describe, expect, test } from "bun:test";
import { lacunas } from "../src/peca.ts";

describe("lacunas da peça", () => {
  test("conta os trechos a completar e a jurisprudência a buscar, em qualquer linha", () => {
    const texto = "# Excelentíssimo Senhor Doutor Juiz\n\nO dano soma [COMPLETAR: valor atualizado].\n\nRequer a procedência. [JURISPRUDÊNCIA: responsabilidade objetiva]\n\n[COMPLETAR: nome do advogado e OAB]";
    expect(lacunas(texto)).toBe(3);
  });

  test("texto completo e colchete comum não contam", () => {
    expect(lacunas("Conforme o laudo [evento 87], o nexo está provado. **Requer** o julgamento.")).toBe(0);
  });
});
