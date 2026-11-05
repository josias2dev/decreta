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
  fimDoDesconto,
  formatarDia,
  hojeEm,
  montarFunil,
  somarDias,
  TESTE_DIAS_PADRAO,
  type DescontoDoEscritorio,
  type MarcaDoEscritorio,
  type TetosDaIaDoEscritorio,
  type Dia,
  type AcaoRegistrada,
  type EscritorioDaPlataforma,
  type EtapaDoFunil,
  type SituacaoDoEscritorio,
} from "@decreta/core";
import { auditoriaDaPlataforma, faturas, organization, planos, withTenant, type Database } from "@decreta/db";
import { eq, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { contarEventos } from "../eventos.ts";
import type { ClienteAsaas } from "./asaas.ts";
import { fichaDaLinha } from "./assinatura.ts";
import { acertarValorNoAsaas, mudancasPelasFaturas } from "./cobranca.ts";
import { cancelarAssinaturaAoEncerrar, encerrarEscritorio } from "./encerramento.ts";
import { usarCupom } from "./planos.ts";

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

export type { EscritorioDaPlataforma };

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

export type AcaoDaPlataforma = AcaoRegistrada;

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
export async function agirNoEscritorio(deps: { db: Database; log?: Log; agora?: Date; testeDias?: number }, p: PedidoDeAcao): Promise<{ antes: SituacaoDoEscritorio; depois: SituacaoDoEscritorio }> {
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
          const testeAte = o.testeAte && o.testeAte >= hoje ? o.testeAte : somarDias(hoje, deps.testeDias ?? TESTE_DIAS_PADRAO);
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

/* ---------------- As ações na licença ---------------- */

export const ACOES_NA_LICENCA = ["licenca", "desconto", "tirar_desconto", "cupom", "tetos_ia", "estender_acesso", "marcar", "novo_link", "encerrar"] as const;
export type AcaoNaLicenca = (typeof ACOES_NA_LICENCA)[number];

export const DIAS_DE_ACESSO_MAXIMO = 90;
export const MESES_DE_DESCONTO_MAXIMO = 36;

export type PedidoNaLicenca = { operador: string; organizationId: string; motivo?: string | null } & (
  | { acao: "licenca"; planoId: string; pessoasExtras: number; valorCombinadoCentavos: number | null }
  | { acao: "desconto"; tipo: "percentual" | "valor"; valor: number; meses: number }
  | { acao: "tirar_desconto" }
  | { acao: "cupom"; codigo: string }
  | { acao: "tetos_ia"; tetos: TetosDaIaDoEscritorio }
  | { acao: "estender_acesso"; dias: number }
  | { acao: "marcar"; marca: MarcaDoEscritorio | null }
  | { acao: "novo_link" }
  | { acao: "encerrar"; confirmacao: string }
);

export interface DepsDaLicenca {
  db: Database;
  asaas: ClienteAsaas | null;
  cobrancaAtiva: boolean;
  log: Log;
  agora?: Date;
}

/** As ações que mudam o preço: depois delas, a assinatura viva no Asaas passa a cobrar o valor novo a partir da próxima fatura. */
const MUDAM_O_PRECO = new Set<AcaoNaLicenca>(["licenca", "desconto", "tirar_desconto", "cupom"]);

/**
 * O que a equipe muda na licença de um escritório, sempre na auditoria e com o motivo:
 *  - licenca: o plano (a versão viva, ou a mesma em que ele está), as pessoas a mais e o valor combinado no lugar do preço;
 *  - desconto / tirar_desconto: um desconto por um número de mensalidades, a partir de hoje;
 *  - cupom: o desconto de um cupom, gastando um uso dele;
 *  - tetos_ia: os tetos de IA próprios do escritório (do dia, do mês e as mensagens por pessoa), acima ou abaixo do padrão;
 *  - estender_acesso: quem cancelou ganha mais dias de acesso completo, como gesto comercial;
 *  - marcar: piloto, parceiro ou indicação (só para a equipe);
 *  - novo_link: tira do ar o link de pagamento guardado, para o próximo "Assinar" gerar outro com o preço de hoje;
 *  - encerrar: a pedido do escritório, com o nome dele digitado; os dados somem 30 dias depois, como quando o sócio encerra.
 * A licença fica na `organization` (sem RLS) e os cupons só existem fora de um escritório: a transação aqui não entra em nenhum.
 */
export async function agirNaLicenca(deps: DepsDaLicenca, p: PedidoNaLicenca): Promise<{ detalhes: Record<string, unknown>; valorNoAsaas?: { de: number | null; para: number } | null }> {
  const agora = deps.agora ?? new Date();
  const motivo = p.motivo?.trim() || null;
  const feito = await deps.db.transaction(async (tx) => {
    const [o] = await tx.select().from(organization).where(eq(organization.id, p.organizationId)).for("update");
    if (!o) throw new RecusaDaPlataforma(404, "Escritório não encontrado.");
    if (o.slug === SLUG_DA_DEMONSTRACAO) throw new RecusaDaPlataforma(409, "A demonstração é de todos e não muda por aqui.");
    if (o.encerradoEm) throw new RecusaDaPlataforma(409, "O escritório foi encerrado.");
    const hoje = hojeEm(o.timezone, agora);
    const detalhes: Record<string, unknown> = { motivo };
    let mudancas: Partial<typeof organization.$inferInsert> = {};
    const depois: { removerLink?: string; encerrar?: boolean } = {};

    switch (p.acao) {
      case "licenca": {
        const [alvo] = await tx.select().from(planos).where(eq(planos.id, p.planoId));
        if (!alvo) throw new RecusaDaPlataforma(404, "Plano não encontrado.");
        if (alvo.substituidoEm && alvo.id !== o.planoId) throw new RecusaDaPlataforma(409, "Esta versão do plano já foi substituída. Escolha a versão mais nova.");
        if (!Number.isInteger(p.pessoasExtras) || p.pessoasExtras < 0 || p.pessoasExtras > 500) throw new RecusaDaPlataforma(422, "Pessoas a mais: de 0 a 500.");
        if (p.valorCombinadoCentavos !== null && (!Number.isInteger(p.valorCombinadoCentavos) || p.valorCombinadoCentavos < 0)) throw new RecusaDaPlataforma(422, "Valor combinado inválido.");
        mudancas = { planoId: alvo.id, pessoasExtras: p.pessoasExtras, valorCombinadoCentavos: p.valorCombinadoCentavos };
        Object.assign(detalhes, { de: { planoId: o.planoId, pessoasExtras: o.pessoasExtras, valorCombinadoCentavos: o.valorCombinadoCentavos }, para: { plano: `${alvo.nome} (versão ${alvo.versao})`, planoId: alvo.id, pessoasExtras: p.pessoasExtras, valorCombinadoCentavos: p.valorCombinadoCentavos } });
        break;
      }
      case "desconto": {
        if (!Number.isInteger(p.meses) || p.meses < 1 || p.meses > MESES_DE_DESCONTO_MAXIMO) throw new RecusaDaPlataforma(422, `O desconto vale de 1 a ${MESES_DE_DESCONTO_MAXIMO} meses.`);
        if (!Number.isInteger(p.valor) || p.valor < 1 || (p.tipo === "percentual" && p.valor > 100)) throw new RecusaDaPlataforma(422, p.tipo === "percentual" ? "O percentual vai de 1 a 100." : "Valor do desconto inválido.");
        const desconto: DescontoDoEscritorio = { tipo: p.tipo, valor: p.valor, ate: fimDoDesconto(hoje, p.meses), cupom: null };
        mudancas = { desconto };
        Object.assign(detalhes, { de: o.desconto, para: desconto, meses: p.meses });
        break;
      }
      case "tirar_desconto":
        if (!o.desconto || o.desconto.ate < hoje) throw new RecusaDaPlataforma(409, "O escritório não tem desconto valendo.");
        mudancas = { desconto: null };
        detalhes.de = o.desconto;
        break;
      case "cupom": {
        const desconto = await usarCupom(tx, p.codigo, hoje);
        mudancas = { desconto };
        Object.assign(detalhes, { de: o.desconto, para: desconto });
        break;
      }
      case "tetos_ia": {
        const limpar = (v: number | null | undefined) => (v === undefined || v === null ? null : v);
        for (const v of [p.tetos.diaUsd, p.tetos.mesUsd, p.tetos.mensagensPorDia]) if (v !== undefined && v !== null && (!Number.isFinite(v) || v < 0)) throw new RecusaDaPlataforma(422, "Os tetos são números de zero para cima (zero: sem teto).");
        const tetos: TetosDaIaDoEscritorio = { diaUsd: limpar(p.tetos.diaUsd), mesUsd: limpar(p.tetos.mesUsd), mensagensPorDia: limpar(p.tetos.mensagensPorDia) };
        const vazio = tetos.diaUsd === null && tetos.mesUsd === null && tetos.mensagensPorDia === null;
        mudancas = { tetosIa: vazio ? null : tetos };
        Object.assign(detalhes, { de: o.tetosIa, para: vazio ? null : tetos });
        break;
      }
      case "estender_acesso": {
        if (!o.cancelamentoPedidoEm || !o.acessoAte) throw new RecusaDaPlataforma(409, "Só se estende o acesso de quem cancelou a assinatura.");
        if (!Number.isInteger(p.dias) || p.dias < 1 || p.dias > DIAS_DE_ACESSO_MAXIMO) throw new RecusaDaPlataforma(422, `Estender de 1 a ${DIAS_DE_ACESSO_MAXIMO} dias.`);
        const base = o.acessoAte > hoje ? o.acessoAte : hoje;
        mudancas = { acessoAte: somarDias(base, p.dias) };
        Object.assign(detalhes, { dias: p.dias, de: o.acessoAte, para: mudancas.acessoAte });
        break;
      }
      case "marcar":
        if (p.marca === o.marca) throw new RecusaDaPlataforma(409, "O escritório já está assim.");
        mudancas = { marca: p.marca };
        Object.assign(detalhes, { de: o.marca, para: p.marca });
        break;
      case "novo_link":
        if (!o.asaasLinkId) throw new RecusaDaPlataforma(409, "O escritório não tem link de pagamento guardado. O próximo \"Assinar\" já gera um novo.");
        if (!deps.asaas) throw new RecusaDaPlataforma(409, "A cobrança não está configurada neste servidor.");
        depois.removerLink = o.asaasLinkId;
        detalhes.link = o.asaasLinkId;
        break;
      case "encerrar":
        if (!motivo) throw new RecusaDaPlataforma(422, "Diga o motivo: quem pediu e por onde.");
        if (p.confirmacao.trim().toLocaleLowerCase("pt-BR") !== o.name.trim().toLocaleLowerCase("pt-BR")) throw new RecusaDaPlataforma(422, "Digite o nome do escritório igual ao da ficha para confirmar.");
        depois.encerrar = true;
        break;
    }

    if (Object.keys(mudancas).length) await tx.update(organization).set(mudancas).where(eq(organization.id, o.id));
    await tx.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: `plataforma.${p.acao}`, organizationId: o.id, detalhes });
    return { detalhes, depois, nome: o.name, hoje };
  });

  // Fora da transação: as chamadas ao Asaas e o encerramento, que tem as próprias transações e registros.
  if (feito.depois.removerLink && deps.asaas) {
    await deps.asaas.removerLink(feito.depois.removerLink);
    await deps.db.update(organization).set({ asaasLinkId: null, asaasLinkUrl: null, asaasLinkValorCentavos: null }).where(eq(organization.id, p.organizationId));
  }
  if (feito.depois.encerrar) {
    const quem = { organizationId: p.organizationId, userId: null, nome: `Equipe do Decreta (${p.operador})`, ip: null };
    const { apagarEm } = await encerrarEscritorio(deps.db, { ...quem, log: deps.log, agora });
    await cancelarAssinaturaAoEncerrar({ db: deps.db, asaas: deps.asaas, log: deps.log }, quem);
    feito.detalhes.apagarEm = apagarEm.toISOString();
  }
  let valorNoAsaas: { de: number | null; para: number } | null = null;
  if (MUDAM_O_PRECO.has(p.acao)) {
    valorNoAsaas = await acertarValorNoAsaas(deps, p.organizationId, agora).catch((err: unknown) => {
      deps.log("a licença mudou, mas o valor no Asaas não foi acertado agora: a rotina da manhã tenta de novo", { organizationId: p.organizationId, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
  }
  deps.log("ação da plataforma na licença", { operador: p.operador, acao: p.acao, organizationId: p.organizationId });
  return { detalhes: feito.detalhes, valorNoAsaas };
}

/** O desconto em palavras, para a auditoria e a ficha: "20% até 04/02/2027". */
export const descontoEmPalavras = (d: DescontoDoEscritorio) => `${d.tipo === "percentual" ? `${d.valor}%` : `R$ ${(d.valor / 100).toFixed(2).replace(".", ",")}`} até ${formatarDia(d.ate)}`;
