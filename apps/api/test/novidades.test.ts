/** As novidades na demonstração (sentença lida, modelos, pasta conferida, retorno), sem mudar o Hoje. */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";

describe.skipIf(!hasTestDatabase)("novidades na demonstração", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  const arquivos = armazenamentoEmMemoria();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const get = async (path: string) => {
    const r = await app.request(`/api/app${path}`, { headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(r.status).toBe(200);
    return (await r.json()) as any;
  };

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@demo.decreta.app", password: "demonstracao-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("o Hoje continua o do design", async () => {
    const h = await get("/hoje");
    expect(h.contadores).toMatchObject({ vencidos: 1, vencemHoje: 3, publicacoesNovas: 7, audienciasHoje: 2 });
  });

  test("a sentença da Lúcia chega lida pedido a pedido, esperando a confirmação", async () => {
    const caixa = await get("/publicacoes");
    const item = caixa.itens.find((i: { partes: string; titulo: string }) => i.partes.startsWith("Lúcia Matos") && /senten/i.test(i.titulo));
    const pub = await get(`/publicacoes/${item.id}`);
    expect(pub.decisao).toBe(true);
    expect(pub.sentenca).toMatchObject({ situacao: "pronto", desatualizada: false });
    expect(pub.sentenca.conteudo.resultado).toBe("parcialmente_procedente");
    expect(pub.sentenca.conteudo.pedidos).toHaveLength(3);
    expect(pub.resultado).toBeNull();
  });

  test("dois modelos, e o do laudo aparece para o prazo da Marina", async () => {
    const lista = await get("/modelos");
    expect(lista.total).toBe(2);
    const prazos = await get("/prazos?quando=abertos");
    const marina = prazos.itens.find((i: { tipo: string }) => i.tipo === "Manifestação sobre laudo pericial");
    const prep = await get(`/pecas/preparar?prazo=${marina.id}`);
    expect(prep.modelos.map((m: { titulo: string }) => m.titulo)).toContain("Manifestação sobre laudo · invalidez no seguro de vida");
  });

  test("a pasta do José Antunes tem os documentos e a conferência em dia", async () => {
    const negocios = await get("/negocios?etapa=todos");
    const jose = negocios.itens.find((n: { nome: string }) => n.nome === "José Antunes");
    const pasta = await get(`/negocios/${jose.id}/pasta`);
    expect(pasta.documentos).toHaveLength(3);
    expect(pasta.documentos.every((d: { lido: boolean }) => d.lido)).toBe(true);
    expect(pasta.conferencia).toMatchObject({ situacao: "pronto", desatualizada: false, fonte: "3 documentos · 29/10/2026" });
    const r = await app.request(`/api/app/documentos/${pasta.documentos[0].id}/arquivo`, { headers: { cookie, origin: env.WEB_ORIGIN } });
    expect(r.status).toBe(200);
  });

  test("os sócios veem o retorno da equipe sobre a IA", async () => {
    const r = await get("/ia/retornos");
    expect(r.porAcao.map((a: { acao: string }) => a.acao).sort()).toEqual(["briefing-prazo", "ler-sentenca", "preparar-audiencia", "resumo-autos"]);
    expect(r.errados).toHaveLength(1);
    expect(r.errados[0]).toMatchObject({ rotulo: "Preparação de audiência", pessoa: { apelido: "Tiago" }, onde: { tipo: "audiencia" } });
  });
});
