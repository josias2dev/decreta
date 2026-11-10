/**
 * As rotas do WhatsApp:
 *
 * - `/api/whatsapp/webhook` (sem login): o cadastro do webhook na Meta (GET com o desafio) e as mensagens
 *   e os status (POST com a assinatura do corpo). Sem a assinatura certa, nada é lido.
 * - `/api/app/whatsapp/*` (a pessoa logada): ligar, renovar e desligar o WhatsApp, e os avisos dela.
 * - `/api/plataforma/whatsapp/*` e `/api/plataforma/laboratorio/*` (os operadores): as conversas e o Laboratório.
 */
import { equipe, propostas, prazos, processos, publicacoes, withTenant } from "@decreta/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { corpo, falha, tenant, type Ambiente, type DepsDasRotas } from "../rotas/base.ts";
import { canalEmMemoria, type Canal } from "./canal.ts";
import { receberDoWebhook, type PedidoDoWhatsapp } from "./entrada.ts";
import { assinaturaConfere, lerWebhook, respostaDoDesafio } from "./meta.ts";
import { abrirConversa, conteudoDaConversa, conversaDoLaboratorio, conversasDaPlataforma, escreverComoSuporte, limparLaboratorio, noLaboratorio, pausarConversa, pessoaDoLaboratorio, pessoasDoLaboratorio, RecusaDoPainel, escritorioDoLaboratorio } from "./painel.ts";
import type { DepsDoAgente } from "./tipos.ts";
import { desligarVinculo, estadoDoVinculo, gerarCodigo, linkDoCodigo, renovarVinculo } from "./vinculo.ts";

/** O WhatsApp oficial ligado no servidor: o canal da Meta e o que a tela precisa para ligar. */
export interface WhatsappDoServidor {
  canal: Canal;
  /** O número do Decreta, só dígitos (55 + DDD + número): o link do código e o aviso da tela. */
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

const AVISOS = z.object({ manha: z.boolean().optional(), quinzeHoras: z.boolean().optional(), prazoCurto: z.boolean().optional() });

/** Ligar, renovar e desligar o WhatsApp da pessoa logada, e os avisos dela. Sem o WhatsApp oficial no servidor, a tela diz que ainda não está ligado. */
export function rotasDoWhatsappNoApp(app: Hono<Ambiente>, deps: DepsDasRotas & { whatsapp?: WhatsappDoServidor | null }) {
  app.get("/whatsapp", async (c) => {
    const estado = await estadoDoVinculo(deps.db, c.get("userId"));
    const [e] = await tenant(c, deps, (tx) => tx.select({ manha: equipe.avisoManha, quinzeHoras: equipe.avisoQuinzeHoras, prazoCurto: equipe.avisoPrazoCurto }).from(equipe).where(eq(equipe.userId, c.get("userId"))));
    return c.json({
      servidor: !!deps.whatsapp,
      numero: deps.whatsapp?.numero ?? null,
      vinculo: estado.ligado ? { ...estado, outroEscritorio: estado.organizationId !== c.get("orgId") } : null,
      avisos: e ?? { manha: true, quinzeHoras: true, prazoCurto: true },
      demonstracao: c.get("demonstracao"),
    });
  });

  /** Um código novo (10 minutos, uma vez): a tela mostra o link e o QR que abrem o WhatsApp com ele escrito. */
  app.post("/whatsapp/codigo", async (c) => {
    if (!deps.whatsapp) falha(503, "whatsapp_desligado", "O WhatsApp oficial do Decreta ainda não foi ligado neste servidor.");
    // Na demonstração também liga, para testar o agente: as respostas avisam que os dados são inventados.
    const { codigo, expiraEm } = await gerarCodigo(deps.db, { userId: c.get("userId"), organizationId: c.get("orgId") });
    return c.json({ codigo: `DECRETA ${codigo.slice(0, 4)}-${codigo.slice(4)}`, link: linkDoCodigo(deps.whatsapp.numero, codigo), expiraEm: expiraEm.toISOString() });
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
