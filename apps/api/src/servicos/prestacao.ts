/**
 * Do alvará ao honorário: quando um alvará é sacado, o Decreta calcula a parte do honorário de
 * êxito do contrato e a do cliente, e mostra a conta. Nada é confirmado sem o clique de uma
 * pessoa: a confirmação grava a prestação de contas, cria (ou preenche) a parcela de êxito e
 * só então o repasse ao cliente é registrado, com data, valor, conta e favorecido.
 *
 * A conta usa o valor que caiu na conta, não o do alvará (se forem diferentes, a diferença
 * aparece). Sem o valor recebido, a conta é só uma estimativa e não se confirma.
 */
import { calcularAlvara, centavosDoNumeric, conferirRepasses, formatarBasePontos, formatarCentavos, type ConferenciaDeRepasses, type ContaDoAlvara, type Dia } from "@decreta/core";
import { alvaras, clientes, contratosHonorarios, pagamentosHonorarios, parcelasHonorarios, prestacoesDeContas, processos, repassesDeAlvara, type Tx } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { falha } from "../rotas/base.ts";
import { estornarPagamento, registrarPagamento, type Contrato } from "./honorarios.ts";

export type Prestacao = typeof prestacoesDeContas.$inferSelect;
export type Repasse = typeof repassesDeAlvara.$inferSelect;

/** O alvará está sacado (ou além): é daí em diante que a conta se confirma. */
const DEPOIS_DO_SAQUE = ["sacado", "repassado", "finalizado"] as const;

export interface ContratoCandidato {
  id: string;
  titulo: string;
  exitoBp: number;
  /** "processo": o contrato é deste processo. "cliente": o contrato é do cliente, para todos os casos dele. */
  nivel: "processo" | "cliente";
}

/** Os contratos com honorário de êxito que podem valer para o alvará: os do processo e, depois, os do cliente. */
export async function candidatosDoAlvara(tx: Tx, processoId: string, clienteId: string | null): Promise<ContratoCandidato[]> {
  const linhas = await tx
    .select()
    .from(contratosHonorarios)
    .where(
      and(
        ne(contratosHonorarios.situacao, "cancelado"),
        isNotNull(contratosHonorarios.exitoBp),
        or(eq(contratosHonorarios.processoId, processoId), clienteId ? and(eq(contratosHonorarios.clienteId, clienteId), isNull(contratosHonorarios.processoId)) : undefined),
      ),
    )
    .orderBy(asc(contratosHonorarios.createdAt));
  return linhas.map((c) => ({ id: c.id, titulo: c.titulo, exitoBp: c.exitoBp!, nivel: c.processoId === processoId ? "processo" : "cliente" }));
}

/**
 * O contrato da conta: o escolhido, ou o único do processo (e, sem ele, o único do cliente).
 * Vários no mesmo nível: nenhum até a pessoa escolher, para o Decreta não adivinhar o percentual.
 */
export function escolherContrato(candidatos: ContratoCandidato[], escolhido?: string | null): { contrato: ContratoCandidato | null; precisaEscolher: boolean } {
  if (escolhido) {
    const c = candidatos.find((x) => x.id === escolhido);
    if (!c) falha(422, "contrato_invalido", "Este contrato não vale para o alvará: ele não tem êxito, foi cancelado ou é de outro caso.");
    return { contrato: c, precisaEscolher: false };
  }
  for (const nivel of ["processo", "cliente"] as const) {
    const doNivel = candidatos.filter((c) => c.nivel === nivel);
    if (doNivel.length === 1) return { contrato: doNivel[0]!, precisaEscolher: false };
    if (doNivel.length > 1) return { contrato: null, precisaEscolher: true };
  }
  return { contrato: null, precisaEscolher: false };
}

export interface RepasseNaTela {
  id: string;
  favorecido: string;
  favorecidoDocumento: string | null;
  conta: string;
  valor: number;
  repassadoEm: Dia;
  observacao: string | null;
  estornado: boolean;
}

