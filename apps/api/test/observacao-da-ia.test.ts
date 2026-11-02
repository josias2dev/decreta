/**
 * O modo observar: um modelo ou prompt novo lê as mesmas publicações em
 * paralelo, sem nada chegar ao escritório, e o placar compara as duas leituras
 * com o que a pessoa decidiu. Banco de verdade (RLS) e IA de mentira.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { randomBytes, randomUUID } from "node:crypto";
import { clientes, observacoesDaIa, processos, publicacoes, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createFunctions } from "../src/inngest.ts";
import { createRotas } from "../src/rotas/index.ts";
import { candidatoDoPrazo, OBSERVACOES_POR_DIA, observarPrazo, placarDaObservacao, placarEmTexto } from "../src/servicos/observacao.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaFalsa } from "./ia-falsa.ts";

const leitura = (o: { geraPrazo: boolean; dias?: number | null; contagem?: "uteis" | "corridos"; recusa?: string | null }) => ({
  geraPrazo: o.geraPrazo,
  tipo: o.geraPrazo ? "Manifestação sobre o laudo" : "",
  fundamento: null,
  dias: o.dias ?? null,
  contagem: o.contagem ?? "uteis",
  assunto: "laudo",
  resumo: "Resumo com o nome da Marina Duarte.",
  audiencia: null,
  recusa: o.recusa ?? null,
});

describe.skipIf(!hasTestDatabase)("modo observar da IA", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let orgId = "";
  let demoId = "";
  let processoId = "";
  let cookie = "";
  const ia = iaFalsa();
  const candidata = iaFalsa();
  const observacao = { ia: candidata, candidato: "juridico-novo" };
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (caminho: string, json?: unknown) =>
    app.request(`/api/app${caminho}`, {
      method: "POST",
      headers: { origin: env.WEB_ORIGIN, cookie, "content-type": "application/json" },
      body: JSON.stringify(json ?? {}),
    });

  async function publicacao(o: { processoId?: string } = {}, escritorio = orgId) {
    const [p] = await withTenant(t.db, escritorio, (tx) =>
      tx
        .insert(publicacoes)
        .values({ organizationId: escritorio, idExterno: randomUUID(), disponibilizadaEm: "2026-10-29", publicadaEm: "2026-10-30", texto: "Intime-se a parte autora para falar sobre o laudo pericial em 15 dias.", tipoComunicacao: "Intimação", processoId: processoId, ...o })
        .returning({ id: publicacoes.id }),
    );
    return p!.id;
  }

  /** A publicação lida pelo modelo atual e pelo candidato, cada um com a sua resposta. */
  async function lidaPelosDois(atual: unknown, candidato: unknown) {
    const id = await publicacao();
    ia.respostas["sugerir-prazo"] = atual;
    candidata.respostas["observar-prazo"] = candidato;
    await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, id);
    await observarPrazo({ db: t.db }, observacao, orgId, id);
    return id;
  }
  const observacoes = () => t.owner<{ publicacao_id: string; candidato: string; situacao: string; conteudo: Record<string, unknown> | null; erro: string | null; procedencia: { codigo: string; chamadas: { metodo: string; modelo: string | null }[] } }[]>`select * from observacoes_da_ia`;

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
    ({ organizationId: demoId } = await criarEscritorio(t.db, auth, { nome: "Escritório de Demonstração", slug: SLUG_DA_DEMONSTRACAO, dono: { email: "teste@decreta.site", nome: "Demonstração", senha: "senha-bem-longa-123", cargo: "socia" } }));
    const [cliente] = await withTenant(t.db, orgId, (tx) => tx.insert(clientes).values({ organizationId: orgId, nome: "Marina Duarte" }).returning({ id: clientes.id }));
    const [processo] = await withTenant(t.db, orgId, (tx) => tx.insert(processos).values({ organizationId: orgId, titulo: "Marina Duarte × Seguradora Alfa S.A.", clienteId: cliente!.id }).returning({ id: processos.id }));
    processoId = processo!.id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  beforeEach(async () => {
    await t.owner`delete from publicacoes`;
    await t.owner`delete from uso_ia`;
    candidata.chamadas.length = 0;
  });

  test("a leitura do candidato fica guardada à parte: o prazo e a sugestão que o escritório vê não mudam", async () => {
    const id = await lidaPelosDois(leitura({ geraPrazo: true, dias: 15, contagem: "uteis" }), leitura({ geraPrazo: true, dias: 5, contagem: "corridos" }));

    const [prazo] = await t.owner<{ dias: number; contagem: string }[]>`select dias, contagem from prazos where publicacao_id = ${id}`;
    expect(prazo).toMatchObject({ dias: 15, contagem: "uteis" });
    const lidas = await t.owner<{ dias: number }[]>`select (conteudo->>'dias')::int as dias from analises where alvo_id = ${id}`;
    expect(lidas.map((a) => a.dias)).toEqual([15]);

    const [o] = await observacoes();
    expect(o).toMatchObject({ publicacao_id: id, candidato: "juridico-novo", situacao: "pronto" });
    expect(o!.conteudo).toEqual({ geraPrazo: true, tipo: "Manifestação sobre o laudo", dias: 5, contagem: "corridos" });
    expect(JSON.stringify(o)).not.toContain("Marina");
    expect(o!.procedencia.chamadas).toEqual([expect.objectContaining({ metodo: "observar-prazo", modelo: "modelo-de-teste" })]);
  });

  test("o gasto do candidato fica registrado à parte", async () => {
    await lidaPelosDois(leitura({ geraPrazo: false }), leitura({ geraPrazo: false }));
    const usos = await t.owner<{ origem: string }[]>`select origem from uso_ia where metodo = 'observar-prazo'`;
    expect(usos.map((u) => u.origem)).toEqual(["fundo"]);
  });

  test("a mesma publicação não é lida duas vezes pelo mesmo candidato, mas um candidato novo lê", async () => {
    const id = await lidaPelosDois(leitura({ geraPrazo: false }), leitura({ geraPrazo: false }));
    expect(await observarPrazo({ db: t.db }, observacao, orgId, id)).toBe("ja-observada");
    expect(candidata.chamadas).toEqual(["observar-prazo"]);

    expect(await observarPrazo({ db: t.db }, { ...observacao, candidato: "outro" }, orgId, id)).toBe("observada");
    expect(candidata.chamadas).toEqual(["observar-prazo", "observar-prazo"]);
  });

  test("com prompt candidato, é ele que vai ao modelo", async () => {
    const id = await publicacao();
    candidata.respostas["observar-prazo"] = leitura({ geraPrazo: false });
    await observarPrazo({ db: t.db }, { ...observacao, instrucoes: "Regra nova e bem específica do prazo." }, orgId, id);
    expect(JSON.stringify(candidata.pedidos["observar-prazo"])).toContain("Regra nova e bem específica do prazo.");
  });

  test("o mesmo modelo com outro prompt é outro candidato", () => {
    expect(candidatoDoPrazo("juridico", null)).toEqual({ candidato: "juridico" });
    const comPrompt = candidatoDoPrazo("juridico", "Regra nova.");
    expect(comPrompt.candidato).toMatch(/^juridico \+ prompt [0-9a-f]{12}$/);
    expect(comPrompt.instrucoes).toBe("Regra nova.");
    expect(candidatoDoPrazo("juridico", "Outra regra.").candidato).not.toBe(comPrompt.candidato);
  });

  test("se o candidato falha ou recusa, fica registrado, nada estoura e o escritório não percebe", async () => {
    const quebrou = await lidaPelosDois(leitura({ geraPrazo: true, dias: 15, contagem: "uteis" }), () => {
      throw new Error("modelo fora do ar");
    });
    const recusou = await lidaPelosDois(leitura({ geraPrazo: false }), leitura({ geraPrazo: false, recusa: "Falta o teor." }));

    const [erro] = (await observacoes()).filter((o) => o.publicacao_id === quebrou);
    expect(erro).toMatchObject({ situacao: "erro", conteudo: null });
    expect(erro!.erro).toContain("modelo fora do ar");
    expect(erro!.procedencia.chamadas.at(-1)).toMatchObject({ metodo: "observar-prazo", modelo: null });
    expect((await observacoes()).find((o) => o.publicacao_id === recusou)).toMatchObject({ situacao: "recusa", conteudo: null });
    expect((await t.owner`select id from prazos where publicacao_id = ${quebrou}`).length).toBe(1);
  });

  test("cliente que recusou a IA e a demonstração não vão ao candidato", async () => {
    const [cliente] = await withTenant(t.db, orgId, (tx) => tx.insert(clientes).values({ organizationId: orgId, nome: "Paula Ramos", semIa: true }).returning({ id: clientes.id }));
    const [processo] = await withTenant(t.db, orgId, (tx) => tx.insert(processos).values({ organizationId: orgId, titulo: "Paula Ramos × Banco Delta", clienteId: cliente!.id }).returning({ id: processos.id }));
    expect(await observarPrazo({ db: t.db }, observacao, orgId, await publicacao({ processoId: processo!.id }))).toBe("cliente-sem-ia");
    expect(await observarPrazo({ db: t.db }, observacao, demoId, await publicacao({ processoId: undefined }, demoId))).toBe("demonstracao");
    expect(candidata.chamadas).toEqual([]);
    expect((await observacoes()).length).toBe(0);
  });

  test("cada escritório tem um limite de leituras do candidato por dia", async () => {
    const primeira = await publicacao();
    await withTenant(t.db, orgId, (tx) => tx.insert(observacoesDaIa).values(Array.from({ length: OBSERVACOES_POR_DIA }, (_, i) => ({ organizationId: orgId, publicacaoId: primeira, candidato: `antigo-${i}`, situacao: "pronto" as const }))));
    expect(await observarPrazo({ db: t.db }, observacao, orgId, await publicacao())).toBe("limite-do-dia");
    expect(candidata.chamadas).toEqual([]);
  });

  test("o placar compara as duas leituras com o que a pessoa decidiu", async () => {
    const quinzeUteis = leitura({ geraPrazo: true, dias: 15, contagem: "uteis" });
    const cincoCorridos = leitura({ geraPrazo: true, dias: 5, contagem: "corridos" });
    const naoGera = leitura({ geraPrazo: false });
    const confirmar = (id: string, dias: number, contagem: string) => chamar(`/publicacoes/${id}/confirmar`, { tipo: "Manifestação sobre o laudo", dias, contagem });

    // A pessoa confirmou o que o atual disse: o candidato errou os dias.
    expect((await confirmar(await lidaPelosDois(quinzeUteis, cincoCorridos), 15, "uteis")).status).toBe(200);
    // A pessoa corrigiu o atual para o que o candidato disse.
    expect((await confirmar(await lidaPelosDois(quinzeUteis, cincoCorridos), 5, "corridos")).status).toBe(200);
    // Os dois acertaram: não gera prazo.
    expect((await chamar(`/publicacoes/${await lidaPelosDois(naoGera, naoGera)}/sem-prazo`)).status).toBe(200);
    // O atual viu um prazo que a pessoa descartou; o candidato não viu.
    const descartada = await lidaPelosDois(quinzeUteis, naoGera);
    const [prazo] = await t.owner<{ id: string }[]>`select id from prazos where publicacao_id = ${descartada}`;
    expect((await chamar(`/prazos/${prazo!.id}/descartar`, { motivo: "Não era para nós." })).status).toBe(200);
    // O candidato recusou onde havia prazo.
    expect((await confirmar(await lidaPelosDois(quinzeUteis, leitura({ geraPrazo: false, recusa: "Falta o teor." })), 15, "uteis")).status).toBe(200);
    // Sem decisão ainda, e falha do candidato: ficam fora da conta.
    await lidaPelosDois(quinzeUteis, quinzeUteis);
    const falhou = await lidaPelosDois(quinzeUteis, () => {
      throw new Error("modelo fora do ar");
    });
    expect((await confirmar(falhou, 15, "uteis")).status).toBe(200);

    const placar = await placarDaObservacao(t.db);
    expect(placar).toEqual({
      gastoUsd: expect.any(Number),
      candidatos: [
        {
          candidato: "juridico-novo",
          observadas: 7,
          aguardando: 1,
          falhas: 1,
          decididas: 5,
          atual: { acertos: 3, erros: 2, recusas: 0 },
          novo: { acertos: 3, erros: 1, recusas: 1 },
          soONovoAcertou: 2,
          soOAtualAcertou: 2,
        },
      ],
    });

    const texto = placarEmTexto(placar);
    expect(texto).toContain("juridico-novo");
    expect(texto).toContain("Decididas pela pessoa: 5");
    expect(texto).not.toContain("Marina");
  });

  test("a rotina lê a publicação e depois observa; sem candidato, nada a mais acontece", async () => {
    const rodar = async (deps: { observacao?: typeof observacao }, id: string) => {
      const funcoes = createFunctions({ db: t.db, ia, captura: { db: t.db, datajudKey: "" }, arquivos: armazenamentoEmMemoria(), telas: "https://decreta.local", log: () => {}, ...deps });
      const sugerir = funcoes.find((f) => f.id() === "sugerir-prazo") ?? funcoes.find((f) => f.id().endsWith("sugerir-prazo"));
      const step = { run: (_: string, fn: () => unknown) => fn() };
      return (sugerir as unknown as { fn: (ctx: unknown) => Promise<unknown> }).fn({ event: { data: { organizationId: orgId, publicacaoId: id } }, step });
    };
    ia.respostas["sugerir-prazo"] = leitura({ geraPrazo: false });
    candidata.respostas["observar-prazo"] = leitura({ geraPrazo: false });

    expect(await rodar({}, await publicacao())).toBe("pronto");
    expect(candidata.chamadas).toEqual([]);

    const id = await publicacao();
    expect(await rodar({ observacao }, id)).toBe("pronto");
    expect((await observacoes()).map((o) => o.publicacao_id)).toEqual([id]);
  });
});
