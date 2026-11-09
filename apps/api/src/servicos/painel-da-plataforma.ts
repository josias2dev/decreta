/**
 * O painel da plataforma, além da lista e das ações (ver `plataforma.ts`): a visão geral do negócio, a ficha
 * de um escritório, as pessoas, o uso das funcionalidades e o custo da IA.
 *
 * As leituras entre escritórios passam só pelas funções `plataforma_*` do banco (migração 0034), que devolvem
 * datas, ids e totais. A ficha de UM escritório lê dentro dele (`withTenant`), como as ações, e também só
 * conta: nenhum cliente, processo, publicação, documento, peça ou conversa sai daqui. As contas são as de
 * `@decreta/core` (`montarVisaoGeral`, `montarPessoas`...), as mesmas que a prévia clicável usa.
 */
import {
  hojeEm,
  instanteLocal,
  montarCustoDaIa,
  montarFaturas,
  montarFicha,
  montarLicencaCompleta,
  montarPessoas,
  montarRecusasDaIa,
  montarUso,
  montarVisaoGeral,
  numerosDaFoto,
  precoDoEscritorio,
  montarLicenca,
  somarDias,
  VERSAO_DOS_TERMOS,
  type AcessoCru,
  type CustoDaIaDaPlataforma,
  type Dia,
  type EscritorioNaLista,
  type ExtrasDaAtencao,
  type FaturaCrua,
  type FaturaDaLista,
  type FaturasDaPlataforma,
  type FichaCompleta,
  type Plano,
  type RecusaCrua,
  type RecusasDaIa,
  type FotoCrua,
  type IaCru,
  type MarcoCru,
  type PessoaCrua,
  type PessoasDaPlataforma,
  type TetosDoPainel,
  type UltimoAcesso,
  type UsoCru,
  type UsoDaPlataforma,
  type VisaoGeralDaPlataforma,
} from "@decreta/core";
import { auditoriaDaPlataforma, avisosEnviados, capturas, clientes, conversas, documentos, equipe, faturas, member, mensagensCliente, organization, pecas, prazos, processos, publicacoes, session, twoFactor, user, withTenant, type Database } from "@decreta/db";
import { and, count, desc, eq, gt, gte, inArray, isNotNull, sql, sum } from "drizzle-orm";
import { ehContaDaDemonstracao, SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { colunasDaLicenca, consumoDaPlataforma, lerPlanos, notasDoEscritorio, planoPadrao, retornosPendentes } from "./planos.ts";
import { auditoriaDaPlataformaRecente, escritoriosDaPlataforma, RecusaDaPlataforma } from "./plataforma.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

/** O que o painel precisa saber da configuração: a cotação do dólar e os tetos de IA. */
export interface ConfigDoPainel {
  cotacaoUsd: number;
  tetos: TetosDoPainel;
}

const FUSO = "America/Sao_Paulo";
const texto = (v: unknown) => (v === null || v === undefined ? null : String(v));
const dia = (v: unknown): Dia => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10));
const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
/** O primeiro instante do dia `de` e o primeiro depois de `ate` (dias de São Paulo). */
const intervalo = (de: Dia, ate: Dia) => [instanteLocal(de).toISOString(), instanteLocal(somarDias(ate, 1)).toISOString()] as const;

/* ---------------- As leituras ---------------- */

export async function lerAcessos(db: Database, de: Dia, ate: Dia): Promise<AcessoCru[]> {
  const linhas = await db.execute<{ organization_id: string; user_id: string; dia: unknown; aparelho: string }>(sql`select organization_id, user_id, dia, aparelho from plataforma_acessos(${de}::date, ${ate}::date)`);
  return [...linhas].map((l) => ({ organizationId: l.organization_id, userId: l.user_id, dia: dia(l.dia), aparelho: l.aparelho }));
}

