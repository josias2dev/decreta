/**
 * Limites da IA nas telas: quantas mensagens cada pessoa manda no chat e
 * quanto a IA pode gastar por dia (no site inteiro, por pessoa e na
 * demonstração, cujo login vai para quem quer conhecer o Decreta). Cada
 * chamada grava o que gastou em `uso_ia`; antes de chamar, a rota confere os
 * limites e, passou de algum, responde 429 com o motivo escrito para a tela.
 *
 * O dia vira à meia-noite de Brasília, como no gateway. As rotinas de fundo
 * (o prazo de uma publicação nova) também gravam o gasto, mas nunca são
 * barradas aqui: só o teto do projeto no gateway as para, e ele fica acima do
 * teto do site justamente para sobrar para elas.
 */
import { hojeEm, instanteLocal } from "@decreta/core";
import { organization, usoIa, withTenant, type Database } from "@decreta/db";
import { comMedidor, type Ia, type MetodoIa, type PrecoDeReferencia } from "@decreta/ia";
import { eq, sql } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import type { Env } from "../env.ts";

export interface LimitesDaIa {
  /** Mensagens no chat por pessoa (0 = sem limite). */
  mensagensPorMinuto: number;
  mensagensPorDia: number;
  /** Gasto do dia, em dólar (0 = sem teto). */
  tetoPessoaUsd: number;
  tetoSiteUsd: number;
  /** Na demonstração: mensagens por pessoa e o gasto do escritório inteiro. */
  demonstracao: { mensagensPorDia: number; tetoUsd: number };
  /** Pedidos à IA ao mesmo tempo por pessoa: sem isso, dez de uma vez passariam pela conferência antes de o primeiro gastar. */
  simultaneos: number;
  preco: PrecoDeReferencia;
}

/** Opus 5.5, o mais caro dos modelos que o gateway pode usar: a estimativa erra para cima. */
export const PRECO_DE_REFERENCIA: PrecoDeReferencia = { entrada: 4, saida: 20 };

/** Sem limite nenhum (os testes que não são sobre limites). A API sempre usa `limitesDoEnv`. */
export const SEM_LIMITES: LimitesDaIa = { mensagensPorMinuto: 0, mensagensPorDia: 0, tetoPessoaUsd: 0, tetoSiteUsd: 0, demonstracao: { mensagensPorDia: 0, tetoUsd: 0 }, simultaneos: 0, preco: PRECO_DE_REFERENCIA };

export function limitesDoEnv(env: Env): LimitesDaIa {
  return {
    mensagensPorMinuto: env.IA_MENSAGENS_POR_MINUTO,
    mensagensPorDia: env.IA_MENSAGENS_POR_DIA,
    tetoPessoaUsd: env.IA_TETO_PESSOA_USD,
    tetoSiteUsd: env.IA_TETO_SITE_USD,
    demonstracao: { mensagensPorDia: env.IA_DEMONSTRACAO_MENSAGENS_POR_DIA, tetoUsd: env.IA_DEMONSTRACAO_TETO_USD },
    simultaneos: env.IA_PEDIDOS_SIMULTANEOS,
    preco: { entrada: env.IA_USD_MTOK_ENTRADA, saida: env.IA_USD_MTOK_SAIDA },
  };
}

/** Passou de um limite: a tela mostra o `detalhe`. */
export class LimiteDaIa extends HTTPException {
  /** `passaLogo`: o limite do minuto e o de respostas ao mesmo tempo; a tela só oferece "Tentar de novo" nesses. */
  constructor(
    readonly motivo: string,
    passaLogo = motivo === AVISOS.minuto || motivo === AVISOS.simultaneos,
  ) {
    super(429, { res: Response.json({ erro: "limite_ia", detalhe: motivo, passaLogo }, { status: 429 }) });
  }
}

export const AVISOS = {
  minuto: "Você mandou muitas mensagens seguidas. Espere um minuto e mande de novo.",
  mensagensDoDia: (n: number) => `Você chegou ao limite de ${n} mensagens por dia no chat da IA. Amanhã, a partir da meia-noite, dá para mandar de novo.`,
  demonstracao: "A demonstração chegou ao limite de uso da IA de hoje. Amanhã, a partir da meia-noite, volta a funcionar. O resto do Decreta continua aberto.",
  pessoa: "Você chegou ao limite de uso da IA de hoje. Amanhã, a partir da meia-noite, volta a funcionar.",
  site: "A IA do Decreta chegou ao limite de gasto de hoje. Amanhã, a partir da meia-noite, volta a funcionar. Os prazos das publicações novas continuam sendo lidos.",
  simultaneos: "Espere a resposta que está chegando terminar antes de pedir outra.",
  gateway: "A IA chegou ao limite de gasto de hoje. Amanhã, a partir da meia-noite, volta a funcionar.",
  pertoDoTeto: "A IA de hoje está perto do limite. Quando chegar nele, volta amanhã, a partir da meia-noite.",
  restam: (n: number) => (n === 1 ? "Resta 1 mensagem hoje no chat da IA." : `Restam ${n} mensagens hoje no chat da IA.`),
};

