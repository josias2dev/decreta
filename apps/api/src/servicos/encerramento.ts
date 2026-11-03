/**
 * Encerrar o escritório e apagar os dados de vez.
 *
 * O sócio encerra pela tela (dois passos, digitando o nome). O escritório fecha na
 * hora: as sessões caem, ninguém entra, a captura e o WhatsApp param (cada lugar
 * confere `encerradoEm`). Trinta dias depois, uma rotina apaga o escritório, as
 * pessoas que só eram dele e todos os arquivos. Nada de outro escritório é tocado.
 *
 * A assinatura do Decreta no Asaas sai junto. Se o Asaas falhar, o escritório fecha assim mesmo, e a
 * rotina que apaga tenta de novo: sem conseguir, não apaga, porque a linha do escritório é o único lugar com o id da assinatura.
 */
import { invitation, member, organization, session, user, verification, type Database } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import { and, eq, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { registrar } from "../auditoria.ts";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { registrarEvento, registrarEventoSemEscritorio } from "../eventos.ts";
import type { ClienteAsaas } from "./asaas.ts";
import { cancelarAssinaturaDoEncerrado } from "./cobranca.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** Quantos dias o escritório encerrado espera, sem ninguém entrar, antes de os dados serem apagados. */
export const DIAS_ATE_APAGAR = 30;
const DIA_MS = 24 * 60 * 60 * 1000;

export const diaDeApagar = (encerradoEm: Date) => new Date(encerradoEm.getTime() + DIAS_ATE_APAGAR * DIA_MS);

/** A frase que o login e as rotas dão a quem tenta entrar num escritório encerrado. */
export const AVISO_DO_ENCERRAMENTO = "Este escritório foi encerrado e os dados estão em exclusão. Se foi engano, fale com o Decreta.";

export async function escritorioEncerrado(db: Database, organizationId: string): Promise<boolean> {
  const [o] = await db.select({ encerradoEm: organization.encerradoEm }).from(organization).where(eq(organization.id, organizationId));
  return !!o?.encerradoEm;
}

export interface PedidoDeEncerramento {
  organizationId: string;
  userId: string;
  nome: string;
  ip: string | null;
  log?: Log;
  agora?: Date;
}

/**
 * Fecha o escritório: marca o dia, cancela os convites que ainda valiam e derruba
 * as sessões. Fechar de novo não muda o dia em que os dados somem.
 */
export async function encerrarEscritorio(db: Database, q: PedidoDeEncerramento): Promise<{ apagarEm: Date }> {
  const agora = q.agora ?? new Date();
  const fechou = await db.transaction(async (tx) => {
    const [linha] = await tx
      .update(organization)
      .set({ encerradoEm: agora })
      .where(and(eq(organization.id, q.organizationId), isNull(organization.encerradoEm)))
      .returning({ encerradoEm: organization.encerradoEm });
    if (!linha) return null;
    await tx.update(invitation).set({ status: "canceled" }).where(and(eq(invitation.organizationId, q.organizationId), eq(invitation.status, "pending")));
    await tx.delete(session).where(eq(session.activeOrganizationId, q.organizationId));
    return linha.encerradoEm!;
  });
  if (!fechou) {
    const [o] = await db.select({ encerradoEm: organization.encerradoEm }).from(organization).where(eq(organization.id, q.organizationId));
    return { apagarEm: diaDeApagar(o!.encerradoEm!) };
  }
  const apagarEm = diaDeApagar(fechou);
  await registrar(db, { organizationId: q.organizationId, userId: q.userId, nome: q.nome, acao: "escritorio.encerrado", detalhes: { apagarEm: apagarEm.toISOString() }, ip: q.ip }, q.log);
  await registrarEvento(db, "escritorio_encerrado", q.organizationId, q.log);
  return { apagarEm };
}

/** Cancela a assinatura ao encerrar. O Asaas fora do ar não trava quem encerra: a falha fica no log e no registro, e a rotina de apagar tenta de novo. */
export async function cancelarAssinaturaAoEncerrar(deps: { db: Database; asaas: ClienteAsaas | null; log?: Log }, q: Pick<PedidoDeEncerramento, "organizationId" | "userId" | "nome" | "ip">): Promise<void> {
  try {
    await cancelarAssinaturaDoEncerrado(deps, q.organizationId);
  } catch (err) {
    const erro = err instanceof Error ? err.message : String(err);
    deps.log?.("a assinatura do escritório encerrado não saiu do Asaas: a rotina de apagar tenta de novo", { organizationId: q.organizationId, error: erro });
    await registrar(deps.db, { organizationId: q.organizationId, userId: q.userId, nome: q.nome, acao: "plano.cancelamento_pendente", detalhes: { erro }, ip: q.ip }, deps.log);
  }
}

export interface EscritorioApagado {
  organizationId: string;
  arquivos: number;
  pessoas: number;
}

export interface ResultadoDaLimpeza {
  apagados: EscritorioApagado[];
  falhas: { organizationId: string; erro: string }[];
}

/**
 * Apaga de vez os escritórios encerrados há 30 dias ou mais: os arquivos (tudo o
 * que está em `<escritório>/`), as linhas de todas as tabelas (a exclusão do
 * escritório leva as dele em cascata) e as pessoas que não são de mais nenhum
 * escritório. A demonstração nunca entra. Se os arquivos não saírem, o escritório
 * fica inteiro no banco e a próxima rodada tenta de novo; um escritório que falha
 * não impede os outros.
 */
export async function apagarEscritoriosEncerrados(deps: { db: Database; arquivos: Armazenamento; log?: Log; asaas?: ClienteAsaas | null }, agora = new Date()): Promise<ResultadoDaLimpeza> {
  const limite = new Date(agora.getTime() - DIAS_ATE_APAGAR * DIA_MS);
  const devidos = await deps.db
    .select({ id: organization.id })
    .from(organization)
    .where(and(isNotNull(organization.encerradoEm), lte(organization.encerradoEm, limite), ne(organization.slug, SLUG_DA_DEMONSTRACAO)));
  const resultado: ResultadoDaLimpeza = { apagados: [], falhas: [] };
  for (const { id } of devidos) {
    try {
      resultado.apagados.push(await apagarEscritorio(deps, id));
    } catch (err) {
      const erro = err instanceof Error ? err.message : String(err);
      deps.log?.("escritório encerrado não foi apagado", { organizationId: id, error: erro });
      resultado.falhas.push({ organizationId: id, erro });
    }
  }
  return resultado;
}

async function apagarEscritorio(deps: { db: Database; arquivos: Armazenamento; log?: Log; asaas?: ClienteAsaas | null }, organizationId: string): Promise<EscritorioApagado> {
  const { db } = deps;
  // A assinatura antes de tudo: apagada a linha, ninguém mais acha o id dela, e o Asaas continuaria cobrando.
  await cancelarAssinaturaDoEncerrado({ db, asaas: deps.asaas ?? null }, organizationId);
  // Os arquivos primeiro: se falhar, nada do banco foi apagado, e a próxima rodada tenta de novo.
  const arquivos = await deps.arquivos.apagarPrefixo(`${organizationId}/`);
  const membros = (await db.select({ userId: member.userId }).from(member).where(eq(member.organizationId, organizationId))).map((m) => m.userId);
  const emOutros = membros.length ? new Set((await db.select({ userId: member.userId }).from(member).where(and(inArray(member.userId, membros), ne(member.organizationId, organizationId)))).map((m) => m.userId)) : new Set<string>();
  const soDele = membros.filter((id) => !emOutros.has(id));
  await db.transaction(async (tx) => {
    await tx.delete(organization).where(eq(organization.id, organizationId));
    if (soDele.length) {
      await tx.delete(user).where(inArray(user.id, soDele));
      // Os pedidos de troca de senha ainda abertos guardam o id da pessoa e não têm vínculo com ela.
      await tx.delete(verification).where(inArray(verification.value, soDele));
    }
  });
  await registrarEventoSemEscritorio(db, "escritorio_apagado", deps.log);
  deps.log?.("escritório apagado de vez", { organizationId, arquivos, pessoas: soDele.length });
  return { organizationId, arquivos, pessoas: soDele.length };
}
