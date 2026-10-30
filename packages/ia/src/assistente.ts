/**
 * O Perguntar: conversa com a IA que consulta os dados do escritório por
 * ferramentas (prazos, processos, publicações, audiências, clientes,
 * documentos, alvarás, novos negócios, agenda e equipe).
 *
 * As ferramentas só leem. Mudar alguma coisa é sempre a pessoa, num cartão da
 * tela: a IA propõe a tarefa e a pessoa cria; a IA mostra o prazo e a pessoa
 * marca cumprido. O resultado de cada ferramenta vai para a IA e também para a
 * tela, que o mostra como cartão; por isso a resposta em texto não repete a
 * lista, só diz o que importa nela.
 */
import { diaDaSemana, formatarDia, formatarDiaCurto, nomeDoDiaDaSemana, somarDias, type Dia } from "@decreta/core";
import { generateText, stepCountIs, streamText, tool, type ModelMessage, type ToolSet } from "ai";
import { z } from "zod";
import type { Ia } from "./gateway.ts";

/* ------------------------------------------------------------------ */
/* O que as ferramentas pedem                                          */
/* ------------------------------------------------------------------ */

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "AAAA-MM-DD");
const quem = z.string().min(1).describe('"eu" (quem está perguntando), "sem" (sem responsável) ou o nome ou apelido de alguém da equipe');
const limite = z.number().int().min(1).max(50).optional().describe("Quantos itens no máximo. Padrão 20.");
const idDe = (o: string) => z.string().uuid().describe(`Id ${o}, como veio de outra ferramenta`);

export const filtroDePrazos = z.object({
  de: dia.optional().describe("Vence a partir deste dia (AAAA-MM-DD)"),
  ate: dia.optional().describe("Vence até este dia, inclusive (AAAA-MM-DD). Prazos vencidos: até ontem."),
  situacao: z.enum(["aberto", "cumprido", "descartado"]).optional().describe("Padrão: aberto"),
  responsavel: quem.optional(),
  processoId: idDe("do processo").optional(),
  busca: z.string().optional().describe('Palavra no nome do prazo, ex.: "contestação", "apelação"'),
  limite,
});
export type FiltroDePrazos = z.infer<typeof filtroDePrazos>;

export const filtroDeProcessos = z.object({
  busca: z.string().optional().describe("Nome de parte ou do cliente, número CNJ (ou parte dele), classe, assunto, vara ou comarca. Várias palavras: todas precisam aparecer."),
  situacao: z.enum(["ativos", "arquivados", "todos"]).optional().describe("Padrão: ativos (inclui suspensos)"),
  responsavel: quem.optional(),
  clienteId: idDe("do cliente").optional(),
  limite,
});
export type FiltroDeProcessos = z.infer<typeof filtroDeProcessos>;

export const filtroDePublicacoes = z.object({
  situacao: z.enum(["nao_tratadas", "nova", "pendente", "lida", "vinculada", "todas"]).optional().describe("nao_tratadas = novas e pendentes (padrão). vinculada = já virou prazo ou audiência. lida = não gera prazo."),
  de: dia.optional().describe("Disponibilizada a partir deste dia"),
  ate: dia.optional().describe("Disponibilizada até este dia"),
  processoId: idDe("do processo").optional(),
  busca: z.string().optional().describe("Palavra no teor ou no número do processo"),
  limite,
});
export type FiltroDePublicacoes = z.infer<typeof filtroDePublicacoes>;

export const filtroDeAudiencias = z.object({
  de: dia.optional().describe("A partir deste dia. Padrão: hoje"),
  ate: dia.optional().describe("Até este dia. Padrão: daqui a 30 dias"),
  processoId: idDe("do processo").optional(),
  responsavel: quem.optional(),
  incluirCanceladas: z.boolean().optional(),
  limite,
});
export type FiltroDeAudiencias = z.infer<typeof filtroDeAudiencias>;

export const filtroDaAgenda = z.object({
  de: dia.describe("Primeiro dia"),
  ate: dia.describe("Último dia (no máximo 31 dias depois do primeiro)"),
  responsavel: quem.optional(),
});
export type FiltroDaAgenda = z.infer<typeof filtroDaAgenda>;

export const filtroDeClientes = z.object({
  busca: z.string().min(2).describe("Nome, CPF/CNPJ (só os números servem) ou telefone"),
  limite,
});
export type FiltroDeClientes = z.infer<typeof filtroDeClientes>;

