/**
 * A cobrança da assinatura, do lado do Decreta.
 *
 *   assinar ──► link de pagamento do Asaas ──► o escritório paga lá (Pix, boleto ou cartão)
 *   Asaas ──► webhook ──► `tratarAviso`: grava a fatura e atualiza a situação do escritório
 *
 * O aviso do Asaas chega com um token e pode chegar mais de uma vez: cada id de aviso é tratado
 * uma única vez (`eventos_de_cobranca`), na mesma transação que muda a fatura e a situação, então
 * um aviso que falha no meio não deixa nada pela metade e o Asaas tenta de novo.
 *
 * A situação do escritório acompanha as faturas: pagou, está ativo; a fatura venceu sem pagamento,
 * está inadimplente desde o vencimento (e a régua de 7 e 15 dias corre a partir daí, em
 * `estadoDaAssinatura`). Atraso só conta de quem já pagou ao menos uma vez: quem nunca pagou segue o fim do teste.
 * Cortesia, só leitura e bloqueio são decisões da equipe do Decreta: o pagamento não as desfaz.
 */
import { avisoDaAssinatura, fimDoPeriodoPago, formatarDia, hojeEm, janelaDoAvisoDoAtraso, janelaDoAvisoDoTeste, PLANO, ROTULO_DA_SITUACAO, somarDias, type AvisoDaAssinatura, type Dia, type EstadoDaAssinatura, type SituacaoDoEscritorio, type TipoDeAvisoDaAssinatura } from "@decreta/core";
import { avisosEnviados, eventosDeCobranca, faturas, member, organization, user, withTenant, type Database, type Tx } from "@decreta/db";
import { and, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import type { Mailer } from "../email.ts";
import { ErroDoAsaas, type ClienteAsaas, type ConfigDaNfse } from "./asaas.ts";
import { estadoDoEscritorio } from "./assinatura.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** O token do aviso confere com o configurado? Compara os hashes, em tempo constante. */
export function tokenConfere(recebido: string | undefined, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(recebido), h(esperado));
}

/* ---------------- O aviso do Asaas ---------------- */

const texto = z
  .union([z.string(), z.number()])
  .transform(String)
  .nullish();

const PAGAMENTO = z
  .object({
    id: z.string().min(1).max(100),
    customer: texto,
    subscription: texto,
    paymentLink: texto,
    status: z.string().nullish(),
    value: z.number().nullish(),
    dueDate: z.string().nullish(),
    paymentDate: z.string().nullish(),
    invoiceUrl: z.string().nullish(),
    billingType: z.string().nullish(),
    externalReference: texto,
  })
  .passthrough();

const ASSINATURA = z.object({ id: z.string().min(1).max(100), customer: texto, externalReference: texto }).passthrough();

const AVISO = z.object({ id: z.string().min(1).max(200), event: z.string().min(1).max(100), payment: PAGAMENTO.optional(), subscription: ASSINATURA.optional() }).passthrough();

export class AvisoInvalido extends Error {}

export type ResultadoDoAviso = "tratado" | "repetido" | "sem_escritorio";

const SITUACAO_POR_STATUS: Record<string, "pendente" | "paga" | "atrasada" | "estornada"> = {
  PENDING: "pendente",
  AWAITING_RISK_ANALYSIS: "pendente",
  OVERDUE: "atrasada",
  RECEIVED: "paga",
  CONFIRMED: "paga",
  RECEIVED_IN_CASH: "paga",
  DUNNING_RECEIVED: "paga",
  REFUNDED: "estornada",
  REFUND_REQUESTED: "estornada",
  REFUND_IN_PROGRESS: "estornada",
  CHARGEBACK_REQUESTED: "estornada",
  CHARGEBACK_DISPUTE: "estornada",
  AWAITING_CHARGEBACK_REVERSAL: "estornada",
};

type SituacaoDaFatura = "pendente" | "paga" | "atrasada" | "estornada" | "removida";

/** Avisos que mudam a fatura por si, mesmo contra o que ela já era. */
const MUDAM_O_RUMO = new Set(["PAYMENT_DELETED", "PAYMENT_REFUNDED", "PAYMENT_RESTORED", "PAYMENT_RECEIVED_IN_CASH_UNDONE", "PAYMENT_CHARGEBACK_REQUESTED"]);

function situacaoDaFatura(evento: string, status: string | null | undefined): SituacaoDaFatura | null {
  if (evento === "PAYMENT_DELETED") return "removida";
  if (evento === "PAYMENT_REFUNDED") return "estornada";
  return (status && SITUACAO_POR_STATUS[status]) || null;
}

