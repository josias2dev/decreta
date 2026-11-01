/**
 * Quanto cada chamada da IA gastou. O gateway pede ao OpenRouter o custo de
 * cada resposta (`usage.cost`, em dólar) e ele chega aqui no uso bruto. Quando
 * não vem (outro provedor, resposta cortada no meio), o custo sai dos tokens
 * pelo preço de referência, de propósito alto: o teto chega antes, nunca depois.
 */
import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai";
import type { Ia, MetodoIa } from "./gateway.ts";
import { colheitaAtual, impressaoDoPrompt } from "./procedencia.ts";

/* Os tipos do provedor, tirados do middleware (o pacote @ai-sdk/provider não é dependência direta). */
type Gerar = NonNullable<LanguageModelMiddleware["wrapGenerate"]>;
type Transmitir = NonNullable<LanguageModelMiddleware["wrapStream"]>;
type Pedido = Parameters<Gerar>[0]["params"];
type Uso = Awaited<ReturnType<Gerar>>["usage"];
type Parte = Awaited<ReturnType<Parameters<Transmitir>[0]["doStream"]>>["stream"] extends ReadableStream<infer P> ? P : never;

export interface UsoDaIa {
  metodo: MetodoIa;
  entrada: number;
  saida: number;
  custoUsd: number;
  /** O custo foi calculado pelos tokens (o provedor não disse quanto foi). */
  estimado: boolean;
}

/** Preço de referência, em dólar por milhão de tokens, para quando o custo não vem na resposta. */
export interface PrecoDeReferencia {
  entrada: number;
  saida: number;
}

/** O uso que o gateway devolve junto com a transcrição. */
export interface UsoDaTranscricao {
  entrada: number;
  saida: number;
  custoUsd: number | null;
}

/** Uns 4 caracteres por token em português. */
const tokensDe = (caracteres: number) => Math.ceil(caracteres / 4);

/** O tamanho do pedido, sem contar o arquivo em si (uma foto vira poucos tokens, não o tamanho do base64). */
function caracteresDoPedido(params: Pedido): number {
  let n = 0;
  for (const m of params.prompt) {
    if (typeof m.content === "string") {
      n += m.content.length;
      continue;
    }
    for (const p of m.content) n += p.type === "text" || p.type === "reasoning" ? p.text.length : p.type === "file" ? 4000 : JSON.stringify(p).length;
  }
  return n + (params.tools ? JSON.stringify(params.tools).length : 0);
}

function usoDe(metodo: MetodoIa, preco: PrecoDeReferencia, usage: Uso | undefined, params: Pedido, caracteresDaSaida: number): UsoDaIa {
  const entrada = usage?.inputTokens.total ?? tokensDe(caracteresDoPedido(params));
  const saida = usage?.outputTokens.total ?? tokensDe(caracteresDaSaida);
  const custo = (usage?.raw as { cost?: unknown } | undefined)?.cost;
  if (typeof custo === "number" && Number.isFinite(custo) && custo >= 0) return { metodo, entrada, saida, custoUsd: custo, estimado: false };
  return { metodo, entrada, saida, custoUsd: (entrada * preco.entrada + saida * preco.saida) / 1e6, estimado: true };
}

/** O que a resposta já trouxe de texto, para estimar a saída quando ela para no meio. */
function caracteresDaParte(p: Parte): number {
  if (p.type === "text-delta" || p.type === "reasoning-delta" || p.type === "tool-input-delta") return p.delta.length;
  return 0;
}

/**
 * A mesma IA, avisando `aoUsar` depois de cada chamada ao modelo. Uma resposta
 * que a pessoa para no meio (ou que cai) também conta: o provedor cobra o que
 * já gerou, e sem isso parar de propósito seria um jeito de usar sem gastar.
 */
export function comMedidor(ia: Ia, preco: PrecoDeReferencia, aoUsar: (uso: UsoDaIa) => void | Promise<void>): Ia {
  const medir = (metodo: MetodoIa, model: LanguageModel): LanguageModel =>
    wrapLanguageModel({
      model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
      middleware: {
        specificationVersion: "v4",
        async wrapGenerate({ doGenerate, params, model: chamado }) {
          const colheita = colheitaAtual();
          const anotar = (modelo: string | null) => colheita?.push({ metodo, alias: chamado.modelId, modelo, prompt: impressaoDoPrompt(params) });
          try {
            const r = await doGenerate();
            anotar(r.response?.modelId ?? null);
            await aoUsar(usoDe(metodo, preco, r.usage, params, 0));
            return r;
          } catch (err) {
            anotar(null);
            // Com resposta de erro do gateway (teto, pedido inválido) nada foi cobrado; sem resposta (parou, caiu), o pedido pode ter sido.
            if ((err as { statusCode?: number }).statusCode === undefined) await aoUsar(usoDe(metodo, preco, undefined, params, 0));
            throw err;
          }
        },
        async wrapStream({ doStream, params, model: chamado }) {
          const colheita = colheitaAtual();
          let modelo: string | null = null;
          const r = await doStream();
          const leitor = r.stream.getReader();
          let saida = 0;
          let contou = false;
          const contar = async (usage?: Uso) => {
            if (contou) return;
            contou = true;
            colheita?.push({ metodo, alias: chamado.modelId, modelo, prompt: impressaoDoPrompt(params) });
            await aoUsar(usoDe(metodo, preco, usage, params, saida));
          };
          const stream = new ReadableStream<Parte>({
            async pull(controle) {
              try {
                const { done, value } = await leitor.read();
                if (done) {
                  await contar();
                  controle.close();
                  return;
                }
                if (value.type === "response-metadata" && value.modelId) modelo = value.modelId;
                saida += caracteresDaParte(value);
                if (value.type === "finish") await contar(value.usage);
                controle.enqueue(value);
              } catch (err) {
                await contar();
                controle.error(err);
              }
            },
            async cancel(motivo) {
              await contar();
              return leitor.cancel(motivo);
            },
          });
          return { ...r, stream };
        },
      },
    });

  return {
    modelo: (metodo) => medir(metodo, ia.modelo(metodo)),
    transcrever: (audio, mime) =>
      ia.transcrever(audio, mime, (u) => {
        const custo = u.custoUsd ?? (u.entrada * preco.entrada + u.saida * preco.saida) / 1e6;
        return aoUsar({ metodo: "transcription", entrada: u.entrada, saida: u.saida, custoUsd: custo, estimado: u.custoUsd === null });
      }),
  };
}
