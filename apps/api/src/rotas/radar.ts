/**
 * Radar de precedentes (Fase 5.4): os precedentes do BNP que mudaram e podem
 * afetar processos do escritório. O advogado confere e descarta o que não serve.
 */
import { processos, radarPrecedentes } from "@decreta/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { registrar } from "../auditoria.ts";
import { falha, id, ip, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

export function rotasDoRadar(app: Hono<Ambiente>, deps: DepsDasRotas) {
  /** Os avisos ainda não descartados, do processo (`?processo=`) ou do escritório inteiro. */
  app.get("/radar", async (c) => {
    const processoId = c.req.query("processo");
    return tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select({ r: radarPrecedentes, processo: { id: processos.id, titulo: processos.titulo } })
        .from(radarPrecedentes)
        .innerJoin(processos, eq(processos.id, radarPrecedentes.processoId))
        .where(and(isNull(radarPrecedentes.descartadoEm), processoId ? eq(radarPrecedentes.processoId, processoId) : undefined))
        .orderBy(desc(radarPrecedentes.createdAt))
        .limit(100);
      return c.json({
        itens: linhas.map(({ r, processo }) => ({ id: r.id, chave: r.chave, rotulo: r.rotulo, situacao: r.situacao, texto: r.texto, url: r.url, motivo: r.motivo, criadoEm: r.createdAt.toISOString(), processo })),
      });
    });
  });

  app.post("/radar/:id/descartar", async (c) => {
    const avisoId = id(c);
    const aviso = await tenant(c, deps, async (tx) => {
      const [r] = await tx
        .update(radarPrecedentes)
        .set({ descartadoEm: new Date(), descartadoPor: c.get("userId") })
        .where(and(eq(radarPrecedentes.id, avisoId), isNull(radarPrecedentes.descartadoEm)))
        .returning({ chave: radarPrecedentes.chave, processoId: radarPrecedentes.processoId });
      if (!r) falha(404, "nao_encontrado");
      return r;
    });
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "radar.descartado", detalhes: aviso, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });
}
