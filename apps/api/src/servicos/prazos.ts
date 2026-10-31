/**
 * Prazos: a sugestão da IA a partir da publicação, a confirmação por uma
 * pessoa e a recontagem quando alguém ajusta.
 *
 * A sugestão já cria o prazo, marcado "Confirmar sugestão": assim um prazo
 * nunca some só porque ninguém abriu a publicação. A data final é sempre a do
 * motor de prazos (ou a que a pessoa digitou), nunca a da IA.
 */
import {
  chaveDoAto,
  conferirSugestao,
  contarComDoisMarcos,
  contarPrazo,
  explicarContagem,
  regraDaContagem,
  ritoDoProcesso,
  textoDaTempestividade,
  type Calendario,
  type Conferencia,
  type Contagem,
  type Dia,
  type ResultadoDaContagem,
  type Rito,
} from "@decreta/core";
import { analises, prazos, processos, publicacoes, withTenant, type Database, type Tx } from "@decreta/db";
import { impressao, sugerirPrazo, type Ia, type SugestaoDePrazo } from "@decreta/ia";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { analisar, type AnaliseNaTela } from "./analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "./calendario.ts";
import { contextoParaIa } from "./contexto.ts";

export interface ContagemNaTela {
  publicacao: string;
  inicio: string;
  fim: string;
  dias: number;
  contagem: Contagem;
  desconsiderados: { dia: string; nome: string; tipo: string }[];
  prorrogadoDe: string | null;
  explicacao: string;
}

export function contagemNaTela(r: ResultadoDaContagem): ContagemNaTela {
  return {
    publicacao: r.publicacao,
    inicio: r.inicio,
    fim: r.fim,
    dias: r.dias,
    contagem: r.contagem,
    desconsiderados: r.desconsiderados.map((f) => ({ dia: f.dia, nome: f.nome, tipo: f.tipo })),
    prorrogadoDe: r.prorrogadoDe,
    explicacao: explicarContagem(r),
  };
}

export interface RegrasDoProcesso {
  cal: Calendario;
  rito: Rito;
  /** "TJSC, com os feriados cadastrados para a comarca de Joinville": o calendário que a conta usou. */
  calendario: string;
}

/** O calendário (tribunal e comarca do processo) e a lei que rege a contagem. Sem processo, o tribunal da publicação ou o do escritório. */
export async function regrasDoProcesso(tx: Tx, organizationId: string, processoId: string | null, tribunalDaPublicacao?: string | null): Promise<RegrasDoProcesso> {
  const [p] = processoId ? await tx.select({ tribunal: processos.tribunal, comarca: processos.comarca, classe: processos.classe, orgao: processos.orgao }).from(processos).where(eq(processos.id, processoId)) : [];
  const tribunal = p?.tribunal ?? tribunalDaPublicacao ?? (await tribunalPadrao(tx, organizationId));
  const comarca = p?.comarca ?? null;
  return {
    cal: await calendarioDoEscritorio(tx, tribunal, comarca),
    rito: ritoDoProcesso({ tribunal, classe: p?.classe, orgao: p?.orgao }),
    calendario: comarca ? `${tribunal}, com os feriados cadastrados para a comarca de ${comarca}` : tribunal,
  };
}

export interface ContaDoProcesso extends ResultadoDaContagem {
  /** De que marco saiu a conta que vale (dupla intimação: o que vence primeiro). */
  pelo: "publicacao" | "sistema";
  /** A conta pelo outro marco, quando houve intimação pelo sistema também. */
  outra: ResultadoDaContagem | null;
  regras: RegrasDoProcesso;
}

/** Conta o prazo no calendário do tribunal e da comarca do processo, pelos dois marcos quando houver intimação pelo sistema. */
export async function contarParaProcesso(
  tx: Tx,
  organizationId: string,
  processoId: string | null,
  pedido: { publicacao: Dia; dias: number; contagem: Contagem; intimacaoNoSistema?: Dia | null },
): Promise<ContaDoProcesso> {
  const regras = await regrasDoProcesso(tx, organizationId, processoId);
  const c = contarComDoisMarcos({ ...pedido, intimacaoNoSistema: pedido.intimacaoNoSistema ?? null, calendario: regras.cal });
  return { ...c.conta, pelo: c.pelo, outra: c.outra, regras };
}

/**
 * A conta do prazo como está gravado, para a ficha e para a peça: os marcos, a
 * regra, o calendário e a tempestividade. Reconta com o calendário de hoje:
 * se der outra data (feriado cadastrado depois), `pelaConta` diz qual.
 */
