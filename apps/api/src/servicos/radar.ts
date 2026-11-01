/**
 * Radar de precedentes × carteira (Fase 5.4). Duas vezes por mês o BNP é
 * sincronizado inteiro nas espécies que vinculam (repercussão geral,
 * vinculantes, súmulas, IRR, IRDR, IAC); o que mudou vira "novidade". O radar
 * liga cada novidade aos processos do escritório que ela pode afetar: mesmo
 * alcance de tribunal e o assunto do processo dentro da questão julgada.
 *
 * É um "confira", não um parecer: o advogado lê o precedente e descarta o que
 * não serve. O BNP é consulta pública (Res. CNJ 444/2022), um pedido por segundo.
 */
import { acervoDocumentos, acervoNovidades, organization, processos, radarPrecedentes, withTenant, type Database } from "@decreta/db";
import { listarNoBnp, type PrecedenteDoBnp } from "@decreta/tribunais";
import { and, eq, gte, inArray, isNotNull, like, not, or, sql } from "drizzle-orm";
import { guardarPrecedente } from "./acervo.ts";

type Log = (msg: string, extra?: Record<string, unknown>) => void;

export interface DepsDoRadar {
  db: Database;
  fetch?: typeof fetch;
  log?: Log;
  dormir?: (ms: number) => Promise<void>;
  agora?: Date;
}

/** O que o plano pede do BNP. Os repetitivos do STJ vêm pelo Temas.csv, toda semana. */
const ESPECIES = [
  ...["RG", "SV", "SUM"].map((tipo) => ({ orgao: "STF", tipo })),
  ...["SUM", "IAC", "SIRDR"].map((tipo) => ({ orgao: "STJ", tipo })),
  ...["IRR", "IAC"].map((tipo) => ({ orgao: "TST", tipo })),
  ...["TJSC", "TRT12", "TRF04"].flatMap((orgao) => ["IRDR", "IAC"].map((tipo) => ({ orgao, tipo }))),
];

/** Precedente novo no acervo só é novidade se mudou no BNP nos últimos 30 dias: a primeira carga não vira enxurrada. */
const JANELA_DE_NOVO_DIAS = 30;
const PAUSA_MS = 1000;

/** A chave da citação: a mesma que o "Verificar peça" usa ("sumula:STJ:297", "tema:STF:69", "irdr:TJSC:37"). */
function chaveDoPrecedente(p: Pick<PrecedenteDoBnp, "orgao" | "tipo" | "numero">): string {
  // O BNP escreve o TRF com dois dígitos ("TRF04"); o Decreta, como o CNJ, "TRF4".
  const orgao = p.orgao.replace(/^TRF0(\d)$/, "TRF$1");
  if (p.tipo === "RG") return `tema:${orgao}:${p.numero}`;
  if (p.tipo === "SV") return `sumula_vinculante:${orgao}:${p.numero}`;
  if (p.tipo === "SUM") return `sumula:${orgao}:${p.numero}`;
  return `${p.tipo.toLowerCase()}:${orgao}:${p.numero}`;
}

/** "IRDR 37 do TJSC", "Tema 69 da Repercussão Geral (STF)". */
export function rotuloDoPrecedente(chave: string): string {
  const [tipo, orgao, numero] = chave.split(":") as [string, string, string];
  if (tipo === "tema" && orgao === "STF") return `Tema ${numero} da Repercussão Geral (STF)`;
  if (tipo === "tema") return `Tema ${numero} do ${orgao}`;
  if (tipo === "sumula_vinculante") return `Súmula Vinculante ${numero}`;
  if (tipo === "sumula") return `Súmula ${numero} do ${orgao}`;
  if (tipo === "sirdr") return `Suspensão em IRDR ${numero} (STJ)`;
  return `${tipo.toUpperCase()} ${numero} do ${orgao}`;
}

const diaMenos = (d: Date, dias: number) => new Date(d.getTime() - dias * 86_400_000).toISOString().slice(0, 10);

/**
 * Sincroniza as espécies do BNP no acervo e anota as novidades. Uma espécie que
 * falha não apaga nada: o acervo fica com a última versão dela, as outras
 * seguem, e o erro sobe no fim para a rotina tentar de novo.
 */
