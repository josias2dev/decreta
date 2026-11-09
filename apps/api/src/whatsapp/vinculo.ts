/**
 * O vínculo entre o WhatsApp de uma pessoa e a conta dela no Decreta.
 *
 * Ligar: a pessoa, logada, pede um código na tela e o manda do próprio WhatsApp para o número do
 * Decreta ("DECRETA K7Q2-9XMP"). Isso prova que o número é dela (o `equipe.whatsapp` é só digitado) e
 * já abre a janela de 24 h. O código vale 10 minutos e só uma vez.
 *
 * O vínculo vence depois de 30 dias sem a pessoa abrir o app: um WhatsApp tomado por golpe não fica
 * com acesso para sempre. Abrir o Decreta logado renova (`renovarPeloUso`); vencido, o agente só manda
 * o aviso para renovar.
 */
import { createHash, randomInt } from "node:crypto";
import { estadoDoEscritorio } from "../servicos/assinatura.ts";
import { colunasDaAssinatura } from "../servicos/assinatura.ts";
import { equipe, member, organization, user, whatsappCodigos, whatsappDesconhecidos, whatsappVinculos, withTenant, type Database } from "@decreta/db";
import type { Acesso } from "@decreta/core";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";

export const VALIDADE_DO_CODIGO_MS = 10 * 60_000;
export const VALIDADE_DO_VINCULO_MS = 30 * 24 * 60 * 60_000;
/** A janela de 24 h, com folga: a mensagem que sai perto do fim pode chegar depois. */
export const JANELA_MS = 24 * 60 * 60_000 - 10 * 60_000;

/** Sem 0, O, 1, I e L: o código se lê e se digita sem confusão. */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const CODIGO_NA_MENSAGEM = /\bDECRETA\s+([2-9A-HJKMNP-Z]{4})-?([2-9A-HJKMNP-Z]{4})\b/i;

const hashDe = (texto: string) => createHash("sha256").update(texto).digest("hex");

/** O código que veio na mensagem ("decreta k7q2 9xmp" também vale), sem o hífen e em maiúsculas. */
export function codigoNaMensagem(texto: string): string | null {
  const m = CODIGO_NA_MENSAGEM.exec(texto.replace(/\s+/g, " ").trim());
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null;
}

/** O link que abre o WhatsApp com o código já escrito para o número do Decreta. */
export function linkDoCodigo(numeroDoDecreta: string, codigo: string): string {
  return `https://wa.me/${numeroDoDecreta.replace(/\D/g, "")}?text=${encodeURIComponent(`DECRETA ${codigo.slice(0, 4)}-${codigo.slice(4)}`)}`;
}

