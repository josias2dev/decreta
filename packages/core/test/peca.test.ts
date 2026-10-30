import { describe, expect, test } from "bun:test";
import { partesDaPeca } from "../src/peca.ts";

describe("partesDaPeca", () => {
  test("tira o endereçamento e o fecho, e mantém a ordem", () => {
    expect(partesDaPeca("Endereçamento, síntese do laudo, concordância ou impugnação ponto a ponto, quesitos complementares, pedidos (esclarecimentos, nova perícia), fecho.")).toEqual({
      enderecamento: "Endereçamento",
      partes: ["Síntese do laudo", "Concordância ou impugnação ponto a ponto", "Quesitos complementares", "Pedidos (esclarecimentos, nova perícia)"],
    });
  });

  test("vírgula dentro de parênteses não separa, e dois-pontos separam", () => {
    expect(partesDaPeca("Endereçamento ao tribunal, cabimento (CPC, art. 1.015), tempestividade.").partes).toEqual(["Cabimento (CPC, art. 1.015)", "Tempestividade"]);
    expect(partesDaPeca("Petição de interposição e razões: tempestividade, preparo.")).toEqual({ enderecamento: null, partes: ["Petição de interposição e razões", "Tempestividade", "Preparo"] });
  });

  test("local, data e assinatura ficam com o fecho", () => {
    expect(partesDaPeca("Notificante e notificado, fatos, local, data e assinatura.").partes).toEqual(["Notificante e notificado", "Fatos"]);
  });
});
