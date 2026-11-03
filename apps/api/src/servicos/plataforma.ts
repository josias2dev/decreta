/**
 * O painel da plataforma: o que a equipe do Decreta vê e faz em todos os escritórios.
 *
 * Quem entra é o operador, pela lista `PLATAFORMA_EMAILS`, separada dos papéis do escritório.
 * O que cada escritório guarda (clientes, processos, publicações) é dele e daqui nunca sai: a
 * leitura entre escritórios é só pela função SQL `plataforma_escritorios`, que devolve a conta
 * (nome, situação, datas) e totais (pessoas, processos, gasto de IA do mês), e pelo funil de
 * eventos, que só soma. Toda ação fica na auditoria da plataforma, com quem fez, quando e por quê.
 */
import {
  diaDoInstante,
  estadoDaAssinatura,
  hojeEm,
  montarFunil,
  PLANO,
  somarDias,
  type Dia,
  type EtapaDoFunil,
  type SituacaoDoEscritorio,
} from "@decreta/core";
import { auditoriaDaPlataforma, faturas, organization, withTenant, type Database } from "@decreta/db";
import { eq, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { contarEventos } from "../eventos.ts";
import { fichaDaLinha } from "./assinatura.ts";
import { mudancasPelasFaturas } from "./cobranca.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** Os e-mails dos operadores, em minúsculas, de uma lista separada por vírgula, ponto e vírgula ou espaço. */
export function emailsDaPlataforma(lista: string): Set<string> {
  return new Set(
    lista
      .split(/[\s,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const ehOperador = (emails: ReadonlySet<string>, email: string | null | undefined) => !!email && emails.has(email.trim().toLowerCase());

/* ---------------- A lista ---------------- */

export interface EscritorioDaPlataforma {
  id: string;
  nome: string;
  slug: string;
  demonstracao: boolean;
  encerrado: boolean;
  emAvaliacao: boolean;
  /** A situação de hoje (a gravada, corrigida pelas datas). */
  situacao: SituacaoDoEscritorio;
  situacaoGravada: SituacaoDoEscritorio;
  criadoEm: string;
  /** O fim do teste: o último dia. */
  testeAte: Dia | null;
  diasRestantesDoTeste: number | null;
  diasDeAtraso: number | null;
  acessoAte: Dia | null;
  assinouEm: string | null;
  cancelamentoPedidoEm: string | null;
  valorMensalCentavos: number | null;
  pessoas: number;
  processos: number;
  iaMesUsd: number;
}

type LinhaCrua = {
  id: string;
  nome: string;
  slug: string;
  criado_em: string;
  em_avaliacao: boolean;
  encerrado_em: string | null;
  situacao: SituacaoDoEscritorio;
  teste_ate: string | null;
  inadimplente_desde: string | null;
  acesso_ate: string | null;
  cancelamento_pedido_em: string | null;
  assinou_em: string | null;
  valor_mensal_centavos: number | null;
  pessoas: number;
  processos: number;
  ia_mes_usd: number;
};

/** Instante em texto ISO (UTC) vindo do banco, sem depender de como o driver devolve a data. */
const instante = (coluna: string) => sql.raw(`case when ${coluna} is null then null else to_char(${coluna} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end`);
const dia = (coluna: string) => sql.raw(`to_char(${coluna}, 'YYYY-MM-DD')`);

/** Todos os escritórios, só com a conta e os totais. É a única porta entre escritórios; o RLS segue valendo em tudo o mais. */
export async function escritoriosDaPlataforma(db: Database, agora = new Date()): Promise<EscritorioDaPlataforma[]> {
  const linhas = await db.execute<LinhaCrua>(sql`
    select id, nome, slug, ${instante("criado_em")} as criado_em, em_avaliacao, ${instante("encerrado_em")} as encerrado_em,
      situacao::text as situacao, ${dia("teste_ate")} as teste_ate, ${dia("inadimplente_desde")} as inadimplente_desde, ${dia("acesso_ate")} as acesso_ate,
      ${instante("cancelamento_pedido_em")} as cancelamento_pedido_em, ${instante("assinou_em")} as assinou_em, valor_mensal_centavos, pessoas, processos, ia_mes_usd
    from plataforma_escritorios()`);
  return [...linhas].map((l) => {
    const estado = estadoDaAssinatura(fichaDaLinha({ situacao: l.situacao, testeAte: l.teste_ate, inadimplenteDesde: l.inadimplente_desde, acessoAte: l.acesso_ate }), hojeEm("America/Sao_Paulo", agora));
    return {
      id: l.id,
      nome: l.nome,
      slug: l.slug,
      demonstracao: l.slug === SLUG_DA_DEMONSTRACAO,
      encerrado: !!l.encerrado_em,
      emAvaliacao: l.em_avaliacao,
      situacao: estado.situacao,
      situacaoGravada: l.situacao,
      criadoEm: l.criado_em,
      testeAte: l.teste_ate,
      diasRestantesDoTeste: estado.diasRestantesDoTeste,
      diasDeAtraso: estado.diasDeAtraso,
      acessoAte: l.acesso_ate,
      assinouEm: l.assinou_em,
      cancelamentoPedidoEm: l.cancelamento_pedido_em,
      valorMensalCentavos: l.valor_mensal_centavos,
      pessoas: l.pessoas,
      processos: l.processos,
      iaMesUsd: l.ia_mes_usd,
    };
  });
}

/* ---------------- Os indicadores ---------------- */

export interface IndicadoresDaPlataforma {
  periodo: { de: Dia; ate: Dia; dias: number };
  /** A soma das mensalidades de quem assina (ativo ou com pagamento em atraso, e ainda não cancelado). */
  mrrCentavos: number;
  /** A parte do MRR que está em atraso. */
  mrrEmAtrasoCentavos: number;
  porSituacao: Record<SituacaoDoEscritorio, number>;
  /** Dos escritórios cadastrados no período que fizeram teste, quantos já terminaram o teste (ou assinaram) e quantos assinaram. */
  conversao: { cadastrados: number; terminaram: number; assinaram: number; taxa: number | null };
  cancelamentos: { total: number; mrrPerdidoCentavos: number };
  inadimplencia: { escritorios: number; mrrCentavos: number };
  funil: EtapaDoFunil[];
}

const SITUACOES_ZERADAS = (): Record<SituacaoDoEscritorio, number> => ({ teste: 0, ativo: 0, inadimplente: 0, so_leitura: 0, bloqueado: 0, cancelado: 0, cortesia: 0 });

export async function indicadoresDaPlataforma(db: Database, dias: number, agora = new Date()): Promise<IndicadoresDaPlataforma> {
  const hoje = hojeEm("America/Sao_Paulo", agora);
  const periodo = { de: somarDias(hoje, 1 - dias), ate: hoje, dias };
  const noPeriodo = (iso: string | null) => !!iso && diaDoInstante(iso) >= periodo.de && diaDoInstante(iso) <= periodo.ate;
  const reais = (await escritoriosDaPlataforma(db, agora)).filter((e) => !e.demonstracao && !e.encerrado);

  const porSituacao = SITUACOES_ZERADAS();
  for (const e of reais) porSituacao[e.situacao]++;

  const pagam = reais.filter((e) => (e.situacaoGravada === "ativo" || e.situacaoGravada === "inadimplente") && e.situacao !== "cancelado");
  const valor = (e: EscritorioDaPlataforma) => e.valorMensalCentavos ?? 0;
  const atraso = pagam.filter((e) => e.situacaoGravada === "inadimplente");

  const fizeramTeste = reais.filter((e) => e.testeAte !== null && noPeriodo(e.criadoEm));
  const terminaram = fizeramTeste.filter((e) => !!e.assinouEm || (e.testeAte as Dia) < hoje);
  const assinaram = fizeramTeste.filter((e) => !!e.assinouEm);
  const cancelaram = reais.filter((e) => noPeriodo(e.cancelamentoPedidoEm));

  return {
    periodo,
    mrrCentavos: pagam.reduce((s, e) => s + valor(e), 0),
    mrrEmAtrasoCentavos: atraso.reduce((s, e) => s + valor(e), 0),
    porSituacao,
    conversao: { cadastrados: fizeramTeste.length, terminaram: terminaram.length, assinaram: assinaram.length, taxa: terminaram.length ? assinaram.length / terminaram.length : null },
    cancelamentos: { total: cancelaram.length, mrrPerdidoCentavos: cancelaram.reduce((s, e) => s + valor(e), 0) },
    inadimplencia: { escritorios: atraso.length, mrrCentavos: atraso.reduce((s, e) => s + valor(e), 0) },
    funil: montarFunil(await contarEventos(db, periodo.de, periodo.ate)),
  };
}

/* ---------------- A auditoria ---------------- */

export interface AcaoDaPlataforma {
  id: string;
  operador: string;
  acao: string;
  organizationId: string | null;
  escritorio: string | null;
  detalhes: Record<string, unknown>;
  em: string;
}

export async function auditoriaDaPlataformaRecente(db: Database, limite = 100): Promise<AcaoDaPlataforma[]> {
  const linhas = await db.execute<{ id: string; operador: string; acao: string; organization_id: string | null; escritorio: string | null; detalhes: Record<string, unknown>; em: string }>(
    sql`select id, operador, acao, organization_id, escritorio, detalhes, ${instante("em")} as em from plataforma_auditoria(${limite})`,
  );
  return [...linhas].map((l) => ({ id: l.id, operador: l.operador, acao: l.acao, organizationId: l.organization_id, escritorio: l.escritorio, detalhes: l.detalhes, em: l.em }));
}

/* ---------------- As ações ---------------- */

export const ACOES_DA_PLATAFORMA = ["liberar", "estender_teste", "so_leitura", "bloquear", "cortesia", "reativar"] as const;
export type NomeDaAcao = (typeof ACOES_DA_PLATAFORMA)[number];

export class RecusaDaPlataforma extends Error {
  constructor(
    readonly status: 404 | 409 | 422,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

export const DIAS_A_MAIS_PADRAO = 7;
export const DIAS_A_MAIS_MAXIMO = 60;

export interface PedidoDeAcao {
  operador: string;
  organizationId: string;
  acao: NomeDaAcao;
  /** Só em `estender_teste`: quantos dias a mais (1 a 60; o padrão é 7). */
  dias?: number;
  motivo?: string | null;
}

/**
 * Muda o escritório e grava na auditoria da plataforma, numa transação só: ação sem registro não existe.
 *
 *  - liberar: tira a restrição de "em avaliação" (os tetos menores de WhatsApp, convites e IA);
 *  - estender_teste: soma dias ao fim do teste (a partir de hoje, se o teste já tinha acabado);
 *  - so_leitura e bloquear: restrição por decisão da equipe, até reativar;
 *  - cortesia: acesso total e sem cobrança, até reativar;
 *  - reativar: desfaz a restrição ou a cortesia. Quem assina volta a ser ativo; quem não assina abre um teste novo.
 */
export async function agirNoEscritorio(deps: { db: Database; log?: Log; agora?: Date }, p: PedidoDeAcao): Promise<{ antes: SituacaoDoEscritorio; depois: SituacaoDoEscritorio }> {
  const agora = deps.agora ?? new Date();
  return withTenant(deps.db, p.organizationId, async (tx) => {
    // A linha fica trancada até o fim: um aviso do Asaas que chega no mesmo instante espera a ação e a lê depois.
    const [o] = await tx.select().from(organization).where(eq(organization.id, p.organizationId)).for("update");
    if (!o) throw new RecusaDaPlataforma(404, "Escritório não encontrado.");
    if (o.slug === SLUG_DA_DEMONSTRACAO) throw new RecusaDaPlataforma(409, "A demonstração é de todos e não muda por aqui.");
    if (o.encerradoEm) throw new RecusaDaPlataforma(409, "O escritório foi encerrado.");
    const hoje = hojeEm(o.timezone, agora);
    const antes = o.situacao;
    const detalhes: Record<string, unknown> = { de: antes, motivo: p.motivo?.trim() || null };
    let mudancas: Partial<typeof organization.$inferInsert> = {};

    switch (p.acao) {
      case "liberar":
        if (!o.emAvaliacao) throw new RecusaDaPlataforma(409, "O escritório já está liberado.");
        mudancas = { emAvaliacao: false };
        break;
      case "estender_teste": {
        if (o.situacao !== "teste") throw new RecusaDaPlataforma(409, "Só escritório em teste tem o teste estendido. Para um escritório sem assinatura que já saiu do teste, use Reativar.");
        const dias = p.dias ?? DIAS_A_MAIS_PADRAO;
        if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_A_MAIS_MAXIMO) throw new RecusaDaPlataforma(422, `Estender de 1 a ${DIAS_A_MAIS_MAXIMO} dias.`);
        const base = o.testeAte && o.testeAte > hoje ? o.testeAte : hoje;
        mudancas = { testeAte: somarDias(base, dias) };
        detalhes.dias = dias;
        detalhes.testeAte = mudancas.testeAte;
        break;
      }
      case "so_leitura":
      case "bloquear":
      case "cortesia": {
        const para = p.acao === "so_leitura" ? "so_leitura" : p.acao === "bloquear" ? "bloqueado" : "cortesia";
        if (o.situacao === para) throw new RecusaDaPlataforma(409, "O escritório já está assim.");
        mudancas = { situacao: para };
        break;
      }
      case "reativar": {
        if (o.situacao !== "so_leitura" && o.situacao !== "bloqueado" && o.situacao !== "cortesia") throw new RecusaDaPlataforma(409, "Só se reativa escritório em só leitura, bloqueado ou de cortesia.");
        if (o.asaasAssinaturaId && o.assinouEm && !o.acessoAte) {
          // Quem assina volta ao que as faturas dizem: ativo, ou inadimplente se há fatura vencida e sem pagamento.
          const todas = await tx
            .select({ situacao: faturas.situacao, vencimento: faturas.vencimento, valorCentavos: faturas.valorCentavos, assinaturaId: faturas.assinaturaId })
            .from(faturas)
            .where(eq(faturas.organizationId, o.id));
          const dela = todas.filter((f) => f.assinaturaId === o.asaasAssinaturaId || f.assinaturaId === null);
          const m = mudancasPelasFaturas({ situacao: "ativo", assinouEm: o.assinouEm }, dela, hoje, agora);
          mudancas = { situacao: m.situacao ?? "ativo", inadimplenteDesde: m.inadimplenteDesde ?? null };
        } else {
          const testeAte = o.testeAte && o.testeAte >= hoje ? o.testeAte : somarDias(hoje, PLANO.testeDias);
          mudancas = { situacao: "teste", testeAte };
          detalhes.testeAte = testeAte;
        }
        break;
      }
    }

    await tx.update(organization).set(mudancas).where(eq(organization.id, o.id));
    const depois = (mudancas.situacao ?? antes) as SituacaoDoEscritorio;
    await tx.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: `plataforma.${p.acao}`, organizationId: o.id, detalhes: { ...detalhes, para: depois } });
    deps.log?.("ação da plataforma", { operador: p.operador, acao: p.acao, organizationId: o.id, de: antes, para: depois });
    return { antes, depois };
  });
}
