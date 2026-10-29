import { horaLocal, diaPorExtenso, diaDoInstante } from "@decreta/core";
import { audiencias, clientes, mensagensIa, prazos, processos, publicacoes, withTenant, type Tx } from "@decreta/db";
import {
  briefingDoPrazo,
  conversar,
  prepararAudiencia,
  resumirAtendimento,
  resumirAutos,
  RODAPE_IA,
  IaRecusou,
  type Ia,
  type MensagemDaConversa,
} from "@decreta/ia";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { analisar } from "../servicos/analises.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, falha, id, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

export function rotasDaIa(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const exigirIa = (): Ia => deps.ia ?? falha(503, "ia_desligada", "A IA ainda não foi ligada neste servidor.");

  app.post("/ia/briefing/:id", async (c) => {
    const ia = exigirIa();
    const prazoId = id(c);
    const a = await analisar(db, {
      organizationId: c.get("orgId"),
      alvo: "prazo",
      alvoId: prazoId,
      acao: "briefing-prazo",
      userId: c.get("userId"),
      log: deps.log,
      preparar: async (tx) => {
        const [p] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
        if (!p) return null;
        const [pub] = p.publicacaoId ? await tx.select().from(publicacoes).where(eq(publicacoes.id, p.publicacaoId)) : [];
        const ctx = await carregarContexto(tx, p.processoId, { documentos: true });
        const fonte = pub ? `DJEN · ${pub.disponibilizadaEm.split("-").reverse().join("/")}${ctx?.ultimoEvento ? ` · autos até o evento ${ctx.ultimoEvento}` : ""}` : (ctx?.fonte ?? "Dados do processo");
        return { entrada: { prazo: { tipo: p.tipo, fim: p.fim, fundamento: p.fundamento }, publicacao: pub?.texto ?? null, contextoDoProcesso: ctx?.texto ?? "" }, base: ctx?.base ?? "", fonte };
      },
      executar: (e) => briefingDoPrazo(ia, e),
    });
    return a ? c.json(a) : falha(404, "nao_encontrado");
  });

  app.post("/ia/resumo/:id", async (c) => {
    const ia = exigirIa();
    const processoId = id(c);
    const a = await analisar(db, {
      organizationId: c.get("orgId"),
      alvo: "processo",
      alvoId: processoId,
      acao: "resumo-autos",
      userId: c.get("userId"),
      log: deps.log,
      preparar: async (tx) => {
        const ctx = await carregarContexto(tx, processoId, { documentos: true });
        if (!ctx) return null;
        const hoje = new Date().toISOString().slice(0, 10).split("-").reverse().join("/");
        return { entrada: ctx.texto, base: ctx.base, fonte: ctx.ultimoEvento ? `Autos até o evento ${ctx.ultimoEvento} · ${hoje}` : `${ctx.fonte} · ${hoje}` };
      },
      executar: (texto) => resumirAutos(ia, texto),
    });
    return a ? c.json(a) : falha(404, "nao_encontrado");
  });

  app.post("/ia/audiencia/:id", async (c) => {
    const ia = exigirIa();
    const audienciaId = id(c);
    const tz = c.get("timezone");
    const a = await analisar(db, {
      organizationId: c.get("orgId"),
      alvo: "audiencia",
      alvoId: audienciaId,
      acao: "preparar-audiencia",
      userId: c.get("userId"),
      log: deps.log,
      preparar: async (tx) => {
        const [au] = await tx.select().from(audiencias).where(eq(audiencias.id, audienciaId));
        if (!au) return null;
        const ctx = await carregarContexto(tx, au.processoId, { documentos: true });
        const quando = `${diaPorExtenso(diaDoInstante(au.em, tz))}, às ${horaLocal(au.em, tz)}`;
        return { entrada: { audiencia: { tipo: au.tipo, em: quando, porVideo: au.porVideo }, contextoDoProcesso: ctx?.texto ?? "" }, base: ctx?.base ?? "", fonte: ctx?.fonte ?? "Dados do processo" };
      },
      executar: (e) => prepararAudiencia(ia, e),
    });
    if (!a) falha(404, "nao_encontrado");
    // O checklist da IA vira o checklist marcável da audiência (sem apagar o que já foi marcado).
    if (a.situacao === "pronto") {
      const itens = (a.conteudo as { checklist?: string[] }).checklist ?? [];
      await tenant(c, deps, async (tx) => {
        const [au] = await tx.select({ checklist: audiencias.checklist }).from(audiencias).where(eq(audiencias.id, audienciaId));
        const existentes = new Set((au?.checklist ?? []).map((i) => i.texto));
        const novos = itens.filter((t) => !existentes.has(t)).map((texto) => ({ texto, feito: false }));
        if (novos.length) await tx.update(audiencias).set({ checklist: [...(au?.checklist ?? []), ...novos] }).where(eq(audiencias.id, audienciaId));
      });
    }
    return c.json(a);
  });

  /* ---------------- Chat do processo (compartilhado pela equipe) ---------------- */

  app.get("/ia/chat/:id", async (c) => {
    const processoId = id(c);
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const msgs = await tx.select().from(mensagensIa).where(eq(mensagensIa.processoId, processoId)).orderBy(asc(mensagensIa.createdAt)).limit(200);
      return c.json({ rodape: RODAPE_IA, mensagens: msgs.map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, em: m.createdAt.toISOString(), autor: m.papel === "pessoa" ? resumir(pessoas, m.userId) : null })) });
    });
  });

  app.post("/ia/chat/:id", async (c) => {
    const ia = exigirIa();
    const processoId = id(c);
    const { texto } = await corpo(c, z.object({ texto: z.string().trim().min(1).max(4000) }));
    const preparado = await tenant(c, deps, async (tx) => {
      const ctx = await carregarContexto(tx, processoId, { documentos: true });
      if (!ctx) return null;
      const anteriores = await tx.select().from(mensagensIa).where(eq(mensagensIa.processoId, processoId)).orderBy(desc(mensagensIa.createdAt)).limit(20);
      await tx.insert(mensagensIa).values({ organizationId: c.get("orgId"), processoId, userId: c.get("userId"), papel: "pessoa", texto });
      return { ctx, historico: [...anteriores.reverse().map((m) => ({ papel: m.papel, texto: m.texto })), { papel: "pessoa" as const, texto }] };
    });
    if (!preparado) falha(404, "nao_encontrado");
    return responderAosPoucos(c, deps, ia, { metodo: "chat-processo", contexto: preparado.ctx.texto, historico: preparado.historico }, (tx, resposta) =>
      tx.insert(mensagensIa).values({ organizationId: c.get("orgId"), processoId, userId: c.get("userId"), papel: "ia", texto: resposta }).then(() => {}),
    );
  });

  /* ---------------- Perguntar (de cada pessoa) ---------------- */

  app.get("/ia/perguntar", async (c) => {
    const msgs = await tenant(c, deps, (tx) =>
      tx
        .select()
        .from(mensagensIa)
        .where(and(isNull(mensagensIa.processoId), eq(mensagensIa.userId, c.get("userId"))))
        .orderBy(desc(mensagensIa.createdAt))
        .limit(60),
    );
    return c.json({ rodape: RODAPE_IA, mensagens: msgs.reverse().map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, em: m.createdAt.toISOString(), autor: null })) });
  });

  app.post("/ia/perguntar", async (c) => {
    const ia = exigirIa();
    const b = await corpo(
      c,
      z.object({
        texto: z.string().trim().min(1).max(4000),
        modo: z.enum(["pergunte", "jurisprudencia"]).default("pergunte"),
        /** Onde a pessoa estava quando abriu o Perguntar. */
        processoId: z.string().uuid().nullable().optional(),
        clienteId: z.string().uuid().nullable().optional(),
      }),
    );
    const preparado = await tenant(c, deps, async (tx) => {
      let contexto = `Escritório: ${c.get("orgNome")}. Pessoa que pergunta: ${c.get("userNome")}.`;
      if (b.processoId) {
        const ctx = await carregarContexto(tx, b.processoId, { documentos: true });
        if (ctx) contexto += `\n\nA pessoa está vendo este processo:\n${ctx.texto}`;
      } else if (b.clienteId) {
        contexto += await contextoDoCliente(tx, b.clienteId);
      }
      const anteriores = await tx
        .select()
        .from(mensagensIa)
        .where(and(isNull(mensagensIa.processoId), eq(mensagensIa.userId, c.get("userId"))))
        .orderBy(desc(mensagensIa.createdAt))
        .limit(12);
      await tx.insert(mensagensIa).values({ organizationId: c.get("orgId"), processoId: null, userId: c.get("userId"), papel: "pessoa", texto: b.texto });
      return { contexto, historico: [...anteriores.reverse().map((m) => ({ papel: m.papel, texto: m.texto })), { papel: "pessoa" as const, texto: b.texto }] };
    });
    return responderAosPoucos(c, deps, ia, { metodo: b.modo === "jurisprudencia" ? "jurisprudencia" : "perguntar", contexto: preparado.contexto, historico: preparado.historico }, (tx, resposta) =>
      tx.insert(mensagensIa).values({ organizationId: c.get("orgId"), processoId: null, userId: c.get("userId"), papel: "ia", texto: resposta }).then(() => {}),
    );
  });

  app.post("/ia/atendimento", async (c) => {
    const ia = exigirIa();
    const { transcricao } = await corpo(c, z.object({ transcricao: z.string().trim().min(1).max(200_000) }));
    try {
      return c.json({ situacao: "pronto", conteudo: await resumirAtendimento(ia, transcricao) });
    } catch (err) {
      if (err instanceof IaRecusou) return c.json({ situacao: "recusa", conteudo: { recusa: err.motivo } });
      throw err;
    }
  });

  /** Áudio do atendimento → texto (pelo gateway). */
  app.post("/ia/transcrever", async (c) => {
    const ia = exigirIa();
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("audio");
    if (!(arquivo instanceof File)) falha(400, "sem_audio");
    if (arquivo.size > 25 * 1024 * 1024) falha(422, "audio_grande", "O áudio passa de 25 MB. Grave em partes.");
    const texto = await ia.transcrever(new Uint8Array(await arquivo.arrayBuffer()), arquivo.type || "audio/ogg");
    return c.json({ texto });
  });
}

