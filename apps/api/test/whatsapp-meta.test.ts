/** O canal da Meta contra uma Graph API de mentira. NÃO fala com a Meta de verdade. */
import { createHmac } from "node:crypto";
import { describe, expect, test } from "bun:test";
import { FalhaNoCanal, type Saida } from "../src/whatsapp/canal.ts";
import { assinaturaConfere, canalDaMeta, lerWebhook, respostaDoDesafio, type ConfigDaMeta } from "../src/whatsapp/meta.ts";

const NUMERO = "106540352242922";
const TOKEN = "EAAGm0PX4ZCpsBOZCi7ZBt3qQ1ZBs2ZAg7ZCiDkU4hmUeA1ZCZAyZB";
const MESSAGES = `https://graph.facebook.com/v23.0/${NUMERO}/messages`;
const PARA = { telefone: "5547991234567" };

interface Resposta {
  status?: number;
  corpo?: unknown;
  bytes?: Uint8Array | ReadableStream<Uint8Array>;
  cabecalhos?: Record<string, string>;
  /** A conexão cai antes de responder. */
  cai?: boolean;
}

function graph(respostas: Resposta[]) {
  const pedidos: { url: string; metodo: string; cabecalhos: Record<string, string>; corpo: any; comPrazo: boolean }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    const body = init?.body;
    pedidos.push({
      url,
      metodo: init?.method ?? "GET",
      cabecalhos: Object.fromEntries(new Headers(init?.headers).entries()),
      corpo: body instanceof FormData ? body : typeof body === "string" ? JSON.parse(body) : null,
      comPrazo: init?.signal instanceof AbortSignal,
    });
    const r = respostas[pedidos.length - 1] ?? {};
    if (r.cai) throw new TypeError("fetch failed");
    if (r.bytes) return new Response(r.bytes as unknown as ConstructorParameters<typeof Response>[0], { status: r.status ?? 200, headers: r.cabecalhos });
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: f, pedidos };
}

const config = (g: { fetch: typeof fetch }): ConfigDaMeta => ({ phoneNumberId: NUMERO, accessToken: TOKEN, appSecret: "segredo-do-app", verifyToken: "token-do-cadastro", fetch: g.fetch });
const aceita = (id = "wamid.HBgNNTU0Nzk5MTIzNDU2NxUCABEYEjQ4") => ({ corpo: { messaging_product: "whatsapp", contacts: [{ input: PARA.telefone, wa_id: PARA.telefone }], messages: [{ id }] } });

/** Manda uma saída e devolve o corpo que chegou à Graph. */
async function corpoEnviado(saida: Saida) {
  const g = graph([aceita()]);
  await canalDaMeta(config(g)).enviar(PARA, saida);
  return g.pedidos[0]!.corpo;
}

const envelope = { messaging_product: "whatsapp", recipient_type: "individual", to: PARA.telefone };

