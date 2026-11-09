/**
 * Os planos, a licença de cada escritório, os cupons e as notas da equipe (ver `@decreta/core/plano.ts`).
 *
 * Os planos são do Decreta, não de um escritório: a tabela não tem RLS, como a `organization`, e só o painel da
 * plataforma grava. Uma versão nunca muda: mudar o preço grava a versão seguinte. Quem ainda não assina passa
 * para a versão nova na hora; quem assina fica na que assinou até a equipe mudar de propósito.
 *
 * Os cupons e as notas têm RLS que só deixa ler e gravar fora de um escritório: as rotas das telas não os
 * enxergam nem por engano. Tudo o que muda aqui fica na auditoria da plataforma.
 */
import {
  descontoDoCupom,
  hojeEm,
  instanteLocal,
  limiteDoPlano,
  montarLicencaCompleta,
  normalizarCodigoDoCupom,
  PLANO_INICIAL,
  recusaDoCupom,
  somarDias,
  type ConsumoDoEscritorio,
  type Cupom,
  type Dia,
  type DescontoDoEscritorio,
  type FuncionalidadesDoPlano,
  type LicencaCompleta,
  type LimitesDoPlano,
  type LinhaDaLicenca,
  type NotaDaEquipe,
  type Plano,
} from "@decreta/core";
import { auditoriaDaPlataforma, avisosEnviados, cupons, documentos, equipe, member, mensagensCliente, notasDaPlataforma, organization, planos, processos, usoIa, withTenant, type Database, type Tx } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { RecusaDaPlataforma } from "./plataforma.ts";

/* ---------------- Os planos ---------------- */

type LinhaDoPlano = typeof planos.$inferSelect;

export const planoDaLinha = (l: LinhaDoPlano): Plano => ({
  id: l.id,
  codigo: l.codigo,
  versao: l.versao,
  nome: l.nome,
  mensalCentavos: l.mensalCentavos,
  anualCentavos: l.anualCentavos,
  pessoasIncluidas: l.pessoasIncluidas,
  pessoaExtraCentavos: l.pessoaExtraCentavos,
  limites: l.limites ?? {},
  funcionalidades: l.funcionalidades ?? {},
  padrao: l.padrao,
  criadoEm: l.criadoEm.toISOString(),
  criadoPor: l.criadoPor,
  substituidoEm: l.substituidoEm?.toISOString() ?? null,
});

/** Sem nenhum plano no banco (não acontece depois da migração 0035): o plano de sempre, sem preço. */
const PLANO_DE_RESERVA: Plano = { id: "", versao: 1, padrao: true, criadoEm: new Date(0).toISOString(), criadoPor: null, substituidoEm: null, ...PLANO_INICIAL, limites: {}, funcionalidades: {} };

/** Todos os planos, cada um com as versões (a viva primeiro). */
export async function lerPlanos(db: Database | Tx): Promise<Plano[]> {
  return (await db.select().from(planos).orderBy(asc(planos.codigo), desc(planos.versao))).map(planoDaLinha);
}

export async function planoPadrao(db: Database | Tx): Promise<Plano> {
  const [l] = await db.select().from(planos).where(and(eq(planos.padrao, true), isNull(planos.substituidoEm))).limit(1);
  return l ? planoDaLinha(l) : PLANO_DE_RESERVA;
}

/** O plano de um escritório: a versão em que ele está, ou o padrão. */
export async function planoDaLicenca(db: Database | Tx, planoId: string | null): Promise<Plano> {
  if (planoId) {
    const [l] = await db.select().from(planos).where(eq(planos.id, planoId));
    if (l) return planoDaLinha(l);
  }
  return planoPadrao(db);
}

export interface DadosDoPlano {
  nome: string;
  mensalCentavos: number | null;
  anualCentavos: number | null;
  pessoasIncluidas: number | null;
  pessoaExtraCentavos: number | null;
  limites: LimitesDoPlano;
  funcionalidades: FuncionalidadesDoPlano;
}

const resumoDoPlano = (p: Pick<Plano, "nome" | "versao" | "mensalCentavos" | "anualCentavos" | "pessoasIncluidas" | "pessoaExtraCentavos" | "limites" | "funcionalidades">) => ({
  nome: p.nome,
  versao: p.versao,
  mensalCentavos: p.mensalCentavos,
  anualCentavos: p.anualCentavos,
  pessoasIncluidas: p.pessoasIncluidas,
  pessoaExtraCentavos: p.pessoaExtraCentavos,
  limites: p.limites,
  funcionalidades: p.funcionalidades,
});

