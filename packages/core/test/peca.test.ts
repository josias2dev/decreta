import { describe, expect, test } from "bun:test";
import { blocosComPosicao, lacunas, limparParaDocx, trechos } from "../src/peca.ts";

describe("lacunas da peça", () => {
  test("conta os trechos a completar e a jurisprudência a buscar, em qualquer linha", () => {
    const texto = "# Excelentíssimo Senhor Doutor Juiz\n\nO dano soma [COMPLETAR: valor atualizado].\n\nRequer a procedência. [JURISPRUDÊNCIA: responsabilidade objetiva]\n\n[COMPLETAR: nome do advogado e OAB]";
    expect(lacunas(texto)).toBe(3);
  });

  test("texto completo e colchete comum não contam", () => {
    expect(lacunas("Conforme o laudo [evento 87], o nexo está provado. **Requer** o julgamento.")).toBe(0);
  });
});

describe("marcas de revisão", () => {
  test("a comprovar e o campo em branco ficam marcados e contam como lacuna", () => {
    expect(trechos("A ré entregou [A COMPROVAR: comprovante] com CNPJ [CNPJ] [evento 87].")).toEqual([
      { texto: "A ré entregou " },
      { texto: "[A COMPROVAR: comprovante]", marcar: true, negrito: true },
      { texto: " com CNPJ " },
      { texto: "[CNPJ]", marcar: true, negrito: true },
      { texto: " [evento 87]." },
    ]);
    expect(lacunas("[A COMPROVAR: comprovante]\n\n[cidade], [data].")).toBe(3);
  });

  test("o colchete comum não parte o texto", () => {
    expect(trechos("Laudo [evento 87] e citação [...] e [sic].")).toEqual([{ texto: "Laudo [evento 87] e citação [...] e [sic]." }]);
  });
});

describe("o texto que sai no DOCX", () => {
  test("a comprovar vira completar", () => {
    expect(limparParaDocx("A ré entregou [A COMPROVAR: comprovante de entrega].")).toBe("A ré entregou [COMPLETAR: comprovante de entrega].");
    expect(limparParaDocx("Sem dizer o quê [A COMPROVAR].")).toBe("Sem dizer o quê [COMPLETAR: fato a comprovar].");
  });

  test("as marcas internas somem, e o que estava dentro da etiqueta fica", () => {
    expect(limparParaDocx('Nesse sentido, <mention id="j1">o STJ</mention> decidiu.')).toBe("Nesse sentido, o STJ decidiu.");
    expect(limparParaDocx("Texto.\n\n[A geração parou no meio. Gere de novo ou continue editando.]")).toBe("Texto.\n\n");
  });

  test("a referência aos autos fica; o nome do arquivo sem evento, não", () => {
    expect(limparParaDocx('O laudo diz 40% (evento 87, fl. 3). A compra foi em 10/09 (documento "peticao.pdf", fl. 1). O aviso chegou (documento “carta.pdf”).')).toBe("O laudo diz 40% (evento 87, fl. 3). A compra foi em 10/09. O aviso chegou.");
  });

  test("as outras marcas de revisão ficam para aparecer em amarelo", () => {
    const texto = "Falta [COMPLETAR: valor], [JURISPRUDÊNCIA: tese] e [CPF].";
    expect(limparParaDocx(texto)).toBe(texto);
  });
});

describe("blocos com a posição no texto", () => {
  test("cada bloco diz onde começa e termina", () => {
    const texto = "# Juiz\n\nPrimeira linha\nsegunda linha\n\n- item\n\nFim.";
    const b = blocosComPosicao(texto);
    expect(b.map((x) => x.tipo)).toEqual(["enderecamento", "paragrafo", "item", "paragrafo"]);
    expect(b.map((x) => texto.slice(x.inicio, x.fim))).toEqual(["# Juiz", "Primeira linha\nsegunda linha", "- item", "Fim."]);
  });
});
