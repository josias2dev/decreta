/**
 * A conta aberta da landing: cada dia entre a publicação e o vencimento, com o
 * motivo de ter contado ou ficado de fora. Os exemplos foram contados à mão.
 */
import { describe, expect, test } from "bun:test";
import { abrirConta, calendarioPara, contarPrazo } from "../src/index.ts";

const contados = (c: ReturnType<typeof abrirConta>) => c.linha.filter((d) => d.tipo === "contado").map((d) => d.dia);
const doTipo = (c: ReturnType<typeof abrirConta>, tipo: string) => c.linha.filter((d) => d.tipo === tipo);

describe("a conta aberta", () => {
  const exemplo = abrirConta({ publicacao: "2026-10-30", dias: 15, contagem: "uteis", tribunal: "TJSC" });

  test("publicada em 30/10 no TJSC, 15 dias úteis: começa em 03/11 e vence em 24/11", () => {
    expect(exemplo.inicio).toBe("2026-11-03");
    expect(exemplo.fim).toBe("2026-11-24");
    expect(exemplo.proprio).toBe(true);
    expect(exemplo.prorrogadoDe).toBeNull();
  });

  test("os feriados pulados vêm com o nome de cada um", () => {
    expect(doTipo(exemplo, "feriado").map((d) => [d.dia, d.motivo])).toEqual([
      ["2026-11-02", "Finados"],
      ["2026-11-20", "Consciência Negra"],
    ]);
  });

  test("cada dia contado tem o seu número, de 1 aos 15, e só o último vence", () => {
    const dias = doTipo(exemplo, "contado");
    expect(dias.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
    expect(dias.slice(0, 5).map((d) => d.dia)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-09"]);
    expect(dias.filter((d) => d.vence).map((d) => d.dia)).toEqual(["2026-11-24"]);
  });

  test("a linha vai da publicação ao vencimento, sem pular nem repetir dia", () => {
    expect(exemplo.linha[0]).toEqual({ dia: "2026-10-30", tipo: "publicacao" });
    expect(exemplo.linha.at(-1)?.dia).toBe("2026-11-24");
    // De 30/10 a 24/11 são 26 dias, contando os dois.
    expect(exemplo.linha).toHaveLength(26);
    expect(doTipo(exemplo, "fim_de_semana").map((d) => d.dia)).toEqual(["2026-10-31", "2026-11-01", "2026-11-07", "2026-11-08", "2026-11-14", "2026-11-15", "2026-11-21", "2026-11-22"]);
  });

  test("feriado que cai no fim de semana conta como fim de semana, com o nome junto", () => {
    expect(exemplo.linha.find((d) => d.dia === "2026-11-15")).toEqual({ dia: "2026-11-15", tipo: "fim_de_semana", motivo: "Proclamação da República" });
  });

  test("tribunal sem calendário próprio: a conta avisa e conta o que o nacional não tira", () => {
    // Corpus Christi (04/06/2026) é forense no TJSC; no TJPR, sem calendário próprio aqui, o dia conta.
    const tjsc = abrirConta({ publicacao: "2026-06-02", dias: 3, contagem: "uteis", tribunal: "TJSC" });
    const tjpr = abrirConta({ publicacao: "2026-06-02", dias: 3, contagem: "uteis", tribunal: "TJPR" });
    expect(tjsc.proprio).toBe(true);
    expect(tjsc.fim).toBe("2026-06-08");
    expect(tjpr.proprio).toBe(false);
    expect(tjpr.fim).toBe("2026-06-05");
  });

  test("dias corridos: o fim de semana conta, e o vencimento num sábado vai para a segunda", () => {
    const c = abrirConta({ publicacao: "2026-10-30", dias: 5, contagem: "corridos", tribunal: "TJSC" });
    expect(contados(c)).toEqual(["2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"]);
    expect(c.prorrogadoDe).toBe("2026-11-07");
    expect(c.fim).toBe("2026-11-09");
    expect(c.linha.at(-1)).toEqual({ dia: "2026-11-09", tipo: "vencimento", vence: true });
    expect(c.linha.find((d) => d.dia === "2026-11-07")?.vence).toBeUndefined();
  });

  test("a suspensão de fim de ano fica de fora com o motivo", () => {
    // 18/12 é o 1º dia e 19 e 20/12 são fim de semana. De 20/12 a 20/01 nada corre: o 2º dia é 21/01.
    const c = abrirConta({ publicacao: "2026-12-17", dias: 2, contagem: "uteis", tribunal: "TJSC" });
    expect(contados(c)).toEqual(["2026-12-18", "2027-01-21"]);
    expect(c.linha.find((d) => d.dia === "2026-12-28")).toEqual({ dia: "2026-12-28", tipo: "suspensao", motivo: "Recesso forense" });
    expect(c.linha.find((d) => d.dia === "2027-01-12")).toEqual({ dia: "2027-01-12", tipo: "suspensao", motivo: "Suspensão dos prazos de fim de ano (CPC, art. 220)" });
    expect(c.linha.find((d) => d.dia === "2026-12-25")?.motivo).toBe("Natal");
  });

  test("o motor continua sendo a fonte da data: a linha sempre termina onde a contagem termina", () => {
    const casos = [
      { publicacao: "2026-02-10", dias: 15, contagem: "uteis", tribunal: "TJSP" },
      { publicacao: "2026-02-10", dias: 30, contagem: "corridos", tribunal: "TJMG" },
      { publicacao: "2026-12-01", dias: 60, contagem: "uteis", tribunal: "TRF4" },
      { publicacao: "2026-03-30", dias: 1, contagem: "uteis", tribunal: "TJBA" },
    ] as const;
    for (const pedido of casos) {
      const c = abrirConta(pedido);
      const motor = contarPrazo({ publicacao: pedido.publicacao, dias: pedido.dias, contagem: pedido.contagem, calendario: calendarioPara({ tribunal: pedido.tribunal }) });
      expect(c.fim).toBe(motor.fim);
      expect(c.linha.at(-1)?.dia).toBe(motor.fim);
      expect(c.linha.filter((d) => d.tipo === "contado")).toHaveLength(pedido.dias);
    }
  });

  test("dias fora da faixa não viram conta", () => {
    expect(() => abrirConta({ publicacao: "2026-10-30", dias: 0, contagem: "uteis", tribunal: "TJSC" })).toThrow(RangeError);
  });
});