export async function contaDoPrazo(tx: Tx, organizationId: string, prazo: typeof prazos.$inferSelect) {
  const regras = await regrasDoProcesso(tx, organizationId, prazo.processoId);
  const [pub] = prazo.publicacaoId ? await tx.select({ disponibilizadaEm: publicacoes.disponibilizadaEm, tipoDocumento: publicacoes.tipoDocumento, certidao: publicacoes.certidao }).from(publicacoes).where(eq(publicacoes.id, prazo.publicacaoId)) : [];
  const c = contarComDoisMarcos({ publicacao: prazo.publicadoEm, intimacaoNoSistema: prazo.intimadoNoSistemaEm, dias: prazo.dias, contagem: prazo.contagem, calendario: regras.cal });
  const pelaConta = c.conta.fim !== prazo.fim ? c.conta.fim : null;
  const disponibilizadaEm = pub?.disponibilizadaEm ?? null;
  // Só a certidão já guardada (a captura guarda logo): com o hash apenas, o DJEN pode não ter a certidão, e o tópico citaria um anexo que não existe.
  const comCertidao = !!pub?.certidao;
  return {
    rito: regras.rito,
    documento: pub?.tipoDocumento ?? null,
    regra: regraDaContagem(regras.rito, prazo.contagem),
    calendario: regras.calendario,
    disponibilizadaEm,
    publicadoEm: prazo.publicadoEm,
    intimadoNoSistemaEm: prazo.intimadoNoSistemaEm,
    pelo: c.pelo,
    outra: c.outra && { inicio: c.outra.inicio, fim: c.outra.fim },
    inicio: prazo.inicio,
    fim: prazo.fim,
    desconsiderados: c.conta.desconsiderados.map((f) => ({ dia: f.dia, nome: f.nome, tipo: f.tipo })),
    prorrogadoDe: c.conta.prorrogadoDe,
    explicacao: explicarContagem(c.conta),
    fimDigitado: prazo.fimDigitado,
    pelaConta,
    /** A publicação cuja certidão do DJEN o tópico cita como anexa. */
    certidaoDe: comCertidao ? prazo.publicacaoId : null,
    // A peça argumenta pelo DJEN (Res. CNJ 455/2022, art. 11, § 3º). Data digitada ou conta que mudou: a pessoa confere antes.
    tempestividade: prazo.fimDigitado || pelaConta ? null : textoDaTempestividade(c.pelo === "publicacao" ? c.conta : c.outra!, { rito: regras.rito, disponibilizacao: disponibilizadaEm, certidao: comCertidao }),
  };
}

/** O que a equipe fez com as sugestões da IA: prazos confirmados ou descartados e publicações marcadas "Não gera prazo" quando a IA dizia que gerava. */
export async function historicoDasSugestoes(tx: Tx): Promise<{ chave: string; descartada: boolean }[]> {
  const doPrazo = await tx
    .select({ tipo: prazos.tipo, situacao: prazos.situacao, confirmadoEm: prazos.confirmadoEm })
    .from(prazos)
    .where(eq(prazos.origem, "ia"))
    .orderBy(desc(prazos.updatedAt))
    .limit(300);
  const semPrazo = await tx
    .selectDistinctOn([analises.alvoId], { tipo: sql<string>`${analises.conteudo}->>'tipo'` })
    .from(analises)
    .innerJoin(publicacoes, eq(publicacoes.id, analises.alvoId))
    .leftJoin(prazos, eq(prazos.publicacaoId, publicacoes.id))
    .where(and(eq(analises.acao, "sugerir-prazo"), eq(publicacoes.situacao, "lida"), isNull(prazos.id), sql`(${analises.conteudo}->>'geraPrazo')::boolean`))
    .orderBy(analises.alvoId, desc(analises.createdAt))
    .limit(300);
  return [
    ...doPrazo.filter((p) => p.situacao === "descartado" || p.confirmadoEm).map((p) => ({ chave: chaveDoAto(p.tipo), descartada: p.situacao === "descartado" })),
    ...semPrazo.filter((p) => p.tipo).map((p) => ({ chave: chaveDoAto(p.tipo), descartada: true })),
  ];
}

/** A segunda conferência da sugestão, com o que a equipe já fez com o mesmo ato. */
export function conferir(s: { tipo: string; dias: number; contagem: Contagem; rito: Rito; documento: string | null }, historico: { chave: string; descartada: boolean }[]): Conferencia {
  const mesmos = historico.filter((h) => h.chave === chaveDoAto(s.tipo));
  return conferirSugestao({ ...s, historico: { descartadas: mesmos.filter((h) => h.descartada).length, confirmadas: mesmos.filter((h) => !h.descartada).length } });
}

