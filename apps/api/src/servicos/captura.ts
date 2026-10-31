/**
 * Captura automática: publicações do DJEN pelas OABs da equipe e andamentos
 * do DataJud pelos processos ativos. Cada rodada fica em `capturas`, com o
 * que achou e o erro, para a tela de Publicações dizer quando foi a última.
 */
import { dataDaPublicacao, diaDaSemana, ehDiaUtil, formatarDiaCurto, limparCnj, somarDias, tribunalDoCnj, type Dia } from "@decreta/core";
import { cadernosDjen, capturas, equipe, escritorios, movimentacoes, organization, partes, processos, publicacoes, withTenant, type Database, type Tx } from "@decreta/db";
import type { Armazenamento } from "@decreta/documentos";
import { buscarNoDataJud, buscarNoDjen, certidaoDoDjen, dataJudAtualizadoAte, lerCaderno, orgaoSemComarca, partesDoDjen, ultimosEnviosAoDjen, type ComunicacaoDjen, type OpcoesDjen } from "@decreta/tribunais";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { calendarioDoEscritorio } from "./calendario.ts";
import { comarcaDoDataJud, completarPartes } from "./consulta.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDaCaptura {
  db: Database;
  djen?: OpcoesDjen;
  datajudKey: string;
  fetch?: typeof fetch;
  log?: Log;
}

/** O ato é do juízo, das partes ou do cartório, pelo nome (a TPU não diz). */
export function autorDoAto(titulo: string): "juizo" | "partes" | "cartorio" | null {
  const t = titulo.toLowerCase();
  if (/decis|despach|senten|julg|saneamento|homolog|concedid|indeferid|deferid|liminar|tutela|ac[óo]rd[ãa]o/.test(t)) return "juizo";
  if (/peti[çc]|contesta|r[ée]plica|recurso|apela|contrarraz|manifesta|quesito|embargos|impugna|memoriais|alega/.test(t)) return "partes";
  if (/intima|cita|expedi|juntada|conclus|remessa|certid|publica|distribu|audi[êe]ncia|laudo/.test(t)) return "cartorio";
  return null;
}

/** Grava as comunicações novas. Devolve os ids das que entraram agora. */
export async function gravarComunicacoes(tx: Tx, organizationId: string, oab: string | null, itens: ComunicacaoDjen[]): Promise<string[]> {
  if (!itens.length) return [];
  const cnjs = [...new Set(itens.map((i) => i.cnj).filter((c): c is string => !!c))];
  const doEscritorio = cnjs.length ? await tx.select({ id: processos.id, cnj: processos.cnj }).from(processos).where(inArray(processos.cnj, cnjs)) : [];
  const processoDoCnj = new Map(doEscritorio.map((p) => [p.cnj!, p.id]));
  const calendarios = new Map<string, Awaited<ReturnType<typeof calendarioDoEscritorio>>>();
  const novas: string[] = [];
  const novasDoProcesso = new Map<string, ComunicacaoDjen[]>();
  for (const i of itens) {
    const tribunal = i.tribunal ?? (i.cnj ? tribunalDoCnj(i.cnj) : null) ?? "TJSC";
    let cal = calendarios.get(tribunal);
    if (!cal) calendarios.set(tribunal, (cal = await calendarioDoEscritorio(tx, tribunal)));
    const linha = await tx
      .insert(publicacoes)
      .values({
        organizationId,
        fonte: "djen",
        idExterno: i.idExterno,
        disponibilizadaEm: i.disponibilizadaEm,
        publicadaEm: dataDaPublicacao(i.disponibilizadaEm, cal),
        tribunal,
        orgao: i.orgao,
        tipoComunicacao: i.tipoComunicacao,
        tipoDocumento: i.tipoDocumento,
        classe: i.classe,
        cnj: i.cnj,
        processoId: i.cnj ? (processoDoCnj.get(i.cnj) ?? null) : null,
        texto: i.texto,
        destinatarios: i.destinatarios,
        advogados: i.advogados.length ? i.advogados : oab ? [{ nome: "", oab }] : [],
        link: i.link,
        hash: i.hash ?? null,
      })
      .onConflictDoNothing()
      .returning({ id: publicacoes.id });
    if (linha[0]) {
      novas.push(linha[0].id);
      const processoId = i.cnj ? processoDoCnj.get(i.cnj) : undefined;
      if (processoId && i.destinatarios.length) novasDoProcesso.set(processoId, [...(novasDoProcesso.get(processoId) ?? []), i]);
    }
  }
  // Ficha ainda sem a outra parte: as partes da publicação entram nela.
  for (const [processoId, lista] of novasDoProcesso) {
    const [{ n } = { n: 0 }] = await tx.select({ n: sql<number>`count(*)::int` }).from(partes).where(eq(partes.processoId, processoId));
    if (n < 2) await completarPartes(tx, organizationId, processoId, partesDoDjen(lista).partes);
  }
  return novas;
}