export async function lerUltimosAcessos(db: Database): Promise<UltimoAcesso[]> {
  const linhas = await db.execute<{ organization_id: string; user_id: string; ultimo: unknown }>(sql`select organization_id, user_id, ultimo from plataforma_ultimos_acessos()`);
  return [...linhas].map((l) => ({ organizationId: l.organization_id, userId: l.user_id, ultimo: dia(l.ultimo) }));
}

export async function lerMarcos(db: Database): Promise<MarcoCru[]> {
  const linhas = await db.execute<{ organization_id: string; nome: string; em: unknown }>(sql`select organization_id, nome, em from plataforma_marcos()`);
  return [...linhas].map((l) => ({ organizationId: l.organization_id, nome: l.nome, em: iso(l.em) }));
}

export async function lerIa(db: Database, de: Dia, ate: Dia): Promise<IaCru[]> {
  const [a, b] = intervalo(de, ate);
  const linhas = await db.execute<{ organization_id: string | null; dia: unknown; metodo: string; origem: string; chamadas: number; mensagens: number; custo_usd: number; custo_estimado_usd: number }>(
    sql`select organization_id, dia, metodo, origem, chamadas, mensagens, custo_usd, custo_estimado_usd from plataforma_ia(${a}::timestamptz, ${b}::timestamptz)`,
  );
  return [...linhas].map((l) => ({ organizationId: l.organization_id, dia: dia(l.dia), metodo: l.metodo, origem: l.origem, chamadas: Number(l.chamadas), mensagens: Number(l.mensagens), custoUsd: Number(l.custo_usd), custoEstimadoUsd: Number(l.custo_estimado_usd) }));
}

export async function lerFaturas(db: Database, de: Dia, ate: Dia): Promise<FaturaCrua[]> {
  const linhas = await db.execute<{ id: string; organization_id: string; vencimento: unknown; valor_centavos: number; situacao: string; paga_em: unknown }>(sql`select id, organization_id, vencimento, valor_centavos, situacao, paga_em from plataforma_faturas(${de}::date, ${ate}::date)`);
  return [...linhas].map((l) => ({ id: l.id, organizationId: l.organization_id, vencimento: dia(l.vencimento), valorCentavos: Number(l.valor_centavos), situacao: l.situacao, pagaEm: l.paga_em ? dia(l.paga_em) : null }));
}

export async function lerFotos(db: Database, de: Dia, ate: Dia): Promise<FotoCrua[]> {
  const linhas = await db.execute<{ dia: unknown; numeros: Record<string, number> }>(sql`select dia, numeros from plataforma_fotos(${de}::date, ${ate}::date)`);
  return [...linhas].map((l) => ({ dia: dia(l.dia), numeros: l.numeros }));
}

export async function lerUso(db: Database, de: Dia, ate: Dia): Promise<UsoCru[]> {
  const [a, b] = intervalo(de, ate);
  const linhas = await db.execute<{ organization_id: string; funcionalidade: string; total: number }>(sql`select organization_id, funcionalidade, total from plataforma_uso(${a}::timestamptz, ${b}::timestamptz)`);
  return [...linhas].map((l) => ({ organizationId: l.organization_id, funcionalidade: l.funcionalidade, total: Number(l.total) }));
}

/* ---------------- A visão geral e a foto do dia ---------------- */