const codigoDoNome = (nome: string) =>
  nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "plano";

/** Um plano novo, na versão 1. Nasce sem ser o padrão: o escritório novo continua no padrão até a equipe trocar. */
export async function criarPlano(db: Database, operador: string, dados: DadosDoPlano): Promise<Plano> {
  return db.transaction(async (tx) => {
    const base = codigoDoNome(dados.nome);
    const existentes = new Set((await tx.select({ codigo: planos.codigo }).from(planos)).map((p) => p.codigo));
    let codigo = base;
    for (let n = 2; existentes.has(codigo); n++) codigo = `${base}-${n}`;
    const [l] = await tx.insert(planos).values({ codigo, versao: 1, ...dados, criadoPor: operador }).returning();
    const plano = planoDaLinha(l!);
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.plano_criado", detalhes: { codigo, para: resumoDoPlano(plano) } });
    return plano;
  });
}

/**
 * Muda um plano: grava a versão seguinte e aposenta a de agora. Quem ainda não assina (sem assinatura no Asaas e sem
 * nunca ter pago) passa para a versão nova; quem assina continua na antiga. Só a versão viva muda.
 */
export async function mudarPlano(db: Database, operador: string, planoId: string, dados: DadosDoPlano, agora = new Date()): Promise<{ plano: Plano; passaram: number; ficaram: number }> {
  return db.transaction(async (tx) => {
    const [atual] = await tx.select().from(planos).where(eq(planos.id, planoId)).for("update");
    if (!atual) throw new RecusaDaPlataforma(404, "Plano não encontrado.");
    if (atual.substituidoEm) throw new RecusaDaPlataforma(409, "Esta versão já foi substituída. Mude a versão mais nova do plano.");
    // Sai do índice do padrão antes de a nova entrar nele.
    await tx.update(planos).set({ substituidoEm: agora }).where(eq(planos.id, atual.id));
    const [nova] = await tx
      .insert(planos)
      .values({ codigo: atual.codigo, versao: atual.versao + 1, ...dados, padrao: atual.padrao, criadoPor: operador, criadoEm: agora })
      .returning();
    const passaram = await tx
      .update(organization)
      .set({ planoId: nova!.id })
      .where(and(eq(organization.planoId, atual.id), isNull(organization.asaasAssinaturaId), isNull(organization.assinouEm)))
      .returning({ id: organization.id });
    const [{ ficaram }] = (await tx.select({ ficaram: sql<number>`count(*)::int` }).from(organization).where(eq(organization.planoId, atual.id))) as [{ ficaram: number }];
    const plano = planoDaLinha(nova!);
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.plano_mudado", detalhes: { codigo: atual.codigo, de: resumoDoPlano(planoDaLinha(atual)), para: resumoDoPlano(plano), passaram: passaram.length, ficaram } });
    return { plano, passaram: passaram.length, ficaram };
  });
}

/** O plano com que o escritório novo começa. Os que já existem não mudam. */
export async function tornarPadrao(db: Database, operador: string, planoId: string): Promise<Plano> {
  return db.transaction(async (tx) => {
    const [alvo] = await tx.select().from(planos).where(eq(planos.id, planoId)).for("update");
    if (!alvo) throw new RecusaDaPlataforma(404, "Plano não encontrado.");
    if (alvo.substituidoEm) throw new RecusaDaPlataforma(409, "Esta versão já foi substituída. Escolha a versão mais nova do plano.");
    if (alvo.padrao) throw new RecusaDaPlataforma(409, "Este já é o plano padrão.");
    const [antes] = await tx.update(planos).set({ padrao: false }).where(and(eq(planos.padrao, true), isNull(planos.substituidoEm))).returning({ nome: planos.nome });
    const [l] = await tx.update(planos).set({ padrao: true }).where(eq(planos.id, alvo.id)).returning();
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.plano_padrao", detalhes: { de: antes?.nome ?? null, para: alvo.nome } });
    return planoDaLinha(l!);
  });
}

/** Quantos escritórios (fora a demonstração e os encerrados) estão em cada versão de plano, e quantos deles assinam. */
export async function escritoriosPorPlano(db: Database, padraoId: string, demonstracao: string): Promise<Map<string, { escritorios: number; assinantes: number }>> {
  const linhas = await db
    .select({ planoId: organization.planoId, escritorios: sql<number>`count(*)::int`, assinantes: sql<number>`count(*) filter (where ${organization.asaasAssinaturaId} is not null or ${organization.assinouEm} is not null)::int` })
    .from(organization)
    .where(and(isNull(organization.encerradoEm), sql`${organization.slug} <> ${demonstracao}`))
    .groupBy(organization.planoId);
  const m = new Map<string, { escritorios: number; assinantes: number }>();
  for (const l of linhas) {
    const id = l.planoId ?? padraoId;
    const antes = m.get(id) ?? { escritorios: 0, assinantes: 0 };
    m.set(id, { escritorios: antes.escritorios + Number(l.escritorios), assinantes: antes.assinantes + Number(l.assinantes) });
  }
  return m;
}

