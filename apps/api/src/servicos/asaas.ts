/**
 * O cliente do Asaas, sempre com a conta do próprio escritório: a chave dele,
 * no ambiente que ele escolheu. Cobre só o que o Decreta usa: cliente, cobrança
 * (Pix, boleto e cartão pelo link do Asaas), o aviso (webhook) e a autorização do
 * Pix Automático. API v3: https://docs.asaas.com
 *
 * A chave só existe aqui dentro de `ContaAsaas`, em memória, na hora do pedido. Nenhuma
 * mensagem de erro, log ou resposta a leva.
 */
import { textoDoCentavo, type Dia } from "@decreta/core";

export interface ContaAsaas {
  chave: string;
  ambiente: "sandbox" | "producao";
  fetch?: typeof fetch;
}

const BASE = { sandbox: "https://api-sandbox.asaas.com/v3", producao: "https://api.asaas.com/v3" } as const;
const TEMPO_MAXIMO_MS = 20_000;
const USER_AGENT = "Decreta/1.0";
/** O Asaas aceita até 500 caracteres na descrição da cobrança. */
const DESCRICAO_MAXIMA = 500;

/** Os eventos que o Decreta assina no Asaas do escritório. */
export const EVENTOS_DO_WEBHOOK = {
  pagamentos: ["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED", "PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE", "PAYMENT_CHARGEBACK_REQUESTED"],
  pixAutomatico: [
    "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED",
    "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED",
    "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED",
    "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED",
  ],
} as const;

/** O Asaas recusou o pedido ou não respondeu. `message` é a frase do Asaas (ou nossa), já em português. */
export class AsaasErro extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codigos: string[] = [],
  ) {
    super(message);
    this.name = "AsaasErro";
  }
}

async function chamar<T>(conta: ContaAsaas, metodo: "GET" | "POST" | "DELETE", caminho: string, corpo?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await (conta.fetch ?? fetch)(`${BASE[conta.ambiente]}${caminho}`, {
      method: metodo,
      headers: { access_token: conta.chave, "User-Agent": USER_AGENT, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }) },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
    });
  } catch {
    throw new AsaasErro(0, "O Asaas não respondeu a tempo. Tente de novo em alguns minutos.");
  }
  const json = (await res.json().catch(() => null)) as { errors?: { code?: string; description?: string }[] } | null;
  if (res.ok) return (json ?? {}) as T;
  const erros = json?.errors ?? [];
  const codigos = erros.map((e) => e.code ?? "").filter(Boolean);
  if (res.status === 401) throw new AsaasErro(401, "O Asaas recusou a chave. Confira se ela é do ambiente escolhido (produção ou sandbox) e se ainda está valendo.", codigos);
  const frase = erros.map((e) => e.description).filter(Boolean).join(" ");
  throw new AsaasErro(res.status, frase || `O Asaas não aceitou o pedido (erro ${res.status}).`, codigos);
}

/** A chave presta e é do ambiente certo: o Asaas responde a uma consulta simples. */
export async function conferirChave(conta: ContaAsaas): Promise<void> {
  await chamar(conta, "GET", "/customers?limit=1");
}

export interface ClienteParaOAsaas {
  /** O id do cliente no Decreta: a referência para achá-lo de novo. */
  id: string;
  nome: string;
  cpfCnpj: string;
  email?: string | null;
  telefone?: string | null;
}

/** O cliente do Decreta no Asaas: reaproveita o que já foi criado (pela referência) ou cria. */
export async function buscarOuCriarCliente(conta: ContaAsaas, c: ClienteParaOAsaas): Promise<string> {
  const achados = await chamar<{ data?: { id: string }[] }>(conta, "GET", `/customers?externalReference=${encodeURIComponent(c.id)}&limit=1`);
  if (achados.data?.[0]?.id) return achados.data[0].id;
  const criado = await chamar<{ id: string }>(conta, "POST", "/customers", {
    name: c.nome,
    cpfCnpj: c.cpfCnpj,
    ...(c.email ? { email: c.email } : {}),
    ...(c.telefone ? { mobilePhone: c.telefone } : {}),
    externalReference: c.id,
  });
  return criado.id;
}

export interface PedidoDeCobranca {
  clienteAsaas: string;
  valorCentavos: number;
  vencimento: Dia;
  descricao: string;
  /** O id da parcela no Decreta. */
  referencia: string;
  /** Mensalidade com Pix Automático ativo: a cobrança vai por Pix, ligada à autorização. */
  pixAutomaticoId?: string;
}

