import { ehDia } from "@decreta/core";
import { alvaras, clientes, negocios, processos } from "@decreta/db";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, falha, id, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

/** Checklist padrão da triagem: o que a pasta de quem chega precisa ter. */
export const CHECKLIST_DA_TRIAGEM = ["Documento com foto (RG ou CNH)", "CPF", "Comprovante de residência", "Procuração assinada", "Contrato de honorários assinado", "Documentos do caso"];

const item = z.object({ texto: z.string().trim().min(1).max(300), feito: z.boolean() });
const valor = z.string().regex(/^\d+(\.\d{1,2})?$/, "valor em reais, com ponto nos centavos");

export const ETAPAS_DO_ALVARA = ["novo", "aguardando_saque", "sacado", "repassado", "finalizado"] as const;

export function rotasDosNegocios(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  /* ---------------- Novos negócios (triagem de quem chega) ---------------- */

  app.get("/negocios", async (c) => {
    const etapa = c.req.query("etapa") ?? "triagem";
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const contagens = await tx.select({ etapa: negocios.etapa, n: sql<number>`count(*)::int` }).from(negocios).groupBy(negocios.etapa);
      const linhas = await tx
        .select()
        .from(negocios)
        .where(etapa === "todos" ? undefined : eq(negocios.etapa, etapa as (typeof negocios.$inferSelect)["etapa"]))
        .orderBy(desc(negocios.createdAt))
        .limit(200);
      return c.json({
        contagens: Object.fromEntries(contagens.map((x) => [x.etapa, x.n])),
        itens: linhas.map((n) => ({
          id: n.id,
          nome: n.nome,
          telefone: n.telefone,
          assunto: n.assunto,
          area: n.area,
          pasta: n.pasta,
          etapa: n.etapa,
          checklist: n.checklist,
          observacoes: n.observacoes,
          responsavel: resumir(pessoas, n.responsavelId),
          clienteId: n.clienteId,
          em: n.createdAt.toISOString(),
        })),
      });
    });
  });

  app.post("/negocios", async (c) => {
    const b = await corpo(c, z.object({ nome: z.string().trim().min(2).max(300), telefone: z.string().max(30).nullable().optional(), assunto: z.string().trim().min(2).max(300), area: z.string().max(80).nullable().optional(), responsavelId: z.string().nullable().optional(), observacoes: z.string().max(5000).nullable().optional() }));
    const r = await tenant(c, deps, async (tx) =>
      (
        await tx
          .insert(negocios)
          .values({ organizationId: c.get("orgId"), ...b, responsavelId: b.responsavelId === undefined ? c.get("userId") : b.responsavelId, checklist: CHECKLIST_DA_TRIAGEM.map((texto) => ({ texto, feito: false })) })
          .returning({ id: negocios.id })
      )[0],
    );
    return c.json(r, 201);
  });

  app.put("/negocios/:id", async (c) => {
    const negocioId = id(c);
    const b = await corpo(
      c,
      z.object({
        nome: z.string().trim().min(2).max(300).optional(),
        telefone: z.string().max(30).nullable().optional(),
        assunto: z.string().trim().min(2).max(300).optional(),
        area: z.string().max(80).nullable().optional(),
        pasta: z.enum(["completa", "faltam_documentos", "sem_pasta"]).optional(),
        etapa: z.enum(["triagem", "repassado", "concluido", "desistiu"]).optional(),
        checklist: z.array(item).max(40).optional(),
        responsavelId: z.string().nullable().optional(),
        observacoes: z.string().max(5000).nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, async (tx) => {
      const valores: Partial<typeof negocios.$inferInsert> = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
      // A pasta acompanha o checklist, a não ser que a pessoa escolha à mão.
      if (b.checklist && !b.pasta) valores.pasta = b.checklist.every((i) => i.feito) ? "completa" : b.checklist.some((i) => i.feito) ? "faltam_documentos" : "sem_pasta";
      return tx.update(negocios).set(valores).where(eq(negocios.id, negocioId)).returning({ id: negocios.id });
    });
    if (!r.length) falha(404, "nao_encontrado");
    return c.json({ ok: true });
  });

  /** Concluir a triagem: vira cliente do escritório (ou se liga a um que já existe). */
  app.post("/negocios/:id/concluir", async (c) => {
    const negocioId = id(c);
    const b = await corpo(c, z.object({ clienteId: z.string().uuid().nullable().optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [n] = await tx.select().from(negocios).where(eq(negocios.id, negocioId));
      if (!n) falha(404, "nao_encontrado");
      const clienteId = b.clienteId ?? n.clienteId ?? (await tx.insert(clientes).values({ organizationId: c.get("orgId"), nome: n.nome, telefone: n.telefone, observacoes: n.assunto }).returning({ id: clientes.id }))[0]!.id;
      await tx.update(negocios).set({ etapa: "concluido", clienteId }).where(eq(negocios.id, negocioId));
      return { clienteId };
    });
    return c.json(r);
  });

  /* ---------------- Alvarás ---------------- */

  app.get("/alvaras", async (c) =>
    tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select({ a: alvaras, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj }, cliente: clientes.nome })
        .from(alvaras)
        .innerJoin(processos, eq(processos.id, alvaras.processoId))
        .leftJoin(clientes, eq(clientes.id, processos.clienteId))
        .orderBy(asc(alvaras.etapa), desc(alvaras.createdAt));
      const soma = (lista: typeof linhas, campo: "valor" | "valorRecebido") => lista.reduce((s, l) => s + Number(l.a[campo] ?? 0), 0).toFixed(2);
      const pendentes = linhas.filter((l) => l.a.etapa === "novo" || l.a.etapa === "aguardando_saque" || l.a.etapa === "sacado");
      const recebidos = linhas.filter((l) => l.a.etapa === "repassado" || l.a.etapa === "finalizado");
      return c.json({
        totais: { pendente: soma(pendentes, "valor"), recebido: soma(recebidos, "valorRecebido") },
        etapas: ETAPAS_DO_ALVARA.map((etapa) => {
          const daEtapa = linhas.filter((l) => l.a.etapa === etapa);
          return {
            etapa,
            total: soma(daEtapa, "valor"),
            itens: daEtapa.map(({ a, processo, cliente }) => ({
              id: a.id,
              descricao: a.descricao,
              valor: a.valor,
              valorRecebido: a.valorRecebido,
              expedidoEm: a.expedidoEm,
              sacadoEm: a.sacadoEm,
              repassadoEm: a.repassadoEm,
              observacoes: a.observacoes,
              processo,
              cliente,
            })),
          };
        }),
      });
    }),
  );

  app.post("/alvaras", async (c) => {
    const b = await corpo(c, z.object({ processoId: z.string().uuid(), descricao: z.string().trim().min(2).max(300), valor, expedidoEm: z.string().refine(ehDia).nullable().optional(), observacoes: z.string().max(2000).nullable().optional() }));
    const r = await tenant(c, deps, async (tx) => {
      if (!(await tx.select({ id: processos.id }).from(processos).where(eq(processos.id, b.processoId))).length) falha(404, "processo_nao_encontrado");
      return (await tx.insert(alvaras).values({ organizationId: c.get("orgId"), ...b }).returning({ id: alvaras.id }))[0];
    });
    return c.json(r, 201);
  });

  app.put("/alvaras/:id", async (c) => {
    const alvaraId = id(c);
    const b = await corpo(
      c,
      z.object({
        etapa: z.enum(ETAPAS_DO_ALVARA).optional(),
        descricao: z.string().trim().min(2).max(300).optional(),
        valor: valor.optional(),
        valorRecebido: valor.nullable().optional(),
        expedidoEm: z.string().refine(ehDia).nullable().optional(),
        sacadoEm: z.string().refine(ehDia).nullable().optional(),
        repassadoEm: z.string().refine(ehDia).nullable().optional(),
        observacoes: z.string().max(2000).nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, (tx) =>
      tx
        .update(alvaras)
        .set(Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)))
        .where(eq(alvaras.id, alvaraId))
        .returning({ id: alvaras.id }),
    );
    if (!r.length) falha(404, "nao_encontrado");
    return c.json({ ok: true });
  });
}