describe("enviar", () => {
  test("texto: POST em /messages com o Bearer, o prazo do pedido e o id da Meta de volta", async () => {
    const g = graph([aceita("wamid.um")]);
    const r = await canalDaMeta(config(g)).enviar(PARA, { tipo: "texto", texto: "Bom dia. Hoje vencem 2 prazos." });
    expect(r).toEqual({ wamid: "wamid.um" });
    const p = g.pedidos[0]!;
    expect(p.url).toBe(MESSAGES);
    expect(p.metodo).toBe("POST");
    expect(p.cabecalhos["authorization"]).toBe(`Bearer ${TOKEN}`);
    expect(p.cabecalhos["content-type"]).toBe("application/json");
    expect(p.comPrazo).toBe(true);
    expect(p.corpo).toEqual({ ...envelope, type: "text", text: { body: "Bom dia. Hoje vencem 2 prazos.", preview_url: false } });
  });

  test("resposta citada: a mensagem leva o context com o id da citada", async () => {
    const g = graph([aceita()]);
    await canalDaMeta(config(g)).enviar(PARA, { tipo: "texto", texto: "Marcado como cumprido." }, { responde: "wamid.do.botao" });
    expect(g.pedidos[0]!.corpo).toEqual({ ...envelope, context: { message_id: "wamid.do.botao" }, type: "text", text: { body: "Marcado como cumprido.", preview_url: false } });
  });

  test("rodapé: botões, lista e link levam o footer, cortado em 60 caracteres", async () => {
    const rodape = "Souza & Freitas Advocacia · Escritório da Rua das Palmeiras, 1234";
    const botoes = await corpoEnviado({ tipo: "botoes", texto: "Confere?", botoes: [{ id: "a:x", titulo: "Sim" }], rodape });
    expect(botoes.interactive.footer.text).toBe("Souza & Freitas Advocacia · Escritório da Rua das…");
    expect(botoes.interactive.footer.text.length).toBeLessThanOrEqual(60);
    const lista = await corpoEnviado({ tipo: "lista", texto: "Qual?", botao: "Escolher", itens: [{ id: "a:1", titulo: "Um" }], rodape: "Souza & Freitas" });
    expect(lista.interactive.footer).toEqual({ text: "Souza & Freitas" });
    const link = await corpoEnviado({ tipo: "link", texto: "Abra no Decreta.", rotulo: "Abrir no Decreta", url: "https://decreta.site/prazos/1", rodape: "Souza & Freitas" });
    expect(link.interactive.footer).toEqual({ text: "Souza & Freitas" });
    expect((await corpoEnviado({ tipo: "botoes", texto: "Confere?", botoes: [{ id: "a:x", titulo: "Sim" }] })).interactive.footer).toBeUndefined();
  });

  test("versão e endereço da Graph configuráveis", async () => {
    const g = graph([aceita()]);
    await canalDaMeta({ ...config(g), versao: "v24.0", graphUrl: "https://graph.exemplo.test/" }).enviar(PARA, { tipo: "texto", texto: "oi" });
    expect(g.pedidos[0]!.url).toBe(`https://graph.exemplo.test/v24.0/${NUMERO}/messages`);
  });

  test("botões: os cortes de limite chegam ao corpo (título de 30 caracteres cabe em 20, e o quarto botão sai)", async () => {
    const corpo = await corpoEnviado({
      tipo: "botoes",
      texto: "Chegou a proposta de acordo. O que fazemos?",
      botoes: [
        { id: "p:1:aceitar", titulo: "Confirmar todos os prazos hoje" },
        { id: "p:1:recusar", titulo: "Recusar" },
        { id: "p:1:depois", titulo: "Depois" },
        { id: "p:1:sobra", titulo: "Sobra" },
      ],
    });
    expect(corpo).toEqual({
      ...envelope,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Chegou a proposta de acordo. O que fazemos?" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "p:1:aceitar", title: "Confirmar todos os…" } },
            { type: "reply", reply: { id: "p:1:recusar", title: "Recusar" } },
            { type: "reply", reply: { id: "p:1:depois", title: "Depois" } },
          ],
        },
      },
    });
    expect(corpo.interactive.action.buttons[0].reply.title.length).toBeLessThanOrEqual(20);
  });

  test("lista: uma seção \"Opções\", descrição só quando há", async () => {
    expect(
      await corpoEnviado({
        tipo: "lista",
        texto: "Qual processo?",
        botao: "Escolher",
        itens: [
          { id: "proc:1", titulo: "Silva x Banco", descricao: "5001234-56.2026.8.24.0023" },
          { id: "proc:2", titulo: "Souza x Estado" },
        ],
      }),
    ).toEqual({
      ...envelope,
      type: "interactive",
      interactive: {
        type: "list",
        body: { text: "Qual processo?" },
        action: {
          button: "Escolher",
          sections: [
            {
              title: "Opções",
              rows: [
                { id: "proc:1", title: "Silva x Banco", description: "5001234-56.2026.8.24.0023" },
                { id: "proc:2", title: "Souza x Estado" },
              ],
            },
          ],
        },
      },
    });
  });

  test("link: botão cta_url com o rótulo e o endereço", async () => {
    expect(await corpoEnviado({ tipo: "link", texto: "A conversa com a cliente:", rotulo: "Abrir conversa", url: "https://wa.me/5547998765432" })).toEqual({
      ...envelope,
      type: "interactive",
      interactive: { type: "cta_url", body: { text: "A conversa com a cliente:" }, action: { name: "cta_url", parameters: { display_text: "Abrir conversa", url: "https://wa.me/5547998765432" } } },
    });
  });

  test("modelo com parâmetros e botão: body com as variáveis (quebra de linha vira espaço) e o payload no quick_reply", async () => {
    expect(await corpoEnviado({ tipo: "modelo", nome: "agenda_do_dia", parametros: ["10/11", "2 prazos\ne 1 audiência"], botoes: ["a:dia"] })).toEqual({
      ...envelope,
      type: "template",
      template: {
        name: "agenda_do_dia",
        language: { code: "pt_BR" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "10/11" }, { type: "text", text: "2 prazos e 1 audiência" }] },
          { type: "button", sub_type: "quick_reply", index: "0", parameters: [{ type: "payload", payload: "a:dia" }] },
        ],
      },
    });
  });

  test("modelo sem botões leva só o body; sem parâmetros e sem botões, nenhum componente", async () => {
    expect((await corpoEnviado({ tipo: "modelo", nome: "vence_hoje", parametros: ["3 prazos"] })).template).toEqual({
      name: "vence_hoje",
      language: { code: "pt_BR" },
      components: [{ type: "body", parameters: [{ type: "text", text: "3 prazos" }] }],
    });
    expect((await corpoEnviado({ tipo: "modelo", nome: "vinculo_vencido", parametros: [] })).template).toEqual({ name: "vinculo_vencido", language: { code: "pt_BR" } });
  });

  test("documento: sobe o arquivo em /media antes e manda a mensagem com o id dele", async () => {
    const g = graph([{ corpo: { id: "1166846181421424" } }, aceita("wamid.doc")]);
    const bytes = new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55]);
    const r = await canalDaMeta(config(g)).enviar(PARA, { tipo: "documento", nome: "peticao.pdf", mime: "application/pdf", bytes, legenda: "A petição para conferir" });
    expect(r).toEqual({ wamid: "wamid.doc" });
    expect(g.pedidos).toHaveLength(2);

    const subida = g.pedidos[0]!;
    expect(subida.url).toBe(`https://graph.facebook.com/v23.0/${NUMERO}/media`);
    expect(subida.metodo).toBe("POST");
    expect(subida.cabecalhos["authorization"]).toBe(`Bearer ${TOKEN}`);
    // O fetch põe o multipart com o boundary; o adaptador não pode fixar o Content-Type.
    expect(subida.cabecalhos["content-type"]).toBeUndefined();
    const form = subida.corpo as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("application/pdf");
    const arquivo = form.get("file") as File;
    expect(arquivo.name).toBe("peticao.pdf");
    expect(new Uint8Array(await arquivo.arrayBuffer())).toEqual(bytes);

    expect(g.pedidos[1]!.url).toBe(MESSAGES);
    expect(g.pedidos[1]!.corpo).toEqual({ ...envelope, type: "document", document: { id: "1166846181421424", filename: "peticao.pdf", caption: "A petição para conferir" } });
  });

  test("documento sem legenda vai sem caption", async () => {
    const g = graph([{ corpo: { id: "m1" } }, aceita()]);
    await canalDaMeta(config(g)).enviar(PARA, { tipo: "documento", nome: "a.pdf", mime: "application/pdf", bytes: new Uint8Array([1]) });
    expect(g.pedidos[1]!.corpo.document).toEqual({ id: "m1", filename: "a.pdf" });
  });

  test("a recusa da Graph vira FalhaNoCanal com o código (131047) e o status", async () => {
    const g = graph([
      {
        status: 400,
        corpo: { error: { message: "(#131047) Re-engagement message", type: "OAuthException", code: 131047, error_data: { messaging_product: "whatsapp", details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." }, fbtrace_id: "AbC" } },
      },
    ]);
    const erro = await canalDaMeta(config(g))
      .enviar(PARA, { tipo: "texto", texto: "oi" })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaNoCanal);
    expect((erro as FalhaNoCanal).codigo).toBe(131047);
    expect((erro as FalhaNoCanal).status).toBe(400);
    expect((erro as FalhaNoCanal).message).toContain("Re-engagement message");
    expect((erro as FalhaNoCanal).message).not.toContain(TOKEN);
  });

  test("o token nunca vai na mensagem de erro, nem quando a Meta o devolve no texto", async () => {
    const g = graph([{ status: 401, corpo: { error: { message: `Error validating access token: ${TOKEN} has expired`, type: "OAuthException", code: 190 } } }]);
    const erro = (await canalDaMeta(config(g))
      .enviar(PARA, { tipo: "texto", texto: "oi" })
      .catch((e: unknown) => e)) as FalhaNoCanal;
    expect(erro).toBeInstanceOf(FalhaNoCanal);
    expect(erro.codigo).toBe(190);
    expect(erro.message).not.toContain(TOKEN);
    expect(erro.message).toContain("[token]");
  });

  test("erro sem corpo, resposta sem id e conexão caída também viram FalhaNoCanal", async () => {
    const semCorpo = (await canalDaMeta(config(graph([{ status: 502, bytes: new TextEncoder().encode("Bad Gateway") }])))
      .enviar(PARA, { tipo: "texto", texto: "oi" })
      .catch((e: unknown) => e)) as FalhaNoCanal;
    expect(semCorpo).toBeInstanceOf(FalhaNoCanal);
    expect([semCorpo.codigo, semCorpo.status]).toEqual([null, 502]);

    const semId = (await canalDaMeta(config(graph([{ corpo: { messaging_product: "whatsapp", messages: [] } }])))
      .enviar(PARA, { tipo: "texto", texto: "oi" })
      .catch((e: unknown) => e)) as FalhaNoCanal;
    expect(semId).toBeInstanceOf(FalhaNoCanal);
    expect(semId.status).toBe(200);

    const caiu = (await canalDaMeta(config(graph([{ cai: true }])))
      .enviar(PARA, { tipo: "texto", texto: "oi" })
      .catch((e: unknown) => e)) as FalhaNoCanal;
    expect(caiu).toBeInstanceOf(FalhaNoCanal);
    expect([caiu.codigo, caiu.status]).toEqual([null, null]);
  });
});