/** A demonstração nunca consulta o DJEN nem o DataJud (ver demonstracao/slug.ts). */
export async function ehDemonstracao(db: Database, organizationId: string): Promise<boolean> {
  const [o] = await db.select({ slug: organization.slug }).from(organization).where(eq(organization.id, organizationId));
  return o?.slug === SLUG_DA_DEMONSTRACAO;
}

/**
 * A certidão de publicação do DJEN, a prova da data: a guardada com o
 * escritório ou, na primeira vez, baixada e guardada. Nula quando não há
 * certidão (sem hash, a demonstração, ou o DJEN não achou); lança quando o
 * DJEN não respondeu, para quem pediu tentar de novo.
 */
export async function certidaoDaPublicacao(deps: { db: Database; arquivos: Armazenamento; fetch?: typeof fetch }, organizationId: string, publicacaoId: string): Promise<Uint8Array | null> {
  const [pub] = await withTenant(deps.db, organizationId, (tx) => tx.select({ hash: publicacoes.hash, certidao: publicacoes.certidao }).from(publicacoes).where(eq(publicacoes.id, publicacaoId)));
  if (!pub) return null;
  const guardada = pub.certidao ? await deps.arquivos.read(pub.certidao).catch(() => null) : null;
  if (guardada) return guardada;
  // A demonstração nunca consulta o DJEN (ver demonstracao/slug.ts).
  if (!pub.hash || (await ehDemonstracao(deps.db, organizationId))) return null;
  const baixada = await certidaoDoDjen(pub.hash, { fetch: deps.fetch });
  if (!baixada) return null;
  const chave = `${organizationId}/certidoes/${publicacaoId}.pdf`;
  await deps.arquivos.put(chave, baixada, "application/pdf");
  await withTenant(deps.db, organizationId, (tx) => tx.update(publicacoes).set({ certidao: chave }).where(eq(publicacoes.id, publicacaoId)));
  return baixada;
}

