import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { briefingDoPrazo, citacoesForaDoMaterial, conversar, resumirAutos, transcreverDocumento, type Ia } from "../src/index.ts";

const uso = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };

/** Guarda as instruções que cada pedido levou. */
function iaQueGuarda(resposta: unknown, pedidos: string[]): Ia {
  return {
    modelo: () =>
      new MockLanguageModelV4({
        doGenerate: async (o) => {
          pedidos.push(JSON.stringify(o.prompt));
          return { content: [{ type: "text", text: typeof resposta === "string" ? resposta : JSON.stringify(resposta) }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
        },
        doStream: async (o) => {
          pedidos.push(JSON.stringify(o.prompt));
          return { stream: new ReadableStream({ start: (c) => (c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso }), c.close()) }) };
        },
      }),
    transcrever: async () => "",
  };
}

const REGRA = "(evento 87, fl. 3)";

describe("afirmação ligada à fonte", () => {
  test("resumo, briefing e chat do processo pedem a fonte com evento e folha", async () => {
    const pedidos: string[] = [];
    await resumirAutos(iaQueGuarda({ oQueFazer: [], pontosDeAtencao: [], estrategia: "x", ultimoAto: "y", recusa: null }, pedidos), "## Processo");
    await briefingDoPrazo(iaQueGuarda({ decidiu: "x", fazer: [], aFavor: [], contra: [], recusa: null }, pedidos), { prazo: { tipo: "Manifestação", fim: "2026-11-24", fundamento: null }, publicacao: null, contextoDoProcesso: "## Processo" });
    await conversar(iaQueGuarda("", pedidos), { metodo: "chat-processo", contexto: "## Processo", historico: [{ papel: "pessoa", texto: "O que diz o laudo?" }] }).text;
    expect(pedidos).toHaveLength(3);
    for (const p of pedidos) {
      expect(p).toContain(REGRA);
      expect(p).toContain("[fl. N]");
    }
  });

  test("a leitura de PDF escaneado marca as folhas", async () => {
    const pedidos: string[] = [];
    await transcreverDocumento(iaQueGuarda("texto", pedidos), { bytes: new Uint8Array([1]), mime: "application/pdf", nome: "laudo.pdf" });
    expect(pedidos[0]).toContain("[fl. 1]");
  });

  test("folha citada que o material não tem é citação fora da fonte", () => {
    const material = "## Documento: Laudo (evento 87)\n[fl. 1]\nConclusão.\n\n[fl. 2]\nQuesitos.";
    expect(citacoesForaDoMaterial("Incapacidade de 30% (evento 87, fl. 2).", material)).toEqual([]);
    expect(citacoesForaDoMaterial("Incapacidade de 30% (evento 87, fl. 9).", material)).toEqual(["evento 87, fl. 9"]);
  });
});
