/** Leitura da peça contrária (Fase 5.5): a contestação ou o recurso da outra parte vira pontos a rebater, com a fonte. */
import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { IaRecusou, lerPecaContraria, pontosEmTexto, type Ia, type MetodoIa } from "../src/index.ts";

const uso = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

function iaQueResponde(resposta: unknown, pedidos: { metodo: MetodoIa; prompt: string }[]): Ia {
  return {
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async (o) => {
          pedidos.push({ metodo, prompt: JSON.stringify(o.prompt) });
          return { content: [{ type: "text", text: JSON.stringify(resposta) }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
        },
      }),
    transcrever: async () => "",
  };
}

const CONTESTACAO = `[fl. 1]
CONTESTAÇÃO. A Seguradora Alfa S.A. contesta o pedido de Marina Duarte. Alega, preliminarmente, a prescrição ânua do art. 206, § 1º, II, do Código Civil.
[fl. 2]
No mérito, sustenta que a invalidez é parcial e que o laudo particular não vale como prova. Pede a improcedência.`;

const LEITURA = {
  peca: "Contestação da Seguradora Alfa (evento 52)",
  pedidos: "A improcedência do pedido.",
  pontos: [
    { tese: "Prescrição ânua.", rebater: "A ciência inequívoca da invalidez só veio com o laudo.", fonte: "(evento 52, fl. 1)" },
    { tese: "Invalidez parcial.", rebater: "Pedir a perícia judicial.", fonte: "(evento 52, fl. 2)" },
  ],
  recusa: null,
};

describe("leitura da peça contrária", () => {
  test("manda a peça com as folhas e o prazo, e devolve os pontos a rebater com a fonte", async () => {
    const pedidos: { metodo: MetodoIa; prompt: string }[] = [];
    const r = await lerPecaContraria(iaQueResponde(LEITURA, pedidos), {
      prazo: { tipo: "Réplica à contestação", fim: "2026-11-19" },
      peca: { nome: "Contestação.pdf", evento: 52, texto: CONTESTACAO },
      contextoDoProcesso: "## Processo\nMarina Duarte × Seguradora Alfa",
    });
    expect(r.pontos).toHaveLength(2);
    expect(pedidos.map((p) => p.metodo)).toEqual(["ler-peca-contraria"]);
    const prompt = pedidos[0]!.prompt;
    expect(prompt).toContain("Peça da outra parte: Contestação.pdf (evento 52)");
    expect(prompt).toContain("[fl. 2]");
    expect(prompt).toContain("Réplica à contestação, vence em 2026-11-19");
    expect(prompt).toContain("(evento 87, fl. 3)");
  });

  test("peça sem texto legível: recusa sem chamar a IA", async () => {
    const pedidos: { metodo: MetodoIa; prompt: string }[] = [];
    const lendo = lerPecaContraria(iaQueResponde(LEITURA, pedidos), { prazo: { tipo: "Réplica", fim: "2026-11-19" }, peca: { nome: "Contestação.pdf", evento: 52, texto: "  " }, contextoDoProcesso: "" });
    await expect(lendo).rejects.toBeInstanceOf(IaRecusou);
    expect(pedidos).toHaveLength(0);
  });

  test("os pontos viram texto para a peça que vai rebatê-los", () => {
    const texto = pontosEmTexto(LEITURA);
    expect(texto).toContain("Contestação da Seguradora Alfa (evento 52)");
    expect(texto).toContain("- Prescrição ânua. (evento 52, fl. 1) Como rebater: A ciência inequívoca da invalidez só veio com o laudo.");
  });
});