/** Busca no DJEN de `de` a `ate` por todas as OABs da equipe. */
export async function capturarDjen(deps: DepsDaCaptura, organizationId: string, periodo: { de: Dia; ate: Dia }): Promise<{ encontradas: number; novas: string[] }> {
  if (await ehDemonstracao(deps.db, organizationId)) return { encontradas: 0, novas: [] };
  const { oabs, ligado } = await withTenant(deps.db, organizationId, async (tx) => {
    const [e] = await tx.select({ ligado: escritorios.capturaDjen }).from(escritorios).where(eq(escritorios.organizationId, organizationId));
    const linhas = await tx.select({ numero: equipe.oabNumero, uf: equipe.oabUf }).from(equipe).where(isNotNull(equipe.oabNumero));
    return { ligado: e?.ligado ?? true, oabs: linhas.filter((l) => l.numero).map((l) => ({ numero: l.numero!, uf: l.uf ?? "SC" })) };
  });
  if (!ligado || !oabs.length) return { encontradas: 0, novas: [] };

  const [rodada] = await withTenant(deps.db, organizationId, (tx) => tx.insert(capturas).values({ organizationId, fonte: "djen" }).returning({ id: capturas.id }));
  let encontradas = 0;
  const novas: string[] = [];
  const erros: string[] = [];
  for (const oab of oabs) {
    try {
      const itens = await buscarNoDjen({ oab: oab.numero, uf: oab.uf, de: periodo.de, ate: periodo.ate }, { fetch: deps.fetch, ...deps.djen });
      encontradas += itens.length;
      novas.push(...(await withTenant(deps.db, organizationId, (tx) => gravarComunicacoes(tx, organizationId, `${oab.numero}/${oab.uf}`, itens))));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`OAB ${oab.numero}/${oab.uf}: ${msg}`);
      deps.log?.("captura do DJEN falhou", { organizationId, oab: `${oab.numero}/${oab.uf}`, error: msg });
    }
  }
  await withTenant(deps.db, organizationId, (tx) =>
    tx
      .update(capturas)
      .set({ terminadaEm: new Date(), encontradas, novas: novas.length, erro: erros.length ? erros.join("; ").slice(0, 1000) : null })
      .where(eq(capturas.id, rodada!.id)),
  );
  if (erros.length === oabs.length) throw new Error(`DJEN: ${erros.join("; ")}`);
  return { encontradas, novas };
}

/* ------------------------------------------------------------------ */

interface EscritorioNoCaderno {
  organizationId: string;
  /** Número só com dígitos e UF em maiúsculas. */
  oabs: { numero: string; uf: string }[];
  /** Números da carteira, só dígitos. */
  cnjs: Set<string>;
  tribunais: Set<string>;
  /** "TJSC/2026-10-28" → versão do caderno já lida. */
  lidos: Map<string, number>;
}

/** Os tribunais da carteira, o tribunal de justiça de cada OAB e os superiores, onde correm os recursos. */
function tribunaisDoCaderno(carteira: string[], ufsDasOabs: string[]): Set<string> {
  const t = new Set([...carteira, ...ufsDasOabs.map((uf) => (uf === "DF" ? "TJDFT" : `TJ${uf}`))]);
  const ramos = [...t];
  if (ramos.some((s) => /^TJ(?!M)|^TRF/.test(s))) t.add("STJ");
  if (ramos.some((s) => s.startsWith("TRT"))) t.add("TST");
  if (t.has("STJ") || t.has("TST")) t.add("STF");
  return t;
}

/** Os escritórios com a captura ligada, fora a demonstração (ver demonstracao/slug.ts). */
async function escritoriosDoCaderno(db: Database, dias: Dia[]): Promise<EscritorioNoCaderno[]> {
  const orgs = await db.select({ id: organization.id }).from(organization).where(ne(organization.slug, SLUG_DA_DEMONSTRACAO));
  const saida: EscritorioNoCaderno[] = [];
  for (const { id } of orgs) {
    const e = await withTenant(db, id, async (tx) => {
      const [esc] = await tx.select({ ligado: escritorios.capturaDjen }).from(escritorios).where(eq(escritorios.organizationId, id));
      if (esc && !esc.ligado) return null;
      const oabs = (await tx.select({ numero: equipe.oabNumero, uf: equipe.oabUf }).from(equipe).where(isNotNull(equipe.oabNumero)))
        .map((l) => ({ numero: l.numero!.replace(/\D/g, ""), uf: (l.uf ?? "SC").toUpperCase() }))
        .filter((o) => o.numero);
      const carteira = await tx.select({ cnj: processos.cnj, tribunal: processos.tribunal }).from(processos).where(isNotNull(processos.cnj));
      if (!oabs.length && !carteira.length) return null;
      const lidos = await tx
        .select({ tribunal: cadernosDjen.tribunal, dia: cadernosDjen.dia, versao: cadernosDjen.versao })
        .from(cadernosDjen)
        .where(and(inArray(cadernosDjen.dia, dias), eq(cadernosDjen.situacao, "lido"), isNotNull(cadernosDjen.versao)));
      return {
        organizationId: id,
        oabs,
        cnjs: new Set(carteira.map((p) => limparCnj(p.cnj!))),
        tribunais: tribunaisDoCaderno(
          carteira.map((p) => p.tribunal ?? tribunalDoCnj(p.cnj!)).filter((s): s is string => !!s),
          oabs.map((o) => o.uf),
        ),
        lidos: new Map(lidos.map((l) => [`${l.tribunal}/${l.dia}`, l.versao!])),
      };
    });
    if (e) saida.push(e);
  }
  return saida;
}

