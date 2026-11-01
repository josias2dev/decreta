/**
 * O conjunto-ouro roda aqui com uma IA de mentira que responde o gabarito de
 * cada caso: confere que o conjunto está certo (o dia exato bate com o motor de
 * prazos) e que a régua pega os erros. A IA de verdade roda à mão, a cada troca
 * de modelo ou de prompt: `bun run avaliar`.
 */
import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import { avaliarConjunto, avaliarPrazo, avaliarResumo, placarEmTexto, type CasoDePrazo, type CasoDeResumo, type ConjuntoOuro } from "../src/avaliacao.ts";
import { CONJUNTO_OURO } from "../src/conjunto-ouro.ts";
import type { Ia, MetodoIa } from "../src/index.ts";

type Resultado = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
const responde = (text: string): Resultado => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } },
  warnings: [],
});

/** Responde, para cada pedido, a resposta do caso cujo material está no pedido. */
function iaDoGabarito(conjunto: ConjuntoOuro, trocar: (metodo: MetodoIa, resposta: unknown) => unknown = (_m, r) => r): Ia {
  return {
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async (o) => {
          const pedido = JSON.stringify(o.prompt);
          const caso = [...conjunto.prazos.map((c) => ({ marca: c.publicacao.texto.slice(0, 60), gabarito: c.gabarito as unknown })), ...conjunto.resumos.map((c) => ({ marca: c.contexto.slice(0, 60), gabarito: c.gabarito as unknown }))].find((c) =>
            pedido.includes(JSON.stringify(c.marca).slice(1, -1)),
          );
          return responde(JSON.stringify(trocar(metodo, caso?.gabarito ?? {})));
        },
      }),
    transcrever: async () => "",
  };
}

describe("conjunto-ouro", () => {
  test("com as respostas do gabarito, acerta tudo: o conjunto e o motor de prazos concordam no dia exato", async () => {
    const placar = await avaliarConjunto(iaDoGabarito(CONJUNTO_OURO), CONJUNTO_OURO);
    const falhas = placar.casos.filter((c) => !c.acertou).map((c) => `${c.id}: ${c.falhas.join("; ")}`);
    expect(falhas).toEqual([]);
    expect(placar.prazos.acertos).toBe(CONJUNTO_OURO.prazos.length);
    expect(placar.resumos.nota).toBe(1);
    expect(placar.citacoesForaDaFonte).toBe(0);
  });

  test("tem casos de feriado, recesso, Carnaval, CLT, Juizado e despacho sem prazo", () => {
    const sobre = CONJUNTO_OURO.prazos.map((c) => c.sobre.toLowerCase()).join(" | ");
    for (const tema of ["finados", "carnaval", "recesso", "municipal", "clt", "juizado", "sem prazo"]) expect(sobre).toContain(tema);
    expect(CONJUNTO_OURO.resumos.length).toBeGreaterThanOrEqual(2);
  });

  test("dias errados viram prazo errado, com o dia esperado e o obtido", async () => {
    const caso = CONJUNTO_OURO.prazos.find((c) => c.id === "laudo-finados") as CasoDePrazo;
    const ia = iaDoGabarito(CONJUNTO_OURO, (_m, r) => ({ ...(r as object), dias: 10 }));
    const r = await avaliarPrazo(ia, caso);
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("24/11/2026");
  });

  test("prazo onde não há prazo é erro", async () => {
    const caso = CONJUNTO_OURO.prazos.find((c) => c.esperado.geraPrazo === false) as CasoDePrazo;
    const ia = iaDoGabarito(CONJUNTO_OURO, () => ({ geraPrazo: true, tipo: "Manifestação", dias: 5, contagem: "uteis", fundamento: null, audiencia: null, resumo: "x", assunto: "x", recusa: null }));
    const r = await avaliarPrazo(ia, caso);
    expect(r.acertou).toBe(false);
  });

  test("o resumo leva nota pela rubrica, e evento que não está nos autos é citação fora da fonte", async () => {
    const caso = CONJUNTO_OURO.resumos[0] as CasoDeResumo;
    const ia = iaDoGabarito(CONJUNTO_OURO, () => ({
      oQueFazer: ["Falar sobre o laudo (evento 412)."],
      pontosDeAtencao: [],
      estrategia: "Esperar.",
      ultimoAto: "Nada.",
      recusa: null,
    }));
    const r = await avaliarResumo(ia, caso);
    expect(r.nota).toBeLessThan(1);
    expect(r.citacoesForaDaFonte).toEqual(["evento 412"]);
    expect(r.acertou).toBe(false);
  });

  test("o placar sai em texto curto, com o que errou", async () => {
    const ia = iaDoGabarito(CONJUNTO_OURO, (m, r) => (m === "sugerir-prazo" ? { ...(r as object), dias: 1 } : r));
    const texto = placarEmTexto(await avaliarConjunto(ia, CONJUNTO_OURO));
    expect(texto).toContain("Prazos no dia exato:");
    expect(texto).toContain("laudo-finados");
  });
});
