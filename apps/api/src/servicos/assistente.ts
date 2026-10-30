/**
 * Os dados que a IA do Perguntar consulta, sempre no escritório de quem
 * pergunta (cada consulta abre a própria transação com o RLS do escritório) e
 * em formato curto: o que a IA precisa para responder e a tela para montar o
 * cartão, sem colunas internas.
 */
import {
  contarPrazo,
  dataDaPublicacao,
  diaDoInstante,
  diaPorExtensoCurto,
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
  negocios,
  prazos,
  processos,
  publicacoes,
  tarefas,
  withTenant,
  type Database,
  type Tx,
} from "@decreta/db";
import type {
  AudienciaNaIa,
  DadosDoEscritorio,
  DiaDaAgenda,
  PessoaNaIa,
  PrazoNaIa,
  ProcessoCurto,
  ProcessoNaIa,
  UrgenciaNaIa,
} from "@decreta/ia";
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNotNull, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { calendarioDoEscritorio, tribunalPadrao } from "./calendario.ts";
import { carregarContexto } from "./contexto.ts";
import { quandoDoPrazo } from "./hoje.ts";
import { pessoasDoEscritorio, type Pessoa } from "./pessoas.ts";
import { contagemNaTela } from "./prazos.ts";
import { tituloDaPublicacao } from "./publicacoes.ts";

