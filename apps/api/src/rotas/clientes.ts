import { cnpjValido, cpfValido, formatarDocumento, formatarTelefone, limparDocumento, telefoneWhatsapp } from "@decreta/core";
import { atendimentos, clientes, documentos, processos } from "@decreta/db";
import { MIME_DOCX, nomeDoArquivo } from "@decreta/documentos";
import { and, desc, eq, ilike, like, ne, or, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { conferirPastaDe, ultimaConferencia } from "../servicos/conferencia.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { IaDesligada } from "../servicos/prazos.ts";
import { textoDoTermo, TITULO_DO_TERMO } from "../servicos/termo-ia.ts";
import { docxNoTimbre, timbreDoEscritorio } from "../servicos/timbre.ts";
import { comLimiteDaIa, corpo, ehSocio, falha, id, ip, semAcentoNoBanco, tenant, termoSemAcento, type Ambiente, type DepsDasRotas } from "./base.ts";

const CANAL: Record<string, string> = { presencial: "presencial", telefone: "telefone", whatsapp: "WhatsApp", video: "vídeo", email: "e-mail" };

const POR_PAGINA = 50;

const dadosDoCliente = z.object({
  nome: z.string().trim().min(2).max(300),
  tipo: z.enum(["pf", "pj"]).default("pf"),
  documento: z.string().max(20).nullable().optional(),
  telefone: z.string().max(30).nullable().optional(),
  email: z.string().email().max(200).nullable().optional().or(z.literal("").transform(() => null)),
  endereco: z.string().max(500).nullable().optional(),
  observacoes: z.string().max(5000).nullable().optional(),
  /** O cliente recusou o uso de IA nos casos dele. */
  semIa: z.boolean().optional(),
});

function documentoLimpo(tipo: "pf" | "pj", documento: string | null | undefined): string | null {
  const d = limparDocumento(tipo, documento ?? "");
  if (!d) return null;
  if (tipo === "pf" ? !cpfValido(d) : !cnpjValido(d)) falha(422, "documento_invalido", tipo === "pf" ? "Confira o CPF." : "Confira o CNPJ.");
  return d;
}

export function rotasDosClientes(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/clientes", async (c) => {
    const busca = (c.req.query("busca") ?? "").trim();
    const pagina = Math.max(1, Number(c.req.query("pagina") ?? 1) || 1);
    return tenant(c, deps, async (tx) => {
      // Sem diferenciar acento: "Kuhn" acha "Kühn".
      const termo = termoSemAcento(busca);
      const digitos = busca.replace(/\D/g, "");
      const filtro = busca
        ? or(
            like(semAcentoNoBanco(sql`${clientes.nome}`), termo),
            like(semAcentoNoBanco(sql`${clientes.email}`), termo),
            digitos.length >= 3 ? or(ilike(clientes.documento, `%${digitos}%`), sql`regexp_replace(coalesce(${clientes.telefone}, ''), '\\D', '', 'g') like ${`%${digitos}%`}`) : sql`false`,
          )
        : undefined;
      const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(clientes).where(filtro);
      const linhas = await tx
        .select({
          c: clientes,
          processos: sql<number>`(select count(*)::int from processos p where p.cliente_id = "clientes"."id")`,
          ultimoAtendimento: sql<string | null>`(select max(a.em)::text from atendimentos a where a.cliente_id = "clientes"."id")`,
        })
        .from(clientes)
        .where(filtro)
        .orderBy(sql`lower(${clientes.nome})`)
        .limit(POR_PAGINA)
        .offset((pagina - 1) * POR_PAGINA);
      return c.json({
        total,
        pagina,
        porPagina: POR_PAGINA,
        itens: linhas.map(({ c: cl, processos: n, ultimoAtendimento }) => ({
          id: cl.id,
          nome: cl.nome,
          tipo: cl.tipo,
          documento: cl.documento ? formatarDocumento(cl.documento) : null,
          telefone: cl.telefone ? formatarTelefone(cl.telefone) : null,
          whatsapp: cl.telefone ? telefoneWhatsapp(cl.telefone) : null,
          email: cl.email,
          processos: n,
          ultimoAtendimento: ultimoAtendimento ? new Date(ultimoAtendimento).toISOString() : null,
        })),
      });
    });
  });

  app.post("/clientes", async (c) => {
    const b = await corpo(c, dadosDoCliente);
    const novo = await tenant(c, deps, async (tx) => {
      const documento = documentoLimpo(b.tipo, b.documento);
      if (documento && (await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.documento, documento))).length) falha(409, "cliente_existe", "Já existe um cliente com este documento.");
      const [cl] = await tx.insert(clientes).values({ organizationId: c.get("orgId"), ...b, documento }).returning({ id: clientes.id });
      return cl!;
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "cliente.criado", detalhes: { clienteId: novo.id }, ip: ip(c) }, deps.log);
    return c.json(novo, 201);
  });

  app.get("/clientes/:id", async (c) => {
    const clienteId = id(c);
    return tenant(c, deps, async (tx) => {
      const [cl] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const [ps, ats, docs] = await Promise.all([
        tx.select().from(processos).where(eq(processos.clienteId, clienteId)).orderBy(desc(processos.ultimaMovimentacaoEm)),
        tx.select().from(atendimentos).where(eq(atendimentos.clienteId, clienteId)).orderBy(desc(atendimentos.em)),
        tx
          .select({ id: documentos.id, nome: documentos.nome, mime: documentos.mime, tamanho: documentos.tamanho, em: documentos.createdAt, processoId: documentos.processoId, leitura: documentos.leitura, lido: sql<boolean>`coalesce(length(${documentos.texto}), 0) > 0` })
          .from(documentos)
          .where(eq(documentos.clienteId, clienteId))
          .orderBy(desc(documentos.createdAt)),
      ]);
      const conferencia = await ultimaConferencia(tx, { clienteId }, c.get("timezone"));
      const termo = cl.termoIaDocumentoId ? docs.find((d) => d.id === cl.termoIaDocumentoId) : undefined;
      const linhaDoTempo = [
        ...ats.map((a) => ({ em: a.em.toISOString(), titulo: `Atendimento · ${CANAL[a.canal] ?? a.canal}`, detalhe: a.resumo.slice(0, 200), tipo: "atendimento" as const })),
        ...ps.map((p) => ({ em: p.createdAt.toISOString(), titulo: "Processo cadastrado", detalhe: p.titulo, tipo: "processo" as const })),
        ...docs.map((d) => ({ em: d.em.toISOString(), titulo: "Documento anexado", detalhe: d.nome, tipo: "documento" as const })),
      ].sort((a, b) => b.em.localeCompare(a.em));
      return c.json({
        id: cl.id,
        nome: cl.nome,
        tipo: cl.tipo,
        documento: cl.documento ? formatarDocumento(cl.documento) : null,
        telefone: cl.telefone ? formatarTelefone(cl.telefone) : null,
        whatsapp: cl.telefone ? telefoneWhatsapp(cl.telefone) : null,
        email: cl.email,
        endereco: cl.endereco,
        observacoes: cl.observacoes,
        semIa: cl.semIa,
        /** O termo de uso de IA assinado, na pasta do cliente. */
        termoIa: termo && cl.termoIaEm ? { em: cl.termoIaEm.toISOString(), documento: { id: termo.id, nome: termo.nome } } : null,
        criadoEm: cl.createdAt.toISOString(),
        processos: ps.map((p) => ({ id: p.id, titulo: p.titulo, cnj: p.cnj, orgao: p.orgao, situacao: p.situacao, responsavel: resumir(pessoas, p.responsavelId) })),
        atendimentos: ats.map((a) => ({ id: a.id, em: a.em.toISOString(), canal: a.canal, resumo: a.resumo, autor: resumir(pessoas, a.autorId), processoId: a.processoId })),
        documentos: docs.map((d) => ({ ...d, em: d.em.toISOString() })),
        conferencia,
        linhaDoTempo,
      });
    });
  });

  /** O termo de uso de IA para o cliente assinar, no timbre (Recomendação CFOAB 001/2024). Quem baixa assina como advogado responsável. */
  app.get("/clientes/:id/termo-ia", async (c) => {
    const clienteId = id(c);
    const { cl, timbre, advogado } = await tenant(c, deps, async (tx) => {
      const [cl] = await tx.select().from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      return { cl, timbre: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")), advogado: pessoas.get(c.get("userId")) };
    });
    const texto = textoDoTermo({ escritorio: timbre.timbre.nome, cliente: { nome: cl.nome, tipo: cl.tipo, documento: cl.documento }, advogado: { nome: advogado?.nome ?? c.get("userNome"), oab: advogado?.oab ?? null }, seguranca: `${deps.telas}/seguranca` });
    const docx = await docxNoTimbre(deps.arquivos, timbre, { titulo: TITULO_DO_TERMO, texto });
    return new Response(docx, {
      headers: {
        "content-type": MIME_DOCX,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeDoArquivo(`${TITULO_DO_TERMO} · ${cl.nome}`))}`,
        "cache-control": "no-store",
      },
    });
  });

  /** Conferência da pasta do cliente antes de protocolar um caso novo. */
  app.post("/clientes/:id/conferir", comLimiteDaIa(deps), async (c) => {
    const clienteId = id(c);
    // Sem corpo também vale: confere sem assunto.
    const b = await corpo(c, z.object({ assunto: z.string().trim().max(300).nullable().optional() }).nullable());
    try {
      const a = await conferirPastaDe({ ...deps, ia: c.get("ia") ?? null }, c.get("orgId"), { clienteId }, { userId: c.get("userId"), timezone: c.get("timezone"), assunto: b?.assunto ?? null });
      if (!a) falha(404, "nao_encontrado");
      return c.json(a);
    } catch (err) {
      if (err instanceof IaDesligada) falha(503, "ia_desligada", err.message);
      throw err;
    }
  });

  app.put("/clientes/:id", async (c) => {
    const clienteId = id(c);
    const b = await corpo(c, dadosDoCliente.partial());
    const mudouSemIa = await tenant(c, deps, async (tx) => {
      const [cl] = await tx.select({ tipo: clientes.tipo, semIa: clientes.semIa }).from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      const valores: Partial<typeof clientes.$inferInsert> = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== undefined));
      if (b.documento !== undefined) {
        valores.documento = documentoLimpo(b.tipo ?? cl.tipo, b.documento);
        if (valores.documento && (await tx.select({ id: clientes.id }).from(clientes).where(and(eq(clientes.documento, valores.documento), ne(clientes.id, clienteId)))).length)
          falha(409, "cliente_existe", "Outro cliente já tem este documento.");
      }
      await tx.update(clientes).set(valores).where(eq(clientes.id, clienteId));
      return b.semIa !== undefined && b.semIa !== cl.semIa;
    });
    // Quem marcou (ou desmarcou) a recusa da IA, e quando: o consentimento fica auditável.
    if (mudouSemIa) await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "cliente.sem_ia", detalhes: { clienteId, semIa: b.semIa }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });

  /** LGPD: apagar o cliente e o que é só dele (atendimentos, documentos). Os processos ficam, sem o vínculo. */
  app.delete("/clientes/:id", async (c) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios apagam clientes.");
    const clienteId = id(c);
    await tenant(c, deps, async (tx) => {
      const docs = await tx.select({ chave: documentos.chave }).from(documentos).where(and(eq(documentos.clienteId, clienteId), sql`${documentos.processoId} is null`));
      await tx.delete(clientes).where(eq(clientes.id, clienteId));
      for (const d of docs) await deps.arquivos.delete(d.chave).catch(() => {});
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "cliente.apagado", detalhes: { clienteId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });

  app.post("/clientes/:id/atendimentos", async (c) => {
    const clienteId = id(c);
    const b = await corpo(
      c,
      z.object({
        em: z.string().datetime({ offset: true }).optional(),
        canal: z.enum(["presencial", "telefone", "whatsapp", "video", "email"]).default("presencial"),
        resumo: z.string().trim().min(3).max(20_000),
        processoId: z.string().uuid().nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, async (tx) => {
      const [cl] = await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, clienteId));
      if (!cl) falha(404, "nao_encontrado");
      return (
        await tx
          .insert(atendimentos)
          .values({ organizationId: c.get("orgId"), clienteId, em: b.em ? new Date(b.em) : new Date(), canal: b.canal, resumo: b.resumo, processoId: b.processoId ?? null, autorId: c.get("userId") })
          .returning({ id: atendimentos.id })
      )[0];
    });
    return c.json(r, 201);
  });
}
