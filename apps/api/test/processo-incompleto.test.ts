/**
 * Salvar o processo sem o número: fica marcado como incompleto e não monitorado,
 * e o Decreta oferece achar o número nas publicações que já leu. Com o número salvo,
 * o monitoramento começa e as publicações daquele número se ligam ao processo.
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
import type { Pedido } from "../src/rotas/base.ts";
import { createRotas } from "../src/rotas/index.ts";

const SENHA = "senha-bem-longa-123";
const CNJ_A = "5004321-25.2026.8.24.0038";
const CNJ_B = "5009876-57.2025.8.24.0038";
const CNJ_C = "0000812-61.2026.5.12.0005";

describe.skipIf(!hasTestDatabase)("processo sem número", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let cookieDeOutro = "";
  let orgId = "";
  let outroOrgId = "";
  const pedidos: Pedido[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (quem: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: quem }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const entrar = async (email: string) => (await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) })).headers.get("set-cookie")?.split(";")[0] ?? "";
  const semNumero = async (titulo: string, partes: { nome: string; polo: string; cliente?: boolean }[] = []) => (await json<{ id: string }>(chamar(cookie, "/processos", { json: { cnj: null, titulo, partes } }))).id;
  /** Uma publicação que a captura leu pela OAB e não ligou a processo nenhum. */
  const publicacao = async (idExterno: string, cnj: string | null, destinatarios: { nome: string }[], texto = "Intime-se.", dia = "2026-10-20") =>
    (await t.owner<{ id: string }[]>`insert into publicacoes (organization_id, id_externo, disponibilizada_em, publicada_em, texto, cnj, tribunal, orgao, destinatarios) values (${orgId}, ${idExterno}, ${dia}, ${dia}, ${texto}, ${cnj}, 'TJSC', '2ª Vara Cível de Joinville', ${JSON.stringify(destinatarios)}::jsonb) returning id`)[0]!.id;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async (p) => void pedidos.push(p), log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes", slug: "souza-incompleto", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: SENHA } }));
    ({ organizationId: outroOrgId } = await criarEscritorio(t.db, auth, { nome: "Outro", slug: "outro-incompleto", dono: { email: "tiago@outro.adv.br", nome: "Tiago", senha: SENHA } }));
    cookie = await entrar("beatriz@souza.adv.br");
    cookieDeOutro = await entrar("tiago@outro.adv.br");
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("salva sem o número, sem pedir o DataJud, e a ficha diz o que falta e que não monitora", async () => {
    pedidos.length = 0;
    const id = await semNumero("Marina Duarte × Seguradora Alfa", [{ nome: "Marina Duarte", polo: "ativo" }, { nome: "Seguradora Alfa", polo: "passivo" }]);
    const p = await json(chamar(cookie, `/processos/${id}`));
    expect(p.cnj).toBeNull();
    expect(p.tipo).toBe("judicial");
    expect(p.incompleto).toEqual({ faltam: ["o número", "o cliente", "a vara"], monitorado: false });
    expect(pedidos).toEqual([]);
  });

  test("processo com número e caso extrajudicial não ficam marcados", async () => {
    const comNumero = (await json(chamar(cookie, "/processos", { json: { cnj: CNJ_C, titulo: "Com número" } }))).id;
    const extrajudicial = (await json(chamar(cookie, "/processos", { json: { tipo: "extrajudicial", titulo: "Revisão do contrato" } }))).id;
    expect((await json(chamar(cookie, `/processos/${comNumero}`))).incompleto).toBeNull();
    expect((await json(chamar(cookie, `/processos/${extrajudicial}`))).incompleto).toBeNull();
  });

  test("a lista traz o marcador, a contagem e o filtro", async () => {
    const r = await json(chamar(cookie, "/processos"));
    expect(r.incompletos).toBe(1);
    expect(r.itens.find((i: any) => i.titulo === "Marina Duarte × Seguradora Alfa").incompleto.monitorado).toBe(false);
    expect(r.itens.find((i: any) => i.titulo === "Com número").incompleto).toBeNull();
    const filtrada = await json(chamar(cookie, "/processos?situacao=incompletos"));
    expect(filtrada.itens.map((i: any) => i.titulo)).toEqual(["Marina Duarte × Seguradora Alfa"]);
    expect(filtrada.total).toBe(1);
  });

  describe("buscar o número", () => {
    let id = "";
    beforeAll(async () => {
      id = await semNumero("Helena Brandt × Lojas Pedra Branca", [{ nome: "Helena Brandt", polo: "ativo" }, { nome: "Lojas Pedra Branca", polo: "passivo" }]);
    });
    const candidatos = async () => (await json(chamar(cookie, `/processos/${id}/numero`))).candidatos;

    test("sem publicação que combine, volta vazio", async () => {
      await publicacao("sem-nome", CNJ_A, [{ nome: "Fulano de Tal" }]);
      await publicacao("sem-cnj", null, [{ nome: "Helena Brandt" }]);
      expect(await candidatos()).toEqual([]);
    });

    test("acha nos destinatários e no teor, sem acento nem caixa, e a mais recente de cada número", async () => {
      await publicacao("pelo-destinatario", CNJ_B, [{ nome: "HELENA BRANDT" }], "Intime-se.", "2026-10-20");
      await publicacao("do-mesmo-numero", CNJ_B, [{ nome: "Helena Brandt" }], "Intime-se.", "2026-10-27");
      await publicacao("pelo-teor", CNJ_A, [{ nome: "Banco" }], "Autos em que é ré a empresa LOJAS PEDRA BRANCA, intime-se.", "2026-10-21");
      expect(await candidatos()).toEqual([
        { cnj: CNJ_B, tribunal: "TJSC", orgao: "2ª Vara Cível de Joinville", dia: "2026-10-27", nome: "Helena Brandt" },
        { cnj: CNJ_A, tribunal: "TJSC", orgao: "2ª Vara Cível de Joinville", dia: "2026-10-21", nome: "Lojas Pedra Branca" },
      ]);
    });

    test("número que já é de outro processo do escritório não aparece", async () => {
      await publicacao("ja-na-carteira", CNJ_C, [{ nome: "Helena Brandt" }]);
      expect((await candidatos()).map((c: any) => c.cnj)).not.toContain(CNJ_C);
    });

    test("processo de outro escritório não abre, e publicação de outro escritório não entra", async () => {
      expect((await chamar(cookieDeOutro, `/processos/${id}/numero`)).status).toBe(404);
      const doOutro = "1000000-11.2026.8.24.0001";
      await t.owner`insert into publicacoes (organization_id, id_externo, disponibilizada_em, publicada_em, texto, cnj, destinatarios) values (${outroOrgId}, 'do-outro', '2026-10-28', '2026-10-28', 'Intime-se.', ${doOutro}, ${JSON.stringify([{ nome: "Helena Brandt" }])}::jsonb)`;
      expect((await candidatos()).map((c: any) => c.cnj)).not.toContain(doOutro);
    });

    test("número inválido não entra; número de outro processo é recusado", async () => {
      const invalido = await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { cnj: "5004321-00.2026.8.24.0038" } });
      expect(invalido.status).toBe(422);
      const repetido = await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { cnj: CNJ_C } });
      expect(repetido.status).toBe(409);
      expect((await json(repetido)).erro).toBe("processo_existe");
      expect((await json(chamar(cookie, `/processos/${id}`))).cnj).toBeNull();
    });

    test("com o número salvo: sai a marca, o DataJud é pedido e as publicações daquele número se ligam ao processo", async () => {
      pedidos.length = 0;
      expect((await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { cnj: CNJ_B } })).status).toBe(200);
      const p = await json(chamar(cookie, `/processos/${id}`));
      expect(p.cnj).toBe(CNJ_B);
      expect(p.tribunal).toBe("TJSC");
      expect(p.incompleto).toBeNull();
      const ligadas = await t.owner<{ id_externo: string }[]>`select id_externo from publicacoes where processo_id = ${id} order by id_externo`;
      expect(ligadas.map((l) => l.id_externo)).toEqual(["do-mesmo-numero", "pelo-destinatario"]);
      expect(pedidos.filter((x) => x.nome === "processo.datajud")).toEqual([{ nome: "processo.datajud", organizationId: orgId, processoId: id }]);
      expect(pedidos.filter((x) => x.nome === "publicacao.nova")).toHaveLength(2);
    });

    test("salvar o mesmo número de novo não pede nada, e mexer em outro campo também não", async () => {
      pedidos.length = 0;
      expect((await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { cnj: CNJ_B, fase: "Instrução" } })).status).toBe(200);
      expect((await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { fase: "Sentença" } })).status).toBe(200);
      expect(pedidos).toEqual([]);
    });

    test("tirar o número volta a marcar", async () => {
      await chamar(cookie, `/processos/${id}`, { method: "PUT", json: { cnj: null } });
      expect((await json(chamar(cookie, `/processos/${id}`))).incompleto.monitorado).toBe(false);
    });
  });
});
