/**
 * O que a situação na assinatura permite, na API: escritório antigo nunca é travado; o novo começa em teste de 14
 * dias; o teste que acaba e o atraso viram só leitura e bloqueio no dia certo; só leitura recusa escrita mas deixa
 * pagar, exportar e encerrar; o WhatsApp, a IA e o DataJud param, as publicações só param no bloqueio do atraso; e, com a cobrança desligada, tudo age como antes.
 */
import { estadoDaAssinatura, hojeEm, somarDias, VERSAO_DOS_TERMOS } from "@decreta/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { escritoriosAtivos, escritoriosDoDjen, releiturasPendentes } from "../src/inngest.ts";
import { acessoLiberado, comoNasce, estadoDoEscritorio, temAcessoTotal } from "../src/servicos/assinatura.ts";
import { capturarDjen, foraDaCaptura, foraDoDataJud } from "../src/servicos/captura.ts";
import { enviarAvisosDaAssinatura } from "../src/servicos/cobranca.ts";
import { dia, montarApi, organizacao, porNaAssinatura } from "./cobranca-apoio.ts";

const HOJE = hojeEm("America/Sao_Paulo");

describe("o que a API recusa em cada acesso", () => {
  test("total passa tudo; leitura só lê; bloqueado só paga, leva os dados e encerra", () => {
    expect(acessoLiberado("total", "POST", "/clientes")).toBe(true);
    expect(acessoLiberado("leitura", "GET", "/clientes")).toBe(true);
    expect(acessoLiberado("leitura", "POST", "/clientes")).toBe(false);
    expect(acessoLiberado("leitura", "PUT", "/escritorio")).toBe(false);
    expect(acessoLiberado("leitura", "DELETE", "/suspensoes/x")).toBe(false);
    expect(acessoLiberado("bloqueado", "GET", "/clientes")).toBe(false);
    // O que continua aberto sem acesso total.
    for (const acesso of ["leitura", "bloqueado"] as const) {
      expect(acessoLiberado(acesso, "GET", "/eu")).toBe(true);
      expect(acessoLiberado(acesso, "GET", "/plano")).toBe(true);
      expect(acessoLiberado(acesso, "POST", "/plano/assinar")).toBe(true);
      expect(acessoLiberado(acesso, "POST", "/plano/cancelar")).toBe(true);
      expect(acessoLiberado(acesso, "POST", "/escritorio/exportacoes")).toBe(true);
      expect(acessoLiberado(acesso, "GET", "/escritorio/exportacoes")).toBe(true);
      expect(acessoLiberado(acesso, "GET", "/escritorio/exportacoes/6f1c0b9e-1111-2222-3333-444455556666/partes/1")).toBe(true);
      expect(acessoLiberado(acesso, "POST", "/escritorio/encerrar")).toBe(true);
    }
    // Mas só isso: nada de escrever por uma porta parecida.
    expect(acessoLiberado("leitura", "POST", "/plano")).toBe(false);
    expect(acessoLiberado("leitura", "POST", "/escritorio/exportacoes/x/partes/1")).toBe(false);
    expect(acessoLiberado("bloqueado", "GET", "/escritorio")).toBe(false);
  });
});

describe("a passagem de cada situação no dia certo, na hora de Brasília", () => {
  const teste = { situacao: "teste" as const, testeAte: "2026-11-16", inadimplenteDesde: null, acessoAte: null, timezone: "America/Sao_Paulo" };
  const atraso = { situacao: "inadimplente" as const, testeAte: null, inadimplenteDesde: "2026-11-10", acessoAte: null, timezone: "America/Sao_Paulo" };

  test("o teste vale até o último minuto do último dia e vira só leitura à meia-noite", () => {
    expect(estadoDoEscritorio(teste, true, new Date("2026-11-17T02:59:59Z")).acesso).toBe("total");
    expect(estadoDoEscritorio(teste, true, new Date("2026-11-17T03:00:00Z"))).toMatchObject({ acesso: "leitura", situacao: "so_leitura", motivo: "fim_do_teste" });
  });

  test("o atraso vira só leitura no 7º dia e bloqueio no 15º, à meia-noite", () => {
    expect(estadoDoEscritorio(atraso, true, new Date("2026-11-17T02:59:59Z")).acesso).toBe("total");
    expect(estadoDoEscritorio(atraso, true, new Date("2026-11-17T03:00:00Z")).acesso).toBe("leitura");
    expect(estadoDoEscritorio(atraso, true, new Date("2026-11-25T02:59:59Z")).acesso).toBe("leitura");
    expect(estadoDoEscritorio(atraso, true, new Date("2026-11-25T03:00:00Z")).acesso).toBe("bloqueado");
  });

  test("com a cobrança desligada o acesso é total em qualquer data", () => {
    expect(estadoDoEscritorio(teste, false, new Date("2030-01-01T12:00:00Z")).acesso).toBe("total");
    expect(estadoDoEscritorio(atraso, false, new Date("2030-01-01T12:00:00Z")).acesso).toBe("total");
    expect(estadoDaAssinatura({ situacao: "bloqueado", testeAte: null, inadimplenteDesde: null, acessoAte: null }, HOJE).acesso).toBe("bloqueado");
    expect(estadoDoEscritorio({ ...teste, situacao: "bloqueado" }, false).acesso).toBe("total");
  });
});

