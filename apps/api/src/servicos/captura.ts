/**
 * Captura automática: publicações do DJEN pelas OABs da equipe e andamentos
 * do DataJud pelos processos ativos. Cada rodada fica em `capturas`, com o
 * que achou e o erro, para a tela de Publicações dizer quando foi a última.
 */
import { dataDaPublicacao, limparCnj, nomeProprio, somarDias, tribunalDoCnj, type Dia } from "@decreta/core";
import { capturas, equipe, escritorios, movimentacoes, organization, processos, publicacoes, withTenant, type Database, type Tx } from "@decreta/db";
import { buscarNoDataJud, buscarNoDjen, type ComunicacaoDjen, type OpcoesDjen } from "@decreta/tribunais";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { calendarioDoEscritorio } from "./calendario.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDaCaptura {
  db: Database;
  djen?: OpcoesDjen;
  datajudKey: string;
  fetch?: typeof fetch;
  log?: Log;
}

/** O ato é do juízo, das partes ou do cartório, pelo nome (a TPU não diz). */
export function autorDoAto(titulo: string): "juizo" | "partes" | "cartorio" | null {
  const t = titulo.toLowerCase();
  if (/decis|despach|senten|julg|saneamento|homolog|concedid|indeferid|deferid|liminar|tutela|ac[óo]rd[ãa]o/.test(t)) return "juizo";
  if (/peti[çc]|contesta|r[ée]plica|recurso|apela|contrarraz|manifesta|quesito|embargos|impugna|memoriais|alega/.test(t)) return "partes";
  if (/intima|cita|expedi|juntada|conclus|remessa|certid|publica|distribu|audi[êe]ncia|laudo/.test(t)) return "cartorio";
  return null;
}

/** Grava as comunicações novas. Devolve os ids das que entraram agora. */
export async function gravarComunicacoes(tx: Tx, organizationId: string, oab: string | null, itens: ComunicacaoDjen[]): Promise<string[]> {
  if (!itens.length) return [];
  const cnjs = [...new Set(itens.map((i) => i.cnj).filter((c): c is string => !!c))];
  const doEscritorio = cnjs.length ? await tx.select({ id: processos.id, cnj: processos.cnj }).from(processos).where(inArray(processos.cnj, cnjs)) : [];
  const processoDoCnj = new Map(doEscritorio.map((p) => [p.cnj!, p.id]));
  const calendarios = new Map<string, Awaited<ReturnType<typeof calendarioDoEscritorio>>>();
  const novas: string[] = [];
  for (const i of itens) {
    const tribunal = i.tribunal ?? (i.cnj ? tribunalDoCnj(i.cnj) : null) ?? "TJSC";
    let cal = calendarios.get(tribunal);
    if (!cal) calendarios.set(tribunal, (cal = await calendarioDoEscritorio(tx, tribunal)));
    const linha = await tx
      .insert(publicacoes)
      .values({
        organizationId,
        fonte: "djen",
        idExterno: i.idExterno,
        disponibilizadaEm: i.disponibilizadaEm,
        publicadaEm: dataDaPublicacao(i.disponibilizadaEm, cal),
        tribunal,
        orgao: i.orgao,
        tipoComunicacao: i.tipoComunicacao,
        tipoDocumento: i.tipoDocumento,
        classe: i.classe,
        cnj: i.cnj,
        processoId: i.cnj ? (processoDoCnj.get(i.cnj) ?? null) : null,
        texto: i.texto,
        destinatarios: i.destinatarios,
        advogados: i.advogados.length ? i.advogados : oab ? [{ nome: "", oab }] : [],
        link: i.link,
      })
      .onConflictDoNothing()
      .returning({ id: publicacoes.id });
    if (linha[0]) novas.push(linha[0].id);
  }
  return novas;
}

/** A demonstração nunca consulta o DJEN nem o DataJud (ver demonstracao/slug.ts). */
export async function ehDemonstracao(db: Database, organizationId: string): Promise<boolean> {
  const [o] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId));
  return o?.slug === SLUG_DA_DEMONSTRACAO;
}

