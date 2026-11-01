/**
 * Limite de pedidos por origem numa janela, em memória. A API roda num processo
 * só, então o contador vale para o servidor inteiro. Protege as rotas sem login
 * (o link de envio, o conector MCP, o convite) de quem tenta adivinhar um
 * segredo e de um fluxo de pedidos que ocuparia o banco à toa.
 */
import type { Context, MiddlewareHandler } from "hono";

export interface Limite {
  janelaMs: number;
  maximo: number;
}

/** Acima disso, as janelas vencidas são varridas antes de contar: o mapa não cresce sem fim. */
const VARRER_A_PARTIR_DE = 10_000;

export function limitador(limite: Limite, agora: () => number = Date.now) {
  const janelas = new Map<string, { ate: number; n: number }>();
  return {
    /** Conta um pedido da origem e diz se ele passa. */
    permitir(origem: string): boolean {
      const t = agora();
      if (janelas.size >= VARRER_A_PARTIR_DE) for (const [k, j] of janelas) if (j.ate <= t) janelas.delete(k);
      const j = janelas.get(origem);
      if (!j || j.ate <= t) {
        janelas.set(origem, { ate: t + limite.janelaMs, n: 1 });
        return true;
      }
      j.n++;
      return j.n <= limite.maximo;
    },
  };
}

/**
 * O endereço de quem pediu: o da Cloudflare quando ela está na frente, senão o
 * primeiro do X-Forwarded-For que o Caddy põe. Sem proxy (testes, chamada
 * interna) não há endereço.
 */
export function ipDoPedido(c: { req: { header(nome: string): string | undefined } }): string | null {
  return c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

/** O middleware: 429 com `retry-after` para quem passou do limite. Sem endereço, não limita. */
export function limitarPorIp(limite: Limite, origemDe: (c: Context) => string | null): MiddlewareHandler {
  const l = limitador(limite);
  return async (c, next) => {
    const origem = origemDe(c);
    if (origem && !l.permitir(origem)) {
      return c.json({ erro: "muitas_tentativas", detalhe: "Muitos pedidos em pouco tempo. Espere um minuto e tente de novo." }, 429, { "retry-after": String(Math.ceil(limite.janelaMs / 1000)) });
    }
    await next();
  };
}
