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
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

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

    // A IA sabe que dia é hoje e o que é "esta semana".
    const sistema = JSON.stringify((ia.pedidos.perguntar as { role: string }[]).filter((m) => m.role === "system"));
    expect(sistema).toContain("Hoje é quinta-feira, 29/10/2026");
    expect(sistema).toContain("Esta semana: de segunda-feira 26/10 (2026-10-26) a domingo 01/11 (2026-11-01)");
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
    expect(mensagens.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant", "user"]);
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
