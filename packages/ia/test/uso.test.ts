/**
 * O medidor por cima do gateway de verdade (com o fetch de mentira): o custo
 * que o gateway devolve em `usage.cost` chega ao medidor, com e sem stream; sem
 * custo, sai dos tokens; parar no meio também conta; o teto do gateway é
 * reconhecido.
 */
import { describe, expect, test } from "bun:test";
import { generateText, streamText } from "ai";
import { comMedidor, createGatewayIa, ehTetoDoGateway, type UsoDaIa } from "../src/index.ts";

const PRECO = { entrada: 4, saida: 20 };

function gateway(responder: (corpo: { stream?: boolean }, url: string) => Response) {
  return createGatewayIa({
    baseUrl: "http://gateway.local/v1",
    apiKey: "gw_teste",
    modelos: { juridico: "juridico", autos: "autos", documentos: "documentos", pdf: "pdf", vision: "vision" },
    modeloTranscricao: "transcricao",
    fetch: (async (url: string, init: RequestInit) => responder(JSON.parse(String(init.body)), url)) as unknown as typeof fetch,
  });
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function sse(pedacos: string[], usage: Record<string, unknown> | null, { cortar = false } = {}) {
  const linhas = pedacos.map((p) => `data: ${JSON.stringify({ id: "1", created: 0, model: "m", choices: [{ index: 0, delta: { content: p }, finish_reason: null }] })}\n\n`);
  if (!cortar) linhas.push(`data: ${JSON.stringify({ id: "1", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], ...(usage ? { usage } : {}) })}\n\ndata: [DONE]\n\n`);
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of linhas) c.enqueue(enc.encode(l));
        // Cortada: o stream fica aberto, como uma resposta longa que a pessoa para no meio.
        if (!cortar) c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("medidor da IA", () => {
  test("sem stream: o custo vem do gateway", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => json({ id: "1", created: 0, model: "m", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280, cost: 0.0042 } })),
      PRECO,
      (u) => void usos.push(u),
    );
    await generateText({ model: ia.modelo("resumo-autos"), prompt: "oi" });
    expect(usos).toEqual([{ metodo: "resumo-autos", entrada: 1200, saida: 80, custoUsd: 0.0042, estimado: false }]);
  });

  test("com stream: o custo vem no último pedaço", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => sse(["Olá, ", "tudo certo."], { prompt_tokens: 500, completion_tokens: 30, total_tokens: 530, cost: 0.0011 })),
      PRECO,
      (u) => void usos.push(u),
    );
    const r = streamText({ model: ia.modelo("perguntar"), prompt: "oi" });
    expect(await r.text).toBe("Olá, tudo certo.");
    expect(usos).toEqual([{ metodo: "perguntar", entrada: 500, saida: 30, custoUsd: 0.0011, estimado: false }]);
  });

  test("sem o custo na resposta, ele sai dos tokens pelo preço de referência", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => sse(["ok"], { prompt_tokens: 1_000_000, completion_tokens: 100_000, total_tokens: 1_100_000 })),
      PRECO,
      (u) => void usos.push(u),
    );
    await streamText({ model: ia.modelo("perguntar"), prompt: "oi" }).text;
    expect(usos).toEqual([{ metodo: "perguntar", entrada: 1_000_000, saida: 100_000, custoUsd: 6, estimado: true }]);
  });

  test("a resposta parada no meio também conta, pelo tamanho", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => sse(["a".repeat(400)], null, { cortar: true })),
      PRECO,
      (u) => void usos.push(u),
    );
    const parar = new AbortController();
    const r = streamText({ model: ia.modelo("perguntar"), prompt: "b".repeat(4000), abortSignal: parar.signal });
    for await (const pedaco of r.textStream) {
      if (pedaco) {
        parar.abort();
        break;
      }
    }
    await Bun.sleep(20);
    expect(usos).toHaveLength(1);
    expect(usos[0]!.estimado).toBe(true);
    expect(usos[0]!.entrada).toBeGreaterThanOrEqual(1000);
    expect(usos[0]!.saida).toBe(100);
    expect(usos[0]!.custoUsd).toBeGreaterThan(0);
  });

  test("a transcrição conta o custo que o gateway devolve", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => json({ text: " bom dia ", usage: { input_tokens: 300, output_tokens: 10, cost: 0.003 } })),
      PRECO,
      (u) => void usos.push(u),
    );
    expect(await ia.transcrever(new Uint8Array([1, 2, 3]), "audio/ogg")).toBe("bom dia");
    expect(usos).toEqual([{ metodo: "transcription", entrada: 300, saida: 10, custoUsd: 0.003, estimado: false }]);
  });

  test("o teto do gateway é reconhecido (e não conta gasto)", async () => {
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(
      gateway(() => json({ error: { message: "teto diário do projeto decreta atingido (US$ 5.00)", type: "rate_limit_error", code: "teto-diario" } }, 429)),
      PRECO,
      (u) => void usos.push(u),
    );
    const err = await generateText({ model: ia.modelo("perguntar"), prompt: "oi", maxRetries: 0 }).catch((e: unknown) => e);
    expect(ehTetoDoGateway(err)).toBe(true);
    // Com as novas tentativas do SDK, o erro vem embrulhado: continua reconhecido.
    const deNovo = await generateText({ model: ia.modelo("perguntar"), prompt: "oi", maxRetries: 1 }).catch((e: unknown) => e);
    expect(ehTetoDoGateway(deNovo)).toBe(true);
    expect(ehTetoDoGateway(new Error("outra coisa"))).toBe(false);
    expect(usos).toEqual([]);
  });
});
