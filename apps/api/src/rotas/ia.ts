import { horaLocal, diaPorExtenso, diaDoInstante } from "@decreta/core";
import { analises, audiencias, clientes, mensagensIa, pecas, prazos, processos, publicacoes, retornosIa, withTenant, type Tx } from "@decreta/db";
import {
  briefingDoPrazo,
  conversar,
  itemDoChecklist,
  prepararAudiencia,
  resumirAtendimento,
  resumirAutos,
  RODAPE_IA,
  IaRecusou,
  type Ia,
  type MensagemDaConversa,
} from "@decreta/ia";
import { and, asc, desc, eq, gt, isNull, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { analisar } from "../servicos/analises.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, ehSocio, falha, id, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

/** O nome de cada ação da IA como a equipe reconhece. */
export const ROTULO_DA_ACAO: Record<string, string> = {
  "sugerir-prazo": "Prazo sugerido da publicação",
  "briefing-prazo": "Briefing do prazo",
  "resumo-autos": "Resumo dos autos",
  "preparar-audiencia": "Preparação de audiência",
  "ler-sentenca": "Leitura da sentença",
  "conferir-pasta": "Conferência da pasta",
  "gerar-documento": "Peça gerada",
};

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
        // Com o ano e o local: sem eles, a IA pede para confirmar o que o sistema já sabe.
        const dia = diaDoInstante(au.em, tz);
        const quando = `${diaPorExtenso(dia)} de ${dia.slice(0, 4)}, às ${horaLocal(au.em, tz)}`;
        return { entrada: { audiencia: { tipo: au.tipo, em: quando, porVideo: au.porVideo, local: au.local }, contextoDoProcesso: ctx?.texto ?? "" }, base: ctx?.base ?? "", fonte: ctx?.fonte ?? "Dados do processo" };
      },
      executar: (e) => prepararAudiencia(ia, e),
    });
    if (!a) falha(404, "nao_encontrado");
    // O checklist da IA vira o checklist marcável da audiência (sem apagar o que já foi marcado).
    if (a.situacao === "pronto") {
      const itens = ((a.conteudo as { checklist?: string[] }).checklist ?? []).map(itemDoChecklist).filter(Boolean);
      await tenant(c, deps, async (tx) => {
        const [au] = await tx.select({ checklist: audiencias.checklist }).from(audiencias).where(eq(audiencias.id, audienciaId));
        // Os itens antigos também saem sem o "[ ]" que a IA escrevia antes.
        const atuais = (au?.checklist ?? []).map((i) => ({ ...i, texto: itemDoChecklist(i.texto) }));
        const existentes = new Set(atuais.map((i) => i.texto));
        const novos = [...new Set(itens)].filter((t) => !existentes.has(t)).map((texto) => ({ texto, feito: false }));
        const mudou = novos.length > 0 || atuais.some((i, n) => i.texto !== au!.checklist[n]!.texto);
        if (mudou) await tx.update(audiencias).set({ checklist: [...atuais, ...novos] }).where(eq(audiencias.id, audienciaId));
      });
    }
    return c.json(a);
  });

  /* ---------------- Retorno sobre a IA ---------------- */

  /** "Útil" ou "errado" numa análise ou numa peça. Votar de novo troca o voto. */
  app.post("/ia/retorno", async (c) => {
    const b = await corpo(
      c,
      z
        .object({ analiseId: z.string().uuid().optional(), pecaId: z.string().uuid().optional(), util: z.boolean(), comentario: z.string().trim().max(2000).nullable().optional() })
        .refine((x) => !!x.analiseId !== !!x.pecaId, "Diga a análise ou a peça."),
    );
    await tenant(c, deps, async (tx) => {
      let acao: string;
      if (b.analiseId) {
        const [a] = await tx.select({ acao: analises.acao }).from(analises).where(eq(analises.id, b.analiseId));
        if (!a) falha(404, "nao_encontrado");
        acao = a.acao;
      } else {
        const [p] = await tx.select({ id: pecas.id }).from(pecas).where(eq(pecas.id, b.pecaId!));
        if (!p) falha(404, "nao_encontrado");
        acao = "gerar-documento";
      }
      const valores = { util: b.util, comentario: b.util ? null : (b.comentario ?? null) };
      await tx
        .insert(retornosIa)
        .values({ organizationId: c.get("orgId"), acao, analiseId: b.analiseId ?? null, pecaId: b.pecaId ?? null, userId: c.get("userId"), ...valores })
        .onConflictDoUpdate({ target: b.analiseId ? [retornosIa.organizationId, retornosIa.analiseId, retornosIa.userId] : [retornosIa.organizationId, retornosIa.pecaId, retornosIa.userId], set: valores });
    });
    return c.json({ ok: true });
  });

  /** Para os sócios: como a IA foi avaliada nos últimos 90 dias e o que disseram que estava errado. */
  app.get("/ia/retornos", async (c) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios veem o retorno sobre a IA.");
    const desde = new Date(Date.now() - 90 * 86_400_000);
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const porAcao = await tx
        .select({ acao: retornosIa.acao, uteis: sql<number>`count(*) filter (where ${retornosIa.util})::int`, errados: sql<number>`count(*) filter (where not ${retornosIa.util})::int` })
        .from(retornosIa)
        .where(gt(retornosIa.updatedAt, desde))
        .groupBy(retornosIa.acao);
      const errados = await tx
        .select({ r: retornosIa, alvo: analises.alvo, alvoId: analises.alvoId, processoId: pecas.processoId })
        .from(retornosIa)
        .leftJoin(analises, eq(analises.id, retornosIa.analiseId))
        .leftJoin(pecas, eq(pecas.id, retornosIa.pecaId))
        .where(and(eq(retornosIa.util, false), gt(retornosIa.updatedAt, desde)))
        .orderBy(desc(retornosIa.updatedAt))
        .limit(50);
      return c.json({
        porAcao: porAcao.map((x) => ({ ...x, rotulo: ROTULO_DA_ACAO[x.acao] ?? x.acao })).sort((a, b) => b.errados - a.errados),
        errados: errados.map(({ r, alvo, alvoId, processoId }) => ({
          id: r.id,
          acao: r.acao,
          rotulo: ROTULO_DA_ACAO[r.acao] ?? r.acao,
          comentario: r.comentario,
          em: r.updatedAt.toISOString(),
          pessoa: resumir(pessoas, r.userId),
          /** Onde a saída está, para abrir e ver. */
          onde: r.pecaId ? { tipo: "peca" as const, id: r.pecaId, processoId } : alvo && alvoId ? { tipo: alvo, id: alvoId } : null,
        })),
      });
    });
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
