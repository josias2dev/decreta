/**
 * Prazos: a sugestão da IA a partir da publicação, a confirmação por uma
 * pessoa e a recontagem quando alguém ajusta.
 *
 * A sugestão já cria o prazo, marcado "Confirmar sugestão": assim um prazo
 * nunca some só porque ninguém abriu a publicação. A data final é sempre a do
 * motor de prazos (ou a que a pessoa digitou), nunca a da IA.
 */
import { contarPrazo, explicarContagem, type Contagem, type ResultadoDaContagem } from "@decreta/core";
import { prazos, processos, publicacoes, withTenant, type Database, type Tx } from "@decreta/db";
import { impressao, sugerirPrazo, type Ia, type SugestaoDePrazo } from "@decreta/ia";
import { eq } from "drizzle-orm";
import { analisar, type AnaliseNaTela } from "./analises.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "./calendario.ts";
import { carregarContexto } from "./contexto.ts";

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
  return { ...r, desconsiderados: r.desconsiderados.map((f) => ({ dia: f.dia, nome: f.nome, tipo: f.tipo })), explicacao: explicarContagem(r) };
}

/** Conta o prazo no calendário do tribunal e da comarca do processo. */
export async function contarParaProcesso(tx: Tx, organizationId: string, processoId: string | null, pedido: { publicacao: string; dias: number; contagem: Contagem }) {
  let tribunal: string | null = null;
  let comarca: string | null = null;
  if (processoId) {
    const [p] = await tx.select({ tribunal: processos.tribunal, comarca: processos.comarca }).from(processos).where(eq(processos.id, processoId));
    tribunal = p?.tribunal ?? null;
    comarca = p?.comarca ?? null;
  }
  const cal = await calendarioDoEscritorio(tx, tribunal ?? (await tribunalPadrao(tx, organizationId)), comarca);
  return contarPrazo({ ...pedido, calendario: cal });
}

export interface SugestaoNaTela extends SugestaoDePrazo {
  contagemCalculada: ContagemNaTela | null;
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
    contar: (dias: number, contagem: Contagem) => Promise<ResultadoDaContagem>;
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
      let comarca: string | null = null;
      if (pub.processoId) {
        contexto = (await carregarContexto(tx, pub.processoId))?.texto;
        const [p] = await tx.select({ responsavelId: processos.responsavelId, comarca: processos.comarca }).from(processos).where(eq(processos.id, pub.processoId));
        responsavelId = p?.responsavelId ?? null;
        comarca = p?.comarca ?? null;
      }
      // O calendário é lido agora; a conta roda depois da IA, já fora da transação.
      const cal = await calendarioDoEscritorio(tx, pub.tribunal ?? (await tribunalPadrao(tx, organizationId)), comarca);
      const contar = async (dias: number, contagem: Contagem) => contarPrazo({ publicacao: pub.publicadaEm, dias, contagem, calendario: cal });
      const d = pub.disponibilizadaEm.split("-");
      return { entrada: { pub, contexto, responsavelId, contar }, base: impressao(pub.texto), fonte: `${pub.fonte === "djen" ? "DJEN" : "Publicação"} · ${d[2]}/${d[1]}/${d[0]}` };
    },
    executar: async ({ pub, contexto, responsavelId, contar }) => {
      const s = await sugerirPrazo(ia, {
        publicacao: { texto: pub.texto, tipoComunicacao: pub.tipoComunicacao, tipoDocumento: pub.tipoDocumento, orgao: pub.orgao, publicadaEm: pub.publicadaEm },
        contextoDoProcesso: contexto,
      });
      const contagemCalculada = s.geraPrazo && s.dias ? contagemNaTela(await contar(s.dias, s.contagem)) : null;
      return { ...s, contagemCalculada, responsavelId } satisfies SugestaoNaTela;
    },
  });
  if (analise?.situacao === "pronto") await criarPrazoSugerido(deps.db, organizationId, publicacaoId, analise.conteudo as unknown as SugestaoNaTela);
  return analise;
}

/** O prazo "Confirmar sugestão". Se a pessoa já confirmou, a sugestão nova não mexe nele. */
async function criarPrazoSugerido(db: Database, organizationId: string, publicacaoId: string, s: SugestaoNaTela) {
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
