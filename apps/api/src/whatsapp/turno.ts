/**
 * Um turno do agente: as mensagens que a pessoa mandou desde a última resposta viram uma resposta só.
 *
 * Antes da IA, o código resolve o que não precisa dela: "sair", "trocar de escritório", a data
 * digitada depois de "Digitar a data final" e o "sim" de uma proposta de risco baixo. Áudio é
 * transcrito; documento e foto ainda não são guardados pelo WhatsApp (a capacidade de encaminhar
 * espera o piloto).
 *
 * Se chegar mensagem nova enquanto a IA responde, o rascunho é descartado: o turno seguinte responde
 * tudo junto. O turno não gravou nada além de propostas, que são reaproveitadas.
 */
import { ehDia, formatarDiaCurto, hojeEm, telefoneWhatsapp } from "@decreta/core";
import { clientes, conversas, documentos, mensagensIa, prazos, processos, whatsappMensagens, withTenant, type ParteDaMensagem, type Tx } from "@decreta/db";
import { conversarPeloWhatsapp, ferramentasDoWhatsapp, instrucoesDeAgoraNoWhatsapp, resultadoParaGuardar, type AcoesDoWhatsapp, type MensagemGuardada } from "@decreta/ia";
import { and, asc, desc, eq, gte, inArray } from "drizzle-orm";
import { dadosDoEscritorio } from "../servicos/assistente.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { iaMedida, motivoParaBarrar, registrarMensagem, SEM_LIMITES, usoDoDia } from "../servicos/uso-ia.ts";
import { listaDeEscritorios, propostaDeOutraConta, SO_LEITURA, tratarEscolha } from "./acoes.ts";
import { cortar, TETO_DO_CORPO_INTERATIVO, type Botao, type Saida } from "./canal.ts";
import { dadosParaWhatsapp } from "./dados.ts";
import { mandarDocumento, paraIa } from "./documentos.ts";
import { paraWhatsapp } from "./formato.ts";
import { filaDaPessoa, mensagemDoItem } from "./fila.ts";
import { entradasSemResposta, marcarEntradas, marcarParaRevisao, ultimaEscolha } from "./mensagens.ts";
import { nomeDe, pendentesDa, propor, simDigitadoVale } from "./propostas.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import { naoConferem } from "./trava.ts";
import { desligarVinculo, type PessoaNoWhatsapp } from "./vinculo.ts";

const MEIA_HORA = 30 * 60_000;

/** O que o Laboratório mostra de cada turno: o que a IA consultou, quanto custou e quanto demorou. */
export interface Bastidores {
  ferramentas: { nome: string; entrada: unknown; saida: unknown; erro?: string }[];
  tokens: { entrada: number; saida: number; cache: number } | null;
  ms: number;
  propostas: string[];
  atalho?: string;
  /** A trava barrou a resposta (o que não conferiu). */
  revisao?: string;
}

export interface Turno {
  saidas: Saida[];
  /** As entradas respondidas (as que o turno leu). */
  entradas: string[];
  conversaId: string | null;
  bastidores: Bastidores;
  /** Chegou mensagem nova no meio: nada sai, o próximo turno responde tudo. */
  descartado?: boolean;
  /** Por que a resposta fica marcada para a equipe do Decreta rever ("trava: 24/04"). */
  revisao?: string;
}

const texto = (t: string): Saida => ({ tipo: "texto", texto: t });

/** "05/12", "5/12/2026", "05.12": a data digitada, no ano que faz sentido (o próximo, se já passou neste). */
export function lerDataDigitada(t: string, hoje: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\s*$/.exec(t);
  if (!m) return null;
  const dia = m[1]!.padStart(2, "0");
  const mes = m[2]!.padStart(2, "0");
  let ano = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : hoje.slice(0, 4);
  let d = `${ano}-${mes}-${dia}`;
  if (!m[3] && d < hoje) {
    ano = String(Number(ano) + 1);
    d = `${ano}-${mes}-${dia}`;
  }
  return ehDia(d) ? d : null;
}

