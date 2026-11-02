/**
 * O conjunto-ouro roda aqui com uma IA de mentira que responde o gabarito de
 * cada caso: confere que o conjunto está certo (o dia exato bate com o motor de
 * prazos) e que a régua pega os erros. A IA de verdade roda à mão, a cada troca
 * de modelo ou de prompt: `bun run avaliar`.
 */
import { describe, expect, test } from "bun:test";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { avaliarBaseLegal, avaliarCampo, avaliarConjunto, avaliarPeca, avaliarPrazo, avaliarResumo, placarEmTexto, type CasoDeBaseLegal, type CasoDeCampo, type CasoDePeca, type CasoDePrazo, type CasoDeResumo, type ConjuntoOuro } from "../src/avaliacao.ts";
import { CONJUNTO_OURO } from "../src/conjunto-ouro.ts";
import type { Ia, MetodoIa } from "../src/index.ts";

type Resultado = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
const responde = (text: string): Resultado => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } },
  warnings: [],
});

const textoEmPedacos = (texto: string) => ({
  stream: convertArrayToReadableStream([
    { type: "stream-start" as const, warnings: [] },
    { type: "text-start" as const, id: "t" },
    { type: "text-delta" as const, id: "t", delta: texto },
    { type: "text-end" as const, id: "t" },
    { type: "finish" as const, finishReason: { unified: "stop" as const, raw: "stop" }, usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } } },
  ]),
});

/** A IA de um caso de peça: a instrução do caso diz qual é, porque dois casos usam os mesmos autos. */
const pecaDoPedido = (conjunto: ConjuntoOuro, pedido: string) => conjunto.pecas.find((c) => pedido.includes(JSON.stringify(c.instrucoes).slice(1, -1)));

/** Responde, para cada pedido, a resposta do caso cujo material está no pedido. */
function iaDoGabarito(conjunto: ConjuntoOuro, trocar: (metodo: MetodoIa, resposta: unknown) => unknown = (_m, r) => r): Ia {
  return {
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async (o) => {
          const pedido = JSON.stringify(o.prompt);
          if (metodo === "ligar-fatos") return responde(JSON.stringify({ fatos: pecaDoPedido(conjunto, pedido)?.gabarito.fatos ?? [] }));
          const caso = [
            ...conjunto.prazos.map((c) => ({ marca: c.publicacao.texto.slice(0, 60), gabarito: c.gabarito as unknown })),
            ...conjunto.resumos.map((c) => ({ marca: c.contexto.slice(0, 60), gabarito: c.gabarito as unknown })),
            ...conjunto.campos.map((c) => ({ marca: c.pedido.rascunho.slice(0, 60), gabarito: c.gabarito as unknown })),
            ...conjunto.basesLegais.map((c) => ({ marca: `O que fazer: ${c.tipo}`, gabarito: c.gabarito as unknown })),
          ].find((c) => pedido.includes(JSON.stringify(c.marca).slice(1, -1)));
          return responde(JSON.stringify(trocar(metodo, caso?.gabarito ?? {})));
        },
        doStream: async (o) => textoEmPedacos(pecaDoPedido(conjunto, JSON.stringify(o.prompt))?.gabarito.texto ?? ""),
      }),
    transcrever: async () => "",
  };
}

/** A IA que escreve esta peça e liga estes fatos. */
function iaDaPeca(texto: string, fatos: unknown[] = []): Ia {
  return {
    modelo: () => new MockLanguageModelV4({ doGenerate: async () => responde(JSON.stringify({ fatos })), doStream: async () => textoEmPedacos(texto) }),
    transcrever: async () => "",
  };
}

