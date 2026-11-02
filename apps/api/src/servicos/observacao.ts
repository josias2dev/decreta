/**
 * O modo observar: antes de trocar o modelo ou o prompt da sugestão de prazo, o
 * candidato lê as mesmas publicações em paralelo. A leitura dele fica à parte,
 * nunca vira prazo nem aparece em tela. Quando a pessoa decide, o placar diz
 * quem acertou: o modelo atual ou o candidato. Acertar é dizer se gera prazo e,
 * se gera, os dias e a contagem; a data sai do motor de prazos nos dois casos.
 */
import { analises, observacoesDaIa, organization, prazos, publicacoes, usoIa, withTenant, type Database, type LeituraDoCandidato } from "@decreta/db";
import { colherChamadas, IaRecusou, impressao, INSTRUCOES_DO_PRAZO_EM_OBSERVACAO, sugerirPrazo, type ChamadaDaIa, type Ia, type PrecoDeReferencia } from "@decreta/ia";
import { and, desc, eq, gte, inArray, ne, sql } from "drizzle-orm";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { ClienteSemIa, contextoParaIa } from "./contexto.ts";
import { procedenciaDe } from "./procedencia.ts";
import { ehDaDemonstracao, iaMedida, inicioDoDia } from "./uso-ia.ts";

/** Por escritório: a observação gasta do mesmo teto do gateway que lê os prazos de verdade. */
export const OBSERVACOES_POR_DIA = 30;

export interface Observacao {
  ia: Ia;
  candidato: string;
  instrucoes?: string;
}

/** Como o candidato aparece no placar: o mesmo alias com outro prompt é outro candidato. */
export function candidatoDoPrazo(modelo: string, instrucoes: string | null = INSTRUCOES_DO_PRAZO_EM_OBSERVACAO): Pick<Observacao, "candidato" | "instrucoes"> {
  return instrucoes ? { candidato: `${modelo} + prompt ${impressao(instrucoes).slice(0, 12)}`, instrucoes } : { candidato: modelo };
}

interface Deps {
  db: Database;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  preco?: PrecoDeReferencia;
}

export type ResultadoDaObservacao = "observada" | "ja-observada" | "sem-publicacao" | "limite-do-dia" | "demonstracao" | "cliente-sem-ia" | "falhou";

/** Nunca lança: nada que aconteça aqui pode atrapalhar a leitura de verdade. */
export async function observarPrazo(deps: Deps, observacao: Observacao, organizationId: string, publicacaoId: string): Promise<ResultadoDaObservacao> {
  try {
    if (await ehDaDemonstracao(deps.db, organizationId)) return "demonstracao";
    const preparo = await withTenant(deps.db, organizationId, async (tx) => {
      const [ja] = await tx.select({ id: observacoesDaIa.id }).from(observacoesDaIa).where(and(eq(observacoesDaIa.publicacaoId, publicacaoId), eq(observacoesDaIa.candidato, observacao.candidato)));
      if (ja) return "ja-observada" as const;
      const [hoje] = await tx.select({ n: sql<number>`count(*)::int` }).from(observacoesDaIa).where(gte(observacoesDaIa.createdAt, inicioDoDia(new Date())));
      if (hoje!.n >= OBSERVACOES_POR_DIA) return "limite-do-dia" as const;
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
      if (!pub) return "sem-publicacao" as const;
      return { pub, contexto: pub.processoId ? (await contextoParaIa(tx, pub.processoId))?.texto : undefined };
    });
    if (typeof preparo === "string") return preparo;

    const { pub, contexto } = preparo;
    const ia = iaMedida(deps, observacao.ia, { organizationId, userId: null, origem: "fundo" }, deps.preco);
    const chamadas: ChamadaDaIa[] = [];
    let situacao: "pronto" | "recusa" | "erro" = "pronto";
    let conteudo: LeituraDoCandidato | null = null;
    let erro: string | null = null;
    try {
      const s = await colherChamadas(chamadas, () =>
        sugerirPrazo(
          ia,
          { publicacao: { texto: pub.texto, tipoComunicacao: pub.tipoComunicacao, tipoDocumento: pub.tipoDocumento, orgao: pub.orgao, publicadaEm: pub.publicadaEm }, contextoDoProcesso: contexto },
          undefined,
          { metodo: "observar-prazo", instrucoes: observacao.instrucoes },
        ),
      );
      conteudo = { geraPrazo: s.geraPrazo, tipo: s.tipo, dias: s.dias, contagem: s.contagem };
    } catch (err) {
      situacao = err instanceof IaRecusou ? "recusa" : "erro";
      erro = err instanceof Error ? err.message.slice(0, 500) : String(err);
    }
    await withTenant(deps.db, organizationId, (tx) =>
      tx.insert(observacoesDaIa).values({ organizationId, publicacaoId, candidato: observacao.candidato, situacao, conteudo, erro, procedencia: procedenciaDe(chamadas) }).onConflictDoNothing(),
    );
    return "observada";
  } catch (err) {
    if (err instanceof ClienteSemIa) return "cliente-sem-ia";
    deps.log?.("observação da IA falhou", { publicacaoId, error: err instanceof Error ? err.message : String(err) });
    return "falhou";
  }
}

/* ---------------- Placar ---------------- */

interface Notas {
  acertos: number;
  erros: number;
  recusas: number;
}

export interface PlacarDoCandidato {
  candidato: string;
  observadas: number;
  /** A pessoa ainda não decidiu. */
  aguardando: number;
  /** O candidato não respondeu: não entra na comparação. */
  falhas: number;
  decididas: number;
  atual: Notas;
  novo: Notas;
  soONovoAcertou: number;
  soOAtualAcertou: number;
}

