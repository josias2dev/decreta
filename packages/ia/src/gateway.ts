/**
 * Acesso aos modelos, sempre pelo openrouter-gateway: ele guarda as chaves,
 * resolve os aliases, aplica a retenção zero de dados (ZDR) e o teto diário do
 * projeto "decreta". O header `X-Gateway-Method` diz ao gateway que ação é a
 * chamada (mesmo contrato do AgenteHost).
 *
 * Um alias cujo perfil no painel do gateway é um Claude ("anthropic:claude-…")
 * vai pela rota nativa da Anthropic (`/anthropic/v1`), com os créditos da conta
 * do escritório; os outros, e qualquer falha da Anthropic, vão pelo OpenRouter
 * (`/v1`), onde o mesmo alias usa a reserva do perfil.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4GenerateResult, LanguageModelV4StreamPart, LanguageModelV4StreamResult, LanguageModelV4Usage } from "@ai-sdk/provider";
import type { LanguageModel } from "ai";
import type { UsoDaTranscricao } from "./uso.ts";

/** Aliases configurados no gateway. Qual modelo responde a cada um é decisão do gateway, nunca do Decreta. */
export interface ModelosDoGateway {
  /** Raciocínio jurídico curto: sugestão de prazo, briefing, audiência. */
  juridico: string;
  /** Contexto longo: resumo dos autos e chat do processo. */
  autos: string;
  /** Redação de peças. */
  documentos: string;
  /** Leitura de PDF escaneado (sem camada de texto). */
  pdf: string;
  /** Leitura de foto de documento. */
  vision: string;
}

export const METODOS = [
  "sugerir-prazo",
  "briefing-prazo",
  "resumo-autos",
  "chat-processo",
  "preparar-audiencia",
  "gerar-documento",
  "jurisprudencia",
  "resumo-atendimento",
  "perguntar",
  "transcription",
  "ler-sentenca",
  "conferir-pasta",
  "ler-imagem",
  "ler-pdf",
  "titulo-conversa",
] as const;
export type MetodoIa = (typeof METODOS)[number];

const ALIAS: Record<MetodoIa, keyof ModelosDoGateway> = {
  "sugerir-prazo": "juridico",
  "briefing-prazo": "juridico",
  "resumo-autos": "autos",
  "chat-processo": "autos",
  "preparar-audiencia": "juridico",
  "gerar-documento": "documentos",
  jurisprudencia: "juridico",
  "resumo-atendimento": "juridico",
  perguntar: "juridico",
  transcription: "juridico",
  "ler-sentenca": "autos",
  "conferir-pasta": "autos",
  "ler-imagem": "vision",
  "ler-pdf": "pdf",
  "titulo-conversa": "juridico",
};

/** Ações que o gateway conhece por outro nome: o título da conversa conta à parte no uso_ia, mas vai ao gateway como o chat. */
const NO_GATEWAY: Partial<Record<MetodoIa, MetodoIa>> = { "titulo-conversa": "perguntar" };

/** O teto do dia não passa em segundos: a AI SDK não deve pedir de novo (a pessoa esperava o aviso uns 2 s a mais). */
function semNovaTentativaNoTeto(err: unknown): never {
  if (ehTetoDoGateway(err) && err && typeof err === "object" && "isRetryable" in err) (err as { isRetryable: boolean }).isRetryable = false;
  throw err;
}

/** O gateway recusou porque o teto de gasto do dia acabou (429 com o código "teto-diario"), mesmo depois das novas tentativas do SDK. */
export function ehTetoDoGateway(err: unknown): boolean {
  let e = err;
  for (let i = 0; e && i < 5; i++) {
    const x = e as { statusCode?: number; responseBody?: string; lastError?: unknown; cause?: unknown };
    if (x.statusCode === 429 && (x.responseBody ?? "").includes("teto-diario")) return true;
    e = x.lastError ?? x.cause;
  }
  return false;
}

