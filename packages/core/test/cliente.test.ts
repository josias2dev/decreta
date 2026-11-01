import { describe, expect, test } from "bun:test";
import { mensagemParaWhatsapp, rodapeAntigolpe } from "../src/index.ts";

describe("mensagem com a identidade do escritório", () => {
  test("nome do escritório no alto, o corpo do advogado e o rodapé no fim", () => {
    const m = mensagemParaWhatsapp({ escritorio: "Souza & Mendes Advocacia", corpo: "  Olá, Marina. O juiz pediu a sua manifestação sobre o laudo.  ", numeroOficial: "47934331000" });
    const linhas = m.split("\n");
    expect(linhas[0]).toBe("*Souza & Mendes Advocacia*");
    expect(m).toContain("\n\nOlá, Marina. O juiz pediu a sua manifestação sobre o laudo.\n\n");
    expect(linhas.at(-1)).toBe(`_${rodapeAntigolpe("47934331000")}_`);
  });
});

describe("rodapé contra o golpe do falso advogado", () => {
  test("diz que o escritório nunca pede Pix e dá o número oficial formatado", () => {
    const r = rodapeAntigolpe("5547934331000");
    expect(r).toContain("Este escritório nunca pede Pix para liberar valores.");
    expect(r).toContain("(47) 93433-1000");
  });
});