const LIMITE = 20;
const n = sql<number>`count(*)::int`;
const termo = (t: string) => `%${t.replace(/[%_\\]/g, "")}%`;
const palavras = (busca: string | undefined) => (busca ?? "").split(/\s+/).map((p) => p.trim()).filter((p) => p.length >= 2).slice(0, 6);
const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");
const curto = (texto: string, max: number) => {
  const t = texto.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max).replace(/\s\S*$/, "")}…` : t;
};
/** "sex., 6 nov" */
const rotuloDoDia = (d: Dia, hoje: Dia) => `${nomeDoDiaDaSemana(d).slice(0, 3)}., ${diaPorExtensoCurto(d, hoje)}`;

export interface Escopo {
  db: Database;
  organizationId: string;
  userId: string;
  timezone: string;
}

/** Erro que volta para a IA como resultado da ferramenta (ela corrige o pedido ou explica para a pessoa). */
export class PedidoInvalido extends Error {}

export function dadosDoEscritorio(e: Escopo): DadosDoEscritorio {
  const hoje = () => hojeEm(e.timezone);
  const tx = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(e.db, e.organizationId, fn);

  // A equipe e o calendário mudam pouco: uma leitura por resposta basta.
  let pessoasP: Promise<Map<string, Pessoa>> | null = null;
  const pessoas = () => (pessoasP ??= tx((t) => pessoasDoEscritorio(e.db, t, e.organizationId)));
  let calP: Promise<Calendario> | null = null;
  const calendario = () => (calP ??= tx(async (t) => calendarioDoEscritorio(t, await tribunalPadrao(t, e.organizationId))));

  const pessoa = (mapa: Map<string, Pessoa>, id: string | null | undefined): PessoaNaIa | null => {
    if (!id) return null;
    const p = mapa.get(id);
    return p ? { id: p.id, apelido: p.apelido, iniciais: p.iniciais } : { id, apelido: "Ex-integrante", iniciais: "?" };
  };

  /** "eu", "sem" ou um nome: o id de quem (null = sem responsável). */
  async function quem(nome: string): Promise<string | null> {
    const alvo = semAcento(nome.trim());
    if (["eu", "mim", "meu", "meus", "minha", "minhas"].includes(alvo)) return e.userId;
    if (["sem", "sem responsavel", "ninguem", "nenhum"].includes(alvo)) return null;
    const mapa = await pessoas();
    const lista = [...mapa.values()];
    const achado =
      lista.find((p) => semAcento(p.apelido) === alvo || semAcento(p.nome) === alvo) ??
      lista.find((p) => semAcento(p.nome).split(/\s+/).includes(alvo) || semAcento(p.apelido).startsWith(alvo)) ??
      lista.find((p) => semAcento(p.nome).includes(alvo));
    if (!achado) throw new PedidoInvalido(`Não há ninguém chamado "${nome}" na equipe. A equipe: ${lista.map((p) => p.nome).join(", ")}.`);
    return achado.id;
  }

  const porResponsavel = async (col: typeof prazos.responsavelId | typeof audiencias.responsavelId, nome: string | undefined): Promise<SQL | undefined> => {
    if (!nome) return undefined;
    const id = await quem(nome);
    return id ? eq(col, id) : isNull(col);
  };

  function prazoNaIa(
    p: typeof prazos.$inferSelect,
    processo: ProcessoCurto,
    mapa: Map<string, Pessoa>,
    cal: Calendario,
    dia: Dia,
  ): PrazoNaIa {
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
  };
  type LinhaDoProcesso = { id: string; titulo: string; cnj: string | null; classe: string | null; assunto: string | null; orgao: string | null; comarca: string | null; situacao: string; fase: string | null; clienteId: string | null; cliente: string | null; responsavelId: string | null };

  /** Os processos no formato da IA, com o próximo prazo em aberto de cada um. */
  async function processosNaIa(t: Tx, linhas: LinhaDoProcesso[]): Promise<ProcessoNaIa[]> {
    if (!linhas.length) return [];
    const [mapa, cal] = await Promise.all([pessoas(), calendario()]);
    const dia = hoje();
    const abertos = await t
      .select({ id: prazos.id, processoId: prazos.processoId, tipo: prazos.tipo, fim: prazos.fim, situacao: prazos.situacao })
      .from(prazos)
      .where(and(eq(prazos.situacao, "aberto"), inArray(prazos.processoId, linhas.map((l) => l.id))))
      .orderBy(asc(prazos.fim));
    const proximo = new Map<string, (typeof abertos)[number]>();
    for (const p of abertos) if (!proximo.has(p.processoId)) proximo.set(p.processoId, p);
    return linhas.map((l) => {
      const p = proximo.get(l.id);
      const urgencia = p ? (urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa) : null;
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
        const [[pz], [pb], [au], [pr], [cl], [al], [ng]] = await Promise.all([
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
          processos: { ativos: pr?.ativos ?? 0, suspensos: pr?.suspensos ?? 0 },
          clientes: cl?.n ?? 0,
          alvaras: { pendentes: al?.n ?? 0, valorPendente: al?.valor ?? "0" },
          negocios: { triagem: ng?.n ?? 0 },
          meus: { prazosAbertos: pz?.meus ?? 0, prazosVencidos: pz?.meusVencidos ?? 0, audienciasAte7dias: au?.minhas ?? 0 },
        };
      });
    },

    async prazos(f) {
      const situacao = f.situacao ?? "aberto";
      const onde: (SQL | undefined)[] = [eq(prazos.situacao, situacao), await porResponsavel(prazos.responsavelId, f.responsavel)];
      if (f.de) onde.push(gte(prazos.fim, f.de));
      if (f.ate) onde.push(lte(prazos.fim, f.ate));
      if (f.processoId) onde.push(eq(prazos.processoId, f.processoId));
      for (const p of palavras(f.busca)) onde.push(ilike(prazos.tipo, termo(p)));
      const [mapa, cal] = await Promise.all([pessoas(), calendario()]);
      const dia = hoje();
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ p: prazos, processo: processoCurto })
            .from(prazos)
            .innerJoin(processos, eq(processos.id, prazos.processoId))
            .where(and(...onde))
            .orderBy(situacao === "cumprido" ? desc(prazos.cumpridoEm) : asc(prazos.fim), asc(prazos.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(prazos).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: linhas.map(({ p, processo }) => prazoNaIa(p, processo, mapa, cal, dia)) };
      });
    },

    async processos(f) {
      const onde: (SQL | undefined)[] = [];
      const situacao = f.situacao ?? "ativos";
      if (situacao === "ativos") onde.push(inArray(processos.situacao, ["ativo", "suspenso"]));
      if (situacao === "arquivados") onde.push(inArray(processos.situacao, ["arquivado", "encerrado"]));
      if (f.responsavel) {
        const id = await quem(f.responsavel);
        onde.push(id ? eq(processos.responsavelId, id) : isNull(processos.responsavelId));
      }
      if (f.clienteId) onde.push(eq(processos.clienteId, f.clienteId));
      for (const p of palavras(f.busca)) {
        const t = termo(p);
        const digitos = p.replace(/\D/g, "");
        onde.push(
          or(
            ilike(processos.titulo, t),
            ilike(processos.classe, t),
            ilike(processos.assunto, t),
            ilike(processos.orgao, t),
            ilike(processos.comarca, t),
            ilike(processos.fase, t),
            ilike(clientes.nome, t),
            exists(sql`(select 1 from "partes" where "partes"."processo_id" = "processos"."id" and "partes"."nome" ilike ${t})`),
            digitos.length >= 4 ? sql`regexp_replace(coalesce(${processos.cnj}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : undefined,
          ),
        );
      }
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select(colunasDoProcesso)
            .from(processos)
            .leftJoin(clientes, eq(clientes.id, processos.clienteId))
            .where(and(...onde))
            .orderBy(sql`${processos.ultimaMovimentacaoEm} desc nulls last`, asc(processos.titulo))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(processos).leftJoin(clientes, eq(clientes.id, processos.clienteId)).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: await processosNaIa(t, linhas) };
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
        const curto = { id: p.id, titulo: p.titulo, cnj: p.cnj };
        const [[base], przs, auds, ctx] = await Promise.all([
          processosNaIa(t, [p]),
          t.select().from(prazos).where(and(eq(prazos.processoId, id), eq(prazos.situacao, "aberto"))).orderBy(asc(prazos.fim)),
          t
            .select()
            .from(audiencias)
            .where(and(eq(audiencias.processoId, id), ne(audiencias.situacao, "cancelada"), gte(audiencias.em, instanteLocal(somarDias(dia, -30), "00:00", e.timezone))))
            .orderBy(asc(audiencias.em)),
          carregarContexto(t, id, { documentos: true }),
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
      const situacao = f.situacao ?? "nao_tratadas";
      const onde: (SQL | undefined)[] = [];
      if (situacao === "nao_tratadas") onde.push(inArray(publicacoes.situacao, ["nova", "pendente"]));
      else if (situacao !== "todas") onde.push(eq(publicacoes.situacao, situacao));
      if (f.de) onde.push(gte(publicacoes.disponibilizadaEm, f.de));
      if (f.ate) onde.push(lte(publicacoes.disponibilizadaEm, f.ate));
      if (f.processoId) onde.push(eq(publicacoes.processoId, f.processoId));
      for (const p of palavras(f.busca)) onde.push(or(ilike(publicacoes.texto, termo(p)), ilike(publicacoes.cnj, termo(p))));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ pub: publicacoes, processo: { id: processos.id, titulo: processos.titulo, cnj: processos.cnj } })
            .from(publicacoes)
            .leftJoin(processos, eq(processos.id, publicacoes.processoId))
            .where(and(...onde))
            .orderBy(desc(publicacoes.disponibilizadaEm), desc(publicacoes.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(publicacoes).where(and(...onde)),
        ]);
        const sugestoes = linhas.length
          ? await t
              .select({ alvoId: analises.alvoId, conteudo: analises.conteudo })
              .from(analises)
              .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), eq(analises.situacao, "pronto"), inArray(analises.alvoId, linhas.map((l) => l.pub.id))))
              .orderBy(desc(analises.createdAt))
          : [];
        const resumo = new Map<string, string>();
        for (const s of sugestoes) if (!resumo.has(s.alvoId) && typeof s.conteudo.resumo === "string") resumo.set(s.alvoId, s.conteudo.resumo);
        return {
          total: total?.n ?? 0,
          itens: linhas.map(({ pub, processo }) => ({
            id: pub.id,
            disponibilizadaEm: pub.disponibilizadaEm,
            publicadaEm: pub.publicadaEm,
            tipo: tituloDaPublicacao(pub.tipoComunicacao, pub.tipoDocumento),
            orgao: pub.orgao,
            cnj: pub.cnj,
            processo: processo?.id ? processo : null,
            situacao: pub.situacao,
            resumo: resumo.get(pub.id) ?? null,
            teor: curto(pub.texto, 600),
          })),
        };
      });
    },

    async audiencias(f) {
      const dia = hoje();
      const de = f.de ?? dia;
      const ate = f.ate ?? somarDias(de, 30);
      const onde: (SQL | undefined)[] = [
        gte(audiencias.em, instanteLocal(de, "00:00", e.timezone)),
        lt(audiencias.em, instanteLocal(somarDias(ate, 1), "00:00", e.timezone)),
        f.incluirCanceladas ? undefined : ne(audiencias.situacao, "cancelada"),
        await porResponsavel(audiencias.responsavelId, f.responsavel),
      ];
      if (f.processoId) onde.push(eq(audiencias.processoId, f.processoId));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ a: audiencias, processo: processoCurto })
            .from(audiencias)
            .innerJoin(processos, eq(processos.id, audiencias.processoId))
            .where(and(...onde))
            .orderBy(asc(audiencias.em))
            .limit(f.limite ?? LIMITE),
          t.select({ n }).from(audiencias).where(and(...onde)),
        ]);
        return { total: total?.n ?? 0, itens: await audienciasNaIa(linhas) };
      });
    },

    async agenda(f) {
      if (f.ate < f.de) throw new PedidoInvalido("O último dia vem antes do primeiro.");
      const ate = f.ate > somarDias(f.de, 31) ? somarDias(f.de, 31) : f.ate;
      const [cal, responsavel] = await Promise.all([calendario(), f.responsavel ? quem(f.responsavel) : Promise.resolve(undefined)]);
      const dono = <C extends typeof prazos.responsavelId | typeof audiencias.responsavelId | typeof tarefas.responsavelId>(col: C) =>
        responsavel === undefined ? undefined : responsavel ? eq(col, responsavel) : isNull(col);
      const dia = hoje();
      return tx(async (t) => {
        const [auds, przs, tars] = await Promise.all([
          t
            .select({ a: audiencias, processo: processoCurto })
            .from(audiencias)
            .innerJoin(processos, eq(processos.id, audiencias.processoId))
            .where(and(ne(audiencias.situacao, "cancelada"), gte(audiencias.em, instanteLocal(f.de, "00:00", e.timezone)), lt(audiencias.em, instanteLocal(somarDias(ate, 1), "00:00", e.timezone)), dono(audiencias.responsavelId)))
            .orderBy(asc(audiencias.em)),
          t
            .select({ p: prazos, processo: processoCurto })
            .from(prazos)
            .innerJoin(processos, eq(processos.id, prazos.processoId))
            .where(and(eq(prazos.situacao, "aberto"), gte(prazos.fim, f.de), lte(prazos.fim, ate), dono(prazos.responsavelId)))
            .orderBy(asc(prazos.fim)),
          t
            .select({ t: tarefas, processo: processoCurto })
            .from(tarefas)
            .leftJoin(processos, eq(processos.id, tarefas.processoId))
            .where(and(gte(tarefas.dia, f.de), lte(tarefas.dia, ate), dono(tarefas.responsavelId)))
            .orderBy(asc(tarefas.dia)),
        ]);
        const dias = new Map<string, DiaDaAgenda>();
        const em = (d: Dia) => {
          let x = dias.get(d);
          if (!x) dias.set(d, (x = { dia: d, rotulo: rotuloDoDia(d, dia), itens: [] }));
          return x.itens;
        };
        for (const { a, processo } of auds) em(diaDoInstante(a.em, e.timezone)).push({ tipo: "audiencia", id: a.id, hora: horaLocal(a.em, e.timezone), titulo: nomeDaAudiencia(a.tipo), porVideo: a.porVideo, processo });
        for (const { p, processo } of przs) em(p.fim).push({ tipo: "prazo", id: p.id, titulo: p.tipo, urgencia: urgenciaDoPrazo(p, dia, cal) as UrgenciaNaIa, processo });
        for (const { t: tf, processo } of tars) em(tf.dia).push({ tipo: "tarefa", id: tf.id, titulo: tf.titulo, concluida: !!tf.concluidaEm, processo: processo?.id ? processo : null });
        return { dias: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)) };
      });
    },

    async clientes(f) {
      const onde: SQL[] = [];
      for (const p of palavras(f.busca)) {
        const digitos = p.replace(/\D/g, "");
        const porNumero =
          digitos.length >= 4 ? [ilike(clientes.documento, `%${digitos}%`), sql`regexp_replace(coalesce(${clientes.telefone}, ''), '\\D', '', 'g') like ${`%${digitos}%`}`] : [];
        onde.push(or(ilike(clientes.nome, termo(p)), ilike(clientes.email, termo(p)), ...porNumero)!);
      }
      if (!onde.length) throw new PedidoInvalido("Diga um nome, CPF/CNPJ ou telefone para buscar.");
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
        return {
          total: total?.n ?? 0,
          itens: linhas.map(({ c, processos: np }) => ({ id: c.id, nome: c.nome, tipo: c.tipo, documento: c.documento, telefone: c.telefone, email: c.email, processos: np })),
        };
      });
    },

    async cliente(id) {
      return tx(async (t) => {
        const [c] = await t.select().from(clientes).where(eq(clientes.id, id));
        if (!c) return null;
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
          cliente: { id: c.id, nome: c.nome, tipo: c.tipo, documento: c.documento, telefone: c.telefone, email: c.email, processos: ps.length, endereco: c.endereco, observacoes: c.observacoes },
          processos: ps,
          atendimentos: ats.map((a) => ({ em: diaDoInstante(a.em, e.timezone), canal: a.canal, resumo: curto(a.resumo, 600) })),
        };
      });
    },

    async documentos(f) {
      const onde: (SQL | undefined)[] = [];
      if (f.processoId) onde.push(eq(documentos.processoId, f.processoId));
      if (f.clienteId) onde.push(eq(documentos.clienteId, f.clienteId));
      const ps = palavras(f.busca);
      for (const p of ps) onde.push(or(ilike(documentos.nome, termo(p)), ilike(documentos.texto, termo(p))));
      const primeira = ps[0] ?? "";
      return tx(async (t) => {
        const trecho = primeira
          ? sql<string | null>`case when position(lower(${primeira}) in lower(coalesce(${documentos.texto}, ''))) > 0 then substring(${documentos.texto} from greatest(position(lower(${primeira}) in lower(${documentos.texto})) - 140, 1) for 320) end`
          : sql<string | null>`null`;
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
          texto: d.d.texto ? (d.d.texto.length > 60_000 ? `${d.d.texto.slice(0, 60_000)}\n[documento cortado aqui]` : d.d.texto) : null,
        };
      });
    },

    async alvaras(f) {
      const etapa = f.etapa ?? "pendentes";
      const onde: (SQL | undefined)[] = [];
      if (etapa === "pendentes") onde.push(inArray(alvaras.etapa, ["novo", "aguardando_saque", "sacado"]));
      else if (etapa !== "todos") onde.push(eq(alvaras.etapa, etapa));
      if (f.processoId) onde.push(eq(alvaras.processoId, f.processoId));
      return tx(async (t) => {
        const [linhas, [total]] = await Promise.all([
          t
            .select({ a: alvaras, processo: processoCurto })
            .from(alvaras)
            .innerJoin(processos, eq(processos.id, alvaras.processoId))
            .where(and(...onde))
            .orderBy(sql`${alvaras.expedidoEm} asc nulls last`, asc(alvaras.createdAt))
            .limit(f.limite ?? LIMITE),
          t.select({ n, valor: sql<string>`coalesce(sum(${alvaras.valor}), 0)::text` }).from(alvaras).where(and(...onde)),
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
      const onde = etapa === "todos" ? undefined : eq(negocios.etapa, etapa);
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
      return tx(async (t) => {
        const processo = await processoExiste(t, p.processoId);
        let tribunal: string | null = null;
        let comarca: string | null = null;
        if (processo) [{ tribunal, comarca } = { tribunal: null, comarca: null }] = await t.select({ tribunal: processos.tribunal, comarca: processos.comarca }).from(processos).where(eq(processos.id, processo.id));
        const cal = await calendarioDoEscritorio(t, tribunal ?? (await tribunalPadrao(t, e.organizationId)), comarca);
        const publicacao = p.publicadoEm ?? dataDaPublicacao(p.disponibilizadoEm!, cal);
        return { ...contagemNaTela(contarPrazo({ publicacao, dias: p.dias, contagem: p.contagem, calendario: cal })), processo };
      });
    },

    async proporTarefa(p) {
      const mapa = await pessoas();
      const responsavel = p.responsavel ? await quem(p.responsavel) : e.userId;
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
  };
}
