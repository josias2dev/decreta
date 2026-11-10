/**
 * O WhatsApp no painel da plataforma: as conversas e o Laboratório.
 *
 * Conversas: a lista é só de metadados (quem, de qual escritório, quando, se algo falhou). O conteúdo
 * abre conversa a conversa, com o motivo escrito, e a abertura fica no registro da plataforma e no
 * Registro do próprio escritório: o escritório sabe que a equipe do Decreta leu, e por quê. Dá para
 * pausar o agente de uma pessoa (o suporte assume) e escrever como Decreta enquanto a janela está aberta.
 *
 * Laboratório: conversa com o agente como uma pessoa do escritório de DEMONSTRAÇÃO, onde tudo é inventado.
 * O canal é o da memória: nada sai para o WhatsApp de ninguém. As propostas executam de verdade, nos
 * dados da demonstração, que se renovam toda madrugada.
 */
import { randomUUID } from "node:crypto";
import { auditoriaDaPlataforma, conversas, equipe, member, mensagensIa, organization, propostas, user, whatsappMensagens, whatsappVinculos, withTenant, type Database } from "@decreta/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { registrar } from "../auditoria.ts";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { tratarEscolha } from "./acoes.ts";
import { avisarPrazoCurto, avisarResumo, avisarVenceHoje } from "./avisos.ts";
import type { Conteudo } from "./canal.ts";
import { responder } from "./entrada.ts";
import { enviarParaPessoa, marcarEntradas, registrarEntrada } from "./mensagens.ts";
import { responderTurno, type Bastidores } from "./turno.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import { pausarVinculo, pessoaDoUsuario, telefoneEscondido, type PessoaNoWhatsapp } from "./vinculo.ts";
import { painelDoDia } from "../servicos/hoje.ts";
import { hojeEm } from "@decreta/core";

/* ------------------------------------------------------------------ */
/* Conversas                                                           */
/* ------------------------------------------------------------------ */

export interface ConversaNaLista {
  organizationId: string;
  escritorio: string;
  userId: string;
  pessoa: string;
  telefone: string | null;
  ultimaEm: string;
  mensagens: number;
  falhas: number;
  ultimaDirecao: "entrada" | "saida" | null;
  ultimaSituacao: string | null;
  pausado: boolean;
}

export async function conversasDaPlataforma(db: Database, opcoes: { limite?: number; antes?: string | null } = {}): Promise<ConversaNaLista[]> {
  const linhas = await db.execute<{
    organization_id: string;
    escritorio: string;
    user_id: string;
    pessoa: string;
    telefone: string | null;
    ultima_em: Date | string;
    mensagens: number | string;
    falhas: number | string;
    ultima_direcao: string | null;
    ultima_situacao: string | null;
    pausado: boolean;
  }>(sql`select * from plataforma_conversas_whatsapp(${opcoes.limite ?? 100}, ${opcoes.antes ?? null})`);
  return linhas.map((l) => ({
    organizationId: l.organization_id,
    escritorio: l.escritorio,
    userId: l.user_id,
    pessoa: l.pessoa,
    telefone: l.telefone ? telefoneEscondido(l.telefone) : null,
    ultimaEm: new Date(l.ultima_em).toISOString(),
    mensagens: Number(l.mensagens),
    falhas: Number(l.falhas),
    ultimaDirecao: (l.ultima_direcao as "entrada" | "saida" | null) ?? null,
    ultimaSituacao: l.ultima_situacao,
    pausado: !!l.pausado,
  }));
}

export interface MensagemNaTela {
  id: string;
  direcao: "entrada" | "saida";
  tipo: string;
  texto: string | null;
  detalhes: Record<string, unknown> | null;
  situacao: string;
  erro: string | null;
  origem: string | null;
  em: string;
  conversaId: string | null;
  /** Por que a resposta precisa ser revista (a trava barrou, a pessoa reagiu com 👎 ou disse que está errado). */
  revisao: string | null;
  duracaoMs: number | null;
}

export interface TurnoNaTela {
  conversaId: string;
  em: string;
  ferramentas: { nome: string; entrada: unknown; erro?: string }[];
}

