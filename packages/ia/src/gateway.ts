/**
 * Acesso aos modelos, sempre pelo openrouter-gateway: ele guarda a chave do
 * OpenRouter, resolve os aliases, aplica a retenção zero de dados (ZDR) e o
 * teto diário do projeto "decreta". O header `X-Gateway-Method` diz ao
 * gateway que ação é a chamada (mesmo contrato do AgenteHost).
 */
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

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
};

export interface Ia {
  /** O modelo da ação, já com o `X-Gateway-Method` certo. */
  modelo(metodo: MetodoIa): LanguageModel;
  /** Áudio → texto (atendimento gravado). Devolve vazio quando não há fala. */
  transcrever(audio: Uint8Array, mime: string): Promise<string>;
}

export interface ConfigDoGateway {
  /** Ex.: http://127.0.0.1:8799/v1 */
  baseUrl: string;
  apiKey: string;
  modelos: ModelosDoGateway;
  modeloTranscricao: string;
  fetch?: typeof fetch;
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
        headers: { "X-Gateway-Method": metodo },
        includeUsage: true,
        supportsStructuredOutputs: true,
        fetch: fetchImpl,
      });
      provedores.set(metodo, p);
    }
    return p;
  };

  return {
    modelo: (metodo) => provedor(metodo).chatModel(config.modelos[ALIAS[metodo]]),
    async transcrever(audio, mime) {
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
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    },
  };
}
