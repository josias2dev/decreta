/**
 * Honorários: contratos, parcelas e pagamentos. Valores sempre em centavos inteiros.
 *
 * O recebido nunca é uma coluna: é a soma dos pagamentos marcados (por uma pessoa ou pela baixa
 * do Asaas), e só os não estornados contam. Sem pagamento marcado, nada aparece como recebido.
 */
import { diasEmAtraso, planejarParcelas, situacaoDaParcela, vencimentoDaCobranca, type Dia, type PlanoDoContrato, type SituacaoDaParcela, type TipoDeContrato, type VencimentoDaCobranca } from "@decreta/core";
import { auditoria, clientes, contratosHonorarios, pagamentosHonorarios, parcelasHonorarios, processos, type Tx } from "@decreta/db";
import { and, asc, desc, eq, gte, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { ACAO_DO_PAGAMENTO_SEM_PARCELA } from "../auditoria.ts";
import { falha } from "../rotas/base.ts";

export type Contrato = typeof contratosHonorarios.$inferSelect;
export type Parcela = typeof parcelasHonorarios.$inferSelect;
export type Pagamento = typeof pagamentosHonorarios.$inferSelect;
type FormaDoPagamento = Pagamento["forma"];

export interface PagamentoNaTela {
  id: string;
  valor: number;
  pagoEm: Dia;
  forma: FormaDoPagamento;
  origem: Pagamento["origem"];
  observacao: string | null;
  estornado: boolean;
  motivoEstorno: string | null;
  registradoPor: string | null;
}

export interface ParcelaNaTela {
  id: string;
  contratoId: string;
  contratoTitulo: string;
  contratoTipo: TipoDeContrato;
  contratoSituacao: Contrato["situacao"];
  tipo: Parcela["tipo"];
  numero: number;
  descricao: string;
  /** Em centavos; nulo no êxito que ainda não tem resultado. */
  valor: number | null;
  vencimento: Dia | null;
  /** A soma dos pagamentos marcados (os estornados não entram). */
  pago: number;
  falta: number | null;
  situacao: SituacaoDaParcela;
  diasEmAtraso: number;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; titulo: string; cnj: string | null } | null;
  cobranca: { provedor: string; link: string | null; vencimento: Dia | null } | null;
  /** O vencimento que a cobrança sugere: o da parcela, nunca o dia de hoje. Nulo quando não há o que cobrar. */
  vencimentoDaCobranca: VencimentoDaCobranca | null;
  alvaraId: string | null;
  prestacaoId: string | null;
  criadaEm: string;
  pagamentos: PagamentoNaTela[];
}

export interface FiltroDeParcelas {
  contratoId?: string;
  contratoIds?: string[];
  clienteId?: string;
  processoId?: string;
  /** Na tela do contrato, as canceladas aparecem riscadas. */
  comCanceladas?: boolean;
}

