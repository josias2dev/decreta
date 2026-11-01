/**
 * Limite de pedidos por origem nas rotas sem login: quem passa do teto na
 * janela recebe 429 até a janela virar; outra origem não é afetada.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { ipDoPedido, limitador, limitarPorIp } from "../src/limitador.ts";

describe("limitador por origem", () => {
  test("conta por origem dentro da janela e libera quando ela vira", () => {
    let agora = 1_000_000;
    const l = limitador({ janelaMs: 60_000, maximo: 3 }, () => agora);
    expect([l.permitir("a"), l.permitir("a"), l.permitir("a")]).toEqual([true, true, true]);
    expect(l.permitir("a")).toBe(false);
    // Outra origem tem a própria conta.
    expect(l.permitir("b")).toBe(true);
    // A janela virou: começa de novo.
    agora += 60_001;
    expect(l.permitir("a")).toBe(true);
  });

  test("o endereço vem do Caddy (X-Forwarded-For) ou da Cloudflare; sem proxy, não há origem", () => {
    const req = (h: Record<string, string>) => ({ req: { header: (n: string) => h[n] } });
    expect(ipDoPedido(req({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(ipDoPedido(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.9");
    expect(ipDoPedido(req({}))).toBeNull();
  });

  test("como middleware: 429 com retry-after para quem passou do limite, e o pedido interno (sem IP) passa", async () => {
    const app = new Hono();
    app.use("/publica/*", limitarPorIp({ janelaMs: 60_000, maximo: 2 }, ipDoPedido));
    app.get("/publica/x", (c) => c.json({ ok: true }));
    const de = (ip: string) => app.request("/publica/x", { headers: { "x-forwarded-for": ip } });
    expect((await de("203.0.113.7")).status).toBe(200);
    expect((await de("203.0.113.7")).status).toBe(200);
    const r = await de("203.0.113.7");
    expect(r.status).toBe(429);
    expect(r.headers.get("retry-after")).toBe("60");
    expect(await r.json()).toMatchObject({ erro: "muitas_tentativas" });
    expect((await de("203.0.113.8")).status).toBe(200);
    expect((await app.request("/publica/x")).status).toBe(200);
  });
});