export async function sincronizarPrecedentesDoBnp(deps: DepsDoRadar): Promise<{ precedentes: number; novidades: number }> {
  const dormir = deps.dormir ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const recente = diaMenos(deps.agora ?? new Date(), JANELA_DE_NOVO_DIAS);
  const falhas: string[] = [];
  let precedentes = 0;
  let novidades = 0;
  for (const [i, especie] of ESPECIES.entries()) {
    if (i > 0) await dormir(PAUSA_MS);
    let lista: PrecedenteDoBnp[];
    try {
      lista = await listarNoBnp(especie, { fetch: deps.fetch, dormir, pausa: PAUSA_MS });
    } catch (e) {
      deps.log?.("radar: o BNP não respondeu", { ...especie, erro: String(e) });
      falhas.push(`${especie.orgao}/${especie.tipo}`);
      continue;
    }
    if (!lista.length) continue;
    const chaves = lista.map(chaveDoPrecedente);
    const antes = new Map((await deps.db.select({ chave: acervoDocumentos.chave, situacao: acervoDocumentos.situacao }).from(acervoDocumentos).where(inArray(acervoDocumentos.chave, chaves))).map((d) => [d.chave, d.situacao]));
    const novas: (typeof acervoNovidades.$inferInsert)[] = [];
    for (const [j, p] of lista.entries()) {
      const chave = chaves[j]!;
      const situacaoAntes = antes.get(chave);
      const mudou = situacaoAntes !== undefined ? situacaoAntes !== p.situacao : (p.atualizadoEm ?? "") >= recente;
      if (mudou && p.situacao) novas.push({ chave, situacaoAntes: situacaoAntes ?? null, situacao: p.situacao });
      await guardarPrecedente(deps.db, chave, p);
    }
    if (novas.length) await deps.db.insert(acervoNovidades).values(novas);
    precedentes += lista.length;
    novidades += novas.length;
  }
  if (falhas.length) throw new Error(`O BNP não respondeu para ${falhas.join(", ")}`);
  return { precedentes, novidades };
}

/** Que processos o precedente pode alcançar, pelo tribunal. */
function alcance(orgao: string) {
  const trabalhista = or(like(processos.tribunal, "TRT%"), eq(processos.tribunal, "TST"))!;
  if (orgao === "STF") return isNotNull(processos.tribunal);
  if (orgao === "STJ") return and(isNotNull(processos.tribunal), not(trabalhista));
  if (orgao === "TST") return trabalhista;
  return eq(processos.tribunal, orgao);
}

/**
 * Liga as novidades desde `desde` aos processos de cada escritório. Devolve
 * quantos avisos novos nasceram; o aviso que já existe (ou foi descartado) não
 * se repete.
 */
export async function cruzarRadar(deps: Pick<DepsDoRadar, "db" | "log">, desde: Date): Promise<{ avisos: number }> {
  const novidades = await deps.db
    .select({ chave: acervoNovidades.chave, antes: acervoNovidades.situacaoAntes, situacao: acervoNovidades.situacao, questao: acervoDocumentos.questao, texto: acervoDocumentos.texto, url: acervoDocumentos.url })
    .from(acervoNovidades)
    .innerJoin(acervoDocumentos, eq(acervoDocumentos.chave, acervoNovidades.chave))
    .where(gte(acervoNovidades.em, desde))
    .orderBy(acervoNovidades.em);
  if (!novidades.length) return { avisos: 0 };
  const escritorios = await deps.db.select({ id: organization.id }).from(organization);
  let avisos = 0;
  for (const { id: organizationId } of escritorios) {
    avisos += await withTenant(deps.db, organizationId, async (tx) => {
      let novos = 0;
      for (const n of novidades) {
        const julgado = [n.questao, n.texto].filter(Boolean).join("\n");
        if (!julgado) continue;
        const alvo = await tx
          .select({ id: processos.id, assunto: processos.assunto })
          .from(processos)
          .where(
            and(
              inArray(processos.situacao, ["ativo", "suspenso"]),
              isNotNull(processos.assunto),
              alcance(n.chave.split(":")[1]!),
              sql`to_tsvector('portuguese', ${julgado}) @@ plainto_tsquery('portuguese', ${processos.assunto})`,
            ),
          );
        if (!alvo.length) continue;
        const mudanca = n.antes ? `Passou de "${n.antes}" para "${n.situacao}" no Banco Nacional de Precedentes.` : "Novo no Banco Nacional de Precedentes.";
        const r = await tx
          .insert(radarPrecedentes)
          .values(alvo.map((p) => ({ organizationId, processoId: p.id, chave: n.chave, rotulo: rotuloDoPrecedente(n.chave), situacao: n.situacao, texto: n.texto, url: n.url, motivo: `${mudanca} O assunto do processo, "${p.assunto}", aparece na questão julgada.` })))
          .onConflictDoNothing()
          .returning({ id: radarPrecedentes.id });
        novos += r.length;
      }
      return novos;
    });
  }
  return { avisos };
}
