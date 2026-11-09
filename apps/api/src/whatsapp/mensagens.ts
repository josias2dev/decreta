/**
 * O que entra e sai pelo WhatsApp, gravado em `whatsapp_mensagens`.
 *
 * Saída: grava antes de mandar, com uma chave. Se a rotina repetir o passo (o Inngest repete o que
 * falhou), a mesma chave não manda de novo. Fora da janela de 24 h, texto livre não sai: vai o
 * modelo aprovado, quando há um, ou nada. A Meta dizendo 131047 fecha a janela no vínculo.
 *
 * Status: a Meta manda depois (enviada, entregue, lida, falhou) só com o id da mensagem; a função
 * `whatsapp_escritorio_da_mensagem` acha o escritório, e o status só anda para frente.
 */
import { organization, whatsappMensagens, withTenant, type Database, type OrigemDaMensagem, type SituacaoDaMensagem, type Tx } from "@decreta/db";
import { and, asc, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";
import { FalhaNoCanal, FORA_DA_JANELA, textoDaSaida, type Canal, type Conteudo, type Entrada, type Saida } from "./canal.ts";
import { fecharJanela } from "./vinculo.ts";

export type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDoCanal {
  db: Database;
  canal: Canal;
  log: Log;
}

/** Para quem a mensagem vai, como o vínculo diz. */
export interface Para {
  organizationId: string;
  userId: string;
  telefone: string;
  bsuid: string | null;
  janelaAberta: boolean;
  /** O nome do escritório: vai no rodapé das mensagens com botão que não trazem outro. */
  escritorio?: string;
}

export type Modelo = Extract<Saida, { tipo: "modelo" }>;

export interface OpcoesDoEnvio {
  origem: OrigemDaMensagem;
  /** Mesma chave, uma mensagem só: "resumo:2026-11-10", "turno:<id da entrada>". */
  chave?: string;
  conversaId?: string | null;
  /** Fora da janela, sai isto no lugar (o modelo aprovado). Sem ele, a mensagem livre não sai. */
  modeloSeFechada?: Modelo;
  /** A resposta fica marcada para a equipe do Decreta rever (a trava barrou: "trava: 24/04"). */
  revisao?: string | null;
  /** Quanto o turno levou até esta resposta. */
  duracaoMs?: number | null;
  /** A mensagem que esta cita: a que tinha o botão tocado. */
  responde?: string | null;
}

/** Toda mensagem com botão diz de qual escritório é (quem está em dois sabe onde toca), salvo quando já traz o rodapé dela. */
function comRodape(s: Saida, escritorio: string | undefined): Saida {
  if (!escritorio || (s.tipo !== "botoes" && s.tipo !== "lista" && s.tipo !== "link") || s.rodape) return s;
  return { ...s, rodape: escritorio };
}

function detalhesDaSaida(s: Saida): Record<string, unknown> | null {
  switch (s.tipo) {
    case "botoes":
      return { botoes: s.botoes };
    case "lista":
      return { botao: s.botao, itens: s.itens };
    case "link":
      return { rotulo: s.rotulo, url: s.url };
    case "documento":
      return { nome: s.nome, mime: s.mime, tamanho: s.bytes.byteLength };
    case "modelo":
      return { modelo: s.nome, parametros: s.parametros, botoes: s.botoes ?? [] };
    default:
      return null;
  }
}

/** Manda e grava. Devolve o id da Meta, ou nulo quando não saiu (fora da janela sem modelo, recusa da Meta, chave repetida). */
export async function enviarParaPessoa(deps: DepsDoCanal, para: Para, original: Saida, opcoes: OpcoesDoEnvio): Promise<{ wamid: string; saida: Saida } | null> {
  const saida = comRodape(original, para.escritorio);
  const livre = saida.tipo !== "modelo";
  if (livre && !para.janelaAberta) {
    if (!opcoes.modeloSeFechada) {
      deps.log("whatsapp: fora da janela, a mensagem não saiu", { organizationId: para.organizationId, userId: para.userId, chave: opcoes.chave });
      return null;
    }
    return enviarParaPessoa(deps, para, opcoes.modeloSeFechada, { ...opcoes, modeloSeFechada: undefined, chave: opcoes.chave ? `${opcoes.chave}:modelo` : undefined });
  }
  const linha = await withTenant(deps.db, para.organizationId, async (tx) => {
    const [nova] = await tx
      .insert(whatsappMensagens)
      // A chave é da pessoa: o "resumo:2026-11-10" de uma não segura o da outra (o índice único é por escritório).
      .values({ organizationId: para.organizationId, userId: para.userId, chave: opcoes.chave ? `${para.userId}:${opcoes.chave}` : null, direcao: "saida", tipo: saida.tipo, texto: textoDaSaida(saida), detalhes: detalhesDaSaida(saida), situacao: "enviando", origem: opcoes.origem, conversaId: opcoes.conversaId ?? null, revisao: opcoes.revisao ?? null, duracaoMs: opcoes.duracaoMs ?? null, responde: opcoes.responde ?? null })
      .onConflictDoNothing()
      .returning({ id: whatsappMensagens.id });
    return nova ?? null;
  });
  // A chave já saiu (ou está saindo): a rotina repetiu o passo.
  if (!linha) return null;
  try {
    const { wamid } = await deps.canal.enviar({ telefone: para.telefone, bsuid: para.bsuid }, saida, { responde: opcoes.responde ?? null });
    await withTenant(deps.db, para.organizationId, (tx) => tx.update(whatsappMensagens).set({ wamid, situacao: "enviada" }).where(eq(whatsappMensagens.id, linha.id)));
    return { wamid, saida };
  } catch (err) {
    const codigo = err instanceof FalhaNoCanal ? err.codigo : null;
    const motivo = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    await withTenant(deps.db, para.organizationId, (tx) => tx.update(whatsappMensagens).set({ situacao: "falhou", erro: codigo ? `${codigo}: ${motivo}` : motivo }).where(eq(whatsappMensagens.id, linha.id)));
    deps.log("whatsapp: a mensagem não saiu", { organizationId: para.organizationId, userId: para.userId, codigo, error: motivo });
    if (codigo === FORA_DA_JANELA) {
      await fecharJanela(deps.db, para.userId);
      if (livre && opcoes.modeloSeFechada) return enviarParaPessoa(deps, { ...para, janelaAberta: false }, saida, opcoes);
    }
    return null;
  }
}

/** O tipo que fica gravado para a mensagem que chegou. */
function tipoDaEntrada(c: Conteudo): string {
  return c.tipo === "midia" ? c.midia : c.tipo;
}

function textoDaEntrada(c: Conteudo): string | null {
  switch (c.tipo) {
    case "texto":
      return c.texto;
    case "escolha":
      return c.titulo;
    case "midia":
      return c.legenda ?? c.nome ?? null;
    case "reacao":
      return c.emoji;
    case "outro":
      return null;
  }
}

/** Grava a mensagem que chegou. A Meta pode entregar a mesma duas vezes: a segunda não entra (`novo: false`). */
export async function registrarEntrada(
  db: Database,
  quem: { organizationId: string; userId: string },
  m: Extract<Entrada, { tipo: "mensagem" }>,
  opcoes: { origem?: OrigemDaMensagem; situacao?: SituacaoDaMensagem } = {},
): Promise<{ id: string; novo: boolean }> {
  return withTenant(db, quem.organizationId, async (tx) => {
    const c = m.conteudo;
    const detalhes: Record<string, unknown> = c.tipo === "escolha" ? { escolha: c.id } : c.tipo === "midia" ? { midia: c } : c.tipo === "reacao" ? { reagida: c.wamid } : c.tipo === "outro" ? { nome: c.nome } : {};
    const [nova] = await tx
      .insert(whatsappMensagens)
      .values({ organizationId: quem.organizationId, userId: quem.userId, wamid: m.wamid, direcao: "entrada", tipo: tipoDaEntrada(m.conteudo), texto: textoDaEntrada(m.conteudo), detalhes, situacao: opcoes.situacao ?? "recebida", origem: opcoes.origem ?? null, responde: m.responde, createdAt: m.em })
      .onConflictDoNothing()
      .returning({ id: whatsappMensagens.id });
    if (nova) return { id: nova.id, novo: true };
    const [ja] = await tx.select({ id: whatsappMensagens.id }).from(whatsappMensagens).where(eq(whatsappMensagens.wamid, m.wamid));
    return { id: ja?.id ?? "", novo: false };
  });
}

const ORDEM: Record<SituacaoDaMensagem, number> = { recebida: 0, respondida: 0, ignorada: 0, enviando: 1, enviada: 2, entregue: 3, lida: 4, falhou: 5 };

/** O status que a Meta mandou depois. Nunca volta para trás (o "entregue" atrasado não desfaz o "lida"); o "falhou" vale sempre. */
export async function atualizarStatus(db: Database, s: Extract<Entrada, { tipo: "status" }>): Promise<boolean> {
  const [linha] = await db.execute<{ org: string | null }>(sql`select whatsapp_escritorio_da_mensagem(${s.wamid}) as org`);
  const org = linha?.org;
  if (!org) return false;
  const depois = s.status as SituacaoDaMensagem;
  await withTenant(db, org, async (tx) => {
    const [m] = await tx.select({ id: whatsappMensagens.id, situacao: whatsappMensagens.situacao }).from(whatsappMensagens).where(eq(whatsappMensagens.wamid, s.wamid));
    if (!m) return;
    const anda = depois === "falhou" || ORDEM[depois] > ORDEM[m.situacao];
    await tx
      .update(whatsappMensagens)
      .set({ ...(anda ? { situacao: depois } : {}), ...(s.erro ? { erro: `${s.erro.codigo}: ${s.erro.titulo}`.slice(0, 300) } : {}), ...(s.categoria ? { categoria: s.categoria } : {}) })
      .where(eq(whatsappMensagens.id, m.id));
  });
  return true;
}

/**
 * Marca uma resposta do agente para a equipe do Decreta rever: a reagida com 👎 (`wamid`) ou a última
 * que saiu para a pessoa ("está errado"). A marca que já existe (a da trava) fica.
 */
export async function marcarParaRevisao(db: Database, quem: { organizationId: string; userId: string }, alvo: { wamid: string } | "ultima", motivo: string): Promise<void> {
  await withTenant(db, quem.organizationId, async (tx) => {
    const daPessoa = and(eq(whatsappMensagens.userId, quem.userId), eq(whatsappMensagens.direcao, "saida"), eq(whatsappMensagens.origem, "agente"));
    const [m] = await tx
      .select({ id: whatsappMensagens.id })
      .from(whatsappMensagens)
      .where(alvo === "ultima" ? daPessoa : and(daPessoa, eq(whatsappMensagens.wamid, alvo.wamid)))
      .orderBy(sql`${whatsappMensagens.createdAt} desc`)
      .limit(1);
    if (m) await tx.update(whatsappMensagens).set({ revisao: sql`coalesce(${whatsappMensagens.revisao}, ${motivo})` }).where(eq(whatsappMensagens.id, m.id));
  });
}

/** As mensagens da pessoa que ainda esperam resposta, da mais antiga para a mais nova (a rajada de várias vira um turno só). */
export async function entradasSemResposta(tx: Tx, userId: string) {
  return tx
    .select()
    .from(whatsappMensagens)
    .where(and(eq(whatsappMensagens.userId, userId), eq(whatsappMensagens.direcao, "entrada"), eq(whatsappMensagens.situacao, "recebida")))
    .orderBy(asc(whatsappMensagens.createdAt));
}

export async function marcarEntradas(tx: Tx, ids: string[], situacao: "respondida" | "ignorada", conversaId?: string | null): Promise<void> {
  if (!ids.length) return;
  await tx
    .update(whatsappMensagens)
    .set({ situacao, ...(conversaId ? { conversaId } : {}) })
    .where(inArray(whatsappMensagens.id, ids));
}

/** A última escolha da pessoa com este começo, há menos de `desdeMs` ("a:digitar:<prazo>", para a data digitada em seguida). */
export async function ultimaEscolha(tx: Tx, userId: string, prefixo: string, desdeMs: number, agora = new Date()): Promise<string | null> {
  const [m] = await tx
    .select({ detalhes: whatsappMensagens.detalhes })
    .from(whatsappMensagens)
    .where(and(eq(whatsappMensagens.userId, userId), eq(whatsappMensagens.direcao, "entrada"), eq(whatsappMensagens.tipo, "escolha"), gte(whatsappMensagens.createdAt, new Date(agora.getTime() - desdeMs))))
    .orderBy(sql`${whatsappMensagens.createdAt} desc`)
    .limit(1);
  const id = typeof m?.detalhes?.escolha === "string" ? m.detalhes.escolha : null;
  return id?.startsWith(prefixo) ? id : null;
}

/** Quantas mensagens deste tipo saíram hoje para a pessoa (o teto de documentos por dia). */
export async function saidasDesde(tx: Tx, userId: string, tipo: string, desde: Date): Promise<number> {
  const [r] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(whatsappMensagens)
    .where(and(eq(whatsappMensagens.userId, userId), eq(whatsappMensagens.direcao, "saida"), eq(whatsappMensagens.tipo, tipo), gte(whatsappMensagens.createdAt, desde), sql`${whatsappMensagens.situacao} <> 'falhou'`));
  return r?.n ?? 0;
}

/** O texto das mensagens com mais de 30 dias sai (a Meta também guarda até 30): fica o que, quando e se chegou. */
export async function apagarConteudoAntigo(db: Database, agora = new Date()): Promise<number> {
  const antes = new Date(agora.getTime() - 30 * 24 * 60 * 60_000);
  const orgs = await db.select({ id: organization.id }).from(organization);
  let n = 0;
  for (const o of orgs) {
    const r = await withTenant(db, o.id, (tx) =>
      tx
        .update(whatsappMensagens)
        .set({ texto: null, detalhes: null })
        .where(and(lt(whatsappMensagens.createdAt, antes), sql`(${whatsappMensagens.texto} is not null or ${whatsappMensagens.detalhes} is not null)`))
        .returning({ id: whatsappMensagens.id }),
    );
    n += r.length;
  }
  return n;
}
