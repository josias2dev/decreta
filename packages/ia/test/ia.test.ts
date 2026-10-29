import { describe, expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";
import {
  briefingDoPrazo,
  conferirPasta,
  createGatewayIa,
  ehDecisaoFinal,
  gerarPeca,
  tipoDePeca,
  transcreverDocumento,
  IaRecusou,
  impressao,
  pecaParaPrazo,
  semTeor,
  sugerirPrazo,
  textoDoProcesso,
  type Ia,
  type MetodoIa,
} from "../src/index.ts";

type Resultado = Awaited<ReturnType<MockLanguageModelV4["doGenerate"]>>;
const responde = (text: string): Resultado => ({
  content: [{ type: "text", text }],
  finishReason: { unified: "stop", raw: "stop" },
  usage: { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } },
  warnings: [],
});

function iaFalsa(respostas: Partial<Record<MetodoIa, unknown>>, chamadas: MetodoIa[] = []): Ia {
  return {
    modelo: (metodo) =>
      new MockLanguageModelV4({
        doGenerate: async () => {
          chamadas.push(metodo);
          return responde(JSON.stringify(respostas[metodo] ?? {}));
        },
      }),
    transcrever: async () => "",
  };
}

const PUBLICACAO = {
  texto: "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos para sentença.",
  tipoComunicacao: "Intimação",
  tipoDocumento: "Despacho",
  orgao: "2ª Vara Cível da Comarca de Joinville",
  publicadaEm: "2026-10-29",
};

describe("sugestão de prazo", () => {
  test("devolve tipo e dias, sem data final", async () => {
    const chamadas: MetodoIa[] = [];
    const ia = iaFalsa(
      {
        "sugerir-prazo": {
          geraPrazo: true,
          tipo: "Manifestação sobre laudo pericial",
          dias: 15,
          contagem: "uteis",
          fundamento: "art. 477, § 1º, CPC",
          audiencia: null,
          resumo: "Intimação para falar do laudo do evento 87.",
          assunto: "laudo pericial",
          recusa: null,
        },
      },
      chamadas,
    );
    const s = await sugerirPrazo(ia, { publicacao: PUBLICACAO });
    expect(s).toMatchObject({ geraPrazo: true, dias: 15, contagem: "uteis" });
    expect("fim" in s).toBe(false);
    expect(chamadas).toEqual(["sugerir-prazo"]);
  });

  test("sem teor, recusa sem chamar o modelo", async () => {
    const chamadas: MetodoIa[] = [];
    const ia = iaFalsa({}, chamadas);
    await expect(sugerirPrazo(ia, { publicacao: { ...PUBLICACAO, texto: "Sem teor." } })).rejects.toBeInstanceOf(IaRecusou);
    expect(chamadas).toEqual([]);
    expect(semTeor("Intimação. ")).toBe(true);
    expect(semTeor(PUBLICACAO.texto)).toBe(false);
  });

  test("a recusa do modelo vira IaRecusou com o motivo", async () => {
    const ia = iaFalsa({
      "briefing-prazo": { decidiu: "", fazer: [], aFavor: [], contra: [], recusa: "Os autos enviados não têm o laudo. Anexe o laudo do evento 87." },
    });
    const r = briefingDoPrazo(ia, { prazo: { tipo: "Manifestação", fim: "2026-11-23", fundamento: null }, publicacao: PUBLICACAO.texto, contextoDoProcesso: "" });
    await expect(r).rejects.toThrow("Anexe o laudo do evento 87.");
  });
});

