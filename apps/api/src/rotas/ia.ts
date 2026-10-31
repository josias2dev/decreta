import { randomUUID } from "node:crypto";
import { horaLocal, diaPorExtenso, diaDoInstante, ehDia, formatarDia, hojeEm } from "@decreta/core";
import { analises, audiencias, clientes, conversas, equipe, mensagensIa, pecas, prazos, processos, publicacoes, retornosIa, tarefas, withTenant, type ParteDaMensagem, type Tx } from "@decreta/db";
import {
  briefingDoPrazo,
  conversar,
  conversarComAssistente,
  ehTetoDoGateway,
  FalhaNaConsulta,
  FALHOU,
  itemDoChecklist,
  NaoAchou,
  PAROU_ANTES,
  PASSOS,
  PedidoErrado,
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
import { and, asc, count, desc, eq, exists, gt, isNull, like, or, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { analisar } from "../servicos/analises.ts";
import { dadosDoEscritorio, prazosDeAgora } from "../servicos/assistente.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { AVISOS } from "../servicos/uso-ia.ts";
import { comLimiteDaIa, corpo, ehSocio, falha, iaDaRota, id, semAcentoNoBanco, tenant, termoSemAcento, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

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
  | { t: "inicio"; conversa: { id: string; titulo: string; modo: string }; pergunta: { id: string }; resposta: { id: string } }
  | { t: "texto"; v: string }
  | { t: "ferramenta"; id: string; nome: string; entrada: unknown }
  | { t: "resultado"; id: string; nome: string; saida?: unknown; erro?: string }
  | { t: "fim"; mensagem: { id: string } | null }
  | { t: "titulo"; v: string }
  | { t: "ping" };

/** Enquanto a IA pensa calada, uma linha de "ainda aqui": a tela trata como queda o silêncio longo (ver apps/web/src/lib/perguntar.ts). */
export const PULSO_MS = 15_000;

/** Quanto a ligação espera, depois do fim, pelo nome da conversa (que a IA começa a dar no meio da resposta). */
const ESPERA_PELO_NOME = 4_000;
/** Mensagens que voltam para a IA: as últimas 40 a 59, cortadas de 20 em 20 (o começo muda pouco e o cache da IA vale). */
const HISTORICO = 40;
const PODA = 20;

/**
 * A resposta que cada pergunta espera, neste servidor, por 15 minutos. A ligação pode cair só do lado da pessoa,
 * com a IA ainda respondendo aqui: o "Tentar de novo" toma o lugar dela, e a antiga, quando termina, não é gravada.
 */
const respostaDaPergunta = new Map<string, { id: string; ate: number }>();
const VALIDADE_DA_ESPERA = 15 * 60_000;
function esperarResposta(perguntaId: string, respostaId: string) {
  const agora = Date.now();
  for (const [k, v] of respostaDaPergunta) if (v.ate < agora) respostaDaPergunta.delete(k);
  respostaDaPergunta.set(perguntaId, { id: respostaId, ate: agora + VALIDADE_DA_ESPERA });
}

/** As mensagens gravadas depois desta. */
const depoisDa = (mensagemId: string) => sql`${mensagensIa.createdAt} > (select "created_at" from "mensagens_ia" where "id" = ${mensagemId})`;

/** A conversa como volta para a IA, sem a pergunta de agora. A IA não começa a conversa: resposta solta no começo sai. */
async function historicoDaConversa(tx: Tx, conversaId: string, perguntaId: string) {
  const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(mensagensIa).where(eq(mensagensIa.conversaId, conversaId));
  const pular = Math.floor(Math.max(0, n - HISTORICO) / PODA) * PODA;
  const msgs = await tx.select().from(mensagensIa).where(eq(mensagensIa.conversaId, conversaId)).orderBy(asc(mensagensIa.createdAt), asc(mensagensIa.id)).offset(pular);
  const outras = msgs.filter((m) => m.id !== perguntaId);
  const primeira = outras.findIndex((m) => m.papel === "pessoa");
  return primeira < 0 ? [] : outras.slice(primeira);
}

/**
 * O erro da ferramenta como fica guardado e vai para a tela. O pedido da IA que não deu (formato, "não achei",
 * pessoa que não é da equipe) guarda o motivo, curto; a consulta que falhou por dentro guarda FALHOU e vai para o log.
 */
function erroDaFerramenta(err: unknown): { erro: string; log?: Record<string, unknown> } {
  if (err instanceof PedidoErrado || err instanceof NaoAchou) return { erro: err.message };
  // O pedido que nem chegou à ferramenta (JSON quebrado, ferramenta que não existe): a AI SDK manda o motivo em texto para a IA.
  if (typeof err === "string") return { erro: "Pedido fora do formato." };
  return { erro: FALHOU, log: semDados(err instanceof FalhaNaConsulta ? err.causa : err) };
}

/** O tipo e o código do erro, sem o SQL nem os valores da consulta (que podem ser o nome ou o CPF que a pessoa buscou). */
function semDados(err: unknown): Record<string, unknown> {
  const causa = err instanceof Error && err.cause ? err.cause : err;
  const e = causa as { name?: string; code?: string; message?: string } | null;
  return { tipo: e?.name ?? typeof causa, codigo: e?.code ?? null, erro: String(e?.message ?? causa).split(/[:\n]/)[0]!.slice(0, 120) };
}

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
        const hoje = formatarDia(hojeEm(c.get("timezone")));
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
      // Sem diferenciar acento: "alvara" acha "alvará".
      const termo = termoSemAcento(busca);
      const linhas = await tx
        .select({ conversa: conversas, processo: { id: processos.id, titulo: processos.titulo } })
        .from(conversas)
        .leftJoin(processos, eq(processos.id, conversas.processoId))
        .where(
          and(
            daPessoa(c),
            busca.length >= 2
              ? or(like(semAcentoNoBanco(sql`${conversas.titulo}`), termo), exists(sql`(select 1 from "mensagens_ia" where "mensagens_ia"."conversa_id" = "conversas"."id" and ${semAcentoNoBanco(sql`"mensagens_ia"."texto"`)} like ${termo})`))
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
      await prazosDeAgora(tx, msgs.flatMap((m) => m.partes ?? []), c.get("orgId"), c.get("timezone"));
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

  /**
   * A tarefa que a IA deixou pronta num cartão vira tarefa de verdade quando a pessoa confirma (uma vez só).
   * Com `descartar`, fica anotado o "Agora não": o cartão não volta quando a conversa abre de novo.
   */
  app.post("/ia/conversas/:id/tarefa", async (c) => {
    const conversaId = id(c);
    const b = await corpo(
      c,
      z.object({
        mensagemId: z.string().uuid(),
        ferramentaId: z.string().min(1).max(200),
        titulo: z.string().trim().min(2).max(300).optional(),
        dia: z.string().refine(ehDia, "Este dia não existe.").optional(),
        descartar: z.literal(true).optional(),
      }),
    );
    const r = await tenant(c, deps, async (tx) => {
      const [m] = await tx
        .select({ id: mensagensIa.id, partes: mensagensIa.partes })
        .from(mensagensIa)
        .innerJoin(conversas, eq(conversas.id, mensagensIa.conversaId))
        .where(and(eq(mensagensIa.id, b.mensagemId), eq(conversas.id, conversaId), daPessoa(c)));
      const parte = m?.partes?.find((p) => p.tipo === "ferramenta" && p.id === b.ferramentaId && p.nome === "proporTarefa");
      if (!m || parte?.tipo !== "ferramenta" || !parte.saida) falha(404, "nao_encontrado");
      const proposta = parte.saida as { titulo: string; dia: string; detalhe: string | null; responsavel: { id: string } | null; processo: { id: string } | null; cliente: { id: string } | null; criada?: { id: string }; descartada?: boolean };
      if (proposta.criada) return proposta.criada;
      if (b.descartar) {
        parte.saida = { ...proposta, descartada: true };
        await tx.update(mensagensIa).set({ partes: m.partes }).where(eq(mensagensIa.id, m.id));
        return null;
      }
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
    return r ? c.json(r, 201) : c.json({ ok: true });
  });

  /**
   * Pergunta numa conversa (ou começa uma). A resposta chega aos poucos, uma
   * linha JSON por acontecimento: o começo (com o id que a resposta vai ter),
   * cada pedaço de texto, cada ferramenta que a IA consultou e o resultado (vira
   * cartão na tela), o fim e, na primeira resposta, o nome que a IA deu para a
   * conversa. A resposta fica gravada com o id do começo também quando a pessoa
   * para, quando a ligação cai ou quando a IA falha.
   */
  app.post("/ia/perguntar", comLimiteDaIa(deps, { mensagem: "perguntar" }), async (c) => {
    const ia = iaDaRota(c);
    const b = await corpo(
      c,
      z
        .object({
          texto: z.string().trim().min(1).max(4000),
          modo: z.enum(["pergunte", "jurisprudencia"]).default("pergunte"),
          conversaId: z.string().uuid().nullable().optional(),
          /** Processo de onde a pessoa abriu o Perguntar (só vale ao começar a conversa). */
          processoId: z.string().uuid().nullable().optional(),
          /** "Tentar de novo" depois de a resposta cair: a última pergunta da conversa, já gravada. Não grava outra. */
          refazer: z.string().uuid().optional(),
        })
        .refine((x) => !x.refazer || !!x.conversaId, { message: "Só dá para refazer a pergunta de uma conversa.", path: ["refazer"] }),
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
      let pergunta: { id: string; texto: string };
      if (b.refazer) {
        const [q] = await tx
          .select({ id: mensagensIa.id, texto: mensagensIa.texto })
          .from(mensagensIa)
          .where(and(eq(mensagensIa.id, b.refazer), eq(mensagensIa.conversaId, k.id), eq(mensagensIa.papel, "pessoa")));
        if (!q) falha(404, "nao_encontrado");
        const [outra] = await tx.select({ id: mensagensIa.id }).from(mensagensIa).where(and(eq(mensagensIa.conversaId, k.id), eq(mensagensIa.papel, "pessoa"), depoisDa(q.id))).limit(1);
        if (outra) falha(409, "pergunta_antiga", "Só dá para refazer a última pergunta da conversa.");
        // A resposta que caiu no meio sai: a nova fica no lugar dela.
        await tx.delete(mensagensIa).where(and(eq(mensagensIa.conversaId, k.id), eq(mensagensIa.papel, "ia"), depoisDa(q.id)));
        pergunta = q;
      } else {
        const [q] = await tx.insert(mensagensIa).values({ organizationId: orgId, conversaId: k.id, userId, papel: "pessoa", texto: b.texto }).returning({ id: mensagensIa.id });
        pergunta = { id: q!.id, texto: b.texto };
      }
      const [foco] = k.processoId ? await tx.select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj }).from(processos).where(eq(processos.id, k.processoId)) : [];
      const [eu] = await tx.select({ cargo: equipe.cargo }).from(equipe).where(eq(equipe.userId, userId));
      const tribunal = await tribunalPadrao(tx, orgId);
      const anteriores = await historicoDaConversa(tx, k.id, pergunta.id);
      return {
        conversa: k,
        pergunta,
        // O nome vem da primeira pergunta, enquanto a conversa tiver o provisório (a pessoa pode ter renomeado).
        darNome: !anteriores.some((m) => m.papel === "pessoa") && k.titulo === tituloProvisorio(pergunta.texto),
        cargo: eu?.cargo ?? null,
        tribunal,
        calendario: await calendarioDoEscritorio(tx, tribunal),
        foco: foco ? `${foco.titulo}${foco.cnj ? ` (${foco.cnj})` : ""}, id ${foco.id}` : null,
        historico: [...anteriores.map((m) => ({ papel: m.papel, texto: m.texto, partes: m.partes })), { papel: "pessoa" as const, texto: pergunta.texto }],
      };
    });

    const { conversa, pergunta } = preparado;
    const respostaId = randomUUID();
    esperarResposta(pergunta.id, respostaId);
    const r = conversarComAssistente(
      ia,
      {
        modo: b.modo,
        quem: {
          nome: c.get("userNome"),
          cargo: preparado.cargo,
          escritorio: c.get("orgNome"),
          hoje: hojeEm(c.get("timezone")),
          timezone: c.get("timezone"),
          tribunal: preparado.tribunal,
          calendario: preparado.calendario,
          foco: preparado.foco,
        },
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
        enviar({ t: "inicio", conversa: { id: conversa.id, titulo: conversa.titulo, modo: b.modo }, pergunta: { id: pergunta.id }, resposta: { id: respostaId } });
        // Para sozinho quando a ligação fecha, mesmo se algo abaixo der errado antes do fim.
        const pulso: ReturnType<typeof setInterval> = setInterval(() => (aberto ? enviar({ t: "ping" }) : clearInterval(pulso)), PULSO_MS);
        const partes: ParteDaMensagem[] = [];
        const textoDe = () => partes.flatMap((p) => (p.tipo === "texto" ? [p.texto.trim()] : [])).filter(Boolean).join("\n\n");
        /** Só o que a IA escreveu, sem os avisos. */
        let escrito = "";
        let consultas = 0;
        let rodadas = 0;
        let parou = false;
        let teto = false;
        let aviso: string | null = null;
        let nome: Promise<string | null> | null = null;
        const pedirNome = () => {
          if (preparado.darNome && !nome) nome = tituloDaConversa(ia, pergunta.texto, escrito, AbortSignal.timeout(10_000)).catch(() => null);
        };
        try {
          for await (const p of r.fullStream) {
            if (p.type === "text-delta") {
              const ultima = partes.at(-1);
              if (ultima?.tipo === "texto") ultima.texto += p.text;
              else partes.push({ tipo: "texto", texto: p.text });
              enviar({ t: "texto", v: p.text });
              escrito += p.text;
              // Com o começo da resposta já dá para dar nome à conversa: fica pronto junto com a resposta.
              if (escrito.length >= 300) pedirNome();
            } else if (p.type === "tool-call") {
              consultas++;
              partes.push({ tipo: "ferramenta", id: p.toolCallId, nome: p.toolName, entrada: p.input, saida: null });
              enviar({ t: "ferramenta", id: p.toolCallId, nome: p.toolName, entrada: p.input });
            } else if (p.type === "tool-result") {
              const parte = partes.find((x) => x.tipo === "ferramenta" && x.id === p.toolCallId);
              const saida = resultadoParaGuardar(p.toolName, p.output);
              if (parte?.tipo === "ferramenta") parte.saida = saida;
              enviar({ t: "resultado", id: p.toolCallId, nome: p.toolName, saida });
            } else if (p.type === "tool-error") {
              const { erro, log } = erroDaFerramenta(p.error);
              if (log) deps.log("ferramenta da IA falhou", { ferramenta: p.toolName, ...log });
              const parte = partes.find((x) => x.tipo === "ferramenta" && x.id === p.toolCallId);
              if (parte?.tipo === "ferramenta") parte.erro = erro;
              enviar({ t: "resultado", id: p.toolCallId, nome: p.toolName, erro });
            } else if (p.type === "finish-step") {
              rodadas++;
            } else if (p.type === "abort") {
              // Parar não é erro na AI SDK: o stream termina com esta parte.
              parou = true;
            } else if (p.type === "error") {
              throw p.error;
            }
          }
        } catch (err) {
          if (!c.req.raw.signal.aborted) {
            deps.log("conversa com a IA caiu", { metodo: b.modo, error: err instanceof Error ? err.message : String(err) });
            teto = ehTetoDoGateway(err);
            aviso = teto ? AVISOS.gateway : escrito.trim() ? "[A resposta parou no meio. Pergunte de novo.]" : "Não consegui responder agora. Tente de novo em instantes.";
          }
        }
        if (parou || c.req.raw.signal.aborted) {
          parou = true;
          aviso = "[Você parou a resposta aqui.]";
        } else if (!aviso && !escrito.trim()) {
          aviso =
            rodadas >= PASSOS
              ? `[Parei depois de ${PASSOS} rodadas de consulta, antes de escrever a resposta. Peça para eu continuar.]`
              : consultas
                ? "[Consultei os dados, mas não cheguei a escrever a resposta. Pergunte de novo.]"
                : "Não consegui responder agora. Tente de novo em instantes.";
        }
        // Ferramenta sem resultado fica com erro: nem a tela nem a próxima pergunta a tomam por terminada.
        for (const x of partes) {
          if (x.tipo !== "ferramenta" || x.saida != null || x.erro) continue;
          x.erro = PAROU_ANTES;
          enviar({ t: "resultado", id: x.id, nome: x.nome, erro: PAROU_ANTES });
        }
        if (aviso) {
          partes.push({ tipo: "texto", texto: aviso });
          enviar({ t: "texto", v: `\n\n${aviso}` });
        }
        const texto = textoDe();
        // Um "Tentar de novo" desta pergunta começou depois desta resposta: fica só a mais nova.
        const vez = respostaDaPergunta.get(pergunta.id);
        const substituida = !!vez && vez.id !== respostaId;
        const gravada =
          !substituida &&
          (await withTenant(db, orgId, async (tx) => {
            // A antiga que terminou enquanto esta chegava sai também (enquanto esta for a última pergunta).
            if (b.refazer) {
              const [outra] = await tx.select({ id: mensagensIa.id }).from(mensagensIa).where(and(eq(mensagensIa.conversaId, conversa.id), eq(mensagensIa.papel, "pessoa"), depoisDa(pergunta.id))).limit(1);
              if (!outra) await tx.delete(mensagensIa).where(and(eq(mensagensIa.conversaId, conversa.id), eq(mensagensIa.papel, "ia"), depoisDa(pergunta.id)));
            }
            await tx.insert(mensagensIa).values({ id: respostaId, organizationId: orgId, conversaId: conversa.id, userId, papel: "ia", texto, partes });
            await tx.update(conversas).set({ updatedAt: sql`now()` }).where(eq(conversas.id, conversa.id));
            return true;
          }).catch((err) => {
            deps.log("resposta da IA não foi gravada", { error: err instanceof Error ? err.message : String(err) });
            return false;
          }));
        enviar({ t: "fim", mensagem: gravada ? { id: respostaId } : null });
        // Nome só para resposta de verdade: aviso de erro ou do teto não vira nome de conversa.
        if (escrito.trim() && !parou && !teto && !substituida) pedirNome();
        if (nome && !substituida) {
          const gravado = (nome as Promise<string | null>).then(async (v) => {
            if (v) await withTenant(db, orgId, (tx) => tx.update(conversas).set({ titulo: v }).where(eq(conversas.id, conversa.id))).catch(() => {});
            return v;
          });
          // O nome quase sempre já chegou; se demorar, fica gravado do mesmo jeito e a ligação não espera por ele.
          let relogio: ReturnType<typeof setTimeout> | undefined;
          const v = await Promise.race([gravado, new Promise<null>((ok) => (relogio = setTimeout(ok, ESPERA_PELO_NOME, null)))]);
          clearTimeout(relogio);
          if (v) enviar({ t: "titulo", v });
        }
        clearInterval(pulso);
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
