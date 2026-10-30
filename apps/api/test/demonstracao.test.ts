/** A demonstração sobe inteira e as telas mostram o que o design mostra. */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { apagarDemonstracao, criarDemonstracao, documentoValido } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { atualizarDoDataJud, capturarDjen } from "../src/servicos/captura.ts";
import { cnpjValido, cpfValido, dvCnj } from "@decreta/core";

/** Um prazo da lista. */
type Item = { tipo: string; processo: { titulo: string } };

describe.skipIf(!hasTestDatabase)("escritório de demonstração", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  const arquivos = armazenamentoEmMemoria();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const call = async (path: string) => {
    const r = await app.request(`/api/app${path}`, { headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(r.status).toBe(200);
    return (await r.json()) as any;
  };

  beforeAll(async () => {
    // O "hoje" do design, no relógio também: o Hoje e as listas contam a partir dele.
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const inicio = performance.now();
    const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
    console.log(`demonstração criada em ${Math.round(performance.now() - inicio)} ms`);
    orgId = organizationId;
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "teste@decreta.site", password: "demonstracao-123" }) });
    expect(r.status).toBe(200);
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("nada da demonstração vai ao DJEN nem ao DataJud", async () => {
    let chamadas = 0;
    const fetch = (async () => {
      chamadas++;
      return new Response("{}");
    }) as unknown as typeof globalThis.fetch;
    const captura = { db: t.db, datajudKey: "chave", fetch };
    expect(await capturarDjen(captura, orgId, { de: "2026-10-28", ate: "2026-10-29" })).toEqual({ encontradas: 0, novas: [] });
    const { itens } = await call("/processos");
    expect(await atualizarDoDataJud(captura, orgId, itens[0].id)).toBe(0);
    expect(chamadas).toBe(0);
    expect(await call("/escritorio")).toMatchObject({ demonstracao: true, capturaDjen: false, capturaDatajud: false });
    const ligar = await app.request("/api/app/escritorio", { method: "PUT", headers: { cookie, origin: env.WEB_ORIGIN, "content-type": "application/json" }, body: JSON.stringify({ capturaDjen: true }) });
    expect(ligar.status).toBe(403);
    const buscar = await app.request("/api/app/publicacoes/buscar", { method: "POST", headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(buscar.status).toBe(409);
  });

  test("a consulta pelo número responde com um exemplo inventado, sem ir ao tribunal", async () => {
    const cnj = `5012345-${dvCnj("5012345", "2026", "8", "24", "0038")}.2026.8.24.0038`;
    const c = await call(`/processos/consulta?cnj=${cnj}`);
    expect(c).toMatchObject({ cnj, tribunal: "TJSC", exemplo: true, cadastrado: null, fontes: { datajud: "achou", djen: "achou" }, sistema: "eproc" });
    expect(c.comarca).toBeTruthy();
    expect(c.partes).toHaveLength(2);
    // O cliente do exemplo é um dos cadastrados, do lado da equipe.
    expect(c.cliente).toEqual(c.partes[0].cliente);
    expect(c.cliente).not.toBeNull();
    expect(c.poloCliente).toBe(c.partes[0].polo);
    expect(c.partes[0].advogados).toContain("Beatriz Souza (OAB/SC 41233)");
    // Mesmo número, mesma resposta.
    expect(await call(`/processos/consulta?cnj=${cnj}`)).toEqual(c);
    const { itens } = await call("/processos");
    const trazer = await app.request(`/api/app/processos/${itens[0].id}/partes/djen`, { method: "POST", headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(trazer.status).toBe(409);
  });

  test("CNPJ, CEP e OAB respondem com exemplos inventados, sem ir à Receita nem ao Diário", async () => {
    const cnpj = documentoValido("740619280001");
    const c = await call(`/consultas/cnpj/${cnpj}`);
    expect(c).toMatchObject({ fonte: "achou", exemplo: true, cliente: null, empresa: { cnpj, naturezaJuridica: "Sociedade Empresária Limitada" } });
    expect(c.empresa.enderecoEmTexto).toContain("/SC, CEP 89");
    expect(await call(`/consultas/cnpj/${cnpj}`)).toEqual(c);
    expect(await call("/consultas/cep/89204000")).toMatchObject({ cep: "89204-000", fonte: "achou", exemplo: true, endereco: { uf: "SC", cep: "89204-000" } });
    // A OAB de quem está na equipe aparece com o nome da pessoa; outra qualquer, não.
    expect(await call("/consultas/oab?numero=41233&uf=SC")).toMatchObject({ fonte: "achou", exemplo: true, nomes: [{ nome: "Beatriz Souza" }] });
    expect(await call("/consultas/oab?numero=99999&uf=SC")).toMatchObject({ fonte: "nao_achou", nomes: [] });
  });

  test("documentos inventados têm verificadores válidos", () => {
    expect(cpfValido(documentoValido("318204567"))).toBe(true);
    expect(cnpjValido(documentoValido("418273650001"))).toBe(true);
  });

  test("Hoje com vencido, de hoje, audiências e publicações", async () => {
    const h = await call("/hoje");
    expect(h.contadores).toMatchObject({ vencidos: 1, vencemHoje: 3, publicacoesNovas: 7, audienciasHoje: 2 });
    expect(h.itens[0]).toMatchObject({ titulo: "Contestação trabalhista", urgencia: "vencido" });
    expect(h.itens.map((i: { titulo: string }) => i.titulo)).toContain("Cobrar documentos do cliente novo");
  });

  test("a sugestão da Marina vence em 23/11, a confirmar", async () => {
    const p = await call("/prazos?quando=abertos");
    const marina = p.itens.find((i: Item) => i.tipo === "Manifestação sobre laudo pericial" && i.processo.titulo.startsWith("Marina"));
    expect(marina).toMatchObject({ fim: "2026-11-23", situacao: "a_confirmar", origem: "DJEN · 28/10" });
    expect(p.itens.find((i: Item) => i.tipo === "Alegações finais" && i.processo.titulo.startsWith("Roberto")).situacao).toBe("peca_em_revisao");
    const prazo = await call(`/prazos/${marina.id}`);
    expect(prazo.briefing).toMatchObject({ situacao: "pronto", desatualizada: false });
    expect(prazo.desconsiderados.map((d: { dia: string }) => d.dia)).toEqual(["2026-11-02", "2026-11-20"]);
  });

  test("caixa de publicações e resumo dos autos desatualizado pela petição da ré", async () => {
    const pubs = await call("/publicacoes");
    expect(pubs.contagens).toMatchObject({ nova: 7, pendente: 3 });
    const marina = pubs.itens.find((i: { partes: string }) => i.partes.startsWith("Marina"));
    expect(marina).toMatchObject({ titulo: "Intimação · laudo pericial", selo: { tipo: "prazo", texto: "Prazo sugerido · 23/11" } });
    const processo = await call(`/processos/${marina.processoId}`);
    expect(processo.cnj).toBe("5004321-25.2026.8.24.0038");
    expect(processo.resumo).toMatchObject({ situacao: "pronto", desatualizada: true });
    expect(processo.novidades).toEqual(["petição da ré, evento 89"]);
    const docs = await call(`/documentos?processo=${marina.processoId}`);
    expect(docs.itens.length).toBeGreaterThanOrEqual(8);
  });

  test("a busca dos documentos acha por parte do nome, sem acento e por de quem é", async () => {
    const achados = async (busca: string) => (await call(`/documentos?busca=${encodeURIComponent(busca)}`)).itens as { id: string; nome: string; processo: { titulo: string } | null; negocio: { nome: string } | null }[];
    const nomes = async (busca: string) => (await achados(busca)).map((d) => d.nome);
    expect(await nomes("esclarec")).toEqual(["Petição da ré · pedido de esclarecimentos.docx"]);
    expect(await nomes("PETICAO DA RE")).toContain("Petição da ré · pedido de esclarecimentos.docx");
    // Palavras em qualquer ordem, e o processo conta: "laudo marina" é o laudo do processo da Marina.
    const laudo = await achados("pericial marina laudo");
    expect(laudo.map((d) => d.nome)).toContain("Laudo pericial.docx");
    expect(laudo.every((d) => d.processo?.titulo.startsWith("Marina"))).toBe(true);
    // Os da pasta da triagem dizem de quem são.
    expect(await achados("conta de luz")).toMatchObject([{ nome: "Conta de luz março.docx", negocio: { nome: "José Antunes" } }]);
    expect(await nomes("% _")).toHaveLength((await call("/documentos")).itens.length);
    // O painel do documento aberto pede um só, igual ao da lista.
    expect(await call(`/documentos/${laudo[0]!.id}`)).toEqual(laudo[0]);
  });

  test("tem o volume de um escritório de verdade", async () => {
    expect((await call("/clientes")).total).toBeGreaterThan(120);
    expect((await call("/processos")).total).toBeGreaterThan(130);
    expect((await call("/processos?situacao=arquivados")).total).toBeGreaterThan(5);
    expect((await call("/prazos?quando=cumpridos")).itens.length).toBeGreaterThan(150);
    expect((await call("/publicacoes?situacao=vinculada")).itens.length).toBeGreaterThan(100);
    // Todo processo principal tem andamento, não só o da Marina.
    const padaria = (await call("/processos?busca=Padaria")).itens[0];
    expect((await call(`/processos/${padaria.id}/movimentacoes`)).itens.length).toBeGreaterThan(1);
    const [semAndamento] = await t.owner`select count(*)::int as n from processos p where not exists (select 1 from movimentacoes m where m.processo_id = p.id)`;
    expect(semAndamento!.n).toBe(0);
  });

  test("a conta da demonstração não troca a senha nem liga a verificação em duas etapas", async () => {
    const post = (path: string, body: unknown) => app.request(`/api/auth${path}`, { method: "POST", headers: { cookie, origin: env.WEB_ORIGIN, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await post("/change-password", { currentPassword: "demonstracao-123", newPassword: "so-minha-agora" })).status).toBe(403);
    expect((await post("/two-factor/enable", { password: "demonstracao-123" })).status).toBe(403);
    expect((await call("/eu")).usuario.nome).toBe("Beatriz Souza");
  });

  test("renovar refaz as datas sem tirar ninguém do sistema", async () => {
    const [antes] = await t.owner`select count(*)::int as n from documentos`;
    expect(await apagarDemonstracao(t.db, { arquivos, manterPessoas: true })).toBe(orgId);
    // Os arquivos do escritório saem junto.
    const [chave] = await t.owner`select chave from documentos limit 1`;
    expect(chave).toBeUndefined();
    await criarDemonstracao(t.db, createAuth(t.db, env), { hoje: "2026-10-29", senha: "demonstracao-456", arquivos, organizationId: orgId });
    // A mesma sessão continua valendo, com o escritório inteiro de volta.
    const h = await call("/hoje");
    expect(h.contadores).toMatchObject({ vencidos: 1, vencemHoje: 3, publicacoesNovas: 7, audienciasHoje: 2 });
    const [depois] = await t.owner`select count(*)::int as n from documentos`;
    expect(depois!.n).toBe(antes!.n);
    const entrar = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "rafael@demo.decreta.app", password: "demonstracao-456" }) });
    // A senha volta para a da renovação (DEMONSTRACAO_SENHA no servidor), sem derrubar quem estava dentro.
    expect(entrar.status).toBe(200);
  }, 60_000);

  test("recriar apaga só a demonstração", async () => {
    expect(await apagarDemonstracao(t.db)).toBe(orgId);
    expect((await t.owner`select count(*)::int as n from processos`)[0]!.n).toBe(0);
    expect((await t.owner`select count(*)::int as n from "user"`)[0]!.n).toBe(0);
  });
});