/** Busca no DJEN de `de` a `ate` por todas as OABs da equipe. */
export async function capturarDjen(deps: DepsDaCaptura, organizationId: string, periodo: { de: Dia; ate: Dia }): Promise<{ encontradas: number; novas: string[] }> {
  if (await ehDemonstracao(deps.db, organizationId)) return { encontradas: 0, novas: [] };
  const { oabs, ligado } = await withTenant(deps.db, organizationId, async (tx) => {
    const [e] = await tx.select({ ligado: escritorios.capturaDjen }).from(escritorios).where(eq(escritorios.organizationId, organizationId));
    const linhas = await tx.select({ numero: equipe.oabNumero, uf: equipe.oabUf }).from(equipe).where(isNotNull(equipe.oabNumero));
    return { ligado: e?.ligado ?? true, oabs: linhas.filter((l) => l.numero).map((l) => ({ numero: l.numero!, uf: l.uf ?? "SC" })) };
  });
  if (!ligado || !oabs.length) return { encontradas: 0, novas: [] };

  const [rodada] = await withTenant(deps.db, organizationId, (tx) => tx.insert(capturas).values({ organizationId, fonte: "djen" }).returning({ id: capturas.id }));
  let encontradas = 0;
  const novas: string[] = [];
  const erros: string[] = [];
  for (const oab of oabs) {
    try {
      const itens = await buscarNoDjen({ oab: oab.numero, uf: oab.uf, de: periodo.de, ate: periodo.ate }, { fetch: deps.fetch, ...deps.djen });
      encontradas += itens.length;
      novas.push(...(await withTenant(deps.db, organizationId, (tx) => gravarComunicacoes(tx, organizationId, `${oab.numero}/${oab.uf}`, itens))));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`OAB ${oab.numero}/${oab.uf}: ${msg}`);
      deps.log?.("captura do DJEN falhou", { organizationId, oab: `${oab.numero}/${oab.uf}`, error: msg });
    }
  }
  await withTenant(deps.db, organizationId, (tx) =>
    tx
      .update(capturas)
      .set({ terminadaEm: new Date(), encontradas, novas: novas.length, erro: erros.length ? erros.join("; ").slice(0, 1000) : null })
      .where(eq(capturas.id, rodada!.id)),
  );
  if (erros.length === oabs.length) throw new Error(`DJEN: ${erros.join("; ")}`);
  return { encontradas, novas };
}

/** Período da busca do dia: os últimos 3 dias cobrem fim de semana e uma rodada perdida (repetida não entra duas vezes). */
export function periodoDaCaptura(hoje: Dia): { de: Dia; ate: Dia } {
  return { de: somarDias(hoje, -3), ate: hoje };
}

/** Andamentos do DataJud de um processo. Devolve quantos entraram. */
export async function atualizarDoDataJud(deps: DepsDaCaptura, organizationId: string, processoId: string): Promise<number> {
  if (await ehDemonstracao(deps.db, organizationId)) return 0;
  const p = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(processos).where(eq(processos.id, processoId)))[0]);
  if (!p?.cnj || limparCnj(p.cnj).length !== 20) return 0;
  const dados = await buscarNoDataJud(p.cnj, { apiKey: deps.datajudKey, fetch: deps.fetch });
  if (!dados) {
    await withTenant(deps.db, organizationId, (tx) => tx.update(processos).set({ datajudEm: new Date() }).where(eq(processos.id, processoId)));
    return 0;
  }
  return withTenant(deps.db, organizationId, async (tx) => {
    let novas = 0;
    for (const m of dados.movimentos) {
      const r = await tx
        .insert(movimentacoes)
        .values({ organizationId, processoId, em: new Date(m.em), titulo: m.titulo, descricao: m.descricao, codigo: m.codigo, autor: autorDoAto(m.titulo), fonte: "datajud", chave: m.chave })
        .onConflictDoNothing()
        .returning({ id: movimentacoes.id });
      novas += r.length;
    }
    const ultima = dados.movimentos.at(-1)?.em;
    await tx
      .update(processos)
      .set({
        datajudEm: new Date(),
        classe: p.classe ?? dados.classe,
        assunto: p.assunto ?? dados.assunto,
        orgao: p.orgao ?? (dados.orgao ? nomeProprio(dados.orgao) : null),
        distribuidoEm: p.distribuidoEm ?? dados.distribuidoEm,
        tribunal: p.tribunal ?? tribunalDoCnj(p.cnj!),
        segredo: p.segredo || dados.sigilo,
        ultimaMovimentacaoEm: ultima && (!p.ultimaMovimentacaoEm || new Date(ultima) > p.ultimaMovimentacaoEm) ? new Date(ultima) : p.ultimaMovimentacaoEm,
      })
      .where(eq(processos.id, processoId));
    return novas;
  });
}

/** Processos ativos com CNJ que não passam pelo DataJud há mais de `horas`. */
export async function processosParaAtualizar(db: Database, organizationId: string, horas = 20, limite = 300): Promise<string[]> {
  return withTenant(db, organizationId, async (tx) => {
    const linhas = await tx
      .select({ id: processos.id })
      .from(processos)
      .where(
        and(
          eq(processos.situacao, "ativo"),
          eq(processos.tipo, "judicial"),
          isNotNull(processos.cnj),
          sql`(${processos.datajudEm} is null or ${processos.datajudEm} < now() - make_interval(hours => ${horas}))`,
        ),
      )
      .orderBy(sql`${processos.datajudEm} asc nulls first`)
      .limit(limite);
    return linhas.map((l) => l.id);
  });
}

