/**
 * Prazo à prova de auditoria pela API: a conta inteira na ficha, a dupla
 * intimação, a data digitada à mão, o calendário que mudou depois da
 * confirmação, a segunda conferência da sugestão (com o que a equipe
 * descarta) e o tópico de tempestividade que vai para a peça.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
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

const CNJ = "5004321-25.2026.8.24.0038";
const TEOR = "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias.";

describe.skipIf(!hasTestDatabase)("prazo à prova de auditoria", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  let prazoId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  /** Uma publicação do processo, com a sugestão da IA de mentira já lida. */
  async function publicar(idExterno: string, tipoDocumento: string, sugestao: { tipo: string; dias: number; contagem?: "uteis" | "corridos" }) {
    const [pubId] = await withTenant(t.db, orgId, (tx) =>
      gravarComunicacoes(tx, orgId, "41233/SC", [
        { idExterno, disponibilizadaEm: "2026-10-28", tribunal: "TJSC", orgao: "2ª Vara Cível da Comarca de Joinville", tipoComunicacao: "Intimação", tipoDocumento, classe: "Procedimento Comum Cível", cnj: CNJ, texto: TEOR, link: null, destinatarios: [], advogados: [] },
      ]),
    );
    ia.respostas["sugerir-prazo"] = { geraPrazo: true, tipo: sugestao.tipo, dias: sugestao.dias, contagem: sugestao.contagem ?? "uteis", fundamento: null, audiencia: null, resumo: "Intimação.", assunto: "intimação", recusa: null };
    const a = await sugerirPrazoDaPublicacao({ db: t.db, ia }, orgId, pubId!);
    return { pubId: pubId!, sugestao: a!.conteudo as Record<string, any> };
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({
      db: t.db,
      auth,
      ia,
      arquivos: armazenamentoEmMemoria(),
      mailer: createLogMailer(() => {}),
      telas: "https://decreta.local",
      captura: { db: t.db, datajudKey: "" },
      maxArquivoBytes: 5e6,
      enfileirar: async () => {},
      log: () => {},
    });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, {
      nome: "Souza & Mendes Advocacia",
      slug: "souza",
      dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41.233", oabUf: "SC" },
    }));
    const entrou = await app.request("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json", origin: env.WEB_ORIGIN },
      body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }),
    });
    cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    const p = await json(
      call("/processos", {
        method: "POST",
        json: { cnj: CNJ, orgao: "2ª Vara Cível", comarca: "Joinville", partes: [{ nome: "Marina Duarte", polo: "ativo", cliente: true }, { nome: "Seguradora Alfa S.A.", polo: "passivo" }] },
      }),
    );
    processoId = p.id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("a sugestão vem conferida: regra aplicada e confiança", async () => {
    const { sugestao } = await publicar("900001", "Despacho", { tipo: "Manifestação sobre laudo pericial", dias: 15 });
    expect(sugestao.regra).toBe("Dias úteis (CPC, art. 219)");
    expect(sugestao.conferencia).toEqual({ confianca: "alta", motivos: ["Bate com a lei: 15 dias (CPC, art. 477, § 1º)."] });
    const lista = await json(call("/prazos?quando=abertos"));
    prazoId = lista.itens[0].id;
    expect((await json(call(`/prazos/${prazoId}`))).conferencia.confianca).toBe("alta");
  });

  test("a ficha mostra a conta inteira, com quem confirmou e a tempestividade", async () => {
    const pub = (await json(call("/publicacoes?situacao=nova"))).itens[0];
    await call(`/publicacoes/${pub.id}/confirmar`, { method: "POST", json: { tipo: "Manifestação sobre laudo pericial", dias: 15, contagem: "uteis" } });
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.conferencia).toBeNull();
    expect(p.conta).toMatchObject({
      regra: "Dias úteis (CPC, art. 219)",
      calendario: "TJSC, com os feriados cadastrados para a comarca de Joinville",
      disponibilizadaEm: "2026-10-28",
      publicadoEm: "2026-10-29",
      intimadoNoSistemaEm: null,
      pelo: "publicacao",
      outra: null,
      inicio: "2026-10-30",
      fim: "2026-11-23",
      prorrogadoDe: null,
      fimDigitado: false,
      pelaConta: null,
      confirmadoPor: { apelido: "Beatriz" },
    });
    expect(p.conta.explicacao).toBe("Começa em 30/10, primeiro dia útil depois da publicação. Fora da conta: fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra).");
    expect(p.conta.desconsiderados.map((d: { dia: string }) => d.dia)).toEqual(["2026-11-02", "2026-11-20"]);
    expect(p.conta.tempestividade).toStartWith("A intimação foi disponibilizada no Diário de Justiça Eletrônico Nacional (DJEN) em 28/10/2026");
    expect(p.conta.tempestividade).toEndWith("Apresentada até 23/11/2026, a presente peça é tempestiva.");
  });

  test("com a certidão do DJEN guardada, o tópico cita a certidão e a ficha diz qual anexar", async () => {
    expect((await json(call(`/prazos/${prazoId}`))).conta.certidaoDe).toBeNull();
    // Só o hash não basta: o DJEN pode não ter a certidão, e o tópico citaria um anexo que a pessoa não tem.
    await t.owner`update publicacoes set hash = 'h900001' where id_externo = '900001'`;
    expect((await json(call(`/prazos/${prazoId}`))).conta.tempestividade).not.toContain("certidão");
    const [pub] = await t.owner<{ id: string }[]>`update publicacoes set certidao = ${`${orgId}/certidoes/900001.pdf`} where id_externo = '900001' returning id`;
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.conta.certidaoDe).toBe(pub!.id);
    expect(p.conta.tempestividade).toContain("em 28/10/2026, conforme a certidão de publicação emitida pelo próprio DJEN (anexa), e considera-se publicada em 29/10/2026");
  });

  test("dupla intimação: vale o que vence primeiro, e a outra conta fica à vista", async () => {
    const previa = await json(call("/prazos/calcular", { method: "POST", json: { processoId, publicadoEm: "2026-10-29", intimadoNoSistemaEm: "2026-10-27", dias: 15, contagem: "uteis" } }));
    expect(previa).toMatchObject({ fim: "2026-11-18", pelo: "sistema", outra: { fim: "2026-11-23" } });

    await call(`/prazos/${prazoId}`, { method: "PUT", json: { intimadoNoSistemaEm: "2026-10-27" } });
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.fim).toBe("2026-11-18");
    expect(p.conta).toMatchObject({ intimadoNoSistemaEm: "2026-10-27", pelo: "sistema", inicio: "2026-10-28", fim: "2026-11-18", outra: { inicio: "2026-10-30", fim: "2026-11-23" } });
    // A peça argumenta pelo DJEN, o marco que a Res. CNJ 455/2022 manda usar.
    expect(p.conta.tempestividade).toContain("termina em 23/11/2026");

    await call(`/prazos/${prazoId}`, { method: "PUT", json: { intimadoNoSistemaEm: null } });
    expect((await json(call(`/prazos/${prazoId}`))).fim).toBe("2026-11-23");
  });

  test("data final digitada à mão: fica marcada, e a conta continua à vista", async () => {
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { fimManual: "2026-11-24" } });
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.conta).toMatchObject({ fim: "2026-11-24", fimDigitado: true, pelaConta: "2026-11-23", tempestividade: null });
    // Trocar só o responsável, sem mexer na conta, não refaz a data digitada à mão.
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { responsavelId: null } });
    expect((await json(call(`/prazos/${prazoId}`))).conta).toMatchObject({ fim: "2026-11-24", fimDigitado: true });
    await call(`/prazos/${prazoId}`, { method: "PUT", json: { fimManual: null, observacoes: null } });
    expect((await json(call(`/prazos/${prazoId}`))).conta).toMatchObject({ fim: "2026-11-23", fimDigitado: false, pelaConta: null });
  });

  test("feriado cadastrado depois da confirmação: a ficha avisa que a conta mudou", async () => {
    expect((await call("/suspensoes", { method: "POST", json: { dia: "2026-11-10", motivo: "Feriado municipal", tipo: "local", comarca: "Joinville" } })).status).toBe(201);
    const p = await json(call(`/prazos/${prazoId}`));
    expect(p.fim).toBe("2026-11-23");
    expect(p.conta).toMatchObject({ fim: "2026-11-23", fimDigitado: false, pelaConta: "2026-11-24" });
    // Ajustar reconta com o calendário de hoje.
    await call(`/prazos/${prazoId}`, { method: "PUT", json: {} });
    expect((await json(call(`/prazos/${prazoId}`))).conta).toMatchObject({ fim: "2026-11-24", pelaConta: null });
  });

  test("a peça recebe o tópico de tempestividade montado pela conta", async () => {
    ia.respostas["gerar-documento"] = "# Excelentíssimo Senhor Doutor Juiz\n\nManifestação.";
    const r = await call("/pecas", { method: "POST", json: { processoId, prazoId, tipo: "manifestacao-laudo", instrucoes: "Concordar com o laudo." } });
    expect(r.status).toBe(200);
    await r.text();
    const pedido = JSON.stringify(ia.pedidos["gerar-documento"]);
    expect(pedido).toContain("## Tempestividade");
    expect(pedido).toContain("Apresentada até 24/11/2026, a presente peça é tempestiva.");
    expect(pedido).toContain("conforme a certidão de publicação emitida pelo próprio DJEN (anexa)");
  });

  test("conferência baixa: recurso contra despacho e dias que não batem", async () => {
    const { sugestao } = await publicar("900002", "Despacho", { tipo: "Apelação", dias: 10 });
    expect(sugestao.conferencia).toEqual({
      confianca: "baixa",
      motivos: ["Despacho não tem recurso (CPC, art. 1.001); a sugestão é de apelação.", "Para apelação, a lei dá 15 dias (CPC, art. 1.003, § 5º); a sugestão diz 10."],
    });
  });

  test("o que a equipe sempre descarta perde a confiança", async () => {
    for (const idExterno of ["900003", "900004", "900005"]) {
      const { pubId } = await publicar(idExterno, "Despacho", { tipo: "Manifestação sobre documentos", dias: 5 });
      expect((await call(`/publicacoes/${pubId}/sem-prazo`, { method: "POST" })).status).toBe(200);
    }
    const { sugestao } = await publicar("900006", "Despacho", { tipo: "Manifestação sobre documentos", dias: 5 });
    expect(sugestao.conferencia).toEqual({ confianca: "baixa", motivos: ["A equipe descartou 3 sugestões de manifestação sobre documentos e não confirmou nenhuma."] });
  });
});
