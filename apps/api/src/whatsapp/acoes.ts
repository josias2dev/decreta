/**
 * O toque num botão ou num item de lista, tratado pelo código (sem IA). Os ids:
 *
 *   p:<proposta>            executa a proposta congelada (ver `propostas.ts`)
 *   a:dia                   o resumo de hoje, inteiro (o botão do modelo "resumo_do_dia")
 *   a:fila                  a fila de publicações desde o começo
 *   a:vence                 o que vence hoje e está aberto (o botão do modelo "vence_hoje")
 *   a:prazo:<prazo>         o cartão de um prazo, com "Já protocolei" (a linha da lista das 15h)
 *   a:doc:<documento>       o documento escolhido na lista: sai como arquivo, sem IA
 *   e:proc:<processo>       (não passa por aqui) a escolha na lista de processos volta para a IA, como mensagem
 *   a:outro:p-<prazo>       outra quantidade de dias para o prazo sugerido
 *   a:tem:u-<publicação>    a publicação que a IA disse que não gera prazo: tem prazo, sim
 *   a:dias:<alvo>:<n>       a conta com n dias, como proposta para confirmar
 *   a:digitar:<alvo>        a pessoa vai escrever a data final
 *   a:semprazo:<publicação> confirmar antes de marcar sem prazo
 *   a:org:<escritório>      trocar o escritório das perguntas
 */
import { formatarDiaCurto, hojeEm } from "@decreta/core";
import { prazos, processos, publicacoes, withTenant, type Tx } from "@decreta/db";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { depoisDaDecisao, type Ator } from "../servicos/decisoes-do-prazo.ts";
import { contarParaProcesso, type SugestaoNaTela } from "../servicos/prazos.ts";
import { ultimaAnalise } from "../servicos/analises.ts";
import { painelDoDia } from "../servicos/hoje.ts";
import { resumoDaManha } from "../servicos/avisos.ts";
import { MAXIMO_DE_ITENS, type Botao, type Saida } from "./canal.ts";
import { mandarDocumento, paraPessoa } from "./documentos.ts";
import { mensagemDaFila } from "./fila.ts";
import { decidir, ehDaFila, fraseDoErro, propor } from "./propostas.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import { escritoriosDaPessoa, trocarDeEscritorio, type PessoaNoWhatsapp } from "./vinculo.ts";

export const SO_LEITURA = "O escritório está só para leitura (a fatura do Decreta está em aberto): pelo WhatsApp dá para consultar, mas não para confirmar nem marcar nada. Em Configurações > Plano dá para resolver.";

export function atorDoWhatsapp(p: PessoaNoWhatsapp, deps: Pick<DepsDoAgente, "origem">): Ator {
  return { organizationId: p.organizationId, userId: p.userId, nome: p.nome, ip: null, demonstracao: p.demonstracao, canal: deps.origem === "laboratorio" ? "laboratorio" : "whatsapp" };
}

const texto = (t: string): Saida => ({ tipo: "texto", texto: t });

/** O toque numa proposta: executa e responde. Na fila, a resposta já traz o próximo item. */
async function executarProposta(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, propostaId: string): Promise<Saida[]> {
  if (pessoa.acesso !== "total") return [texto(SO_LEITURA)];
  const ator = atorDoWhatsapp(pessoa, deps);
  const agora = agoraDe(deps);
  let r: Awaited<ReturnType<typeof decidir>>;
  try {
    r = await withTenant(deps.db, pessoa.organizationId, (tx) => decidir(tx, ator, propostaId, agora));
  } catch (err) {
    const frase = fraseDoErro(err);
    if (!frase) throw err;
    return withTenant(deps.db, pessoa.organizationId, async (tx) => [await mensagemDaFila(tx, pessoa, deps.telas, frase, agora)]);
  }
  if ("recusa" in r) {
    // Mudou desde a mensagem (alguém confirmou na tela, a IA releu): a fila mostra como está agora.
    return withTenant(deps.db, pessoa.organizationId, async (tx) => [await mensagemDaFila(tx, pessoa, deps.telas, r.recusa, agora)]);
  }
  const { proposta, resultado } = r;
  await depoisDaDecisao({ db: deps.db, log: deps.log, pedirRascunho: deps.pedirRascunho }, ator, resultado.acao, { ...resultado.detalhes, propostaId }, resultado.confirmou ? { confirmou: resultado.confirmou } : {});
  if (ehDaFila(proposta.tipo)) return withTenant(deps.db, pessoa.organizationId, async (tx) => [await mensagemDaFila(tx, pessoa, deps.telas, resultado.texto, agora)]);
  if (resultado.abrir) return [{ tipo: "link", texto: resultado.texto, rotulo: resultado.abrir.rotulo, url: resultado.abrir.url }];
  if (resultado.desfazer) {
    const d = resultado.desfazer;
    const id = await withTenant(deps.db, pessoa.organizationId, (tx) => propor(tx, pessoa, d.tipo, d.argumentos, resultado.texto, agora));
    return [{ tipo: "botoes", texto: resultado.texto, botoes: [{ id: `p:${id}`, titulo: d.rotulo }] }];
  }
  return [texto(resultado.texto)];
}