/**
 * O Asaas pode entregar os avisos fora de ordem (um "venceu" depois do "pagou"). A fatura que já foi paga, estornada
 * ou removida não volta para pendente ou atrasada por um aviso atrasado; só os avisos que mudam o rumo fazem isso.
 */
function aceitar(atual: SituacaoDaFatura | undefined, nova: SituacaoDaFatura, evento: string): boolean {
  if (!atual || MUDAM_O_RUMO.has(evento)) return true;
  if (atual === "paga") return nova === "estornada";
  if (atual === "estornada" || atual === "removida") return false;
  return true;
}

const FORMA: Record<string, string> = { BOLETO: "boleto", PIX: "pix", CREDIT_CARD: "cartao", DEBIT_CARD: "cartao", UNDEFINED: "indefinida" };

type LinhaDoEscritorio = typeof organization.$inferSelect;

/** O escritório do aviso: pela assinatura, pelo link de pagamento, pela referência que mandamos (o id dele) e, por último, pelo cliente do Asaas. */
async function acharEscritorio(db: Database, ids: { assinatura?: string | null; link?: string | null; referencia?: string | null; cliente?: string | null }): Promise<LinhaDoEscritorio | null> {
  const tentativas = [
    ids.assinatura ? eq(organization.asaasAssinaturaId, ids.assinatura) : null,
    ids.link ? eq(organization.asaasLinkId, ids.link) : null,
    ids.referencia ? eq(organization.id, ids.referencia) : null,
    ids.cliente ? eq(organization.asaasClienteId, ids.cliente) : null,
  ];
  for (const filtro of tentativas) {
    if (!filtro) continue;
    const [o] = await db.select().from(organization).where(filtro).limit(1);
    if (o) return o;
  }
  return null;
}

export interface DepsDoAviso {
  db: Database;
  asaas: ClienteAsaas | null;
  nfse: ConfigDaNfse | null;
  log: Log;
  agora?: () => Date;
}

/** O que sobra para fazer depois que a transação acaba: chamadas de rede, que não ficam dentro dela. */
interface Depois {
  configurarNfse?: string;
  removerLink?: string;
}

/** O link da fatura só vale se for https e do Asaas: é o que vira `href` na tela de quem paga. */
export function linkDoAsaas(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "asaas.com" || u.hostname.endsWith(".asaas.com")) ? url : null;
  } catch {
    return null;
  }
}

/**
 * Trata um aviso do Asaas. Devolve `repetido` se o id já foi tratado (nada muda), `sem_escritorio` se
 * o aviso não é de nenhum escritório (um teste do painel do Asaas, por exemplo) e `tratado` quando mexeu.
 */