describe("marcarLido", () => {
  test("marca como lida e liga o \"digitando\"", async () => {
    const g = graph([{ corpo: { success: true } }]);
    await canalDaMeta(config(g)).marcarLido("wamid.recebida");
    expect(g.pedidos[0]!.url).toBe(MESSAGES);
    expect(g.pedidos[0]!.metodo).toBe("POST");
    expect(g.pedidos[0]!.corpo).toEqual({ messaging_product: "whatsapp", status: "read", message_id: "wamid.recebida", typing_indicator: { type: "text" } });
  });

  test("a falha só lança FalhaNoCanal: quem chama decide engolir", async () => {
    const recusa = await canalDaMeta(config(graph([{ status: 400, corpo: { error: { message: "Invalid parameter", code: 100 } } }])))
      .marcarLido("wamid.x")
      .catch((e: unknown) => e);
    expect(recusa).toBeInstanceOf(FalhaNoCanal);
    const caiu = await canalDaMeta(config(graph([{ cai: true }])))
      .marcarLido("wamid.x")
      .catch((e: unknown) => e);
    expect(caiu).toBeInstanceOf(FalhaNoCanal);
  });
});

describe("baixarMidia", () => {
  const LINK = "https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1013859600285441&ext=1762699000&hash=ATtQ";

  test("dois passos: o id dá o link, e o link (com o mesmo Bearer) dá os bytes", async () => {
    const audio = new Uint8Array([79, 103, 103, 83, 0, 2]);
    const g = graph([{ corpo: { messaging_product: "whatsapp", url: LINK, mime_type: "audio/ogg; codecs=opus", sha256: "abc", file_size: 6, id: "1013859600285441" } }, { bytes: audio, cabecalhos: { "content-type": "audio/ogg" } }]);
    const m = await canalDaMeta(config(g)).baixarMidia("1013859600285441");
    expect(m.mime).toBe("audio/ogg; codecs=opus");
    expect(new Uint8Array(m.bytes)).toEqual(audio);
    expect(g.pedidos.map((p) => [p.metodo, p.url, p.cabecalhos["authorization"]])).toEqual([
      ["GET", "https://graph.facebook.com/v23.0/1013859600285441", `Bearer ${TOKEN}`],
      ["GET", LINK, `Bearer ${TOKEN}`],
    ]);
  });

  test("acima de 25 MB anunciados não baixa", async () => {
    const g = graph([{ corpo: { url: LINK, mime_type: "video/mp4", file_size: 25 * 1024 * 1024 + 1, id: "v1" } }]);
    const erro = await canalDaMeta(config(g))
      .baixarMidia("v1")
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaNoCanal);
    expect(g.pedidos).toHaveLength(1);
  });

  test("acima de 25 MB no download para no teto, mesmo sem tamanho anunciado", async () => {
    const MB = new Uint8Array(1024 * 1024);
    let enviados = 0;
    const fluxo = new ReadableStream<Uint8Array>({
      pull(c) {
        if (enviados++ < 30) c.enqueue(MB);
        else c.close();
      },
    });
    const g = graph([{ corpo: { url: LINK, mime_type: "video/mp4", id: "v2" } }, { bytes: fluxo }]);
    const erro = await canalDaMeta(config(g))
      .baixarMidia("v2")
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(FalhaNoCanal);
    expect((erro as FalhaNoCanal).message).toContain("25 MB");
    expect(enviados).toBeLessThan(30);
  });

  test("mídia que a Meta não acha vira FalhaNoCanal com o código", async () => {
    const erro = (await canalDaMeta(config(graph([{ status: 404, corpo: { error: { message: "Media not found", code: 131052 } } }])))
      .baixarMidia("sumiu")
      .catch((e: unknown) => e)) as FalhaNoCanal;
    expect(erro).toBeInstanceOf(FalhaNoCanal);
    expect(erro.codigo).toBe(131052);
  });
});

