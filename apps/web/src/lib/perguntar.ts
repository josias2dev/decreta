/**
 * O Perguntar: as conversas de cada pessoa com a IA, o que a IA consultou em
 * cada resposta (vira cartão na tela) e a leitura da resposta aos poucos, uma
 * linha JSON por acontecimento.
 */
import { API_URL, ApiError } from "./api";
import type { CitacaoVerificada, SeloDaCitacao, Urgencia } from "./tipos";

export type Modo = "pergunte" | "jurisprudencia";

export interface ConversaNaLista {
  id: string;
  titulo: string;
  modo: Modo;
  fixada: boolean;
  criadaEm: string;
  atualizadaEm: string;
  processo: { id: string; titulo: string } | null;
}

/**
 * `saida` undefined: a ferramenta ainda roda (resposta chegando). Numa
 * mensagem já gravada, saida null ou ausente sem `erro` é consulta que não
 * terminou. Com `erro`, a ferramenta não achou ou falhou (não vira cartão).
 */
export type Parte =
  | { tipo: "texto"; texto: string }
  | { tipo: "ferramenta"; id: string; nome: string; entrada: Record<string, unknown> | null; saida: unknown; erro?: string }
  /** As citações que a IA escreveu direto no texto, cada uma com o selo (nenhuma aparece sem selo). */
  | { tipo: "citacoes"; itens: CitacaoVerificada[] };

/** A citação que a IA pediu no modo Jurisprudência (ferramenta "citar"), montada e conferida pelo Decreta. */
export interface CitacaoConferida {
  n: number;
  chave: string;
  /** "Súmula 608 do STJ": vem do acervo, não da IA. */
  rotulo: string;
  afirmacao: string;
  trecho: string;
  literal: boolean | null;
  sustenta: "sim" | "parcial" | "nao" | null;
  selo: SeloDaCitacao;
  motivo: string;
  texto: string | null;
  fonte: { nome: string; url: string; capturadoEm: string } | null;
}

export interface MensagemDaConversa {
  id: string;
  papel: "pessoa" | "ia";
  texto: string;
  partes: Parte[] | null;
  em: string;
}

export interface ConversaAberta {
  rodape: string;
  conversa: ConversaNaLista;
  mensagens: MensagemDaConversa[];
}

/* ---------- O que as ferramentas devolvem (o mesmo formato da API) ---------- */

export interface PessoaCurta {
  id: string;
  apelido: string;
  iniciais: string;
}
export interface ProcessoCurto {
  id: string;
  titulo: string;
  cnj: string | null;
}
export interface Lista<T> {
  total: number;
  itens: T[];
}
export interface PrazoNaIa {
  id: string;
  tipo: string;
  fim: string;
  quando: string;
  urgencia: Urgencia;
  situacao: "a_confirmar" | "confirmado" | "cumprido" | "descartado";
  dias: number;
  contagem: "uteis" | "corridos";
  processo: ProcessoCurto;
  responsavel: PessoaCurta | null;
  /** O dia em que foi marcado cumprido (AAAA-MM-DD). Conversas antigas não têm. */
  cumpridoEm?: string | null;
}
export interface ProcessoNaIa extends ProcessoCurto {
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  situacao: string;
  fase: string | null;
  cliente: { id: string; nome: string } | null;
  responsavel: PessoaCurta | null;
  proximoPrazo: { id: string; tipo: string; fim: string; quando: string; urgencia: Urgencia } | null;
  /** O último andamento. Conversas antigas não têm. */
  ultimaMovimentacao?: { dia: string; titulo: string } | null;
}
export interface AudienciaNaIa {
  id: string;
  dia: string;
  hora: string;
  quando: string;
  tipo: string;
  porVideo: boolean;
  local: string | null;
  situacao: string;
  processo: ProcessoCurto;
  responsavel: PessoaCurta | null;
}
export interface FichaDoProcesso {
  processo: ProcessoNaIa & { tribunal: string | null; valorCausa: string | null; poloCliente: string; segredo: boolean; distribuidoEm: string | null };
  prazos: PrazoNaIa[];
  audiencias: AudienciaNaIa[];
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
  responsavel: PessoaCurta | null;
  desde: string;
}
export interface DiaDaAgenda {
  dia: string;
  rotulo: string;
  itens: (
    /** situacao: "marcada", "redesignada", "realizada", "cancelada" (conversas antigas não têm). */
    | { tipo: "audiencia"; id: string; hora: string; titulo: string; porVideo: boolean; situacao?: string; processo: ProcessoCurto }
    | { tipo: "prazo"; id: string; titulo: string; urgencia: Urgencia; processo: ProcessoCurto }
    /** atrasada: de um dia anterior e ainda não feita (vem no primeiro dia, quando ele é hoje). */
    | { tipo: "tarefa"; id: string; titulo: string; concluida: boolean; atrasada?: boolean; processo: ProcessoCurto | null }
  )[];
}
export interface AgendaNaIa {
  dias: DiaDaAgenda[];
  /** O último dia que veio, quando o pedido passou do teto de dias. */
  cortadoEm?: string;
}
export interface Panorama {
  hoje: string;
  prazos: { vencidos: number; hoje: number; ate7dias: number; abertos: number; aConfirmar: number; semResponsavel: number };
  publicacoes: { novas: number; pendentes: number };
  audiencias: { hoje: number; ate7dias: number };
  /** Tarefas não feitas: as atrasadas e as de hoje. Conversas antigas não têm. */
  tarefas?: { atrasadas: number; hoje: number; minhasAtrasadas: number; minhasHoje: number };
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
  /** "TJSC, com os feriados de Joinville". Conversas antigas não têm. */
  calendario?: string;
}
export interface TarefaProposta {
  titulo: string;
  dia: string;
  detalhe: string | null;
  responsavel: PessoaCurta | null;
  processo: ProcessoCurto | null;
  cliente: { id: string; nome: string } | null;
  criada?: { id: string };
  /** A pessoa disse "Agora não". */
  descartada?: boolean;
}
export interface PessoaDaEquipe extends PessoaCurta {
  nome: string;
  cargo: string | null;
  oab: string | null;
  prazosAbertos: number;
  prazosVencidos: number;
}