describe.skipIf(!hasTestDatabase)("acesso por situação", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  let desligada: ReturnType<typeof montarApi>;

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true });
    desligada = montarApi(t, { ativa: false });
  });

  afterAll(async () => {
    await t?.drop();
  });

  /** Um escritório com a situação posta direto no banco, e a sócia dele dentro. */
  const escritorio = async (slug: string, campos: Parameters<typeof porNaAssinatura>[2]) => {
    const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: `Sócia ${slug}` });
    await porNaAssinatura(t, organizationId, campos);
    return { organizationId, cookie: await m.entrar(`${slug}@exemplo.adv.br`) };
  };
  const cliente = (cookie: string, nome = "Cliente Novo") => m.com(cookie, "/clientes", { json: { nome } });

  describe("escritório antigo e cobrança desligada", () => {
    test("todo escritório criado sem a cobrança é cortesia, e cortesia nunca é travada, mesmo com datas velhas", async () => {
      const { organizationId, cookie } = await escritorio("antigo", { teste_ate: somarDias(HOJE, -400), inadimplente_desde: somarDias(HOJE, -300) });
      expect((await organizacao(t, organizationId)).situacao).toBe("cortesia");
      expect((await cliente(cookie)).status).toBe(201);
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "cortesia", acesso: "total", aviso: null });
      expect((await m.com(cookie, "/escritorio/exportacoes", { method: "POST" })).status).toBe(202);
    });

    test("cobrança desligada: até o teste vencido e o atraso antigo escrevem como sempre, e a tela não ganha aviso nenhum", async () => {
      const { organizationId } = await m.novo({ nome: "Vencido Sem Cobrança", slug: "vencido-off", email: "vencido-off@exemplo.adv.br", pessoa: "Sócia" });
      await porNaAssinatura(t, organizationId, { situacao: "teste", teste_ate: somarDias(HOJE, -5) });
      const c = await desligada.entrar("vencido-off@exemplo.adv.br");
      expect((await desligada.com(c, "/clientes", { json: { nome: "Pode Salvar" } })).status).toBe(201);
      expect((await desligada.json(desligada.com(c, "/eu"))).assinatura).toBeUndefined();
      expect(await temAcessoTotal(t.db, organizationId, false)).toBe(true);
      expect(await foraDaCaptura(t.db, organizationId, false)).toBe(false);
      await porNaAssinatura(t, organizationId, { situacao: "bloqueado" });
      expect((await desligada.com(c, "/clientes", { json: { nome: "Ainda Salva" } })).status).toBe(201);
    });
  });

  describe("o cadastro aberto", () => {
    const cadastrar = (api: ReturnType<typeof montarApi>, email: string, ip: string) =>
      api.app.request("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json", origin: api.env.WEB_ORIGIN, "x-forwarded-for": ip },
        body: JSON.stringify({ nome: "Beatriz Souza", email, senha: "senha-bem-longa-123", escritorio: `Casa de ${email.split("@")[0]}`, termos: VERSAO_DOS_TERMOS }),
      });

    test("com a cobrança ligada o escritório novo começa em teste de 14 dias, sem cartão, e a tela já diz o prazo", async () => {
      const r = await cadastrar(m, "nova@exemplo.adv.br", "203.0.113.10");
      expect(r.status).toBe(201);
      const { escritorio: e } = await m.json(r);
      const o = await organizacao(t, e.id);
      expect(o).toMatchObject({ situacao: "teste", em_avaliacao: true, asaas_assinatura_id: null });
      expect(dia(o.teste_ate)).toBe(somarDias(HOJE, 14));
      const cookie = r.headers.get("set-cookie")!.split(";")[0]!;
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "teste", acesso: "total" });
      expect(eu.assinatura.aviso.nivel).toBe("info");
      expect(eu.assinatura.aviso.texto).toContain("faltam 14 dias");
      expect(eu.assinatura.aviso.texto).toContain("Sem cartão");
    });

    test("sem a cobrança o cadastro continua como antes: cortesia, sem prazo", async () => {
      const r = await cadastrar(desligada, "antes@exemplo.adv.br", "203.0.113.11");
      expect(r.status).toBe(201);
      const { escritorio: e } = await m.json(r);
      const o = await organizacao(t, e.id);
      expect(o).toMatchObject({ situacao: "cortesia", teste_ate: null, em_avaliacao: true });
    });

    test("o prazo do teste é o do plano", () => {
      expect(comoNasce(true, true, "2026-11-02")).toEqual({ situacao: "teste", testeAte: "2026-11-16" });
      expect(comoNasce(true, false, "2026-11-02")).toEqual({ situacao: "cortesia", testeAte: null });
      expect(comoNasce(false, true, "2026-11-02")).toEqual({ situacao: "cortesia", testeAte: null });
    });
  });

  describe("fim do teste", () => {
    let org = "";
    let cookie = "";

    beforeAll(async () => {
      ({ organizationId: org, cookie } = await escritorio("teste-acabando", { situacao: "teste", teste_ate: HOJE }));
    });

    test("no último dia do teste ainda escreve", async () => {
      expect((await cliente(cookie, "Último Dia")).status).toBe(201);
    });

    test("no dia seguinte o escritório fica só para leitura: recusa escrita com a frase clara, e lê, paga, exporta e encerra", async () => {
      await porNaAssinatura(t, org, { teste_ate: somarDias(HOJE, -1) });

      for (const r of [await cliente(cookie), await m.com(cookie, "/prazos", { json: {} }), await m.com(cookie, "/escritorio", { method: "PUT", json: { capturaDjen: false } }), await m.com(cookie, "/ia/perguntar", { json: { pergunta: "oi" } })]) {
        expect(r.status).toBe(403);
        const corpo = await m.json(r);
        expect(corpo.erro).toBe("so_leitura");
        expect(corpo.detalhe).toContain("O teste grátis acabou");
        expect(corpo.detalhe).toContain("só para leitura");
        expect(corpo.detalhe).toContain("Nada foi apagado");
      }
      // Ler continua.
      expect((await m.com(cookie, "/clientes")).status).toBe(200);
      expect((await m.com(cookie, "/prazos")).status).toBe(200);
      expect((await m.com(cookie, "/hoje")).status).toBe(200);
      // Pagar (não é recusado por estar só leitura; aqui o valor do plano ainda é nulo, então o motivo é outro).
      const assinar = await m.com(cookie, "/plano/assinar", { method: "POST" });
      expect(assinar.status).toBe(409);
      expect((await m.json(assinar)).erro).toBe("valor_nao_definido");
      expect((await m.com(cookie, "/plano")).status).toBe(200);
      // Levar os dados.
      expect((await m.com(cookie, "/escritorio/exportacoes", { method: "POST" })).status).toBe(202);
      expect((await m.com(cookie, "/escritorio/exportacoes")).status).toBe(200);
      // Encerrar: chega até a conferência do nome.
      const encerrar = await m.com(cookie, "/escritorio/encerrar", { json: { confirmacao: "outro nome" } });
      expect(encerrar.status).toBe(422);
      expect((await m.json(encerrar)).erro).toBe("confirmacao_errada");
      // O que já estava salvo continua lá.
      const lista = await m.json(m.com(cookie, "/clientes"));
      expect(JSON.stringify(lista)).toContain("Último Dia");
    });

    test("a tela recebe o aviso grave, com a data, e o que o escritório pode fazer", async () => {
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "so_leitura", acesso: "leitura" });
      expect(eu.assinatura.aviso.nivel).toBe("grave");
      expect(eu.assinatura.aviso.texto).toContain(somarDias(HOJE, -1).split("-").reverse().join("/"));
      expect(eu.assinatura.aviso.texto).toContain("publicações do DJEN");
    });

    test("a equipe do Decreta estende o teste e o escritório volta a escrever", async () => {
      await porNaAssinatura(t, org, { teste_ate: somarDias(HOJE, 5) });
      expect((await cliente(cookie, "Voltou")).status).toBe(201);
    });

    test("convidar alguém também é escrita: só leitura não manda convite", async () => {
      await porNaAssinatura(t, org, { teste_ate: somarDias(HOJE, -1) });
      const r = await m.app.request("/api/auth/organization/invite-member", {
        method: "POST",
        headers: { "content-type": "application/json", origin: m.env.WEB_ORIGIN, cookie },
        body: JSON.stringify({ email: "novo@exemplo.adv.br", role: "member", organizationId: org }),
      });
      expect(r.status).toBe(403);
      expect((await m.json(r)).code).toBe("SO_LEITURA");
    });
  });

  describe("atraso no pagamento", () => {
    let org = "";
    let cookie = "";

    beforeAll(async () => {
      ({ organizationId: org, cookie } = await escritorio("atrasado", { situacao: "inadimplente", inadimplente_desde: somarDias(HOJE, -1), assinou_em: new Date().toISOString() }));
    });

    const comAtraso = (dias: number) => porNaAssinatura(t, org, { inadimplente_desde: somarDias(HOJE, -dias) });

    test("do 1º ao 6º dia só avisa: continua escrevendo", async () => {
      for (const dias of [1, 3, 6]) {
        await comAtraso(dias);
        expect((await cliente(cookie, `Atraso ${dias}`)).status).toBe(201);
        const eu = await m.json(m.com(cookie, "/eu"));
        expect(eu.assinatura).toMatchObject({ situacao: "inadimplente", acesso: "total" });
        expect(eu.assinatura.aviso.nivel).toBe("atencao");
      }
    });

    test("no 7º dia vira só leitura, avisando quando bloqueia", async () => {
      await comAtraso(7);
      expect((await cliente(cookie)).status).toBe(403);
      expect((await m.com(cookie, "/clientes")).status).toBe(200);
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "so_leitura", acesso: "leitura" });
      expect(eu.assinatura.aviso.texto).toContain(somarDias(HOJE, 8).split("-").reverse().join("/"));
      await comAtraso(14);
      expect((await m.json(m.com(cookie, "/eu"))).assinatura.acesso).toBe("leitura");
    });

    test("no 15º dia bloqueia: só paga, leva os dados e encerra; nada mais abre, nem a leitura", async () => {
      await comAtraso(15);
      const lista = await m.com(cookie, "/clientes");
      expect(lista.status).toBe(403);
      const corpo = await m.json(lista);
      expect(corpo.erro).toBe("escritorio_bloqueado");
      expect(corpo.detalhe).toContain("falta de pagamento");
      expect((await cliente(cookie)).status).toBe(403);
      expect((await m.com(cookie, "/hoje")).status).toBe(403);
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "bloqueado", acesso: "bloqueado" });
      expect(eu.assinatura.aviso.nivel).toBe("grave");
      expect((await m.com(cookie, "/plano")).status).toBe(200);
      expect((await m.com(cookie, "/escritorio/exportacoes", { method: "POST" })).status).toBe(202);
      expect((await m.com(cookie, "/escritorio/exportacoes")).status).toBe(200);
      expect((await m.com(cookie, "/escritorio/encerrar", { json: { confirmacao: "nome errado" } })).status).toBe(422);
    });
  });

  describe("o WhatsApp, a IA e o DataJud param; as publicações seguem regra própria", () => {
    test("só entra nas rotinas quem tem acesso total", async () => {
      const total = await escritorio("rotina-total", { situacao: "ativo" });
      const cortesia = await escritorio("rotina-cortesia", {});
      const testeVigente = await escritorio("rotina-teste", { situacao: "teste", teste_ate: somarDias(HOJE, 3) });
      const testeAcabou = await escritorio("rotina-acabou", { situacao: "teste", teste_ate: somarDias(HOJE, -1) });
      const atrasado = await escritorio("rotina-atraso", { situacao: "inadimplente", inadimplente_desde: somarDias(HOJE, -9) });
      const bloqueado = await escritorio("rotina-bloqueado", { situacao: "bloqueado" });
      const soLeitura = await escritorio("rotina-leitura", { situacao: "so_leitura" });
      const ids = (lista: { id: string }[]) => new Set(lista.map((o) => o.id));

      const com = ids(await escritoriosAtivos(t.db, true));
      for (const o of [total, cortesia, testeVigente]) expect(com.has(o.organizationId)).toBe(true);
      for (const o of [testeAcabou, atrasado, bloqueado, soLeitura]) expect(com.has(o.organizationId)).toBe(false);

      // Com a cobrança desligada, todos entram, como antes.
      const sem = ids(await escritoriosAtivos(t.db, false));
      for (const o of [total, cortesia, testeVigente, testeAcabou, atrasado, bloqueado, soLeitura]) expect(sem.has(o.organizationId)).toBe(true);

      for (const o of [testeAcabou, atrasado, bloqueado, soLeitura]) {
        expect(await temAcessoTotal(t.db, o.organizationId, true)).toBe(false);
        expect(await foraDoDataJud(t.db, o.organizationId, true)).toBe(true);
      }
      for (const o of [total, cortesia, testeVigente]) {
        expect(await temAcessoTotal(t.db, o.organizationId, true)).toBe(true);
        expect(await foraDoDataJud(t.db, o.organizationId, true)).toBe(false);
      }
      expect(await releiturasPendentes(t.db, true)).toEqual([]);

      // As publicações têm regra própria: quem já era cliente e atrasou continua recebendo. O resto das rotinas (acima) para.
      const doDjen = ids(await escritoriosDoDjen(t.db, true));
      for (const o of [total, cortesia, testeVigente, atrasado]) {
        expect(doDjen.has(o.organizationId)).toBe(true);
        expect(await foraDaCaptura(t.db, o.organizationId, true)).toBe(false);
      }
      for (const o of [testeAcabou, bloqueado, soLeitura]) {
        expect(doDjen.has(o.organizationId)).toBe(false);
        expect(await foraDaCaptura(t.db, o.organizationId, true)).toBe(true);
      }
      const semCobranca = ids(await escritoriosDoDjen(t.db, false));
      for (const o of [total, cortesia, testeVigente, testeAcabou, atrasado, bloqueado, soLeitura]) expect(semCobranca.has(o.organizationId)).toBe(true);
    });

    test("quem atrasou há 7 dias continua indo ao DJEN; aos 15, bloqueado, a busca nem sai", async () => {
      const emAtraso = await escritorio("djen-atraso", { situacao: "inadimplente", inadimplente_desde: somarDias(HOJE, -9) });
      const bloqueadoPorAtraso = await escritorio("djen-atraso-15", { situacao: "inadimplente", inadimplente_desde: somarDias(HOJE, -15) });
      for (const o of [emAtraso, bloqueadoPorAtraso]) await t.owner`update equipe set oab_numero = '12345', oab_uf = 'SC' where organization_id = ${o.organizationId}`;
      let chamadas = 0;
      const fetch = (async () => {
        chamadas++;
        return new Response(JSON.stringify({ status: "success", message: "ok", count: 0, items: [] }), { headers: { "content-type": "application/json" } });
      }) as unknown as typeof globalThis.fetch;
      const periodo = { de: somarDias(HOJE, -3), ate: HOJE };
      expect(await capturarDjen({ db: t.db, datajudKey: "", fetch, cobrancaAtiva: true }, bloqueadoPorAtraso.organizationId, periodo)).toEqual({ encontradas: 0, novas: [] });
      expect(chamadas).toBe(0);
      await capturarDjen({ db: t.db, datajudKey: "", fetch, cobrancaAtiva: true }, emAtraso.organizationId, periodo).catch(() => {});
      expect(chamadas).toBeGreaterThan(0);
    });

    test("o escritório só leitura por decisão da equipe não vai ao DJEN: a busca nem chega a sair", async () => {
      const parado = await escritorio("djen-parado", { situacao: "so_leitura" });
      const vivo = await escritorio("djen-vivo", { situacao: "ativo" });
      for (const o of [parado, vivo]) await t.owner`update equipe set oab_numero = '12345', oab_uf = 'SC' where organization_id = ${o.organizationId}`;
      let chamadas = 0;
      const fetch = (async () => {
        chamadas++;
        return new Response(JSON.stringify({ status: "success", message: "ok", count: 0, items: [] }), { headers: { "content-type": "application/json" } });
      }) as unknown as typeof globalThis.fetch;
      const periodo = { de: somarDias(HOJE, -3), ate: HOJE };
      expect(await capturarDjen({ db: t.db, datajudKey: "", fetch, cobrancaAtiva: true }, parado.organizationId, periodo)).toEqual({ encontradas: 0, novas: [] });
      expect(chamadas).toBe(0);
      await capturarDjen({ db: t.db, datajudKey: "", fetch, cobrancaAtiva: true }, vivo.organizationId, periodo).catch(() => {});
      expect(chamadas).toBeGreaterThan(0);
    });
  });

  describe("avisos por e-mail ao sócio", () => {
    const paraSocio = (slug: string) => m.mailer.sent.filter((e) => e.to === `${slug}@exemplo.adv.br`);
    const rodar = () => enviarAvisosDaAssinatura({ db: t.db, mailer: m.mailer, telas: "https://decreta.local", log: () => {} });

    test("o teste avisa 3 dias e 1 dia antes do fim, e depois de acabar: uma vez cada", async () => {
      const { organizationId } = await escritorio("aviso-teste", { situacao: "teste", teste_ate: somarDias(HOJE, 5) });
      await rodar();
      expect(paraSocio("aviso-teste")).toHaveLength(0);

      await porNaAssinatura(t, organizationId, { teste_ate: somarDias(HOJE, 3) });
      expect((await rodar()).enviados).toBeGreaterThanOrEqual(1);
      expect(paraSocio("aviso-teste")).toHaveLength(1);
      const tres = paraSocio("aviso-teste")[0]!;
      expect(tres.subject).toContain("termina em 3 dias");
      // O nome do escritório vai sem artigo: "O Casa da Nota" não concorda.
      expect(tres.subject).toMatch(/^.+: o teste no Decreta termina em 3 dias$/);
      expect(tres.paragraphs.join(" ")).toContain(somarDias(HOJE, 3).split("-").reverse().join("/"));
      expect(tres.paragraphs.join(" ")).toContain("publicações do DJEN");
      expect(tres.action?.url).toBe("https://decreta.local/configuracoes?aba=plano");
      await rodar();
      expect(paraSocio("aviso-teste")).toHaveLength(1);

      await porNaAssinatura(t, organizationId, { teste_ate: somarDias(HOJE, 1) });
      await rodar();
      await rodar();
      expect(paraSocio("aviso-teste")).toHaveLength(2);
      expect(paraSocio("aviso-teste")[1]!.subject).toContain("amanhã");

      await porNaAssinatura(t, organizationId, { teste_ate: somarDias(HOJE, -1) });
      await rodar();
      await rodar();
      expect(paraSocio("aviso-teste")).toHaveLength(3);
      expect(paraSocio("aviso-teste")[2]!.subject).toContain("só para leitura");
    });

    test("a fatura em atraso avisa no 1º dia e antes de cada passo da régua, uma vez cada", async () => {
      const { organizationId } = await escritorio("aviso-atraso", { situacao: "inadimplente", inadimplente_desde: somarDias(HOJE, -1), assinou_em: new Date().toISOString() });
      const proximo = async (dias: number, assunto: string, total: number) => {
        await porNaAssinatura(t, organizationId, { inadimplente_desde: somarDias(HOJE, -dias) });
        await rodar();
        await rodar();
        expect(paraSocio("aviso-atraso")).toHaveLength(total);
        expect(paraSocio("aviso-atraso").at(-1)!.subject).toContain(assunto);
      };
      await proximo(1, "Fatura em atraso", 1);
      await proximo(3, "Fatura em atraso", 1);
      await proximo(5, "só para leitura em 2 dias", 2);
      await proximo(7, "está só para leitura", 3);
      await proximo(13, "bloqueado em 2 dias", 4);
      await proximo(15, "foi bloqueado", 5);
    });

    test("cortesia, escritório ativo, só leitura da equipe e a demonstração não recebem aviso", async () => {
      await escritorio("aviso-cortesia", {});
      await escritorio("aviso-ativo", { situacao: "ativo" });
      await escritorio("aviso-manual", { situacao: "so_leitura" });
      await rodar();
      for (const slug of ["aviso-cortesia", "aviso-ativo", "aviso-manual"]) expect(paraSocio(slug)).toHaveLength(0);
    });
  });
});