function ehDoEscritorio(e: EscritorioNoCaderno, c: ComunicacaoDjen): boolean {
  if (c.cnj && e.cnjs.has(limparCnj(c.cnj))) return true;
  return c.advogados.some((a) => a.oab && e.oabs.some((o) => o.numero === a.oab!.replace(/\D/g, "") && o.uf === (a.uf ?? "").toUpperCase()));
}

/** Caderno já lido continua lido: dia sem caderno ou erro numa versão nova não apagam a leitura. */
const manterLido = (nova: "ausente" | "erro") => sql<"lido" | "ausente" | "erro">`case when ${cadernosDjen.situacao} = 'lido' then ${cadernosDjen.situacao} else ${nova}::situacao_caderno end`;

export interface CadernoDaRodada {
  tribunal: string;
  dia: Dia;
  situacao: "lido" | "ausente" | "erro";
  versao: number | null;
}

/**
 * Captura pelo caderno diário do DJEN: o caderno de cada tribunal é baixado
 * uma vez para todos os escritórios, cruzado em memória com a OAB da equipe e
 * os números da carteira de cada um, e só o que casou é gravado; o resto é
 * descartado (LGPD). Versão nova do caderno é relida: a comunicação que o
 * tribunal cancelou fica marcada. Cada leitura fica em `cadernos_djen`.
 */