export async function visaoGeralDaPlataforma(db: Database, config: ConfigDoPainel, agora = new Date()): Promise<VisaoGeralDaPlataforma> {
  const hoje = hojeEm(FUSO, agora);
  const inicioDoMes = `${hoje.slice(0, 7)}-01`;
  const fimDoMes = somarDias(`${somarDias(inicioDoMes, 32).slice(0, 7)}-01`, -1);
  const [escritorios, acessos, ultimosAcessos, marcos, ia, faturasDoMes, fotos] = await Promise.all([
    escritoriosDaPlataforma(db, agora),
    lerAcessos(db, somarDias(hoje, -29), hoje),
    lerUltimosAcessos(db),
    lerMarcos(db),
    lerIa(db, somarDias(hoje, -29), hoje),
    lerFaturas(db, inicioDoMes, fimDoMes),
    lerFotos(db, somarDias(hoje, -400), hoje),
  ]);
  const [retornos, lista] = await Promise.all([retornosPendentes(db, hoje), listaDeEscritorios(db, agora, escritorios)]);
  const extras: ExtrasDaAtencao = {
    retornos,
    limites: lista.filter((e) => !e.demonstracao && !e.encerrado && e.limites.estado !== "ok").map((e) => ({ organizationId: e.id, estado: e.limites.estado as "perto" | "passou", rotulos: e.limites.rotulos })),
  };
  return montarVisaoGeral({ hoje, escritorios, acessos, ultimosAcessos, marcos, ia, faturas: faturasDoMes, fotos, cotacaoUsd: config.cotacaoUsd, tetos: config.tetos, extras });
}

/* ---------------- A lista com a licença ---------------- */

/** Os escritórios com o resumo da licença: o plano, o que a mensalidade cobra hoje e os limites que passaram de 80%. */
export async function listaDeEscritorios(db: Database, agora = new Date(), jaLidos?: Awaited<ReturnType<typeof escritoriosDaPlataforma>>): Promise<EscritorioNaLista[]> {
  const hoje = hojeEm(FUSO, agora);
  const [escritorios, licencas, todos, padrao, consumo] = await Promise.all([
    jaLidos ?? escritoriosDaPlataforma(db, agora),
    db.select({ id: organization.id, ...colunasDaLicenca }).from(organization),
    lerPlanos(db),
    planoPadrao(db),
    consumoDaPlataforma(db, agora),
  ]);
  const planos = new Map<string, Plano>(todos.map((p) => [p.id, p]));
  const licencaDe = new Map(licencas.map((l) => [l.id, l]));
  return escritorios.map((e) => {
    const l = licencaDe.get(e.id) ?? { planoId: null, pessoasExtras: 0, valorCombinadoCentavos: null, desconto: null, marca: null, tetosIa: null };
    const plano = (l.planoId && planos.get(l.planoId)) || padrao;
    const c = consumo.get(e.id) ?? { processos: 0, oabs: 0, arquivosBytes: 0, whatsappHoje: 0 };
    const uso = montarLicenca({ plano, pessoasExtras: l.pessoasExtras, tetos: l.tetosIa, consumo: { ...c, pessoas: e.pessoas, iaMesUsd: e.iaMesUsd } });
    const preco = precoDoEscritorio(plano, l, hoje);
    return {
      ...e,
      plano: { id: plano.id, nome: plano.nome, versao: plano.versao, antigo: !!plano.substituidoEm },
      marca: l.marca,
      mensalidadeCentavos: preco.mensalidadeCentavos,
      comDesconto: preco.descontoCentavos > 0,
      limites: { estado: uso.estado, alertas: uso.alertas, rotulos: uso.itens.filter((i) => i.estado !== "ok").map((i) => i.rotulo) },
    };
  });
}

/** A foto do dia (os totais de hoje), gravada uma vez por dia pela rotina da noite. Gravar de novo troca a do dia. */
export async function tirarFotoDaPlataforma(db: Database, agora = new Date()): Promise<{ dia: Dia }> {
  const hoje = hojeEm(FUSO, agora);
  const [escritorios, acessos] = await Promise.all([escritoriosDaPlataforma(db, agora), lerAcessos(db, somarDias(hoje, -6), hoje)]);
  await db.execute(sql`select plataforma_gravar_foto(${hoje}::date, ${JSON.stringify(numerosDaFoto(escritorios, acessos, hoje))}::jsonb)`);
  return { dia: hoje };
}

/* ---------------- As pessoas ---------------- */