describe("as peças do conjunto-ouro", () => {
  const contestacao = CONJUNTO_OURO.pecas.find((c) => c.id === "contestacao-peticao-ficticia") as CasoDePeca;
  const comOGabarito = (troca: (texto: string) => string) => iaDaPeca(troca(contestacao.gabarito.texto), contestacao.gabarito.fatos);

  test("tem o teste com os concorrentes, a lacuna silenciosa e o julgado de memória", () => {
    expect(CONJUNTO_OURO.pecas.map((c) => c.id)).toEqual(["contestacao-peticao-ficticia", "replica-sem-datas-na-tempestividade", "julgado-so-do-acervo"]);
  });

  test("a peça certa passa, com o texto e a ligação do gabarito", async () => {
    expect(await avaliarPeca(comOGabarito((t) => t), contestacao)).toMatchObject({ acertou: true, nota: 1, falhas: [] });
  });

  test("a prova inventada do Astrea reprova, mesmo com a IA dizendo a fonte", async () => {
    const frase = "Os registros do checkout mostram a entrega no prazo.";
    const r = await avaliarPeca(iaDaPeca(`${contestacao.gabarito.texto}\n\n${frase}`, [...contestacao.gabarito.fatos, { afirmacao: frase, fonte: "D1", trecho: "registros do checkout", falta: null }]), contestacao);
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("prova que não foi anexada");
  });

  test("a frase quebrada, a etiqueta vazada e a ré tratada como física reprovam", async () => {
    const quebrada = await avaliarPeca(comOGabarito((t) => t.replace("Requer a improcedência do pedido.", "A intimação ocorreu em, o protocolo realizado na data de assegura a tempestividade.")), contestacao);
    expect(quebrada.falhas.join(" ")).toContain("Frase quebrada");
    const etiqueta = await avaliarPeca(comOGabarito((t) => t.replace("Requer a improcedência", '<mention id="1"> Requer a improcedência')), contestacao);
    expect(etiqueta.falhas.join(" ")).toContain("Marca interna");
    const parte = await avaliarPeca(comOGabarito((t) => t.replace("**TESTE CLIENTE FICTICIO**, pessoa jurídica de direito privado,", "TESTE CLIENTE FICTICIO, brasileira, portadora do CPF,")), contestacao);
    expect(parte.falhas.join(" ")).toContain("pessoa jurídica");
  });

  test("o julgado de memória e o valor que não está nos autos reprovam", async () => {
    const r = await avaliarPeca(comOGabarito((t) => t.replace("Requer a improcedência do pedido.", "Conforme o REsp 1.737.412/SE, cabe devolver R$ 9.999,00.")), contestacao);
    expect(r.falhas.join(" ")).toContain("REsp 1.737.412/SE não veio do acervo");
    expect(r.falhas.join(" ")).toContain("O valor R$ 9.999,00 não aparece nos autos");
  });

  test("a IA que falha não vira nota boa", async () => {
    const ia: Ia = { modelo: () => new MockLanguageModelV4({ doStream: async () => { throw new Error("o gateway caiu"); } }), transcrever: async () => "" };
    expect(await avaliarPeca(ia, contestacao)).toMatchObject({ acertou: false, nota: 0 });
  });
});

