/** Jeito do escritório (Fase 5.7): como o escritório faz cada peça, e o gerador segue. */
import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { gerarPeca, jeitoParaPeca, tipoDePeca, type Ia } from "../src/index.ts";

const uso = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function iaQueGuarda(guardar: (prompt: string) => void): Ia {
  return {
    modelo: () =>
      new MockLanguageModelV4({
        doStream: async (o) => {
          guardar(JSON.stringify(o.prompt));
          return { stream: new ReadableStream({ start: (c) => (c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso }), c.close()) }) };
        },
      }),
    transcrever: async () => "",
  };
}

const JEITO = {
  geral: { estilo: "Frases curtas, sem latim.", teses: "", evitar: "Adjetivos contra o juízo." },
  contestacao: { estilo: "", teses: "Prescrição sempre em preliminar.", evitar: "Pedir prova pericial sem quesitos." },
};

describe("jeito do escritório", () => {
  test("junta o jeito geral com o do tipo de peça; sem nada escrito, não há jeito", () => {
    expect(jeitoParaPeca(JEITO, "contestacao")).toEqual({
      estilo: "Frases curtas, sem latim.",
      teses: "Prescrição sempre em preliminar.",
      evitar: "Adjetivos contra o juízo.\nPedir prova pericial sem quesitos.",
    });
    expect(jeitoParaPeca(JEITO, "replica")).toEqual({ estilo: "Frases curtas, sem latim.", teses: "", evitar: "Adjetivos contra o juízo." });
    expect(jeitoParaPeca({}, "replica")).toBeNull();
    expect(jeitoParaPeca({ replica: { estilo: " ", teses: "", evitar: "" } }, "replica")).toBeNull();
  });

  test("a peça segue o jeito do escritório, sem inventar fato para encaixar tese", async () => {
    let prompt = "";
    await gerarPeca(iaQueGuarda((p) => (prompt = p)), {
      tipo: tipoDePeca("contestacao")!,
      instrucoes: "",
      contextoDoProcesso: "## Processo",
      escritorio: { nome: "Souza & Mendes", advogado: "Beatriz Souza", oab: null, cidade: null },
      jeito: jeitoParaPeca(JEITO, "contestacao"),
    }).text;
    expect(prompt).toContain("Jeito do escritório");
    expect(prompt).toContain("Estilo: Frases curtas, sem latim.");
    expect(prompt).toContain("Teses que o escritório usa: Prescrição sempre em preliminar.");
    expect(prompt).toContain("O que evitar: Adjetivos contra o juízo.");
    expect(prompt).toContain("nunca invente fato para encaixar uma tese");
  });
});