/** Um código novo para a pessoa ligar o WhatsApp a este escritório. Os anteriores dela deixam de valer. */
export async function gerarCodigo(db: Database, quem: { userId: string; organizationId: string }, agora = new Date()): Promise<{ codigo: string; expiraEm: Date }> {
  const codigo = Array.from({ length: 8 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_CODIGO_MS);
  await db.transaction(async (tx) => {
    await tx.delete(whatsappCodigos).where(and(eq(whatsappCodigos.userId, quem.userId), isNull(whatsappCodigos.usadoEm)));
    await tx.insert(whatsappCodigos).values({ hash: hashDe(codigo), userId: quem.userId, organizationId: quem.organizationId, expiraEm });
  });
  return { codigo, expiraEm };
}

export interface Remetente {
  telefone: string | null;
  bsuid: string | null;
}

export type ResultadoDoCodigo =
  | { ok: true; userId: string; organizationId: string; escritorio: string; trocouDeNumero: boolean }
  | { ok: false; motivo: "invalido" | "vencido" | "numero_de_outra_pessoa" | "sem_telefone" | "fora_do_escritorio" };

/**
 * Liga o WhatsApp de quem mandou o código. O número que já é de outra pessoa da plataforma não é tomado:
 * cada número tem um dono, e quem trocou de dono do número desliga na tela antes.
 */
export async function ligarPeloCodigo(db: Database, codigo: string, remetente: Remetente, agora = new Date()): Promise<ResultadoDoCodigo> {
  if (!remetente.telefone) return { ok: false, motivo: "sem_telefone" };
  const telefone = remetente.telefone;
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(whatsappCodigos).where(eq(whatsappCodigos.hash, hashDe(codigo))).for("update");
    if (!c || c.usadoEm) return { ok: false, motivo: "invalido" } as const;
    if (c.expiraEm.getTime() <= agora.getTime()) return { ok: false, motivo: "vencido" } as const;
    const [papel] = await tx.select({ role: member.role }).from(member).where(and(eq(member.organizationId, c.organizationId), eq(member.userId, c.userId)));
    if (!papel) return { ok: false, motivo: "fora_do_escritorio" } as const;
    const [doNumero] = await tx.select({ userId: whatsappVinculos.userId }).from(whatsappVinculos).where(eq(whatsappVinculos.telefone, telefone));
    if (doNumero && doNumero.userId !== c.userId) return { ok: false, motivo: "numero_de_outra_pessoa" } as const;
    const [antes] = await tx.select({ telefone: whatsappVinculos.telefone }).from(whatsappVinculos).where(eq(whatsappVinculos.userId, c.userId));
    // O BSUID que estava com outro vínculo (o mesmo aparelho ligado antes em outra conta) sai de lá.
    if (remetente.bsuid) await tx.update(whatsappVinculos).set({ bsuid: null }).where(and(eq(whatsappVinculos.bsuid, remetente.bsuid), sql`${whatsappVinculos.userId} <> ${c.userId}`));
    const valores = { telefone, bsuid: remetente.bsuid, organizationId: c.organizationId, verificadoEm: agora, renovarAte: new Date(agora.getTime() + VALIDADE_DO_VINCULO_MS), ultimaEntradaEm: agora, pausadoEm: null };
    await tx.insert(whatsappVinculos).values({ userId: c.userId, ...valores }).onConflictDoUpdate({ target: whatsappVinculos.userId, set: valores });
    await tx.update(whatsappCodigos).set({ usadoEm: agora }).where(eq(whatsappCodigos.id, c.id));
    const [o] = await tx.select({ nome: organization.name }).from(organization).where(eq(organization.id, c.organizationId));
    return { ok: true, userId: c.userId, organizationId: c.organizationId, escritorio: o?.nome ?? "", trocouDeNumero: !!antes && antes.telefone !== telefone } as const;
  });
}

/** Quem escreveu, já com o escritório ativo e o que pode fazer. Sem vínculo (ou com o vínculo que perdeu o escritório): nulo. */
export interface PessoaNoWhatsapp {
  vinculoId: string;
  userId: string;
  nome: string;
  apelido: string;
  cargo: string | null;
  papel: string;
  telefone: string;
  bsuid: string | null;
  organizationId: string;
  escritorio: string;
  timezone: string;
  demonstracao: boolean;
  emAvaliacao: boolean;
  /** "leitura": o escritório está só para leitura (fatura atrasada), e o agente não grava nada. */
  acesso: Acesso;
  janelaAberta: boolean;
  /** O suporte do Decreta assumiu: a mensagem fica guardada, e a IA não responde. */
  pausado: boolean;
  /** O vínculo venceu: só o aviso para renovar. */
  vencido: boolean;
  /** Até quando o vínculo vale sem a pessoa abrir o app (abrir renova). */
  renovarAte: Date;
}

/** O vínculo pelo BSUID (quando a pessoa usa nome de usuário e o telefone não vem) ou pelo telefone. */
export async function vinculoDo(db: Database, remetente: Remetente) {
  const onde = [remetente.bsuid ? eq(whatsappVinculos.bsuid, remetente.bsuid) : undefined, remetente.telefone ? eq(whatsappVinculos.telefone, remetente.telefone) : undefined].filter((x) => !!x);
  if (!onde.length) return null;
  const [v] = await db
    .select()
    .from(whatsappVinculos)
    .where(or(...onde));
  return v ?? null;
}

export async function quemE(db: Database, remetente: Remetente, opcoes: { cobrancaAtiva?: boolean; agora?: Date } = {}): Promise<PessoaNoWhatsapp | null> {
  const v = await vinculoDo(db, remetente);
  return v ? pessoaDoVinculo(db, v, opcoes) : null;
}

