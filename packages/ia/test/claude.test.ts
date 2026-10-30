/**
 * O caminho do Claude, com o fetch de mentira no lugar do gateway: alias com
 * perfil Claude vai pela rota da Anthropic com o id real, o esforço da ação, o
 * cache nas conversas e a reserva da Anthropic; os outros seguem pelo
 * OpenRouter; falha do Claude antes da resposta cai no OpenRouter; o teto do
 * dia não muda de caminho; o custo do gateway chega ao medidor.
 */
import { describe, expect, test } from "bun:test";
import { generateText, streamText, tool } from "ai";
import { z } from "zod";
import { comMedidor, createGatewayIa, ehTetoDoGateway, tituloDaConversa, type UsoDaIa } from "../src/index.ts";

interface Pedido {
  caminho: string;
  headers: Headers;
  corpo: Record<string, unknown>;
}

const json = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const sse = (eventos: unknown[]) => {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const e of eventos) c.enqueue(enc.encode(`event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

/** A resposta da Messages API, com o custo que o gateway injeta em usage.cost. */
const mensagem = (texto: string, custo: number, stop = "end_turn") => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: stop === "refusal" ? [] : [{ type: "thinking", thinking: "", signature: "assinatura" }, { type: "text", text: texto }],
  stop_reason: stop,
  stop_sequence: null,
  usage: { input_tokens: 900, output_tokens: 60, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, cost: custo },
});

const inicio = { type: "message_start", message: { id: "msg_2", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 700, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } } };

const transmissao = (texto: string, custo: number) => [
  inicio,
  { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: texto } },
  { type: "content_block_stop", index: 0 },
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 25, cost: custo } },
  { type: "message_stop" },
];

/** A resposta do OpenRouter (/v1), em stream ou não. */
const doOpenRouter = (corpo: Record<string, unknown>, texto: string, custo: number) => {
  const usage = { prompt_tokens: 800, completion_tokens: 40, total_tokens: 840, cost: custo };
  if (!corpo.stream) return json({ id: "or", created: 0, model: "m", choices: [{ index: 0, message: { role: "assistant", content: texto }, finish_reason: "stop" }], usage });
  const enc = new TextEncoder();
  const linhas = [
    `data: ${JSON.stringify({ id: "or", created: 0, model: "m", choices: [{ index: 0, delta: { content: texto }, finish_reason: null }] })}\n\n`,
    `data: ${JSON.stringify({ id: "or", created: 0, model: "m", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage })}\n\ndata: [DONE]\n\n`,
  ];
  return new Response(
    new ReadableStream({
      start(c) {
        for (const l of linhas) c.enqueue(enc.encode(l));
        c.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
};

function ambiente(opcoes: { rotas?: Response | (() => Response); anthropic?: (corpo: Record<string, unknown>, n: number) => Response }) {
  const pedidos: Pedido[] = [];
  const logs: Array<{ msg: string; extra?: Record<string, unknown> }> = [];
  let mensagens = 0;
  const fetchFalso = (async (url: string, init: RequestInit = {}) => {
    const caminho = new URL(url).pathname;
    const corpo = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    pedidos.push({ caminho, headers: new Headers(init.headers), corpo });
    if (caminho === "/anthropic/v1/rotas") {
      const r = opcoes.rotas ?? json({ anthropic: true, aliases: { juridico: "claude-opus-5-5", vision: "claude-haiku-5-5" } });
      return typeof r === "function" ? r() : r.clone();
    }
    if (caminho === "/anthropic/v1/messages") return opcoes.anthropic!(corpo, ++mensagens);
    return doOpenRouter(corpo, "resposta do OpenRouter", 0.002);
  }) as unknown as typeof fetch;
  const ia = createGatewayIa({
    baseUrl: "http://gateway.local/v1",
    apiKey: "gw_teste",
    modelos: { juridico: "juridico", autos: "autos", documentos: "documentos", pdf: "pdf", vision: "vision" },
    modeloTranscricao: "transcricao",
    fetch: fetchFalso,
    log: (msg, extra) => void logs.push({ msg, extra }),
  });
  const para = (caminho: string) => pedidos.filter((p) => p.caminho === caminho);
  return { ia, pedidos, logs, para };
}

describe("Claude pela rota da Anthropic", () => {
  test("alias do Claude vai com o id real, o esforço da ação e a reserva da Anthropic; os outros, pelo OpenRouter", async () => {
    const a = ambiente({ anthropic: () => json(mensagem("prazo de 15 dias", 0.0014)) });

    const r = await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação" });
    expect(r.text).toBe("prazo de 15 dias");
    const [claude] = a.para("/anthropic/v1/messages");
    expect(claude!.corpo.model).toBe("claude-opus-5-5");
    expect(claude!.corpo.output_config).toEqual({ effort: "high" });
    expect(claude!.corpo.fallbacks).toBe("default");
    expect(claude!.corpo.cache_control).toBeUndefined();
    expect(claude!.corpo.thinking).toBeUndefined();
    expect(claude!.headers.get("x-api-key")).toBe("gw_teste");
    expect(claude!.headers.get("x-gateway-alias")).toBe("juridico");
    expect(claude!.headers.get("x-gateway-method")).toBe("sugerir-prazo");
    expect(claude!.headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");

    await generateText({ model: a.ia.modelo("resumo-autos"), prompt: "autos" });
    const [openrouter] = a.para("/v1/chat/completions");
    expect(openrouter!.corpo.model).toBe("autos");
    expect(openrouter!.headers.get("x-gateway-method")).toBe("resumo-autos");

    // As rotas ficam guardadas: duas chamadas, uma consulta.
    expect(a.para("/anthropic/v1/rotas")).toHaveLength(1);
  });

  test("o Haiku 5.5 não leva a reserva da Anthropic, que ele não tem", async () => {
    const a = ambiente({ anthropic: () => json(mensagem("RG 12.345.678-9", 0.0001)) });
    await generateText({ model: a.ia.modelo("ler-imagem"), prompt: "foto" });
    const [claude] = a.para("/anthropic/v1/messages");
    expect(claude!.corpo.model).toBe("claude-haiku-5-5");
    expect(claude!.corpo.fallbacks).toBeUndefined();
    expect(claude!.corpo.output_config).toEqual({ effort: "low" });
  });

  test("saída estruturada vai no formato nativo, junto com o esforço", async () => {
    // Só o pedido interessa aqui; a resposta de mentira não precisa passar no schema.
    const a = ambiente({ anthropic: () => json(mensagem("{}", 0.002)) });
    const { prepararAudiencia } = await import("../src/acoes.ts");
    await prepararAudiencia(a.ia, { audiencia: { tipo: "Instrução", em: "2026-11-12T14:00:00-03:00", porVideo: true }, contextoDoProcesso: "contexto" }).catch(() => undefined);
    const [claude] = a.para("/anthropic/v1/messages");
    const oc = claude!.corpo.output_config as { effort?: string; format?: { type?: string } };
    expect(oc.effort).toBe("high");
    expect(oc.format?.type).toBe("json_schema");
    expect(claude!.corpo.tool_choice).toBeUndefined();
  });

  test("Perguntar: cache, esforço médio e o custo do gateway chegando ao medidor", async () => {
    const a = ambiente({ anthropic: () => sse(transmissao("Há 3 prazos esta semana.", 0.0031)) });
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(a.ia, { entrada: 4, saida: 20 }, (u) => void usos.push(u));

    const prazos = tool({ description: "Prazos da semana", inputSchema: z.object({}), execute: async () => [] });
    const r = streamText({ model: ia.modelo("perguntar"), prompt: "quais prazos vencem?", tools: { prazos } });
    expect(await r.text).toBe("Há 3 prazos esta semana.");
    const [claude] = a.para("/anthropic/v1/messages");
    expect(claude!.corpo.stream).toBe(true);
    expect(claude!.corpo.cache_control).toEqual({ type: "ephemeral" });
    expect(claude!.corpo.output_config).toEqual({ effort: "medium" });
    expect(usos).toEqual([{ metodo: "perguntar", entrada: 700, saida: 25, custoUsd: 0.0031, estimado: false }]);
  });

  test("o título da conversa pensa pouco e tem folga para o raciocínio", async () => {
    const a = ambiente({ anthropic: () => json(mensagem("Prazos da semana", 0.0002)) });
    expect(await tituloDaConversa(a.ia, "quais prazos vencem?", "Há 3 prazos.")).toBe("Prazos da semana");
    const [claude] = a.para("/anthropic/v1/messages");
    expect(claude!.corpo.output_config).toEqual({ effort: "low" });
    expect(claude!.corpo.max_tokens).toBe(1000);
    // Uma chamada só, sem ferramentas: escrever no cache custaria mais e nunca seria relido.
    expect(claude!.corpo.cache_control).toBeUndefined();
  });

  test("sem crédito na Anthropic: a resposta vem do OpenRouter e o Claude fica pausado", async () => {
    const a = ambiente({
      // Como a Anthropic manda, e o gateway repassa.
      anthropic: () => json({ type: "error", error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits." } }, 400),
    });

    const r = await generateText({ model: a.ia.modelo("briefing-prazo"), prompt: "prazo" });
    expect(r.text).toBe("resposta do OpenRouter");
    expect(a.para("/v1/chat/completions")[0]!.corpo.model).toBe("juridico");
    expect(a.logs[0]).toMatchObject({ msg: "Claude falhou; a chamada segue pelo OpenRouter", extra: { metodo: "briefing-prazo", status: 400, tipo: "invalid_request_error", pausado: true } });

    await generateText({ model: a.ia.modelo("briefing-prazo"), prompt: "outro prazo" });
    expect(a.para("/anthropic/v1/messages")).toHaveLength(1);
    expect(a.para("/v1/chat/completions")).toHaveLength(2);
  });

  test("gateway sem a chave da Anthropic: o Claude pausa e a chamada segue pelo OpenRouter", async () => {
    const a = ambiente({ anthropic: () => json({ type: "error", error: { type: "api_error", message: "a Anthropic não está configurada no gateway (falta ANTHROPIC_API_KEY)", code: "anthropic-desligada" } }, 503) });
    expect((await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação", maxRetries: 0 })).text).toBe("resposta do OpenRouter");
    await generateText({ model: a.ia.modelo("preparar-audiencia"), prompt: "audiência", maxRetries: 0 });
    expect(a.para("/anthropic/v1/messages")).toHaveLength(1);
    expect(a.logs[0]!.extra).toMatchObject({ status: 503, codigo: "anthropic-desligada", pausado: true });
  });

  test("sobrecarga da Anthropic cai no OpenRouter sem pausar o Claude", async () => {
    const a = ambiente({ anthropic: () => json({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, 529) });
    const r = await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação", maxRetries: 0 });
    expect(r.text).toBe("resposta do OpenRouter");
    await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação", maxRetries: 0 });
    expect(a.para("/anthropic/v1/messages")).toHaveLength(2);
    expect(a.logs[0]!.extra).toMatchObject({ status: 529, tipo: "overloaded_error", pausado: false });
  });

  test("o teto do dia não muda de caminho", async () => {
    const a = ambiente({ anthropic: () => json({ type: "error", error: { type: "rate_limit_error", message: "teto diário do projeto atingido", code: "teto-diario" } }, 429) });
    const erro = await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação", maxRetries: 0 }).catch((e: unknown) => e);
    expect(ehTetoDoGateway(erro)).toBe(true);
    expect(a.para("/v1/chat/completions")).toHaveLength(0);
  });

  test("erro logo no começo do stream vai para o OpenRouter", async () => {
    const a = ambiente({ anthropic: () => sse([inicio, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }]) });
    const r = streamText({ model: a.ia.modelo("perguntar"), prompt: "oi", maxRetries: 0 });
    expect(await r.text).toBe("resposta do OpenRouter");
    expect(a.para("/v1/chat/completions")[0]!.corpo.stream).toBe(true);
    expect(a.logs[0]!.extra).toMatchObject({ status: 529, tipo: "overloaded_error", mensagem: "Overloaded" });
  });

  test("recusa antes da resposta vai para o OpenRouter, e o medidor conta as duas tentativas", async () => {
    const recusa = [inicio, { type: "message_delta", delta: { stop_reason: "refusal", stop_sequence: null, stop_details: { type: "refusal", category: "cyber" } }, usage: { output_tokens: 0, cost: 0.001 } }, { type: "message_stop" }];
    const a = ambiente({ anthropic: (corpo) => (corpo.stream ? sse(recusa) : json(mensagem("", 0.001, "refusal"))) });
    const usos: UsoDaIa[] = [];
    const ia = comMedidor(a.ia, { entrada: 4, saida: 20 }, (u) => void usos.push(u));

    expect(await streamText({ model: ia.modelo("perguntar"), prompt: "oi" }).text).toBe("resposta do OpenRouter");
    expect((await generateText({ model: ia.modelo("sugerir-prazo"), prompt: "oi" })).text).toBe("resposta do OpenRouter");
    expect(usos.map((u) => Number(u.custoUsd.toFixed(6)))).toEqual([0.003, 0.003]);
    expect(a.logs.map((l) => l.msg)).toEqual(["Claude recusou; a chamada segue pelo OpenRouter", "Claude recusou; a chamada segue pelo OpenRouter"]);
  });

  test("depois que a resposta começou, um erro não troca de caminho", async () => {
    const a = ambiente({
      anthropic: () =>
        sse([
          inicio,
          { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } },
          { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Começo da resposta" } },
          { type: "error", error: { type: "overloaded_error", message: "Overloaded" } },
        ]),
    });
    const erros: unknown[] = [];
    const r = streamText({ model: a.ia.modelo("perguntar"), prompt: "oi", maxRetries: 0, onError: ({ error }) => void erros.push(error) });
    expect(await r.text).toBe("Começo da resposta");
    expect(erros).toHaveLength(1);
    expect(a.para("/v1/chat/completions")).toHaveLength(0);
  });

  test("gateway sem a rota da Anthropic (ou fora do ar): tudo segue pelo OpenRouter", async () => {
    const a = ambiente({ rotas: () => new Response("404 page not found", { status: 404 }) });
    const r = await generateText({ model: a.ia.modelo("sugerir-prazo"), prompt: "publicação" });
    expect(r.text).toBe("resposta do OpenRouter");
    expect(a.para("/anthropic/v1/messages")).toHaveLength(0);
  });
});
