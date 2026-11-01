/**
 * Jurisprudência verificada: o acervo (temas do STJ, BNP e normas.leg.br) e a
 * conferência das citações de uma peça. Cada citação ganha um selo:
 *   verificada      existe na fonte oficial e está em vigor;
 *   com_ressalva    existe, mas cancelada, revogada, sem tese ou sem o texto do artigo;
 *   nao_verificada  fora do acervo ("confira antes de usar"), nunca "inexistente".
 *
 * Os temas do STJ chegam pela carga semanal; o BNP e as leis, sob demanda, e
 * ficam guardados. A demonstração nunca vai às fontes: confere só no acervo.
 */
import { createHash } from "node:crypto";
import { extrairCitacoes, formatarDia, type Citacao } from "@decreta/core";
import { acervoDocumentos, acervoNormas, type Database, type DispositivoNoAcervo, type SeloDaCitacao, type VerificacaoDaPeca } from "@decreta/db";
import { acharDispositivo, baixarNorma, baixarTemasDoStj, buscarNoBnp, urnDaNorma, type NormaDoNormasLeg, type PrecedenteDoBnp } from "@decreta/tribunais";
import { eq, sql } from "drizzle-orm";
import { ehDemonstracao } from "./captura.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDoAcervo {
  db: Database;
  fetch?: typeof fetch;
  log?: Log;
}

export type CitacaoVerificada = VerificacaoDaPeca["citacoes"][number];

const FONTES = { stj_dados_abertos: "STJ, Portal de Dados Abertos", cnj_bnp: "CNJ, Banco Nacional de Precedentes", normas_leg: "normas.leg.br (Congresso Nacional)" } as const;

/** A lei guardada vale por 30 dias; depois, a próxima conferência baixa de novo. */
const VALIDADE_DA_NORMA_MS = 30 * 24 * 60 * 60 * 1000;
/** O BNP é atualizado duas vezes por mês: o precedente guardado volta à fonte depois de 15 dias. */
const VALIDADE_DO_BNP_MS = 15 * 24 * 60 * 60 * 1000;

const CONFIRA = "Confira na fonte antes de usar.";

const hash = (...partes: (string | null)[]) => createHash("sha256").update(partes.map((p) => p ?? "").join("\n")).digest("hex");

