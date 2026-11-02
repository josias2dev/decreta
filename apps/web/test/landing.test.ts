/** O que a landing desenha sem navegador: o preço, que depende de uma decisão ainda aberta. */
import { describe, expect, test } from "bun:test";
import { PLANO } from "@decreta/core";
import { htmlDoPreco, valorEmReais } from "../src/landing/preco";

const CONTATO = "https://wa.me/exemplo";

describe("a seção de preço", () => {
  test("sem valor decidido: o plano único, o que vem nele e o convite para falar com a equipe", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: null }, CONTATO);
    expect(html).toContain("Plano Escritório");
    expect(html).toContain("Briefing, resumo e Perguntar com IA");
    expect(html).toContain("Sem taxa de adesão");
    expect(html).toContain("Cancelamento no próprio app");
    expect(html).toContain(`href="${CONTATO}"`);
    expect(html).toContain("Fale com a equipe");
    expect(html).not.toContain("Sob consulta");
    expect(html).not.toContain("R$");
  });

  test("com um número: mostra o número e não convida para conversar sobre o valor", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: 19_900 }, CONTATO);
    expect(html).toContain(valorEmReais(19_900));
    expect(valorEmReais(19_900).replace(/\s/g, " ")).toBe("R$ 199,00");
    expect(html).toContain("por mês");
    expect(html).not.toContain("Fale com a equipe");
  });

  test("não promete um teste com prazo que o produto ainda não aplica", () => {
    expect(htmlDoPreco(PLANO, CONTATO)).not.toContain("dias de teste");
    expect(htmlDoPreco(PLANO, CONTATO)).toContain("sem cartão");
  });
});