/** Toda pessoa com conta, com os escritórios de que faz parte. As tabelas da conta não têm RLS (o login as lê antes de saber o escritório). */
export async function pessoasDaPlataforma(db: Database, agora = new Date()): Promise<PessoasDaPlataforma> {
  const hoje = hojeEm(FUSO, agora);
  const [pessoas, vinculos, sessoes, acessos, ultimosAcessos] = await Promise.all([
    db.select({ id: user.id, nome: user.name, email: user.email, emailConfirmado: user.emailVerified, doisFatores: user.twoFactorEnabled, termosVersao: user.termosVersao, criadaEm: user.createdAt, suspensaEm: user.suspensaEm }).from(user),
    db.select({ userId: member.userId, papel: member.role, id: organization.id, nome: organization.name, slug: organization.slug, encerradoEm: organization.encerradoEm }).from(member).innerJoin(organization, eq(organization.id, member.organizationId)),
    db.select({ userId: session.userId, n: count() }).from(session).where(gt(session.expiresAt, agora)).groupBy(session.userId),
    lerAcessos(db, somarDias(hoje, -29), hoje),
    lerUltimosAcessos(db),
  ]);
  const abertas = new Map(sessoes.map((s) => [s.userId, Number(s.n)]));
  const escritoriosDe = new Map<string, PessoaCrua["escritorios"]>();
  for (const v of vinculos) {
    if (v.encerradoEm) continue;
    escritoriosDe.set(v.userId, [...(escritoriosDe.get(v.userId) ?? []), { id: v.id, nome: v.nome, papel: v.papel, demonstracao: v.slug === SLUG_DA_DEMONSTRACAO }]);
  }
  const cruas: PessoaCrua[] = pessoas.map((p) => ({
    id: p.id,
    nome: p.nome,
    email: p.email,
    emailConfirmado: p.emailConfirmado,
    doisFatores: !!p.doisFatores,
    termosVersao: p.termosVersao,
    criadaEm: p.criadaEm.toISOString(),
    sessoesAbertas: abertas.get(p.id) ?? 0,
    escritorios: escritoriosDe.get(p.id) ?? [],
    suspensa: !!p.suspensaEm,
  }));
  return montarPessoas({ hoje, pessoas: cruas, acessos, ultimosAcessos, versaoDosTermos: VERSAO_DOS_TERMOS });
}

export const ACOES_NA_PESSOA = ["encerrar_sessoes", "nova_senha", "confirmar_email", "desligar_2fa", "suspender", "reativar"] as const;
export type AcaoNaPessoa = (typeof ACOES_NA_PESSOA)[number];

/** As ações que precisam do motivo escrito: mexem na segurança da conta ou tiram a pessoa do Decreta. */
const PEDEM_MOTIVO = new Set<AcaoNaPessoa>(["desligar_2fa", "suspender"]);

/**
 * Uma ação sobre a conta de uma pessoa, sempre na auditoria da plataforma:
 *  - encerrar_sessoes: tira a pessoa de todos os aparelhos (perdeu o celular, saiu do escritório);
 *  - nova_senha: manda o link de criar senha nova para o e-mail dela. A equipe nunca vê nem define a senha;
 *  - confirmar_email: manda de novo o link de confirmar o e-mail;
 *  - desligar_2fa: para quem perdeu o aplicativo, só depois de conferir a identidade fora do sistema (o motivo diz como);
 *  - suspender / reativar: por abuso, só a pessoa sai (as sessões caem e ela não entra), sem mexer no resto do escritório.
 * `nova_senha` e `confirmar_email` dependem do e-mail ligado no servidor. A conta de um operador e a da demonstração não
 * perdem o 2FA nem são suspensas por aqui.
 */
