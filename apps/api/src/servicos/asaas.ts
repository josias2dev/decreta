/**
 * O Asaas (docs.asaas.com), de onde vem a cobrança: Pix, boleto e cartão pela página de
 * pagamento do próprio Asaas. O Decreta só pede o link da assinatura e manda cancelar;
 * o dado de cartão é digitado lá, nunca aqui.
 *
 * Como o escritório assina: o link de pagamento recorrente (`POST /v3/paymentLinks`, tipo
 * `RECURRENT`, ciclo mensal, forma `UNDEFINED`: quem paga escolhe Pix, boleto ou cartão). Quando
 * a pessoa preenche o link, o Asaas cria o cliente e a assinatura e avisa pelo webhook
 * (`servicos/cobranca.ts`). Cancelar é `DELETE /v3/subscriptions/{id}`.
 *
 * A chave vai só no cabeçalho `access_token`, de variável de ambiente. O `fetch` entra de fora,
 * como nos outros serviços externos, para os testes usarem um Asaas de mentira.
 */

const URLS = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;

export class ErroDoAsaas extends Error {
  constructor(
    readonly status: number,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface LinkDeAssinatura {
  id: string;
  url: string;
}

export interface PedidoDeLink {
  nome: string;
  descricao: string;
  valorCentavos: number;
  /** O escritório, no campo livre do Asaas. */
  referencia: string;
  /** Para onde a pessoa volta depois de pagar. */
  voltarPara: string;
}

/** Os dados fiscais da nota de serviço da mensalidade (a emissão do Asaas); ver `NFSE_*` em `env.ts`. */
export interface ConfigDaNfse {
  servicoMunicipalId: string;
  servicoCodigo: string;
  servicoNome: string;
  issPercentual: number;
  issRetido: boolean;
}

export interface ClienteAsaas {
  criarLinkDeAssinatura(p: PedidoDeLink): Promise<LinkDeAssinatura>;
  /** Cancela a assinatura (o Asaas apaga também as cobranças pendentes e vencidas). Já cancelada é o mesmo que feito. */
  cancelarAssinatura(assinaturaId: string): Promise<void>;
  /** Tira o link de pagamento do ar (`DELETE /v3/paymentLinks/{id}`) quando ele já virou uma assinatura: ninguém o preenche de novo. */
  removerLink(linkId: string): Promise<void>;
  /** Liga a emissão automática de NFS-e a cada mensalidade paga. */
  configurarNotasFiscais(assinaturaId: string, c: ConfigDaNfse): Promise<void>;
}

export function criarClienteAsaas(opcoes: { apiKey: string; ambiente: "sandbox" | "producao"; fetch?: typeof fetch }): ClienteAsaas {
  const base = URLS[opcoes.ambiente];
  const doFetch = opcoes.fetch ?? fetch;

  async function chamar<T>(metodo: string, caminho: string, corpo?: unknown): Promise<{ status: number; corpo: T | null }> {
    const res = await doFetch(`${base}${caminho}`, {
      method: metodo,
      headers: { access_token: opcoes.apiKey, "user-agent": "Decreta", ...(corpo !== undefined ? { "content-type": "application/json" } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => null)) as (T & { errors?: { description?: string }[] }) | null;
    if (!res.ok && res.status !== 404) {
      throw new ErroDoAsaas(res.status, json?.errors?.[0]?.description ?? `O Asaas recusou o pedido (${res.status}).`);
    }
    return { status: res.status, corpo: res.ok ? json : null };
  }

  return {
    async criarLinkDeAssinatura(p) {
      const { corpo } = await chamar<{ id?: string; url?: string }>("POST", "/paymentLinks", {
        name: p.nome,
        description: p.descricao,
        billingType: "UNDEFINED",
        chargeType: "RECURRENT",
        subscriptionCycle: "MONTHLY",
        value: p.valorCentavos / 100,
        dueDateLimitDays: 5,
        externalReference: p.referencia,
        notificationEnabled: true,
        callback: { successUrl: p.voltarPara, autoRedirect: true },
      });
      if (!corpo?.id || !corpo.url) throw new ErroDoAsaas(502, "O Asaas não devolveu o link de pagamento.");
      return { id: corpo.id, url: corpo.url };
    },

    async removerLink(linkId) {
      await chamar("DELETE", `/paymentLinks/${encodeURIComponent(linkId)}`);
    },

    async cancelarAssinatura(assinaturaId) {
      await chamar("DELETE", `/subscriptions/${encodeURIComponent(assinaturaId)}`);
    },

    async configurarNotasFiscais(assinaturaId, c) {
      const aliquota = { retainIss: c.issRetido, iss: c.issPercentual, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 };
      await chamar("POST", `/subscriptions/${encodeURIComponent(assinaturaId)}/invoiceSettings`, {
        municipalServiceId: c.servicoMunicipalId,
        municipalServiceCode: c.servicoCodigo,
        municipalServiceName: c.servicoNome,
        effectiveDatePeriod: "ON_PAYMENT_CONFIRMATION",
        observations: "Mensalidade do Decreta.",
        taxes: aliquota,
      });
    },
  };
}
