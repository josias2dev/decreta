/**
 * As rotas do WhatsApp:
 *
 * - `/api/whatsapp/webhook` (sem login): o cadastro do webhook na Meta (GET com o desafio) e as mensagens
 *   e os status (POST com a assinatura do corpo). Sem a assinatura certa, nada é lido.
 * - `/api/app/whatsapp/*` (a pessoa logada): ligar, renovar e desligar o WhatsApp, e os avisos dela.
 * - `/api/plataforma/whatsapp/*` e `/api/plataforma/laboratorio/*` (os operadores): as conversas e o Laboratório.
 */
import { telefoneWhatsapp } from "@decreta/core";
import { equipe, propostas, prazos, processos, publicacoes, withTenant } from "@decreta/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { limitador } from "../limitador.ts";
import { corpo, falha, tenant, type Ambiente, type DepsDasRotas } from "../rotas/base.ts";
import { canalEmMemoria, FalhaNoCanal, type Canal } from "./canal.ts";
import { receberDoWebhook, type PedidoDoWhatsapp } from "./entrada.ts";
import { assinaturaConfere, lerWebhook, respostaDoDesafio } from "./meta.ts";
import { abrirConversa, conteudoDaConversa, conversaDoLaboratorio, conversasDaPlataforma, escreverComoSuporte, limparLaboratorio, noLaboratorio, pausarConversa, pessoaDoLaboratorio, pessoasDoLaboratorio, RecusaDoPainel, escritorioDoLaboratorio } from "./painel.ts";
import type { DepsDoAgente } from "./tipos.ts";
import { confirmarCodigo, desligarVinculo, estadoDoVinculo, gerarCodigo, renovarVinculo, telefoneEscondido } from "./vinculo.ts";

/** O WhatsApp oficial ligado no servidor: o canal da Meta e o que a tela precisa para ligar. */
export interface WhatsappDoServidor {
  canal: Canal;
  /** O número do Decreta, só dígitos (55 + DDD + número): o link que abre a conversa. */
  numero: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
  /** Como falar com uma pessoa da equipe do Decreta. */
  suporte: string;
}

/** O corpo de um lote da Meta tem poucos KB; acima disto nem é lido. */
const TETO_DO_WEBHOOK = 512 * 1024;

export function rotasDoWebhook(deps: { agente: DepsDoAgente; whatsapp: WhatsappDoServidor; enfileirar: (p: PedidoDoWhatsapp) => Promise<void> }) {
  const app = new Hono();
  app.get("/webhook", (c) => {
    const desafio = respostaDoDesafio({ mode: c.req.query("hub.mode"), token: c.req.query("hub.verify_token"), challenge: c.req.query("hub.challenge") }, deps.whatsapp.verifyToken);
    return desafio === null ? c.text("", 403) : c.text(desafio, 200);
  });
  app.post("/webhook", bodyLimit({ maxSize: TETO_DO_WEBHOOK, onError: (c) => c.json({ erro: "muito_grande" }, 413) }), async (c) => {
    const cru = await c.req.text();
    if (!assinaturaConfere(cru, c.req.header("x-hub-signature-256"), deps.whatsapp.appSecret)) return c.json({ erro: "nao_autorizado" }, 401);
    let json: unknown = null;
    try {
      json = JSON.parse(cru);
    } catch {
      return c.json({ ok: true });
    }
    // Responde 200 só depois de gravar: o que foi gravado não se perde, e o que falhou a Meta manda de novo.
    await receberDoWebhook(deps.agente, lerWebhook(json, deps.whatsapp.phoneNumberId), deps.enfileirar);
    return c.json({ ok: true });
  });
  return app;
}

/**
 * Cada código que sai custa e chega no WhatsApp de alguém: até 5 por hora por pessoa, 5 por dia para o mesmo
 * número e 100 por hora no servidor inteiro (a rede de segurança de quem abre contas para mandar código a
 * terceiros). E até 10 códigos digitados por hora por pessoa: pedir um código novo não zera os palpites.
 */
const HORA_MS = 60 * 60_000;
const CODIGOS_POR_PESSOA = { janelaMs: HORA_MS, maximo: 5 };
const CODIGOS_POR_NUMERO = { janelaMs: 24 * HORA_MS, maximo: 5 };
const CODIGOS_NO_SERVIDOR = { janelaMs: HORA_MS, maximo: 100 };
const PALPITES_POR_PESSOA = { janelaMs: HORA_MS, maximo: 10 };
const NUMERO = z.object({ telefone: z.string().max(40) });
const CODIGO = z.object({ codigo: z.string().max(20) });