export async function agirNaPessoa(
  deps: {
    db: Database;
    auth: { api: { requestPasswordReset: (a: { body: { email: string; redirectTo?: string } }) => Promise<unknown>; sendVerificationEmail: (a: { body: { email: string; callbackURL?: string } }) => Promise<unknown> } };
    emailLigado: boolean;
    telas: string;
    log?: Log;
    /** Os e-mails dos operadores: as contas deles não perdem o 2FA nem são suspensas pelo painel. */
    operadores?: ReadonlySet<string>;
    agora?: Date;
  },
  p: { operador: string; userId: string; acao: AcaoNaPessoa; motivo?: string | null },
): Promise<{ sessoesEncerradas?: number }> {
  const [pessoa] = await deps.db.select({ id: user.id, email: user.email, emailConfirmado: user.emailVerified, doisFatores: user.twoFactorEnabled, suspensaEm: user.suspensaEm }).from(user).where(eq(user.id, p.userId));
  if (!pessoa) throw new RecusaDaPlataforma(404, "Pessoa não encontrada.");
  const motivo = p.motivo?.trim() || null;
  if (PEDEM_MOTIVO.has(p.acao) && !motivo) throw new RecusaDaPlataforma(422, p.acao === "desligar_2fa" ? "Diga como a identidade foi conferida fora do sistema." : "Diga o motivo da suspensão.");
  const protegida = deps.operadores?.has(pessoa.email.toLowerCase()) || ehContaDaDemonstracao(pessoa.email);
  if ((p.acao === "desligar_2fa" || p.acao === "suspender") && protegida) throw new RecusaDaPlataforma(409, "A conta de um operador e a da demonstração não mudam por aqui.");
  if ((p.acao === "nova_senha" || p.acao === "confirmar_email") && !deps.emailLigado) throw new RecusaDaPlataforma(409, "O envio de e-mail está desligado no servidor: o link não chegaria.");
  if (p.acao === "confirmar_email" && pessoa.emailConfirmado) throw new RecusaDaPlataforma(409, "O e-mail desta pessoa já está confirmado.");
  if (p.acao === "desligar_2fa" && !pessoa.doisFatores) throw new RecusaDaPlataforma(409, "Esta pessoa não tem a verificação em duas etapas ligada.");
  if (p.acao === "suspender" && pessoa.suspensaEm) throw new RecusaDaPlataforma(409, "Esta pessoa já está suspensa.");
  if (p.acao === "reativar" && !pessoa.suspensaEm) throw new RecusaDaPlataforma(409, "Esta pessoa não está suspensa.");
  const [vinculo] = await deps.db.select({ organizationId: member.organizationId }).from(member).where(eq(member.userId, pessoa.id)).limit(1);
  let resultado: { sessoesEncerradas?: number } = {};
  if (p.acao === "encerrar_sessoes") {
    const apagadas = await deps.db.delete(session).where(eq(session.userId, pessoa.id)).returning({ id: session.id });
    resultado = { sessoesEncerradas: apagadas.length };
  } else if (p.acao === "desligar_2fa") {
    // Como o "desligar" do Better Auth: o segredo e os códigos de reserva somem. As sessões caem, para quem estava com o aparelho perdido sair.
    await deps.db.transaction(async (tx) => {
      await tx.delete(twoFactor).where(eq(twoFactor.userId, pessoa.id));
      await tx.update(user).set({ twoFactorEnabled: false }).where(eq(user.id, pessoa.id));
    });
    const apagadas = await deps.db.delete(session).where(eq(session.userId, pessoa.id)).returning({ id: session.id });
    resultado = { sessoesEncerradas: apagadas.length };
  } else if (p.acao === "suspender") {
    await deps.db.update(user).set({ suspensaEm: deps.agora ?? new Date() }).where(eq(user.id, pessoa.id));
    const apagadas = await deps.db.delete(session).where(eq(session.userId, pessoa.id)).returning({ id: session.id });
    resultado = { sessoesEncerradas: apagadas.length };
  } else if (p.acao === "reativar") {
    await deps.db.update(user).set({ suspensaEm: null }).where(eq(user.id, pessoa.id));
  } else if (p.acao === "nova_senha") {
    await deps.auth.api.requestPasswordReset({ body: { email: pessoa.email, redirectTo: `${deps.telas}/redefinir-senha` } });
  } else {
    await deps.auth.api.sendVerificationEmail({ body: { email: pessoa.email, callbackURL: `${deps.telas}/hoje` } });
  }
  await deps.db.insert(auditoriaDaPlataforma).values({ operador: p.operador, acao: `plataforma.${p.acao === "reativar" ? "reativar_pessoa" : p.acao}`, organizationId: vinculo?.organizationId ?? null, detalhes: { pessoa: pessoa.email, motivo, ...resultado } });
  deps.log?.("ação da plataforma na pessoa", { operador: p.operador, acao: p.acao, userId: pessoa.id });
  return resultado;
}

