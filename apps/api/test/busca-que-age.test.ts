/**
 * A busca do menu (⌘K) também age: além de processos e clientes, traz os prazos
 * que esperam confirmação, sempre os do próprio escritório.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";

const SENHA = "senha-bem-longa-123";
const CNJ = "5004321-25.2026.8.24.0038";

describe.skipIf(!hasTestDatabase)("a busca que também age", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let cookieDeOutro = "";
  let orgId = "";
  let processoId = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (quem: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: quem }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const entrar = async (email: string) => (await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) })).headers.get("set-cookie")?.split(";")[0] ?? "";
  const buscar = (q: string, quem = cookie) => json(chamar(quem, `/busca?q=${encodeURIComponent(q)}`));
  /** Um prazo sugerido pela IA, que ainda espera alguém confirmar. */
  const sugerido = async (org: string, processo: string, tipo: string, fim: string, situacao = "aberto") => (await t.owner<{ id: string }[]>`insert into prazos (organization_id, processo_id, tipo, dias, publicado_em, inicio, fim, origem, situacao) values (${org}, ${processo}, ${tipo}, 15, '2026-10-29', '2026-10-30', ${fim}, 'ia', ${situacao}) returning id`)[0]!.id;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes", slug: "souza-busca", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: SENHA } }));
    const { organizationId: outra } = await criarEscritorio(t.db, auth, { nome: "Outro", slug: "outro-busca", dono: { email: "tiago@outro.adv.br", nome: "Tiago", senha: SENHA } });
    cookie = await entrar("beatriz@souza.adv.br");
    cookieDeOutro = await entrar("tiago@outro.adv.br");
    processoId = (await json<{ id: string }>(chamar(cookie, "/processos", { json: { cnj: CNJ, titulo: "Marina Duarte × Seguradora Alfa" } }))).id;
    const doOutro = (await t.owner<{ id: string }[]>`insert into processos (organization_id, titulo) values (${outra}, 'Hotel Mar Azul') returning id`)[0]!.id;
    await sugerido(outra, doOutro, "Manifestação do outro escritório", "2026-11-01");
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("sem termo: os prazos a confirmar mais próximos, e nada de processos nem clientes", async () => {
    const b = await buscar("");
    expect(b.processos).toEqual([]);
    expect(b.clientes).toEqual([]);
    expect(b.prazos).toEqual([]);
    const tarde = await sugerido(orgId, processoId, "Réplica", "2026-12-10");
    const cedo = await sugerido(orgId, processoId, "Contestação", "2026-11-10");
    expect((await buscar("")).prazos).toEqual([
      { id: cedo, tipo: "Contestação", fim: "2026-11-10", processo: { id: processoId, titulo: "Marina Duarte × Seguradora Alfa" } },
      { id: tarde, tipo: "Réplica", fim: "2026-12-10", processo: { id: processoId, titulo: "Marina Duarte × Seguradora Alfa" } },
    ]);
  });

  test("com termo: acha pelo que fazer, pelas partes e pelo número, sem acento e sem pontuação", async () => {
    expect((await buscar("contestacao")).prazos.map((p: any) => p.tipo)).toEqual(["Contestação"]);
    expect((await buscar("marina")).prazos.map((p: any) => p.tipo)).toEqual(["Contestação", "Réplica"]);
    expect((await buscar("50043212520")).prazos).toHaveLength(2);
    expect((await buscar("sem-nada-disso")).prazos).toEqual([]);
    expect((await buscar("marina")).processos.map((p: any) => p.id)).toEqual([processoId]);
  });

  test("os processos vêm com o tipo, para a tela distinguir o que não tem número", async () => {
    expect((await buscar("marina")).processos[0]).toMatchObject({ id: processoId, tipo: "judicial", cnj: CNJ });
  });

  test("prazo confirmado, cumprido ou descartado não espera ninguém", async () => {
    const cumprido = await sugerido(orgId, processoId, "Já cumprido", "2026-11-11", "cumprido");
    const descartado = await sugerido(orgId, processoId, "Já descartado", "2026-11-11", "descartado");
    const ids = (await buscar("")).prazos.map((p: any) => p.id);
    expect(ids).not.toContain(cumprido);
    expect(ids).not.toContain(descartado);
    const manual = (await json<{ id: string }>(chamar(cookie, "/prazos", { json: { processoId, tipo: "Prazo manual", dias: 5, contagem: "uteis", publicadoEm: "2026-10-29" } }))).id;
    expect((await buscar("")).prazos.map((p: any) => p.id)).not.toContain(manual);
  });

  test("confirmado pelo mesmo caminho do botão, sai da lista", async () => {
    const id = await sugerido(orgId, processoId, "Para confirmar", "2026-11-05");
    expect((await buscar("")).prazos[0].id).toBe(id);
    expect((await chamar(cookie, `/prazos/${id}/confirmar`, { method: "POST" })).status).toBe(200);
    expect((await buscar("")).prazos.map((p: any) => p.id)).not.toContain(id);
  });

  test("no máximo cinco, os mais próximos", async () => {
    for (let i = 1; i <= 7; i++) await sugerido(orgId, processoId, `Prazo ${i}`, `2026-11-2${i}`);
    expect((await buscar("")).prazos).toHaveLength(5);
  });

  test("cada escritório só vê os seus", async () => {
    expect((await buscar("", cookieDeOutro)).prazos.map((p: any) => p.tipo)).toEqual(["Manifestação do outro escritório"]);
    expect((await buscar("marina", cookieDeOutro)).prazos).toEqual([]);
    expect((await buscar("outro escritorio")).prazos).toEqual([]);
  });
});
