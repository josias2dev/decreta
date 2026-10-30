import { formatarCnj, hojeEm, lerCnj, tribunalDoCnj, urgenciaDoPrazo } from "@decreta/core";
import { alvaras, audiencias, clientes, documentos, movimentacoes, partes, pecas, prazos, processos, resultados, type Tx } from "@decreta/db";
import { buscarDjenDoProcesso, partesDoDjen } from "@decreta/tribunais";
import { and, asc, desc, eq, gt, ilike, inArray, isNotNull, or, sql, type SQL } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { naTela, ultimaAnalise } from "../servicos/analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { atualizarDoDataJud, autorDoAto } from "../servicos/captura.ts";
import { comunicacoesGuardadas, completarPartes, consultarCnj, oabsDaEquipe } from "../servicos/consulta.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { quandoDoPrazo } from "../servicos/hoje.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { corpo, falha, id, ip, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const POR_PAGINA = 50;

const parte = z.object({
  nome: z.string().trim().min(2).max(300),
  polo: z.enum(["ativo", "passivo", "terceiro"]),
  papel: z.string().trim().max(80).nullable().optional(),
  documento: z.string().max(20).nullable().optional(),
  advogados: z.string().max(500).nullable().optional(),
  cliente: z.boolean().default(false),
});

const dadosDoProcesso = z.object({
  cnj: z.string().max(40).nullable().optional(),
  titulo: z.string().trim().max(300).optional(),
  tipo: z.enum(["judicial", "extrajudicial"]).default("judicial"),
  clienteId: z.string().uuid().nullable().optional(),
  poloCliente: z.enum(["ativo", "passivo", "terceiro"]).default("ativo"),
  responsavelId: z.string().min(1).nullable().optional(),
  classe: z.string().max(200).nullable().optional(),
  assunto: z.string().max(200).nullable().optional(),
  orgao: z.string().max(200).nullable().optional(),
  comarca: z.string().max(120).nullable().optional(),
  sistema: z.string().max(40).nullable().optional(),
  fase: z.string().max(200).nullable().optional(),
  valorCausa: z.string().regex(/^\d+(\.\d{1,2})?$/).nullable().optional(),
  distribuidoEm: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  segredo: z.boolean().optional(),
  situacao: z.enum(["ativo", "suspenso", "arquivado", "encerrado"]).optional(),
  observacoes: z.string().max(5000).nullable().optional(),
  partes: z.array(parte).max(40).optional(),
});

/** Link "Abrir no eproc/PJe": a consulta pública do tribunal, que pede o número. */
export function linkDoTribunal(tribunal: string | null, sistema: string | null): { rotulo: string; url: string } | null {
  if (tribunal === "TJSC") return { rotulo: "Abrir no eproc", url: "https://eproc1g.tjsc.jus.br/eproc/externo_controlador.php?acao=processo_consulta_publica" };
  if (tribunal === "TRT12") return { rotulo: "Abrir no PJe", url: "https://pje.trt12.jus.br/consultaprocessual/" };
  if (tribunal === "TRF4") return { rotulo: "Abrir no eproc", url: "https://consulta.trf4.jus.br/trf4/controlador.php?acao=consulta_processual_pesquisa" };
  return sistema ? { rotulo: `Abrir no ${sistema}`, url: "" } : null;
}

export function rotasDosProcessos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/processos", async (c) => {
    const busca = (c.req.query("busca") ?? "").trim();
    const situacao = c.req.query("situacao") ?? "ativos";
    const responsavel = c.req.query("responsavel");
    const pagina = Math.max(1, Number(c.req.query("pagina") ?? 1) || 1);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const cal = await calendarioDoEscritorio(tx, await tribunalPadrao(tx, c.get("orgId")));
      const onde: SQL[] = [];
      if (situacao === "ativos") onde.push(inArray(processos.situacao, ["ativo", "suspenso"]));
      else if (situacao === "arquivados") onde.push(inArray(processos.situacao, ["arquivado", "encerrado"]));
      if (responsavel === "sem") onde.push(sql`${processos.responsavelId} is null`);
      else if (responsavel) onde.push(eq(processos.responsavelId, responsavel));
      if (busca) {
        const termo = `%${busca.replace(/[%_]/g, "")}%`;
        const digitos = busca.replace(/\D/g, "");
        onde.push(
          or(
            ilike(processos.titulo, termo),
            ilike(processos.orgao, termo),
            ilike(clientes.nome, termo),
            digitos.length >= 4 ? sql`regexp_replace(coalesce(${processos.cnj}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : sql`false`,
          )!,
        );
      }
      const filtro = onde.length ? and(...onde) : undefined;
      const [{ total } = { total: 0 }] = await tx.select({ total: sql<number>`count(*)::int` }).from(processos).leftJoin(clientes, eq(clientes.id, processos.clienteId)).where(filtro);
      const linhas = await tx
        .select({ p: processos, cliente: clientes.nome })
        .from(processos)
        .leftJoin(clientes, eq(clientes.id, processos.clienteId))
        .where(filtro)
        .orderBy(sql`${processos.ultimaMovimentacaoEm} desc nulls last`, desc(processos.createdAt))
        .limit(POR_PAGINA)
        .offset((pagina - 1) * POR_PAGINA);
      const proximos = linhas.length
        ? await tx
            .selectDistinctOn([prazos.processoId], { processoId: prazos.processoId, fim: prazos.fim, tipo: prazos.tipo, situacao: prazos.situacao })
            .from(prazos)
            .where(and(eq(prazos.situacao, "aberto"), inArray(prazos.processoId, linhas.map((l) => l.p.id))))
            .orderBy(prazos.processoId, asc(prazos.fim))
        : [];
      const proximo = new Map(proximos.map((p) => [p.processoId, p]));
      return c.json({
        total,
        pagina,
        porPagina: POR_PAGINA,
        itens: linhas.map(({ p, cliente }) => {
          const pr = proximo.get(p.id);
          const u = pr ? urgenciaDoPrazo(pr, hoje, cal) : null;
          return {
            id: p.id,
            titulo: p.titulo,
            cnj: p.cnj,
            tipo: p.tipo,
            classe: p.classe,
            orgao: p.orgao,
            comarca: p.comarca,
            situacao: p.situacao,
            cliente,
            responsavel: resumir(pessoas, p.responsavelId),
            ultimaMovimentacaoEm: p.ultimaMovimentacaoEm?.toISOString() ?? null,
            proximoPrazo: pr && u ? { fim: pr.fim, tipo: pr.tipo, urgencia: u, quando: quandoDoPrazo(u, pr.fim, hoje) } : null,
          };
        }),
      });
    });
  });

  app.post("/processos", async (c) => {
    const b = await corpo(c, dadosDoProcesso);
    let cnj: string | null = null;
    if (b.cnj?.trim()) {
      if (!lerCnj(b.cnj)) falha(422, "cnj_invalido", "Confira o número: o dígito verificador não bate.");
      cnj = formatarCnj(b.cnj);
    }
    const titulo =
      b.titulo?.trim() ||
      [b.partes?.find((p) => p.polo === "ativo")?.nome, b.partes?.find((p) => p.polo === "passivo")?.nome].filter(Boolean).join(" × ") ||
      cnj ||
      "Caso sem título";
    const novo = await tenant(c, deps, async (tx) => {
      if (cnj && (await tx.select({ id: processos.id }).from(processos).where(eq(processos.cnj, cnj))).length) falha(409, "processo_existe", "Este número já está cadastrado.");
      const [p] = await tx
        .insert(processos)
        .values({
          organizationId: c.get("orgId"),
          cnj,
          titulo,
          tipo: cnj ? "judicial" : b.tipo,
          tribunal: cnj ? tribunalDoCnj(cnj) : null,
          clienteId: b.clienteId ?? null,
          poloCliente: b.poloCliente,
          responsavelId: b.responsavelId === undefined ? c.get("userId") : b.responsavelId,
          classe: b.classe ?? null,
          assunto: b.assunto ?? null,
          orgao: b.orgao ?? null,
          comarca: b.comarca ?? null,
          sistema: b.sistema ?? (cnj && tribunalDoCnj(cnj) === "TJSC" ? "eproc" : null),
          fase: b.fase ?? null,
          valorCausa: b.valorCausa ?? null,
          distribuidoEm: b.distribuidoEm ?? null,
          segredo: b.segredo ?? false,
          observacoes: b.observacoes ?? null,
        })
        .returning({ id: processos.id });
      if (b.partes?.length) await tx.insert(partes).values(b.partes.map((pt, i) => ({ organizationId: c.get("orgId"), processoId: p!.id, ...pt, ordem: i })));
      return p!;
    });
    if (cnj) await deps.enfileirar({ nome: "processo.datajud", organizationId: c.get("orgId"), processoId: novo.id });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "processo.criado", detalhes: { processoId: novo.id, cnj }, ip: ip(c) }, deps.log);
    return c.json(novo, 201);
  });

  /**
   * O que o tribunal sabe do número, para o Novo processo vir preenchido
   * (DataJud e DJEN; na demonstração, um exemplo inventado). Não grava nada.
   */
  app.get("/processos/consulta", async (c) => {
    const cnj = c.req.query("cnj") ?? "";
    if (!lerCnj(cnj)) falha(422, "cnj_invalido", "Confira o número: o dígito verificador não bate.");
    return c.json(await consultarCnj(deps.captura, c.get("orgId"), cnj, c.get("demonstracao")));
  });

  app.get("/processos/:id", async (c) => {
    const processoId = id(c);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const [linha] = await tx.select({ p: processos, cliente: { id: clientes.id, nome: clientes.nome } }).from(processos).leftJoin(clientes, eq(clientes.id, processos.clienteId)).where(eq(processos.id, processoId));
      if (!linha) falha(404, "nao_encontrado");
      const { p } = linha;
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const cal = await calendarioDoEscritorio(tx, p.tribunal ?? (await tribunalPadrao(tx, c.get("orgId"))), p.comarca);
      const contexto = await carregarContexto(tx, p.id);
      const resumo = await ultimaAnalise(tx, "processo", p.id, "resumo-autos");
      const n = sql<number>`count(*)::int`;
      const [pts, [nMov], [nPrazos], [nDocs], ultimas, proximoPrazo, auds, alvs, novidades, decisoes] = await Promise.all([
        tx.select().from(partes).where(eq(partes.processoId, p.id)).orderBy(asc(partes.ordem)),
        tx.select({ n }).from(movimentacoes).where(eq(movimentacoes.processoId, p.id)),
        tx.select({ n }).from(prazos).where(eq(prazos.processoId, p.id)),
        tx.select({ n }).from(documentos).where(eq(documentos.processoId, p.id)),
        tx.select().from(movimentacoes).where(eq(movimentacoes.processoId, p.id)).orderBy(desc(movimentacoes.em), desc(movimentacoes.evento)).limit(5),
        tx.select().from(prazos).where(and(eq(prazos.processoId, p.id), eq(prazos.situacao, "aberto"))).orderBy(asc(prazos.fim)).limit(1),
        tx.select().from(audiencias).where(eq(audiencias.processoId, p.id)).orderBy(desc(audiencias.em)).limit(10),
        tx.select().from(alvaras).where(eq(alvaras.processoId, p.id)).orderBy(desc(alvaras.createdAt)),
        resumo ? tx.select({ titulo: movimentacoes.titulo, evento: movimentacoes.evento }).from(movimentacoes).where(and(eq(movimentacoes.processoId, p.id), gt(movimentacoes.createdAt, resumo.createdAt))).orderBy(desc(movimentacoes.em)) : Promise.resolve([]),
        tx.select().from(resultados).where(eq(resultados.processoId, p.id)).orderBy(desc(resultados.decididoEm)),
      ]);
      const docsDosEventos = await docsPorEvento(tx, p.id, ultimas.map((m) => m.evento).filter((e): e is number => e != null));
      const pp = proximoPrazo[0];
      const pu = pp ? urgenciaDoPrazo(pp, hoje, cal) : null;
      return c.json({
        id: p.id,
        titulo: p.titulo,
        cnj: p.cnj,
        tipo: p.tipo,
        tribunal: p.tribunal,
        sistema: p.sistema,
        classe: p.classe,
        assunto: p.assunto,
        orgao: p.orgao,
        comarca: p.comarca,
        valorCausa: p.valorCausa,
        fase: p.fase,
        situacao: p.situacao,
        poloCliente: p.poloCliente,
        distribuidoEm: p.distribuidoEm,
        segredo: p.segredo,
        observacoes: p.observacoes,
        datajudEm: p.datajudEm?.toISOString() ?? null,
        cliente: linha.cliente?.id ? linha.cliente : null,
        responsavel: resumir(pessoas, p.responsavelId),
        link: linkDoTribunal(p.tribunal, p.sistema),
        partes: pts.map((x) => ({ id: x.id, nome: x.nome, polo: x.polo, papel: x.papel, advogados: x.advogados, cliente: x.cliente, documento: x.documento })),
        contadores: { movimentacoes: nMov?.n ?? 0, prazos: nPrazos?.n ?? 0, documentos: nDocs?.n ?? 0 },
        resumo: naTela(resumo, contexto?.base),
        novidades: novidades.map((m) => (m.evento != null ? `${m.titulo.toLocaleLowerCase("pt-BR")}, evento ${m.evento}` : m.titulo.toLocaleLowerCase("pt-BR"))),
        ultimasMovimentacoes: ultimas.map((m) => movimentacaoNaTela(m, docsDosEventos, resumo?.createdAt)),
        proximoPrazo: pp && pu ? { id: pp.id, tipo: pp.tipo, fim: pp.fim, dias: pp.dias, contagem: pp.contagem, urgencia: pu, quando: quandoDoPrazo(pu, pp.fim, hoje), confirmado: !!pp.confirmadoEm, responsavel: resumir(pessoas, pp.responsavelId) } : null,
        audiencias: auds.map((a) => ({ id: a.id, em: a.em.toISOString(), tipo: a.tipo, porVideo: a.porVideo, local: a.local, situacao: a.situacao, responsavel: resumir(pessoas, a.responsavelId) })),
        alvaras: alvs.map((a) => ({ id: a.id, descricao: a.descricao, valor: a.valor, etapa: a.etapa })),
        resultados: decisoes.map((r) => ({ id: r.id, tipo: r.tipo, resultado: r.resultado, decididoEm: r.decididoEm, resumo: r.resumo, publicacaoId: r.publicacaoId })),
      });
    });
  });

  app.put("/processos/:id", async (c) => {
    const processoId = id(c);
    const b = await corpo(c, dadosDoProcesso.omit({ partes: true }).partial());
    await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ id: processos.id }).from(processos).where(eq(processos.id, processoId));
      if (!p) falha(404, "nao_encontrado");
      const { cnj: cnjBruto, ...resto } = b;
      const valores: Partial<typeof processos.$inferInsert> = Object.fromEntries(Object.entries(resto).filter(([, v]) => v !== undefined));
      if (cnjBruto !== undefined) {
        if (cnjBruto && !lerCnj(cnjBruto)) falha(422, "cnj_invalido", "Confira o número: o dígito verificador não bate.");
        valores.cnj = cnjBruto ? formatarCnj(cnjBruto) : null;
        valores.tribunal = valores.cnj ? tribunalDoCnj(valores.cnj) : null;
      }
      await tx.update(processos).set(valores).where(eq(processos.id, processoId));
    });
    return c.json({ ok: true });
  });

  app.get("/processos/:id/movimentacoes", async (c) => {
    const processoId = id(c);
    const filtro = c.req.query("filtro") ?? "todas";
    const pagina = Math.max(1, Number(c.req.query("pagina") ?? 1) || 1);
    return tenant(c, deps, async (tx) => {
      const resumo = await ultimaAnalise(tx, "processo", processoId, "resumo-autos");
      const eventosComDoc = tx.select({ evento: documentos.evento }).from(documentos).where(and(eq(documentos.processoId, processoId), isNotNull(documentos.evento)));
      const onde =
        filtro === "juizo"
          ? eq(movimentacoes.autor, "juizo")
          : filtro === "partes"
            ? eq(movimentacoes.autor, "partes")
            : filtro === "documento"
              ? inArray(movimentacoes.evento, eventosComDoc)
              : undefined;
      const n = sql<number>`count(*)::int`;
      const [contagens] = await tx
        .select({
          todas: n,
          juizo: sql<number>`count(*) filter (where ${movimentacoes.autor} = 'juizo')::int`,
          partes: sql<number>`count(*) filter (where ${movimentacoes.autor} = 'partes')::int`,
          documento: sql<number>`count(*) filter (where ${movimentacoes.evento} in (${eventosComDoc}))::int`,
        })
        .from(movimentacoes)
        .where(eq(movimentacoes.processoId, processoId));
      const linhas = await tx
        .select()
        .from(movimentacoes)
        .where(and(eq(movimentacoes.processoId, processoId), onde))
        .orderBy(desc(movimentacoes.em), desc(movimentacoes.evento))
        .limit(POR_PAGINA)
        .offset((pagina - 1) * POR_PAGINA);
      const docs = await docsPorEvento(tx, processoId, linhas.map((m) => m.evento).filter((e): e is number => e != null));
      return c.json({ contagens, pagina, porPagina: POR_PAGINA, itens: linhas.map((m) => movimentacaoNaTela(m, docs, resumo?.createdAt)) });
    });
  });

  app.post("/processos/:id/movimentacoes", async (c) => {
    const processoId = id(c);
    const b = await corpo(c, z.object({ em: z.string().datetime({ offset: true }), evento: z.number().int().min(0).nullable().optional(), titulo: z.string().trim().min(2).max(300), descricao: z.string().max(5000).nullable().optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ id: processos.id, ultima: processos.ultimaMovimentacaoEm }).from(processos).where(eq(processos.id, processoId));
      if (!p) falha(404, "nao_encontrado");
      const em = new Date(b.em);
      const [m] = await tx
        .insert(movimentacoes)
        .values({ organizationId: c.get("orgId"), processoId, em, evento: b.evento ?? null, titulo: b.titulo, descricao: b.descricao ?? null, autor: autorDoAto(b.titulo), fonte: "manual", chave: `manual:${crypto.randomUUID()}` })
        .returning({ id: movimentacoes.id });
      if (!p.ultima || em > p.ultima) await tx.update(processos).set({ ultimaMovimentacaoEm: em }).where(eq(processos.id, processoId));
      return m!;
    });
    return c.json(r, 201);
  });

  app.post("/processos/:id/partes", async (c) => {
    const processoId = id(c);
    const b = await corpo(c, parte);
    const r = await tenant(c, deps, async (tx) => {
      const [{ ordem } = { ordem: 0 }] = await tx.select({ ordem: sql<number>`coalesce(max(${partes.ordem}), -1)::int + 1` }).from(partes).where(eq(partes.processoId, processoId));
      return (await tx.insert(partes).values({ organizationId: c.get("orgId"), processoId, ...b, ordem }).returning({ id: partes.id }))[0];
    });
    return c.json(r, 201);
  });

  app.delete("/processos/:id/partes/:parte", async (c) => {
    const processoId = id(c);
    const parteId = id(c, "parte");
    await tenant(c, deps, (tx) => tx.delete(partes).where(and(eq(partes.id, parteId), eq(partes.processoId, processoId))));
    return c.json({ ok: true });
  });

  /**
   * "Trazer partes do Diário": as partes e os advogados das publicações do
   * processo, as guardadas e as do DJEN pelo número. Só acrescenta.
   */
  app.post("/processos/:id/partes/djen", async (c) => {
    const processoId = id(c);
    if (c.get("demonstracao")) falha(409, "demonstracao", "Na demonstração a busca no DJEN e no DataJud fica desligada: as OABs e os números de processo são inventados e trariam dados de gente de verdade.");
    const { cnj, guardadas, oabs } = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ cnj: processos.cnj }).from(processos).where(eq(processos.id, processoId));
      if (!p) falha(404, "nao_encontrado");
      return { cnj: p.cnj, guardadas: await comunicacoesGuardadas(tx, processoId), oabs: await oabsDaEquipe(tx) };
    });
    let doDjen: Awaited<ReturnType<typeof buscarDjenDoProcesso>> = [];
    if (cnj) {
      try {
        doDjen = await buscarDjenDoProcesso(cnj, { fetch: deps.captura.fetch, ...deps.captura.djen, timeout: 20_000, maxPaginas: 2 });
      } catch (err) {
        deps.log("djen do processo falhou", { processoId, error: err instanceof Error ? err.message : String(err) });
        if (!guardadas.length) falha(503, "djen_fora", "O Diário não respondeu agora. Tente de novo em alguns minutos.");
      }
    }
    const { partes: achadas } = partesDoDjen([...guardadas, ...doDjen], oabs);
    const r = await tenant(c, deps, (tx) => completarPartes(tx, c.get("orgId"), processoId, achadas));
    return c.json({ ...r, encontradas: achadas.length });
  });

  /** Atualizar do DataJud agora (o botão da ficha). Tribunal fora do ar não derruba a tela. */
  app.post("/processos/:id/datajud", async (c) => {
    const processoId = id(c);
    if (c.get("demonstracao")) falha(409, "demonstracao", "Na demonstração a busca no DJEN e no DataJud fica desligada: as OABs e os números de processo são inventados e trariam dados de gente de verdade.");
    if (!deps.captura.datajudKey) falha(503, "datajud_desligado", "Falta a chave do DataJud no servidor.");
    try {
      const novas = await atualizarDoDataJud(deps.captura, c.get("orgId"), processoId);
      return c.json({ novas });
    } catch (err) {
      deps.log("datajud falhou", { processoId, error: err instanceof Error ? err.message : String(err) });
      falha(503, "datajud_fora", "O DataJud não respondeu agora. Tente de novo em alguns minutos.");
    }
  });

  app.get("/processos/:id/pecas", async (c) => {
    const processoId = id(c);
    const linhas = await tenant(c, deps, (tx) => tx.select({ id: pecas.id, titulo: pecas.titulo, tipo: pecas.tipo, situacao: pecas.situacao, atualizadaEm: pecas.updatedAt }).from(pecas).where(eq(pecas.processoId, processoId)).orderBy(desc(pecas.updatedAt)));
    return c.json({ itens: linhas.map((l) => ({ ...l, atualizadaEm: l.atualizadaEm.toISOString() })) });
  });
}

async function docsPorEvento(tx: Tx, processoId: string, eventos: number[]) {
  if (!eventos.length) return new Map<number, { id: string; nome: string; paginas: number | null }>();
  const docs = await tx.select({ id: documentos.id, nome: documentos.nome, evento: documentos.evento, paginas: documentos.paginas }).from(documentos).where(and(eq(documentos.processoId, processoId), inArray(documentos.evento, eventos)));
  return new Map(docs.map((d) => [d.evento!, { id: d.id, nome: d.nome, paginas: d.paginas }]));
}

function movimentacaoNaTela(m: typeof movimentacoes.$inferSelect, docs: Map<number, { id: string; nome: string; paginas: number | null }>, resumoEm?: Date) {
  return {
    id: m.id,
    em: m.em.toISOString(),
    evento: m.evento,
    titulo: m.titulo,
    descricao: m.descricao,
    autor: m.autor,
    fonte: m.fonte,
    nova: resumoEm ? m.createdAt > resumoEm : false,
    documento: m.evento != null ? (docs.get(m.evento) ?? null) : null,
  };
}
