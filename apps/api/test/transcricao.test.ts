/**
 * Áudio vira texto (Fase 5.6): o áudio do atendimento vai à rota de transcrição
 * do gateway, o gasto fica anotado e o cliente que recusou a IA fica de fora.
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
import { iaFalsa } from "./ia-falsa.ts";

describe.skipIf(!hasTestDatabase)("áudio do atendimento vira texto", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const enviar = (campos: Record<string, string | File>) => {
    const form = new FormData();
    for (const [k, v] of Object.entries(campos)) form.append(k, v);
    return app.request("/api/app/ia/transcrever", { method: "POST", headers: { origin: env.WEB_ORIGIN, cookie }, body: form });
  };
  const audio = () => new File([new Uint8Array([1, 2, 3, 4])], "atendimento.ogg", { type: "audio/ogg" });

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    }));
    const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("o áudio volta como texto, e o gasto da transcrição fica anotado", async () => {
    ia.transcricao = "A cliente contou que a seguradora negou o pagamento em março e pediu a revisão.";
    const r = await enviar({ audio: audio() });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ texto: ia.transcricao });
    const uso = await t.owner<{ metodo: string; origem: string }[]>`select metodo, origem from uso_ia where organization_id = ${orgId}`;
    expect(uso).toContainEqual({ metodo: "transcription", origem: "tela" });
  });

  test("áudio sem fala: avisa em vez de devolver texto vazio", async () => {
    ia.transcricao = "";
    const r = await enviar({ audio: audio() });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { detalhe: string }).detalhe).toBe("Não deu para ouvir fala neste áudio. Confira a gravação ou escreva o resumo.");
  });

  test("cliente que recusou a IA: o áudio nem vai ao gateway", async () => {
    const [c] = await t.owner`insert into clientes (organization_id, nome, sem_ia) values (${orgId}, 'Paula Ramos', true) returning id`;
    const chamadas = ia.chamadas.length;
    const r = await enviar({ audio: audio(), clienteId: c!.id as string });
    expect(r.status).toBe(403);
    expect(ia.chamadas.length).toBe(chamadas);
  });

  test("sem arquivo de áudio: pedido errado", async () => {
    expect((await enviar({ clienteId: "x" })).status).toBe(400);
  });
});
