/**
 * O painel da plataforma: só operadores (os outros recebem 404), a lista de escritórios com a conta e os totais e
 * nunca o conteúdo, as ações (todas na auditoria da plataforma) e os indicadores.
 */
import { hojeEm, somarDias, VERSAO_DOS_TERMOS } from "@decreta/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { dia, montarApi, organizacao, porNaAssinatura } from "./cobranca-apoio.ts";

const HOJE = hojeEm("America/Sao_Paulo");
const OPERADORES = "Equipe@Decreta.site; outra@decreta.site";

describe.skipIf(!hasTestDatabase)("painel da plataforma", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  let operador = "";
  let souza = { id: "", cookie: "" };

  const escritorio = async (slug: string, campos: Parameters<typeof porNaAssinatura>[2] = {}) => {
    const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: `Sócia ${slug}` });
    await porNaAssinatura(t, organizationId, campos);
    return { id: organizationId, cookie: await m.entrar(`${slug}@exemplo.adv.br`) };
  };
  const acao = (id: string, corpo: unknown, cookie: string | null = operador) => m.daPlataforma(cookie, `/escritorios/${id}/acao`, { json: corpo });
  const auditoria = async () => (await m.json(m.daPlataforma(operador, "/auditoria"))).itens as { operador: string; acao: string; escritorio: string | null; organizationId: string | null; detalhes: Record<string, any>; em: string }[];
  const linhaDe = async (id: string) => ((await m.json(m.daPlataforma(operador, "/escritorios"))).escritorios as any[]).find((e) => e.id === id);

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true, operadores: OPERADORES });
    // A equipe do Decreta tem conta própria, criada por ela (o cadastro aberto recusa esses e-mails).
    await m.novo({ nome: "Decreta Interno", slug: "decreta-interno", email: "equipe@decreta.site", pessoa: "Equipe do Decreta" });
    operador = await m.entrar("equipe@decreta.site");
    souza = await escritorio("souza");
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("quem entra", () => {
    const rotas: [string, string][] = [
      ["GET", "/escritorios"],
      ["GET", "/indicadores"],
      ["GET", "/auditoria"],
    ];

    test("quem não está logado recebe 404 em toda rota, como se ela não existisse", async () => {
      for (const [metodo, caminho] of rotas) {
        const r = await m.daPlataforma(null, caminho, { method: metodo });
        expect(r.status).toBe(404);
      }
      expect((await acao(souza.id, { acao: "liberar" }, null)).status).toBe(404);
    });

    test("quem está logado e não é operador também recebe 404, inclusive o sócio do próprio escritório", async () => {
      for (const [metodo, caminho] of rotas) {
        const r = await m.daPlataforma(souza.cookie, caminho, { method: metodo });
        expect(r.status).toBe(404);
        expect(await m.json(r)).toEqual({ erro: "nao_encontrado" });
      }
      const antes = (await auditoria()).length;
      expect((await acao(souza.id, { acao: "bloquear" }, souza.cookie)).status).toBe(404);
      expect((await organizacao(t, souza.id)).situacao).toBe("cortesia");
      expect((await auditoria()).length).toBe(antes);
    });

    test("a lista de operadores ignora maiúsculas e separadores, e o link do menu só vem para eles", async () => {
      expect((await m.daPlataforma(operador, "/escritorios")).status).toBe(200);
      expect((await m.json(m.com(operador, "/eu"))).plataforma).toBe(true);
      expect((await m.json(m.com(souza.cookie, "/eu"))).plataforma).toBeUndefined();
    });

    test("e-mail de operador sem confirmação não entra", async () => {
      await t.owner`update "user" set email_verified = false where email = 'equipe@decreta.site'`;
      expect((await m.daPlataforma(operador, "/escritorios")).status).toBe(404);
      await t.owner`update "user" set email_verified = true where email = 'equipe@decreta.site'`;
      expect((await m.daPlataforma(operador, "/escritorios")).status).toBe(200);
    });

    test("ninguém abre conta com o e-mail de um operador: nem pelo cadastro aberto, nem por convite", async () => {
      const cadastro = await m.app.request("/api/cadastro", {
        method: "POST",
        headers: { "content-type": "application/json", origin: m.env.WEB_ORIGIN, "x-forwarded-for": "203.0.113.50" },
        body: JSON.stringify({ nome: "Intruso", email: "outra@decreta.site", senha: "senha-bem-longa-123", escritorio: "Casa do Intruso", termos: VERSAO_DOS_TERMOS }),
      });
      expect(cadastro.status).toBe(409);
      expect((await m.json(cadastro)).erro).toBe("email_em_uso");
      // O convite que o próprio atacante mandou para esse e-mail não vale para criar conta.
      await t.owner`insert into invitation (id, organization_id, email, role, status, expires_at, inviter_id) values ('conv-op', ${souza.id}, 'outra@decreta.site', 'member', 'pending', now() + interval '3 days', (select id from "user" where email = 'souza@exemplo.adv.br'))`;
      const signup = await m.app.request("/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: m.env.WEB_ORIGIN },
        body: JSON.stringify({ email: "outra@decreta.site", password: "senha-bem-longa-123", name: "Intruso", termosVersao: VERSAO_DOS_TERMOS }),
      });
      expect(signup.status).toBe(403);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from "user" where email = 'outra@decreta.site'`)[0]!.n).toBe(0);
    });
  });

  describe("a lista de escritórios", () => {
    test("traz a conta e os totais, e nunca o conteúdo do escritório", async () => {
      const lima = await escritorio("lima");
      expect((await m.com(lima.cookie, "/clientes", { json: { nome: "Marina Duarte" } })).status).toBe(201);
      // Só depois de ter conteúdo o teste acaba: assim o escritório está só leitura, com dados dentro.
      await porNaAssinatura(t, lima.id, { situacao: "teste", teste_ate: somarDias(HOJE, -2), em_avaliacao: true });
      await t.owner`insert into processos (organization_id, cnj, titulo) values (${lima.id}, '5004321-25.2026.8.24.0038', 'Marina Duarte × Seguradora Alfa S.A.')`;
      await t.owner`insert into uso_ia (organization_id, metodo, origem, custo_usd, em) values (${lima.id}, 'perguntar', 'tela', 1.25, now())`;
      await t.owner`insert into uso_ia (organization_id, metodo, origem, custo_usd, em) values (${lima.id}, 'perguntar', 'tela', 9, now() - interval '70 days')`;

      const r = await m.json(m.daPlataforma(operador, "/escritorios"));
      const linha = r.escritorios.find((e: { id: string }) => e.id === lima.id);
      expect(linha).toMatchObject({ nome: "Escritório lima", slug: "lima", situacaoGravada: "teste", situacao: "so_leitura", pessoas: 1, processos: 1, iaMesUsd: 1.25, demonstracao: false, encerrado: false });
      expect(linha.testeAte).toBe(somarDias(HOJE, -2));

      // Só colunas da conta e totais: nenhum nome de cliente, número de processo ou texto de publicação.
      const texto = JSON.stringify(r);
      expect(texto).not.toContain("Marina");
      expect(texto).not.toContain("5004321");
      expect(texto).not.toContain("Seguradora");
      expect(Object.keys(linha).sort()).toEqual(
        ["acessoAte", "assinouEm", "cancelamentoPedidoEm", "criadoEm", "demonstracao", "diasDeAtraso", "diasRestantesDoTeste", "emAvaliacao", "encerrado", "id", "iaMesUsd", "nome", "pessoas", "processos", "slug", "situacao", "situacaoGravada", "testeAte", "valorMensalCentavos"].sort(),
      );
    });

    test("o escritório de outro aparece só para o operador: o sócio nunca vê a lista nem o plano do vizinho", async () => {
      const plano = await m.json(m.com(souza.cookie, "/plano"));
      expect(JSON.stringify(plano)).not.toContain("lima");
      expect(plano.faturas).toEqual([]);
    });
  });

  describe("as ações", () => {
    test("liberar da avaliação substitui o update manual e fica registrado", async () => {
      const x = await escritorio("liberar", { em_avaliacao: true });
      const r = await m.json(acao(x.id, { acao: "liberar", motivo: "OAB conferida pelo WhatsApp" }));
      expect(r).toMatchObject({ ok: true, antes: "cortesia", depois: "cortesia" });
      expect((await organizacao(t, x.id)).em_avaliacao).toBe(false);
      const ultima = (await auditoria())[0]!;
      expect(ultima).toMatchObject({ operador: "equipe@decreta.site", acao: "plataforma.liberar", organizationId: x.id, escritorio: "Escritório liberar" });
      expect(ultima.detalhes).toMatchObject({ motivo: "OAB conferida pelo WhatsApp" });
      const outra = await acao(x.id, { acao: "liberar" });
      expect(outra.status).toBe(409);
    });

    test("estender o teste soma dias ao fim, ou a partir de hoje se já tinha acabado, e o escritório volta a escrever", async () => {
      const acabou = await escritorio("estender-acabou", { situacao: "teste", teste_ate: somarDias(HOJE, -2) });
      expect((await m.com(acabou.cookie, "/clientes", { json: { nome: "Cliente X" } })).status).toBe(403);
      await acao(acabou.id, { acao: "estender_teste" });
      expect(dia((await organizacao(t, acabou.id)).teste_ate)).toBe(somarDias(HOJE, 7));
      expect((await m.com(acabou.cookie, "/clientes", { json: { nome: "Cliente X" } })).status).toBe(201);

      const vigente = await escritorio("estender-vigente", { situacao: "teste", teste_ate: somarDias(HOJE, 3) });
      const r = await m.json(acao(vigente.id, { acao: "estender_teste", dias: 10 }));
      expect(r.ok).toBe(true);
      expect(dia((await organizacao(t, vigente.id)).teste_ate)).toBe(somarDias(HOJE, 13));
      expect((await auditoria())[0]!.detalhes).toMatchObject({ dias: 10, testeAte: somarDias(HOJE, 13) });

      expect((await acao(vigente.id, { acao: "estender_teste", dias: 61 })).status).toBe(400);
      expect((await acao(vigente.id, { acao: "estender_teste", dias: 0 })).status).toBe(400);
      const cortesia = await escritorio("estender-cortesia");
      expect((await acao(cortesia.id, { acao: "estender_teste" })).status).toBe(409);
    });

    test("só leitura, bloquear e cortesia mudam o que o escritório pode fazer", async () => {
      const x = await escritorio("restricoes", { situacao: "ativo" });
      expect((await m.com(x.cookie, "/clientes", { json: { nome: "Cliente A" } })).status).toBe(201);

      await acao(x.id, { acao: "so_leitura", motivo: "pedido do cliente" });
      expect((await organizacao(t, x.id)).situacao).toBe("so_leitura");
      expect((await m.com(x.cookie, "/clientes", { json: { nome: "Cliente B" } })).status).toBe(403);
      expect((await m.com(x.cookie, "/clientes")).status).toBe(200);
      expect((await acao(x.id, { acao: "so_leitura" })).status).toBe(409);

      await acao(x.id, { acao: "bloquear" });
      const bloqueado = await m.com(x.cookie, "/clientes");
      expect(bloqueado.status).toBe(403);
      expect((await m.json(bloqueado)).erro).toBe("escritorio_bloqueado");

      await acao(x.id, { acao: "cortesia" });
      expect((await m.com(x.cookie, "/clientes", { json: { nome: "Cliente C" } })).status).toBe(201);

      const acoes = (await auditoria()).filter((a) => a.organizationId === x.id).map((a) => a.acao);
      expect(acoes).toEqual(["plataforma.cortesia", "plataforma.bloquear", "plataforma.so_leitura"]);
    });

    test("reativar: quem não assina abre um teste novo; quem assina volta a ser ativo, ou inadimplente se há fatura vencida", async () => {
      const semAssinatura = await escritorio("reativar-teste", { situacao: "bloqueado" });
      await acao(semAssinatura.id, { acao: "reativar" });
      let o = await organizacao(t, semAssinatura.id);
      expect(o.situacao).toBe("teste");
      expect(dia(o.teste_ate)).toBe(somarDias(HOJE, 14));
      expect((await m.com(semAssinatura.cookie, "/clientes", { json: { nome: "Cliente Z" } })).status).toBe(201);

      const assina = await escritorio("reativar-ativo", { situacao: "so_leitura", asaas_assinatura_id: "sub_r", assinou_em: new Date().toISOString() });
      const r = await m.json(acao(assina.id, { acao: "reativar" }));
      expect(r).toMatchObject({ antes: "so_leitura", depois: "ativo" });

      const atrasada = await escritorio("reativar-atraso", { situacao: "bloqueado", asaas_assinatura_id: "sub_r2", assinou_em: new Date().toISOString() });
      await t.owner`insert into faturas (id, organization_id, vencimento, valor_centavos, situacao) values ('pay_r2', ${atrasada.id}, ${somarDias(HOJE, -3)}, 9900, 'atrasada')`;
      expect((await m.json(acao(atrasada.id, { acao: "reativar" }))).depois).toBe("inadimplente");
      expect(dia((await organizacao(t, atrasada.id)).inadimplente_desde)).toBe(somarDias(HOJE, -3));

      expect((await acao(assina.id, { acao: "reativar" })).status).toBe(409);
    });

    test("a demonstração, o escritório encerrado e o que não existe são recusados", async () => {
      const { organizationId: demo } = await m.novo({ nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, email: "teste@decreta.site", pessoa: "Sócia" });
      expect((await acao(demo, { acao: "bloquear" })).status).toBe(409);
      expect((await organizacao(t, demo)).situacao).toBe("cortesia");
      const encerrado = await escritorio("encerrado");
      await t.owner`update organization set encerrado_em = now() where id = ${encerrado.id}`;
      expect((await acao(encerrado.id, { acao: "bloquear" })).status).toBe(409);
      expect((await acao("nao-existe", { acao: "bloquear" })).status).toBe(404);
      expect((await acao(souza.id, { acao: "apagar" })).status).toBe(400);
      expect((await acao(souza.id, "lixo")).status).toBe(400);
    });

    test("a auditoria diz quem fez, quando e em qual escritório, do mais novo para o mais velho", async () => {
      const itens = await auditoria();
      expect(itens.length).toBeGreaterThan(5);
      for (const i of itens) {
        expect(i.operador).toBe("equipe@decreta.site");
        expect(i.acao).toMatch(/^plataforma\./);
        expect(Number.isNaN(Date.parse(i.em))).toBe(false);
      }
      const datas = itens.map((i) => Date.parse(i.em));
      expect([...datas].sort((a, b) => b - a)).toEqual(datas);
    });
  });
});

describe.skipIf(!hasTestDatabase)("os indicadores da plataforma", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  let operador = "";

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true, operadores: "equipe@decreta.site" });
    await m.novo({ nome: "Decreta Interno", slug: "decreta-interno", email: "equipe@decreta.site", pessoa: "Equipe" });
    operador = await m.entrar("equipe@decreta.site");
    const agora = new Date().toISOString();
    const nova = async (slug: string, campos: Parameters<typeof porNaAssinatura>[2]) => {
      const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: slug });
      await porNaAssinatura(t, organizationId, campos);
      return organizationId;
    };
    await nova("paga", { situacao: "ativo", teste_ate: somarDias(HOJE, -20), assinou_em: agora, valor_mensal_centavos: 9900 });
    await nova("atrasada", { situacao: "inadimplente", teste_ate: somarDias(HOJE, -30), assinou_em: agora, valor_mensal_centavos: 9900, inadimplente_desde: somarDias(HOJE, -2) });
    await nova("em-teste", { situacao: "teste", teste_ate: somarDias(HOJE, 5) });
    await nova("sem-assinar", { situacao: "teste", teste_ate: somarDias(HOJE, -1) });
    await nova("cortesia", {});
    const cancelada = await nova("cancelada", { situacao: "ativo", teste_ate: somarDias(HOJE, -60), assinou_em: agora, valor_mensal_centavos: 9900, acesso_ate: somarDias(HOJE, -1) });
    await t.owner`update organization set cancelamento_pedido_em = now() where id = ${cancelada}`;
    await m.novo({ nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, email: "teste@decreta.site", pessoa: "Sócia" });
    for (const nome of ["visita", "visita", "visita", "clicou_criar_conta", "cadastro_concluido", "cadastro_concluido"]) await t.owner`insert into eventos (nome) values (${nome})`;
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("MRR, escritórios por situação, conversão do teste, cancelamentos e inadimplência", async () => {
    const r = await m.json(m.daPlataforma(operador, "/indicadores?dias=30"));
    // Só pagam o ativo e o em atraso; o cancelado já passou do período pago e a cortesia nunca paga.
    expect(r.mrrCentavos).toBe(19_800);
    expect(r.mrrEmAtrasoCentavos).toBe(9900);
    expect(r.porSituacao).toEqual({ teste: 1, ativo: 1, inadimplente: 1, so_leitura: 1, bloqueado: 0, cancelado: 1, cortesia: 2 });
    // Dos 5 que fizeram teste, 4 já terminaram (3 assinaram e 1 não), e 1 ainda está no teste.
    expect(r.conversao).toEqual({ cadastrados: 5, terminaram: 4, assinaram: 3, taxa: 0.75 });
    expect(r.cancelamentos).toEqual({ total: 1, mrrPerdidoCentavos: 9900 });
    expect(r.inadimplencia).toEqual({ escritorios: 1, mrrCentavos: 9900 });
    expect(r.periodo).toEqual({ de: somarDias(HOJE, -29), ate: HOJE, dias: 30 });
  });

  test("o funil da onda 0 por período, o mesmo do bun run funil", async () => {
    const r = await m.json(m.daPlataforma(operador, "/indicadores?dias=7"));
    const por = Object.fromEntries(r.funil.map((e: { nome: string; total: number }) => [e.nome, e.total]));
    expect(por).toMatchObject({ visita: 3, clicou_criar_conta: 1, cadastro_concluido: 2 });
    expect(r.funil[2]).toMatchObject({ nome: "cadastro_concluido", doAnterior: 2 });
    // Fora do período, nada.
    await t.owner`update eventos set em = now() - interval '40 days'`;
    const antigo = await m.json(m.daPlataforma(operador, "/indicadores?dias=7"));
    expect(antigo.funil.every((e: { total: number }) => e.total === 0)).toBe(true);
  });

  test("o período precisa ser de 1 a 366 dias", async () => {
    for (const dias of ["0", "367", "abc", "1.5"]) expect((await m.daPlataforma(operador, `/indicadores?dias=${dias}`)).status).toBe(400);
  });
});