/** O alvo de "outro prazo": o prazo sugerido (p-) ou a publicação sem prazo pela IA (u-). */
type Alvo = { prazoId: string } | { publicacaoId: string };
function lerAlvo(s: string): Alvo | null {
  if (s.startsWith("p-")) return { prazoId: s.slice(2) };
  if (s.startsWith("u-")) return { publicacaoId: s.slice(2) };
  return null;
}
const codigoDoAlvo = (a: Alvo) => ("prazoId" in a ? `p-${a.prazoId}` : `u-${a.publicacaoId}`);

/** De onde a conta parte: o processo, a data da publicação, a contagem e o ato, do prazo sugerido ou da leitura da IA. */
async function baseDaConta(tx: Tx, alvo: Alvo): Promise<{ processoId: string; publicadoEm: string; contagem: "uteis" | "corridos"; tipo: string } | null> {
  if ("prazoId" in alvo) {
    const [p] = await tx.select({ processoId: prazos.processoId, publicadoEm: prazos.publicadoEm, contagem: prazos.contagem, tipo: prazos.tipo }).from(prazos).where(eq(prazos.id, alvo.prazoId));
    return p ? { ...p, contagem: p.contagem === "corridos" ? "corridos" : "uteis" } : null;
  }
  const [pub] = await tx.select({ processoId: publicacoes.processoId, publicadaEm: publicacoes.publicadaEm }).from(publicacoes).where(eq(publicacoes.id, alvo.publicacaoId));
  if (!pub?.processoId) return null;
  const s = (await ultimaAnalise(tx, "publicacao", alvo.publicacaoId, "sugerir-prazo"))?.conteudo as Partial<SugestaoNaTela> | undefined;
  return { processoId: pub.processoId, publicadoEm: pub.publicadaEm, contagem: s?.contagem === "corridos" ? "corridos" : "uteis", tipo: s?.tipo?.trim() || "Prazo" };
}

const DIAS_COMUNS = [5, 8, 10, 15, 30];

function listaDeDias(alvo: Alvo, contagem: "uteis" | "corridos", antes?: string): Saida {
  const extenso = contagem === "corridos" ? "corridos" : "úteis";
  return {
    tipo: "lista",
    texto: `${antes ? `${antes}\n\n` : ""}Quantos dias? A conta é em dias ${extenso}, no calendário do processo.`,
    botao: "Escolher",
    itens: [...DIAS_COMUNS.map((n) => ({ id: `a:dias:${codigoDoAlvo(alvo)}:${n}`, titulo: `${n} dias ${extenso}` })), { id: `a:digitar:${codigoDoAlvo(alvo)}`, titulo: "Digitar a data final" }],
  };
}

/** A conta com outra quantidade de dias (ou com a data digitada), como proposta: a pessoa vê a data antes de confirmar. */
export async function propostaDeOutraConta(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, alvo: Alvo, pedido: { dias: number } | { fimManual: string }): Promise<Saida> {
  const agora = agoraDe(deps);
  return withTenant(deps.db, pessoa.organizationId, async (tx) => {
    const b = await baseDaConta(tx, alvo);
    if (!b) return texto("Não achei mais esta publicação com processo. Abra no Decreta.");
    let fim: string;
    let frase: string;
    let dias: number | undefined;
    if ("dias" in pedido) {
      const c = await contarParaProcesso(tx, pessoa.organizationId, b.processoId, { publicacao: b.publicadoEm, dias: pedido.dias, contagem: b.contagem });
      fim = c.fim;
      dias = pedido.dias;
      frase = `Com ${pedido.dias} dias ${b.contagem === "corridos" ? "corridos" : "úteis"}: começa ${formatarDiaCurto(c.inicio)} e vence *${formatarDiaCurto(c.fim)}*.`;
    } else {
      fim = pedido.fimManual;
      frase = `Data final digitada: *${formatarDiaCurto(fim)}*. Fica anotado que foi digitada à mão.`;
    }
    const argumentos = "fimManual" in pedido ? { ...alvo, fimManual: pedido.fimManual, contagem: b.contagem, tipo: b.tipo, fim } : { ...alvo, dias, contagem: b.contagem, tipo: b.tipo, fim };
    const id = await propor(tx, pessoa, "outra_conta", argumentos, frase, agora);
    const botoes: Botao[] = [
      { id: `p:${id}`, titulo: `Confirmar ${formatarDiaCurto(fim)}` },
      { id: `a:outro:${codigoDoAlvo(alvo)}`, titulo: "Outro prazo" },
    ];
    return { tipo: "botoes", texto: frase, botoes };
  });
}

