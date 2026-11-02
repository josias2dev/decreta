/**
 * Cobrança pelo Asaas do próprio escritório: a chave dele (cifrada no cofre), o aviso de pagamento
 * (webhook) que dá a baixa sozinha, a cobrança de cada parcela e o Pix Automático da mensalidade.
 * Sem chave, o Financeiro funciona só com a baixa manual.
 *
 * Os pedidos ao Asaas ficam fora da transação do banco (levam segundos e podem falhar): lê, fala
 * com o Asaas e grava, conferindo de novo na gravação.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { vencimentoDaCobranca, type Dia } from "@decreta/core";
import { clientes, cobrancaConfig, contratosHonorarios, eventosCobranca, pagamentosHonorarios, parcelasHonorarios, withTenant, type AmbienteDoProvedor, type Database, type ReguaDeLembretes } from "@decreta/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Cofre } from "../cofre.ts";
import { falha } from "../rotas/base.ts";
import { AsaasErro, buscarOuCriarCliente, conferirChave, criarAutorizacaoPix, criarCobranca, criarWebhook, removerCobranca, removerWebhook, type ContaAsaas } from "./asaas.ts";
import { estornarPagamento, parcelasNaTela, registrarPagamento } from "./honorarios.ts";

export type ConfigDeCobranca = typeof cobrancaConfig.$inferSelect;
type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDaCobranca {
  db: Database;
  cofre?: Cofre;
  fetch?: typeof fetch;
  log: Log;
  /** O endereço público da API, de onde o Asaas manda os avisos. */
  enderecoDaApi?: string;
}

export const hashDoSegredo = (segredo: string) => createHash("sha256").update(segredo).digest("hex");