export interface PrestacaoNaTela {
  id: string;
  alvaraId: string;
  contratoId: string | null;
  parcelaId: string | null;
  valorAlvara: number;
  valorRecebido: number;
  exitoBp: number | null;
  honorario: number;
  cliente: number;
  semContrato: boolean;
  retidoNoSaque: boolean;
  observacao: string | null;
  confirmadaEm: string;
  confirmadaPor: string | null;
  documentoId: string | null;
  repasses: RepasseNaTela[];
  conferencia: ConferenciaDeRepasses;
}

async function prestacaoNaTela(tx: Tx, p: Prestacao): Promise<PrestacaoNaTela> {
  const repasses = await tx.select().from(repassesDeAlvara).where(eq(repassesDeAlvara.prestacaoId, p.id)).orderBy(asc(repassesDeAlvara.repassadoEm), asc(repassesDeAlvara.createdAt));
  return {
    id: p.id,
    alvaraId: p.alvaraId,
    contratoId: p.contratoId,
    parcelaId: p.parcelaId,
    valorAlvara: p.valorAlvara,
    valorRecebido: p.valorRecebido,
    exitoBp: p.exitoBp,
    honorario: p.honorario,
    cliente: p.cliente,
    semContrato: p.semContrato,
    retidoNoSaque: p.retidoNoSaque,
    observacao: p.observacao,
    confirmadaEm: p.confirmadaEm.toISOString(),
    confirmadaPor: p.confirmadaPor,
    documentoId: p.documentoId,
    repasses: repasses.map((r) => ({ id: r.id, favorecido: r.favorecido, favorecidoDocumento: r.favorecidoDocumento, conta: r.conta, valor: r.valor, repassadoEm: r.repassadoEm, observacao: r.observacao, estornado: r.estornadoEm !== null })),
    conferencia: conferirRepasses(p.cliente, repasses.filter((r) => !r.estornadoEm)),
  };
}

export async function prestacaoDoAlvara(tx: Tx, alvaraId: string): Promise<PrestacaoNaTela | null> {
  const [p] = await tx.select().from(prestacoesDeContas).where(and(eq(prestacoesDeContas.alvaraId, alvaraId), isNull(prestacoesDeContas.canceladaEm)));
  return p ? prestacaoNaTela(tx, p) : null;
}

export async function prestacaoPorId(tx: Tx, prestacaoId: string): Promise<Prestacao> {
  const [p] = await tx.select().from(prestacoesDeContas).where(eq(prestacoesDeContas.id, prestacaoId));
  return p ?? falha(404, "nao_encontrado");
}

export interface ContaNaTela {
  alvara: { id: string; descricao: string; etapa: (typeof alvaras.$inferSelect)["etapa"]; valor: number; valorRecebido: number | null; sacadoEm: Dia | null; processo: { id: string; titulo: string; cnj: string | null }; cliente: { id: string; nome: string } | null };
  contratos: ContratoCandidato[];
  contrato: ContratoCandidato | null;
  precisaEscolherContrato: boolean;
  conta: ContaDoAlvara;
  prestacao: PrestacaoNaTela | null;
  podeConfirmar: boolean;
  /** Por que ainda não dá para confirmar. */
  motivo: string | null;
}

async function alvaraDoEscritorio(tx: Tx, alvaraId: string) {
  const [l] = await tx
    .select({ a: alvaras, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj, clienteId: processos.clienteId }, cliente: { id: clientes.id, nome: clientes.nome } })
    .from(alvaras)
    .innerJoin(processos, eq(processos.id, alvaras.processoId))
    .leftJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(eq(alvaras.id, alvaraId));
  return l ?? falha(404, "nao_encontrado");
}

const emCentavos = (v: string | null) => centavosDoNumeric(v);