export interface QuemUsa {
  /** Vazio só no que não é de escritório nenhum (não acontece hoje). */
  organizationId: string;
  userId: string | null;
  origem: "tela" | "fundo";
}

/** Meia-noite de hoje em Brasília. */
export const inicioDoDia = (agora: Date) => instanteLocal(hojeEm("America/Sao_Paulo", agora), "00:00", "America/Sao_Paulo");

/**
 * A IA que grava o gasto de cada chamada em nome de quem pediu. A gravação
 * acontece antes de a resposta seguir (alguns milissegundos); se falhar, a
 * resposta segue do mesmo jeito e o log avisa.
 */
export function iaMedida(deps: { db: Database; log?: (msg: string, extra?: Record<string, unknown>) => void }, ia: Ia, quem: QuemUsa, preco: PrecoDeReferencia = PRECO_DE_REFERENCIA): Ia {
  return comMedidor(ia, preco, (u) =>
    withTenant(deps.db, quem.organizationId, (tx) =>
      tx.insert(usoIa).values({
        organizationId: quem.organizationId,
        userId: quem.userId,
        metodo: u.metodo,
        origem: quem.origem,
        tokensEntrada: u.entrada,
        tokensSaida: u.saida,
        custoUsd: u.custoUsd,
        estimado: u.estimado,
        em: new Date(),
      }),
    )
      .then(() => {})
      .catch((err) => deps.log?.("gasto da IA não foi gravado", { metodo: u.metodo, custoUsd: u.custoUsd, error: err instanceof Error ? err.message : String(err) })),
  );
}

export async function ehDaDemonstracao(db: Database, organizationId: string): Promise<boolean> {
  const [o] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId));
  return o?.slug === SLUG_DA_DEMONSTRACAO;
}

export interface UsoDoDia {
  mensagensNoMinuto: number;
  mensagensHoje: number;
  gastoPessoaUsd: number;
  gastoEscritorioUsd: number;
  gastoSiteUsd: number;
}

