/**
 * Financeiro: honorários por caso (contratos, parcelas e pagamentos) e o resumo do que há a receber,
 * recebido e em atraso. Só os sócios e quem eles liberarem na Equipe entram aqui. Valores em
 * centavos inteiros, sempre.
 */
import { ehDia, formatarBasePontos, hojeEm, MAXIMO_DE_PARCELAS, planejarParcelas, resumirFinanceiro, TETO_EM_CENTAVOS, vencimentosMensais, type ParcelaParaResumo } from "@decreta/core";
import { clientes, contratosHonorarios, parcelasHonorarios, processos } from "@decreta/db";
import { and, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { cancelarCobranca } from "../servicos/cobranca-de-honorarios.ts";
import {
  cancelarParcela,
  contratoDoEscritorio,
  contratosDe,
  criarContrato,
  estornarPagamento,
  exigirDocumentoDoEscritorio,
  pagamentosSemParcela,
  parcelaNaTela,
  parcelasNaTela,
  processosSemHonorario,
  registrarPagamento,
  type ParcelaNaTela,
} from "../servicos/honorarios.ts";
import { alvarasParaPrestar } from "../servicos/prestacao.ts";
import { lembretesParaAprovar } from "../servicos/regua.ts";
import { corpo, exigirFinanceiro, falha, id, ip, queryId, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const dia = z.string().refine(ehDia, "Data inválida.");
const centavos = z.number().int().min(1).max(TETO_EM_CENTAVOS);
const pontosBase = z.number().int().min(1).max(10_000);

const NOVO_CONTRATO = z.object({
  clienteId: z.string().uuid().nullable().optional(),
  processoId: z.string().uuid().nullable().optional(),
  titulo: z.string().trim().max(300).nullable().optional(),
  tipo: z.enum(["fixo", "mensal", "exito", "hibrido"]),
  fixo: z.object({ valor: centavos, parcelas: z.number().int().min(1).max(MAXIMO_DE_PARCELAS), primeiroVencimento: dia }).optional(),
  mensal: z.object({ valor: centavos, meses: z.number().int().min(1).max(MAXIMO_DE_PARCELAS), primeiroVencimento: dia }).optional(),
  exitoBp: pontosBase.optional(),
  inicio: dia.optional(),
  observacoes: z.string().max(3000).nullable().optional(),
  documentoId: z.string().uuid().nullable().optional(),
});

const FORMAS = ["pix", "boleto", "cartao", "transferencia", "dinheiro", "retido_no_alvara", "outro"] as const;

type Contratos = Awaited<ReturnType<typeof contratosDe>>;

const paraResumo = (p: ParcelaNaTela): ParcelaParaResumo => ({ id: p.id, valor: p.valor, vencimento: p.vencimento, pago: p.pago, cancelada: p.situacao === "cancelada", clienteId: p.cliente?.id ?? null, processoId: p.processo?.id ?? null });

/** O contrato como a tela mostra: o que foi combinado, de quem é e quanto há a receber, recebido e em atraso. */
function contratoNaTela({ c, cliente, processo }: Contratos[number], parcelas: ParcelaNaTela[], hoje: string) {
  const dele = parcelas.filter((p) => p.contratoId === c.id);
  const r = resumirFinanceiro(dele.map(paraResumo), hoje);
  return {
    id: c.id,
    titulo: c.titulo,
    tipo: c.tipo,
    situacao: c.situacao,
    valorFixo: c.valorFixo,
    mensalidade: c.mensalidade,
    exitoBp: c.exitoBp,
    exitoRotulo: c.exitoBp ? formatarBasePontos(c.exitoBp) : null,
    inicio: c.inicio,
    observacoes: c.observacoes,
    documentoId: c.documentoId,
    cliente: cliente?.id ? cliente : null,
    processo: processo?.id ? processo : null,
    pixAutomatico: c.pixAutomaticoId ? { situacao: c.pixAutomaticoSituacao, qr: c.pixAutomaticoSituacao === "CREATED" ? c.pixAutomaticoQr : null } : null,
    totais: { aReceber: r.aReceber, recebido: r.recebido, emAtraso: r.emAtraso },
    parcelas: dele,
  };
}

export function rotasDoFinanceiro(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const auditar = (c: C, acao: string, detalhes: Record<string, unknown>) => registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes, ip: ip(c) }, deps.log);
  const daCobranca = { db, cofre: deps.cofre, fetch: deps.fetchDosProvedores, log: deps.log, enderecoDaApi: deps.enderecoDaApi };

  /** O Financeiro: o que há a receber, o recebido e o atraso, por mês, cliente e processo, com as parcelas e o que espera uma pessoa. */
  app.get("/financeiro", async (c) => {
    await exigirFinanceiro(c, deps);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const parcelas = await parcelasNaTela(tx, hoje);
      const resumo = resumirFinanceiro(parcelas.map(paraResumo), hoje);
      const [alvarasAPrestar, semHonorario, lembretes, semParcela] = await Promise.all([alvarasParaPrestar(tx), processosSemHonorario(tx), lembretesParaAprovar(tx), pagamentosSemParcela(tx)]);
      return c.json({ hoje, resumo, parcelas, alvarasParaPrestar: alvarasAPrestar, semHonorario, lembretesParaAprovar: lembretes, pagamentosSemParcela: semParcela });
    });
  });

  /** A aba financeira de um cliente: os contratos dele e as parcelas. */
  app.get("/financeiro/clientes/:id", async (c) => {
    await exigirFinanceiro(c, deps);
    const clienteId = id(c);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const [cl] = await tx.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      const contratos = await contratosDe(tx, { clienteId });
      const parcelas = await parcelasNaTela(tx, hoje, { contratoIds: contratos.map((x) => x.c.id), comCanceladas: true });
      const resumo = resumirFinanceiro(parcelas.map(paraResumo), hoje);
      return c.json({ cliente: cl, resumo, contratos: contratos.map((x) => contratoNaTela(x, parcelas, hoje)) });
    });
  });

  /** A aba financeira de um processo: os contratos do processo e os do cliente que valem para ele, e o aviso "sem honorário". */
  app.get("/financeiro/processos/:id", async (c) => {
    await exigirFinanceiro(c, deps);
    const processoId = id(c);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const [proc] = await tx.select({ id: processos.id, titulo: processos.titulo, situacao: processos.situacao, clienteId: processos.clienteId, dispensado: processos.honorarioDispensadoEm }).from(processos).where(eq(processos.id, processoId));
      if (!proc) falha(404, "nao_encontrado");
      const doProcesso = await contratosDe(tx, { processoId });
      const doCliente = proc.clienteId ? (await contratosDe(tx, { clienteId: proc.clienteId })).filter((x) => !x.c.processoId) : [];
      const contratos = [...doProcesso, ...doCliente];
      const parcelas = await parcelasNaTela(tx, hoje, { contratoIds: contratos.map((x) => x.c.id), comCanceladas: true });
      const resumo = resumirFinanceiro(parcelas.map(paraResumo), hoje);
      const semContrato = !contratos.some((x) => x.c.situacao !== "cancelado");
      return c.json({
        processo: { id: proc.id, titulo: proc.titulo },
        resumo,
        contratos: contratos.map((x) => contratoNaTela(x, parcelas, hoje)),
        /** O aviso discreto: o processo está em andamento e não tem honorário, e ninguém o dispensou. */
        semHonorario: semContrato && !proc.dispensado && (proc.situacao === "ativo" || proc.situacao === "suspenso"),
        dispensado: !!proc.dispensado,
      });
    });
  });

  /** Dispensa (ou traz de volta) o aviso "processo sem honorário" de um processo. */
  app.put("/financeiro/processos/:id/aviso", async (c) => {
    await exigirFinanceiro(c, deps);
    const processoId = id(c);
    const b = await corpo(c, z.object({ dispensar: z.boolean() }));
    const r = await tenant(c, deps, (tx) => tx.update(processos).set({ honorarioDispensadoEm: b.dispensar ? new Date() : null }).where(eq(processos.id, processoId)).returning({ id: processos.id }));
    if (!r.length) falha(404, "nao_encontrado");
    await auditar(c, b.dispensar ? "honorario.aviso_dispensado" : "honorario.aviso_de_volta", { processoId });
    return c.json({ ok: true });
  });

  /* ---------------- Contratos ---------------- */

  app.get("/financeiro/contratos", async (c) => {
    await exigirFinanceiro(c, deps);
    const clienteId = queryId(c, "cliente");
    const processoId = queryId(c, "processo");
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const contratos = await contratosDe(tx, { clienteId, processoId });
      const parcelas = await parcelasNaTela(tx, hoje, { contratoIds: contratos.map((x) => x.c.id), comCanceladas: true });
      return c.json({ itens: contratos.map((x) => contratoNaTela(x, parcelas, hoje)) });
    });
  });

  app.post("/financeiro/contratos", async (c) => {
    await exigirFinanceiro(c, deps);
    const b = await corpo(c, NOVO_CONTRATO);
    const hoje = hojeEm(c.get("timezone"));
    const contratoId = await tenant(c, deps, async (tx) => {
      const contrato = await criarContrato(tx, c.get("orgId"), c.get("userId"), { ...b, inicio: b.inicio ?? hoje });
      return contrato.id;
    });
    await auditar(c, "contrato.criado", { contratoId, tipo: b.tipo, clienteId: b.clienteId ?? null, processoId: b.processoId ?? null });
    return c.json(await contratoDetalhado(c, contratoId, hoje), 201);
  });

  async function contratoDetalhado(c: C, contratoId: string, hoje: string) {
    return tenant(c, deps, async (tx) => {
      const [linha] = await contratosDe(tx, { id: contratoId });
      if (!linha) falha(404, "nao_encontrado");
      const parcelas = await parcelasNaTela(tx, hoje, { contratoId, comCanceladas: true });
      return contratoNaTela(linha, parcelas, hoje);
    });
  }

  app.get("/financeiro/contratos/:id", async (c) => {
    await exigirFinanceiro(c, deps);
    return c.json(await contratoDetalhado(c, id(c), hojeEm(c.get("timezone"))));
  });

  app.put("/financeiro/contratos/:id", async (c) => {
    await exigirFinanceiro(c, deps);
    const contratoId = id(c);
    const b = await corpo(c, z.object({ titulo: z.string().trim().min(2).max(300).optional(), observacoes: z.string().max(3000).nullable().optional(), documentoId: z.string().uuid().nullable().optional(), exitoBp: pontosBase.optional() }));
    await tenant(c, deps, async (tx) => {
      const atual = await contratoDoEscritorio(tx, contratoId);
      if (b.exitoBp !== undefined && !atual.exitoBp) falha(422, "sem_exito", "Este contrato não tem honorário de êxito.");
      if (b.documentoId) await exigirDocumentoDoEscritorio(tx, b.documentoId);
      await tx.update(contratosHonorarios).set(Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined))).where(eq(contratosHonorarios.id, contratoId));
      // O êxito que ainda não tem valor mostra o percentual novo; o que já virou valor guarda o percentual de quando foi calculado.
      if (b.exitoBp !== undefined && b.exitoBp !== atual.exitoBp) {
        await tx
          .update(parcelasHonorarios)
          .set({ descricao: `Honorário de êxito (${formatarBasePontos(b.exitoBp)})` })
          .where(and(eq(parcelasHonorarios.contratoId, contratoId), eq(parcelasHonorarios.tipo, "exito"), isNull(parcelasHonorarios.valor), isNull(parcelasHonorarios.canceladaEm)));
      }
    });
    await auditar(c, "contrato.alterado", { contratoId, campos: Object.keys(b) });
    return c.json(await contratoDetalhado(c, contratoId, hojeEm(c.get("timezone"))));
  });

  /** Encerra o contrato (o trabalho acabou): as parcelas seguem como estão. Cancelar também cancela as parcelas que ninguém pagou. */
  app.post("/financeiro/contratos/:id/:situacao{encerrar|cancelar}", async (c) => {
    await exigirFinanceiro(c, deps);
    const contratoId = id(c);
    const cancelar = c.req.param("situacao") === "cancelar";
    const b = await corpo(c, z.object({ motivo: z.string().trim().max(300).optional() }));
    const hoje = hojeEm(c.get("timezone"));
    // As cobranças saem do Asaas antes: se alguma não sair, a pessoa sabe e tenta de novo, em vez de ficar um link de pagamento vivo de um contrato cancelado.
    if (cancelar) {
      const comCobranca = await tenant(c, deps, async (tx) => {
        const atual = await contratoDoEscritorio(tx, contratoId);
        if (atual.situacao !== "ativo") falha(409, "ja_fechado", "Este contrato já foi encerrado ou cancelado.");
        return (await parcelasNaTela(tx, hoje, { contratoId })).filter((x) => x.pago === 0 && x.cobranca);
      });
      for (const p of comCobranca) await cancelarCobranca(daCobranca, c.get("orgId"), p.id);
    }
    await tenant(c, deps, async (tx) => {
      const atual = await contratoDoEscritorio(tx, contratoId);
      if (atual.situacao !== "ativo") falha(409, "ja_fechado", "Este contrato já foi encerrado ou cancelado.");
      await tx.update(contratosHonorarios).set({ situacao: cancelar ? "cancelado" : "encerrado" }).where(eq(contratosHonorarios.id, contratoId));
      if (!cancelar) return;
      for (const p of (await parcelasNaTela(tx, hoje, { contratoId })).filter((x) => x.pago === 0)) await cancelarParcela(tx, p.id, b.motivo || "Contrato cancelado.");
    });
    await auditar(c, cancelar ? "contrato.cancelado" : "contrato.encerrado", { contratoId });
    return c.json(await contratoDetalhado(c, contratoId, hoje));
  });

  /** Uma parcela avulsa (uma despesa combinada, um complemento), ou mais mensalidades a partir da última. */
  app.post("/financeiro/contratos/:id/parcelas", async (c) => {
    await exigirFinanceiro(c, deps);
    const contratoId = id(c);
    const b = await corpo(
      c,
      z.union([
        z.object({ tipo: z.literal("avulso"), descricao: z.string().trim().min(2).max(300), valor: centavos, vencimento: dia }),
        z.object({ tipo: z.literal("mensal"), meses: z.number().int().min(1).max(MAXIMO_DE_PARCELAS), primeiroVencimento: dia.optional() }),
      ]),
    );
    const hoje = hojeEm(c.get("timezone"));
    await tenant(c, deps, async (tx) => {
      const contrato = await contratoDoEscritorio(tx, contratoId);
      if (contrato.situacao === "cancelado") falha(409, "contrato_cancelado", "Este contrato foi cancelado.");
      const existentes = await parcelasNaTela(tx, hoje, { contratoId, comCanceladas: true });
      if (b.tipo === "avulso") {
        const numero = Math.max(0, ...existentes.filter((p) => p.tipo === "avulso").map((p) => p.numero)) + 1;
        await tx.insert(parcelasHonorarios).values({ organizationId: c.get("orgId"), contratoId, tipo: "avulso", numero, descricao: b.descricao, valor: b.valor, vencimento: b.vencimento });
        return;
      }
      if (!contrato.mensalidade) falha(422, "sem_mensalidade", "Este contrato não tem mensalidade.");
      const ultima = existentes.filter((p) => p.tipo === "mensal" && p.vencimento).map((p) => p.vencimento!).sort().at(-1);
      const primeiro = b.primeiroVencimento ?? (ultima ? vencimentosMensais(ultima, 2)[1]! : hoje);
      const novas = planejarParcelas({ tipo: "mensal", mensal: { valor: contrato.mensalidade, meses: b.meses, primeiroVencimento: primeiro } });
      const numero = Math.max(0, ...existentes.filter((p) => p.tipo === "mensal").map((p) => p.numero));
      await tx.insert(parcelasHonorarios).values(novas.map((n, i) => ({ organizationId: c.get("orgId"), contratoId, tipo: n.tipo, numero: numero + i + 1, descricao: n.descricao, valor: n.valor, vencimento: n.vencimento })));
    });
    await auditar(c, "parcela.criada", { contratoId, tipo: b.tipo });
    return c.json(await contratoDetalhado(c, contratoId, hoje), 201);
  });

  /* ---------------- Parcelas e pagamentos ---------------- */

  /** Valor e vencimento mudam enquanto não há cobrança emitida: a cobrança no Asaas leva o valor e a data de quando nasceu. */
  app.put("/financeiro/parcelas/:id", async (c) => {
    await exigirFinanceiro(c, deps);
    const parcelaId = id(c);
    const b = await corpo(c, z.object({ descricao: z.string().trim().min(2).max(300).optional(), valor: centavos.optional(), vencimento: dia.nullable().optional() }));
    const hoje = hojeEm(c.get("timezone"));
    await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(parcelasHonorarios).where(eq(parcelasHonorarios.id, parcelaId)).for("update");
      if (!p) falha(404, "nao_encontrado");
      if (p.canceladaEm) falha(409, "parcela_cancelada", "Esta parcela foi cancelada.");
      if (p.cobrancaId && (b.valor !== undefined || b.vencimento !== undefined)) falha(409, "tem_cobranca", "Esta parcela já tem uma cobrança emitida. Cancele a cobrança antes de mudar o valor ou o vencimento.");
      const atual = await parcelaNaTela(tx, hoje, parcelaId);
      if (b.valor !== undefined && b.valor < atual.pago) falha(422, "abaixo_do_pago", "O valor não pode ficar abaixo do que já foi pago.");
      await tx.update(parcelasHonorarios).set(Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined))).where(eq(parcelasHonorarios.id, parcelaId));
    });
    await auditar(c, "parcela.alterada", { parcelaId, campos: Object.keys(b) });
    return c.json(await tenant(c, deps, (tx) => parcelaNaTela(tx, hoje, parcelaId)));
  });

  app.post("/financeiro/parcelas/:id/cancelar", async (c) => {
    await exigirFinanceiro(c, deps);
    const parcelaId = id(c);
    const b = await corpo(c, z.object({ motivo: z.string().trim().max(300).optional() }));
    const hoje = hojeEm(c.get("timezone"));
    // A cobrança sai do Asaas antes: se não sair, a parcela fica como estava e a pessoa sabe, em vez de ficar um link de pagamento vivo de uma parcela cancelada.
    // Parcela com pagamento ou já cancelada não tem o que cancelar: a recusa vem de cancelarParcela, sem mexer no Asaas.
    const p = await tenant(c, deps, (tx) => parcelaNaTela(tx, hoje, parcelaId));
    if (p.cobranca && p.pago === 0 && p.situacao !== "cancelada") await cancelarCobranca(daCobranca, c.get("orgId"), parcelaId);
    await tenant(c, deps, (tx) => cancelarParcela(tx, parcelaId, b.motivo || "Cancelada pela equipe."));
    await auditar(c, "parcela.cancelada", { parcelaId });
    return c.json(await tenant(c, deps, (tx) => parcelaNaTela(tx, hoje, parcelaId)));
  });

  /**
   * A baixa à mão: "recebido" só existe depois que uma pessoa marca o pagamento, com a data (que não pode ser de
   * amanhã) e o valor. Sem o valor, vale o que falta da parcela.
   */
  app.post("/financeiro/parcelas/:id/pagamentos", async (c) => {
    await exigirFinanceiro(c, deps);
    const parcelaId = id(c);
    const b = await corpo(c, z.object({ valor: centavos.optional(), pagoEm: dia, forma: z.enum(FORMAS).default("outro"), observacao: z.string().trim().max(500).nullable().optional() }));
    const hoje = hojeEm(c.get("timezone"));
    if (b.pagoEm > hoje) falha(422, "pago_no_futuro", "A data do pagamento não pode ser de amanhã em diante.");
    const { pagamentoId, parcela } = await tenant(c, deps, async (tx) => {
      const atual = await parcelaNaTela(tx, hoje, parcelaId);
      const valor = b.valor ?? atual.falta;
      if (!valor) falha(409, "ja_paga", atual.valor === null ? "Esta parcela ainda não tem valor." : "Esta parcela já está paga.");
      const g = await registrarPagamento(tx, c.get("orgId"), { parcelaId, valor, pagoEm: b.pagoEm, forma: b.forma, origem: "manual", observacao: b.observacao ?? null, registradoPor: c.get("userId") });
      return { pagamentoId: g!.id, parcela: await parcelaNaTela(tx, hoje, parcelaId) };
    });
    await auditar(c, "pagamento.registrado", { parcelaId, pagamentoId, forma: b.forma });
    return c.json(parcela, 201);
  });

  app.post("/financeiro/pagamentos/:id/estornar", async (c) => {
    await exigirFinanceiro(c, deps);
    const pagamentoId = id(c);
    const b = await corpo(c, z.object({ motivo: z.string().trim().min(3).max(300) }));
    const hoje = hojeEm(c.get("timezone"));
    const parcela = await tenant(c, deps, async (tx) => {
      const g = await estornarPagamento(tx, pagamentoId, { userId: c.get("userId"), motivo: b.motivo });
      return parcelaNaTela(tx, hoje, g.parcelaId);
    });
    await auditar(c, "pagamento.estornado", { pagamentoId, parcelaId: parcela.id });
    return c.json(parcela);
  });
}