export interface Ia {
  /** O modelo da ação, já com o `X-Gateway-Method` certo. */
  modelo(metodo: MetodoIa): LanguageModel;
  /** Áudio → texto (atendimento gravado). Devolve vazio quando não há fala. `aoUsar` recebe o que a transcrição gastou. */
  transcrever(audio: Uint8Array, mime: string, aoUsar?: (uso: UsoDaTranscricao) => void | Promise<void>): Promise<string>;
}

export interface ConfigDoGateway {
  /** Ex.: http://127.0.0.1:8799/v1 */
  baseUrl: string;
  apiKey: string;
  modelos: ModelosDoGateway;
  modeloTranscricao: string;
  fetch?: typeof fetch;
  /** Para registrar quando o Claude falha e a chamada segue pelo OpenRouter. */
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/* ------------------------------------------------------------------ */
/* Claude pela rota da Anthropic                                        */
/* ------------------------------------------------------------------ */

type Esforco = "low" | "medium" | "high";

/**
 * Quanto o Claude pensa em cada ação (nos Claude 5 o raciocínio não desliga; o
 * esforço é o que regula tempo e custo). Alto onde um erro custa um prazo ou
 * uma peça; baixo na transcrição, que só copia o que está escrito. Um esforço
 * no perfil do gateway vale por cima deste.
 */
const ESFORCO: Record<MetodoIa, Esforco> = {
  "sugerir-prazo": "high",
  "briefing-prazo": "medium",
  "resumo-autos": "medium",
  "chat-processo": "medium",
  "preparar-audiencia": "high",
  "gerar-documento": "high",
  jurisprudencia: "high",
  "resumo-atendimento": "medium",
  perguntar: "medium",
  transcription: "low",
  "ler-sentenca": "high",
  "conferir-pasta": "high",
  "ler-imagem": "low",
  "ler-pdf": "low",
  "titulo-conversa": "low",
};

/**
 * Conversas que mandam o mesmo começo várias vezes: as rodadas de ferramenta do
 * Perguntar e as perguntas seguidas sobre o mesmo processo. Com o cache, esse
 * começo é cobrado a 5% na segunda vez; numa chamada só (as ações, o título da
 * conversa) ele custaria 25% a mais sem nunca ser relido.
 */
function usaCache(metodo: MetodoIa, options: LanguageModelV4CallOptions): boolean {
  if (metodo === "chat-processo") return true;
  return (metodo === "perguntar" || metodo === "jurisprudencia") && !!options.tools?.length;
}

/** Os Claude 5 que aceitam a reserva da própria Anthropic quando um filtro de segurança recusa o pedido (o Haiku 5.5 não tem). */
const TEM_RESERVA_NA_ANTHROPIC = /^claude-(opus|sonnet|fable|mythos)-5/;

/** Por quanto tempo o Decreta deixa de tentar o Claude depois de uma falha que não passa sozinha. */
const PAUSA_SEM_CREDITO_MS = 10 * 60_000;
const PAUSA_LIMITE_MS = 60_000;
const ROTAS_VALEM_MS = 60_000;

/** O que interessa de uma falha do Claude: a resposta HTTP ou o erro no meio do stream. */
function falhaDoClaude(err: unknown): { status?: number; tipo?: string; codigo?: string; mensagem: string } {
  const e = (err ?? {}) as { statusCode?: unknown; type?: unknown; message?: unknown; responseBody?: unknown };
  let corpo: { error?: { type?: unknown; code?: unknown; message?: unknown } } = {};
  try {
    if (typeof e.responseBody === "string") corpo = JSON.parse(e.responseBody);
  } catch {}
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
  return {
    status: typeof e.statusCode === "number" ? e.statusCode : undefined,
    tipo: texto(corpo.error?.type) ?? texto(e.type),
    // O código das regras do próprio gateway ("anthropic-desligada", "teto-diario"...); erro da Anthropic vem sem.
    codigo: texto(corpo.error?.code),
    mensagem: (texto(corpo.error?.message) ?? texto(e.message) ?? String(err)).slice(0, 300),
  };
}

/** Quais aliases do projeto o gateway manda para a Anthropic, e com que modelo. Falhou ou é um gateway antigo: nenhum. */
function rotasDaAnthropic(url: string, apiKey: string, fetchImpl: typeof fetch) {
  let guardadas: { ate: number; aliases: Promise<Record<string, string>> } | null = null;
  const buscar = async (): Promise<Record<string, string>> => {
    try {
      const res = await fetchImpl(`${url}/rotas`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(3000) });
      if (!res.ok) return {};
      const json = (await res.json()) as { anthropic?: unknown; aliases?: unknown };
      if (json.anthropic !== true || !json.aliases || typeof json.aliases !== "object") return {};
      return Object.fromEntries(Object.entries(json.aliases).filter((e): e is [string, string] => typeof e[1] === "string" && e[1].startsWith("claude-")));
    } catch {
      return {};
    }
  };
  return {
    modeloDe(alias: string): Promise<string | undefined> {
      if (!guardadas || guardadas.ate < Date.now()) guardadas = { ate: Date.now() + ROTAS_VALEM_MS, aliases: buscar() };
      return guardadas.aliases.then((a) => a[alias]);
    },
    esquecer() {
      guardadas = null;
    },
  };
}

