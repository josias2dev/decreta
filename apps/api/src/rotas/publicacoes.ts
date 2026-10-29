import { dataDaPublicacao, ehDia, formatarCnj, formatarDiaCurto, hojeEm, horaLocal, instanteLocal, lerCnj, tribunalDoCnj } from "@decreta/core";
import { analises, audiencias, capturas, prazos, processos, publicacoes } from "@decreta/db";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { naTela, ultimaAnalise } from "../servicos/analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { contarParaProcesso, IaDesligada, sugerirPrazoDaPublicacao, type SugestaoNaTela } from "../servicos/prazos.ts";
import { corpo, falha, id, ip, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const SITUACOES = ["nova", "pendente", "lida", "vinculada"] as const;
type Situacao = (typeof SITUACOES)[number];

/** O selo da lista: o que a IA achou, numa linha. */
export function seloDaSugestao(a: { situacao: string; conteudo: Record<string, unknown> } | undefined): { tipo: "prazo" | "sem_prazo" | "audiencia" | "sem_teor" | "lendo" | "erro"; texto: string } {
  if (!a) return { tipo: "lendo", texto: "IA lendo" };
  if (a.situacao === "recusa") return { tipo: "sem_teor", texto: "Falta o teor: abrir no sistema do tribunal" };
  if (a.situacao === "erro") return { tipo: "erro", texto: "A IA não conseguiu ler" };
  const s = a.conteudo as Partial<SugestaoNaTela>;
  if (s.audiencia) return { tipo: "audiencia", texto: `Audiência · ${s.audiencia.data.slice(8, 10)}/${s.audiencia.data.slice(5, 7)} às ${s.audiencia.hora}` };
  if (s.geraPrazo && s.contagemCalculada) return { tipo: "prazo", texto: `Prazo sugerido · ${formatarDiaCurto(s.contagemCalculada.fim)}` };
  return { tipo: "sem_prazo", texto: "Não gera prazo" };
}

const confirmacao = z.object({
  processoId: z.string().uuid().optional(),
  tipo: z.string().trim().min(2).max(200),
  fundamento: z.string().trim().max(200).nullable().optional(),
  dias: z.number().int().min(1).max(3650),
  contagem: z.enum(["uteis", "corridos"]),
  responsavelId: z.string().min(1).nullable().optional(),
  fimManual: z.string().refine(ehDia).nullable().optional(),
});

export function rotasDasPublicacoes(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/publicacoes", async (c) => {
    const pedida = c.req.query("situacao") ?? "nova";
    const situacao: Situacao = (SITUACOES as readonly string[]).includes(pedida) ? (pedida as Situacao) : "nova";
    return tenant(c, deps, async (tx) => {
      const contagens = await tx.select({ situacao: publicacoes.situacao, n: sql<number>`count(*)::int` }).from(publicacoes).groupBy(publicacoes.situacao);
      const linhas = await tx
        .select({ pub: publicacoes, processo: { id: processos.id, titulo: processos.titulo } })
        .from(publicacoes)
        .leftJoin(processos, eq(processos.id, publicacoes.processoId))
        .where(eq(publicacoes.situacao, situacao))
        .orderBy(desc(publicacoes.disponibilizadaEm), desc(publicacoes.createdAt))
        .limit(200);
      const sugestoes = linhas.length
        ? await tx
            .select({ alvoId: analises.alvoId, situacao: analises.situacao, conteudo: analises.conteudo })
            .from(analises)
            .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, linhas.map((l) => l.pub.id))))
            .orderBy(desc(analises.createdAt))
        : [];
      const ultima = new Map<string, (typeof sugestoes)[number]>();
      for (const s of sugestoes) if (!ultima.has(s.alvoId)) ultima.set(s.alvoId, s);
      const [rodada] = await tx.select().from(capturas).where(and(eq(capturas.fonte, "djen"), isNotNull(capturas.terminadaEm))).orderBy(desc(capturas.iniciadaEm)).limit(1);
      return c.json({
        contagens: Object.fromEntries(SITUACOES.map((s) => [s, contagens.find((x) => x.situacao === s)?.n ?? 0])),
        ultimaCaptura: rodada ? { em: rodada.terminadaEm!.toISOString(), hora: horaLocal(rodada.terminadaEm!, c.get("timezone")), novas: rodada.novas, erro: rodada.erro } : null,
        itens: linhas.map(({ pub, processo }) => {
          const s = ultima.get(pub.id);
          const assunto = s?.situacao === "pronto" ? (s.conteudo as { assunto?: string }).assunto : s?.situacao === "recusa" ? "sem teor" : null;
          return {
            id: pub.id,
            titulo: [pub.tipoComunicacao ?? "Comunicação", assunto ?? pub.tipoDocumento?.toLocaleLowerCase("pt-BR")].filter(Boolean).join(" · "),
            disponibilizadaEm: pub.disponibilizadaEm,
            partes: processo?.titulo ?? (pub.destinatarios.map((d) => d.nome).join(" × ") || pub.cnj || "Sem processo vinculado"),
            processoId: processo?.id ?? null,
            selo: seloDaSugestao(s),
          };
        }),
      });
    });
  });

  app.get("/publicacoes/:id", async (c) => {
    const pubId = id(c);
    return tenant(c, deps, async (tx) => {
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, pubId));
      if (!pub) falha(404, "nao_encontrado");
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const [processo] = pub.processoId ? await tx.select().from(processos).where(eq(processos.id, pub.processoId)) : [];
      const [prazo] = await tx.select().from(prazos).where(eq(prazos.publicacaoId, pub.id));
      const [audiencia] = await tx.select().from(audiencias).where(eq(audiencias.publicacaoId, pub.id));
      const sugestao = naTela(await ultimaAnalise(tx, "publicacao", pub.id, "sugerir-prazo"));
      const conteudo = sugestao?.conteudo as Partial<SugestaoNaTela> | undefined;
      return c.json({
        id: pub.id,
        situacao: pub.situacao,
        fonte: pub.fonte,
        disponibilizadaEm: pub.disponibilizadaEm,
        publicadaEm: pub.publicadaEm,
        tribunal: pub.tribunal,
        orgao: pub.orgao,
        tipoComunicacao: pub.tipoComunicacao,
        tipoDocumento: pub.tipoDocumento,
        cnj: pub.cnj,
        texto: pub.texto,
        link: pub.link,
        destinatarios: pub.destinatarios,
        advogados: pub.advogados,
        processo: processo ? { id: processo.id, titulo: processo.titulo, cnj: processo.cnj, orgao: processo.orgao, comarca: processo.comarca, responsavel: resumir(pessoas, processo.responsavelId) } : null,
        sugestao: sugestao && { ...sugestao, responsavel: resumir(pessoas, conteudo?.responsavelId ?? processo?.responsavelId) },
        prazo: prazo ? { id: prazo.id, confirmado: !!prazo.confirmadoEm, fim: prazo.fim, tipo: prazo.tipo } : null,
        audiencia: audiencia ? { id: audiencia.id, em: audiencia.em.toISOString() } : null,
      });
    });
  });

  /** Pede (ou refaz) a leitura da IA agora, esperando a resposta. */
  app.post("/publicacoes/:id/sugerir", async (c) => {
    const pubId = id(c);
    try {
      const a = await sugerirPrazoDaPublicacao(deps, c.get("orgId"), pubId, c.get("userId"));
      if (!a) falha(404, "nao_encontrado");
      return c.json(a);
    } catch (err) {
      if (err instanceof IaDesligada) falha(503, "ia_desligada", err.message);
      throw err;
    }
  });

  app.post("/publicacoes/:id/confirmar", async (c) => {
    const pubId = id(c);
    const b = await corpo(c, confirmacao);
    const r = await tenant(c, deps, async (tx) => {
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, pubId));
      if (!pub) falha(404, "nao_encontrado");
      const processoId = b.processoId ?? pub.processoId;
      if (!processoId) falha(422, "sem_processo", "Vincule a publicação a um processo antes de confirmar o prazo.");
      const [proc] = await tx.select({ responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, processoId));
      if (!proc) falha(404, "processo_nao_encontrado");
      const conta = await contarParaProcesso(tx, c.get("orgId"), processoId, { publicacao: pub.publicadaEm, dias: b.dias, contagem: b.contagem });
      const [existente] = await tx.select().from(prazos).where(eq(prazos.publicacaoId, pub.id));
      const valores = {
        processoId,
        tipo: b.tipo,
        fundamento: b.fundamento ?? null,
        dias: b.dias,
        contagem: b.contagem,
        publicadoEm: pub.publicadaEm,
        inicio: conta.inicio,
        fim: b.fimManual ?? conta.fim,
        desconsiderados: b.fimManual ? [] : conta.desconsiderados,
        responsavelId: b.responsavelId === undefined ? (existente?.responsavelId ?? proc.responsavelId) : b.responsavelId,
        confirmadoPor: c.get("userId"),
        confirmadoEm: new Date(),
        observacoes: b.fimManual ? `Data final digitada à mão (a conta dava ${formatarDiaCurto(conta.fim)}).` : (existente?.observacoes ?? null),
      };
      const prazoId = existente
        ? (await tx.update(prazos).set(valores).where(eq(prazos.id, existente.id)).returning({ id: prazos.id }))[0]!.id
        : (await tx.insert(prazos).values({ organizationId: c.get("orgId"), publicacaoId: pub.id, origem: "ia", ...valores }).returning({ id: prazos.id }))[0]!.id;
      await tx.update(publicacoes).set({ situacao: "vinculada", processoId, tratadaPor: c.get("userId"), tratadaEm: new Date() }).where(eq(publicacoes.id, pub.id));
      return { prazoId, fim: valores.fim };
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "prazo.confirmado", detalhes: { prazoId: r.prazoId, publicacaoId: pubId, fim: r.fim }, ip: ip(c) }, deps.log);
    return c.json(r);
  });

  /** A publicação designa audiência: entra na agenda do processo. */
  app.post("/publicacoes/:id/audiencia", async (c) => {
    const pubId = id(c);
    const b = await corpo(
      c,
      z.object({
        processoId: z.string().uuid().optional(),
        dia: z.string().refine(ehDia),
        hora: z.string().regex(/^\d{2}:\d{2}$/),
        tipo: z.string().trim().min(2).max(120),
        porVideo: z.boolean().default(false),
        local: z.string().max(500).nullable().optional(),
        responsavelId: z.string().nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, async (tx) => {
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, pubId));
      if (!pub) falha(404, "nao_encontrado");
      const processoId = b.processoId ?? pub.processoId;
      if (!processoId) falha(422, "sem_processo", "Vincule a publicação a um processo antes de marcar a audiência.");
      const [proc] = await tx.select({ responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, processoId));
      const [a] = await tx
        .insert(audiencias)
        .values({
          organizationId: c.get("orgId"),
          processoId,
          publicacaoId: pub.id,
          em: instanteLocal(b.dia, b.hora, c.get("timezone")),
          tipo: b.tipo,
          porVideo: b.porVideo,
          local: b.local ?? null,
          responsavelId: b.responsavelId === undefined ? (proc?.responsavelId ?? null) : b.responsavelId,
        })
        .returning({ id: audiencias.id });
      await tx.update(publicacoes).set({ situacao: "vinculada", processoId, tratadaPor: c.get("userId"), tratadaEm: new Date() }).where(eq(publicacoes.id, pub.id));
      return { audienciaId: a!.id };
    });
    return c.json(r);
  });

  /** Não gera prazo: vai para Lidas, e o prazo sugerido (não confirmado) some. */
  app.post("/publicacoes/:id/sem-prazo", async (c) => {
    const pubId = id(c);
    await tenant(c, deps, async (tx) => {
      const [pub] = await tx.select({ id: publicacoes.id }).from(publicacoes).where(eq(publicacoes.id, pubId));
      if (!pub) falha(404, "nao_encontrado");
      await tx.delete(prazos).where(and(eq(prazos.publicacaoId, pubId), sql`${prazos.confirmadoEm} is null`));
      await tx.update(publicacoes).set({ situacao: "lida", tratadaPor: c.get("userId"), tratadaEm: new Date() }).where(eq(publicacoes.id, pubId));
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "publicacao.sem_prazo", detalhes: { publicacaoId: pubId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });

  app.post("/publicacoes/:id/pendente", async (c) => {
    const pubId = id(c);
    await tenant(c, deps, (tx) => tx.update(publicacoes).set({ situacao: "pendente" }).where(eq(publicacoes.id, pubId)));
    return c.json({ ok: true });
  });

  app.post("/publicacoes/:id/vincular", async (c) => {
    const pubId = id(c);
    const b = await corpo(c, z.object({ processoId: z.string().uuid() }));
    await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ id: processos.id }).from(processos).where(eq(processos.id, b.processoId));
      if (!p) falha(404, "processo_nao_encontrado");
      await tx.update(publicacoes).set({ processoId: b.processoId }).where(eq(publicacoes.id, pubId));
      await tx.update(prazos).set({ processoId: b.processoId }).where(eq(prazos.publicacaoId, pubId));
    });
    await deps.enfileirar({ nome: "publicacao.nova", organizationId: c.get("orgId"), publicacaoId: pubId });
    return c.json({ ok: true });
  });

  /** Publicação colada à mão (veio por e-mail, pelo sistema do tribunal ou o DJEN não trouxe). */
  app.post("/publicacoes", async (c) => {
    const b = await corpo(
      c,
      z.object({
        processoId: z.string().uuid().nullable().optional(),
        cnj: z.string().max(40).nullable().optional(),
        disponibilizadaEm: z.string().refine(ehDia),
        tipoComunicacao: z.string().max(80).default("Intimação"),
        tipoDocumento: z.string().max(80).nullable().optional(),
        texto: z.string().trim().min(20, "Cole o teor da publicação.").max(200_000),
      }),
    );
    const novo = await tenant(c, deps, async (tx) => {
      let processoId = b.processoId ?? null;
      const cnj = b.cnj && lerCnj(b.cnj) ? formatarCnj(b.cnj) : null;
      if (!processoId && cnj) processoId = (await tx.select({ id: processos.id }).from(processos).where(eq(processos.cnj, cnj)))[0]?.id ?? null;
      const tribunal = (cnj ? tribunalDoCnj(cnj) : null) ?? (await tribunalPadrao(tx, c.get("orgId")));
      const cal = await calendarioDoEscritorio(tx, tribunal);
      const [pub] = await tx
        .insert(publicacoes)
        .values({
          organizationId: c.get("orgId"),
          fonte: "manual",
          idExterno: crypto.randomUUID(),
          disponibilizadaEm: b.disponibilizadaEm,
          publicadaEm: dataDaPublicacao(b.disponibilizadaEm, cal),
          tribunal,
          tipoComunicacao: b.tipoComunicacao,
          tipoDocumento: b.tipoDocumento ?? null,
          cnj,
          processoId,
          texto: b.texto,
        })
        .returning({ id: publicacoes.id });
      return pub!;
    });
    await deps.enfileirar({ nome: "publicacao.nova", organizationId: c.get("orgId"), publicacaoId: novo.id });
    return c.json(novo, 201);
  });

  /** "Buscar agora": a captura do DJEN roda em segundo plano; a tela recarrega sozinha. */
  app.post("/publicacoes/buscar", async (c) => {
    await deps.enfileirar({ nome: "captura.djen", organizationId: c.get("orgId") });
    return c.json({ ok: true, hoje: hojeEm(c.get("timezone")) });
  });
}

