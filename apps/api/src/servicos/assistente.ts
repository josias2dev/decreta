/**
 * Os dados que a IA do Perguntar consulta, sempre no escritório de quem
 * pergunta (cada consulta abre a própria transação com o RLS do escritório) e
 * em formato curto: o que a IA precisa para responder e a tela para montar o
 * cartão, sem colunas internas. As buscas não diferenciam acento.
 */
import {
  contarPrazo,
  dataDaPublicacao,
  diaDoInstante,
  diaPorExtensoCurto,
  formatarDia,
  formatarDocumento,
  formatarTelefone,
  hojeEm,
  horaLocal,
  instanteLocal,
  nomeDaAudiencia,
  nomeDoDiaDaSemana,
  somarDias,
  urgenciaDoPrazo,
  type Calendario,
  type Dia,
} from "@decreta/core";
import {
  alvaras,
  analises,
  atendimentos,
  audiencias,
  clientes,
  documentos,
  movimentacoes,
  negocios,
  prazos,
  processos,
  publicacoes,
  tarefas,
  withTenant,
  type Database,
  type ParteDaMensagem,
  type Tx,
} from "@decreta/db";
import {
  PedidoErrado,
  type AudienciaNaIa,
  type DadosDoEscritorio,
  type DiaDaAgenda,
  type PessoaNaIa,
  type PrazoNaIa,
  type ProcessoCurto,
  type ProcessoNaIa,
  type PublicacaoNaIa,
  type UrgenciaNaIa,
} from "@decreta/ia";
import { and, asc, desc, eq, exists, gte, inArray, isNotNull, isNull, like, lt, lte, ne, notInArray, or, sql, type AnyColumn, type SQL } from "drizzle-orm";
import { semAcentoNoBanco } from "../rotas/base.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "./calendario.ts";
import { carregarContexto, semIa } from "./contexto.ts";
import { buscarNoAcervo, conferirCitacaoNoAcervo } from "./jurisprudencia.ts";
import { quandoDoPrazo } from "./hoje.ts";
import { pessoasDoEscritorio, type Pessoa } from "./pessoas.ts";
import { contagemNaTela } from "./prazos.ts";
import { tituloDaPublicacao } from "./publicacoes.ts";

const LIMITE = 20;
/** O texto de um documento ou de uma publicação que a IA lê de uma vez. */
const TETO_DO_TEXTO = 60_000;
/** Os autos no Perguntar: menos que nas outras telas (cada pergunta paga a leitura). O que não coube vai listado com o id, para ler à parte. */
const TETO_DOS_AUTOS = 40_000;
/**
 * Os casos de cliente que recusou a IA (Recomendação CFOAB 001/2024, item
 * 4.3.2) ficam fora do Perguntar: as buscas não os trazem e as fichas recusam.
 * Sem processo, ou processo sem cliente, entra.
 */
const SEM_IA = "O cliente não autorizou o uso de IA: os casos dele ficam fora do Perguntar. Abra-os direto no Decreta.";
interface ForaDaIa {
  clientes: string[];
  processos: string[];
}
/** A linha fica se não for de um dos ids (sem processo, ou sem cliente, fica). Sem ninguém fora, não filtra nada. */
const fora = (col: AnyColumn, ids: string[]) => (ids.length ? or(isNull(col), notInArray(col, ids)) : undefined);
const processoComIa = (f: ForaDaIa, processoId: AnyColumn) => fora(processoId, f.processos);
const clienteComIa = (f: ForaDaIa, clienteId: AnyColumn) => fora(clienteId, f.clientes);

