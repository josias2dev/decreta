/**
 * Cliente que recusou a IA (Recomendação CFOAB 001/2024, item 4.3.2): nada
 * dos casos dele vai a um modelo. As ações de IA do processo são recusadas,
 * a rotina de fundo não lê as publicações nem as fotos, e o Perguntar não vê
 * o cliente. Desmarcar devolve a IA.
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
import { ClienteSemIa } from "../src/servicos/contexto.ts";
import { lerDocumentoComIa } from "../src/servicos/leitura.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

describe.skipIf(!hasTestDatabase)("cliente sem IA: nada dos casos dele vai a um modelo", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  let clienteId = "";
  const ia = iaFalsa();
  const arquivos = armazenamentoEmMemoria();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const recusada = async (r: Response | Promise<Response>) => {
    const res = await r;
    expect(res.status).toBe(403);
    expect(((await res.json()) as { erro: string }).erro).toBe("cliente_sem_ia");
  };
  const perguntar = async (texto: string): Promise<Evento[]> =>
    (await (await call("/ia/perguntar", { method: "POST", json: { texto } })).text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Evento);

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    ({ organizationId: orgId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos }));
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "teste@decreta.site", password: "demonstracao-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    processoId = (await json(call("/processos?busca=Marina"))).itens[0].id;
    clienteId = (await json(call(`/processos/${processoId}`))).cliente.id;
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("a marcação fica na ficha do cliente, no processo e na auditoria", async () => {
    expect((await json(call(`/clientes/${clienteId}`))).semIa).toBe(false);
    expect((await call(`/clientes/${clienteId}`, { method: "PUT", json: { semIa: true } })).status).toBe(200);
    expect((await json(call(`/clientes/${clienteId}`))).semIa).toBe(true);
    expect((await json(call(`/processos/${processoId}`))).cliente.semIa).toBe(true);
    const auditoria = await t.owner<{ detalhes: { semIa: boolean } }[]>`select detalhes from auditoria where organization_id = ${orgId} and acao = 'cliente.sem_ia'`;
    expect(auditoria.map((a) => a.detalhes.semIa)).toEqual([true]);
  });

  test("resumo, chat, briefing e peça do processo são recusados sem chamar a IA", async () => {
    const [prazo] = await t.owner<{ id: string }[]>`select id from prazos where processo_id = ${processoId} limit 1`;
    ia.chamadas.length = 0;
    await recusada(call(`/ia/resumo/${processoId}`, { method: "POST" }));
    await recusada(call(`/ia/chat/${processoId}`, { method: "POST", json: { texto: "O que o laudo concluiu?" } }));
    await recusada(call(`/ia/briefing/${prazo!.id}`, { method: "POST" }));
    await recusada(call("/pecas", { method: "POST", json: { processoId, tipo: "manifestacao-laudo", instrucoes: "" } }));
    await recusada(call("/ia/perguntar", { method: "POST", json: { texto: "Resuma este processo.", processoId } }));
    await recusada(call("/ia/atendimento", { method: "POST", json: { transcricao: "A cliente ligou pedindo notícias do laudo.", clienteId } }));
    expect(ia.chamadas).toEqual([]);
  });

  test("a publicação do processo não vai à IA, nem pela tela nem pela rotina de fundo", async () => {
    const [pub] = await t.owner<{ id: string }[]>`select id from publicacoes where processo_id = ${processoId} limit 1`;
    ia.chamadas.length = 0;
    await recusada(call(`/publicacoes/${pub!.id}/sugerir`, { method: "POST" }));
    await recusada(call(`/publicacoes/${pub!.id}/sentenca`, { method: "POST" }));
    expect(sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, pub!.id)).rejects.toBeInstanceOf(ClienteSemIa);
    expect(ia.chamadas).toEqual([]);
  });

  test("foto enviada no processo fica sem a leitura da IA", async () => {
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "foto-do-recibo.jpg", { type: "image/jpeg" }));
    form.set("processoId", processoId);
    const doc = await json(call("/documentos", { method: "POST", body: form }));
    expect(doc.lendo).toBe(false);
    ia.chamadas.length = 0;
    expect(await lerDocumentoComIa({ db: t.db, ia, arquivos }, orgId, doc.id)).toBe("dispensada");
    await recusada(call(`/documentos/${doc.id}/ler`, { method: "POST" }));
    await recusada(call(`/clientes/${clienteId}/conferir`, { method: "POST" }));
    expect(ia.chamadas).toEqual([]);
  });

  test("o Perguntar não vê o cliente: some das buscas, e a ficha e os autos são recusados", async () => {
    ia.respostas.perguntar = [
      {
        ferramentas: [
          { nome: "buscarProcessos", entrada: { busca: "Marina" } },
          { nome: "buscarClientes", entrada: { busca: "Marina" } },
          { nome: "buscarPrazos", entrada: { busca: "Marina" } },
          { nome: "buscarPublicacoes", entrada: { situacao: "todas" } },
          { nome: "buscarDocumentos", entrada: { processoId } },
          { nome: "lerProcesso", entrada: { processoId } },
          { nome: "lerCliente", entrada: { clienteId } },
        ],
      },
      "Não tenho acesso a esse cliente.",
    ];
    const eventos = await perguntar("Como está o caso da Marina?");
    const resultados = eventos.filter((e) => e.t === "resultado");
    expect(resultados).toHaveLength(7);
    // O que as ferramentas mandaram à IA (o prompt do sistema cita a Marina como exemplo de link).
    const dasFerramentas = JSON.stringify((ia.pedidos.perguntar as { role: string }[]).filter((m) => m.role === "tool"));
    expect(dasFerramentas).not.toContain("Marina Duarte");
    expect(dasFerramentas).not.toContain(processoId);
    expect(dasFerramentas.match(/O cliente não autorizou o uso de IA/g)).toHaveLength(2);
  });

  test("nem na agenda, nos negócios, na conta do prazo ou na tarefa proposta", async () => {
    // Uma tarefa só do cliente e um negócio que virou cliente dele, com o nome no título.
    expect((await call("/tarefas", { method: "POST", json: { titulo: "Ligar para a Marina Duarte", dia: "2026-10-29", clienteId } })).status).toBe(201);
    const negocio = await json(call("/negocios", { method: "POST", json: { nome: "Marina Duarte", assunto: "Revisão do seguro" } }));
    expect((await call(`/negocios/${negocio.id}/concluir`, { method: "POST", json: { clienteId } })).status).toBe(200);
    ia.respostas.perguntar = [
      {
        ferramentas: [
          { nome: "verAgenda", entrada: { de: "2026-10-29", ate: "2026-10-30" } },
          { nome: "buscarNegocios", entrada: { etapa: "todos" } },
          { nome: "contarPrazo", entrada: { processoId, publicadoEm: "2026-10-29", dias: 15, contagem: "uteis" } },
          { nome: "proporTarefa", entrada: { titulo: "Ligar sobre o laudo", dia: "2026-10-30", clienteId } },
        ],
      },
      "Não tenho acesso a esse cliente.",
    ];
    const eventos = await perguntar("O que tem para a Marina esta semana?");
    expect(eventos.filter((e) => e.t === "resultado")).toHaveLength(4);
    const dasFerramentas = JSON.stringify((ia.pedidos.perguntar as { role: string }[]).filter((m) => m.role === "tool"));
    expect(dasFerramentas).not.toContain("Marina Duarte");
    expect(dasFerramentas).not.toContain(processoId);
    expect(dasFerramentas.match(/O cliente não autorizou o uso de IA/g)).toHaveLength(2);
  });

  test("desmarcar devolve a IA", async () => {
    await call(`/clientes/${clienteId}`, { method: "PUT", json: { semIa: false } });
    ia.respostas["resumo-autos"] = { resumo: "Ação de cobrança de seguro.", pontos: [], recusa: null };
    const r = await call(`/ia/resumo/${processoId}`, { method: "POST" });
    expect(r.status).toBe(200);
    const auditoria = await t.owner<{ detalhes: { semIa: boolean } }[]>`select detalhes from auditoria where organization_id = ${orgId} and acao = 'cliente.sem_ia' order by created_at`;
    expect(auditoria.map((a) => a.detalhes.semIa)).toEqual([true, false]);
  });
});
