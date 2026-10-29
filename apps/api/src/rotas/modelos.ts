/** Banco de teses: os modelos de peça do escritório, que a IA segue ao gerar. */
import { lerDocumento, MIME_DOCX } from "@decreta/documentos";
import { modelos, pecas } from "@decreta/db";
import { tipoDePeca } from "@decreta/ia";
import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { buscaNosModelos } from "../servicos/modelos.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, falha, id, ip, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const TETO_DO_MODELO = 200_000;
const MIMES_DO_MODELO = new Set([MIME_DOCX, "application/pdf", "text/plain"]);

const sobre = {
  tese: z.string().trim().max(500).nullable().optional(),
  assunto: z.string().trim().max(200).nullable().optional(),
};
const tipoValido = z.string().refine((t) => !!tipoDePeca(t), "Escolha um tipo de peça do catálogo.");

export function rotasDosModelos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/modelos", async (c) => {
    const busca = (c.req.query("busca") ?? "").trim();
    const tipo = c.req.query("tipo");
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const onde: SQL[] = [];
      if (tipo) onde.push(eq(modelos.tipo, tipo));
      const b = buscaNosModelos(busca);
      if (b) onde.push(b);
      const linhas = await tx
        .select({ id: modelos.id, titulo: modelos.titulo, tipo: modelos.tipo, tese: modelos.tese, assunto: modelos.assunto, pecaId: modelos.pecaId, criadoPor: modelos.criadoPor, em: modelos.updatedAt, tamanho: sql<number>`length(${modelos.texto})::int` })
        .from(modelos)
        .where(onde.length ? and(...onde) : undefined)
        .orderBy(desc(modelos.updatedAt))
        .limit(200);
      const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(modelos);
      return c.json({
        total,
        itens: linhas.map((m) => ({ ...m, tipoNome: tipoDePeca(m.tipo)?.nome ?? m.tipo, criadoPor: resumir(pessoas, m.criadoPor), em: m.em.toISOString() })),
      });
    });
  });

  app.get("/modelos/:id", async (c) => {
    const modeloId = id(c);
    return tenant(c, deps, async (tx) => {
      const [m] = await tx.select().from(modelos).where(eq(modelos.id, modeloId));
      if (!m) falha(404, "nao_encontrado");
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      return c.json({ id: m.id, titulo: m.titulo, tipo: m.tipo, tipoNome: tipoDePeca(m.tipo)?.nome ?? m.tipo, tese: m.tese, assunto: m.assunto, texto: m.texto, pecaId: m.pecaId, criadoPor: resumir(pessoas, m.criadoPor), em: m.updatedAt.toISOString() });
    });
  });

  /** Guarda como modelo uma peça do Decreta ou um texto colado. */
  app.post("/modelos", async (c) => {
    const b = await corpo(
      c,
      z.union([
        z.object({ pecaId: z.string().uuid(), titulo: z.string().trim().min(2).max(300).optional(), ...sobre }),
        z.object({ titulo: z.string().trim().min(2).max(300), tipo: tipoValido, texto: z.string().trim().min(200, "O modelo precisa do texto da peça.").max(TETO_DO_MODELO), ...sobre }),
      ]),
    );
    const novo = await tenant(c, deps, async (tx) => {
      let valores: { titulo: string; tipo: string; texto: string; pecaId: string | null };
      if ("pecaId" in b) {
        const [p] = await tx.select().from(pecas).where(eq(pecas.id, b.pecaId));
        if (!p) falha(404, "nao_encontrado");
        if (p.texto.trim().length < 200) falha(422, "sem_texto", "A peça ainda não tem texto para virar modelo.");
        valores = { titulo: b.titulo ?? p.titulo, tipo: p.tipo, texto: p.texto.slice(0, TETO_DO_MODELO), pecaId: p.id };
      } else {
        valores = { titulo: b.titulo, tipo: b.tipo, texto: b.texto, pecaId: null };
      }
      const [m] = await tx
        .insert(modelos)
        .values({ organizationId: c.get("orgId"), ...valores, tese: b.tese ?? null, assunto: b.assunto ?? null, criadoPor: c.get("userId") })
        .returning({ id: modelos.id });
      return m!;
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "modelo.criado", detalhes: { modeloId: novo.id }, ip: ip(c) }, deps.log);
    return c.json(novo, 201);
  });

  /** Modelo a partir de um arquivo (a peça boa que já está no computador). */
  app.post("/modelos/arquivo", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) falha(400, "sem_arquivo");
    if (arquivo.size > deps.maxArquivoBytes) falha(422, "arquivo_grande", `O arquivo passa de ${Math.round(deps.maxArquivoBytes / 1e6)} MB.`);
    // "text/plain;charset=utf-8" é text/plain.
    const mime = (arquivo.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    if (!MIMES_DO_MODELO.has(mime)) falha(422, "tipo_nao_aceito", "Envie a peça em DOCX, PDF com texto ou TXT.");
    const tipo = String(form!.get("tipo") ?? "");
    if (!tipoDePeca(tipo)) falha(422, "tipo_desconhecido", "Escolha um tipo de peça do catálogo.");
    const lido = await lerDocumento(new Uint8Array(await arquivo.arrayBuffer()), mime).catch(() => ({ texto: null }));
    if (!lido.texto || lido.texto.trim().length < 200) falha(422, "sem_texto", "Não consegui ler o texto do arquivo. Se for PDF escaneado, envie em DOCX.");
    const texto = (s: unknown, max: number) => (typeof s === "string" && s.trim() ? s.trim().slice(0, max) : null);
    const titulo = texto(form!.get("titulo"), 300) ?? arquivo.name.replace(/\.[^.]+$/, "").slice(0, 300);
    const novo = await tenant(c, deps, async (tx) =>
      (
        await tx
          .insert(modelos)
          .values({ organizationId: c.get("orgId"), titulo, tipo, tese: texto(form!.get("tese"), 500), assunto: texto(form!.get("assunto"), 200), texto: lido.texto!.slice(0, TETO_DO_MODELO), criadoPor: c.get("userId") })
          .returning({ id: modelos.id })
      )[0]!,
    );
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "modelo.criado", detalhes: { modeloId: novo.id, arquivo: arquivo.name }, ip: ip(c) }, deps.log);
    return c.json(novo, 201);
  });

  app.put("/modelos/:id", async (c) => {
    const modeloId = id(c);
    const b = await corpo(c, z.object({ titulo: z.string().trim().min(2).max(300).optional(), tipo: tipoValido.optional(), texto: z.string().trim().min(200).max(TETO_DO_MODELO).optional(), ...sobre }));
    const r = await tenant(c, deps, (tx) =>
      tx
        .update(modelos)
        .set(Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined)))
        .where(eq(modelos.id, modeloId))
        .returning({ id: modelos.id }),
    );
    if (!r.length) falha(404, "nao_encontrado");
    return c.json({ ok: true });
  });

  app.delete("/modelos/:id", async (c) => {
    const modeloId = id(c);
    const r = await tenant(c, deps, (tx) => tx.delete(modelos).where(eq(modelos.id, modeloId)).returning({ id: modelos.id }));
    if (!r.length) falha(404, "nao_encontrado");
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "modelo.apagado", detalhes: { modeloId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });
}