const SIM = /^\s*(sim|s|ok|pode|confirmo|confirma|isso|manda)\s*[.!]*\s*$/i;
const SAIR = /^\s*(sair|desligar|desligar whatsapp|parar)\s*[.!]*\s*$/i;
const TROCAR = /^\s*trocar\s+(de\s+)?escrit[oó]rio\s*$/i;
const ERRADO = /^\s*(isso\s+)?((t[aá]|est[aá])\s+)?(tudo\s+)?(errad[oa]|incorret[oa])\b/i;

/** A conversa do WhatsApp (ou do Laboratório) das últimas 24 h, ou uma nova. */
async function conversaDoTurno(tx: Tx, pessoa: PessoaNoWhatsapp, canal: "whatsapp" | "laboratorio", agora: Date): Promise<string> {
  const [c] = await tx
    .select({ id: conversas.id })
    .from(conversas)
    .where(and(eq(conversas.userId, pessoa.userId), eq(conversas.canal, canal), gte(conversas.updatedAt, new Date(agora.getTime() - 24 * 60 * 60_000))))
    .orderBy(desc(conversas.updatedAt))
    .limit(1);
  if (c) return c.id;
  const [n] = await tx.insert(conversas).values({ organizationId: pessoa.organizationId, userId: pessoa.userId, titulo: canal === "whatsapp" ? "WhatsApp" : "Laboratório", canal }).returning({ id: conversas.id });
  return n!.id;
}

async function historicoDa(tx: Tx, conversaId: string): Promise<MensagemGuardada[]> {
  const linhas = await tx.select({ papel: mensagensIa.papel, texto: mensagensIa.texto, partes: mensagensIa.partes }).from(mensagensIa).where(eq(mensagensIa.conversaId, conversaId)).orderBy(asc(mensagensIa.createdAt));
  // A janela de 24 h raramente passa disto; o começo antigo sai para o pedido não crescer sem fim.
  return linhas.slice(-30).map((m) => ({ papel: m.papel, texto: m.texto, partes: m.partes as MensagemGuardada["partes"] }));
}

/**
 * A pergunta feita em resposta a uma mensagem do Decreta ("qual a vara desse?") vai com a mensagem citada:
 * a IA sabe de qual prazo ou publicação se fala (o link dela vem junto) e não adivinha o processo.
 */
async function comACitada(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, wamid: string, texto: string): Promise<string> {
  const [citada] = await withTenant(deps.db, pessoa.organizationId, (tx) =>
    tx
      .select({ texto: whatsappMensagens.texto })
      .from(whatsappMensagens)
      .where(and(eq(whatsappMensagens.wamid, wamid), eq(whatsappMensagens.userId, pessoa.userId), eq(whatsappMensagens.direcao, "saida"))),
  );
  return citada?.texto ? `[Em resposta a esta mensagem do Decreta: "${cortar(citada.texto, 800)}"]\n${texto}` : texto;
}

