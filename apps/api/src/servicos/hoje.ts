/**
 * O dia do escritório: o que vence, o que já venceu, as audiências e as
 * tarefas, num lugar só. A tela Hoje e o resumo da manhã no WhatsApp leem
 * daqui.
 */
import { diaPorExtenso, diaPorExtensoCurto, horaLocal, instanteLocal, nomeDaAudiencia, somarDias, urgenciaDoPrazo, type Calendario, type Dia, type Urgencia } from "@decreta/core";
import { alvaras, analises, audiencias, negocios, prazos, processos, publicacoes, tarefas, type Database, type Tx } from "@decreta/db";
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, sql } from "drizzle-orm";
import { calendarioDoEscritorio, tribunalPadrao } from "./calendario.ts";
import { saudeDaCaptura } from "./captura.ts";
import { pessoasDoEscritorio, resumir, type PessoaResumida } from "./pessoas.ts";
import { tituloDaPublicacao } from "./publicacoes.ts";

export interface ItemDoDia {
  tipo: "prazo" | "audiencia" | "tarefa";
  id: string;
  urgencia: Urgencia | "audiencia" | "tarefa";
  /** "Vencido · 28 out", "Hoje", "14:30", "Tarefa". */
  quando: string;
  titulo: string;
  /** Partes e juízo, ou o contexto da tarefa. */
  detalhe: string;
  cnj: string | null;
  processoId: string | null;
  responsavel: PessoaResumida | null;
  /** Prazo ainda não confirmado por uma pessoa. */
  aConfirmar?: boolean;
}

export interface PublicacaoDoDia {
  id: string;
  titulo: string;
  detalhe: string;
}

export interface PainelDoDia {
  hoje: Dia;
  rotulo: string;
  contadores: { vencemHoje: number; vencidos: number; publicacoesNovas: number; publicacoesComPrazo: number; audienciasHoje: number; alvarasAguardando: number };
  itens: ItemDoDia[];
  publicacoes: PublicacaoDoDia[];
  porResponsavel: { pessoa: PessoaResumida | null; hoje: number; semana: number }[];
  /** Caderno do DJEN que faltou ou falhou (ver saudeDaCaptura). */
  alertasDaCaptura: string[];
}

/** "prazo sugerido 23/11", "não gera prazo", "falta o teor". */
export function resumoDaSugestao(a: { situacao: string; conteudo: Record<string, unknown> } | undefined): string {
  if (!a) return "a IA ainda vai ler";
  if (a.situacao === "recusa") return "falta o teor";
  if (a.situacao === "erro") return "a IA não conseguiu ler";
  const c = a.conteudo as { geraPrazo?: boolean; audiencia?: { data: string; hora: string } | null; contagemCalculada?: { fim: string } | null };
  if (c.audiencia) return `audiência ${c.audiencia.data.slice(8, 10)}/${c.audiencia.data.slice(5, 7)} às ${c.audiencia.hora}`;
  if (c.geraPrazo && c.contagemCalculada) return `prazo sugerido ${c.contagemCalculada.fim.slice(8, 10)}/${c.contagemCalculada.fim.slice(5, 7)}`;
  return "não gera prazo";
}

export function quandoDoPrazo(urgencia: Urgencia, fim: Dia, hoje: Dia): string {
  if (urgencia === "vencido") return `Vencido · ${diaPorExtensoCurto(fim, hoje)}`;
  if (urgencia === "hoje") return "Hoje";
  if (fim === somarDias(hoje, 1)) return "Amanhã";
  return diaPorExtensoCurto(fim, hoje);
}

const detalheDoProcesso = (p: { titulo: string; orgao: string | null; comarca: string | null }) =>
  [p.titulo, p.orgao && p.comarca && !p.orgao.includes(p.comarca) ? `${p.orgao} de ${p.comarca}` : p.orgao].filter(Boolean).join(" · ");

