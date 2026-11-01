import { describe, expect, test } from "bun:test";
import { automacaoValida, nivelDaAcao, REGRAS_DE_AUTOMACAO } from "../src/automacao.ts";

describe("níveis de automação", () => {
  test("sem configuração vale o padrão de cada ação", () => {
    expect(nivelDaAcao({}, "rascunho-da-peca")).toBe("automatico");
    expect(nivelDaAcao({}, "leitura-da-sentenca")).toBe("automatico");
    expect(nivelDaAcao({}, "prazo")).toBe("confirmar");
  });

  test("o escritório escolhe entre os níveis que a ação aceita", () => {
    expect(nivelDaAcao({ "rascunho-da-peca": "sugestao" }, "rascunho-da-peca")).toBe("sugestao");
    // Nível que a ação não aceita volta ao padrão.
    expect(nivelDaAcao({ "rascunho-da-peca": "confirmar" }, "rascunho-da-peca")).toBe("automatico");
  });

  test("prazo, mensagem ao cliente e valores ficam travados em exigir confirmação", () => {
    const travadas = REGRAS_DE_AUTOMACAO.filter((r) => r.travada).map((r) => r.id);
    expect(travadas).toEqual(["prazo", "mensagem-ao-cliente", "valores"]);
    for (const id of travadas) expect(nivelDaAcao({ [id]: "automatico" }, id)).toBe("confirmar");
  });

  test("a configuração enviada só passa com ação conhecida, destravada e nível aceito", () => {
    expect(automacaoValida({ "rascunho-da-peca": "sugestao", "leitura-da-sentenca": "automatico" })).toBe(true);
    expect(automacaoValida({ prazo: "automatico" })).toBe(false);
    expect(automacaoValida({ "rascunho-da-peca": "confirmar" })).toBe(false);
    expect(automacaoValida({ inventada: "automatico" })).toBe(false);
  });
});
