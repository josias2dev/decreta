/**
 * Medição do funil: o site manda três eventos por uma rota aberta (lista
 * fechada, limite por endereço, nada de pessoa), o servidor marca os passos do
 * escritório uma vez só, e a contagem sai por dia, no fuso do Brasil.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { VERSAO_DOS_TERMOS } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { contarEventos } from "../src/eventos.ts";
import { createRotas } from "../src/rotas/index.ts";

describe.skipIf(!hasTestDatabase)("funil de eventos", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const eventoDoSite = (corpo: unknown, ip = "198.51.100.10") =>
    app.request("/api/eventos", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": ip }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) });
  const doSite = async (nome: string) => (await t.owner<{ n: number }[]>`select count(*)::int as n from eventos where nome = ${nome} and organization_id is null`)[0]!.n;
  const doEscritorio = async (orgId: string) => (await t.owner<{ nome: string }[]>`select nome from eventos where organization_id = ${orgId} order by nome`).map((e) => e.nome);
  const com = (cookie: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env, { mailer: { enabled: true, send: async () => {} } });
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("o que o site manda, sem login", () => {
    test("os três nomes entram, sem escritório e sem cookie", async () => {
      for (const nome of ["visita", "clicou_demonstracao", "clicou_criar_conta"]) {
        const r = await eventoDoSite({ nome });
        expect(r.status).toBe(204);
        expect(r.headers.get("set-cookie")).toBeNull();
        expect(await doSite(nome)).toBe(1);
      }
      // A mesma visita pode se repetir: é uma contagem, não uma pessoa.
      expect((await eventoDoSite({ nome: "visita" })).status).toBe(204);
      expect(await doSite("visita")).toBe(2);
    });

    test("nada de pessoa fica gravado: só id, nome, escritório e instante, e o endereço de quem mandou não aparece", async () => {
      await eventoDoSite({ nome: "visita", email: "alguem@exemplo.com", nomeDaPessoa: "Fulano" }, "203.0.113.77");
      const linhas = await t.owner<Record<string, unknown>[]>`select * from eventos`;
      expect(new Set(linhas.flatMap((l) => Object.keys(l)))).toEqual(new Set(["id", "nome", "organization_id", "em"]));
      expect(JSON.stringify(linhas)).not.toContain("203.0.113.77");
      expect(JSON.stringify(linhas)).not.toContain("alguem@exemplo.com");
    });

    test("nome fora da lista, nome do servidor, corpo torto ou grande demais são recusados e não gravam nada", async () => {
      const antes = (await t.owner<{ n: number }[]>`select count(*)::int as n from eventos`)[0]!.n;
      for (const corpo of [{ nome: "qualquer_coisa" }, { nome: "cadastro_concluido" }, { nome: "escritorio_apagado" }, { nome: 1 }, {}, "não é json", "[]"]) expect((await eventoDoSite(corpo)).status).toBe(400);
      expect((await eventoDoSite({ nome: "visita", lixo: "x".repeat(5000) })).status).toBe(413);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from eventos`)[0]!.n).toBe(antes);
    });

    test("formulário de outro site não conta", async () => {
      const r = await app.request("/api/eventos", { method: "POST", headers: { "content-type": "text/plain", origin: "https://site-de-fora.example", "x-forwarded-for": "203.0.113.88" }, body: JSON.stringify({ nome: "visita" }) });
      expect(r.status).toBe(403);
    });

    test("limite por endereço: o 31º pedido no minuto recebe 429, e outro endereço segue livre", async () => {
      const ip = "203.0.113.99";
      for (let i = 0; i < 30; i++) expect((await eventoDoSite({ nome: "visita" }, ip)).status).toBe(204);
      const barrado = await eventoDoSite({ nome: "visita" }, ip);
      expect(barrado.status).toBe(429);
      expect(barrado.headers.get("retry-after")).toBe("60");
      expect((await eventoDoSite({ nome: "visita" }, "203.0.113.100")).status).toBe(204);
    });
  });

  describe("o que o servidor marca de cada escritório", () => {
    let cookie = "";
    let orgId = "";
    let userId = "";
    let processoId = "";

    test("o cadastro aberto marca cadastro_concluido", async () => {
      const r = await app.request("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, "x-forwarded-for": "198.51.100.20" },
        body: JSON.stringify({ nome: "Beatriz Souza", email: "beatriz@souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia", termos: VERSAO_DOS_TERMOS }),
      });
      expect(r.status).toBe(201);
      cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      orgId = ((await r.json()) as { escritorio: { id: string } }).escritorio.id;
      expect(await doEscritorio(orgId)).toEqual(["cadastro_concluido"]);
      userId = ((await (await com(cookie, "/eu")).json()) as { usuario: { id: string } }).usuario.id;
    });

    test("a primeira OAB cadastrada marca oab_cadastrada, uma vez só", async () => {
      expect((await com(cookie, `/equipe/${userId}`, { method: "PUT", json: { cargo: "Advogada" } })).status).toBe(200);
      expect(await doEscritorio(orgId)).toEqual(["cadastro_concluido"]);
      expect((await com(cookie, `/equipe/${userId}`, { method: "PUT", json: { oabNumero: "41233", oabUf: "SC" } })).status).toBe(200);
      expect(await doEscritorio(orgId)).toEqual(["cadastro_concluido", "oab_cadastrada"]);
      expect((await com(cookie, `/equipe/${userId}`, { method: "PUT", json: { oabNumero: "41234", oabUf: "SC" } })).status).toBe(200);
      expect(await doEscritorio(orgId)).toEqual(["cadastro_concluido", "oab_cadastrada"]);
    });

    test("a primeira publicação (colada à mão) marca primeira_publicacao, uma vez só", async () => {
      const proc = await com(cookie, "/processos", { json: { cnj: "50043212520268240038", poloCliente: "ativo", partes: [{ nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true }] } });
      expect(proc.status).toBe(201);
      processoId = ((await proc.json()) as { id: string }).id;
      const publicar = () => com(cookie, "/publicacoes", { json: { processoId, disponibilizadaEm: "2026-10-28", texto: "Intimem-se as partes para manifestação sobre o laudo pericial, no prazo de 15 dias." } });
      expect((await publicar()).status).toBe(201);
      expect(await doEscritorio(orgId)).toContain("primeira_publicacao");
      expect((await publicar()).status).toBe(201);
      expect((await doEscritorio(orgId)).filter((n) => n === "primeira_publicacao")).toHaveLength(1);
    });

    test("o primeiro prazo confirmado marca primeiro_prazo_confirmado, uma vez só", async () => {
      const lista = (await (await com(cookie, "/publicacoes?situacao=nova")).json()) as { itens: { id: string }[] };
      const [a, b] = lista.itens;
      const confirmar = (id: string) => com(cookie, `/publicacoes/${id}/confirmar`, { json: { tipo: "Manifestação sobre laudo pericial", dias: 15, contagem: "uteis" } });
      expect((await confirmar(a!.id)).status).toBe(200);
      expect(await doEscritorio(orgId)).toEqual(["cadastro_concluido", "oab_cadastrada", "primeira_publicacao", "primeiro_prazo_confirmado"]);
      expect((await confirmar(b!.id)).status).toBe(200);
      expect((await doEscritorio(orgId)).filter((n) => n === "primeiro_prazo_confirmado")).toHaveLength(1);
    });

    test("a demonstração não entra no funil", async () => {
      const auth = createAuth(t.db, env);
      const { organizationId, userId: dono } = await criarEscritorio(t.db, auth, { nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, dono: { email: "teste@decreta.site", nome: "Sócia da Demonstração", senha: "senha-bem-longa-123" } });
      const c = await entrar("teste@decreta.site");
      expect((await com(c, `/equipe/${dono}`, { method: "PUT", json: { oabNumero: "41233", oabUf: "SC" } })).status).toBe(200);
      expect(await doEscritorio(organizationId)).toEqual([]);
    });
  });

  describe("a contagem do período", () => {
    test("cada dia vai do primeiro minuto ao último, no fuso de São Paulo, de todos os escritórios", async () => {
      await t.owner`delete from eventos`;
      const org = (await t.owner<{ id: string }[]>`select id from organization limit 1`)[0]!.id;
      // 31/10 às 23:30 (02:30 UTC de 01/11), 01/11 às 00:10 e às 23:59, 02/11 às 00:00.
      await t.owner`insert into eventos (nome, em) values ('visita', '2026-11-01T02:30:00Z'), ('visita', '2026-11-01T03:10:00Z'), ('visita', '2026-11-02T02:59:00Z'), ('visita', '2026-11-02T03:00:00Z'), ('clicou_criar_conta', '2026-11-01T15:00:00Z')`;
      await t.owner`insert into eventos (nome, organization_id, em) values ('cadastro_concluido', ${org}, '2026-11-01T18:00:00Z')`;
      expect(await contarEventos(t.db, "2026-11-01", "2026-11-01")).toEqual({ visita: 2, clicou_criar_conta: 1, cadastro_concluido: 1 });
      expect(await contarEventos(t.db, "2026-10-31", "2026-11-02")).toEqual({ visita: 4, clicou_criar_conta: 1, cadastro_concluido: 1 });
      expect(await contarEventos(t.db, "2026-12-01", "2026-12-31")).toEqual({});
    });
  });
});