export interface PlacarDaObservacao {
  candidatos: PlacarDoCandidato[];
  gastoUsd: number;
}

type Decisao = { gera: false } | { gera: true; dias: number; contagem: string };
type Nota = keyof Notas;

/** O que a pessoa decidiu: o prazo como ficou depois de confirmado, o descarte ou "Não gera prazo". */
function decisaoDaPessoa(situacaoDaPublicacao: string, prazo: { dias: number; contagem: string; situacao: string; confirmadoEm: Date | null } | undefined): Decisao | null {
  if (prazo?.situacao === "descartado") return { gera: false };
  if (prazo?.confirmadoEm) return { gera: true, dias: prazo.dias, contagem: prazo.contagem };
  return !prazo && situacaoDaPublicacao === "lida" ? { gera: false } : null;
}

function notaDaLeitura(leitura: { situacao: string; conteudo: { geraPrazo?: boolean; dias?: number | null; contagem?: string | null } | null } | undefined, decisao: Decisao): Nota {
  if (!leitura?.conteudo || leitura.situacao !== "pronto") return "recusas";
  const { geraPrazo, dias, contagem } = leitura.conteudo;
  const gera = !!geraPrazo && !!dias;
  if (gera !== decisao.gera) return "erros";
  return !decisao.gera || (dias === decisao.dias && contagem === decisao.contagem) ? "acertos" : "erros";
}

const placarVazio = (candidato: string): PlacarDoCandidato => ({
  candidato,
  observadas: 0,
  aguardando: 0,
  falhas: 0,
  decididas: 0,
  atual: { acertos: 0, erros: 0, recusas: 0 },
  novo: { acertos: 0, erros: 0, recusas: 0 },
  soONovoAcertou: 0,
  soOAtualAcertou: 0,
});

/** O placar de todos os escritórios, só com contagens: nada de cliente sai daqui. */
export async function placarDaObservacao(db: Database): Promise<PlacarDaObservacao> {
  const placares = new Map<string, PlacarDoCandidato>();
  let gastoUsd = 0;
  const escritorios = await db.select({ id: organization.id }).from(organization).where(ne(organization.slug, SLUG_DA_DEMONSTRACAO));
  for (const { id } of escritorios) {
    await withTenant(db, id, async (tx) => {
      const [gasto] = await tx.select({ usd: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)::float8` }).from(usoIa).where(eq(usoIa.metodo, "observar-prazo"));
      gastoUsd += gasto!.usd;
      const observacoes = await tx.select().from(observacoesDaIa);
      if (!observacoes.length) return;
      const ids = [...new Set(observacoes.map((o) => o.publicacaoId))];
      const situacoes = new Map((await tx.select({ id: publicacoes.id, situacao: publicacoes.situacao }).from(publicacoes).where(inArray(publicacoes.id, ids))).map((p) => [p.id, p.situacao]));
      const prazosDe = new Map(
        (await tx.select({ publicacaoId: prazos.publicacaoId, dias: prazos.dias, contagem: prazos.contagem, situacao: prazos.situacao, confirmadoEm: prazos.confirmadoEm }).from(prazos).where(inArray(prazos.publicacaoId, ids))).map((p) => [p.publicacaoId, p]),
      );
      // A leitura do modelo atual que valeu: a última que respondeu.
      const leituras = new Map(
        (
          await tx
            .selectDistinctOn([analises.alvoId], { alvoId: analises.alvoId, situacao: analises.situacao, conteudo: analises.conteudo })
            .from(analises)
            .where(and(eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, ids), ne(analises.situacao, "erro")))
            .orderBy(analises.alvoId, desc(analises.createdAt))
        ).map((a) => [a.alvoId, a]),
      );
      for (const o of observacoes) {
        const p = placares.get(o.candidato) ?? placarVazio(o.candidato);
        placares.set(o.candidato, p);
        p.observadas++;
        if (o.situacao === "erro") {
          p.falhas++;
          continue;
        }
        const decisao = decisaoDaPessoa(situacoes.get(o.publicacaoId) ?? "", prazosDe.get(o.publicacaoId));
        if (!decisao) {
          p.aguardando++;
          continue;
        }
        p.decididas++;
        const atual = notaDaLeitura(leituras.get(o.publicacaoId), decisao);
        const novo = notaDaLeitura(o, decisao);
        p.atual[atual]++;
        p.novo[novo]++;
        if (novo === "acertos" && atual !== "acertos") p.soONovoAcertou++;
        if (atual === "acertos" && novo !== "acertos") p.soOAtualAcertou++;
      }
    });
  }
  return { candidatos: [...placares.values()], gastoUsd };
}

export function placarEmTexto(p: PlacarDaObservacao): string {
  if (!p.candidatos.length) return "Nenhuma leitura em observação ainda.";
  const notas = (n: Notas) => `${n.acertos} acertos, ${n.erros} erros, ${n.recusas} recusas`;
  const blocos = p.candidatos.map((c) =>
    [
      `Candidato: ${c.candidato}`,
      `Leituras observadas: ${c.observadas} (${c.aguardando} aguardando a pessoa, ${c.falhas} com falha do candidato)`,
      `Decididas pela pessoa: ${c.decididas}`,
      `Modelo atual: ${notas(c.atual)}`,
      `Candidato: ${notas(c.novo)}`,
      `Só o candidato acertou: ${c.soONovoAcertou}`,
      `Só o modelo atual acertou: ${c.soOAtualAcertou}`,
    ].join("\n"),
  );
  return [...blocos, `Gasto total da observação: US$ ${p.gastoUsd.toFixed(2)}`].join("\n\n");
}
