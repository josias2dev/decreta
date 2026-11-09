/**
 * A fila de publicações no WhatsApp: um item por vez, montado pelo código (a IA não escreve estas
 * mensagens), com o trecho da publicação, a conta do prazo e os botões.
 *
 * Entram os casos que mais perdem prazo:
 * - o prazo sugerido, a confirmar;
 * - a publicação que a IA leu como "não gera prazo" (hoje ela fica "nova", sem nada para confirmar).
 * A publicação sem processo, sem leitura da IA ou com leitura de confiança baixa não se decide pelo
 * celular: entra só na conta do "abrir na tela".
 *
 * Quem recebe: o que é da pessoa e o que não tem responsável (quem tocar primeiro resolve; o prazo sem
 * dono confirma com "Confirmar e fico").
 */
import { formatarDiaCurto } from "@decreta/core";
import { analises, prazos, processos, publicacoes, type Tx } from "@decreta/db";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import type { SugestaoNaTela } from "../servicos/prazos.ts";
import type { Botao, Saida } from "./canal.ts";
import { propor } from "./propostas.ts";
import type { PessoaNoWhatsapp } from "./vinculo.ts";

export type ItemDaFila =
  | { tipo: "sugerido"; prazoId: string; publicacaoId: string; processoId: string; semDono: boolean }
  | { tipo: "sem_prazo_ia"; publicacaoId: string; processoId: string; semDono: boolean };

export interface FilaDaPessoa {
  itens: ItemDaFila[];
  /** Sem processo, sem leitura ou com confiança baixa: só na tela. */
  naTela: number;
}

type Quem = Pick<PessoaNoWhatsapp, "organizationId" | "userId">;
/** Quem recebe a mensagem do item: o escritório vai no rodapé, com a posição na fila. */
type Leitor = Quem & Pick<PessoaNoWhatsapp, "escritorio">;

/** A sugestão de prazo guardada para cada publicação (a análise mais recente). */
async function sugestoes(tx: Tx, ids: string[]): Promise<Map<string, { situacao: string; conteudo: Partial<SugestaoNaTela> }>> {
  if (!ids.length) return new Map();
  const linhas = await tx
    .select({ alvoId: analises.alvoId, situacao: analises.situacao, conteudo: analises.conteudo })
    .from(analises)
    .where(and(eq(analises.alvo, "publicacao"), eq(analises.acao, "sugerir-prazo"), inArray(analises.alvoId, ids)))
    .orderBy(desc(analises.createdAt));
  const m = new Map<string, { situacao: string; conteudo: Partial<SugestaoNaTela> }>();
  for (const l of linhas) if (!m.has(l.alvoId)) m.set(l.alvoId, { situacao: l.situacao, conteudo: (l.conteudo ?? {}) as Partial<SugestaoNaTela> });
  return m;
}

export async function filaDaPessoa(tx: Tx, quem: Quem): Promise<FilaDaPessoa> {
  const minhaOuSemDono = (col: typeof prazos.responsavelId | typeof processos.responsavelId) => or(eq(col, quem.userId), isNull(col));
  const sugeridos = await tx
    .select({ prazoId: prazos.id, publicacaoId: prazos.publicacaoId, processoId: prazos.processoId, responsavelId: prazos.responsavelId })
    .from(prazos)
    .where(and(eq(prazos.situacao, "aberto"), isNull(prazos.confirmadoEm), minhaOuSemDono(prazos.responsavelId)))
    .orderBy(asc(prazos.fim), asc(prazos.createdAt));
  const itens: ItemDaFila[] = sugeridos.flatMap((s) => (s.publicacaoId ? [{ tipo: "sugerido" as const, prazoId: s.prazoId, publicacaoId: s.publicacaoId, processoId: s.processoId, semDono: !s.responsavelId }] : []));
  const comPrazo = new Set(itens.map((i) => i.publicacaoId));

  const novas = await tx
    .select({ id: publicacoes.id, processoId: publicacoes.processoId, responsavelId: processos.responsavelId })
    .from(publicacoes)
    .leftJoin(processos, eq(processos.id, publicacoes.processoId))
    .where(and(eq(publicacoes.situacao, "nova"), isNull(publicacoes.canceladaEm)))
    .orderBy(asc(publicacoes.disponibilizadaEm), asc(publicacoes.createdAt));
  const lidas = await sugestoes(
    tx,
    novas.map((n) => n.id),
  );
  let naTela = 0;
  for (const n of novas) {
    if (comPrazo.has(n.id)) continue;
    const a = lidas.get(n.id);
    const s = a?.conteudo;
    const dela = !n.responsavelId || n.responsavelId === quem.userId;
    if (!n.processoId || !a || a.situacao !== "pronto" || s?.conferencia?.confianca === "baixa") {
      if (dela) naTela++;
      continue;
    }
    // Audiência designada e prazo calculado viram outra coisa na tela (a agenda, o prazo sugerido).
    if (s?.geraPrazo === false && !s.audiencia && dela) itens.push({ tipo: "sem_prazo_ia", publicacaoId: n.id, processoId: n.processoId, semDono: !n.responsavelId });
  }
  return { itens, naTela };
}

const contagemPorExtenso = (c: string) => (c === "corridos" ? "corridos" : "úteis");