/** O conteúdo de uma conversa: as mensagens (as do Laboratório ficam fora) e o que a IA consultou em cada turno. */
async function mensagensDa(db: Database, organizationId: string, userId: string, laboratorio: boolean): Promise<{ mensagens: MensagemNaTela[]; turnos: TurnoNaTela[] }> {
  return withTenant(db, organizationId, async (tx) => {
    const linhas = await tx
      .select()
      .from(whatsappMensagens)
      .where(and(eq(whatsappMensagens.userId, userId), laboratorio ? eq(whatsappMensagens.origem, "laboratorio") : sql`coalesce(${whatsappMensagens.origem}, '') <> 'laboratorio'`))
      .orderBy(desc(whatsappMensagens.createdAt))
      .limit(300);
    const mensagens = linhas.reverse().map((m) => ({ id: m.id, direcao: m.direcao, tipo: m.tipo, texto: m.texto, detalhes: m.detalhes ?? null, situacao: m.situacao, erro: m.erro, origem: m.origem, em: m.createdAt.toISOString(), conversaId: m.conversaId, revisao: m.revisao, duracaoMs: m.duracaoMs }));
    const ids = [...new Set(mensagens.map((m) => m.conversaId).filter((x): x is string => !!x))];
    const respostas = ids.length ? await tx.select({ conversaId: mensagensIa.conversaId, partes: mensagensIa.partes, em: mensagensIa.createdAt }).from(mensagensIa).where(and(inArray(mensagensIa.conversaId, ids), eq(mensagensIa.papel, "ia"))).orderBy(asc(mensagensIa.createdAt)) : [];
    const turnos = respostas.map((r) => ({ conversaId: r.conversaId!, em: r.em.toISOString(), ferramentas: (r.partes ?? []).flatMap((p) => (p.tipo === "ferramenta" ? [{ nome: p.nome, entrada: p.entrada, ...(p.erro ? { erro: p.erro } : {}) }] : [])) }));
    return { mensagens, turnos };
  });
}

export class RecusaDoPainel extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 = 400,
  ) {
    super(message);
  }
}

/** Abre a conversa de uma pessoa, com o motivo, e registra nos dois lados: na plataforma e no escritório. */
export async function abrirConversa(db: Database, p: { operador: string; organizationId: string; userId: string; motivo: string; log?: (m: string, e?: Record<string, unknown>) => void }) {
  const motivo = p.motivo.trim();
  if (motivo.length < 10) throw new RecusaDoPainel("Escreva o motivo (pelo menos 10 caracteres): ele fica no registro do escritório.");
  const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, p.organizationId), eq(member.userId, p.userId)));
  const [u] = await db.select({ nome: user.name }).from(user).where(eq(user.id, p.userId));
  if (!u) throw new RecusaDoPainel("Pessoa não encontrada.", 404);
  await db.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: "plataforma.whatsapp_conversa_aberta", organizationId: p.organizationId, detalhes: { userId: p.userId, motivo } });
  await registrar(db, { organizationId: p.organizationId, userId: null, nome: `Equipe do Decreta (${p.operador})`, acao: "plataforma.whatsapp_conversa_aberta", detalhes: { pessoa: u.nome, motivo }, ip: null }, p.log);
  return { ...(await conteudoDaConversa(db, p.organizationId, p.userId)), pessoa: { userId: p.userId, nome: u.nome, membro: !!m } };
}

/** O conteúdo de uma conversa já aberta com motivo (a tela atualiza sem abrir de novo). */
export async function conteudoDaConversa(db: Database, organizationId: string, userId: string) {
  const [u] = await db.select({ nome: user.name }).from(user).where(eq(user.id, userId));
  const [m] = await db.select({ id: member.id }).from(member).where(and(eq(member.organizationId, organizationId), eq(member.userId, userId)));
  const [v] = await db.select().from(whatsappVinculos).where(eq(whatsappVinculos.userId, userId));
  const conteudo = await mensagensDa(db, organizationId, userId, false);
  return {
    pessoa: { userId, nome: u?.nome ?? "", membro: !!m },
    vinculo: v ? { telefone: telefoneEscondido(v.telefone), pausado: !!v.pausadoEm, janelaAberta: !!v.ultimaEntradaEm && Date.now() - v.ultimaEntradaEm.getTime() < 24 * 60 * 60_000 - 10 * 60_000, renovarAte: v.renovarAte.toISOString(), organizationId: v.organizationId } : null,
    ...conteudo,
  };
}

/** O suporte assume (pausa o agente desta pessoa) ou devolve ao agente. */
export async function pausarConversa(db: Database, p: { operador: string; organizationId: string; userId: string; pausado: boolean }): Promise<void> {
  const ok = await pausarVinculo(db, p.userId, p.pausado);
  if (!ok) throw new RecusaDoPainel("Esta pessoa não tem o WhatsApp ligado.", 404);
  await db.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: p.pausado ? "plataforma.whatsapp_pausado" : "plataforma.whatsapp_retomado", organizationId: p.organizationId, detalhes: { userId: p.userId } });
}