/** Compara o segredo do aviso com o hash guardado, em tempo constante. */
export function segredoConfere(recebido: string | undefined | null, hashGuardado: string | null | undefined): boolean {
  if (!recebido || !hashGuardado) return false;
  const a = Buffer.from(hashDoSegredo(recebido), "hex");
  const b = Buffer.from(hashGuardado, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function configDoEscritorio(db: Database, organizationId: string): Promise<ConfigDeCobranca | null> {
  const [c] = await withTenant(db, organizationId, (tx) => tx.select().from(cobrancaConfig).where(eq(cobrancaConfig.organizationId, organizationId)));
  return c ?? null;
}

function exigirCofre(deps: DepsDaCobranca): Cofre {
  return deps.cofre ?? falha(503, "cofre_desligado", "O cofre das chaves não está ligado neste servidor. Fale com o suporte do Decreta.");
}

/** A conta do Asaas do escritório, com a chave aberta só aqui, em memória. `null`: sem chave guardada. */
export function contaAsaas(deps: DepsDaCobranca, organizationId: string, cfg: ConfigDeCobranca | null): ContaAsaas | null {
  if (!cfg?.asaasChave) return null;
  try {
    return { chave: exigirCofre(deps).decifrar(cfg.asaasChave, organizationId), ambiente: cfg.asaasAmbiente, fetch: deps.fetch };
  } catch {
    // A chave guardada não abre (o segredo do servidor mudou): o escritório informa a chave de novo.
    return falha(409, "chave_ilegivel", "A chave do Asaas guardada não abre mais. Informe a chave de novo nas Configurações.");
  }
}

const PREFIXO_DA_CHAVE = { producao: "$aact_prod_", sandbox: "$aact_hmlg_" } as const;

export interface EstadoDaCobranca {
  asaas: { configurado: boolean; ambiente: AmbienteDoProvedor | null; avisoLigado: boolean; conferidaEm: string | null; urlDoAviso: string | null };
  pixAutomatico: boolean;
  regua: ReguaDeLembretes;
  zapsign: { configurado: boolean; ligada: boolean; ambiente: AmbienteDoProvedor | null };
  /** A NFS-e pelo Asaas depende dos dados fiscais do escritório e ainda não é emitida pelo Decreta. */
  nfse: { disponivel: false };
}

export function estadoDaCobranca(cfg: ConfigDeCobranca | null, organizationId: string, enderecoDaApi?: string): EstadoDaCobranca {
  return {
    asaas: {
      configurado: !!cfg?.asaasChave,
      ambiente: cfg?.asaasChave ? cfg.asaasAmbiente : null,
      avisoLigado: !!cfg?.asaasWebhookId,
      conferidaEm: cfg?.asaasConferidaEm?.toISOString() ?? null,
      urlDoAviso: enderecoDaApi ? `${enderecoDaApi.replace(/\/$/, "")}/api/cobranca/asaas/${organizationId}` : null,
    },
    pixAutomatico: cfg?.pixAutomatico ?? false,
    regua: cfg?.regua ?? { ligada: false, passos: [] },
    zapsign: { configurado: !!cfg?.zapsignChave, ligada: !!cfg?.zapsignChave && !!cfg.zapsignLigada, ambiente: cfg?.zapsignChave ? cfg.zapsignAmbiente : null },
    nfse: { disponivel: false },
  };
}

async function guardar(db: Database, organizationId: string, valores: Partial<typeof cobrancaConfig.$inferInsert>) {
  await withTenant(db, organizationId, (tx) => tx.insert(cobrancaConfig).values({ organizationId, ...valores }).onConflictDoUpdate({ target: cobrancaConfig.organizationId, set: valores }));
}

/**
 * Guarda a chave do Asaas do escritório (cifrada), confere que ela presta e cria, na conta dele, o
 * aviso de pagamento que dá a baixa sozinha. Se o aviso não nascer, a chave fica guardada e o escritório
 * tenta de novo: sem o aviso, a cobrança sai, mas a baixa é manual.
 */
export async function salvarChaveDoAsaas(deps: DepsDaCobranca, organizationId: string, quem: { email: string }, p: { chave: string; ambiente: AmbienteDoProvedor }): Promise<{ avisoLigado: boolean; erroDoAviso: string | null }> {
  const cofre = exigirCofre(deps);
  const chave = p.chave.trim();
  if (!chave.startsWith("$aact_")) falha(422, "chave_invalida", "Isto não parece uma chave do Asaas: ela começa com $aact_.");
  if (!chave.startsWith(PREFIXO_DA_CHAVE[p.ambiente])) falha(422, "ambiente_errado", p.ambiente === "producao" ? "Esta é uma chave de sandbox (testes). Escolha o ambiente sandbox ou informe a chave de produção." : "Esta é uma chave de produção. Escolha o ambiente de produção ou informe a chave de sandbox.");
  const conta: ContaAsaas = { chave, ambiente: p.ambiente, fetch: deps.fetch };
  try {
    await conferirChave(conta);
  } catch (err) {
    if (err instanceof AsaasErro) falha(422, "asaas_recusou", err.message);
    throw err;
  }
  // O aviso da chave anterior sai da conta de quem a tinha, para não ficar mandando para o Decreta à toa.
  const antes = await configDoEscritorio(deps.db, organizationId);
  const antiga = contaAsaas({ ...deps, cofre }, organizationId, antes);
  if (antiga && antes?.asaasWebhookId) await removerWebhook(antiga, antes.asaasWebhookId).catch(() => {});

  const base = { asaasChave: cofre.cifrar(chave, organizationId), asaasAmbiente: p.ambiente, asaasConferidaEm: new Date(), asaasWebhookId: null, asaasWebhookTokenHash: null };
  await guardar(deps.db, organizationId, base);
  return ligarOAviso(deps, organizationId, quem, conta, antes?.pixAutomatico ?? false);
}

/** Cria o aviso de pagamento na conta do Asaas do escritório, com um segredo novo. */
export async function ligarOAviso(deps: DepsDaCobranca, organizationId: string, quem: { email: string }, conta: ContaAsaas, pixAutomatico: boolean): Promise<{ avisoLigado: boolean; erroDoAviso: string | null }> {
  if (!deps.enderecoDaApi) return { avisoLigado: false, erroDoAviso: "O endereço público da API não está configurado neste servidor." };
  const segredo = randomBytes(32).toString("base64url");
  const url = `${deps.enderecoDaApi.replace(/\/$/, "")}/api/cobranca/asaas/${organizationId}`;
  try {
    const id = await criarWebhook(conta, { url, email: quem.email, token: segredo, pixAutomatico });
    await guardar(deps.db, organizationId, { asaasWebhookId: id, asaasWebhookTokenHash: hashDoSegredo(segredo) });
    return { avisoLigado: true, erroDoAviso: null };
  } catch (err) {
    const erro = err instanceof AsaasErro ? err.message : "Não deu para criar o aviso de pagamento no Asaas.";
    deps.log("aviso de pagamento do Asaas não nasceu", { organizationId, status: err instanceof AsaasErro ? err.status : null });
    return { avisoLigado: false, erroDoAviso: erro };
  }
}

/** Tira a chave do Decreta e o aviso da conta do Asaas. As cobranças já emitidas seguem valendo no Asaas, sem baixa automática. */
export async function removerChaveDoAsaas(deps: DepsDaCobranca, organizationId: string): Promise<void> {
  const cfg = await configDoEscritorio(deps.db, organizationId);
  if (!cfg?.asaasChave) return;
  const conta = deps.cofre ? contaAsaasSemErro(deps, organizationId, cfg) : null;
  if (conta && cfg.asaasWebhookId) await removerWebhook(conta, cfg.asaasWebhookId).catch(() => {});
  await guardar(deps.db, organizationId, { asaasChave: null, asaasWebhookId: null, asaasWebhookTokenHash: null, asaasConferidaEm: null, pixAutomatico: false });
}

function contaAsaasSemErro(deps: DepsDaCobranca, organizationId: string, cfg: ConfigDeCobranca): ContaAsaas | null {
  try {
    return contaAsaas(deps, organizationId, cfg);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Emitir e cancelar a cobrança de uma parcela                          */
/* ------------------------------------------------------------------ */

export interface CobrancaDaParcela {
  link: string;
  vencimento: Dia;
  id: string;
}

/**
 * A cobrança da parcela no Asaas do escritório, pelo link de pagamento (Pix, boleto e cartão). O vencimento sugerido é o
 * da parcela, nunca o dia de hoje; parcela que já venceu pede uma data nova, que a pessoa escolhe.
 */
export async function emitirCobranca(deps: DepsDaCobranca, organizationId: string, userId: string, parcelaId: string, hoje: Dia, vencimentoPedido?: Dia | null): Promise<CobrancaDaParcela> {
  const dados = await withTenant(deps.db, organizationId, async (tx) => {
    const [l] = await tx
      .select({ p: parcelasHonorarios, c: contratosHonorarios, cliente: clientes })
      .from(parcelasHonorarios)
      .innerJoin(contratosHonorarios, eq(contratosHonorarios.id, parcelasHonorarios.contratoId))
      .leftJoin(clientes, eq(clientes.id, contratosHonorarios.clienteId))
      .where(eq(parcelasHonorarios.id, parcelaId));
    if (!l) falha(404, "nao_encontrado");
    const [parcela] = await parcelasNaTela(tx, hoje, { contratoId: l.c.id, comCanceladas: true }).then((ps) => ps.filter((x) => x.id === parcelaId));
    return { ...l, falta: parcela?.falta ?? null, situacao: parcela?.situacao };
  });
  const { p, c, cliente } = dados;
  if (p.canceladaEm) falha(409, "parcela_cancelada", "Esta parcela foi cancelada.");
  if (p.valor === null) falha(422, "sem_valor", "Esta parcela ainda não tem valor: informe o valor antes de cobrar.");
  if (!dados.falta) falha(409, "ja_paga", "Esta parcela já está paga.");
  if (p.cobrancaId) falha(409, "ja_cobrada", "Esta parcela já tem uma cobrança emitida. Cancele a cobrança antes de emitir outra.");
  if (!cliente) falha(422, "sem_cliente", "O contrato não tem cliente: a cobrança precisa de um cliente com CPF ou CNPJ.");
  if (!cliente.documento) falha(422, "cliente_sem_documento", "O cliente não tem CPF ou CNPJ cadastrado: o Asaas exige o documento de quem paga.");

  let vencimento: Dia;
  if (vencimentoPedido) {
    if (vencimentoPedido < hoje) falha(422, "vencimento_no_passado", "A cobrança precisa de uma data de hoje em diante.");
    vencimento = vencimentoPedido;
  } else {
    const v = vencimentoDaCobranca(p.vencimento, hoje);
    if (v.precisaEscolher) falha(422, "escolher_vencimento", v.motivo ?? "Escolha a data da cobrança.");
    vencimento = v.sugerido!;
  }

  const cfg = await configDoEscritorio(deps.db, organizationId);
  const conta = contaAsaas(deps, organizationId, cfg);
  if (!conta) falha(409, "sem_asaas", "O escritório ainda não ligou o Asaas. Informe a chave nas Configurações, ou dê a baixa à mão.");
  const comPixAutomatico = p.tipo === "mensal" && c.pixAutomaticoSituacao === "ACTIVE" && !!c.pixAutomaticoId;

  let emitida;
  try {
    const clienteAsaas = await buscarOuCriarCliente(conta, { id: cliente.id, nome: cliente.nome, cpfCnpj: cliente.documento, email: cliente.email, telefone: cliente.telefone });
    emitida = await criarCobranca(conta, { clienteAsaas, valorCentavos: dados.falta, vencimento, descricao: p.descricao, referencia: p.id, pixAutomaticoId: comPixAutomatico ? c.pixAutomaticoId! : undefined });
  } catch (err) {
    if (err instanceof AsaasErro) falha(err.status === 0 ? 504 : 422, "asaas_recusou", err.message);
    throw err;
  }

  const gravou = await withTenant(deps.db, organizationId, (tx) =>
    tx
      .update(parcelasHonorarios)
      .set({ cobrancaProvedor: "asaas", cobrancaId: emitida.id, cobrancaLink: emitida.link, cobrancaVencimento: emitida.vencimento, cobrancaEmitidaEm: new Date(), cobrancaEmitidaPor: userId })
      .where(and(eq(parcelasHonorarios.id, parcelaId), isNull(parcelasHonorarios.cobrancaId)))
      .returning({ id: parcelasHonorarios.id }),
  );
  if (!gravou.length) {
    // Duas pessoas cobraram a mesma parcela ao mesmo tempo: a segunda desfaz a que criou no Asaas.
    await removerCobranca(conta, emitida.id).catch(() => {});
    falha(409, "ja_cobrada", "Esta parcela já tem uma cobrança emitida.");
  }
  return emitida;
}

/** Cancela a cobrança no Asaas (se ela ainda existe lá) e solta a parcela. Cobrança paga não se cancela: estorne o pagamento. */
export async function cancelarCobranca(deps: DepsDaCobranca, organizationId: string, parcelaId: string): Promise<void> {
  const parcela = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.id, parcelaId)))[0]);
  if (!parcela) falha(404, "nao_encontrado");
  if (!parcela.cobrancaId) falha(409, "sem_cobranca", "Esta parcela não tem cobrança emitida.");
  const pagos = await withTenant(deps.db, organizationId, (tx) => tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, parcelaId), isNull(pagamentosHonorarios.estornadoEm), eq(pagamentosHonorarios.origem, "asaas"))));
  if (pagos.length) falha(409, "cobranca_paga", "Esta cobrança já foi paga. Estorne o pagamento se foi engano.");
  const conta = contaAsaasSemErro(deps, organizationId, (await configDoEscritorio(deps.db, organizationId))!);
  if (conta) {
    try {
      await removerCobranca(conta, parcela.cobrancaId);
    } catch (err) {
      // O Asaas já não tem a cobrança: segue. Qualquer outro erro, a cobrança continua e a pessoa tenta de novo.
      if (!(err instanceof AsaasErro && err.status === 404)) falha(err instanceof AsaasErro && err.status !== 0 ? 422 : 504, "asaas_recusou", err instanceof AsaasErro ? err.message : "O Asaas não respondeu.");
    }
  }
  await soltarCobranca(deps.db, organizationId, parcelaId);
}

