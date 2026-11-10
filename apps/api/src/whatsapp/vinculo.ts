/**
 * O vínculo entre o WhatsApp de uma pessoa e a conta dela no Decreta.
 *
 * Ligar: a pessoa, logada, digita o número na tela; o código de 6 dígitos chega no WhatsApp dele (o modelo
 * de autenticação da Meta, com o botão de copiar) e ela digita o código na tela. Isso prova que o número é
 * dela (o `equipe.whatsapp` é só digitado). O código vale 10 minutos, uma vez, e para depois de 5 erros.
 * A janela de 24 h não abre ao ligar: abre na primeira mensagem dela, que traz as boas-vindas.
 *
 * O vínculo vence depois de 30 dias sem a pessoa abrir o app: um WhatsApp tomado por golpe não fica
 * com acesso para sempre. Abrir o Decreta logado renova (`renovarPeloUso`); vencido, o agente só manda
 * o aviso para renovar.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { estadoDoEscritorio } from "../servicos/assinatura.ts";
import { colunasDaAssinatura } from "../servicos/assinatura.ts";
import { equipe, member, organization, user, whatsappCodigos, whatsappDesconhecidos, whatsappVinculos, withTenant, type Database } from "@decreta/db";
import type { Acesso } from "@decreta/core";
import { and, desc, eq, isNull, lt, ne, or, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";

export const VALIDADE_DO_CODIGO_MS = 10 * 60_000;
export const TENTATIVAS_DO_CODIGO = 5;
export const VALIDADE_DO_VINCULO_MS = 30 * 24 * 60 * 60_000;
/** A janela de 24 h, com folga: a mensagem que sai perto do fim pode chegar depois. */
export const JANELA_MS = 24 * 60 * 60_000 - 10 * 60_000;

const hashDe = (texto: string) => createHash("sha256").update(texto).digest("hex");
const hashDoCodigo = (userId: string, codigo: string) => hashDe(`${userId}:${codigo}`);

/** O número já é de outra pessoa da plataforma: cada número tem um dono, e quem trocou de dono desliga na tela antes. */
async function numeroDeOutraPessoa(db: Pick<Database, "select">, telefone: string, userId: string): Promise<boolean> {
  const [v] = await db.select({ id: whatsappVinculos.id }).from(whatsappVinculos).where(and(eq(whatsappVinculos.telefone, telefone), ne(whatsappVinculos.userId, userId)));
  return !!v;
}

/**
 * Um código novo de 6 dígitos para o número (55 + DDD + número). Os anteriores da pessoa deixam de valer.
 * Quem manda é a rota: aqui só nasce e fica guardado o hash.
 */
export async function gerarCodigo(db: Database, quem: { userId: string; organizationId: string }, telefone: string, agora = new Date()): Promise<{ ok: true; codigo: string; expiraEm: Date } | { ok: false; motivo: "numero_de_outra_pessoa" }> {
  if (await numeroDeOutraPessoa(db, telefone, quem.userId)) return { ok: false, motivo: "numero_de_outra_pessoa" };
  const codigo = String(randomInt(1_000_000)).padStart(6, "0");
  const expiraEm = new Date(agora.getTime() + VALIDADE_DO_CODIGO_MS);
  await db.transaction(async (tx) => {
    await tx.delete(whatsappCodigos).where(and(eq(whatsappCodigos.userId, quem.userId), isNull(whatsappCodigos.usadoEm)));
    await tx.insert(whatsappCodigos).values({ hash: hashDoCodigo(quem.userId, codigo), telefone, userId: quem.userId, organizationId: quem.organizationId, expiraEm });
  });
  return { ok: true, codigo, expiraEm };
}

export interface Remetente {
  telefone: string | null;
  bsuid: string | null;
}

export type ResultadoDoCodigo =
  | { ok: true; telefone: string; organizationId: string; trocouDeNumero: boolean }
  | { ok: false; motivo: "sem_codigo" | "vencido" | "tentativas" | "numero_de_outra_pessoa" }
  | { ok: false; motivo: "errado"; restam: number };

