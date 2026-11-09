/**
 * O painel da plataforma além da lista: o 2FA obrigatório, o registro do acesso, a visão geral, a foto do dia,
 * as pessoas, o uso das funcionalidades, o custo da IA e a ficha de um escritório. Tudo em totais e datas:
 * nenhum nome de cliente, número de processo ou texto do escritório sai das rotas.
 */
import { hojeEm, somarDias } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { tirarFotoDaPlataforma } from "../src/servicos/painel-da-plataforma.ts";
import { montarApi, porNaAssinatura } from "./cobranca-apoio.ts";

const HOJE = hojeEm("America/Sao_Paulo");
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";

describe.skipIf(!hasTestDatabase)("o painel da plataforma por dentro", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  let operador = "";
  const ids: Record<string, string> = {};
  const cookies: Record<string, string> = {};

  const nova = async (slug: string, campos: Parameters<typeof porNaAssinatura>[2] = {}) => {
    const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: `Sócia ${slug}` });
    await porNaAssinatura(t, organizationId, campos);
    ids[slug] = organizationId;
    return organizationId;
  };
  const get = (caminho: string, cookie = operador) => m.json(m.daPlataforma(cookie, caminho));
  /** Um pedido às telas com o navegador dado: é ele que grava o acesso do dia. */
  const usar = (slug: string, userAgent = "Mozilla/5.0 (Windows NT 10.0)") =>
    m.app.request("/api/app/eu", { headers: { origin: m.env.WEB_ORIGIN, cookie: cookies[slug]!, "user-agent": userAgent } });

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true, operadores: "equipe@decreta.site", doisFatores: true });
    await m.novo({ nome: "Decreta Interno", slug: "decreta-interno", email: "equipe@decreta.site", pessoa: "Equipe do Decreta" });
    operador = await m.entrar("equipe@decreta.site");
    const agora = new Date().toISOString();
    await nova("paga", { situacao: "ativo", teste_ate: somarDias(HOJE, -20), assinou_em: agora, valor_mensal_centavos: 19_900 });
    await nova("atrasada", { situacao: "inadimplente", teste_ate: somarDias(HOJE, -40), assinou_em: "2026-01-10T12:00:00Z", valor_mensal_centavos: 9_900, inadimplente_desde: somarDias(HOJE, -3) });
    await nova("acabando", { situacao: "teste", teste_ate: somarDias(HOJE, 2) });
    await nova("novata", { situacao: "teste", teste_ate: somarDias(HOJE, 12), em_avaliacao: true });
    await t.owner`update organization set created_at = now() - interval '5 days' where id = ${ids.novata!}`;
    await m.novo({ nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, email: "teste@decreta.site", pessoa: "Sócia" });
    for (const slug of ["paga", "acabando"]) cookies[slug] = await m.entrar(`${slug}@exemplo.adv.br`);
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("o 2FA do operador", () => {
    test("sem o 2FA ligado, o operador recebe 403 com o caminho; quem não é operador continua recebendo 404", async () => {
      const r = await m.daPlataforma(operador, "/visao-geral");
      expect(r.status).toBe(403);
      expect(await r.json()).toMatchObject({ erro: "plataforma_2fa" });
      expect((await m.daPlataforma(cookies.paga!, "/visao-geral")).status).toBe(404);
    });

    test("com o 2FA ligado e confirmado, entra", async () => {
      const [u] = await t.owner<{ id: string }[]>`select id from "user" where email = 'equipe@decreta.site'`;
      await t.owner`update "user" set two_factor_enabled = true where id = ${u!.id}`;
      await t.owner`insert into two_factor (id, secret, backup_codes, user_id, verified) values ('2fa-op', 'segredo-de-mentira', 'codigos-de-mentira', ${u!.id}, false)`;
      // O segredo criado e ainda não confirmado (a pessoa não digitou o código) não vale.
      expect((await m.daPlataforma(operador, "/visao-geral")).status).toBe(403);
      await t.owner`update two_factor set verified = true where id = '2fa-op'`;
      expect((await m.daPlataforma(operador, "/visao-geral")).status).toBe(200);
    });
  });

  describe("o acesso do dia", () => {
    test("o primeiro pedido do dia grava uma linha, com o aparelho; os outros não repetem", async () => {
      expect((await usar("paga", IPHONE)).status).toBe(200);
      expect((await usar("paga", IPHONE)).status).toBe(200);
      expect((await usar("acabando")).status).toBe(200);
      const linhas = await t.owner<{ organization_id: string; aparelho: string; dia: Date }[]>`select organization_id, aparelho, dia from acessos order by aparelho`;
      expect(linhas.map((l) => [l.organization_id, l.aparelho])).toEqual([
        [ids.paga!, "celular"],
        [ids.acabando!, "computador"],
      ]);
    });

    test("a aplicação não lê o acesso de outro escritório", async () => {
      const [linha] = [...(await t.db.execute<{ n: number }>(sql`select count(*)::int as n from acessos`))];
      expect(linha!.n).toBe(0);
    });
  });

  describe("a visão geral", () => {
    test("MRR, ARR, ticket médio, pessoas ativas e o que precisa de atenção, sem a demonstração", async () => {
      await t.owner`insert into uso_ia (organization_id, metodo, origem, custo_usd, em) values (${ids.paga!}, 'perguntar', 'tela', 2, now())`;
      const v = await get("/visao-geral");
      expect(v.hoje).toBe(HOJE);
      expect(v.numeros).toMatchObject({ mrrCentavos: 29_800, arrCentavos: 357_600, pagantes: 2, emTeste: 2, ticketMedioCentavos: 14_900, ia30dUsd: 2, ia30dCentavos: 1000 });
      expect(v.numeros.pessoasAtivas).toEqual({ dia: 2, semana: 2, mes: 2 });
      // Só a paga assinou este mês.
      expect(v.numeros.mrrNovoCentavos).toBe(19_900);
      expect(v.numeros.margemDaIa).toBeCloseTo(1 - 1000 / 29_800, 6);
      const tipos = v.atencao.map((a: { tipo: string; organizationId: string | null }) => `${a.tipo}:${a.organizationId}`);
      expect(tipos).toContain(`fatura_atrasada:${ids.atrasada}`);
      expect(tipos).toContain(`teste_sem_ativar:${ids.acabando}`);
      expect(tipos).toContain(`em_avaliacao:${ids.novata}`);
      expect(tipos).toContain(`sem_oab:${ids.novata}`);
      expect(v.mrrPorMes.at(-1)).toEqual({ mes: HOJE.slice(0, 7), mrrCentavos: 29_800, pagantes: 2 });
      expect(v.cadastrosPorSemana).toHaveLength(12);
      expect(v.iaPorDia).toHaveLength(30);
    });

    test("a foto do dia guarda os totais, e o mês anterior aparece no MRR mês a mês", async () => {
      await tirarFotoDaPlataforma(t.db);
      const [foto] = await t.owner<{ numeros: Record<string, number> }[]>`select numeros from fotos_da_plataforma where dia = ${HOJE}`;
      expect(foto!.numeros).toMatchObject({ mrrCentavos: 29_800, pagantes: 2, escritorios: 5, teste: 2 });
      // A aplicação não lê nem grava a tabela sem passar pelas funções.
      expect([...(await t.db.execute(sql`select * from fotos_da_plataforma`))]).toHaveLength(0);
      const mesPassado = `${somarDias(`${HOJE.slice(0, 7)}-01`, -1)}`;
      await t.owner`select plataforma_gravar_foto(${mesPassado}::date, '{"mrrCentavos": 9900, "pagantes": 1}'::jsonb)`;
      const v = await get("/visao-geral");
      expect(v.mrrPorMes.slice(-2)).toEqual([
        { mes: mesPassado.slice(0, 7), mrrCentavos: 9900, pagantes: 1 },
        { mes: HOJE.slice(0, 7), mrrCentavos: 29_800, pagantes: 2 },
      ]);
    });
  });

  describe("as pessoas", () => {
    test("todas as contas, com escritório, papel, último acesso e aparelho", async () => {
      const r = await get("/pessoas");
      const paga = r.pessoas.find((p: { email: string }) => p.email === "paga@exemplo.adv.br");
      expect(paga).toMatchObject({ nome: "Sócia paga", ultimoAcesso: HOJE, aparelho: "celular", doisFatores: false, demonstracao: false });
      expect(paga.escritorios).toEqual([{ id: ids.paga, nome: "Escritório paga", papel: "owner" }]);
      expect(paga.sessoesAbertas).toBeGreaterThan(0);
      expect(r.pessoas.find((p: { email: string }) => p.email === "teste@decreta.site").demonstracao).toBe(true);
      expect(r.numeros.ativas.dia).toBe(2);
    });

    test("encerrar as sessões tira a pessoa de todo aparelho e fica na auditoria", async () => {
      const [u] = await t.owner<{ id: string }[]>`select id from "user" where email = 'paga@exemplo.adv.br'`;
      const r = await m.json(m.daPlataforma(operador, `/pessoas/${u!.id}/acao`, { json: { acao: "encerrar_sessoes", motivo: "perdeu o celular" } }));
      expect(r.ok).toBe(true);
      expect(r.sessoesEncerradas).toBeGreaterThan(0);
      expect((await usar("paga")).status).toBe(401);
      const [a] = await t.owner<{ acao: string; detalhes: Record<string, unknown> }[]>`select acao, detalhes from auditoria_da_plataforma order by em desc limit 1`;
      expect(a).toMatchObject({ acao: "plataforma.encerrar_sessoes", detalhes: { pessoa: "paga@exemplo.adv.br", motivo: "perdeu o celular" } });
    });

    test("com o e-mail desligado, o link de senha nova é recusado em vez de sumir no log", async () => {
      const [u] = await t.owner<{ id: string }[]>`select id from "user" where email = 'acabando@exemplo.adv.br'`;
      const r = await m.daPlataforma(operador, `/pessoas/${u!.id}/acao`, { json: { acao: "nova_senha" } });
      expect(r.status).toBe(409);
      expect((await m.daPlataforma(operador, `/pessoas/nao-existe/acao`, { json: { acao: "encerrar_sessoes" } })).status).toBe(404);
      expect((await m.daPlataforma(operador, `/pessoas/${u!.id}/acao`, { json: { acao: "apagar" } })).status).toBe(400);
    });
  });

  describe("o uso e a IA", () => {
    test("conta o uso de cada funcionalidade por escritório, sem o conteúdo", async () => {
      await t.owner`insert into processos (id, organization_id, cnj, titulo) values ('8b6c3a52-0000-4000-8000-000000000001', ${ids.paga!}, '5004321-25.2026.8.24.0038', 'Marina Duarte × Seguradora Alfa S.A.')`;
      await t.owner`insert into prazos (organization_id, processo_id, tipo, dias, publicado_em, inicio, fim, origem, confirmado_em) values (${ids.paga!}, '8b6c3a52-0000-4000-8000-000000000001', 'Contestação', 15, ${HOJE}, ${HOJE}, ${somarDias(HOJE, 20)}, 'ia', now())`;
      const r = await get("/uso?dias=30");
      const por = Object.fromEntries(r.funcionalidades.map((f: { chave: string }) => [f.chave, f]));
      expect(por.processos).toMatchObject({ total: 1, escritorios: 1, porEscritorio: 1 });
      expect(por.prazos_sugeridos.total).toBe(1);
      expect(por.prazos_confirmados.total).toBe(1);
      // Dois escritórios tiveram acesso: a adoção é sobre eles.
      expect(r.escritoriosAtivos).toBe(2);
      expect(por.processos.adocao).toBe(0.5);
      expect(r.qualidade).toMatchObject({ prazosConfirmados: 1, prazosComDataDigitada: 0, contaAceita: 1 });
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("Marina");
      expect(texto).not.toContain("5004321");
      expect((await m.daPlataforma(operador, "/uso?dias=0")).status).toBe(400);
    });

    test("o custo da IA por dia, por funcionalidade e por escritório, com a parte estimada", async () => {
      await t.owner`insert into uso_ia (organization_id, metodo, origem, custo_usd, estimado, em) values (${ids.acabando!}, 'sugerir-prazo', 'fundo', 0.5, true, now())`;
      const r = await get("/ia?dias=7");
      expect(r.totalUsd).toBeCloseTo(2.5, 6);
      expect(r.estimadoUsd).toBeCloseTo(0.5, 6);
      expect(r.fundoUsd).toBeCloseTo(0.5, 6);
      expect(r.porMetodo.map((x: { metodo: string; rotulo: string }) => [x.metodo, x.rotulo])).toEqual([
        ["perguntar", "Perguntar"],
        ["sugerir-prazo", "Sugerir prazo"],
      ]);
      expect(r.porEscritorio[0]).toMatchObject({ organizationId: ids.paga, usd: 2, centavos: 1000, valorMensalCentavos: 19_900 });
      expect(r.dias).toHaveLength(7);
      expect((await m.daPlataforma(operador, "/ia?dias=91")).status).toBe(400);
    });
  });

  describe("a ficha do escritório", () => {
    test("traz os totais, as pessoas, os marcos e a IA, e nenhum conteúdo", async () => {
      await t.owner`insert into eventos (nome, organization_id) values ('oab_cadastrada', ${ids.paga!})`;
      const f = await get(`/escritorios/${ids.paga}`);
      expect(f.escritorio).toMatchObject({ id: ids.paga, nome: "Escritório paga", situacao: "ativo" });
      expect(f.totais).toMatchObject({ processos: 1, prazosAbertos: 1, clientes: 0 });
      expect(f.pessoas.map((p: { email: string }) => p.email)).toEqual(["paga@exemplo.adv.br"]);
      expect(f.marcos.find((x: { nome: string }) => x.nome === "oab_cadastrada").em).not.toBeNull();
      expect(f.marcos.find((x: { nome: string }) => x.nome === "assinou").em).not.toBeNull();
      expect(f.ia.totalUsd).toBe(2);
      expect(f.uso.map((u: { chave: string }) => u.chave)).toContain("processos");
      expect(f.acoes.map((a: { acao: string }) => a.acao)).toContain("plataforma.encerrar_sessoes");
      const texto = JSON.stringify(f);
      expect(texto).not.toContain("Marina");
      expect(texto).not.toContain("5004321");
      expect((await m.daPlataforma(operador, "/escritorios/nao-existe")).status).toBe(404);
    });
  });
});