/** O custo que o gateway pôs no uso (`usage.cost`), quando pôs. */
const custoDe = (usage: LanguageModelV4Usage | undefined) => {
  const c = usage?.raw?.cost;
  return typeof c === "number" && Number.isFinite(c) ? c : undefined;
};

/** Junta ao uso da reserva o que a tentativa recusada do Claude já custou, para o medidor contar as duas. */
function somarCusto(usage: LanguageModelV4Usage, antes: number | undefined): LanguageModelV4Usage {
  const depois = custoDe(usage);
  if (!antes || depois === undefined) return usage;
  return { ...usage, raw: { ...usage.raw, cost: depois + antes } };
}

const recusou = (r: Pick<LanguageModelV4GenerateResult, "finishReason" | "content">) =>
  r.finishReason.unified === "content-filter" && !r.content.some((c) => (c.type === "text" && c.text.trim()) || c.type === "tool-call");

/**
 * O modelo de uma ação: o Claude quando o gateway diz que o alias é dele, o
 * OpenRouter quando não é ou quando o Claude falha antes de responder (sem
 * crédito, sobrecarga, pedido que ele não aceita, recusa do filtro de
 * segurança). Só o teto do dia e o cancelamento não mudam de caminho: o teto
 * vale para os dois, e quem cancelou não quer resposta.
 */
