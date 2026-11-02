/**
 * A cobrança quando o Asaas faz o que o Asaas faz: avisa fora de ordem, avisa duas vezes, avisa 30 dias depois (o
 * cartão), esquece um aviso de atraso e entrega dois avisos do mesmo escritório ao mesmo tempo.
 */
import { fimDoPeriodoPago, hojeEm, PLANO, somarDias } from "@decreta/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { readEnv } from "../src/env.ts";
import { acessoLiberado, comoNasce } from "../src/servicos/assinatura.ts";
import { linkDoAsaas, reconciliarAssinaturas } from "../src/servicos/cobranca.ts";
import { asaasFalso, avisoDeAssinatura, avisoDePagamento, pagamento } from "./asaas-falso.ts";
import { dia, faturasDe, montarApi, organizacao, porNaAssinatura } from "./cobranca-apoio.ts";

const HOJE = hojeEm("America/Sao_Paulo");

describe("o que se aceita do ambiente e do que vem do Asaas", () => {
  const base = { DATABASE_URL: "postgres://x@localhost/x", BETTER_AUTH_SECRET: "a".repeat(32), BETTER_AUTH_URL: "http://localhost:8787" };

  test("o token do aviso é longo e nunca a chave de API", () => {
    expect(() => readEnv({ ...base, ASAAS_WEBHOOK_TOKEN: "curto" })).toThrow(/24 caracteres/);
    expect(() => readEnv({ ...base, ASAAS_API_KEY: "a".repeat(40), ASAAS_WEBHOOK_TOKEN: "a".repeat(40) })).toThrow(/chave de API/);
    expect(readEnv({ ...base, ASAAS_WEBHOOK_TOKEN: "t".repeat(40), ASAAS_API_KEY: "outra-chave" }).ASAAS_WEBHOOK_TOKEN).toHaveLength(40);
    // Sem token configurado (o padrão), nada a validar.
    expect(readEnv(base).ASAAS_WEBHOOK_TOKEN).toBe("");
  });

  test("o link da fatura só vale se for https do Asaas", () => {
    expect(linkDoAsaas("https://www.asaas.com/i/080225913252")).toBe("https://www.asaas.com/i/080225913252");
    expect(linkDoAsaas("https://sandbox.asaas.com/i/1")).toBe("https://sandbox.asaas.com/i/1");
    for (const ruim of ["http://www.asaas.com/i/1", "https://asaas.com.evil.net/i/1", "https://evilasaas.com/i/1", "javascript:alert(1)", "//asaas.com/i/1", "", null, undefined]) expect(linkDoAsaas(ruim)).toBeNull();
  });

  test("sem acesso total só passam os métodos de leitura conhecidos", () => {
    for (const metodo of ["PATCH", "patch", "TRACE", "PROPFIND", "post"]) expect(acessoLiberado("leitura", metodo, "/clientes")).toBe(false);
    for (const metodo of ["GET", "HEAD", "OPTIONS"]) expect(acessoLiberado("leitura", metodo, "/clientes")).toBe(true);
  });
});

