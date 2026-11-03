/**
 * O que a IA lê para ajudar num campo de texto. O campo diz quanto dos autos vale a
 * pena ler, e o alvo diz de quem é: tudo passa pelo escritório (RLS) e pela recusa
 * do cliente, seja qual for o caminho até ele.
 */
import { formatarDia, type CampoComIa } from "@decreta/core";
import { alvaras, atendimentos, clientes, mensagensCliente, negocios, prazos, publicacoes, type Tx } from "@decreta/db";
import { tipoDePeca, type Briefing } from "@decreta/ia";
import { desc, eq } from "drizzle-orm";
import { falha } from "../rotas/base.ts";
import { ultimaAnalise } from "./analises.ts";
import { cortado } from "./assistente.ts";
import { ClienteSemIa, contextoParaIa, semIa } from "./contexto.ts";

export interface AlvoDoCampo {
  publicacaoId?: string;
  prazoId?: string;
  processoId?: string;
  clienteId?: string;
  mensagemId?: string;
  negocioId?: string;
  alvaraId?: string;
  /** Do catálogo: a peça que as instruções vão orientar. */
  tipoDePeca?: string;
}

/**
 * Quanto dos autos cada campo lê. A mensagem ao cliente não lê os autos, como a
 * que a IA escreve do briefing: os pontos a favor e contra ficam de fora, para a
 * mensagem não virar parecer. As instruções da peça leem os documentos, porque a
 * peça vai lê-los também.
 */
const AUTOS: Record<CampoComIa, Parameters<typeof contextoParaIa>[2] | null> = {
  "resultado-decisao": { teto: 40_000, andamentos: 20 },
  "mensagem-cliente": null,
  "instrucoes-peca": { documentos: true, teto: 60_000 },
  "resumo-atendimento": { teto: 20_000, andamentos: 10 },
  observacoes: { teto: 20_000, andamentos: 10 },
};

const ATENDIMENTOS_NO_CONTEXTO = 3;
const TETO_DO_ATENDIMENTO = 500;

const achado = <T>(linha: T | undefined): T => linha ?? falha(404, "nao_encontrado");

export interface MaterialDoCampo {
  contexto: string;
  processoId: string | null;
  clienteId: string | null;
}

