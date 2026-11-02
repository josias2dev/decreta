/**
 * A conclusão da IA sobre a publicação vem com a frase copiada do teor, e o
 * código confere se ela existe mesmo. Frase que não existe nunca some com o
 * prazo: vira aviso para a pessoa olhar o teor. Banco de verdade e IA de mentira.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { clientes, processos, publicacoes, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaFalsa } from "./ia-falsa.ts";

const TEOR = "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos.";
const CERTO = "manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias";
const INVENTADO = "Intime-se o autor para pagar as custas em 5 dias.";
const AVISO = "O trecho que a IA citou não está na publicação";

const leitura = (o: { geraPrazo: boolean; trecho: string }) => ({
  geraPrazo: o.geraPrazo,
  tipo: o.geraPrazo ? "Manifestação sobre laudo pericial" : "",
  dias: o.geraPrazo ? 15 : null,
  contagem: "uteis",
  fundamento: null,
  audiencia: null,
  resumo: "Intimação para falar do laudo.",
  assunto: "laudo pericial",
  trecho: o.trecho,
  recusa: null,
});

describe.skipIf(!hasTestDatabase)("trecho literal da publicação", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let orgId = "";
  let processoId = "";
  let cookie = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const ler = async <T = any>(caminho: string): Promise<T> => (await app.request(`/api/app${caminho}`, { headers: { origin: env.WEB_ORIGIN, cookie } })).json() as Promise<T>;

  async function lida(resposta: unknown) {
    const [p] = await withTenant(t.db, orgId, (tx) =>
      tx.insert(publicacoes).values({ organizationId: orgId, idExterno: randomUUID(), disponibilizadaEm: "2026-10-29", publicadaEm: "2026-10-30", texto: TEOR, tipoComunicacao: "Intimação", processoId }).returning({ id: publicacoes.id }),
    );
    ia.respostas["sugerir-prazo"] = resposta;
    await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, p!.id);
    return p!.id;
  }
  const prazoDa = async (publicacaoId: string) => (await t.owner<{ id: string; dias: number }[]>`select id, dias from prazos where publicacao_id = ${publicacaoId}`)[0];
  const seloDa = async (id: string) => (await ler<{ itens: { id: string; selo: { tipo: string; texto: string } }[] }>("/publicacoes")).itens.find((i) => i.id === id)!.selo;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const base = { db: t.db, auth, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} };
    app = createApp({ db: t.db, env, auth, rotas: createRotas({ ...base, ia }), log: () => {} });
    const email = "beatriz@souza.adv.br";
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", dono: { email, nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "socia" } }));
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    const [cliente] = await withTenant(t.db, orgId, (tx) => tx.insert(clientes).values({ organizationId: orgId, nome: "Marina Duarte" }).returning({ id: clientes.id }));
    const [processo] = await withTenant(t.db, orgId, (tx) => tx.insert(processos).values({ organizationId: orgId, titulo: "Marina Duarte × Seguradora Alfa S.A.", clienteId: cliente!.id }).returning({ id: processos.id }));
    processoId = processo!.id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.owner`delete from publicacoes`;
  });

  test("a frase existe no teor: a tela recebe o trecho, sem aviso", async () => {
    const id = await lida(leitura({ geraPrazo: true, trecho: CERTO }));
    const { conteudo } = (await ler(`/publicacoes/${id}`)).sugestao;
    expect(conteudo).toMatchObject({ trecho: CERTO, trechoConfere: true });
    expect(conteudo.conferencia.motivos.join(" ")).not.toContain(AVISO);
  });

  test("a frase não existe: o prazo nasce do mesmo jeito, com confiança baixa na publicação e na ficha do prazo", async () => {
    const id = await lida(leitura({ geraPrazo: true, trecho: INVENTADO }));
    expect((await prazoDa(id))?.dias).toBe(15);
    const { conteudo } = (await ler(`/publicacoes/${id}`)).sugestao;
    expect(conteudo.trechoConfere).toBe(false);
    expect(conteudo.conferencia.confianca).toBe("baixa");
    expect(conteudo.conferencia.motivos.join(" ")).toContain(AVISO);

    const ficha = await ler(`/prazos/${(await prazoDa(id))!.id}`);
    expect(ficha.conferencia.confianca).toBe("baixa");
    expect(ficha.conferencia.motivos.join(" ")).toContain(AVISO);
  });

  test("\"não gera prazo\" com frase que não existe é o caso mais perigoso: a lista e a publicação pedem para conferir o teor", async () => {
    const id = await lida(leitura({ geraPrazo: false, trecho: INVENTADO }));
    expect(await prazoDa(id)).toBeUndefined();
    expect((await seloDa(id)).texto).toBe("Não gera prazo · confira o teor");
    const { conteudo } = (await ler(`/publicacoes/${id}`)).sugestao;
    expect(conteudo.conferencia.confianca).toBe("baixa");
    expect(conteudo.conferencia.motivos.join(" ")).toContain(AVISO);
  });

  test("\"não gera prazo\" com a frase certa continua sem aviso", async () => {
    const id = await lida(leitura({ geraPrazo: false, trecho: "Após, voltem conclusos." }));
    expect((await seloDa(id)).texto).toBe("Não gera prazo");
    expect((await ler(`/publicacoes/${id}`)).sugestao.conteudo.conferencia).toBeNull();
  });

  test("a leitura antiga, de antes do trecho, não ganha aviso", async () => {
    const id = await lida(leitura({ geraPrazo: true, trecho: CERTO }));
    await t.owner`update analises set conteudo = conteudo - 'trecho' - 'trechoConfere' where alvo_id = ${id}`;
    const ficha = await ler(`/prazos/${(await prazoDa(id))!.id}`);
    expect(ficha.conferencia.motivos.join(" ")).not.toContain(AVISO);
  });
});
