/**
 * Cadastro aberto (POST /api/cadastro): a pessoa, o escritório e a sessão
 * nascem de uma vez, sem convite; o onboarding fica pendente até a pessoa
 * concluir pelas telas.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { VERSAO_DOS_TERMOS } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer, type Email } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { slugDoNome } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { tetoDeSaida } from "../src/servicos/em-avaliacao.ts";
import { AVISOS, motivoParaBarrar, SEM_LIMITES } from "../src/servicos/uso-ia.ts";

describe("slug do nome do escritório", () => {
  test("sem acento, em minúsculas e com hífen; vazio vira 'escritorio'", () => {
    expect(slugDoNome("Souza & Mendes Advocacia")).toBe("souza-mendes-advocacia");
    expect(slugDoNome("  Dra. Beatriz Souza — Advocacia  ")).toBe("dra-beatriz-souza-advocacia");
    expect(slugDoNome("@@@")).toBe("escritorio");
    expect(slugDoNome("a".repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe("escritório em avaliação", () => {
  test("o teto de saída vale por escritório e para todos juntos, e volta depois de um dia", () => {
    let agora = 0;
    const teto = tetoDeSaida({ porEscritorio: 2, todos: 3 }, () => agora);
    expect([teto.permitir("a"), teto.permitir("a"), teto.permitir("a")]).toEqual([true, true, false]);
    expect([teto.permitir("b"), teto.permitir("c")]).toEqual([true, false]);
    agora = 24 * 60 * 60_000 + 1;
    expect(teto.permitir("c")).toBe(true);
  });

  test("a IA para no teto menor, e só para quem está em avaliação", () => {
    const limites = { ...SEM_LIMITES, demonstracao: { mensagensPorDia: 0, tetoUsd: 0.5 } };
    const uso = { mensagensNoMinuto: 0, mensagensHoje: 0, gastoPessoaUsd: 0.5, gastoEscritorioUsd: 0.5, gastoSiteUsd: 0.5 };
    expect(motivoParaBarrar(limites, uso, { demonstracao: false, emAvaliacao: true, mensagem: false })).toBe(AVISOS.emAvaliacao);
    expect(motivoParaBarrar(limites, uso, { demonstracao: false, emAvaliacao: false, mensagem: false })).toBeNull();
  });
});

describe.skipIf(!hasTestDatabase)("cadastro aberto", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const enviados: string[] = [];
  const convites: string[] = [];
  const emails: Email[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const beatriz = { nome: "Beatriz Souza", email: "Beatriz@Souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia" };

  // Com o aceite dos termos, que é o que a tela manda; o teste do aceite é o de termos.test.ts.
  const cadastrar = (json: object, ip = "203.0.113.7") =>
    app.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": ip }, body: JSON.stringify({ termos: VERSAO_DOS_TERMOS, ...json }) });
  const comSessao = (cookie: string, path: string, init: RequestInit = {}) => app.request(`/api/app${path}`, { ...init, headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie } });
  const cookieDe = (r: Response) => r.headers.get("set-cookie")?.split(";")[0] ?? "";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = async (r: Response | Promise<Response>): Promise<any> => (await r).json();

  beforeAll(async () => {
    t = await createTestDatabase();
    const mailer = {
      enabled: true,
      send: async (e: Email) => {
        emails.push(e);
        if (e.subject.startsWith("Convite")) convites.push(e.to);
      },
    };
    const auth = createAuth(t.db, env, { mailer });
    const wameow = {
      url: "http://wameow.local",
      token: "token-de-teste",
      fetch: (async (_url: string, init: RequestInit) => {
        enviados.push(String(init.body));
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch,
    };
    const rotas = createRotas({ db: t.db, auth, ia: null, wameow, arquivos: armazenamentoEmMemoria(), mailer, telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, emailLigado: true, log: () => {} });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("cria a pessoa como sócia, o escritório e a sessão; o onboarding fica pendente e o registro guarda a criação", async () => {
    const r = await cadastrar(beatriz);
    expect(r.status).toBe(201);
    const corpo = await json(r);
    expect(corpo).toMatchObject({ ok: true, escritorio: { slug: "souza-mendes-advocacia" } });
    const cookie = cookieDe(r);
    expect(cookie).toMatch(/^better-auth\.session_token=/);

    const eu = await json(comSessao(cookie, "/eu"));
    expect(eu.usuario).toMatchObject({ nome: "Beatriz Souza", apelido: "Beatriz", papel: "owner" });
    expect(eu.escritorio).toMatchObject({ nome: "Souza & Mendes Advocacia", pessoas: 1, onboarding: true });

    const [u] = await t.owner<{ email: string; email_verified: boolean }[]>`select email, email_verified from "user" where email = 'beatriz@souza.adv.br'`;
    // Quem se cadastra ainda não provou que o e-mail é dele: a conta funciona, e o e-mail fica por confirmar.
    expect(u).toMatchObject({ email: "beatriz@souza.adv.br", email_verified: false });
    expect(eu.usuario).toMatchObject({ email: "beatriz@souza.adv.br", emailConfirmado: false });
    const [esc] = await t.owner<{ tribunal: string; onboarding_concluido_em: Date | null }[]>`select tribunal, onboarding_concluido_em from escritorios where organization_id = ${corpo.escritorio.id}`;
    expect(esc).toMatchObject({ tribunal: "TJSC", onboarding_concluido_em: null });
    const registro = await t.owner<{ acao: string; detalhes: Record<string, unknown> }[]>`select acao, detalhes from auditoria where organization_id = ${corpo.escritorio.id} order by created_at`;
    expect(registro.map((x) => x.acao)).toEqual(["escritorio.criado", "login"]);
    expect(registro[0]!.detalhes).toMatchObject({ escritorio: "Souza & Mendes Advocacia", slug: "souza-mendes-advocacia" });
  });

  describe("confirmar o e-mail", () => {
    const pessoa = (nome: string) => ({ nome: nome[0]!.toUpperCase() + nome.slice(1), email: `${nome}@exemplo.adv.br`, senha: "senha-bem-longa-123", escritorio: `Escritório de ${nome}` });
    const linkPara = (email: string) => emails.findLast((e) => e.to === email && e.subject.startsWith("Confirme"))?.action?.url ?? "";
    /** O link do e-mail aponta para a API; o caminho é o que importa aqui. */
    const abrirLink = (url: string, cookie?: string) => {
      const u = new URL(url);
      return app.request(u.pathname + u.search, { headers: cookie ? { cookie } : {} });
    };
    const verificado = async (email: string) => (await t.owner<{ email_verified: boolean }[]>`select email_verified from "user" where email = ${email}`)[0]!.email_verified;
    const pedir = (cookie: string, path: string, json?: unknown) => app.request(`/api/auth${path}`, { method: json === undefined ? "GET" : "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: json === undefined ? undefined : JSON.stringify(json) });
    /** Uma sócia de verdade, confirmada, que convida. */
    const convidar = async (email: string) => {
      const socia = await cadastrar(pessoa(`socia${convites.length}`), "203.0.113.40");
      const dados = await json(socia);
      await t.owner`update "user" set email_verified = true where email = ${`socia${convites.length}@exemplo.adv.br`}`;
      const r = await pedir(cookieDe(socia), "/organization/invite-member", { email, role: "member" });
      expect(r.status).toBe(200);
      return { conviteId: (await json(r)).id as string, escritorio: dados.escritorio.id as string };
    };
    const membros = async (organizationId: string) => (await t.owner<{ n: number }[]>`select count(*)::int as n from member where organization_id = ${organizationId}`)[0]!.n;

    test("o cadastro manda o e-mail de confirmação, e o link confirma e volta para as telas", async () => {
      const r = await cadastrar(pessoa("carla"), "203.0.113.41");
      expect(r.status).toBe(201);
      const email = emails.findLast((e) => e.to === "carla@exemplo.adv.br")!;
      expect(email.subject).toBe("Confirme o seu e-mail no Decreta");
      expect(email.paragraphs.join(" ")).toContain("Se não foi você");
      expect(email.action?.url).toContain("/api/auth/verify-email?token=");
      const volta = await abrirLink(email.action!.url);
      expect(volta.status).toBe(302);
      expect(volta.headers.get("location")).toBe(`${env.WEB_ORIGIN}/hoje`);
      expect(await verificado("carla@exemplo.adv.br")).toBe(true);
      expect((await json(comSessao(cookieDe(r), "/eu"))).usuario.emailConfirmado).toBe(true);
    });

    test("sem confirmar, o uso normal segue: entra, configura e trabalha", async () => {
      const r = await cadastrar(pessoa("ivo"), "203.0.113.42");
      const cookie = cookieDe(r);
      expect((await comSessao(cookie, "/clientes", { method: "POST", body: JSON.stringify({ nome: "Marina Duarte" }) })).status).toBe(201);
      expect((await comSessao(cookie, "/escritorio/onboarding", { method: "POST" })).status).toBe(200);
      const login = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "ivo@exemplo.adv.br", password: "senha-bem-longa-123" }) });
      expect(login.status).toBe(200);
    });

    test("quem cadastrou o e-mail de outra pessoa não vê os convites dela nem entra na equipe", async () => {
      const vitima = "vitima@exemplo.adv.br";
      const intruso = await cadastrar({ ...pessoa("intruso"), email: vitima }, "203.0.113.43");
      const cookie = cookieDe(intruso);
      const { conviteId, escritorio } = await convidar(vitima);
      const antes = await membros(escritorio);

      expect((await pedir(cookie, "/organization/list-user-invitations")).status).toBe(403);
      expect((await pedir(cookie, `/organization/get-invitation?id=${conviteId}`)).status).toBe(403);
      const aceite = await pedir(cookie, "/organization/accept-invitation", { invitationId: conviteId });
      expect(aceite.status).toBe(403);
      expect((await json(aceite)).code).toBe("EMAIL_VERIFICATION_REQUIRED_BEFORE_ACCEPTING_OR_REJECTING_INVITATION");
      expect(await membros(escritorio)).toBe(antes);
    });

    test("confirmado, o mesmo convite vale", async () => {
      const r = await cadastrar(pessoa("lia"), "203.0.113.44");
      const cookie = cookieDe(r);
      const { conviteId, escritorio } = await convidar("lia@exemplo.adv.br");
      await abrirLink(linkPara("lia@exemplo.adv.br"));
      expect((await pedir(cookie, "/organization/list-user-invitations")).status).toBe(200);
      expect((await pedir(cookie, "/organization/accept-invitation", { invitationId: conviteId })).status).toBe(200);
      expect((await t.owner`select 1 from member m join "user" u on u.id = m.user_id where m.organization_id = ${escritorio} and u.email = 'lia@exemplo.adv.br'`).length).toBe(1);
    });

    test("quem chega pelo convite cria a conta, recebe o e-mail e só entra na equipe depois de confirmar", async () => {
      const email = "novo@exemplo.adv.br";
      const { conviteId, escritorio } = await convidar(email);
      const antes = emails.length;
      const r = await app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
        body: JSON.stringify({ email, password: "senha-bem-longa-123", name: "Novo Lima", termosVersao: VERSAO_DOS_TERMOS, callbackURL: `${env.WEB_ORIGIN}/convite/${conviteId}` }),
      });
      expect(r.status).toBe(200);
      const cookie = cookieDe(r);
      expect(emails.length).toBe(antes + 1);
      expect((await pedir(cookie, "/organization/accept-invitation", { invitationId: conviteId })).status).toBe(403);
      const volta = await abrirLink(linkPara(email));
      expect(volta.headers.get("location")).toBe(`${env.WEB_ORIGIN}/convite/${conviteId}`);
      expect((await pedir(cookie, "/organization/accept-invitation", { invitationId: conviteId })).status).toBe(200);
      expect((await t.owner`select 1 from member m join "user" u on u.id = m.user_id where m.organization_id = ${escritorio} and u.email = ${email}`).length).toBe(1);
    });

    test("dá para pedir o e-mail de novo; confirmado, não dá", async () => {
      const r = await cadastrar(pessoa("rui"), "203.0.113.45");
      const cookie = cookieDe(r);
      const antes = emails.filter((e) => e.to === "rui@exemplo.adv.br").length;
      expect((await pedir(cookie, "/send-verification-email", { email: "rui@exemplo.adv.br", callbackURL: `${env.WEB_ORIGIN}/hoje` })).status).toBe(200);
      expect(emails.filter((e) => e.to === "rui@exemplo.adv.br").length).toBe(antes + 1);
      await abrirLink(linkPara("rui@exemplo.adv.br"));
      expect((await pedir(cookie, "/send-verification-email", { email: "rui@exemplo.adv.br" })).status).toBe(400);
    });

    test("com o e-mail ligado, a tela do convite sabe que precisa pedir a confirmação", async () => {
      const { conviteId } = await convidar("com-email@exemplo.adv.br");
      expect((await json(app.request(`/api/convites/${conviteId}`))).confirmaEmail).toBe(true);
    });

    describe("com o e-mail desligado (sem RESEND_API_KEY)", () => {
      // O convite chega pelo link copiado na tela da Equipe, e nenhum e-mail de confirmação sairia.
      const appSemEmail = () => {
        const mailer = createLogMailer(() => {});
        const auth = createAuth(t.db, env, { mailer });
        const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer, telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
        return createApp({ db: t.db, env, auth, rotas, emailLigado: false, log: () => {} });
      };

      test("quem chega pelo convite cria a conta e entra na equipe, sem esperar uma confirmação que não chegaria", async () => {
        const semEmail = appSemEmail();
        const email = "convidada@exemplo.adv.br";
        const { conviteId, escritorio } = await convidar(email);
        expect((await json(semEmail.request(`/api/convites/${conviteId}`))).confirmaEmail).toBe(false);
        const conta = await semEmail.request("/api/auth/sign-up/email", {
          method: "POST",
          headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
          body: JSON.stringify({ email, password: "senha-bem-longa-123", name: "Convidada Lima", termosVersao: VERSAO_DOS_TERMOS, callbackURL: `${env.WEB_ORIGIN}/convite/${conviteId}` }),
        });
        expect(conta.status).toBe(200);
        const aceite = await semEmail.request("/api/auth/organization/accept-invitation", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: cookieDe(conta) }, body: JSON.stringify({ invitationId: conviteId }) });
        expect(aceite.status).toBe(200);
        expect((await t.owner`select 1 from member m join "user" u on u.id = m.user_id where m.organization_id = ${escritorio} and u.email = ${email}`).length).toBe(1);
      });

      test("a tela não pede para confirmar o e-mail, e a conta continua sem confirmar para quando o e-mail for ligado", async () => {
        const semEmail = appSemEmail();
        const r = await semEmail.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": "203.0.113.47" }, body: JSON.stringify({ termos: VERSAO_DOS_TERMOS, ...pessoa("bia") }) });
        expect(r.status).toBe(201);
        const eu = await json(semEmail.request("/api/app/eu", { headers: { origin: env.WEB_ORIGIN, cookie: cookieDe(r) } }));
        expect(eu.usuario.emailConfirmado).toBe(true);
        expect(await verificado("bia@exemplo.adv.br")).toBe(false);
      });
    });

    test("o e-mail que não saiu não atrapalha o cadastro", async () => {
      const falhando = createAuth(t.db, env, {
        mailer: {
          enabled: true,
          send: async () => {
            throw new Error("Resend fora do ar");
          },
        },
      });
      const outro = createApp({ db: t.db, env, auth: falhando, log: () => {} });
      const r = await outro.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": "203.0.113.46" }, body: JSON.stringify({ termos: VERSAO_DOS_TERMOS, ...pessoa("ana") }) });
      expect(r.status).toBe(201);
    });

    test("o que a equipe cria pelo script continua confirmado, e a senha de quem já tinha conta é trocada", async () => {
      const [dono] = await t.owner<{ email_verified: boolean }[]>`select email_verified from "user" where email = 'beatriz@souza.adv.br'`;
      expect(dono!.email_verified).toBe(false);
      const script = async (slug: string, email: string, senha: string) => {
        const p = Bun.spawn([process.execPath, "apps/api/src/scripts/criar-escritorio.ts", "--nome", `Escritório ${slug}`, "--slug", slug, "--email", email, "--pessoa", "Pessoa da Equipe", "--senha", senha], {
          env: { ...process.env, DATABASE_URL: t.appUrl, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET, BETTER_AUTH_URL: env.BETTER_AUTH_URL, WEB_ORIGIN: env.WEB_ORIGIN },
          stdout: "pipe",
          stderr: "pipe",
        });
        const [saida, erro] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text()]);
        expect(`${await p.exited} ${erro}`).toBe("0 ");
        return saida;
      };
      const entrar = (email: string, password: string) => app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password }) });

      expect(await script("feito-pela-equipe", "equipe@exemplo.adv.br", "senha-da-equipe-123")).not.toContain("já tinha conta");
      expect(await verificado("equipe@exemplo.adv.br")).toBe(true);

      // Alguém se cadastrou antes com o e-mail da pessoa: a senha dele não pode continuar valendo.
      const intruso = await cadastrar({ ...pessoa("antes"), email: "dona@exemplo.adv.br", senha: "senha-do-intruso-123" }, "203.0.113.47");
      const cookieDoIntruso = cookieDe(intruso);
      const saida = await script("da-dona", "dona@exemplo.adv.br", "senha-entregue-pela-equipe");
      expect(saida).toContain("já tinha conta");
      expect((await entrar("dona@exemplo.adv.br", "senha-do-intruso-123")).status).toBe(401);
      expect((await entrar("dona@exemplo.adv.br", "senha-entregue-pela-equipe")).status).toBe(200);
      expect((await comSessao(cookieDoIntruso, "/eu")).status).toBe(401);
      expect(await verificado("dona@exemplo.adv.br")).toBe(true);
    }, 60_000);
  });

  test("e-mail já cadastrado: 409 sem criar outro escritório", async () => {
    const r = await cadastrar({ ...beatriz, email: "BEATRIZ@souza.adv.br", escritorio: "Outro Escritório" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ erro: "email_em_uso", detalhe: "Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova." });
    expect((await t.owner<{ n: number }[]>`select count(*)::int as n from organization where slug like 'outro%'`)[0]!.n).toBe(0);
  });

  test("mesmo nome de escritório: o endereço ganha um sufixo", async () => {
    const r = await cadastrar({ nome: "Carla Mendes", email: "carla@mendes.adv.br", senha: "outra-senha-longa-456", escritorio: "Souza & Mendes Advocacia" });
    expect(r.status).toBe(201);
    expect((await json(r)).escritorio.slug).toBe("souza-mendes-advocacia-2");
  });

  test("dados inválidos: senha curta, e-mail torto ou escritório sem nome dão 400", async () => {
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", senha: "curta" })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "sem-arroba" })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", escritorio: " " })).status).toBe(400);
    expect((await cadastrar({ ...beatriz, email: "nova@souza.adv.br", nome: "B" })).status).toBe(400);
  });

  test("concluir o onboarding: /eu deixa de dizer pendente", async () => {
    const r = await cadastrar({ nome: "Diego Freitas", email: "diego@freitas.adv.br", senha: "senha-do-diego-789", escritorio: "Freitas Advogados" });
    const cookie = cookieDe(r);
    expect((await json(comSessao(cookie, "/eu"))).escritorio.onboarding).toBe(true);
    expect((await comSessao(cookie, "/escritorio/onboarding", { method: "POST" })).status).toBe(200);
    expect((await json(comSessao(cookie, "/eu"))).escritorio.onboarding).toBe(false);
  });

  test("pedido de formulário de outro site não cria conta nem abre sessão", async () => {
    const r = await app.request("/api/cadastro", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://site-de-fora.example", "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({ nome: "Gil Prado", email: "gil@prado.adv.br", senha: "senha-do-gil-12345", escritorio: "Prado Advocacia" }),
    });
    expect(r.status).toBe(403);
    expect(r.headers.get("set-cookie")).toBeNull();
    expect((await t.owner<{ n: number }[]>`select count(*)::int as n from "user" where email = 'gil@prado.adv.br'`)[0]!.n).toBe(0);
  });

  test("corpo grande demais recebe 413; senha acima de 128 caracteres, 400", async () => {
    const grande = await app.request("/api/cadastro", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": "203.0.113.21" }, body: JSON.stringify({ nome: "x".repeat(20_000) }) });
    expect(grande.status).toBe(413);
    expect((await cadastrar({ ...beatriz, email: "longa@souza.adv.br", senha: "s".repeat(129) }, "203.0.113.21")).status).toBe(400);
  });

  test("em avaliação, o WhatsApp do Decreta para no teto do dia e volta quando o escritório é liberado", async () => {
    const r = await cadastrar({ nome: "Helena Dias", email: "helena@dias.adv.br", senha: "senha-da-helena-123", escritorio: "Dias Advocacia" }, "203.0.113.30");
    const cookie = cookieDe(r);
    const orgId = (await json(r)).escritorio.id as string;
    const eu = await json(comSessao(cookie, "/eu"));
    expect((await comSessao(cookie, `/equipe/${eu.usuario.id}`, { method: "PUT", body: JSON.stringify({ whatsapp: "(47) 99123-4567" }) })).status).toBe(200);
    const antes = enviados.length;
    for (let i = 0; i < 10; i++) expect((await comSessao(cookie, "/avisos/teste", { method: "POST" })).status).toBe(200);
    const barrado = await comSessao(cookie, "/avisos/teste", { method: "POST" });
    expect(barrado.status).toBe(429);
    expect((await json(barrado)).erro).toBe("teto_em_avaliacao");
    expect(enviados.length - antes).toBe(10);

    await t.owner`update organization set em_avaliacao = false where id = ${orgId}`;
    expect((await comSessao(cookie, "/avisos/teste", { method: "POST" })).status).toBe(200);
  });

  test("em avaliação, os convites por e-mail param no teto do dia", async () => {
    const r = await cadastrar({ nome: "Igor Lima", email: "igor@lima.adv.br", senha: "senha-do-igor-1234", escritorio: "Lima Advocacia" }, "203.0.113.31");
    const cookie = cookieDe(r);
    const convidar = (i: number) => app.request("/api/auth/organization/invite-member", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: JSON.stringify({ email: `pessoa${i}@exemplo.adv.br`, role: "member" }) });
    const antes = convites.length;
    for (let i = 0; i < 5; i++) expect((await convidar(i)).status).toBe(200);
    expect((await convidar(5)).status).toBe(429);
    expect(convites.length - antes).toBe(5);
  });

  test("limite por endereço: o 11º pedido na hora recebe 429", async () => {
    for (let i = 0; i < 10; i++) expect((await cadastrar({}, "203.0.113.99")).status).toBe(400);
    const r = await cadastrar({ nome: "Elisa Ramos", email: "elisa@ramos.adv.br", senha: "senha-da-elisa-000", escritorio: "Ramos Advocacia" }, "203.0.113.99");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("3600");
  });
});
