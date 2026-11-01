import { diaPorExtensoCurto, ehDia, formatarDia, formatarDiaCurto, hojeEm, somarDias, urgenciaDoPrazo } from "@decreta/core";
import { pecas, prazos, processos, publicacoes } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNull, lt, lte, sql, type SQL } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { naTela, ultimaAnalise } from "../servicos/analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { carregarContexto } from "../servicos/contexto.ts";
import { quandoDoPrazo } from "../servicos/hoje.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { conferir, contaDoPrazo, contagemNaTela, contarParaProcesso, historicoDasSugestoes } from "../servicos/prazos.ts";
import { corpo, falha, id, ip, pedirRascunho, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const QUANDO = ["hoje", "semana", "vencidos", "abertos", "cumpridos"] as const;
type Quando = (typeof QUANDO)[number];

const dia = z.string().refine(ehDia, "data inválida (AAAA-MM-DD)");
const responsavel = z.string().min(1).nullable();

const novoPrazo = z.object({
  processoId: z.string().uuid(),
  tipo: z.string().trim().min(2).max(200),
  fundamento: z.string().trim().max(200).nullable().optional(),
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

const ajuste = novoPrazo.omit({ processoId: true }).partial();

/** O que a coluna Situação mostra. */
export type SituacaoNaLista = "a_confirmar" | "confirmado" | "peca_em_revisao" | "cumprido" | "descartado";

export function rotasDosPrazos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

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
          processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj, orgao: processos.orgao, comarca: processos.comarca },
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

  /** Prévia da contagem enquanto a pessoa preenche ou ajusta. */
  app.post("/prazos/calcular", async (c) => {
    const b = await corpo(
      c,
      z.object({ processoId: z.string().uuid().nullable().optional(), publicadoEm: dia, intimadoNoSistemaEm: dia.nullable().optional(), dias: z.number().int().min(1).max(3650), contagem: z.enum(["uteis", "corridos"]) }),
    );
    const r = await tenant(c, deps, (tx) => contarParaProcesso(tx, c.get("orgId"), b.processoId ?? null, { publicacao: b.publicadoEm, intimacaoNoSistema: b.intimadoNoSistemaEm, dias: b.dias, contagem: b.contagem }));
    return c.json({ ...contagemNaTela(r), pelo: r.pelo, outra: r.outra && { inicio: r.outra.inicio, fim: r.outra.fim } });
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
      // A segunda conferência vale enquanto a sugestão da IA espera alguém confirmar.
      const conferencia =
        prazo.origem === "ia" && !prazo.confirmadoEm && prazo.situacao === "aberto" ? conferir({ tipo: prazo.tipo, dias: prazo.dias, contagem: prazo.contagem, rito, documento }, await historicoDasSugestoes(tx)) : null;
      const [pub] = prazo.publicacaoId ? await tx.select().from(publicacoes).where(eq(publicacoes.id, prazo.publicacaoId)) : [];
      const contexto = await carregarContexto(tx, processo.id);
      const briefing = naTela(await ultimaAnalise(tx, "prazo", prazo.id, "briefing-prazo"), contexto?.base);
      const sugestao = pub ? await ultimaAnalise(tx, "publicacao", pub.id, "sugerir-prazo") : null;
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
        conferencia,
        processo: { id: processo.id, titulo: processo.titulo, cnj: processo.cnj, orgao: processo.orgao, comarca: processo.comarca, tribunal: processo.tribunal, poloCliente: processo.poloCliente, semIa: contexto?.semIa ?? false },
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

  /** Ajustar: muda o que a pessoa mandou e reconta se mexeu em dias, contagem ou publicação. Ajustar também confirma. */
  app.put("/prazos/:id", async (c) => {
    const prazoId = id(c);
    const b = await corpo(c, ajuste);
    await tenant(c, deps, async (tx) => {
      const [p] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
      if (!p) falha(404, "nao_encontrado");
      const dias = b.dias ?? p.dias;
      const contagem = b.contagem ?? p.contagem;
      const publicadoEm = b.publicadoEm ?? p.publicadoEm;
      const intimadoNoSistemaEm = b.intimadoNoSistemaEm === undefined ? p.intimadoNoSistemaEm : b.intimadoNoSistemaEm;
      const r = await contarParaProcesso(tx, c.get("orgId"), p.processoId, { publicacao: publicadoEm, intimacaoNoSistema: intimadoNoSistemaEm, dias, contagem });
      // A data digitada à mão fica quando a conta não mudou e ninguém mandou outra: trocar o responsável não refaz o prazo.
      const contaIgual = dias === p.dias && contagem === p.contagem && publicadoEm === p.publicadoEm && intimadoNoSistemaEm === p.intimadoNoSistemaEm;
      const manterManual = b.fimManual === undefined && p.fimDigitado && contaIgual;
      await tx
        .update(prazos)
        .set({
          tipo: b.tipo ?? p.tipo,
          fundamento: b.fundamento === undefined ? p.fundamento : b.fundamento,
          dias,
          contagem,
          publicadoEm,
          intimadoNoSistemaEm,
          inicio: r.inicio,
          fim: manterManual ? p.fim : (b.fimManual ?? r.fim),
          fimDigitado: manterManual || !!b.fimManual,
          desconsiderados: manterManual ? p.desconsiderados : b.fimManual ? [] : r.desconsiderados,
          responsavelId: b.responsavelId === undefined ? p.responsavelId : b.responsavelId,
          observacoes: b.fimManual && !manterManual ? [b.observacoes ?? p.observacoes, `Data final digitada à mão (a conta dava ${formatarDia(r.fim)}).`].filter(Boolean).join(" ") : b.observacoes === undefined ? p.observacoes : b.observacoes,
          confirmadoPor: c.get("userId"),
          confirmadoEm: new Date(),
        })
        .where(eq(prazos.id, prazoId));
      if (p.publicacaoId) await tx.update(publicacoes).set({ situacao: "vinculada", tratadaPor: c.get("userId"), tratadaEm: new Date() }).where(eq(publicacoes.id, p.publicacaoId));
    });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "prazo.ajustado", detalhes: { prazoId, ...b }, ip: ip(c) }, deps.log);
    await pedirRascunho(c, deps, prazoId);
    return c.json({ ok: true });
  });

  const mudar = (caminho: string, acao: string, fazer: (p: typeof prazos.$inferSelect, c: C, motivo: string | null) => Partial<typeof prazos.$inferInsert>) =>
    app.post(`/prazos/:id/${caminho}`, async (c) => {
      const prazoId = id(c);
      const motivo = caminho === "descartar" ? ((await c.req.json().catch(() => ({}))) as { motivo?: string }).motivo?.slice(0, 500) || null : null;
      await tenant(c, deps, async (tx) => {
        const [p] = await tx.select().from(prazos).where(eq(prazos.id, prazoId));
        if (!p) falha(404, "nao_encontrado");
        await tx.update(prazos).set(fazer(p, c, motivo)).where(eq(prazos.id, prazoId));
        if (caminho === "confirmar" && p.publicacaoId) await tx.update(publicacoes).set({ situacao: "vinculada", tratadaPor: c.get("userId"), tratadaEm: new Date() }).where(eq(publicacoes.id, p.publicacaoId));
      });
      await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes: { prazoId, motivo }, ip: ip(c) }, deps.log);
      if (caminho === "confirmar") await pedirRascunho(c, deps, prazoId);
      return c.json({ ok: true });
    });

  mudar("confirmar", "prazo.confirmado", (_p, c) => ({ confirmadoPor: c.get("userId"), confirmadoEm: new Date() }));
  mudar("cumprir", "prazo.cumprido", (p, c) => ({ situacao: "cumprido", cumpridoPor: c.get("userId"), cumpridoEm: new Date(), confirmadoPor: p.confirmadoPor ?? c.get("userId"), confirmadoEm: p.confirmadoEm ?? new Date() }));
  mudar("reabrir", "prazo.reaberto", () => ({ situacao: "aberto", cumpridoPor: null, cumpridoEm: null, motivoDescarte: null }));
  mudar("descartar", "prazo.descartado", (_p, _c, motivo) => ({ situacao: "descartado", motivoDescarte: motivo }));

  /** Definir responsável de vários de uma vez (a barra de seleção da lista). */
  app.post("/prazos/responsavel", async (c) => {
    const b = await corpo(c, z.object({ ids: z.array(z.string().uuid()).min(1).max(500), responsavelId: responsavel }));
    const n = await tenant(c, deps, async (tx) => (await tx.update(prazos).set({ responsavelId: b.responsavelId }).where(inArray(prazos.id, b.ids)).returning({ id: prazos.id })).length);
    return c.json({ alterados: n });
  });
}

