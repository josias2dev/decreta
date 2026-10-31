import { diaDoInstante, ehDia, hojeEm, horaLocal, instanteLocal, nomeDaAudiencia, somarDias, urgenciaDoPrazo } from "@decreta/core";
import { audiencias, prazos, processos, tarefas } from "@decreta/db";
import { itemDoChecklist } from "@decreta/ia";
import { and, asc, eq, gte, isNull, lt, lte, ne } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { naTela, ultimaAnalise } from "../servicos/analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, falha, id, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const dia = z.string().refine(ehDia, "data inválida");
const hora = z.string().regex(/^\d{2}:\d{2}$/, "hora inválida");

/** Preparações antigas vinham com "[ ]" em cada item do checklist. */
function preparacaoNaTela(a: ReturnType<typeof naTela>) {
  const checklist = (a?.conteudo as { checklist?: unknown } | undefined)?.checklist;
  if (!a || !Array.isArray(checklist)) return a;
  return { ...a, conteudo: { ...a.conteudo, checklist: checklist.map((t) => itemDoChecklist(String(t))) } };
}

export function rotasDaAgenda(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  /** Audiências, vencimentos e tarefas, dia a dia (padrão: as próximas duas semanas). */
  app.get("/agenda", async (c) => {
    const tz = c.get("timezone");
    const hoje = hojeEm(tz);
    const de = ehDia(c.req.query("de")) ? c.req.query("de")! : hoje;
    const ate = ehDia(c.req.query("ate")) ? c.req.query("ate")! : somarDias(de, 13);
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const cal = await calendarioDoEscritorio(tx, await tribunalPadrao(tx, c.get("orgId")));
      const proc = { titulo: processos.titulo, cnj: processos.cnj };
      const [auds, przs, tars] = await Promise.all([
        tx
          .select({ a: audiencias, processo: proc })
          .from(audiencias)
          .innerJoin(processos, eq(processos.id, audiencias.processoId))
          .where(and(ne(audiencias.situacao, "cancelada"), gte(audiencias.em, instanteLocal(de, "00:00", tz)), lt(audiencias.em, instanteLocal(somarDias(ate, 1), "00:00", tz))))
          .orderBy(asc(audiencias.em)),
        tx
          .select({ p: prazos, processo: proc })
          .from(prazos)
          .innerJoin(processos, eq(processos.id, prazos.processoId))
          .where(and(eq(prazos.situacao, "aberto"), gte(prazos.fim, de), lte(prazos.fim, ate)))
          .orderBy(asc(prazos.fim)),
        tx.select().from(tarefas).where(and(gte(tarefas.dia, de), lte(tarefas.dia, ate))).orderBy(asc(tarefas.dia)),
      ]);
      const dias = new Map<string, { dia: string; itens: unknown[] }>();
      const em = (d: string) => {
        let x = dias.get(d);
        if (!x) dias.set(d, (x = { dia: d, itens: [] }));
        return x.itens;
      };
      for (const { a, processo } of auds)
        em(diaDoInstante(a.em, tz)).push({ tipo: "audiencia", id: a.id, hora: horaLocal(a.em, tz), titulo: nomeDaAudiencia(a.tipo), porVideo: a.porVideo, processo: { id: a.processoId, ...processo }, responsavel: resumir(pessoas, a.responsavelId), situacao: a.situacao });
      for (const { p, processo } of przs)
        em(p.fim).push({ tipo: "prazo", id: p.id, titulo: p.tipo, urgencia: urgenciaDoPrazo(p, hoje, cal), processo: { id: p.processoId, ...processo }, responsavel: resumir(pessoas, p.responsavelId), aConfirmar: !p.confirmadoEm });
      for (const t of tars) em(t.dia).push({ tipo: "tarefa", id: t.id, titulo: t.titulo, detalhe: t.detalhe, concluida: !!t.concluidaEm, processoId: t.processoId, responsavel: resumir(pessoas, t.responsavelId) });
      return c.json({ hoje, de, ate, dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)) });
    });
  });

  app.get("/audiencias/:id", async (c) => {
    const audienciaId = id(c);
    const tz = c.get("timezone");
    return tenant(c, deps, async (tx) => {
      const [linha] = await tx.select({ a: audiencias, processo: processos }).from(audiencias).innerJoin(processos, eq(processos.id, audiencias.processoId)).where(eq(audiencias.id, audienciaId));
      if (!linha) falha(404, "nao_encontrado");
      const { a, processo } = linha;
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const ctx = await carregarContexto(tx, processo.id, { documentos: true });
      return c.json({
        id: a.id,
        dia: diaDoInstante(a.em, tz),
        hora: horaLocal(a.em, tz),
        em: a.em.toISOString(),
        tipo: a.tipo,
        porVideo: a.porVideo,
        local: a.local,
        situacao: a.situacao,
        checklist: a.checklist.map((i) => ({ ...i, texto: itemDoChecklist(i.texto) })),
        responsavel: resumir(pessoas, a.responsavelId),
        processo: { id: processo.id, titulo: processo.titulo, cnj: processo.cnj, orgao: processo.orgao, comarca: processo.comarca, semIa: ctx?.semIa ?? false },
        preparacao: preparacaoNaTela(naTela(await ultimaAnalise(tx, "audiencia", a.id, "preparar-audiencia"), ctx?.base)),
      });
    });
  });

  app.post("/audiencias", async (c) => {
    const b = await corpo(c, z.object({ processoId: z.string().uuid(), dia, hora, tipo: z.string().trim().min(2).max(120), porVideo: z.boolean().default(false), local: z.string().max(500).nullable().optional(), responsavelId: z.string().nullable().optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, b.processoId));
      if (!p) falha(404, "processo_nao_encontrado");
      return (
        await tx
          .insert(audiencias)
          .values({ organizationId: c.get("orgId"), processoId: b.processoId, em: instanteLocal(b.dia, b.hora, c.get("timezone")), tipo: b.tipo, porVideo: b.porVideo, local: b.local ?? null, responsavelId: b.responsavelId === undefined ? p.responsavelId : b.responsavelId })
          .returning({ id: audiencias.id })
      )[0];
    });
    return c.json(r, 201);
  });

  app.put("/audiencias/:id", async (c) => {
    const audienciaId = id(c);
    const b = await corpo(
      c,
      z.object({
        dia: dia.optional(),
        hora: hora.optional(),
        tipo: z.string().trim().min(2).max(120).optional(),
        porVideo: z.boolean().optional(),
        local: z.string().max(500).nullable().optional(),
        responsavelId: z.string().nullable().optional(),
        situacao: z.enum(["marcada", "realizada", "cancelada", "redesignada"]).optional(),
        checklist: z.array(z.object({ texto: z.string().trim().min(1).max(300), feito: z.boolean() })).max(60).optional(),
      }),
    );
    await tenant(c, deps, async (tx) => {
      const [a] = await tx.select().from(audiencias).where(eq(audiencias.id, audienciaId));
      if (!a) falha(404, "nao_encontrado");
      const tz = c.get("timezone");
      const novoEm = b.dia || b.hora ? instanteLocal(b.dia ?? diaDoInstante(a.em, tz), b.hora ?? horaLocal(a.em, tz), tz) : undefined;
      const { dia: _d, hora: _h, ...resto } = b;
      await tx
        .update(audiencias)
        .set({ ...Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined)), ...(novoEm ? { em: novoEm } : {}) })
        .where(eq(audiencias.id, audienciaId));
    });
    return c.json({ ok: true });
  });

  app.post("/tarefas", async (c) => {
    const b = await corpo(
      c,
      z.object({
        titulo: z.string().trim().min(2).max(300),
        detalhe: z.string().max(2000).nullable().optional(),
        dia,
        responsavelId: z.string().nullable().optional(),
        processoId: z.string().uuid().nullable().optional(),
        clienteId: z.string().uuid().nullable().optional(),
        negocioId: z.string().uuid().nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, async (tx) =>
      (
        await tx
          .insert(tarefas)
          .values({ organizationId: c.get("orgId"), ...b, responsavelId: b.responsavelId === undefined ? c.get("userId") : b.responsavelId, criadaPor: c.get("userId") })
          .returning({ id: tarefas.id })
      )[0],
    );
    return c.json(r, 201);
  });

  app.post("/tarefas/:id/concluir", async (c) => {
    const tarefaId = id(c);
    await tenant(c, deps, (tx) => tx.update(tarefas).set({ concluidaEm: new Date() }).where(and(eq(tarefas.id, tarefaId), isNull(tarefas.concluidaEm))));
    return c.json({ ok: true });
  });

  app.post("/tarefas/:id/reabrir", async (c) => {
    const tarefaId = id(c);
    await tenant(c, deps, (tx) => tx.update(tarefas).set({ concluidaEm: null }).where(eq(tarefas.id, tarefaId)));
    return c.json({ ok: true });
  });

  app.delete("/tarefas/:id", async (c) => {
    const tarefaId = id(c);
    await tenant(c, deps, (tx) => tx.delete(tarefas).where(eq(tarefas.id, tarefaId)));
    return c.json({ ok: true });
  });
}
