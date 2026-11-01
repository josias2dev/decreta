/**
 * O modo Jurisprudência do Perguntar com fonte, pela API, com a demonstração
 * e a IA de mentira: a IA busca no acervo, aponta a chave e o trecho de cada
 * citação, e o servidor monta a citação a partir do banco, com o selo, antes
 * de mostrar. A afirmação que o trecho não sustenta vira ressalva.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { acervoDocumentos } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

const CAPTURA = new Date("2026-10-20T06:00:00Z");
const BNP_302 = "https://pangeabnp.pdpj.jus.br/precedentes?id=stj-sum-302";

describe.skipIf(!hasTestDatabase)("Perguntar no modo Jurisprudência: citação com fonte e selo", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const perguntar = async (texto: string): Promise<Evento[]> => {
    const r = await call("/ia/perguntar", { method: "POST", json: { texto, modo: "jurisprudencia" } });
    expect(r.status).toBe(200);
    return (await r.text())
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Evento);
  };

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
    await t.db.insert(acervoDocumentos).values([
      { chave: "sumula:STJ:302", fonte: "cnj_bnp", situacao: "Vigente", cancelado: false, texto: "É abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado.", url: BNP_302, hash: "h", capturadoEm: CAPTURA },
      {
        chave: "tema:STJ:952",
        fonte: "stj_dados_abertos",
        situacao: "Trânsito em Julgado",
        cancelado: false,
        texto: "O reajuste de mensalidade de plano de saúde individual ou familiar fundado na mudança de faixa etária do beneficiário é válido desde que haja previsão contratual.",
        url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?cod_tema_inicial=952",
        hash: "h",
        capturadoEm: CAPTURA,
      },
    ]);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "teste@decreta.site", password: "demonstracao-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
  }, 60_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("a IA busca no acervo e cita pela chave; o servidor monta cada citação com o selo, e a que não sustenta a afirmação vira ressalva", async () => {
    ia.respostas.jurisprudencia = [
      { ferramentas: [{ nome: "buscarJurisprudencia", entrada: { busca: "plano de saúde internação" } }] },
      {
        ferramentas: [
          {
            nome: "citar",
            entrada: {
              chave: "sumula:STJ:302",
              trecho: "é abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado",
              afirmacao: "O plano não pode limitar o tempo de internação.",
            },
          },
          { nome: "citar", entrada: { chave: "tema:STJ:952", trecho: "é válido desde que haja previsão contratual", afirmacao: "O plano pode negar a cirurgia quando o contrato a exclui." } },
        ],
      },
      "O plano não pode limitar o tempo de internação [1]. A negativa da cirurgia por exclusão contratual não tem apoio no acervo [2].",
    ];
    ia.respostas["conferir-citacao"] = (pedido: string) =>
      pedido.includes("limitar o tempo de internação")
        ? { veredito: "sim", justificativa: "O enunciado diz exatamente isso." }
        : { veredito: "nao", justificativa: "A tese trata de reajuste por faixa etária, não de cobertura de cirurgia." };

    const eventos = await perguntar("O plano de saúde pode limitar a internação ou negar a cirurgia?");
    const resultados = eventos.filter((e) => e.t === "resultado");
    expect(resultados.map((e) => e.nome)).toEqual(["buscarJurisprudencia", "citar", "citar"]);
    expect(resultados[0]!.saida.itens.map((d: { chave: string }) => d.chave)).toEqual(["sumula:STJ:302", "tema:STJ:952"]);

    const [primeira, segunda] = resultados.slice(1).map((e) => e.saida);
    expect(primeira).toEqual({
      n: 1,
      chave: "sumula:STJ:302",
      rotulo: "Súmula 302 do STJ",
      afirmacao: "O plano não pode limitar o tempo de internação.",
      trecho: "é abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado",
      literal: true,
      sustenta: "sim",
      selo: "verificada",
      motivo: "Súmula 302 do STJ: Vigente.",
      texto: "É abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado.",
      fonte: { nome: "CNJ, Banco Nacional de Precedentes", url: BNP_302, capturadoEm: "2026-10-20T06:00:00.000Z" },
    });
    expect(segunda).toMatchObject({
      n: 2,
      rotulo: "Tema 952 do STJ",
      literal: true,
      sustenta: "nao",
      selo: "com_ressalva",
      motivo: "Tema 952 do STJ: Trânsito em Julgado. O trecho não sustenta a afirmação: a tese trata de reajuste por faixa etária, não de cobertura de cirurgia.",
    });

    // O segundo passo recebeu a afirmação e o trecho, e mais nada da conversa.
    const pedido = JSON.stringify(ia.pedidos["conferir-citacao"]);
    expect(pedido).toContain("O plano pode negar a cirurgia quando o contrato a exclui.");
    expect(pedido).toContain("é válido desde que haja previsão contratual");

    // A IA foi instruída a citar só pela chave, sem escrever número de súmula ou tema.
    const sistema = JSON.stringify((ia.pedidos.jurisprudencia as { role: string }[]).filter((m) => m.role === "system"));
    expect(sistema).toContain("Nunca escreva número de súmula, tema, processo, relator, órgão julgador nem data");

    // A resposta guardada tem as citações como o servidor montou.
    const conversa = (await (await call(`/ia/conversas/${eventos[0]!.conversa.id}`)).json()) as any;
    const guardadas = conversa.mensagens[1].partes.filter((p: { nome?: string }) => p.nome === "citar").map((p: { saida: { selo: string } }) => p.saida.selo);
    expect(guardadas).toEqual(["verificada", "com_ressalva"]);
  });

  test("número que a IA escreveu por conta própria no texto também ganha selo (sem repetir o que já passou por citar)", async () => {
    ia.respostas.jurisprudencia = [
      { ferramentas: [{ nome: "citar", entrada: { chave: "sumula:STJ:302", trecho: "limita no tempo a internação hospitalar do segurado", afirmacao: "O plano não pode limitar o tempo de internação." } }] },
      "A Súmula 302 do STJ vale aqui [1]. O Tema 952 do STJ trata de outra coisa, e a Súmula 9999 do STJ eu não conferi.",
    ];
    ia.respostas["conferir-citacao"] = { veredito: "sim", justificativa: "Diz isso." };

    const eventos = await perguntar("Posso citar súmulas sobre internação?");
    const citacoes = eventos.filter((e) => e.t === "citacoes");
    expect(citacoes).toHaveLength(1);
    expect(citacoes[0]!.itens.map((c: Record<string, unknown>) => [c.chave, c.trecho, c.selo, c.motivo])).toEqual([
      ["tema:STJ:952", "Tema 952 do STJ", "verificada", "STJ, Tema 952: Trânsito em Julgado."],
      ["sumula:STJ:9999", "Súmula 9999 do STJ", "nao_verificada", "Não está no acervo guardado. Confira na fonte antes de usar."],
    ]);
    // Chega antes do fim, e fica guardado com a resposta.
    expect(eventos.findIndex((e) => e.t === "citacoes")).toBeLessThan(eventos.findIndex((e) => e.t === "fim"));
    const conversa = (await (await call(`/ia/conversas/${eventos[0]!.conversa.id}`)).json()) as any;
    const parte = conversa.mensagens[1].partes.find((p: { tipo: string }) => p.tipo === "citacoes");
    expect(parte.itens.map((c: { selo: string }) => c.selo)).toEqual(["verificada", "nao_verificada"]);
  });
});