export const filtroDeDocumentos = z.object({
  busca: z.string().optional().describe("Palavra no nome do arquivo ou no texto do documento"),
  processoId: idDe("do processo").optional(),
  clienteId: idDe("do cliente").optional(),
  limite,
});
export type FiltroDeDocumentos = z.infer<typeof filtroDeDocumentos>;

export const filtroDeAlvaras = z.object({
  etapa: z.enum(["pendentes", "novo", "aguardando_saque", "sacado", "repassado", "finalizado", "todos"]).optional().describe("pendentes = novo, aguardando saque e sacado sem repasse (padrão)"),
  processoId: idDe("do processo").optional(),
  limite,
});
export type FiltroDeAlvaras = z.infer<typeof filtroDeAlvaras>;

export const filtroDeNegocios = z.object({
  etapa: z.enum(["triagem", "repassado", "concluido", "desistiu", "todos"]).optional().describe("Padrão: triagem"),
  limite,
});
export type FiltroDeNegocios = z.infer<typeof filtroDeNegocios>;

export const pedidoDeContagem = z.object({
  dias: z.number().int().min(1).max(3650),
  contagem: z.enum(["uteis", "corridos"]).describe("Processo civil e trabalhista: úteis"),
  publicadoEm: dia.optional().describe("Data da publicação (o prazo começa no dia útil seguinte)"),
  disponibilizadoEm: dia.optional().describe("Data em que saiu no DJEN, quando a pessoa só sabe essa: a publicação é o dia útil seguinte"),
  processoId: idDe("do processo, para usar o calendário do tribunal e da comarca dele").optional(),
});
export type PedidoDeContagemNaIa = z.infer<typeof pedidoDeContagem>;

export const propostaDeTarefa = z.object({
  titulo: z.string().min(2).max(200).describe('O que fazer, curto: "Ligar para a cliente sobre o laudo"'),
  dia: dia.describe("Quando"),
  detalhe: z.string().max(1000).optional(),
  responsavel: quem.optional().describe("Padrão: quem está perguntando"),
  processoId: idDe("do processo").optional(),
  clienteId: idDe("do cliente").optional(),
});
export type PropostaDeTarefaNaIa = z.infer<typeof propostaDeTarefa>;

/* ------------------------------------------------------------------ */
/* O que as ferramentas devolvem (a tela mostra os mesmos objetos)     */
/* ------------------------------------------------------------------ */

export interface PessoaNaIa {
  id: string;
  apelido: string;
  iniciais: string;
}

export interface ProcessoCurto {
  id: string;
  titulo: string;
  cnj: string | null;
}

export type UrgenciaNaIa = "vencido" | "hoje" | "breve" | "prazo" | "cumprido";

export interface Lista<T> {
  /** Quantos existem com o filtro (os itens podem ser menos, pelo limite). */
  total: number;
  itens: T[];
}

export interface PrazoNaIa {
  id: string;
  tipo: string;
  fim: string;
  /** "Hoje", "Amanhã", "6 nov", "Vencido · 27 out" */
  quando: string;
  urgencia: UrgenciaNaIa;
  situacao: "a_confirmar" | "confirmado" | "cumprido" | "descartado";
  dias: number;
  contagem: "uteis" | "corridos";
  processo: ProcessoCurto;
  responsavel: PessoaNaIa | null;
}

export interface ProcessoNaIa extends ProcessoCurto {
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  situacao: string;
  fase: string | null;
  cliente: { id: string; nome: string } | null;
  responsavel: PessoaNaIa | null;
  proximoPrazo: { id: string; tipo: string; fim: string; quando: string; urgencia: UrgenciaNaIa } | null;
}

export interface AudienciaNaIa {
  id: string;
  dia: string;
  hora: string;
  /** "sex., 6 nov · 14:00" */
  quando: string;
  tipo: string;
  porVideo: boolean;
  local: string | null;
  situacao: string;
  processo: ProcessoCurto;
  responsavel: PessoaNaIa | null;
}

export interface FichaDoProcesso {
  processo: ProcessoNaIa & { tribunal: string | null; valorCausa: string | null; poloCliente: string; segredo: boolean; distribuidoEm: string | null };
  prazos: PrazoNaIa[];
  audiencias: AudienciaNaIa[];
  /** Os autos em texto (partes, andamentos, publicações e documentos). Só a IA lê; não vai para a tela nem fica guardado. */
  autos?: string;
}