export interface SugestaoNaTela extends SugestaoDePrazo {
  contagemCalculada: ContagemNaTela | null;
  /** "Dias úteis (CPC, art. 219)". */
  regra: string | null;
  /** A segunda conferência: os dias batem com a lei, o ato combina com o documento, a equipe costuma descartar. */
  conferencia: Conferencia | null;
  responsavelId: string | null;
}

interface Deps {
  db: Database;
  ia: Ia | null;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/** A IA lê a publicação; o motor conta o prazo; nasce (ou se atualiza) o prazo a confirmar. */
export async function sugerirPrazoDaPublicacao(deps: Deps, organizationId: string, publicacaoId: string, userId?: string | null): Promise<AnaliseNaTela | null> {
  const ia = deps.ia;
  if (!ia) throw new IaDesligada();
  type Entrada = {
    pub: typeof publicacoes.$inferSelect;
    contexto: string | undefined;
    responsavelId: string | null;
    regras: RegrasDoProcesso;
    historico: { chave: string; descartada: boolean }[];
  };
  const analise = await analisar<Entrada>(deps.db, {
    organizationId,
    alvo: "publicacao",
    alvoId: publicacaoId,
    acao: "sugerir-prazo",
    userId,
    log: deps.log,
    preparar: async (tx) => {
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
      if (!pub) return null;
      let contexto: string | undefined;
      let responsavelId: string | null = null;
      if (pub.processoId) {
        contexto = (await contextoParaIa(tx, pub.processoId))?.texto;
        const [p] = await tx.select({ responsavelId: processos.responsavelId }).from(processos).where(eq(processos.id, pub.processoId));
        responsavelId = p?.responsavelId ?? null;
      }
      // O calendário e o histórico são lidos agora; a conta e a conferência rodam depois da IA, já fora da transação.
      const regras = await regrasDoProcesso(tx, organizationId, pub.processoId, pub.tribunal);
      const historico = await historicoDasSugestoes(tx);
      const d = pub.disponibilizadaEm.split("-");
      return { entrada: { pub, contexto, responsavelId, regras, historico }, base: impressao(pub.texto), fonte: `${pub.fonte === "djen" ? "DJEN" : "Publicação"} · ${d[2]}/${d[1]}/${d[0]}` };
    },
    executar: async ({ pub, contexto, responsavelId, regras, historico }) => {
      const s = await sugerirPrazo(ia, {
        publicacao: { texto: pub.texto, tipoComunicacao: pub.tipoComunicacao, tipoDocumento: pub.tipoDocumento, orgao: pub.orgao, publicadaEm: pub.publicadaEm },
        contextoDoProcesso: contexto,
      });
      const gera = s.geraPrazo && s.dias ? { dias: s.dias, contagem: s.contagem } : null;
      return {
        ...s,
        contagemCalculada: gera ? contagemNaTela(contarPrazo({ publicacao: pub.publicadaEm, ...gera, calendario: regras.cal })) : null,
        regra: gera ? regraDaContagem(regras.rito, gera.contagem) : null,
        conferencia: gera ? conferir({ tipo: s.tipo, ...gera, rito: regras.rito, documento: pub.tipoDocumento }, historico) : null,
        responsavelId,
      } satisfies SugestaoNaTela;
    },
  });
  if (analise?.situacao === "pronto") await criarPrazoSugerido(deps.db, organizationId, publicacaoId, analise.conteudo as unknown as SugestaoNaTela);
  return analise;
}

/** O prazo "Confirmar sugestão". Se a pessoa já confirmou, a sugestão nova não mexe nele. */
export async function criarPrazoSugerido(db: Database, organizationId: string, publicacaoId: string, s: SugestaoNaTela) {
  await withTenant(db, organizationId, async (tx) => {
    const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
    if (!pub?.processoId) return;
    const [existente] = await tx.select().from(prazos).where(eq(prazos.publicacaoId, publicacaoId));
    if (existente?.confirmadoEm) return;
    if (!s.geraPrazo || !s.contagemCalculada) {
      if (existente) await tx.delete(prazos).where(eq(prazos.id, existente.id));
      return;
    }
    const c = s.contagemCalculada;
    const valores = {
      tipo: s.tipo || "Prazo",
      fundamento: s.fundamento,
      dias: c.dias,
      contagem: c.contagem,
      publicadoEm: c.publicacao,
      inicio: c.inicio,
      fim: c.fim,
      desconsiderados: c.desconsiderados,
      responsavelId: existente?.responsavelId ?? s.responsavelId,
    };
    if (existente) await tx.update(prazos).set(valores).where(eq(prazos.id, existente.id));
    else await tx.insert(prazos).values({ organizationId, processoId: pub.processoId, publicacaoId, origem: "ia", ...valores });
  });
}

export class IaDesligada extends Error {
  constructor() {
    super("IA não configurada: falta a LLM_API_KEY do projeto no gateway");
  }
}
