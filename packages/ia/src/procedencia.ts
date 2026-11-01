/**
 * De onde veio um resultado da IA: o modelo que respondeu de verdade (o alias
 * pode mudar de modelo no painel do gateway sem deploy nenhum) e a impressão das
 * instruções. Quem grava o resultado colhe as chamadas feitas para produzi-lo.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import type { MetodoIa } from "./gateway.ts";

export interface ChamadaDaIa {
  metodo: MetodoIa;
  alias: string;
  /** O modelo que a resposta diz ter respondido; nulo quando a chamada falhou. */
  modelo: string | null;
  /** Impressão das instruções e do formato pedido. */
  prompt: string;
}

const colheitas = new AsyncLocalStorage<ChamadaDaIa[]>();

/** Roda `fn` anotando em `chamadas` cada chamada ao modelo, inclusive as que falharem. */
export function colherChamadas<T>(chamadas: ChamadaDaIa[], fn: () => T): T {
  return colheitas.run(chamadas, fn);
}

export function colheitaAtual(): ChamadaDaIa[] | undefined {
  return colheitas.getStore();
}

/** Só as instruções e o formato: o texto do caso não entra, e a impressão serve para comparar versões. */
export function impressaoDoPrompt(params: { prompt: readonly { role: string; content: unknown }[]; responseFormat?: unknown }): string {
  const instrucoes = params.prompt.filter((m) => m.role === "system").map((m) => m.content);
  return createHash("sha256")
    .update(JSON.stringify([instrucoes, params.responseFormat ?? null]))
    .digest("hex")
    .slice(0, 12);
}