export interface PublicacaoNaIa {
  id: string;
  disponibilizadaEm: string;
  publicadaEm: string;
  tipo: string;
  orgao: string | null;
  cnj: string | null;
  processo: ProcessoCurto | null;
  situacao: "nova" | "pendente" | "lida" | "vinculada";
  /** A linha que a IA já escreveu ao sugerir o prazo, quando há. */
  resumo: string | null;
  teor: string;
}

export interface ClienteNaIa {
  id: string;
  nome: string;
  tipo: "pf" | "pj";
  documento: string | null;
  telefone: string | null;
  email: string | null;
  processos: number;
}

export interface FichaDoCliente {
  cliente: ClienteNaIa & { endereco: string | null; observacoes: string | null };
  processos: ProcessoNaIa[];
  atendimentos: { em: string; canal: string; resumo: string }[];
}

export interface DocumentoNaIa {
  id: string;
  nome: string;
  mime: string;
  paginas: number | null;
  evento: number | null;
  em: string;
  processo: ProcessoCurto | null;
  cliente: { id: string; nome: string } | null;
  /** O pedaço do texto onde a busca achou a palavra. */
  trecho: string | null;
}

export interface AlvaraNaIa {
  id: string;
  descricao: string;
  valor: string;
  valorRecebido: string | null;
  etapa: string;
  expedidoEm: string | null;
  processo: ProcessoCurto;
}

export interface NegocioNaIa {
  id: string;
  nome: string;
  assunto: string;
  area: string | null;
  pasta: string;
  etapa: string;
  responsavel: PessoaNaIa | null;
  desde: string;
}

export interface DiaDaAgenda {
  dia: string;
  /** "sex., 6 nov" */
  rotulo: string;
  itens: (
    | { tipo: "audiencia"; id: string; hora: string; titulo: string; porVideo: boolean; processo: ProcessoCurto }
    | { tipo: "prazo"; id: string; titulo: string; urgencia: UrgenciaNaIa; processo: ProcessoCurto }
    | { tipo: "tarefa"; id: string; titulo: string; concluida: boolean; processo: ProcessoCurto | null }
  )[];
}

export interface Panorama {
  hoje: string;
  prazos: { vencidos: number; hoje: number; ate7dias: number; abertos: number; aConfirmar: number; semResponsavel: number };
  publicacoes: { novas: number; pendentes: number };
  audiencias: { hoje: number; ate7dias: number };
  processos: { ativos: number; suspensos: number };
  clientes: number;
  alvaras: { pendentes: number; valorPendente: string };
  negocios: { triagem: number };
  meus: { prazosAbertos: number; prazosVencidos: number; audienciasAte7dias: number };
}

export interface ContagemNaIa {
  publicacao: string;
  inicio: string;
  fim: string;
  dias: number;
  contagem: "uteis" | "corridos";
  desconsiderados: { dia: string; nome: string; tipo: string }[];
  prorrogadoDe: string | null;
  explicacao: string;
  processo: ProcessoCurto | null;
}

export interface TarefaProposta {
  titulo: string;
  dia: string;
  detalhe: string | null;
  responsavel: PessoaNaIa | null;
  processo: ProcessoCurto | null;
  cliente: { id: string; nome: string } | null;
}

/** De onde vêm os dados: a API implementa, sempre dentro do escritório de quem pergunta. */
export interface DadosDoEscritorio {
  panorama(): Promise<Panorama>;
  prazos(f: FiltroDePrazos): Promise<Lista<PrazoNaIa>>;
  processos(f: FiltroDeProcessos): Promise<Lista<ProcessoNaIa>>;
  processo(id: string): Promise<FichaDoProcesso | null>;
  publicacoes(f: FiltroDePublicacoes): Promise<Lista<PublicacaoNaIa>>;
  audiencias(f: FiltroDeAudiencias): Promise<Lista<AudienciaNaIa>>;
  agenda(f: FiltroDaAgenda): Promise<{ dias: DiaDaAgenda[] }>;
  clientes(f: FiltroDeClientes): Promise<Lista<ClienteNaIa>>;
  cliente(id: string): Promise<FichaDoCliente | null>;
  documentos(f: FiltroDeDocumentos): Promise<Lista<DocumentoNaIa>>;
  documento(id: string): Promise<(DocumentoNaIa & { texto: string | null }) | null>;
  alvaras(f: FiltroDeAlvaras): Promise<Lista<AlvaraNaIa> & { valorTotal: string }>;
  negocios(f: FiltroDeNegocios): Promise<Lista<NegocioNaIa>>;
  equipe(): Promise<{ itens: (PessoaNaIa & { nome: string; cargo: string | null; oab: string | null; prazosAbertos: number; prazosVencidos: number })[] }>;
  contarPrazo(p: PedidoDeContagemNaIa): Promise<ContagemNaIa>;
  proporTarefa(p: PropostaDeTarefaNaIa): Promise<TarefaProposta>;
}