describe.skipIf(!hasTestDatabase)("avisos do Asaas que chegam como não deviam", () => {
  let t: TestDatabase;
  let m: ReturnType<typeof montarApi>;
  const logs: { msg: string; extra?: Record<string, unknown> }[] = [];

  beforeAll(async () => {
    t = await createTestDatabase();
    m = montarApi(t, { ativa: true, log: (msg, extra) => void logs.push({ msg, extra }) });
    PLANO.valorMensalCentavos = 9900;
  });

  afterAll(async () => {
    PLANO.valorMensalCentavos = null;
    await t?.drop();
  });

  const emTeste = async (slug: string, link: string | null) => {
    const { organizationId } = await m.novo({ nome: `Escritório ${slug}`, slug, email: `${slug}@exemplo.adv.br`, pessoa: slug, cadastroAberto: true, assinatura: comoNasce(true, true) });
    if (link) await porNaAssinatura(t, organizationId, { asaas_link_id: link });
    return { id: organizationId, cookie: await m.entrar(`${slug}@exemplo.adv.br`) };
  };
  /** Um escritório que já paga: assinatura viva, uma mensalidade paga há 10 dias. */
  const pagante = async (slug: string, assinatura: string) => {
    const e = await emTeste(slug, `link_${slug}`);
    const venc = somarDias(HOJE, -10);
    await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: `pay_${slug}_1`, vencimento: venc, status: "RECEIVED", assinatura, link: `link_${slug}`, cliente: `cus_${slug}`, pagaEm: venc })));
    return { ...e, venc };
  };

  describe("assinatura que já acabou", () => {
    test("o recebimento do cartão, 30 dias depois, não reabre a assinatura cancelada nem desfaz o cancelamento", async () => {
      const x = await pagante("cartao", "sub_c1");
      const fim = fimDoPeriodoPago(x.venc);
      await m.com(x.cookie, "/plano/cancelar", { method: "POST" });
      let o = await organizacao(t, x.id);
      expect(o).toMatchObject({ asaas_assinatura_id: null, asaas_assinaturas_encerradas: ["sub_c1"] });
      expect(dia(o.acesso_ate)).toBe(fim);

      // Avisos atrasados da assinatura cancelada: o recebimento, uma cobrança que a gente nem tinha e o atraso dela.
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: `pay_cartao_1`, vencimento: x.venc, status: "RECEIVED", assinatura: "sub_c1", link: "link_cartao", cliente: "cus_cartao", pagaEm: HOJE })));
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_cartao_x", vencimento: somarDias(HOJE, -20), status: "OVERDUE", assinatura: "sub_c1", link: "link_cartao", cliente: "cus_cartao" })));
      o = await organizacao(t, x.id);
      expect(o).toMatchObject({ asaas_assinatura_id: null, situacao: "ativo", inadimplente_desde: null });
      expect(dia(o.acesso_ate)).toBe(fim);
      expect(o.cancelamento_pedido_em).not.toBeNull();
      // A cobrança fica no histórico, mas não conta para o atraso.
      expect((await faturasDe(t, x.id)).map((f) => f.id)).toContain("pay_cartao_x");
      const eu = await m.json(m.com(x.cookie, "/eu"));
      expect(eu.assinatura).toMatchObject({ situacao: "ativo", acesso: "total" });
      expect(eu.assinatura.aviso.nivel).toBe("atencao");
    });

    test("depois do período pago o escritório cancelado fica só leitura, e um aviso atrasado da assinatura velha não o destrava", async () => {
      const x = await pagante("velha", "sub_v1");
      await m.com(x.cookie, "/plano/cancelar", { method: "POST" });
      await porNaAssinatura(t, x.id, { acesso_ate: somarDias(HOJE, -1) });
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_velha_9", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_v1", link: "link_velha", cliente: "cus_velha", pagaEm: HOJE })));
      expect((await m.com(x.cookie, "/clientes", { json: { nome: "Cliente Velho" } })).status).toBe(403);
      expect((await m.json(m.com(x.cookie, "/plano"))).situacao).toBe("cancelado");
    });

    test("a assinatura nova, depois de cancelar, é adotada e desfaz o cancelamento só quando é paga", async () => {
      const x = await pagante("nova", "sub_n1");
      await m.com(x.cookie, "/plano/cancelar", { method: "POST" });
      // Primeiro a cobrança da assinatura nova só nasce: ela vira a viva, mas o cancelamento só some quando for paga.
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_nova_2", vencimento: HOJE, assinatura: "sub_n2", link: "link_nova", cliente: "cus_nova" })));
      let o = await organizacao(t, x.id);
      expect(o).toMatchObject({ asaas_assinatura_id: "sub_n2" });
      expect(o.cancelamento_pedido_em).not.toBeNull();
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_nova_2", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_n2", link: "link_nova", cliente: "cus_nova", pagaEm: HOJE })));
      o = await organizacao(t, x.id);
      expect(o).toMatchObject({ situacao: "ativo", asaas_assinatura_id: "sub_n2", cancelamento_pedido_em: null, acesso_ate: null, asaas_assinaturas_encerradas: ["sub_n1"] });
    });
  });

  describe("duas assinaturas vivas", () => {
    test("o link preenchido duas vezes não troca a assinatura gravada: a segunda fica registrada e o cancelamento cancela a que está viva", async () => {
      const x = await pagante("dupla", "sub_d1");
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_dupla_2", vencimento: somarDias(HOJE, 20), assinatura: "sub_d2", link: "link_dupla", cliente: "cus_dupla" })));
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_dupla_3", vencimento: somarDias(HOJE, -5), status: "OVERDUE", assinatura: "sub_d2", link: "link_dupla", cliente: "cus_dupla" })));
      // Fica no log, para a equipe ver e cancelar a sobrante no Asaas.
      expect(logs.some((l) => l.msg.startsWith("assinatura duplicada") && l.extra?.viva === "sub_d1" && l.extra?.nova === "sub_d2")).toBe(true);
      const o = await organizacao(t, x.id);
      expect(o).toMatchObject({ asaas_assinatura_id: "sub_d1", situacao: "ativo", inadimplente_desde: null });
      // A fatura da segunda assinatura está no histórico, e a lista da tela a mostra.
      expect((await faturasDe(t, x.id)).map((f) => f.id)).toEqual(expect.arrayContaining(["pay_dupla_2", "pay_dupla_3"]));
      await m.com(x.cookie, "/plano/cancelar", { method: "POST" });
      expect(m.asaas.de("DELETE", "/v3/subscriptions/sub_d1")).toHaveLength(1);
      expect(m.asaas.de("DELETE", "/v3/subscriptions/sub_d2")).toHaveLength(0);
    });

    test("o link que já virou assinatura sai do ar no Asaas e do escritório: quem assina de novo ganha um link novo", async () => {
      const x = await emTeste("linkunico", null);
      const cookie = x.cookie;
      const { url } = await m.json(m.com(cookie, "/plano/assinar", { method: "POST" }));
      const idDoLink = (await organizacao(t, x.id)).asaas_link_id as string;
      expect(url).toContain(idDoLink);
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_lu_1", vencimento: HOJE, assinatura: "sub_lu", link: idDoLink, cliente: "cus_lu" })));
      expect(m.asaas.de("DELETE", `/v3/paymentLinks/${idDoLink}`)).toHaveLength(1);
      const o = await organizacao(t, x.id);
      expect(o).toMatchObject({ asaas_assinatura_id: "sub_lu", asaas_link_id: null, asaas_link_url: null });
      // A assinatura está viva (ainda sem pagamento): não dá para abrir outra, mas dá para cancelar e recomeçar.
      const plano = await m.json(m.com(cookie, "/plano"));
      expect(plano).toMatchObject({ podeAssinar: false, assinante: true, podeCancelar: true });
      expect((await m.com(cookie, "/plano/assinar", { method: "POST" })).status).toBe(409);
      const cancelou = await m.json(m.com(cookie, "/plano/cancelar", { method: "POST" }));
      expect(cancelou.acessoAte).toBeNull();
      expect(await organizacao(t, x.id)).toMatchObject({ asaas_assinatura_id: null, situacao: "teste", asaas_assinaturas_encerradas: ["sub_lu"] });
      expect((await m.json(m.com(cookie, "/plano"))).podeAssinar).toBe(true);
    });
  });

  describe("o aviso de atraso que não chegou", () => {
    test("fatura em aberto que passou do vencimento vira atraso pela rotina da manhã, e a régua corre desde o vencimento", async () => {
      const x = await pagante("esquecida", "sub_e1");
      const venc = somarDias(HOJE, -8);
      // Só o PAYMENT_CREATED chegou; o PAYMENT_OVERDUE se perdeu (fila do Asaas pausada, por exemplo).
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_esq_2", vencimento: venc, assinatura: "sub_e1", link: "link_esquecida", cliente: "cus_esquecida" })));
      expect((await organizacao(t, x.id)).situacao).toBe("inadimplente");
      // A conta já olha a data quando chega qualquer aviso; a rotina da manhã faz o mesmo sem esperar aviso.
      await porNaAssinatura(t, x.id, { situacao: "ativo", inadimplente_desde: null });
      const r = await reconciliarAssinaturas({ db: t.db, log: (msg, extra) => logs.push({ msg, extra }) });
      expect(r.acertados).toBeGreaterThanOrEqual(1);
      const o = await organizacao(t, x.id);
      expect(o.situacao).toBe("inadimplente");
      expect(dia(o.inadimplente_desde)).toBe(venc);
      // 8 dias de atraso: já é só leitura.
      expect((await m.com(x.cookie, "/clientes", { json: { nome: "Cliente Atrasado" } })).status).toBe(403);
      // Rodar de novo não muda nada.
      expect((await reconciliarAssinaturas({ db: t.db, log: () => {} })).acertados).toBe(0);
    });

    test("pagar a fatura vencida volta ao normal; cortesia e só leitura da equipe não são mexidos pela rotina", async () => {
      const x = await pagante("quitou", "sub_q1");
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_q_2", vencimento: somarDias(HOJE, -3), assinatura: "sub_q1", link: "link_quitou", cliente: "cus_quitou" })));
      expect((await organizacao(t, x.id)).situacao).toBe("inadimplente");
      await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_q_2", vencimento: somarDias(HOJE, -3), status: "RECEIVED", assinatura: "sub_q1", link: "link_quitou", cliente: "cus_quitou", pagaEm: HOJE })));
      await reconciliarAssinaturas({ db: t.db, log: () => {} });
      expect(await organizacao(t, x.id)).toMatchObject({ situacao: "ativo", inadimplente_desde: null });

      const manual = await pagante("manual", "sub_m1");
      await porNaAssinatura(t, manual.id, { situacao: "so_leitura" });
      await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: "pay_m_2", vencimento: somarDias(HOJE, -3), assinatura: "sub_m1", link: "link_manual", cliente: "cus_manual" })));
      await reconciliarAssinaturas({ db: t.db, log: () => {} });
      expect(await organizacao(t, manual.id)).toMatchObject({ situacao: "so_leitura", inadimplente_desde: null });
    });

    test("estornar o único pagamento e apagar a cobrança em atraso não deixa o escritório inadimplente sem fatura para pagar", async () => {
      const x = await pagante("estorno", "sub_s1");
      await m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: "pay_s_2", vencimento: somarDias(HOJE, -2), status: "OVERDUE", assinatura: "sub_s1", link: "link_estorno", cliente: "cus_estorno" })));
      expect((await organizacao(t, x.id)).situacao).toBe("inadimplente");
      await m.aviso(avisoDePagamento("PAYMENT_DELETED", pagamento({ id: "pay_s_2", vencimento: somarDias(HOJE, -2), status: "OVERDUE", assinatura: "sub_s1", link: "link_estorno", cliente: "cus_estorno" })));
      expect(await organizacao(t, x.id)).toMatchObject({ situacao: "ativo", inadimplente_desde: null });
    });
  });

  describe("dois avisos do mesmo escritório ao mesmo tempo", () => {
    test("o recebimento e o atraso da mesma fatura, chegando juntos, terminam sempre em paga e ativo", async () => {
      for (let i = 0; i < 6; i++) {
        const x = await emTeste(`corrida-${i}`, `link_corrida_${i}`);
        const venc = somarDias(HOJE, -2);
        const base = { vencimento: venc, assinatura: `sub_corrida_${i}`, link: `link_corrida_${i}`, cliente: `cus_corrida_${i}` };
        await m.aviso(avisoDePagamento("PAYMENT_CREATED", pagamento({ id: `pay_corrida_${i}`, ...base })));
        await Promise.all([
          m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: `pay_corrida_${i}`, ...base, status: "RECEIVED", pagaEm: HOJE }))),
          m.aviso(avisoDePagamento("PAYMENT_OVERDUE", pagamento({ id: `pay_corrida_${i}`, ...base, status: "OVERDUE" }))),
        ]);
        // Qualquer que seja a ordem em que chegaram, quem pagou não fica em atraso.
        expect((await faturasDe(t, x.id))[0]!.situacao).toBe("paga");
        expect(await organizacao(t, x.id)).toMatchObject({ situacao: "ativo", inadimplente_desde: null });
      }
    });

    test("o mesmo aviso entregue duas vezes ao mesmo tempo é tratado uma vez só", async () => {
      const x = await emTeste("repetido-junto", "link_repetido_junto");
      const aviso = avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_rj_1", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_rj", link: "link_repetido_junto", cliente: "cus_rj", pagaEm: HOJE }));
      const respostas = await Promise.all([m.json(m.aviso(aviso)), m.json(m.aviso(aviso)), m.json(m.aviso(aviso))]);
      expect(respostas.map((r) => r.resultado).sort()).toEqual(["repetido", "repetido", "tratado"]);
      expect((await t.owner<{ n: number }[]>`select count(*)::int as n from eventos_de_cobranca where organization_id = ${x.id}`)[0]!.n).toBe(1);
    });
  });

  describe("a NFS-e", () => {
    test("se a configuração no Asaas falha, o aviso seguinte tenta de novo até dar certo, e depois não repete", async () => {
      const falso = asaasFalso({ falharNaNfse: true });
      const api = montarApi(t, { ativa: true, asaas: falso, nfse: { servicoMunicipalId: "svc_1", servicoCodigo: "1.05", servicoNome: "Licenciamento de software", issPercentual: 2, issRetido: false } });
      const x = await emTeste("nfse-tenta", "link_nfse_tenta");
      const aviso = (evento: string, status: string) => avisoDePagamento(evento, pagamento({ id: "pay_nt_1", vencimento: HOJE, status, assinatura: "sub_nt", link: "link_nfse_tenta", cliente: "cus_nt", pagaEm: HOJE }));
      await api.aviso(aviso("PAYMENT_CREATED", "PENDING"));
      expect(falso.de("POST", "invoiceSettings")).toHaveLength(1);
      expect((await organizacao(t, x.id)).nfse_configurada_em).toBeNull();
      falso.falharNaNfse = false;
      await api.aviso(aviso("PAYMENT_RECEIVED", "RECEIVED"));
      expect(falso.de("POST", "invoiceSettings")).toHaveLength(2);
      expect((await organizacao(t, x.id)).nfse_configurada_em).not.toBeNull();
      await api.aviso(aviso("PAYMENT_CONFIRMED", "CONFIRMED"));
      expect(falso.de("POST", "invoiceSettings")).toHaveLength(2);
    });
  });

  test("o link da fatura que não é do Asaas não vira link na tela", async () => {
    const x = await emTeste("linkruim", "link_linkruim");
    const p = pagamento({ id: "pay_lr_1", vencimento: HOJE, assinatura: "sub_lr", link: "link_linkruim", cliente: "cus_lr" });
    await m.aviso(avisoDePagamento("PAYMENT_CREATED", { ...p, invoiceUrl: "https://asaas.com.evil.net/i/1" }));
    expect((await m.json(m.com(x.cookie, "/plano"))).faturas[0].link).toBeNull();
    await m.aviso(avisoDePagamento("PAYMENT_UPDATED", { ...p, invoiceUrl: "https://www.asaas.com/i/1" }));
    expect((await m.json(m.com(x.cookie, "/plano"))).faturas[0].link).toBe("https://www.asaas.com/i/1");
  });

  test("o eco da assinatura cancelada no Asaas não afeta uma assinatura nova", async () => {
    const x = await pagante("eco", "sub_eco1");
    await m.com(x.cookie, "/plano/cancelar", { method: "POST" });
    await m.aviso(avisoDePagamento("PAYMENT_RECEIVED", pagamento({ id: "pay_eco_2", vencimento: HOJE, status: "RECEIVED", assinatura: "sub_eco2", link: "link_eco", cliente: "cus_eco", pagaEm: HOJE })));
    expect((await organizacao(t, x.id)).asaas_assinatura_id).toBe("sub_eco2");
    // O aviso de exclusão da assinatura antiga, que chega agora, não derruba a nova.
    await m.aviso(avisoDeAssinatura("SUBSCRIPTION_DELETED", "sub_eco1"));
    expect(await organizacao(t, x.id)).toMatchObject({ asaas_assinatura_id: "sub_eco2", situacao: "ativo", cancelamento_pedido_em: null });
  });
});
