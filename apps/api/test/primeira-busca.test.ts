/**
 * O primeiro minuto: ao informar a OAB, o Decreta busca os últimos dias no DJEN
 * na hora e a tela acompanha: quantas achou, quantas têm prazo e a leitura da IA
 * chegando. Com o DJEN de mentira e banco de verdade.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { analises, publicacoes, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { executarPrimeiraBusca, proximaBusca } from "../src/servicos/primeira-busca.ts";

const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
const SENHA = "senha-bem-longa-123";

const comunicacao = (id: number) => ({
  id,
  hash: `h${id}`,
  data_disponibilizacao: "2026-10-28",
  siglaTribunal: "TJSC",
  tipoComunicacao: "Intimação",
  nomeOrgao: "2ª Vara Cível da Comarca de Joinville",
  numeroprocessocommascara: "5004321-25.2026.8.24.0038",
  texto: `Intime-se (${id}).`,
  destinatarios: [{ nome: "PARTE INVENTADA", polo: "A" }],
  destinatarioadvogados: [{ advogado: { nome: "PESSOA INVENTADA", numero_oab: "41233", uf_oab: "SC" } }],
});
const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

describe("quando o Decreta olha de novo", () => {
  const em = (iso: string) => new Date(iso);
  test("no meio do dia útil, a próxima rodada de hoje", () => {
    expect(proximaBusca(em("2026-10-26T10:00:00-03:00"))).toBe("hoje, às 12:40");
    expect(proximaBusca(em("2026-10-26T13:00:00-03:00"))).toBe("hoje, às 18:40");
    expect(proximaBusca(em("2026-10-26T03:00:00-03:00"))).toBe("hoje, às 04:30");
  });
  test("à noite, amanhã de madrugada", () => {
    expect(proximaBusca(em("2026-10-26T19:00:00-03:00"))).toBe("amanhã, às 04:30");
  });
  test("na sexta à noite e no fim de semana, só na segunda", () => {
    expect(proximaBusca(em("2026-10-30T22:00:00-03:00"))).toBe("segunda-feira, às 04:30");
    expect(proximaBusca(em("2026-10-31T10:00:00-03:00"))).toBe("segunda-feira, às 04:30");
    expect(proximaBusca(em("2026-11-01T10:00:00-03:00"))).toBe("amanhã, às 04:30");
  });
});

describe.skipIf(!hasTestDatabase)("a primeira busca", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let org: string;
  let semOab: string;
  let cookie: string;
  let cookieDaDemo: string;
  let cookieSemOab: string;
  const pedidos: Pedido[] = [];
  let urls: URL[] = [];
  let djen: () => Response = () => resposta({ count: 0, items: [] });
  const fetchFalso = (async (entrada: string | URL) => {
    urls.push(new URL(String(entrada)));
    return djen();
  }) as unknown as typeof fetch;
  const captura = () => ({ db: t.db, datajudKey: "", fetch: fetchFalso, djen: { dormir: async () => {} } });

  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  const pedir = (c: string) => app.request("/api/app/escritorio/primeira-busca", { method: "POST", headers: { cookie: c, origin: env.WEB_ORIGIN } });
  const progresso = async (desde: string, c = cookie) => (await app.request(`/api/app/escritorio/primeira-busca?desde=${encodeURIComponent(desde)}`, { headers: { cookie: c, origin: env.WEB_ORIGIN } })).json() as Promise<any>;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: { generate: async () => "" } as never, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: captura(), maxArquivoBytes: 5e6, enfileirar: async (p) => void pedidos.push(p), log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const dono = (email: string, oabNumero?: string) => ({ email, nome: "Pessoa Inventada", senha: SENHA, ...(oabNumero ? { oabNumero, oabUf: "SC" } : {}) });
    ({ organizationId: org } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", cadastroAberto: true, dono: dono("beatriz@souza.adv.br", "41233") }));
    ({ organizationId: semOab } = await criarEscritorio(t.db, auth, { nome: "Sem OAB Advocacia", slug: "sem-oab", cadastroAberto: true, dono: dono("ana@semoab.adv.br") }));
    await criarEscritorio(t.db, auth, { nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, dono: dono("teste@decreta.site", "41233") });
    cookie = await entrar("beatriz@souza.adv.br");
    cookieSemOab = await entrar("ana@semoab.adv.br");
    cookieDaDemo = await entrar("teste@decreta.site");
  });
  afterAll(async () => {
    await t?.drop();
  });

  test("sem OAB não há o que buscar", async () => {
    const r = await pedir(cookieSemOab);
    expect(r.status).toBe(422);
    expect(semOab).toBeTruthy();
    expect(pedidos).toEqual([]);
  });

  test("a demonstração nunca vai ao DJEN", async () => {
    expect((await pedir(cookieDaDemo)).status).toBe(409);
    expect(pedidos).toEqual([]);
  });

  test("informou a OAB: o pedido vai para a fila, com os dias da busca e quando olha de novo", async () => {
    const r = await pedir(cookie);
    expect(r.status).toBe(200);
    const corpo = (await r.json()) as { pedidaEm: string; dias: number };
    expect(corpo.dias).toBe(7);
    expect(new Date(corpo.pedidaEm).getTime()).toBeGreaterThan(Date.now() - 60_000);
    expect(pedidos).toEqual([{ nome: "captura.primeira", organizationId: org }]);
  });

  test("antes de a rotina começar, a tela diz que está na fila", async () => {
    const p = await progresso(new Date().toISOString());
    expect(p.situacao).toBe("na_fila");
    expect(p.encontradas).toBe(0);
    expect(typeof p.proximaBusca).toBe("string");
  });

  test("achou: busca os últimos 7 dias, conta as publicações, e a leitura da IA vai chegando", async () => {
    const desde = new Date(Date.now() - 1000).toISOString();
    urls = [];
    djen = () => resposta({ count: 3, items: [comunicacao(1), comunicacao(2), comunicacao(3)] });
    const r = await executarPrimeiraBusca(captura(), org, "2026-10-30");
    expect(r.novas).toHaveLength(3);
    expect(urls[0]!.searchParams.get("numeroOab")).toBe("41233");
    expect(urls[0]!.searchParams.get("ufOab")).toBe("SC");
    expect(urls[0]!.searchParams.get("dataDisponibilizacaoInicio")).toBe("2026-10-23");
    expect(urls[0]!.searchParams.get("dataDisponibilizacaoFim")).toBe("2026-10-30");

    let p = await progresso(desde);
    expect(p).toMatchObject({ situacao: "pronta", encontradas: 3, novas: 3, lidas: 0, faltamLer: 3, comPrazo: 0, iaLigada: true, erro: null });
    expect(p.itens).toHaveLength(3);
    expect(p.itens[0]).toMatchObject({ titulo: "Intimação", tribunal: "TJSC", disponibilizadaEm: "2026-10-28", leitura: "lendo" });

    const [a, b] = await withTenant(t.db, org, (tx) => tx.select({ id: publicacoes.id }).from(publicacoes).where(eq(publicacoes.organizationId, org)));
    await withTenant(t.db, org, (tx) =>
      tx.insert(analises).values([
        { organizationId: org, alvo: "publicacao", alvoId: a!.id, acao: "sugerir-prazo", situacao: "pronto", base: "teste", conteudo: { geraPrazo: true, tipo: "Manifestação sobre laudo", dias: 15, contagem: "uteis" } },
        { organizationId: org, alvo: "publicacao", alvoId: b!.id, acao: "sugerir-prazo", situacao: "pronto", base: "teste", conteudo: { geraPrazo: false, tipo: "", dias: null, contagem: "uteis" } },
      ]),
    );
    p = await progresso(desde);
    expect(p).toMatchObject({ situacao: "pronta", encontradas: 3, lidas: 2, faltamLer: 1, comPrazo: 1 });
    const porId = new Map(p.itens.map((i: { id: string }) => [i.id, i]));
    expect(porId.get(a!.id)).toMatchObject({ leitura: "com_prazo", prazo: "Manifestação sobre laudo · 15 dias úteis" });
    expect(porId.get(b!.id)).toMatchObject({ leitura: "sem_prazo" });
  });

  test("a mesma busca de novo não duplica nada", async () => {
    djen = () => resposta({ count: 3, items: [comunicacao(1), comunicacao(2), comunicacao(3)] });
    const r = await executarPrimeiraBusca(captura(), org, "2026-10-30");
    expect(r.encontradas).toBe(3);
    expect(r.novas).toHaveLength(0);
  });

  test("nada encontrado: diz isso, e quando olha de novo", async () => {
    // Um segundo de folga: as publicações do teste anterior não contam como desta busca.
    await Bun.sleep(1100);
    const desde = new Date(Date.now() - 1000).toISOString();
    djen = () => resposta({ count: 0, items: [] });
    await executarPrimeiraBusca(captura(), semOab, "2026-10-30").catch(() => null);
    await executarPrimeiraBusca(captura(), org, "2026-10-30");
    const p = await progresso(desde);
    expect(p).toMatchObject({ situacao: "pronta", encontradas: 0, novas: 0 });
    expect(p.itens).toEqual([]);
  });

  test("o DJEN fora do ar: a rodada fica com erro, a tela sabe, e nada se perde", async () => {
    const desde = new Date(Date.now() - 1000).toISOString();
    djen = () => resposta({ erro: "fora" }, 500);
    await expect(executarPrimeiraBusca(captura(), org, "2026-10-30")).rejects.toThrow(/DJEN/);
    const p = await progresso(desde);
    expect(p.situacao).toBe("falhou");
    expect(p.erro).toContain("DJEN");
    expect(typeof p.proximaBusca).toBe("string");
  });

  test("quem está em avaliação tem um teto de buscas imediatas por dia", async () => {
    const respostas = [];
    for (let i = 0; i < 4; i++) respostas.push((await pedir(cookie)).status);
    // O primeiro pedido já foi lá em cima: 3 por dia.
    expect(respostas).toEqual([200, 200, 429, 429]);
    const r = await pedir(cookie);
    const corpo = (await r.json()) as { detalhe: string };
    expect(corpo.detalhe).toContain("3 buscas");
  });

  test("o desde inválido não vira consulta", async () => {
    const r = await app.request("/api/app/escritorio/primeira-busca?desde=ontem", { headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(r.status).toBe(400);
  });
});