export async function soltarCobranca(db: Database, organizationId: string, parcelaId: string): Promise<void> {
  await withTenant(db, organizationId, (tx) =>
    tx.update(parcelasHonorarios).set({ cobrancaProvedor: null, cobrancaId: null, cobrancaLink: null, cobrancaVencimento: null, cobrancaEmitidaEm: null, cobrancaEmitidaPor: null }).where(eq(parcelasHonorarios.id, parcelaId)),
  );
}

/** Pix Automático da mensalidade: o QR Code de autorização que o cliente usa uma vez; as cobranças dos meses seguintes saem ligadas a ele. */
export async function autorizarPixAutomatico(deps: DepsDaCobranca, organizationId: string, contratoId: string, hoje: Dia): Promise<{ id: string; situacao: string; payload: string; imagem: string | null }> {
  const cfg = await configDoEscritorio(deps.db, organizationId);
  if (!cfg?.pixAutomatico) falha(409, "pix_automatico_desligado", "O Pix Automático não está ligado para este escritório. Ligue nas Configurações (o Asaas exige CNPJ ativo há mais de 6 meses).");
  const conta = contaAsaas(deps, organizationId, cfg);
  if (!conta) falha(409, "sem_asaas", "O escritório ainda não ligou o Asaas.");
  const { contrato, cliente, primeira } = await withTenant(deps.db, organizationId, async (tx) => {
    const [l] = await tx.select({ c: contratosHonorarios, cliente: clientes }).from(contratosHonorarios).leftJoin(clientes, eq(clientes.id, contratosHonorarios.clienteId)).where(eq(contratosHonorarios.id, contratoId));
    if (!l) falha(404, "nao_encontrado");
    const abertas = (await parcelasNaTela(tx, hoje, { contratoId })).filter((p) => p.tipo === "mensal" && p.situacao !== "paga" && p.vencimento && p.vencimento >= hoje);
    return { contrato: l.c, cliente: l.cliente, primeira: abertas[0] };
  });
  if (!contrato.mensalidade) falha(422, "sem_mensalidade", "Só o contrato com mensalidade usa Pix Automático.");
  if (contrato.pixAutomaticoSituacao === "ACTIVE" || contrato.pixAutomaticoSituacao === "CREATED") falha(409, "ja_autorizado", "Este contrato já tem uma autorização de Pix Automático em andamento.");
  if (!cliente?.documento) falha(422, "cliente_sem_documento", "O cliente não tem CPF ou CNPJ cadastrado: o Asaas exige o documento de quem paga.");
  if (!primeira?.vencimento) falha(422, "sem_mensalidade_a_vencer", "Não há mensalidade a vencer neste contrato para começar a autorização.");
  let a;
  try {
    const clienteAsaas = await buscarOuCriarCliente(conta, { id: cliente.id, nome: cliente.nome, cpfCnpj: cliente.documento, email: cliente.email, telefone: cliente.telefone });
    a = await criarAutorizacaoPix(conta, { clienteAsaas, contrato: contrato.id.replaceAll("-", ""), inicio: primeira.vencimento, valorCentavos: contrato.mensalidade, descricao: "Honorários mensais", primeiraCobrancaCentavos: primeira.falta ?? contrato.mensalidade });
  } catch (err) {
    if (err instanceof AsaasErro) falha(err.status === 0 ? 504 : 422, "asaas_recusou", err.message);
    throw err;
  }
  await withTenant(deps.db, organizationId, (tx) => tx.update(contratosHonorarios).set({ pixAutomaticoId: a.id, pixAutomaticoSituacao: a.situacao, pixAutomaticoQr: { payload: a.payload, imagem: a.imagem } }).where(eq(contratosHonorarios.id, contratoId)));
  return a;
}