export async function capturarCadernos(deps: DepsDaCaptura, dias: Dia[]): Promise<{ cadernos: CadernoDaRodada[]; novas: { organizationId: string; publicacaoId: string }[] }> {
  const iniciadaEm = new Date();
  const todos = await escritoriosDoCaderno(deps.db, dias);
  const tribunais = [...new Set(todos.flatMap((e) => [...e.tribunais]))].sort();
  const cadernos: CadernoDaRodada[] = [];
  const novas: { organizationId: string; publicacaoId: string }[] = [];
  /** A rodada de cada escritório, para a tela dizer quando foi a última captura. */
  const rodada = new Map(todos.map((e) => [e.organizationId, { encontradas: 0, novas: 0, erros: [] as string[], tentativas: e.tribunais.size * dias.length }]));
  let falhas = 0;
  // Quando cada tribunal enviou ao DJEN pela última vez: a lista fora do ar não impede a leitura dos cadernos.
  const envios = tribunais.length
    ? await ultimosEnviosAoDjen({ fetch: deps.fetch, ...deps.djen }).catch((err: unknown) => {
        deps.log?.("lista de tribunais do DJEN falhou", { error: err instanceof Error ? err.message : String(err) });
        return new Map<string, Dia>();
      })
    : new Map<string, Dia>();

  for (const tribunal of tribunais) {
    const interessados = todos.filter((e) => e.tribunais.has(tribunal));
    const ultimoEnvio = envios.get(tribunal) ?? null;
    /** O último envio já visto não é apagado por uma rodada em que a lista falhou. */
    const comEnvio = ultimoEnvio ? { ultimoEnvio } : {};
    for (const dia of dias) {
      const versoes = interessados.map((e) => e.lidos.get(`${tribunal}/${dia}`));
      const versaoLida = versoes.every((v) => v != null) ? Math.min(...(versoes as number[])) : undefined;
      const conta = new Map(interessados.map((e) => [e.organizationId, { casadas: 0, novas: 0, canceladas: 0 }]));
      const registrar = (fn: (e: EscritorioNoCaderno, tx: Tx) => Promise<unknown>) => Promise.all(interessados.map((e) => withTenant(deps.db, e.organizationId, (tx) => fn(e, tx))));
      try {
        const caderno = await lerCaderno(
          tribunal,
          dia,
          async (lote, canceladas) => {
            for (const e of interessados) {
              const deles = lote.filter((c) => ehDoEscritorio(e, c));
              if (!deles.length && !canceladas.length) continue;
              const r = await withTenant(deps.db, e.organizationId, async (tx) => {
                const entraram = await gravarComunicacoes(tx, e.organizationId, null, deles);
                let marcadas = 0;
                if (canceladas.length) {
                  const motivo = new Map(canceladas.map((c) => [c.idExterno, c.motivo]));
                  const achadas = await tx
                    .select({ id: publicacoes.id, idExterno: publicacoes.idExterno })
                    .from(publicacoes)
                    .where(and(eq(publicacoes.fonte, "djen"), inArray(publicacoes.idExterno, [...motivo.keys()]), isNull(publicacoes.canceladaEm)));
                  for (const p of achadas) await tx.update(publicacoes).set({ canceladaEm: new Date(), motivoCancelamento: motivo.get(p.idExterno) ?? null }).where(eq(publicacoes.id, p.id));
                  marcadas = achadas.length;
                }
                return { entraram, marcadas };
              });
              const n = conta.get(e.organizationId)!;
              n.casadas += deles.length;
              n.novas += r.entraram.length;
              n.canceladas += r.marcadas;
              const doEscritorio = rodada.get(e.organizationId)!;
              doEscritorio.encontradas += deles.length;
              doEscritorio.novas += r.entraram.length;
              novas.push(...r.entraram.map((publicacaoId) => ({ organizationId: e.organizationId, publicacaoId })));
            }
          },
          { fetch: deps.fetch, ...deps.djen, versaoLida },
        );
        if (!caderno) {
          await registrar((e, tx) =>
            tx
              .insert(cadernosDjen)
              .values({ organizationId: e.organizationId, tribunal, dia, situacao: "ausente", ultimoEnvio })
              .onConflictDoUpdate({ target: [cadernosDjen.organizationId, cadernosDjen.tribunal, cadernosDjen.dia], set: { situacao: manterLido("ausente"), lidoEm: new Date(), ...comEnvio } }),
          );
          cadernos.push({ tribunal, dia, situacao: "ausente", versao: null });
          continue;
        }
        cadernos.push({ tribunal, dia, situacao: "lido", versao: caderno.versao });
        if (versaoLida != null && caderno.versao <= versaoLida) continue;
        await registrar((e, tx) => {
          const n = conta.get(e.organizationId)!;
          return tx
            .insert(cadernosDjen)
            .values({ organizationId: e.organizationId, tribunal, dia, situacao: "lido", versao: caderno.versao, total: caderno.total, ultimoEnvio, ...n })
            .onConflictDoUpdate({
              target: [cadernosDjen.organizationId, cadernosDjen.tribunal, cadernosDjen.dia],
              set: {
                situacao: "lido",
                versao: caderno.versao,
                total: caderno.total,
                casadas: n.casadas,
                novas: sql`${cadernosDjen.novas} + ${n.novas}`,
                canceladas: sql`${cadernosDjen.canceladas} + ${n.canceladas}`,
                erro: null,
                lidoEm: new Date(),
                ...comEnvio,
              },
            });
        });
      } catch (err) {
        falhas++;
        const erro = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        deps.log?.("caderno do DJEN falhou", { tribunal, dia, error: erro });
        for (const e of interessados) rodada.get(e.organizationId)!.erros.push(erro);
        await registrar((e, tx) =>
          tx
            .insert(cadernosDjen)
            .values({ organizationId: e.organizationId, tribunal, dia, situacao: "erro", erro, ultimoEnvio })
            .onConflictDoUpdate({ target: [cadernosDjen.organizationId, cadernosDjen.tribunal, cadernosDjen.dia], set: { situacao: manterLido("erro"), erro, lidoEm: new Date(), ...comEnvio } }),
        );
        cadernos.push({ tribunal, dia, situacao: "erro", versao: null });
      }
    }
  }
  // Falha num tribunal vira aviso na saúde da captura; a rodada só fica com erro quando nada pôde ser lido.
  for (const [organizationId, r] of rodada) {
    await withTenant(deps.db, organizationId, (tx) =>
      tx.insert(capturas).values({ organizationId, fonte: "djen", iniciadaEm, terminadaEm: new Date(), encontradas: r.encontradas, novas: r.novas, erro: r.erros.length === r.tentativas ? r.erros.join("; ").slice(0, 1000) : null }),
    );
  }
  if (falhas && falhas === tribunais.length * dias.length) throw new Error(`DJEN: nenhum caderno pôde ser lido (${falhas})`);
  return { cadernos, novas };
}

