/**
 * Encerrar o escritório: o sócio confirma digitando o nome, o acesso acaba na
 * hora (ninguém entra, a captura e o WhatsApp param) e uma rotina apaga tudo,
 * arquivos inclusive, 30 dias depois, sem tocar em nenhum outro escritório.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria, type Armazenamento } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { escritoriosAtivos } from "../src/inngest.ts";
import { rotasDoMcp } from "../src/rotas/mcp.ts";
import { createRotas } from "../src/rotas/index.ts";
import { capturarCadernos, capturarDjen } from "../src/servicos/captura.ts";
import { apagarEscritoriosEncerrados, DIAS_ATE_APAGAR, encerrarEscritorio } from "../src/servicos/encerramento.ts";

const DIA_MS = 24 * 60 * 60 * 1000;
const SENHA = "senha-bem-longa-123";

describe.skipIf(!hasTestDatabase)("encerrar o escritório", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let auth: ReturnType<typeof createAuth>;
  const arquivos = armazenamentoEmMemoria();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const com = (cookie: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const entrarRaw = (email: string) => app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
  const entrar = async (email: string) => {
    const r = await entrarRaw(email);
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  const ativar = async (cookie: string, organizationId: string) => {
    const r = await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
    expect(r.status).toBe(200);
  };
  const novo = (nome: string, slug: string, email: string, pessoa: string) => criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: pessoa, senha: SENHA } });
  /** A pessoa entra como membro (papel "member") do escritório, com a conta que já tem. */
  const juntar = (organizationId: string, userId: string, role = "member") => t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${organizationId}, ${userId}, ${role})`;
  const encerradoEm = async (orgId: string) => (await t.owner<{ encerrado_em: Date | null }[]>`select encerrado_em from organization where id = ${orgId}`)[0]?.encerrado_em ?? null;
  const acoes = async (orgId: string) => (await t.owner<{ acao: string }[]>`select acao from auditoria where organization_id = ${orgId} order by created_at`).map((r) => r.acao);
  const eventosDe = async (orgId: string) => (await t.owner<{ nome: string }[]>`select nome from eventos where organization_id = ${orgId}`).map((r) => r.nome);

  /** A demonstração: fica fechada para o encerramento, e a rotina de apagar nunca encosta nela. */
  let demo = { org: "", pessoa: "" };

  beforeAll(async () => {
    t = await createTestDatabase();
    auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, mcp: rotasDoMcp({ db: t.db, log: () => {} }), log: () => {} });
    const d = await novo("Demonstração", SLUG_DA_DEMONSTRACAO, "teste@decreta.site", "Sócia da Demonstração");
    demo = { org: d.organizationId, pessoa: d.userId };
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("pelas telas", () => {
    let souza = "";
    let mendes = "";
    let beatriz = "";
    let rafaelId = "";
    let rafaelSolo = "";
    let cookieBeatriz = "";
    let cookieRafael = "";
    let cookieTiago = "";

    beforeAll(async () => {
      ({ organizationId: souza, userId: beatriz } = await novo("Souza & Mendes Advocacia", "souza-mendes", "beatriz@souza.adv.br", "Beatriz Souza"));
      ({ organizationId: mendes } = await novo("Mendes Advogados", "mendes", "tiago@mendes.adv.br", "Tiago Mendes"));
      // Rafael tem o próprio escritório e é membro (não sócio) do Souza: ao fechar o Souza, ele ainda tem para onde entrar.
      ({ organizationId: rafaelSolo, userId: rafaelId } = await novo("Rafael Lima Advocacia", "rafael-lima", "rafael@lima.adv.br", "Rafael Lima"));
      await juntar(souza, rafaelId);
      cookieBeatriz = await entrar("beatriz@souza.adv.br");
      cookieRafael = await entrar("rafael@lima.adv.br");
      await ativar(cookieRafael, souza);
      cookieTiago = await entrar("tiago@mendes.adv.br");
    });

    test("só sócio encerra: quem é da equipe recebe 403 e o escritório segue aberto", async () => {
      expect((await json(com(cookieRafael, "/eu"))).usuario.papel).toBe("member");
      const r = await com(cookieRafael, "/escritorio/encerrar", { json: { confirmacao: "Souza & Mendes Advocacia" } });
      expect(r.status).toBe(403);
      expect((await json(r)).erro).toBe("so_socios");
      expect(await encerradoEm(souza)).toBeNull();
    });

    test("sem o nome do escritório, ou com outro nome, não encerra", async () => {
      expect((await com(cookieBeatriz, "/escritorio/encerrar", { json: {} })).status).toBe(400);
      const errado = await com(cookieBeatriz, "/escritorio/encerrar", { json: { confirmacao: "Mendes Advogados" } });
      expect(errado.status).toBe(422);
      expect((await json(errado)).erro).toBe("confirmacao_errada");
      expect((await com(cookieBeatriz, "/escritorio/encerrar", { json: { confirmacao: "Souza" } })).status).toBe(422);
      expect(await encerradoEm(souza)).toBeNull();
      expect((await com(cookieBeatriz, "/eu")).status).toBe(200);
    });

    test("a demonstração não pode ser encerrada", async () => {
      const cookie = await entrar("teste@decreta.site");
      const r = await com(cookie, "/escritorio/encerrar", { json: { confirmacao: "Demonstração" } });
      expect(r.status).toBe(403);
      expect((await json(r)).erro).toBe("demonstracao");
      expect(await encerradoEm(demo.org)).toBeNull();
    });

    test("o sócio encerra com o nome (maiúsculas e espaços não pesam): o escritório fecha na hora, com o dia em que os dados somem", async () => {
      await t.owner`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id) values ('conv-1', ${souza}, 'novo@souza.adv.br', 'member', 'pending', now() + interval '3 days', ${beatriz})`;
      const antes = Date.now();
      const r = await com(cookieBeatriz, "/escritorio/encerrar", { json: { confirmacao: "  souza &  MENDES advocacia " } });
      expect(r.status).toBe(200);
      const corpo = await json(r);
      expect(corpo.ok).toBe(true);
      const fechou = (await encerradoEm(souza))!;
      expect(fechou.getTime()).toBeGreaterThanOrEqual(antes - 1000);
      expect(new Date(corpo.apagarEm).getTime()).toBe(fechou.getTime() + DIAS_ATE_APAGAR * DIA_MS);
      // O registro guarda quem fechou e quando vai apagar; o funil guarda a saída.
      expect(await acoes(souza)).toContain("escritorio.encerrado");
      const [registro] = await t.owner<{ user_id: string; nome: string; detalhes: Record<string, unknown> }[]>`select user_id, nome, detalhes from auditoria where organization_id = ${souza} and acao = 'escritorio.encerrado'`;
      expect(registro).toMatchObject({ user_id: beatriz, nome: "Beatriz Souza", detalhes: { apagarEm: corpo.apagarEm } });
      expect(await eventosDe(souza)).toContain("escritorio_encerrado");
      // Convite pendente deixa de valer.
      expect((await t.owner<{ status: string }[]>`select status from invitation where id = 'conv-1'`)[0]!.status).toBe("canceled");
      expect(await json(app.request("/api/convites/conv-1"))).toMatchObject({ status: "canceled" });
    });

    test("as sessões do escritório caem: ninguém mais entra pelas telas", async () => {
      expect((await com(cookieBeatriz, "/eu")).status).toBe(401);
      expect((await com(cookieRafael, "/eu")).status).toBe(401);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from session where active_organization_id = ${souza}`)[0]!.n).toBe(0);
    });

    test("quem só tem esse escritório não consegue entrar de novo, e a resposta explica", async () => {
      const r = await entrarRaw("beatriz@souza.adv.br");
      expect(r.status).toBe(403);
      expect(((await r.json()) as { code: string }).code).toBe("ESCRITORIO_ENCERRADO");
      expect(r.headers.get("set-cookie")).toBeNull();
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from session where user_id = ${beatriz}`)[0]!.n).toBe(0);
    });

    test("quem tem outro escritório entra nele, e o outro escritório segue como estava", async () => {
      const cookie = await entrar("rafael@lima.adv.br");
      expect((await json(com(cookie, "/eu"))).escritorio.id).toBe(rafaelSolo);
      expect((await com(cookieTiago, "/eu")).status).toBe(200);
      expect(await encerradoEm(mendes)).toBeNull();
    });

    test("encerrar de novo não muda o dia em que os dados somem", async () => {
      const primeiro = await encerradoEm(souza);
      const segunda = await encerrarEscritorio(t.db, { organizationId: souza, userId: beatriz, nome: "Beatriz Souza", ip: null });
      expect((await encerradoEm(souza))!.getTime()).toBe(primeiro!.getTime());
      expect(segunda.apagarEm.getTime()).toBe(primeiro!.getTime() + DIAS_ATE_APAGAR * DIA_MS);
    });
  });

  describe("o que para quando fecha", () => {
    let aberto = "";
    let fechado = "";
    let cookieFechado = "";
    let cookieAberto = "";

    beforeAll(async () => {
      ({ organizationId: aberto } = await novo("Escritório Aberto", "aberto", "ana@aberto.adv.br", "Ana Aberta"));
      ({ organizationId: fechado } = await novo("Escritório Fechado", "fechado", "caio@fechado.adv.br", "Caio Fechado"));
      for (const org of [aberto, fechado]) await t.owner`update equipe set oab_numero = '41233', oab_uf = 'SC' where organization_id = ${org}`;
      cookieAberto = await entrar("ana@aberto.adv.br");
      cookieFechado = await entrar("caio@fechado.adv.br");
      // Fechado por fora (como uma sessão que ainda vive): a trava das rotas não depende de a sessão ter caído.
      await t.owner`update organization set encerrado_em = now() where id = ${fechado}`;
    });

    test("com a sessão ainda de pé, as rotas das telas respondem 403", async () => {
      const r = await com(cookieFechado, "/eu");
      expect(r.status).toBe(403);
      expect((await json(r)).erro).toBe("escritorio_encerrado");
      expect((await com(cookieFechado, "/hoje")).status).toBe(403);
      expect((await com(cookieAberto, "/eu")).status).toBe(200);
    });

    test("as rotinas só enxergam os escritórios abertos, e a demonstração segue de fora", async () => {
      const ids = (await escritoriosAtivos(t.db)).map((o) => o.id);
      expect(ids).toContain(aberto);
      expect(ids).not.toContain(fechado);
    });

    test("a busca no DJEN e a leitura dos cadernos não rodam para o escritório fechado", async () => {
      let chamadas = 0;
      const fetchQueConta = (async () => {
        chamadas++;
        return new Response(JSON.stringify({ items: [], count: 0 }), { headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch;
      const captura = { db: t.db, datajudKey: "", fetch: fetchQueConta, djen: { dormir: async () => {} } };
      expect(await capturarDjen(captura, fechado, { de: "2026-10-28", ate: "2026-10-28" })).toEqual({ encontradas: 0, novas: [] });
      expect(chamadas).toBe(0);
      const antes = (await t.owner<{ n: number }[]>`select count(*)::int as n from capturas where organization_id = ${fechado}`)[0]!.n;
      await capturarCadernos(captura, ["2026-10-28"]).catch(() => {});
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from capturas where organization_id = ${fechado}`)[0]!.n).toBe(antes);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from cadernos_djen where organization_id = ${fechado}`)[0]!.n).toBe(0);
      // O aberto, com a mesma OAB, é consultado.
      await capturarDjen(captura, aberto, { de: "2026-10-28", ate: "2026-10-28" });
      expect(chamadas).toBeGreaterThan(0);
    });

    test("o token do conector MCP do escritório fechado deixa de valer", async () => {
      const r = await com(cookieAberto, "/mcp/tokens", { json: { nome: "Meu computador" } });
      expect(r.status).toBe(201);
      const { token } = (await r.json()) as { token: string };
      const chamar = () => app.request("/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) });
      expect((await chamar()).status).toBe(200);
      await t.owner`update organization set encerrado_em = now() where id = ${aberto}`;
      expect((await chamar()).status).toBe(401);
      await t.owner`update organization set encerrado_em = null where id = ${aberto}`;
    });
  });

  describe("a rotina que apaga de vez", () => {
    interface Cenario {
      org: string;
      pessoa: string;
      email: string;
    }
    const chaves = (org: string) => [`${org}/documento-1`, `${org}/certidoes/p1.pdf`, `${org}/exportacoes/e1/parte-1.zip`];
    const quantas = (org: string) => [...arquivos.arquivos.keys()].filter((k) => k.startsWith(`${org}/`)).length;
    /** Quantas linhas o escritório tem, somando todas as tabelas que têm organization_id (a lista não é escrita à mão, para não esquecer nenhuma). */
    const linhasDe = async (org: string) => {
      const tabelas = await t.owner<{ table_name: string }[]>`select table_name from information_schema.columns where table_schema = 'public' and column_name = 'organization_id'`;
      let total = 0;
      for (const { table_name } of tabelas) total += (await t.owner.unsafe<{ n: number }[]>(`select count(*)::int as n from "${table_name}" where organization_id = $1`, [org]))[0]!.n;
      return total;
    };
    const popular = async (org: string, pessoa: string, a: Armazenamento) => {
      const [c] = await t.owner<{ id: string }[]>`insert into clientes (organization_id, nome) values (${org}, 'Marina Duarte') returning id`;
      const [p] = await t.owner<{ id: string }[]>`insert into processos (organization_id, titulo, cliente_id) values (${org}, 'Marina Duarte × Alfa', ${c!.id}) returning id`;
      await t.owner`insert into documentos (id, organization_id, processo_id, nome, mime, tamanho, chave) values (${crypto.randomUUID()}, ${org}, ${p!.id}, 'laudo.pdf', 'application/pdf', 3, ${chaves(org)[0]!})`;
      await t.owner`insert into publicacoes (organization_id, id_externo, disponibilizada_em, publicada_em, texto, certidao) values (${org}, ${`ext-${org}`}, '2026-10-28', '2026-10-29', 'Intime-se.', ${chaves(org)[1]!})`;
      await t.owner`insert into exportacoes (organization_id, situacao, partes) values (${org}, 'pronta', ${JSON.stringify([{ n: 1, nome: "parte-1.zip", chave: chaves(org)[2], tamanho: 3 }])}::jsonb)`;
      await t.owner`insert into conversas (organization_id, user_id, titulo) values (${org}, ${pessoa}, 'Prazos da semana')`;
      await t.owner`insert into uso_ia (organization_id, user_id, metodo, origem, custo_usd, em) values (${org}, ${pessoa}, 'perguntar', 'tela', 0.01, now())`;
      await t.owner`insert into auditoria (organization_id, user_id, acao) values (${org}, ${pessoa}, 'login')`;
      for (const k of chaves(org)) await a.put(k, new Uint8Array([1, 2, 3]), "application/octet-stream");
    };
    const fechar = (org: string, diasAtras: number) => t.owner`update organization set encerrado_em = ${new Date(Date.now() - diasAtras * DIA_MS)} where id = ${org}`;

    let velho: Cenario; // fechado há 31 dias: sai
    let recente: Cenario; // fechado há 10 dias: fica
    let aberto: Cenario; // aberto: fica
    let compartilhado = ""; // membro do que sai e do que fica

    beforeAll(async () => {
      const criar = async (nome: string, slug: string, email: string): Promise<Cenario> => {
        const { organizationId, userId } = await novo(nome, slug, email, `Pessoa de ${nome}`);
        await popular(organizationId, userId, arquivos);
        return { org: organizationId, pessoa: userId, email };
      };
      velho = await criar("Velho Advogados", "velho", "dono@velho.adv.br");
      recente = await criar("Recente Advogados", "recente", "dono@recente.adv.br");
      aberto = await criar("Aberto Advogados", "aberto-2", "dono@aberto2.adv.br");
      await popular(demo.org, demo.pessoa, arquivos);
      compartilhado = (await novo("Compartilhado Advocacia", "compartilhado", "ze@compartilhado.adv.br", "Zé Compartilhado")).userId;
      await juntar(velho.org, compartilhado);
      await juntar(aberto.org, compartilhado);
      await fechar(velho.org, DIAS_ATE_APAGAR + 1);
      await fechar(recente.org, 10);
      await fechar(demo.org, 40);
    });

    test("apaga só o escritório que passou de 30 dias: linhas de todas as tabelas e todos os arquivos", async () => {
      expect(await linhasDe(velho.org)).toBeGreaterThan(8);
      expect(quantas(velho.org)).toBe(3);
      const antesRecente = await linhasDe(recente.org);
      const antesAberto = await linhasDe(aberto.org);
      const antesDemo = await linhasDe(demo.org);

      const r = await apagarEscritoriosEncerrados({ db: t.db, arquivos, log: () => {} });
      expect(r.falhas).toEqual([]);
      expect(r.apagados).toEqual([{ organizationId: velho.org, arquivos: 3, pessoas: 1 }]);

      expect(await linhasDe(velho.org)).toBe(0);
      expect(await t.owner`select 1 from organization where id = ${velho.org}`).toHaveLength(0);
      expect(quantas(velho.org)).toBe(0);
      // Os outros ficam exatamente como estavam, linhas e arquivos.
      for (const [c, antes] of [[recente, antesRecente], [aberto, antesAberto], [demo, antesDemo]] as const) {
        expect(await linhasDe(c.org)).toBe(antes);
        expect(quantas(c.org)).toBe(3);
        expect(await t.owner`select 1 from organization where id = ${c.org}`).toHaveLength(1);
      }
    });

    test("a demonstração fica mesmo marcada como fechada, e a rotina não encosta nela", async () => {
      expect(await encerradoEm(demo.org)).not.toBeNull();
      expect(await t.owner`select 1 from organization where slug = ${SLUG_DA_DEMONSTRACAO}`).toHaveLength(1);
      expect(quantas(demo.org)).toBe(3);
    });

    test("as pessoas: quem só era do escritório apagado sai de vez; quem é de outro escritório também fica", async () => {
      expect(await t.owner`select 1 from "user" where id = ${velho.pessoa}`).toHaveLength(0);
      expect(await t.owner`select 1 from account where user_id = ${velho.pessoa}`).toHaveLength(0);
      expect(await t.owner`select 1 from "user" where id = ${compartilhado}`).toHaveLength(1);
      expect(await t.owner`select 1 from member where user_id = ${compartilhado} and organization_id = ${aberto.org}`).toHaveLength(1);
      expect(await t.owner`select 1 from member where user_id = ${compartilhado} and organization_id = ${velho.org}`).toHaveLength(0);
      for (const c of [recente, aberto, demo]) expect(await t.owner`select 1 from "user" where id = ${c.pessoa}`).toHaveLength(1);
    });

    test("só ficam números sem identificação: o gasto com a IA e os eventos, sem o escritório", async () => {
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from uso_ia where organization_id is null and metodo = 'perguntar'`)[0]!.n).toBe(1);
      const nomes = (await t.owner<{ nome: string }[]>`select nome from eventos where organization_id is null and nome like 'escritorio_%' order by nome`).map((e) => e.nome);
      expect(nomes).toEqual(["escritorio_apagado"]);
    });

    test("rodar de novo não apaga mais nada; chegando o dia, o que estava fechado há 10 dias sai também", async () => {
      expect(await apagarEscritoriosEncerrados({ db: t.db, arquivos, log: () => {} })).toEqual({ apagados: [], falhas: [] });
      // No dia exato dos 30 dias, já sai (e meio segundo antes, não).
      const fechou = (await encerradoEm(recente.org))!;
      const justoAntes = await apagarEscritoriosEncerrados({ db: t.db, arquivos, log: () => {} }, new Date(fechou.getTime() + DIAS_ATE_APAGAR * DIA_MS - 500));
      expect(justoAntes.apagados).toEqual([]);
      const noDia = await apagarEscritoriosEncerrados({ db: t.db, arquivos, log: () => {} }, new Date(fechou.getTime() + DIAS_ATE_APAGAR * DIA_MS));
      expect(noDia.apagados.map((a) => a.organizationId)).toEqual([recente.org]);
      expect(await linhasDe(recente.org)).toBe(0);
      expect(quantas(recente.org)).toBe(0);
      expect(quantas(aberto.org)).toBe(3);
    });

    test("se os arquivos não saem, o escritório fica inteiro para a próxima rodada, e os outros seguem", async () => {
      const a = armazenamentoEmMemoria();
      const falho: Armazenamento = { ...a, apagarPrefixo: async (p) => (p.startsWith(`${aberto.org}/`) ? Promise.reject(new Error("R2 fora do ar")) : a.apagarPrefixo(p)) };
      const outro = await novo("Outro Velho", "outro-velho", "dono@outrovelho.adv.br", "Outro Velho");
      await fechar(outro.organizationId, 45);
      await fechar(aberto.org, 45);
      const r = await apagarEscritoriosEncerrados({ db: t.db, arquivos: falho, log: () => {} });
      expect(r.apagados.map((x) => x.organizationId)).toEqual([outro.organizationId]);
      expect(r.falhas).toEqual([{ organizationId: aberto.org, erro: "R2 fora do ar" }]);
      // Nada do escritório que falhou foi apagado: o banco e os arquivos continuam, para tentar de novo.
      expect(await t.owner`select 1 from organization where id = ${aberto.org}`).toHaveLength(1);
      expect(await linhasDe(aberto.org)).toBeGreaterThan(8);
      expect(quantas(aberto.org)).toBe(3);
      // Na rodada seguinte, com o armazenamento de volta, sai.
      const de_novo = await apagarEscritoriosEncerrados({ db: t.db, arquivos, log: () => {} });
      expect(de_novo.apagados.map((x) => x.organizationId)).toEqual([aberto.org]);
      expect(quantas(aberto.org)).toBe(0);
    });
  });
});
