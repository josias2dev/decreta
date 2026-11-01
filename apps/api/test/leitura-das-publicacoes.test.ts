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
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { releiturasPendentes } from "../src/inngest.ts";
import { createRotas } from "../src/rotas/index.ts";
import { resumoDaManha } from "../src/servicos/avisos.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaMedida } from "../src/servicos/uso-ia.ts";
import { iaFalsa } from "./ia-falsa.ts";

describe.skipIf(!hasTestDatabase)("publicações que a IA não leu", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let appSemIa: ReturnType<typeof createApp>;
  let orgId = "";
  let outroId = "";
  let demoId = "";
  let cookie = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (a: ReturnType<typeof createApp>, caminho: string) => a.request(`/api/app${caminho}`, { headers: { origin: env.WEB_ORIGIN, cookie } });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const hoje = () => json(chamar(app, "/hoje"));

  async function publicacao(o: { processoId?: string; canceladaEm?: Date } = {}, escritorio = orgId) {
    const [p] = await withTenant(t.db, escritorio, (tx) =>
      tx
        .insert(publicacoes)
        .values({ organizationId: escritorio, idExterno: randomUUID(), disponibilizadaEm: "2026-10-29", publicadaEm: "2026-10-30", texto: "Intime-se a parte autora para falar sobre o laudo pericial em 15 dias.", tipoComunicacao: "Intimação", ...o })
        .returning({ id: publicacoes.id }),
    );
    return p!.id;
  }
  const analise = (alvoId: string, situacao: "pronto" | "recusa" | "erro") =>
    withTenant(t.db, orgId, (tx) => tx.insert(analises).values({ organizationId: orgId, alvo: "publicacao", alvoId, acao: "sugerir-prazo", situacao, conteudo: { geraPrazo: false }, base: "b" }));
  const leituraHa = (alvoId: string, situacao: "pronto" | "recusa" | "erro", horas: number) =>
    withTenant(t.db, orgId, (tx) => tx.insert(analises).values({ organizationId: orgId, alvo: "publicacao", alvoId, acao: "sugerir-prazo", situacao, conteudo: {}, base: "b", createdAt: new Date(Date.now() - horas * 3_600_000) }));
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
    ({ organizationId: outroId } = await criarEscritorio(t.db, auth, { nome: "Outro Escritório", slug: "outro", dono: { email: "outra@outro.adv.br", nome: "Outra Pessoa", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "1.234", oabUf: "SC" } }));
    ({ organizationId: demoId } = await criarEscritorio(t.db, auth, { nome: "Escritório de Demonstração", slug: SLUG_DA_DEMONSTRACAO, dono: { email: "teste@decreta.site", nome: "Demonstração", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "9.999", oabUf: "SC" } }));
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

  /* ---------------- De onde veio a leitura ---------------- */

  test("a leitura guarda o modelo e o prompt que a produziram, com a mesma versão do código, mesmo quando falha", async () => {
    const id = await publicacao();
    const medida = iaMedida({ db: t.db }, ia, { organizationId: orgId, userId: null, origem: "fundo" });
    const procedencias = async () => t.owner<{ situacao: string; procedencia: { codigo: string; chamadas: { metodo: string; modelo: string | null; prompt: string }[] } }[]>`select situacao, procedencia from analises where alvo_id = ${id} order by created_at`;

    ia.respostas["sugerir-prazo"] = { geraPrazo: false, tipo: null, fundamento: null, dias: null, contagem: null, assunto: "laudo", resumo: "Sem prazo.", audiencia: null, recusa: null, citacoes: [] };
    const lida = await sugerirPrazoDaPublicacao({ db: t.db, ia: medida }, orgId, id);
    expect(["pronto", "erro"]).toContain(lida!.situacao);
    const [primeira] = await procedencias();
    expect(primeira!.procedencia.codigo).toMatch(/^[0-9a-f]{7,}$/);
    expect(primeira!.procedencia.chamadas.at(0)).toMatchObject({ metodo: "sugerir-prazo", modelo: "modelo-de-teste" });
    expect(primeira!.procedencia.chamadas.at(0)!.prompt).toMatch(/^[0-9a-f]{12}$/);

    ia.respostas["sugerir-prazo"] = () => {
      throw new Error("teto do gateway");
    };
    await sugerirPrazoDaPublicacao({ db: t.db, ia: medida }, orgId, id);
    const segunda = (await procedencias()).at(-1)!;
    expect(segunda.situacao).toBe("erro");
    expect(segunda.procedencia.chamadas.at(-1)).toMatchObject({ metodo: "sugerir-prazo", modelo: null });
  });

  /* ---------------- Releitura sozinha ---------------- */

  test("a IA falhou: relê depois de uma hora, não na mesma hora", async () => {
    const recente = await publicacao();
    await leituraHa(recente, "erro", 0.5);
    const antiga = await publicacao();
    await leituraHa(antiga, "erro", 1.5);
    expect(await releiturasPendentes(t.db)).toEqual([{ organizationId: orgId, publicacaoId: antiga, nuncaLida: false }]);
  });

  test("a espera dobra a cada falha, para não insistir com o gateway fora do ar", async () => {
    const espera = await publicacao();
    await leituraHa(espera, "erro", 5);
    await leituraHa(espera, "erro", 1.5);
    const passou = await publicacao();
    await leituraHa(passou, "erro", 6);
    await leituraHa(passou, "erro", 2.5);
    expect((await releiturasPendentes(t.db)).map((r) => r.publicacaoId)).toEqual([passou]);
  });

  test("depois de seis falhas para de tentar: fica o aviso no Hoje e o botão de ler de novo", async () => {
    const id = await publicacao();
    for (const horas of [100, 90, 80, 70, 60, 50]) await leituraHa(id, "erro", horas);
    expect(await releiturasPendentes(t.db)).toEqual([]);
    expect((await hoje()).contadores.publicacoesSemLeitura).toBe(1);
  });

  test("não relê o que já leu, nem o que não tem teor: a resposta seria a mesma", async () => {
    const lida = await publicacao();
    await leituraHa(lida, "erro", 10);
    await leituraHa(lida, "pronto", 5);
    await leituraHa(await publicacao(), "recusa", 5);
    expect(await releiturasPendentes(t.db)).toEqual([]);
  });

  test("sem leitura nenhuma: pede a leitura de novo depois de uma hora, como publicação nunca lida", async () => {
    const nova = await publicacao();
    expect(await releiturasPendentes(t.db)).toEqual([]);
    await chegouHa2Horas(nova);
    expect(await releiturasPendentes(t.db)).toEqual([{ organizationId: orgId, publicacaoId: nova, nuncaLida: true }]);
  });

  test("não manda para a IA o caso de cliente que recusou, a publicação cancelada nem a já tratada", async () => {
    const [cliente] = await withTenant(t.db, orgId, (tx) => tx.insert(clientes).values({ organizationId: orgId, nome: "Paula Ramos", semIa: true }).returning({ id: clientes.id }));
    const [processo] = await withTenant(t.db, orgId, (tx) => tx.insert(processos).values({ organizationId: orgId, titulo: "Paula Ramos × Banco Delta", clienteId: cliente!.id }).returning({ id: processos.id }));
    const semIa = await publicacao({ processoId: processo!.id });
    const cancelada = await publicacao({ canceladaEm: new Date() });
    const tratada = await publicacao();
    for (const id of [semIa, cancelada, tratada]) await chegouHa2Horas(id);
    await t.owner`update publicacoes set situacao = 'lida' where id = ${tratada}`;
    expect(await releiturasPendentes(t.db)).toEqual([]);
  });

  test("vale para cada escritório, e a demonstração nunca vai para a IA de verdade", async () => {
    const minha = await publicacao();
    const doOutro = await publicacao({}, outroId);
    const daDemo = await publicacao({}, demoId);
    for (const id of [minha, doOutro, daDemo]) await chegouHa2Horas(id);
    const pendentes = await releiturasPendentes(t.db);
    expect(pendentes.map((r) => r.publicacaoId).toSorted()).toEqual([minha, doOutro].toSorted());
    expect(pendentes.find((r) => r.publicacaoId === doOutro)?.organizationId).toBe(outroId);
  });

  test("no máximo vinte por escritório a cada rodada, as mais antigas primeiro", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 22; i++) {
      const id = await publicacao();
      ids.push(id);
      await t.owner`update publicacoes set created_at = now() - make_interval(hours => ${100 - i}) where id = ${id}`;
    }
    expect((await releiturasPendentes(t.db)).map((r) => r.publicacaoId)).toEqual(ids.slice(0, 20));
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