/** O resumo de hoje, inteiro, com o botão da fila quando há o que conferir. */
export async function resumoDeHoje(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp): Promise<Saida[]> {
  const hoje = hojeEm(pessoa.timezone, agoraDe(deps));
  return withTenant(deps.db, pessoa.organizationId, async (tx) => {
    const painel = await painelDoDia(deps.db, tx, pessoa.organizationId, hoje, pessoa.timezone, { iaLigada: !!deps.ia });
    const corpo = resumoDaManha(painel, { id: pessoa.userId, apelido: pessoa.apelido }, deps.telas, { saudacao: false }) ?? "Nada seu para hoje no Decreta.";
    const fila = await mensagemDaFila(tx, pessoa, deps.telas, null, agoraDe(deps));
    const tem = fila.tipo === "botoes";
    if (!tem || pessoa.acesso !== "total") return [texto(`*${pessoa.escritorio} · hoje*\n\n${corpo}`)];
    return [texto(`*${pessoa.escritorio} · hoje*\n\n${corpo}`), { tipo: "botoes", texto: "Há publicações para conferir. Quer resolver agora, uma por uma?", botoes: [{ id: "a:fila", titulo: "Conferir agora" }] }];
  });
}

/**
 * O que vence hoje e ainda está aberto. Um prazo só: o cartão dele, com "Já protocolei". Mais de um: uma
 * mensagem só, com a lista (até 10), e o toque numa linha traz o cartão. `prefixo`: o "Aviso das 15h: ".
 */
export async function venceHoje(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, prefixo = ""): Promise<Saida[]> {
  const hoje = hojeEm(pessoa.timezone, agoraDe(deps));
  const abertos = await withTenant(deps.db, pessoa.organizationId, (tx) => prazosQueVencemHoje(tx, pessoa.userId, hoje));
  if (!abertos.length) return [texto("Nada seu vence hoje e está aberto. Bom trabalho.")];
  if (abertos.length === 1) {
    const c = await cartaoDoPrazo(deps, pessoa, abertos[0]!.id);
    return [prefixo && "texto" in c ? { ...c, texto: `${prefixo}vence hoje e ainda está aberto.\n\n${c.texto}` } : c];
  }
  const mais = abertos.length > MAXIMO_DE_ITENS ? `\n\nE mais ${abertos.length - MAXIMO_DE_ITENS}: ${deps.telas.replace(/\/$/, "")}/prazos` : "";
  const frase = `vencem hoje e ainda estão abertos ${abertos.length} prazos seus. Toque para ver cada um e marcar o que já foi protocolado.${mais}`;
  return [
    {
      tipo: "lista",
      texto: prefixo ? `${prefixo}${frase}` : frase.replace(/^\w/, (x) => x.toUpperCase()),
      botao: "Ver os prazos",
      itens: abertos.slice(0, MAXIMO_DE_ITENS).map((p) => ({ id: `a:prazo:${p.id}`, titulo: p.tipo, descricao: p.titulo })),
    },
  ];
}

/** O cartão de um prazo aberto, com "Já protocolei" (que já vem com "Desfazer"). Só leitura: sem o botão. */
async function cartaoDoPrazo(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, prazoId: string): Promise<Saida> {
  const agora = agoraDe(deps);
  return withTenant(deps.db, pessoa.organizationId, async (tx) => {
    const [p] = await tx.select({ id: prazos.id, tipo: prazos.tipo, fim: prazos.fim, situacao: prazos.situacao, titulo: processos.titulo }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).where(eq(prazos.id, prazoId));
    if (!p) return texto("Não achei mais este prazo no Decreta.");
    const linha = `*${p.tipo}* · ${p.titulo}\nVence ${p.fim === hojeEm(pessoa.timezone, agora) ? "hoje" : "em"} (${formatarDiaCurto(p.fim)}). ${deps.telas.replace(/\/$/, "")}/prazos/${p.id}`;
    if (p.situacao !== "aberto") return texto(`${linha}\nEste prazo já está ${p.situacao}.`);
    if (pessoa.acesso !== "total") return texto(linha);
    const id = await propor(tx, pessoa, "prazo_cumprido", { prazoId: p.id }, linha, agora);
    return { tipo: "botoes", texto: linha, botoes: [{ id: `p:${id}`, titulo: "Já protocolei" }] };
  });
}