/* ---------------- O uso e o custo da IA ---------------- */

export async function usoDaPlataforma(db: Database, dias: number, agora = new Date()): Promise<UsoDaPlataforma> {
  const hoje = hojeEm(FUSO, agora);
  const de = somarDias(hoje, 1 - dias);
  const [escritorios, atual, anterior, acessos] = await Promise.all([escritoriosDaPlataforma(db, agora), lerUso(db, de, hoje), lerUso(db, somarDias(de, -dias), somarDias(de, -1)), lerAcessos(db, de, hoje)]);
  const reais = new Set(escritorios.filter((e) => !e.demonstracao && !e.encerrado).map((e) => e.id));
  return montarUso({ periodo: { de, ate: hoje, dias }, reais, ativos: new Set(acessos.map((a) => a.organizationId)), atual, anterior });
}

export async function lerRecusas(db: Database, de: Dia, ate: Dia): Promise<RecusaCrua[]> {
  const [a, b] = intervalo(de, ate);
  const linhas = await db.execute<{ organization_id: string; dia: unknown; motivo: string; total: number }>(sql`select organization_id, dia, motivo, total from plataforma_recusas_ia(${a}::timestamptz, ${b}::timestamptz)`);
  return [...linhas].map((l) => ({ organizationId: l.organization_id, dia: dia(l.dia), motivo: l.motivo, total: Number(l.total) }));
}

export async function custoDaIaDaPlataforma(db: Database, config: ConfigDoPainel, dias: number, agora = new Date()): Promise<CustoDaIaDaPlataforma & { recusas: RecusasDaIa }> {
  const hoje = hojeEm(FUSO, agora);
  const de = somarDias(hoje, 1 - dias);
  const [escritorios, ia, recusas] = await Promise.all([escritoriosDaPlataforma(db, agora), lerIa(db, de, hoje), lerRecusas(db, de, hoje)]);
  return { ...montarCustoDaIa({ hoje, dias, escritorios, ia, cotacaoUsd: config.cotacaoUsd, tetoSiteUsd: config.tetos.siteUsd }), recusas: montarRecusasDaIa({ hoje, dias, escritorios, recusas }) };
}

/* ---------------- As faturas ---------------- */

/** As faturas de um mês ("2026-11"), de todos os escritórios: pela função `plataforma_lista_de_faturas`. */
export async function faturasDaPlataforma(db: Database, mes: string, agora = new Date()): Promise<FaturasDaPlataforma> {
  const hoje = hojeEm(FUSO, agora);
  const inicio = `${mes}-01`;
  const fim = somarDias(`${somarDias(inicio, 32).slice(0, 7)}-01`, -1);
  const [escritorios, linhas] = await Promise.all([
    escritoriosDaPlataforma(db, agora),
    db.execute<{ id: string; organization_id: string; vencimento: unknown; valor_centavos: number; situacao: string; forma: string | null; link: string | null; paga_em: unknown }>(
      sql`select id, organization_id, vencimento, valor_centavos, situacao, forma, link, paga_em from plataforma_lista_de_faturas(${inicio}::date, ${fim}::date)`,
    ),
  ]);
  const lista: FaturaDaLista[] = [...linhas].map((l) => ({ id: l.id, organizationId: l.organization_id, vencimento: dia(l.vencimento), valorCentavos: Number(l.valor_centavos), situacao: l.situacao, forma: texto(l.forma), link: texto(l.link), pagaEm: l.paga_em ? dia(l.paga_em) : null }));
  return montarFaturas({ hoje, mes, escritorios, faturas: lista });
}