export async function pessoaDoUsuario(db: Database, userId: string, opcoes: { cobrancaAtiva?: boolean; agora?: Date; organizationId?: string } = {}): Promise<PessoaNoWhatsapp | null> {
  const [v] = await db.select().from(whatsappVinculos).where(eq(whatsappVinculos.userId, userId));
  return v ? pessoaDoVinculo(db, v, opcoes) : null;
}

async function pessoaDoVinculo(db: Database, v: typeof whatsappVinculos.$inferSelect, opcoes: { cobrancaAtiva?: boolean; agora?: Date; organizationId?: string }): Promise<PessoaNoWhatsapp | null> {
  const agora = opcoes.agora ?? new Date();
  const orgId = opcoes.organizationId ?? v.organizationId;
  // O escritório ativo pode ter tirado a pessoa (ou ter sido encerrado): vale o primeiro outro de que ela ainda é.
  const escritorios = await db
    .select({ id: organization.id, nome: organization.name, slug: organization.slug, encerradoEm: organization.encerradoEm, emAvaliacao: organization.emAvaliacao, papel: member.role, ...colunasDaAssinatura })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, v.userId), isNull(organization.encerradoEm)));
  const org = escritorios.find((o) => o.id === orgId) ?? (opcoes.organizationId ? undefined : escritorios[0]);
  if (!org) return null;
  if (org.id !== v.organizationId && !opcoes.organizationId) await db.update(whatsappVinculos).set({ organizationId: org.id }).where(eq(whatsappVinculos.id, v.id));
  const [u] = await db.select({ nome: user.name }).from(user).where(eq(user.id, v.userId));
  const [e] = await withTenant(db, org.id, (tx) => tx.select({ apelido: equipe.apelido, cargo: equipe.cargo }).from(equipe).where(eq(equipe.userId, v.userId)));
  const nome = u?.nome ?? "";
  return {
    vinculoId: v.id,
    userId: v.userId,
    nome,
    apelido: e?.apelido || nome.split(" ")[0] || nome,
    cargo: e?.cargo ?? null,
    papel: org.papel,
    telefone: v.telefone,
    bsuid: v.bsuid,
    organizationId: org.id,
    escritorio: org.nome,
    timezone: org.timezone,
    demonstracao: org.slug === SLUG_DA_DEMONSTRACAO,
    emAvaliacao: org.emAvaliacao,
    acesso: estadoDoEscritorio(org, !!opcoes.cobrancaAtiva).acesso,
    janelaAberta: !!v.ultimaEntradaEm && agora.getTime() - v.ultimaEntradaEm.getTime() < JANELA_MS,
    pausado: !!v.pausadoEm,
    vencido: v.renovarAte.getTime() <= agora.getTime(),
    renovarAte: v.renovarAte,
  };
}

/** Os escritórios da pessoa, para "trocar de escritório". */
export async function escritoriosDaPessoa(db: Database, userId: string): Promise<{ id: string; nome: string }[]> {
  return db
    .select({ id: organization.id, nome: organization.name })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(and(eq(member.userId, userId), isNull(organization.encerradoEm)))
    .orderBy(organization.name);
}

export async function trocarDeEscritorio(db: Database, userId: string, organizationId: string): Promise<boolean> {
  const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.userId, userId), eq(member.organizationId, organizationId)));
  if (!m) return false;
  await db.update(whatsappVinculos).set({ organizationId }).where(eq(whatsappVinculos.userId, userId));
  return true;
}

/** A mensagem que chegou: a janela de 24 h abre (ou continua aberta) a partir de agora. */
export async function registrarEntradaNoVinculo(db: Database, vinculoId: string, agora = new Date()): Promise<void> {
  await db.update(whatsappVinculos).set({ ultimaEntradaEm: agora }).where(eq(whatsappVinculos.id, vinculoId));
}

/** A Meta disse que a janela fechou (131047): a próxima mensagem já sai como modelo. */
export async function fecharJanela(db: Database, userId: string): Promise<void> {
  await db.update(whatsappVinculos).set({ ultimaEntradaEm: null }).where(eq(whatsappVinculos.userId, userId));
}