describe("assinaturaConfere", () => {
  const corpo = JSON.stringify({ object: "whatsapp_business_account", entry: [{ id: "1", changes: [] }] });
  const assinar = (c: string, segredo: string) => `sha256=${createHmac("sha256", segredo).update(c).digest("hex")}`;

  test("a assinatura certa confere", () => {
    expect(assinaturaConfere(corpo, assinar(corpo, "segredo-do-app"), "segredo-do-app")).toBe(true);
  });

  test("outro segredo, outro corpo, tamanho diferente ou formato errado não conferem", () => {
    expect(assinaturaConfere(corpo, assinar(corpo, "outro-segredo"), "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(`${corpo} `, assinar(corpo, "segredo-do-app"), "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(corpo, "sha256=abc123", "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(corpo, `${assinar(corpo, "segredo-do-app")}00`, "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(corpo, assinar(corpo, "segredo-do-app").replace("sha256=", "sha1="), "segredo-do-app")).toBe(false);
  });

  test("sem segredo ou sem cabeçalho, nunca confere", () => {
    expect(assinaturaConfere(corpo, assinar(corpo, ""), "")).toBe(false);
    expect(assinaturaConfere(corpo, null, "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(corpo, undefined, "segredo-do-app")).toBe(false);
    expect(assinaturaConfere(corpo, "", "segredo-do-app")).toBe(false);
  });
});

describe("respostaDoDesafio", () => {
  test("devolve o challenge quando o token confere", () => {
    expect(respostaDoDesafio({ mode: "subscribe", token: "token-do-cadastro", challenge: "1158201444" }, "token-do-cadastro")).toBe("1158201444");
  });

  test("token errado, outro modo, sem challenge ou sem token configurado: null", () => {
    expect(respostaDoDesafio({ mode: "subscribe", token: "chute", challenge: "1" }, "token-do-cadastro")).toBeNull();
    expect(respostaDoDesafio({ mode: "unsubscribe", token: "token-do-cadastro", challenge: "1" }, "token-do-cadastro")).toBeNull();
    expect(respostaDoDesafio({ mode: "subscribe", token: "token-do-cadastro" }, "token-do-cadastro")).toBeNull();
    expect(respostaDoDesafio({ mode: "subscribe", challenge: "1" }, "token-do-cadastro")).toBeNull();
    expect(respostaDoDesafio({ mode: "subscribe", token: "", challenge: "1" }, "")).toBeNull();
  });
});

describe("lerWebhook", () => {
  const QUANDO = new Date(Date.UTC(2026, 10, 9, 12, 30, 0));
  const TS = String(QUANDO.getTime() / 1000);
  const MARINA = { profile: { name: "Marina Duarte" }, wa_id: "5547991234567" };
  const DE_MARINA = { telefone: "5547991234567", bsuid: null, nome: "Marina Duarte" };

  /** O envelope que a Meta manda, com um lote só. */
  const lote = (value: Record<string, unknown>, numero = NUMERO) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "102290129340398", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "554733334444", phone_number_id: numero }, ...value } }] }],
  });
  const daMarina = (m: Record<string, unknown>) => lote({ contacts: [MARINA], messages: [{ from: MARINA.wa_id, id: "wamid.M1", timestamp: TS, ...m }] });
  const conteudoDe = (m: Record<string, unknown>) => {
    const [e] = lerWebhook(daMarina(m), NUMERO);
    return e?.tipo === "mensagem" ? e.conteudo : e;
  };

  test("texto: quem mandou, quando e o que disse", () => {
    expect(lerWebhook(daMarina({ type: "text", text: { body: "Quais prazos vencem hoje?" } }), NUMERO)).toEqual([
      { tipo: "mensagem", wamid: "wamid.M1", de: DE_MARINA, em: QUANDO, responde: null, conteudo: { tipo: "texto", texto: "Quais prazos vencem hoje?" } },
    ]);
  });

  test("toque em botão de resposta: a escolha e a mensagem que tinha o botão", () => {
    const [e] = lerWebhook(
      daMarina({ context: { from: "554733334444", id: "wamid.COM_BOTOES" }, type: "interactive", interactive: { type: "button_reply", button_reply: { id: "p:9f2c:aceitar", title: "Aceitar" } } }),
      NUMERO,
    );
    expect(e).toMatchObject({ tipo: "mensagem", responde: "wamid.COM_BOTOES", conteudo: { tipo: "escolha", id: "p:9f2c:aceitar", titulo: "Aceitar" } });
  });

  test("item de lista e botão de modelo também são escolhas", () => {
    expect(
      conteudoDe({ context: { from: "554733334444", id: "wamid.LISTA" }, type: "interactive", interactive: { type: "list_reply", list_reply: { id: "proc:1", title: "Silva x Banco", description: "5001234-56.2026.8.24.0023" } } }),
    ).toEqual({ tipo: "escolha", id: "proc:1", titulo: "Silva x Banco" });
    expect(conteudoDe({ context: { from: "554733334444", id: "wamid.MODELO" }, type: "button", button: { payload: "a:dia", text: "Ver o dia" } })).toEqual({ tipo: "escolha", id: "a:dia", titulo: "Ver o dia" });
  });

  test("áudio de voz, documento com legenda, imagem e figurinha viram mídia", () => {
    expect(conteudoDe({ type: "audio", audio: { mime_type: "audio/ogg; codecs=opus", sha256: "x", id: "1013859600285441", voice: true } })).toEqual({
      tipo: "midia",
      midia: "audio",
      id: "1013859600285441",
      mime: "audio/ogg; codecs=opus",
      nome: null,
      legenda: null,
      voz: true,
    });
    expect(conteudoDe({ type: "document", document: { caption: "Segue a procuração assinada", filename: "procuracao.pdf", mime_type: "application/pdf", sha256: "y", id: "889" } })).toEqual({
      tipo: "midia",
      midia: "documento",
      id: "889",
      mime: "application/pdf",
      nome: "procuracao.pdf",
      legenda: "Segue a procuração assinada",
      voz: false,
    });
    expect(conteudoDe({ type: "image", image: { caption: "o boleto", mime_type: "image/jpeg", sha256: "z", id: "777" } })).toMatchObject({ midia: "imagem", legenda: "o boleto", voz: false });
    expect(conteudoDe({ type: "sticker", sticker: { mime_type: "image/webp", sha256: "w", id: "555", animated: false } })).toMatchObject({ midia: "figurinha", id: "555" });
  });

  test("localização e tipo sem suporte viram \"outro\"", () => {
    expect(conteudoDe({ type: "location", location: { latitude: -26.9194, longitude: -49.0661, name: "Fórum de Blumenau" } })).toEqual({ tipo: "outro", nome: "location" });
    expect(conteudoDe({ type: "unsupported", errors: [{ code: 131051, title: "Message type unknown" }] })).toEqual({ tipo: "outro", nome: "unsupported" });
  });

  test("reação: o emoji e a mensagem reagida (tirar a reação chega sem emoji)", () => {
    expect(conteudoDe({ type: "reaction", reaction: { message_id: "wamid.X", emoji: "👎" } })).toEqual({ tipo: "reacao", emoji: "👎", wamid: "wamid.X" });
    expect(conteudoDe({ type: "reaction", reaction: { message_id: "wamid.X" } })).toEqual({ tipo: "reacao", emoji: null, wamid: "wamid.X" });
    expect(conteudoDe({ type: "reaction", reaction: {} })).toEqual({ tipo: "outro", nome: "reaction" });
  });

  test("quem usa nome de usuário chega pelo BSUID, em qualquer um dos campos", () => {
    const semTelefone = lote({ contacts: [{ profile: { name: "Beatriz" }, user_id: "BR.1234567890123456" }], messages: [{ from_user_id: "BR.1234567890123456", id: "wamid.B1", timestamp: TS, type: "text", text: { body: "oi" } }] });
    expect((lerWebhook(semTelefone, NUMERO)[0] as { de: unknown }).de).toEqual({ telefone: null, bsuid: "BR.1234567890123456", nome: "Beatriz" });

    const peloContato = lote({ contacts: [{ profile: { name: "Beatriz" }, wa_id: "5547988887777", bsuid: "BR.99" }], messages: [{ from: "5547988887777", id: "wamid.B2", timestamp: TS, type: "text", text: { body: "oi" } }] });
    expect((lerWebhook(peloContato, NUMERO)[0] as { de: unknown }).de).toEqual({ telefone: "5547988887777", bsuid: "BR.99", nome: "Beatriz" });

    const noFrom = lote({ messages: [{ from: "BR.42", id: "wamid.B3", timestamp: TS, type: "text", text: { body: "oi" } }] });
    expect((lerWebhook(noFrom, NUMERO)[0] as { de: unknown }).de).toEqual({ telefone: null, bsuid: "BR.42", nome: null });
  });

  test("com mais de um contato, cada mensagem fica com o seu", () => {
    const dois = lote({
      contacts: [
        { profile: { name: "Beatriz Souza" }, wa_id: "5547988887777" },
        { profile: { name: "Marina Duarte" }, wa_id: "5547991234567", user_id: "BR.77" },
      ],
      messages: [
        { from: "5547991234567", id: "wamid.D1", timestamp: TS, type: "text", text: { body: "um" } },
        { from: "5547988887777", id: "wamid.D2", timestamp: TS, type: "text", text: { body: "dois" } },
      ],
    });
    expect(lerWebhook(dois, NUMERO).map((e) => (e.tipo === "mensagem" ? e.de : null))).toEqual([
      { telefone: "5547991234567", bsuid: "BR.77", nome: "Marina Duarte" },
      { telefone: "5547988887777", bsuid: null, nome: "Beatriz Souza" },
    ]);
  });

  test("status: falha com o erro e a categoria, entrega, e os que o Decreta não usa ficam de fora", () => {
    const corpo = lote({
      statuses: [
        {
          id: "wamid.S1",
          status: "failed",
          timestamp: TS,
          recipient_id: "5547991234567",
          pricing: { billable: false, pricing_model: "PMP", category: "utility", type: "regular" },
          errors: [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message", error_data: { details: "Message failed to send because more than 24 hours have passed since the customer last replied to this number." } }],
        },
        { id: "wamid.S2", status: "delivered", timestamp: TS, recipient_id: "5547991234567", conversation: { id: "c1", origin: { type: "utility" } }, pricing: { billable: true, pricing_model: "PMP", category: "utility" } },
        { id: "wamid.S3", status: "read", timestamp: TS, recipient_id: "5547991234567" },
        { id: "wamid.S4", status: "played", timestamp: TS, recipient_id: "5547991234567" },
        { id: "wamid.S5", status: "deleted", timestamp: TS, recipient_id: "5547991234567" },
      ],
    });
    expect(lerWebhook(corpo, NUMERO)).toEqual([
      { tipo: "status", wamid: "wamid.S1", status: "falhou", em: QUANDO, para: "5547991234567", erro: { codigo: 131047, titulo: "Re-engagement message" }, categoria: "utility" },
      { tipo: "status", wamid: "wamid.S2", status: "entregue", em: QUANDO, para: "5547991234567", erro: null, categoria: "utility" },
      { tipo: "status", wamid: "wamid.S3", status: "lida", em: QUANDO, para: "5547991234567", erro: null, categoria: null },
    ]);
  });

  test("o lote de outro número e outro campo ficam de fora", () => {
    expect(lerWebhook(lote({ contacts: [MARINA], messages: [{ from: MARINA.wa_id, id: "wamid.O1", timestamp: TS, type: "text", text: { body: "oi" } }] }, "999999999999999"), NUMERO)).toEqual([]);
    const outroCampo = { object: "whatsapp_business_account", entry: [{ id: "1", changes: [{ field: "message_template_status_update", value: { event: "APPROVED", message_template_name: "resumo_do_dia" } }] }] };
    expect(lerWebhook(outroCampo, NUMERO)).toEqual([]);
  });

  test("corpo lixo nunca lança: o que não dá para ler é ignorado", () => {
    for (const lixo of [null, undefined, "texto", 42, [], { entry: "x" }, { entry: [null, { changes: "x" }, { changes: [null, { field: "messages" }, { field: "messages", value: [] }] }] }]) {
      expect(lerWebhook(lixo, NUMERO)).toEqual([]);
    }
    const quebrados = lote({
      contacts: "x",
      messages: [null, {}, { id: "wamid.Q1", type: "text" }, { id: "wamid.Q2", from: MARINA.wa_id, timestamp: "ontem", type: "text", text: { body: "oi" } }, { id: "wamid.Q3", timestamp: TS, type: "text", text: { body: "sem remetente" } }, { id: "wamid.Q4", from: MARINA.wa_id, timestamp: TS, type: "audio", audio: {} }],
      statuses: [null, { id: "wamid.S", status: "sent" }, { status: "sent", timestamp: TS }],
    });
    expect(lerWebhook(quebrados, NUMERO)).toEqual([]);
    // Um item ruim não leva os bons junto.
    expect(lerWebhook(lote({ messages: [null, { from: MARINA.wa_id, id: "wamid.BOM", timestamp: TS, type: "text", text: { body: "oi" } }] }), NUMERO)).toHaveLength(1);
  });
});
