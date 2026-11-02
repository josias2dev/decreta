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
import { avisoDaAssinatura, fimDoPeriodoPago, formatarDia, hojeEm, janelaDoAvisoDoAtraso, janelaDoAvisoDoTeste, PLANO, ROTULO_DA_SITUACAO, somarDias, type AvisoDaAssinatura, type Dia, type EstadoDaAssinatura, type TipoDeAvisoDaAssinatura } from "@decreta/core";
import { avisosEnviados, eventosDeCobranca, faturas, member, organization, user, withTenant, type Database, type Tx } from "@decreta/db";
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
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
  const org = await acharEscritorio(deps.db, {
    assinatura: p?.subscription ?? s?.id,
    link: p?.paymentLink,
    referencia: p?.externalReference ?? s?.externalReference,
    cliente: p?.customer ?? s?.customer,
  });
  if (!org) {
    deps.log("aviso do Asaas de um escritório que não existe", { evento: aviso.event, id: aviso.id });
    return "sem_escritorio";
  }
  const agora = (deps.agora ?? (() => new Date()))();
  const configurarNfse = await withTenant(deps.db, org.id, async (tx) => {
    const [novo] = await tx.insert(eventosDeCobranca).values({ id: aviso.id, organizationId: org.id, evento: aviso.event }).onConflictDoNothing().returning({ id: eventosDeCobranca.id });
    if (!novo) return "repetido" as const;
    if (p && aviso.event.startsWith("PAYMENT_")) return aplicarFatura(tx, org, aviso.event, p, agora);
    if (s && (aviso.event === "SUBSCRIPTION_DELETED" || aviso.event === "SUBSCRIPTION_INACTIVATED")) await aplicarAssinaturaEncerrada(tx, org, s.id, agora);
    return null;
  });
  if (configurarNfse === "repetido") return "repetido";
  // A nota fiscal sai da assinatura do Asaas: configurada uma vez, fora da transação (é uma chamada de rede).
  if (configurarNfse && deps.asaas && deps.nfse) {
    try {
      await deps.asaas.configurarNotasFiscais(configurarNfse, deps.nfse);
      await deps.db.update(organization).set({ nfseConfiguradaEm: agora }).where(eq(organization.id, org.id));
    } catch (err) {
      deps.log("NFS-e não foi configurada na assinatura", { organizationId: org.id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return "tratado";
}

/** Grava a fatura do aviso e acerta a situação do escritório. Devolve a assinatura nova, se a NFS-e precisa ser configurada nela. */
async function aplicarFatura(tx: Tx, org: LinhaDoEscritorio, evento: string, p: z.infer<typeof PAGAMENTO>, agora: Date): Promise<string | null> {
  const hoje = hojeEm(org.timezone, agora);
  const [atual] = await tx.select().from(faturas).where(eq(faturas.id, p.id));
  const nova = situacaoDaFatura(evento, p.status);
  const situacao: SituacaoDaFatura = nova && aceitar(atual?.situacao, nova, evento) ? nova : (atual?.situacao ?? "pendente");
  const guardaPagamento = situacao === "paga" || situacao === "estornada";
  const valores = {
    vencimento: p.dueDate ?? atual?.vencimento ?? hoje,
    valorCentavos: p.value != null ? Math.round(p.value * 100) : (atual?.valorCentavos ?? 0),
    situacao,
    forma: (p.billingType && FORMA[p.billingType]) || atual?.forma || null,
    link: p.invoiceUrl ?? atual?.link ?? null,
    pagaEm: guardaPagamento ? (p.paymentDate ?? atual?.pagaEm ?? (situacao === "paga" ? hoje : null)) : null,
  };
  await tx.insert(faturas).values({ id: p.id, organizationId: org.id, ...valores }).onConflictDoUpdate({ target: faturas.id, set: valores });

  // A assinatura viva do escritório. Cobrança apagada ou estornada não a revive.
  const mudancas: Partial<typeof organization.$inferInsert> = {};
  let assinaturaNova: string | null = null;
  if (p.subscription && p.subscription !== org.asaasAssinaturaId && situacao !== "removida" && situacao !== "estornada") {
    mudancas.asaasAssinaturaId = p.subscription;
    assinaturaNova = p.subscription;
  }
  if (p.customer && p.customer !== org.asaasClienteId) mudancas.asaasClienteId = p.customer;
  const assinaturaAtual = mudancas.asaasAssinaturaId ?? org.asaasAssinaturaId;

  const todas = await tx.select({ id: faturas.id, situacao: faturas.situacao, vencimento: faturas.vencimento, valorCentavos: faturas.valorCentavos }).from(faturas);
  const atrasadas = todas.filter((f) => f.situacao === "atrasada");
  const pagas = todas.filter((f) => f.situacao === "paga").sort((a, b) => b.vencimento.localeCompare(a.vencimento));
  if (pagas[0]) mudancas.valorMensalCentavos = pagas[0].valorCentavos;
  // A primeira mensalidade paga: o escritório está identificado e deixa de ser "em avaliação".
  const primeiraVez = pagas.length > 0 && !org.assinouEm;
  if (primeiraVez) {
    mudancas.assinouEm = agora;
    mudancas.emAvaliacao = false;
  }
  const manual = org.situacao === "cortesia" || org.situacao === "so_leitura" || org.situacao === "bloqueado";
  if (!manual) {
    if (atrasadas.length && (org.assinouEm || primeiraVez)) {
      mudancas.situacao = "inadimplente";
      mudancas.inadimplenteDesde = atrasadas.map((f) => f.vencimento).sort()[0]!;
    } else if (pagas.length) {
      mudancas.situacao = "ativo";
      mudancas.inadimplenteDesde = null;
      // Pagou uma assinatura nova depois de cancelar: o cancelamento anterior deixa de valer.
      if (situacao === "paga" && org.cancelamentoPedidoEm && p.subscription && p.subscription === assinaturaAtual) {
        mudancas.cancelamentoPedidoEm = null;
        mudancas.acessoAte = null;
      }
    }
  }
  if (Object.keys(mudancas).length) await tx.update(organization).set(mudancas).where(eq(organization.id, org.id));
  return assinaturaNova && !org.nfseConfiguradaEm ? assinaturaNova : null;
}

/** A assinatura acabou no Asaas (cancelada lá, ou por nós): vale o que já foi pago, e mais nada é cobrado. */
async function aplicarAssinaturaEncerrada(tx: Tx, org: LinhaDoEscritorio, assinaturaId: string, agora: Date): Promise<void> {
  // Só a assinatura de hoje: o eco de uma antiga, já cancelada, não mexe em nada.
  if (assinaturaId !== org.asaasAssinaturaId) return;
  await registrarCancelamento(tx, org, agora);
}

/**
 * Cancelar vale até o fim do período já pago: o último vencimento pago mais um mês. As cobranças
 * ainda abertas somem (o Asaas também as apaga) e o atraso, se havia, deixa de correr.
 */
async function registrarCancelamento(tx: Tx, org: LinhaDoEscritorio, agora: Date): Promise<Dia | null> {
  const hoje = hojeEm(org.timezone, agora);
  if (!org.assinouEm) {
    // Nunca pagou: não há período pago nem cancelamento, só uma assinatura que não foi para a frente.
    await tx.update(organization).set({ asaasAssinaturaId: null }).where(eq(organization.id, org.id));
    return null;
  }
  const [ultima] = await tx.select({ vencimento: faturas.vencimento }).from(faturas).where(eq(faturas.situacao, "paga")).orderBy(desc(faturas.vencimento)).limit(1);
  const acessoAte = ultima ? fimDoPeriodoPago(ultima.vencimento) : somarDias(hoje, -1);
  await tx.update(faturas).set({ situacao: "removida" }).where(inArray(faturas.situacao, ["pendente", "atrasada"]));
  await tx
    .update(organization)
    .set({
      cancelamentoPedidoEm: agora,
      acessoAte,
      inadimplenteDesde: null,
      // A assinatura cancelada não existe mais: qualquer assinatura que aparecer depois é nova.
      asaasAssinaturaId: null,
      nfseConfiguradaEm: null,
      ...(org.situacao === "inadimplente" ? { situacao: "ativo" as const } : {}),
    })
    .where(eq(organization.id, org.id));
  return acessoAte;
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
  if (o.asaasAssinaturaId && o.assinouEm) return { codigo: "ja_assina", mensagem: "O escritório já tem uma assinatura. Para pagar uma fatura, use o link dela na lista de faturas." };
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
  if (!o?.asaasAssinaturaId || !o.assinouEm || (o.situacao !== "ativo" && o.situacao !== "inadimplente")) throw new RecusaDaCobranca(409, "sem_assinatura", "O escritório não tem uma assinatura para cancelar.");
  if (o.cancelamentoPedidoEm && o.acessoAte) throw new RecusaDaCobranca(409, "ja_cancelada", "A assinatura já foi cancelada.");
  if (!deps.asaas) throw new RecusaDaCobranca(503, "cobranca_nao_configurada", "A cobrança ainda não está configurada neste servidor. Fale com a equipe do Decreta.");
  try {
    await deps.asaas.cancelarAssinatura(o.asaasAssinaturaId);
  } catch (err) {
    deps.log("cancelamento no Asaas falhou", { organizationId, error: err instanceof Error ? err.message : String(err) });
    throw new RecusaDaCobranca(503, "asaas_fora", "Não deu para cancelar no Asaas agora. Nada mudou: tente de novo em instantes.");
  }
  const acessoAte = await withTenant(deps.db, organizationId, (tx) => registrarCancelamento(tx, o, agora));
  return { acessoAte };
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
  const assinante = !!o.asaasAssinaturaId && !!o.assinouEm;
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
    podeCancelar: deps.cobrancaAtiva && assinante && (o.situacao === "ativo" || o.situacao === "inadimplente") && !estado.cancelamentoAgendado,
    faturas: lista.map((f): FaturaDaTela => ({ id: f.id, vencimento: f.vencimento, valorCentavos: f.valorCentavos, situacao: f.situacao, forma: f.forma, link: f.link, pagaEm: f.pagaEm })),
    /** A página da fatura aberta no Asaas: é onde se escolhe Pix, boleto ou cartão, sem passar dado nenhum pelo Decreta. */
    trocarFormaEm: aberta?.link ?? null,
    aviso,
  };
}

/* ---------------- Avisos por e-mail ---------------- */

const ASSUNTO: Record<TipoDeAvisoDaAssinatura, (escritorio: string, e: EstadoDaAssinatura) => string> = {
  teste_3: (o, e) => `O teste do ${o} no Decreta termina em ${e.diasRestantesDoTeste} dias`,
  teste_1: (o, e) => `O teste do ${o} no Decreta termina ${e.diasRestantesDoTeste === 0 ? "hoje" : "amanhã"}`,
  teste_acabou: (o) => `O teste do ${o} acabou: o escritório está só para leitura`,
  atraso_1: (o) => `Fatura em atraso no Decreta (${o})`,
  atraso_5: (o) => `O ${o} fica só para leitura em 2 dias`,
  atraso_7: (o) => `O ${o} está só para leitura por falta de pagamento`,
  atraso_13: (o) => `O acesso do ${o} será bloqueado em 2 dias`,
  atraso_15: (o) => `O acesso do ${o} foi bloqueado por falta de pagamento`,
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