describe("gateway", () => {
  test("cada ação vai com o X-Gateway-Method dela e o alias certo", async () => {
    const pedidos: Array<{ metodo: string | null; modelo: string }> = [];
    const fetchFalso = (async (_url: string, init: RequestInit) => {
      const h = new Headers(init.headers);
      const body = JSON.parse(String(init.body)) as { model: string };
      pedidos.push({ metodo: h.get("x-gateway-method"), modelo: body.model });
      return new Response(
        JSON.stringify({
          id: "1",
          created: 0,
          model: body.model,
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ oQueFazer: [], pontosDeAtencao: [], estrategia: "x", ultimoAto: "y", recusa: null }) }, finish_reason: "stop" }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const ia = createGatewayIa({
      baseUrl: "http://gateway.local/v1",
      apiKey: "gw_teste",
      modelos: { juridico: "juridico", autos: "autos", documentos: "documentos", pdf: "pdf", vision: "vision" },
      modeloTranscricao: "transcricao",
      fetch: fetchFalso,
    });
    const { resumirAutos } = await import("../src/acoes.ts");
    await resumirAutos(ia, "contexto");
    expect(pedidos).toEqual([{ metodo: "resumo-autos", modelo: "autos" }]);
  });
});

describe("contexto", () => {
  test("monta as seções e corta documento grande", () => {
    const texto = textoDoProcesso(
      {
        processo: {
          cnj: "5004321-25.2026.8.24.0038",
          titulo: "Marina Duarte × Seguradora Alfa S.A.",
          tribunal: "TJSC",
          classe: "Procedimento Comum Cível",
          assunto: "Seguro",
          orgao: "2ª Vara Cível",
          comarca: "Joinville",
          valorCausa: "48000.00",
          poloCliente: "ativo",
          cliente: "Marina Duarte",
        },
        partes: [{ nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true }],
        movimentacoes: [{ em: "2026-10-21T10:00:00Z", evento: 87, titulo: "Juntada de laudo pericial", descricao: null }],
        documentos: [{ nome: "Laudo", evento: 87, texto: "x".repeat(5000) }],
      },
      2000,
    );
    expect(texto).toContain("Nosso cliente: Marina Duarte, no polo ativo (autor)");
    expect(texto).toContain("21/10/2026 (evento 87, Juntada de laudo pericial)");
    expect(texto).toContain("[documento cortado aqui]");
    expect(texto.length).toBeLessThanOrEqual(2000);
  });

  test("impressão muda quando o material muda", () => {
    expect(impressao("a", 1)).toBe(impressao("a", 1));
    expect(impressao("a", 1)).not.toBe(impressao("a", 2));
  });

  test("peça sugerida pelo tipo do prazo", () => {
    expect(pecaParaPrazo("Manifestação sobre laudo pericial").id).toBe("manifestacao-laudo");
    expect(pecaParaPrazo("Contrarrazões de apelação").id).toBe("contrarrazoes");
    expect(pecaParaPrazo("Contestação trabalhista").id).toBe("contestacao-trabalhista");
    expect(pecaParaPrazo("Algo diferente").id).toBe("outro");
  });
});

describe("leitura da sentença, conferência e leitura de foto", () => {
  test("reconhece sentença e acórdão pelo tipo ou pelo dispositivo", () => {
    expect(ehDecisaoFinal({ tipoDocumento: "Sentença", texto: "x" })).toBe(true);
    expect(ehDecisaoFinal({ tipoDocumento: "Acórdão", texto: "x" })).toBe(true);
    expect(ehDecisaoFinal({ tipoDocumento: null, texto: "Ante o exposto, JULGO IMPROCEDENTE o pedido." })).toBe(true);
    expect(ehDecisaoFinal({ tipoDocumento: null, texto: "Homologo o acordo celebrado entre as partes." })).toBe(true);
    expect(ehDecisaoFinal({ tipoDocumento: "Despacho", texto: PUBLICACAO.texto })).toBe(false);
  });

  test("conferência sem documento com texto recusa sem chamar o modelo", async () => {
    const chamadas: MetodoIa[] = [];
    const pedido = { pessoa: { nome: "Carlos Pereira", documento: null, endereco: null }, assunto: null, hoje: "2026-10-29", documentos: [{ nome: "foto.jpg", texto: "" }], processos: [] };
    await expect(conferirPasta(iaFalsa({}, chamadas), pedido)).rejects.toBeInstanceOf(IaRecusou);
    expect(chamadas).toEqual([]);
  });

  test("foto sem texto volta vazia; com texto, a transcrição", async () => {
    const ia = (texto: string, chamadas: MetodoIa[]): Ia => ({
      modelo: (metodo) =>
        new MockLanguageModelV4({
          doGenerate: async () => {
            chamadas.push(metodo);
            return responde(texto);
          },
        }),
      transcrever: async () => "",
    });
    const chamadas: MetodoIa[] = [];
    const foto = { bytes: new Uint8Array([1, 2, 3]), mime: "image/jpeg", nome: "rg.jpg" };
    expect(await transcreverDocumento(ia("SEM TEXTO", chamadas), foto)).toBe("");
    expect(await transcreverDocumento(ia("Nome: MARINA DUARTE", chamadas), { ...foto, mime: "application/pdf", nome: "rg.pdf" })).toBe("Nome: MARINA DUARTE");
    expect(chamadas).toEqual(["ler-imagem", "ler-pdf"]);
  });

  test("a peça leva os modelos do escritório, sem os fatos deles", async () => {
    let prompt = "";
    const ia: Ia = {
      modelo: () =>
        new MockLanguageModelV4({
          doStream: async (o) => {
            prompt = JSON.stringify(o.prompt);
            return { stream: new ReadableStream({ start: (c) => (c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: responde("").usage }), c.close()) }) };
          },
        }),
      transcrever: async () => "",
    };
    const r = gerarPeca(ia, {
      tipo: tipoDePeca("contrarrazoes")!,
      instrucoes: "",
      contextoDoProcesso: "## Processo",
      escritorio: { nome: "Souza & Mendes", advogado: "Beatriz Souza", oab: null, cidade: null },
      modelos: [{ titulo: "Contrarrazões · seguro", tese: "Laudo basta", texto: "Texto do modelo." }],
    });
    await r.text;
    expect(prompt).toContain("Modelos do escritório");
    expect(prompt).toContain("Tese: Laudo basta");
    expect(prompt).toContain("Não copie delas fatos");
  });
});