const RECUSA_DO_CODIGO = {
  sem_codigo: [404, "Peça um código primeiro."],
  vencido: [410, "O código passou dos 10 minutos. Peça outro."],
  tentativas: [429, "Código errado 5 vezes. Peça outro."],
  numero_de_outra_pessoa: [409, "Este WhatsApp já está ligado à conta de outra pessoa no Decreta. Quem tem a conta desliga em Minha conta."],
} as const;

const AVISOS = z.object({ manha: z.boolean().optional(), quinzeHoras: z.boolean().optional(), prazoCurto: z.boolean().optional() });

/** Ligar, renovar e desligar o WhatsApp da pessoa logada, e os avisos dela. Sem o WhatsApp oficial no servidor, a tela diz que ainda não está ligado. */
export function rotasDoWhatsappNoApp(app: Hono<Ambiente>, deps: DepsDasRotas & { whatsapp?: WhatsappDoServidor | null }) {
  app.get("/whatsapp", async (c) => {
    const estado = await estadoDoVinculo(deps.db, c.get("userId"));
    const [e] = await tenant(c, deps, (tx) => tx.select({ manha: equipe.avisoManha, quinzeHoras: equipe.avisoQuinzeHoras, prazoCurto: equipe.avisoPrazoCurto, whatsapp: equipe.whatsapp }).from(equipe).where(eq(equipe.userId, c.get("userId"))));
    const { whatsapp: perfil = null, ...avisos } = e ?? { manha: true, quinzeHoras: true, prazoCurto: true };
    return c.json({
      servidor: !!deps.whatsapp,
      numero: deps.whatsapp?.numero ?? null,
      vinculo: estado.ligado ? { ...estado, outroEscritorio: estado.organizationId !== c.get("orgId") } : null,
      avisos,
      /** O número do perfil: a tela já o traz escrito para ligar. */
      perfil,
      demonstracao: c.get("demonstracao"),
    });
  });

  const porPessoa = limitador(CODIGOS_POR_PESSOA);
  const porNumero = limitador(CODIGOS_POR_NUMERO);
  const noServidor = limitador(CODIGOS_NO_SERVIDOR);
  const palpites = limitador(PALPITES_POR_PESSOA);

  /** O código de 6 dígitos para o número que a pessoa digitou: chega no WhatsApp dele, vale 10 minutos e uma vez. */
  app.post("/whatsapp/codigo", async (c) => {
    if (!deps.whatsapp) falha(503, "whatsapp_desligado", "O WhatsApp oficial do Decreta ainda não foi ligado neste servidor.");
    const telefone = telefoneWhatsapp((await corpo(c, NUMERO)).telefone);
    if (!telefone) falha(422, "whatsapp_invalido", "Confira o número: DDD e número, como (47) 99123-4567.");
    if (!porPessoa.permitir(c.get("userId")) || !porNumero.permitir(telefone)) falha(429, "muitos_codigos", "Já saíram códigos demais para você ou para este número. Espere um pouco e peça de novo.");
    if (!noServidor.permitir("todos")) {
      deps.log("whatsapp: o teto de códigos por hora do servidor foi atingido", {});
      falha(429, "muitos_codigos", "Muitos pedidos de código agora. Tente de novo em alguns minutos.");
    }
    // Na demonstração também liga, para testar o agente: as respostas avisam que os dados são inventados.
    const r = await gerarCodigo(deps.db, { userId: c.get("userId"), organizationId: c.get("orgId") }, telefone);
    if (!r.ok) falha(RECUSA_DO_CODIGO[r.motivo][0], r.motivo, RECUSA_DO_CODIGO[r.motivo][1]);
    try {
      await deps.whatsapp.canal.enviar({ telefone }, { tipo: "modelo", nome: "codigo_do_whatsapp", parametros: [r.codigo] });
    } catch (err) {
      deps.log("whatsapp: o código não saiu", { error: err instanceof Error ? err.message : String(err), codigo: err instanceof FalhaNoCanal ? err.codigo : null });
      falha(502, "codigo_nao_saiu", "O WhatsApp não aceitou mandar o código para este número. Confira o número e tente de novo.");
    }
    return c.json({ telefone: telefoneEscondido(telefone), expiraEm: r.expiraEm.toISOString() });
  });

  app.post("/whatsapp/confirmar", async (c) => {
    const digitado = (await corpo(c, CODIGO)).codigo.replace(/\D/g, "");
    // O que nem tem 6 dígitos não gasta tentativa.
    if (digitado.length !== 6) falha(422, "codigo_invalido", "O código tem 6 dígitos.");
    if (!palpites.permitir(c.get("userId"))) falha(429, "muitas_tentativas", "Tentativas demais na última hora. Espere um pouco e peça outro código.");
    const r = await confirmarCodigo(deps.db, c.get("userId"), digitado);
    if (!r.ok) {
      if (r.motivo === "errado") falha(422, "codigo_errado", `Código errado. ${r.restam === 1 ? "Resta 1 tentativa" : `Restam ${r.restam} tentativas`}.`);
      const [status, detalhe] = RECUSA_DO_CODIGO[r.motivo];
      falha(status, r.motivo, detalhe);
    }
    await registrar(deps.db, { organizationId: r.organizationId, userId: c.get("userId"), nome: c.get("userNome"), acao: "whatsapp.ligado", detalhes: { trocouDeNumero: r.trocouDeNumero }, ip: null }, deps.log);
    return c.json(await estadoDoVinculo(deps.db, c.get("userId")));
  });

  app.post("/whatsapp/renovar", async (c) => {
    const ok = await renovarVinculo(deps.db, c.get("userId"));
    if (!ok) falha(404, "nao_ligado", "Este WhatsApp não está ligado.");
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "whatsapp.renovado", detalhes: {}, ip: null }, deps.log);
    return c.json(await estadoDoVinculo(deps.db, c.get("userId")));
  });

  app.delete("/whatsapp", async (c) => {
    const ok = await desligarVinculo(deps.db, c.get("userId"));
    if (ok) await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "whatsapp.desligado", detalhes: {}, ip: null }, deps.log);
    return c.json({ ok: true });
  });

  app.put("/whatsapp/avisos", async (c) => {
    const b = await corpo(c, AVISOS);
    await tenant(c, deps, (tx) =>
      tx
        .update(equipe)
        .set({ ...(b.manha === undefined ? {} : { avisoManha: b.manha }), ...(b.quinzeHoras === undefined ? {} : { avisoQuinzeHoras: b.quinzeHoras }), ...(b.prazoCurto === undefined ? {} : { avisoPrazoCurto: b.prazoCurto }) })
        .where(eq(equipe.userId, c.get("userId"))),
    );
    return c.json({ ok: true });
  });
}

