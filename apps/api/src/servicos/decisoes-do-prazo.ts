/**
 * As decisões sobre um prazo: confirmar, ajustar e confirmar, marcar cumprido, reabrir, descartar,
 * e a publicação que não gera prazo. A tela (rotas de prazos e de publicações) e o WhatsApp
 * (as propostas) chamam estas mesmas funções: a regra do que muda no banco mora num lugar só.
 *
 * Cada função roda dentro da transação do escritório (`withTenant`) e devolve o que mudou. O que
 * vem depois da transação (o registro, o marco do funil, o pedido do rascunho) é `depoisDaDecisao`.
 */
import { formatarDia, formatarDiaCurto } from "@decreta/core";
import { prazos, processos, publicacoes, type Database, type Tx } from "@decreta/db";
import { and, eq, isNull, sql } from "drizzle-orm";
import { registrar } from "../auditoria.ts";
import { registrarEvento } from "../eventos.ts";
import { baseLegalVeioDaIa, contarParaProcesso } from "./prazos.ts";

/** Quem decide: a pessoa, de qual escritório, e por onde (a tela ou o WhatsApp). */
export interface Ator {
  organizationId: string;
  userId: string;
  nome: string;
  ip: string | null;
  demonstracao: boolean;
  /** O canal entra no registro: "whatsapp" quando a decisão veio de um toque no WhatsApp. */
  canal?: "tela" | "whatsapp" | "laboratorio";
}

/** A decisão não pode ser feita: a rota devolve o status; o WhatsApp responde com o detalhe. */
export class ErroDaDecisao extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    readonly erro: string,
    readonly detalhe?: string,
  ) {
    super(detalhe ?? erro);
  }
}

const naoEncontrado = (): never => {
  throw new ErroDaDecisao(404, "nao_encontrado");
};

/** O que vem depois de decidir, fora da transação. O rascunho da peça e o marco do funil só quando houve confirmação. */
export interface DepsDaDecisao {
  db: Database;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  /** Pede o rascunho da peça do prazo confirmado (o evento `prazo.confirmado` do Inngest). */
  pedirRascunho?: (organizationId: string, prazoId: string) => Promise<void>;
}

export async function depoisDaDecisao(deps: DepsDaDecisao, ator: Ator, acao: string, detalhes: Record<string, unknown>, opcoes: { confirmou?: string } = {}): Promise<void> {
  await registrar(deps.db, { organizationId: ator.organizationId, userId: ator.userId, nome: ator.nome, acao, detalhes: ator.canal && ator.canal !== "tela" ? { ...detalhes, canal: ator.canal } : detalhes, ip: ator.ip }, deps.log);
  if (!opcoes.confirmou || ator.demonstracao) return;
  await registrarEvento(deps.db, "primeiro_prazo_confirmado", ator.organizationId, deps.log);
  await deps.pedirRascunho?.(ator.organizationId, opcoes.confirmou).catch((err) => deps.log("pedido do rascunho falhou", { prazoId: opcoes.confirmou, error: err instanceof Error ? err.message : String(err) }));
}

export type AcaoNoPrazo = "confirmar" | "cumprir" | "reabrir" | "descartar";

/**
 * Confirmar, cumprir, reabrir ou descartar. Com `soSeAinda`, confirmar só grava se ninguém confirmou
 * antes (dois toques no WhatsApp, ou a tela e o WhatsApp ao mesmo tempo, não sobrescrevem quem confirmou).
 * `ficarComEle`: quem confirma vira o responsável (o prazo que estava sem dono).
 */