/** A conta do alvará como a tela mostra: o contrato, os números e se já dá para confirmar. */
export async function contaDoAlvara(tx: Tx, alvaraId: string, contratoEscolhido?: string | null): Promise<ContaNaTela> {
  const l = await alvaraDoEscritorio(tx, alvaraId);
  const candidatos = await candidatosDoAlvara(tx, l.processo.id, l.processo.clienteId);
  const { contrato, precisaEscolher } = escolherContrato(candidatos, contratoEscolhido);
  const valor = emCentavos(l.a.valor) ?? 0;
  const recebido = emCentavos(l.a.valorRecebido);
  const conta = calcularAlvara({ valorAlvara: valor, valorRecebido: recebido, exitoBp: contrato?.exitoBp ?? null });
  const prestacao = await prestacaoDoAlvara(tx, alvaraId);
  let motivo: string | null = null;
  if (prestacao) motivo = "A prestação de contas deste alvará já foi confirmada.";
  else if (!DEPOIS_DO_SAQUE.includes(l.a.etapa as (typeof DEPOIS_DO_SAQUE)[number])) motivo = "O alvará ainda não foi sacado.";
  else if (conta.falta === "valor_recebido") motivo = "Informe o valor que caiu na conta: a conta se confirma sobre ele, e não sobre o valor do alvará.";
  else if (precisaEscolher) motivo = "Há mais de um contrato com êxito para este caso. Escolha o que vale para este alvará.";
  return {
    alvara: { id: l.a.id, descricao: l.a.descricao, etapa: l.a.etapa, valor, valorRecebido: recebido, sacadoEm: l.a.sacadoEm, processo: { id: l.processo.id, titulo: l.processo.titulo, cnj: l.processo.cnj }, cliente: l.cliente?.id ? l.cliente : null },
    contratos: candidatos,
    contrato,
    precisaEscolherContrato: precisaEscolher,
    conta,
    prestacao,
    podeConfirmar: motivo === null,
    motivo,
  };
}

export interface PedidoDeConfirmacao {
  contratoId?: string | null;
  /** As duas partes como a pessoa as viu na tela: se a conta mudou desde então, a confirmação é recusada. */
  honorario: number;
  cliente: number;
  retidoNoSaque?: boolean;
  observacao?: string | null;
}

/** O honorário de êxito já foi calculado: grava na parcela de êxito do contrato (a que nasceu sem valor) ou cria outra. */
async function parcelaDoExito(tx: Tx, organizationId: string, contrato: Contrato, alvara: { id: string; descricao: string }, honorario: number, vencimento: Dia, prestacaoId: string) {
  const descricao = `Honorário de êxito · ${alvara.descricao} (${formatarBasePontos(contrato.exitoBp!)})`.slice(0, 300);
  const [vazia] = await tx
    .select({ id: parcelasHonorarios.id })
    .from(parcelasHonorarios)
    .where(and(eq(parcelasHonorarios.contratoId, contrato.id), eq(parcelasHonorarios.tipo, "exito"), isNull(parcelasHonorarios.valor), isNull(parcelasHonorarios.canceladaEm), isNull(parcelasHonorarios.alvaraId)))
    .orderBy(asc(parcelasHonorarios.createdAt))
    .limit(1)
    .for("update");
  if (vazia) {
    await tx.update(parcelasHonorarios).set({ valor: honorario, vencimento, descricao, alvaraId: alvara.id, prestacaoId }).where(eq(parcelasHonorarios.id, vazia.id));
    return vazia.id;
  }
  const [{ n } = { n: 0 }] = await tx.select({ n: parcelasHonorarios.numero }).from(parcelasHonorarios).where(eq(parcelasHonorarios.contratoId, contrato.id)).orderBy(desc(parcelasHonorarios.numero)).limit(1);
  const [nova] = await tx
    .insert(parcelasHonorarios)
    .values({ organizationId, contratoId: contrato.id, tipo: "exito", numero: n + 1, descricao, valor: honorario, vencimento, alvaraId: alvara.id, prestacaoId })
    .returning({ id: parcelasHonorarios.id });
  return nova!.id;
}

