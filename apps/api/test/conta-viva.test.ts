/**
 * A conta atrás de toda data de prazo: dia a dia, no calendário do processo, com a
 * regra e os dias fora. Data digitada à mão diz isso em vez de inventar contagem.
 * Hoje é quinta, 29/10/2026.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { dvCnj } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { withTenant } from "@decreta/db";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { gravarComunicacoes } from "../src/servicos/captura.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { iaFalsa } from "./ia-falsa.ts";

const SENHA = "senha-bem-longa-123";
const CNJ = "5004321-25.2026.8.24.0038";
const TEOR = "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias.";

describe.skipIf(!hasTestDatabase)("a conta de cada data", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let cookieDeOutro = "";
  let processoId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const chamar = (quem: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: quem }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const entrar = async (email: string) => (await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) })).headers.get("set-cookie")?.split(";")[0] ?? "";
  const novoPrazo = async (extra: Record<string, unknown> = {}) => (await json<{ id: string }>(chamar(cookie, "/prazos", { json: { processoId, tipo: "Réplica", dias: 15, contagem: "uteis", publicadoEm: "2026-10-29", ...extra } }))).id;
  const contaDe = (id: string) => json(chamar(cookie, `/prazos/${id}/conta`));
  /** Uma publicação capturada, lida pela IA de mentira. */
  async function publicar(idExterno: string, cnj: string | null, sugestao: Record<string, unknown>) {
    const [pubId] = await withTenant(t.db, orgId, (tx) =>
      gravarComunicacoes(tx, orgId, "41233/SC", [{ idExterno, disponibilizadaEm: "2026-10-28", tribunal: "TJSC", orgao: "2ª Vara Cível da Comarca de Joinville", tipoComunicacao: "Intimação", tipoDocumento: "Despacho", classe: "Procedimento Comum Cível", cnj, texto: TEOR, link: null, destinatarios: [], advogados: [] }]),
    );
    ia.respostas["sugerir-prazo"] = { tipo: "Manifestação sobre laudo", fundamento: null, audiencia: null, resumo: "Intimação.", assunto: "intimação", trecho: "manifestarem-se sobre o laudo pericial juntado no evento 87", recusa: null, ...sugestao };
    await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, pubId!);
    return pubId!;
  }

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes", slug: "souza-conta", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: SENHA, oabNumero: "41233", oabUf: "SC" } }));
    await criarEscritorio(t.db, auth, { nome: "Outro Escritório", slug: "outro-conta", dono: { email: "tiago@outro.adv.br", nome: "Tiago", senha: SENHA } });
    cookie = await entrar("beatriz@souza.adv.br");
    cookieDeOutro = await entrar("tiago@outro.adv.br");
    processoId = (await json<{ id: string }>(chamar(cookie, "/processos", { json: { cnj: CNJ, titulo: "Marina Duarte × Seguradora Alfa", comarca: "Joinville" } }))).id;
  });

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  });

  test("o prazo contado: dia a dia, com a regra, o calendário e os dias fora", async () => {
    const id = await novoPrazo();
    const c = await contaDe(id);
    expect(c.prazo).toEqual({ id, tipo: "Réplica", situacao: "aberto", confirmado: true, processo: { id: processoId, titulo: "Marina Duarte × Seguradora Alfa" } });
    expect(c.fim).toBe("2026-11-23");
    expect(c.digitada).toBe(false);
    expect(c.regra).toBe("Dias úteis (CPC, art. 219)");
    expect(c.calendario).toBe("TJSC, com os feriados cadastrados para a comarca de Joinville");
    expect(c.calendarioCompleto).toBe(true);
    expect(c.fora.map((f: any) => f.dia)).toEqual(["2026-11-02", "2026-11-20"]);
    expect(c.aberta.publicacao).toBe("2026-10-29");
    expect(c.aberta.fim).toBe("2026-11-23");
    expect(c.aberta.linha.find((d: any) => d.dia === "2026-11-20")).toEqual({ dia: "2026-11-20", tipo: "feriado", motivo: "Consciência Negra" });
    expect(c.aberta.linha.filter((d: any) => d.tipo === "contado")).toHaveLength(15);
    expect(c.pelaConta).toBeNull();
    expect(c.interno).toBeNull();
    expect(c.conferencia).toBeNull();
  });

  test("usa o calendário do processo: o dia que o escritório marcou para a comarca sai da conta", async () => {
    await chamar(cookie, "/suspensoes", { json: { dia: "2026-11-04", motivo: "Ponte da comarca", tipo: "local", comarca: "Joinville" } });
    const c = await contaDe(await novoPrazo());
    expect(c.fim).toBe("2026-11-24");
    expect(c.aberta.linha.find((d: any) => d.dia === "2026-11-04")).toEqual({ dia: "2026-11-04", tipo: "feriado", motivo: "Ponte da comarca" });
  });

  test("tribunal sem calendário próprio: a conta avisa", async () => {
    const cnj = `5000001-${dvCnj("5000001", "2026", "8", "16", "0001")}.2026.8.16.0001`;
    const noParana = await json<{ id: string }>(chamar(cookie, "/processos", { json: { cnj, titulo: "Processo no Paraná" } }));
    const c = await contaDe(await novoPrazo({ processoId: noParana.id }));
    expect(c.calendarioCompleto).toBe(false);
    expect(c.calendario).toBe("TJPR");
  });

  test("data digitada à mão: não abre conta nenhuma, e diz o que o Decreta contaria", async () => {
    const id = await novoPrazo({ fimManual: "2026-12-01" });
    const c = await contaDe(id);
    expect(c.digitada).toBe(true);
    expect(c.aberta).toBeNull();
    expect(c.fim).toBe("2026-12-01");
    expect(c.pelaConta).toBe("2026-11-24");
  });

  test("dupla intimação: a conta aberta é a do marco que vence primeiro", async () => {
    const c = await contaDe(await novoPrazo({ intimadoNoSistemaEm: "2026-10-20" }));
    expect(c.pelo).toBe("sistema");
    expect(c.aberta.publicacao).toBe("2026-10-20");
    expect(c.outra.fim).toBe("2026-11-24");
    expect(c.aberta.fim).toBe(c.fim);
  });

  test("com prazo interno ligado, a conta mostra o interno", async () => {
    await chamar(cookie, "/escritorio", { method: "PUT", json: { prazoInternoDias: 2 } });
    const c = await contaDe(await novoPrazo());
    expect(c.interno).toMatchObject({ fatal: "2026-11-24", antecedencia: 2, passou: false });
    await chamar(cookie, "/escritorio", { method: "PUT", json: { prazoInternoDias: 0 } });
  });

  test("outro escritório não vê a conta, nem sabendo o endereço", async () => {
    const id = await novoPrazo();
    expect((await chamar(cookieDeOutro, `/prazos/${id}/conta`)).status).toBe(404);
  });

  describe("pela publicação", () => {
    const geraPrazo = { geraPrazo: true, dias: 15, contagem: "uteis" };

    test("com o prazo sugerido: a conta é a do prazo, com a segunda conferência à mão", async () => {
      const pub = await publicar("pub-1", CNJ, geraPrazo);
      const c = await json(chamar(cookie, `/publicacoes/${pub}/conta`));
      expect(c.prazo.confirmado).toBe(false);
      expect(c.aberta.publicacao).toBe("2026-10-29");
      expect(c.conferencia.confianca).toBeDefined();
    });

    test("sem processo: ainda não há prazo, e a conta sai da sugestão, no calendário da publicação", async () => {
      const pub = await publicar("pub-2", null, geraPrazo);
      const c = await json(chamar(cookie, `/publicacoes/${pub}/conta`));
      expect(c.prazo).toBeNull();
      expect(c.tipo).toBe("Manifestação sobre laudo");
      expect(c.aberta.publicacao).toBe("2026-10-29");
      expect(c.aberta.tribunal).toBe("TJSC");
      expect(c.fim).toBe(c.aberta.fim);
      expect(c.regra).toBe("Dias úteis (CPC, art. 219)");
    });

    test("publicação que não gera prazo não tem conta", async () => {
      const pub = await publicar("pub-3", null, { geraPrazo: false, dias: null, contagem: "uteis" });
      const r = await chamar(cookie, `/publicacoes/${pub}/conta`);
      expect(r.status).toBe(404);
      expect((await json(r)).erro).toBe("sem_conta");
    });
  });
});