/* ---------------- A licença de cada escritório ---------------- */

/** As colunas da licença na `organization`. */
export const colunasDaLicenca = {
  planoId: organization.planoId,
  pessoasExtras: organization.pessoasExtras,
  valorCombinadoCentavos: organization.valorCombinadoCentavos,
  desconto: organization.desconto,
  marca: organization.marca,
  tetosIa: organization.tetosIa,
};

export type { LicencaCompleta, LinhaDaLicenca, NotaDaEquipe };

/* ---------------- Os cupons ---------------- */

type LinhaDoCupom = typeof cupons.$inferSelect;

const cupomDaLinha = (l: LinhaDoCupom): Cupom => ({
  id: l.id,
  codigo: l.codigo,
  tipo: l.tipo,
  valor: l.valor,
  meses: l.meses,
  validoAte: l.validoAte,
  limiteDeUsos: l.limiteDeUsos,
  usos: l.usos,
  nota: l.nota,
  criadoPor: l.criadoPor,
  criadoEm: l.criadoEm.toISOString(),
  desativadoEm: l.desativadoEm?.toISOString() ?? null,
});

export async function lerCupons(db: Database): Promise<Cupom[]> {
  return (await db.select().from(cupons).orderBy(desc(cupons.criadoEm))).map(cupomDaLinha);
}

export interface DadosDoCupom {
  codigo: string;
  tipo: "percentual" | "valor";
  valor: number;
  meses: number;
  validoAte: Dia | null;
  limiteDeUsos: number | null;
  nota: string | null;
}

export async function criarCupom(db: Database, operador: string, dados: DadosDoCupom): Promise<Cupom> {
  const codigo = normalizarCodigoDoCupom(dados.codigo);
  if (!/^[A-Z0-9_-]{3,30}$/.test(codigo)) throw new RecusaDaPlataforma(422, "O código do cupom tem de 3 a 30 letras, números, - ou _.");
  if (dados.tipo === "percentual" && (dados.valor < 1 || dados.valor > 100)) throw new RecusaDaPlataforma(422, "O percentual vai de 1 a 100.");
  return db.transaction(async (tx) => {
    const [l] = await tx
      .insert(cupons)
      .values({ ...dados, codigo, criadoPor: operador })
      .onConflictDoNothing({ target: cupons.codigo })
      .returning();
    if (!l) throw new RecusaDaPlataforma(409, "Já existe um cupom com este código.");
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.cupom_criado", detalhes: { codigo, tipo: dados.tipo, valor: dados.valor, meses: dados.meses, validoAte: dados.validoAte, limiteDeUsos: dados.limiteDeUsos } });
    return cupomDaLinha(l);
  });
}

export async function desativarCupom(db: Database, operador: string, id: string, agora = new Date()): Promise<Cupom> {
  return db.transaction(async (tx) => {
    const [l] = await tx.update(cupons).set({ desativadoEm: agora }).where(and(eq(cupons.id, id), isNull(cupons.desativadoEm))).returning();
    if (!l) throw new RecusaDaPlataforma(404, "Cupom não encontrado ou já desativado.");
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.cupom_desativado", detalhes: { codigo: l.codigo } });
    return cupomDaLinha(l);
  });
}

/**
 * Gasta um uso do cupom e devolve o desconto que ele dá a partir de hoje. A conta do uso é feita no próprio `update`,
 * para dois escritórios no mesmo instante não passarem do limite. Chamado dentro da transação de quem aplica.
 */
export async function usarCupom(tx: Tx, codigo: string, hoje: Dia): Promise<DescontoDoEscritorio> {
  const normalizado = normalizarCodigoDoCupom(codigo);
  const [l] = await tx.select().from(cupons).where(eq(cupons.codigo, normalizado));
  if (!l) throw new RecusaDaPlataforma(404, "Não existe cupom com este código.");
  const recusa = recusaDoCupom(cupomDaLinha(l), hoje);
  if (recusa) throw new RecusaDaPlataforma(409, recusa);
  const [gasto] = await tx
    .update(cupons)
    .set({ usos: sql`${cupons.usos} + 1` })
    .where(and(eq(cupons.id, l.id), isNull(cupons.desativadoEm), sql`(${cupons.limiteDeUsos} is null or ${cupons.usos} < ${cupons.limiteDeUsos})`))
    .returning({ id: cupons.id });
  if (!gasto) throw new RecusaDaPlataforma(409, "Este cupom já foi usado o número de vezes combinado.");
  return descontoDoCupom(cupomDaLinha(l), hoje);
}