export interface CobrancaEmitida {
  id: string;
  link: string;
  vencimento: Dia;
}

/** Cobrança com o vencimento pedido. Sem Pix Automático, o cliente escolhe Pix, boleto ou cartão no link do Asaas. */
export async function criarCobranca(conta: ContaAsaas, p: PedidoDeCobranca): Promise<CobrancaEmitida> {
  const r = await chamar<{ id: string; invoiceUrl?: string; dueDate?: string }>(conta, "POST", "/payments", {
    customer: p.clienteAsaas,
    billingType: p.pixAutomaticoId ? "PIX" : "UNDEFINED",
    // Os centavos viram reais pelo texto, sem conta de ponto flutuante: 1999 → "19.99" → 19.99.
    value: Number(textoDoCentavo(p.valorCentavos)),
    dueDate: p.vencimento,
    description: p.descricao.slice(0, DESCRICAO_MAXIMA),
    externalReference: p.referencia,
    ...(p.pixAutomaticoId ? { pixAutomaticAuthorizationId: p.pixAutomaticoId } : {}),
  });
  return { id: r.id, link: r.invoiceUrl ?? "", vencimento: r.dueDate ?? p.vencimento };
}

export async function removerCobranca(conta: ContaAsaas, id: string): Promise<void> {
  await chamar(conta, "DELETE", `/payments/${encodeURIComponent(id)}`);
}

export interface PedidoDeWebhook {
  url: string;
  email: string;
  /** O segredo que o Asaas devolve no cabeçalho `asaas-access-token` de cada aviso (32 a 255 caracteres). */
  token: string;
  pixAutomatico: boolean;
}

/** O aviso: cada pagamento do escritório volta para o Decreta, que dá a baixa sozinho. Os avisos chegam em ordem. */
export async function criarWebhook(conta: ContaAsaas, p: PedidoDeWebhook): Promise<string> {
  const r = await chamar<{ id: string }>(conta, "POST", "/webhooks", {
    name: "Decreta",
    url: p.url,
    email: p.email,
    enabled: true,
    interrupted: false,
    apiVersion: 3,
    authToken: p.token,
    sendType: "SEQUENTIALLY",
    events: [...EVENTOS_DO_WEBHOOK.pagamentos, ...(p.pixAutomatico ? EVENTOS_DO_WEBHOOK.pixAutomatico : [])],
  });
  return r.id;
}

export async function removerWebhook(conta: ContaAsaas, id: string): Promise<void> {
  await chamar(conta, "DELETE", `/webhooks/${encodeURIComponent(id)}`);
}

export interface PedidoDeAutorizacaoPix {
  clienteAsaas: string;
  /** Até 35 caracteres: o id do contrato sem os traços. */
  contrato: string;
  inicio: Dia;
  valorCentavos: number;
  descricao: string;
  /** A primeira cobrança, paga pelo QR Code que o cliente usa para autorizar. */
  primeiraCobrancaCentavos: number;
}

/** A primeira cobrança do QR Code vale por 3 dias. */
const QR_VALE_SEGUNDOS = 3 * 24 * 60 * 60;

export interface AutorizacaoPix {
  id: string;
  situacao: string;
  payload: string;
  imagem: string | null;
}

/**
 * Autorização do Pix Automático para a mensalidade: o cliente autoriza uma vez, pelo
 * QR Code, e o Decreta cria a cobrança de cada mês ligada a ela. Só fica ativa depois que o
 * cliente paga a primeira cobrança e o banco dele confirma.
 */
export async function criarAutorizacaoPix(conta: ContaAsaas, p: PedidoDeAutorizacaoPix): Promise<AutorizacaoPix> {
  const r = await chamar<{ id: string; status: string; payload?: string; encodedImage?: string }>(conta, "POST", "/pix/automatic/authorizations", {
    customerId: p.clienteAsaas,
    frequency: "MONTHLY",
    contractId: p.contrato,
    startDate: p.inicio,
    value: Number(textoDoCentavo(p.valorCentavos)),
    description: p.descricao.slice(0, 35),
    paymentCreationMode: "MANUAL",
    immediateQrCode: { expirationSeconds: QR_VALE_SEGUNDOS, originalValue: Number(textoDoCentavo(p.primeiraCobrancaCentavos)) },
  });
  return { id: r.id, situacao: r.status, payload: r.payload ?? "", imagem: r.encodedImage ?? null };
}
