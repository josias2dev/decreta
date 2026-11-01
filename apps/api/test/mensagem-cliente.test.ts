/**
 * Cliente no WhatsApp (Fase 3): a IA escreve, o advogado aprova e só então a
 * mensagem sai, com o nome do escritório e o rodapé contra o golpe. Banco de
 * verdade (RLS), IA de mentira e um wameow falso que guarda o que receberia.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { hojeEm, horaLocal, somarDias } from "@decreta/core";
import { analises, clientes, prazos, processos, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { rotasDoEnvioPeloCliente } from "../src/rotas/envio-pelo-cliente.ts";
import { createRotas } from "../src/rotas/index.ts";
import type { Wameow } from "../src/servicos/avisos.ts";
import { iaFalsa } from "./ia-falsa.ts";

const BRIEFING = {
  decidiu: "O juízo abriu 15 dias úteis para as partes falarem sobre o laudo pericial do evento 87.",
  fazer: ["Protocolar a manifestação sobre o laudo"],
  aFavor: ["O laudo confirma a incapacidade parcial (evento 87)."],
  contra: ["A ré impugnou o valor da causa (evento 89)."],
  recusa: null,
};
const RASCUNHO = "Olá, Marina. O juiz pediu que as partes falem sobre o laudo do perito. Vamos preparar a resposta e combinamos os detalhes com você.";

/** Um wameow de mentira: guarda cada envio e pode falhar de propósito, ou não responder a tempo. */
function wameowFalso() {
  const enviados: { number: string; text: string }[] = [];
  const estado = { falhar: false, semResposta: false, aoEnviar: null as (() => Promise<void>) | null };
  const w: Wameow = {
    url: "http://wameow.local",
    token: "token-de-teste",
    fetch: (async (_url: string, init: RequestInit) => {
      await estado.aoEnviar?.();
      if (estado.falhar) return new Response("fora do ar", { status: 500 });
      enviados.push(JSON.parse(String(init.body)));
      if (estado.semResposta) throw new DOMException("sem resposta", "TimeoutError");
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch,
  };
  return { w, enviados, estado };
}

describe.skipIf(!hasTestDatabase)("mensagem ao cliente no WhatsApp", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let auth: ReturnType<typeof createAuth>;
  const ia = iaFalsa();
  const zap = wameowFalso();
  const pedidos: Pedido[] = [];
  let filaFora = false;
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const escritorio = { cookie: "", orgId: "", prazoId: "", clienteId: "", userId: "" };
  const demo = { cookie: "", orgId: "", prazoId: "", clienteId: "", userId: "" };

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, cookie = escritorio.cookie) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, ...(cookie ? { cookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  async function entrar(alvo: typeof escritorio, email: string, slug: string, nome: string) {
    const { organizationId } = await criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "41.233", oabUf: "SC" } });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    alvo.cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: alvo.cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
    alvo.orgId = organizationId;
    alvo.userId = (await t.owner<{ id: string }[]>`select id from "user" where email = ${email}`)[0]!.id;
    // Uma cliente inventada, com processo, prazo e o briefing pronto.
    await withTenant(t.db, organizationId, async (tx) => {
      const [cl] = await tx.insert(clientes).values({ organizationId, nome: "Marina Duarte", telefone: "(47) 99123-4567" }).returning();
      const [p] = await tx.insert(processos).values({ organizationId, titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: "5001234-56.2026.8.24.0038", clienteId: cl!.id }).returning();
      const [pz] = await tx.insert(prazos).values({ organizationId, processoId: p!.id, tipo: "Manifestação sobre laudo pericial", dias: 15, publicadoEm: "2026-10-29", inicio: "2026-10-30", fim: "2026-11-23" }).returning();
      await tx.insert(analises).values({ organizationId, alvo: "prazo", alvoId: pz!.id, acao: "briefing-prazo", situacao: "pronto", conteudo: BRIEFING, base: "b" });
      alvo.clienteId = cl!.id;
      alvo.prazoId = pz!.id;
    });
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    const enfileirar = async (p: Pedido) => {
      if (filaFora) throw new Error("fila fora do ar");
      pedidos.push(p);
    };
    const rotas = createRotas({
      db: t.db,
      auth,
      ia,
      arquivos,
      mailer: createLogMailer(() => {}),
      telas: "https://decreta.local",
      captura: { db: t.db, datajudKey: "" },
      wameow: zap.w,
      maxArquivoBytes: 5e6,
      enfileirar,
      log: () => {},
    });
    // Dez envios ao mesmo tempo, para o teste do teto por link disparar vários de uma vez.
    const envio = rotasDoEnvioPeloCliente({ db: t.db, ia, arquivos, maxArquivoBytes: 5e6, enfileirar, log: () => {}, aoMesmoTempo: 10 });
    app = createApp({ db: t.db, env, auth, rotas, envio, log: () => {} });
    await entrar(escritorio, "beatriz@souza.adv.br", "souza-mendes", "Souza & Mendes Advocacia");
    await entrar(demo, "teste@decreta.site", SLUG_DA_DEMONSTRACAO, "Escritório de Demonstração");
  });

  afterAll(async () => {
    await t?.drop();
  });

  let mensagemId = "";

  test("a IA escreve o rascunho a partir do briefing e nada sai no WhatsApp", async () => {
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    const r = await call(`/prazos/${escritorio.prazoId}/mensagem-cliente`, { method: "POST" });
    expect(r.status).toBe(201);
    const m = await json(r);
    expect(m).toMatchObject({ situacao: "rascunho", tipo: "decisao", texto: RASCUNHO, para: "(47) 99123-4567" });
    expect(m.previa).toStartWith("*Souza & Mendes Advocacia*");
    mensagemId = m.id;
    expect(zap.enviados).toHaveLength(0);
    // De onde veio o rascunho: o modelo e o prompt, para responder por ele depois.
    const [linha] = await t.owner<{ procedencia: { codigo: string; chamadas: unknown[] } }[]>`select procedencia from mensagens_cliente where id = ${m.id}`;
    expect(linha!.procedencia.chamadas).toEqual([expect.objectContaining({ metodo: "mensagem-cliente", modelo: "modelo-de-teste" })]);
    expect(linha!.procedencia.codigo).toMatch(/^[0-9a-f]{7,}$/);
  });

  test("editar o rascunho não envia", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: `${RASCUNHO} Qualquer dúvida, fale com a Beatriz.` } });
    expect(r.status).toBe(200);
    expect((await json(r)).texto).toEndWith("fale com a Beatriz.");
    expect(zap.enviados).toHaveLength(0);
  });

  test("sem o número oficial do escritório não envia (o rodapé contra o golpe precisa dele)", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(422);
    expect((await json(r)).erro).toBe("sem_numero_oficial");
    expect(zap.enviados).toHaveLength(0);
    expect((await call("/escritorio", { method: "PUT", json: { whatsappOficial: "(47) 3433-1000" } })).status).toBe(200);
    expect((await json(call("/escritorio"))).whatsappOficial).toBe("(47) 3433-1000");
  });

  test("quem não tem OAB cadastrada não aprova", async () => {
    await t.owner`update equipe set oab_numero = null where user_id = ${escritorio.userId}`;
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    await t.owner`update equipe set oab_numero = '41.233' where user_id = ${escritorio.userId}`;
    expect(r.status).toBe(403);
    expect((await json(r)).erro).toBe("sem_oab");
    expect(zap.enviados).toHaveLength(0);
  });

  test("o advogado aprova: sai uma vez, com o nome do escritório e o rodapé, e fica registrado quem e quando", async () => {
    const r = await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(200);
    const m = await json(r);
    expect(m).toMatchObject({ situacao: "enviada", aprovadaPor: { id: escritorio.userId } });
    expect(m.aprovadaEm).toBeTruthy();
    expect(zap.enviados).toHaveLength(1);
    const [enviado] = zap.enviados;
    expect(enviado!.number).toBe("5547991234567");
    expect(enviado!.text).toStartWith("*Souza & Mendes Advocacia*\n\nOlá, Marina.");
    expect(enviado!.text).toContain("fale com a Beatriz.");
    expect(enviado!.text).toContain("Este escritório nunca pede Pix para liberar valores.");
    expect(enviado!.text).toContain("(47) 3433-1000");

    const [linha] = await t.owner<{ aprovada_por: string; aprovada_em: Date; texto_ia: string; enviado: string }[]>`select aprovada_por, aprovada_em, texto_ia, enviado from mensagens_cliente where id = ${mensagemId}`;
    expect(linha).toMatchObject({ aprovada_por: escritorio.userId, texto_ia: RASCUNHO, enviado: enviado!.text });
    const registro = await t.owner<{ acao: string }[]>`select acao from auditoria where organization_id = ${escritorio.orgId} and acao = 'mensagem_cliente.enviada'`;
    expect(registro).toHaveLength(1);

    // Já saiu: não sai de novo nem muda.
    expect((await call(`/mensagens-cliente/${mensagemId}/enviar`, { method: "POST", json: {} })).status).toBe(409);
    expect((await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: "Outro texto qualquer." } })).status).toBe(409);
    expect(zap.enviados).toHaveLength(1);
  });

  test("o WhatsApp fora do ar deixa a mensagem como falhou, para tentar de novo", async () => {
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    const m = await json(call(`/prazos/${escritorio.prazoId}/mensagem-cliente`, { method: "POST" }));
    zap.estado.falhar = true;
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} });
    zap.estado.falhar = false;
    expect(r.status).toBe(503);
    const lista = await json(call(`/mensagens-cliente?cliente=${escritorio.clienteId}`));
    expect(lista.itens.find((x: { id: string }) => x.id === m.id)).toMatchObject({ situacao: "falhou" });
    expect((await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} })).status).toBe(200);
  });

  /* ---------------- Envio sem confirmação ---------------- */

  const novaMensagem = async () => {
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    return json<{ id: string }>(call(`/prazos/${escritorio.prazoId}/mensagem-cliente`, { method: "POST" }));
  };
  const naLista = async (id: string) => (await json(call(`/mensagens-cliente?cliente=${escritorio.clienteId}`))).itens.find((x: { id: string }) => x.id === id);

  test("enquanto o WhatsApp não responde, a mensagem aparece como enviando, não como enviada", async () => {
    const m = await novaMensagem();
    let durante: unknown;
    zap.estado.aoEnviar = async () => {
      durante = await naLista(m.id);
    };
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} });
    zap.estado.aoEnviar = null;
    expect(durante).toMatchObject({ situacao: "enviando", envioIncerto: false, enviadaEm: null });
    expect(r.status).toBe(200);
    const depois = await json(r);
    expect(depois).toMatchObject({ situacao: "enviada", envioIncerto: false });
    expect(depois.enviadaEm).toBeTruthy();
  });

  /** O que a queda do servidor deixa para trás: aprovada há minutos, sem resposta do WhatsApp. */
  const interrompida = async () => {
    const m = await novaMensagem();
    await t.owner`update mensagens_cliente set situacao = 'enviando', aprovada_por = ${escritorio.userId}, aprovada_em = now() - interval '5 minutes', para = '(47) 99123-4567' where id = ${m.id}`;
    return m;
  };

  test("envio interrompido: avisa que ninguém sabe se saiu, e nada manda de novo nem muda o texto", async () => {
    const m = await interrompida();
    const antes = zap.enviados.length;
    expect(await naLista(m.id)).toMatchObject({ situacao: "enviando", envioIncerto: true, enviadaEm: null });
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(409);
    expect((await json(r)).erro).toBe("enviando");
    expect((await call(`/mensagens-cliente/${m.id}`, { method: "PUT", json: { texto: "Outro texto qualquer." } })).status).toBe(409);
    expect((await call(`/mensagens-cliente/${m.id}/descartar`, { method: "POST" })).status).toBe(409);
    expect(zap.enviados).toHaveLength(antes);
  });

  test("a pessoa confere e diz que saiu: vira enviada, sem mandar de novo, e fica registrado", async () => {
    const m = await interrompida();
    const antes = zap.enviados.length;
    const r = await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: true } });
    expect(r.status).toBe(200);
    const depois = await json(r);
    expect(depois).toMatchObject({ situacao: "enviada", envioIncerto: false });
    expect(depois.enviadaEm).toBe(depois.aprovadaEm);
    expect(zap.enviados).toHaveLength(antes);
    const registro = await t.owner<{ detalhes: { conferida?: boolean; mensagemId: string } }[]>`select detalhes from auditoria where organization_id = ${escritorio.orgId} and acao = 'mensagem_cliente.enviada' order by created_at desc limit 1`;
    expect(registro[0]!.detalhes).toMatchObject({ mensagemId: m.id, conferida: true });
    // Já conferida, não confere de novo.
    expect((await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: false } })).status).toBe(409);
  });

  test("a pessoa confere e diz que não saiu: volta para revisar, e só o novo clique manda", async () => {
    const m = await interrompida();
    const antes = zap.enviados.length;
    const r = await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: false } });
    expect(r.status).toBe(200);
    expect(await json(r)).toMatchObject({ situacao: "falhou", enviadaEm: null, envioIncerto: false });
    expect(zap.enviados).toHaveLength(antes);
    const registro = await t.owner`select 1 from auditoria where organization_id = ${escritorio.orgId} and acao = 'mensagem_cliente.nao_saiu'`;
    expect(registro).toHaveLength(1);
    expect((await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} })).status).toBe(200);
    expect(zap.enviados).toHaveLength(antes + 1);
  });

  test("não dá para conferir um envio que ainda está em andamento, nem sem OAB, nem de outro escritório", async () => {
    const recente = await novaMensagem();
    await t.owner`update mensagens_cliente set situacao = 'enviando', aprovada_em = now() where id = ${recente.id}`;
    const andamento = await call(`/mensagens-cliente/${recente.id}/conferir-envio`, { method: "POST", json: { saiu: false } });
    expect(andamento.status).toBe(409);
    expect((await json(andamento)).erro).toBe("sem_o_que_conferir");

    const m = await interrompida();
    expect((await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: true } }, demo.cookie)).status).toBe(404);
    await t.owner`update equipe set oab_numero = null where user_id = ${escritorio.userId}`;
    const semOab = await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: true } });
    await t.owner`update equipe set oab_numero = '41.233' where user_id = ${escritorio.userId}`;
    expect(semOab.status).toBe(403);
    expect(await naLista(m.id)).toMatchObject({ situacao: "enviando" });
  });

  test("o WhatsApp não responde a tempo: a mensagem pode ter saído, então pede para conferir na hora e não oferece reenviar", async () => {
    const m = await novaMensagem();
    const antes = zap.enviados.length;
    zap.estado.semResposta = true;
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} });
    zap.estado.semResposta = false;
    expect(r.status).toBe(504);
    expect((await json(r)).erro).toBe("whatsapp_sem_resposta");
    expect(await naLista(m.id)).toMatchObject({ situacao: "enviando", envioIncerto: true });
    expect((await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} })).status).toBe(409);
    expect(zap.enviados).toHaveLength(antes + 1);
  });

  test("o rascunho é do escritório: outro escritório não vê nem envia", async () => {
    expect((await call(`/mensagens-cliente/${mensagemId}`, { method: "PUT", json: { texto: "Texto de outro escritório." } }, demo.cookie)).status).toBe(404);
    expect((await json(call(`/mensagens-cliente?cliente=${escritorio.clienteId}`, {}, demo.cookie))).itens).toEqual([]);
  });

  test("a demonstração nunca manda WhatsApp", async () => {
    const antes = zap.enviados.length;
    ia.respostas["mensagem-cliente"] = { texto: RASCUNHO, recusa: null };
    await call("/escritorio", { method: "PUT", json: { whatsappOficial: "(47) 3433-1000" } }, demo.cookie);
    const m = await json(call(`/prazos/${demo.prazoId}/mensagem-cliente`, { method: "POST" }, demo.cookie));
    const r = await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} }, demo.cookie);
    expect(r.status).toBe(403);
    expect((await json(r)).erro).toBe("demonstracao");
    expect(zap.enviados).toHaveLength(antes);
  });

  /* ---------------- 3.3 Cobrar os documentos que faltam ---------------- */

  let cobrancaId = "";
  let link = "";
  const caminhoDoEnvio = () => `/api/envio${new URL(link).pathname.replace(/^\/enviar/, "")}`;

  test("sem conferência da pasta não há o que cobrar", async () => {
    const r = await call(`/clientes/${escritorio.clienteId}/cobrar-documentos`, { method: "POST" });
    expect(r.status).toBe(422);
    expect((await json(r)).erro).toBe("sem_conferencia");
  });

  test("a conferência sabe o que falta: o rascunho lista os documentos, sem link, e nada sai", async () => {
    const antes = zap.enviados.length;
    await withTenant(t.db, escritorio.orgId, (tx) =>
      tx.insert(analises).values({
        organizationId: escritorio.orgId,
        alvo: "cliente",
        alvoId: escritorio.clienteId,
        acao: "conferir-pasta",
        situacao: "pronto",
        conteudo: {
          itens: [
            { item: "procuracao", situacao: "falta", detalhe: "Não está na pasta.", documento: null },
            { item: "cpf", situacao: "certo", detalhe: "Bate com o cadastro.", documento: "rg.pdf" },
          ],
          outros: [],
          resumo: "Falta a procuração.",
          recusa: null,
        },
        base: "b",
      }),
    );
    const r = await call(`/clientes/${escritorio.clienteId}/cobrar-documentos`, { method: "POST" });
    expect(r.status).toBe(201);
    const m = await json(r);
    expect(m).toMatchObject({ tipo: "documentos", situacao: "rascunho", itens: ["Procuração assinada", "Termo de uso de inteligência artificial assinado"] });
    expect(m.texto).toStartWith("Olá, Marina.");
    expect(m.previa).toContain("[link de envio]");
    cobrancaId = m.id;
    expect(zap.enviados).toHaveLength(antes);
  });

  test("aprovada, sai com o link de envio; o banco guarda só o hash do segredo", async () => {
    const r = await call(`/mensagens-cliente/${cobrancaId}/enviar`, { method: "POST", json: {} });
    expect(r.status).toBe(200);
    const texto = zap.enviados.at(-1)!.text;
    expect(texto).toContain("• Procuração assinada");
    expect(texto).toContain("Este escritório nunca pede Pix para liberar valores.");
    link = texto.match(/https:\/\/decreta\.local\/enviar\/\S+/)![0];
    expect(link.startsWith(`https://decreta.local/enviar/${escritorio.orgId}/`)).toBe(true);
    const segredo = link.split("/").at(-1)!;
    const [linha] = await t.owner<{ enviado: string; link_hash: string; link_expira_em: Date }[]>`select enviado, link_hash, link_expira_em from mensagens_cliente where id = ${cobrancaId}`;
    expect(linha!.enviado).not.toContain(segredo);
    expect(linha!.enviado).toContain("[link de envio]");
    expect(linha!.link_hash).not.toBe(segredo);
    // Vale até o fim do 7º dia no fuso do escritório, como a mensagem diz ("O link vale até DD/MM").
    expect(hojeEm("America/Sao_Paulo", linha!.link_expira_em)).toBe(somarDias(hojeEm("America/Sao_Paulo"), 7));
    expect(horaLocal(linha!.link_expira_em)).toBe("23:59");
  });

  test("o link abre sem login e mostra só o escritório, o primeiro nome e a lista", async () => {
    const r = await app.request(caminhoDoEnvio());
    expect(r.status).toBe(200);
    const p = await json(r);
    expect(p).toMatchObject({ escritorio: "Souza & Mendes Advocacia", cliente: "Marina", itens: ["Procuração assinada", "Termo de uso de inteligência artificial assinado"], recebidos: 0 });
    expect(p.validoAte).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(JSON.stringify(p)).not.toContain("99123");
  });

  test("a foto enviada vai para a pasta do cliente e entra na leitura de documentos, com aviso de resposta automática", async () => {
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "procuracao.jpg", { type: "image/jpeg" }));
    const r = await app.request(caminhoDoEnvio(), { method: "POST", body: form });
    expect(r.status).toBe(201);
    const resposta = await json(r);
    expect(resposta.aviso).toContain("automática");
    const [doc] = await t.owner<{ id: string; cliente_id: string; leitura: string; enviado_por: string | null }[]>`select id, cliente_id, leitura, enviado_por from documentos where organization_id = ${escritorio.orgId} and nome = 'procuracao.jpg'`;
    expect(doc).toMatchObject({ cliente_id: escritorio.clienteId, leitura: "pendente", enviado_por: null });
    expect(pedidos).toContainEqual({ nome: "documento.ler", organizationId: escritorio.orgId, documentoId: doc!.id });
    expect((await json(app.request(caminhoDoEnvio()))).recebidos).toBe(1);
  });

  test("o link só aceita foto ou PDF", async () => {
    const form = new FormData();
    form.set("arquivo", new File(["oi"], "bilhete.txt", { type: "text/plain" }));
    expect((await app.request(caminhoDoEnvio(), { method: "POST", body: form })).status).toBe(422);
  });

  test("o tipo vem dos bytes, não do cabeçalho: executável disfarçado de PDF não entra, e o nome vira seguro", async () => {
    const exe = new FormData();
    exe.set("arquivo", new File([new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3])], "golpe.exe", { type: "application/pdf" }));
    const r = await app.request(caminhoDoEnvio(), { method: "POST", body: exe });
    expect(r.status).toBe(422);
    expect((await json(r)).erro).toBe("tipo_nao_aceito");
    // Uma foto declarada como PDF, com nome que tenta sair da pasta: entra como JPEG, com o nome limpo.
    const foto = new FormData();
    foto.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 7, 7])], "..\\fatura.pdf.exe", { type: "application/pdf" }));
    const r2 = await app.request(caminhoDoEnvio(), { method: "POST", body: foto });
    expect(r2.status).toBe(201);
    expect((await json(r2)).nome).toBe("..-fatura.pdf.exe.jpg");
    const [doc] = await t.owner<{ mime: string }[]>`select mime from documentos where organization_id = ${escritorio.orgId} and nome = '..-fatura.pdf.exe.jpg'`;
    expect(doc!.mime).toBe("image/jpeg");
  });

  test("arquivo acima do teto do link é recusado sem ser lido", async () => {
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array(6_100_000)], "grande.pdf", { type: "application/pdf" }));
    const r = await app.request(caminhoDoEnvio(), { method: "POST", body: form });
    expect(r.status).toBe(413);
    expect((await json(r)).erro).toBe("arquivo_grande");
  });

  test("a fila fora do ar não derruba o envio: o documento fica guardado com a leitura pendente", async () => {
    filaFora = true;
    try {
      const form = new FormData();
      form.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 9])], "rg-da-marina.jpg", { type: "image/jpeg" }));
      expect((await app.request(caminhoDoEnvio(), { method: "POST", body: form })).status).toBe(201);
    } finally {
      filaFora = false;
    }
    const [doc] = await t.owner<{ leitura: string }[]>`select leitura from documentos where organization_id = ${escritorio.orgId} and nome = 'rg-da-marina.jpg'`;
    expect(doc!.leitura).toBe("pendente");
  });

  test("muitos pedidos do mesmo endereço em um minuto: 429, sem afetar outro endereço", async () => {
    const de = (ip: string) => app.request(caminhoDoEnvio(), { headers: { "x-forwarded-for": ip } });
    const status: number[] = [];
    for (let i = 0; i < 61; i++) status.push((await de("203.0.113.7")).status);
    expect(status.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(status[60]).toBe(429);
    expect((await de("203.0.113.8")).status).toBe(200);
  });

  test("o teto de arquivos do link vale mesmo com envios ao mesmo tempo", async () => {
    await t.owner`update mensagens_cliente set recebidos = 18 where id = ${cobrancaId}`;
    const envios = Array.from({ length: 5 }, (_, i) => {
      const form = new FormData();
      form.set("arquivo", new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, i])], `doc-${i}.jpg`, { type: "image/jpeg" }));
      return app.request(caminhoDoEnvio(), { method: "POST", body: form });
    });
    const status = (await Promise.all(envios)).map((r) => r.status).toSorted();
    expect(status).toEqual([201, 201, 429, 429, 429]);
    const [m] = await t.owner<{ recebidos: number }[]>`select recebidos from mensagens_cliente where id = ${cobrancaId}`;
    expect(m!.recebidos).toBe(20);
  });

  test("o advogado invalida o link mandado ao número errado: a página passa a dizer que venceu", async () => {
    const r = await call(`/mensagens-cliente/${cobrancaId}/invalidar-link`, { method: "POST" });
    expect(r.status).toBe(200);
    expect((await app.request(caminhoDoEnvio())).status).toBe(410);
    const registro = await t.owner`select acao from auditoria where organization_id = ${escritorio.orgId} and acao = 'mensagem_cliente.link_invalidado'`;
    expect(registro).toHaveLength(1);
  });

  test("segredo errado ou de outro escritório não abre; vencido também não", async () => {
    const segredo = link.split("/").at(-1)!;
    expect((await app.request(`/api/envio/${escritorio.orgId}/segredo-errado-${segredo.slice(0, 4)}`)).status).toBe(404);
    expect((await app.request(`/api/envio/${demo.orgId}/${segredo}`)).status).toBe(404);
    await t.owner`update mensagens_cliente set link_expira_em = now() - interval '1 minute' where id = ${cobrancaId}`;
    expect((await app.request(caminhoDoEnvio())).status).toBe(410);
    const form = new FormData();
    form.set("arquivo", new File([new Uint8Array([1])], "rg.jpg", { type: "image/jpeg" }));
    expect((await app.request(caminhoDoEnvio(), { method: "POST", body: form })).status).toBe(410);
  });

  test("link de um envio sem confirmação: abre, porque o cliente pode ter recebido, e fecha quando a pessoa diz que não saiu", async () => {
    const m = await json<{ id: string }>(call(`/clientes/${escritorio.clienteId}/cobrar-documentos`, { method: "POST" }));
    zap.estado.semResposta = true;
    expect((await call(`/mensagens-cliente/${m.id}/enviar`, { method: "POST", json: {} })).status).toBe(504);
    zap.estado.semResposta = false;
    const novo = zap.enviados.at(-1)!.text.match(/https:\/\/decreta\.local\/enviar\/\S+/)![0];
    const caminho = `/api/envio${new URL(novo).pathname.replace(/^\/enviar/, "")}`;
    expect((await app.request(caminho, { headers: { "x-forwarded-for": "203.0.113.9" } })).status).toBe(200);
    expect((await call(`/mensagens-cliente/${m.id}/conferir-envio`, { method: "POST", json: { saiu: false } })).status).toBe(200);
    expect((await app.request(caminho, { headers: { "x-forwarded-for": "203.0.113.9" } })).status).toBe(404);
  });
});