/** A pessoa digitou o código que chegou no WhatsApp: certo, o número dele fica ligado à conta dela e vai para o perfil. */
export async function confirmarCodigo(db: Database, userId: string, digitado: string, agora = new Date()): Promise<ResultadoDoCodigo> {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(whatsappCodigos).where(and(eq(whatsappCodigos.userId, userId), isNull(whatsappCodigos.usadoEm))).orderBy(desc(whatsappCodigos.createdAt)).limit(1).for("update");
    if (!c) return { ok: false, motivo: "sem_codigo" } as const;
    if (c.expiraEm.getTime() <= agora.getTime()) return { ok: false, motivo: "vencido" } as const;
    if (c.tentativas >= TENTATIVAS_DO_CODIGO) return { ok: false, motivo: "tentativas" } as const;
    const certo = timingSafeEqual(Buffer.from(hashDoCodigo(userId, digitado)), Buffer.from(c.hash));
    if (!certo) {
      const tentativas = c.tentativas + 1;
      await tx.update(whatsappCodigos).set({ tentativas }).where(eq(whatsappCodigos.id, c.id));
      return tentativas >= TENTATIVAS_DO_CODIGO ? ({ ok: false, motivo: "tentativas" } as const) : ({ ok: false, motivo: "errado", restam: TENTATIVAS_DO_CODIGO - tentativas } as const);
    }
    if (await numeroDeOutraPessoa(tx, c.telefone, userId)) return { ok: false, motivo: "numero_de_outra_pessoa" } as const;
    const [antes] = await tx.select({ telefone: whatsappVinculos.telefone }).from(whatsappVinculos).where(eq(whatsappVinculos.userId, userId));
    const trocouDeNumero = !!antes && antes.telefone !== c.telefone;
    // A janela não abre aqui (a pessoa ainda não escreveu); o BSUID vem na primeira mensagem dela.
    const valores = { telefone: c.telefone, organizationId: c.organizationId, verificadoEm: agora, renovarAte: new Date(agora.getTime() + VALIDADE_DO_VINCULO_MS), pausadoEm: null, boasVindasEm: null, ...(trocouDeNumero ? { bsuid: null, ultimaEntradaEm: null } : {}) };
    await tx.insert(whatsappVinculos).values({ userId, ...valores }).onConflictDoUpdate({ target: whatsappVinculos.userId, set: valores });
    await tx.update(whatsappCodigos).set({ usadoEm: agora }).where(eq(whatsappCodigos.id, c.id));
    // O perfil (com RLS) por último: o escritório do código vale até o fim desta transação.
    await tx.execute(sql`select set_config('app.org_id', ${c.organizationId}, true)`);
    await tx.update(equipe).set({ whatsapp: c.telefone }).where(eq(equipe.userId, userId));
    return { ok: true, telefone: c.telefone, organizationId: c.organizationId, trocouDeNumero } as const;
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
  /** Ligou pela tela e ainda não escreveu: a primeira mensagem traz as boas-vindas. */
  boasVindasPendente: boolean;
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
    boasVindasPendente: !v.boasVindasEm,
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

/**
 * A mensagem que chegou: a janela de 24 h abre (ou continua aberta) a partir de agora. `bsuid`: o id da pessoa
 * na Meta, que o vínculo ainda não tinha (ligou pela tela): fica guardado para quando o telefone não vier.
 */
export async function registrarEntradaNoVinculo(db: Database, vinculoId: string, agora = new Date(), bsuid: string | null = null): Promise<void> {
  await db.transaction(async (tx) => {
    // O BSUID que estava com outro vínculo (o mesmo aparelho ligado antes em outra conta) sai de lá.
    if (bsuid) await tx.update(whatsappVinculos).set({ bsuid: null }).where(and(eq(whatsappVinculos.bsuid, bsuid), ne(whatsappVinculos.id, vinculoId)));
    await tx.update(whatsappVinculos).set({ ultimaEntradaEm: agora, ...(bsuid ? { bsuid } : {}) }).where(eq(whatsappVinculos.id, vinculoId));
  });
}

/** Marca as boas-vindas como dadas. Devolve se foi esta chamada que marcou: duas mensagens juntas não as mandam duas vezes. */
export async function marcarBoasVindas(db: Database, vinculoId: string, agora = new Date()): Promise<boolean> {
  const r = await db.update(whatsappVinculos).set({ boasVindasEm: agora }).where(and(eq(whatsappVinculos.id, vinculoId), isNull(whatsappVinculos.boasVindasEm))).returning({ id: whatsappVinculos.id });
  return r.length > 0;
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
