/**
 * O que chega da Meta, do webhook até a resposta.
 *
 *   webhook ── status ──► atualiza a mensagem que saiu (entregue, lida, falhou)
 *           └─ mensagem ─► quem é? ── ninguém ──► resposta fixa, no máximo 1 vez em 30 dias
 *                                  └─ pessoa ── grava (a mesma mensagem duas vezes entra uma) ──►
 *                                               primeira desde que ligou ──► boas-vindas (um oi para aí)
 *                                               toque  ──► evento whatsapp.decisao (na hora)
 *                                               texto, áudio, arquivo ──► evento whatsapp.mensagem (junta a rajada)
 *
 * Ligar é pela tela (`vinculo.ts`): o código chega no WhatsApp e a pessoa o digita no Decreta.
 *
 * O webhook só grava e enfileira: a IA e a resposta rodam nas rotinas (Inngest), uma por pessoa por vez.
 */
import { withTenant } from "@decreta/db";
import { sql } from "drizzle-orm";
import { tratarEscolha } from "./acoes.ts";
import type { Entrada, Saida } from "./canal.ts";
import { atualizarStatus, enviarParaPessoa, marcarEntradas, marcarParaRevisao, registrarEntrada } from "./mensagens.ts";
import { responderTurno, type Turno } from "./turno.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import { marcarBoasVindas, pessoaDoUsuario, quemE, registrarEntradaNoVinculo, responderAoDesconhecido, type PessoaNoWhatsapp } from "./vinculo.ts";

/** `responde`: a mensagem que tinha o botão tocado (a resposta a cita). */
export type PedidoDoWhatsapp = { tipo: "mensagem"; organizationId: string; userId: string } | { tipo: "decisao"; organizationId: string; userId: string; entradaId: string; escolha: string; responde: string | null };

export const RESPOSTA_AO_DESCONHECIDO =
  "Este número é do Decreta, o sistema de escritórios de advocacia. Se você é cliente de um escritório, fale com o seu advogado pelo número dele. O Decreta nunca pede Pix nem códigos.";

/** Só um cumprimento ("oi", "olá, bom dia!"): as boas-vindas bastam como resposta, sem IA. */
const SO_CUMPRIMENTO = /^\s*((oi+|ol[áa]|opa|e a[íi]|bom dia|boa tarde|boa noite)[\s,.!]*)+(decreta)?[\s,.!]*$/i;

/**
 * Manda as respostas de um turno ou de um toque, cada uma com a sua chave (a rotina que repete não manda
 * de novo). `turno`: a marca de revisão e a duração ficam na primeira resposta.
 */
export async function responder(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, saidas: Saida[], chave: string, conversaId: string | null = null, turno: { revisao?: string; duracaoMs?: number; responde?: string | null } = {}): Promise<number> {
  let n = 0;
  const origem = deps.origem === "laboratorio" ? "laboratorio" : "agente";
  for (const [i, s] of saidas.entries()) if (await enviarParaPessoa(deps, pessoa, s, { origem, chave: `${chave}:${i}`, conversaId, ...(i === 0 ? { revisao: turno.revisao ?? null, duracaoMs: turno.duracaoMs ?? null, responde: turno.responde ?? null } : {}) })) n++;
  return n;
}

/** As entradas do webhook, já lidas e conferidas. `enfileirar` manda o evento para as rotinas. */
export async function receberDoWebhook(deps: DepsDoAgente, entradas: Entrada[], enfileirar: (p: PedidoDoWhatsapp) => Promise<void>): Promise<void> {
  for (const e of entradas) {
    try {
      if (e.tipo === "status") {
        await atualizarStatus(deps.db, e);
        continue;
      }
      await receberMensagem(deps, e, enfileirar);
    } catch (err) {
      // Uma mensagem com problema não segura as outras do lote (e a Meta não reentrega o que respondemos 200).
      deps.log("whatsapp: entrada não tratada", { tipo: e.tipo, error: err instanceof Error ? err.message : String(err) });
    }
  }
}