export async function tratarAviso(deps: DepsDoAviso, corpo: unknown): Promise<ResultadoDoAviso> {
  const r = AVISO.safeParse(corpo);
  if (!r.success) throw new AvisoInvalido(r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; "));
  const aviso = r.data;
  const p = aviso.payment;
  const s = aviso.subscription;
  const achado = await acharEscritorio(deps.db, {
    assinatura: p?.subscription ?? s?.id,
    link: p?.paymentLink,
    referencia: p?.externalReference ?? s?.externalReference,
    cliente: p?.customer ?? s?.customer,
  });
  if (!achado) {
    deps.log("aviso do Asaas de um escritório que não existe", { evento: aviso.event, id: aviso.id });
    return "sem_escritorio";
  }
  const agora = (deps.agora ?? (() => new Date()))();
  const depois = await withTenant(deps.db, achado.id, async (tx): Promise<Depois | "repetido"> => {
    // Um aviso de cada vez por escritório: a linha fica trancada até o fim da transação, e o aviso seguinte lê o que o anterior deixou.
    // A tranca vem ANTES de gravar o aviso: gravar já pega, pela chave estrangeira, uma tranca fraca na mesma linha, e dois avisos
    // com a tranca fraca na mão, esperando a forte um do outro, travariam os dois (deadlock).
    const [org] = await tx.select().from(organization).where(eq(organization.id, achado.id)).for("update");
    if (!org) return {};
    const [novo] = await tx.insert(eventosDeCobranca).values({ id: aviso.id, organizationId: achado.id, evento: aviso.event }).onConflictDoNothing().returning({ id: eventosDeCobranca.id });
    if (!novo) return "repetido";
    if (p && aviso.event.startsWith("PAYMENT_")) return aplicarFatura(tx, org, aviso.event, p, agora, deps.log);
    if (s && (aviso.event === "SUBSCRIPTION_DELETED" || aviso.event === "SUBSCRIPTION_INACTIVATED")) await aplicarAssinaturaEncerrada(tx, org, s.id, agora);
    return {};
  });
  if (depois === "repetido") return "repetido";
  // A nota fiscal sai da assinatura do Asaas, e o link de pagamento que já virou assinatura deixa de existir lá (outra pessoa não o preenche de novo).
  // Chamadas de rede, fora da transação: se falharem, o log diz e a nota é tentada no aviso seguinte.
  if (depois.configurarNfse && deps.asaas && deps.nfse) {
    try {
      await deps.asaas.configurarNotasFiscais(depois.configurarNfse, deps.nfse);
      await deps.db.update(organization).set({ nfseConfiguradaEm: agora }).where(eq(organization.id, achado.id));
    } catch (err) {
      deps.log("NFS-e não foi configurada na assinatura", { organizationId: achado.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (depois.removerLink && deps.asaas) {
    await deps.asaas.removerLink(depois.removerLink).catch((err: unknown) => deps.log("o link de pagamento não foi removido no Asaas", { organizationId: achado.id, error: err instanceof Error ? err.message : String(err) }));
  }
  return "tratado";
}

type CobrancaParaConta = { situacao: SituacaoDaFatura; vencimento: Dia; valorCentavos: number };

/**
 * A situação do escritório a partir das faturas da assinatura viva. Fatura em aberto que já passou do vencimento conta como
 * atrasada, mesmo que o aviso de atraso do Asaas ainda não tenha chegado (ou nunca chegue). Atraso só conta de quem já pagou
 * ao menos uma vez: quem nunca pagou segue o fim do teste. Cortesia, só leitura e bloqueio são decisões da equipe: o pagamento não as desfaz.
 */
export function mudancasPelasFaturas(o: { situacao: SituacaoDoEscritorio; assinouEm: Date | null }, lista: CobrancaParaConta[], hoje: Dia, agora: Date): Partial<typeof organization.$inferInsert> {
  const atrasadas = lista.filter((f) => f.situacao === "atrasada" || (f.situacao === "pendente" && f.vencimento < hoje));
  const pagas = lista.filter((f) => f.situacao === "paga").sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  const m: Partial<typeof organization.$inferInsert> = {};
  if (pagas[0]) m.valorMensalCentavos = pagas[0].valorCentavos;
  // A primeira mensalidade paga: o escritório está identificado e deixa de ser "em avaliação".
  const primeiraVez = pagas.length > 0 && !o.assinouEm;
  if (primeiraVez) {
    m.assinouEm = agora;
    m.emAvaliacao = false;
  }
  if (o.situacao === "cortesia" || o.situacao === "so_leitura" || o.situacao === "bloqueado") return m;
  if (atrasadas.length && (o.assinouEm || primeiraVez)) {
    m.situacao = "inadimplente";
    m.inadimplenteDesde = atrasadas.map((f) => f.vencimento).sort()[0]!;
  } else if (pagas.length) {
    m.situacao = "ativo";
    m.inadimplenteDesde = null;
  } else if (o.situacao === "inadimplente") {
    // Sem nada em atraso e sem nada pago (a cobrança foi apagada ou estornada): não há o que pagar, e o atraso deixa de correr.
    m.situacao = "ativo";
    m.inadimplenteDesde = null;
  }
  return m;
}

/** Grava a fatura do aviso e acerta a situação do escritório. `org` vem trancado, lido dentro da transação. */
async function aplicarFatura(tx: Tx, org: LinhaDoEscritorio, evento: string, p: z.infer<typeof PAGAMENTO>, agora: Date, log: Log): Promise<Depois> {
  const hoje = hojeEm(org.timezone, agora);
  const [atual] = await tx.select().from(faturas).where(and(eq(faturas.id, p.id), eq(faturas.organizationId, org.id)));
  const nova = situacaoDaFatura(evento, p.status);
  const situacao: SituacaoDaFatura = nova && aceitar(atual?.situacao, nova, evento) ? nova : (atual?.situacao ?? "pendente");
  const guardaPagamento = situacao === "paga" || situacao === "estornada";
  const valores = {
    assinaturaId: p.subscription ?? atual?.assinaturaId ?? null,
    vencimento: p.dueDate ?? atual?.vencimento ?? hoje,
    valorCentavos: p.value != null ? Math.round(p.value * 100) : (atual?.valorCentavos ?? 0),
    situacao,
    forma: (p.billingType && FORMA[p.billingType]) || atual?.forma || null,
    link: linkDoAsaas(p.invoiceUrl) ?? atual?.link ?? null,
    pagaEm: guardaPagamento ? (p.paymentDate ?? atual?.pagaEm ?? (situacao === "paga" ? hoje : null)) : null,
  };
  await tx.insert(faturas).values({ id: p.id, organizationId: org.id, ...valores }).onConflictDoUpdate({ target: faturas.id, set: valores });

  // De qual assinatura é a cobrança. A que já acabou (cancelada) fica no histórico e não mexe em mais nada: o aviso dela que chega
  // atrasado (o cartão avisa o recebimento 30 dias depois) não reabre o escritório nem desfaz o cancelamento.
  const encerrada = !!p.subscription && org.asaasAssinaturasEncerradas.includes(p.subscription);
  if (encerrada) return {};
  // Uma segunda assinatura viva (o link de pagamento foi preenchido duas vezes): fica registrada, não toma o lugar da primeira nem mexe na situação.
  if (p.subscription && org.asaasAssinaturaId && org.asaasAssinaturaId !== p.subscription) {
    log("assinatura duplicada no Asaas: o escritório já tem outra viva", { organizationId: org.id, viva: org.asaasAssinaturaId, nova: p.subscription });
    return {};
  }
  const adota = !!p.subscription && !org.asaasAssinaturaId && situacao !== "removida" && situacao !== "estornada";
  const assinaturaAtual = adota ? p.subscription! : org.asaasAssinaturaId;

  const mudancas: Partial<typeof organization.$inferInsert> = {};
  if (adota) {
    mudancas.asaasAssinaturaId = p.subscription;
    // O link já virou assinatura: o escritório assina de novo com um link novo.
    if (org.asaasLinkId) Object.assign(mudancas, { asaasLinkId: null, asaasLinkUrl: null, asaasLinkValorCentavos: null });
  }
  if (p.customer && p.customer !== org.asaasClienteId) mudancas.asaasClienteId = p.customer;

  const todas = await tx
    .select({ situacao: faturas.situacao, vencimento: faturas.vencimento, valorCentavos: faturas.valorCentavos, assinaturaId: faturas.assinaturaId })
    .from(faturas)
    .where(eq(faturas.organizationId, org.id));
  const dela = todas.filter((f) => !assinaturaAtual || f.assinaturaId === assinaturaAtual || f.assinaturaId === null);
  Object.assign(mudancas, mudancasPelasFaturas(org, dela, hoje, agora));
  // Pagou uma assinatura nova depois de cancelar: o cancelamento anterior deixa de valer.
  if (situacao === "paga" && org.cancelamentoPedidoEm && p.subscription && p.subscription === assinaturaAtual && mudancas.situacao === "ativo") {
    mudancas.cancelamentoPedidoEm = null;
    mudancas.acessoAte = null;
  }
  if (Object.keys(mudancas).length) await tx.update(organization).set(mudancas).where(eq(organization.id, org.id));
  return {
    // A nota é configurada na assinatura viva, e tentada de novo a cada aviso enquanto não der certo.
    configurarNfse: assinaturaAtual && !org.nfseConfiguradaEm ? assinaturaAtual : undefined,
    removerLink: adota && org.asaasLinkId ? org.asaasLinkId : undefined,
  };
}

/** A assinatura acabou no Asaas (cancelada lá, ou por nós): vale o que já foi pago, e mais nada é cobrado. */
async function aplicarAssinaturaEncerrada(tx: Tx, org: LinhaDoEscritorio, assinaturaId: string, agora: Date): Promise<void> {
  // Só a assinatura viva: o eco de uma antiga, já cancelada, não mexe em nada.
  if (assinaturaId !== org.asaasAssinaturaId) return;
  await registrarCancelamento(tx, org.id, agora);
}

/**
 * Cancelar vale até o fim do período já pago: o último vencimento pago mais um mês. As cobranças
 * ainda abertas somem (o Asaas também as apaga) e o atraso, se havia, deixa de correr. A assinatura
 * cancelada vai para a lista das encerradas: nenhum aviso dela, mesmo atrasado, volta a mexer no escritório.
 */
async function registrarCancelamento(tx: Tx, organizationId: string, agora: Date): Promise<Dia | null> {
  const [org] = await tx.select().from(organization).where(eq(organization.id, organizationId)).for("update");
  if (!org?.asaasAssinaturaId) return null;
  const hoje = hojeEm(org.timezone, agora);
  const encerradas = [...org.asaasAssinaturasEncerradas, org.asaasAssinaturaId];
  if (!org.assinouEm) {
    // Nunca pagou: não há período pago nem cancelamento, só uma assinatura que não foi para a frente.
    await tx.update(faturas).set({ situacao: "removida" }).where(and(eq(faturas.organizationId, org.id), inArray(faturas.situacao, ["pendente", "atrasada"])));
    await tx.update(organization).set({ asaasAssinaturaId: null, asaasAssinaturasEncerradas: encerradas, nfseConfiguradaEm: null }).where(eq(organization.id, org.id));
    return null;
  }
  const [ultima] = await tx.select({ vencimento: faturas.vencimento }).from(faturas).where(and(eq(faturas.organizationId, org.id), eq(faturas.situacao, "paga"))).orderBy(desc(faturas.vencimento)).limit(1);
  const acessoAte = ultima ? fimDoPeriodoPago(ultima.vencimento) : somarDias(hoje, -1);
  await tx.update(faturas).set({ situacao: "removida" }).where(and(eq(faturas.organizationId, org.id), inArray(faturas.situacao, ["pendente", "atrasada"])));
  await tx
    .update(organization)
    .set({
      cancelamentoPedidoEm: agora,
      acessoAte,
      inadimplenteDesde: null,
      // A assinatura cancelada não existe mais: qualquer assinatura que aparecer depois é nova.
      asaasAssinaturaId: null,
      asaasAssinaturasEncerradas: encerradas,
      nfseConfiguradaEm: null,
      ...(org.situacao === "inadimplente" ? { situacao: "ativo" as const } : {}),
    })
    .where(eq(organization.id, org.id));
  return acessoAte;
}

/**
 * Toda manhã, antes dos avisos: acerta a situação de quem assina pelas faturas e pela data. Sem isto, uma fatura vencida
 * cujo aviso de atraso não chegou deixaria o escritório com acesso total para sempre.
 */
export async function reconciliarAssinaturas(deps: { db: Database; log: Log }, agora = new Date()): Promise<{ acertados: number }> {
  const escritorios = await deps.db
    .select({ id: organization.id })
    .from(organization)
    .where(and(ne(organization.slug, SLUG_DA_DEMONSTRACAO), isNull(organization.encerradoEm), isNotNull(organization.assinouEm), isNotNull(organization.asaasAssinaturaId), inArray(organization.situacao, ["ativo", "inadimplente"])));
  let acertados = 0;
  for (const { id } of escritorios) {
    try {
      acertados += await withTenant(deps.db, id, async (tx) => {
        const [org] = await tx.select().from(organization).where(eq(organization.id, id)).for("update");
        if (!org?.asaasAssinaturaId) return 0;
        const todas = await tx
          .select({ situacao: faturas.situacao, vencimento: faturas.vencimento, valorCentavos: faturas.valorCentavos, assinaturaId: faturas.assinaturaId })
          .from(faturas)
          .where(eq(faturas.organizationId, id));
        const dela = todas.filter((f) => f.assinaturaId === org.asaasAssinaturaId || f.assinaturaId === null);
        const m = mudancasPelasFaturas(org, dela, hojeEm(org.timezone, agora), agora);
        const mudou = (m.situacao !== undefined && m.situacao !== org.situacao) || (m.inadimplenteDesde !== undefined && m.inadimplenteDesde !== org.inadimplenteDesde);
        if (!mudou) return 0;
        await tx.update(organization).set({ situacao: m.situacao, inadimplenteDesde: m.inadimplenteDesde }).where(eq(organization.id, id));
        deps.log("situação do escritório acertada pelas faturas", { organizationId: id, de: org.situacao, para: m.situacao, inadimplenteDesde: m.inadimplenteDesde ?? null });
        return 1;
      });
    } catch (err) {
      deps.log("não deu para acertar a situação do escritório", { organizationId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { acertados };
}

/* ---------------- Assinar e cancelar ---------------- */

/** Uma recusa com a frase que a tela mostra. */
export class RecusaDaCobranca extends Error {
  constructor(
    readonly status: 409 | 503,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export interface DepsDoPlano {
  db: Database;
  asaas: ClienteAsaas | null;
  cobrancaAtiva: boolean;
  telas: string;
  log: Log;
}

function motivoDeNaoPoderAssinar(deps: Pick<DepsDoPlano, "asaas" | "cobrancaAtiva">, o: LinhaDoEscritorio, e: EstadoDaAssinatura): { codigo: string; mensagem: string } | null {
  if (!deps.cobrancaAtiva) return { codigo: "cobranca_desligada", mensagem: "A cobrança ainda não foi aberta. Por enquanto nada é cobrado." };
  if (o.situacao === "cortesia") return { codigo: "cortesia", mensagem: "Este escritório tem acesso por cortesia, sem cobrança. Se quiser assinar, fale com a equipe do Decreta." };
  if (e.motivo === "manual") return { codigo: "restricao_da_equipe", mensagem: "O escritório está com uma restrição da equipe do Decreta. Fale com a equipe para resolver." };
  if (PLANO.valorMensalCentavos === null) return { codigo: "valor_nao_definido", mensagem: "O valor do plano ainda não foi definido. Fale com a equipe do Decreta para assinar." };
  if (!deps.asaas) return { codigo: "cobranca_nao_configurada", mensagem: "A cobrança ainda não está configurada neste servidor. Fale com a equipe do Decreta." };
  if (o.asaasAssinaturaId) return { codigo: "ja_assina", mensagem: "O escritório já tem uma assinatura em andamento. Para pagar, abra a fatura na lista de faturas; para começar de novo, cancele a assinatura." };
  return null;
}

/** O link do Asaas onde o escritório assina. Reaproveita o que já foi criado, se o valor é o mesmo. */
export async function iniciarAssinatura(deps: DepsDoPlano, organizationId: string, agora = new Date()): Promise<{ url: string }> {
  const [o] = await deps.db.select().from(organization).where(eq(organization.id, organizationId));
  if (!o) throw new RecusaDaCobranca(409, "nao_encontrado", "Escritório não encontrado.");
  const motivo = motivoDeNaoPoderAssinar(deps, o, estadoDoEscritorio(o, deps.cobrancaAtiva, agora));
  if (motivo) throw new RecusaDaCobranca(motivo.codigo === "cobranca_nao_configurada" ? 503 : 409, motivo.codigo, motivo.mensagem);
  const valor = PLANO.valorMensalCentavos!;
  if (o.asaasLinkId && o.asaasLinkUrl && o.asaasLinkValorCentavos === valor) return { url: o.asaasLinkUrl };
  try {
    const link = await deps.asaas!.criarLinkDeAssinatura({
      nome: `${PLANO.nome} · Decreta`,
      descricao: `Mensalidade do Decreta para ${o.name}. Cancele quando quiser, no próprio app.`,
      valorCentavos: valor,
      referencia: o.id,
      voltarPara: `${deps.telas}/configuracoes?aba=plano`,
    });
    await deps.db.update(organization).set({ asaasLinkId: link.id, asaasLinkUrl: link.url, asaasLinkValorCentavos: valor }).where(eq(organization.id, o.id));
    return { url: link.url };
  } catch (err) {
    deps.log("link de assinatura do Asaas falhou", { organizationId, error: err instanceof Error ? err.message : String(err) });
    throw new RecusaDaCobranca(503, "asaas_fora", err instanceof ErroDoAsaas && err.status < 500 ? "O Asaas recusou o pedido. Fale com a equipe do Decreta." : "Não deu para falar com o Asaas agora. Tente de novo em instantes.");
  }
}

/** Cancela a assinatura: vale até o fim do período pago. Devolve o último dia de acesso completo. */
export async function cancelarAssinatura(deps: DepsDoPlano, organizationId: string, agora = new Date()): Promise<{ acessoAte: Dia | null }> {
  const [o] = await deps.db.select().from(organization).where(eq(organization.id, organizationId));
  // Cancela a assinatura viva, tenha ela já cobrado ou não (quem abriu o link e desistiu cancela para recomeçar).
  if (!o?.asaasAssinaturaId || (o.situacao !== "teste" && o.situacao !== "ativo" && o.situacao !== "inadimplente")) throw new RecusaDaCobranca(409, "sem_assinatura", "O escritório não tem uma assinatura para cancelar.");
  if (o.cancelamentoPedidoEm && o.acessoAte) throw new RecusaDaCobranca(409, "ja_cancelada", "A assinatura já foi cancelada.");
  if (!deps.asaas) throw new RecusaDaCobranca(503, "cobranca_nao_configurada", "A cobrança ainda não está configurada neste servidor. Fale com a equipe do Decreta.");
  try {
    await deps.asaas.cancelarAssinatura(o.asaasAssinaturaId);
  } catch (err) {
    deps.log("cancelamento no Asaas falhou", { organizationId, error: err instanceof Error ? err.message : String(err) });
    throw new RecusaDaCobranca(503, "asaas_fora", "Não deu para cancelar no Asaas agora. Nada mudou: tente de novo em instantes.");
  }
  const acessoAte = await withTenant(deps.db, organizationId, (tx) => registrarCancelamento(tx, organizationId, agora));
  return { acessoAte };
}

/**
 * O escritório encerrou: a assinatura do Decreta e o link de pagamento saem do Asaas, seja qual for a situação dele, para ninguém
 * ser cobrado por um escritório fechado. Falhou: lança, e o id continua guardado para tentar de novo. Sem o Asaas neste servidor também lança,
 * porque apagar o escritório depois disso perderia o único jeito de achar a assinatura.
 */
export async function cancelarAssinaturaDoEncerrado(deps: { db: Database; asaas: ClienteAsaas | null }, organizationId: string, agora = new Date()): Promise<void> {
  const [o] = await deps.db.select({ assinatura: organization.asaasAssinaturaId, link: organization.asaasLinkId }).from(organization).where(eq(organization.id, organizationId));
  if (!o?.assinatura && !o?.link) return;
  if (!deps.asaas) throw new Error("o Asaas não está configurado neste servidor");
  if (o.assinatura) {
    await deps.asaas.cancelarAssinatura(o.assinatura);
    await withTenant(deps.db, organizationId, (tx) => registrarCancelamento(tx, organizationId, agora));
  }
  if (o.link) {
    await deps.asaas.removerLink(o.link);
    await deps.db.update(organization).set({ asaasLinkId: null, asaasLinkUrl: null, asaasLinkValorCentavos: null }).where(eq(organization.id, organizationId));
  }
}

/* ---------------- A tela do Plano ---------------- */

export interface FaturaDaTela {
  id: string;
  vencimento: Dia;
  valorCentavos: number;
  situacao: SituacaoDaFatura;
  forma: string | null;
  link: string | null;
  pagaEm: Dia | null;
}

export async function planoDoEscritorio(deps: Pick<DepsDoPlano, "db" | "asaas" | "cobrancaAtiva">, organizationId: string, agora = new Date()) {
  const [o] = await deps.db.select().from(organization).where(eq(organization.id, organizationId));
  if (!o) return null;
  const hoje = hojeEm(o.timezone, agora);
  const estado = estadoDoEscritorio(o, deps.cobrancaAtiva, agora);
  const lista = await withTenant(deps.db, organizationId, (tx) => tx.select().from(faturas).where(ne(faturas.situacao, "removida")).orderBy(desc(faturas.vencimento)).limit(24));
  const aberta = [...lista].filter((f) => f.situacao === "atrasada" || f.situacao === "pendente").sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0];
  const naoPodeAssinar = motivoDeNaoPoderAssinar(deps, o, estado);
  /** Tem uma assinatura viva no Asaas, tenha ela já cobrado ou não. */
  const assinante = !!o.asaasAssinaturaId;
  const aviso: AvisoDaAssinatura | null = deps.cobrancaAtiva ? avisoDaAssinatura(estado, hoje) : null;
  return {
    cobrancaAtiva: deps.cobrancaAtiva,
    plano: { nome: PLANO.nome, testeDias: PLANO.testeDias, valorMensalCentavos: PLANO.valorMensalCentavos },
    situacao: estado.situacao,
    rotulo: ROTULO_DA_SITUACAO[estado.situacao],
    situacaoGravada: o.situacao,
    acesso: estado.acesso,
    motivo: estado.motivo,
    testeAte: estado.testeAte,
    diasRestantesDoTeste: estado.diasRestantesDoTeste,
    diasDeAtraso: estado.diasDeAtraso,
    viraSoLeituraEm: estado.viraSoLeituraEm,
    bloqueiaEm: estado.bloqueiaEm,
    acessoAte: estado.acessoAte,
    cancelamentoAgendado: estado.cancelamentoAgendado,
    valorMensalCentavos: o.valorMensalCentavos,
    assinante,
    podeAssinar: !naoPodeAssinar,
    motivoSemAssinar: naoPodeAssinar?.mensagem ?? null,
    podeCancelar: deps.cobrancaAtiva && assinante && (o.situacao === "teste" || o.situacao === "ativo" || o.situacao === "inadimplente") && !estado.cancelamentoAgendado,
    faturas: lista.map((f): FaturaDaTela => ({ id: f.id, vencimento: f.vencimento, valorCentavos: f.valorCentavos, situacao: f.situacao, forma: f.forma, link: f.link, pagaEm: f.pagaEm })),
    /** A página da fatura aberta no Asaas: é onde se escolhe Pix, boleto ou cartão, sem passar dado nenhum pelo Decreta. */
    trocarFormaEm: aberta?.link ?? null,
    aviso,
  };
}

/* ---------------- Avisos por e-mail ---------------- */

const ASSUNTO: Record<TipoDeAvisoDaAssinatura, (escritorio: string, e: EstadoDaAssinatura) => string> = {
  teste_3: (o, e) => `${o}: o teste no Decreta termina em ${e.diasRestantesDoTeste} dias`,
  teste_1: (o, e) => `${o}: o teste no Decreta termina ${e.diasRestantesDoTeste === 0 ? "hoje" : "amanhã"}`,
  teste_acabou: (o) => `${o}: o teste acabou, e o escritório está só para leitura`,
  atraso_1: (o) => `Fatura em atraso no Decreta (${o})`,
  atraso_5: (o) => `${o}: o escritório fica só para leitura em 2 dias`,
  atraso_7: (o) => `${o}: o escritório está só para leitura por falta de pagamento`,
  atraso_13: (o) => `${o}: o acesso será bloqueado em 2 dias`,
  atraso_15: (o) => `${o}: o acesso foi bloqueado por falta de pagamento`,
};

/**
 * O aviso do dia por e-mail, para os sócios: o teste a 3 e a 1 dia do fim e ao acabar, e a fatura em atraso na régua
 * de 1, 5, 7, 13 e 15 dias. Cada aviso sai uma vez por sócio (a rotina pode rodar de novo): um e-mail que falhou
 * fica sem registro e sai na próxima rodada.
 */
export async function enviarAvisosDaAssinatura(deps: { db: Database; mailer: Mailer; telas: string; log: Log }, agora = new Date()): Promise<{ enviados: number }> {
  const escritorios = await deps.db
    .select()
    .from(organization)
    .where(and(ne(organization.slug, SLUG_DA_DEMONSTRACAO), isNull(organization.encerradoEm), or(eq(organization.situacao, "teste"), eq(organization.situacao, "inadimplente"))));
  let enviados = 0;
  for (const o of escritorios) {
    const hoje = hojeEm(o.timezone, agora);
    const estado = estadoDoEscritorio(o, true, agora);
    const tipo = janelaDoAvisoDoTeste(estado) ?? janelaDoAvisoDoAtraso(estado);
    const aviso = avisoDaAssinatura(estado, hoje);
    if (!tipo || !aviso) continue;
    // O aviso vale uma vez por teste ou por atraso: a data de referência o distingue do próximo.
    const chave = `assinatura:${tipo}:${tipo.startsWith("teste") ? o.testeAte : o.inadimplenteDesde}`;
    const socios = await deps.db
      .select({ id: user.id, nome: user.name, email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(and(eq(member.organizationId, o.id), inArray(member.role, ["owner", "admin"])));
    for (const s of socios) {
      const ja = await withTenant(deps.db, o.id, (tx) => tx.select({ id: avisosEnviados.id }).from(avisosEnviados).where(and(eq(avisosEnviados.userId, s.id), eq(avisosEnviados.tipo, chave))).limit(1));
      if (ja.length) continue;
      try {
        await deps.mailer.send({
          to: s.email,
          subject: ASSUNTO[tipo](o.name, estado),
          paragraphs: [`Olá, ${s.nome.split(" ")[0] || s.nome}.`, aviso.texto, ...(aviso.ate ? [`Data: ${formatarDia(aviso.ate)}.`] : [])],
          action: { label: "Ver o plano", url: `${deps.telas}/configuracoes?aba=plano` },
        });
      } catch (err) {
        deps.log("e-mail do plano não saiu", { organizationId: o.id, tipo, error: err instanceof Error ? err.message : String(err) });
        continue;
      }
      await withTenant(deps.db, o.id, (tx) => tx.insert(avisosEnviados).values({ organizationId: o.id, userId: s.id, tipo: chave, dia: hoje, ok: true }).onConflictDoNothing());
      enviados++;
    }
  }
  return { enviados };
}
