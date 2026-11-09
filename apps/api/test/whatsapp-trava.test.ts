/**
 * A trava da resposta do WhatsApp: toda data, número de processo, quantidade de dias e valor que a IA
 * escreve precisa estar no que as ferramentas devolveram naquele turno, em "Agora" ou no que a pessoa
 * escreveu. O que não estiver é apontado, e a resposta não sai.
 */
import { describe, expect, test } from "bun:test";
import { naoConferem } from "../src/whatsapp/trava.ts";

const TZ = "America/Sao_Paulo";
const confere = (resposta: string, ...fontes: string[]) => naoConferem(resposta, fontes, TZ);

describe("datas", () => {
  test("a data da ferramenta, que vem como 2026-12-03, confere com 03/12 na resposta", () => {
    expect(confere("A contestação vence 03/12.", '{"fim":"2026-12-03"}')).toEqual([]);
  });

  test("a data que não veio de nenhuma fonte é apontada", () => {
    expect(confere("A contestação vence 04/12.", '{"fim":"2026-12-03"}')).toEqual(["04/12"]);
  });

  test("com o ano, sem o zero e por extenso também confere", () => {
    expect(confere("Vence 03/12/2026, ou seja, 3/12, em 3 de dezembro.", '{"fim":"2026-12-03"}')).toEqual([]);
  });

  test("o instante vira o dia no fuso do escritório: 02h30 em UTC é 23h30 do dia anterior", () => {
    expect(confere("A audiência é 03/12 às 23h30.", '{"em":"2026-12-04T02:30:00.000Z"}')).toEqual([]);
  });

  test("a data que a pessoa escreveu e a de hoje (em Agora) conferem", () => {
    expect(confere("Hoje, 10/11, anotei a data de 05/12 que você mandou.", "Hoje é terça-feira, 10/11/2026.", "a data final é 05/12")).toEqual([]);
  });
});

describe("número do processo", () => {
  test("com ou sem a pontuação, o mesmo número confere", () => {
    expect(confere("O processo 5001234-56.2026.8.24.0023 está concluso.", '{"cnj":"50012345620268240023"}')).toEqual([]);
  });

  test("outro número é apontado", () => {
    expect(confere("O processo 5001234-56.2026.8.24.0099 está concluso.", '{"cnj":"5001234-56.2026.8.24.0023"}')).toEqual(["5001234-56.2026.8.24.0099"]);
  });
});

describe("quantidade de dias", () => {
  test("os dias da ferramenta conferem", () => {
    expect(confere("São 15 dias úteis.", '{"dias":15,"contagem":"uteis"}')).toEqual([]);
  });

  test("o prazo escrito no teor da publicação, com o número por extenso, também", () => {
    expect(confere("O juiz deu 15 dias.", '{"teor":"manifeste-se no prazo de 15 (quinze) dias"}')).toEqual([]);
  });

  test("os dias inventados são apontados", () => {
    expect(confere("São 20 dias úteis.", '{"dias":15}')).toEqual(["20 dias"]);
  });
});

describe("valores", () => {
  test("em centavos, em reais ou escrito, o mesmo valor confere", () => {
    expect(confere("O alvará é de R$ 1.234,56.", '{"valorCentavos":123456}')).toEqual([]);
    expect(confere("O alvará é de R$ 1.234,56.", '{"valor":1234.56}')).toEqual([]);
    expect(confere("O alvará é de R$ 1.234,56.", "levantamento de R$ 1.234,56 em favor do autor")).toEqual([]);
  });

  test("o valor que não veio de nenhuma fonte é apontado", () => {
    expect(confere("O alvará é de R$ 999,00.", '{"valorCentavos":123456}')).toEqual(["R$ 999,00"]);
  });
});

test("hora, contagem e ano soltos não são conferidos", () => {
  expect(confere("Chegaram 3 publicações hoje, às 14h30, todas de 2026.")).toEqual([]);
});

test("o que não confere aparece uma vez só, na ordem da resposta", () => {
  expect(confere("Vence 04/12. Repito: 04/12. E o outro, 06/12.", '{"fim":"2026-12-03"}')).toEqual(["04/12", "06/12"]);
});