export interface TribunalNaCaptura {
  tribunal: string;
  /** A última leitura, qualquer que tenha sido o resultado. */
  ultimo: { dia: Dia; situacao: "lido" | "ausente" | "erro"; erro: string | null; em: string };
  /** O último caderno lido de fato. */
  lido: { dia: Dia; versao: number | null; total: number; casadas: number; canceladas: number; em: string } | null;
  /** O último envio do tribunal ao DJEN, pela lista do próprio DJEN (o STF não está nela). */
  envio: Dia | null;
}

export interface SaudeDaCaptura {
  tribunais: TribunalNaCaptura[];
  /** O que a equipe precisa saber: vai na tela de Publicações e no resumo da manhã. */
  alertas: string[];
  /** Publicações novas ou pendentes que não estão ligadas a processo nenhum: o prazo delas não conta sozinho. */
  semProcesso: number;
}

/** Os tribunais da carteira primeiro, os superiores depois. */
const SUPERIORES = new Set(["STF", "STJ", "TST", "TSE", "STM"]);
const porInstancia = (a: string, b: string) => Number(SUPERIORES.has(a)) - Number(SUPERIORES.has(b)) || a.localeCompare(b);

const REFORCO = "busca pela OAB das 12:40 e das 18:40";

/**
 * Como anda a captura pelo caderno, para o escritório. Os avisos olham o dia
 * útil anterior (a rodada de hoje relê o dia de ontem): caderno com erro,
 * tribunal que costuma publicar e ficou sem caderno num dia útil, e a leitura
 * parada. Tribunal que nunca publicou nada para o escritório não gera aviso.
 */