/** Os prazos da pessoa (ou sem dono) que vencem hoje e ainda estão abertos. */
export async function prazosQueVencemHoje(tx: Tx, userId: string, hoje: string) {
  return tx
    .select({ id: prazos.id, tipo: prazos.tipo, fim: prazos.fim, titulo: processos.titulo })
    .from(prazos)
    .innerJoin(processos, eq(processos.id, prazos.processoId))
    .where(and(eq(prazos.situacao, "aberto"), eq(prazos.fim, hoje), or(eq(prazos.responsavelId, userId), isNull(prazos.responsavelId))))
    .orderBy(asc(processos.titulo));
}

/** O toque, roteado. Devolve as mensagens para mandar (uma, quase sempre). */
export async function tratarEscolha(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, id: string): Promise<Saida[]> {
  if (id.startsWith("p:")) return executarProposta(deps, pessoa, id.slice(2));
  const [, acao, a, b] = id.split(":");
  switch (acao) {
    case "dia":
      return resumoDeHoje(deps, pessoa);
    case "fila":
      if (pessoa.acesso !== "total") return [texto(SO_LEITURA)];
      return withTenant(deps.db, pessoa.organizationId, async (tx) => [await mensagemDaFila(tx, pessoa, deps.telas, null, agoraDe(deps))]);
    case "vence":
      return venceHoje(deps, pessoa);
    case "prazo":
      if (!a) return [texto("Esta opção não vale mais.")];
      return [await cartaoDoPrazo(deps, pessoa, a)];
    case "doc":
      // O documento escolhido na lista sai pelo código, com as mesmas guardas do pedido à IA.
      if (!a) return [texto("Esta opção não vale mais.")];
      return paraPessoa(await mandarDocumento(deps, pessoa, a));
    case "outro":
    case "tem": {
      const alvo = lerAlvo(a ?? "");
      if (!alvo || pessoa.acesso !== "total") return [texto(alvo ? SO_LEITURA : "Esta opção não vale mais.")];
      const base = await withTenant(deps.db, pessoa.organizationId, (tx) => baseDaConta(tx, alvo));
      if (!base) return [texto("Não achei mais esta publicação com processo. Abra no Decreta.")];
      return [listaDeDias(alvo, base.contagem)];
    }
    case "dias": {
      const alvo = lerAlvo(a ?? "");
      const n = Number(b);
      if (!alvo || !Number.isInteger(n) || n < 1 || n > 365) return [texto("Esta opção não vale mais.")];
      if (pessoa.acesso !== "total") return [texto(SO_LEITURA)];
      return [await propostaDeOutraConta(deps, pessoa, alvo, { dias: n })];
    }
    case "digitar":
      return [texto("Escreva a data final, como 05/12. A data digitada fica anotada no prazo.")];
    case "semprazo": {
      if (!a || pessoa.acesso !== "total") return [texto(a ? SO_LEITURA : "Esta opção não vale mais.")];
      const pubId = a;
      const id2 = await withTenant(deps.db, pessoa.organizationId, (tx) => propor(tx, pessoa, "sem_prazo", { publicacaoId: pubId }, "Marcar sem prazo", agoraDe(deps)));
      return [{ tipo: "botoes", texto: "Marcar esta publicação sem prazo? A sugestão da IA sai e a publicação vai para Lidas.", botoes: [{ id: `p:${id2}`, titulo: "Sim, sem prazo" }, { id: "a:fila", titulo: "Voltar à fila" }] }];
    }
    case "org": {
      if (!a) return [texto("Esta opção não vale mais.")];
      const ok = await trocarDeEscritorio(deps.db, pessoa.userId, a);
      const nome = (await escritoriosDaPessoa(deps.db, pessoa.userId)).find((o) => o.id === a)?.nome;
      return [texto(ok ? `Pronto: as perguntas agora são sobre ${nome ?? "o escritório escolhido"}.` : "Você não é mais desse escritório.")];
    }
    default:
      return [texto("Não entendi esse toque. Escreva o que precisa.")];
  }
}

/** "Trocar de escritório": a lista dos escritórios da pessoa. */
export async function listaDeEscritorios(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp): Promise<Saida> {
  const orgs = await escritoriosDaPessoa(deps.db, pessoa.userId);
  if (orgs.length < 2) return texto(`Você está só em ${pessoa.escritorio}.`);
  return { tipo: "lista", texto: `Agora as perguntas são sobre ${pessoa.escritorio}. De qual escritório você quer falar?`, botao: "Escritórios", itens: orgs.map((o) => ({ id: `a:org:${o.id}`, titulo: o.nome })) };
}