const ABRIR = z.object({ motivo: z.string().trim().min(10, "Escreva o motivo (pelo menos 10 caracteres).").max(300) });
const PAUSAR = z.object({ pausado: z.boolean() });
const ESCREVER = z.object({ texto: z.string().trim().min(1).max(2000) });
const NO_LABORATORIO = z.object({
  janelaAberta: z.boolean().default(true),
  texto: z.string().trim().min(1).max(2000).optional(),
  escolha: z.object({ id: z.string().min(1).max(256), titulo: z.string().max(100) }).optional(),
  aviso: z.enum(["resumo", "vence", "curto"]).optional(),
  publicacaoId: z.string().uuid().optional(),
});

/** A recusa do painel, ou o erro de validação, como a resposta da rota. */
function erroDoPainel(err: unknown) {
  if (err instanceof RecusaDoPainel) return Response.json({ erro: "recusado", detalhe: err.message }, { status: err.status });
  throw err;
}

async function lerCorpo<S extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, s: S): Promise<z.infer<S> | Response> {
  const r = s.safeParse(await c.req.json().catch(() => null));
  return r.success ? r.data : Response.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => i.message).join(" ") }, { status: 400 });
}

/** As conversas e o Laboratório no painel da plataforma. `agente`: monta as dependências do agente com o canal da rota (o da Meta, ou o da memória no Laboratório). */
export function rotasDoWhatsappNaPlataforma(app: Hono<{ Variables: { operador: string } }>, deps: { agente: (canal: Canal, origem: DepsDoAgente["origem"]) => DepsDoAgente; whatsapp: WhatsappDoServidor | null }) {
  const db = () => deps.agente(canalEmMemoria(), "laboratorio").db;

  app.get("/whatsapp/conversas", async (c) => {
    const antes = c.req.query("antes") || null;
    return c.json({ ligado: !!deps.whatsapp, conversas: await conversasDaPlataforma(db(), { limite: 100, antes }) });
  });

  /** Quem abriu qual conversa, e quando: por uma hora, a tela atualiza sem abrir (e registrar) de novo. Fica em memória: reiniciou, pede o motivo outra vez. */
  const abertas = new Map<string, number>();
  const chaveDaConversa = (operador: string, org: string, user: string) => `${operador}|${org}|${user}`;
  const UMA_HORA = 60 * 60_000;

  app.post("/whatsapp/conversas/:org/:user/abrir", async (c) => {
    const b = await lerCorpo(c, ABRIR);
    if (b instanceof Response) return b;
    try {
      const r = await abrirConversa(db(), { operador: c.get("operador"), organizationId: c.req.param("org"), userId: c.req.param("user"), motivo: b.motivo });
      abertas.set(chaveDaConversa(c.get("operador"), c.req.param("org"), c.req.param("user")), Date.now());
      return c.json(r);
    } catch (err) {
      return erroDoPainel(err);
    }
  });

  app.get("/whatsapp/conversas/:org/:user", async (c) => {
    const quando = abertas.get(chaveDaConversa(c.get("operador"), c.req.param("org"), c.req.param("user")));
    if (!quando || Date.now() - quando > UMA_HORA) return c.json({ erro: "abrir_com_motivo", detalhe: "Abra a conversa de novo, com o motivo." }, 403);
    return c.json(await conteudoDaConversa(db(), c.req.param("org"), c.req.param("user")));
  });

  app.post("/whatsapp/conversas/:org/:user/pausar", async (c) => {
    const b = await lerCorpo(c, PAUSAR);
    if (b instanceof Response) return b;
    try {
      await pausarConversa(db(), { operador: c.get("operador"), organizationId: c.req.param("org"), userId: c.req.param("user"), pausado: b.pausado });
      return c.json({ ok: true });
    } catch (err) {
      return erroDoPainel(err);
    }
  });

  app.post("/whatsapp/conversas/:org/:user/escrever", async (c) => {
    const b = await lerCorpo(c, ESCREVER);
    if (b instanceof Response) return b;
    if (!deps.whatsapp) return c.json({ erro: "whatsapp_desligado", detalhe: "O WhatsApp oficial não está ligado neste servidor." }, 503);
    try {
      await escreverComoSuporte(deps.agente(deps.whatsapp.canal, "agente"), { operador: c.get("operador"), organizationId: c.req.param("org"), userId: c.req.param("user"), texto: b.texto });
      return c.json({ ok: true });
    } catch (err) {
      return erroDoPainel(err);
    }
  });

  app.get("/laboratorio", async (c) => c.json(await pessoasDoLaboratorio(db())));

  /** As publicações da demonstração com prazo sugerido a confirmar: o aviso de prazo curto se dispara por uma delas. */
  app.get("/laboratorio/publicacoes", async (c) => {
    const org = await escritorioDoLaboratorio(db());
    if (!org) return c.json({ publicacoes: [] });
    const lista = await withTenant(db(), org.id, (tx) =>
      tx
        .select({ id: publicacoes.id, processo: processos.titulo, fim: prazos.fim, tipo: prazos.tipo })
        .from(prazos)
        .innerJoin(publicacoes, eq(publicacoes.id, prazos.publicacaoId))
        .innerJoin(processos, eq(processos.id, prazos.processoId))
        .where(and(eq(prazos.situacao, "aberto"), isNull(prazos.confirmadoEm)))
        .orderBy(prazos.fim)
        .limit(30),
    );
    return c.json({ publicacoes: lista });
  });

  app.get("/laboratorio/:user", async (c) => {
    try {
      const pessoa = await pessoaDoLaboratorio(db(), c.req.param("user"), true);
      const pendentes = await withTenant(db(), pessoa.organizationId, (tx) => tx.select({ id: propostas.id, tipo: propostas.tipo, texto: propostas.texto, expiraEm: propostas.expiraEm }).from(propostas).where(and(eq(propostas.userId, pessoa.userId), eq(propostas.situacao, "pendente"))).orderBy(desc(propostas.createdAt)).limit(20));
      return c.json({ ...(await conversaDoLaboratorio(db(), pessoa)), pendentes });
    } catch (err) {
      return erroDoPainel(err);
    }
  });

  app.post("/laboratorio/:user", async (c) => {
    const b = await lerCorpo(c, NO_LABORATORIO);
    if (b instanceof Response) return b;
    const pedido = b.aviso ? { aviso: b.aviso, publicacaoId: b.publicacaoId } : b.escolha ? { escolha: b.escolha } : b.texto ? { texto: b.texto } : null;
    if (!pedido) return c.json({ erro: "dados_invalidos", detalhe: "Mande um texto, uma escolha ou um aviso." }, 400);
    try {
      const agente = deps.agente(canalEmMemoria({ prefixo: "laboratorio" }), "laboratorio");
      const pessoa = await pessoaDoLaboratorio(agente.db, c.req.param("user"), b.janelaAberta);
      const r = await noLaboratorio(agente, pessoa, pedido);
      return c.json({ ...r, ...(await conversaDoLaboratorio(agente.db, pessoa)) });
    } catch (err) {
      return erroDoPainel(err);
    }
  });

  app.delete("/laboratorio/:user", async (c) => {
    try {
      const pessoa = await pessoaDoLaboratorio(db(), c.req.param("user"), true);
      await limparLaboratorio(db(), pessoa);
      return c.json({ ok: true });
    } catch (err) {
      return erroDoPainel(err);
    }
  });
}
