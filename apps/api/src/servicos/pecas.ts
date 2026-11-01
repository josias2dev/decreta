/** O pedido de peça que vai à IA: o mesmo na tela Gerar peça e no rascunho preparado sozinho. */
import { formatarDia } from "@decreta/core";
import { analises, escritorios, prazos, processos, type Database, type Tx } from "@decreta/db";
import type { Briefing, PedidoDePeca, TipoDePeca } from "@decreta/ia";
import { and, desc, eq } from "drizzle-orm";
import { contextoParaIa } from "./contexto.ts";
import { modelosParaPeca } from "./modelos.ts";
import { pessoasDoEscritorio } from "./pessoas.ts";
import { contaDoPrazo } from "./prazos.ts";

export function briefingEmTexto(b: Briefing): string {
  return [`O que o juízo decidiu: ${b.decidiu}`, `O que fazer: ${b.fazer.join(" ")}`, `A nosso favor: ${b.aFavor.join(" ")}`, `Contra nós: ${b.contra.join(" ")}`].join("\n");
}

/** Do que é o caso, em palavras: o que a busca dos modelos compara. */
export function sobreOCaso(p: { assunto: string | null; classe: string | null; titulo: string }, tipoDoPrazo?: string): string {
  return [p.assunto, p.classe, tipoDoPrazo].filter(Boolean).join(" ");
}

export interface PedidoMontado {
  pedido: Omit<PedidoDePeca, "qualificacao">;
  /** Os modelos do escritório que a IA vai seguir. */
  modelos: string[];
  titulo: string;
}

/**
 * Monta o pedido de peça com o processo, o prazo e o briefing dele, os modelos
 * do escritório e quem assina. Recusa o processo de cliente sem IA.
 */
export async function montarPedidoDePeca(
  db: Database | Tx,
  tx: Tx,
  a: {
    organizationId: string;
    nomeDoEscritorio: string;
    /** Quem pediu; assina quando o prazo e o processo não têm responsável. */
    quem: { id: string; nome: string } | null;
    processo: typeof processos.$inferSelect;
    prazo: typeof prazos.$inferSelect | null;
    tipo: TipoDePeca;
    instrucoes: string;
  },
): Promise<PedidoMontado> {
  const { processo: p, prazo, tipo } = a;
  const [briefing] = prazo
    ? await tx.select({ conteudo: analises.conteudo }).from(analises).where(and(eq(analises.alvo, "prazo"), eq(analises.alvoId, prazo.id), eq(analises.situacao, "pronto"))).orderBy(desc(analises.createdAt)).limit(1)
    : [];
  const ctx = await contextoParaIa(tx, p.id, { documentos: true });
  const doBanco = await modelosParaPeca(tx, { tipo: tipo.id, sobre: [sobreOCaso(p, prazo?.tipo), a.instrucoes].join(" ") });
  const [esc] = await tx.select().from(escritorios).where(eq(escritorios.organizationId, a.organizationId));
  const pessoas = await pessoasDoEscritorio(db, tx, a.organizationId);
  const advogadoId = prazo?.responsavelId ?? p.responsavelId ?? a.quem?.id ?? prazo?.confirmadoPor;
  const advogado = (advogadoId ? pessoas.get(advogadoId) : undefined) ?? (a.quem ? pessoas.get(a.quem.id) : undefined);
  return {
    titulo: `${tipo.nome} · ${p.titulo.split(" × ")[0]}`,
    modelos: doBanco.map((m) => m.id),
    pedido: {
      tipo,
      instrucoes: a.instrucoes,
      prazo: prazo
        ? {
            tipo: prazo.tipo,
            fim: formatarDia(prazo.fim),
            fundamento: prazo.fundamento,
            briefing: briefing ? briefingEmTexto(briefing.conteudo as unknown as Briefing) : undefined,
            tempestividade: (await contaDoPrazo(tx, a.organizationId, prazo)).tempestividade,
          }
        : undefined,
      contextoDoProcesso: ctx?.texto ?? "",
      escritorio: { nome: esc?.timbre?.nome ?? a.nomeDoEscritorio, advogado: advogado?.nome ?? a.quem?.nome ?? "[COMPLETAR: advogado]", oab: advogado?.oab ?? null, cidade: p.comarca },
      modelos: doBanco.map((m) => ({ titulo: m.titulo, tese: m.tese, texto: m.texto })),
    },
  };
}