/** As parcelas do escritório com o que já foi pago, a situação e de quem são. Das que vencem antes para as que vencem depois. */
export async function parcelasNaTela(tx: Tx, hoje: Dia, filtro: FiltroDeParcelas = {}): Promise<ParcelaNaTela[]> {
  const onde: (SQL | undefined)[] = [filtro.comCanceladas ? undefined : isNull(parcelasHonorarios.canceladaEm)];
  if (filtro.contratoId) onde.push(eq(parcelasHonorarios.contratoId, filtro.contratoId));
  if (filtro.contratoIds) onde.push(filtro.contratoIds.length ? inArray(parcelasHonorarios.contratoId, filtro.contratoIds) : sql`false`);
  if (filtro.clienteId) onde.push(eq(contratosHonorarios.clienteId, filtro.clienteId));
  if (filtro.processoId) onde.push(eq(contratosHonorarios.processoId, filtro.processoId));
  const linhas = await tx
    .select({ p: parcelasHonorarios, c: contratosHonorarios, cliente: { id: clientes.id, nome: clientes.nome }, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj } })
    .from(parcelasHonorarios)
    .innerJoin(contratosHonorarios, eq(contratosHonorarios.id, parcelasHonorarios.contratoId))
    .leftJoin(clientes, eq(clientes.id, contratosHonorarios.clienteId))
    .leftJoin(processos, eq(processos.id, contratosHonorarios.processoId))
    .where(and(...onde))
    .orderBy(asc(parcelasHonorarios.vencimento), asc(parcelasHonorarios.createdAt), asc(parcelasHonorarios.numero))
    .limit(5_000);
  const ids = linhas.map((l) => l.p.id);
  const pagamentos = ids.length ? await tx.select().from(pagamentosHonorarios).where(inArray(pagamentosHonorarios.parcelaId, ids)).orderBy(asc(pagamentosHonorarios.pagoEm), asc(pagamentosHonorarios.createdAt)) : [];
  const dasParcelas = new Map<string, Pagamento[]>();
  for (const g of pagamentos) dasParcelas.set(g.parcelaId, [...(dasParcelas.get(g.parcelaId) ?? []), g]);
  return linhas.map(({ p, c, cliente, processo }) => {
    const seus = dasParcelas.get(p.id) ?? [];
    const pago = seus.filter((g) => !g.estornadoEm).reduce((s, g) => s + g.valor, 0);
    const cancelada = p.canceladaEm !== null;
    return {
      id: p.id,
      contratoId: c.id,
      contratoTitulo: c.titulo,
      contratoTipo: c.tipo,
      contratoSituacao: c.situacao,
      tipo: p.tipo,
      numero: p.numero,
      descricao: p.descricao,
      valor: p.valor,
      vencimento: p.vencimento,
      pago,
      falta: p.valor === null ? null : Math.max(p.valor - pago, 0),
      situacao: situacaoDaParcela({ valor: p.valor, vencimento: p.vencimento, pago, cancelada }, hoje),
      diasEmAtraso: cancelada || (p.valor !== null && pago >= p.valor) ? 0 : diasEmAtraso(p.vencimento, hoje),
      cliente: cliente?.id ? cliente : null,
      processo: processo?.id ? processo : null,
      cobranca: p.cobrancaId ? { provedor: p.cobrancaProvedor ?? "asaas", link: p.cobrancaLink, vencimento: p.cobrancaVencimento } : null,
      vencimentoDaCobranca: !cancelada && !p.cobrancaId && p.valor !== null && pago < p.valor ? vencimentoDaCobranca(p.vencimento, hoje) : null,
      alvaraId: p.alvaraId,
      prestacaoId: p.prestacaoId,
      criadaEm: p.createdAt.toISOString(),
      pagamentos: seus.map((g) => ({ id: g.id, valor: g.valor, pagoEm: g.pagoEm, forma: g.forma, origem: g.origem, observacao: g.observacao, estornado: g.estornadoEm !== null, motivoEstorno: g.motivoEstorno, registradoPor: g.registradoPor })),
    };
  });
}

/** Quantas parcelas já venceram sem pagar por inteiro (o número do menu). */
export async function contarParcelasEmAtraso(tx: Tx, hoje: Dia): Promise<number> {
  const [r] = await tx.execute<{ n: number }>(sql`
    select count(*)::int as n from parcelas_honorarios p
    where p.cancelada_em is null and p.valor is not null and p.vencimento < ${hoje}
      and p.valor > coalesce((select sum(g.valor) from pagamentos_honorarios g where g.parcela_id = p.id and g.estornado_em is null), 0)`);
  return r?.n ?? 0;
}

/** Os processos em andamento que não têm contrato de honorários (nem do processo, nem do cliente) e cujo aviso ninguém dispensou. */
export async function processosSemHonorario(tx: Tx, limite = 10): Promise<{ total: number; itens: { id: string; titulo: string; cnj: string | null; cliente: { id: string; nome: string } | null }[] }> {
  const onde = and(
    inArray(processos.situacao, ["ativo", "suspenso"]),
    isNull(processos.honorarioDispensadoEm),
    sql`not exists (select 1 from contratos_honorarios c where c.situacao <> 'cancelado' and (c.processo_id = ${processos.id} or (c.cliente_id = ${processos.clienteId} and c.processo_id is null)))`,
  );
  const [[{ n } = { n: 0 }], itens] = await Promise.all([
    tx.select({ n: sql<number>`count(*)::int` }).from(processos).where(onde),
    tx
      .select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj, cliente: { id: clientes.id, nome: clientes.nome } })
      .from(processos)
      .leftJoin(clientes, eq(clientes.id, processos.clienteId))
      .where(onde)
      .orderBy(desc(processos.createdAt))
      .limit(limite),
  ]);
  return { total: n, itens: itens.map((i) => ({ ...i, cliente: i.cliente?.id ? i.cliente : null })) };
}

/** Uma parcela só, na mesma forma da lista. */
export async function parcelaNaTela(tx: Tx, hoje: Dia, parcelaId: string): Promise<ParcelaNaTela> {
  const [achada] = await tx.select({ contratoId: parcelasHonorarios.contratoId }).from(parcelasHonorarios).where(eq(parcelasHonorarios.id, parcelaId));
  if (!achada) falha(404, "nao_encontrado");
  const r = (await parcelasNaTela(tx, hoje, { contratoId: achada.contratoId, comCanceladas: true })).find((p) => p.id === parcelaId);
  return r ?? falha(404, "nao_encontrado");
}

/* ------------------------------------------------------------------ */
/* Contratos                                                           */
/* ------------------------------------------------------------------ */

export interface PedidoDeContrato extends PlanoDoContrato {
  clienteId?: string | null;
  processoId?: string | null;
  titulo?: string | null;
  inicio: Dia;
  observacoes?: string | null;
  documentoId?: string | null;
}