/* ---------------- As notas da equipe ---------------- */

const notaDaLinha = (l: typeof notasDaPlataforma.$inferSelect): NotaDaEquipe => ({
  id: l.id,
  operador: l.operador,
  texto: l.texto,
  contato: l.contato,
  proximoPasso: l.proximoPasso,
  retornoEm: l.retornoEm,
  retornoFeitoEm: l.retornoFeitoEm?.toISOString() ?? null,
  criadaEm: l.criadaEm.toISOString(),
});

export async function notasDoEscritorio(db: Database, organizationId: string): Promise<NotaDaEquipe[]> {
  return (await db.select().from(notasDaPlataforma).where(eq(notasDaPlataforma.organizationId, organizationId)).orderBy(desc(notasDaPlataforma.criadaEm))).map(notaDaLinha);
}

export async function criarNota(db: Database, operador: string, organizationId: string, dados: { texto: string; contato: string | null; proximoPasso: string | null; retornoEm: Dia | null }): Promise<NotaDaEquipe> {
  const [o] = await db.select({ id: organization.id }).from(organization).where(eq(organization.id, organizationId));
  if (!o) throw new RecusaDaPlataforma(404, "Escritório não encontrado.");
  return db.transaction(async (tx) => {
    const [l] = await tx.insert(notasDaPlataforma).values({ organizationId, operador, ...dados }).returning();
    // A auditoria guarda que houve nota e o retorno marcado, não o texto: a nota é lida na ficha.
    await tx.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.nota", organizationId, detalhes: { retornoEm: dados.retornoEm } });
    return notaDaLinha(l!);
  });
}

export async function marcarRetornoFeito(db: Database, operador: string, notaId: string, agora = new Date()): Promise<NotaDaEquipe> {
  const [l] = await db.update(notasDaPlataforma).set({ retornoFeitoEm: agora }).where(and(eq(notasDaPlataforma.id, notaId), isNull(notasDaPlataforma.retornoFeitoEm))).returning();
  if (!l) throw new RecusaDaPlataforma(404, "Nota não encontrada, ou o retorno já foi feito.");
  await db.insert(auditoriaDaPlataforma).values({ operador, acao: "plataforma.retorno_feito", organizationId: l.organizationId, detalhes: { retornoEm: l.retornoEm } });
  return notaDaLinha(l);
}

/** Os retornos marcados para hoje ou antes e ainda não feitos: entram em "Precisa de atenção hoje". */
export async function retornosPendentes(db: Database, hoje: Dia): Promise<{ organizationId: string; retornoEm: Dia; proximoPasso: string | null }[]> {
  const linhas = await db
    .select({ organizationId: notasDaPlataforma.organizationId, retornoEm: notasDaPlataforma.retornoEm, proximoPasso: notasDaPlataforma.proximoPasso })
    .from(notasDaPlataforma)
    .where(and(isNull(notasDaPlataforma.retornoFeitoEm), sql`${notasDaPlataforma.retornoEm} <= ${hoje}::date`))
    .orderBy(asc(notasDaPlataforma.retornoEm));
  return linhas.map((l) => ({ organizationId: l.organizationId, retornoEm: l.retornoEm!, proximoPasso: l.proximoPasso }));
}

/* ---------------- O consumo de um escritório ---------------- */

/** O que um escritório usa contra os limites do plano, lido dentro dele (a tela do Plano e a ficha). */
/** As mensagens de WhatsApp que o escritório já mandou hoje: o resumo da manhã que saiu e as mensagens aos clientes aprovadas. Dentro do escritório. */
export async function whatsappDeHoje(tx: Tx, hoje: Dia): Promise<number> {
  const de = instanteLocal(hoje).toISOString();
  const ate = instanteLocal(somarDias(hoje, 1)).toISOString();
  const [[manha], [clientes]] = await Promise.all([
    tx.select({ n: sql<number>`count(*)::int` }).from(avisosEnviados).where(and(eq(avisosEnviados.tipo, "manha"), eq(avisosEnviados.ok, true), eq(avisosEnviados.dia, hoje))),
    tx.select({ n: sql<number>`count(*)::int` }).from(mensagensCliente).where(and(inArray(mensagensCliente.situacao, ["enviando", "enviada"]), sql`${mensagensCliente.aprovadaEm} >= ${de}::timestamptz`, sql`${mensagensCliente.aprovadaEm} < ${ate}::timestamptz`)),
  ]);
  return Number(manha?.n ?? 0) + Number(clientes?.n ?? 0);
}

