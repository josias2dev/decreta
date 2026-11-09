import { avisoDoDiaSemExpediente, diaPorExtensoCurto, ehDia, formatarDia, formatarDiaCurto, hojeEm, prazoInterno, somarDias, urgenciaDoPrazo } from "@decreta/core";
import { pecas, prazos, processos, publicacoes } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { artigoAchadoNoAcervo } from "../servicos/acervo.ts";
import { naTela, ultimaAnalise } from "../servicos/analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { quandoDoPrazo } from "../servicos/hoje.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { antecedenciaDoInterno, baseLegalVeioDaIa, conferenciaDoPrazo, contaDoPrazo, contagemNaTela, contaParaAbrir, contarParaProcesso } from "../servicos/prazos.ts";
import { ajustarPrazo, depoisDaDecisao, mudarPrazo, type AcaoNoPrazo } from "../servicos/decisoes-do-prazo.ts";
import { atorDaRota, corpo, depsDaDecisao, falha, id, ip, naRota, pedirRascunho, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const QUANDO = ["hoje", "semana", "vencidos", "abertos", "cumpridos"] as const;
type Quando = (typeof QUANDO)[number];

const dia = z.string().refine(ehDia, "data inválida (AAAA-MM-DD)");
const responsavel = z.string().min(1).nullable();

const novoPrazo = z.object({
  processoId: z.string().uuid(),
  tipo: z.string().trim().min(2).max(200),
  fundamento: z.string().trim().max(200).nullable().optional(),
  /** O artigo no campo é o que a IA sugeriu. */
  fundamentoDaIa: z.boolean().optional(),
  dias: z.number().int().min(1).max(3650),
  contagem: z.enum(["uteis", "corridos"]),
  publicadoEm: dia,
  /** Dupla intimação: o dia em que o sistema do tribunal intimou também. */
  intimadoNoSistemaEm: dia.nullable().optional(),
  responsavelId: responsavel.optional(),
  /** A pessoa sabe a data final (suspensão que o sistema não conhece): vale a dela. */
  fimManual: dia.nullable().optional(),
  observacoes: z.string().max(2000).nullable().optional(),
});

/** `confirmar`: a pessoa clicou em Salvar e confirmar. Sem isso, mudar só a base legal não mexe no resto do prazo. */
const ajuste = novoPrazo.omit({ processoId: true }).partial().extend({ confirmar: z.boolean().optional() });

/** O que a coluna Situação mostra. */
export type SituacaoNaLista = "a_confirmar" | "confirmado" | "peca_em_revisao" | "cumprido" | "descartado";

export function rotasDosPrazos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const doAcervo = { db, fetch: deps.captura.fetch, log: deps.log };

  async function lista(c: C, filtros: { quando: Quando; responsavel?: string; processo?: string }) {
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const cal = await calendarioDoEscritorio(tx, await tribunalPadrao(tx, c.get("orgId")));
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const semana = somarDias(hoje, 7);
      const onde: SQL[] = [];
      if (filtros.quando === "cumpridos") onde.push(eq(prazos.situacao, "cumprido"));
      else {
        onde.push(eq(prazos.situacao, "aberto"));
        if (filtros.quando === "hoje") onde.push(lte(prazos.fim, hoje));
        if (filtros.quando === "semana") onde.push(lte(prazos.fim, semana));
        if (filtros.quando === "vencidos") onde.push(lt(prazos.fim, hoje));
      }
      if (filtros.processo) onde.push(eq(prazos.processoId, filtros.processo));
      const porResponsavel = filtros.responsavel === "sem" ? isNull(prazos.responsavelId) : filtros.responsavel ? eq(prazos.responsavelId, filtros.responsavel) : undefined;

      const linhas = await tx
        .select({
          prazo: prazos,
          processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj, tipo: processos.tipo, orgao: processos.orgao, comarca: processos.comarca },
          disponibilizadaEm: publicacoes.disponibilizadaEm,
        })
        .from(prazos)
        .innerJoin(processos, eq(processos.id, prazos.processoId))
        .leftJoin(publicacoes, eq(publicacoes.id, prazos.publicacaoId))
        .where(and(...onde, porResponsavel))
        .orderBy(filtros.quando === "cumpridos" ? desc(prazos.cumpridoEm) : asc(prazos.fim), asc(prazos.createdAt))
        .limit(500);

      const comPeca = linhas.length
        ? new Set(
            (
              await tx
                .select({ prazoId: pecas.prazoId })
                .from(pecas)
                .where(and(eq(pecas.situacao, "rascunho"), inArray(pecas.prazoId, linhas.map((l) => l.prazo.id))))
            ).map((p) => p.prazoId),
          )
        : new Set<string | null>();

      // A marca da base legal só aparece na lista do processo: a lista geral não paga a conferência.
      const daIa = filtros.processo ? [...new Set(linhas.flatMap((l) => (l.prazo.fundamentoDaIa && l.prazo.fundamento ? [l.prazo.fundamento] : [])))] : [];
      const achados = new Map(await Promise.all(daIa.map(async (f) => [f, await artigoAchadoNoAcervo(doAcervo, c.get("orgId"), f)] as const)));

      // Contagens dos chips: sempre sobre os abertos (e os cumpridos à parte), com o filtro de responsável.
      const n = sql<number>`count(*)::int`;
      const [chips] = await tx
        .select({
          hoje: sql<number>`count(*) filter (where ${prazos.situacao} = 'aberto' and ${prazos.fim} <= ${hoje})::int`,
          semana: sql<number>`count(*) filter (where ${prazos.situacao} = 'aberto' and ${prazos.fim} <= ${semana})::int`,
          vencidos: sql<number>`count(*) filter (where ${prazos.situacao} = 'aberto' and ${prazos.fim} < ${hoje})::int`,
          abertos: sql<number>`count(*) filter (where ${prazos.situacao} = 'aberto')::int`,
          cumpridos: sql<number>`count(*) filter (where ${prazos.situacao} = 'cumprido')::int`,
        })
        .from(prazos)
        .where(filtros.processo ? and(eq(prazos.processoId, filtros.processo), porResponsavel) : porResponsavel);
      const porPessoa = await tx
        .select({ responsavelId: prazos.responsavelId, n })
        .from(prazos)
        .where(and(eq(prazos.situacao, "aberto"), filtros.processo ? eq(prazos.processoId, filtros.processo) : undefined))
        .groupBy(prazos.responsavelId);

      return {
        hoje,
        chips: chips ?? { hoje: 0, semana: 0, vencidos: 0, abertos: 0, cumpridos: 0 },
        responsaveis: [
          ...[...pessoas.values()].map((p) => ({ pessoa: resumir(pessoas, p.id), n: porPessoa.find((x) => x.responsavelId === p.id)?.n ?? 0 })).sort((a, b) => b.n - a.n),
          { pessoa: null, n: porPessoa.find((x) => x.responsavelId === null)?.n ?? 0 },
        ],
        itens: linhas.map(({ prazo, processo, disponibilizadaEm }) => {
          const urgencia = urgenciaDoPrazo(prazo, hoje, cal);
          const situacao: SituacaoNaLista =
            prazo.situacao === "cumprido" ? "cumprido" : prazo.situacao === "descartado" ? "descartado" : !prazo.confirmadoEm ? "a_confirmar" : comPeca.has(prazo.id) ? "peca_em_revisao" : "confirmado";
          return {
            id: prazo.id,
            tipo: prazo.tipo,
            dias: prazo.dias,
            contagem: prazo.contagem,
            fundamento: prazo.fundamento,
            fundamentoDaIa: prazo.fundamentoDaIa,
            fundamentoAchado: !!prazo.fundamento && !!achados.get(prazo.fundamento),
            fim: prazo.fim,
            urgencia,
            quando: prazo.situacao === "cumprido" ? diaPorExtensoCurto(prazo.fim, hoje) : quandoDoPrazo(urgencia, prazo.fim, hoje),
            processo,
            responsavel: resumir(pessoas, prazo.responsavelId),
            situacao,
            confirmadoHoje: !!prazo.confirmadoEm && hojeEm(c.get("timezone"), prazo.confirmadoEm) === hoje,
            cumpridoEm: prazo.cumpridoEm?.toISOString() ?? null,
            origem: disponibilizadaEm ? `DJEN · ${formatarDiaCurto(disponibilizadaEm)}` : `Manual · ${formatarDiaCurto(hojeEm(c.get("timezone"), prazo.createdAt))}`,
          };
        }),
      };
    });
  }

  app.get("/prazos", async (c) => {
    const quando = (QUANDO as readonly string[]).includes(c.req.query("quando") ?? "") ? (c.req.query("quando") as Quando) : "abertos";
    return c.json(await lista(c, { quando, responsavel: c.req.query("responsavel") || undefined, processo: c.req.query("processo") || undefined }));
  });

  /** Planilha dos prazos (o botão Exportar), separada por ponto e vírgula para abrir certo no Excel em português. */
  app.get("/prazos/exportar", async (c) => {
    const quando = (QUANDO as readonly string[]).includes(c.req.query("quando") ?? "") ? (c.req.query("quando") as Quando) : "abertos";
    const r = await lista(c, { quando, responsavel: c.req.query("responsavel") || undefined });
    const cel = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const linhas = [
      ["Vence", "Prazo", "Dias", "Processo", "Número", "Juízo", "Responsável", "Situação", "Origem"].map(cel).join(";"),
      ...r.itens.map((i) =>
        [formatarDia(i.fim), i.tipo, `${i.dias} ${i.contagem === "uteis" ? "úteis" : "corridos"}`, i.processo.titulo, i.processo.cnj, i.processo.orgao, i.responsavel?.nome ?? "Sem responsável", i.situacao, i.origem]
          .map(cel)
          .join(";"),
      ),
    ];
    return new Response(`﻿${linhas.join("\r\n")}`, {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="prazos-${r.hoje}.csv"` },
    });
  });

  /**
   * Prévia da contagem enquanto a pessoa preenche ou ajusta. Diz se o tribunal
   * tem calendário próprio e, com a data final digitada (`diaDigitado`), avisa
   * se ela cai em dia sem expediente no calendário do processo.
   */
  app.post("/prazos/calcular", async (c) => {
    const b = await corpo(
      c,
      z.object({
        processoId: z.string().uuid().nullable().optional(),
        publicadoEm: dia,
        intimadoNoSistemaEm: dia.nullable().optional(),
        dias: z.number().int().min(1).max(3650),
        contagem: z.enum(["uteis", "corridos"]),
        diaDigitado: dia.nullable().optional(),
      }),
    );
    const r = await tenant(c, deps, (tx) => contarParaProcesso(tx, c.get("orgId"), b.processoId ?? null, { publicacao: b.publicadoEm, intimacaoNoSistema: b.intimadoNoSistemaEm, dias: b.dias, contagem: b.contagem }));
    return c.json({
      ...contagemNaTela(r),
      pelo: r.pelo,
      outra: r.outra && { inicio: r.outra.inicio, fim: r.outra.fim },
      calendarioCompleto: r.regras.cal.proprio,
      diaDigitado: b.diaDigitado ? avisoDoDiaSemExpediente(b.diaDigitado, r.regras.cal) : null,
    });
  });

  /** A conta atrás da data: o que a data viva abre em qualquer tela. */
  app.get("/prazos/:id/conta", async (c) => {
    const prazoId = id(c);
    return tenant(c, deps, async (tx) => {
      const [linha] = await tx.select({ prazo: prazos, processo: { id: processos.id, titulo: processos.titulo } }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).where(eq(prazos.id, prazoId));
      if (!linha) falha(404, "nao_encontrado");
      return c.json(await contaParaAbrir(tx, c.get("orgId"), linha.prazo, linha.processo, hojeEm(c.get("timezone"))));
    });
  });

  app.get("/prazos/:id", async (c) => {
    const prazoId = id(c);
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const [linha] = await tx.select({ prazo: prazos, processo: processos }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).where(eq(prazos.id, prazoId));
      if (!linha) falha(404, "nao_encontrado");
      const { prazo, processo } = linha;
      const cal = await calendarioDoEscritorio(tx, processo.tribunal ?? (await tribunalPadrao(tx, c.get("orgId"))), processo.comarca);
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const { rito, documento, ...conta } = await contaDoPrazo(tx, c.get("orgId"), prazo);
      const [pub] = prazo.publicacaoId ? await tx.select().from(publicacoes).where(eq(publicacoes.id, prazo.publicacaoId)) : [];
      const sugestao = pub ? await ultimaAnalise(tx, "publicacao", pub.id, "sugerir-prazo") : null;
      const conferencia = await conferenciaDoPrazo(tx, prazo, rito, documento);
      const contexto = await carregarContexto(tx, processo.id);
      const briefing = naTela(await ultimaAnalise(tx, "prazo", prazo.id, "briefing-prazo"), contexto?.base);
      const pecaContraria = naTela(await ultimaAnalise(tx, "prazo", prazo.id, "ler-peca-contraria"), contexto?.base);
      const pecasDoPrazo = await tx
        .select({ id: pecas.id, titulo: pecas.titulo, situacao: pecas.situacao, atualizadaEm: pecas.updatedAt, criadaPor: pecas.criadaPor, textoGerado: pecas.textoGerado })
        .from(pecas)
        .where(eq(pecas.prazoId, prazo.id))
        .orderBy(desc(pecas.updatedAt));

      const historico: { em: string; titulo: string; detalhe: string | null }[] = [];
      if (pub) historico.push({ em: pub.createdAt.toISOString(), titulo: "Publicação capturada", detalhe: pub.fonte === "djen" ? `DJEN${pub.advogados[0]?.oab ? `, pela OAB${pub.advogados[0].uf ? `/${pub.advogados[0].uf}` : ""} ${pub.advogados[0].oab}` : ""}` : null });
      if (sugestao) historico.push({ em: sugestao.createdAt.toISOString(), titulo: "IA sugeriu o prazo", detalhe: "Lido do teor da intimação" });
      if (!pub) historico.push({ em: prazo.createdAt.toISOString(), titulo: "Prazo criado à mão", detalhe: null });
      if (prazo.confirmadoEm) historico.push({ em: prazo.confirmadoEm.toISOString(), titulo: `${resumir(pessoas, prazo.confirmadoPor)?.apelido ?? "Alguém"} confirmou o prazo`, detalhe: prazo.observacoes });
      if (prazo.cumpridoEm) historico.push({ em: prazo.cumpridoEm.toISOString(), titulo: `${resumir(pessoas, prazo.cumpridoPor)?.apelido ?? "Alguém"} marcou como cumprido`, detalhe: null });
      if (prazo.situacao === "descartado") historico.push({ em: prazo.updatedAt.toISOString(), titulo: "Prazo descartado", detalhe: prazo.motivoDescarte });
      historico.sort((a, b) => b.em.localeCompare(a.em));

      return c.json({
        id: prazo.id,
        tipo: prazo.tipo,
        fundamento: prazo.fundamento,
        fundamentoDaIa: prazo.fundamentoDaIa,
        fundamentoAchado: prazo.fundamentoDaIa && !!prazo.fundamento && (await artigoAchadoNoAcervo(doAcervo, c.get("orgId"), prazo.fundamento)),
        dias: prazo.dias,
        contagem: prazo.contagem,
        publicadoEm: prazo.publicadoEm,
        inicio: prazo.inicio,
        fim: prazo.fim,
        desconsiderados: prazo.desconsiderados,
        situacao: prazo.situacao,
        urgencia: urgenciaDoPrazo(prazo, hoje, cal),
        origem: prazo.origem,
        confirmado: !!prazo.confirmadoEm,
        confirmadoPor: resumir(pessoas, prazo.confirmadoPor),
        responsavel: resumir(pessoas, prazo.responsavelId),
        observacoes: prazo.observacoes,
        motivoDescarte: prazo.motivoDescarte,
        conta: { ...conta, confirmadoPor: resumir(pessoas, prazo.confirmadoPor), confirmadoEm: prazo.confirmadoEm?.toISOString() ?? null },
        interno: prazo.situacao === "aberto" ? prazoInterno({ fatal: prazo.fim, antecedencia: await antecedenciaDoInterno(tx, c.get("orgId")), hoje, calendario: cal }) : null,
        conferencia,
        processo: { id: processo.id, titulo: processo.titulo, cnj: processo.cnj, tipo: processo.tipo, orgao: processo.orgao, comarca: processo.comarca, tribunal: processo.tribunal, poloCliente: processo.poloCliente, semIa: contexto?.semIa ?? false },
        publicacao: pub ? { id: pub.id, fonte: pub.fonte, texto: pub.texto, disponibilizadaEm: pub.disponibilizadaEm, publicadaEm: pub.publicadaEm, tipoComunicacao: pub.tipoComunicacao, tipoDocumento: pub.tipoDocumento, link: pub.link, certidao: !!(pub.certidao || pub.hash), cancelada: pub.canceladaEm ? { em: pub.canceladaEm.toISOString(), motivo: pub.motivoCancelamento } : null } : null,
        briefing,
        /** A peça da outra parte lida em pontos a rebater. */
        pecaContraria,
        // Sem autor e com texto da IA: o rascunho que ficou pronto sozinho quando o prazo foi confirmado.
        pecas: pecasDoPrazo.map(({ criadaPor, textoGerado, ...p }) => ({ ...p, atualizadaEm: p.atualizadaEm.toISOString(), preparadaPelaIa: criadaPor === null && textoGerado !== null })),
        historico,
      });
    });
  });

  app.post("/prazos", async (c) => {
    const b = await corpo(c, novoPrazo);
    const novo = await tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ id: processos.id, responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, b.processoId));
      if (!p) falha(404, "processo_nao_encontrado");
      const r = await contarParaProcesso(tx, c.get("orgId"), b.processoId, { publicacao: b.publicadoEm, intimacaoNoSistema: b.intimadoNoSistemaEm, dias: b.dias, contagem: b.contagem });
      const [linha] = await tx
        .insert(prazos)
        .values({
          organizationId: c.get("orgId"),
          processoId: b.processoId,
          tipo: b.tipo,
          fundamento: b.fundamento ?? null,
          fundamentoDaIa: baseLegalVeioDaIa(b.fundamento ?? null, b.fundamentoDaIa),
          dias: b.dias,
          contagem: b.contagem,
          publicadoEm: b.publicadoEm,
          intimadoNoSistemaEm: b.intimadoNoSistemaEm ?? null,
          inicio: r.inicio,
          fim: b.fimManual ?? r.fim,
          fimDigitado: !!b.fimManual,
          desconsiderados: b.fimManual ? [] : r.desconsiderados,
          responsavelId: b.responsavelId === undefined ? p.responsavelId : b.responsavelId,
          origem: "manual",
          confirmadoPor: c.get("userId"),
          confirmadoEm: new Date(),
          observacoes: b.fimManual ? [b.observacoes, `Data final digitada à mão (a conta dava ${formatarDia(r.fim)}).`].filter(Boolean).join(" ") : (b.observacoes ?? null),
        })
        .returning({ id: prazos.id });
      return linha!;
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "prazo.criado", detalhes: { prazoId: novo.id, tipo: b.tipo }, ip: ip(c) }, deps.log);
    return c.json(novo, 201);
  });

  /**
   * Ajustar: muda o que a pessoa mandou e reconta se mexeu em dias, contagem ou publicação. Ajustar também confirma.
   * Só a base legal é outra coisa: preencher o artigo não confirma o prazo nem muda a data, e quem confirmou continua sendo quem confirmou.
   */
  app.put("/prazos/:id", async (c) => {
    const prazoId = id(c);
    const b = await corpo(c, ajuste);
    const ator = atorDaRota(c);
    const { soABase } = await naRota(tenant(c, deps, (tx) => ajustarPrazo(tx, ator, prazoId, b)));
    await depoisDaDecisao(depsDaDecisao(deps), ator, soABase ? "prazo.base_legal" : "prazo.ajustado", { prazoId, ...b });
    // O ajuste confirma, mas o marco do funil é só o "Confirmar" (como antes): aqui vai só o rascunho.
    if (!soABase) await pedirRascunho(c, deps, prazoId);
    return c.json({ ok: true });
  });

  const mudar = (caminho: AcaoNoPrazo, acao: string) =>
    app.post(`/prazos/:id/${caminho}`, async (c) => {
      const prazoId = id(c);
      const motivo = caminho === "descartar" ? ((await c.req.json().catch(() => ({}))) as { motivo?: string }).motivo?.slice(0, 500) || null : null;
      const ator = atorDaRota(c);
      await naRota(tenant(c, deps, (tx) => mudarPrazo(tx, ator, prazoId, caminho, { motivo })));
      await depoisDaDecisao(depsDaDecisao(deps), ator, acao, { prazoId, motivo }, caminho === "confirmar" ? { confirmou: prazoId } : {});
      return c.json({ ok: true });
    });

  mudar("confirmar", "prazo.confirmado");
  mudar("cumprir", "prazo.cumprido");
  mudar("reabrir", "prazo.reaberto");
  mudar("descartar", "prazo.descartado");

  /** Definir responsável de vários de uma vez (a barra de seleção da lista). */
  app.post("/prazos/responsavel", async (c) => {
    const b = await corpo(c, z.object({ ids: z.array(z.string().uuid()).min(1).max(500), responsavelId: responsavel }));
    const n = await tenant(c, deps, async (tx) => (await tx.update(prazos).set({ responsavelId: b.responsavelId }).where(inArray(prazos.id, b.ids)).returning({ id: prazos.id })).length);
    return c.json({ alterados: n });
  });
}