/** Escrever como Decreta: só com a janela de 24 h aberta (fora dela, só modelo aprovado, e o suporte não tem modelo). */
export async function escreverComoSuporte(deps: DepsDoAgente, p: { operador: string; organizationId: string; userId: string; texto: string }): Promise<void> {
  const texto = p.texto.trim();
  if (!texto) throw new RecusaDoPainel("Escreva a mensagem.");
  const pessoa = await pessoaDoUsuario(deps.db, p.userId, { cobrancaAtiva: deps.cobrancaAtiva, organizationId: p.organizationId });
  if (!pessoa) throw new RecusaDoPainel("Esta pessoa não tem o WhatsApp ligado neste escritório.", 404);
  if (!pessoa.janelaAberta) throw new RecusaDoPainel("A janela de 24 h está fechada: a pessoa precisa escrever primeiro.", 409);
  const saiu = await enviarParaPessoa(deps, pessoa, { tipo: "texto", texto: `*Equipe do Decreta:* ${texto}` }, { origem: "suporte", chave: `suporte:${randomUUID()}` });
  if (!saiu) throw new RecusaDoPainel("A mensagem não saiu. Veja o motivo na conversa.", 409);
  await deps.db.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: "plataforma.whatsapp_suporte", organizationId: p.organizationId, detalhes: { userId: p.userId, tamanho: texto.length } });
}

/* ------------------------------------------------------------------ */
/* Laboratório                                                         */
/* ------------------------------------------------------------------ */

export async function escritorioDoLaboratorio(db: Database): Promise<{ id: string; nome: string } | null> {
  const [o] = await db.select({ id: organization.id, nome: organization.name }).from(organization).where(eq(organization.slug, SLUG_DA_DEMONSTRACAO));
  return o ?? null;
}

/** As pessoas da demonstração com quem dá para conversar no Laboratório. */
export async function pessoasDoLaboratorio(db: Database) {
  const org = await escritorioDoLaboratorio(db);
  if (!org) return { escritorio: null, pessoas: [] };
  const membros = await db.select({ id: user.id, nome: user.name, papel: member.role }).from(member).innerJoin(user, eq(user.id, member.userId)).where(eq(member.organizationId, org.id)).orderBy(user.name);
  const cargos = await withTenant(db, org.id, (tx) => tx.select({ userId: equipe.userId, cargo: equipe.cargo, apelido: equipe.apelido }).from(equipe));
  const porId = new Map(cargos.map((c) => [c.userId, c]));
  return { escritorio: org, pessoas: membros.map((m) => ({ id: m.id, nome: m.nome, papel: m.papel, cargo: porId.get(m.id)?.cargo ?? null, apelido: porId.get(m.id)?.apelido ?? null })) };
}

/** A pessoa da demonstração como o agente a vê. A janela é o que o Laboratório escolher (fechada: os avisos saem como modelo). */
export async function pessoaDoLaboratorio(db: Database, userId: string, janelaAberta: boolean): Promise<PessoaNoWhatsapp> {
  const org = await escritorioDoLaboratorio(db);
  if (!org) throw new RecusaDoPainel("O escritório de demonstração não existe neste servidor (bun run demonstracao).", 404);
  const [m] = await db.select({ papel: member.role }).from(member).where(and(eq(member.organizationId, org.id), eq(member.userId, userId)));
  if (!m) throw new RecusaDoPainel("No Laboratório só entram as pessoas da demonstração.", 404);
  const [u] = await db.select({ nome: user.name }).from(user).where(eq(user.id, userId));
  const [o] = await db.select({ timezone: organization.timezone }).from(organization).where(eq(organization.id, org.id));
  const [e] = await withTenant(db, org.id, (tx) => tx.select({ apelido: equipe.apelido, cargo: equipe.cargo }).from(equipe).where(eq(equipe.userId, userId)));
  const nome = u?.nome ?? "";
  return {
    vinculoId: "laboratorio",
    userId,
    nome,
    apelido: e?.apelido || nome.split(" ")[0] || nome,
    cargo: e?.cargo ?? null,
    papel: m.papel,
    telefone: "5500000000000",
    bsuid: null,
    organizationId: org.id,
    escritorio: org.nome,
    timezone: o?.timezone ?? "America/Sao_Paulo",
    demonstracao: true,
    emAvaliacao: false,
    acesso: "total",
    janelaAberta,
    pausado: false,
    vencido: false,
    boasVindasPendente: false,
    renovarAte: new Date(Date.now() + 365 * 24 * 60 * 60_000),
  };
}

