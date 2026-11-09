/**
 * A proposta: a única forma de o agente escrever no escritório.
 *
 * Quem propõe (a fila, a IA) grava o que será feito, já conferido, com o texto montado pelo código e a
 * "impressão" do estado de agora. O botão leva o id. No toque, o código confere a pessoa, a validade e
 * a impressão (mudou desde a mensagem? então não vale) e executa exatamente o que foi congelado, pelo
 * mesmo serviço da tela. Um `update` condicionado a "pendente" faz dois toques executarem uma vez só.
 *
 * A IA nunca chama "executar": ela não vê esta função.
 */
import { formatarDiaCurto } from "@decreta/core";
import { clientes, equipe, prazos, processos, propostas, publicacoes, tarefas, type SituacaoDaProposta, type TipoDeProposta, type Tx } from "@decreta/db";
import { and, eq } from "drizzle-orm";
import { ajustarPrazo, confirmarPelaPublicacao, ErroDaDecisao, mudarPrazo, publicacaoSemPrazo, type Ator } from "../servicos/decisoes-do-prazo.ts";

/** As propostas da fila valem até o fim do dia (o resumo de amanhã traz de novo o que sobrou); as outras, meia hora. */
const VALIDADE_DA_FILA_MS = 12 * 60 * 60_000;
const VALIDADE_MS = 30 * 60_000;

const DA_FILA: ReadonlySet<TipoDeProposta> = new Set(["confirmar_prazo", "confirmar_e_ficar", "outra_conta", "sem_prazo"]);
export const ehDaFila = (tipo: TipoDeProposta) => DA_FILA.has(tipo);

/** Os tipos em que um "sim" digitado vale como o toque: os de risco baixo. Prazo só pelo botão. */
const SIM_DIGITADO_VALE: ReadonlySet<TipoDeProposta> = new Set(["criar_tarefa"]);
export const simDigitadoVale = (tipo: TipoDeProposta) => SIM_DIGITADO_VALE.has(tipo);

export interface ArgumentosDasPropostas {
  confirmar_prazo: { prazoId: string };
  confirmar_e_ficar: { prazoId: string };
  /** Pelo prazo sugerido (`prazoId`) ou pela publicação que a IA disse que não gera prazo (`publicacaoId`). */
  outra_conta: { prazoId?: string; publicacaoId?: string; dias?: number; contagem?: "uteis" | "corridos"; fimManual?: string; tipo?: string; fim: string };
  sem_prazo: { publicacaoId: string };
  prazo_cumprido: { prazoId: string };
  desfazer_cumprido: { prazoId: string };
  criar_tarefa: { titulo: string; dia: string; detalhe: string | null; responsavelId: string | null; processoId: string | null; clienteId: string | null };
  aprovar_texto: { clienteId: string; processoId: string | null; texto: string };
}

export type Proposta = typeof propostas.$inferSelect;

/** Como está agora o que a proposta muda: se mudar até o toque, a proposta não vale. */
export async function impressaoDe(tx: Tx, tipo: TipoDeProposta, a: Record<string, unknown>): Promise<string> {
  const prazoId = typeof a.prazoId === "string" ? a.prazoId : null;
  const publicacaoId = typeof a.publicacaoId === "string" ? a.publicacaoId : null;
  if (prazoId) {
    const [p] = await tx.select({ fim: prazos.fim, situacao: prazos.situacao, confirmadoEm: prazos.confirmadoEm, dias: prazos.dias }).from(prazos).where(eq(prazos.id, prazoId));
    return p ? `${p.situacao}|${p.fim}|${p.dias}|${p.confirmadoEm ? "c" : "-"}` : "sumiu";
  }
  if (publicacaoId) {
    const [pub] = await tx.select({ situacao: publicacoes.situacao, processoId: publicacoes.processoId }).from(publicacoes).where(eq(publicacoes.id, publicacaoId));
    const [p] = await tx.select({ confirmadoEm: prazos.confirmadoEm }).from(prazos).where(eq(prazos.publicacaoId, publicacaoId));
    return pub ? `${pub.situacao}|${pub.processoId ?? "-"}|${p?.confirmadoEm ? "c" : "-"}` : "sumiu";
  }
  return tipo;
}

