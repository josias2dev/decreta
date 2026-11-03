/** O bloco do Caddy (deploy/Caddyfile.decreta): o que leva segredo no endereço fica fora do log de acesso. */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const CADDY = readFileSync(new URL("../../../deploy/Caddyfile.decreta", import.meta.url), "utf8");
const FORA_DO_LOG = new Set([...CADDY.matchAll(/@segredo path (.+)/g)].flatMap((m) => m[1]!.trim().split(/\s+/)));

describe("o log de acesso do Caddy", () => {
  test("o matcher de quem leva segredo vira log_skip", () => {
    expect(CADDY).toMatch(/log_skip @segredo/);
  });

  for (const [caminho, por] of [
    ["/redefinir-senha", "o token de trocar a senha, na tela"],
    ["/api/auth/reset-password/*", "o mesmo token, no caminho do Better Auth"],
    ["/api/auth/verify-email", "o token de confirmar o e-mail"],
    ["/convite/*", "o id do convite, na tela"],
    ["/api/convites/*", "o id do convite, na API"],
    ["/api/auth/organization/get-invitation", "o id do convite, no Better Auth"],
    ["/api/envio/*", "o segredo do link de envio, na API"],
    ["/enviar/*", "o segredo do link de envio, na tela"],
  ]) {
    test(`${caminho} fica de fora: ${por}`, () => {
      expect(FORA_DO_LOG.has(caminho!)).toBe(true);
    });
  }
});