/* ------------------------------------------------------------------ */
/* As ferramentas                                                      */
/* ------------------------------------------------------------------ */

const naoAchou = (o: string) => ({ erro: `Não achei ${o} com este id. Busque de novo pelo nome.` });

export function ferramentasDoEscritorio(d: DadosDoEscritorio) {
  return {
    panorama: tool({
      description: "Números do escritório agora: prazos vencidos, de hoje e dos próximos 7 dias, a confirmar e sem responsável; publicações novas; audiências; processos; alvarás pendentes; novos negócios; e os números de quem pergunta. Use para perguntas gerais (\"como estamos?\", \"o que tenho hoje?\") antes de detalhar.",
      inputSchema: z.object({}),
      execute: () => d.panorama(),
    }),
    buscarPrazos: tool({
      description: "Prazos processuais do escritório, do que vence antes para o que vence depois. Cada um com processo, responsável, urgência e se ainda falta confirmar a data.",
      inputSchema: filtroDePrazos,
      execute: (f) => d.prazos(f),
    }),
    buscarProcessos: tool({
      description: "Procura processos e casos extrajudiciais por parte, cliente, número, classe, assunto, vara ou comarca. Devolve dados básicos e o próximo prazo de cada um.",
      inputSchema: filtroDeProcessos,
      execute: (f) => d.processos(f),
    }),
    lerProcesso: tool({
      description: "Abre um processo: dados, partes, prazos em aberto, audiências e os autos (andamentos, publicações e o texto dos documentos). Use antes de responder qualquer coisa sobre o conteúdo do processo.",
      inputSchema: z.object({ processoId: idDe("do processo") }),
      execute: async ({ processoId }) => (await d.processo(processoId)) ?? naoAchou("processo"),
    }),
    buscarPublicacoes: tool({
      description: "Publicações e intimações do DJEN que chegaram para o escritório, com o teor (resumido) e o que já foi feito com cada uma.",
      inputSchema: filtroDePublicacoes,
      execute: (f) => d.publicacoes(f),
    }),
    buscarAudiencias: tool({
      description: "Audiências marcadas (ou realizadas) num período, com hora, tipo, se é por vídeo, processo e responsável.",
      inputSchema: filtroDeAudiencias,
      execute: (f) => d.audiencias(f),
    }),
    verAgenda: tool({
      description: "A agenda dia a dia: audiências, vencimentos de prazo e tarefas. Use para \"como está minha semana\" ou \"o que tem na sexta\".",
      inputSchema: filtroDaAgenda,
      execute: (f) => d.agenda(f),
    }),
    buscarClientes: tool({
      description: "Procura clientes por nome, CPF/CNPJ ou telefone.",
      inputSchema: filtroDeClientes,
      execute: (f) => d.clientes(f),
    }),
    lerCliente: tool({
      description: "Abre a ficha de um cliente: contato, observações, processos e os últimos atendimentos.",
      inputSchema: z.object({ clienteId: idDe("do cliente") }),
      execute: async ({ clienteId }) => (await d.cliente(clienteId)) ?? naoAchou("cliente"),
    }),
    buscarDocumentos: tool({
      description: "Procura documentos (petições, laudos, decisões, procurações, peças do escritório) pelo nome ou por uma palavra do texto, no escritório todo ou num processo ou cliente.",
      inputSchema: filtroDeDocumentos,
      execute: (f) => d.documentos(f),
    }),
    lerDocumento: tool({
      description: "Lê o texto de um documento.",
      inputSchema: z.object({ documentoId: idDe("do documento") }),
      execute: async ({ documentoId }) => (await d.documento(documentoId)) ?? naoAchou("documento"),
    }),
    buscarAlvaras: tool({
      description: "Alvarás judiciais: valor, etapa (novo, aguardando saque, sacado, repassado ao cliente, finalizado) e processo.",
      inputSchema: filtroDeAlvaras,
      execute: (f) => d.alvaras(f),
    }),
    buscarNegocios: tool({
      description: "Novos negócios: pessoas que procuraram o escritório e ainda não viraram processo, com assunto, área e situação da pasta de documentos.",
      inputSchema: filtroDeNegocios,
      execute: (f) => d.negocios(f),
    }),
    verEquipe: tool({
      description: "A equipe do escritório, com cargo, OAB e quantos prazos cada um tem em aberto e vencidos.",
      inputSchema: z.object({}),
      execute: () => d.equipe(),
    }),
    contarPrazo: tool({
      description: "Conta um prazo no calendário do tribunal (feriados, recesso, suspensões do escritório) e devolve início e vencimento. Use sempre que precisar de uma data de vencimento: nunca conte de cabeça.",
      inputSchema: pedidoDeContagem,
      execute: (p) => d.contarPrazo(p),
    }),
    proporTarefa: tool({
      description: "Deixa uma tarefa pronta para a pessoa criar com um toque (ela confere e confirma no cartão). Use quando a pessoa pedir para lembrar, anotar ou agendar alguma coisa. Não cria nada sozinha.",
      inputSchema: propostaDeTarefa,
      execute: (p) => d.proporTarefa(p),
    }),
  } satisfies ToolSet;
}