/** Grava a proposta. A mesma (tipo e argumentos iguais) ainda pendente é reaproveitada: o botão mandado de novo continua valendo. */
export async function propor<T extends TipoDeProposta>(tx: Tx, quem: { organizationId: string; userId: string }, tipo: T, argumentos: ArgumentosDasPropostas[T], texto: string, agora = new Date()): Promise<string> {
  const args = argumentos as unknown as Record<string, unknown>;
  const impressao = await impressaoDe(tx, tipo, args);
  const iguais = await tx
    .select({ id: propostas.id, argumentos: propostas.argumentos, expiraEm: propostas.expiraEm, impressao: propostas.impressao })
    .from(propostas)
    .where(and(eq(propostas.userId, quem.userId), eq(propostas.tipo, tipo), eq(propostas.situacao, "pendente")));
  const igual = iguais.find((p) => JSON.stringify(p.argumentos) === JSON.stringify(args) && p.impressao === impressao && p.expiraEm.getTime() > agora.getTime());
  if (igual) return igual.id;
  const [p] = await tx
    .insert(propostas)
    // O mesmo relógio para quando nasceu e quando vence: o "sim" digitado compara com o `createdAt`.
    .values({ organizationId: quem.organizationId, userId: quem.userId, tipo, argumentos: args, texto, impressao, createdAt: agora, expiraEm: new Date(agora.getTime() + (ehDaFila(tipo) ? VALIDADE_DA_FILA_MS : VALIDADE_MS)) })
    .returning({ id: propostas.id });
  return p!.id;
}

/** O que aconteceu, para responder e registrar. `desfazer`: a resposta leva o botão que volta atrás. */
export interface Resultado {
  texto: string;
  acao: string;
  detalhes: Record<string, unknown>;
  /** O prazo confirmado (pede o rascunho da peça e marca o funil). */
  confirmou?: string;
  desfazer?: { tipo: "desfazer_cumprido"; argumentos: ArgumentosDasPropostas["desfazer_cumprido"]; rotulo: string };
  /** O texto aprovado ao cliente: a resposta abre a conversa com ele. */
  abrir?: { url: string; rotulo: string };
}

export type Recusa = { recusa: string };

/** Por que a proposta não pode ser executada agora, ou nada. */
export function recusaDa(p: Proposta, quem: { userId: string }, impressaoAgora: string, agora = new Date()): string | null {
  if (p.userId !== quem.userId) return "Esta opção é de outra pessoa.";
  if (p.situacao === "feita") return "Isso já foi feito.";
  if (p.situacao !== "pendente") return "Esta opção não vale mais.";
  if (p.expiraEm.getTime() <= agora.getTime()) return "Passou o tempo desta opção. Peça de novo.";
  if (impressaoAgora !== p.impressao) return "Mudou desde a mensagem.";
  return null;
}

/** O apelido da pessoa na equipe ("Rafael"), para as respostas. */
export const nomeDe = async (tx: Tx, userId: string | null): Promise<string | null> => {
  if (!userId) return null;
  const [e] = await tx.select({ apelido: equipe.apelido }).from(equipe).where(eq(equipe.userId, userId));
  return e?.apelido ?? null;
};

/** O rodapé contra o golpe do falso advogado, sem dizer "canal oficial" de um número que pode não ser o oficial. */
export const RODAPE_DO_ADVOGADO = "Este escritório nunca pede Pix nem código para liberar valores.";

