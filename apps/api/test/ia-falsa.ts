/** IA de mentira para os testes: responde por ação (o X-Gateway-Method) com o que o teste deixou preparado. */
import type { Ia, MetodoIa } from "@decreta/ia";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";

const uso = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };

/** Um passo do roteiro: um texto, ou ferramentas que a IA chama antes do próximo passo. */
export type Passo = string | { ferramentas: { nome: string; entrada: unknown }[] };

export interface IaFalsa extends Ia {
  /** Texto, objeto (saída estruturada), função do pedido (que devolve um dos dois) ou, nas conversas, um roteiro: um passo por rodada da IA. */
  respostas: Partial<Record<MetodoIa, unknown>>;
  /** O nome que a IA dá para uma conversa nova. */
  titulo: string;
  /** O que a transcrição do áudio devolve. */
  transcricao: string;
  chamadas: MetodoIa[];
  /** O último pedido de cada ação (o prompt que a IA recebeu). */
  pedidos: Partial<Record<MetodoIa, unknown>>;
}

export function iaFalsa(): IaFalsa {
  const respostas: Partial<Record<MetodoIa, unknown>> = {};
  const chamadas: MetodoIa[] = [];
  const pedidos: Partial<Record<MetodoIa, unknown>> = {};
  /** Em que passo do roteiro cada ação está (volta ao começo quando o teste troca o roteiro). */
  const passos = new Map<unknown, number>();
  const falsa: IaFalsa = {
    respostas,
    titulo: "Conversa de teste",
    chamadas,
    pedidos,
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async (opcoes) => {
          chamadas.push(metodo);
          const sistema = JSON.stringify(opcoes.prompt.filter((m) => m.role === "system"));
          const preparada = respostas[metodo];
          // Uma função responde conforme o pedido (cada citação conferida tem a sua resposta).
          const r = sistema.includes("título") ? falsa.titulo : typeof preparada === "function" ? preparada(JSON.stringify(opcoes.prompt)) : preparada;
          if (!sistema.includes("título")) pedidos[metodo] = opcoes.prompt;
          return { content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r ?? {}) }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
        },
        doStream: async (opcoes) => {
          chamadas.push(metodo);
          pedidos[metodo] = opcoes.prompt;
          const r = respostas[metodo];
          let passo: Passo = String(r ?? "");
          if (Array.isArray(r)) {
            const i = passos.get(r) ?? 0;
            passos.set(r, i + 1);
            passo = (r[i] as Passo | undefined) ?? "";
          }
          // Rodada sem ferramentas (a última): a IA de mentira não tem o que dizer.
          if (typeof passo !== "string" && opcoes.toolChoice?.type === "none") passo = "";
          if (typeof passo !== "string") {
            const i = passos.get(r) ?? 0;
            return {
              stream: convertArrayToReadableStream([
                { type: "stream-start", warnings: [] },
                ...passo.ferramentas.map((f, n) => ({ type: "tool-call" as const, toolCallId: `chamada-${i}-${n}`, toolName: f.nome, input: JSON.stringify(f.entrada) })),
                { type: "finish", finishReason: { unified: "tool-calls", raw: "tool_calls" }, usage: uso },
              ]),
            };
          }
          const pedacos = passo.match(/[\s\S]{1,12}/g) ?? [];
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
    transcricao: "transcrição",
    transcrever: async (_audio, _mime, aoUsar) => {
      chamadas.push("transcription");
      await aoUsar?.({ entrada: 300, saida: 60, custoUsd: 0.002 });
      return falsa.transcricao;
    },
  };
  return falsa;
}
