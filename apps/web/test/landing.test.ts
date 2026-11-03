/** O que a landing desenha sem navegador: o preço, que depende de uma decisão ainda aberta. */
import { describe, expect, test } from "bun:test";
import { PLANO } from "@decreta/core";
import { htmlDoPreco, valorEmReais } from "../src/landing/preco";

const CONTATO = "https://wa.me/exemplo";
const acoes = (html: string) => [...html.matchAll(/<a /g)].length;

describe("a seção de preço", () => {
  test("sem valor decidido: o plano único, o que vem nele e uma só ação, perguntar à equipe", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: null }, CONTATO);
    expect(html).toContain("Plano Escritório");
    expect(html).toContain("Briefing, resumo e Perguntar com IA");
    expect(html).toContain("Sem taxa de adesão");
    expect(html).toContain("cancelamento no próprio app");
    expect(html).toContain(`href="${CONTATO}"`);
    expect(html).toContain("Fale com a equipe");
    expect(html).not.toContain("Sob consulta");
    expect(html).not.toContain("R$");
    expect(acoes(html)).toBe(1);
  });

  test("com um número: mostra o número, e a única ação passa a ser criar a conta", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: 19_900 }, CONTATO);
    expect(html).toContain(valorEmReais(19_900));
    expect(valorEmReais(19_900).replace(/\s/g, " ")).toBe("R$ 199,00");
    expect(html).toContain("por mês");
    expect(html).not.toContain("Fale com a equipe");
    expect(html).toContain('href="/cadastro"');
    expect(html).not.toContain(CONTATO);
    expect(acoes(html)).toBe(1);
  });

  test("não promete um teste com prazo que o produto ainda não aplica", () => {
    expect(htmlDoPreco(PLANO, CONTATO)).not.toContain("dias de teste");
    expect(htmlDoPreco(PLANO, CONTATO)).toContain("sem cartão");
  });
});
