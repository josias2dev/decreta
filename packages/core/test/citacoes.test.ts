import { describe, expect, test } from "bun:test";
import { extrairCitacoes } from "../src/citacoes.ts";

const chaves = (texto: string) => extrairCitacoes(texto).map((c) => c.chave);

describe("citações na peça", () => {
  test("súmulas, com ou sem nº, com 'do' ou barra, e a vinculante do STF", () => {
    const texto =
      "Aplica-se a Súmula 297 do STJ. Também a Súmula nº 479/STJ e a súmula n. 7 do STJ. " +
      "A Súmula Vinculante 13 veda o nepotismo, e a Súmula Vinculante nº 37 do STF também se aplica. Ver ainda a Súmula 331 do TST.";
    expect(chaves(texto)).toEqual(["sumula:STJ:297", "sumula:STJ:479", "sumula:STJ:7", "sumula_vinculante:STF:13", "sumula_vinculante:STF:37", "sumula:TST:331"]);
  });

  test("temas repetitivos do STJ e de repercussão geral do STF", () => {
    const texto =
      "Conforme o Tema 1.031 do STJ e o Tema Repetitivo nº 952/STJ. No STF, o Tema 69 da Repercussão Geral e o Tema nº 1.046 do STF.";
    expect(chaves(texto)).toEqual(["tema:STJ:1031", "tema:STJ:952", "tema:STF:69", "tema:STF:1046"]);
  });

  test("artigos de lei, com parágrafo e inciso, pelo nome ou pela sigla da norma", () => {
    const texto = [
      "Nos termos do art. 186 do CC e do art. 927, parágrafo único, do Código Civil,",
      "e do art. 5º, inciso X, da Constituição Federal, cabe indenização.",
      "A tutela segue o artigo 300 do CPC; os honorários, o art. 85, § 11, do CPC/2015; os embargos, o art. 1.022 do Código de Processo Civil.",
      "O fornecedor responde pelo art. 14 do CDC. O acesso à informação está no art. 8º, § 3º, III, da Lei nº 12.527/2011,",
      "e o benefício no art. 59 da Lei 8.213/91.",
    ].join(" ");
    expect(chaves(texto)).toEqual([
      "dispositivo:CC:art186",
      "dispositivo:CC:art927_par1u",
      "dispositivo:CF:art5_inc10",
      "dispositivo:CPC:art300",
      "dispositivo:CPC:art85_par11",
      "dispositivo:CPC:art1022",
      "dispositivo:CDC:art14",
      "dispositivo:LEI-12527-2011:art8_par3_inc3",
      "dispositivo:LEI-8213-1991:art59",
    ]);
  });

  test("precedentes pela classe e número, com a UF quando vem", () => {
    const texto =
      "Ver o REsp 1.737.412/SE, o AgInt no AREsp nº 1.234.567/SC e o AgRg no REsp 1.111.111. " +
      "No STF, o RE 574.706 e a ADI 3.159; o HC 126.292/SP também.";
    expect(chaves(texto)).toEqual([
      "precedente:REsp:1737412",
      "precedente:AgInt no AREsp:1234567",
      "precedente:AgRg no REsp:1111111",
      "precedente:RE:574706",
      "precedente:ADI:3159",
      "precedente:HC:126292",
    ]);
  });

  test("número CNJ só com o dígito verificador certo, e OJ da SBDI do TST", () => {
    const texto =
      // O primeiro tem o dígito verificador errado (56; o certo é 32): é digitação, não processo.
      "Como decidido nos autos 5001234-56.2024.8.24.0038 e no processo 0000001-26.2020.5.12.0001, " +
      "aplica-se a OJ 394 da SBDI-1 e a OJ nº 142 da SBDI-2.";
    expect(chaves(texto)).toEqual([
      "processo:00000012620205120001",
      "oj:SBDI-1:394",
      "oj:SBDI-2:142",
    ]);
  });

  test("artigo sem a norma não vira citação: não há o que conferir", () => {
    expect(chaves("Como dispõe o art. 5º, o prazo é de quinze dias, e o item 3 do contrato prevê multa.")).toEqual([]);
  });

  test("código revogado citado pelo ano antigo tem sigla própria: o artigo não é o do código atual", () => {
    expect(chaves("Nos termos do art. 159 do CC/16 e do art. 282 do CPC/73, e ainda do art. 300 do CPC/2015 e do art. 5º da CF/88.")).toEqual([
      "dispositivo:CC-1916:art159",
      "dispositivo:CPC-1973:art282",
      "dispositivo:CPC:art300",
      "dispositivo:CF:art5",
    ]);
  });

  test("milhares de espaços depois de um artigo solto, de uma súmula ou de um recurso não travam a leitura", () => {
    const muitos = " ".repeat(20_000);
    const texto = `art. 5${muitos}\nSúmula${muitos}7 do STJ e o REsp${muitos}1 e a Lei nº 8.213${muitos}/91`;
    const inicio = performance.now();
    chaves(texto);
    expect(performance.now() - inicio).toBeLessThan(500);
  });
});