export async function materialDoCampo(tx: Tx, campo: CampoComIa, alvo: AlvoDoCampo, quem: { veCobranca: boolean }): Promise<MaterialDoCampo> {
  const partes: string[] = [];
  let processoId = alvo.processoId ?? null;
  let clienteId = alvo.clienteId ?? null;
  /** Cada coisa lida passa pela recusa do próprio dono: um alvo de outro cliente não entra de carona. */
  const doDono = async <T extends { processoId?: string | null; clienteId?: string | null }>(linha: T | undefined): Promise<T> => {
    const l = achado(linha);
    if (await semIa(tx, { processoId: l.processoId, clienteId: l.clienteId })) throw new ClienteSemIa();
    return l;
  };

  if (alvo.publicacaoId) {
    const pub = await doDono((await tx.select({ texto: publicacoes.texto, disponibilizadaEm: publicacoes.disponibilizadaEm, processoId: publicacoes.processoId }).from(publicacoes).where(eq(publicacoes.id, alvo.publicacaoId)))[0]);
    processoId ??= pub.processoId;
    partes.push(`## Publicação disponibilizada em ${formatarDia(pub.disponibilizadaEm)}\n${cortado(pub.texto, "publicação")}`);
  }
  if (alvo.prazoId) {
    const p = await doDono((await tx.select({ tipo: prazos.tipo, fim: prazos.fim, fundamento: prazos.fundamento, processoId: prazos.processoId }).from(prazos).where(eq(prazos.id, alvo.prazoId)))[0]);
    processoId ??= p.processoId;
    partes.push(`## Prazo\n${p.tipo}, vence em ${formatarDia(p.fim)}${p.fundamento ? ` (${p.fundamento})` : ""}.`);
  }
  if (alvo.mensagemId) {
    const m = await doDono((await tx.select({ tipo: mensagensCliente.tipo, clienteId: mensagensCliente.clienteId, processoId: mensagensCliente.processoId, prazoId: mensagensCliente.prazoId }).from(mensagensCliente).where(eq(mensagensCliente.id, alvo.mensagemId)))[0]);
    if (m.tipo === "cobranca" && !quem.veCobranca) falha(403, "sem_acesso_financeiro", "O Financeiro é dos sócios e de quem eles liberarem na Equipe.");
    clienteId ??= m.clienteId;
    processoId ??= m.processoId;
    if (m.prazoId) partes.push(...(await daDecisao(tx, m.prazoId)));
  }
  if (alvo.negocioId) {
    const n = await doDono((await tx.select({ nome: negocios.nome, assunto: negocios.assunto, area: negocios.area, clienteId: negocios.clienteId }).from(negocios).where(eq(negocios.id, alvo.negocioId)))[0]);
    clienteId ??= n.clienteId;
    partes.push(`## Novo negócio, ainda na triagem\nPessoa: ${n.nome}\nAssunto: ${n.assunto}${n.area ? `\nÁrea: ${n.area}` : ""}`);
  }
  if (alvo.alvaraId) {
    const a = await doDono((await tx.select({ descricao: alvaras.descricao, valor: alvaras.valor, processoId: alvaras.processoId }).from(alvaras).where(eq(alvaras.id, alvo.alvaraId)))[0]);
    processoId ??= a.processoId;
    partes.push(`## Alvará\n${a.descricao}, no valor de R$ ${a.valor}.`);
  }
  const peca = alvo.tipoDePeca ? tipoDePeca(alvo.tipoDePeca) : undefined;
  if (peca) partes.push(`## Peça que será redigida\n${peca.nome}. Como costuma ser: ${peca.estrutura}`);

  // O processo e o cliente pedidos também: a recusa vale mesmo para o que este campo não leria.
  if (alvo.processoId && processoId !== alvo.processoId && (await semIa(tx, { processoId: alvo.processoId }))) throw new ClienteSemIa();
  if (clienteId) {
    const cl = achado((await tx.select({ nome: clientes.nome }).from(clientes).where(eq(clientes.id, clienteId)))[0]);
    if (await semIa(tx, { clienteId })) throw new ClienteSemIa();
    partes.push(`## Cliente\n${cl.nome}`);
    if (campo === "resumo-atendimento" || campo === "observacoes") partes.push(...(await ultimosAtendimentos(tx, clienteId)));
  }
  const autos = AUTOS[campo];
  if (processoId) {
    if (autos) partes.push(achado((await contextoParaIa(tx, processoId, autos)) ?? undefined).texto);
    else if (await semIa(tx, { processoId })) throw new ClienteSemIa();
  }
  return { contexto: partes.join("\n\n"), processoId, clienteId };
}

/** Só o que o juízo decidiu e o que o escritório vai fazer, tirado do briefing do prazo. */
async function daDecisao(tx: Tx, prazoId: string): Promise<string[]> {
  const [p] = await tx.select({ tipo: prazos.tipo }).from(prazos).where(eq(prazos.id, prazoId));
  const b = await ultimaAnalise(tx, "prazo", prazoId, "briefing-prazo");
  if (b?.situacao !== "pronto") return p ? [`## Prazo aberto pela decisão\n${p.tipo}`] : [];
  const { decidiu, fazer } = b.conteudo as unknown as Briefing;
  return [...(p ? [`## Prazo aberto pela decisão\n${p.tipo}`] : []), `## O que o juízo decidiu\n${decidiu}`, `## O que o escritório vai fazer\n${fazer.map((f) => `- ${f}`).join("\n") || "Nada informado."}`];
}

async function ultimosAtendimentos(tx: Tx, clienteId: string): Promise<string[]> {
  const linhas = await tx.select({ resumo: atendimentos.resumo }).from(atendimentos).where(eq(atendimentos.clienteId, clienteId)).orderBy(desc(atendimentos.em)).limit(ATENDIMENTOS_NO_CONTEXTO);
  return linhas.length ? [`## Últimos atendimentos\n${linhas.map((a) => `- ${a.resumo.slice(0, TETO_DO_ATENDIMENTO)}`).join("\n")}`] : [];
}