/** Executa o que foi congelado. Erro do serviço (não achou, sem processo) vira `ErroDaDecisao`, que quem chama responde. */
export async function executar(tx: Tx, ator: Ator, p: Proposta): Promise<Resultado> {
  const a = p.argumentos as Record<string, unknown>;
  switch (p.tipo) {
    case "confirmar_prazo":
    case "confirmar_e_ficar": {
      const prazoId = String(a.prazoId);
      const r = await mudarPrazo(tx, ator, prazoId, "confirmar", { soSeAinda: true, ficarComEle: p.tipo === "confirmar_e_ficar" });
      if (!r.mudou) throw new ErroDaDecisao(409, "ja_confirmado", "Alguém já confirmou este prazo.");
      const responsavel = p.tipo === "confirmar_e_ficar" ? null : await nomeDe(tx, r.prazo.responsavelId);
      const quem = p.tipo === "confirmar_e_ficar" ? "com você" : responsavel ? `com ${responsavel}` : "sem responsável";
      return { texto: `Confirmado: ${r.prazo.tipo} vence ${formatarDiaCurto(r.prazo.fim)}, ${quem}.`, acao: "prazo.confirmado", detalhes: { prazoId, fim: r.prazo.fim }, confirmou: prazoId };
    }
    case "outra_conta": {
      const fimManual = typeof a.fimManual === "string" ? a.fimManual : undefined;
      if (typeof a.prazoId === "string") {
        const r = await ajustarPrazo(tx, ator, a.prazoId, { ...(typeof a.dias === "number" ? { dias: a.dias } : {}), ...(fimManual ? { fimManual } : {}), confirmar: true });
        return { texto: fimManual ? `Confirmado com a data digitada: vence ${formatarDiaCurto(r.fim)}.` : `Confirmado com ${a.dias} dias: vence ${formatarDiaCurto(r.fim)}.`, acao: "prazo.ajustado", detalhes: { prazoId: a.prazoId, dias: a.dias, fimManual }, confirmou: a.prazoId };
      }
      const publicacaoId = String(a.publicacaoId);
      const r = await confirmarPelaPublicacao(tx, ator, publicacaoId, { tipo: typeof a.tipo === "string" && a.tipo.trim().length >= 2 ? a.tipo : "Prazo", dias: typeof a.dias === "number" ? a.dias : 15, contagem: a.contagem === "corridos" ? "corridos" : "uteis", fimManual: fimManual ?? null });
      return { texto: `Confirmado: vence ${formatarDiaCurto(r.fim)}.`, acao: "prazo.confirmado", detalhes: { prazoId: r.prazoId, publicacaoId, fim: r.fim }, confirmou: r.prazoId };
    }
    case "sem_prazo": {
      const publicacaoId = String(a.publicacaoId);
      await publicacaoSemPrazo(tx, ator, publicacaoId);
      return { texto: "Marcada sem prazo.", acao: "publicacao.sem_prazo", detalhes: { publicacaoId } };
    }
    case "prazo_cumprido": {
      const prazoId = String(a.prazoId);
      const r = await mudarPrazo(tx, ator, prazoId, "cumprir");
      return { texto: `Marcado como cumprido: ${r.prazo.tipo}.`, acao: "prazo.cumprido", detalhes: { prazoId }, desfazer: { tipo: "desfazer_cumprido", argumentos: { prazoId }, rotulo: "Desfazer" } };
    }
    case "desfazer_cumprido": {
      const prazoId = String(a.prazoId);
      const r = await mudarPrazo(tx, ator, prazoId, "reabrir");
      return { texto: `Voltou para aberto: ${r.prazo.tipo}, vence ${formatarDiaCurto(r.prazo.fim)}.`, acao: "prazo.reaberto", detalhes: { prazoId } };
    }
    case "criar_tarefa": {
      const [t] = await tx
        .insert(tarefas)
        .values({ organizationId: ator.organizationId, titulo: String(a.titulo), dia: String(a.dia), detalhe: (a.detalhe as string | null) ?? null, responsavelId: (a.responsavelId as string | null) ?? null, processoId: (a.processoId as string | null) ?? null, clienteId: (a.clienteId as string | null) ?? null, criadaPor: ator.userId })
        .returning({ id: tarefas.id });
      return { texto: `Tarefa criada para ${formatarDiaCurto(String(a.dia))}: ${String(a.titulo)}.`, acao: "tarefa.criada", detalhes: { tarefaId: t!.id } };
    }
    case "aprovar_texto": {
      const [cl] = await tx.select({ nome: clientes.nome, telefone: clientes.telefone, semIa: clientes.semIa }).from(clientes).where(eq(clientes.id, String(a.clienteId)));
      if (!cl) throw new ErroDaDecisao(404, "nao_encontrado", "Não achei o cliente.");
      if (cl.semIa) throw new ErroDaDecisao(422, "cliente_sem_ia", "Este cliente está marcado sem IA: escreva a ele direto.");
      const numero = (cl.telefone ?? "").replace(/\D/g, "");
      const texto = `${String(a.texto).trim()}\n\n_${RODAPE_DO_ADVOGADO}_`;
      const primeiro = cl.nome.split(" ")[0] ?? cl.nome;
      if (numero.length < 10) return { texto: `Aprovado. ${cl.nome} não tem celular no cadastro; copie o texto abaixo e mande pelo seu WhatsApp:\n\n${texto}`, acao: "mensagem_cliente.aprovada", detalhes: { clienteId: a.clienteId, processoId: a.processoId, sem_numero: true } };
      const para = numero.startsWith("55") ? numero : `55${numero}`;
      return { texto: `Aprovado. Toque abaixo para abrir a conversa com ${primeiro} no seu WhatsApp, com o texto escrito. Confira antes de enviar.`, acao: "mensagem_cliente.aprovada", detalhes: { clienteId: a.clienteId, processoId: a.processoId, tamanho: texto.length }, abrir: { url: `https://wa.me/${para}?text=${encodeURIComponent(texto)}`, rotulo: `Abrir com ${primeiro}` } };
    }
  }
}

