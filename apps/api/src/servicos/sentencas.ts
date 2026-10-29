/**
 * Leitura da sentença: quando a publicação é uma sentença ou um acórdão, a IA
 * diz o que ganhamos e o que perdemos pedido a pedido e qual recurso cabe. O
 * resultado só entra no processo quando uma pessoa confirma (`resultados`).
 */
import { publicacoes, type Database } from "@decreta/db";
import { ehDecisaoFinal, impressao, lerSentenca, type Ia } from "@decreta/ia";
import { eq } from "drizzle-orm";
import { analisar, type AnaliseNaTela } from "./analises.ts";
import { carregarContexto } from "./contexto.ts";
import { IaDesligada } from "./prazos.ts";

interface Deps {
  db: Database;
  ia: Ia | null;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

export const ROTULO_DO_RESULTADO = {
  procedente: "Procedente",
  parcialmente_procedente: "Parcialmente procedente",
  improcedente: "Improcedente",
  sem_merito: "Extinto sem mérito",
  acordo_homologado: "Acordo homologado",
  outro: "Outro",
} as const;

/**
 * Lê a decisão da publicação. Sem `forcar`, só lê o que parece sentença ou
 * acórdão (a rotina de fundo passa por todas as publicações novas) e devolve
 * `null` para o resto.
 */
export async function lerSentencaDaPublicacao(deps: Deps, organizationId: string, publicacaoId: string, opcoes: { userId?: string | null; forcar?: boolean } = {}): Promise<AnaliseNaTela | null> {
  const ia = deps.ia;
  if (!ia) throw new IaDesligada();
  type Entrada = { pub: typeof publicacoes.$inferSelect; contexto: string | undefined };
  return analisar<Entrada>(deps.db, {
    organizationId,
    alvo: "publicacao",
    alvoId: publicacaoId,
    acao: "ler-sentenca",
    userId: opcoes.userId,
    log: deps.log,
    preparar: async (tx) => {
      const [pub] = await tx.select().from(publicacoes).where(eq(publicacoes.id, publicacaoId));
      if (!pub || (!opcoes.forcar && !ehDecisaoFinal(pub))) return null;
      const contexto = pub.processoId ? (await carregarContexto(tx, pub.processoId))?.texto : undefined;
      const d = pub.disponibilizadaEm.split("-");
      return { entrada: { pub, contexto }, base: impressao(pub.texto), fonte: `${pub.fonte === "djen" ? "DJEN" : "Publicação"} · ${d[2]}/${d[1]}/${d[0]}` };
    },
    executar: ({ pub, contexto }) =>
      lerSentenca(ia, {
        publicacao: { texto: pub.texto, tipoDocumento: pub.tipoDocumento, orgao: pub.orgao, publicadaEm: pub.publicadaEm },
        contextoDoProcesso: contexto,
      }),
  });
}