/**
 * Cria o contrato e as parcelas que ele gera. O contrato é de um cliente, de um processo ou dos dois;
 * se vier só o processo, o cliente é o dele.
 */
export async function criarContrato(tx: Tx, organizationId: string, userId: string, p: PedidoDeContrato): Promise<Contrato> {
  if (!p.clienteId && !p.processoId) falha(422, "sem_caso", "Escolha o cliente ou o processo do contrato.");
  let clienteId = p.clienteId ?? null;
  let titulo = p.titulo?.trim() || "";
  let processoTitulo: string | null = null;
  if (p.processoId) {
    const [proc] = await tx.select({ titulo: processos.titulo, clienteId: processos.clienteId }).from(processos).where(eq(processos.id, p.processoId));
    if (!proc) falha(404, "processo_nao_encontrado", "Processo não encontrado.");
    processoTitulo = proc.titulo;
    clienteId ??= proc.clienteId;
  }
  let clienteNome: string | null = null;
  if (clienteId) {
    const [cl] = await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId));
    if (!cl) falha(404, "cliente_nao_encontrado", "Cliente não encontrado.");
    clienteNome = cl.nome;
  }
  titulo ||= `Honorários · ${processoTitulo ?? clienteNome ?? "caso"}`;
  let planejadas: ReturnType<typeof planejarParcelas>;
  try {
    planejadas = planejarParcelas(p);
  } catch (err) {
    return falha(422, "contrato_invalido", err instanceof Error ? err.message : "Confira os dados do contrato.");
  }
  const [contrato] = await tx
    .insert(contratosHonorarios)
    .values({
      organizationId,
      clienteId,
      processoId: p.processoId ?? null,
      titulo: titulo.slice(0, 300),
      tipo: p.tipo,
      valorFixo: p.fixo?.valor ?? null,
      mensalidade: p.mensal?.valor ?? null,
      exitoBp: p.exitoBp ?? null,
      inicio: p.inicio,
      observacoes: p.observacoes ?? null,
      documentoId: p.documentoId ?? null,
      criadoPor: userId,
    })
    .returning();
  await tx.insert(parcelasHonorarios).values(planejadas.map((x) => ({ organizationId, contratoId: contrato!.id, tipo: x.tipo, numero: x.numero, descricao: x.descricao, valor: x.valor, vencimento: x.vencimento })));
  return contrato!;
}

export async function contratoDoEscritorio(tx: Tx, contratoId: string): Promise<Contrato> {
  const [c] = await tx.select().from(contratosHonorarios).where(eq(contratosHonorarios.id, contratoId));
  return c ?? falha(404, "nao_encontrado");
}

/** Os contratos de um cliente ou processo, dos mais novos para os mais antigos. */
export async function contratosDe(tx: Tx, filtro: { id?: string; clienteId?: string; processoId?: string; situacao?: Contrato["situacao"] } = {}) {
  const onde: (SQL | undefined)[] = [];
  if (filtro.id) onde.push(eq(contratosHonorarios.id, filtro.id));
  if (filtro.clienteId) onde.push(eq(contratosHonorarios.clienteId, filtro.clienteId));
  if (filtro.processoId) onde.push(eq(contratosHonorarios.processoId, filtro.processoId));
  if (filtro.situacao) onde.push(eq(contratosHonorarios.situacao, filtro.situacao));
  return tx
    .select({ c: contratosHonorarios, cliente: { id: clientes.id, nome: clientes.nome }, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj } })
    .from(contratosHonorarios)
    .leftJoin(clientes, eq(clientes.id, contratosHonorarios.clienteId))
    .leftJoin(processos, eq(processos.id, contratosHonorarios.processoId))
    .where(and(...onde))
    .orderBy(desc(contratosHonorarios.createdAt))
    .limit(500);
}

/* ------------------------------------------------------------------ */
/* Pagamentos                                                          */
/* ------------------------------------------------------------------ */

export interface PedidoDePagamento {
  parcelaId: string;
  valor: number;
  pagoEm: Dia;
  forma: FormaDoPagamento;
  origem: Pagamento["origem"];
  externoId?: string | null;
  observacao?: string | null;
  registradoPor?: string | null;
}

/**
 * Marca um pagamento. Só vale em parcela com valor e que não foi cancelada. Quem marca à mão não passa do
 * que falta; o Asaas (que cobra juros e multa) pode trazer o que o cliente de fato pagou.
 * O mesmo pagamento do provedor (`externoId`) nunca é baixado duas vezes: devolve `null`.
 */