/* ------------------------------------------------------------------ */
/* O aviso de pagamento (webhook)                                       */
/* ------------------------------------------------------------------ */

/** O aviso do Asaas, só com o que o Decreta lê. Campo desconhecido é ignorado: o Asaas acrescenta campos sem avisar. */
export interface AvisoDoAsaas {
  id?: unknown;
  event?: unknown;
  dateCreated?: unknown;
  payment?: { id?: unknown; value?: unknown; billingType?: unknown; paymentDate?: unknown; clientPaymentDate?: unknown; confirmedDate?: unknown; deleted?: unknown; externalReference?: unknown };
  authorization?: { id?: unknown; status?: unknown };
}

const FORMA_PELO_TIPO: Record<string, "pix" | "boleto" | "cartao" | "transferencia" | "outro"> = { PIX: "pix", BOLETO: "boleto", CREDIT_CARD: "cartao", DEBIT_CARD: "cartao", TRANSFER: "transferencia", DEPOSIT: "transferencia" };
const EVENTOS_DE_PAGAMENTO = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]);
const EVENTOS_DE_ESTORNO = new Set(["PAYMENT_REFUNDED", "PAYMENT_RECEIVED_IN_CASH_UNDONE", "PAYMENT_CHARGEBACK_REQUESTED"]);
const EVENTOS_DA_AUTORIZACAO = new Set(["PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_CANCELLED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_EXPIRED", "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_REFUSED"]);

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
/** O valor do aviso vem em reais, como número JSON: vira centavos inteiros, arredondando o que o ponto flutuante sujou (19,99 × 100 = 1998,9999…). */
export const centavosDoAviso = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v * 100) : null);
const diaDoTexto = (v: unknown): Dia | null => {
  const t = texto(v);
  return t && /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};