const COMO_LER = "Para ler um documento ou uma publicação desta lista, use lerDocumento ou lerPublicacao com o id.";
const n = sql<number>`count(*)::int`;
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
/** Palavras que não ajudam a achar: "processo da Marina contra a Seguradora" busca "marina" e "seguradora". */
const LIGACAO = new Set(["a", "o", "as", "os", "e", "de", "da", "do", "das", "dos", "em", "na", "no", "nas", "nos", "contra", "vs", "versus", "processo", "processos", "acao", "acoes", "caso", "casos", "autos", "n", "nº", "n°", "numero"]);
/** A busca em palavras sem acento e em minúsculas: cada uma precisa aparecer em algum campo. */
const palavras = (busca: string | undefined) =>
  semAcento(busca ?? "")
    .split(/[\s,;:()[\]"'/–—]+/)
    .map((p) => p.replace(/[%_\\]/g, "").replace(/^[-.]+|[-.]+$/g, ""))
    .filter((p) => p.length >= 2 && !LIGACAO.has(p))
    .slice(0, 6);
/** O campo tem a palavra (já sem acento), sem diferenciar acento nem maiúscula. */
const tem = (campo: unknown, p: string) => like(semAcentoNoBanco(sql`${campo}`), `%${p}%`);
/** Os números do campo têm estes dígitos (CNJ, CPF e telefone, com ou sem pontuação). */
const temDigitos = (campo: unknown, digitos: string) => sql`regexp_replace(coalesce(${campo}, ''), '\\D', '', 'g') like ${`%${digitos}%`}`;
const temParte = (p: string) => exists(sql`(select 1 from "partes" where "partes"."processo_id" = ${processos.id} and ${semAcentoNoBanco(sql`"partes"."nome"`)} like ${`%${p}%`})`);
const curto = (texto: string, max: number) => {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s\S*$/, "")}…` : t;
};
const cortado = (texto: string, aviso: string) => (texto.length > TETO_DO_TEXTO ? `${texto.slice(0, TETO_DO_TEXTO)}\n[${aviso} cortado aqui]` : texto);
/** "sex., 6 nov" */
const rotuloDoDia = (d: Dia, hoje: Dia) => `${nomeDoDiaDaSemana(d).slice(0, 3)}., ${diaPorExtensoCurto(d, hoje)}`;

const EU = new Set(["eu", "mim", "meu", "meus", "minha", "minhas", "comigo"]);
const SEM = new Set(["sem", "sem responsavel", "ninguem", "nenhum"]);
const TODOS = new Set(["todos", "todas", "todo mundo", "equipe", "a equipe", "escritorio", "o escritorio"]);

export interface Escopo {
  db: Database;
  organizationId: string;
  userId: string;
  timezone: string;
}

/** Erro que volta para a IA como resultado da ferramenta (ela corrige o pedido ou explica para a pessoa). */
export class PedidoInvalido extends PedidoErrado {}

export function dadosDoEscritorio(e: Escopo): DadosDoEscritorio {
  const hoje = () => hojeEm(e.timezone);
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(e.db, e.organizationId, fn);
  const diaLocal = (d: Date | null) => (d ? diaDoInstante(d, e.timezone) : null);

  // A equipe e o calendário mudam pouco: uma leitura por resposta basta.
  let pessoasP: Promise<Map<string, Pessoa>> | null = null;
  const pessoas = () => (pessoasP ??= tx((t) => pessoasDoEscritorio(e.db, t, e.organizationId)));
  let calP: Promise<Calendario> | null = null;
  const calendario = () => (calP ??= tx(async (t) => calendarioDoEscritorio(t, await tribunalPadrao(t, e.organizationId))));
  // Quem recusou a IA, lido uma vez: quase sempre ninguém, e as buscas ficam sem filtro.
  let foraP: Promise<ForaDaIa> | null = null;
  const foraDaIa = () =>
    (foraP ??= tx(async (t) => {
      const cs = (await t.select({ id: clientes.id }).from(clientes).where(eq(clientes.semIa, true))).map((c) => c.id);
      const ps = cs.length ? (await t.select({ id: processos.id }).from(processos).where(inArray(processos.clienteId, cs))).map((p) => p.id) : [];
      return { clientes: cs, processos: ps };
    }));

  const pessoa = (mapa: Map<string, Pessoa>, id: string | null | undefined): PessoaNaIa | null => {
    if (!id) return null;
    const p = mapa.get(id);
    return p ? { id: p.id, apelido: p.apelido, iniciais: p.iniciais } : { id, apelido: "Ex-integrante", iniciais: "?" };
  };

  /**
   * "eu", "sem", "todos" ou um nome, apelido ou cargo ("Dra. Beatriz", "Bia", "a estagiária"): o id de quem
   * (null = sem responsável; undefined = todos). Mais de uma pessoa serve: erro com as opções, a IA pergunta.
   */
  async function quem(nome: string): Promise<string | null | undefined> {
    const alvo = semAcento(nome)
      .replace(/[.,]/g, " ")
      .replace(/^\s*(a|o)\s+/, "")
      .replace(/^\s*(dr|dra|doutor|doutora|sr|sra)\s+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!alvo) throw new PedidoInvalido('Diga quem: "eu", "sem", "todos" ou o nome de alguém da equipe.');
    if (EU.has(alvo)) return e.userId;
    if (SEM.has(alvo)) return null;
    if (TODOS.has(alvo)) return undefined;
    const lista = [...(await pessoas()).values()];
    const regras: ((p: Pessoa) => boolean)[] = [
      (p) => semAcento(p.apelido) === alvo || semAcento(p.nome) === alvo,
      (p) => semAcento(p.nome).split(/\s+/).includes(alvo) || semAcento(p.apelido).startsWith(alvo) || (!!p.cargo && semAcento(p.cargo) === alvo),
      (p) => semAcento(p.nome).includes(alvo),
    ];
    for (const regra of regras) {
      const achados = lista.filter(regra);
      if (achados.length === 1) return achados[0]!.id;
      if (achados.length > 1) throw new PedidoInvalido(`Mais de uma pessoa da equipe serve para "${nome}": ${achados.map((p) => p.nome).join(", ")}. Pergunte qual.`);
    }
    throw new PedidoInvalido(`Não há ninguém chamado "${nome}" na equipe. A equipe: ${lista.map((p) => p.nome).join(", ")}.`);
  }

  const porResponsavel = async (col: typeof prazos.responsavelId | typeof audiencias.responsavelId | typeof processos.responsavelId, nome: string | undefined): Promise<SQL | undefined> => {
    if (!nome) return undefined;
    const id = await quem(nome);
    return id === undefined ? undefined : id ? eq(col, id) : isNull(col);
  };

  function prazoNaIa(p: typeof prazos.$inferSelect, processo: ProcessoCurto, mapa: Map<string, Pessoa>, cal: Calendario, dia: Dia): PrazoNaIa {
    const urgencia = urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa;
    return {
      id: p.id,
      tipo: p.tipo,
      fim: p.fim,
      quando: p.situacao === "aberto" ? quandoDoPrazo(urgencia, p.fim, dia) : diaPorExtensoCurto(p.fim, dia),
      urgencia,
      situacao: p.situacao === "cumprido" ? "cumprido" : p.situacao === "descartado" ? "descartado" : p.confirmadoEm ? "confirmado" : "a_confirmar",
      dias: p.dias,
      contagem: p.contagem,
      processo,
      responsavel: pessoa(mapa, p.responsavelId),
      cumpridoEm: diaLocal(p.cumpridoEm),
    };
  }

  const colunasDoProcesso = {
    id: processos.id,
    titulo: processos.titulo,
    cnj: processos.cnj,
    classe: processos.classe,
    assunto: processos.assunto,
    orgao: processos.orgao,
    comarca: processos.comarca,
    situacao: processos.situacao,
    fase: processos.fase,
    clienteId: processos.clienteId,
    cliente: clientes.nome,
    responsavelId: processos.responsavelId,
    ultimaMovimentacaoEm: processos.ultimaMovimentacaoEm,
  };
  type LinhaDoProcesso = {
    id: string;
    titulo: string;
    cnj: string | null;
    classe: string | null;
    assunto: string | null;
    orgao: string | null;
    comarca: string | null;
    situacao: string;
    fase: string | null;
    clienteId: string | null;
    cliente: string | null;
    responsavelId: string | null;
    ultimaMovimentacaoEm: Date | null;
  };

  /** Os processos no formato da IA, com o próximo prazo em aberto e o último andamento de cada um. */
  async function processosNaIa(t: Tx, linhas: LinhaDoProcesso[]): Promise<ProcessoNaIa[]> {
    if (!linhas.length) return [];
    const [mapa, cal] = await Promise.all([pessoas(), calendario()]);
    const dia = hoje();
    const ids = linhas.map((l) => l.id);
    const [abertos, ultimas] = await Promise.all([
      t
        .select({ id: prazos.id, processoId: prazos.processoId, tipo: prazos.tipo, fim: prazos.fim, situacao: prazos.situacao })
        .from(prazos)
        .where(and(eq(prazos.situacao, "aberto"), inArray(prazos.processoId, ids)))
        .orderBy(asc(prazos.fim)),
      t
        .selectDistinctOn([movimentacoes.processoId], { processoId: movimentacoes.processoId, em: movimentacoes.em, titulo: movimentacoes.titulo })
        .from(movimentacoes)
        .where(inArray(movimentacoes.processoId, ids))
        .orderBy(movimentacoes.processoId, desc(movimentacoes.em)),
    ]);
    const proximo = new Map<string, (typeof abertos)[number]>();
    for (const p of abertos) if (!proximo.has(p.processoId)) proximo.set(p.processoId, p);
    const ultima = new Map(ultimas.map((m) => [m.processoId, m]));
    return linhas.map((l) => {
      const p = proximo.get(l.id);
      const urgencia = p ? (urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa) : null;
      const m = ultima.get(l.id);
      return {
        id: l.id,
        titulo: l.titulo,
        cnj: l.cnj,
        classe: l.classe,
        assunto: l.assunto,
        orgao: l.orgao,
        comarca: l.comarca,
        situacao: l.situacao,
        fase: l.fase,
        cliente: l.clienteId && l.cliente ? { id: l.clienteId, nome: l.cliente } : null,
        responsavel: pessoa(mapa, l.responsavelId),
        proximoPrazo: p && urgencia ? { id: p.id, tipo: p.tipo, fim: p.fim, quando: quandoDoPrazo(urgencia, p.fim, dia), urgencia } : null,
        ultimaMovimentacao: m ? { dia: diaDoInstante(m.em, e.timezone), titulo: m.titulo } : l.ultimaMovimentacaoEm ? { dia: diaDoInstante(l.ultimaMovimentacaoEm, e.timezone), titulo: "Movimentação" } : null,
      };
    });
  }

  async function audienciasNaIa(linhas: { a: typeof audiencias.$inferSelect; processo: ProcessoCurto }[]): Promise<AudienciaNaIa[]> {
    const mapa = await pessoas();
    const dia = hoje();
    return linhas.map(({ a, processo }) => {
      const d = diaDoInstante(a.em, e.timezone);
      const hora = horaLocal(a.em, e.timezone);
      return { id: a.id, dia: d, hora, quando: `${rotuloDoDia(d, dia)} · ${hora}`, tipo: a.tipo, porVideo: a.porVideo, local: a.local, situacao: a.situacao, processo, responsavel: pessoa(mapa, a.responsavelId) };
    });
  }

  /** A linha que a IA já escreveu sobre cada publicação ao sugerir o prazo. */
  async function resumosDas(t: Tx, ids: string[]): Promise<Map<string, string>> {
    const resumo = new Map<string, string>();
    if (!ids.length) return resumo;
    const sugestoes = await t
      .select({ alvoId: analises.alvoId, conteudo: analises.conteudo })
      .from(analises)
      .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), eq(analises.situacao, "pronto"), inArray(analises.alvoId, ids)))
      .orderBy(desc(analises.createdAt));
    for (const s of sugestoes) if (!resumo.has(s.alvoId) && typeof s.conteudo.resumo === "string") resumo.set(s.alvoId, s.conteudo.resumo);
    return resumo;
  }

  const publicacaoNaIa = (pub: typeof publicacoes.$inferSelect, processo: ProcessoCurto | null, resumo: string | null, teor: string): PublicacaoNaIa => ({
    id: pub.id,
    disponibilizadaEm: pub.disponibilizadaEm,
    publicadaEm: pub.publicadaEm,
    tipo: tituloDaPublicacao(pub.tipoComunicacao, pub.tipoDocumento),
    orgao: pub.orgao,
    cnj: pub.cnj,
    processo: processo?.id ? processo : null,
    situacao: pub.situacao,
    resumo,
    teor,
  });

  const processoCurto = { id: processos.id, titulo: processos.titulo, cnj: processos.cnj };

  async function processoExiste(t: Tx, id: string | undefined): Promise<ProcessoCurto | null> {
    if (!id) return null;
    const [p] = await t.select(processoCurto).from(processos).where(eq(processos.id, id));
    if (!p) throw new PedidoInvalido("Não achei este processo. Busque pelo nome ou número.");
    return p;
  }

  return {
    async panorama() {
      const dia = hoje();
      const semana = somarDias(dia, 7);
      const inicioHoje = instanteLocal(dia, "00:00", e.timezone);
      const inicioAmanha = instanteLocal(somarDias(dia, 1), "00:00", e.timezone);
      const fimSemana = instanteLocal(somarDias(dia, 8), "00:00", e.timezone);
      return tx(async (t) => {
        const aberto = eq(prazos.situacao, "aberto");
        const minha = sql`${tarefas.responsavelId} = ${e.userId}`;
        const [[pz], [pb], [au], [tf], [pr], [cl], [al], [ng]] = await Promise.all([
          t
            .select({
              vencidos: sql<number>`count(*) filter (where ${prazos.fim} < ${dia})::int`,
              hoje: sql<number>`count(*) filter (where ${prazos.fim} = ${dia})::int`,
              ate7dias: sql<number>`count(*) filter (where ${prazos.fim} >= ${dia} and ${prazos.fim} <= ${semana})::int`,
              abertos: n,
              aConfirmar: sql<number>`count(*) filter (where ${prazos.confirmadoEm} is null)::int`,
              semResponsavel: sql<number>`count(*) filter (where ${prazos.responsavelId} is null)::int`,
              meus: sql<number>`count(*) filter (where ${prazos.responsavelId} = ${e.userId})::int`,
              meusVencidos: sql<number>`count(*) filter (where ${prazos.responsavelId} = ${e.userId} and ${prazos.fim} < ${dia})::int`,
            })
            .from(prazos)
            .where(aberto),
          t
            .select({ novas: sql<number>`count(*) filter (where ${publicacoes.situacao} = 'nova')::int`, pendentes: sql<number>`count(*) filter (where ${publicacoes.situacao} = 'pendente')::int` })
            .from(publicacoes),
          t
            .select({
              hoje: sql<number>`count(*) filter (where ${audiencias.em} >= ${inicioHoje.toISOString()} and ${audiencias.em} < ${inicioAmanha.toISOString()})::int`,
              ate7dias: n,
              minhas: sql<number>`count(*) filter (where ${audiencias.responsavelId} = ${e.userId})::int`,
            })
            .from(audiencias)
            .where(and(eq(audiencias.situacao, "marcada"), gte(audiencias.em, inicioHoje), lt(audiencias.em, fimSemana))),
          // Como na tela Hoje: as não concluídas até hoje.
          t
            .select({
              atrasadas: sql<number>`count(*) filter (where ${tarefas.dia} < ${dia})::int`,
              hoje: sql<number>`count(*) filter (where ${tarefas.dia} = ${dia})::int`,
              minhasAtrasadas: sql<number>`count(*) filter (where ${tarefas.dia} < ${dia} and ${minha})::int`,
              minhasHoje: sql<number>`count(*) filter (where ${tarefas.dia} = ${dia} and ${minha})::int`,
            })
            .from(tarefas)
            .where(and(isNull(tarefas.concluidaEm), lte(tarefas.dia, dia))),
          t
            .select({ ativos: sql<number>`count(*) filter (where ${processos.situacao} = 'ativo')::int`, suspensos: sql<number>`count(*) filter (where ${processos.situacao} = 'suspenso')::int` })
            .from(processos),
          t.select({ n }).from(clientes),
          t
            .select({ n, valor: sql<string>`coalesce(sum(${alvaras.valor}), 0)::text` })
            .from(alvaras)
            .where(inArray(alvaras.etapa, ["novo", "aguardando_saque", "sacado"])),
          t.select({ n }).from(negocios).where(eq(negocios.etapa, "triagem")),
        ]);
        return {
          hoje: dia,
          prazos: { vencidos: pz?.vencidos ?? 0, hoje: pz?.hoje ?? 0, ate7dias: pz?.ate7dias ?? 0, abertos: pz?.abertos ?? 0, aConfirmar: pz?.aConfirmar ?? 0, semResponsavel: pz?.semResponsavel ?? 0 },
          publicacoes: { novas: pb?.novas ?? 0, pendentes: pb?.pendentes ?? 0 },
          audiencias: { hoje: au?.hoje ?? 0, ate7dias: au?.ate7dias ?? 0 },
          tarefas: { atrasadas: tf?.atrasadas ?? 0, hoje: tf?.hoje ?? 0, minhasAtrasadas: tf?.minhasAtrasadas ?? 0, minhasHoje: tf?.minhasHoje ?? 0 },
          processos: { ativos: pr?.ativos ?? 0, suspensos: pr?.suspensos ?? 0 },
          clientes: cl?.n ?? 0,
          alvaras: { pendentes: al?.n ?? 0, valorPendente: al?.valor ?? "0" },
          negocios: { triagem: ng?.n ?? 0 },
          meus: { prazosAbertos: pz?.meus ?? 0, prazosVencidos: pz?.meusVencidos ?? 0, audienciasAte7dias: au?.minhas ?? 0 },
        };
      });
    },

    async prazos(f) {
      const sem = await foraDaIa();
      const situacao = f.situacao ?? "aberto";
      const onde: (SQL | undefined)[] = [eq(prazos.situacao, situacao), processoComIa(sem, prazos.processoId), await porResponsavel(prazos.responsavelId, f.responsavel)];
      if (f.aConfirmar) onde.push(isNull(prazos.confirmadoEm));
      // Cumpridos "desta semana" são os marcados cumpridos nela, não os que venceriam nela.
      if (situacao === "cumprido") {
        if (f.de) onde.push(gte(prazos.cumpridoEm, instanteLocal(f.de, "00:00", e.timezone)));
        if (f.ate) onde.push(lt(prazos.cumpridoEm, instanteLocal(somarDias(f.ate, 1), "00:00", e.timezone)));
      } else {
        if (f.de) onde.push(gte(prazos.fim, f.de));
        if (f.ate) onde.push(lte(prazos.fim, f.ate));
      }
      if (f.processoId) onde.push(eq(prazos.processoId, f.processoId));
      if (f.clienteId) onde.push(eq(processos.clienteId, f.clienteId));
      for (const p of palavras(f.busca)) onde.push(or(tem(prazos.tipo, p), tem(processos.titulo, p), tem(clientes.nome, p), temParte(p)));
      const [mapa, cal] = await Promise.all([pessoas(), calendario()]);
      const dia = hoje();
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ p: prazos, processo: processoCurto })
            .from(prazos)
            .innerJoin(processos, eq(processos.id, prazos.processoId))
            .leftJoin(clientes, eq(clientes.id, processos.clienteId))
            .where(and(...onde))
            .orderBy(situacao === "cumprido" ? desc(prazos.cumpridoEm) : asc(prazos.fim), asc(prazos.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).leftJoin(clientes, eq(clientes.id, processos.clienteId)).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: linhas.map(({ p, processo }) => prazoNaIa(p, processo, mapa, cal, dia)) };
      });
    },

    async processos(f) {
      const sem = await foraDaIa();
      const ps = palavras(f.busca);
      // Com o número do processo, não há por que esconder o arquivado.
      const situacao = f.situacao ?? (ps.some((p) => p.replace(/\D/g, "").length >= 7) ? "todos" : "ativos");
      const naSituacao = (s: string) =>
        s === "ativos" ? inArray(processos.situacao, ["ativo", "suspenso"]) : s === "arquivados" ? inArray(processos.situacao, ["arquivado", "encerrado"]) : undefined;
      const onde: (SQL | undefined)[] = [processoComIa(sem, processos.id), await porResponsavel(processos.responsavelId, f.responsavel)];
      if (f.clienteId) onde.push(eq(processos.clienteId, f.clienteId));
      const movidoEm = sql`coalesce(${processos.ultimaMovimentacaoEm}, ${processos.createdAt})`;
      if (f.paradoHaDias) onde.push(sql`${movidoEm} < ${instanteLocal(somarDias(hoje(), -f.paradoHaDias), "00:00", e.timezone).toISOString()}`);
      for (const p of ps) {
        const digitos = p.replace(/\D/g, "");
        onde.push(
          or(
            tem(processos.titulo, p),
            tem(processos.classe, p),
            tem(processos.assunto, p),
            tem(processos.orgao, p),
            tem(processos.comarca, p),
            tem(processos.fase, p),
            tem(clientes.nome, p),
            temParte(p),
            digitos.length >= 4 ? temDigitos(processos.cnj, digitos) : undefined,
          ),
        );
      }
      const contar = (t: Tx, s: string) =>
        t
          .select({ n })
          .from(processos)
          .leftJoin(clientes, eq(clientes.id, processos.clienteId))
          .where(and(naSituacao(s), ...onde));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select(colunasDoProcesso)
            .from(processos)
            .leftJoin(clientes, eq(clientes.id, processos.clienteId))
            .where(and(naSituacao(situacao), ...onde))
            .orderBy(f.ordem === "parados" ? sql`${movidoEm} asc` : sql`${processos.ultimaMovimentacaoEm} desc nulls last`, asc(processos.titulo))
            .limit(f.limite ?? LIMITE),
          contar(t, situacao),
        ]);
        const itens = await processosNaIa(t, linhas);
        // Nada nos ativos (o padrão): quantos batem entre os arquivados, para a IA avisar ou buscar de novo.
        if (!f.situacao && situacao === "ativos" && !total?.n) {
          const [arq] = await contar(t, "arquivados");
          if (arq?.n) return { total: 0, itens, arquivadosQueBatem: arq.n };
        }
        return { total: total?.n ?? 0, itens };
      });
    },

    async processo(id) {
      const [mapa, cal] = await Promise.all([pessoas(), calendario()]);
      const dia = hoje();
      return tx(async (t) => {
        const [p] = await t
          .select({ ...colunasDoProcesso, tribunal: processos.tribunal, valorCausa: processos.valorCausa, poloCliente: processos.poloCliente, segredo: processos.segredo, distribuidoEm: processos.distribuidoEm })
          .from(processos)
          .leftJoin(clientes, eq(clientes.id, processos.clienteId))
          .where(eq(processos.id, id));
        if (!p) return null;
        if (await semIa(t, { processoId: id })) throw new PedidoInvalido(SEM_IA);
        const curto = { id: p.id, titulo: p.titulo, cnj: p.cnj };
        const [[base], przs, auds, ctx] = await Promise.all([
          processosNaIa(t, [p]),
          t.select().from(prazos).where(and(eq(prazos.processoId, id), eq(prazos.situacao, "aberto"))).orderBy(asc(prazos.fim)),
          t
            .select()
            .from(audiencias)
            .where(and(eq(audiencias.processoId, id), ne(audiencias.situacao, "cancelada"), gte(audiencias.em, instanteLocal(somarDias(dia, -30), "00:00", e.timezone))))
            .orderBy(asc(audiencias.em)),
          carregarContexto(t, id, { documentos: true, teto: TETO_DOS_AUTOS, comoLer: COMO_LER }),
        ]);
        return {
          processo: { ...base!, tribunal: p.tribunal, valorCausa: p.valorCausa, poloCliente: p.poloCliente, segredo: p.segredo, distribuidoEm: p.distribuidoEm },
          prazos: przs.map((x) => prazoNaIa(x, curto, mapa, cal, dia)),
          audiencias: await audienciasNaIa(auds.map((a) => ({ a, processo: curto }))),
          autos: ctx?.texto ?? "",
        };
      });
    },

    async publicacoes(f) {
      const sem = await foraDaIa();
      const situacao = f.situacao ?? "nao_tratadas";
      const onde: (SQL | undefined)[] = [processoComIa(sem, publicacoes.processoId)];
      if (situacao === "nao_tratadas") onde.push(inArray(publicacoes.situacao, ["nova", "pendente"]));
      else if (situacao !== "todas") onde.push(eq(publicacoes.situacao, situacao));
      if (f.de) onde.push(gte(publicacoes.disponibilizadaEm, f.de));
      if (f.ate) onde.push(lte(publicacoes.disponibilizadaEm, f.ate));
      if (f.processoId) onde.push(eq(publicacoes.processoId, f.processoId));
      for (const p of palavras(f.busca)) {
        const digitos = p.replace(/\D/g, "");
        onde.push(or(tem(publicacoes.texto, p), digitos.length >= 4 ? temDigitos(publicacoes.cnj, digitos) : tem(publicacoes.cnj, p)));
      }
      // As não tratadas da mais antiga para a mais nova: a que espera há mais tempo é a mais urgente.
      const ordem = situacao === "nao_tratadas" ? [asc(publicacoes.disponibilizadaEm), asc(publicacoes.createdAt)] : [desc(publicacoes.disponibilizadaEm), desc(publicacoes.createdAt)];
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ pub: publicacoes, processo: processoCurto })
            .from(publicacoes)
            .leftJoin(processos, eq(processos.id, publicacoes.processoId))
            .where(and(...onde))
            .orderBy(...ordem)
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(publicacoes).where(and(...onde)),
        ]);
        const resumo = await resumosDas(
          t,
          linhas.map((l) => l.pub.id),
        );
        return { total: total?.n ?? 0, itens: linhas.map(({ pub, processo }) => publicacaoNaIa(pub, processo, resumo.get(pub.id) ?? null, curto(pub.texto, 600))) };
      });
    },

    async publicacao(id) {
      return tx(async (t) => {
        const [l] = await t.select({ pub: publicacoes, processo: processoCurto }).from(publicacoes).leftJoin(processos, eq(processos.id, publicacoes.processoId)).where(eq(publicacoes.id, id));
        if (!l) return null;
        if (await semIa(t, { processoId: l.pub.processoId })) throw new PedidoInvalido(SEM_IA);
        const resumo = await resumosDas(t, [id]);
        return publicacaoNaIa(l.pub, l.processo, resumo.get(id) ?? null, cortado(l.pub.texto, "teor"));
      });
    },

    async audiencias(f) {
      const sem = await foraDaIa();
      const dia = hoje();
      // Só o último dia, e ele já passou ("até ontem"): os 30 dias antes dele.
      const de = f.de ?? (f.ate && f.ate < dia ? somarDias(f.ate, -30) : dia);
      const ate = f.ate ?? somarDias(de, 30);
      if (ate < de) throw new PedidoInvalido("O último dia vem antes do primeiro.");
      const onde: (SQL | undefined)[] = [
        gte(audiencias.em, instanteLocal(de, "00:00", e.timezone)),
        lt(audiencias.em, instanteLocal(somarDias(ate, 1), "00:00", e.timezone)),
        f.incluirCanceladas ? undefined : ne(audiencias.situacao, "cancelada"),
        processoComIa(sem, audiencias.processoId),
        await porResponsavel(audiencias.responsavelId, f.responsavel),
      ];
      if (f.processoId) onde.push(eq(audiencias.processoId, f.processoId));
      if (f.clienteId) onde.push(eq(processos.clienteId, f.clienteId));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ a: audiencias, processo: processoCurto })
            .from(audiencias)
            .innerJoin(processos, eq(processos.id, audiencias.processoId))
            .where(and(...onde))
            .orderBy(asc(audiencias.em))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(audiencias).innerJoin(processos, eq(processos.id, audiencias.processoId)).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: await audienciasNaIa(linhas) };
      });
    },

    async agenda(f) {
      const sem = await foraDaIa();
      if (f.ate < f.de) throw new PedidoInvalido("O último dia vem antes do primeiro.");
      const teto = somarDias(f.de, 31);
      const ate = f.ate > teto ? teto : f.ate;
      const [cal, responsavel] = await Promise.all([calendario(), f.responsavel ? quem(f.responsavel) : Promise.resolve(undefined)]);
      const dono = <C extends typeof prazos.responsavelId | typeof audiencias.responsavelId | typeof tarefas.responsavelId>(col: C) =>
        responsavel === undefined ? undefined : responsavel ? eq(col, responsavel) : isNull(col);
      const dia = hoje();
      return tx(async (t) => {
        const tarefasDe = (onde: SQL | undefined) =>
          t
            .select({ t: tarefas, processo: processoCurto })
            .from(tarefas)
            .leftJoin(processos, eq(processos.id, tarefas.processoId))
            .where(and(onde, processoComIa(sem, tarefas.processoId), clienteComIa(sem, tarefas.clienteId), dono(tarefas.responsavelId)))
            .orderBy(asc(tarefas.dia), asc(tarefas.createdAt));
        const [auds, przs, tars, atrasadas] = await Promise.all([
          t
            .select({ a: audiencias, processo: processoCurto })
            .from(audiencias)
            .innerJoin(processos, eq(processos.id, audiencias.processoId))
            .where(and(ne(audiencias.situacao, "cancelada"), gte(audiencias.em, instanteLocal(f.de, "00:00", e.timezone)), lt(audiencias.em, instanteLocal(somarDias(ate, 1), "00:00", e.timezone)), processoComIa(sem, audiencias.processoId), dono(audiencias.responsavelId)))
            .orderBy(asc(audiencias.em)),
          t
            .select({ p: prazos, processo: processoCurto })
            .from(prazos)
            .innerJoin(processos, eq(processos.id, prazos.processoId))
            .where(and(eq(prazos.situacao, "aberto"), gte(prazos.fim, f.de), lte(prazos.fim, ate), processoComIa(sem, prazos.processoId), dono(prazos.responsavelId)))
            .orderBy(asc(prazos.fim)),
          tarefasDe(and(gte(tarefas.dia, f.de), lte(tarefas.dia, ate))),
          // Como na tela Hoje: a tarefa atrasada e não concluída aparece hoje.
          f.de === dia ? tarefasDe(and(isNull(tarefas.concluidaEm), lt(tarefas.dia, f.de))) : Promise.resolve([]),
        ]);
        const dias = new Map<string, DiaDaAgenda>();
        const em = (d: Dia) => {
          let x = dias.get(d);
          if (!x) dias.set(d, (x = { dia: d, rotulo: rotuloDoDia(d, dia), itens: [] }));
          return x.itens;
        };
        for (const { a, processo } of auds)
          em(diaDoInstante(a.em, e.timezone)).push({ tipo: "audiencia", id: a.id, hora: horaLocal(a.em, e.timezone), titulo: nomeDaAudiencia(a.tipo), porVideo: a.porVideo, situacao: a.situacao, processo });
        for (const { p, processo } of przs) em(p.fim).push({ tipo: "prazo", id: p.id, titulo: p.tipo, urgencia: urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa, processo });
        for (const { t: tf, processo } of atrasadas) em(f.de).push({ tipo: "tarefa", id: tf.id, titulo: tf.titulo, concluida: false, atrasada: true, processo: processo?.id ? processo : null });
        for (const { t: tf, processo } of tars) em(tf.dia).push({ tipo: "tarefa", id: tf.id, titulo: tf.titulo, concluida: !!tf.concluidaEm, processo: processo?.id ? processo : null });
        return { dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)), ...(f.ate > teto ? { cortadoEm: ate } : {}) };
      });
    },

    async clientes(f) {
      const onde: SQL[] = [];
      const digitos = f.busca.replace(/\D/g, "");
      if (!/\p{L}/u.test(f.busca) && digitos.length >= 8) {
        // Só número ("(47) 99123-4567", "318.204.567-90"): os dígitos juntos, como na tela de Clientes. O 55 do país sai.
        const d = digitos.replace(/^55(?=\d{10,11}$)/, "");
        onde.push(or(temDigitos(clientes.documento, d), temDigitos(clientes.telefone, d))!);
      } else {
        for (const p of palavras(f.busca)) {
          const ds = p.replace(/\D/g, "");
          onde.push(or(tem(clientes.nome, p), tem(clientes.email, p), ...(ds.length >= 4 ? [temDigitos(clientes.documento, ds), temDigitos(clientes.telefone, ds)] : []))!);
        }
      }
      if (!onde.length) throw new PedidoInvalido("Diga um nome, CPF/CNPJ ou telefone para buscar.");
      onde.push(eq(clientes.semIa, false));
      return tx(async (t) => {
        const qtd = sql<number>`(select count(*)::int from "processos" where "processos"."cliente_id" = "clientes"."id")`;
        const [linhas, [total]] = await Promise.all([
          t
            .select({ c: clientes, processos: qtd })
            .from(clientes)
            .where(and(...onde))
            .orderBy(asc(clientes.nome))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(clientes).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: linhas.map(({ c, processos: np }) => clienteNaIa(c, np)) };
      });
    },

    async cliente(id) {
      return tx(async (t) => {
        const [c] = await t.select().from(clientes).where(eq(clientes.id, id));
        if (!c) return null;
        if (c.semIa) throw new PedidoInvalido(SEM_IA);
        const [linhas, ats] = await Promise.all([
          t
            .select(colunasDoProcesso)
            .from(processos)
            .leftJoin(clientes, eq(clientes.id, processos.clienteId))
            .where(eq(processos.clienteId, id))
            .orderBy(sql`${processos.ultimaMovimentacaoEm} desc nulls last`),
          t.select().from(atendimentos).where(eq(atendimentos.clienteId, id)).orderBy(desc(atendimentos.em)).limit(5),
        ]);
        const ps = await processosNaIa(t, linhas);
        return {
          cliente: { ...clienteNaIa(c, ps.length), endereco: c.endereco, observacoes: c.observacoes },
          processos: ps,
          atendimentos: ats.map((a) => ({ em: diaDoInstante(a.em, e.timezone), canal: a.canal, resumo: curto(a.resumo, 600) })),
        };
      });
    },

    async documentos(f) {
      const sem = await foraDaIa();
      const onde: (SQL | undefined)[] = [processoComIa(sem, documentos.processoId), clienteComIa(sem, documentos.clienteId)];
      if (f.processoId) onde.push(eq(documentos.processoId, f.processoId));
      if (f.clienteId) onde.push(eq(documentos.clienteId, f.clienteId));
      const ps = palavras(f.busca);
      for (const p of ps) onde.push(or(tem(documentos.nome, p), tem(documentos.texto, p)));
      const primeira = ps[0] ?? "";
      return tx(async (t) => {
        // O texto sem acento tem o mesmo tamanho: a posição achada nele vale no texto de verdade.
        const onde1 = sql`position(${primeira} in ${semAcentoNoBanco(sql`coalesce(${documentos.texto}, '')`)})`;
        const trecho = primeira ? sql<string | null>`case when ${onde1} > 0 then substring(${documentos.texto} from greatest(${onde1} - 140, 1) for 320) end` : sql<string | null>`null`;
        const [linhas, [total]] = await Promise.all([
          t
            .select({
              id: documentos.id,
              nome: documentos.nome,
              mime: documentos.mime,
              paginas: documentos.paginas,
              evento: documentos.evento,
              em: documentos.createdAt,
              trecho,
              processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj },
              cliente: { id: clientes.id, nome: clientes.nome },
            })
            .from(documentos)
            .leftJoin(processos, eq(processos.id, documentos.processoId))
            .leftJoin(clientes, eq(clientes.id, documentos.clienteId))
            .where(and(...onde))
            .orderBy(desc(documentos.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(documentos).where(and(...onde)),
        ]);
        return {
          total: total?.n ?? 0,
          itens: linhas.map((d) => ({
            id: d.id,
            nome: d.nome,
            mime: d.mime,
            paginas: d.paginas,
            evento: d.evento,
            em: diaDoInstante(d.em, e.timezone),
            processo: d.processo?.id ? d.processo : null,
            cliente: d.cliente?.id ? d.cliente : null,
            trecho: d.trecho ? `…${curto(d.trecho, 320)}` : null,
          })),
        };
      });
    },

    async documento(id) {
      return tx(async (t) => {
        const [d] = await t
          .select({ d: documentos, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj }, cliente: { id: clientes.id, nome: clientes.nome } })
          .from(documentos)
          .leftJoin(processos, eq(processos.id, documentos.processoId))
          .leftJoin(clientes, eq(clientes.id, documentos.clienteId))
          .where(eq(documentos.id, id));
        if (!d) return null;
        if (await semIa(t, d.d)) throw new PedidoInvalido(SEM_IA);
        return {
          id: d.d.id,
          nome: d.d.nome,
          mime: d.d.mime,
          paginas: d.d.paginas,
          evento: d.d.evento,
          em: diaDoInstante(d.d.createdAt, e.timezone),
          processo: d.processo?.id ? d.processo : null,
          cliente: d.cliente?.id ? d.cliente : null,
          trecho: null,
          texto: d.d.texto ? cortado(d.d.texto, "documento") : null,
        };
      });
    },

    async alvaras(f) {
      const sem = await foraDaIa();
      const etapa = f.etapa ?? "pendentes";
      const onde: (SQL | undefined)[] = [processoComIa(sem, alvaras.processoId)];
      if (etapa === "pendentes") onde.push(inArray(alvaras.etapa, ["novo", "aguardando_saque", "sacado"]));
      else if (etapa !== "todos") onde.push(eq(alvaras.etapa, etapa));
      if (f.processoId) onde.push(eq(alvaras.processoId, f.processoId));
      if (f.clienteId) onde.push(eq(processos.clienteId, f.clienteId));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ a: alvaras, processo: processoCurto })
            .from(alvaras)
            .innerJoin(processos, eq(processos.id, alvaras.processoId))
            .where(and(...onde))
            .orderBy(sql`${alvaras.expedidoEm} asc nulls last`, asc(alvaras.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n, valor: sql<string>`coalesce(sum(${alvaras.valor}), 0)::text` }).from(alvaras).innerJoin(processos, eq(processos.id, alvaras.processoId)).where(and(...onde)),
        ]);
        return {
          total: total?.n ?? 0,
          valorTotal: total?.valor ?? "0",
          itens: linhas.map(({ a, processo }) => ({ id: a.id, descricao: a.descricao, valor: a.valor, valorRecebido: a.valorRecebido, etapa: a.etapa, expedidoEm: a.expedidoEm, processo })),
        };
      });
    },

    async negocios(f) {
      const etapa = f.etapa ?? "triagem";
      const sem = await foraDaIa();
      const onde = and(etapa === "todos" ? undefined : eq(negocios.etapa, etapa), clienteComIa(sem, negocios.clienteId));
      const mapa = await pessoas();
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t.select().from(negocios).where(onde).orderBy(desc(negocios.createdAt)).limit(f.limite ?? LIMITE),
          t.select({ n }).from(negocios).where(onde),
        ]);
        return {
          total: total?.n ?? 0,
          itens: linhas.map((x) => ({ id: x.id, nome: x.nome, assunto: x.assunto, area: x.area, pasta: x.pasta, etapa: x.etapa, responsavel: pessoa(mapa, x.responsavelId), desde: diaDoInstante(x.createdAt, e.timezone) })),
        };
      });
    },

    async equipe() {
      const mapa = await pessoas();
      const dia = hoje();
      const contas = await tx((t) =>
        t
          .select({ responsavelId: prazos.responsavelId, abertos: n, vencidos: sql<number>`count(*) filter (where ${prazos.fim} < ${dia})::int` })
          .from(prazos)
          .where(and(eq(prazos.situacao, "aberto"), isNotNull(prazos.responsavelId)))
          .groupBy(prazos.responsavelId),
      );
      return {
        itens: [...mapa.values()].map((p) => {
          const c = contas.find((x) => x.responsavelId === p.id);
          return { id: p.id, nome: p.nome, apelido: p.apelido, iniciais: p.iniciais, cargo: p.cargo, oab: p.oab, prazosAbertos: c?.abertos ?? 0, prazosVencidos: c?.vencidos ?? 0 };
        }),
      };
    },

    async contarPrazo(p) {
      if (!p.publicadoEm && !p.disponibilizadoEm) throw new PedidoInvalido("Falta a data da publicação (ou de quando saiu no DJEN).");
      if (p.processoId && (await foraDaIa()).processos.includes(p.processoId)) throw new PedidoInvalido(SEM_IA);
      return tx(async (t) => {
        const processo = await processoExiste(t, p.processoId);
        let tribunal: string | null = null;
        let comarca: string | null = null;
        if (processo) [{ tribunal, comarca } = { tribunal: null, comarca: null }] = await t.select({ tribunal: processos.tribunal, comarca: processos.comarca }).from(processos).where(eq(processos.id, processo.id));
        const usado = tribunal ?? (await tribunalPadrao(t, e.organizationId));
        const cal = await calendarioDoEscritorio(t, usado, comarca);
        const publicacao = p.publicadoEm ?? dataDaPublicacao(p.disponibilizadoEm!, cal);
        return {
          ...contagemNaTela(contarPrazo({ publicacao, dias: p.dias, contagem: p.contagem, calendario: cal })),
          processo,
          calendario: comarca ? `${usado}, com os feriados de ${comarca}` : `${usado}, sem feriados municipais`,
        };
      });
    },

    async proporTarefa(p) {
      const dia = hoje();
      if (p.dia < dia) throw new PedidoInvalido(`${formatarDia(p.dia)} já passou (hoje é ${formatarDia(dia)}). Proponha um dia de hoje em diante.`);
      const mapa = await pessoas();
      const responsavel = p.responsavel ? await quem(p.responsavel) : e.userId;
      if (responsavel === undefined) throw new PedidoInvalido("A tarefa é de uma pessoa só: diga quem.");
      const sem = await foraDaIa();
      if ((p.processoId && sem.processos.includes(p.processoId)) || (p.clienteId && sem.clientes.includes(p.clienteId))) throw new PedidoInvalido(SEM_IA);
      return tx(async (t) => {
        const processo = await processoExiste(t, p.processoId);
        let cliente: { id: string; nome: string } | null = null;
        if (p.clienteId) {
          [cliente = null] = await t.select({ id: clientes.id, nome: clientes.nome }).from(clientes).where(eq(clientes.id, p.clienteId));
          if (!cliente) throw new PedidoInvalido("Não achei este cliente. Busque pelo nome.");
        }
        return { titulo: p.titulo, dia: p.dia, detalhe: p.detalhe ?? null, responsavel: pessoa(mapa, responsavel), processo, cliente };
      });
    },

    // O acervo é público e igual para todos: fora do RLS do escritório, e só no banco (nada de fonte externa).
    jurisprudencia: (f) => buscarNoAcervo(e.db, f),
    citacao: (p) => conferirCitacaoNoAcervo(e.db, p),
  };
}

/** O cliente como a IA e o cartão veem, com o CPF/CNPJ e o telefone formatados como nas telas. */
function clienteNaIa(c: typeof clientes.$inferSelect, processos: number) {
  return {
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    documento: c.documento ? formatarDocumento(c.documento) : null,
    telefone: c.telefone ? formatarTelefone(c.telefone) : null,
    email: c.email,
    processos,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const feito = (s: unknown) => s === "cumprido" || s === "descartado";

/**
 * Os prazos dos cartões já gravados (a foto de quando a IA consultou) com a situação de agora: o prazo
 * marcado cumprido pelo cartão continua cumprido quando a conversa abre de novo. Muda só a cópia da tela.
 */
export async function prazosDeAgora(tx: Tx, partes: ParteDaMensagem[], organizationId: string, timezone: string): Promise<void> {
  const guardados = partes.flatMap((p) => {
    if (p.tipo !== "ferramenta" || !p.saida || typeof p.saida !== "object") return [];
    const lista = p.nome === "buscarPrazos" ? (p.saida as { itens?: unknown }).itens : p.nome === "lerProcesso" ? (p.saida as { prazos?: unknown }).prazos : null;
    return Array.isArray(lista) ? (lista as Partial<PrazoNaIa>[]).filter((x) => typeof x?.id === "string" && UUID.test(x.id)) : [];
  });
  if (!guardados.length) return;
  const agora = await tx
    .select({ id: prazos.id, fim: prazos.fim, situacao: prazos.situacao, confirmadoEm: prazos.confirmadoEm, cumpridoEm: prazos.cumpridoEm })
    .from(prazos)
    .where(inArray(prazos.id, [...new Set(guardados.map((x) => x.id!))]));
  const porId = new Map(agora.map((p) => [p.id, p]));
  const dia = hojeEm(timezone);
  let cal: Calendario | null = null;
  for (const x of guardados) {
    const p = porId.get(x.id!);
    if (!p) continue;
    const situacao = p.situacao === "cumprido" ? "cumprido" : p.situacao === "descartado" ? "descartado" : p.confirmadoEm ? "confirmado" : "a_confirmar";
    // Só o feito ou desfeito depois da consulta: o resto da foto (o "hoje", o "amanhã") fica como a IA viu.
    if (feito(situacao) === feito(x.situacao) && (situacao === x.situacao || !feito(situacao))) continue;
    cal ??= await calendarioDoEscritorio(tx, await tribunalPadrao(tx, organizationId));
    const urgencia = urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa;
    Object.assign(x, {
      situacao,
      urgencia,
      quando: p.situacao === "aberto" ? quandoDoPrazo(urgencia, p.fim, dia) : diaPorExtensoCurto(p.fim, dia),
      cumpridoEm: p.cumpridoEm ? diaDoInstante(p.cumpridoEm, timezone) : null,
    });
  }
}