export async function mudarPrazo(
  tx: Tx,
  ator: Ator,
  prazoId: string,
  acao: AcaoNoPrazo,
  opcoes: { motivo?: string | null; soSeAinda?: boolean; ficarComEle?: boolean } = {},
): Promise<{ prazo: typeof prazos.$inferSelect; mudou: boolean }> {
  const [p] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
  if (!p) return naoEncontrado();
  const agora = new Date();
  const valores: Partial<typeof prazos.$inferInsert> =
    acao === "confirmar"
      ? { confirmadoPor: ator.userId, confirmadoEm: agora, ...(opcoes.ficarComEle ? { responsavelId: ator.userId } : {}) }
      : acao === "cumprir"
        ? { situacao: "cumprido", cumpridoPor: ator.userId, cumpridoEm: agora, confirmadoPor: p.confirmadoPor ?? ator.userId, confirmadoEm: p.confirmadoEm ?? agora }
        : acao === "reabrir"
          ? { situacao: "aberto", cumpridoPor: null, cumpridoEm: null, motivoDescarte: null }
          : { situacao: "descartado", motivoDescarte: opcoes.motivo ?? null };
  const onde = acao === "confirmar" && opcoes.soSeAinda ? and(eq(prazos.id, prazoId), isNull(prazos.confirmadoEm)) : eq(prazos.id, prazoId);
  const mudados = await tx.update(prazos).set(valores).where(onde).returning({ id: prazos.id });
  if (!mudados.length) return { prazo: p, mudou: false };
  if (acao === "confirmar" && p.publicacaoId) await tx.update(publicacoes).set({ situacao: "vinculada", tratadaPor: ator.userId, tratadaEm: agora }).where(eq(publicacoes.id, p.publicacaoId));
  return { prazo: { ...p, ...valores } as typeof prazos.$inferSelect, mudou: true };
}

/** Não gera prazo: a publicação vai para Lidas, e o prazo sugerido (não confirmado) some. */
export async function publicacaoSemPrazo(tx: Tx, ator: Ator, publicacaoId: string): Promise<void> {
  const [pub] = await tx.select({ id: publicacoes.id }).from(publicacoes).where(eq(publicacoes.id, publicacaoId));
  if (!pub) return naoEncontrado();
  await tx.delete(prazos).where(and(eq(prazos.publicacaoId, publicacaoId), sql`${prazos.confirmadoEm} is null`));
  await tx.update(publicacoes).set({ situacao: "lida", tratadaPor: ator.userId, tratadaEm: new Date() }).where(eq(publicacoes.id, publicacaoId));
}

export interface ConfirmacaoPelaPublicacao {
  processoId?: string;
  tipo: string;
  fundamento?: string | null;
  fundamentoDaIa?: boolean;
  dias: number;
  contagem: "uteis" | "corridos";
  responsavelId?: string | null;
  fimManual?: string | null;
  intimadoNoSistemaEm?: string | null;
}

/** Confirma o prazo de uma publicação, contando pelo motor (ou com a data digitada). Cria o prazo se a sugestão não tinha virado prazo. */
export async function confirmarPelaPublicacao(tx: Tx, ator: Ator, publicacaoId: string, b: ConfirmacaoPelaPublicacao): Promise<{ prazoId: string; fim: string }> {
  const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
  if (!pub) return naoEncontrado();
  const processoId = b.processoId ?? pub.processoId;
  if (!processoId) throw new ErroDaDecisao(422, "sem_processo", "Vincule a publicação a um processo antes de confirmar o prazo.");
  const [proc] = await tx.select({ responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, processoId));
  if (!proc) throw new ErroDaDecisao(404, "processo_nao_encontrado");
  const conta = await contarParaProcesso(tx, ator.organizationId, processoId, { publicacao: pub.publicadaEm, intimacaoNoSistema: b.intimadoNoSistemaEm, dias: b.dias, contagem: b.contagem });
  const [existente] = await tx.select().from(prazos).where(eq(prazos.publicacaoId, pub.id));
  const valores = {
    processoId,
    tipo: b.tipo,
    fundamento: b.fundamento ?? null,
    fundamentoDaIa: baseLegalVeioDaIa(b.fundamento ?? null, b.fundamentoDaIa, existente),
    dias: b.dias,
    contagem: b.contagem,
    publicadoEm: pub.publicadaEm,
    intimadoNoSistemaEm: b.intimadoNoSistemaEm ?? null,
    inicio: conta.inicio,
    fim: b.fimManual ?? conta.fim,
    fimDigitado: !!b.fimManual,
    desconsiderados: b.fimManual ? [] : conta.desconsiderados,
    responsavelId: b.responsavelId === undefined ? (existente?.responsavelId ?? proc.responsavelId) : b.responsavelId,
    confirmadoPor: ator.userId,
    confirmadoEm: new Date(),
    observacoes: b.fimManual ? `Data final digitada à mão (a conta dava ${formatarDiaCurto(conta.fim)}).` : (existente?.observacoes ?? null),
  };
  const prazoId = existente
    ? (await tx.update(prazos).set(valores).where(eq(prazos.id, existente.id)).returning({ id: prazos.id }))[0]!.id
    : (await tx.insert(prazos).values({ organizationId: ator.organizationId, publicacaoId: pub.id, origem: "ia", ...valores }).returning({ id: prazos.id }))[0]!.id;
  await tx.update(publicacoes).set({ situacao: "vinculada", processoId, tratadaPor: ator.userId, tratadaEm: new Date() }).where(eq(publicacoes.id, pub.id));
  return { prazoId, fim: valores.fim };
}

