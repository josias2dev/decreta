/**
 * O primeiro minuto: ao informar a OAB, o Decreta busca os últimos dias no DJEN
 * na hora, em vez de esperar a próxima rodada, e a tela acompanha pela última
 * captura: quantas publicações achou, quantas têm prazo e a leitura da IA, que
 * chega aos poucos. Usa a mesma captura de sempre (`capturarDjen`), com a pausa
 * entre páginas e a espera no 429 que ela já respeita.
 */
import { diaDaSemana, hojeEm, horaLocal, nomeDoDiaDaSemana, somarDias, type Dia } from "@decreta/core";
import { analises, capturas, publicacoes, type Tx } from "@decreta/db";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import { capturarDjen, type DepsDaCaptura } from "./captura.ts";
import { tituloDaPublicacao } from "./publicacoes.ts";

/** Quantos dias para trás a primeira busca olha. */
export const DIAS_DA_PRIMEIRA_BUSCA = 7;
/** A IA lê na hora só estas; as outras ficam para a rotina de cada hora (reler-publicacoes). Segura o gasto de quem acabou de chegar. */
export const LEITURAS_NA_HORA = 20;
const ITENS_NA_TELA = 5;

/** A rodada da OAB. Busca os últimos dias e devolve o que `capturarDjen` devolve. */
export function executarPrimeiraBusca(deps: DepsDaCaptura, organizationId: string, hoje: Dia) {
  return capturarDjen(deps, organizationId, { de: somarDias(hoje, -DIAS_DA_PRIMEIRA_BUSCA), ate: hoje });
}

/** As rodadas de sempre (ver inngest.ts): o caderno às 04:30 e a OAB às 12:40 e às 18:40, de segunda a sexta. */
const RODADAS = ["04:30", "12:40", "18:40"];

/** "hoje, às 12:40", "amanhã, às 04:30", "segunda-feira, às 04:30". */
export function proximaBusca(agora: Date = new Date()): string {
  const hoje = hojeEm("America/Sao_Paulo", agora);
  const hora = horaLocal(agora, "America/Sao_Paulo");
  const util = (d: Dia) => diaDaSemana(d) !== 0 && diaDaSemana(d) !== 6;
  if (util(hoje)) {
    const ainda = RODADAS.find((r) => r > hora);
    if (ainda) return `hoje, às ${ainda}`;
  }
  let dia = somarDias(hoje, 1);
  while (!util(dia)) dia = somarDias(dia, 1);
  return `${dia === somarDias(hoje, 1) ? "amanhã" : nomeDoDiaDaSemana(dia)}, às ${RODADAS[0]}`;
}

export type LeituraNaBusca = "lendo" | "com_prazo" | "sem_prazo" | "sem_leitura";

export interface ItemDaBusca {
  id: string;
  titulo: string;
  tribunal: string | null;
  disponibilizadaEm: Dia;
  leitura: LeituraNaBusca;
  /** "Manifestação sobre laudo · 15 dias úteis", na publicação com prazo. */
  prazo: string | null;
}

export interface ProgressoDaBusca {
  situacao: "na_fila" | "buscando" | "pronta" | "falhou";
  encontradas: number;
  novas: number;
  lidas: number;
  comPrazo: number;
  iaLigada: boolean;
  itens: ItemDaBusca[];
  erro: string | null;
  proximaBusca: string;
}

type ConteudoDaLeitura = { geraPrazo?: boolean; tipo?: string; dias?: number | null; contagem?: string };

function textoDoPrazo(c: ConteudoDaLeitura): string | null {
  if (!c.geraPrazo) return null;
  const dias = c.dias ? `${c.dias} ${c.dias === 1 ? "dia" : "dias"} ${c.contagem === "corridos" ? (c.dias === 1 ? "corrido" : "corridos") : c.dias === 1 ? "útil" : "úteis"}` : null;
  return [c.tipo, dias].filter(Boolean).join(" · ") || null;
}

/** O andamento da busca pedida em `desde`: a última rodada desde então e as publicações que entraram com ela. */
export async function progressoDaBusca(tx: Tx, desde: Date, iaLigada: boolean, agora: Date = new Date()): Promise<ProgressoDaBusca> {
  const [rodada] = await tx.select().from(capturas).where(and(eq(capturas.fonte, "djen"), gte(capturas.iniciadaEm, desde))).orderBy(desc(capturas.iniciadaEm)).limit(1);
  const base = { iaLigada, proximaBusca: proximaBusca(agora) };
  if (!rodada) return { situacao: "na_fila", encontradas: 0, novas: 0, lidas: 0, comPrazo: 0, itens: [], erro: null, ...base };

  const novas = await tx
    .select({ id: publicacoes.id, tipo: publicacoes.tipoComunicacao, tribunal: publicacoes.tribunal, disponibilizadaEm: publicacoes.disponibilizadaEm })
    .from(publicacoes)
    .where(and(eq(publicacoes.fonte, "djen"), gte(publicacoes.createdAt, desde)))
    .orderBy(desc(publicacoes.disponibilizadaEm));
  const leituras = novas.length
    ? await tx
        .select({ alvoId: analises.alvoId, situacao: analises.situacao, conteudo: analises.conteudo })
        .from(analises)
        .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, novas.map((p) => p.id))))
        .orderBy(desc(analises.createdAt))
    : [];
  // A mais recente de cada publicação vem primeiro.
  const ultima = new Map<string, (typeof leituras)[number]>();
  for (const l of leituras) if (!ultima.has(l.alvoId)) ultima.set(l.alvoId, l);

  const itens = novas.map((p): ItemDaBusca => {
    const l = ultima.get(p.id);
    const conteudo = (l?.conteudo ?? {}) as ConteudoDaLeitura;
    const leitura: LeituraNaBusca = !l ? (iaLigada ? "lendo" : "sem_leitura") : l.situacao === "erro" ? "sem_leitura" : conteudo.geraPrazo ? "com_prazo" : "sem_prazo";
    return { id: p.id, titulo: tituloDaPublicacao(p.tipo, null), tribunal: p.tribunal, disponibilizadaEm: p.disponibilizadaEm, leitura, prazo: leitura === "com_prazo" ? textoDoPrazo(conteudo) : null };
  });

  const terminou = !!rodada.terminadaEm;
  const falhou = terminou && !!rodada.erro && rodada.encontradas === 0;
  return {
    situacao: !terminou ? "buscando" : falhou ? "falhou" : "pronta",
    encontradas: rodada.encontradas,
    novas: rodada.novas,
    lidas: itens.filter((i) => i.leitura === "com_prazo" || i.leitura === "sem_prazo").length,
    comPrazo: itens.filter((i) => i.leitura === "com_prazo").length,
    // As que já têm leitura primeiro: é o que muda na tela.
    itens: [...itens].sort((a, b) => Number(b.leitura === "com_prazo") - Number(a.leitura === "com_prazo")).slice(0, ITENS_NA_TELA),
    erro: falhou ? rodada.erro : null,
    ...base,
  };
}
