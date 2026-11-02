/** O que a landing desenha sem navegador: o preço, que depende de uma decisão ainda aberta, e a conta do exemplo. */
import { describe, expect, test } from "bun:test";
import { abrirConta, PLANO } from "@decreta/core";
import { desenharConta, trechosFora } from "../src/landing/conta-html";
import { htmlDoPreco, valorEmReais } from "../src/landing/preco";

const CONTATO = "https://wa.me/exemplo";

describe("a seção de preço", () => {
  test("sem valor decidido: o plano único, o que vem nele e o convite para falar com a equipe", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: null }, CONTATO);
    expect(html).toContain("Plano Escritório");
    expect(html).toContain("A IA inclusa");
    expect(html).toContain("Sem taxa de adesão");
    expect(html).toContain("Cancelamento no próprio app");
    expect(html).toContain(`href="${CONTATO}"`);
    expect(html).toContain("fale com a equipe");
    expect(html).not.toContain("Sob consulta");
    expect(html).not.toContain("R$");
  });

  test("com um número: mostra o número e não convida para conversar sobre o valor", () => {
    const html = htmlDoPreco({ ...PLANO, valorMensalCentavos: 19_900 }, CONTATO);
    expect(html).toContain(valorEmReais(19_900));
    expect(valorEmReais(19_900).replace(/\s/g, " ")).toBe("R$ 199,00");
    expect(html).toContain("por mês");
    expect(html).not.toContain("fale com a equipe");
  });

  test("os dias de teste vêm da constante", () => {
    expect(htmlDoPreco({ ...PLANO, testeDias: 30 }, CONTATO)).toContain("30 dias de teste");
  });
});

describe("o desenho da conta", () => {
  const exemplo = abrirConta({ publicacao: "2026-10-30", dias: 15, contagem: "uteis", tribunal: "TJSC" });

  test("o exemplo do hero já sai resolvido no HTML, sem depender de JavaScript", () => {
    const html = desenharConta(exemplo);
    expect(html).toContain("24/11/2026");
    expect(html).toContain("terça-feira");
    expect(html).toContain("Finados");
    expect(html).toContain("Consciência Negra");
    expect(html).toContain("TJSC");
    expect(html).not.toContain("ainda não tem calendário próprio");
  });

  test("tribunal só com o calendário nacional: avisa como o app", () => {
    const html = desenharConta(abrirConta({ publicacao: "2026-10-30", dias: 15, contagem: "uteis", tribunal: "TJBA" }));
    expect(html).toContain("Este tribunal ainda não tem calendário próprio no Decreta: a conta usou os feriados nacionais e o recesso. Confira as suspensões do tribunal.");
    expect(html).toContain("só nacional e recesso");
  });

  test("o que ficou fora: cada feriado com o nome, e dias seguidos de mesmo motivo num trecho só", () => {
    expect(trechosFora(exemplo.linha).map((t) => [t.de, t.ate, t.motivo])).toEqual([
      ["2026-11-02", "2026-11-02", "Finados"],
      ["2026-11-20", "2026-11-20", "Consciência Negra"],
    ]);
    // 17/12 + 2 dias úteis atravessa o recesso. 20/12/2026 é domingo: o trecho abre no primeiro dia de semana, 21/12.
    const recesso = trechosFora(abrirConta({ publicacao: "2026-12-17", dias: 2, contagem: "uteis", tribunal: "TJSC" }).linha);
    expect(recesso.map((t) => t.motivo)).toEqual(["Recesso forense", "Natal", "Recesso forense", "Confraternização Universal", "Recesso forense", "Suspensão dos prazos de fim de ano (CPC, art. 220)"]);
    expect(recesso[0]).toMatchObject({ de: "2026-12-21", ate: "2026-12-24" });
    expect(recesso.at(-1)).toMatchObject({ de: "2027-01-07", ate: "2027-01-20" });
  });

  test("a conta longa marca as semanas para a janela do calendário andar", () => {
    const html = desenharConta(abrirConta({ publicacao: "2026-02-02", dias: 60, contagem: "uteis", tribunal: "TJSC" }));
    expect(Number(/data-semanas="(\d+)"/.exec(html)?.[1])).toBeGreaterThan(6);
  });
});
