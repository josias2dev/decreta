/**
 * De onde veio cada resultado da IA: o modelo que respondeu de verdade e a
 * impressão do prompt, por cima do gateway com o fetch de mentira. O alias pode
 * mudar de modelo no painel do gateway sem nenhum deploy do Decreta.
 */
import { describe, expect, test } from "bun:test";
import { generateText, streamText } from "ai";
import { colherChamadas, comMedidor, createGatewayIa, type ChamadaDaIa } from "../src/index.ts";

const CORPO = { id: "1", created: 0, model: "anthropic/claude-de-verdade", choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };

function sse() {
  const linhas = [
    { id: "1", created: 0, model: "anthropic/claude-de-verdade", choices: [{ index: 0, delta: { content: "Olá" }, finish_reason: null }] },
    { id: "1", created: 0, model: "anthropic/claude-de-verdade", choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
  ].map((l) => `data: ${JSON.stringify(l)}\n\n`);
  return new Response(linhas.join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
}

function ia(responder: (corpo: { stream?: boolean }) => Response) {
  return comMedidor(
    createGatewayIa({
      baseUrl: "http://gateway.local/v1",
      apiKey: "gw_teste",
      modelos: { juridico: "alias-juridico", autos: "alias-autos", documentos: "alias-documentos", pdf: "pdf", vision: "vision" },
      modeloTranscricao: "transcricao",
      fetch: (async (url: string, init: RequestInit) => (String(url).includes("/rotas") ? new Response("{}") : responder(JSON.parse(String(init.body))))) as unknown as typeof fetch,
    }),
    { entrada: 4, saida: 20 },
    () => {},
  );
}

const respondeOk = () => new Response(JSON.stringify(CORPO), { headers: { "content-type": "application/json" } });

describe("procedência das respostas da IA", () => {
  test("guarda a ação, o alias, o modelo que respondeu de verdade e a impressão do prompt", async () => {
    const chamadas: ChamadaDaIa[] = [];
    await colherChamadas(chamadas, () => generateText({ model: ia(respondeOk).modelo("sugerir-prazo"), instructions: "Regras do prazo.", prompt: "Caso da Marina." }));
    expect(chamadas).toEqual([{ metodo: "sugerir-prazo", alias: "alias-juridico", modelo: "anthropic/claude-de-verdade", prompt: expect.stringMatching(/^[0-9a-f]{12}$/) }]);
  });

  test("a impressão muda com as instruções, não com o caso: o texto do cliente não entra nela", async () => {
    const impressao = async (instructions: string, prompt: string) => {
      const chamadas: ChamadaDaIa[] = [];
      await colherChamadas(chamadas, () => generateText({ model: ia(respondeOk).modelo("sugerir-prazo"), instructions, prompt }));
      return chamadas[0]!.prompt;
    };
    const base = await impressao("Regras do prazo.", "Caso da Marina.");
    expect(await impressao("Regras do prazo.", "Caso do Antônio.")).toBe(base);
    expect(await impressao("Regras novas do prazo.", "Caso da Marina.")).not.toBe(base);
  });

  test("com stream: o modelo vem na resposta", async () => {
    const chamadas: ChamadaDaIa[] = [];
    await colherChamadas(chamadas, async () => {
      const r = streamText({ model: ia(sse).modelo("gerar-documento"), instructions: "Regras da peça.", prompt: "Caso." });
      await r.text;
    });
    expect(chamadas).toEqual([{ metodo: "gerar-documento", alias: "alias-documentos", modelo: "anthropic/claude-de-verdade", prompt: expect.stringMatching(/^[0-9a-f]{12}$/) }]);
  });

  test("o stream começado dentro da colheita e lido fora dela também é anotado", async () => {
    const chamadas: ChamadaDaIa[] = [];
    const r = colherChamadas(chamadas, () => streamText({ model: ia(sse).modelo("gerar-documento"), prompt: "Caso." }));
    await r.text;
    expect(chamadas).toHaveLength(1);
  });

  test("a chamada que falhou também fica, sem modelo: a tentativa aconteceu", async () => {
    const chamadas: ChamadaDaIa[] = [];
    const modelo = ia(() => new Response(JSON.stringify({ error: { message: "pedido inválido" } }), { status: 400, headers: { "content-type": "application/json" } })).modelo("resumo-autos");
    await colherChamadas(chamadas, () => generateText({ model: modelo, prompt: "Caso.", maxRetries: 0 })).catch(() => {});
    expect(chamadas).toEqual([{ metodo: "resumo-autos", alias: "alias-autos", modelo: null, prompt: expect.stringMatching(/^[0-9a-f]{12}$/) }]);
  });

  test("resultados ao mesmo tempo não se misturam, e fora da colheita nada é anotado", async () => {
    const a: ChamadaDaIa[] = [];
    const b: ChamadaDaIa[] = [];
    await Promise.all([
      colherChamadas(a, () => generateText({ model: ia(respondeOk).modelo("sugerir-prazo"), prompt: "A." })),
      colherChamadas(b, () => generateText({ model: ia(respondeOk).modelo("resumo-autos"), prompt: "B." })),
    ]);
    await generateText({ model: ia(respondeOk).modelo("perguntar"), prompt: "C." });
    expect(a.map((c) => c.metodo)).toEqual(["sugerir-prazo"]);
    expect(b.map((c) => c.metodo)).toEqual(["resumo-autos"]);
  });
});
