/** O que a IA lê de um processo, carregado do banco. */
import { clientes, documentos, movimentacoes, partes, prazos, processos, publicacoes, type Tx } from "@decreta/db";
import { fonteDosAutos, impressao, textoDoProcesso, type ContextoDoProcesso } from "@decreta/ia";
import { asc, desc, eq, isNotNull, and } from "drizzle-orm";

export interface ContextoCarregado {
  texto: string;
  /** Muda quando entra movimentação, publicação ou documento: a análise guardada fica desatualizada. */
  base: string;
  fonte: string;
  ultimoEvento: number | null;
}

export async function carregarContexto(tx: Tx, processoId: string, opcoes: { documentos?: boolean } = {}): Promise<ContextoCarregado | null> {
  const [p] = await tx
    .select({ processo: processos, cliente: clientes.nome })
    .from(processos)
    .leftJoin(clientes, eq(clientes.id, processos.clienteId))
    .where(eq(processos.id, processoId));
  if (!p) return null;
  const [pts, movs, pubs, prz, docs] = await Promise.all([
    tx.select().from(partes).where(eq(partes.processoId, processoId)).orderBy(asc(partes.ordem)),
    tx.select().from(movimentacoes).where(eq(movimentacoes.processoId, processoId)).orderBy(desc(movimentacoes.em)).limit(120),
    tx.select().from(publicacoes).where(eq(publicacoes.processoId, processoId)).orderBy(desc(publicacoes.disponibilizadaEm)).limit(10),
    tx.select().from(prazos).where(eq(prazos.processoId, processoId)),
    opcoes.documentos
      ? tx
          .select({ id: documentos.id, nome: documentos.nome, evento: documentos.evento, texto: documentos.texto })
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
    movimentacoes: movs.map((m) => ({ em: m.em.toISOString(), evento: m.evento, titulo: m.titulo, descricao: m.descricao })),
    publicacoes: pubs.map((x) => ({ disponibilizadaEm: x.disponibilizadaEm, publicadaEm: x.publicadaEm, tipoComunicacao: x.tipoComunicacao, tipoDocumento: x.tipoDocumento, orgao: x.orgao, texto: x.texto })),
    prazos: prz.map((x) => ({ tipo: x.tipo, fim: x.fim, situacao: x.situacao })),
    documentos: docs.map((d) => ({ nome: d.nome, evento: d.evento, texto: d.texto ?? "" })),
  };
  const ultimoEvento = movs.reduce<number | null>((max, m) => (m.evento != null && (max == null || m.evento > max) ? m.evento : max), null);
  return {
    texto: textoDoProcesso(ctx),
    base: impressao(
      movs.map((m) => m.id),
      pubs.map((x) => x.id),
      docs.map((d) => d.id),
    ),
    fonte: fonteDosAutos(ctx.movimentacoes),
    ultimoEvento,
  };
}