export interface ResultadoDoAviso {
  /** O aviso já tinha sido tratado: nada foi feito de novo. */
  duplicado: boolean;
  resultado: string;
}

/**
 * Trata um aviso do Asaas, uma vez por evento: o id do evento é gravado antes de qualquer coisa, na mesma
 * transação da baixa. Se algo falhar, a transação volta inteira (o evento também) e o Asaas manda de novo.
 * A baixa só nasce de um pagamento confirmado pelo Asaas, e o mesmo pagamento nunca é baixado duas vezes.
 */
export async function tratarAvisoDoAsaas(db: Database, organizationId: string, aviso: AvisoDoAsaas, hoje: Dia): Promise<ResultadoDoAviso & { parcelaId?: string }> {
  const idDoEvento = texto(aviso.id);
  const tipo = texto(aviso.event);
  if (!idDoEvento || !tipo) falha(400, "aviso_invalido", "Aviso sem id ou sem evento.");
  const pagamentoId = texto(aviso.payment?.id);
  return withTenant(db, organizationId, async (tx) => {
    const [novo] = await tx
      .insert(eventosCobranca)
      .values({ organizationId, provedor: "asaas", externoId: idDoEvento, tipo, recurso: pagamentoId ?? texto(aviso.authorization?.id) })
      .onConflictDoNothing()
      .returning({ id: eventosCobranca.id });
    if (!novo) return { duplicado: true, resultado: "duplicado" };
    const fim = async (resultado: string, parcelaId?: string) => {
      await tx.update(eventosCobranca).set({ resultado }).where(eq(eventosCobranca.id, novo.id));
      return { duplicado: false, resultado, parcelaId };
    };

    if (EVENTOS_DA_AUTORIZACAO.has(tipo)) {
      const autorizacao = texto(aviso.authorization?.id);
      const situacao = texto(aviso.authorization?.status);
      if (!autorizacao || !situacao) return fim("autorizacao_sem_dados");
      const r = await tx.update(contratosHonorarios).set({ pixAutomaticoSituacao: situacao }).where(eq(contratosHonorarios.pixAutomaticoId, autorizacao)).returning({ id: contratosHonorarios.id });
      return fim(r.length ? "autorizacao_atualizada" : "autorizacao_desconhecida");
    }
    if (!pagamentoId) return fim("sem_cobranca");
    const [parcela] = await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.cobrancaId, pagamentoId)).for("update");
    if (!parcela) return fim("parcela_nao_encontrada");

    if (EVENTOS_DE_PAGAMENTO.has(tipo)) {
      if (aviso.payment?.deleted === true) return fim("cobranca_apagada", parcela.id);
      const valor = centavosDoAviso(aviso.payment?.value);
      if (!valor) return fim("valor_invalido", parcela.id);
      const pagoEm = diaDoTexto(aviso.payment?.paymentDate) ?? diaDoTexto(aviso.payment?.clientPaymentDate) ?? diaDoTexto(aviso.payment?.confirmedDate) ?? diaDoTexto(aviso.dateCreated) ?? hoje;
      const forma = FORMA_PELO_TIPO[texto(aviso.payment?.billingType) ?? ""] ?? "outro";
      const g = await registrarPagamento(tx, organizationId, { parcelaId: parcela.id, valor, pagoEm: pagoEm > hoje ? hoje : pagoEm, forma, origem: "asaas", externoId: `asaas:${pagamentoId}`, observacao: "Baixa automática pelo aviso de pagamento do Asaas." });
      // O Asaas manda "confirmado" e depois "recebido" do mesmo pagamento: o segundo não baixa de novo.
      return fim(g ? "baixa_feita" : "ja_baixado", parcela.id);
    }
    if (EVENTOS_DE_ESTORNO.has(tipo)) {
      const [g] = await tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.externoId, `asaas:${pagamentoId}`), isNull(pagamentosHonorarios.estornadoEm)));
      if (!g) return fim("nada_a_estornar", parcela.id);
      await estornarPagamento(tx, g.id, { userId: null, motivo: `Estorno avisado pelo Asaas (${tipo}).` });
      return fim("estornado", parcela.id);
    }
    if (tipo === "PAYMENT_DELETED") {
      const pagos = await tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, parcela.id), isNull(pagamentosHonorarios.estornadoEm)));
      if (pagos.length) return fim("apagada_com_pagamento", parcela.id);
      await tx.update(parcelasHonorarios).set({ cobrancaProvedor: null, cobrancaId: null, cobrancaLink: null, cobrancaVencimento: null, cobrancaEmitidaEm: null, cobrancaEmitidaPor: null }).where(eq(parcelasHonorarios.id, parcela.id));
      return fim("cobranca_solta", parcela.id);
    }
    return fim("ignorado", parcela.id);
  });
}