export type FerramentaDoEscritorio = keyof ReturnType<typeof ferramentasDoEscritorio>;

/** O que fica guardado e vai para a tela: sem os autos e o texto inteiro dos documentos, que só a IA lê na hora. */
export function resultadoParaGuardar(nome: string, saida: unknown): unknown {
  if (!saida || typeof saida !== "object") return saida;
  if (nome === "lerProcesso" && "autos" in saida) {
    const { autos: _autos, ...resto } = saida as FichaDoProcesso;
    return resto;
  }
  if (nome === "lerDocumento" && "texto" in saida) {
    const { texto, ...resto } = saida as DocumentoNaIa & { texto: string | null };
    return { ...resto, trecho: resto.trecho ?? (texto ? texto.slice(0, 280) : null) };
  }
  return saida;
}

/* ------------------------------------------------------------------ */
/* A conversa                                                          */
/* ------------------------------------------------------------------ */

export type ModoDaConversa = "pergunte" | "jurisprudencia";

/** Uma mensagem guardada, como a conversa reconstrói para a IA. */
export interface MensagemGuardada {
  papel: "pessoa" | "ia";
  texto: string;
  partes?: ({ tipo: "texto"; texto: string } | { tipo: "ferramenta"; id: string; nome: string; entrada: unknown; saida: unknown; erro?: string })[] | null;
}

/** Resultado de ferramenta grande demais para voltar inteiro nas próximas perguntas vai cortado (a IA busca de novo se precisar). */
const TETO_DO_RESULTADO_ANTIGO = 6_000;
/** As últimas respostas voltam com o que as ferramentas devolveram; as anteriores, só com o texto. */
const RESPOSTAS_COM_FERRAMENTAS = 4;

/** A conversa guardada no formato da IA: pergunta, chamadas de ferramenta, resultados e resposta. */
export function mensagensParaIa(historico: MensagemGuardada[]): ModelMessage[] {
  const saida: ModelMessage[] = [];
  const ias = historico.map((m, i) => (m.papel === "ia" ? i : -1)).filter((i) => i >= 0);
  const comFerramentas = new Set(ias.slice(-RESPOSTAS_COM_FERRAMENTAS));
  historico.forEach((m, i) => {
    if (m.papel === "pessoa") {
      saida.push({ role: "user", content: m.texto });
      return;
    }
    const partes = comFerramentas.has(i) ? (m.partes ?? []) : [];
    if (!partes.some((p) => p.tipo === "ferramenta")) {
      if (m.texto.trim()) saida.push({ role: "assistant", content: m.texto });
      return;
    }
    let texto = "";
    for (const p of partes) {
      if (p.tipo === "texto") {
        texto += p.texto;
        continue;
      }
      saida.push({ role: "assistant", content: [...(texto.trim() ? [{ type: "text" as const, text: texto }] : []), { type: "tool-call", toolCallId: p.id, toolName: p.nome, input: p.entrada ?? {} }] });
      texto = "";
      const json = JSON.stringify(p.erro ? { erro: p.erro } : (p.saida ?? null));
      saida.push({
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: p.id,
            toolName: p.nome,
            output: json.length > TETO_DO_RESULTADO_ANTIGO ? { type: "text", value: `${json.slice(0, TETO_DO_RESULTADO_ANTIGO)}… [cortado; consulte de novo para ver tudo]` } : { type: "json", value: JSON.parse(json) },
          },
        ],
      });
    }
    if (texto.trim()) saida.push({ role: "assistant", content: texto });
  });
  return saida;
}

