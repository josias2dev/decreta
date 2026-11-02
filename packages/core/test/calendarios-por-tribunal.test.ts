import { describe, expect, test } from "bun:test";
import { calendarioPara, contarPrazo, dataDaPublicacao, ehDiaUtil, feriadosForenses, temCalendarioProprio, TRIBUNAIS_COM_CALENDARIO } from "../src/index.ts";

/** As datas (e o tipo) que o tribunal fecha além dos feriados nacionais, num ano. */
const forenses = (ano: number, tribunal: string) => feriadosForenses(ano, tribunal).map((f) => [f.dia, f.tipo]);
const dias = (ano: number, tribunal: string) => feriadosForenses(ano, tribunal).map((f) => f.dia);

describe("quem tem calendário próprio", () => {
  test("os tribunais com calendário conferido", () => {
    for (const t of ["TJSC", "TRT12", "TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6", "TJSP", "TJRJ", "TJMG"]) {
      expect(temCalendarioProprio(t)).toBe(true);
      expect(calendarioPara({ tribunal: t }).proprio).toBe(true);
    }
    expect(TRIBUNAIS_COM_CALENDARIO).toContain("TRF4");
  });

  test("os outros usam só o nacional e o recesso, e o calendário diz isso", () => {
    for (const t of ["TJPR", "TJRS", "TJBA", "TRT2", "STJ", ""]) {
      expect(temCalendarioProprio(t)).toBe(false);
      expect(calendarioPara({ tribunal: t }).proprio).toBe(false);
      expect(feriadosForenses(2026, t)).toEqual([]);
    }
  });

  test("a sigla vale em minúsculas e com espaços", () => {
    expect(temCalendarioProprio(" trf4 ")).toBe(true);
  });
});