/**
 * Confirma a conta do alvará: grava a prestação de contas e põe o honorário de êxito na parcela do contrato,
 * com vencimento no dia do saque. Só uma prestação ativa por alvará. O honorário só vira "recebido" se quem
 * confirmou marcar que o escritório o reteve no saque: nenhum pagamento nasce sozinho.
 */
export async function confirmarPrestacao(tx: Tx, organizationId: string, userId: string, alvaraId: string, p: PedidoDeConfirmacao, hoje: Dia): Promise<{ prestacao: PrestacaoNaTela; parcelaId: string | null }> {
  // O alvará fica travado até o fim: duas confirmações seguidas não gravam duas prestações.
  await tx.select({ id: alvaras.id }).from(alvaras).where(eq(alvaras.id, alvaraId)).for("update");
  const c = await contaDoAlvara(tx, alvaraId, p.contratoId);
  if (!c.podeConfirmar) falha(c.prestacao ? 409 : 422, c.prestacao ? "ja_confirmada" : "nao_da_para_confirmar", c.motivo ?? "Não dá para confirmar agora.");
  if (c.conta.honorario !== p.honorario || c.conta.cliente !== p.cliente) {
    falha(409, "conta_mudou", `A conta mudou desde que você a viu (agora: honorário ${formatarCentavos(c.conta.honorario)} e cliente ${formatarCentavos(c.conta.cliente)}). Confira de novo antes de confirmar.`);
  }
  const contrato = c.contrato ? (await tx.select().from(contratosHonorarios).where(eq(contratosHonorarios.id, c.contrato.id)))[0]! : null;
  const [prestacao] = await tx
    .insert(prestacoesDeContas)
    .values({
      organizationId,
      alvaraId,
      contratoId: contrato?.id ?? null,
      valorAlvara: c.alvara.valor,
      valorRecebido: c.conta.base,
      exitoBp: contrato?.exitoBp ?? null,
      honorario: c.conta.honorario,
      cliente: c.conta.cliente,
      semContrato: c.conta.semContrato,
      retidoNoSaque: !!p.retidoNoSaque && c.conta.honorario > 0,
      observacao: p.observacao ?? null,
      confirmadaPor: userId,
    })
    .returning();
  let parcelaId: string | null = null;
  if (contrato && c.conta.honorario > 0) {
    const vencimento = c.alvara.sacadoEm ?? hoje;
    parcelaId = await parcelaDoExito(tx, organizationId, contrato, c.alvara, c.conta.honorario, vencimento, prestacao!.id);
    await tx.update(prestacoesDeContas).set({ parcelaId }).where(eq(prestacoesDeContas.id, prestacao!.id));
    if (p.retidoNoSaque) {
      await registrarPagamento(tx, organizationId, { parcelaId, valor: c.conta.honorario, pagoEm: vencimento > hoje ? hoje : vencimento, forma: "retido_no_alvara", origem: "manual", observacao: "Honorário retido pelo escritório no saque do alvará.", registradoPor: userId });
    }
  }
  return { prestacao: (await prestacaoDoAlvara(tx, alvaraId))!, parcelaId };
}

/**
 * O que impede desfazer a prestação (repasse registrado, pagamento do honorário que não seja o retido no alvará). Sem
 * impedimento, diz a parcela que ainda tem cobrança emitida, para ela sair do Asaas antes de desfazer.
 */
