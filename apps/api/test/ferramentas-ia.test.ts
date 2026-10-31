/**
 * As consultas da IA do Perguntar contra a demonstração: busca sem acento e
 * sem as palavras de ligação, número de processo que acha o arquivado,
 * filtros de prazos e processos, agenda com as tarefas atrasadas, o teor
 * inteiro da publicação, o calendário da contagem, os autos com a lista do
 * que não coube, o dia dos andamentos no fuso do escritório e os pedidos
 * errados que voltam curtos. E as buscas das telas, também sem acento.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, seedUser, type TestDatabase } from "@decreta/db/testing";
import { documentos, movimentacoes, publicacoes, tarefas, withTenant } from "@decreta/db";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { FALHOU, ferramentasDoEscritorio, PedidoErrado } from "@decreta/ia";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { dadosDoEscritorio, PedidoInvalido } from "../src/servicos/assistente.ts";
import { carregarContexto } from "../src/servicos/contexto.ts";
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

describe.skipIf(!hasTestDatabase)("Perguntar: as consultas da IA", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let orgId = "";
  let beatrizId = "";
  let beatriz = "";
  let marina = "";
  let marinaCliente = "";
  let dados: ReturnType<typeof dadosDoEscritorio>;
  const ia = iaFalsa();
  const logs: { msg: string; extra: unknown }[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { ...init, headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: beatriz }, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const perguntar = async (corpo: Record<string, unknown>): Promise<Evento[]> => {
    const r = await call("/ia/perguntar", { method: "POST", json: corpo });
    expect(r.status).toBe(200);
    return (await r.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Evento);
  };
  const erroDe = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (e) {
      return e as Error;
    }
    throw new Error("era para dar erro");
  };
  const tx = <T>(fn: Parameters<typeof withTenant<T>>[2]) => withTenant(t.db, orgId, fn);

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    ({ organizationId: orgId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos }));
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: (msg, extra) => logs.push({ msg, extra }) });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "teste@decreta.site", password: "demonstracao-123" }) });
    beatriz = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: beatriz, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    [{ id: beatrizId }] = (await t.owner`select id from "user" where email = 'teste@decreta.site'`) as unknown as [{ id: string }];
    [{ id: marina, cliente: marinaCliente }] = (await t.owner`select id, cliente_id as cliente from processos where organization_id = ${orgId} and titulo like 'Marina Duarte%'`) as unknown as [{ id: string; cliente: string }];
    dados = dadosDoEscritorio({ db: t.db, organizationId: orgId, userId: beatrizId, timezone: "America/Sao_Paulo" });
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("busca sem acento: processos, clientes, prazos, publicações e documentos", async () => {
    const titulos = async (busca: string) => (await dados.processos({ busca })).itens.map((p) => p.titulo);
    expect(await titulos("Joao Pedro")).toEqual(await titulos("João Pedro"));
    expect((await titulos("joao pedro")).length).toBe(1);
    expect((await titulos("Kuhn"))[0]).toStartWith("Roberto Kühn");
    expect(await titulos("Lucia Matos")).toEqual(await titulos("Lúcia Matos"));
    expect((await titulos("Lucia Matos")).length).toBe(2);

    const clientes = async (busca: string) => (await dados.clientes({ busca })).itens.map((c) => c.nome);
    expect(await clientes("Kuhn")).toEqual(["Roberto Kühn"]);
    expect(await clientes("antonio")).toEqual(["Antônio Reis"]);
    expect(await clientes("Lucia")).toEqual(await clientes("Lúcia"));

    const contestacao = await dados.prazos({ busca: "contestacao", situacao: "cumprido", limite: 50 });
    expect(contestacao.total).toBe((await dados.prazos({ busca: "Contestação", situacao: "cumprido", limite: 50 })).total);
    const abertos = await dados.prazos({ busca: "manifestacao" });
    expect(abertos.total).toBeGreaterThan(0);
    expect(abertos.total).toBe((await dados.prazos({ busca: "manifestação" })).total);

    const docs = await dados.documentos({ busca: "peticao" });
    expect(docs.total).toBeGreaterThan(0);
    expect(docs.total).toBe((await dados.documentos({ busca: "petição" })).total);
    const laudo = await dados.documentos({ busca: "pericia" });
    expect(laudo.itens.some((d) => d.trecho?.toLowerCase().includes("perícia"))).toBe(true);

    const sentencas = await dados.publicacoes({ busca: "sentenca", situacao: "todas" });
    expect(sentencas.total).toBeGreaterThan(0);
    expect(sentencas.total).toBe((await dados.publicacoes({ busca: "sentença", situacao: "todas" })).total);
  });

  test("palavras de ligação não zeram a busca, e telefone com DDD entre parênteses acha o cliente", async () => {
    const n = async (busca: string) => (await dados.processos({ busca })).total;
    expect(await n("Marina contra Seguradora")).toBe(1);
    expect(await n("Marina vs. Seguradora")).toBe(1);
    expect(await n("processo da Marina")).toBe(1);
    expect(await n("ação da Marina")).toBe(1);

    for (const busca of ["(47) 99123-4567", "47 99123-4567", "+55 47 99123-4567", "318.204.567-90"]) {
      const r = await dados.clientes({ busca });
      expect(r.itens.map((c) => c.nome)).toEqual(["Marina Duarte"]);
    }
    // Como nas telas: CPF e telefone formatados.
    const [m] = (await dados.clientes({ busca: "Marina Duarte" })).itens;
    expect(m).toMatchObject({ documento: "318.204.567-90", telefone: "(47) 99123-4567" });
  });

  test("número de processo acha o arquivado; sem nada nos ativos, vem quantos arquivados batem", async () => {
    const [arq] = (await t.owner`
      select p.titulo, p.cnj from processos p
      where p.organization_id = ${orgId} and p.situacao in ('arquivado', 'encerrado') and p.cnj is not null
      order by p.titulo limit 1`) as unknown as [{ titulo: string; cnj: string }];
    const pelaNumeracao = await dados.processos({ busca: arq.cnj });
    expect(pelaNumeracao.itens.map((p) => p.titulo)).toEqual([arq.titulo]);
    expect(pelaNumeracao.itens[0]!.situacao).toMatch(/arquivado|encerrado/);
    // Sem pontuação também.
    expect((await dados.processos({ busca: arq.cnj.replace(/\D/g, "") })).total).toBe(1);

    // Pelo nome: nos ativos não há, e a IA fica sabendo que há entre os arquivados.
    const [so] = (await t.owner`
      select c.nome from processos p join clientes c on c.id = p.cliente_id
      where p.organization_id = ${orgId}
      group by c.nome having bool_and(p.situacao in ('arquivado', 'encerrado')) limit 1`) as unknown as [{ nome: string }];
    const r = await dados.processos({ busca: so.nome });
    expect(r).toMatchObject({ total: 0, itens: [] });
    expect(r.arquivadosQueBatem).toBeGreaterThan(0);
    expect((await dados.processos({ busca: so.nome, situacao: "todos" })).total).toBe(r.arquivadosQueBatem!);
    // Pedindo os ativos de propósito, não vem a contagem.
    expect((await dados.processos({ busca: so.nome, situacao: "ativos" })).arquivadosQueBatem).toBeUndefined();
  });

  test("prazos: a confirmar, pelo nome do cliente, do cliente e os cumpridos pelo dia em que foram cumpridos", async () => {
    const panorama = await dados.panorama();
    const aConfirmar = await dados.prazos({ aConfirmar: true, limite: 50 });
    expect(aConfirmar.total).toBe(panorama.prazos.aConfirmar);
    expect(aConfirmar.itens.length).toBe(panorama.prazos.aConfirmar);
    expect(new Set(aConfirmar.itens.map((p) => p.situacao))).toEqual(new Set(["a_confirmar"]));

    const pelaCliente = await dados.prazos({ busca: "Marina" });
    expect(pelaCliente.itens.map((p) => p.tipo)).toContain("Manifestação sobre laudo pericial");
    const doCliente = await dados.prazos({ clienteId: marinaCliente });
    expect(doCliente.itens.map((p) => p.tipo)).toContain("Manifestação sobre laudo pericial");
    expect(doCliente.itens.every((p) => p.processo.id === marina)).toBe(true);

    // Cumprido hoje um prazo que só vence daqui a uns dias: entra nos "cumpridos desta semana".
    const [alvo] = (await t.owner`select id, fim from prazos where organization_id = ${orgId} and situacao = 'aberto' and fim > '2026-11-05' order by fim limit 1`) as unknown as [{ id: string }];
    await t.owner`update prazos set situacao = 'cumprido', cumprido_em = '2026-10-29T15:00:00-03:00' where id = ${alvo.id}`;
    const semana = await dados.prazos({ situacao: "cumprido", de: "2026-10-26", ate: "2026-11-01" });
    const cumprido = semana.itens.find((p) => p.id === alvo.id);
    expect(cumprido).toMatchObject({ situacao: "cumprido", cumpridoEm: "2026-10-29" });
    expect((await dados.prazos({ situacao: "cumprido", de: "2026-10-30" })).itens.some((p) => p.id === alvo.id)).toBe(false);
    expect(abertoSemCumprimento((await dados.prazos({})).itens)).toBe(true);
  });

  test("processos: a última movimentação de cada um e os parados há mais tempo", async () => {
    const recentes = await dados.processos({ limite: 5 });
    for (const p of recentes.itens) {
      expect(p.ultimaMovimentacao?.dia).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.ultimaMovimentacao?.titulo).toBeString();
    }
    const dias = (r: { itens: { ultimaMovimentacao: { dia: string } | null }[] }) => r.itens.map((p) => p.ultimaMovimentacao?.dia ?? "");
    expect(dias(recentes)).toEqual([...dias(recentes)].sort().reverse());

    const parados = await dados.processos({ ordem: "parados", situacao: "todos", limite: 10 });
    expect(dias(parados)).toEqual([...dias(parados)].sort());
    expect(dias(parados)[0]! <= dias(recentes).at(-1)!).toBe(true);

    const limite = "2026-09-29";
    const ha30 = await dados.processos({ paradoHaDias: 30, situacao: "todos", limite: 50 });
    const [{ n }] = (await t.owner`select count(*)::int as n from processos where organization_id = ${orgId} and coalesce(ultima_movimentacao_em, created_at) < ${`${limite}T00:00:00-03:00`}::timestamptz`) as unknown as [{ n: number }];
    expect(ha30.total).toBe(n);
    for (const d of dias(ha30)) expect(d < limite).toBe(true);
  });

  test("publicações: número sem pontos, não tratadas da mais antiga para a mais nova e o teor inteiro no lerPublicacao", async () => {
    const formatado = await dados.publicacoes({ busca: "5004321-25.2026.8.24.0038", situacao: "todas" });
    expect(formatado.total).toBeGreaterThan(0);
    expect((await dados.publicacoes({ busca: "50043212520268240038", situacao: "todas" })).total).toBe(formatado.total);

    const naoTratadas = await dados.publicacoes({ limite: 50 });
    const disp = naoTratadas.itens.map((p) => p.disponibilizadaEm);
    expect(disp).toEqual([...disp].sort());
    expect(new Set(naoTratadas.itens.map((p) => p.situacao))).toEqual(new Set(["nova", "pendente"]));

    // Uma sentença longa, sem processo cadastrado: a decisão está no fim.
    const teor = `SENTENÇA. Vistos. ${"Relatório e fundamentação. ".repeat(200)}DISPOSITIVO: julgo procedentes os pedidos.`;
    const [pub] = await tx((x) =>
      x.insert(publicacoes).values({ organizationId: orgId, idExterno: "teste-longa", disponibilizadaEm: "2026-10-28", publicadaEm: "2026-10-29", tipoDocumento: "Sentença", cnj: "5099999-11.2026.8.24.0038", texto: teor }).returning({ id: publicacoes.id }),
    );
    const naLista = (await dados.publicacoes({ busca: "5099999" })).itens[0]!;
    expect(naLista.teor.length).toBeLessThan(700);
    const inteira = await dados.publicacao(pub!.id);
    expect(inteira).toMatchObject({ id: pub!.id, processo: null, tipo: expect.any(String) });
    expect(inteira!.teor).toEndWith("DISPOSITIVO: julgo procedentes os pedidos.");

    // Pelo Perguntar: a IA lê inteiro; na tela e no banco fica o começo, como nas listas.
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "lerPublicacao", entrada: { publicacaoId: pub!.id } }, { nome: "lerPublicacao", entrada: { publicacaoId: "00000000-0000-4000-8000-000000000000" } }] }, "Julgou procedente."];
    const eventos = await perguntar({ texto: "O que a sentença decidiu?" });
    const lida = eventos.find((e) => e.t === "resultado" && e.id === "chamada-1-0");
    const nenhuma = eventos.find((e) => e.t === "resultado" && e.id === "chamada-1-1");
    expect(lida!.saida.teor.length).toBeLessThanOrEqual(601);
    expect(JSON.stringify(ia.pedidos.perguntar)).toContain("DISPOSITIVO: julgo procedentes os pedidos.");
    expect(nenhuma).toMatchObject({ erro: "Não achei publicação com este id. Busque de novo pelo nome." });
    expect("saida" in nenhuma!).toBe(false);
  });

  test("agenda: a situação da audiência, as tarefas atrasadas no primeiro dia e o corte em 31 dias", async () => {
    await tx((x) =>
      x.insert(tarefas).values([
        { organizationId: orgId, titulo: "Devolver documentos da Marina", dia: "2026-10-27", responsavelId: beatrizId },
        { organizationId: orgId, titulo: "Atrasada e já feita", dia: "2026-10-26", responsavelId: beatrizId, concluidaEm: new Date() },
        { organizationId: orgId, titulo: "Reunião de fim de ano", dia: "2026-12-20", responsavelId: beatrizId },
      ]),
    );
    const [aud] = (await t.owner`select id from audiencias where organization_id = ${orgId} and em >= '2026-10-29T00:00:00-03:00' and em < '2026-10-30T00:00:00-03:00' order by em limit 1`) as unknown as [{ id: string }];
    await t.owner`update audiencias set situacao = 'realizada' where id = ${aud.id}`;

    const hoje = await dados.agenda({ de: "2026-10-29", ate: "2026-10-29" });
    expect(hoje.cortadoEm).toBeUndefined();
    const itens = hoje.dias[0]!.itens;
    expect(itens.find((i) => i.id === aud.id)).toMatchObject({ tipo: "audiencia", situacao: "realizada" });
    expect(itens.filter((i) => i.tipo === "audiencia").every((i) => i.tipo === "audiencia" && typeof i.situacao === "string")).toBe(true);
    const atrasada = itens.find((i) => i.titulo === "Devolver documentos da Marina");
    expect(atrasada).toMatchObject({ tipo: "tarefa", concluida: false, atrasada: true });
    expect(itens.some((i) => i.titulo === "Atrasada e já feita")).toBe(false);
    // Só as minhas, e só quando o primeiro dia é hoje.
    expect((await dados.agenda({ de: "2026-10-29", ate: "2026-10-30", responsavel: "rafael" })).dias.flatMap((d) => d.itens).some((i) => i.titulo === "Devolver documentos da Marina")).toBe(false);
    expect((await dados.agenda({ de: "2026-10-30", ate: "2026-10-31" })).dias.flatMap((d) => d.itens).some((i) => i.titulo === "Devolver documentos da Marina")).toBe(false);

    const longa = await dados.agenda({ de: "2026-11-01", ate: "2026-12-31" });
    expect(longa.cortadoEm).toBe("2026-12-02");
    expect(longa.dias.at(-1)!.dia <= "2026-12-02").toBe(true);
    expect(longa.dias.flatMap((d) => d.itens).some((i) => i.titulo === "Reunião de fim de ano")).toBe(false);
    expect((await dados.agenda({ de: "2026-12-03", ate: "2026-12-31" })).dias.flatMap((d) => d.itens).some((i) => i.titulo === "Reunião de fim de ano")).toBe(true);

    const p = await dados.panorama();
    expect(p.tarefas.atrasadas).toBeGreaterThanOrEqual(1);
    expect(p.tarefas.minhasAtrasadas).toBe(1);
    const [{ n }] = (await t.owner`select count(*)::int as n from tarefas where organization_id = ${orgId} and concluida_em is null and dia = '2026-10-29'`) as unknown as [{ n: number }];
    expect(p.tarefas.hoje).toBe(n);
  });

  test("audiências só com o último dia, e ele já passou: os 30 dias antes dele", async () => {
    const ate28 = await dados.audiencias({ ate: "2026-10-28" });
    expect(ate28.total).toBeGreaterThan(0);
    expect(ate28.itens.every((a) => a.dia <= "2026-10-28" && a.dia >= "2026-09-28")).toBe(true);
    expect(await erroDe(dados.audiencias({ de: "2026-11-05", ate: "2026-11-01" }))).toBeInstanceOf(PedidoInvalido);
  });

  test("audiências e alvarás de um cliente: só os dos processos dele, e o total confere", async () => {
    const [comAudiencia] = (await t.owner`select p.cliente_id as id, count(*)::int as n from audiencias a join processos p on p.id = a.processo_id where a.organization_id = ${orgId} and p.cliente_id is not null and a.situacao <> 'cancelada' and a.em >= '2026-09-01' and a.em < '2026-12-31' group by p.cliente_id order by count(*) desc limit 1`) as unknown as [{ id: string; n: number }];
    const auds = await dados.audiencias({ clienteId: comAudiencia.id, de: "2026-09-01", ate: "2026-12-30", limite: 50 });
    expect(auds.total).toBe(comAudiencia.n);
    expect(auds.itens.length).toBe(comAudiencia.n);
    const dosProcessos = new Set(((await t.owner`select id from processos where cliente_id = ${comAudiencia.id}`) as unknown as { id: string }[]).map((p) => p.id));
    expect(auds.itens.every((a) => dosProcessos.has(a.processo.id))).toBe(true);
    expect((await dados.audiencias({ de: "2026-09-01", ate: "2026-12-30", limite: 50 })).total).toBeGreaterThan(auds.total);

    const [comAlvara] = (await t.owner`select p.cliente_id as id, count(*)::int as n, sum(a.valor)::text as valor from alvaras a join processos p on p.id = a.processo_id where a.organization_id = ${orgId} and p.cliente_id is not null group by p.cliente_id order by count(*) desc limit 1`) as unknown as [{ id: string; n: number; valor: string }];
    const alvs = await dados.alvaras({ clienteId: comAlvara.id, etapa: "todos", limite: 50 });
    expect(alvs.total).toBe(comAlvara.n);
    expect(Number(alvs.valorTotal)).toBeCloseTo(Number(comAlvara.valor), 2);
    expect((await dados.alvaras({ etapa: "todos", limite: 50 })).total).toBeGreaterThan(alvs.total);
  });

  test("contar prazo diz o calendário que usou", async () => {
    const sem = await dados.contarPrazo({ dias: 15, contagem: "uteis", publicadoEm: "2026-10-29" });
    expect(sem.calendario).toBe("TJSC, sem feriados municipais");
    const com = await dados.contarPrazo({ dias: 15, contagem: "uteis", publicadoEm: "2026-10-29", processoId: marina });
    expect(com.calendario).toBe("TJSC, com os feriados de Joinville");
  });

  test("o dia dos andamentos é o do escritório, também nas outras telas que leem os autos", async () => {
    // Juntada às 22h15 de Brasília: em UTC já é o dia 29.
    await tx((x) => x.insert(movimentacoes).values({ organizationId: orgId, processoId: marina, em: new Date("2026-10-28T22:15:00-03:00"), evento: 990, titulo: "Juntada de petição", chave: "teste-noite" }));
    const ctx = await tx((x) => carregarContexto(x, marina, { documentos: true }));
    expect(ctx!.texto).toContain("- 28/10/2026 (evento 990, Juntada de petição)");
    expect((await dados.processo(marina))!.autos).toContain("- 28/10/2026 (evento 990, Juntada de petição)");
    expect((await dados.processos({ busca: "Marina Duarte" })).itens[0]!.ultimaMovimentacao).toEqual({ dia: "2026-10-28", titulo: "Juntada de petição" });

    // O rodapé do resumo dos autos, pedido às 22h30 de Brasília (já dia 30 em UTC), fica com o dia de hoje.
    setSystemTime(new Date("2026-10-29T22:30:00-03:00"));
    try {
      ia.respostas["resumo-autos"] = { resumo: "Resumo.", fase: "Perícia", pontos: [], recusa: null };
      const r = await json(call(`/ia/resumo/${marina}`, { method: "POST" }));
      expect(r.fonte).toEndWith("· 29/10/2026");
    } finally {
      setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    }
  });

  test("lerProcesso no Perguntar: autos com teto menor e, no fim, o que não coube, com o id para ler à parte", async () => {
    const grande = (n: number) => `Documento grande ${n}. ${"Texto do documento. ".repeat(1_700)}`;
    const [procuracao] = await tx((x) =>
      x.insert(documentos).values({ organizationId: orgId, processoId: marina, nome: "Procuração antiga", mime: "application/pdf", tamanho: 10, chave: "teste/procuracao", texto: "Outorgo poderes.", createdAt: new Date("2020-01-01T12:00:00Z") }).returning({ id: documentos.id }),
    );
    await tx((x) => x.insert(documentos).values([1, 2, 3].map((n) => ({ organizationId: orgId, processoId: marina, nome: `Volume ${n}`, mime: "application/pdf", tamanho: 10, chave: `teste/volume-${n}`, texto: grande(n) }))));

    const autos = (await dados.processo(marina))!.autos!;
    expect(autos.length).toBeLessThanOrEqual(40_000);
    expect(autos).toContain("## Fora deste texto (não couberam)");
    expect(autos).toContain(`- Documento: Procuração antiga, id ${procuracao!.id}`);
    expect(autos).toContain("use lerDocumento ou lerPublicacao com o id");

    // As outras telas (resumo, briefing, Gerar peça) continuam com o teto de antes, também com a lista, mas sem os ids.
    const outras = (await tx((x) => carregarContexto(x, marina, { documentos: true })))!.texto;
    expect(outras.length).toBeGreaterThan(40_000);
    expect(outras.length).toBeLessThanOrEqual(120_000);
    expect(outras).toContain("Volume 3");
    if (outras.includes("## Fora deste texto")) expect(outras).not.toContain(`id ${procuracao!.id}`);
  });

  test("pedido errado volta curto para a IA e para a tela; falha por dentro não leva o SQL", async () => {
    const f = ferramentasDoEscritorio(dados);
    const opcoes = { toolCallId: "x", messages: [], context: {} } as never;
    /** A ferramenta como a IA chama, com o pedido do jeito que veio (às vezes errado). */
    const pedir = (nome: keyof typeof f, entrada: unknown) => Promise.resolve(f[nome].execute!(entrada as never, opcoes));
    const motivo = async (p: Promise<unknown>) => {
      const e = await erroDe(p);
      expect(e).toBeInstanceOf(PedidoErrado);
      return e.message;
    };
    expect(await motivo(pedir("buscarPrazos", { limite: 100 }))).toBe("limite: no máximo 50.");
    expect(await motivo(pedir("buscarPrazos", { de: "31/10/2026" }))).toBe("de: use o formato AAAA-MM-DD.");
    expect(await motivo(pedir("contarPrazo", { dias: 15, contagem: "uteis", publicadoEm: "2026-02-30" }))).toBe("publicadoEm: 2026-02-30 é um dia que não existe.");
    expect(await motivo(pedir("buscarPrazos", { de: "2027-02-29" }))).toBe("de: 2027-02-29 é um dia que não existe.");
    expect(await motivo(pedir("lerProcesso", { processoId: "5004321-25.2026.8.24.0038" }))).toBe("processoId: não é um id: use o id que veio de outra ferramenta.");
    expect(await motivo(pedir("buscarClientes", { busca: "a" }))).toBe("busca: pelo menos 2 caracteres.");
    expect(await motivo(pedir("verAgenda", { de: "2026-10-29" }))).toBe("ate: falta.");
    expect(await motivo(pedir("buscarPrazos", { situacao: "a_confirmar" }))).toBe('situacao: use "aberto", "cumprido", "descartado".');
    expect(await motivo(pedir("proporTarefa", { titulo: "Ligar", dia: "2026-10-27" }))).toBe("27/10/2026 já passou (hoje é 29/10/2026). Proponha um dia de hoje em diante.");

    // Pelo Perguntar: o passo guarda o motivo (não "Não deu para consultar agora."), e a IA recebe o mesmo.
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarPrazos", entrada: { limite: 100 } }, { nome: "contarPrazo", entrada: { dias: 15, contagem: "uteis", publicadoEm: "2026-11-31" } }] }, "Ajustei."];
    const eventos = await perguntar({ texto: "Liste 100 prazos e conte 15 dias de 31/11" });
    expect(eventos.filter((e) => e.t === "resultado").map((e) => e.erro)).toEqual(["limite: no máximo 50.", "publicadoEm: 2026-11-31 é um dia que não existe."]);
    expect(JSON.stringify(ia.pedidos.perguntar)).toContain("limite: no máximo 50.");

    // Falha por dentro: a IA e a tela recebem só a frase; o log fica sem a consulta e sem o que foi buscado.
    const quebrado = ferramentasDoEscritorio({ ...dados, prazos: async () => Promise.reject(Object.assign(new Error("Failed query: select ... params: Marina Duarte,31820456790"), { cause: Object.assign(new Error('invalid input syntax for type uuid: "Marina"'), { name: "PostgresError", code: "22P02" }) })) });
    const e = await erroDe(Promise.resolve(quebrado.buscarPrazos.execute!({ busca: "Marina" }, opcoes)));
    expect(e.message).toBe(FALHOU);

    // De ponta a ponta, com o banco recusando a consulta.
    await t.owner`revoke select on alvaras from app_user`;
    try {
      logs.length = 0;
      ia.respostas.perguntar = [{ ferramentas: [{ nome: "buscarAlvaras", entrada: {} }] }, "Não consegui ver os alvarás."];
      const r = (await perguntar({ texto: "Quais alvarás estão pendentes?" })).find((x) => x.t === "resultado")!;
      expect(r.erro).toBe(FALHOU);
      const paraIa = JSON.stringify(ia.pedidos.perguntar);
      expect(paraIa).toContain(`"type":"error-text","value":"Error: ${FALHOU}"`);
      expect(paraIa).not.toContain("Failed query");
      const log = logs.find((l) => l.msg === "ferramenta da IA falhou");
      expect(log?.extra).toEqual({ ferramenta: "buscarAlvaras", tipo: "PostgresError", codigo: "42501", erro: "permission denied for table alvaras" });
    } finally {
      await t.owner`grant select on alvaras to app_user`;
    }
  });

  test("a tarefa do cartão com um dia que não existe é recusada, sem erro do servidor", async () => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome: "proporTarefa", entrada: { titulo: "Ligar para a Marina", dia: "2026-11-03" } }] }, "Pronto."];
    const eventos = await perguntar({ texto: "Me lembra de ligar para a Marina na terça" });
    const conversa = eventos[0]!.conversa.id as string;
    const k = await json(call(`/ia/conversas/${conversa}`));
    const m = k.mensagens.at(-1);
    const r = await call(`/ia/conversas/${conversa}/tarefa`, { method: "POST", json: { mensagemId: m.id, ferramentaId: m.partes[0].id, dia: "2026-11-31" } });
    expect(r.status).toBe(400);
    expect((await json(r)).detalhe).toContain("Este dia não existe.");
  });

  test("as buscas das telas também não diferenciam acento", async () => {
    const processos = await json(call("/processos?busca=joao%20pedro"));
    expect(processos.itens.map((p: { titulo: string }) => p.titulo)).toEqual([expect.stringMatching(/^João Pedro Antunes/)]);
    const clientes = await json(call("/clientes?busca=kuhn"));
    expect(clientes.itens.map((c: { nome: string }) => c.nome)).toEqual(["Roberto Kühn"]);
    const busca = await json(call("/busca?q=lucia%20matos"));
    expect(busca.clientes.map((c: { nome: string }) => c.nome)).toEqual(["Lúcia Matos"]);
    expect(busca.processos.length).toBe(2);

    ia.respostas.perguntar = "Há dois alvarás pendentes.";
    const eventos = await perguntar({ texto: "Quais alvarás estão pendentes?" });
    const achadas = await json(call("/ia/conversas?busca=alvaras"));
    expect(achadas.conversas.map((c: { id: string }) => c.id)).toContain(eventos[0]!.conversa.id);
  });

  test("quem: tira Dr./Dra., aceita o cargo e o apelido, e com duas pessoas de mesmo nome pede para escolher", async () => {
    const donos = async (responsavel: string) => new Set((await dados.prazos({ responsavel, limite: 50 })).itens.map((p) => p.responsavel?.apelido));
    expect(await donos("Dra. Beatriz")).toEqual(new Set(["Beatriz"]));
    expect(await donos("a estagiária")).toEqual(new Set(["Camila"]));
    expect((await dados.prazos({ responsavel: "todos" })).total).toBe((await dados.prazos({})).total);
    expect((await erroDe(dados.prazos({ responsavel: "  " }))).message).toContain('Diga quem: "eu", "sem", "todos"');

    // O apelido cadastrado vale.
    await t.owner`update equipe set apelido = 'Bia' where organization_id = ${orgId} and user_id = ${beatrizId}`;
    const outra = await dadosDoEscritorio({ db: t.db, organizationId: orgId, userId: beatrizId, timezone: "America/Sao_Paulo" }).prazos({ responsavel: "Bia" });
    expect(new Set(outra.itens.map((p) => p.responsavel?.id))).toEqual(new Set([beatrizId]));
    await t.owner`update equipe set apelido = null where organization_id = ${orgId} and user_id = ${beatrizId}`;

    // Duas Beatriz: a IA recebe as opções em vez de ficar com a primeira.
    await seedUser(t.owner, orgId, "beatriz-lima", "Beatriz Lima", "member");
    const comDuas = dadosDoEscritorio({ db: t.db, organizationId: orgId, userId: beatrizId, timezone: "America/Sao_Paulo" });
    const e = await erroDe(comDuas.prazos({ responsavel: "Beatriz" }));
    expect(e).toBeInstanceOf(PedidoInvalido);
    expect(e.message).toBe('Mais de uma pessoa da equipe serve para "Beatriz": Beatriz Souza, Beatriz Lima. Pergunte qual.');
    expect((await erroDe(comDuas.proporTarefa({ titulo: "Ligar", dia: "2026-11-03", responsavel: "Beatriz" }))).message).toContain("Beatriz Lima");
    expect((await comDuas.prazos({ responsavel: "Beatriz Souza" })).itens.every((p) => p.responsavel?.id === beatrizId)).toBe(true);
  });
});

/** Os abertos não têm o dia de cumprido. */
function abertoSemCumprimento(itens: { cumpridoEm: string | null }[]) {
  return itens.every((p) => p.cumpridoEm === null);
}