/* ---------------- A ficha do escritório ---------------- */

const numero = (v: unknown) => Number(v ?? 0);

/** Tudo o que a equipe precisa saber de um escritório para atender, cobrar e reter, só em totais e datas. */
export async function fichaDoEscritorio(db: Database, organizationId: string, agora = new Date()): Promise<FichaCompleta> {
  const hoje = hojeEm(FUSO, agora);
  const lista = await escritoriosDaPlataforma(db, agora);
  const escritorio = lista.find((e) => e.id === organizationId);
  if (!escritorio) throw new RecusaDaPlataforma(404, "Escritório não encontrado.");
  const semana = new Date(agora.getTime() - 7 * 86_400_000);

  const [dentro, pessoas, acessos, ultimosAcessos, marcos, uso, ia, acoes] = await Promise.all([
    withTenant(db, organizationId, async (tx) => {
      const [org] = await tx.select({ fuso: organization.timezone }).from(organization).where(eq(organization.id, organizationId));
      const conta = async (q: Promise<{ n: unknown }[]>) => numero((await q)[0]?.n);
      const deHoje = instanteLocal(hoje).toISOString();
      const [nProcessos, nClientes, nPublicacoes, nPrazos, nPecas, nConversas, nOabs, docs, lista, ultima, erros, nMonitorados, nManha, nAoCliente] = await Promise.all([
        conta(tx.select({ n: count() }).from(processos)),
        conta(tx.select({ n: count() }).from(clientes)),
        conta(tx.select({ n: count() }).from(publicacoes)),
        conta(tx.select({ n: count() }).from(prazos).where(eq(prazos.situacao, "aberto"))),
        conta(tx.select({ n: count() }).from(pecas)),
        conta(tx.select({ n: count() }).from(conversas)),
        conta(tx.select({ n: count() }).from(equipe).where(isNotNull(equipe.oabNumero))),
        tx.select({ n: count(), bytes: sum(documentos.tamanho) }).from(documentos),
        tx.select({ id: faturas.id, vencimento: faturas.vencimento, valorCentavos: faturas.valorCentavos, situacao: faturas.situacao, pagaEm: faturas.pagaEm, forma: faturas.forma }).from(faturas).orderBy(desc(faturas.vencimento)).limit(24),
        tx.select({ em: capturas.terminadaEm }).from(capturas).where(isNotNull(capturas.terminadaEm)).orderBy(desc(capturas.terminadaEm)).limit(1),
        tx.select({ erro: capturas.erro, em: capturas.iniciadaEm }).from(capturas).where(and(isNotNull(capturas.erro), gte(capturas.iniciadaEm, semana))).orderBy(desc(capturas.iniciadaEm)),
        conta(tx.select({ n: count() }).from(processos).where(inArray(processos.situacao, ["ativo", "suspenso"]))),
        conta(tx.select({ n: count() }).from(avisosEnviados).where(and(eq(avisosEnviados.tipo, "manha"), eq(avisosEnviados.ok, true), eq(avisosEnviados.dia, hoje)))),
        conta(tx.select({ n: count() }).from(mensagensCliente).where(and(inArray(mensagensCliente.situacao, ["enviando", "enviada"]), sql`${mensagensCliente.aprovadaEm} >= ${deHoje}::timestamptz`))),
      ]);
      return {
        fuso: org?.fuso ?? FUSO,
        totais: { processos: nProcessos, clientes: nClientes, publicacoes: nPublicacoes, prazosAbertos: nPrazos, pecas: nPecas, documentos: numero(docs[0]?.n), espacoBytes: numero(docs[0]?.bytes), conversas: nConversas, oabs: nOabs },
        faturas: lista.map((f) => ({ ...f, situacao: String(f.situacao), forma: texto(f.forma) })),
        // Só a primeira linha do erro: o detalhe técnico fica no log do servidor.
        captura: { ultimaEm: ultima[0]?.em ? ultima[0].em.toISOString() : null, errosNaSemana: erros.length, ultimoErro: erros[0]?.erro ? String(erros[0].erro).split("\n")[0]!.slice(0, 200) : null },
        consumo: { processos: nMonitorados, whatsappHoje: nManha + nAoCliente },
      };
    }),
    db
      .select({ id: user.id, nome: user.name, email: user.email, papel: member.role, doisFatores: user.twoFactorEnabled, emailConfirmado: user.emailVerified })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, organizationId)),
    lerAcessos(db, somarDias(hoje, -29), hoje),
    lerUltimosAcessos(db),
    lerMarcos(db),
    lerUso(db, somarDias(hoje, -29), hoje),
    lerIa(db, somarDias(hoje, -29), hoje),
    auditoriaDaPlataformaRecente(db, 500),
  ]);

  const [[linha], todos, padrao, notas] = await Promise.all([
    db.select({ ...colunasDaLicenca, linkId: organization.asaasLinkId, assinaturaId: organization.asaasAssinaturaId }).from(organization).where(eq(organization.id, organizationId)),
    lerPlanos(db),
    planoPadrao(db),
    notasDoEscritorio(db, organizationId),
  ]);
  const plano = (linha?.planoId && todos.find((p) => p.id === linha.planoId)) || padrao;
  const iaMes = ia.filter((i) => i.organizationId === organizationId && i.dia >= `${hoje.slice(0, 7)}-01`).reduce((t, i) => t + i.custoUsd, 0);
  const consumo = { pessoas: pessoas.length, processos: dentro.consumo.processos, oabs: dentro.totais.oabs, iaMesUsd: iaMes, arquivosBytes: dentro.totais.espacoBytes, whatsappHoje: dentro.consumo.whatsappHoje };
  const licenca = montarLicencaCompleta(plano, linha ?? { planoId: null, pessoasExtras: 0, valorCombinadoCentavos: null, desconto: null, marca: null, tetosIa: null }, consumo, hoje);
  const planos = todos.filter((p) => !p.substituidoEm || p.id === plano.id).map((p) => ({ id: p.id, nome: p.nome, versao: p.versao, mensalCentavos: p.mensalCentavos, vivo: !p.substituidoEm }));

  const ficha = montarFicha({
    hoje,
    escritorio,
    fuso: dentro.fuso,
    totais: dentro.totais,
    pessoas: pessoas.map((p) => ({ ...p, doisFatores: !!p.doisFatores })),
    acessos,
    ultimosAcessos,
    marcos,
    faturas: dentro.faturas,
    uso,
    ia,
    captura: dentro.captura,
    acoes,
  });
  return { ...ficha, licenca, notas, planos, cobranca: { linkGuardado: !!linha?.linkId, assinaturaViva: !!linha?.assinaturaId } };
}

/** Para o 2FA obrigatório do painel: a pessoa ligou o 2FA e ele está confirmado. */
export async function temDoisFatores(db: Database, userId: string): Promise<boolean> {
  const [linha] = await db.select({ ligado: user.twoFactorEnabled }).from(user).where(eq(user.id, userId));
  if (!linha?.ligado) return false;
  const [segredo] = await db.select({ verificado: twoFactor.verified }).from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  return !!segredo && segredo.verificado !== false;
}