/* ---------- A resposta chegando ---------- */

export type Evento =
  /** `resposta.id` é o id com que a resposta será gravada (também se a pessoa parar ou a ligação cair). */
  | { t: "inicio"; conversa: { id: string; titulo: string; modo: Modo }; pergunta: { id: string }; resposta: { id: string } }
  | { t: "texto"; v: string }
  | { t: "ferramenta"; id: string; nome: string; entrada: Record<string, unknown> | null }
  | { t: "resultado"; id: string; nome: string; saida?: unknown; erro?: string }
  | { t: "citacoes"; itens: CitacaoVerificada[] }
  | { t: "fim"; mensagem: { id: string } | null }
  | { t: "titulo"; v: string };

/**
 * Sem nenhuma linha por este tempo, a ligação caiu sem avisar (um proxy que
 * segura a conexão, o celular sem rede); o servidor manda um "ping" a cada 15 s
 * enquanto a IA pensa. Os testes de tela encurtam com `window.__silencioDoPerguntar`.
 */
const SILENCIO_MS = 45_000;

/**
 * Manda a pergunta e chama `aoChegar` a cada acontecimento, até a resposta
 * terminar. `refazer` (id de uma pergunta já gravada, a última da conversa)
 * responde de novo a ela, sem gravar outra pergunta. Ligação que fecha antes
 * do "fim", ou que fica calada, é queda: a tela oferece "Tentar de novo".
 */
export async function perguntar(corpo: { texto: string; modo: Modo; conversaId?: string | null; processoId?: string | null; refazer?: string }, aoChegar: (e: Evento) => void, signal?: AbortSignal): Promise<void> {
  const res = await fetch(`${API_URL}/api/app/ia/perguntar`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(corpo),
    signal,
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => null)) as { erro?: string; detalhe?: string; passaLogo?: boolean } | null;
    throw new ApiError(res.status, b?.erro ?? `http_${res.status}`, b?.detalhe, b?.passaLogo);
  }
  const leitor = res.body?.getReader();
  if (!leitor) throw new Error("resposta_sem_corpo");
  const silencio = (globalThis as { __silencioDoPerguntar?: number }).__silencioDoPerguntar ?? SILENCIO_MS;
  const decod = new TextDecoder();
  let resto = "";
  let terminou = false;
  const linha = (l: string) => {
    if (!l.trim()) return;
    let e: Evento | { t: "ping" };
    try {
      e = JSON.parse(l) as Evento | { t: "ping" };
    } catch {
      // linha cortada: ignora. Um erro ao tratar o evento, não: esse sobe.
      return;
    }
    if (e.t === "ping") return;
    if (e.t === "fim") terminou = true;
    aoChegar(e);
  };
  for (;;) {
    let relogio: ReturnType<typeof setTimeout> | undefined;
    const calado = new Promise<never>((_, falhar) => (relogio = setTimeout(() => falhar(new Error("sem_resposta")), silencio)));
    const { done, value } = await Promise.race([leitor.read(), calado])
      .catch((err: unknown) => {
        leitor.cancel().catch(() => {});
        throw err;
      })
      .finally(() => clearTimeout(relogio));
    if (done) break;
    resto += decod.decode(value, { stream: true });
    const linhas = resto.split("\n");
    resto = linhas.pop() ?? "";
    linhas.forEach(linha);
  }
  linha(resto + decod.decode());
  // Fechou limpa mas antes do "fim" (um proxy, depois de a API cair): a resposta ficou pela metade.
  if (!terminou) throw new Error("resposta_cortada");
}

/** Junta um acontecimento às partes da resposta que está chegando. */
export function juntarEvento(partes: Parte[], e: Evento): Parte[] {
  if (e.t === "texto") {
    const ultima = partes.at(-1);
    if (ultima?.tipo === "texto") return [...partes.slice(0, -1), { tipo: "texto", texto: ultima.texto + e.v }];
    return [...partes, { tipo: "texto", texto: e.v.replace(/^\n+/, "") }];
  }
  if (e.t === "ferramenta") return [...partes, { tipo: "ferramenta", id: e.id, nome: e.nome, entrada: e.entrada, saida: undefined }];
  if (e.t === "resultado") return partes.map((p) => (p.tipo === "ferramenta" && p.id === e.id ? { ...p, saida: e.saida ?? null, erro: e.erro } : p));
  if (e.t === "citacoes") return [...partes, { tipo: "citacoes", itens: e.itens }];
  return partes;
}

export const conversasQuery = { queryKey: ["conversas"] as const };
export const conversaQuery = (id: string) => ({ queryKey: ["conversas", id] as const });