export async function conferirDesfazer(tx: Tx, prestacaoId: string): Promise<{ cobrancaDaParcela: string | null }> {
  const [p] = await tx.select().from(prestacoesDeContas).where(eq(prestacoesDeContas.id, prestacaoId)).for("update");
  if (!p) falha(404, "nao_encontrado");
  if (p.canceladaEm) falha(409, "ja_desfeita", "Esta prestação de contas já foi desfeita.");
  const feitos = await tx.select({ id: repassesDeAlvara.id }).from(repassesDeAlvara).where(and(eq(repassesDeAlvara.prestacaoId, prestacaoId), isNull(repassesDeAlvara.estornadoEm)));
  if (feitos.length) falha(409, "tem_repasse", "Há repasse registrado. Desfaça os repasses antes de desfazer a prestação de contas.");
  if (!p.parcelaId) return { cobrancaDaParcela: null };
  const pagos = await tx.select({ forma: pagamentosHonorarios.forma }).from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, p.parcelaId), isNull(pagamentosHonorarios.estornadoEm)));
  if (pagos.some((g) => g.forma !== "retido_no_alvara")) falha(409, "tem_pagamento", "O honorário desta prestação já tem pagamento marcado. Estorne o pagamento antes de desfazer a prestação de contas.");
  const [parcela] = await tx.select({ cobrancaId: parcelasHonorarios.cobrancaId }).from(parcelasHonorarios).where(eq(parcelasHonorarios.id, p.parcelaId));
  return { cobrancaDaParcela: parcela?.cobrancaId ? p.parcelaId : null };
}

/** Desfaz a prestação confirmada por engano: só sem repasse registrado e sem pagamento do honorário marcado. */
export async function desfazerPrestacao(tx: Tx, prestacaoId: string, userId: string, motivo: string): Promise<void> {
  await conferirDesfazer(tx, prestacaoId);
  const [p] = await tx.select().from(prestacoesDeContas).where(eq(prestacoesDeContas.id, prestacaoId)).for("update");
  if (!p) falha(404, "nao_encontrado");
  if (p.parcelaId) {
    const [parcela] = await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.id, p.parcelaId));
    if (parcela) {
      await estornarPagamentosRetidos(tx, parcela.id, userId);
      await tx.update(parcelasHonorarios).set({ canceladaEm: new Date(), motivoCancelamento: "Prestação de contas desfeita." }).where(eq(parcelasHonorarios.id, parcela.id));
    }
  }
  await tx.update(prestacoesDeContas).set({ canceladaEm: new Date(), canceladaPor: userId, motivoCancelamento: motivo.slice(0, 300) }).where(eq(prestacoesDeContas.id, prestacaoId));
}

/** O pagamento "retido no alvará" nasceu da própria prestação: sai com ela. Qualquer outro pagamento da parcela segura o desfazer. */
async function estornarPagamentosRetidos(tx: Tx, parcelaId: string, userId: string): Promise<void> {
  const feitos = await tx.select().from(pagamentosHonorarios).where(and(eq(pagamentosHonorarios.parcelaId, parcelaId), isNull(pagamentosHonorarios.estornadoEm)));
  for (const g of feitos) await estornarPagamento(tx, g.id, { userId, motivo: "Prestação de contas desfeita." });
}

export interface PedidoDeRepasse {
  favorecido: string;
  favorecidoDocumento?: string | null;
  conta: string;
  valor: number;
  repassadoEm: Dia;
  observacao?: string | null;
}

/** Registra um repasse da parte do cliente. A soma dos repasses não passa da parte do cliente. */
export async function registrarRepasse(tx: Tx, organizationId: string, userId: string, prestacaoId: string, p: PedidoDeRepasse): Promise<{ repasse: Repasse; conferencia: ConferenciaDeRepasses }> {
  const [prestacao] = await tx.select().from(prestacoesDeContas).where(eq(prestacoesDeContas.id, prestacaoId)).for("update");
  if (!prestacao) falha(404, "nao_encontrado");
  if (prestacao.canceladaEm) falha(409, "prestacao_desfeita", "Esta prestação de contas foi desfeita.");
  if (!Number.isSafeInteger(p.valor) || p.valor <= 0) falha(422, "valor_invalido", "O valor do repasse precisa ser maior que zero.");
  const feitos = await tx.select({ valor: repassesDeAlvara.valor }).from(repassesDeAlvara).where(and(eq(repassesDeAlvara.prestacaoId, prestacaoId), isNull(repassesDeAlvara.estornadoEm)));
  const depois = conferirRepasses(prestacao.cliente, [...feitos, { valor: p.valor }]);
  if (depois.excede > 0) {
    const antes = conferirRepasses(prestacao.cliente, feitos);
    falha(422, "passa_da_parte_do_cliente", `Os repasses passam da parte do cliente (${formatarCentavos(prestacao.cliente)}). Faltam ${formatarCentavos(antes.falta)}.`);
  }
  const [repasse] = await tx
    .insert(repassesDeAlvara)
    .values({ organizationId, prestacaoId, favorecido: p.favorecido, favorecidoDocumento: p.favorecidoDocumento ?? null, conta: p.conta, valor: p.valor, repassadoEm: p.repassadoEm, observacao: p.observacao ?? null, registradoPor: userId })
    .returning();
  return { repasse: repasse!, conferencia: depois };
}

