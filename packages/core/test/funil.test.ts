import { describe, expect, test } from "bun:test";
import { ehEventoDoSite, EVENTOS_DO_SERVIDOR, EVENTOS_DO_SITE, montarFunil, periodoDoFunil, textoDoFunil } from "../src/funil.ts";

describe("período do funil", () => {
  test("sem nada, são os últimos 30 dias, contando hoje", () => {
    expect(periodoDoFunil({}, "2026-11-02")).toEqual({ de: "2026-10-04", ate: "2026-11-02" });
  });

  test("--dias conta para trás a partir de hoje", () => {
    expect(periodoDoFunil({ dias: "7" }, "2026-11-02")).toEqual({ de: "2026-10-27", ate: "2026-11-02" });
    expect(periodoDoFunil({ dias: "1" }, "2026-11-02")).toEqual({ de: "2026-11-02", ate: "2026-11-02" });
  });

  test("--de e --ate valem como vierem; o --ate sozinho conta 30 dias para trás, e o --de sozinho vai até hoje", () => {
    expect(periodoDoFunil({ de: "2026-10-01", ate: "2026-10-31" }, "2026-11-02")).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(periodoDoFunil({ ate: "2026-10-31" }, "2026-11-02")).toEqual({ de: "2026-10-02", ate: "2026-10-31" });
    expect(periodoDoFunil({ de: "2026-10-15" }, "2026-11-02")).toEqual({ de: "2026-10-15", ate: "2026-11-02" });
  });

  test("dia torto, período de trás para frente e dias demais são recusados com a frase do erro", () => {
    expect(() => periodoDoFunil({ de: "31/10/2026" }, "2026-11-02")).toThrow("--de precisa ser um dia no formato AAAA-MM-DD.");
    expect(() => periodoDoFunil({ ate: "2026-02-30" }, "2026-11-02")).toThrow("--ate precisa ser um dia no formato AAAA-MM-DD.");
    expect(() => periodoDoFunil({ de: "2026-11-02", ate: "2026-11-01" }, "2026-11-02")).toThrow("--de vem depois de --ate.");
    for (const dias of ["0", "-3", "abc", "1.5", "400"]) expect(() => periodoDoFunil({ dias }, "2026-11-02")).toThrow("--dias é um número de 1 a 366.");
    expect(() => periodoDoFunil({ dias: "7", de: "2026-10-01" }, "2026-11-02")).toThrow("Use --dias ou --de e --ate, não os dois.");
  });
});

describe("eventos do funil", () => {
  test("o site só pode mandar os três nomes da lista; os do servidor ficam de fora", () => {
    expect([...EVENTOS_DO_SITE]).toEqual(["visita", "clicou_demonstracao", "clicou_criar_conta"]);
    expect([...EVENTOS_DO_SERVIDOR]).toEqual(["cadastro_concluido", "oab_cadastrada", "primeira_publicacao", "primeiro_prazo_confirmado"]);
    expect(ehEventoDoSite("visita")).toBe(true);
    expect(ehEventoDoSite("clicou_criar_conta")).toBe(true);
    expect(ehEventoDoSite("cadastro_concluido")).toBe(false);
    expect(ehEventoDoSite("qualquer coisa")).toBe(false);
    expect(ehEventoDoSite(undefined)).toBe(false);
  });
});

describe("funil", () => {
  const totais = { visita: 200, clicou_criar_conta: 50, clicou_demonstracao: 20, cadastro_concluido: 10, oab_cadastrada: 8, primeira_publicacao: 5, primeiro_prazo_confirmado: 2, escritorio_encerrado: 1 };

  test("cada etapa traz o total e a fração do passo anterior", () => {
    const etapas = montarFunil(totais);
    expect(etapas.map((e) => [e.nome, e.total, e.doAnterior])).toEqual([
      ["visita", 200, null],
      ["clicou_criar_conta", 50, 0.25],
      ["cadastro_concluido", 10, 0.2],
      ["oab_cadastrada", 8, 0.8],
      ["primeira_publicacao", 5, 0.625],
      ["primeiro_prazo_confirmado", 2, 0.4],
    ]);
  });

  test("etapa sem nenhum evento vale zero, e a fração depois de um zero fica em branco", () => {
    const etapas = montarFunil({ visita: 3, cadastro_concluido: 1 });
    expect(etapas.map((e) => [e.nome, e.total, e.doAnterior])).toEqual([
      ["visita", 3, null],
      ["clicou_criar_conta", 0, 0],
      ["cadastro_concluido", 1, null],
      ["oab_cadastrada", 0, 0],
      ["primeira_publicacao", 0, null],
      ["primeiro_prazo_confirmado", 0, null],
    ]);
  });

  test("o texto do script mostra o período, os passos e o que não faz parte da escada", () => {
    expect(textoDoFunil("2026-10-03", "2026-11-02", totais)).toBe(
      [
        "Funil de 03/10/2026 a 02/11/2026 (31 dias)",
        "",
        "Visitas ao site                 200",
        "Clicaram em criar conta          50   25,0% do passo anterior",
        "Cadastros concluídos             10   20,0% do passo anterior",
        "OAB cadastrada                    8   80,0% do passo anterior",
        "Primeira publicação               5   62,5% do passo anterior",
        "Primeiro prazo confirmado         2   40,0% do passo anterior",
        "",
        "Clicaram na demonstração         20",
        "Escritórios encerrados            1",
        "",
        "Cada número conta os eventos do período, não as pessoas: quem criou a conta hoje pode ter visitado o site semana passada. Os passos do site não têm identificador de ninguém.",
      ].join("\n"),
    );
  });
});