export async function saudeDaCaptura(tx: Tx, hoje: Dia): Promise<SaudeDaCaptura> {
  const linhas = await tx
    .select()
    .from(cadernosDjen)
    .where(and(sql`${cadernosDjen.dia} >= ${somarDias(hoje, -15)}`, sql`${cadernosDjen.dia} <= ${hoje}`))
    .orderBy(cadernosDjen.tribunal, sql`${cadernosDjen.dia} desc`);
  const [{ n: semProcesso } = { n: 0 }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(publicacoes)
    .where(and(isNull(publicacoes.processoId), isNull(publicacoes.canceladaEm), inArray(publicacoes.situacao, ["nova", "pendente"])));
  if (!linhas.length) return { tribunais: [], alertas: [], semProcesso };

  const [anterior] = diasDoCaderno(hoje) as [Dia, Dia];
  const alertas: string[] = [];
  const ultimoDia = linhas.reduce((m, l) => (l.dia > m ? l.dia : m), linhas[0]!.dia);
  if (ultimoDia < anterior) alertas.push(`A leitura dos cadernos do DJEN está parada desde ${formatarDiaCurto(ultimoDia)}. A ${REFORCO} continua.`);

  const tribunais: TribunalNaCaptura[] = [];
  for (const tribunal of [...new Set(linhas.map((l) => l.tribunal))].sort(porInstancia)) {
    const doTribunal = linhas.filter((l) => l.tribunal === tribunal);
    const u = doTribunal[0]!;
    const l = doTribunal.find((x) => x.situacao === "lido");
    const envio = doTribunal.reduce<Dia | null>((m, x) => (x.ultimoEnvio && (!m || x.ultimoEnvio > m) ? x.ultimoEnvio : m), null);
    tribunais.push({
      tribunal,
      ultimo: { dia: u.dia, situacao: u.situacao, erro: u.erro, em: u.lidoEm.toISOString() },
      lido: l ? { dia: l.dia, versao: l.versao, total: l.total, casadas: l.casadas, canceladas: l.canceladas, em: l.lidoEm.toISOString() } : null,
      envio,
    });
    const comErro = doTribunal.find((x) => x.situacao === "erro" && x.dia >= anterior);
    if (comErro) {
      alertas.push(`Não deu para ler o caderno do ${tribunal} de ${formatarDiaCurto(comErro.dia)} no DJEN. Tento de novo na próxima leitura; a ${REFORCO} cobre o dia.`);
      continue;
    }
    const doAnterior = doTribunal.find((x) => x.dia === anterior);
    const costumaPublicar = doTribunal.some((x) => x.situacao === "lido" && x.total > 0);
    if (doAnterior?.situacao === "ausente" && costumaPublicar && ehDiaUtil(anterior, await calendarioDoEscritorio(tx, tribunal))) {
      const desde = envio && envio < anterior ? `: o último envio do tribunal foi em ${formatarDiaCurto(envio)}` : "";
      alertas.push(`O ${tribunal} não publicou o caderno de ${formatarDiaCurto(anterior)} no DJEN${desde}. A ${REFORCO} cobre o dia.`);
    }
  }
  return { tribunais, alertas, semProcesso };
}

/** Os cadernos da rodada da madrugada: o de hoje e o do dia útil anterior, que pode ter ganhado versão nova. */
export function diasDoCaderno(hoje: Dia): Dia[] {
  let antes = somarDias(hoje, -1);
  while (diaDaSemana(antes) === 0 || diaDaSemana(antes) === 6) antes = somarDias(antes, -1);
  return [antes, hoje];
}

/** Período da busca do dia: os últimos 3 dias cobrem fim de semana e uma rodada perdida (repetida não entra duas vezes). */
export function periodoDaCaptura(hoje: Dia): { de: Dia; ate: Dia } {
  return { de: somarDias(hoje, -3), ate: hoje };
}

/** Andamentos do DataJud de um processo. Devolve quantos entraram. */
export async function atualizarDoDataJud(deps: DepsDaCaptura, organizationId: string, processoId: string): Promise<number> {
  if (await ehDemonstracao(deps.db, organizationId)) return 0;
  const p = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(processos).where(eq(processos.id, processoId)))[0]);
  if (!p?.cnj || limparCnj(p.cnj).length !== 20) return 0;
  const dados = await buscarNoDataJud(p.cnj, { apiKey: deps.datajudKey, fetch: deps.fetch });
  if (!dados) {
    await withTenant(deps.db, organizationId, (tx) => tx.update(processos).set({ datajudEm: new Date() }).where(eq(processos.id, processoId)));
    return 0;
  }
  const comarca = p.comarca ?? (await comarcaDoDataJud(dados, deps.fetch));
  return withTenant(deps.db, organizationId, async (tx) => {
    let novas = 0;
    for (const m of dados.movimentos) {
      const r = await tx
        .insert(movimentacoes)
        .values({ organizationId, processoId, em: new Date(m.em), titulo: m.titulo, descricao: m.descricao, codigo: m.codigo, autor: autorDoAto(m.titulo), fonte: "datajud", chave: m.chave })
        .onConflictDoNothing()
        .returning({ id: movimentacoes.id });
      novas += r.length;
    }
    const ultima = dados.movimentos.at(-1)?.em;
    await tx
      .update(processos)
      .set({
        datajudEm: new Date(),
        datajudAtualizadoEm: dados.atualizadoEm ? new Date(dados.atualizadoEm) : p.datajudAtualizadoEm,
        classe: p.classe ?? dados.classe,
        assunto: p.assunto ?? dados.assunto,
        orgao: p.orgao ?? orgaoSemComarca(dados.orgao),
        distribuidoEm: p.distribuidoEm ?? dados.distribuidoEm,
        comarca,
        sistema: p.sistema ?? dados.sistema,
        tribunal: p.tribunal ?? tribunalDoCnj(p.cnj!),
        segredo: p.segredo || dados.sigilo,
        ultimaMovimentacaoEm: ultima && (!p.ultimaMovimentacaoEm || new Date(ultima) > p.ultimaMovimentacaoEm) ? new Date(ultima) : p.ultimaMovimentacaoEm,
      })
      .where(eq(processos.id, processoId));
    return novas;
  });
}