export async function estornarRepasse(tx: Tx, repasseId: string, userId: string, motivo: string): Promise<{ prestacaoId: string }> {
  const [r] = await tx
    .update(repassesDeAlvara)
    .set({ estornadoEm: new Date(), estornadoPor: userId, motivoEstorno: motivo.slice(0, 300) })
    .where(and(eq(repassesDeAlvara.id, repasseId), isNull(repassesDeAlvara.estornadoEm)))
    .returning({ prestacaoId: repassesDeAlvara.prestacaoId });
  if (r) return r;
  const [existe] = await tx.select({ id: repassesDeAlvara.id }).from(repassesDeAlvara).where(eq(repassesDeAlvara.id, repasseId));
  return existe ? falha(409, "ja_estornado", "Este repasse já foi desfeito.") : falha(404, "nao_encontrado");
}

export interface AlvaraParaPrestar {
  id: string;
  descricao: string;
  valor: number;
  valorRecebido: number | null;
  sacadoEm: Dia | null;
  processo: { id: string; titulo: string };
  cliente: { id: string; nome: string } | null;
  conta: ContaDoAlvara;
  contratoTitulo: string | null;
  precisaEscolherContrato: boolean;
}

/** Os alvarás sacados que ainda esperam a prestação de contas, com a conta que o Decreta já fez de cada um. */
export async function alvarasParaPrestar(tx: Tx): Promise<AlvaraParaPrestar[]> {
  const sacados = await tx
    .select({ a: alvaras, processo: { id: processos.id, titulo: processos.titulo, clienteId: processos.clienteId }, cliente: { id: clientes.id, nome: clientes.nome } })
    .from(alvaras)
    .innerJoin(processos, eq(processos.id, alvaras.processoId))
    .leftJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(eq(alvaras.etapa, "sacado"))
    .orderBy(asc(alvaras.sacadoEm));
  if (!sacados.length) return [];
  const feitas = new Set((await tx.select({ alvaraId: prestacoesDeContas.alvaraId }).from(prestacoesDeContas).where(and(isNull(prestacoesDeContas.canceladaEm), inArray(prestacoesDeContas.alvaraId, sacados.map((s) => s.a.id))))).map((x) => x.alvaraId));
  const saida: AlvaraParaPrestar[] = [];
  for (const s of sacados) {
    if (feitas.has(s.a.id)) continue;
    const candidatos = await candidatosDoAlvara(tx, s.processo.id, s.processo.clienteId);
    const { contrato, precisaEscolher } = escolherContrato(candidatos);
    const valor = emCentavos(s.a.valor) ?? 0;
    const recebido = emCentavos(s.a.valorRecebido);
    saida.push({
      id: s.a.id,
      descricao: s.a.descricao,
      valor,
      valorRecebido: recebido,
      sacadoEm: s.a.sacadoEm,
      processo: { id: s.processo.id, titulo: s.processo.titulo },
      cliente: s.cliente?.id ? s.cliente : null,
      conta: calcularAlvara({ valorAlvara: valor, valorRecebido: recebido, exitoBp: contrato?.exitoBp ?? null }),
      contratoTitulo: contrato?.titulo ?? null,
      precisaEscolherContrato: precisaEscolher,
    });
  }
  return saida;
}
