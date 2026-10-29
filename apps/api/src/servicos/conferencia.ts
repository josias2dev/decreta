/**
 * Conferência da pasta antes de protocolar: a IA lê os documentos de quem será
 * a parte (procuração, comprovante de residência, documento com foto...) e diz
 * item por item o que está certo, o que pede atenção e o que falta.
 */
import { formatarDia, hojeEm } from "@decreta/core";
import { clientes, documentos, negocios, partes, processos, type Database, type Tx } from "@decreta/db";
import { conferirPasta, impressao, type Ia, type PedidoDeConferencia } from "@decreta/ia";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { analisar, ultimaAnalise, naTela, type AnaliseNaTela } from "./analises.ts";
import { IaDesligada } from "./prazos.ts";

export type DonoDaPasta = { negocioId: string } | { clienteId: string };

interface Deps {
  db: Database;
  ia: Ia | null;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/** Os documentos da pasta: do negócio e, se já virou cliente, os do cliente também. */
async function documentosDaPasta(tx: Tx, negocioId: string | null, clienteId: string | null) {
  const onde = [negocioId ? eq(documentos.negocioId, negocioId) : undefined, clienteId ? eq(documentos.clienteId, clienteId) : undefined].filter((x) => x !== undefined);
  if (!onde.length) return [];
  return tx
    .select({ id: documentos.id, nome: documentos.nome, texto: documentos.texto })
    .from(documentos)
    .where(and(or(...onde), isNotNull(documentos.texto)))
    .orderBy(asc(documentos.createdAt))
    .limit(40);
}

/** Processos do cliente e, para quem ainda não é cliente, os que têm uma parte com o mesmo nome. */
async function processosDaPessoa(tx: Tx, nome: string, clienteId: string | null) {
  const porParte = tx.select({ id: partes.processoId }).from(partes).where(sql`lower(${partes.nome}) = lower(${nome})`);
  return tx
    .select({ titulo: processos.titulo, cnj: processos.cnj, assunto: processos.assunto, situacao: processos.situacao })
    .from(processos)
    .where(clienteId ? or(eq(processos.clienteId, clienteId), inArray(processos.id, porParte)) : inArray(processos.id, porParte))
    .limit(30);
}

async function prepararPedido(tx: Tx, dono: DonoDaPasta, assuntoPedido: string | null, hoje: string) {
  let nome: string;
  let clienteId: string | null;
  let negocioId: string | null = null;
  let assunto = assuntoPedido;
  if ("negocioId" in dono) {
    const [n] = await tx.select().from(negocios).where(eq(negocios.id, dono.negocioId));
    if (!n) return null;
    nome = n.nome;
    clienteId = n.clienteId;
    negocioId = n.id;
    assunto ??= n.assunto;
  } else {
    clienteId = dono.clienteId;
  }
  const [cl] = clienteId ? await tx.select().from(clientes).where(eq(clientes.id, clienteId)) : [];
  if ("clienteId" in dono) {
    if (!cl) return null;
    nome = cl.nome;
  }
  const docs = await documentosDaPasta(tx, negocioId, clienteId);
  const pedido: PedidoDeConferencia = {
    pessoa: { nome: nome!, documento: cl?.documento ?? null, endereco: cl?.endereco ?? null },
    assunto,
    hoje,
    documentos: docs.map((d) => ({ nome: d.nome, texto: d.texto ?? "" })),
    processos: await processosDaPessoa(tx, nome!, clienteId),
  };
  return { pedido, docs };
}

const alvoDe = (dono: DonoDaPasta) => ("negocioId" in dono ? { alvo: "negocio" as const, alvoId: dono.negocioId } : { alvo: "cliente" as const, alvoId: dono.clienteId });

export async function conferirPastaDe(deps: Deps, organizationId: string, dono: DonoDaPasta, opcoes: { userId?: string | null; timezone: string; assunto?: string | null }): Promise<AnaliseNaTela | null> {
  const ia = deps.ia;
  if (!ia) throw new IaDesligada();
  const hoje = hojeEm(opcoes.timezone);
  return analisar<PedidoDeConferencia>(deps.db, {
    organizationId,
    ...alvoDe(dono),
    acao: "conferir-pasta",
    userId: opcoes.userId,
    log: deps.log,
    preparar: async (tx) => {
      const r = await prepararPedido(tx, dono, opcoes.assunto ?? null, hoje);
      if (!r) return null;
      const n = r.docs.length;
      return { entrada: r.pedido, base: baseDaPasta(r.docs, r.pedido.pessoa), fonte: `${n === 1 ? "1 documento" : `${n} documentos`} · ${formatarDia(hoje)}` };
    },
    executar: (pedido) => conferirPasta(ia, pedido),
  });
}

function baseDaPasta(docs: { id: string; texto: string | null }[], pessoa: PedidoDeConferencia["pessoa"]) {
  return impressao(
    docs.map((d) => [d.id, d.texto?.length ?? 0]),
    pessoa,
  );
}

/** A última conferência, marcada como desatualizada se a pasta mudou desde então. */
export async function ultimaConferencia(tx: Tx, dono: DonoDaPasta, timezone: string): Promise<AnaliseNaTela | null> {
  const { alvo, alvoId } = alvoDe(dono);
  const a = await ultimaAnalise(tx, alvo, alvoId, "conferir-pasta");
  if (!a) return null;
  const r = await prepararPedido(tx, dono, null, hojeEm(timezone));
  return naTela(a, r ? baseDaPasta(r.docs, r.pedido.pessoa) : undefined);
}