export async function renovarVinculo(db: Database, userId: string, agora = new Date()): Promise<boolean> {
  const r = await db.update(whatsappVinculos).set({ renovarAte: new Date(agora.getTime() + VALIDADE_DO_VINCULO_MS) }).where(eq(whatsappVinculos.userId, userId)).returning({ id: whatsappVinculos.id });
  return r.length > 0;
}

/**
 * Abrir o app logado renova o vínculo: é a mesma prova do toque em Renovar (a pessoa ainda tem a conta).
 * Vale também para o vínculo já vencido. Grava no máximo uma vez por dia.
 */
export async function renovarPeloUso(db: Database, userId: string, agora = new Date()): Promise<void> {
  const renovarAte = new Date(agora.getTime() + VALIDADE_DO_VINCULO_MS);
  await db
    .update(whatsappVinculos)
    .set({ renovarAte })
    .where(and(eq(whatsappVinculos.userId, userId), lt(whatsappVinculos.renovarAte, new Date(renovarAte.getTime() - 24 * 60 * 60_000))));
}

export async function desligarVinculo(db: Database, userId: string): Promise<boolean> {
  const r = await db.delete(whatsappVinculos).where(eq(whatsappVinculos.userId, userId)).returning({ id: whatsappVinculos.id });
  await db.delete(whatsappCodigos).where(eq(whatsappCodigos.userId, userId));
  return r.length > 0;
}

export async function pausarVinculo(db: Database, userId: string, pausado: boolean): Promise<boolean> {
  const r = await db.update(whatsappVinculos).set({ pausadoEm: pausado ? new Date() : null }).where(eq(whatsappVinculos.userId, userId)).returning({ id: whatsappVinculos.id });
  return r.length > 0;
}

/** O que a tela de Configurações mostra: ligado ou não, o número (com o meio escondido) e até quando vale. */
export async function estadoDoVinculo(db: Database, userId: string, agora = new Date()) {
  const [v] = await db.select().from(whatsappVinculos).where(eq(whatsappVinculos.userId, userId));
  if (!v) return { ligado: false as const };
  return { ligado: true as const, telefone: telefoneEscondido(v.telefone), organizationId: v.organizationId, verificadoEm: v.verificadoEm.toISOString(), renovarAte: v.renovarAte.toISOString(), vencido: v.renovarAte.getTime() <= agora.getTime(), pausado: !!v.pausadoEm };
}

/** "+55 47 9····-1234": o bastante para a pessoa reconhecer, sem mostrar o número inteiro. */
export function telefoneEscondido(telefone: string): string {
  const d = telefone.replace(/\D/g, "");
  if (d.length < 10) return "····";
  const ddd = d.slice(2, 4);
  return `+${d.slice(0, 2)} ${ddd} ${d.slice(4, 5)}····-${d.slice(-4)}`;
}

/** Número sem vínculo: a resposta fixa sai no máximo uma vez a cada 30 dias. Devolve se é para responder agora. */
export async function responderAoDesconhecido(db: Database, telefone: string, agora = new Date()): Promise<boolean> {
  const hash = hashDe(`desconhecido:${telefone}`);
  const desde = agora.getTime() - 30 * 24 * 60 * 60_000;
  return db.transaction(async (tx) => {
    // A resposta anterior, travada: duas mensagens seguidas do mesmo número não respondem duas vezes.
    const [antes] = await tx.select({ respondidoEm: whatsappDesconhecidos.respondidoEm }).from(whatsappDesconhecidos).where(eq(whatsappDesconhecidos.hash, hash)).for("update");
    const responder = !antes?.respondidoEm || antes.respondidoEm.getTime() < desde;
    await tx
      .insert(whatsappDesconhecidos)
      .values({ hash, respondidoEm: agora, mensagens: 1 })
      .onConflictDoUpdate({ target: whatsappDesconhecidos.hash, set: { mensagens: sql`${whatsappDesconhecidos.mensagens} + 1`, ...(responder ? { respondidoEm: agora } : {}) } });
    return responder;
  });
}

/** Os códigos vencidos e já usados saem: só servem por 10 minutos. */
export async function limparCodigos(db: Database, agora = new Date()): Promise<void> {
  await db.delete(whatsappCodigos).where(or(lt(whatsappCodigos.expiraEm, agora), sql`${whatsappCodigos.usadoEm} is not null`));
}
