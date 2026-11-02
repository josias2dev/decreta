/** O cofre das chaves de Asaas e ZapSign do escritório: cifra no banco, nunca em texto. */
import { describe, expect, test } from "bun:test";
import { criarCofre } from "../src/cofre.ts";

const SEGREDO = "um-segredo-do-servidor-bem-longo-0123456789abcdef";
const CHAVE = "$aact_prod_000MzkwODA2MWY2OGM3MWRlMDU2NWM3MzJlNzZmNGZhZGY6OjAwMDAwMDAwMDAwMDAwNDA0OTc6OiRhYWNoXzJmNDBhNGM0";

describe("cofre", () => {
  test("cifra e decifra a chave do escritório", () => {
    const cofre = criarCofre(SEGREDO);
    const guardada = cofre.cifrar(CHAVE, "org_souza");
    expect(cofre.decifrar(guardada, "org_souza")).toBe(CHAVE);
  });

  test("o que fica no banco não traz a chave em texto, e cada cifra é diferente", () => {
    const cofre = criarCofre(SEGREDO);
    const a = cofre.cifrar(CHAVE, "org_souza");
    const b = cofre.cifrar(CHAVE, "org_souza");
    expect(a).not.toContain(CHAVE);
    expect(a).not.toContain("aact_prod");
    expect(a).not.toBe(b);
    expect(a.startsWith("v1.")).toBe(true);
  });

  test("a chave de um escritório não abre no outro: copiar a linha de um para o outro não funciona", () => {
    const cofre = criarCofre(SEGREDO);
    const guardada = cofre.cifrar(CHAVE, "org_souza");
    expect(() => cofre.decifrar(guardada, "org_mendes")).toThrow();
  });

  test("outro segredo do servidor não decifra", () => {
    const guardada = criarCofre(SEGREDO).cifrar(CHAVE, "org_souza");
    expect(() => criarCofre("outro-segredo-do-servidor-0123456789abcdefghij").decifrar(guardada, "org_souza")).toThrow();
  });

  test("texto adulterado ou fora do formato é recusado, sem vazar a chave na mensagem do erro", () => {
    const cofre = criarCofre(SEGREDO);
    const guardada = cofre.cifrar(CHAVE, "org_souza");
    const adulterada = `${guardada.slice(0, -2)}AA`;
    for (const ruim of [adulterada, "v1.x", "texto-puro", ""]) {
      try {
        cofre.decifrar(ruim, "org_souza");
        throw new Error("não devia decifrar");
      } catch (err) {
        expect(String((err as Error).message)).not.toContain(CHAVE);
        expect(String((err as Error).message)).not.toBe("não devia decifrar");
      }
    }
  });

  test("segredo curto demais não vira cofre", () => {
    expect(() => criarCofre("curto")).toThrow();
  });
});
