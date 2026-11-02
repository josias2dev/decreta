/**
 * Prazo interno pela API: o sócio configura em dias úteis de antecedência, e o
 * interno aparece no prazo, em Hoje e na Agenda, contado no calendário de cada
 * processo. Hoje é segunda, 09/11/2026.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { withTenant } from "@decreta/db";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { resumoDaManha } from "../src/servicos/avisos.ts";
import { painelDoDia } from "../src/servicos/hoje.ts";

const SENHA = "senha-bem-longa-123";
const CNJ = "5004321-25.2026.8.24.0038";

describe.skipIf(!hasTestDatabase)("prazo interno", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let cookieDaEquipe = "";
  let orgId = "";
  let processoId = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (quem: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: quem }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  /** Um prazo com o fatal digitado: a conta não importa aqui, só a data de onde o interno volta. */
  const novoPrazo = async (tipo: string, fatal: string, processo = processoId) => (await json<{ id: string }>(chamar(cookie, "/prazos", { json: { processoId: processo, tipo, dias: 15, contagem: "uteis", publicadoEm: "2026-10-01", fimManual: fatal, responsavelId: null } }))).id;
  const configurar = (dias: number) => chamar(cookie, "/escritorio", { method: "PUT", json: { prazoInternoDias: dias } });
  const hoje = () => json(chamar(cookie, "/hoje"));
  const doDia = (painel: any, id: string) => painel.itens.filter((i: any) => i.id === id);

  beforeAll(async () => {
    setSystemTime(new Date("2026-11-09T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes", slug: "souza-interno", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: SENHA } }));
    const { userId: rafael } = await criarEscritorio(t.db, auth, { nome: "Rafael Lima", slug: "rafael-interno", dono: { email: "rafael@lima.adv.br", nome: "Rafael Lima", senha: SENHA } });
    await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${orgId}, ${rafael}, 'member')`;
    cookie = await entrar("beatriz@souza.adv.br");
    cookieDaEquipe = await entrar("rafael@lima.adv.br");
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: cookieDaEquipe, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    processoId = (await json<{ id: string }>(chamar(cookie, "/processos", { json: { cnj: CNJ, titulo: "Marina Duarte × Seguradora Alfa", comarca: "Joinville" } }))).id;
  });

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  describe("sem configurar", () => {
    test("nasce desligado: a configuração é zero e nenhuma tela mostra interno", async () => {
      expect((await json(chamar(cookie, "/escritorio"))).prazoInternoDias).toBe(0);
      const id = await novoPrazo("Sem interno", "2026-11-12");
      expect((await json(chamar(cookie, `/prazos/${id}`))).interno).toBeNull();
      expect(doDia(await hoje(), id)).toEqual([]);
      const agenda = await json(chamar(cookie, "/agenda?de=2026-11-09&ate=2026-11-15"));
      expect(agenda.dias.flatMap((d: any) => d.itens).filter((i: any) => i.id === id).map((i: any) => i.interno)).toEqual([undefined]);
    });
  });

  describe("a configuração", () => {
    test("só os sócios mudam, e fora da faixa não entra", async () => {
      const r = await chamar(cookieDaEquipe, "/escritorio", { method: "PUT", json: { prazoInternoDias: 2 } });
      expect(r.status).toBe(403);
      for (const invalido of [-1, 16, 1.5]) expect((await configurar(invalido)).status).toBe(400);
      expect((await json(chamar(cookie, "/escritorio"))).prazoInternoDias).toBe(0);
      expect((await configurar(3)).status).toBe(200);
      expect((await json(chamar(cookie, "/escritorio"))).prazoInternoDias).toBe(3);
    });
  });

  describe("com três dias úteis de antecedência", () => {
    let hojeId = "";
    let curtoId = "";
    let longeId = "";
    beforeAll(async () => {
      await configurar(3);
      hojeId = await novoPrazo("Interno hoje", "2026-11-12");
      curtoId = await novoPrazo("Prazo curto", "2026-11-10");
      longeId = await novoPrazo("Longe do interno", "2026-11-30");
    });

    test("na ficha do prazo: a data, a regra e, com o feriado no caminho, qual ficou de fora", async () => {
      expect((await json(chamar(cookie, `/prazos/${hojeId}`))).interno).toEqual({ dia: "2026-11-09", fatal: "2026-11-12", antecedencia: 3, regra: "3 dias úteis antes do fatal", passou: false, aviso: null });
      const longe = (await json(chamar(cookie, `/prazos/${longeId}`))).interno;
      expect(longe.dia).toBe("2026-11-25");
    });

    test("prazo muito curto: a ficha diz que o interno ficou antes de hoje", async () => {
      const interno = (await json(chamar(cookie, `/prazos/${curtoId}`))).interno;
      expect(interno.dia).toBe("2026-11-05");
      expect(interno.passou).toBe(true);
      expect(interno.aviso).toContain("Já passou: o interno era 05/11/2026.");
    });

    test("em Hoje: o interno do dia entra, com o fatal à vista, sem contar como prazo que vence hoje", async () => {
      const painel = await hoje();
      const [item] = doDia(painel, hojeId);
      expect(item).toMatchObject({ tipo: "prazo", urgencia: "breve", quando: "Interno hoje", titulo: "Interno hoje", cnj: CNJ, interno: { fatal: "2026-11-12", regra: "3 dias úteis antes do fatal", aviso: null } });
      expect(painel.contadores.vencemHoje).toBe(0);
    });

    test("em Hoje: o interno que já passou continua à vista, e diz o dia", async () => {
      const [item] = doDia(await hoje(), curtoId);
      expect(item.quando).toBe("Interno · 5 nov");
      expect(item.interno.aviso).toContain("Já passou");
    });

    test("em Hoje: o que ainda não chegou ao interno não aparece", async () => {
      expect(doDia(await hoje(), longeId)).toEqual([]);
    });

    test("em Hoje: fatal longe da semana entra também quando o interno chega", async () => {
      const daSemana = (p: any) => p.porResponsavel.reduce((n: number, r: any) => n + r.semana, 0);
      const antes = daSemana(await hoje());
      await configurar(14);
      const painel = await hoje();
      expect(doDia(painel, longeId)).toHaveLength(1);
      // Longe da semana: entra pelo interno, mas não conta nos números por responsável.
      expect(daSemana(painel)).toBe(antes);
      await configurar(3);
    });

    test("em Hoje: vence hoje ou venceu não repete a linha com o interno", async () => {
      const vencido = await novoPrazo("Já venceu", "2026-11-06");
      const venceHoje = await novoPrazo("Vence hoje", "2026-11-09");
      const painel = await hoje();
      expect(doDia(painel, vencido).map((i: any) => i.urgencia)).toEqual(["vencido"]);
      expect(doDia(painel, venceHoje).map((i: any) => i.urgencia)).toEqual(["hoje"]);
      expect(doDia(painel, venceHoje)[0].interno).toBeUndefined();
    });

    test("na Agenda: o prazo aparece no dia do interno e no do fatal, com a marca só no interno", async () => {
      const agenda = await json(chamar(cookie, "/agenda?de=2026-11-09&ate=2026-11-15"));
      const dia = (d: string) => agenda.dias.find((x: any) => x.dia === d)?.itens.filter((i: any) => i.id === hojeId) ?? [];
      expect(dia("2026-11-09")).toHaveLength(1);
      expect(dia("2026-11-09")[0]).toMatchObject({ tipo: "prazo", urgencia: "breve", interno: { fatal: "2026-11-12", regra: "3 dias úteis antes do fatal" } });
      expect(dia("2026-11-12")).toHaveLength(1);
      expect(dia("2026-11-12")[0].interno).toBeUndefined();
    });

    test("na Agenda: o interno aparece mesmo com o fatal fora do período pedido", async () => {
      const agenda = await json(chamar(cookie, "/agenda?de=2026-11-23&ate=2026-11-27"));
      const itens = agenda.dias.flatMap((d: any) => d.itens).filter((i: any) => i.id === longeId);
      expect(itens.map((i: any) => [i.interno.fatal])).toEqual([["2026-11-30"]]);
    });

    test("o calendário é o do processo: a suspensão da comarca empurra o interno", async () => {
      expect((await chamar(cookie, "/suspensoes", { json: { dia: "2026-11-11", motivo: "Ponte da comarca", tipo: "local", comarca: "Joinville" } })).status).toBe(201);
      const id = await novoPrazo("Com ponte", "2026-11-13");
      const interno = (await json(chamar(cookie, `/prazos/${id}`))).interno;
      // 12/11, 10/11 (11/11 é a ponte) e 09/11.
      expect(interno.dia).toBe("2026-11-09");
      expect(interno.regra).toBe("3 dias úteis antes do fatal, sem contar 11/11/2026 (Ponte da comarca)");
      expect(doDia(await hoje(), id).map((i: any) => i.quando)).toEqual(["Interno hoje"]);
      // Outro processo, sem comarca, conta sem a ponte.
      const semComarca = (await json<{ id: string }>(chamar(cookie, "/processos", { json: { tipo: "extrajudicial", titulo: "Sem comarca" } }))).id;
      const outro = await novoPrazo("Sem a ponte", "2026-11-13", semComarca);
      expect((await json(chamar(cookie, `/prazos/${outro}`))).interno.dia).toBe("2026-11-10");
    });

    test("prazo cumprido ou descartado sai de cena: sem interno na ficha, em Hoje e na Agenda", async () => {
      const id = await novoPrazo("Já feito", "2026-11-12");
      await chamar(cookie, `/prazos/${id}/cumprir`, { method: "POST" });
      expect((await json(chamar(cookie, `/prazos/${id}`))).interno).toBeNull();
      expect(doDia(await hoje(), id)).toEqual([]);
      const agenda = await json(chamar(cookie, "/agenda?de=2026-11-09&ate=2026-11-15"));
      expect(agenda.dias.flatMap((d: any) => d.itens).filter((i: any) => i.id === id)).toEqual([]);
    });

    test("o resumo da manhã continua falando só do que vence: o interno não entra como vencido, de hoje ou sem dono", async () => {
      const painel = await withTenant(t.db, orgId, (tx) => painelDoDia(t.db, tx, orgId, "2026-11-09", "America/Sao_Paulo"));
      expect(painel.itens.some((i) => i.interno)).toBe(true);
      const texto = resumoDaManha({ ...painel, auditoria: { itens: [], total: 0 } }, { id: "ninguem", apelido: "Bia" }, "https://decreta.local")!;
      expect(texto).not.toContain("Interno hoje");
    });
  });
});