export interface AjusteDoPrazo {
  tipo?: string;
  fundamento?: string | null;
  fundamentoDaIa?: boolean;
  dias?: number;
  contagem?: "uteis" | "corridos";
  publicadoEm?: string;
  intimadoNoSistemaEm?: string | null;
  responsavelId?: string | null;
  fimManual?: string | null;
  observacoes?: string | null;
  confirmar?: boolean;
}

/**
 * Ajustar: muda o que veio e reconta se mexeu em dias, contagem ou publicação. Ajustar também confirma.
 * Só a base legal é outra coisa: preencher o artigo não confirma o prazo nem muda a data, e quem confirmou
 * continua sendo quem confirmou. Devolve se foi só a base legal.
 */
export async function ajustarPrazo(tx: Tx, ator: Ator, prazoId: string, b: AjusteDoPrazo): Promise<{ soABase: boolean; fim: string }> {
  const [p] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
  if (!p) return naoEncontrado();
  const dias = b.dias ?? p.dias;
  const contagem = b.contagem ?? p.contagem;
  const publicadoEm = b.publicadoEm ?? p.publicadoEm;
  const intimadoNoSistemaEm = b.intimadoNoSistemaEm === undefined ? p.intimadoNoSistemaEm : b.intimadoNoSistemaEm;
  const fundamento = b.fundamento === undefined ? p.fundamento : b.fundamento;
  const fundamentoDaIa = baseLegalVeioDaIa(fundamento, b.fundamentoDaIa, p);
  // A data digitada à mão fica quando a conta não mudou e ninguém mandou outra: trocar o responsável não refaz o prazo.
  const contaIgual = dias === p.dias && contagem === p.contagem && publicadoEm === p.publicadoEm && intimadoNoSistemaEm === p.intimadoNoSistemaEm;
  const fimIgual = b.fimManual === undefined || (b.fimManual === null ? !p.fimDigitado : p.fimDigitado && b.fimManual === p.fim);
  const restoIgual = contaIgual && fimIgual && (b.tipo ?? p.tipo) === p.tipo && (b.responsavelId === undefined || b.responsavelId === p.responsavelId) && (b.observacoes === undefined || b.observacoes === p.observacoes);
  if (!b.confirmar && restoIgual && (fundamento !== p.fundamento || fundamentoDaIa !== p.fundamentoDaIa)) {
    await tx.update(prazos).set({ fundamento, fundamentoDaIa }).where(eq(prazos.id, prazoId));
    return { soABase: true, fim: p.fim };
  }
  const r = await contarParaProcesso(tx, ator.organizationId, p.processoId, { publicacao: publicadoEm, intimacaoNoSistema: intimadoNoSistemaEm, dias, contagem });
  const manterManual = b.fimManual === undefined && p.fimDigitado && contaIgual;
  const fim = manterManual ? p.fim : (b.fimManual ?? r.fim);
  await tx
    .update(prazos)
    .set({
      tipo: b.tipo ?? p.tipo,
      fundamento,
      fundamentoDaIa,
      dias,
      contagem,
      publicadoEm,
      intimadoNoSistemaEm,
      inicio: r.inicio,
      fim,
      fimDigitado: manterManual || !!b.fimManual,
      desconsiderados: manterManual ? p.desconsiderados : b.fimManual ? [] : r.desconsiderados,
      responsavelId: b.responsavelId === undefined ? p.responsavelId : b.responsavelId,
      observacoes: b.fimManual && !manterManual ? [b.observacoes ?? p.observacoes, `Data final digitada à mão (a conta dava ${formatarDia(r.fim)}).`].filter(Boolean).join(" ") : b.observacoes === undefined ? p.observacoes : b.observacoes,
      confirmadoPor: ator.userId,
      confirmadoEm: new Date(),
    })
    .where(eq(prazos.id, prazoId));
  if (p.publicacaoId) await tx.update(publicacoes).set({ situacao: "vinculada", tratadaPor: ator.userId, tratadaEm: new Date() }).where(eq(publicacoes.id, p.publicacaoId));
  return { soABase: false, fim };
}
