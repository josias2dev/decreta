/**
 * Os limites da IA pela API, com a demonstração e um escritório de verdade no
 * mesmo banco: cada mensagem e cada chamada ficam anotadas; passou do limite
 * de mensagens ou de um teto do dia, a rota responde 429 com o aviso escrito
 * para a tela; o dia vira à meia-noite de Brasília.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import type { Pedido } from "../src/rotas/base.ts";
import { MockLanguageModelV4 } from "ai/test";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { AVISOS, reservarVez, SEM_LIMITES, usoDoDia, type LimitesDaIa } from "../src/servicos/uso-ia.ts";
import { iaFalsa } from "./ia-falsa.ts";

/** O que a IA de mentira gasta por chamada (100 tokens de entrada, 20 de saída) pelo preço de referência. */
const POR_CHAMADA = (100 * 4 + 20 * 20) / 1e6;

describe.skipIf(!hasTestDatabase)("limites da IA", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beatriz = "";
  let rafael = "";
  let ana = "";
  let demoId = "";
  let mendesId = "";
  let processoId = "";
  const ia = iaFalsa();
  const pedidos: Pedido[] = [];
  /** Os testes mexem nos limites daqui; a API lê a cada pedido. */
  const limites: LimitesDaIa = structuredClone(SEM_LIMITES);
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  let agora = new Date("2026-10-29T09:30:00-03:00");
  const relogio = (instante: string) => {
    agora = new Date(instante);
    setSystemTime(agora);
  };
  const depois = (minutos: number) => relogio(new Date(agora.getTime() + minutos * 60_000).toISOString());

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, cookie = beatriz) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const perguntar = async (cookie: string, texto = "Quais prazos vencem esta semana?") => {
    const r = await call("/ia/perguntar", { method: "POST", json: { texto } }, cookie);
    return { status: r.status, corpo: r.status === 200 ? await r.text() : ((await r.json()) as { erro: string; detalhe: string; passaLogo?: boolean }) };
  };
  // Só o limite do minuto e o de respostas ao mesmo tempo passam logo: nos outros, a tela não oferece "Tentar de novo".
  const barrado = (detalhe: string) => ({ status: 429, corpo: { erro: "limite_ia", detalhe, passaLogo: detalhe === AVISOS.minuto || detalhe === AVISOS.simultaneos } });
  const conversas = async (cookie: string) => ((await (await call("/ia/conversas", {}, cookie)).json()) as { conversas: { id: string }[] }).conversas;
  const zerar = () => Object.assign(limites, structuredClone(SEM_LIMITES));

  beforeAll(async () => {
    setSystemTime(agora);
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    demoId = (await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos })).organizationId;
    mendesId = (await criarEscritorio(t.db, auth, { nome: "Mendes Advocacia", slug: "mendes", dono: { email: "ana@mendes.adv.br", nome: "Ana Mendes", senha: "senha-bem-longa-123" } })).organizationId;
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async (p) => void pedidos.push(p), log: () => {}, limites });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const entrar = async (email: string, senha: string, organizationId: string) => {
      const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: senha }) });
      const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
      return cookie;
    };
    beatriz = await entrar("teste@decreta.site", "demonstracao-123", demoId);
    rafael = await entrar("rafael@demo.decreta.app", "demonstracao-123", demoId);
    ana = await entrar("ana@mendes.adv.br", "senha-bem-longa-123", mendesId);
    [{ id: processoId }] = (await t.owner`select id from processos where organization_id = ${demoId} limit 1`) as unknown as [{ id: string }];
    ia.respostas.perguntar = "Esta semana vencem 7 prazos.";
    ia.respostas["chat-processo"] = "O processo está na fase de perícia.";
    ia.respostas["resumo-autos"] = { resumo: "Resumo.", fase: "Perícia", pontos: [], recusa: null };
  }, 60_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("cada mensagem e cada chamada da IA ficam anotadas, só com números", async () => {
    expect((await perguntar(ana)).status).toBe(200);
    const linhas = await t.owner`select metodo, origem, mensagem, tokens_entrada, tokens_saida, custo_usd::float8 as custo, estimado, user_id from uso_ia where organization_id = ${mendesId} order by mensagem desc, em`;
    // A mensagem (antes de a IA responder), a resposta e o título da conversa.
    expect(linhas.map((l) => [l.metodo, l.mensagem, l.custo])).toEqual([
      ["perguntar", true, 0],
      ["perguntar", false, POR_CHAMADA],
      ["titulo-conversa", false, POR_CHAMADA],
    ]);
    expect(linhas.every((l) => l.origem === "tela" && l.user_id && l.estimado === (l.mensagem ? false : true))).toBe(true);
    const cols = await t.owner`select column_name from information_schema.columns where table_name = 'uso_ia'`;
    expect(cols.map((c) => c.column_name)).not.toContain("texto");
  });

  test("mensagens por minuto: a terceira seguida espera, e não vira conversa", async () => {
    depois(5);
    limites.mensagensPorMinuto = 2;
    expect((await perguntar(ana)).status).toBe(200);
    expect((await perguntar(ana)).status).toBe(200);
    const antes = (await conversas(ana)).length;
    expect(await perguntar(ana)).toEqual(barrado(AVISOS.minuto));
    expect(await conversas(ana)).toHaveLength(antes);
    depois(1.5);
    expect((await perguntar(ana)).status).toBe(200);
    zerar();
  });

  test("mensagens por dia: apagar as conversas não devolve, e o chat do processo conta junto", async () => {
    depois(5);
    const { mensagensHoje } = await usoDoDia(t.db, { organizationId: demoId, userId: (await t.owner`select id from "user" where email = 'teste@decreta.site'`)[0]!.id });
    limites.demonstracao.mensagensPorDia = mensagensHoje + 2;
    expect((await perguntar(beatriz)).status).toBe(200);
    const chat = await call(`/ia/chat/${processoId}`, { method: "POST", json: { texto: "Em que fase está?" } });
    expect(chat.status).toBe(200);
    expect(await chat.text()).toBe("O processo está na fase de perícia.");
    for (const k of await conversas(beatriz)) await call(`/ia/conversas/${k.id}`, { method: "DELETE" });
    expect(await perguntar(beatriz)).toEqual(barrado(AVISOS.mensagensDoDia(mensagensHoje + 2)));
    const chatBarrado = await call(`/ia/chat/${processoId}`, { method: "POST", json: { texto: "E agora?" } });
    expect(chatBarrado.status).toBe(429);
    // Cada pessoa da demonstração tem a sua conta; o escritório de verdade tem o limite dele.
    expect((await perguntar(rafael)).status).toBe(200);
    // Meia-noite de Brasília: o dia vira.
    relogio("2026-10-30T00:01:00-03:00");
    expect((await perguntar(beatriz)).status).toBe(200);
    zerar();
  });

  test("teto da demonstração: a demonstração para inteira, o outro escritório segue", async () => {
    relogio("2026-10-31T10:00:00-03:00");
    limites.demonstracao.tetoUsd = POR_CHAMADA;
    expect((await perguntar(beatriz)).status).toBe(200);
    expect(await perguntar(rafael)).toEqual(barrado(AVISOS.demonstracao));
    // Os botões também: resumo dos autos e peça.
    const resumo = await call(`/ia/resumo/${processoId}`, { method: "POST" });
    expect(resumo.status).toBe(429);
    expect(await resumo.json()).toEqual({ erro: "limite_ia", detalhe: AVISOS.demonstracao, passaLogo: false });
    expect((await perguntar(ana)).status).toBe(200);
    zerar();
  });

  test("arquivo enviado depois do teto fica guardado, sem a leitura da IA", async () => {
    relogio("2026-11-01T10:00:00-03:00");
    limites.demonstracao.tetoUsd = POR_CHAMADA;
    expect((await perguntar(beatriz)).status).toBe(200);
    pedidos.length = 0;
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "foto.png", { type: "image/png" }));
    form.set("processoId", processoId);
    const r = await call("/documentos", { method: "POST", body: form });
    expect(r.status).toBe(201);
    const doc = (await r.json()) as { id: string; lendo: boolean; limite?: string };
    expect(doc).toMatchObject({ lendo: false, limite: AVISOS.demonstracao });
    expect(pedidos).toEqual([]);
    const [d] = await t.owner`select leitura from documentos where id = ${doc.id}`;
    expect(d!.leitura).toBe("falhou");
    expect((await call(`/documentos/${doc.id}/ler`, { method: "POST" })).status).toBe(429);
    zerar();
  });

  test("teto por pessoa: só quem gastou para", async () => {
    relogio("2026-11-02T10:00:00-03:00");
    limites.tetoPessoaUsd = POR_CHAMADA;
    expect((await perguntar(beatriz)).status).toBe(200);
    expect(await perguntar(beatriz)).toEqual(barrado(AVISOS.pessoa));
    expect((await perguntar(rafael)).status).toBe(200);
    zerar();
  });

  test("teto do site: soma o gasto de todos os escritórios", async () => {
    relogio("2026-11-03T10:00:00-03:00");
    limites.tetoSiteUsd = 3 * POR_CHAMADA;
    expect((await perguntar(beatriz)).status).toBe(200);
    expect((await perguntar(ana)).status).toBe(200);
    expect(await perguntar(ana)).toEqual(barrado(AVISOS.site));
    expect(await perguntar(rafael)).toEqual(barrado(AVISOS.site));
    // Pelo RLS cada escritório só vê o seu gasto; o do site vem da soma.
    const uso = await usoDoDia(t.db, { organizationId: mendesId, userId: null });
    expect(uso.gastoEscritorioUsd).toBeCloseTo(2 * POR_CHAMADA, 9);
    expect(uso.gastoSiteUsd).toBeCloseTo(4 * POR_CHAMADA, 9);
    zerar();
  });

  test("quando o teto do gateway barra, o chat diz isso em vez de um erro qualquer", async () => {
    relogio("2026-11-04T10:00:00-03:00");
    const modelo = ia.modelo;
    ia.modelo = () =>
      new MockLanguageModelV4({
        doStream: async () => {
          throw Object.assign(new Error("teto"), { statusCode: 429, responseBody: '{"error":{"message":"teto diário do projeto decreta atingido","code":"teto-diario"}}' });
        },
      });
    try {
      const r = await perguntar(ana);
      expect(r.status).toBe(200);
      expect(r.corpo as string).toContain(JSON.stringify({ t: "texto", v: `\n\n${AVISOS.gateway}` }));
    } finally {
      ia.modelo = modelo;
    }
  });

  test("o Perguntar segura a vez enquanto a resposta chega: a terceira ao mesmo tempo espera", async () => {
    relogio("2026-11-05T10:00:00-03:00");
    limites.simultaneos = 2;
    const uso = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };
    let soltar = () => {};
    const solta = new Promise<void>((ok) => (soltar = ok));
    const modelo = ia.modelo;
    ia.modelo = () =>
      new MockLanguageModelV4({
        doStream: async () => ({
          stream: new ReadableStream({
            async start(c) {
              c.enqueue({ type: "stream-start", warnings: [] });
              await solta;
              c.enqueue({ type: "text-start", id: "t" });
              c.enqueue({ type: "text-delta", id: "t", delta: "Pronto." });
              c.enqueue({ type: "text-end", id: "t" });
              c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso });
              c.close();
            },
          }),
        }),
        doGenerate: async () => ({ content: [{ type: "text", text: "Conversa" }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] }),
      });
    try {
      const chegando = [await call("/ia/perguntar", { method: "POST", json: { texto: "Primeira" } }, ana), await call("/ia/perguntar", { method: "POST", json: { texto: "Segunda" } }, ana)];
      expect(chegando.map((r) => r.status)).toEqual([200, 200]);
      expect(await perguntar(ana, "Terceira")).toEqual(barrado(AVISOS.simultaneos));
      soltar();
      for (const r of chegando) expect(await r.text()).toContain("Pronto.");
      // Terminou, a vez voltou.
      expect((await perguntar(ana, "Quarta")).status).toBe(200);
    } finally {
      ia.modelo = modelo;
      zerar();
    }
  });

  test("pedidos ao mesmo tempo: a vez volta quando a resposta termina, ou sozinha em 5 minutos", () => {
    const a = reservarVez("pessoa-x", 2, 0)!;
    const b = reservarVez("pessoa-x", 2, 0)!;
    expect(reservarVez("pessoa-x", 2, 0)).toBeNull();
    a();
    const c = reservarVez("pessoa-x", 2, 1000);
    expect(c).not.toBeNull();
    expect(reservarVez("pessoa-x", 2, 1000)).toBeNull();
    expect(reservarVez("pessoa-x", 2, 5 * 60_000 + 1)).not.toBeNull();
    b();
    c!();
  });
});