/**
 * Até quando o DataJud tem dados de cada tribunal da carteira (o maior
 * `@timestamp` do índice), guardado no escritório para a ficha do processo
 * dizer de quando são os andamentos. Uma consulta por tribunal; o que não
 * respondeu fica com a conferência anterior.
 */
export async function conferirDataJudDoEscritorio(deps: DepsDaCaptura, organizationId: string): Promise<Record<string, string>> {
  if (await ehDemonstracao(deps.db, organizationId)) return {};
  const { cnjs, antes } = await withTenant(deps.db, organizationId, async (tx) => ({
    cnjs: await tx
      .selectDistinct({ cnj: processos.cnj })
      .from(processos)
      .where(and(eq(processos.situacao, "ativo"), eq(processos.tipo, "judicial"), isNotNull(processos.cnj))),
    antes: (await tx.select({ ate: escritorios.datajudAte }).from(escritorios).where(eq(escritorios.organizationId, organizationId)))[0]?.ate ?? {},
  }));
  /** Um número de cada tribunal basta: o índice é do tribunal. */
  const porTribunal = new Map<string, string>();
  for (const { cnj } of cnjs) {
    const tribunal = cnj ? tribunalDoCnj(cnj) : null;
    if (tribunal && !porTribunal.has(tribunal)) porTribunal.set(tribunal, cnj!);
  }
  const ate = { ...antes };
  for (const [tribunal, cnj] of porTribunal) {
    const em = await dataJudAtualizadoAte(cnj, { apiKey: deps.datajudKey, fetch: deps.fetch }).catch((err: unknown) => {
      deps.log?.("índice do DataJud falhou", { organizationId, tribunal, error: err instanceof Error ? err.message : String(err) });
      return null;
    });
    if (em) ate[tribunal] = em;
  }
  await withTenant(deps.db, organizationId, (tx) => tx.update(escritorios).set({ datajudAte: ate }).where(eq(escritorios.organizationId, organizationId)));
  return ate;
}

/** Processos ativos com CNJ que não passam pelo DataJud há mais de `horas`. */
export async function processosParaAtualizar(db: Database, organizationId: string, horas = 20, limite = 300): Promise<string[]> {
  return withTenant(db, organizationId, async (tx) => {
    const linhas = await tx
      .select({ id: processos.id })
      .from(processos)
      .where(
        and(
          eq(processos.situacao, "ativo"),
          eq(processos.tipo, "judicial"),
          isNotNull(processos.cnj),
          sql`(${processos.datajudEm} is null or ${processos.datajudEm} < now() - make_interval(hours => ${horas}))`,
        ),
      )
      .orderBy(sql`${processos.datajudEm} asc nulls first`)
      .limit(limite);
    return linhas.map((l) => l.id);
  });
}