/** Carga semanal: todos os temas repetitivos do STJ. Falhou, o acervo fica com a última versão. */
export async function sincronizarTemasDoStj(deps: DepsDoAcervo): Promise<{ temas: number }> {
  const { temas, atualizadoEm } = await baixarTemasDoStj({ fetch: deps.fetch });
  const linhas = temas.map((t) => ({
    chave: `tema:STJ:${t.numero}`,
    fonte: "stj_dados_abertos",
    situacao: t.situacao,
    cancelado: /^cancelad/i.test(t.situacao),
    texto: t.tese ?? t.questao,
    url: t.url,
    hash: hash(t.situacao, t.tese ?? t.questao),
    atualizadoNaFonte: atualizadoEm,
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    await deps.db
      .insert(acervoDocumentos)
      .values(linhas.slice(i, i + 500))
      .onConflictDoUpdate({
        target: acervoDocumentos.chave,
        set: { situacao: sql`excluded.situacao`, cancelado: sql`excluded.cancelado`, texto: sql`excluded.texto`, url: sql`excluded.url`, hash: sql`excluded.hash`, atualizadoNaFonte: sql`excluded.atualizado_na_fonte`, capturadoEm: sql`now()` },
      });
  }
  return { temas: linhas.length };
}

async function guardarPrecedente(db: Database, chave: string, p: PrecedenteDoBnp) {
  const valores = { chave, fonte: "cnj_bnp", situacao: p.situacao, cancelado: p.cancelado, texto: p.texto, url: p.url, hash: hash(p.situacao, p.texto), atualizadoNaFonte: p.atualizadoEm };
  await db
    .insert(acervoDocumentos)
    .values(valores)
    .onConflictDoUpdate({ target: acervoDocumentos.chave, set: { ...valores, capturadoEm: new Date() } });
}

async function guardarNorma(db: Database, sigla: string, n: NormaDoNormasLeg) {
  const dispositivos: Record<string, DispositivoNoAcervo> = {};
  for (const [id, d] of n.dispositivos) dispositivos[id] = { texto: d.texto, revogado: d.revogado, desde: d.desde, url: d.url };
  const valores = { sigla, urn: n.urn, nome: n.nome, apelido: n.apelido, url: n.url, porDispositivo: n.porDispositivo, dispositivos, atualizadoNaFonte: n.atualizadoEm };
  await db
    .insert(acervoNormas)
    .values(valores)
    .onConflictDoUpdate({ target: acervoNormas.sigla, set: { ...valores, capturadoEm: new Date() } });
}

/** A espécie e o órgão no BNP para a citação; `null` se o BNP não tem (súmulas e OJs do TST). */
function noBnp(c: Citacao): { orgao: string; tipo: string; numero: number; rotulo: string } | null {
  const [tipo, tribunal, numero] = c.chave.split(":") as [string, string, string];
  // O BNP escreve o TRF com dois dígitos: "TRF04".
  const orgao = tribunal.replace(/^TRF(\d)$/, "TRF0$1");
  if (tipo === "sumula_vinculante") return { orgao, tipo: "SV", numero: Number(numero), rotulo: "Súmula Vinculante" };
  if (tipo === "sumula" && tribunal !== "TST") return { orgao, tipo: "SUM", numero: Number(numero), rotulo: "Súmula" };
  if (tipo === "tema" && tribunal === "STF") return { orgao, tipo: "RG", numero: Number(numero), rotulo: "Tema" };
  return null;
}

/** Situações do tema do STJ sem tese firmada ou com tese mudada. */
const TEMA_SEM_TESE = /^(afetado|em julgamento|sem processo vinculado)/i;

function seloDoDocumento(rotulo: string, d: typeof acervoDocumentos.$inferSelect): Pick<CitacaoVerificada, "selo" | "motivo"> {
  const base = `${rotulo}: ${d.situacao}.`;
  if (d.cancelado) return { selo: "com_ressalva", motivo: `${base} Não use como precedente sem conferir.` };
  if (/^revisad/i.test(d.situacao)) return { selo: "com_ressalva", motivo: `${base} A tese mudou; confira a atual.` };
  if (TEMA_SEM_TESE.test(d.situacao)) return { selo: "com_ressalva", motivo: `${base} Ainda sem tese firmada.` };
  return { selo: "verificada", motivo: base };
}

const fonteDo = (d: { fonte: string; url: string; capturadoEm: Date }) => ({ nome: FONTES[d.fonte as keyof typeof FONTES] ?? d.fonte, url: d.url, capturadoEm: d.capturadoEm.toISOString() });

interface Contexto extends DepsDoAcervo {
  /** A demonstração confere só no que já está guardado. */
  soAcervo: boolean;
  /** Quando foi o último pedido ao BNP: no máximo um por segundo. */
  ultimoNoBnp: number;
}

const INTERVALO_DO_BNP_MS = 1000;

async function esperarVezNoBnp(ctx: Contexto) {
  const falta = ctx.ultimoNoBnp + INTERVALO_DO_BNP_MS - Date.now();
  if (falta > 0) await new Promise((r) => setTimeout(r, falta));
  ctx.ultimoNoBnp = Date.now();
}

async function documento(ctx: Contexto, c: Citacao): Promise<Omit<CitacaoVerificada, "chave" | "trecho" | "inicio">> {
  const [tipo, tribunal, numero] = c.chave.split(":") as [string, string, string];
  const bnp = noBnp(c);
  const rotulo = bnp ? `${tribunal}, ${bnp.rotulo} ${numero}` : `${tribunal}, Tema ${numero}`;
  let [d] = await ctx.db.select().from(acervoDocumentos).where(eq(acervoDocumentos.chave, c.chave));
  const vencido = d?.fonte === "cnj_bnp" && Date.now() - d.capturadoEm.getTime() > VALIDADE_DO_BNP_MS;
  if ((!d || vencido) && bnp && !ctx.soAcervo) {
    try {
      await esperarVezNoBnp(ctx);
      const p = await buscarNoBnp(bnp, { fetch: ctx.fetch });
      if (p) {
        await guardarPrecedente(ctx.db, c.chave, p);
        [d] = await ctx.db.select().from(acervoDocumentos).where(eq(acervoDocumentos.chave, c.chave));
      }
    } catch (e) {
      ctx.log?.("acervo: o BNP não respondeu", { chave: c.chave, erro: String(e) });
      // Sem a fonte, a versão guardada (mesmo vencida) ainda serve.
      if (!d) return { selo: "nao_verificada", motivo: "A fonte não respondeu agora. Confira antes de usar.", texto: null, fonte: null };
    }
  }
  if (d) return { ...seloDoDocumento(rotulo, d), texto: d.texto, fonte: fonteDo(d) };
  const motivo = ctx.soAcervo
    ? `Não está no acervo guardado. ${CONFIRA}`
    : tipo === "tema" && tribunal === "STJ"
      ? `Não está entre os temas do STJ no acervo. ${CONFIRA}`
      : `Não está no Banco Nacional de Precedentes. ${CONFIRA}`;
  return { selo: "nao_verificada", motivo, texto: null, fonte: null };
}

async function norma(ctx: Contexto, sigla: string): Promise<typeof acervoNormas.$inferSelect | null | "fora"> {
  const [guardada] = await ctx.db.select().from(acervoNormas).where(eq(acervoNormas.sigla, sigla));
  const fresca = guardada && Date.now() - guardada.capturadoEm.getTime() < VALIDADE_DA_NORMA_MS;
  if (fresca || ctx.soAcervo) return guardada ?? null;
  const urn = urnDaNorma(sigla);
  if (!urn) return guardada ?? null;
  try {
    const n = await baixarNorma(urn, { fetch: ctx.fetch });
    if (!n) return null;
    await guardarNorma(ctx.db, sigla, n);
    const [nova] = await ctx.db.select().from(acervoNormas).where(eq(acervoNormas.sigla, sigla));
    return nova ?? null;
  } catch (e) {
    ctx.log?.("acervo: o normas.leg.br não respondeu", { sigla, erro: String(e) });
    // Sem a fonte, a versão guardada (mesmo vencida) ainda serve.
    return guardada ?? "fora";
  }
}

async function dispositivo(ctx: Contexto, c: Citacao): Promise<Omit<CitacaoVerificada, "chave" | "trecho" | "inicio">> {
  const [, sigla, id] = c.chave.split(":") as [string, string, string];
  const n = await norma(ctx, sigla);
  if (n === "fora") return { selo: "nao_verificada", motivo: "A fonte não respondeu agora. Confira antes de usar.", texto: null, fonte: null };
  if (!n) return { selo: "nao_verificada", motivo: ctx.soAcervo ? `Não está no acervo guardado. ${CONFIRA}` : `Não achei esta lei no normas.leg.br. ${CONFIRA}`, texto: null, fonte: null };
  const fonteDaNorma = { nome: FONTES.normas_leg, url: n.url, capturadoEm: n.capturadoEm.toISOString() };
  if (!n.porDispositivo) return { selo: "com_ressalva", motivo: "A lei existe, mas a fonte não traz o texto de cada artigo. Confira o artigo no Diário Oficial.", texto: null, fonte: fonteDaNorma };
  const nome = n.apelido ?? n.nome;
  const d = acharDispositivo({ dispositivos: new Map(Object.entries(n.dispositivos).map(([k, v]) => [k, { id: k, ...v }])) }, id);
  if (!d) return { selo: "nao_verificada", motivo: `Este dispositivo não aparece no texto compilado do ${nome}. ${CONFIRA}`, texto: null, fonte: fonteDaNorma };
  const fonte = { ...fonteDaNorma, url: d.url };
  if (d.revogado) return { selo: "com_ressalva", motivo: d.desde ? `Revogado em ${formatarDia(d.desde)}.` : "Revogado.", texto: d.texto, fonte };
  return { selo: "verificada", motivo: `Em vigor no texto compilado do ${nome}.`, texto: d.texto, fonte };
}

async function conferir(ctx: Contexto, c: Citacao): Promise<Omit<CitacaoVerificada, "chave" | "trecho" | "inicio">> {
  const tribunal = c.chave.split(":")[1];
  if (c.tipo === "oj" || ((c.tipo === "sumula" || c.tipo === "tema") && tribunal === "TST")) {
    return { selo: "nao_verificada", motivo: `As súmulas e OJs do TST ainda não estão no acervo. ${CONFIRA}`, texto: null, fonte: null };
  }
  if (c.tipo === "precedente") return { selo: "nao_verificada", motivo: `Acórdãos ainda não estão no acervo. ${CONFIRA}`, texto: null, fonte: null };
  if (c.tipo === "processo") return { selo: "nao_verificada", motivo: `Processos citados pelo número ainda não são conferidos. ${CONFIRA}`, texto: null, fonte: null };
  if (c.tipo === "dispositivo") return dispositivo(ctx, c);
  return documento(ctx, c);
}

/** Todas as citações do texto, cada uma com o selo, o motivo e a fonte. */
export async function verificarCitacoes(deps: DepsDoAcervo, organizationId: string, texto: string): Promise<CitacaoVerificada[]> {
  const ctx: Contexto = { ...deps, soAcervo: await ehDemonstracao(deps.db, organizationId), ultimoNoBnp: 0 };
  const saida: CitacaoVerificada[] = [];
  // Uma por vez: as fontes pedem calma, e a mesma lei citada duas vezes é baixada uma só.
  for (const c of extrairCitacoes(texto)) saida.push({ chave: c.chave, trecho: c.trecho, inicio: c.inicio, ...(await conferir(ctx, c)) });
  return saida;
}

export function resumoDaVerificacao(citacoes: { selo: SeloDaCitacao }[]): VerificacaoDaPeca["resumo"] {
  const conta = (s: SeloDaCitacao) => citacoes.filter((c) => c.selo === s).length;
  return { verificadas: conta("verificada"), comRessalva: conta("com_ressalva"), naoVerificadas: conta("nao_verificada") };
}

export const hashDoTexto = (texto: string) => hash(texto);
