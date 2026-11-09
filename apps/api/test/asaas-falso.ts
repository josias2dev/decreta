/**
 * Um Asaas de mentira, no estilo dos outros serviços externos do repositório: um `fetch` que responde como a
 * API do Asaas (docs.asaas.com), para o cliente de verdade (`criarClienteAsaas`) ser exercitado inteiro: a
 * URL, o cabeçalho `access_token` e o corpo de cada pedido. Também monta os avisos (webhooks) no formato da
 * documentação.
 *
 * Nada aqui foi conferido contra o Asaas de verdade: só contra o que a documentação diz.
 */

export const CHAVE_DO_ASAAS = "chave-de-teste-do-asaas";
export const TOKEN_DO_ASAAS = "token-do-aviso-do-asaas";

export interface ChamadaAoAsaas {
  metodo: string;
  caminho: string;
  corpo: Record<string, unknown> | null;
  headers: Headers;
}

export function asaasFalso(opcoes: { falharNoCancelamento?: boolean; recusarLink?: boolean; falharNaNfse?: boolean } = {}) {
  const chamadas: ChamadaAoAsaas[] = [];
  let links = 0;
  const falso = {
    chamadas,
    falharNoCancelamento: opcoes.falharNoCancelamento ?? false,
    recusarLink: opcoes.recusarLink ?? false,
    falharNaNfse: opcoes.falharNaNfse ?? false,
    /** O endereço da nota não existe mais (404): a nota não foi configurada. */
    nfseSumiu: false,
    /** As chamadas de um método e caminho (ou parte dele). */
    de: (metodo: string, caminho: string) => chamadas.filter((c) => c.metodo === metodo && c.caminho.includes(caminho)),
    fetch: (async (entrada: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
      const headers = new Headers(init?.headers);
      const metodo = init?.method ?? "GET";
      const corpo = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      const caminho = url.pathname;
      chamadas.push({ metodo, caminho, corpo, headers });
      const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
      if (url.host !== "api-sandbox.asaas.com" || !caminho.startsWith("/v3/")) return json(404, { errors: [{ code: "invalid_action", description: "Endereço desconhecido." }] });
      if (headers.get("access_token") !== CHAVE_DO_ASAAS) return json(401, { errors: [{ code: "invalid_access_token", description: "A chave de API informada é inválida." }] });
      if (!headers.get("user-agent")) return json(400, { errors: [{ code: "invalid_action", description: "O cabeçalho User-Agent é obrigatório." }] });

      if (metodo === "POST" && caminho === "/v3/paymentLinks") {
        if (falso.recusarLink) return json(400, { errors: [{ code: "invalid_callback", description: "O domínio de retorno não está cadastrado na conta." }] });
        const faltou = ["name", "billingType", "chargeType"].filter((k) => !corpo?.[k]);
        if (faltou.length) return json(400, { errors: [{ code: "invalid_object", description: `Campo obrigatório: ${faltou.join(", ")}.` }] });
        links++;
        const id = `link_${links}`;
        return json(200, { object: "paymentLink", id, name: corpo!.name, url: `https://sandbox.asaas.com/c/${id}`, active: true, deleted: false, ...corpo });
      }
      const linkRemovido = /^\/v3\/paymentLinks\/([^/]+)$/.exec(caminho);
      if (metodo === "DELETE" && linkRemovido) return json(200, { deleted: true, id: linkRemovido[1] });
      const assinatura = /^\/v3\/subscriptions\/([^/]+)$/.exec(caminho);
      if (metodo === "DELETE" && assinatura) {
        if (falso.falharNoCancelamento) return json(500, { errors: [{ code: "internal_error", description: "Erro interno." }] });
        return json(200, { deleted: true, id: assinatura[1] });
      }
      if (metodo === "POST" && assinatura) {
        if (typeof corpo?.value !== "number" || corpo.value <= 0) return json(400, { errors: [{ code: "invalid_value", description: "Informe o valor da assinatura." }] });
        return json(200, { object: "subscription", id: assinatura[1], value: corpo.value, cycle: "MONTHLY", status: "ACTIVE" });
      }
      if (metodo === "POST" && /^\/v3\/subscriptions\/[^/]+\/invoiceSettings$/.test(caminho)) {
        if (falso.nfseSumiu) return json(404, { errors: [{ code: "not_found", description: "Assinatura não encontrada." }] });
        if (falso.falharNaNfse) return json(400, { errors: [{ code: "invalid_municipal_service", description: "O serviço municipal não foi encontrado." }] });
        return json(200, { ...corpo });
      }
      return json(404, { errors: [{ code: "invalid_action", description: "Endereço desconhecido." }] });
    }) as typeof fetch,
  };
  return falso;
}

/** Uma cobrança como vem no aviso: o que a documentação do Asaas mostra no exemplo. */
export function pagamento(p: { id: string; vencimento: string; status?: string; valor?: number; assinatura?: string | null; cliente?: string; link?: string | null; referencia?: string | null; forma?: string; pagaEm?: string | null }) {
  return {
    object: "payment",
    id: p.id,
    customer: p.cliente ?? "cus_1",
    ...(p.assinatura === null ? {} : { subscription: p.assinatura ?? "sub_1" }),
    ...(p.link === null ? {} : { paymentLink: p.link ?? "link_1" }),
    status: p.status ?? "PENDING",
    value: p.valor ?? 99,
    netValue: (p.valor ?? 99) - 1.59,
    dueDate: p.vencimento,
    invoiceUrl: `https://sandbox.asaas.com/i/${p.id.replace("pay_", "")}`,
    billingType: p.forma ?? "UNDEFINED",
    externalReference: p.referencia ?? null,
    ...(p.pagaEm ? { paymentDate: p.pagaEm } : {}),
  };
}

let sequencia = 0;
export const novoId = () => `evt_${++sequencia}`;

/** O aviso de uma cobrança. `id` é o do aviso; sem ele, cada chamada gera um novo. */
export const avisoDePagamento = (event: string, payment: ReturnType<typeof pagamento>, id = novoId()) => ({ id, event, dateCreated: "2026-11-02 09:00:00", account: { id: "conta-1", ownerId: null }, payment });

export const avisoDeAssinatura = (event: string, assinatura = "sub_1", id = novoId()) => ({
  id,
  event,
  dateCreated: "2026-11-02 09:00:00",
  account: { id: "conta-1", ownerId: null },
  subscription: { object: "subscription", id: assinatura, customer: "cus_1", paymentLink: "link_1", value: 99, cycle: "MONTHLY", status: "INACTIVE", deleted: true, externalReference: null },
});
