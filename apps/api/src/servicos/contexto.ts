/** O que a IA lê de um processo, carregado do banco. */
import { diaDoInstante, horaLocal } from "@decreta/core";
import { clientes, documentos, movimentacoes, organization, partes, prazos, processos, publicacoes, type Tx } from "@decreta/db";
import { fonteDosAutos, impressao, textoDoProcesso, type ContextoDoProcesso, type OpcoesDoTexto } from "@decreta/ia";
import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

export interface ContextoCarregado {
  texto: string;
  /** Muda quando entra movimentação, publicação ou documento: a análise guardada fica desatualizada. */
  base: string;
  fonte: string;
  ultimoEvento: number | null;
  /** O cliente do processo recusou a IA: o texto serve para comparar a base, nunca para ir a um modelo. */
  semIa: boolean;
}

/** O cliente recusou o uso de IA (Recomendação CFOAB 001/2024, item 4.3.2): a ação para aqui, e a tela diz por quê. */
export class ClienteSemIa extends HTTPException {
  constructor() {
    const detalhe = "O cliente não autorizou o uso de IA nos casos dele. Faça esta etapa sem a IA.";
    super(403, { message: detalhe, res: Response.json({ erro: "cliente_sem_ia", detalhe }, { status: 403 }) });
  }
}

/** O processo (ou o cliente) é de quem recusou a IA? Sem cliente, a IA vale. */
export async function semIa(tx: Tx, dono: { processoId?: string | null; clienteId?: string | null }): Promise<boolean> {
  if (dono.clienteId) {
    const [c] = await tx.select({ semIa: clientes.semIa }).from(clientes).where(eq(clientes.id, dono.clienteId));
    if (c?.semIa) return true;
  }
  if (!dono.processoId) return false;
  const [p] = await tx.select({ semIa: clientes.semIa }).from(processos).innerJoin(clientes, eq(clientes.id, processos.clienteId)).where(eq(processos.id, dono.processoId));
  return !!p?.semIa;
}

/** O contexto que vai a um modelo: recusa o processo de cliente sem IA. As telas que só comparam a base usam `carregarContexto`. */
export async function contextoParaIa(tx: Tx, processoId: string, opcoes: Parameters<typeof carregarContexto>[2] = {}): Promise<ContextoCarregado | null> {
  const ctx = await carregarContexto(tx, processoId, opcoes);
  if (ctx?.semIa) throw new ClienteSemIa();
  return ctx;
}

export async function carregarContexto(
  tx: Tx,
  processoId: string,
  opcoes: { documentos?: boolean; teto?: number } & OpcoesDoTexto = {},
): Promise<ContextoCarregado | null> {
  const [p] = await tx
    .select({ processo: processos, cliente: clientes.nome, semIa: clientes.semIa, fuso: organization.timezone })
    .from(processos)
    .leftJoin(clientes, eq(clientes.id, processos.clienteId))
    .leftJoin(organization, eq(organization.id, processos.organizationId))
    .where(eq(processos.id, processoId));
  if (!p) return null;
  // O dia de cada andamento é o do escritório, como a aba Movimentações mostra (às 22h em Brasília já é amanhã em UTC).
  const fuso = p.fuso ?? "America/Sao_Paulo";
  const [pts, movs, [qtd], pubs, prz, docs] = await Promise.all([
    tx.select().from(partes).where(eq(partes.processoId, processoId)).orderBy(asc(partes.ordem)),
    tx.select().from(movimentacoes).where(eq(movimentacoes.processoId, processoId)).orderBy(desc(movimentacoes.em)).limit(120),
    tx.select({ n: count() }).from(movimentacoes).where(eq(movimentacoes.processoId, processoId)),
    tx.select().from(publicacoes).where(eq(publicacoes.processoId, processoId)).orderBy(desc(publicacoes.disponibilizadaEm)).limit(10),
    tx.select().from(prazos).where(eq(prazos.processoId, processoId)),
    opcoes.documentos
      ? tx
          .select({ id: documentos.id, nome: documentos.nome, evento: documentos.evento, texto: documentos.texto, alertas: documentos.alertas })
          .from(documentos)
          .where(and(eq(documentos.processoId, processoId), isNotNull(documentos.texto)))
          .orderBy(desc(documentos.createdAt))
          .limit(30)
      : Promise.resolve([]),
  ]);
  const ctx: ContextoDoProcesso = {
    processo: {
      cnj: p.processo.cnj,
      titulo: p.processo.titulo,
      tribunal: p.processo.tribunal,
      classe: p.processo.classe,
      assunto: p.processo.assunto,
      orgao: p.processo.orgao,
      comarca: p.processo.comarca,
      valorCausa: p.processo.valorCausa,
      poloCliente: p.processo.poloCliente,
      cliente: p.cliente,
    },
    partes: pts.map((x) => ({ nome: x.nome, polo: x.polo, papel: x.papel, cliente: x.cliente })),
    movimentacoes: movs.map((m) => ({ em: `${diaDoInstante(m.em, fuso)}T${horaLocal(m.em, fuso)}`, evento: m.evento, titulo: m.titulo, descricao: m.descricao })),
    totalDeMovimentacoes: qtd?.n ?? movs.length,
    publicacoes: pubs.map((x) => ({ id: x.id, disponibilizadaEm: x.disponibilizadaEm, publicadaEm: x.publicadaEm, tipoComunicacao: x.tipoComunicacao, tipoDocumento: x.tipoDocumento, orgao: x.orgao, texto: x.texto })),
    prazos: prz.map((x) => ({ tipo: x.tipo, fim: x.fim, situacao: x.situacao })),
    documentos: docs.map((d) => ({ id: d.id, nome: d.nome, evento: d.evento, texto: d.texto ?? "", alerta: d.alertas.length > 0 })),
  };
  const ultimoEvento = movs.reduce<number | null>((max, m) => (m.evento != null && (max == null || m.evento > max) ? m.evento : max), null);
  return {
    texto: textoDoProcesso(ctx, opcoes.teto, { andamentos: opcoes.andamentos, comoLer: opcoes.comoLer }),
    base: impressao(
      movs.map((m) => m.id),
      pubs.map((x) => x.id),
      docs.map((d) => d.id),
    ),
    fonte: fonteDosAutos(ctx.movimentacoes),
    ultimoEvento,
    semIa: !!p.semIa,
  };
}
