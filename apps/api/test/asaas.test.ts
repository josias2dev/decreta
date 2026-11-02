/**
 * O cliente do Asaas, contra um servidor de mentira. Confere o que sai (endereço por
 * ambiente, cabeçalhos, campos de cada pedido, as contas em centavos) e que a chave
 * nunca aparece em mensagem de erro. NÃO fala com o Asaas de verdade.
 */
import { describe, expect, test } from "bun:test";
import { AsaasErro, buscarOuCriarCliente, conferirChave, criarAutorizacaoPix, criarCobranca, criarWebhook, EVENTOS_DO_WEBHOOK, removerCobranca, removerWebhook, type ContaAsaas } from "../src/servicos/asaas-do-escritorio.ts";

const CHAVE = "$aact_hmlg_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDAwMDAwMDAwMDAwNDA0OTc6OiRhYWNoXzJmNDBhNGM0";

interface Chamada {
  url: string;
  metodo: string;
  cabecalhos: Record<string, string>;
  corpo: any;
}

function servidor(respostas: ((c: Chamada) => { status?: number; corpo?: unknown }) | { status?: number; corpo?: unknown }[]) {
  const chamadas: Chamada[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const c: Chamada = { url, metodo: init.method ?? "GET", cabecalhos: Object.fromEntries(new Headers(init.headers).entries()), corpo: init.body ? JSON.parse(String(init.body)) : null };
    chamadas.push(c);
    const r = typeof respostas === "function" ? respostas(c) : (respostas[chamadas.length - 1] ?? { status: 200, corpo: {} });
    return new Response(JSON.stringify(r.corpo ?? {}), { status: r.status ?? 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  return { fetch: f, chamadas };
}

const conta = (s: { fetch: typeof fetch }, ambiente: ContaAsaas["ambiente"] = "sandbox"): ContaAsaas => ({ chave: CHAVE, ambiente, fetch: s.fetch });

describe("pedidos ao Asaas", () => {
  test("o ambiente escolhe o endereço, e a chave vai no cabeçalho access_token com um User-Agent", async () => {
    const s = servidor([{ corpo: { data: [], totalCount: 0 } }, { corpo: { data: [], totalCount: 0 } }]);
    await conferirChave(conta(s, "sandbox"));
    await conferirChave(conta(s, "producao"));
    expect(s.chamadas[0]!.url).toBe("https://api-sandbox.asaas.com/v3/customers?limit=1");
    expect(s.chamadas[1]!.url).toBe("https://api.asaas.com/v3/customers?limit=1");
    expect(s.chamadas[0]!.cabecalhos["access_token"]).toBe(CHAVE);
    expect(s.chamadas[0]!.cabecalhos["user-agent"]).toMatch(/^Decreta\//);
  });

  test("a cobrança sai pelo link do Asaas (Pix, boleto e cartão), com o vencimento da parcela e o valor em reais exatos", async () => {
    const s = servidor([{ corpo: { id: "pay_123", status: "PENDING", invoiceUrl: "https://sandbox.asaas.com/i/123", dueDate: "2026-11-30" } }]);
    const r = await criarCobranca(conta(s), { clienteAsaas: "cus_1", valorCentavos: 123_456, vencimento: "2026-11-30", descricao: "Honorários · parcela 1/3", referencia: "parcela-1" });
    expect(r).toEqual({ id: "pay_123", link: "https://sandbox.asaas.com/i/123", vencimento: "2026-11-30" });
    expect(s.chamadas[0]).toMatchObject({ metodo: "POST", url: "https://api-sandbox.asaas.com/v3/payments", corpo: { customer: "cus_1", billingType: "UNDEFINED", value: 1234.56, dueDate: "2026-11-30", description: "Honorários · parcela 1/3", externalReference: "parcela-1" } });
  });

  test("centavos viram reais sem erro de arredondamento: 0,29 e 19,99", async () => {
    const s = servidor(() => ({ corpo: { id: "pay_1", invoiceUrl: "u", dueDate: "2026-11-30" } }));
    await criarCobranca(conta(s), { clienteAsaas: "cus_1", valorCentavos: 29, vencimento: "2026-11-30", descricao: "x", referencia: "r" });
    await criarCobranca(conta(s), { clienteAsaas: "cus_1", valorCentavos: 1_999, vencimento: "2026-11-30", descricao: "x", referencia: "r" });
    expect(s.chamadas.map((c) => c.corpo.value)).toEqual([0.29, 19.99]);
  });

  test("mensalidade com Pix Automático ativo: a cobrança leva a autorização e vai por Pix", async () => {
    const s = servidor([{ corpo: { id: "pay_9", invoiceUrl: "u", dueDate: "2026-12-10" } }]);
    await criarCobranca(conta(s), { clienteAsaas: "cus_1", valorCentavos: 150_000, vencimento: "2026-12-10", descricao: "Mensalidade 12/2026", referencia: "p", pixAutomaticoId: "aut_77" });
    expect(s.chamadas[0]!.corpo).toMatchObject({ billingType: "PIX", pixAutomaticAuthorizationId: "aut_77" });
  });

  test("a descrição passa do limite do Asaas: é cortada em 500 caracteres", async () => {
    const s = servidor([{ corpo: { id: "pay_1", invoiceUrl: "u", dueDate: "2026-11-30" } }]);
    await criarCobranca(conta(s), { clienteAsaas: "cus_1", valorCentavos: 100, vencimento: "2026-11-30", descricao: "a".repeat(900), referencia: "r" });
    expect(s.chamadas[0]!.corpo.description).toHaveLength(500);
  });

  test("o cliente que já existe no Asaas (pela referência) é reaproveitado; o que não existe é criado", async () => {
    const achado = servidor([{ corpo: { data: [{ id: "cus_existente" }], totalCount: 1 } }]);
    expect(await buscarOuCriarCliente(conta(achado), { id: "c-1", nome: "Marina Duarte", cpfCnpj: "52998224725" })).toBe("cus_existente");
    expect(achado.chamadas).toHaveLength(1);
    expect(achado.chamadas[0]!.url).toBe("https://api-sandbox.asaas.com/v3/customers?externalReference=c-1&limit=1");

    const novo = servidor([{ corpo: { data: [], totalCount: 0 } }, { corpo: { id: "cus_novo" } }]);
    expect(await buscarOuCriarCliente(conta(novo), { id: "c-1", nome: "Marina Duarte", cpfCnpj: "52998224725", email: "marina@exemplo.com.br", telefone: "47991234567" })).toBe("cus_novo");
    expect(novo.chamadas[1]).toMatchObject({ metodo: "POST", url: "https://api-sandbox.asaas.com/v3/customers", corpo: { name: "Marina Duarte", cpfCnpj: "52998224725", email: "marina@exemplo.com.br", mobilePhone: "47991234567", externalReference: "c-1" } });
  });

  test("apagar a cobrança chama DELETE nela", async () => {
    const s = servidor([{ corpo: { deleted: true, id: "pay_123" } }]);
    await removerCobranca(conta(s), "pay_123");
    expect(s.chamadas[0]).toMatchObject({ metodo: "DELETE", url: "https://api-sandbox.asaas.com/v3/payments/pay_123" });
  });

  test("o aviso (webhook) nasce com o segredo, só os eventos de que o Decreta precisa e a fila em ordem", async () => {
    const s = servidor([{ corpo: { id: "wh_1" } }]);
    const id = await criarWebhook(conta(s), { url: "https://decreta.site/api/cobranca/asaas/org_1", email: "beatriz@souza.adv.br", token: "t".repeat(40), pixAutomatico: false });
    expect(id).toBe("wh_1");
    const corpo = s.chamadas[0]!.corpo;
    expect(corpo).toMatchObject({ url: "https://decreta.site/api/cobranca/asaas/org_1", email: "beatriz@souza.adv.br", enabled: true, interrupted: false, apiVersion: 3, authToken: "t".repeat(40), sendType: "SEQUENTIALLY" });
    expect(corpo.events).toEqual(EVENTOS_DO_WEBHOOK.pagamentos);
    expect(corpo.events).toContain("PAYMENT_RECEIVED");
    expect(corpo.events).toContain("PAYMENT_CONFIRMED");
    expect(corpo.events.some((e: string) => e.startsWith("PIX_AUTOMATIC"))).toBe(false);
  });

  test("com Pix Automático, o aviso também leva os eventos da autorização", async () => {
    const s = servidor([{ corpo: { id: "wh_1" } }]);
    await criarWebhook(conta(s), { url: "https://x/y", email: "a@b.com", token: "t".repeat(40), pixAutomatico: true });
    expect(s.chamadas[0]!.corpo.events).toEqual([...EVENTOS_DO_WEBHOOK.pagamentos, ...EVENTOS_DO_WEBHOOK.pixAutomatico]);
  });

  test("apagar o aviso chama DELETE nele", async () => {
    const s = servidor([{ corpo: { deleted: true } }]);
    await removerWebhook(conta(s), "wh_1");
    expect(s.chamadas[0]).toMatchObject({ metodo: "DELETE", url: "https://api-sandbox.asaas.com/v3/webhooks/wh_1" });
  });

  test("autorização do Pix Automático: mensal, a cobrança a cargo do Decreta, com o QR Code da primeira cobrança", async () => {
    const s = servidor([{ corpo: { id: "aut_1", status: "CREATED", payload: "00020126...", encodedImage: "iVBORw0KGgo=" } }]);
    const r = await criarAutorizacaoPix(conta(s), { clienteAsaas: "cus_1", contrato: "0123456789abcdef0123456789abcdef", inicio: "2026-12-10", valorCentavos: 150_000, descricao: "Honorários mensais", primeiraCobrancaCentavos: 150_000 });
    expect(r).toEqual({ id: "aut_1", situacao: "CREATED", payload: "00020126...", imagem: "iVBORw0KGgo=" });
    expect(s.chamadas[0]).toMatchObject({
      metodo: "POST",
      url: "https://api-sandbox.asaas.com/v3/pix/automatic/authorizations",
      corpo: { customerId: "cus_1", frequency: "MONTHLY", contractId: "0123456789abcdef0123456789abcdef", startDate: "2026-12-10", value: 1500, paymentCreationMode: "MANUAL", immediateQrCode: { originalValue: 1500 } },
    });
    expect(s.chamadas[0]!.corpo.immediateQrCode.expirationSeconds).toBeGreaterThan(0);
  });
});

describe("erros do Asaas", () => {
  test("a frase do Asaas vem para a pessoa, e a chave nunca vai junto", async () => {
    const s = servidor([{ status: 400, corpo: { errors: [{ code: "invalid_customer", description: "Cliente inválido ou não encontrado." }] } }]);
    try {
      await criarCobranca(conta(s), { clienteAsaas: "cus_x", valorCentavos: 100, vencimento: "2026-11-30", descricao: "x", referencia: "r" });
      throw new Error("devia falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(AsaasErro);
      expect((err as AsaasErro).message).toBe("Cliente inválido ou não encontrado.");
      expect((err as AsaasErro).codigos).toEqual(["invalid_customer"]);
      expect((err as AsaasErro).status).toBe(400);
      expect(JSON.stringify(err)).not.toContain(CHAVE);
      expect(String((err as Error).stack)).not.toContain(CHAVE);
    }
  });

  test("chave recusada (401) diz para conferir a chave e o ambiente", async () => {
    const s = servidor([{ status: 401, corpo: { errors: [{ code: "invalid_environment", description: "A chave de API informada não pertence a este ambiente" }] } }]);
    await expect(conferirChave(conta(s))).rejects.toMatchObject({ status: 401, message: expect.stringContaining("chave") });
  });

  test("resposta que nem é JSON vira um erro sem o corpo, e sem a chave", async () => {
    const f = (async () => new Response("<html>Bad gateway</html>", { status: 502 })) as unknown as typeof fetch;
    try {
      await conferirChave({ chave: CHAVE, ambiente: "sandbox", fetch: f });
      throw new Error("devia falhar");
    } catch (err) {
      expect(err).toBeInstanceOf(AsaasErro);
      expect((err as AsaasErro).status).toBe(502);
      expect((err as Error).message).not.toContain("html");
      expect((err as Error).message).not.toContain(CHAVE);
    }
  });

  test("sem resposta a tempo: erro do Asaas com status 0", async () => {
    const f = (async () => {
      throw new DOMException("sem resposta", "TimeoutError");
    }) as unknown as typeof fetch;
    await expect(conferirChave({ chave: CHAVE, ambiente: "sandbox", fetch: f })).rejects.toMatchObject({ status: 0 });
  });
});
