/**
 * Conferência da pasta antes de protocolar: a IA lê os documentos de quem será
 * a parte (procuração, comprovante de residência, documento com foto...) e diz
 * item por item o que está certo, o que pede atenção e o que falta.
 */
import { diaDoInstante, formatarDia, hojeEm } from "@decreta/core";
import { clientes, documentos, negocios, partes, processos, type Database, type Tx } from "@decreta/db";
import { conferirPasta, impressao, type Conferencia, type Ia, type PedidoDeConferencia } from "@decreta/ia";
import { and, asc, eq, inArray, isNotNull, isNull, notInArray, or, sql } from "drizzle-orm";
import { analisar, ultimaAnalise, naTela, type AnaliseNaTela } from "./analises.ts";
import { ClienteSemIa, semIa } from "./contexto.ts";
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
  // Processo de cliente que recusou a IA não entra, nem quando o nome da parte bate.
  const semIa = tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.semIa, true));
  return tx
    .select({ titulo: processos.titulo, cnj: processos.cnj, assunto: processos.assunto, situacao: processos.situacao })
    .from(processos)
    .where(and(clienteId ? or(eq(processos.clienteId, clienteId), inArray(processos.id, porParte)) : inArray(processos.id, porParte), or(isNull(processos.clienteId), notInArray(processos.clienteId, semIa))))
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
  // O termo de uso de IA é do cliente: quem ainda está na triagem não tem.
  const [doTermo] = cl?.termoIaDocumentoId ? await tx.select({ nome: documentos.nome }).from(documentos).where(eq(documentos.id, cl.termoIaDocumentoId)) : [];
  const termo: TermoNaPasta | null = cl ? { assinado: doTermo && cl.termoIaEm ? { em: cl.termoIaEm, nome: doTermo.nome } : null } : null;
  return { pedido, docs, clienteId, termo };
}

interface TermoNaPasta {
  assinado: { em: Date; nome: string } | null;
}

/**
 * O item do termo de uso de IA (Recomendação CFOAB 001/2024, item 4.3.1) sai do
 * cadastro, não da IA: ela não tem como saber se a assinatura foi registrada.
 */
function itemDoTermo(t: TermoNaPasta, timezone: string) {
  return t.assinado
    ? { item: "termo_ia" as const, situacao: "certo" as const, detalhe: `Assinado e registrado em ${formatarDia(diaDoInstante(t.assinado.em, timezone))}.`, documento: t.assinado.nome }
    : { item: "termo_ia" as const, situacao: "falta" as const, detalhe: "O cliente ainda não assinou o termo de uso de IA (Recomendação CFOAB 001/2024, item 4.3.1). Baixe o termo na ficha do cliente e registre o assinado.", documento: null };
}

/** A conferência com o item do termo como o cadastro diz agora: registrar ou apagar o termo aparece na hora, sem outra chamada à IA. */
type ConferenciaComTermo = Omit<Conferencia, "itens"> & { itens: (Conferencia["itens"][number] | ReturnType<typeof itemDoTermo>)[] };
const comTermo = (c: ConferenciaComTermo, t: TermoNaPasta, timezone: string): ConferenciaComTermo => ({ ...c, itens: [...c.itens.filter((i) => i.item !== "termo_ia"), itemDoTermo(t, timezone)] });

const alvoDe = (dono: DonoDaPasta) => ("negocioId" in dono ? { alvo: "negocio" as const, alvoId: dono.negocioId } : { alvo: "cliente" as const, alvoId: dono.clienteId });

export async function conferirPastaDe(deps: Deps, organizationId: string, dono: DonoDaPasta, opcoes: { userId?: string | null; timezone: string; assunto?: string | null }): Promise<AnaliseNaTela | null> {
  const ia = deps.ia;
  if (!ia) throw new IaDesligada();
  const hoje = hojeEm(opcoes.timezone);
  return analisar<{ pedido: PedidoDeConferencia; termo: TermoNaPasta | null }>(deps.db, {
    organizationId,
    ...alvoDe(dono),
    acao: "conferir-pasta",
    userId: opcoes.userId,
    log: deps.log,
    preparar: async (tx) => {
      const r = await prepararPedido(tx, dono, opcoes.assunto ?? null, hoje);
      if (!r) return null;
      if (await semIa(tx, { clienteId: r.clienteId })) throw new ClienteSemIa();
      const n = r.docs.length;
      return { entrada: { pedido: r.pedido, termo: r.termo }, base: baseDaPasta(r), fonte: `${n === 1 ? "1 documento" : `${n} documentos`} · ${formatarDia(hoje)}` };
    },
    executar: async ({ pedido, termo }) => {
      const c = await conferirPasta(ia, pedido);
      return termo ? comTermo(c, termo, opcoes.timezone) : c;
    },
  });
}

/** O termo fica fora da impressão: o item dele é refeito pelo cadastro a cada leitura. */
function baseDaPasta({ docs, pedido }: { docs: { id: string; texto: string | null }[]; pedido: PedidoDeConferencia }) {
  return impressao(
    docs.map((d) => [d.id, d.texto?.length ?? 0]),
    pedido.pessoa,
  );
}

/** A impressão da pasta como está agora: a conferência gravada com ela não aparece como desatualizada. */
export async function baseDaPastaAgora(tx: Tx, dono: DonoDaPasta, timezone: string): Promise<{ base: string; documentos: number } | null> {
  const r = await prepararPedido(tx, dono, null, hojeEm(timezone));
  return r ? { base: baseDaPasta(r), documentos: r.docs.length } : null;
}

/** A última conferência, marcada como desatualizada se a pasta mudou desde então. */
export async function ultimaConferencia(tx: Tx, dono: DonoDaPasta, timezone: string): Promise<AnaliseNaTela | null> {
  const { alvo, alvoId } = alvoDe(dono);
  const a = await ultimaAnalise(tx, alvo, alvoId, "conferir-pasta");
  if (!a) return null;
  const r = await prepararPedido(tx, dono, null, hojeEm(timezone));
  const tela = naTela(a, r ? baseDaPasta(r) : undefined);
  return tela && r?.termo && tela.situacao === "pronto" ? { ...tela, conteudo: comTermo(tela.conteudo as ConferenciaComTermo, r.termo, timezone) } : tela;
}
