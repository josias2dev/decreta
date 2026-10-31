/**
 * O Perguntar pela API, com a demonstração no banco e a IA de mentira seguindo
 * um roteiro: a IA chama as ferramentas, a resposta chega aos poucos (uma
 * linha JSON por acontecimento), a conversa fica guardada e é só de quem
 * perguntou.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { PASSOS, type Ia } from "@decreta/ia";
import { MockLanguageModelV4 } from "ai/test";
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

const uso = { inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 20, text: 20, reasoning: 0 } };

describe.skipIf(!hasTestDatabase)("Perguntar: conversas com a IA e os dados do escritório", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let beatriz = "";
  let rafael = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  let conversaId = "";

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, cookie = beatriz) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  /** Manda a pergunta e lê a resposta inteira, linha a linha. */
  const perguntar = async (corpo: Record<string, unknown>, cookie = beatriz): Promise<Evento[]> => {
    const r = await call("/ia/perguntar", { method: "POST", json: corpo }, cookie);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("application/x-ndjson");
    return (await r.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Evento);
  };
  const texto = (eventos: Evento[]) => eventos.filter((e) => e.t === "texto").map((e) => e.v).join("");

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const entrar = async (email: string) => {
      const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "demonstracao-123" }) });
      const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
      return cookie;
    };
    beatriz = await entrar("teste@decreta.site");
    rafael = await entrar("rafael@demo.decreta.app");
  }, 60_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("a IA consulta os prazos da semana e a resposta chega com o cartão", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarPrazos", entrada: { ate: "2026-11-01" } }] }, "Esta semana vencem 7 prazos. O mais urgente já venceu."];
    ia.titulo = "Prazos desta semana";
    const eventos = await perguntar({ texto: "Quais prazos vencem esta semana?" });
    expect(eventos.map((e) => e.t).filter((t, i, a) => a.indexOf(t) === i)).toEqual(["inicio", "ferramenta", "resultado", "texto", "fim", "titulo"]);
    const inicio = eventos[0]!;
    expect(inicio.conversa.titulo).toBe("Quais prazos vencem esta semana");
    conversaId = inicio.conversa.id;

    const resultado = eventos.find((e) => e.t === "resultado")!;
    expect(resultado.nome).toBe("buscarPrazos");
    expect(resultado.saida.total).toBeGreaterThan(0);
    for (const p of resultado.saida.itens) {
      expect(p.fim <= "2026-11-01").toBe(true);
      expect(p.processo.id).toBeString();
    }
    expect(resultado.saida.itens.some((p: { urgencia: string }) => p.urgencia === "vencido")).toBe(true);
    expect(texto(eventos)).toBe("Esta semana vencem 7 prazos. O mais urgente já venceu.");
    expect(eventos.at(-1)).toEqual({ t: "titulo", v: "Prazos desta semana" });
    // O id da resposta vem no começo, e é com ele que ela fica gravada.
    expect(inicio.resposta.id).toBeString();
    expect(eventos.find((e) => e.t === "fim")).toEqual({ t: "fim", mensagem: { id: inicio.resposta.id } });

    // A IA sabe que dia é hoje, o que é "esta semana" e quais dias não têm expediente.
    const sistema = JSON.stringify((ia.pedidos.perguntar as { role: string }[]).filter((m) => m.role === "system"));
    expect(sistema).toContain("Hoje é quinta-feira, 29/10/2026");
    expect(sistema).toContain("Esta semana: de segunda-feira 26/10 (2026-10-26) a domingo 01/11 (2026-11-01)");
    expect(sistema).toContain("Tribunal principal do escritório: TJSC");
    expect(sistema).toContain("- seg 02/11 (2026-11-02): Finados, sem expediente");
  });

  test("a conversa fica no histórico, com o que a IA consultou", async () => {
    const lista = await json(call("/ia/conversas"));
    expect(lista.conversas[0]).toMatchObject({ id: conversaId, titulo: "Prazos desta semana", modo: "pergunte" });
    const k = await json(call(`/ia/conversas/${conversaId}`));
    expect(k.mensagens.map((m: { papel: string }) => m.papel)).toEqual(["pessoa", "ia"]);
    const ia1 = k.mensagens[1];
    expect(ia1.texto).toBe("Esta semana vencem 7 prazos. O mais urgente já venceu.");
    expect(ia1.partes.map((p: { tipo: string }) => p.tipo)).toEqual(["ferramenta", "texto"]);
    expect(ia1.partes[0].saida.itens.length).toBeGreaterThan(0);
    expect((await json(call("/ia/conversas?busca=urgente"))).conversas.map((c: { id: string }) => c.id)).toEqual([conversaId]);
    expect((await json(call("/ia/conversas?busca=alvará"))).conversas).toEqual([]);
  });

  test("na pergunta seguinte, a IA recebe o que consultou antes", async () => {
    ia.respostas.perguntar = ["O primeiro é da Marina."];
    const eventos = await perguntar({ texto: "E o primeiro, de quem é?", conversaId });
    expect(eventos[0]!.conversa.id).toBe(conversaId);
    expect(eventos.some((e) => e.t === "titulo")).toBe(false);
    const mensagens = ia.pedidos.perguntar as { role: string; content: unknown }[];
    // As instruções vão em duas partes: a fixa (com o cache) e a de agora.
    expect(mensagens.map((m) => m.role)).toEqual(["system", "system", "user", "assistant", "tool", "assistant", "user"]);
    expect(JSON.stringify(mensagens[3])).toContain("buscarPrazos");
  });

  test("os autos vão para a IA, mas não ficam guardados nem vão para a tela", async () => {
    const processos = await json(call("/processos?busca=Marina"));
    const marina = processos.itens[0].id as string;
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "lerProcesso", entrada: { processoId: marina } }] }, "O laudo do evento 87 confirma a incapacidade."];
    const eventos = await perguntar({ texto: "O que o laudo da Marina concluiu?" });
    const r = eventos.find((e) => e.t === "resultado")!;
    expect(r.saida.processo.titulo).toStartWith("Marina Duarte");
    expect(r.saida.prazos.length).toBeGreaterThan(0);
    expect(r.saida.autos).toBeUndefined();
    const paraIa = JSON.stringify(ia.pedidos.perguntar);
    expect(paraIa).toContain("## Movimentações");
    const k = await json(call(`/ia/conversas/${eventos[0]!.conversa.id}`));
    expect(JSON.stringify(k)).not.toContain("## Movimentações");
  });

  test("pedido errado da IA volta como erro da ferramenta, e a conversa segue", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarPrazos", entrada: { responsavel: "Fulano" } }] }, "Não há ninguém com esse nome."];
    const eventos = await perguntar({ texto: "Prazos do Fulano" });
    const r = eventos.find((e) => e.t === "resultado")!;
    expect(r.erro).toContain('Não há ninguém chamado "Fulano"');
    expect(texto(eventos)).toBe("Não há ninguém com esse nome.");
  });

  test("os prazos de alguém da equipe, pelo apelido", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarPrazos", entrada: { responsavel: "tiago" } }] }, "Estes são os do Tiago."];
    const r = (await perguntar({ texto: "Prazos do Tiago" })).find((e) => e.t === "resultado")!;
    expect(r.saida.itens.length).toBeGreaterThan(0);
    expect(new Set(r.saida.itens.map((p: { responsavel: { apelido: string } }) => p.responsavel.apelido))).toEqual(new Set(["Tiago"]));
  });

  test("contar prazo usa o motor e o calendário do tribunal", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "contarPrazo", entrada: { dias: 15, contagem: "uteis", publicadoEm: "2026-10-29" } }] }, "Vence em 23/11."];
    const r = (await perguntar({ texto: "Publicado hoje, 15 dias úteis vence quando?" })).find((e) => e.t === "resultado")!;
    expect(r.saida).toMatchObject({ publicacao: "2026-10-29", inicio: "2026-10-30", fim: "2026-11-23" });
    expect(r.saida.desconsiderados.map((f: { nome: string }) => f.nome)).toContain("Finados");
  });

  test("a IA só propõe a tarefa: quem cria é a pessoa", async () => {
    const antes = (await json(call("/agenda?de=2026-11-03&ate=2026-11-03"))).dias.flatMap((d: { itens: { tipo: string }[] }) => d.itens).filter((i: { tipo: string }) => i.tipo === "tarefa").length;
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "proporTarefa", entrada: { titulo: "Ligar para a Marina", dia: "2026-11-03" } }] }, "Deixei a tarefa pronta no cartão."];
    const eventos = await perguntar({ texto: "Me lembra de ligar para a Marina na terça" });
    const r = eventos.find((e) => e.t === "resultado")!;
    expect(r.saida).toMatchObject({ titulo: "Ligar para a Marina", dia: "2026-11-03", responsavel: { apelido: "Beatriz" } });
    const depois = (await json(call("/agenda?de=2026-11-03&ate=2026-11-03"))).dias.flatMap((d: { itens: { tipo: string }[] }) => d.itens).filter((i: { tipo: string }) => i.tipo === "tarefa").length;
    expect(depois).toBe(antes);

    // A pessoa confirma no cartão: a tarefa nasce uma vez só, mesmo com dois toques.
    const k = await json(call(`/ia/conversas/${eventos[0]!.conversa.id}`));
    const m = k.mensagens.at(-1);
    const pedido = { mensagemId: m.id, ferramentaId: m.partes[0].id };
    const criada = await json(call(`/ia/conversas/${eventos[0]!.conversa.id}/tarefa`, { method: "POST", json: pedido }));
    const de_novo = await json(call(`/ia/conversas/${eventos[0]!.conversa.id}/tarefa`, { method: "POST", json: pedido }));
    expect(de_novo.id).toBe(criada.id);
    const agora = (await json(call("/agenda?de=2026-11-03&ate=2026-11-03"))).dias.flatMap((d: { itens: { tipo: string; titulo: string }[] }) => d.itens).filter((i: { tipo: string }) => i.tipo === "tarefa");
    expect(agora.length).toBe(antes + 1);
    expect(agora.map((i: { titulo: string }) => i.titulo)).toContain("Ligar para a Marina");
    const guardada = (await json(call(`/ia/conversas/${eventos[0]!.conversa.id}`))).mensagens.at(-1).partes[0].saida;
    expect(guardada.criada.id).toBe(criada.id);
    expect((await call(`/ia/conversas/${eventos[0]!.conversa.id}/tarefa`, { method: "POST", json: pedido }, rafael)).status).toBe(404);
  });

  test("'Agora não' na tarefa proposta fica anotado e não cria nada", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "proporTarefa", entrada: { titulo: "Mandar o laudo para a Marina", dia: "2026-11-04" } }] }, "Deixei a tarefa pronta no cartão."];
    const eventos = await perguntar({ texto: "Me lembra de mandar o laudo na quarta" });
    const conversa = eventos[0]!.conversa.id as string;
    const pedido = { mensagemId: eventos[0]!.resposta.id, ferramentaId: eventos.find((e) => e.t === "ferramenta")!.id, descartar: true };
    const tarefas = async () => (await json(call("/agenda?de=2026-11-04&ate=2026-11-04"))).dias.flatMap((d: { itens: { tipo: string }[] }) => d.itens).filter((i: { tipo: string }) => i.tipo === "tarefa").length;
    const antes = await tarefas();
    expect((await call(`/ia/conversas/${conversa}/tarefa`, { method: "POST", json: pedido }, rafael)).status).toBe(404);
    const r = await call(`/ia/conversas/${conversa}/tarefa`, { method: "POST", json: pedido });
    expect(r.status).toBe(200);
    expect(await tarefas()).toBe(antes);
    expect((await json(call(`/ia/conversas/${conversa}`))).mensagens.at(-1).partes[0].saida).toMatchObject({ titulo: "Mandar o laudo para a Marina", descartada: true });
  });

  test("panorama, publicações, audiências e agenda respondem com a demonstração", async () => {
    ia.respostas.perguntar = [
      {
        ferramentas: [
          { nome: "panorama", entrada: {} },
          { nome: "buscarPublicacoes", entrada: {} },
          { nome: "buscarAudiencias", entrada: { ate: "2026-11-05" } },
          { nome: "verAgenda", entrada: { de: "2026-10-29", ate: "2026-11-04" } },
          { nome: "buscarClientes", entrada: { busca: "Marina" } },
          { nome: "buscarDocumentos", entrada: { busca: "laudo" } },
          { nome: "buscarAlvaras", entrada: {} },
          { nome: "buscarNegocios", entrada: {} },
          { nome: "verEquipe", entrada: {} },
          { nome: "buscarProcessos", entrada: { busca: "marina 5004321" } },
        ],
      },
      "Resumo do dia.",
    ];
    const eventos = await perguntar({ texto: "Como está o escritório?" });
    const por = Object.fromEntries(eventos.filter((e) => e.t === "resultado").map((e) => [e.nome, e.saida ?? e.erro]));
    // Os números da tela Hoje (a demonstração foi feita para eles).
    expect(por.panorama.prazos).toMatchObject({ vencidos: 1, hoje: 3 });
    expect(por.panorama.publicacoes.novas).toBe(7);
    expect(por.panorama.audiencias.hoje).toBe(2);
    expect(por.buscarPublicacoes.itens.length).toBeGreaterThan(0);
    expect(por.buscarAudiencias.itens[0]).toMatchObject({ dia: "2026-10-29" });
    expect(por.verAgenda.dias[0].dia).toBe("2026-10-29");
    expect(por.buscarClientes.itens[0].nome).toBe("Marina Duarte");
    expect(por.buscarDocumentos.itens.some((d: { trecho: string | null }) => d.trecho?.toLowerCase().includes("laudo"))).toBe(true);
    expect(por.buscarAlvaras.total).toBeGreaterThan(0);
    expect(por.buscarNegocios.total).toBeGreaterThan(0);
    expect(por.buscarProcessos.itens.map((p: { cnj: string }) => p.cnj)).toEqual(["5004321-25.2026.8.24.0038"]);
    expect(por.buscarProcessos.itens[0].proximoPrazo).toMatchObject({ tipo: "Manifestação sobre laudo pericial" });
    expect(por.verEquipe.itens.map((p: { apelido: string }) => p.apelido).sort()).toEqual(["Beatriz", "Camila", "Rafael", "Tiago"]);
  });

  /** Manda a pergunta e lê a resposta aos poucos, para dar para parar no meio. */
  const abrir = async (corpo: Record<string, unknown>, signal?: AbortSignal) => {
    const r = await call("/ia/perguntar", { method: "POST", json: corpo, signal });
    expect(r.status).toBe(200);
    const leitor = r.body!.getReader();
    const dec = new TextDecoder();
    const fila: Evento[] = [];
    let resto = "";
    const proximo = async (): Promise<Evento | null> => {
      while (!fila.length) {
        const { done, value } = await leitor.read();
        if (done) return null;
        resto += dec.decode(value, { stream: true });
        const linhas = resto.split("\n");
        resto = linhas.pop() ?? "";
        fila.push(...linhas.filter(Boolean).map((l) => JSON.parse(l) as Evento));
      }
      return fila.shift()!;
    };
    return {
      proximo,
      async ate(t: string) {
        for (;;) {
          const e = await proximo();
          if (!e || e.t === t) return e;
        }
      },
      async ateOFim() {
        const todos: Evento[] = [];
        for (let e = await proximo(); e; e = await proximo()) todos.push(e);
        return todos;
      },
    };
  };
  /** A IA que escreve `texto` e fica pensando até a pessoa parar (como a de verdade, a ligação cai com o sinal). */
  const iaQueEspera = (texto: string) =>
    new MockLanguageModelV4({
      doStream: async ({ abortSignal }) => ({
        stream: new ReadableStream({
          start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            if (texto) {
              c.enqueue({ type: "text-start", id: "t" });
              c.enqueue({ type: "text-delta", id: "t", delta: texto });
            }
            abortSignal?.addEventListener("abort", () => c.error(new DOMException("A pessoa parou", "AbortError")));
          },
        }),
      }),
    });
  const comModelo = async <T>(modelo: Ia["modelo"], fn: () => Promise<T>): Promise<T> => {
    const antes = ia.modelo;
    ia.modelo = modelo;
    try {
      return await fn();
    } finally {
      ia.modelo = antes;
    }
  };
  const ultimaDa = async (conversa: string) => (await json(call(`/ia/conversas/${conversa}`))).mensagens.at(-1);
  const PAROU = "[Você parou a resposta aqui.]";

  test("parar: com texto, sem texto e com a ferramenta ainda consultando", async () => {
    // Com texto.
    let parar = new AbortController();
    const [inicio, depois] = await comModelo(
      () => iaQueEspera("Até domingo vencem 6 prazos."),
      async () => {
        const r = await abrir({ texto: "Como está a minha semana?" }, parar.signal);
        const inicio = (await r.proximo())!;
        await r.ate("texto");
        parar.abort();
        return [inicio, await r.ateOFim()] as const;
      },
    );
    expect(depois.at(-1)).toEqual({ t: "fim", mensagem: { id: inicio.resposta.id } });
    expect(depois.some((e) => e.t === "titulo")).toBe(false);
    let m = await ultimaDa(inicio.conversa.id);
    expect(m.id).toBe(inicio.resposta.id);
    expect(m.texto).toBe(`Até domingo vencem 6 prazos.\n\n${PAROU}`);

    // Sem texto nenhum: fica só o aviso, nunca uma resposta vazia.
    parar = new AbortController();
    const semTexto = await comModelo(
      () => iaQueEspera(""),
      async () => {
        const r = await abrir({ texto: "Como está a minha semana?" }, parar.signal);
        const inicio = (await r.proximo())!;
        parar.abort();
        await r.ateOFim();
        return inicio;
      },
    );
    m = await ultimaDa(semTexto.conversa.id);
    expect(m).toMatchObject({ id: semTexto.resposta.id, texto: PAROU, partes: [{ tipo: "texto", texto: PAROU }] });

    // A ferramenta ainda consultando (a tabela de audiências travada segura o lerProcesso).
    const marina = (await json(call("/processos?busca=Marina"))).itens[0].id as string;
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "lerProcesso", entrada: { processoId: marina } }] }, "Não chega aqui."];
    let soltar = () => {};
    const solta = new Promise<void>((ok) => (soltar = ok));
    let travou = () => {};
    const travada = new Promise<void>((ok) => (travou = ok));
    const trava = t.owner.begin(async (sql) => {
      await sql`lock table audiencias in access exclusive mode`;
      travou();
      await solta;
    });
    await travada;
    parar = new AbortController();
    const r = await abrir({ texto: "Em que pé está o processo da Marina?" }, parar.signal);
    const lendo = (await r.proximo())!;
    const chamada = (await r.ate("ferramenta"))!;
    expect(chamada.nome).toBe("lerProcesso");
    parar.abort();
    const resto = await r.ateOFim();
    soltar();
    await trava;
    expect(resto).toContainEqual({ t: "resultado", id: chamada.id, nome: "lerProcesso", erro: "Parou antes de terminar." });
    expect(resto.at(-1)).toEqual({ t: "fim", mensagem: { id: lendo.resposta.id } });
    m = await ultimaDa(lendo.conversa.id);
    expect(m.partes).toEqual([
      { tipo: "ferramenta", id: chamada.id, nome: "lerProcesso", entrada: { processoId: marina }, saida: null, erro: "Parou antes de terminar." },
      { tipo: "texto", texto: PAROU },
    ]);

    // Na pergunta seguinte, a IA sabe que parou e que a consulta não terminou.
    ia.respostas.perguntar = ["Vou abrir de novo."];
    await perguntar({ texto: "Continue", conversaId: lendo.conversa.id });
    const paraIa = JSON.stringify(ia.pedidos.perguntar);
    expect(paraIa).toContain(PAROU);
    expect(paraIa).toContain('{"type":"error-text","value":"Parou antes de terminar."}');
  });

  test("não achou o processo, o cliente ou o documento: é erro da ferramenta, sem saída", async () => {
    const nenhum = "00000000-0000-4000-8000-000000000000";
    ia.respostas.perguntar = [
      {
        ferramentas: [
          { nome: "lerProcesso", entrada: { processoId: nenhum } },
          { nome: "lerCliente", entrada: { clienteId: nenhum } },
          { nome: "lerDocumento", entrada: { documentoId: nenhum } },
        ],
      },
      "Não achei nenhum dos três.",
    ];
    const eventos = await perguntar({ texto: "Abra o processo, o cliente e o documento deste id" });
    const resultados = eventos.filter((e) => e.t === "resultado").sort((a, b) => a.nome.localeCompare(b.nome));
    expect(resultados.map((e) => [e.nome, e.erro, "saida" in e])).toEqual([
      ["lerCliente", "Não achei cliente com este id. Busque de novo pelo nome.", false],
      ["lerDocumento", "Não achei documento com este id. Busque de novo pelo nome.", false],
      ["lerProcesso", "Não achei processo com este id. Busque de novo pelo nome.", false],
    ]);
    // A IA recebe o erro como erro da ferramenta.
    expect(JSON.stringify(ia.pedidos.perguntar)).toMatch(/"type":"error-text","value":"[^"]*Não achei documento com este id\. Busque de novo pelo nome\."/);
    const m = await ultimaDa(eventos[0]!.conversa.id);
    expect(m.partes.filter((p: { tipo: string }) => p.tipo === "ferramenta").map((p: { saida: unknown; erro: string }) => [p.saida, p.erro.slice(0, 9)])).toEqual([
      [null, "Não achei"],
      [null, "Não achei"],
      [null, "Não achei"],
    ]);
  });

  test("tentar de novo depois de a resposta cair: a pergunta não se repete e a resposta cortada sai", async () => {
    ia.respostas.perguntar = "Primeira resposta.";
    const primeira = await perguntar({ texto: "Quais audiências tenho amanhã?" });
    const conversa = primeira[0]!.conversa.id as string;
    // A segunda cai no meio (a ligação foi embora).
    const parar = new AbortController();
    const caiu = await comModelo(
      () => iaQueEspera("Amanhã você tem"),
      async () => {
        const r = await abrir({ texto: "E na sexta?", conversaId: conversa }, parar.signal);
        const inicio = (await r.proximo())!;
        await r.ate("texto");
        parar.abort();
        await r.ateOFim();
        return inicio;
      },
    );
    const perguntaId = caiu.pergunta.id as string;

    // Só a última pergunta pode ser refeita, e só numa conversa.
    expect((await call("/ia/perguntar", { method: "POST", json: { texto: "Quais audiências tenho amanhã?", conversaId: conversa, refazer: primeira[0]!.pergunta.id } })).status).toBe(409);
    expect((await call("/ia/perguntar", { method: "POST", json: { texto: "E na sexta?", refazer: perguntaId } })).status).toBe(400);
    expect((await call("/ia/perguntar", { method: "POST", json: { texto: "E na sexta?", conversaId: conversa, refazer: caiu.resposta.id } })).status).toBe(404);
    expect((await call("/ia/perguntar", { method: "POST", json: { texto: "E na sexta?", conversaId: conversa, refazer: perguntaId } }, rafael)).status).toBe(404);

    ia.respostas.perguntar = "Na sexta, duas audiências.";
    const eventos = await perguntar({ texto: "E na sexta?", conversaId: conversa, refazer: perguntaId });
    expect(eventos[0]!.pergunta.id).toBe(perguntaId);
    const k = await json(call(`/ia/conversas/${conversa}`));
    expect(k.mensagens.map((m: { papel: string; texto: string }) => [m.papel, m.texto])).toEqual([
      ["pessoa", "Quais audiências tenho amanhã?"],
      ["ia", "Primeira resposta."],
      ["pessoa", "E na sexta?"],
      ["ia", "Na sexta, duas audiências."],
    ]);
    expect(k.mensagens[3].id).toBe(eventos[0]!.resposta.id);
    // A IA recebe a pergunta uma vez só, sem a resposta cortada.
    const mensagens = ia.pedidos.perguntar as { role: string }[];
    expect(mensagens.filter((m) => m.role !== "system").map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(JSON.stringify(mensagens)).not.toContain("Amanhã você tem");
  });

  /** A IA que escreve `texto` e só termina quando o teste solta (a ligação caiu do lado da pessoa, mas aqui ela segue). */
  const iaQueSegura = (texto: string) => {
    let soltar = () => {};
    const solta = new Promise<void>((ok) => (soltar = ok));
    const modelo = new MockLanguageModelV4({
      doStream: async () => ({
        stream: new ReadableStream({
          async start(c) {
            c.enqueue({ type: "stream-start", warnings: [] });
            c.enqueue({ type: "text-start", id: "t" });
            c.enqueue({ type: "text-delta", id: "t", delta: texto });
            await solta;
            c.enqueue({ type: "text-end", id: "t" });
            c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso });
            c.close();
          },
        }),
      }),
    });
    return { modelo, soltar };
  };

  test("tentar de novo com a resposta antiga ainda chegando aqui: só a nova fica gravada", async () => {
    ia.respostas.perguntar = "Primeira resposta.";
    const conversa = (await perguntar({ texto: "Quais audiências tenho amanhã?" }))[0]!.conversa.id as string;
    const mensagens = async () => (await json(call(`/ia/conversas/${conversa}`))).mensagens.map((m: { papel: string; texto: string }) => [m.papel, m.texto]);

    // A antiga termina depois da nova: não é gravada.
    const antiga = iaQueSegura("Resposta antiga, completa.");
    const a = await comModelo(
      () => antiga.modelo,
      async () => {
        const r = await abrir({ texto: "E na sexta?", conversaId: conversa });
        const inicio = (await r.proximo())!;
        await r.ate("texto");
        return { r, inicio };
      },
    );
    const perguntaId = a.inicio.pergunta.id as string;
    ia.respostas.perguntar = "Na sexta, duas audiências.";
    const nova = await perguntar({ texto: "E na sexta?", conversaId: conversa, refazer: perguntaId });
    antiga.soltar();
    expect((await a.r.ateOFim()).at(-1)).toEqual({ t: "fim", mensagem: null });
    expect(await mensagens()).toEqual([
      ["pessoa", "Quais audiências tenho amanhã?"],
      ["ia", "Primeira resposta."],
      ["pessoa", "E na sexta?"],
      ["ia", "Na sexta, duas audiências."],
    ]);

    // A antiga que chegou a ser gravada enquanto a nova chegava sai quando a nova é gravada.
    const outra = iaQueSegura("Na sexta, três audiências.");
    const b = await comModelo(
      () => outra.modelo,
      async () => {
        const r = await abrir({ texto: "E na sexta?", conversaId: conversa, refazer: perguntaId });
        await r.ate("texto");
        return r;
      },
    );
    await t.owner`insert into mensagens_ia (organization_id, conversa_id, user_id, papel, texto) select organization_id, conversa_id, user_id, 'ia', 'Resposta antiga que escapou' from mensagens_ia where id = ${perguntaId}`;
    outra.soltar();
    await b.ateOFim();
    expect((await mensagens()).slice(2)).toEqual([
      ["pessoa", "E na sexta?"],
      ["ia", "Na sexta, três audiências."],
    ]);
    expect(nova[0]!.pergunta.id).toBe(perguntaId);
  });

  test("8 rodadas de consulta: a última vai sem ferramentas e, se ainda vier vazia, a resposta diz que parou", async () => {
    const consulta = { ferramentas: [{ nome: "verEquipe", entrada: {} }] };
    ia.respostas.perguntar = Array.from({ length: 9 }, () => consulta);
    const antes = ia.chamadas.length;
    const eventos = await perguntar({ texto: "Para cada pessoa da equipe, uma de cada vez, veja os prazos" });
    expect(ia.chamadas.length - antes).toBe(PASSOS);
    expect(eventos.filter((e) => e.t === "ferramenta")).toHaveLength(PASSOS - 1);
    expect(texto(eventos)).toBe(`\n\n[Parei depois de ${PASSOS} rodadas de consulta, antes de escrever a resposta. Peça para eu continuar.]`);
    // Aviso não vira nome de conversa.
    expect(eventos.some((e) => e.t === "titulo")).toBe(false);
  });

  test("o nome da conversa: só com resposta de verdade, e pedido ainda no meio da resposta longa", async () => {
    const titulos: string[] = [];
    const caiu = await comModelo(
      () =>
        new MockLanguageModelV4({
          doStream: async () => {
            throw new Error("a IA caiu");
          },
          doGenerate: async (o) => {
            titulos.push(JSON.stringify(o.prompt));
            return { content: [{ type: "text", text: "Não deveria" }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
          },
        }),
      () => perguntar({ texto: "Quais prazos vencem amanhã?" }),
    );
    expect(texto(caiu)).toBe("\n\nNão consegui responder agora. Tente de novo em instantes.");
    expect(caiu.some((e) => e.t === "titulo")).toBe(false);
    expect(titulos).toEqual([]);

    // Resposta longa: o nome é pedido com o começo dela, e chega logo depois do fim.
    const longa = Array.from({ length: 12 }, (_, i) => `Parágrafo ${i + 1} da resposta longa sobre os prazos da semana.`).join("\n\n");
    let fechou = false;
    const eventos = await comModelo(
      () =>
        new MockLanguageModelV4({
          doStream: async () => ({
            stream: new ReadableStream({
              async start(c) {
                c.enqueue({ type: "stream-start", warnings: [] });
                c.enqueue({ type: "text-start", id: "t" });
                for (const pedaco of longa.match(/[\s\S]{1,40}/g)!) {
                  await Bun.sleep(5);
                  c.enqueue({ type: "text-delta", id: "t", delta: pedaco });
                }
                c.enqueue({ type: "text-end", id: "t" });
                c.enqueue({ type: "finish", finishReason: { unified: "stop", raw: "stop" }, usage: uso });
                fechou = true;
                c.close();
              },
            }),
          }),
          doGenerate: async (o) => {
            titulos.push(fechou ? "depois" : "durante");
            const resposta = /Resposta: ([\s\S]*)"/.exec(JSON.stringify(o.prompt))?.[1] ?? "";
            titulos.push(String(resposta.length < longa.length));
            return { content: [{ type: "text", text: "Prazos da semana" }], finishReason: { unified: "stop", raw: "stop" }, usage: uso, warnings: [] };
          },
        }),
      () => perguntar({ texto: "Me explique os prazos da semana" }),
    );
    expect(titulos).toEqual(["durante", "true"]);
    expect(eventos.map((e) => e.t).slice(-2)).toEqual(["fim", "titulo"]);
    expect((await json(call(`/ia/conversas/${eventos[0]!.conversa.id}`))).conversa.titulo).toBe("Prazos da semana");
  });

  test("conversa longa: o começo do que vai para a IA anda de 20 em 20 mensagens (e o cache vale)", async () => {
    ia.respostas.perguntar = "Certo.";
    const conversa = (await perguntar({ texto: "Pergunta de agora 1" }))[0]!.conversa.id as string;
    // 56 mensagens mais antigas, uma pergunta e uma resposta de cada vez.
    await t.owner`
      insert into mensagens_ia (organization_id, conversa_id, user_id, papel, texto, created_at)
      select k.organization_id, k.id, k.user_id, (case when n % 2 = 0 then 'pessoa' else 'ia' end)::papel_mensagem, 'Antiga ' || n, now() - interval '1 hour' + n * interval '1 second'
      from conversas k, generate_series(0, 55) n where k.id = ${conversa}`;
    const primeiraDoPedido = () => (ia.pedidos.perguntar as { role: string; content: { text: string }[] }[]).find((m) => m.role === "user")!.content[0]!.text;
    await perguntar({ texto: "Pergunta de agora 2", conversaId: conversa });
    expect(primeiraDoPedido()).toBe("Antiga 0");
    await perguntar({ texto: "Pergunta de agora 3", conversaId: conversa });
    const corte = primeiraDoPedido();
    expect(corte).toBe("Antiga 20");
    await perguntar({ texto: "Pergunta de agora 4", conversaId: conversa });
    expect(primeiraDoPedido()).toBe(corte);
  });

  test("o prazo marcado cumprido pelo cartão continua cumprido quando a conversa abre de novo", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarPrazos", entrada: { ate: "2026-11-01" } }] }, "Estes são os prazos."];
    const eventos = await perguntar({ texto: "Prazos até domingo" });
    const conversa = eventos[0]!.conversa.id as string;
    const antes = eventos.find((e) => e.t === "resultado")!.saida.itens.find((p: { situacao: string }) => p.situacao === "confirmado");
    const doCartao = async () => (await json(call(`/ia/conversas/${conversa}`))).mensagens[1].partes[0].saida.itens.find((p: { id: string }) => p.id === antes.id);

    expect((await call(`/prazos/${antes.id}/cumprir`, { method: "POST" })).status).toBe(200);
    expect(await doCartao()).toMatchObject({ situacao: "cumprido", urgencia: "cumprido", cumpridoEm: "2026-10-29" });
    // Só a cópia da tela muda: a gravada (que volta para a IA) é a foto de quando ela consultou.
    const [gravada] = await t.owner<{ partes: { saida: { itens: { id: string; situacao: string }[] } }[] }[]>`select partes from mensagens_ia where conversa_id = ${conversa} and papel = 'ia'`;
    expect(gravada!.partes[0]!.saida.itens.find((p) => p.id === antes.id)!.situacao).toBe("confirmado");

    expect((await call(`/prazos/${antes.id}/reabrir`, { method: "POST" })).status).toBe(200);
    expect(await doCartao()).toEqual(antes);
  });

  test("a conversa é só de quem perguntou", async () => {
    expect((await call(`/ia/conversas/${conversaId}`, {}, rafael)).status).toBe(404);
    expect((await json(call("/ia/conversas", {}, rafael))).conversas).toEqual([]);
    expect((await call("/ia/perguntar", { method: "POST", json: { texto: "oi", conversaId } }, rafael)).status).toBe(404);
    expect((await call(`/ia/conversas/${conversaId}`, { method: "DELETE" }, rafael)).status).toBe(404);
  });

  test("renomear, fixar e apagar", async () => {
    await call(`/ia/conversas/${conversaId}`, { method: "PATCH", json: { titulo: "Semana da Beatriz", fixada: true } });
    const lista = await json(call("/ia/conversas"));
    expect(lista.conversas[0]).toMatchObject({ id: conversaId, titulo: "Semana da Beatriz", fixada: true });
    expect((await call(`/ia/conversas/${conversaId}`, { method: "DELETE" })).status).toBe(200);
    expect((await call(`/ia/conversas/${conversaId}`)).status).toBe(404);
  });
});
