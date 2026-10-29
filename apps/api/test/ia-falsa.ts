/** IA de mentira para os testes: responde por ação (o X-Gateway-Method) com o que o teste deixou preparado. */
import type { Ia, MetodoIa } from "@decreta/ia";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

const uso = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };

export interface IaFalsa extends Ia {
  respostas: Partial<Record<MetodoIa, unknown>>;
  chamadas: MetodoIa[];
  /** O último pedido de cada ação (o prompt que a IA recebeu). */
  pedidos: Partial<Record<MetodoIa, unknown>>;
}

export function iaFalsa(): IaFalsa {
  const respostas: Partial<Record<MetodoIa, unknown>> = {};
  const chamadas: MetodoIa[] = [];
  const pedidos: Partial<Record<MetodoIa, unknown>> = {};
  return {
    respostas,
    chamadas,
    pedidos,
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async (opcoes) => {
          chamadas.push(metodo);
          pedidos[metodo] = opcoes.prompt;
          const r = respostas[metodo];
          return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r ?? {}) }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
        },
        doStream: async (opcoes) => {
          chamadas.push(metodo);
          pedidos[metodo] = opcoes.prompt;
          const texto = String(respostas[metodo] ?? "");
          const pedacos = texto.match(/[\s\S]{1,12}/g) ?? [];
          return {
            stream: convertArrayToReadableStream([
              { type: "stream-start", warnings: [] },
              { type: "text-start", id: "t" },
              ...pedacos.map((delta) => ({ type: "text-delta" as const, id: "t", delta })),
              { type: "text-end", id: "t" },
              { type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso },
            ]),
          };
        },
      }),
    transcrever: async () => "transcrição",
  };
}
