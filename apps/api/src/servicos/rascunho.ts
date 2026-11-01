/**
 * Rascunho pronto quando chega a intimação: confirmado o prazo, a peça que o
 * catálogo sugere para ele é gerada em segundo plano e fica em rascunho.
 * Nada é enviado nem protocolado; o advogado abre, revisa e decide.
 */
import { organization, pecas, prazos, processos, withTenant, type Database } from "@decreta/db";
import { colherChamadas, gerarPeca, pecaParaPrazo, type ChamadaDaIa, type Ia } from "@decreta/ia";
import { eq } from "drizzle-orm";
import { registrar } from "../auditoria.ts";
import { nivelNoEscritorio } from "./automacao.ts";
import { ehDemonstracao } from "./captura.ts";
import { semIa } from "./contexto.ts";
import { montarPedidoDePeca } from "./pecas.ts";
import { procedenciaDe } from "./procedencia.ts";
import { IaDesligada } from "./prazos.ts";

export type ResultadoDoRascunho =
  | { situacao: "pronto"; pecaId: string }
  | { situacao: "sem-prazo" | "nao-confirmado" | "ja-tem-peca" | "so-sugestao" | "sem-peca-sugerida" | "cliente-sem-ia" | "demonstracao" };

export interface DepsDoRascunho {
  db: Database;
  ia: Ia | null;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export async function rascunhoDoPrazo(deps: DepsDoRascunho, organizationId: string, prazoId: string): Promise<ResultadoDoRascunho> {
  const { db } = deps;
  // A demonstração não chama a IA de verdade.
  if (await ehDemonstracao(db, organizationId)) return { situacao: "demonstracao" };
  const [org] = await db.select({ nome: organization.name }).from(organization).where(eq(organization.id, organizationId));
  const preparado = await withTenant(db, organizationId, async (tx) => {
    const [prazo] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
    if (!prazo) return { situacao: "sem-prazo" as const };
    if (!prazo.confirmadoEm || prazo.situacao !== "aberto") return { situacao: "nao-confirmado" as const };
    const [existente] = await tx.select({ id: pecas.id }).from(pecas).where(eq(pecas.prazoId, prazo.id)).limit(1);
    if (existente) return { situacao: "ja-tem-peca" as const };
    // No nível de sugestão, a tela do prazo sugere a peça e a IA só escreve quando alguém pedir.
    if ((await nivelNoEscritorio(tx, organizationId, "rascunho-da-peca")) !== "automatico") return { situacao: "so-sugestao" as const };
    const tipo = pecaParaPrazo(prazo.tipo);
    if (tipo.id === "outro") return { situacao: "sem-peca-sugerida" as const };
    if (await semIa(tx, { processoId: prazo.processoId })) return { situacao: "cliente-sem-ia" as const };
    const [processo] = await tx.select().from(processos).where(eq(processos.id, prazo.processoId));
    if (!processo) return { situacao: "sem-prazo" as const };
    if (!deps.ia) throw new IaDesligada();
    const montado = await montarPedidoDePeca(db, tx, { organizationId, nomeDoEscritorio: org?.nome ?? "", quem: null, processo, prazo, tipo, instrucoes: "" });
    return { situacao: "montado" as const, prazo, processo, tipo, montado };
  });
  if (preparado.situacao !== "montado") return preparado;
  const { prazo, processo, tipo, montado } = preparado;

  const chamadas: ChamadaDaIa[] = [];
  const texto = await colherChamadas(chamadas, () => gerarPeca(deps.ia!, montado.pedido).text);
  if (!texto.trim()) throw new Error("A IA devolveu a peça vazia");
  const pecaId = await withTenant(db, organizationId, async (tx) => {
    // Alguém pode ter gerado a peça pela tela enquanto a IA escrevia: a da pessoa fica.
    const [existente] = await tx.select({ id: pecas.id }).from(pecas).where(eq(pecas.prazoId, prazo.id)).limit(1);
    if (existente) return null;
    const [linha] = await tx
      .insert(pecas)
      .values({ organizationId, processoId: processo.id, prazoId: prazo.id, tipo: tipo.id, titulo: montado.titulo, instrucoes: "", texto, textoGerado: texto, procedencia: procedenciaDe(chamadas), situacao: "rascunho", criadaPor: null, modelos: montado.modelos })
      .returning({ id: pecas.id });
    return linha!.id;
  });
  if (!pecaId) return { situacao: "ja-tem-peca" };
  await registrar(db, { organizationId, acao: "peca.preparada", detalhes: { pecaId, prazoId: prazo.id, tipo: tipo.id } }, deps.log);
  return { situacao: "pronto", pecaId };
}