async function receberMensagem(deps: DepsDoAgente, m: Extract<Entrada, { tipo: "mensagem" }>, enfileirar: (p: PedidoDoWhatsapp) => Promise<void>): Promise<void> {
  const agora = agoraDe(deps);
  const remetente = { telefone: m.de.telefone, bsuid: m.de.bsuid };
  const pessoa = await quemE(deps.db, remetente, { cobrancaAtiva: deps.cobrancaAtiva, agora });
  if (!pessoa) {
    // Sem vínculo: a resposta fixa, sem IA, e o número não fica guardado.
    if (m.de.telefone && (await responderAoDesconhecido(deps.db, m.de.telefone, agora))) {
      await deps.canal.enviar({ telefone: m.de.telefone, bsuid: m.de.bsuid }, { tipo: "texto", texto: RESPOSTA_AO_DESCONHECIDO }).catch((err) => deps.log("whatsapp: a resposta ao desconhecido não saiu", { error: err instanceof Error ? err.message : String(err) }));
    }
    return;
  }
  await registrarEntradaNoVinculo(deps.db, pessoa.vinculoId, agora, pessoa.bsuid ? null : m.de.bsuid);
  const { id, novo } = await registrarEntrada(deps.db, pessoa, m);
  if (!novo) return;
  // A reação não tem resposta (cada mensagem custa); o 👎 marca a resposta reagida para a equipe rever.
  if (m.conteudo.tipo === "reacao") {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "ignorada"));
    if (m.conteudo.emoji === "👎") await marcarParaRevisao(deps.db, pessoa, { wamid: m.conteudo.wamid }, "reação 👎");
    return;
  }
  await deps.canal.marcarLido(m.wamid).catch(() => {});
  const aberta = { ...pessoa, janelaAberta: true };
  if (pessoa.vencido) {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "ignorada"));
    await enviarParaPessoa(deps, aberta, { tipo: "texto", texto: "O seu WhatsApp precisa ser renovado no Decreta: por segurança, ele para depois de 30 dias sem abrir o app. Abra o Decreta e ele volta a funcionar." }, { origem: "agente", chave: `renovar:${id}` });
    return;
  }
  // O suporte do Decreta assumiu a conversa: a mensagem fica para ele, e a IA não responde.
  if (pessoa.pausado) {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "ignorada"));
    return;
  }
  if (pessoa.boasVindasPendente && (await marcarBoasVindas(deps.db, pessoa.vinculoId, agora))) {
    await darBoasVindas(deps, aberta, id);
    if (m.conteudo.tipo === "texto" && SO_CUMPRIMENTO.test(m.conteudo.texto)) {
      await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "respondida"));
      return;
    }
  }
  // A escolha que volta para a IA ("e:", a lista de processos) é uma mensagem: entra no turno, com a rajada.
  if (m.conteudo.tipo === "escolha" && m.conteudo.id.startsWith("e:")) {
    await enfileirar({ tipo: "mensagem", organizationId: pessoa.organizationId, userId: pessoa.userId });
    return;
  }
  if (m.conteudo.tipo === "escolha") {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, [id], "respondida"));
    // O botão é da mensagem de um escritório: quem é de dois decide no escritório da mensagem, não no ativo.
    const [daMensagem] = m.responde ? await deps.db.execute<{ org: string | null }>(sql`select whatsapp_escritorio_da_mensagem(${m.responde}) as org`) : [];
    await enfileirar({ tipo: "decisao", organizationId: daMensagem?.org ?? pessoa.organizationId, userId: pessoa.userId, entradaId: id, escolha: m.conteudo.id, responde: m.responde });
    return;
  }
  await enfileirar({ tipo: "mensagem", organizationId: pessoa.organizationId, userId: pessoa.userId });
}

/** A primeira mensagem desde que ligou pela tela: o que dá para fazer por aqui. */
async function darBoasVindas(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, entradaId: string): Promise<void> {
  await enviarParaPessoa(
    deps,
    pessoa,
    {
      tipo: "botoes",
      texto: `Ligado ao Decreta de ${pessoa.escritorio}. Por aqui chegam o resumo da manhã, o que vence no dia e as publicações para conferir; e dá para perguntar ("o que vence amanhã?") e pedir documentos ("me manda a procuração da Marina").${pessoa.demonstracao ? "\n\nEste é o escritório de demonstração: os dados são inventados e voltam ao começo toda madrugada." : ""}\n\nO WhatsApp continua ligado enquanto você usa o Decreta; depois de 30 dias sem abrir o app, ele para, por segurança. Para desligar, escreva "sair".`,
      botoes: [{ id: "a:dia", titulo: "Ver o meu dia" }],
    },
    { origem: "agente", chave: `ligado:${entradaId}` },
  );
}

/** A rotina do evento `whatsapp.mensagem`: responde o que a pessoa mandou desde a última resposta. */
export async function processarMensagens(deps: DepsDoAgente, pedido: { organizationId: string; userId: string }): Promise<Turno | null> {
  const pessoa = await pessoaDoUsuario(deps.db, pedido.userId, { cobrancaAtiva: deps.cobrancaAtiva, agora: agoraDe(deps) });
  if (!pessoa || pessoa.pausado) return null;
  const turno = await responderTurno(deps, pessoa);
  if (turno.descartado || !turno.entradas.length) return turno;
  await responder(deps, pessoa, turno.saidas, `turno:${turno.entradas[0]}`, turno.conversaId, { revisao: turno.revisao, duracaoMs: turno.bastidores.ms });
  return turno;
}

/** A rotina do evento `whatsapp.decisao`: o toque num botão, tratado pelo código. */
export async function processarDecisao(deps: DepsDoAgente, pedido: { userId: string; entradaId: string; escolha: string; organizationId?: string; responde?: string | null }): Promise<Saida[]> {
  const pessoa = await pessoaDoUsuario(deps.db, pedido.userId, { cobrancaAtiva: deps.cobrancaAtiva, agora: agoraDe(deps), ...(pedido.organizationId ? { organizationId: pedido.organizationId } : {}) });
  if (!pessoa || pessoa.pausado) return [];
  const saidas = await tratarEscolha(deps, pessoa, pedido.escolha);
  // A resposta cita a mensagem do botão: com cinco prazos na tela, o "feito" aponta qual foi.
  await responder(deps, pessoa, saidas, `escolha:${pedido.entradaId}`, null, { responde: pedido.responde ?? null });
  return saidas;
}
