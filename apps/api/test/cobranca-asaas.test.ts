/**
 * A cobrança pelo Asaas: o aviso (webhook) com token, tratado uma única vez, e o que ele muda no escritório;
 * assinar (o link do Asaas) e cancelar (vale até o fim do período pago). Contra um Asaas de mentira
 * (`asaas-falso.ts`): o que não foi testado contra o Asaas de verdade está dito no relatório da onda 3.
 */
import { fimDoPeriodoPago, hojeEm, PLANO, somarDias } from "@decreta/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { comoNasce } from "../src/servicos/assinatura.ts";
import { asaasFalso, avisoDeAssinatura, avisoDePagamento, CHAVE_DO_ASAAS, pagamento, TOKEN_DO_ASAAS } from "./asaas-falso.ts";
import { dia, faturasDe, montarApi, organizacao, porNaAssinatura } from "./cobranca-apoio.ts";

const HOJE = hojeEm("America/Sao_Paulo");
const TESTE = comoNasce(true, true);

describe.skipIf(!hasTestDatabase)("cobrança pelo Asaas", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true });
    PLANO.valorMensalCentavos = 9900;
  });

  afterAll(async () => {
    PLANO.valorMensalCentavos = null;
    await t?.drop();
  });

  const eventosTratados = async (org: string) => (await t.owner<{ n: number }[]>`select count(*)::int as n from eventos_de_cobranca where organization_id = ${org}`)[0]!.n;
  const escritorioEmTeste = async (slug: string, nome: string, linkId: string | null) => {
    const { organizationId } = await m.novo({ nome, slug, email: `${slug}@exemplo.adv.br`, pessoa: `Sócia ${nome}`, cadastroAberto: true, assinatura: TESTE });
    if (linkId) await porNaAssinatura(t, organizationId, { asaas_link_id: linkId });
    return organizationId;
  };

  test("as rotas do Better Auth não devolvem a assinatura, o valor nem o link do escritório a quem é da equipe", async () => {
    const organizationId = await escritorioEmTeste("campos", "Campos Advocacia", "link_campos");
    await t.owner`update organization set asaas_assinatura_id = 'sub_campos', asaas_cliente_id = 'cus_campos', asaas_link_url = 'https://sandbox.asaas.com/c/link_campos', valor_mensal_centavos = 9900 where id = ${organizationId}`;
    const pessoa = await m.novo({ nome: "Outro de quem entra", slug: "outro-campos", email: "equipe-campos@exemplo.adv.br", pessoa: "Equipe" });
    await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${organizationId}, ${pessoa.userId}, 'member')`;
    const cookie = await m.entrar("equipe-campos@exemplo.adv.br");
    const pedir = (metodo: string, caminho: string, json?: unknown) => m.app.request(`/api/auth${caminho}`, { method: metodo, headers: { "content-type": "application/json", origin: m.env.WEB_ORIGIN, cookie }, body: json === undefined ? undefined : JSON.stringify(json) });
    const respostas = [await pedir("POST", "/organization/set-active", { organizationId }), await pedir("GET", `/organization/get-full-organization?organizationId=${organizationId}`), await pedir("GET", "/organization/list")];
    for (const r of respostas) {
      expect(r.status).toBe(200);
      const texto = await r.text();
      expect(texto).toContain("Campos Advocacia");
      for (const dado of ["sub_campos", "cus_campos", "link_campos", "9900", "asaas", "valorMensal", "testeAte", "situacao"]) expect(texto).not.toContain(dado);
    }
  });

  describe("o aviso do Asaas", () => {
    let souza = "";
    let cookie = "";
    const primeiroPagamento = avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_1", vencimento: HOJE, status: "RECEIVED", forma: "PIX", pagaEm: HOJE }));

    beforeAll(async () => {
      souza = await escritorioEmTeste("souza", "Souza & Mendes Advocacia", "link_1");
      cookie = await m.entrar("souza@exemplo.adv.br");
    });

    test("sem o token, ou com outro, o aviso é recusado e nada muda", async () => {
      for (const token of [null, "", "token-errado", "token-do-aviso-do-asaas-"]) expect((await m.aviso(primeiroPagamento, token)).status).toBe(401);
      expect(await faturasDe(t, souza)).toEqual([]);
      expect(await eventosTratados(souza)).toBe(0);
      expect((await organizacao(t, souza)).situacao).toBe("teste");
    });

    test("quem tenta adivinhar o token é barrado depois de 20 tentativas, e o aviso verdadeiro do mesmo endereço continua passando", async () => {
      const ip = "198.51.100.77";
      const corpo = avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_limite", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_limite", link: "link_limite", cliente: "cus_limite" }));
      for (let i = 0; i < 20; i++) expect((await m.aviso(corpo, `palpite-${i}`, ip)).status).toBe(401);
      expect((await m.aviso(corpo, "palpite-21", ip)).status).toBe(429);
      // Com o token certo o aviso passa: o endereço (que pode ser forjado) não tira a vez do Asaas.
      expect((await m.aviso(corpo, TOKEN_DO_ASAAS, ip)).status).toBe(200);
    });

    test("sem token configurado no servidor a rota não existe", async () => {
      const semToken = montarApi(t, { ativa: true, token: "" });
      expect((await semToken.aviso(primeiroPagamento, "qualquer")).status).toBe(404);
      expect((await semToken.aviso(primeiroPagamento, null)).status).toBe(404);
      expect(await faturasDe(t, souza)).toEqual([]);
    });

    test("aviso fora do formato é 400, e aviso de ninguém é aceito sem mexer em nada", async () => {
      expect((await m.aviso({ foo: 1 })).status).toBe(400);
      expect((await m.aviso({ id: "x", event: "PAYMENT_RECEIVED", payment: { status: "RECEIVED" } })).status).toBe(400);
      const deNinguem = await m.json(m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_x", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_x", link: "link_x", cliente: "cus_x" }))));
      expect(deNinguem).toEqual({ ok: true, resultado: "sem_escritorio" });
    });

    test("a primeira cobrança liga a assinatura ao escritório pelo link; pagar o deixa ativo e liberado da avaliação", async () => {
      const criada = await m.json(m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_1", vencimento: HOJE, status: "PENDING" }))));
      expect(criada.resultado).toBe("tratado");
      let o = await organizacao(t, souza);
      expect(o).toMatchObject({ asaas_assinatura_id: "sub_1", asaas_cliente_id: "cus_1", situacao: "teste", em_avaliacao: true, assinou_em: null });
      expect((await faturasDe(t, souza)).map((f) => [f.id, f.situacao, f.valor_centavos])).toEqual([["pay_1", "pendente", 9900]]);

      expect((await m.json(m.aviso(primeiroPagamento))).resultado).toBe("tratado");
      o = await organizacao(t, souza);
      expect(o).toMatchObject({ situacao: "ativo", em_avaliacao: false, valor_mensal_centavos: 9900, inadimplente_desde: null });
      expect(o.assinou_em).not.toBeNull();
      expect(await faturasDe(t, souza)).toEqual([{ id: "pay_1", situacao: "paga", valor_centavos: 9900, vencimento: HOJE, forma: "pix", paga_em: HOJE }]);
    });

    test("o mesmo aviso de novo é tratado uma vez só: nada muda", async () => {
      await porNaAssinatura(t, souza, { valor_mensal_centavos: 1 });
      const antes = await eventosTratados(souza);
      const de_novo = await m.json(m.aviso(primeiroPagamento));
      expect(de_novo).toEqual({ ok: true, resultado: "repetido" });
      // Se tivesse sido tratado de novo, o valor voltaria para 9900.
      expect((await organizacao(t, souza)).valor_mensal_centavos).toBe(1);
      expect(await eventosTratados(souza)).toBe(antes);
      await porNaAssinatura(t, souza, { valor_mensal_centavos: 9900 });
    });

    test("aviso fora de ordem não desfaz o pagamento (um \"venceu\" que chega depois do \"pagou\")", async () => {
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_1", vencimento: HOJE, status: "OVERDUE" })));
      expect((await faturasDe(t, souza))[0]!.situacao).toBe("paga");
      expect((await organizacao(t, souza)).situacao).toBe("ativo");
    });

    test("fatura que vence sem pagamento deixa o escritório inadimplente desde o vencimento mais antigo; pagar tudo volta ao normal", async () => {
      const dois = somarDias(HOJE, -3);
      const um = somarDias(HOJE, -1);
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_2", vencimento: dois })));
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_2", vencimento: dois, status: "OVERDUE" })));
      let o = await organizacao(t, souza);
      expect(o.situacao).toBe("inadimplente");
      expect(dia(o.inadimplente_desde)).toBe(dois);

      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_3", vencimento: um, status: "OVERDUE" })));
      expect(dia((await organizacao(t, souza)).inadimplente_desde)).toBe(dois);

      // A tela já mostra o aviso, com a data de virar só leitura (7 dias depois do vencimento).
      const eu = await m.json(m.com(cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "inadimplente", acesso: "total" });
      expect(eu.assinatura.aviso.nivel).toBe("atencao");

      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_2", vencimento: dois, status: "RECEIVED", pagaEm: HOJE })));
      o = await organizacao(t, souza);
      expect(o.situacao).toBe("inadimplente");
      expect(dia(o.inadimplente_desde)).toBe(um);

      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_3", vencimento: um, status: "RECEIVED", pagaEm: HOJE })));
      o = await organizacao(t, souza);
      expect(o.situacao).toBe("ativo");
      expect(o.inadimplente_desde).toBeNull();
    });

    test("cobrança apagada ou estornada não volta por um aviso atrasado", async () => {
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_4", vencimento: somarDias(HOJE, 25) })));
      await m.aviso(avisoDePagamento("PAYMENT_DELETED", pagamento({ id: "pay_4", vencimento: somarDias(HOJE, 25), status: "PENDING" })));
      await m.aviso(avisoDePagamento("PAYMENT_UPDATED", pagamento({ id: "pay_4", vencimento: somarDias(HOJE, 25), status: "PENDING" })));
      expect((await faturasDe(t, souza)).find((f) => f.id === "pay_4")!.situacao).toBe("removida");
    });

    test("a assinatura cancelada no painel do Asaas vale até o fim do período pago, e o eco do aviso não muda nada", async () => {
      const ultimaPaga = HOJE;
      expect((await m.json(m.aviso(avisoDeAssinatura("SUBSCRIPTION_DELETED", "sub_1")))).resultado).toBe("tratado");
      const o = await organizacao(t, souza);
      expect(dia(o.acesso_ate)).toBe(fimDoPeriodoPago(ultimaPaga));
      expect(o.cancelamento_pedido_em).not.toBeNull();
      expect(o.asaas_assinatura_id).toBeNull();
      expect(o.situacao).toBe("ativo");
      const pedido = o.cancelamento_pedido_em as Date;
      await m.aviso(avisoDeAssinatura("SUBSCRIPTION_INACTIVATED", "sub_1"));
      expect((await organizacao(t, souza)).cancelamento_pedido_em).toEqual(pedido);
    });

    test("quem nunca pagou e tem fatura vencida segue o fim do teste: a régua de atraso não vale", async () => {
      const mendes = await escritorioEmTeste("mendes", "Mendes Advogados", "link_2");
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_m1", vencimento: somarDias(HOJE, -2), assinatura: "sub_2", link: "link_2", cliente: "cus_2" })));
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_m1", vencimento: somarDias(HOJE, -2), status: "OVERDUE", assinatura: "sub_2", link: "link_2", cliente: "cus_2" })));
      const o = await organizacao(t, mendes);
      expect(o).toMatchObject({ situacao: "teste", inadimplente_desde: null, assinou_em: null });
      expect((await faturasDe(t, mendes))[0]!.situacao).toBe("atrasada");
    });

    test("a NFS-e fica preparada atrás de um interruptor desligado: nada é chamado no Asaas, e ligado configura a assinatura uma vez só", async () => {
      // Desligado (o padrão): a assinatura nova do escritório Mendes não gerou nenhuma chamada de nota.
      expect(m.asaas.de("POST", "/invoiceSettings")).toHaveLength(0);

      const ligada = montarApi(t, { ativa: true, nfse: { servicoMunicipalId: "svc_1", servicoCodigo: "1.05", servicoNome: "Licenciamento de software", issPercentual: 2, issRetido: false } });
      const org = await escritorioEmTeste("nfse", "Casa da Nota", "link_n");
      const pedido = (id: string, evento: string, status: string) => avisoDePagamento(evento, pagamento({ id, vencimento: HOJE, status, assinatura: "sub_n", link: "link_n", cliente: "cus_n", pagaEm: HOJE }));
      await ligada.aviso(pedido("pay_n1", "PAYMENT_CREATED", "PENDING"));
      const [chamada] = ligada.asaas.de("POST", "/v3/subscriptions/sub_n/invoiceSettings");
      expect(chamada!.corpo).toMatchObject({ municipalServiceId: "svc_1", municipalServiceCode: "1.05", effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION", taxes: { iss: 2, retainIss: false, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 } });
      expect((await organizacao(t, org)).nfse_configurada_em).not.toBeNull();
      // O pagamento da mesma assinatura não configura de novo.
      await ligada.aviso(pedido("pay_n1", "PAYMENT_RECEIVED", "RECEIVED"));
      expect(ligada.asaas.de("POST", "invoiceSettings")).toHaveLength(1);
    });

    test("escritório de cortesia não é mexido por pagamento nem por atraso, e o aviso acha o escritório pela referência", async () => {
      const { organizationId: antigo } = await m.novo({ nome: "Escritório Antigo", slug: "antigo", email: "antigo@exemplo.adv.br", pessoa: "Sócio Antigo" });
      expect((await organizacao(t, antigo)).situacao).toBe("cortesia");
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_a1", vencimento: somarDias(HOJE, -30), status: "OVERDUE", assinatura: "sub_a", link: null, cliente: "cus_a", referencia: antigo })));
      const o = await organizacao(t, antigo);
      expect(o).toMatchObject({ situacao: "cortesia", inadimplente_desde: null });
      expect((await faturasDe(t, antigo)).map((f) => f.id)).toEqual(["pay_a1"]);
    });

    test("a fatura de um escritório não aparece na tela do outro", async () => {
      const plano = await m.json(m.com(cookie, "/plano"));
      const ids = plano.faturas.map((f: { id: string }) => f.id);
      expect(ids).toContain("pay_1");
      expect(ids).not.toContain("pay_m1");
      expect(ids).not.toContain("pay_a1");
      expect(ids).not.toContain("pay_4");
    });
  });

  describe("assinar", () => {
    let org = "";
    let cookie = "";

    beforeAll(async () => {
      org = await escritorioEmTeste("lopes", "Lopes Advocacia", null);
      cookie = await m.entrar("lopes@exemplo.adv.br");
    });

    test("sem o valor do plano decidido a cobrança não abre: avisa, e o Asaas nem é chamado", async () => {
      PLANO.valorMensalCentavos = null;
      try {
        const antes = m.asaas.chamadas.length;
        const plano = await m.json(m.com(cookie, "/plano"));
        expect(plano).toMatchObject({ podeAssinar: false, plano: { valorMensalCentavos: null } });
        expect(plano.motivoSemAssinar).toContain("valor do plano ainda não foi definido");
        const r = await m.com(cookie, "/plano/assinar", { method: "POST" });
        expect(r.status).toBe(409);
        expect((await m.json(r)).erro).toBe("valor_nao_definido");
        expect(m.asaas.chamadas.length).toBe(antes);
      } finally {
        PLANO.valorMensalCentavos = 9900;
      }
    });

    test("devolve o link do Asaas, criado como a documentação pede, e o reaproveita; o cartão nunca passa pelo Decreta", async () => {
      const r = await m.json(m.com(cookie, "/plano/assinar", { method: "POST" }));
      expect(r.url).toBe("https://sandbox.asaas.com/c/link_1");
      const [pedido] = m.asaas.de("POST", "/v3/paymentLinks");
      expect(pedido!.headers.get("access_token")).toBe(CHAVE_DO_ASAAS);
      expect(pedido!.corpo).toMatchObject({
        billingType: "UNDEFINED",
        chargeType: "RECURRENT",
        subscriptionCycle: "MONTHLY",
        value: 99,
        externalReference: org,
        callback: { successUrl: "https://decreta.local/configuracoes?aba=plano", autoRedirect: true },
      });
      // Nada de cartão no pedido.
      expect(JSON.stringify(pedido!.corpo)).not.toMatch(/creditCard|holderName|cardNumber|ccv/i);
      const o = await organizacao(t, org);
      expect(o).toMatchObject({ asaas_link_id: "link_1", asaas_link_url: r.url, asaas_link_valor_centavos: 9900 });

      const denovo = await m.json(m.com(cookie, "/plano/assinar", { method: "POST" }));
      expect(denovo.url).toBe(r.url);
      expect(m.asaas.de("POST", "/v3/paymentLinks")).toHaveLength(1);
    });

    test("só sócio assina; a equipe recebe 403", async () => {
      const { organizationId, userId } = await m.novo({ nome: "Outra Casa", slug: "outra-casa", email: "outra@exemplo.adv.br", pessoa: "Outra Sócia" });
      void organizationId;
      await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${org}, ${userId}, 'member')`;
      const equipe = await m.entrar("outra@exemplo.adv.br");
      await m.json(m.app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: equipe, origin: m.env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: org }) }));
      expect((await m.json(m.com(equipe, "/eu"))).usuario.papel).toBe("member");
      for (const [metodo, caminho] of [["GET", "/plano"], ["POST", "/plano/assinar"], ["POST", "/plano/cancelar"]] as const) {
        const r = await m.com(equipe, caminho, { method: metodo });
        expect(r.status).toBe(403);
        expect((await m.json(r)).erro).toBe("so_socios");
      }
    });

    test("o Asaas recusando o pedido vira uma frase para a tela, sem guardar link nenhum", async () => {
      const recusa = montarApi(t, { ativa: true, asaas: asaasFalso({ recusarLink: true }) });
      const outro = await escritorioEmTeste("silva", "Silva Advocacia", null);
      const c = await recusa.entrar("silva@exemplo.adv.br");
      const r = await recusa.com(c, "/plano/assinar", { method: "POST" });
      expect(r.status).toBe(503);
      expect((await m.json(r)).erro).toBe("asaas_fora");
      expect((await organizacao(t, outro)).asaas_link_id).toBeNull();
    });

    test("cobrança desligada: nada de assinar, e a tela diz que ainda não foi aberta", async () => {
      const desligada = montarApi(t, { ativa: false });
      const c = await desligada.entrar("lopes@exemplo.adv.br");
      const r = await desligada.com(c, "/plano/assinar", { method: "POST" });
      expect(r.status).toBe(409);
      expect((await m.json(r)).erro).toBe("cobranca_desligada");
      const plano = await desligada.json(desligada.com(c, "/plano"));
      expect(plano).toMatchObject({ cobrancaAtiva: false, podeAssinar: false, aviso: null, acesso: "total" });
    });

    test("a demonstração e o escritório de cortesia não assinam", async () => {
      const { organizationId: demo } = await m.novo({ nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, email: "teste@decreta.site", pessoa: "Sócia" });
      void demo;
      const c = await m.entrar("teste@decreta.site");
      expect((await m.com(c, "/plano/assinar", { method: "POST" })).status).toBe(403);
      const { organizationId: cortesia } = await m.novo({ nome: "Casa de Cortesia", slug: "cortesia", email: "cortesia@exemplo.adv.br", pessoa: "Sócia Cortesia" });
      void cortesia;
      const cc = await m.entrar("cortesia@exemplo.adv.br");
      const r = await m.com(cc, "/plano/assinar", { method: "POST" });
      expect(r.status).toBe(409);
      expect((await m.json(r)).erro).toBe("cortesia");
    });
  });

  describe("cancelar", () => {
    let org = "";
    let cookie = "";
    const vencimentoPago = somarDias(HOJE, -10);

    beforeAll(async () => {
      org = await escritorioEmTeste("lima", "Lima Advogados", "link_l");
      cookie = await m.entrar("lima@exemplo.adv.br");
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_l1", vencimento: vencimentoPago, status: "RECEIVED", assinatura: "sub_l", link: "link_l", cliente: "cus_l", pagaEm: vencimentoPago })));
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_l2", vencimento: somarDias(HOJE, 20), assinatura: "sub_l", link: "link_l", cliente: "cus_l" })));
    });

    test("quem não assina não tem o que cancelar", async () => {
      const semAssinatura = await escritorioEmTeste("sem-assinatura", "Sem Assinatura", null);
      void semAssinatura;
      const c = await m.entrar("sem-assinatura@exemplo.adv.br");
      const r = await m.com(c, "/plano/cancelar", { method: "POST" });
      expect(r.status).toBe(409);
      expect((await m.json(r)).erro).toBe("sem_assinatura");
      expect((await m.json(m.com(c, "/plano"))).podeCancelar).toBe(false);
    });

    test("o Asaas fora do ar não cancela nada aqui: a assinatura segue como estava", async () => {
      const fora = montarApi(t, { ativa: true, asaas: asaasFalso({ falharNoCancelamento: true }) });
      const c = await fora.entrar("lima@exemplo.adv.br");
      const r = await fora.com(c, "/plano/cancelar", { method: "POST" });
      expect(r.status).toBe(503);
      expect((await m.json(r)).detalhe).toContain("Nada mudou");
      expect(await organizacao(t, org)).toMatchObject({ asaas_assinatura_id: "sub_l", cancelamento_pedido_em: null, acesso_ate: null });
    });

    test("cancelar vale até o fim do período pago: apaga no Asaas, tira as cobranças abertas e não apaga dado nenhum", async () => {
      expect((await m.json(m.com(cookie, "/plano"))).podeCancelar).toBe(true);
      const r = await m.json(m.com(cookie, "/plano/cancelar", { method: "POST" }));
      const fim = fimDoPeriodoPago(vencimentoPago);
      expect(r.acessoAte).toBe(fim);
      expect(m.asaas.de("DELETE", "/v3/subscriptions/sub_l")).toHaveLength(1);

      const o = await organizacao(t, org);
      expect(dia(o.acesso_ate)).toBe(fim);
      expect(o).toMatchObject({ asaas_assinatura_id: null, situacao: "ativo" });
      expect(o.cancelamento_pedido_em).not.toBeNull();
      expect((await faturasDe(t, org)).map((f) => [f.id, f.situacao])).toEqual([
        ["pay_l1", "paga"],
        ["pay_l2", "removida"],
      ]);

      const plano = await m.json(m.com(cookie, "/plano"));
      expect(plano).toMatchObject({ situacao: "ativo", cancelamentoAgendado: true, acesso: "total", podeCancelar: false, acessoAte: fim });
      expect(plano.faturas.map((f: { id: string }) => f.id)).toEqual(["pay_l1"]);
      expect(plano.aviso.texto).toContain(fim.split("-").reverse().join("/"));
      // Continua trabalhando até o fim do período pago.
      expect((await m.com(cookie, "/clientes", { json: { nome: "Cliente Novo" } })).status).toBe(201);
    });

    test("cancelar de novo é recusado", async () => {
      const r = await m.com(cookie, "/plano/cancelar", { method: "POST" });
      expect(r.status).toBe(409);
      expect((await m.json(r)).erro).toBe("sem_assinatura");
    });

    test("depois do período pago o escritório fica só para leitura, sem nada apagado; assinar de novo e pagar desfaz o cancelamento", async () => {
      await porNaAssinatura(t, org, { acesso_ate: somarDias(HOJE, -1) });
      const bloqueio = await m.com(cookie, "/clientes", { json: { nome: "Outro Cliente" } });
      expect(bloqueio.status).toBe(403);
      expect((await m.json(bloqueio)).erro).toBe("so_leitura");
      expect((await m.com(cookie, "/clientes")).status).toBe(200);
      expect((await m.json(m.com(cookie, "/plano"))).situacao).toBe("cancelado");

      const novoLink = await m.json(m.com(cookie, "/plano/assinar", { method: "POST" }));
      expect(novoLink.url).toContain("sandbox.asaas.com");
      // A pessoa preencheu o link: assinatura nova, primeira cobrança paga.
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_l3", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_l2", link: "link_l", cliente: "cus_l", pagaEm: HOJE })));
      const o = await organizacao(t, org);
      expect(o).toMatchObject({ situacao: "ativo", asaas_assinatura_id: "sub_l2", cancelamento_pedido_em: null, acesso_ate: null });
      expect((await m.com(cookie, "/clientes", { json: { nome: "Outro Cliente" } })).status).toBe(201);
    });
  });
});