class ModeloDoGateway implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "gateway";
  readonly supportedUrls = {};

  constructor(
    readonly modelId: string,
    private readonly metodo: MetodoIa,
    private readonly openrouter: LanguageModelV4,
    private readonly claude: (id: string) => LanguageModelV4,
    private readonly rotas: ReturnType<typeof rotasDaAnthropic>,
    private readonly estado: { pausadoAte: number },
    private readonly log?: ConfigDoGateway["log"],
  ) {}

  private async escolher(options: LanguageModelV4CallOptions): Promise<{ modelo: LanguageModelV4; options: LanguageModelV4CallOptions } | null> {
    if (Date.now() < this.estado.pausadoAte) return null;
    const id = await this.rotas.modeloDe(this.modelId);
    if (!id) return null;
    const padrao = {
      effort: ESFORCO[this.metodo],
      ...(usaCache(this.metodo, options) && { cacheControl: { type: "ephemeral" } }),
      ...(TEM_RESERVA_NA_ANTHROPIC.test(id) && { fallbacks: "default" }),
    };
    const pedidas = options.providerOptions?.anthropic;
    return { modelo: this.claude(id), options: { ...options, providerOptions: { ...options.providerOptions, anthropic: { ...padrao, ...pedidas } } } };
  }

  /** Diz se a falha do Claude deixa tentar pelo OpenRouter, e pausa o Claude quando a falha não passa sozinha. */
  private podeCair(err: unknown, options: LanguageModelV4CallOptions): boolean {
    if (options.abortSignal?.aborted || ehTetoDoGateway(err)) return false;
    const f = falhaDoClaude(err);
    // Sem crédito (a Anthropic manda 400 "credit balance is too low", ou 402), chave recusada ou gateway sem a chave: não passa em minutos.
    const naoPassaLogo = f.status === 401 || f.status === 402 || f.status === 403 || /credit balance/i.test(f.mensagem) || f.codigo === "anthropic-desligada";
    if (naoPassaLogo) this.estado.pausadoAte = Date.now() + PAUSA_SEM_CREDITO_MS;
    else if (f.status === 429) this.estado.pausadoAte = Date.now() + PAUSA_LIMITE_MS;
    // O perfil deixou de ser Claude no painel: buscar as rotas de novo.
    if (f.codigo === "perfil-sem-anthropic") this.rotas.esquecer();
    this.log?.("Claude falhou; a chamada segue pelo OpenRouter", { metodo: this.metodo, ...f, pausado: naoPassaLogo || f.status === 429 });
    return true;
  }

  async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    return this.gerar(options).catch(semNovaTentativaNoTeto);
  }

  async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    return this.transmitir(options).catch(semNovaTentativaNoTeto);
  }

  private async gerar(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
    const escolha = await this.escolher(options);
    if (!escolha) return this.openrouter.doGenerate(options);
    let custoDaRecusa: number | undefined;
    try {
      const r = await escolha.modelo.doGenerate(escolha.options);
      if (!recusou(r)) return r;
      custoDaRecusa = custoDe(r.usage);
      this.log?.("Claude recusou; a chamada segue pelo OpenRouter", { metodo: this.metodo, categoria: r.providerMetadata?.anthropic?.stopDetails });
    } catch (err) {
      if (!this.podeCair(err, options)) throw err;
    }
    const r = await this.openrouter.doGenerate(options);
    return { ...r, usage: somarCusto(r.usage, custoDaRecusa) };
  }

  private async transmitir(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
    const escolha = await this.escolher(options);
    if (!escolha) return this.openrouter.doStream(options);
    let resultado: Awaited<ReturnType<LanguageModelV4["doStream"]>>;
    try {
      resultado = await escolha.modelo.doStream(escolha.options);
    } catch (err) {
      if (!this.podeCair(err, options)) throw err;
      return this.openrouter.doStream(options);
    }
    // Até chegar o primeiro pedaço de resposta, ainda dá para trocar de caminho
    // sem a pessoa ver nada: um erro ou uma recusa aqui vão para o OpenRouter.
    const leitor = resultado.stream.getReader();
    const antes: LanguageModelV4StreamPart[] = [];
    let custoDaRecusa: number | undefined;
    let cair = false;
    try {
      for (;;) {
        const { done, value } = await leitor.read();
        if (done) break;
        if (value.type === "stream-start" || value.type === "response-metadata" || value.type === "custom" || value.type === "raw") {
          antes.push(value);
          continue;
        }
        if (value.type === "error") cair = this.podeCair(value.error, options);
        else if (value.type === "finish" && value.finishReason.unified === "content-filter") {
          cair = true;
          custoDaRecusa = custoDe(value.usage);
          this.log?.("Claude recusou; a chamada segue pelo OpenRouter", { metodo: this.metodo, categoria: value.providerMetadata?.anthropic?.stopDetails });
        }
        antes.push(value);
        break;
      }
    } catch (err) {
      if (!this.podeCair(err, options)) throw err;
      cair = true;
    }
    if (cair) {
      leitor.cancel().catch(() => {});
      const r = await this.openrouter.doStream(options);
      if (!custoDaRecusa) return r;
      const somar = new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
        transform: (p, c) => c.enqueue(p.type === "finish" ? { ...p, usage: somarCusto(p.usage, custoDaRecusa) } : p),
      });
      return { ...r, stream: r.stream.pipeThrough(somar) };
    }
    const stream = new ReadableStream<LanguageModelV4StreamPart>({
      start(c) {
        for (const p of antes) c.enqueue(p);
      },
      async pull(c) {
        try {
          const { done, value } = await leitor.read();
          if (done) c.close();
          else c.enqueue(value);
        } catch (err) {
          c.error(err);
        }
      },
      cancel: (motivo) => leitor.cancel(motivo),
    });
    return { ...resultado, stream };
  }
}

