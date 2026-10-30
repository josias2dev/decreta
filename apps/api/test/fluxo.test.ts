/**
 * O fluxo principal pela API, com banco de verdade (RLS) e IA de mentira:
 * publicação chega → IA sugere → prazo a confirmar → pessoa confirma →
 * briefing → peça → DOCX. E o isolamento entre escritórios nas rotas.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria, extrairTexto, MIME_DOCX } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { gravarComunicacoes } from "../src/servicos/captura.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { withTenant } from "@decreta/db";
import { iaFalsa } from "./ia-falsa.ts";

const TEOR = "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos para sentença.";

describe.skipIf(!hasTestDatabase)("fluxo principal pela API", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let cookieOutro = "";
  const ia = iaFalsa();
  const pedidos: Pedido[] = [];
  const env = readEnv({
    DATABASE_URL: "postgres://unused@localhost/unused",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    BETTER_AUTH_URL: "http://localhost:8787",
  });
  let processoId = "";
  let publicacaoId = "";
  let prazoId = "";
  let userId = "";
  let orgId = "";
  let auth: ReturnType<typeof createAuth>;

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, comCookie = cookie) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, ...(comCookie ? { cookie: comCookie } : {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  async function entrarCom(email: string, senha = "senha-bem-longa-123"): Promise<string> {
    const r = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
      body: JSON.stringify({ email, password: senha }),
    });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  async function ativar(c: string, organizationId: string) {
    const ativa = await app.request("/api/auth/organization/set-active", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c, origin: env.WEB_ORIGIN },
      body: JSON.stringify({ organizationId }),
    });
    expect(ativa.status).toBe(200);
  }

  async function entrar(email: string, nome: string, slug: string, orgNome: string): Promise<{ cookie: string; orgId: string }> {
    const { organizationId } = await criarEscritorio(t.db, auth, { nome: orgNome, slug, dono: { email, nome, senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "41.233", oabUf: "SC" } });
    const c = await entrarCom(email);
    await ativar(c, organizationId);
    return { cookie: c, orgId: organizationId };
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    auth = createAuth(t.db, env);
    const rotas = createRotas({
      db: t.db,
      auth,
      ia,
      arquivos: armazenamentoEmMemoria(),
      mailer: createLogMailer(() => {}),
      telas: "https://decreta.local",
      captura: { db: t.db, datajudKey: "" },
      maxArquivoBytes: 5e6,
      enfileirar: async (p) => void pedidos.push(p),
      log: () => {},
    });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ cookie, orgId } = await entrar("beatriz@souza.adv.br", "Beatriz Souza", "souza-mendes", "Souza & Mendes Advocacia"));
    ({ cookie: cookieOutro } = await entrar("tiago@outro.adv.br", "Tiago Martins", "outro", "Outro Escritório"));
    userId = (await t.owner<{ id: string }[]>`select id from "user" where email = 'beatriz@souza.adv.br'`)[0]!.id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("sem sessão é 401", async () => {
    expect((await call("/eu", {}, "")).status).toBe(401);
  });

  test("quem entra já cai no próprio escritório, sem escolher", async () => {
    const c = await entrarCom("beatriz@souza.adv.br");
    const eu = await json(call("/eu", {}, c));
    expect(eu.escritorio.id).toBe(orgId);
  });

  test("conta nova só com convite", async () => {
    const cadastro = (email: string) =>
      app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
        body: JSON.stringify({ email, password: "senha-bem-longa-123", name: "Rafael Lima" }),
      });
    expect((await cadastro("rafael@souza.adv.br")).status).toBe(403);

    const convite = await app.request("/api/auth/organization/invite-member", {
      method: "POST",
      headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN },
      body: JSON.stringify({ email: "rafael@souza.adv.br", role: "member" }),
    });
    expect(convite.status).toBe(200);
    const { id: conviteId } = (await convite.json()) as { id: string };
    expect(await json(app.request(`/api/convites/${conviteId}`))).toMatchObject({ escritorio: "Souza & Mendes Advocacia", status: "pending", papel: "member" });

    const r = await cadastro("Rafael@Souza.adv.br");
    expect(r.status).toBe(200);
    const c = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    const aceite = await app.request("/api/auth/organization/accept-invitation", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: c, origin: env.WEB_ORIGIN },
      body: JSON.stringify({ invitationId: conviteId }),
    });
    expect(aceite.status).toBe(200);
    await ativar(c, orgId);
    const eu = await json(call("/eu", {}, c));
    expect(eu).toMatchObject({ usuario: { nome: "Rafael Lima", papel: "member" }, escritorio: { nome: "Souza & Mendes Advocacia", pessoas: 2 } });
  });

  test("cadastra cliente e processo; número CNJ errado é recusado", async () => {
    const cliente = await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte", tipo: "pf", documento: "529.982.247-25", telefone: "(47) 99123-4567" } }));
    expect((await call("/processos", { method: "POST", json: { cnj: "5004321-18.2026.8.24.0038" } })).status).toBe(422);
    const r = await call("/processos", {
      method: "POST",
      json: {
        cnj: "50043212520268240038",
        clienteId: cliente.id,
        poloCliente: "ativo",
        orgao: "2ª Vara Cível",
        comarca: "Joinville",
        partes: [
          { nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true },
          { nome: "Seguradora Alfa S.A.", polo: "passivo", papel: "Ré" },
        ],
      },
    });
    expect(r.status).toBe(201);
    processoId = ((await r.json()) as { id: string }).id;
    const ficha = await json(call(`/processos/${processoId}`));
    expect(ficha).toMatchObject({ titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: "5004321-25.2026.8.24.0038", tribunal: "TJSC", responsavel: { apelido: "Beatriz" } });
    expect(pedidos).toContainEqual({ nome: "processo.datajud", organizationId: orgId, processoId });
  });

  test("publicação do DJEN entra vinculada pelo número e publicada no dia útil seguinte", async () => {
    const novas = await withTenant(t.db, orgId, (tx) =>
      gravarComunicacoes(tx, orgId, "45678/SC", [
        {
          idExterno: "412345678",
          disponibilizadaEm: "2026-10-28",
          tribunal: "TJSC",
          orgao: "2ª Vara Cível da Comarca de Joinville",
          tipoComunicacao: "Intimação",
          tipoDocumento: "Despacho",
          classe: "Procedimento Comum Cível",
          cnj: "5004321-25.2026.8.24.0038",
          texto: TEOR,
          link: null,
          destinatarios: [{ nome: "Marina Duarte", polo: "ativo" }],
          advogados: [{ nome: "Beatriz Souza", oab: "45678", uf: "SC" }],
        },
      ]),
    );
    expect(novas).toHaveLength(1);
    publicacaoId = novas[0]!;
    // A mesma comunicação de novo não entra.
    const repetida = await withTenant(t.db, orgId, (tx) => gravarComunicacoes(tx, orgId, null, [{ idExterno: "412345678", disponibilizadaEm: "2026-10-28", tribunal: "TJSC", orgao: null, tipoComunicacao: null, tipoDocumento: null, classe: null, cnj: null, texto: "x", link: null, destinatarios: [], advogados: [] }]));
    expect(repetida).toEqual([]);
    const pub = await json(call(`/publicacoes/${publicacaoId}`));
    expect(pub).toMatchObject({ publicadaEm: "2026-10-29", processo: { id: processoId }, situacao: "nova", sugestao: null });
  });

  test("a IA sugere; o motor conta 23/11; nasce o prazo a confirmar", async () => {
    ia.respostas["sugerir-prazo"] = {
      geraPrazo: true,
      tipo: "Manifestação sobre laudo pericial",
      dias: 15,
      contagem: "uteis",
      fundamento: "art. 477, § 1º, CPC",
      audiencia: null,
      resumo: "Intimação para falar do laudo do evento 87.",
      assunto: "laudo pericial",
      recusa: null,
    };
    const a = await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, publicacaoId);
    expect(a?.situacao).toBe("pronto");
    expect(a?.conteudo).toMatchObject({ contagemCalculada: { inicio: "2026-10-30", fim: "2026-11-23" }, responsavelId: userId });

    const lista = await json(call("/publicacoes?situacao=nova"));
    expect(lista.itens[0]).toMatchObject({ id: publicacaoId, titulo: "Intimação · laudo pericial", selo: { tipo: "prazo", texto: "Prazo sugerido · 23/11" } });

    const prazos = await json(call("/prazos?quando=abertos"));
    expect(prazos.itens).toHaveLength(1);
    expect(prazos.itens[0]).toMatchObject({ tipo: "Manifestação sobre laudo pericial", fim: "2026-11-23", situacao: "a_confirmar", origem: "DJEN · 28/10" });
    prazoId = prazos.itens[0].id;
  });

  test("a pessoa confirma (o cliente não manda data final; o servidor reconta)", async () => {
    const r = await json(call(`/publicacoes/${publicacaoId}/confirmar`, { method: "POST", json: { tipo: "Manifestação sobre laudo pericial", dias: 15, contagem: "uteis", fundamento: "art. 477, § 1º, CPC" } }));
    expect(r).toEqual({ prazoId, fim: "2026-11-23" });
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p).toMatchObject({ confirmado: true, confirmadoPor: { apelido: "Beatriz" }, inicio: "2026-10-30", fim: "2026-11-23", publicacao: { texto: TEOR } });
    expect(p.desconsiderados.map((d: { dia: string }) => d.dia)).toEqual(["2026-11-02", "2026-11-20"]);
    expect(p.historico.map((h: { titulo: string }) => h.titulo)).toEqual(["Beatriz confirmou o prazo", "IA sugeriu o prazo", "Publicação capturada"]);
    expect((await json(call(`/publicacoes/${publicacaoId}`))).situacao).toBe("vinculada");
  });

  test("ajustar reconta; data digitada à mão fica registrada", async () => {
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { dias: 10 } });
    expect((await json(call(`/prazos/${prazoId}`))).fim).toBe("2026-11-13");
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { dias: 15, fimManual: "2026-11-24" } });
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.fim).toBe("2026-11-24");
    expect(p.observacoes).toContain("a conta dava 23/11/2026");
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { dias: 15, fimManual: null, observacoes: null } });
    expect((await json(call(`/prazos/${prazoId}`))).fim).toBe("2026-11-23");
  });

  test("briefing com os blocos fixos e a fonte", async () => {
    ia.respostas["briefing-prazo"] = {
      decidiu: "Juntou o laudo e abriu prazo comum de 15 dias úteis.",
      fazer: ["Protocolar manifestação até 23/11."],
      aFavor: ["O perito confirmou o nexo (laudo, evento 87)."],
      contra: ["Não houve vistoria no veículo."],
      recusa: null,
    };
    const b = await json(call(`/ia/briefing/${prazoId}`, { method: "POST" }));
    expect(b).toMatchObject({ situacao: "pronto", fonte: "DJEN · 28/10/2026", conteudo: { fazer: ["Protocolar manifestação até 23/11."] } });
    expect((await json(call(`/prazos/${prazoId}`))).briefing.situacao).toBe("pronto");
  });

  test("peça gerada aos poucos e baixada em DOCX no timbre", async () => {
    await call("/escritorio", { method: "PUT", json: { timbre: { nome: "Souza & Mendes Advocacia", registro: "OAB/SC 1.234", endereco: "Rua das Palmeiras, 100, Joinville/SC" } } });
    const prep = await json(call(`/pecas/preparar?prazo=${prazoId}`));
    expect(prep).toMatchObject({ tipoSugerido: "manifestacao-laudo", documentos: [], briefing: true });
    ia.respostas["gerar-documento"] = "# Excelentíssimo Senhor Doutor Juiz de Direito da 2ª Vara Cível da Comarca de Joinville\n\n**Marina Duarte**, já qualificada, manifesta-se sobre o laudo.\n\n## I – Dos pedidos\n\n- a homologação do laudo.";
    const r = await call("/pecas", { method: "POST", json: { processoId, prazoId, tipo: "manifestacao-laudo", instrucoes: "Concordar com o laudo." } });
    expect(r.status).toBe(200);
    const pecaId = r.headers.get("x-peca-id")!;
    const texto = await r.text();
    expect(texto).toContain("## I – Dos pedidos");
    const peca = await json(call(`/pecas/${pecaId}`));
    expect(peca.texto).toBe(texto);
    expect(JSON.stringify(ia.pedidos["gerar-documento"])).toContain("Concordar com o laudo.");
    const docx = await call(`/pecas/${pecaId}/docx`);
    expect(docx.headers.get("content-type")).toBe(MIME_DOCX);
    const lido = await extrairTexto(new Uint8Array(await docx.arrayBuffer()), MIME_DOCX);
    expect(lido).toContain("EXCELENTÍSSIMO SENHOR DOUTOR JUIZ");
    expect((await json(call("/prazos?quando=abertos"))).itens[0].situacao).toBe("peca_em_revisao");
  });

  test("peça escrita à mão, sem a IA, também sai no timbre", async () => {
    const r = await call("/pecas/manual", { method: "POST", json: { processoId, prazoId, tipo: "manifestacao-laudo", texto: "# Excelentíssimo Senhor Doutor Juiz\n\nManifesta-se sobre o laudo." } });
    expect(r.status).toBe(201);
    const { id: pecaId } = (await r.json()) as { id: string };
    expect(await json(call(`/pecas/${pecaId}`))).toMatchObject({ texto: "# Excelentíssimo Senhor Doutor Juiz\n\nManifesta-se sobre o laudo.", situacao: "rascunho" });
    const lido = await extrairTexto(new Uint8Array(await (await call(`/pecas/${pecaId}/docx`)).arrayBuffer()), MIME_DOCX);
    expect(lido).toContain("Manifesta-se sobre o laudo.");
    expect((await call("/pecas/manual", { method: "POST", json: { processoId, tipo: "nao-existe", texto: "x" } })).status).toBe(422);
  });

  test("Hoje junta vencidos, de hoje e as publicações", async () => {
    const h = await json(call("/hoje"));
    expect(h).toHaveProperty("contadores");
    expect(h.porResponsavel[0]).toMatchObject({ pessoa: { apelido: "Beatriz" } });
  });

  test("publicação sem teor: recusa sem chamar a IA", async () => {
    const r = await call("/publicacoes", { method: "POST", json: { processoId, disponibilizadaEm: "2026-10-27", texto: "Intimação." } });
    expect(r.status).toBe(400);
    const ok = await json(call("/publicacoes", { method: "POST", json: { processoId, disponibilizadaEm: "2026-10-27", texto: "Sem teor disponível no momento." } }));
    const antes = ia.chamadas.length;
    const a = await json(call(`/publicacoes/${ok.id}/sugerir`, { method: "POST" }));
    expect(a).toMatchObject({ situacao: "recusa" });
    expect(ia.chamadas.length).toBe(antes);
  });

  test("chat do processo chega aos poucos e fica guardado", async () => {
    ia.respostas["chat-processo"] = "Sim. Na audiência de 14/05 a ré ofereceu R$ 18.000,00.";
    const r = await call(`/ia/chat/${processoId}`, { method: "POST", json: { texto: "Houve proposta de acordo?" } });
    expect(await r.text()).toBe("Sim. Na audiência de 14/05 a ré ofereceu R$ 18.000,00.");
    await Bun.sleep(30);
    const h = await json(call(`/ia/chat/${processoId}`));
    expect(h.mensagens.map((m: { papel: string }) => m.papel)).toEqual(["pessoa", "ia"]);
  });

  test("outro escritório não vê nada deste", async () => {
    expect((await call(`/processos/${processoId}`, {}, cookieOutro)).status).toBe(404);
    expect((await call(`/prazos/${prazoId}`, {}, cookieOutro)).status).toBe(404);
    expect((await json(call("/prazos?quando=abertos", {}, cookieOutro))).itens).toEqual([]);
    expect((await json(call("/busca?q=Marina", {}, cookieOutro))).processos).toEqual([]);
    expect((await call(`/prazos/${prazoId}/cumprir`, { method: "POST" }, cookieOutro)).status).toBe(404);
  });

  test("cumprir e reabrir", async () => {
    await call(`/prazos/${prazoId}/cumprir`, { method: "POST" });
    expect((await json(call("/prazos?quando=cumpridos"))).itens).toHaveLength(1);
    await call(`/prazos/${prazoId}/reabrir`, { method: "POST" });
    expect((await json(call(`/prazos/${prazoId}`))).situacao).toBe("aberto");
  });

  test("exportar prazos em CSV", async () => {
    const r = await call("/prazos/exportar?quando=abertos");
    const csv = await r.text();
    expect(r.headers.get("content-type")).toContain("text/csv");
    expect(csv).toContain('"23/11/2026";"Manifestação sobre laudo pericial"');
  });
});