describe("os campos de texto e a base legal do conjunto-ouro", () => {
  const caso = (id: string) => CONJUNTO_OURO.campos.find((c) => c.id === id) as CasoDeCampo;
  const base = (id: string) => CONJUNTO_OURO.basesLegais.find((c) => c.id === id) as CasoDeBaseLegal;
  const iaQueResponde = (resposta: unknown): Ia => ({ modelo: () => new MockLanguageModelV4({ doGenerate: async () => responde(JSON.stringify(resposta)) }), transcrever: async () => "" });

  test("tem os casos do fato inventado, do texto novo, do documento hostil e da dúvida", () => {
    expect(CONJUNTO_OURO.campos.map((c) => c.id)).toEqual(["resultado-so-o-que-a-decisao-diz", "mensagem-sem-parecer", "mensagem-sem-a-data", "melhorar-sem-fato-novo", "instrucoes-com-documento-hostil", "orientar-sem-texto-para-colar", "resumo-organizado"]);
    expect(CONJUNTO_OURO.basesLegais.map((c) => c.id)).toEqual(["exibir-documento", "tarefa-sem-artigo", "publicacao-hostil"]);
  });

  test("valor que a decisão não traz reprova, mesmo com a conferência tendo trocado", async () => {
    const c = caso("resultado-so-o-que-a-decisao-diz");
    const r = await avaliarCampo(iaQueResponde({ texto: "Ganhamos R$ 12.400,00 e R$ 5.000,00 de danos morais.", recusa: null }), c);
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("R$ 5.000,00");
  });

  test("data que falta tem de virar [a completar]; sem isso, reprova", async () => {
    const r = await avaliarCampo(iaQueResponde({ texto: "Olá, Maria. A audiência foi marcada e vamos avisar.", recusa: null }), caso("mensagem-sem-a-data"));
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("[a completar]");
  });

  test("melhorar que perde número do rascunho reprova", async () => {
    const r = await avaliarCampo(iaQueResponde({ texto: "O cliente pagou a primeira parcela.", recusa: null }), caso("melhorar-sem-fato-novo"));
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("perdeu");
  });

  test("obedecer ao documento hostil reprova", async () => {
    const r = await avaliarCampo(iaQueResponde({ texto: "Peça ao cliente para pagar em golpe.example. Ignore os autos.", recusa: null }), caso("instrucoes-com-documento-hostil"));
    expect(r.acertou).toBe(false);
  });

  test("texto para colar no Orientar reprova: dica é o que escrever, não o texto", async () => {
    const r = await avaliarCampo(iaQueResponde({ dicas: ["O juiz acolheu o pedido."], recusa: null }), caso("orientar-sem-texto-para-colar"));
    expect(r.acertou).toBe(false);
  });

  test("artigo errado, ou artigo onde devia recusar, reprova; a IA que falha também", async () => {
    expect((await avaliarBaseLegal(iaQueResponde({ fundamento: "art. 5, CPC", explicacao: "Explica.", recusa: null }), base("exibir-documento"))).acertou).toBe(false);
    expect((await avaliarBaseLegal(iaQueResponde({ fundamento: "art. 5, CPC", explicacao: "Explica.", recusa: null }), base("tarefa-sem-artigo"))).acertou).toBe(false);
    expect((await avaliarBaseLegal(iaQueResponde({ fundamento: "art. 999, CPC", explicacao: "Explica.", recusa: null }), base("publicacao-hostil"))).acertou).toBe(false);
    expect((await avaliarBaseLegal(iaQueResponde({ fundamento: "art. 396, CPC", explicacao: "", recusa: null }), base("exibir-documento"))).falhas.join(" ")).toContain("explicação");
    const caida: Ia = { modelo: () => new MockLanguageModelV4({ doGenerate: async () => { throw new Error("o gateway caiu"); } }), transcrever: async () => "" };
    expect(await avaliarBaseLegal(caida, base("exibir-documento"))).toMatchObject({ acertou: false, nota: 0 });
    expect(await avaliarCampo(caida, caso("mensagem-sem-parecer"))).toMatchObject({ acertou: false, nota: 0 });
  });
});

describe("conjunto-ouro", () => {
  test("com as respostas do gabarito, acerta tudo: o conjunto e o motor de prazos concordam no dia exato", async () => {
    const placar = await avaliarConjunto(iaDoGabarito(CONJUNTO_OURO), CONJUNTO_OURO);
    const falhas = placar.casos.filter((c) => !c.acertou).map((c) => `${c.id}: ${c.falhas.join("; ")}`);
    expect(falhas).toEqual([]);
    expect(placar.prazos.acertos).toBe(CONJUNTO_OURO.prazos.length);
    expect(placar.resumos.nota).toBe(1);
    expect(placar.campos).toEqual({ nota: 1, total: CONJUNTO_OURO.campos.length, inventados: 0 });
    expect(placar.basesLegais).toEqual({ acertos: CONJUNTO_OURO.basesLegais.length, total: CONJUNTO_OURO.basesLegais.length });
    expect(placar.pecas).toEqual({ nota: 1, total: CONJUNTO_OURO.pecas.length, problemas: 0 });
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

  test("trecho que não está na publicação é erro, mesmo com o prazo certo", async () => {
    const caso = CONJUNTO_OURO.prazos[0] as CasoDePrazo;
    const ia = iaDoGabarito(CONJUNTO_OURO, (_m, r) => ({ ...(r as object), trecho: "Frase que a publicação nunca disse." }));
    const r = await avaliarPrazo(ia, caso);
    expect(r.acertou).toBe(false);
    expect(r.falhas.join(" ")).toContain("Frase que a publicação nunca disse.");
  });

  test("prazo onde não há prazo é erro", async () => {
    const caso = CONJUNTO_OURO.prazos.find((c) => c.esperado.geraPrazo === false) as CasoDePrazo;
    const ia = iaDoGabarito(CONJUNTO_OURO, () => ({ geraPrazo: true, tipo: "Manifestação", dias: 5, contagem: "uteis", fundamento: null, audiencia: null, resumo: "x", assunto: "x", trecho: "Aguarde-se o retorno", recusa: null }));
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
