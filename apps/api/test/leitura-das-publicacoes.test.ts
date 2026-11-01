/**
 * Publicação nova que a IA não leu: sem aviso, o escritório acha que está tudo
 * lido e o prazo passa. Banco de verdade (RLS) e IA de mentira, que pode falhar.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { analises, clientes, processos, publicacoes, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { resumoDaManha } from "../src/servicos/avisos.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaFalsa } from "./ia-falsa.ts";

describe.skipIf(!hasTestDatabase)("publicações que a IA não leu", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let appSemIa: ReturnType<typeof createApp>;
  let orgId = "";
  let cookie = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (a: ReturnType<typeof createApp>, caminho: string) => a.request(`/api/app${caminho}`, { headers: { origin: env.WEB_ORIGIN, cookie } });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const hoje = () => json(chamar(app, "/hoje"));

  async function publicacao(o: { processoId?: string; canceladaEm?: Date } = {}) {
    const [p] = await withTenant(t.db, orgId, (tx) =>
      tx
        .insert(publicacoes)
        .values({ organizationId: orgId, idExterno: randomUUID(), disponibilizadaEm: "2026-10-29", publicadaEm: "2026-10-30", texto: "Intime-se a parte autora para falar sobre o laudo pericial em 15 dias.", tipoComunicacao: "Intimação", ...o })
        .returning({ id: publicacoes.id }),
    );
    return p!.id;
  }
  const analise = (alvoId: string, situacao: "pronto" | "recusa" | "erro") =>
    withTenant(t.db, orgId, (tx) => tx.insert(analises).values({ organizationId: orgId, alvo: "publicacao", alvoId, acao: "sugerir-prazo", situacao, conteudo: { geraPrazo: false }, base: "b" }));
  const chegouHa2Horas = (id: string) => t.owner`update publicacoes set created_at = now() - interval '2 hours' where id = ${id}`;
  const seloNaLista = async (id: string) => (await json(chamar(app, "/publicacoes"))).itens.find((i: { id: string }) => i.id === id).selo;

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const base = { db: t.db, auth, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} };
    app = createApp({ db: t.db, env, auth, rotas: createRotas({ ...base, ia }), log: () => {} });
    appSemIa = createApp({ db: t.db, env, auth, rotas: createRotas({ ...base, ia: null }), log: () => {} });
    const email = "beatriz@souza.adv.br";
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", dono: { email, nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "41.233", oabUf: "SC" } }));
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.owner`delete from publicacoes`;
  });

  test("a IA falhou ao ler: o Hoje conta a publicação e diz qual é", async () => {
    const id = await publicacao();
    ia.respostas["sugerir-prazo"] = () => {
      throw new Error("teto do gateway");
    };
    const lida = await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, id);
    expect(lida?.situacao).toBe("erro");
    const p = await hoje();
    expect(p.contadores.publicacoesSemLeitura).toBe(1);
    expect(p.publicacoes[0].detalhe).toContain("a IA não conseguiu ler");
  });

  test("falta de teor também conta; a leitura que deu certo, não, nem a tentativa que falhou antes dela", async () => {
    await analise(await publicacao(), "recusa");
    const relida = await publicacao();
    await analise(relida, "erro");
    await Bun.sleep(5);
    await analise(relida, "pronto");
    expect((await hoje()).contadores.publicacoesSemLeitura).toBe(1);
  });

  test("sem leitura nenhuma uma hora depois de chegar: a rotina não rodou, e a tela para de dizer que a IA está lendo", async () => {
    const id = await publicacao();
    expect((await hoje()).contadores.publicacoesSemLeitura).toBe(0);
    expect(await seloNaLista(id)).toEqual({ tipo: "lendo", texto: "IA lendo" });
    expect((await json(chamar(app, `/publicacoes/${id}`))).leituraParada).toBe(false);

    await chegouHa2Horas(id);
    const p = await hoje();
    expect(p.contadores.publicacoesSemLeitura).toBe(1);
    expect(p.publicacoes[0].detalhe).toContain("a IA não conseguiu ler");
    expect(await seloNaLista(id)).toEqual({ tipo: "erro", texto: "A IA não conseguiu ler" });
    expect((await json(chamar(app, `/publicacoes/${id}`))).leituraParada).toBe(true);
  });

  test("não conta o que não era para a IA ler: cliente sem IA, publicação cancelada e publicação já tratada", async () => {
    const [cliente] = await withTenant(t.db, orgId, (tx) => tx.insert(clientes).values({ organizationId: orgId, nome: "Marina Duarte", semIa: true }).returning({ id: clientes.id }));
    const [processo] = await withTenant(t.db, orgId, (tx) => tx.insert(processos).values({ organizationId: orgId, titulo: "Marina Duarte × Seguradora Alfa S.A.", clienteId: cliente!.id }).returning({ id: processos.id }));
    const semIa = await publicacao({ processoId: processo!.id });
    const cancelada = await publicacao({ canceladaEm: new Date() });
    const tratada = await publicacao();
    for (const id of [semIa, cancelada, tratada]) await chegouHa2Horas(id);
    await t.owner`update publicacoes set situacao = 'lida' where id = ${tratada}`;
    expect((await hoje()).contadores.publicacoesSemLeitura).toBe(0);
  });

  test("com a IA desligada no servidor, a falta de leitura não é falha", async () => {
    const id = await publicacao();
    await chegouHa2Horas(id);
    expect((await json(chamar(appSemIa, "/hoje"))).contadores.publicacoesSemLeitura).toBe(0);
    expect((await json(chamar(appSemIa, `/publicacoes/${id}`))).leituraParada).toBe(false);
  });

  test("o resumo da manhã avisa, para não depender de abrir o Hoje", async () => {
    await analise(await publicacao(), "erro");
    await publicacao();
    const painel = await hoje();
    const texto = resumoDaManha(painel, { id: "ninguem", apelido: "Beatriz" }, "https://decreta.local");
    expect(texto).toContain("2 publicações novas para revisar: https://decreta.local/publicacoes\n1 ficou sem leitura da IA: confira o prazo nela.");
    expect(resumoDaManha({ ...painel, contadores: { ...painel.contadores, publicacoesSemLeitura: 3 } }, { id: "ninguem", apelido: "Beatriz" }, "https://decreta.local")).toContain("3 ficaram sem leitura da IA: confira o prazo em cada uma.");
  });
});
