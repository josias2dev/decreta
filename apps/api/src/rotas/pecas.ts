import { analises, documentos, modelos, pecas, prazos, processos, revisoesDePeca, withTenant, type VerificacaoDaPeca } from "@decreta/db";
import { MIME_DOCX, nomeDoArquivo } from "@decreta/documentos";
import { CATALOGO, GRUPOS_DE_PECA, gerarPeca, pecaParaPrazo, RODAPE_IA, tipoDePeca, type Ia } from "@decreta/ia";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { hashDoTexto, resumoDaVerificacao, verificarCitacoes } from "../servicos/acervo.ts";
import { paraQualificar, qualificacaoDasPartes } from "../servicos/cadastros.ts";
import { calculosParaPeca } from "../servicos/calculos.ts";
import { semIa } from "../servicos/contexto.ts";
import { modelosParaPeca } from "../servicos/modelos.ts";
import { montarPedidoDePeca, sobreOCaso } from "../servicos/pecas.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { docxNoTimbre, timbreDoEscritorio } from "../servicos/timbre.ts";
import { comLimiteDaIa, corpo, falha, iaDaRota, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

export function rotasDasPecas(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/pecas/catalogo", (c) =>
    c.json({ total: CATALOGO.length, grupos: GRUPOS_DE_PECA.map((g) => ({ nome: g, tipos: CATALOGO.filter((t) => t.grupo === g).map((t) => ({ id: t.id, nome: t.nome })) })) }),
  );

  /** O que a tela Gerar peça precisa antes de gerar: o tipo sugerido pelo prazo e o que a IA vai ler. */
  app.get("/pecas/preparar", async (c) => {
    const prazoId = c.req.query("prazo");
    const processoIdPedido = c.req.query("processo");
    const tipoPedido = c.req.query("tipo");
    return tenant(c, deps, async (tx) => {
      const [prazo] = prazoId ? await tx.select().from(prazos).where(eq(prazos.id, prazoId)) : [];
      const processoId = prazo?.processoId ?? processoIdPedido;
      if (!processoId) falha(400, "sem_processo");
      const [p] = await tx.select().from(processos).where(eq(processos.id, processoId));
      if (!p) falha(404, "nao_encontrado");
      const docs = await tx
        .select({ nome: documentos.nome, evento: documentos.evento })
        .from(documentos)
        .where(and(eq(documentos.processoId, processoId), isNotNull(documentos.texto)))
        .orderBy(desc(documentos.createdAt))
        .limit(6);
      const [briefing] = prazo ? await tx.select({ id: analises.id }).from(analises).where(and(eq(analises.alvo, "prazo"), eq(analises.alvoId, prazo.id), eq(analises.acao, "briefing-prazo"), eq(analises.situacao, "pronto"))).limit(1) : [];
      const [contraria] = prazo ? await tx.select({ fonte: analises.fonte }).from(analises).where(and(eq(analises.alvo, "prazo"), eq(analises.alvoId, prazo.id), eq(analises.acao, "ler-peca-contraria"), eq(analises.situacao, "pronto"))).orderBy(desc(analises.createdAt)).limit(1) : [];
      const sugerido = prazo ? pecaParaPrazo(prazo.tipo) : tipoDePeca("outro")!;
      const [rascunho] = await tx.select().from(pecas).where(prazo ? eq(pecas.prazoId, prazo.id) : eq(pecas.processoId, processoId)).orderBy(desc(pecas.updatedAt)).limit(1);
      const tipo = (tipoPedido && tipoDePeca(tipoPedido)) || (rascunho && tipoDePeca(rascunho.tipo)) || sugerido;
      const doBanco = await modelosParaPeca(tx, { tipo: tipo.id, sobre: sobreOCaso(p, prazo?.tipo) });
      const contas = await calculosParaPeca(tx, p.id, tipo.id);
      return c.json({
        processo: { id: p.id, titulo: p.titulo, cnj: p.cnj, orgao: p.orgao, semIa: await semIa(tx, { processoId: p.id }) },
        prazo: prazo ? { id: prazo.id, tipo: prazo.tipo, fim: prazo.fim } : null,
        tipoSugerido: sugerido.id,
        leu: [...docs.map((d) => (d.evento != null ? `${d.nome} · evento ${d.evento}` : d.nome)), ...(briefing ? ["Briefing do prazo"] : []), ...(contraria ? [`Pontos a rebater (${contraria.fonte})`] : []), ...contas.map((k) => `Memória de cálculo · ${k.titulo}`)],
        /** Os modelos do escritório que a IA vai seguir para o tipo escolhido. */
        modelos: doBanco.map((m) => ({ id: m.id, titulo: m.titulo })),
        ultima: rascunho ? { id: rascunho.id, titulo: rascunho.titulo, tipo: rascunho.tipo, instrucoes: rascunho.instrucoes, texto: rascunho.texto, situacao: rascunho.situacao, atualizadaEm: rascunho.updatedAt.toISOString() } : null,
      });
    });
  });

  app.get("/pecas/:id", async (c) => {
    const pecaId = id(c);
    return tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(pecas).where(eq(pecas.id, pecaId));
      if (!p) falha(404, "nao_encontrado");
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const revisor = p.revisadaPor ? pessoas.get(p.revisadaPor) : undefined;
      const usados = p.modelos.length ? await tx.select({ id: modelos.id, titulo: modelos.titulo }).from(modelos).where(inArray(modelos.id, p.modelos)) : [];
      const revisoes = await tx.select().from(revisoesDePeca).where(eq(revisoesDePeca.pecaId, p.id)).orderBy(desc(revisoesDePeca.revisadaEm));
      return c.json({
        id: p.id,
        processoId: p.processoId,
        prazoId: p.prazoId,
        tipo: p.tipo,
        titulo: p.titulo,
        instrucoes: p.instrucoes,
        texto: p.texto,
        situacao: p.situacao,
        atualizadaEm: p.updatedAt.toISOString(),
        rodape: RODAPE_IA,
        /** Quem revisou, com a OAB, e quando: a peça gerada pela IA tem um advogado responsável. */
        revisao:
          p.situacao === "revisada" && p.revisadaEm
            ? { por: revisor ? { id: revisor.id, nome: revisor.nome, apelido: revisor.apelido, iniciais: revisor.iniciais, oab: revisor.oab } : null, em: p.revisadaEm.toISOString() }
            : null,
        modelos: usados,
        /** O registro de cada revisão, da mais nova à mais antiga, com quanto o texto se afastou da versão da IA. */
        revisoes: revisoes.map((r) => {
          const por = r.revisadaPor ? pessoas.get(r.revisadaPor) : undefined;
          return {
            id: r.id,
            em: r.revisadaEm.toISOString(),
            por: por ? { id: por.id, nome: por.nome, apelido: por.apelido, iniciais: por.iniciais, oab: por.oab } : null,
            geradaPorIa: r.textoGerado !== null,
            ...mudancaNaRevisao(r.textoGerado, r.textoFinal),
          };
        }),
        semIa: await semIa(tx, { processoId: p.processoId }),
        /** A última verificação das citações; `atual` cai quando o texto muda depois dela. */
        verificacao: p.verificacao ? { ...p.verificacao, atual: p.verificacao.hashDoTexto === hashDoTexto(p.texto) } : null,
      });
    });
  });

  /** "Verificar peça": cada citação do texto com o selo, conferida no acervo. Fica guardada na peça. */
  app.post("/pecas/:id/verificar", async (c) => {
    const pecaId = id(c);
    const [peca] = await tenant(c, deps, (tx) => tx.select({ texto: pecas.texto }).from(pecas).where(eq(pecas.id, pecaId)));
    if (!peca) falha(404, "nao_encontrado");
    const citacoes = await verificarCitacoes({ db, fetch: deps.captura.fetch, log: deps.log }, c.get("orgId"), peca.texto);
    const verificacao: VerificacaoDaPeca = { em: new Date().toISOString(), hashDoTexto: hashDoTexto(peca.texto), resumo: resumoDaVerificacao(citacoes), citacoes };
    await tenant(c, deps, (tx) => tx.update(pecas).set({ verificacao }).where(eq(pecas.id, pecaId)));
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.verificada", detalhes: { pecaId, ...verificacao.resumo }, ip: ip(c) }, deps.log);
    return c.json({ verificadaEm: verificacao.em, resumo: verificacao.resumo, citacoes });
  });

  /** As duas versões de uma revisão: a que a IA entregou e a que a pessoa revisou. */
  app.get("/pecas/:id/revisoes/:revisao", async (c) => {
    const pecaId = id(c);
    const revisaoId = id(c, "revisao");
    return tenant(c, deps, async (tx) => {
      const [r] = await tx
        .select({ id: revisoesDePeca.id, textoGerado: revisoesDePeca.textoGerado, textoFinal: revisoesDePeca.textoFinal })
        .from(revisoesDePeca)
        .where(and(eq(revisoesDePeca.id, revisaoId), eq(revisoesDePeca.pecaId, pecaId)));
      if (!r) falha(404, "nao_encontrado");
      return c.json(r);
    });
  });

  const pedidoDePeca = z.object({
    processoId: z.string().uuid(),
    prazoId: z.string().uuid().nullable().optional(),
    tipo: z.string().min(1).max(60),
    instrucoes: z.string().max(5000).default(""),
    /** Refazer em cima de uma peça existente (o "Gerar de novo"). */
    pecaId: z.string().uuid().nullable().optional(),
  });

  /** Gera a peça com a IA, com o texto chegando aos poucos. O id da peça vai no cabeçalho `x-peca-id`. */
  app.post("/pecas", comLimiteDaIa(deps), async (c) => {
    const ia = iaDaRota(c);
    const b = await corpo(c, pedidoDePeca);
    const tipo = tipoDePeca(b.tipo) ?? falha(422, "tipo_desconhecido");
    const preparado = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(processos).where(eq(processos.id, b.processoId));
      if (!p) falha(404, "processo_nao_encontrado");
      const [prazo] = b.prazoId ? await tx.select().from(prazos).where(eq(prazos.id, b.prazoId)) : [];
      const montado = await montarPedidoDePeca(db, tx, { organizationId: c.get("orgId"), nomeDoEscritorio: c.get("orgNome"), quem: { id: c.get("userId"), nome: c.get("userNome") }, processo: p, prazo: prazo ?? null, tipo, instrucoes: b.instrucoes });
      const qualificar = await paraQualificar(tx, p.id);
      const valores = { tipo: tipo.id, titulo: montado.titulo, instrucoes: b.instrucoes, texto: "", textoGerado: null, situacao: "rascunho" as const, criadaPor: c.get("userId"), revisadaPor: null, revisadaEm: null, modelos: montado.modelos };
      const pecaId = b.pecaId
        ? (await tx.update(pecas).set(valores).where(eq(pecas.id, b.pecaId)).returning({ id: pecas.id }))[0]?.id
        : (await tx.insert(pecas).values({ organizationId: c.get("orgId"), processoId: p.id, prazoId: prazo?.id ?? null, ...valores }).returning({ id: pecas.id }))[0]?.id;
      if (!pecaId) falha(404, "nao_encontrado");
      return { pecaId, pedido: montado.pedido, qualificar };
    });
    // A Receita é consultada fora da transação: pode levar alguns segundos.
    const qualificacao = await qualificacaoDasPartes({ fetch: deps.captura.fetch, log: deps.log }, preparado.qualificar, c.get("demonstracao"));
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.gerada", detalhes: { pecaId: preparado.pecaId, tipo: tipo.id }, ip: ip(c) }, deps.log);
    return transmitirPeca(c, deps, ia, preparado.pecaId, { ...preparado.pedido, qualificacao });
  });

  /** Peça escrita à mão, sem a IA: guarda o texto e devolve o id. */
  app.post("/pecas/manual", async (c) => {
    const b = await corpo(c, z.object({ processoId: z.string().uuid(), prazoId: z.string().uuid().nullable().optional(), tipo: z.string().min(1).max(60), texto: z.string().max(400_000) }));
    const tipo = tipoDePeca(b.tipo) ?? falha(422, "tipo_desconhecido");
    const pecaId = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(processos).where(eq(processos.id, b.processoId));
      if (!p) falha(404, "processo_nao_encontrado");
      const [prazo] = b.prazoId ? await tx.select({ id: prazos.id }).from(prazos).where(eq(prazos.id, b.prazoId)) : [];
      const [linha] = await tx
        .insert(pecas)
        .values({ organizationId: c.get("orgId"), processoId: p.id, prazoId: prazo?.id ?? null, tipo: tipo.id, titulo: `${tipo.nome} · ${p.titulo.split(" × ")[0]}`, instrucoes: "", texto: b.texto, situacao: "rascunho", criadaPor: c.get("userId") })
        .returning({ id: pecas.id });
      return linha!.id;
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.escrita", detalhes: { pecaId, tipo: tipo.id }, ip: ip(c) }, deps.log);
    return c.json({ id: pecaId }, 201);
  });

  /**
   * Salva o texto, o título ou a situação. Marcar como revisada grava quem e
   * quando, e guarda no registro a versão da IA e a revisada; mudar o texto de
   * uma peça revisada a devolve a rascunho, porque a revisão vale para o texto
   * que a pessoa leu.
   */
  app.put("/pecas/:id", async (c) => {
    const pecaId = id(c);
    const b = await corpo(c, z.object({ texto: z.string().max(400_000).optional(), titulo: z.string().trim().min(2).max(300).optional(), situacao: z.enum(["rascunho", "revisada"]).optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [atual] = await tx.select({ texto: pecas.texto, situacao: pecas.situacao, textoGerado: pecas.textoGerado }).from(pecas).where(eq(pecas.id, pecaId));
      if (!atual) return null;
      const valores: Partial<typeof pecas.$inferInsert> = { ...b };
      const textoMudou = b.texto !== undefined && b.texto !== atual.texto;
      let revisao: Record<string, unknown> | null = null;
      if (b.situacao === "revisada") {
        const agora = new Date();
        Object.assign(valores, { revisadaPor: c.get("userId"), revisadaEm: agora });
        const textoFinal = b.texto ?? atual.texto;
        const [linha] = await tx
          .insert(revisoesDePeca)
          .values({ organizationId: c.get("orgId"), pecaId, textoGerado: atual.textoGerado, textoFinal, revisadaPor: c.get("userId"), revisadaEm: agora })
          .returning({ id: revisoesDePeca.id });
        revisao = { revisaoId: linha!.id, geradaPorIa: atual.textoGerado !== null, ...mudancaNaRevisao(atual.textoGerado, textoFinal) };
      } else if (b.situacao === "rascunho" || (textoMudou && atual.situacao === "revisada")) Object.assign(valores, { situacao: "rascunho", revisadaPor: null, revisadaEm: null });
      await tx.update(pecas).set(valores).where(eq(pecas.id, pecaId));
      return { situacao: valores.situacao ?? atual.situacao, revisao };
    });
    if (!r) falha(404, "nao_encontrado");
    if (r.revisao) await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.revisada", detalhes: { pecaId, ...r.revisao }, ip: ip(c) }, deps.log);
    return c.json({ ok: true, situacao: r.situacao });
  });

  /** O DOCX no timbre do escritório. */
  app.get("/pecas/:id/docx", async (c) => {
    const pecaId = id(c);
    const { peca, timbre } = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(pecas).where(eq(pecas.id, pecaId));
      if (!p) falha(404, "nao_encontrado");
      return { peca: p, timbre: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")) };
    });
    const docx = await docxNoTimbre(deps.arquivos, timbre, { titulo: peca.titulo, texto: peca.texto });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.baixada", detalhes: { pecaId }, ip: ip(c) }, deps.log);
    return new Response(docx, {
      headers: {
        "content-type": MIME_DOCX,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeDoArquivo(peca.titulo))}`,
        "cache-control": "no-store",
      },
    });
  });
}

/** Parágrafos da peça, sem diferença de espaços. */
const paragrafos = (texto: string) =>
  texto
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

/**
 * Quanto a versão revisada se afastou da versão da IA, em parágrafos: os da
 * final que não estavam na da IA (novos ou reescritos). Sem versão da IA
 * (peça à mão), todos contam como da pessoa.
 */
function mudancaNaRevisao(textoGerado: string | null, textoFinal: string): { paragrafos: number; mudaram: number } {
  const final = paragrafos(textoFinal);
  const daIa = new Set(textoGerado === null ? [] : paragrafos(textoGerado));
  return { paragrafos: final.length, mudaram: final.filter((p) => !daIa.has(p)).length };
}

function transmitirPeca(c: C, deps: DepsDasRotas, ia: Ia, pecaId: string, pedido: Parameters<typeof gerarPeca>[1]) {
  const orgId = c.get("orgId");
  const r = gerarPeca(ia, pedido, c.req.raw.signal);
  const encoder = new TextEncoder();
  let texto = "";
  /** Só o que veio da IA, sem o aviso de queda: a versão gerada do registro de revisão. */
  let daIa = "";
  let gravadoEm = Date.now();
  const gravar = (fim = false) =>
    withTenant(deps.db, orgId, (tx) =>
      tx
        .update(pecas)
        .set(fim ? { texto, textoGerado: daIa || null } : { texto })
        .where(eq(pecas.id, pecaId)),
    ).catch(() => {});
  const corpoDaResposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const pedaco of r.textStream) {
          texto += pedaco;
          daIa += pedaco;
          controller.enqueue(encoder.encode(pedaco));
          // Grava de tempos em tempos: se a pessoa fechar a tela, o rascunho fica.
          if (Date.now() - gravadoEm > 4_000) {
            gravadoEm = Date.now();
            void gravar();
          }
        }
      } catch (err) {
        deps.log("geração de peça caiu", { pecaId, error: err instanceof Error ? err.message : String(err) });
        const aviso = texto ? "\n\n[A geração parou no meio. Gere de novo ou continue editando.]" : "Não consegui gerar a peça agora. Tente de novo em instantes.";
        texto += aviso;
        controller.enqueue(encoder.encode(aviso));
      } finally {
        await gravar(true);
        controller.close();
      }
    },
  });
  return new Response(corpoDaResposta, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache", "x-peca-id": pecaId } });
}

