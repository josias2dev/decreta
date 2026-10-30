import { formatarDia } from "@decreta/core";
import { analises, documentos, escritorios, modelos, pecas, prazos, processos, withTenant } from "@decreta/db";
import { gerarDocx, MIME_DOCX, nomeDoArquivo } from "@decreta/documentos";
import { CATALOGO, GRUPOS_DE_PECA, gerarPeca, pecaParaPrazo, RODAPE_IA, tipoDePeca, type Briefing, type Ia } from "@decreta/ia";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { paraQualificar, qualificacaoDasPartes } from "../servicos/cadastros.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { modelosParaPeca } from "../servicos/modelos.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { comLimiteDaIa, corpo, falha, iaDaRota, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

function briefingEmTexto(b: Briefing): string {
  return [`O que o juízo decidiu: ${b.decidiu}`, `O que fazer: ${b.fazer.join(" ")}`, `A nosso favor: ${b.aFavor.join(" ")}`, `Contra nós: ${b.contra.join(" ")}`].join("\n");
}

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
      const [briefing] = prazo ? await tx.select({ id: analises.id }).from(analises).where(and(eq(analises.alvo, "prazo"), eq(analises.alvoId, prazo.id), eq(analises.situacao, "pronto"))).limit(1) : [];
      const sugerido = prazo ? pecaParaPrazo(prazo.tipo) : tipoDePeca("outro")!;
      const [rascunho] = await tx.select().from(pecas).where(prazo ? eq(pecas.prazoId, prazo.id) : eq(pecas.processoId, processoId)).orderBy(desc(pecas.updatedAt)).limit(1);
      const tipo = (tipoPedido && tipoDePeca(tipoPedido)) || (rascunho && tipoDePeca(rascunho.tipo)) || sugerido;
      const doBanco = await modelosParaPeca(tx, { tipo: tipo.id, sobre: sobreOCaso(p, prazo?.tipo) });
      return c.json({
        processo: { id: p.id, titulo: p.titulo, cnj: p.cnj, orgao: p.orgao },
        prazo: prazo ? { id: prazo.id, tipo: prazo.tipo, fim: prazo.fim } : null,
        tipoSugerido: sugerido.id,
        leu: [...docs.map((d) => (d.evento != null ? `${d.nome} · evento ${d.evento}` : d.nome)), ...(briefing ? ["Briefing do prazo"] : [])],
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
      });
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
      const [briefing] = prazo
        ? await tx.select({ conteudo: analises.conteudo }).from(analises).where(and(eq(analises.alvo, "prazo"), eq(analises.alvoId, prazo.id), eq(analises.situacao, "pronto"))).orderBy(desc(analises.createdAt)).limit(1)
        : [];
      const ctx = await carregarContexto(tx, p.id, { documentos: true });
      const qualificar = await paraQualificar(tx, p.id);
      const doBanco = await modelosParaPeca(tx, { tipo: tipo.id, sobre: [sobreOCaso(p, prazo?.tipo), b.instrucoes].join(" ") });
      const [esc] = await tx.select().from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const advogadoId = prazo?.responsavelId ?? p.responsavelId ?? c.get("userId");
      const advogado = pessoas.get(advogadoId) ?? pessoas.get(c.get("userId"));
      const titulo = `${tipo.nome} · ${p.titulo.split(" × ")[0]}`;
      const valores = { tipo: tipo.id, titulo, instrucoes: b.instrucoes, texto: "", situacao: "rascunho" as const, criadaPor: c.get("userId"), revisadaPor: null, revisadaEm: null, modelos: doBanco.map((m) => m.id) };
      const pecaId = b.pecaId
        ? (await tx.update(pecas).set(valores).where(eq(pecas.id, b.pecaId)).returning({ id: pecas.id }))[0]?.id
        : (await tx.insert(pecas).values({ organizationId: c.get("orgId"), processoId: p.id, prazoId: prazo?.id ?? null, ...valores }).returning({ id: pecas.id }))[0]?.id;
      if (!pecaId) falha(404, "nao_encontrado");
      return {
        pecaId,
        pedido: {
          tipo,
          instrucoes: b.instrucoes,
          prazo: prazo ? { tipo: prazo.tipo, fim: formatarDia(prazo.fim), fundamento: prazo.fundamento, briefing: briefing ? briefingEmTexto(briefing.conteudo as unknown as Briefing) : undefined } : undefined,
          contextoDoProcesso: ctx?.texto ?? "",
          escritorio: { nome: esc?.timbre?.nome ?? c.get("orgNome"), advogado: advogado?.nome ?? c.get("userNome"), oab: advogado?.oab ?? null, cidade: p.comarca },
          modelos: doBanco.map((m) => ({ titulo: m.titulo, tese: m.tese, texto: m.texto })),
        },
        qualificar,
      };
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
   * quando; mudar o texto de uma peça revisada a devolve a rascunho, porque a
   * revisão vale para o texto que a pessoa leu.
   */
  app.put("/pecas/:id", async (c) => {
    const pecaId = id(c);
    const b = await corpo(c, z.object({ texto: z.string().max(400_000).optional(), titulo: z.string().trim().min(2).max(300).optional(), situacao: z.enum(["rascunho", "revisada"]).optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [atual] = await tx.select({ texto: pecas.texto, situacao: pecas.situacao }).from(pecas).where(eq(pecas.id, pecaId));
      if (!atual) return null;
      const valores: Partial<typeof pecas.$inferInsert> = { ...b };
      const textoMudou = b.texto !== undefined && b.texto !== atual.texto;
      if (b.situacao === "revisada") Object.assign(valores, { revisadaPor: c.get("userId"), revisadaEm: new Date() });
      else if (b.situacao === "rascunho" || (textoMudou && atual.situacao === "revisada")) Object.assign(valores, { situacao: "rascunho", revisadaPor: null, revisadaEm: null });
      await tx.update(pecas).set(valores).where(eq(pecas.id, pecaId));
      return { situacao: valores.situacao ?? atual.situacao, revisada: b.situacao === "revisada" };
    });
    if (!r) falha(404, "nao_encontrado");
    if (r.revisada) await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "peca.revisada", detalhes: { pecaId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true, situacao: r.situacao });
  });

  /** O DOCX no timbre do escritório. */
  app.get("/pecas/:id/docx", async (c) => {
    const pecaId = id(c);
    const { peca, timbre, logo } = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(pecas).where(eq(pecas.id, pecaId));
      if (!p) falha(404, "nao_encontrado");
      const [esc] = await tx.select().from(escritorios).where(eq(escritorios.organizationId, c.get("orgId")));
      const t = esc?.timbre ?? { nome: c.get("orgNome") };
      const [doc] = t.logoDocumentoId ? await tx.select({ chave: documentos.chave }).from(documentos).where(eq(documentos.id, t.logoDocumentoId)) : [];
      return { peca: p, timbre: t, logo: doc?.chave ?? null };
    });
    const bytesDoLogo = logo ? await deps.arquivos.read(logo).catch(() => null) : null;
    const docx = await gerarDocx({
      titulo: peca.titulo,
      texto: peca.texto,
      timbre: {
        nome: timbre.nome,
        registro: timbre.registro,
        endereco: timbre.endereco,
        contato: timbre.contato,
        fonte: timbre.fonte,
        tamanho: timbre.tamanho,
        cor: timbre.cor,
        logo: bytesDoLogo ? { bytes: bytesDoLogo, ...tamanhoDoPng(bytesDoLogo) } : undefined,
      },
    });
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

/** Do que é o caso, em palavras: o que a busca dos modelos compara. */
function sobreOCaso(p: { assunto: string | null; classe: string | null; titulo: string }, tipoDoPrazo?: string): string {
  return [p.assunto, p.classe, tipoDoPrazo].filter(Boolean).join(" ");
}

/** Largura e altura de um PNG, do cabeçalho IHDR. */
export function tamanhoDoPng(bytes: Uint8Array): { largura: number; altura: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return { largura: 3, altura: 1 };
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { largura: v.getUint32(16) || 3, altura: v.getUint32(20) || 1 };
}

function transmitirPeca(c: C, deps: DepsDasRotas, ia: Ia, pecaId: string, pedido: Parameters<typeof gerarPeca>[1]) {
  const orgId = c.get("orgId");
  const r = gerarPeca(ia, pedido, c.req.raw.signal);
  const encoder = new TextEncoder();
  let texto = "";
  let gravadoEm = Date.now();
  const gravar = () => withTenant(deps.db, orgId, (tx) => tx.update(pecas).set({ texto }).where(eq(pecas.id, pecaId))).catch(() => {});
  const corpoDaResposta = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const pedaco of r.textStream) {
          texto += pedaco;
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
        await gravar();
        controller.close();
      }
    },
  });
  return new Response(corpoDaResposta, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-cache", "x-peca-id": pecaId } });
}