describe("Justiça Federal (TRF1 a TRF6): Lei 5.010/1966, art. 62", () => {
  test("em 2026: Carnaval, quarta e quinta da Semana Santa, 11/08, 1º/11 e 8/12", () => {
    // A sexta-feira (03/04) já é a Paixão, feriado nacional. Sem Quarta-feira de Cinzas: a lei não a cita.
    const esperado = [
      ["2026-02-16", "forense"],
      ["2026-02-17", "forense"],
      ["2026-04-01", "forense"],
      ["2026-04-02", "forense"],
      ["2026-08-11", "forense"],
      ["2026-11-01", "forense"],
      ["2026-12-08", "forense"],
    ];
    for (const trf of ["TRF1", "TRF2", "TRF3", "TRF4", "TRF5", "TRF6"]) expect(forenses(2026, trf)).toEqual(esperado);
  });

  test("em 2027 as datas móveis acompanham a Páscoa (28/03)", () => {
    expect(dias(2027, "TRF4")).toEqual(["2027-02-08", "2027-02-09", "2027-03-24", "2027-03-25", "2027-08-11", "2027-11-01", "2027-12-08"]);
  });

  test("o Dia do Advogado empurra o prazo: publicada em 06/08/2026, 15 dias úteis vencem em 28/08 no TRF4 e em 27/08 no TJSC", () => {
    const trf4 = contarPrazo({ publicacao: "2026-08-06", dias: 15, contagem: "uteis", calendario: calendarioPara({ tribunal: "TRF4" }) });
    expect(trf4.inicio).toBe("2026-08-07");
    expect(trf4.fim).toBe("2026-08-28");
    expect(trf4.desconsiderados.map((f) => [f.dia, f.nome])).toEqual([["2026-08-11", "Dia do Advogado"]]);
    expect(contarPrazo({ publicacao: "2026-08-06", dias: 15, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJSC" }) }).fim).toBe("2026-08-27");
  });

  test("a Semana Santa fecha a quarta e a quinta: publicada em 30/03/2026, 5 dias úteis vencem em 09/04 no TRF3", () => {
    // 31/03 (1º), 01 e 02/04 fora, 03/04 Paixão, 06 (2º), 07 (3º), 08 (4º), 09 (5º).
    const r = contarPrazo({ publicacao: "2026-03-30", dias: 5, contagem: "uteis", calendario: calendarioPara({ tribunal: "TRF3" }) });
    expect(r.fim).toBe("2026-04-09");
    expect(r.desconsiderados.map((f) => f.dia)).toEqual(["2026-04-01", "2026-04-02", "2026-04-03"]);
    expect(contarPrazo({ publicacao: "2026-03-30", dias: 5, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJPR" }) }).fim).toBe("2026-04-07");
  });

  test("1º de novembro de 2027 é segunda-feira e a Justiça Federal não abre: a publicação vai para 03/11", () => {
    // 02/11 (Finados) é feriado nacional; no TJSC o dia 1º tem expediente.
    expect(dataDaPublicacao("2027-10-29", calendarioPara({ tribunal: "TRF1" }))).toBe("2027-11-03");
    expect(dataDaPublicacao("2027-10-29", calendarioPara({ tribunal: "TJSC" }))).toBe("2027-11-01");
  });
});

describe("TJMG: Lei Complementar estadual 59/2001, art. 313, § 5º", () => {
  test("em 2026: Carnaval com a Quarta-feira de Cinzas inteira, quarta e quinta da Semana Santa e 8/12", () => {
    expect(forenses(2026, "TJMG")).toEqual([
      ["2026-02-16", "forense"],
      ["2026-02-17", "forense"],
      ["2026-02-18", "forense"],
      ["2026-04-01", "forense"],
      ["2026-04-02", "forense"],
      ["2026-12-08", "forense"],
    ]);
  });

  test("a Quarta-feira de Cinzas não conta no meio do prazo: publicada em 11/02/2026, 5 dias úteis vencem em 23/02 no TJMG e em 20/02 no TJSC", () => {
    // TJMG: 12 (1º), 13 (2º), 16 a 18 fora, 19 (3º), 20 (4º), 23 (5º).
    expect(contarPrazo({ publicacao: "2026-02-11", dias: 5, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJMG" }) }).fim).toBe("2026-02-23");
    expect(contarPrazo({ publicacao: "2026-02-11", dias: 5, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJSC" }) }).fim).toBe("2026-02-20");
  });
});

describe("TJSP: provimentos do Conselho Superior da Magistratura (2023, 2024 e 2026) e Lei estadual 9.497/1997", () => {
  test("em 2026: Carnaval, Endoenças, Corpus Christi, Data Magna (9/7) e Dia da Justiça; Cinzas com expediente reduzido", () => {
    expect(forenses(2026, "TJSP")).toEqual([
      ["2026-02-16", "forense"],
      ["2026-02-17", "forense"],
      ["2026-02-18", "reduzido"],
      ["2026-04-02", "forense"],
      ["2026-06-04", "forense"],
      ["2026-07-09", "forense"],
      ["2026-12-08", "forense"],
    ]);
  });

  test("a Data Magna fecha o fórum: publicada em 07/07/2027, 3 dias úteis vencem em 13/07 no TJSP e em 12/07 no TJSC", () => {
    // TJSP: 08 (1º), 09 fora, 12 (2º), 13 (3º).
    const sp = calendarioPara({ tribunal: "TJSP" });
    expect(ehDiaUtil("2027-07-09", sp)).toBe(false);
    expect(contarPrazo({ publicacao: "2027-07-07", dias: 3, contagem: "uteis", calendario: sp }).fim).toBe("2027-07-13");
    expect(contarPrazo({ publicacao: "2027-07-07", dias: 3, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJSC" }) }).fim).toBe("2027-07-12");
  });
});

describe("TJRJ: LODJ (Lei estadual 10.633/2024, art. 83) e Lei estadual 5.198/2008", () => {
  test("em 2026: segunda a quarta do Carnaval, quinta da Semana Santa, São Jorge (23/4) e 8/12", () => {
    expect(forenses(2026, "TJRJ")).toEqual([
      ["2026-02-16", "forense"],
      ["2026-02-17", "forense"],
      ["2026-02-18", "forense"],
      ["2026-04-02", "forense"],
      ["2026-04-23", "forense"],
      ["2026-12-08", "forense"],
    ]);
  });

  test("São Jorge fecha o fórum: publicada em 20/04/2027, 3 dias úteis vencem em 27/04 no TJRJ e em 26/04 no TJSC", () => {
    // 21/04 é Tiradentes. TJRJ: 22 (1º), 23 fora, 26 (2º), 27 (3º).
    expect(contarPrazo({ publicacao: "2027-04-20", dias: 3, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJRJ" }) }).fim).toBe("2027-04-27");
    expect(contarPrazo({ publicacao: "2027-04-20", dias: 3, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJSC" }) }).fim).toBe("2027-04-26");
  });
});

describe("TJSC e TRT12 seguem como estavam", () => {
  test("em 2026", () => {
    const esperado = [
      ["2026-02-16", "forense"],
      ["2026-02-17", "forense"],
      ["2026-02-18", "reduzido"],
      ["2026-04-02", "forense"],
      ["2026-06-04", "forense"],
      ["2026-12-08", "forense"],
    ];
    expect(forenses(2026, "TJSC")).toEqual(esperado);
    expect(forenses(2026, "TRT12")).toEqual(esperado);
  });

  test("o caso-ouro: publicada em 30/10/2026 no TJSC, começa em 03/11, 20/11 não conta e vence em 24/11", () => {
    const r = contarPrazo({ publicacao: "2026-10-30", dias: 15, contagem: "uteis", calendario: calendarioPara({ tribunal: "TJSC" }) });
    expect(r.inicio).toBe("2026-11-03");
    expect(r.fim).toBe("2026-11-24");
    expect(r.desconsiderados.map((f) => [f.dia, f.nome])).toEqual([["2026-11-20", "Consciência Negra"]]);
  });
});
