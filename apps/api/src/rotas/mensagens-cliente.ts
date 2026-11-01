/**
 * Mensagens ao cliente no WhatsApp (Fase 3). A IA (ou a conferência da pasta)
 * escreve o rascunho; nada sai sem um advogado aprovar, e a aprovação fica
 * registrada com quem e quando. A demonstração nunca manda WhatsApp.
 */
import { randomBytes } from "node:crypto";
import { comLinkDeEnvio, corpoDaCobranca, documentosQueFaltam, formatarTelefone, hojeEm, mensagemParaWhatsapp, somarDias, telefoneWhatsapp } from "@decreta/core";
import { clientes, escritorios, mensagensCliente, prazos, processos, type Tx } from "@decreta/db";
import { IaRecusou, mensagemAoCliente, type Briefing } from "@decreta/ia";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { ultimaAnalise } from "../servicos/analises.ts";
import { enviarWhatsapp } from "../servicos/avisos.ts";
import { ultimaConferencia } from "../servicos/conferencia.ts";
import { semIa, ClienteSemIa } from "../servicos/contexto.ts";
import { hashDoSegredo, VALIDADE_DO_LINK_DIAS } from "./envio-pelo-cliente.ts";
import { pessoasDoEscritorio, resumir, type Pessoa } from "../servicos/pessoas.ts";
import { comLimiteDaIa, corpo, falha, iaDaRota, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

type Mensagem = typeof mensagensCliente.$inferSelect;

/** O nome do escritório como ele assina (o do timbre) e o número oficial do rodapé. */
async function identidade(tx: Tx, c: C) {
  const [e] = await tx.select({ timbre: escritorios.timbre, whatsappOficial: escritorios.whatsappOficial }).from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
  return { escritorio: e?.timbre?.nome || c.get("orgNome"), numeroOficial: e?.whatsappOficial ?? null, timezone: c.get("timezone") };
}

const SEM_NUMERO = "(número oficial ainda não cadastrado)";
/** O link de envio como aparece na prévia e no texto guardado: o segredo só vai no WhatsApp. */
const LINK_ESCONDIDO = "[link de envio]";

/** O corpo como sai: na cobrança, com o link de envio e a validade no fim. */
function corpoParaEnvio(m: Pick<Mensagem, "tipo" | "texto">, link: string, validoAte: string): string {
  return m.tipo === "documentos" ? comLinkDeEnvio(m.texto, link, validoAte) : m.texto;
}

function naTela(m: Mensagem, cliente: { id: string; nome: string; telefone: string | null }, id_: { escritorio: string; numeroOficial: string | null; timezone: string }, pessoas: Map<string, Pessoa>) {
  const validade = somarDias(hojeEm(id_.timezone), VALIDADE_DO_LINK_DIAS);
  return {
    id: m.id,
    tipo: m.tipo,
    situacao: m.situacao,
    texto: m.texto,
    previa: m.enviado ?? mensagemParaWhatsapp({ escritorio: id_.escritorio, corpo: corpoParaEnvio(m, LINK_ESCONDIDO, validade), numeroOficial: id_.numeroOficial ?? SEM_NUMERO }),
    itens: m.itens,
    cliente: { id: cliente.id, nome: cliente.nome },
    para: m.para ?? (cliente.telefone ? formatarTelefone(cliente.telefone) : null),
    processoId: m.processoId,
    prazoId: m.prazoId,
    linkValeAte: m.linkExpiraEm?.toISOString() ?? null,
    recebidos: m.recebidos,
    criadaEm: m.createdAt.toISOString(),
    aprovadaPor: resumir(pessoas, m.aprovadaPor),
    aprovadaEm: m.aprovadaEm?.toISOString() ?? null,
    enviadaEm: m.enviadaEm?.toISOString() ?? null,
    erro: m.erro,
    numeroOficial: id_.numeroOficial,
  };
}

async function carregar(tx: Tx, c: C, deps: DepsDasRotas, mensagemId: string) {
  const [linha] = await tx
    .select({ m: mensagensCliente, cliente: { id: clientes.id, nome: clientes.nome, telefone: clientes.telefone } })
    .from(mensagensCliente)
    .innerJoin(clientes, eq(clientes.id, mensagensCliente.clienteId))
    .where(eq(mensagensCliente.id, mensagemId));
  if (!linha) falha(404, "nao_encontrado");
  return { ...linha, id_: await identidade(tx, c), pessoas: await pessoasDoEscritorio(deps.db, tx, c.get("orgId")) };
}

export function rotasDasMensagensAoCliente(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  /** "O que isso significa para você": a IA escreve, a partir do briefing do prazo, o rascunho para o advogado revisar. */
  app.post("/prazos/:id/mensagem-cliente", comLimiteDaIa(deps), async (c) => {
    const ia = iaDaRota(c);
    const prazoId = id(c);
    const dados = await tenant(c, deps, async (tx) => {
      const [p] = await tx
        .select({ tipo: prazos.tipo, processoId: prazos.processoId, clienteId: processos.clienteId })
        .from(prazos)
        .innerJoin(processos, eq(processos.id, prazos.processoId))
        .where(eq(prazos.id, prazoId));
      if (!p) falha(404, "nao_encontrado");
      if (!p.clienteId) falha(422, "sem_cliente", "O processo não tem cliente cadastrado.");
      if (await semIa(tx, { clienteId: p.clienteId })) throw new ClienteSemIa();
      const [cl] = await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, p.clienteId));
      const b = await ultimaAnalise(tx, "prazo", prazoId, "briefing-prazo");
      if (b?.situacao !== "pronto") falha(422, "sem_briefing", "Gere o briefing do prazo antes de escrever ao cliente.");
      return { ...p, clienteId: p.clienteId, cliente: cl!.nome, briefing: b.conteudo as unknown as Briefing };
    });
    let texto: string;
    try {
      texto = (await mensagemAoCliente(ia, { cliente: dados.cliente, prazo: dados.tipo, briefing: dados.briefing })).texto.trim();
    } catch (err) {
      if (err instanceof IaRecusou) falha(422, "ia_recusou", err.motivo);
      throw err;
    }
    return tenant(c, deps, async (tx) => {
      const [m] = await tx
        .insert(mensagensCliente)
        .values({ organizationId: c.get("orgId"), clienteId: dados.clienteId, processoId: dados.processoId, prazoId, tipo: "decisao", textoIa: texto, texto, criadaPor: c.get("userId") })
        .returning();
      const l = await carregar(tx, c, deps, m!.id);
      return c.json(naTela(l.m, l.cliente, l.id_, l.pessoas), 201);
    });
  });

  /** Cobrar os documentos que faltam: a lista sai da última conferência da pasta; o link de envio nasce na aprovação. */
  app.post("/clientes/:id/cobrar-documentos", async (c) => {
    const clienteId = id(c);
    return tenant(c, deps, async (tx) => {
      const [cl] = await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      const conf = await ultimaConferencia(tx, { clienteId }, c.get("timezone"));
      if (conf?.situacao !== "pronto") falha(422, "sem_conferencia", "Confira a pasta do cliente antes: é a conferência que diz o que falta.");
      const itens = documentosQueFaltam((conf.conteudo as { itens?: { item: string; situacao: string }[] }).itens ?? []);
      if (!itens.length) falha(422, "nada_falta", "A conferência não achou documento faltando.");
      const [m] = await tx
        .insert(mensagensCliente)
        .values({ organizationId: c.get("orgId"), clienteId, tipo: "documentos", texto: corpoDaCobranca(cl.nome, itens), itens, criadaPor: c.get("userId") })
        .returning();
      const l = await carregar(tx, c, deps, m!.id);
      return c.json(naTela(l.m, l.cliente, l.id_, l.pessoas), 201);
    });
  });

  /** As mensagens de um cliente ou de um prazo, das mais novas para as mais antigas. */
  app.get("/mensagens-cliente", async (c) => {
    const clienteId = c.req.query("cliente");
    const prazoId = c.req.query("prazo");
    if (!clienteId && !prazoId) falha(400, "sem_filtro", "Diga o cliente ou o prazo.");
    return tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select({ m: mensagensCliente, cliente: { id: clientes.id, nome: clientes.nome, telefone: clientes.telefone } })
        .from(mensagensCliente)
        .innerJoin(clientes, eq(clientes.id, mensagensCliente.clienteId))
        .where(and(clienteId ? eq(mensagensCliente.clienteId, clienteId) : undefined, prazoId ? eq(mensagensCliente.prazoId, prazoId) : undefined))
        .orderBy(desc(mensagensCliente.createdAt))
        .limit(50);
      const id_ = await identidade(tx, c);
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      return c.json({ itens: linhas.map((l) => naTela(l.m, l.cliente, id_, pessoas)) });
    });
  });

  /** O advogado edita o rascunho. Mensagem que já saiu não muda. */
  app.put("/mensagens-cliente/:id", async (c) => {
    const mensagemId = id(c);
    const b = await corpo(c, z.object({ texto: z.string().trim().min(2).max(3000) }));
    return tenant(c, deps, async (tx) => {
      const [m] = await tx
        .update(mensagensCliente)
        .set({ texto: b.texto })
        .where(and(eq(mensagensCliente.id, mensagemId), inArray(mensagensCliente.situacao, ["rascunho", "falhou"])))
        .returning({ id: mensagensCliente.id });
      if (!m) {
        await carregar(tx, c, deps, mensagemId);
        falha(409, "ja_enviada", "Esta mensagem já saiu ou foi descartada.");
      }
      const l = await carregar(tx, c, deps, mensagemId);
      return c.json(naTela(l.m, l.cliente, l.id_, l.pessoas));
    });
  });

  app.post("/mensagens-cliente/:id/descartar", async (c) => {
    const mensagemId = id(c);
    await tenant(c, deps, async (tx) => {
      const [m] = await tx
        .update(mensagensCliente)
        .set({ situacao: "descartada" })
        .where(and(eq(mensagensCliente.id, mensagemId), inArray(mensagensCliente.situacao, ["rascunho", "falhou"])))
        .returning({ id: mensagensCliente.id });
      if (!m) falha(409, "ja_enviada", "Esta mensagem já saiu ou foi descartada.");
    });
    return c.json({ ok: true });
  });

  /**
   * O advogado aprova e a mensagem sai no WhatsApp, com o nome do escritório e
   * o rodapé contra o golpe. Fica gravado quem aprovou, quando e o texto que saiu.
   */
  app.post("/mensagens-cliente/:id/enviar", async (c) => {
    const mensagemId = id(c);
    const b = await corpo(c, z.object({ texto: z.string().trim().min(2).max(3000).optional() }));
    if (c.get("demonstracao")) falha(403, "demonstracao", "Na demonstração nada sai no WhatsApp: os clientes e os telefones são inventados.");
    const wameow = deps.wameow;
    if (!wameow) falha(503, "whatsapp_desligado", "O WhatsApp do Decreta ainda não foi ligado neste servidor.");
    const envio = await tenant(c, deps, async (tx) => {
      const l = await carregar(tx, c, deps, mensagemId);
      if (l.m.situacao !== "rascunho" && l.m.situacao !== "falhou") falha(409, "ja_enviada", "Esta mensagem já saiu ou foi descartada.");
      if (!l.pessoas.get(c.get("userId"))?.oab) falha(403, "sem_oab", "Só advogado com OAB cadastrada no perfil aprova mensagem ao cliente.");
      if (!l.id_.numeroOficial) falha(422, "sem_numero_oficial", "Cadastre o WhatsApp oficial do escritório nas configurações: ele vai no rodapé contra o golpe do falso advogado.");
      const para = l.cliente.telefone ? telefoneWhatsapp(l.cliente.telefone) : null;
      if (!para) falha(422, "sem_telefone", "O cliente não tem um celular válido no cadastro.");
      const texto = b.texto ?? l.m.texto;
      const agora = new Date();
      // Cobrança: o link de envio nasce agora, na aprovação. O banco guarda só o hash do segredo.
      const segredo = randomBytes(24).toString("base64url");
      const expira = new Date(agora.getTime() + VALIDADE_DO_LINK_DIAS * 86_400_000);
      const validoAte = hojeEm(l.id_.timezone, expira);
      const link = `${deps.telas.replace(/\/$/, "")}/enviar/${c.get("orgId")}/${segredo}`;
      const montar = (lk: string) => mensagemParaWhatsapp({ escritorio: l.id_.escritorio, corpo: corpoParaEnvio({ tipo: l.m.tipo, texto }, lk, validoAte), numeroOficial: l.id_.numeroOficial! });
      const comLink = l.m.tipo === "documentos" ? { linkHash: hashDoSegredo(segredo), linkExpiraEm: expira } : {};
      // A aprovação reserva a mensagem: dois cliques seguidos não mandam duas vezes.
      const [reservada] = await tx
        .update(mensagensCliente)
        .set({ texto, enviado: montar(LINK_ESCONDIDO), ...comLink, para: formatarTelefone(para), situacao: "enviada", aprovadaPor: c.get("userId"), aprovadaEm: agora, enviadaEm: agora, erro: null })
        .where(and(eq(mensagensCliente.id, mensagemId), inArray(mensagensCliente.situacao, ["rascunho", "falhou"])))
        .returning({ id: mensagensCliente.id });
      if (!reservada) falha(409, "ja_enviada", "Esta mensagem já saiu ou foi descartada.");
      return { para, texto: montar(link), clienteId: l.cliente.id, tipo: l.m.tipo };
    });
    try {
      await enviarWhatsapp(wameow, envio.para, envio.texto);
    } catch (err) {
      const erro = err instanceof Error ? err.message.slice(0, 300) : String(err);
      deps.log("mensagem ao cliente não saiu", { mensagemId, error: erro });
      await tenant(c, deps, (tx) => tx.update(mensagensCliente).set({ situacao: "falhou", enviadaEm: null, erro }).where(eq(mensagensCliente.id, mensagemId)));
      falha(503, "whatsapp_falhou", "O WhatsApp não aceitou a mensagem agora. Tente de novo em alguns minutos.");
    }
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "mensagem_cliente.enviada", detalhes: { mensagemId, clienteId: envio.clienteId, tipo: envio.tipo }, ip: ip(c) }, deps.log);
    return tenant(c, deps, async (tx) => {
      const l = await carregar(tx, c, deps, mensagemId);
      return c.json(naTela(l.m, l.cliente, l.id_, l.pessoas));
    });
  });
}