export async function registrarPagamento(tx: Tx, organizationId: string, p: PedidoDePagamento): Promise<Pagamento | null> {
  if (!Number.isSafeInteger(p.valor) || p.valor <= 0) falha(422, "valor_invalido", "O valor do pagamento precisa ser maior que zero.");
  const [parcela] = await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.id, p.parcelaId)).for("update");
  if (!parcela) falha(404, "nao_encontrado");
  if (parcela.canceladaEm) falha(409, "parcela_cancelada", "Esta parcela foi cancelada.");
  if (parcela.valor === null) falha(422, "sem_valor", "Esta parcela ainda não tem valor: informe o valor antes de marcar o pagamento.");
  if (p.externoId) {
    const [ja] = await tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(eq(pagamentosHonorarios.externoId, p.externoId));
    if (ja) return null;
  }
  if (p.origem === "manual") {
    const feitos = await tx.select({ valor: pagamentosHonorarios.valor }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, p.parcelaId), isNull(pagamentosHonorarios.estornadoEm)));
    const falta = Math.max(parcela.valor - feitos.reduce((s, g) => s + g.valor, 0), 0);
    if (falta === 0) falha(409, "ja_paga", "Esta parcela já está paga.");
    if (p.valor > falta) falha(422, "passa_do_que_falta", "O valor passa do que falta pagar nesta parcela.");
  }
  const [g] = await tx
    .insert(pagamentosHonorarios)
    .values({ organizationId, parcelaId: p.parcelaId, valor: p.valor, pagoEm: p.pagoEm, forma: p.forma, origem: p.origem, externoId: p.externoId ?? null, observacao: p.observacao ?? null, registradoPor: p.registradoPor ?? null })
    .onConflictDoNothing()
    .returning();
  return g ?? null;
}

/** O Asaas recebeu o dinheiro e a parcela não aceitou o pagamento: o que o sócio precisa saber para resolver lá. */
export interface PagamentoSemParcela {
  parcelaId: string;
  cobranca: string;
  descricao: string;
  valor: number;
  motivo: "parcela_cancelada" | "parcela_sem_valor" | "pagamento_recusado";
}

/** Por quantos dias o Financeiro mostra o pagamento que não entrou. Depois disso, ele continua no registro de atividades. */
const DIAS_DO_AVISO_SEM_PARCELA = 30;

/** Os pagamentos que o Asaas avisou nos últimos dias e nenhuma parcela aceitou, do mais novo para o mais antigo. */
export async function pagamentosSemParcela(tx: Tx): Promise<(PagamentoSemParcela & { em: string })[]> {
  const desde = new Date(Date.now() - DIAS_DO_AVISO_SEM_PARCELA * 24 * 60 * 60 * 1000);
  const linhas = await tx.select({ em: auditoria.createdAt, detalhes: auditoria.detalhes }).from(auditoria).where(and(eq(auditoria.acao, ACAO_DO_PAGAMENTO_SEM_PARCELA), gte(auditoria.createdAt, desde))).orderBy(desc(auditoria.createdAt)).limit(20);
  return linhas.map(({ em, detalhes }) => {
    const { parcelaId, cobranca, descricao, valor, motivo } = detalhes as unknown as PagamentoSemParcela;
    return { em: em.toISOString(), parcelaId, cobranca, descricao, valor, motivo };
  });
}

export async function estornarPagamento(tx: Tx, pagamentoId: string, quem: { userId: string | null; motivo: string }): Promise<Pagamento> {
  const [g] = await tx
    .update(pagamentosHonorarios)
    .set({ estornadoEm: new Date(), estornadoPor: quem.userId, motivoEstorno: quem.motivo })
    .where(and(eq(pagamentosHonorarios.id, pagamentoId), isNull(pagamentosHonorarios.estornadoEm)))
    .returning();
  if (g) return g;
  const [existe] = await tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(eq(pagamentosHonorarios.id, pagamentoId));
  return existe ? falha(409, "ja_estornado", "Este pagamento já foi estornado.") : falha(404, "nao_encontrado");
}

/** Cancela a parcela que ninguém pagou. Pagamento marcado: estorne antes. */
export async function cancelarParcela(tx: Tx, parcelaId: string, motivo: string): Promise<Parcela> {
  const [parcela] = await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.id, parcelaId)).for("update");
  if (!parcela) falha(404, "nao_encontrado");
  if (parcela.canceladaEm) falha(409, "ja_cancelada", "Esta parcela já foi cancelada.");
  const feitos = await tx.select({ id: pagamentosHonorarios.id }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, parcelaId), isNull(pagamentosHonorarios.estornadoEm)));
  if (feitos.length) falha(409, "tem_pagamento", "Esta parcela tem pagamento marcado. Estorne o pagamento antes de cancelar.");
  const [r] = await tx.update(parcelasHonorarios).set({ canceladaEm: new Date(), motivoCancelamento: motivo.slice(0, 300) }).where(eq(parcelasHonorarios.id, parcelaId)).returning();
  return r!;
}