export async function painelDoDia(db: Database, tx: Tx, organizationId: string, hoje: Dia, timeZone: string, calendario?: Calendario): Promise<PainelDoDia> {
  const cal = calendario ?? (await calendarioDoEscritorio(tx, await tribunalPadrao(tx, organizationId)));
  const pessoas = await pessoasDoEscritorio(db, tx, organizationId);
  const semana = somarDias(hoje, 7);
  const inicio = instanteLocal(hoje, "00:00", timeZone);
  const fim = instanteLocal(somarDias(hoje, 1), "00:00", timeZone);

  const [prazosAbertos, auds, tars, pubs, [alv]] = await Promise.all([
    tx
      .select({ prazo: prazos, processo: { titulo: processos.titulo, cnj: processos.cnj, orgao: processos.orgao, comarca: processos.comarca } })
      .from(prazos)
      .innerJoin(processos, eq(processos.id, prazos.processoId))
      .where(and(eq(prazos.situacao, "aberto"), lte(prazos.fim, semana)))
      .orderBy(asc(prazos.fim)),
    tx
      .select({ a: audiencias, processo: { titulo: processos.titulo, cnj: processos.cnj, orgao: processos.orgao, comarca: processos.comarca } })
      .from(audiencias)
      .innerJoin(processos, eq(processos.id, audiencias.processoId))
      .where(and(eq(audiencias.situacao, "marcada"), gte(audiencias.em, inicio), lt(audiencias.em, fim)))
      .orderBy(asc(audiencias.em)),
    tx
      .select({ t: tarefas, processo: processos.titulo, negocio: negocios.nome })
      .from(tarefas)
      .leftJoin(processos, eq(processos.id, tarefas.processoId))
      .leftJoin(negocios, eq(negocios.id, tarefas.negocioId))
      .where(and(isNull(tarefas.concluidaEm), lte(tarefas.dia, hoje)))
      .orderBy(asc(tarefas.dia)),
    tx
      .select({ id: publicacoes.id, tipoDocumento: publicacoes.tipoDocumento, tipoComunicacao: publicacoes.tipoComunicacao, processo: processos.titulo, destinatarios: publicacoes.destinatarios })
      .from(publicacoes)
      .leftJoin(processos, eq(processos.id, publicacoes.processoId))
      .where(eq(publicacoes.situacao, "nova"))
      .orderBy(desc(publicacoes.disponibilizadaEm), desc(publicacoes.createdAt)),
    tx.select({ n: sql<number>`count(*)::int` }).from(alvaras).where(eq(alvaras.etapa, "aguardando_saque")),
  ]);

  const sugestoes = pubs.length
    ? await tx
        .select({ alvoId: analises.alvoId, situacao: analises.situacao, conteudo: analises.conteudo, em: analises.createdAt })
        .from(analises)
        .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, pubs.slice(0, 200).map((p) => p.id))))
        .orderBy(desc(analises.createdAt))
    : [];
  const ultimaSugestao = new Map<string, (typeof sugestoes)[number]>();
  for (const s of sugestoes) if (!ultimaSugestao.has(s.alvoId)) ultimaSugestao.set(s.alvoId, s);

  const itens: ItemDoDia[] = [];
  let vencemHoje = 0;
  let vencidos = 0;
  const contagem = new Map<string, { hoje: number; semana: number }>();
  for (const { prazo, processo } of prazosAbertos) {
    const u = urgenciaDoPrazo(prazo, hoje, cal);
    const chave = prazo.responsavelId ?? "";
    const c = contagem.get(chave) ?? { hoje: 0, semana: 0 };
    c.semana++;
    if (prazo.fim <= hoje) c.hoje++;
    contagem.set(chave, c);
    if (u === "vencido") vencidos++;
    if (u === "hoje") vencemHoje++;
    if (u !== "vencido" && u !== "hoje") continue;
    itens.push({
      tipo: "prazo",
      id: prazo.id,
      urgencia: u,
      quando: quandoDoPrazo(u, prazo.fim, hoje),
      titulo: prazo.tipo,
      detalhe: detalheDoProcesso(processo),
      cnj: processo.cnj,
      processoId: prazo.processoId,
      responsavel: resumir(pessoas, prazo.responsavelId),
      aConfirmar: !prazo.confirmadoEm,
    });
  }
  for (const { a, processo } of auds) {
    itens.push({
      tipo: "audiencia",
      id: a.id,
      urgencia: "audiencia",
      quando: horaLocal(a.em, timeZone),
      titulo: `${nomeDaAudiencia(a.tipo)}${a.porVideo ? " · por vídeo" : ""}`,
      detalhe: detalheDoProcesso(processo),
      cnj: processo.cnj,
      processoId: a.processoId,
      responsavel: resumir(pessoas, a.responsavelId),
    });
  }
  for (const { t, processo, negocio } of tars) {
    itens.push({
      tipo: "tarefa",
      id: t.id,
      urgencia: "tarefa",
      quando: t.dia < hoje ? `Tarefa · ${diaPorExtensoCurto(t.dia, hoje)}` : "Tarefa",
      titulo: t.titulo,
      // "José Antunes · Novos negócios · faltam RG e comprovante de residência"
      detalhe: [processo, negocio && `${negocio} · Novos negócios`, t.detalhe].filter(Boolean).join(" · "),
      cnj: null,
      processoId: t.processoId,
      responsavel: resumir(pessoas, t.responsavelId),
    });
  }

  const porResponsavel = [...pessoas.values()]
    .map((p) => ({ pessoa: resumir(pessoas, p.id), ...(contagem.get(p.id) ?? { hoje: 0, semana: 0 }) }))
    .sort((a, b) => b.semana - a.semana || a.pessoa!.apelido.localeCompare(b.pessoa!.apelido));
  const sem = contagem.get("");
  if (sem) porResponsavel.push({ pessoa: null, ...sem });

  return {
    hoje,
    rotulo: diaPorExtenso(hoje),
    contadores: {
      vencemHoje,
      vencidos,
      publicacoesNovas: pubs.length,
      // Das novas, quantas a IA já leu e disse que abrem prazo (falta a pessoa confirmar).
      publicacoesComPrazo: [...ultimaSugestao.values()].filter((s) => s.situacao === "pronto" && (s.conteudo as { geraPrazo?: boolean }).geraPrazo).length,
      audienciasHoje: auds.length,
      alvarasAguardando: alv?.n ?? 0,
    },
    itens,
    publicacoes: pubs.slice(0, 3).map((p) => {
      const s = ultimaSugestao.get(p.id);
      const lida = s?.situacao === "pronto" ? (s.conteudo as { geraPrazo?: boolean; tipo?: string; assunto?: string }) : null;
      const quem = p.processo?.split(" × ")[0] ?? p.destinatarios[0]?.nome ?? "Sem processo";
      const titulo = lida?.geraPrazo && lida.tipo ? lida.tipo : tituloDaPublicacao(p.tipoComunicacao, lida?.assunto ?? p.tipoDocumento?.toLocaleLowerCase("pt-BR") ?? null);
      return { id: p.id, titulo, detalhe: `${quem} · ${resumoDaSugestao(s)}` };
    }),
    porResponsavel,
    alertasDaCaptura: (await saudeDaCaptura(tx, hoje)).alertas,
  };
}