export type PedidoDoLaboratorio = { texto: string } | { escolha: { id: string; titulo: string } } | { aviso: "resumo" | "vence" | "curto"; publicacaoId?: string };

/** Uma mensagem (ou um toque, ou um aviso disparado) no Laboratório. Responde na hora, com os bastidores do turno. */
export async function noLaboratorio(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, pedido: PedidoDoLaboratorio): Promise<{ bastidores: Bastidores | null; nada?: string }> {
  const agora = agoraDe(deps);
  if ("aviso" in pedido) {
    if (pedido.aviso === "resumo") {
      const painel = await withTenant(deps.db, pessoa.organizationId, (tx) => painelDoDia(deps.db, tx, pessoa.organizationId, hojeEm(pessoa.timezone, agora), pessoa.timezone, { iaLigada: !!deps.ia }));
      // A chave do resumo é do dia: no Laboratório, cada disparo é um resumo novo.
      const saiu = await avisarResumo({ ...deps, agora: () => agora }, pessoa, { ...painel, hoje: `${painel.hoje}#${agora.getTime()}` as typeof painel.hoje });
      return { bastidores: null, ...(saiu ? {} : { nada: "Nada da pessoa hoje: o resumo não sai em dia vazio." }) };
    }
    if (pedido.aviso === "vence") {
      const saiu = await avisarVenceHoje({ ...deps, agora: () => agora }, pessoa);
      return { bastidores: null, ...(saiu ? {} : { nada: "Nada dela vence hoje e está aberto: às 15h nada sairia." }) };
    }
    if (!pedido.publicacaoId) throw new RecusaDoPainel("Escolha a publicação.");
    const n = await avisarPrazoCurto(deps, [pessoa], pessoa.organizationId, pedido.publicacaoId);
    return { bastidores: null, ...(n ? {} : { nada: "Esta publicação não tem sugestão que vença em até 2 dias úteis (ou já foi confirmada)." }) };
  }
  const conteudo: Conteudo = "texto" in pedido ? { tipo: "texto", texto: pedido.texto } : { tipo: "escolha", id: pedido.escolha.id, titulo: pedido.escolha.titulo };
  const entrada = { tipo: "mensagem" as const, wamid: `laboratorio.${randomUUID()}`, de: { telefone: pessoa.telefone, bsuid: null, nome: pessoa.nome }, em: agora, responde: null, conteudo };
  const { id } = await registrarEntrada(deps.db, pessoa, entrada, { origem: "laboratorio" });
  if (conteudo.tipo === "escolha") {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "respondida"));
    const inicio = Date.now();
    const saidas = await tratarEscolha(deps, pessoa, conteudo.id);
    await responder(deps, pessoa, saidas, `escolha:${id}`);
    return { bastidores: { ferramentas: [], tokens: null, ms: Date.now() - inicio, propostas: [], atalho: "toque" } };
  }
  const turno = await responderTurno(deps, pessoa);
  await responder(deps, pessoa, turno.saidas, `turno:${turno.entradas[0] ?? id}`, turno.conversaId, { revisao: turno.revisao, duracaoMs: turno.bastidores.ms });
  return { bastidores: turno.bastidores };
}

export async function conversaDoLaboratorio(db: Database, pessoa: PessoaNoWhatsapp) {
  return mensagensDa(db, pessoa.organizationId, pessoa.userId, true);
}

/** Zera a conversa do Laboratório desta pessoa: as mensagens, a conversa com a IA e as propostas pendentes. */
export async function limparLaboratorio(db: Database, pessoa: PessoaNoWhatsapp): Promise<void> {
  await withTenant(db, pessoa.organizationId, async (tx) => {
    await tx.delete(whatsappMensagens).where(and(eq(whatsappMensagens.userId, pessoa.userId), eq(whatsappMensagens.origem, "laboratorio")));
    await tx.delete(conversas).where(and(eq(conversas.userId, pessoa.userId), eq(conversas.canal, "laboratorio")));
    await tx.update(propostas).set({ situacao: "vencida" }).where(and(eq(propostas.userId, pessoa.userId), eq(propostas.situacao, "pendente")));
  });
}