async function contextoDoCliente(tx: Tx, clienteId: string): Promise<string> {
  const [cl] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
  if (!cl) return "";
  const ps = await tx.select({ titulo: processos.titulo, cnj: processos.cnj, situacao: processos.situacao }).from(processos).where(eq(processos.clienteId, clienteId));
  return `\n\nA pessoa está vendo a ficha do cliente ${cl.nome}${cl.observacoes ? ` (${cl.observacoes})` : ""}. Processos: ${ps.map((p) => `${p.titulo} (${p.cnj ?? "extrajudicial"}, ${p.situacao})`).join("; ") || "nenhum"}.`;
}

/** A resposta vai chegando na tela; no fim, é gravada. Se a IA cair no meio, grava o que veio com um aviso. */
function responderAosPoucos(
  c: C,
  deps: DepsDasRotas,
  ia: Ia,
  pedido: { metodo: "chat-processo" | "perguntar" | "jurisprudencia"; contexto: string; historico: MensagemDaConversa[] },
  gravar: (tx: Tx, resposta: string) => Promise<void>,
) {
  const orgId = c.get("orgId");
  const r = conversar(ia, pedido, c.req.raw.signal);
  const encoder = new TextEncoder();
  let resposta = "";
  const corpoDaResposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const pedaco of r.textStream) {
          resposta += pedaco;
          controller.enqueue(encoder.encode(pedaco));
        }
      } catch (err) {
        deps.log("conversa com a IA caiu", { metodo: pedido.metodo, error: err instanceof Error ? err.message : String(err) });
        const aviso = resposta ? "\n\n[A resposta parou no meio. Pergunte de novo.]" : "Não consegui responder agora. Tente de novo em instantes.";
        resposta += aviso;
        controller.enqueue(encoder.encode(aviso));
      } finally {
        controller.close();
        if (resposta.trim()) await withTenant(deps.db, orgId, (tx) => gravar(tx, resposta)).catch(() => {});
      }
    },
  });
  return new Response(corpoDaResposta, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff" } });
}