/**
 * Reivindica a proposta (pendente → feita) e executa, na mesma transação: se a execução falhar, a
 * proposta volta a pendente com o resto. Devolve o resultado ou a recusa em português.
 */
export async function decidir(tx: Tx, ator: Ator, propostaId: string, agora = new Date()): Promise<{ proposta: Proposta; resultado: Resultado } | Recusa> {
  const [p] = await tx.select().from(propostas).where(eq(propostas.id, propostaId));
  if (!p) return { recusa: "Esta opção não vale mais." };
  const recusa = recusaDa(p, ator, await impressaoDe(tx, p.tipo, p.argumentos as Record<string, unknown>), agora);
  if (recusa) {
    if (p.situacao === "pendente") await marcar(tx, p.id, recusa === "Mudou desde a mensagem." ? "substituida" : p.expiraEm.getTime() <= agora.getTime() ? "vencida" : "pendente");
    return { recusa };
  }
  const reivindicada = await tx.update(propostas).set({ situacao: "feita", decididaEm: agora }).where(and(eq(propostas.id, p.id), eq(propostas.situacao, "pendente"))).returning({ id: propostas.id });
  if (!reivindicada.length) return { recusa: "Isso já foi feito." };
  const resultado = await executar(tx, ator, p);
  await tx.update(propostas).set({ resultado: { texto: resultado.texto, ...resultado.detalhes } }).where(eq(propostas.id, p.id));
  return { proposta: p, resultado };
}

async function marcar(tx: Tx, id: string, situacao: SituacaoDaProposta) {
  if (situacao === "pendente") return;
  await tx.update(propostas).set({ situacao }).where(eq(propostas.id, id));
}

/** A recusa da Meta ou do serviço numa frase para a pessoa. */
export function fraseDoErro(err: unknown): string | null {
  if (err instanceof ErroDaDecisao) return err.detalhe ?? (err.status === 404 ? "Não achei mais isso no Decreta." : "Não deu para fazer agora.");
  return null;
}

/** As propostas pendentes da pessoa (a mais nova primeiro): o "sim" digitado e a tela de conversas. */
export async function pendentesDa(tx: Tx, userId: string, agora = new Date()) {
  const todas = await tx.select().from(propostas).where(and(eq(propostas.userId, userId), eq(propostas.situacao, "pendente")));
  return todas.filter((p) => p.expiraEm.getTime() > agora.getTime()).sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime());
}

/** O processo é segredo de justiça? (a mensagem não leva o teor) */
export async function emSegredo(tx: Tx, processoId: string | null): Promise<boolean> {
  if (!processoId) return false;
  const [p] = await tx.select({ segredo: processos.segredo }).from(processos).where(eq(processos.id, processoId));
  return !!p?.segredo;
}
