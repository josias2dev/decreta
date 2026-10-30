import { horaLocal, diaPorExtenso, diaDoInstante, hojeEm } from "@decreta/core";
import { analises, audiencias, clientes, conversas, equipe, mensagensIa, pecas, prazos, processos, publicacoes, retornosIa, tarefas, withTenant, type ParteDaMensagem, type Tx } from "@decreta/db";
import {
  briefingDoPrazo,
  conversar,
  conversarComAssistente,
  ehTetoDoGateway,
  itemDoChecklist,
  prepararAudiencia,
  resultadoParaGuardar,
  resumirAtendimento,
  resumirAutos,
  RODAPE_IA,
  IaRecusou,
  tituloDaConversa,
  tituloProvisorio,
  type Ia,
  type MensagemDaConversa,
} from "@decreta/ia";
import { and, asc, desc, eq, exists, gt, ilike, isNull, or, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { analisar } from "../servicos/analises.ts";
import { dadosDoEscritorio, PedidoInvalido } from "../servicos/assistente.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { AVISOS } from "../servicos/uso-ia.ts";
import { comLimiteDaIa, corpo, ehSocio, falha, iaDaRota, id, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

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

/** Uma linha da resposta do Perguntar. */
export type EventoDaConversa =
  | { t: "inicio"; conversa: { id: string; titulo: string; modo: string }; pergunta: { id: string } }
  | { t: "texto"; v: string }
  | { t: "ferramenta"; id: string; nome: string; entrada: unknown }
  | { t: "resultado"; id: string; nome: string; saida?: unknown; erro?: string }
  | { t: "fim"; mensagem: { id: string } | null }
  | { t: "titulo"; v: string };

function conversaNaTela(k: typeof conversas.$inferSelect, processo: { id: string | null; titulo: string | null } | null) {
  return { id: k.id, titulo: k.titulo, modo: k.modo, fixada: k.fixada, criadaEm: k.createdAt.toISOString(), atualizadaEm: k.updatedAt.toISOString(), processo: processo?.id ? { id: processo.id, titulo: processo.titulo } : null };
}

export function rotasDaIa(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const comIa = comLimiteDaIa(deps);

  app.post("/ia/briefing/:id", comIa, async (c) => {
    const ia = iaDaRota(c);
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

  app.post("/ia/resumo/:id", comIa, async (c) => {
    const ia = iaDaRota(c);
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

  app.post("/ia/audiencia/:id", comIa, async (c) => {
    const ia = iaDaRota(c);
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

  app.post("/ia/chat/:id", comLimiteDaIa(deps, { mensagem: "chat-processo" }), async (c) => {
    const ia = iaDaRota(c);
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

  /* ---------------- Perguntar: as conversas de cada pessoa ---------------- */

  /** Só a pessoa vê as próprias conversas (o RLS separa os escritórios; aqui, as pessoas). */
  const daPessoa = (c: C) => eq(conversas.userId, c.get("userId"));

  app.get("/ia/conversas", async (c) => {
    const busca = (c.req.query("busca") ?? "").trim().slice(0, 100);
    return tenant(c, deps, async (tx) => {
      const termo = `%${busca.replace(/[%_\\]/g, "")}%`;
      const linhas = await tx
        .select({ conversa: conversas, processo: { id: processos.id, titulo: processos.titulo } })
        .from(conversas)
        .leftJoin(processos, eq(processos.id, conversas.processoId))
        .where(
          and(
            daPessoa(c),
            busca.length >= 2
              ? or(ilike(conversas.titulo, termo), exists(sql`(select 1 from "mensagens_ia" where "mensagens_ia"."conversa_id" = "conversas"."id" and "mensagens_ia"."texto" ilike ${termo})`))
              : undefined,
          ),
        )
        .orderBy(desc(conversas.fixada), desc(conversas.updatedAt))
        .limit(200);
      return c.json({ conversas: linhas.map(({ conversa: k, processo }) => conversaNaTela(k, processo)) });
    });
  });

  app.get("/ia/conversas/:id", async (c) => {
    const conversaId = id(c);
    return tenant(c, deps, async (tx) => {
      const [linha] = await tx
        .select({ conversa: conversas, processo: { id: processos.id, titulo: processos.titulo } })
        .from(conversas)
        .leftJoin(processos, eq(processos.id, conversas.processoId))
        .where(and(eq(conversas.id, conversaId), daPessoa(c)));
      if (!linha) falha(404, "nao_encontrado");
      const msgs = await tx.select().from(mensagensIa).where(eq(mensagensIa.conversaId, conversaId)).orderBy(asc(mensagensIa.createdAt)).limit(400);
      return c.json({
        rodape: RODAPE_IA,
        conversa: conversaNaTela(linha.conversa, linha.processo),
        mensagens: msgs.map((m) => ({ id: m.id, papel: m.papel, texto: m.texto, partes: m.partes ?? null, em: m.createdAt.toISOString() })),
      });
    });
  });

  app.patch("/ia/conversas/:id", async (c) => {
    const conversaId = id(c);
    const b = await corpo(c, z.object({ titulo: z.string().trim().min(1, "Dê um nome para a conversa.").max(120).optional(), fixada: z.boolean().optional() }));
    await tenant(c, deps, async (tx) => {
      // Renomear ou fixar não mexe na ordem do histórico (que é pela última mensagem).
      const [k] = await tx.select({ updatedAt: conversas.updatedAt }).from(conversas).where(and(eq(conversas.id, conversaId), daPessoa(c)));
      if (!k) falha(404, "nao_encontrado");
      await tx
        .update(conversas)
        .set({ ...(b.titulo !== undefined ? { titulo: b.titulo } : {}), ...(b.fixada !== undefined ? { fixada: b.fixada } : {}), updatedAt: k.updatedAt })
        .where(eq(conversas.id, conversaId));
    });
    return c.json({ ok: true });
  });

  app.delete("/ia/conversas/:id", async (c) => {
    const conversaId = id(c);
    const apagadas = await tenant(c, deps, (tx) => tx.delete(conversas).where(and(eq(conversas.id, conversaId), daPessoa(c))).returning({ id: conversas.id }));
    if (!apagadas.length) falha(404, "nao_encontrado");
    return c.json({ ok: true });
  });

  /** A tarefa que a IA deixou pronta num cartão vira tarefa de verdade quando a pessoa confirma (uma vez só). */
  app.post("/ia/conversas/:id/tarefa", async (c) => {
    const conversaId = id(c);
    const b = await corpo(c, z.object({ mensagemId: z.string().uuid(), ferramentaId: z.string().min(1).max(200), titulo: z.string().trim().min(2).max(300).optional(), dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }));
    const r = await tenant(c, deps, async (tx) => {
      const [m] = await tx
        .select({ id: mensagensIa.id, partes: mensagensIa.partes })
        .from(mensagensIa)
        .innerJoin(conversas, eq(conversas.id, mensagensIa.conversaId))
        .where(and(eq(mensagensIa.id, b.mensagemId), eq(conversas.id, conversaId), daPessoa(c)));
      const parte = m?.partes?.find((p) => p.tipo === "ferramenta" && p.id === b.ferramentaId && p.nome === "proporTarefa");
      if (!m || parte?.tipo !== "ferramenta" || !parte.saida) falha(404, "nao_encontrado");
      const proposta = parte.saida as { titulo: string; dia: string; detalhe: string | null; responsavel: { id: string } | null; processo: { id: string } | null; cliente: { id: string } | null; criada?: { id: string } };
      if (proposta.criada) return proposta.criada;
      const [t] = await tx
        .insert(tarefas)
        .values({
          organizationId: c.get("orgId"),
          titulo: b.titulo ?? proposta.titulo,
          dia: b.dia ?? proposta.dia,
          detalhe: proposta.detalhe,
          responsavelId: proposta.responsavel?.id ?? null,
          processoId: proposta.processo?.id ?? null,
          clienteId: proposta.cliente?.id ?? null,
          criadaPor: c.get("userId"),
        })
        .returning({ id: tarefas.id });
      parte.saida = { ...proposta, titulo: b.titulo ?? proposta.titulo, dia: b.dia ?? proposta.dia, criada: { id: t!.id } };
      await tx.update(mensagensIa).set({ partes: m.partes }).where(eq(mensagensIa.id, m.id));
      return { id: t!.id };
    });
    return c.json(r, 201);
  });

  /**
   * Pergunta numa conversa (ou começa uma). A resposta chega aos poucos, uma
   * linha JSON por acontecimento: o começo, cada pedaço de texto, cada
   * ferramenta que a IA consultou e o resultado (vira cartão na tela), o fim e,
   * na primeira resposta, o nome que a IA deu para a conversa.
   */
  app.post("/ia/perguntar", comLimiteDaIa(deps, { mensagem: "perguntar" }), async (c) => {
    const ia = iaDaRota(c);
    const b = await corpo(
      c,
      z.object({
        texto: z.string().trim().min(1).max(4000),
        modo: z.enum(["pergunte", "jurisprudencia"]).default("pergunte"),
        conversaId: z.string().uuid().nullable().optional(),
        /** Processo de onde a pessoa abriu o Perguntar (só vale ao começar a conversa). */
        processoId: z.string().uuid().nullable().optional(),
      }),
    );
    const orgId = c.get("orgId");
    const userId = c.get("userId");
    const preparado = await tenant(c, deps, async (tx) => {
      let conversa: typeof conversas.$inferSelect | undefined;
      if (b.conversaId) {
        [conversa] = await tx.select().from(conversas).where(and(eq(conversas.id, b.conversaId), daPessoa(c)));
        if (!conversa) falha(404, "nao_encontrado");
        if (conversa.modo !== b.modo) await tx.update(conversas).set({ modo: b.modo }).where(eq(conversas.id, conversa.id));
      } else {
        const [p] = b.processoId ? await tx.select({ id: processos.id }).from(processos).where(eq(processos.id, b.processoId)) : [];
        [conversa] = await tx.insert(conversas).values({ organizationId: orgId, userId, titulo: tituloProvisorio(b.texto), modo: b.modo, processoId: p?.id ?? null }).returning();
      }
      const k = conversa!;
      const [foco] = k.processoId ? await tx.select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj }).from(processos).where(eq(processos.id, k.processoId)) : [];
      const anteriores = await tx.select().from(mensagensIa).where(eq(mensagensIa.conversaId, k.id)).orderBy(desc(mensagensIa.createdAt)).limit(40);
      const [pergunta] = await tx.insert(mensagensIa).values({ organizationId: orgId, conversaId: k.id, userId, papel: "pessoa", texto: b.texto }).returning({ id: mensagensIa.id });
      const [eu] = await tx.select({ cargo: equipe.cargo }).from(equipe).where(eq(equipe.userId, userId));
      return {
        conversa: k,
        nova: !b.conversaId,
        perguntaId: pergunta!.id,
        cargo: eu?.cargo ?? null,
        foco: foco ? `${foco.titulo}${foco.cnj ? ` (${foco.cnj})` : ""}, id ${foco.id}` : null,
        historico: [...anteriores.reverse().map((m) => ({ papel: m.papel, texto: m.texto, partes: m.partes })), { papel: "pessoa" as const, texto: b.texto }],
      };
    });

    const { conversa } = preparado;
    const r = conversarComAssistente(
      ia,
      {
        modo: b.modo,
        quem: { nome: c.get("userNome"), cargo: preparado.cargo, escritorio: c.get("orgNome"), hoje: hojeEm(c.get("timezone")), timezone: c.get("timezone"), foco: preparado.foco },
        historico: preparado.historico,
        dados: dadosDoEscritorio({ db, organizationId: orgId, userId, timezone: c.get("timezone") }),
      },
      c.req.raw.signal,
    );
    const encoder = new TextEncoder();
    const corpoDaResposta = new ReadableStream<Uint8Array>({
      async start(controller) {
        let aberto = true;
        const enviar = (evento: EventoDaConversa) => {
          if (!aberto) return;
          try {
            controller.enqueue(encoder.encode(`${JSON.stringify(evento)}\n`));
          } catch {
            aberto = false;
          }
        };
        enviar({ t: "inicio", conversa: { id: conversa.id, titulo: conversa.titulo, modo: b.modo }, pergunta: { id: preparado.perguntaId } });
        const partes: ParteDaMensagem[] = [];
        const textoDe = () => partes.flatMap((p) => (p.tipo === "texto" ? [p.texto.trim()] : [])).filter(Boolean).join("\n\n");
        try {
          for await (const p of r.fullStream) {
            if (p.type === "text-delta") {
              const ultima = partes.at(-1);
              if (ultima?.tipo === "texto") ultima.texto += p.text;
              else partes.push({ tipo: "texto", texto: p.text });
              enviar({ t: "texto", v: p.text });
            } else if (p.type === "tool-call") {
              partes.push({ tipo: "ferramenta", id: p.toolCallId, nome: p.toolName, entrada: p.input, saida: null });
              enviar({ t: "ferramenta", id: p.toolCallId, nome: p.toolName, entrada: p.input });
            } else if (p.type === "tool-result") {
              const parte = partes.find((x) => x.tipo === "ferramenta" && x.id === p.toolCallId);
              const saida = resultadoParaGuardar(p.toolName, p.output);
              if (parte?.tipo === "ferramenta") parte.saida = saida;
              enviar({ t: "resultado", id: p.toolCallId, nome: p.toolName, saida });
            } else if (p.type === "tool-error") {
              const erro = p.error instanceof PedidoInvalido ? p.error.message : "Não deu para consultar agora.";
              if (!(p.error instanceof PedidoInvalido)) deps.log("ferramenta da IA falhou", { ferramenta: p.toolName, error: p.error instanceof Error ? p.error.message : String(p.error) });
              const parte = partes.find((x) => x.tipo === "ferramenta" && x.id === p.toolCallId);
              if (parte?.tipo === "ferramenta") parte.erro = erro;
              enviar({ t: "resultado", id: p.toolCallId, nome: p.toolName, erro });
            } else if (p.type === "error") {
              throw p.error;
            }
          }
        } catch (err) {
          const parou = c.req.raw.signal.aborted;
          if (!parou) deps.log("conversa com a IA caiu", { metodo: b.modo, error: err instanceof Error ? err.message : String(err) });
          const aviso = parou ? "[Você parou a resposta aqui.]" : ehTetoDoGateway(err) ? AVISOS.gateway : textoDe() ? "[A resposta parou no meio. Pergunte de novo.]" : "Não consegui responder agora. Tente de novo em instantes.";
          partes.push({ tipo: "texto", texto: aviso });
          enviar({ t: "texto", v: `\n\n${aviso}` });
        }
        const texto = textoDe();
        const mensagemId = await withTenant(db, orgId, async (tx) => {
          const [m] = await tx.insert(mensagensIa).values({ organizationId: orgId, conversaId: conversa.id, userId, papel: "ia", texto, partes }).returning({ id: mensagensIa.id });
          await tx.update(conversas).set({ updatedAt: sql`now()` }).where(eq(conversas.id, conversa.id));
          return m!.id;
        }).catch((err) => {
          deps.log("resposta da IA não foi gravada", { error: err instanceof Error ? err.message : String(err) });
          return null;
        });
        enviar({ t: "fim", mensagem: mensagemId ? { id: mensagemId } : null });
        if (preparado.nova && texto && !c.req.raw.signal.aborted) {
          const titulo = await tituloDaConversa(ia, b.texto, texto, AbortSignal.timeout(10_000)).catch(() => null);
          if (titulo) {
            await withTenant(db, orgId, (tx) => tx.update(conversas).set({ titulo }).where(eq(conversas.id, conversa.id))).catch(() => {});
            enviar({ t: "titulo", v: titulo });
          }
        }
        aberto = false;
        try {
          controller.close();
        } catch {
          // a pessoa já fechou a tela
        }
      },
    });
    return new Response(corpoDaResposta, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-cache", "x-content-type-options": "nosniff", "x-accel-buffering": "no" } });
  });

  app.post("/ia/atendimento", comIa, async (c) => {
    const ia = iaDaRota(c);
    const { transcricao } = await corpo(c, z.object({ transcricao: z.string().trim().min(1).max(200_000) }));
    try {
      return c.json({ situacao: "pronto", conteudo: await resumirAtendimento(ia, transcricao) });
    } catch (err) {
      if (err instanceof IaRecusou) return c.json({ situacao: "recusa", conteudo: { recusa: err.motivo } });
      throw err;
    }
  });

  /** Áudio do atendimento → texto (pelo gateway). */
  app.post("/ia/transcrever", comIa, async (c) => {
    const ia = iaDaRota(c);
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("audio");
    if (!(arquivo instanceof File)) falha(400, "sem_audio");
    if (arquivo.size > 25 * 1024 * 1024) falha(422, "audio_grande", "O áudio passa de 25 MB. Grave em partes.");
    const texto = await ia.transcrever(new Uint8Array(await arquivo.arrayBuffer()), arquivo.type || "audio/ogg");
    return c.json({ texto });
  });
}

/** A resposta vai chegando na tela; no fim, é gravada. Se a IA cair no meio, grava o que veio com um aviso. */
function responderAosPoucos(
  c: C,
  deps: DepsDasRotas,
  ia: Ia,
  pedido: { metodo: "chat-processo"; contexto: string; historico: MensagemDaConversa[] },
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
        const aviso = ehTetoDoGateway(err) ? `${resposta ? "\n\n" : ""}${AVISOS.gateway}` : resposta ? "\n\n[A resposta parou no meio. Pergunte de novo.]" : "Não consegui responder agora. Tente de novo em instantes.";
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