/** O que a pessoa mandou, em texto: áudio transcrito; o resto, descrito. */
async function textoDasEntradas(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, entradas: Awaited<ReturnType<typeof entradasSemResposta>>): Promise<{ texto: string; arquivos: number; outros: number }> {
  const partes: string[] = [];
  let arquivos = 0;
  let outros = 0;
  for (const e of entradas) {
    const midia = e.detalhes?.midia as { midia?: string; id?: string; mime?: string } | undefined;
    if (e.tipo === "texto" && e.texto) partes.push(e.responde ? await comACitada(deps, pessoa, e.responde, e.texto) : e.texto);
    else if (e.tipo === "audio" && midia?.id && deps.ia) {
      try {
        const m = await deps.canal.baixarMidia(midia.id);
        const t = await iaMedida(deps, deps.ia, { organizationId: pessoa.organizationId, userId: pessoa.userId, origem: "tela" }, (deps.limites ?? SEM_LIMITES).preco).transcrever(m.bytes, m.mime);
        if (t.trim()) {
          partes.push(t.trim());
          await withTenant(deps.db, pessoa.organizationId, (tx) => tx.update(whatsappMensagens).set({ texto: `Áudio: ${t.trim()}` }).where(eq(whatsappMensagens.id, e.id)));
        }
      } catch (err) {
        deps.log("whatsapp: o áudio não foi transcrito", { organizationId: pessoa.organizationId, error: err instanceof Error ? err.message : String(err) });
      }
    } else if (e.tipo === "escolha" && typeof e.detalhes?.escolha === "string" && e.detalhes.escolha.startsWith("e:proc:")) {
      // A escolha na lista de processos volta para a IA com o id: ela não adivinha pelo nome.
      const processoId = e.detalhes.escolha.slice("e:proc:".length);
      const [p] = await withTenant(deps.db, pessoa.organizationId, (tx) => tx.select({ titulo: processos.titulo }).from(processos).where(eq(processos.id, processoId)));
      partes.push(p ? `Escolhi o processo ${p.titulo} (id do processo: ${processoId}).` : "Escolhi um processo que não existe mais no Decreta.");
    } else if (e.tipo === "documento" || e.tipo === "imagem" || e.tipo === "video") arquivos++;
    else if (e.texto) partes.push(e.texto);
    else outros++;
  }
  return { texto: partes.join("\n"), arquivos, outros };
}


/**
 * A resposta com um link só do Decreta, numa linha própria, vira o botão "Abrir no Decreta" (o endereço sai
 * do texto). Com mais de um link, ou longa demais para o corpo do botão, fica em texto.
 */
export function comBotaoDeLink(t: string, base: string): Saida {
  const doDecreta = (s: string) => s.startsWith(`${base}/`) && !/\s/.test(s);
  const linhas = t.split("\n");
  const sozinhas = linhas.flatMap((l, i) => (doDecreta(l.trim()) ? [i] : []));
  const todos = t.split(/\s+/).filter((p) => p.includes(`${base}/`));
  if (sozinhas.length !== 1 || todos.length !== 1) return texto(t);
  const corpo = linhas.filter((_, i) => i !== sozinhas[0]).join("\n").trim();
  if (!corpo || corpo.length > TETO_DO_CORPO_INTERATIVO) return texto(t);
  return { tipo: "link", texto: corpo, rotulo: "Abrir no Decreta", url: linhas[sozinhas[0]!]!.trim() };
}

/** A resposta com o botão da proposta, dentro do limite do corpo interativo (o texto longo vai antes, separado). */
function comBotoes(t: string, botoes: Botao[]): Saida[] {
  if (!botoes.length) return [texto(t)];
  if (t.length <= TETO_DO_CORPO_INTERATIVO) return [{ tipo: "botoes", texto: t, botoes }];
  return [texto(t), { tipo: "botoes", texto: "Confere e toque para confirmar:", botoes }];
}