/** "Intimação de 10/11: "intime-se...". Sem o trecho quando o processo é segredo ou o trecho não confere com o teor. */
function linhaDaPublicacao(pub: { tipoDocumento: string | null; disponibilizadaEm: string }, s: Partial<SugestaoNaTela> | undefined, segredo: boolean): string {
  const tipo = (pub.tipoDocumento || "Publicação").replace(/^\w/, (x) => x.toUpperCase());
  if (segredo) return `${tipo} de ${formatarDiaCurto(pub.disponibilizadaEm)}. Processo em segredo de justiça: o teor fica na tela.`;
  const trecho = s?.trechoConfere && s.trecho ? s.trecho.trim().replace(/\s+/g, " ") : null;
  return trecho ? `${tipo} de ${formatarDiaCurto(pub.disponibilizadaEm)}: "${trecho.length > 280 ? `${trecho.slice(0, 277).replace(/\s\S*$/, "")}…` : trecho}"` : `${tipo} de ${formatarDiaCurto(pub.disponibilizadaEm)}${s?.resumo ? `: ${s.resumo}` : "."}`;
}

/** A mensagem de um item, com os botões. As propostas de cada botão nascem aqui. */
export async function mensagemDoItem(tx: Tx, quem: Leitor, telas: string, item: ItemDaFila, posicao: { n: number; total: number }, agora = new Date()): Promise<{ texto: string; botoes: Botao[]; rodape: string }> {
  const base = telas.replace(/\/$/, "");
  const [pub] = await tx.select({ id: publicacoes.id, tipoDocumento: publicacoes.tipoDocumento, disponibilizadaEm: publicacoes.disponibilizadaEm, tribunal: publicacoes.tribunal }).from(publicacoes).where(eq(publicacoes.id, item.publicacaoId));
  const [proc] = await tx.select({ titulo: processos.titulo, segredo: processos.segredo }).from(processos).where(eq(processos.id, item.processoId));
  const s = (await sugestoes(tx, [item.publicacaoId])).get(item.publicacaoId)?.conteudo;
  const cabeca = `*${proc?.titulo ?? "Processo"}*${pub?.tribunal ? ` · ${pub.tribunal}` : ""}`;
  // A posição na fila e o escritório ficam no rodapé: o corpo fica só com o que decide.
  const rodape = posicao.total > 1 ? `${quem.escritorio} · ${posicao.n} de ${posicao.total}` : quem.escritorio;
  const linha = pub ? linhaDaPublicacao(pub, s, !!proc?.segredo) : "";

  if (item.tipo === "sem_prazo_ia") {
    const texto = [cabeca, linha, "A IA leu que esta publicação não abre prazo para o nosso cliente. Confere?", `${base}/publicacoes/${item.publicacaoId}`].filter(Boolean).join("\n");
    const sem = await propor(tx, quem, "sem_prazo", { publicacaoId: item.publicacaoId }, texto, agora);
    return { texto, botoes: [{ id: `p:${sem}`, titulo: "Sem prazo, confirmo" }, { id: `a:tem:u-${item.publicacaoId}`, titulo: "Tem prazo" }], rodape };
  }

  const [p] = await tx.select().from(prazos).where(eq(prazos.id, item.prazoId));
  if (!p) return { texto: `${cabeca}\nO prazo sugerido não existe mais.`, botoes: [], rodape };
  const fora = (p.desconsiderados ?? []).slice(0, 3).map((d) => `${d.nome} (${formatarDiaCurto(d.dia)})`);
  const conta = `Conta: ${pub ? `disponibilizada ${formatarDiaCurto(pub.disponibilizadaEm)} → ` : ""}publicada ${formatarDiaCurto(p.publicadoEm)} → começa ${formatarDiaCurto(p.inicio)} → vence *${formatarDiaCurto(p.fim)}*.`;
  const texto = [
    cabeca,
    linha,
    `Sugestão: ${p.tipo}, ${p.dias} dias ${contagemPorExtenso(p.contagem)}${p.fundamento ? ` (${p.fundamento})` : ""}.`,
    conta,
    fora.length ? `Não contou: ${fora.join(", ")}.` : null,
    item.semDono ? "Sem responsável no processo." : null,
    `${base}/prazos/${p.id}`,
  ]
    .filter(Boolean)
    .join("\n");
  const confirmar = await propor(tx, quem, item.semDono ? "confirmar_e_ficar" : "confirmar_prazo", { prazoId: p.id }, texto, agora);
  return {
    texto,
    botoes: [
      { id: `p:${confirmar}`, titulo: item.semDono ? "Confirmar e fico" : `Confirmar ${formatarDiaCurto(p.fim)}` },
      { id: `a:outro:p-${p.id}`, titulo: "Outro prazo" },
      { id: `a:semprazo:${item.publicacaoId}`, titulo: "Sem prazo" },
    ],
    rodape,
  };
}

/** A fila a partir do começo: o primeiro item, ou a frase de que não há nada. `antes`: o que vai antes na mesma mensagem ("Confirmado: ..."). */
export async function mensagemDaFila(tx: Tx, quem: Leitor, telas: string, antes: string | null = null, agora = new Date()): Promise<Saida> {
  const f = await filaDaPessoa(tx, quem);
  const base = telas.replace(/\/$/, "");
  const tela = f.naTela ? `${f.naTela === 1 ? "1 publicação precisa" : `${f.naTela} publicações precisam`} ser aberta${f.naTela === 1 ? "" : "s"} na tela (sem processo ou sem leitura da IA): ${base}/publicacoes` : null;
  const primeiro = f.itens[0];
  if (!primeiro) {
    const fim = antes ? "Nada mais a conferir pelo WhatsApp." : "Nada a conferir agora.";
    return { tipo: "texto", texto: [antes, fim, tela].filter(Boolean).join("\n\n") };
  }
  const m = await mensagemDoItem(tx, quem, telas, primeiro, { n: 1, total: f.itens.length }, agora);
  const texto = [antes, antes ? `Próximo:\n${m.texto}` : m.texto, f.itens.length === 1 ? tela : null].filter(Boolean).join("\n\n");
  return { tipo: "botoes", texto, botoes: m.botoes, rodape: m.rodape };
}