function formatoDoAudio(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes("ogg") || m.includes("opus")) return "ogg";
  if (m.includes("mpeg") || m.includes("mp3")) return "mp3";
  for (const f of ["wav", "webm", "m4a", "mp4", "flac", "aac"]) if (m.includes(f)) return f;
  return "ogg";
}

export function createGatewayIa(config: ConfigDoGateway): Ia {
  const baseURL = config.baseUrl.replace(/\/$/, "");
  const fetchImpl = config.fetch ?? fetch;
  const provedores = new Map<MetodoIa, ReturnType<typeof createOpenAICompatible>>();
  const provedor = (metodo: MetodoIa) => {
    let p = provedores.get(metodo);
    if (!p) {
      p = createOpenAICompatible({
        name: "gateway",
        baseURL,
        apiKey: config.apiKey,
        headers: { "X-Gateway-Method": NO_GATEWAY[metodo] ?? metodo },
        includeUsage: true,
        supportsStructuredOutputs: true,
        fetch: fetchImpl,
      });
      provedores.set(metodo, p);
    }
    return p;
  };

  const urlDaAnthropic = `${baseURL.replace(/\/v1$/, "")}/anthropic/v1`;
  const rotas = rotasDaAnthropic(urlDaAnthropic, config.apiKey, fetchImpl);
  const estado = { pausadoAte: 0 };
  const claudes = new Map<MetodoIa, ReturnType<typeof createAnthropic>>();
  const claude = (metodo: MetodoIa, alias: string) => (id: string) => {
    let p = claudes.get(metodo);
    if (!p) {
      p = createAnthropic({
        baseURL: urlDaAnthropic,
        apiKey: config.apiKey,
        // O alias vai à parte porque o "model" já sai com o id real: o SDK escolhe pelo id o que o modelo aceita.
        headers: { "X-Gateway-Method": NO_GATEWAY[metodo] ?? metodo, "X-Gateway-Alias": alias },
        fetch: fetchImpl,
      });
      claudes.set(metodo, p);
    }
    return p.languageModel(id);
  };

  return {
    modelo: (metodo) => {
      const alias = config.modelos[ALIAS[metodo]];
      return new ModeloDoGateway(alias, metodo, provedor(metodo).chatModel(alias), claude(metodo, alias), rotas, estado, config.log);
    },
    async transcrever(audio, mime, aoUsar) {
      const res = await fetchImpl(`${baseURL}/audio/transcriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}`, "X-Gateway-Method": "transcription" },
        body: JSON.stringify({
          model: config.modeloTranscricao,
          input_audio: { data: Buffer.from(audio).toString("base64"), format: formatoDoAudio(mime) },
          language: "pt",
        }),
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`transcrição HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 300)}`);
      const json = (await res.json()) as { text?: string; usage?: { input_tokens?: number; output_tokens?: number; cost?: number } };
      await aoUsar?.({ entrada: json.usage?.input_tokens ?? 0, saida: json.usage?.output_tokens ?? 0, custoUsd: typeof json.usage?.cost === "number" ? json.usage.cost : null });
      return (json.text ?? "").trim();
    },
  };
}
