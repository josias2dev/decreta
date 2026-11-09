/**
 * A etapa 2 do painel da plataforma: os planos editáveis com versão, a licença de cada escritório (preço, desconto,
 * cupom, limites e o que o plano deixa de fora), as notas da equipe, os ajustes que saíram do `.env`, as faturas, as
 * recusas da IA e as ações novas sobre as pessoas. Tudo com dados inventados.
 */
import { hojeEm, somarDias } from "@decreta/core";
import { withTenant } from "@decreta/db";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { SENHA, dia, montarApi, organizacao, porNaAssinatura } from "./cobranca-apoio.ts";
import { whatsappQueResta } from "../src/servicos/planos.ts";

const HOJE = hojeEm("America/Sao_Paulo");
const OPERADOR = "equipe@decreta.site";

type Plano = { id: string; codigo: string; versao: number; nome: string; mensalCentavos: number | null; padrao: boolean; substituidoEm: string | null; escritorios: number; assinantes: number };

describe.skipIf(!hasTestDatabase)("planos e licenças", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  let operador = "";

  const escritorio = async (slug: string, campos: Parameters<typeof porNaAssinatura>[2] = {}) => {
    const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: `Sócia ${slug}` });
    await porNaAssinatura(t, organizationId, campos);
    return { id: organizationId, cookie: await m.entrar(`${slug}@exemplo.adv.br`) };
  };
  const acao = (id: string, corpo: unknown) => m.daPlataforma(operador, `/escritorios/${id}/acao`, { json: corpo });
  const planos = async () => (await m.json(m.daPlataforma(operador, "/planos"))) as { planos: Plano[]; cupons: any[]; ajustes: any[]; cobranca: { ativa: boolean } };
  const padrao = async () => (await planos()).planos.find((p) => p.padrao && !p.substituidoEm)!;
  const ultimaAuditoria = async () => ((await m.json(m.daPlataforma(operador, "/auditoria"))).itens as { acao: string; organizationId: string | null; detalhes: Record<string, any> }[])[0]!;
  const PLANO_BASE = { nome: "Escritório", mensalCentavos: null, anualCentavos: null, pessoasIncluidas: null, pessoaExtraCentavos: null, limites: {}, funcionalidades: {} };

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true, operadores: OPERADOR });
    await m.novo({ nome: "Decreta Interno", slug: "decreta-interno", email: OPERADOR, pessoa: "Equipe do Decreta" });
    operador = await m.entrar(OPERADOR);
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("os planos", () => {
    test("a migração deixa o plano de sempre, sem preço, como padrão, e todo escritório nele", async () => {
      const r = await planos();
      expect(r.planos).toHaveLength(1);
      expect(r.planos[0]).toMatchObject({ codigo: "escritorio", versao: 1, nome: "Escritório", mensalCentavos: null, padrao: true, substituidoEm: null });
      const x = await escritorio("nasce");
      expect((await organizacao(t, x.id)).plano_id).toBe(r.planos[0]!.id);
      expect((await m.json(m.com(x.cookie, "/plano"))).plano).toMatchObject({ nome: "Escritório", valorMensalCentavos: null });
    });

    test("mudar o preço grava a versão seguinte: quem não assina passa para ela, quem assina fica na que assinou", async () => {
      const livre = await escritorio("livre");
      const assina = await escritorio("assina", { situacao: "ativo", asaas_assinatura_id: "sub_assina", valor_mensal_centavos: 0 });
      const v1 = await padrao();
      const r = await m.daPlataforma(operador, `/planos/${v1.id}`, { json: { ...PLANO_BASE, mensalCentavos: 24_900, pessoasIncluidas: 3, pessoaExtraCentavos: 4_900 } });
      expect(r.status).toBe(200);
      const feito = await m.json(r);
      expect(feito.plano).toMatchObject({ codigo: "escritorio", versao: 2, mensalCentavos: 24_900, padrao: true, substituidoEm: null });
      expect(feito.ficaram).toBeGreaterThanOrEqual(1);
      expect((await organizacao(t, livre.id)).plano_id).toBe(feito.plano.id);
      expect((await organizacao(t, assina.id)).plano_id).toBe(v1.id);
      // A versão velha não muda mais.
      expect((await m.daPlataforma(operador, `/planos/${v1.id}`, { json: PLANO_BASE })).status).toBe(409);
      const lista = await planos();
      expect(lista.planos.find((p) => p.id === v1.id)).toMatchObject({ padrao: true, assinantes: 1 });
      expect(lista.planos.find((p) => p.id === v1.id)!.substituidoEm).not.toBeNull();
      // O escritório vê o preço novo na tela do Plano.
      expect((await m.json(m.com(livre.cookie, "/plano"))).plano.valorMensalCentavos).toBe(24_900);
      const audit = await ultimaAuditoria();
      expect(audit).toMatchObject({ acao: "plataforma.plano_mudado", detalhes: { codigo: "escritorio", ficaram: 1 } });
    });

    test("um plano novo nasce sem ser o padrão, e virar o padrão tira o outro do lugar", async () => {
      const r = await m.daPlataforma(operador, "/planos", { json: { ...PLANO_BASE, nome: "Banca", mensalCentavos: 49_900, limites: { processos: 2000 } } });
      expect(r.status).toBe(201);
      const banca = (await m.json(r)).plano;
      expect(banca).toMatchObject({ codigo: "banca", versao: 1, padrao: false, limites: { processos: 2000 } });
      expect((await m.daPlataforma(operador, `/planos/${banca.id}/padrao`, { method: "POST" })).status).toBe(200);
      expect((await padrao()).id).toBe(banca.id);
      expect((await m.daPlataforma(operador, `/planos/${banca.id}/padrao`, { method: "POST" })).status).toBe(409);
      // Volta o de sempre como padrão, para os outros testes.
      const escritorioPlano = (await planos()).planos.find((p) => p.codigo === "escritorio" && !p.substituidoEm)!;
      expect((await m.daPlataforma(operador, `/planos/${escritorioPlano.id}/padrao`, { method: "POST" })).status).toBe(200);
    });

    test("dados errados no plano voltam com o que faltou", async () => {
      const v = await padrao();
      const r = await m.daPlataforma(operador, `/planos/${v.id}`, { json: { ...PLANO_BASE, mensalCentavos: -1, limites: { inventado: 3 } } });
      expect(r.status).toBe(400);
      expect((await m.json(r)).erro).toBe("dados_invalidos");
    });
  });

  describe("o que o plano deixa de fora", () => {
    test("sem Gerar peças no plano, criar peça para e ler continua; o menu sabe pelo /eu", async () => {
      const semPecas = (await m.json(m.daPlataforma(operador, "/planos", { json: { ...PLANO_BASE, nome: "Só processos", funcionalidades: { pecas: false } } }))).plano;
      const x = await escritorio("sem-pecas");
      expect((await acao(x.id, { acao: "licenca", planoId: semPecas.id, pessoasExtras: 0, valorCombinadoCentavos: null, motivo: "teste" })).status).toBe(200);
      const r = await m.com(x.cookie, "/pecas", { json: { tipo: "inicial" } });
      expect(r.status).toBe(403);
      expect(await m.json(r)).toMatchObject({ erro: "fora_do_plano" });
      expect((await m.com(x.cookie, "/pecas/catalogo")).status).toBe(200);
      expect((await m.json(m.com(x.cookie, "/eu"))).plano).toEqual({ pecas: false, financeiro: true, assinatura: true });
    });
  });

  describe("a licença do escritório", () => {
    test("pessoas a mais e valor combinado mudam a mensalidade na lista e na ficha, e ficam na auditoria", async () => {
      const x = await escritorio("licenca");
      const v = await padrao();
      expect((await acao(x.id, { acao: "licenca", planoId: v.id, pessoasExtras: 2, valorCombinadoCentavos: null, motivo: "cresceu" })).status).toBe(200);
      const ficha = await m.json(m.daPlataforma(operador, `/escritorios/${x.id}`));
      expect(ficha.licenca.preco).toMatchObject({ cheioCentavos: 24_900 + 2 * 4_900, combinado: false, mensalidadeCentavos: 24_900 + 2 * 4_900 });
      expect(ficha.licenca.uso.itens.find((i: { chave: string }) => i.chave === "pessoas")).toMatchObject({ usado: 1, limite: 5 });
      expect((await acao(x.id, { acao: "licenca", planoId: v.id, pessoasExtras: 0, valorCombinadoCentavos: 19_900, motivo: "parceria" })).status).toBe(200);
      const linha = ((await m.json(m.daPlataforma(operador, "/escritorios"))).escritorios as any[]).find((e) => e.id === x.id);
      expect(linha).toMatchObject({ mensalidadeCentavos: 19_900, comDesconto: false });
      expect((await ultimaAuditoria()).acao).toBe("plataforma.licenca");
    });

    test("o desconto vale pelos meses dados, sai quando a equipe tira e não pode passar de 100%", async () => {
      const x = await escritorio("desconto");
      expect((await acao(x.id, { acao: "desconto", tipo: "percentual", valor: 150, meses: 3 })).status).toBe(422);
      expect((await acao(x.id, { acao: "desconto", tipo: "percentual", valor: 20, meses: 3, motivo: "indicação" })).status).toBe(200);
      const ficha = await m.json(m.daPlataforma(operador, `/escritorios/${x.id}`));
      expect(ficha.licenca.desconto).toMatchObject({ tipo: "percentual", valor: 20, cupom: null });
      expect(ficha.licenca.preco.mensalidadeCentavos).toBe(Math.round(24_900 * 0.8));
      expect((await acao(x.id, { acao: "tirar_desconto" })).status).toBe(200);
      expect((await acao(x.id, { acao: "tirar_desconto" })).status).toBe(409);
    });

    test("os tetos de IA do escritório, a marca e o acesso a mais de quem cancelou", async () => {
      const x = await escritorio("tetos");
      expect((await acao(x.id, { acao: "tetos_ia", tetos: { diaUsd: 2, mesUsd: 30, mensagensPorDia: null } })).status).toBe(200);
      expect((await organizacao(t, x.id)).tetos_ia).toEqual({ diaUsd: 2, mesUsd: 30, mensagensPorDia: null });
      expect((await acao(x.id, { acao: "tetos_ia", tetos: { diaUsd: null, mesUsd: null, mensagensPorDia: null } })).status).toBe(200);
      expect((await organizacao(t, x.id)).tetos_ia).toBeNull();

      expect((await acao(x.id, { acao: "marcar", marca: "piloto" })).status).toBe(200);
      expect((await acao(x.id, { acao: "marcar", marca: "piloto" })).status).toBe(409);

      expect((await acao(x.id, { acao: "estender_acesso", dias: 10 })).status).toBe(409);
      await t.owner`update organization set cancelamento_pedido_em = now(), acesso_ate = ${somarDias(HOJE, 3)} where id = ${x.id}`;
      expect((await acao(x.id, { acao: "estender_acesso", dias: 10, motivo: "gesto comercial" })).status).toBe(200);
      expect(dia((await organizacao(t, x.id)).acesso_ate)).toBe(somarDias(HOJE, 13));
    });

    test("encerrar a pedido pede o motivo e o nome igual ao da ficha", async () => {
      const x = await escritorio("encerra");
      expect((await acao(x.id, { acao: "encerrar", confirmacao: "Escritório encerra" })).status).toBe(422);
      expect((await acao(x.id, { acao: "encerrar", confirmacao: "Outro nome", motivo: "e-mail da sócia" })).status).toBe(422);
      expect((await acao(x.id, { acao: "encerrar", confirmacao: "escritório encerra", motivo: "e-mail da sócia" })).status).toBe(200);
      expect((await organizacao(t, x.id)).encerrado_em).not.toBeNull();
      expect((await acao(x.id, { acao: "marcar", marca: "parceiro" })).status).toBe(409);
    });
  });

  describe("os cupons", () => {
    test("o código vira maiúsculo, o uso conta e o cupom esgotado, vencido ou desativado não vale", async () => {
      expect((await m.daPlataforma(operador, "/cupons", { json: { codigo: "a b", tipo: "percentual", valor: 10, meses: 2, validoAte: null, limiteDeUsos: null, nota: null } })).status).toBe(422);
      const r = await m.daPlataforma(operador, "/cupons", { json: { codigo: "oab-sc", tipo: "percentual", valor: 15, meses: 6, validoAte: null, limiteDeUsos: 1, nota: "Subseção inventada" } });
      expect(r.status).toBe(201);
      const cupom = (await m.json(r)).cupom;
      expect(cupom).toMatchObject({ codigo: "OAB-SC", usos: 0, limiteDeUsos: 1 });
      expect((await m.daPlataforma(operador, "/cupons", { json: { codigo: "OAB-SC", tipo: "valor", valor: 1000, meses: 1, validoAte: null, limiteDeUsos: null, nota: null } })).status).toBe(409);

      const a = await escritorio("cupom-a");
      const b = await escritorio("cupom-b");
      expect((await acao(a.id, { acao: "cupom", codigo: "oab-sc" })).status).toBe(200);
      expect((await organizacao(t, a.id)).desconto).toMatchObject({ tipo: "percentual", valor: 15, cupom: "OAB-SC" });
      const esgotado = await acao(b.id, { acao: "cupom", codigo: "OAB-SC" });
      expect(esgotado.status).toBe(409);
      expect((await m.json(esgotado)).detalhe).toContain("número de vezes");
      expect((await planos()).cupons.find((c: { id: string }) => c.id === cupom.id)).toMatchObject({ usos: 1 });

      const vencido = (await m.json(m.daPlataforma(operador, "/cupons", { json: { codigo: "VENCIDO", tipo: "valor", valor: 1000, meses: 1, validoAte: somarDias(HOJE, -1), limiteDeUsos: null, nota: null } }))).cupom;
      expect((await m.json(acao(b.id, { acao: "cupom", codigo: "vencido" }))).detalhe).toContain("venceu");
      expect((await m.daPlataforma(operador, `/cupons/${vencido.id}/desativar`, { method: "POST" })).status).toBe(200);
      expect((await m.json(acao(b.id, { acao: "cupom", codigo: "vencido" }))).detalhe).toContain("desativado");
      expect((await acao(b.id, { acao: "cupom", codigo: "NAO-EXISTE" })).status).toBe(404);
    });

    test("o sócio digita o cupom na tela do Plano: o desconto entra e o campo some", async () => {
      await m.daPlataforma(operador, "/cupons", { json: { codigo: "INDICA10", tipo: "percentual", valor: 10, meses: 3, validoAte: null, limiteDeUsos: null, nota: null } });
      const x = await escritorio("cupom-tela", { situacao: "teste", teste_ate: somarDias(HOJE, 10) });
      const antes = await m.json(m.com(x.cookie, "/plano"));
      expect(antes.aceitaCupom).toBe(true);
      const errado = await m.com(x.cookie, "/plano/cupom", { json: { codigo: "NAO-EXISTE" } });
      expect(errado.status).toBe(409);
      expect((await m.json(errado)).erro).toBe("cupom_recusado");
      const r = await m.com(x.cookie, "/plano/cupom", { json: { codigo: " indica10 " } });
      expect(r.status).toBe(200);
      expect((await m.json(r)).desconto).toMatchObject({ tipo: "percentual", valor: 10, cupom: "INDICA10" });
      const depois = await m.json(m.com(x.cookie, "/plano"));
      expect(depois.aceitaCupom).toBe(false);
      expect(depois.licenca.desconto).toMatchObject({ tipo: "percentual", valor: 10 });
      expect(depois.licenca.preco.descontoCentavos).toBeGreaterThan(0);
      expect((await m.com(x.cookie, "/plano/cupom", { json: { codigo: "INDICA10" } })).status).toBe(409);
    });

    test("as telas do escritório não leem os cupons nem as notas, nem por engano", async () => {
      const a = await escritorio("rls-cupom");
      const lidos = await withTenant(t.db, a.id, (tx) => tx.execute<{ n: number }>(`select (select count(*) from cupons)::int + (select count(*) from notas_da_plataforma)::int + (select count(*) from ajustes_da_plataforma)::int as n` as never));
      expect([...lidos][0]!.n).toBe(0);
    });
  });

  describe("as notas da equipe", () => {
    test("o retorno marcado aparece em Precisa de atenção até ser feito, e a auditoria não guarda o texto", async () => {
      const x = await escritorio("nota");
      const r = await m.daPlataforma(operador, `/escritorios/${x.id}/notas`, { json: { texto: "Sócia pediu proposta para 6 pessoas (texto inventado)", contato: "WhatsApp da sócia", proximoPasso: "Mandar proposta", retornoEm: somarDias(HOJE, -1) } });
      expect(r.status).toBe(201);
      const nota = (await m.json(r)).nota;
      const audit = await ultimaAuditoria();
      expect(audit).toMatchObject({ acao: "plataforma.nota", organizationId: x.id });
      expect(JSON.stringify(audit)).not.toContain("proposta para 6");
      const atencao = (await m.json(m.daPlataforma(operador, "/visao-geral"))).atencao as { tipo: string; organizationId: string }[];
      expect(atencao.some((a) => a.tipo === "retorno_marcado" && a.organizationId === x.id)).toBe(true);
      expect((await m.json(m.daPlataforma(operador, `/escritorios/${x.id}`))).notas[0]).toMatchObject({ id: nota.id, proximoPasso: "Mandar proposta", retornoFeitoEm: null });
      expect((await m.daPlataforma(operador, `/notas/${nota.id}/retorno-feito`, { method: "POST" })).status).toBe(200);
      expect((await m.daPlataforma(operador, `/notas/${nota.id}/retorno-feito`, { method: "POST" })).status).toBe(404);
      const depois = (await m.json(m.daPlataforma(operador, "/visao-geral"))).atencao as { tipo: string; organizationId: string }[];
      expect(depois.some((a) => a.tipo === "retorno_marcado" && a.organizationId === x.id)).toBe(false);
    });
  });

  describe("os ajustes", () => {
    test("a duração do teste muda no painel, vale para quem se cadastra e volta ao padrão", async () => {
      const antes = (await m.json(m.daPlataforma(operador, "/ajustes"))).ajustes.find((a: { chave: string }) => a.chave === "testeDias");
      expect(antes).toMatchObject({ valor: 14, padrao: 14, mudadoPor: null });
      expect((await m.daPlataforma(operador, "/ajustes/testeDias", { json: { valor: 0 } })).status).toBe(422);
      expect((await m.daPlataforma(operador, "/ajustes/testeDias", { json: { valor: 7.5 } })).status).toBe(422);
      expect((await m.daPlataforma(operador, "/ajustes/inventado", { json: { valor: 3 } })).status).toBe(404);
      const r = await m.json(m.daPlataforma(operador, "/ajustes/testeDias", { json: { valor: 30 } }));
      expect(r.ajuste).toMatchObject({ valor: 30, padrao: 14, mudadoPor: OPERADOR });
      expect(m.ajustes.testeDias).toBe(30);
      expect((await m.json(m.com((await escritorio("ve-teste")).cookie, "/plano"))).plano.testeDias).toBe(30);
      expect((await ultimaAuditoria()).detalhes).toMatchObject({ chave: "testeDias", de: 14, para: 30 });

      // Outro processo da API (um reinício) lê o mesmo valor do banco.
      const { Ajustes } = await import("../src/servicos/ajustes.ts");
      const outro = new Ajustes({});
      await outro.carregar(t.db);
      expect(outro.testeDias).toBe(30);

      expect((await m.json(m.daPlataforma(operador, "/ajustes/testeDias", { json: { valor: null } }))).ajuste).toMatchObject({ valor: 14, mudadoPor: null });
      expect(m.ajustes.testeDias).toBe(14);
    });

    test("os ajustes da IA aparecem na aba da IA, com o valor de agora e o padrão", async () => {
      const ia = await m.json(m.daPlataforma(operador, "/ia"));
      expect(ia.ajustes.map((a: { chave: string }) => a.chave)).toContain("ia.tetoSiteUsd");
      expect(ia.ajustes.map((a: { chave: string }) => a.chave)).not.toContain("testeDias");
      expect(ia.recusas).toMatchObject({ total: 0 });
    });
  });

  describe("as recusas da IA", () => {
    test("são contadas por motivo e por escritório, sem nenhum texto do pedido", async () => {
      const x = await escritorio("recusas");
      const userId = (await t.owner<{ id: string }[]>`select id from "user" where email = 'recusas@exemplo.adv.br'`)[0]!.id;
      await t.owner`insert into recusas_da_ia (organization_id, user_id, motivo) values (${x.id}, ${userId}, 'escritorio_dia'), (${x.id}, ${userId}, 'escritorio_dia'), (${x.id}, ${userId}, 'minuto')`;
      const { recusas } = await m.json(m.daPlataforma(operador, "/ia"));
      expect(recusas.total).toBe(3);
      expect(recusas.porMotivo).toContainEqual({ codigo: "escritorio_dia", rotulo: "Teto do dia do escritório", total: 2 });
      expect(recusas.porEscritorio.find((e: { organizationId: string }) => e.organizationId === x.id)).toMatchObject({ total: 3 });
    });
  });

  describe("as faturas", () => {
    test("recebido no mês pela data do pagamento, previsto pelo vencimento, e a vencida em aberto conta como atrasada", async () => {
      const x = await escritorio("faturas");
      const mes = HOJE.slice(0, 7);
      const primeiro = `${mes}-01`;
      await t.owner`insert into faturas (id, organization_id, vencimento, valor_centavos, situacao, forma, link, paga_em) values
        ('pay_f1', ${x.id}, ${primeiro}, 24900, 'paga', 'pix', 'https://sandbox.asaas.com/i/f1', ${primeiro}),
        ('pay_f2', ${x.id}, ${primeiro}, 10000, 'pendente', null, 'https://sandbox.asaas.com/i/f2', null),
        ('pay_f3', ${x.id}, ${primeiro}, 5000, 'removida', null, null, null)`;
      const r = await m.json(m.daPlataforma(operador, `/faturas?mes=${mes}`));
      expect(r.mes).toBe(mes);
      expect(r.faturas.map((f: { id: string }) => f.id).sort()).toEqual(["pay_f1", "pay_f2"]);
      expect(r.numeros.recebidaCentavos).toBe(24_900);
      expect(r.numeros.previstaCentavos).toBe(34_900);
      const f2 = r.faturas.find((f: { id: string }) => f.id === "pay_f2");
      expect(f2.situacao).toBe(HOJE > primeiro ? "atrasada" : "aberta");
      expect(f2).toMatchObject({ escritorio: "Escritório faturas", link: "https://sandbox.asaas.com/i/f2" });
      expect(r.cobranca).toMatchObject({ ativa: true, nfse: false });
      expect((await m.daPlataforma(operador, "/faturas?mes=2026-13")).status).toBe(400);
    });
  });

  describe("as pessoas", () => {
    test("suspender derruba as sessões e barra a entrada; reativar devolve; os dois pedem motivo e ficam na auditoria", async () => {
      await escritorio("suspensa");
      const pessoa = ((await m.json(m.daPlataforma(operador, "/pessoas"))).pessoas as { id: string; email: string; suspensa: boolean }[]).find((p) => p.email === "suspensa@exemplo.adv.br")!;
      expect(pessoa.suspensa).toBe(false);
      const acaoNaPessoa = (corpo: unknown, id = pessoa.id) => m.daPlataforma(operador, `/pessoas/${id}/acao`, { json: corpo });
      expect((await acaoNaPessoa({ acao: "suspender" })).status).toBe(422);
      expect((await acaoNaPessoa({ acao: "suspender", motivo: "robô no chat" })).status).toBe(200);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from session where user_id = ${pessoa.id}`)[0]!.n).toBe(0);
      const entrar = await m.app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: m.env.WEB_ORIGIN }, body: JSON.stringify({ email: "suspensa@exemplo.adv.br", password: SENHA }) });
      expect(entrar.status).toBe(403);
      expect(await entrar.text()).toContain("suspensa");
      expect((await acaoNaPessoa({ acao: "suspender", motivo: "de novo" })).status).toBe(409);
      expect((await acaoNaPessoa({ acao: "reativar" })).status).toBe(200);
      expect((await ultimaAuditoria()).acao).toBe("plataforma.reativar_pessoa");
      await m.entrar("suspensa@exemplo.adv.br");
    });

    test("desligar o 2FA pede como a identidade foi conferida, e não mexe na conta de um operador", async () => {
      const op = ((await m.json(m.daPlataforma(operador, "/pessoas"))).pessoas as { id: string; email: string }[]).find((p) => p.email === OPERADOR)!;
      expect((await m.daPlataforma(operador, `/pessoas/${op.id}/acao`, { json: { acao: "suspender", motivo: "teste" } })).status).toBe(409);
      expect((await m.daPlataforma(operador, `/pessoas/${op.id}/acao`, { json: { acao: "desligar_2fa", motivo: "teste" } })).status).toBe(409);
      await escritorio("sem-app");
      const pessoa = ((await m.json(m.daPlataforma(operador, "/pessoas"))).pessoas as { id: string; email: string }[]).find((p) => p.email === "sem-app@exemplo.adv.br")!;
      expect((await m.daPlataforma(operador, `/pessoas/${pessoa.id}/acao`, { json: { acao: "desligar_2fa" } })).status).toBe(422);
      expect((await m.daPlataforma(operador, `/pessoas/${pessoa.id}/acao`, { json: { acao: "desligar_2fa", motivo: "videochamada com documento" } })).status).toBe(409);
      await t.owner`update "user" set two_factor_enabled = true where id = ${pessoa.id}`;
      await t.owner`insert into two_factor (id, secret, backup_codes, user_id) values ('tf-sem-app', 'segredo-inventado', 'codigos-inventados', ${pessoa.id})`;
      expect((await m.daPlataforma(operador, `/pessoas/${pessoa.id}/acao`, { json: { acao: "desligar_2fa", motivo: "videochamada com documento" } })).status).toBe(200);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from two_factor where user_id = ${pessoa.id}`)[0]!.n).toBe(0);
      expect((await t.owner<{ two_factor_enabled: boolean }[]>`select two_factor_enabled from "user" where id = ${pessoa.id}`)[0]!.two_factor_enabled).toBe(false);
    });
  });

  describe("o limite de WhatsApp por dia", () => {
    test("sem limite no plano, não conta; com limite, o que já saiu hoje tira do que resta", async () => {
      const x = await escritorio("whatsapp");
      const userId = (await t.owner<{ id: string }[]>`select id from "user" where email = 'whatsapp@exemplo.adv.br'`)[0]!.id;
      expect(await withTenant(t.db, x.id, (tx) => whatsappQueResta(t.db, tx, x.id, HOJE))).toBeNull();
      const limitado = (await m.json(m.daPlataforma(operador, "/planos", { json: { ...PLANO_BASE, nome: "Com WhatsApp contado", limites: { whatsappDia: 2 } } }))).plano;
      expect((await acao(x.id, { acao: "licenca", planoId: limitado.id, pessoasExtras: 0, valorCombinadoCentavos: null })).status).toBe(200);
      expect(await withTenant(t.db, x.id, (tx) => whatsappQueResta(t.db, tx, x.id, HOJE))).toBe(2);
      await t.owner`insert into avisos_enviados (organization_id, user_id, tipo, dia, ok) values (${x.id}, ${userId}, 'manha', ${HOJE}, true)`;
      expect(await withTenant(t.db, x.id, (tx) => whatsappQueResta(t.db, tx, x.id, HOJE))).toBe(1);
    });
  });
});