export interface QuemPergunta {
  nome: string;
  cargo: string | null;
  escritorio: string;
  /** Hoje no fuso do escritório. */
  hoje: Dia;
  timezone: string;
  /** "A pessoa abriu o Perguntar de dentro deste processo": nome e id. */
  foco?: string | null;
}

const dm = (d: Dia) => `${nomeDoDiaDaSemana(d)} ${formatarDiaCurto(d)}`;

/** O calendário que a IA precisa para entender "esta semana", "sexta", "mês que vem". */
export function textoDoCalendario(hoje: Dia): string {
  const s = diaDaSemana(hoje);
  const segunda = somarDias(hoje, s === 0 ? -6 : 1 - s);
  const domingo = somarDias(segunda, 6);
  const proxSegunda = somarDias(segunda, 7);
  const [a, m] = hoje.split("-").map(Number) as [number, number];
  const fimDoMes = somarDias(m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`, -1);
  return [
    `Hoje é ${nomeDoDiaDaSemana(hoje)}, ${formatarDia(hoje)} (${hoje}).`,
    `Ontem: ${dm(somarDias(hoje, -1))}. Amanhã: ${dm(somarDias(hoje, 1))}.`,
    `Esta semana: de ${dm(segunda)} (${segunda}) a ${dm(domingo)} (${domingo}).`,
    `Semana que vem: de ${dm(proxSegunda)} (${proxSegunda}) a ${dm(somarDias(proxSegunda, 6))} (${somarDias(proxSegunda, 6)}).`,
    `Este mês termina em ${formatarDia(fimDoMes)} (${fimDoMes}).`,
  ].join("\n");
}

function instrucoes(modo: ModoDaConversa, q: QuemPergunta): string {
  const foco =
    modo === "jurisprudencia"
      ? `## Jurisprudência
A pessoa procura jurisprudência e teses. Você não tem acesso a bases de jurisprudência verificadas: nunca invente ementa, número de processo, relator, data ou súmula que você não tenha certeza que existe.
- Explique as teses e a posição que costuma prevalecer, com o fundamento legal quando tiver certeza.
- Dê os termos de busca prontos para o site do TJSC, do STJ e do STF (entre aspas, com operadores quando ajudar).
- Avise que cada decisão precisa ser conferida na fonte antes de ir para a peça.
- Se a pergunta for sobre um caso do escritório, abra o processo com as ferramentas para entender os fatos.`
      : `## Como responder
- Pergunta sobre o escritório (prazos, processos, publicações, audiências, agenda, clientes, documentos, alvarás, novos negócios, equipe): consulte as ferramentas antes de responder. Você tem acesso aos dados do escritório; nunca diga que não tem nem peça para a pessoa colar os dados.
- Pergunta sobre o conteúdo de um processo: ache o processo e abra com lerProcesso. Para um documento específico (laudo, sentença, contestação), use lerDocumento.
- Dúvida jurídica geral (como contar um prazo, que recurso cabe, o que diz um artigo): responda com o que você sabe com segurança, cite o artigo de lei só quando tiver certeza e diga quando a resposta depende do caso.
- Data de vencimento: use contarPrazo. Nunca conte dias de cabeça. As datas dos prazos que já estão no sistema foram contadas pelo motor do Decreta e confirmadas por uma pessoa (ou estão "a confirmar").
- Pedido para lembrar, anotar ou agendar algo: use proporTarefa e diga que a tarefa está pronta no cartão para a pessoa conferir e criar.
- Você não cria, altera nem apaga nada sozinho. Ações (marcar prazo cumprido, criar tarefa, gerar peça) a pessoa faz pelos botões dos cartões ou nas telas do Decreta.`;

  return `Você é a IA do Decreta, o sistema de prazos e processos do escritório ${q.escritorio}. Está conversando com ${q.nome}${q.cargo ? ` (${q.cargo})` : ""}.

## Agora
${textoDoCalendario(q.hoje)}
Fuso: ${q.timezone}.${q.foco ? `\nA pessoa abriu esta conversa de dentro do processo ${q.foco}.` : ""}

${foco}

## Regras
- Use só o que veio das ferramentas e da conversa. Não invente fatos, eventos, datas, valores, números de lei nem jurisprudência. Sem base, diga o que falta.
- Os resultados das ferramentas já aparecem na tela como cartões interativos, logo abaixo da sua resposta: a pessoa vê a lista inteira e tem botões para abrir, marcar cumprido e criar. Não repita a lista. Diga o que importa nela: o mais urgente, o que pede ação, o que chama atenção, quantos são. Uma ou duas frases quando a lista fala por si.
- Ao mencionar um processo, prazo, publicação, audiência, cliente ou documento que veio das ferramentas, faça link com o caminho interno e o id que veio: [Marina Duarte × Seguradora Alfa](/processos/ID), [Manifestação sobre o laudo](/prazos/ID), [intimação de 28/10](/publicacoes/ID), [audiência de 06/11](/audiencias/ID), [Marina Duarte](/clientes/ID), [Laudo pericial](/documentos/ID). Só ids que vieram das ferramentas.
- Cite eventos e datas como aparecem nos autos ("evento 87", "28/10").
- Fale do ponto de vista do escritório: "nosso cliente", "a parte contrária".
- Português do Brasil, frases curtas, sem floreio, sem emoji, sem exclamação. Markdown simples: parágrafos curtos, listas, **negrito** só no essencial, tabela quando comparar coisas. Sem títulos grandes; no máximo ### em resposta longa.
- Não termine com oferta genérica de ajuda ("posso ajudar em algo mais?").`;
}

/** No máximo esta quantidade de rodadas de ferramenta por resposta. */
const PASSOS = 8;

export function conversarComAssistente(
  ia: Ia,
  entrada: { modo: ModoDaConversa; quem: QuemPergunta; historico: MensagemGuardada[]; dados: DadosDoEscritorio },
  signal?: AbortSignal,
) {
  return streamText({
    model: ia.modelo(entrada.modo === "jurisprudencia" ? "jurisprudencia" : "perguntar"),
    instructions: instrucoes(entrada.modo, entrada.quem),
    messages: mensagensParaIa(entrada.historico),
    tools: ferramentasDoEscritorio(entrada.dados),
    stopWhen: stepCountIs(PASSOS),
    abortSignal: signal,
    maxRetries: 1,
  });
}

/** Nome curto da conversa para o histórico ("Prazos desta semana"), tirado da primeira pergunta e resposta. */
export async function tituloDaConversa(ia: Ia, pergunta: string, resposta: string, signal?: AbortSignal): Promise<string | null> {
  const r = await generateText({
    model: ia.modelo("perguntar"),
    instructions:
      "Dê um título de 2 a 6 palavras para esta conversa, em português, com a primeira letra maiúscula e o resto em minúsculas (menos nomes próprios), sem aspas, sem ponto final, sem emoji. Só o título.",
    prompt: `Pergunta: ${pergunta.slice(0, 1000)}\n\nResposta: ${resposta.slice(0, 1500)}`,
    abortSignal: signal,
    maxRetries: 0,
    maxOutputTokens: 30,
  });
  const t = r.text.replace(/^["'“”\s]+|["'“”.\s]+$/g, "").split("\n")[0]!.trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

/** Título provisório até a IA dar o dela: a pergunta, cortada numa palavra. */
export function tituloProvisorio(pergunta: string): string {
  const limpa = pergunta.replace(/\s+/g, " ").trim();
  if (limpa.length <= 60) return limpa.replace(/[?.!]+$/, "");
  const corte = limpa.slice(0, 60);
  return `${corte.slice(0, corte.lastIndexOf(" ") > 30 ? corte.lastIndexOf(" ") : 60)}…`;
}