/** O que a pessoa, o escritório e o site já usaram hoje (só o que veio das telas). */
export async function usoDoDia(db: Database, quem: { organizationId: string; userId: string | null }, agora = new Date()): Promise<UsoDoDia> {
  // Como texto: o driver do drizzle não serializa Date dentro de sql``.
  const desde = sql`${inicioDoDia(agora).toISOString()}::timestamptz`;
  const minutoAtras = sql`${new Date(agora.getTime() - 60_000).toISOString()}::timestamptz`;
  const daPessoa = quem.userId ? sql`${usoIa.userId} = ${quem.userId}` : sql`false`;
  const [r] = await withTenant(db, quem.organizationId, (tx) =>
    tx
      .select({
        mensagensNoMinuto: sql<number>`count(*) filter (where ${usoIa.mensagem} and ${daPessoa} and ${usoIa.em} > ${minutoAtras})::int`,
        mensagensHoje: sql<number>`count(*) filter (where ${usoIa.mensagem} and ${daPessoa})::int`,
        gastoPessoaUsd: sql<number>`coalesce(sum(${usoIa.custoUsd}) filter (where ${daPessoa}), 0)::float8`,
        gastoEscritorioUsd: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)::float8`,
        gastoSiteUsd: sql<number>`gasto_da_ia_no_site(${desde})::float8`,
      })
      .from(usoIa)
      .where(sql`${usoIa.origem} = 'tela' and ${usoIa.em} >= ${desde}`),
  );
  return r!;
}

/**
 * Por que a IA não pode atender agora, ou `null` se pode. Na ordem do mais
 * específico para o mais geral, para o aviso dizer o que a pessoa pode fazer.
 */
export function motivoParaBarrar(limites: LimitesDaIa, uso: UsoDoDia, quem: { demonstracao: boolean; mensagem: boolean }): string | null {
  const porDia = quem.demonstracao ? limites.demonstracao.mensagensPorDia : limites.mensagensPorDia;
  if (quem.mensagem && limites.mensagensPorMinuto && uso.mensagensNoMinuto >= limites.mensagensPorMinuto) return AVISOS.minuto;
  if (quem.mensagem && porDia && uso.mensagensHoje >= porDia) return AVISOS.mensagensDoDia(porDia);
  if (quem.demonstracao && limites.demonstracao.tetoUsd && uso.gastoEscritorioUsd >= limites.demonstracao.tetoUsd) return AVISOS.demonstracao;
  if (limites.tetoPessoaUsd && uso.gastoPessoaUsd >= limites.tetoPessoaUsd) return AVISOS.pessoa;
  if (limites.tetoSiteUsd && uso.gastoSiteUsd >= limites.tetoSiteUsd) return AVISOS.site;
  return null;
}

/** A partir de quanto do teto do dia a tela avisa. */
const AVISO_NO_GASTO = 0.8;

export interface QuantoResta {
  /** As mensagens do chat que ainda dá para mandar hoje; nulo sem limite. */
  mensagens: { restam: number; limite: number } | null;
  /** Quanto do teto do dia já foi (0 a 1): o mais apertado entre o da pessoa, o do site e o da demonstração; nulo sem teto. */
  gasto: number | null;
  /** O que a tela diz antes de barrar (falta pouco) ou depois (o mesmo motivo da recusa). */
  aviso: string | null;
}

/** O que a pessoa ainda tem de IA hoje, para a tela mostrar antes de o limite chegar. */
export function quantoResta(limites: LimitesDaIa, uso: UsoDoDia, quem: { demonstracao: boolean }): QuantoResta {
  const porDia = quem.demonstracao ? limites.demonstracao.mensagensPorDia : limites.mensagensPorDia;
  const mensagens = porDia ? { restam: Math.max(0, porDia - uso.mensagensHoje), limite: porDia } : null;
  const fracoes = [
    limites.tetoPessoaUsd ? uso.gastoPessoaUsd / limites.tetoPessoaUsd : null,
    limites.tetoSiteUsd ? uso.gastoSiteUsd / limites.tetoSiteUsd : null,
    quem.demonstracao && limites.demonstracao.tetoUsd ? uso.gastoEscritorioUsd / limites.demonstracao.tetoUsd : null,
  ].filter((f): f is number => f !== null);
  const gasto = fracoes.length ? Math.min(1, Math.max(...fracoes)) : null;
  // O limite do minuto passa sozinho: não vira aviso.
  const barrado = motivoParaBarrar({ ...limites, mensagensPorMinuto: 0 }, uso, { ...quem, mensagem: true });
  const aviso =
    barrado ??
    (mensagens && mensagens.restam <= Math.max(5, Math.ceil(mensagens.limite * 0.1)) ? AVISOS.restam(mensagens.restam) : gasto !== null && gasto >= AVISO_NO_GASTO ? AVISOS.pertoDoTeto : null);
  return { mensagens, gasto, aviso };
}

/** O teto que vale para o que alguém pediu e roda no fundo (a leitura de um arquivo enviado): o do site e o da demonstração. */
export async function motivoNoFundo(db: Database, limites: LimitesDaIa, organizationId: string): Promise<string | null> {
  const [uso, demonstracao] = await Promise.all([usoDoDia(db, { organizationId, userId: null }), ehDaDemonstracao(db, organizationId)]);
  return motivoParaBarrar(limites, uso, { demonstracao, mensagem: false });
}

/** A mensagem mandada no chat entra na conta antes de a IA responder (parar a resposta não devolve o limite). */
export async function registrarMensagem(db: Database, quem: { organizationId: string; userId: string }, metodo: MetodoIa, agora = new Date()): Promise<void> {
  await withTenant(db, quem.organizationId, (tx) => tx.insert(usoIa).values({ organizationId: quem.organizationId, userId: quem.userId, metodo, origem: "tela", mensagem: true, em: agora }));
}

/* ---------------- Pedidos ao mesmo tempo (na memória: a API é um processo só) ---------------- */

/** Uma vez que não foi devolvida (a conexão sumiu sem avisar) some sozinha depois disto. */
const VALIDADE_DA_VEZ = 5 * 60_000;
const emAndamento = new Map<string, { ate: number }[]>();

/** Guarda uma vez para a pessoa. Devolve a função que a devolve, ou `null` se ela já está no máximo. */
export function reservarVez(userId: string, maximo: number, agora = Date.now()): (() => void) | null {
  if (!maximo) return () => {};
  const vezes = (emAndamento.get(userId) ?? []).filter((v) => v.ate > agora);
  if (vezes.length >= maximo) {
    emAndamento.set(userId, vezes);
    return null;
  }
  const vez = { ate: agora + VALIDADE_DA_VEZ };
  emAndamento.set(userId, [...vezes, vez]);
  return () => {
    const resto = (emAndamento.get(userId) ?? []).filter((v) => v !== vez);
    if (resto.length) emAndamento.set(userId, resto);
    else emAndamento.delete(userId);
  };
}