/**
 * Quantas mensagens de WhatsApp ainda cabem hoje no plano do escritório, ou nulo sem limite. Mandar WhatsApp é custo
 * novo: passar do limite para o envio (o resto do trabalho continua). `tx` é a transação dentro do escritório.
 */
export async function whatsappQueResta(db: Database, tx: Tx, organizationId: string, hoje: Dia): Promise<number | null> {
  const [l] = await db.select({ planoId: organization.planoId }).from(organization).where(eq(organization.id, organizationId));
  const limite = limiteDoPlano(await planoDaLicenca(db, l?.planoId ?? null), "whatsappDia");
  if (limite === null) return null;
  return Math.max(0, limite - (await whatsappDeHoje(tx, hoje)));
}

export const AVISO_DO_LIMITE_DE_WHATSAPP = "O escritório chegou ao limite de mensagens de WhatsApp de hoje no plano. Amanhã o envio volta; para aumentar o limite, fale com a equipe do Decreta.";

export async function consumoDoEscritorio(db: Database, organizationId: string, agora = new Date()): Promise<ConsumoDoEscritorio> {
  const hoje = hojeEm("America/Sao_Paulo", agora);
  const doMes = instanteLocal(`${hoje.slice(0, 7)}-01`).toISOString();
  const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(member).where(eq(member.organizationId, organizationId));
  const dentro = await withTenant(db, organizationId, async (tx) => {
    const um = async <T>(q: Promise<T[]>) => (await q)[0];
    const [proc, oabs, arquivos, whatsappHoje, ia] = await Promise.all([
      um(tx.select({ n: sql<number>`count(*)::int` }).from(processos).where(inArray(processos.situacao, ["ativo", "suspenso"]))),
      um(tx.select({ n: sql<number>`count(*)::int` }).from(equipe).where(isNotNull(equipe.oabNumero))),
      um(tx.select({ n: sql<number>`coalesce(sum(${documentos.tamanho}), 0)::float8` }).from(documentos)),
      whatsappDeHoje(tx, hoje),
      um(tx.select({ n: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)::float8` }).from(usoIa).where(sql`${usoIa.em} >= ${doMes}::timestamptz`)),
    ]);
    return { processos: Number(proc?.n ?? 0), oabs: Number(oabs?.n ?? 0), arquivosBytes: Number(arquivos?.n ?? 0), whatsappHoje, iaMesUsd: Number(ia?.n ?? 0) };
  });
  return { pessoas: Number(n?.n ?? 0), ...dentro };
}

/** O consumo de todos os escritórios, pela função `plataforma_consumo` (só totais). O gasto de IA do mês e as pessoas vêm da lista. */
export async function consumoDaPlataforma(db: Database, agora = new Date()): Promise<Map<string, Omit<ConsumoDoEscritorio, "pessoas" | "iaMesUsd">>> {
  const hoje = hojeEm("America/Sao_Paulo", agora);
  const de = instanteLocal(hoje).toISOString();
  const ate = instanteLocal(somarDias(hoje, 1)).toISOString();
  const linhas = await db.execute<{ organization_id: string; processos: number; oabs: number; arquivos_bytes: string | number; whatsapp_hoje: number }>(
    sql`select organization_id, processos, oabs, arquivos_bytes, whatsapp_hoje from plataforma_consumo(${hoje}::date, ${de}::timestamptz, ${ate}::timestamptz)`,
  );
  return new Map([...linhas].map((l) => [l.organization_id, { processos: Number(l.processos), oabs: Number(l.oabs), arquivosBytes: Number(l.arquivos_bytes), whatsappHoje: Number(l.whatsapp_hoje) }]));
}

/** A licença completa de um escritório, para a ficha do painel e a tela do Plano. */
export async function licencaDoEscritorio(db: Database, organizationId: string, agora = new Date()): Promise<LicencaCompleta | null> {
  const [l] = await db.select(colunasDaLicenca).from(organization).where(eq(organization.id, organizationId));
  if (!l) return null;
  const [plano, consumo] = await Promise.all([planoDaLicenca(db, l.planoId), consumoDoEscritorio(db, organizationId, agora)]);
  return montarLicencaCompleta(plano, l, consumo, hojeEm("America/Sao_Paulo", agora));
}