export async function responderTurno(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp): Promise<Turno> {
  const inicio = Date.now();
  const agora = agoraDe(deps);
  const bastidores: Bastidores = { ferramentas: [], tokens: null, ms: 0, propostas: [] };
  const canalDaConversa = deps.origem === "laboratorio" ? "laboratorio" : "whatsapp";
  const entradas = (await withTenant(deps.db, pessoa.organizationId, (tx) => entradasSemResposta(tx, pessoa.userId))).filter((e) => (deps.origem === "laboratorio" ? e.origem === "laboratorio" : e.origem !== "laboratorio"));
  const ids = entradas.map((e) => e.id);
  const pronto = async (saidas: Saida[], atalho?: string, conversaId: string | null = null): Promise<Turno> => {
    await withTenant(deps.db, pessoa.organizationId, (tx) => marcarEntradas(tx, ids, "respondida", conversaId));
    return { saidas, entradas: ids, conversaId, bastidores: { ...bastidores, atalho, ms: Date.now() - inicio } };
  };
  if (!entradas.length) return { saidas: [], entradas: [], conversaId: null, bastidores };

  const lido = await textoDasEntradas(deps, pessoa, entradas);
  const t = lido.texto.trim();
  if (!t) {
    if (lido.arquivos) return pronto([texto(`Por enquanto eu não guardo arquivos que chegam pelo WhatsApp. Para pôr no processo, use Documentos no Decreta: ${deps.telas.replace(/\/$/, "")}/documentos`)], "arquivo");
    return pronto([texto("Por aqui eu entendo texto, áudio e os botões das mensagens.")], "outro");
  }

  // O que o código resolve sozinho.
  if (SAIR.test(t)) {
    if (deps.origem !== "laboratorio") await desligarVinculo(deps.db, pessoa.userId);
    return pronto([texto("Pronto: este WhatsApp foi desligado do Decreta. Para ligar de novo, use Configurações > WhatsApp.")], "sair");
  }
  if (TROCAR.test(t)) return pronto([await listaDeEscritorios(deps, pessoa)], "trocar");
  // "Está errado": a última resposta fica para a equipe rever (vira caso do avaliador), e a IA responde de novo.
  if (ERRADO.test(t)) await marcarParaRevisao(deps.db, pessoa, "ultima", "a pessoa disse que está errado");
  const hoje = hojeEm(pessoa.timezone, agora);
  const data = lerDataDigitada(t, hoje);
  if (data) {
    const escolha = await withTenant(deps.db, pessoa.organizationId, (tx) => ultimaEscolha(tx, pessoa.userId, "a:digitar:", MEIA_HORA, agora));
    if (escolha) {
      if (pessoa.acesso !== "total") return pronto([texto(SO_LEITURA)], "data");
      const alvo = escolha.slice("a:digitar:".length);
      const a = alvo.startsWith("p-") ? { prazoId: alvo.slice(2) } : { publicacaoId: alvo.slice(2) };
      return pronto([await propostaDeOutraConta(deps, pessoa, a, { fimManual: data })], "data");
    }
  }
  if (SIM.test(t)) {
    const pendentes = await withTenant(deps.db, pessoa.organizationId, (tx) => pendentesDa(tx, pessoa.userId, agora));
    const recentes = pendentes.filter((p) => agora.getTime() - p.createdAt.getTime() < MEIA_HORA);
    const ultima = recentes[0];
    if (ultima && simDigitadoVale(ultima.tipo) && recentes.filter((p) => simDigitadoVale(p.tipo)).length === 1) return pronto(await tratarEscolha(deps, pessoa, `p:${ultima.id}`), "sim");
    // Prazo só pelo botão: o "sim" digitado manda de novo a fila, com os botões.
    if (ultima) return pronto(await tratarEscolha(deps, pessoa, "a:fila"), "sim");
  }

  if (!deps.ia) return pronto([texto("A IA do Decreta está desligada neste servidor. Os avisos e a fila continuam chegando.")], "sem-ia");
  const limites = deps.limites ?? SEM_LIMITES;
  const motivo = motivoParaBarrar(limites, await usoDoDia(deps.db, { organizationId: pessoa.organizationId, userId: pessoa.userId }), { demonstracao: pessoa.demonstracao, emAvaliacao: pessoa.emAvaliacao, mensagem: true });
  if (motivo) return pronto([texto(motivo)], "limite");
  await registrarMensagem(deps.db, { organizationId: pessoa.organizationId, userId: pessoa.userId }, "whatsapp", agora);
  const ia = iaMedida(deps, deps.ia, { organizationId: pessoa.organizationId, userId: pessoa.userId, origem: "tela" }, limites.preco);

  const preparado = await withTenant(deps.db, pessoa.organizationId, async (tx) => {
    const conversaId = await conversaDoTurno(tx, pessoa, canalDaConversa, agora);
    const historico = await historicoDa(tx, conversaId);
    const tribunal = await tribunalPadrao(tx, pessoa.organizationId);
    return { conversaId, historico, tribunal, calendario: await calendarioDoEscritorio(tx, tribunal) };
  });

  const botoes: Botao[] = [];
  /** O que vai depois da resposta, montado pelo código (o item da fila, com os botões dele). */
  const extras: Saida[] = [];
  const base = deps.telas.replace(/\/$/, "");
  const umaProposta = () => {
    if (botoes.length || extras.length) throw new Error("Uma proposta por resposta: a que já está pronta vai no botão. Diga isso à pessoa.");
  };
  /** Os documentos já mandados neste turno: a IA que refaz a resposta não manda o mesmo arquivo de novo. */
  const mandados = new Set<string>();
  const acoes: AcoesDoWhatsapp = {
    enviarDocumento: async (documentoId) => {
      if (mandados.has(documentoId)) return "Este arquivo já foi mandado nesta conversa. Não diga que mandou de novo.";
      mandados.add(documentoId);
      return paraIa(await mandarDocumento(deps, pessoa, documentoId));
    },
    escolherDocumento: async (p) => {
      umaProposta();
      const linhas = await withTenant(deps.db, pessoa.organizationId, (tx) =>
        tx.select({ id: documentos.id, nome: documentos.nome, processo: processos.titulo, cliente: clientes.nome }).from(documentos).leftJoin(processos, eq(processos.id, documentos.processoId)).leftJoin(clientes, eq(clientes.id, documentos.clienteId)).where(inArray(documentos.id, p.documentoIds)),
      );
      if (linhas.length < 2) return "Destes ids, achei menos de dois documentos: mande o que achou com enviarDocumento, ou busque de novo.";
      // Na ordem em que a IA mandou: o mais provável primeiro.
      linhas.sort((x, y) => p.documentoIds.indexOf(x.id) - p.documentoIds.indexOf(y.id));
      // Os nomes vêm do banco, não da IA: a pessoa escolhe o documento de verdade, pelo id.
      extras.push({ tipo: "lista", texto: "Qual destes documentos? O escolhido vem como arquivo.", botao: "Escolher", itens: linhas.map((d) => ({ id: `a:doc:${d.id}`, titulo: d.nome.replace(/\.[a-z0-9]{2,4}$/i, ""), descricao: d.processo ?? d.cliente ?? d.nome })) });
      return "A lista com os documentos vai logo depois da sua resposta. Na resposta, uma linha pedindo para a pessoa escolher; o escolhido vai como arquivo, sem você.";
    },
    escolherProcesso: async (p) => {
      umaProposta();
      const linhas = await withTenant(deps.db, pessoa.organizationId, (tx) => tx.select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj, orgao: processos.orgao }).from(processos).where(inArray(processos.id, p.processoIds)));
      if (linhas.length < 2) return "Destes ids, achei menos de dois processos: responda sobre o que achou, ou busque de novo.";
      linhas.sort((x, y) => p.processoIds.indexOf(x.id) - p.processoIds.indexOf(y.id));
      extras.push({ tipo: "lista", texto: "Qual destes processos?", botao: "Escolher", itens: linhas.map((x) => ({ id: `e:proc:${x.id}`, titulo: x.titulo, descricao: [x.cnj, x.orgao].filter(Boolean).join(" · ") || x.titulo })) });
      return "A lista com os processos vai logo depois da sua resposta. Na resposta, uma linha perguntando de qual a pessoa fala; a escolha volta para você com o id.";
    },
    proporTextoAoCliente: async (p) => {
      umaProposta();
      if (pessoa.acesso !== "total") return SO_LEITURA;
      return withTenant(deps.db, pessoa.organizationId, async (tx) => {
        const [cl] = await tx.select({ nome: clientes.nome, telefone: clientes.telefone, semIa: clientes.semIa }).from(clientes).where(eq(clientes.id, p.clienteId));
        if (!cl) return "Não achei o cliente com este id. Busque de novo pelo nome.";
        if (cl.semIa) return "Este cliente está marcado sem IA: o texto ao cliente não pode ser escrito pela IA. Diga isso à pessoa.";
        const id = await propor(tx, pessoa, "aprovar_texto", { clienteId: p.clienteId, processoId: p.processoId ?? null, texto: p.texto }, p.texto, agora);
        bastidores.propostas.push(id);
        botoes.push({ id: `p:${id}`, titulo: "Aprovar e abrir" });
        const semNumero = !telefoneWhatsapp(cl.telefone ?? "");
        return `Texto pronto para a pessoa aprovar no botão "Aprovar e abrir", que vai junto da sua resposta. ${semNumero ? "O cliente não tem celular no cadastro: ao aprovar, o texto vem para copiar." : "Ao aprovar, abre a conversa com o cliente no WhatsApp dela."} Na resposta, mostre o texto inteiro entre aspas para ela conferir e não diga que foi enviado.`;
      });
    },
    proporTarefa: async (p) => {
      umaProposta();
      if (pessoa.acesso !== "total") return SO_LEITURA;
      const dados = dadosDoEscritorio({ db: deps.db, organizationId: pessoa.organizationId, userId: pessoa.userId, timezone: pessoa.timezone, financeiro: false });
      const t2 = await dados.proporTarefa(p);
      const id = await withTenant(deps.db, pessoa.organizationId, (tx) =>
        propor(tx, pessoa, "criar_tarefa", { titulo: t2.titulo, dia: t2.dia, detalhe: t2.detalhe, responsavelId: t2.responsavel?.id ?? pessoa.userId, processoId: t2.processo?.id ?? null, clienteId: t2.cliente?.id ?? null }, t2.titulo, agora),
      );
      bastidores.propostas.push(id);
      botoes.push({ id: `p:${id}`, titulo: "Criar tarefa" });
      return `Tarefa pronta para a pessoa criar no botão "Criar tarefa", que vai junto da sua resposta: ${t2.titulo}, ${t2.dia}${t2.responsavel ? `, com ${t2.responsavel.apelido}` : ""}. Não diga que foi criada.`;
    },
    proporCumprido: async (p) => {
      umaProposta();
      if (pessoa.acesso !== "total") return SO_LEITURA;
      return withTenant(deps.db, pessoa.organizationId, async (tx) => {
        const [pz] = await tx.select({ tipo: prazos.tipo, fim: prazos.fim, situacao: prazos.situacao, titulo: processos.titulo }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).where(eq(prazos.id, p.prazoId));
        if (!pz) return "Não achei o prazo com este id. Busque de novo com buscarPrazos.";
        if (pz.situacao !== "aberto") return `Este prazo já está ${pz.situacao}. Diga isso à pessoa; não há o que marcar.`;
        const id = await propor(tx, pessoa, "prazo_cumprido", { prazoId: p.prazoId }, `${pz.tipo} · ${pz.titulo}`, agora);
        bastidores.propostas.push(id);
        botoes.push({ id: `p:${id}`, titulo: "Marcar cumprido" });
        return `Pronto para a pessoa marcar no botão "Marcar cumprido", que vai junto da sua resposta: ${pz.tipo}, ${pz.titulo}, vence ${formatarDiaCurto(pz.fim)}. Não diga que foi marcado.`;
      });
    },
    mostrarNaFila: async (p) => {
      umaProposta();
      if (pessoa.acesso !== "total") return SO_LEITURA;
      return withTenant(deps.db, pessoa.organizationId, async (tx) => {
        const fila = await filaDaPessoa(tx, pessoa);
        const item = fila.itens.find((i) => (p.prazoId ? i.tipo === "sugerido" && i.prazoId === p.prazoId : i.publicacaoId === p.publicacaoId));
        if (!item) {
          if (!p.prazoId) return `Esta publicação não está na fila desta pessoa para confirmar. Dê o link: ${base}/publicacoes/${p.publicacaoId}`;
          const [pz] = await tx.select({ situacao: prazos.situacao, confirmadoEm: prazos.confirmadoEm, confirmadoPor: prazos.confirmadoPor }).from(prazos).where(eq(prazos.id, p.prazoId));
          if (!pz) return "Não achei o prazo com este id. Busque de novo com buscarPrazos.";
          if (pz.situacao !== "aberto") return `Este prazo já está ${pz.situacao}. Diga isso à pessoa; não há o que confirmar.`;
          if (pz.confirmadoEm) return `Este prazo já foi confirmado por ${(await nomeDe(tx, pz.confirmadoPor)) ?? "alguém do escritório"} em ${formatarDiaCurto(hojeEm(pessoa.timezone, pz.confirmadoEm))}. Diga isso à pessoa; não há o que confirmar.`;
          return `Este prazo não está na fila desta pessoa (é de outra pessoa ou não veio de uma publicação). Dê o link: ${base}/prazos/${p.prazoId}`;
        }
        const m = await mensagemDoItem(tx, pessoa, deps.telas, item, { n: 1, total: 1 }, agora);
        extras.push({ tipo: "botoes", texto: m.texto, botoes: m.botoes, rodape: m.rodape });
        bastidores.propostas.push(...m.botoes.filter((b) => b.id.startsWith("p:")).map((b) => b.id.slice(2)));
        return "O prazo vai logo depois da sua resposta, com o trecho, a conta e os botões. Na resposta, diga em uma linha que ele vem a seguir; não diga que confirmou.";
      });
    },
  };
  const dados = dadosParaWhatsapp(dadosDoEscritorio({ db: deps.db, organizationId: pessoa.organizationId, userId: pessoa.userId, timezone: pessoa.timezone, financeiro: false }), { db: deps.db, organizationId: pessoa.organizationId });
  const historico: MensagemGuardada[] = [...preparado.historico, { papel: "pessoa", texto: t }];
  const quem = { nome: pessoa.nome, cargo: pessoa.cargo, escritorio: pessoa.escritorio, hoje, timezone: pessoa.timezone, tribunal: preparado.tribunal, calendario: preparado.calendario, telas: deps.telas, suporte: deps.suporte };
  const ferramentas = ferramentasDoWhatsapp(dados, acoes);

  /** Uma resposta da IA: o texto, o que ela consultou (para guardar) e o que as consultas devolveram (as fontes da trava). */
  async function rodada(conversa: MensagemGuardada[]): Promise<{ resposta: string; partes: ParteDaMensagem[]; fontes: string[] }> {
    const c = conversarPeloWhatsapp(ia, { quem, historico: conversa, ferramentas }, AbortSignal.timeout(75_000));
    // A mensagem do WhatsApp sai inteira: espera o fim das rodadas.
    const [text, steps, u] = await Promise.all([c.text, c.steps, c.totalUsage]);
    const partes: ParteDaMensagem[] = [];
    const fontes: string[] = [];
    for (const passo of steps) {
      for (const chamada of passo.toolCalls) {
        const resultado = passo.toolResults.find((x) => x.toolCallId === chamada.toolCallId);
        const erro = passo.content.find((x) => x.type === "tool-error" && x.toolCallId === chamada.toolCallId) as { error?: unknown } | undefined;
        const saida = resultado ? resultadoParaGuardar(chamada.toolName, resultado.output) : null;
        if (resultado) fontes.push(JSON.stringify(resultado.output));
        const parte = { nome: chamada.toolName, entrada: chamada.input, saida, ...(erro ? { erro: erro.error instanceof Error ? erro.error.message : String(erro.error) } : {}) };
        partes.push({ tipo: "ferramenta", id: chamada.toolCallId, ...parte });
        bastidores.ferramentas.push(parte);
      }
    }
    const antes = bastidores.tokens ?? { entrada: 0, saida: 0, cache: 0 };
    bastidores.tokens = { entrada: antes.entrada + (u.inputTokens ?? 0), saida: antes.saida + (u.outputTokens ?? 0), cache: antes.cache + (u.inputTokenDetails?.cacheReadTokens ?? 0) };
    const resposta = paraWhatsapp(text || "Não consegui montar a resposta agora. Tente de novo.", deps.telas);
    return { resposta, partes: [...partes, { tipo: "texto", texto: resposta }], fontes };
  }

  // A trava: o que a resposta afirma (data, processo, dias, valor) precisa estar numa fonte do turno. Não está:
  // a IA refaz uma vez, sabendo o quê; se ainda não estiver, sai a resposta fixa e a conversa fica para revisão.
  const fixas = [JSON.stringify(preparado.historico), t, instrucoesDeAgoraNoWhatsapp(quem)];
  let final: Awaited<ReturnType<typeof rodada>>;
  let revisao: string | undefined;
  try {
    const primeira = await rodada(historico);
    final = primeira;
    const faltam = naoConferem(primeira.resposta, [...fixas, ...primeira.fontes], pessoa.timezone);
    if (faltam.length) {
      botoes.length = 0;
      extras.length = 0;
      const correcao = `[Conferência do Decreta, não é a pessoa escrevendo] Isto da sua resposta não veio das consultas: ${faltam.join(", ")}. Refaça a resposta só com o que as ferramentas devolverem (consulte de novo se precisar). Sem base, diga o que falta.`;
      const segunda = await rodada([...historico, { papel: "ia", texto: primeira.resposta, partes: primeira.partes }, { papel: "pessoa", texto: correcao }]);
      final = { ...segunda, partes: [...primeira.partes.filter((p) => p.tipo === "ferramenta"), ...segunda.partes] };
      const aindaFaltam = naoConferem(segunda.resposta, [...fixas, ...primeira.fontes, ...segunda.fontes], pessoa.timezone);
      if (aindaFaltam.length) revisao = `trava: ${aindaFaltam.join(", ")}`;
    }
  } catch (err) {
    deps.log("whatsapp: a IA falhou no turno", { organizationId: pessoa.organizationId, userId: pessoa.userId, error: err instanceof Error ? err.message : String(err) });
    return pronto([texto(`Não consegui consultar agora. Tente de novo em instantes, ou abra no Decreta: ${base}/hoje`)], "falha");
  }

  // Mensagem nova no meio: este rascunho não sai. O próximo turno lê tudo (as propostas ficam e são reaproveitadas).
  const depois = await withTenant(deps.db, pessoa.organizationId, (tx) => entradasSemResposta(tx, pessoa.userId));
  if (depois.some((e) => !ids.includes(e.id) && (deps.origem === "laboratorio") === (e.origem === "laboratorio"))) return { saidas: [], entradas: [], conversaId: preparado.conversaId, bastidores, descartado: true };

  let resposta = final.resposta;
  let partes = final.partes;
  if (revisao) {
    // O que não confere não sai, nem o botão que veio com ele: fica o link do item de que a resposta falava.
    const link = new RegExp(`${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/[a-z]+/[0-9a-f-]{36}`).exec(resposta)?.[0] ?? `${base}/hoje`;
    resposta = `Não consegui conferir esta resposta com os dados do Decreta, e não mando o que não confere.\n${link}`;
    partes = [...partes.filter((p) => p.tipo === "ferramenta"), { tipo: "texto", texto: resposta }];
    botoes.length = 0;
    extras.length = 0;
    bastidores.revisao = revisao;
  }

  await withTenant(deps.db, pessoa.organizationId, async (tx) => {
    await tx.insert(mensagensIa).values([
      { organizationId: pessoa.organizationId, conversaId: preparado.conversaId, userId: pessoa.userId, papel: "pessoa", texto: t },
      { organizationId: pessoa.organizationId, conversaId: preparado.conversaId, userId: pessoa.userId, papel: "ia", texto: resposta, partes },
    ]);
    await tx.update(conversas).set({ updatedAt: agora }).where(eq(conversas.id, preparado.conversaId));
  });
  const principal = botoes.length ? comBotoes(cortar(resposta, 4000), botoes) : [comBotaoDeLink(cortar(resposta, 4000), base)];
  const turno = await pronto([...principal, ...extras], undefined, preparado.conversaId);
  return revisao ? { ...turno, revisao } : turno;
}

