import { describe, expect, test } from "bun:test";
import {
  calendarioPara,
  contarComDoisMarcos,
  contarPrazo,
  dataDaPublicacao,
  diasUteisEntre,
  explicarContagem,
  feriadosForenses,
  feriadosNacionais,
  inicioDoPrazo,
  pascoa,
  textoDaTempestividade,
  urgenciaDoPrazo,
} from "../src/index.ts";

const tjsc = calendarioPara({ tribunal: "TJSC" });
const trt12 = calendarioPara({ tribunal: "TRT12" });

describe("calendário", () => {
  test("Páscoa", () => {
    expect(pascoa(2026)).toBe("2026-04-05");
    expect(pascoa(2027)).toBe("2027-03-28");
    expect(pascoa(2024)).toBe("2024-03-31");
  });

  test("feriados nacionais de 2026, com a Consciência Negra", () => {
    const dias = feriadosNacionais(2026).map((f) => f.dia);
    expect(dias).toContain("2026-04-03");
    expect(dias).toContain("2026-11-02");
    expect(dias).toContain("2026-11-20");
    expect(feriadosNacionais(2023).map((f) => f.dia)).not.toContain("2023-11-20");
  });

  test("dias sem expediente do TJSC em 2026", () => {
    const f = Object.fromEntries(feriadosForenses(2026, "TJSC").map((x) => [x.dia, x.tipo]));
    expect(f["2026-02-16"]).toBe("forense");
    expect(f["2026-02-17"]).toBe("forense");
    expect(f["2026-02-18"]).toBe("reduzido");
    expect(f["2026-04-02"]).toBe("forense");
    expect(f["2026-06-04"]).toBe("forense");
    expect(f["2026-12-08"]).toBe("forense");
  });
});

describe("contagem em dias úteis", () => {
  test("o caso do design: publicada em 29/10, 15 dias úteis, vence em 23/11/2026", () => {
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 15, contagem: "uteis", calendario: tjsc });
    expect(r.inicio).toBe("2026-10-30");
    expect(r.fim).toBe("2026-11-23");
    expect(r.desconsiderados.map((f) => [f.dia, f.nome])).toEqual([
      ["2026-11-02", "Finados"],
      ["2026-11-20", "Consciência Negra"],
    ]);
    expect(r.prorrogadoDe).toBeNull();
    expect(explicarContagem(r)).toBe(
      "Começa em 30/10, primeiro dia útil depois da publicação. Fora da conta: fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra).",
    );
  });

  test("disponibilizada na sexta, publicada na segunda", () => {
    expect(dataDaPublicacao("2026-10-23", tjsc)).toBe("2026-10-26");
    // Disponibilizada na sexta antes de Finados: publicada na terça.
    expect(dataDaPublicacao("2026-10-30", tjsc)).toBe("2026-11-03");
  });

  test("começa no primeiro dia útil depois da publicação", () => {
    expect(inicioDoPrazo("2026-10-30", tjsc)).toBe("2026-11-03");
  });

  test("5 dias com o Carnaval no meio e a Quarta de Cinzas contando", () => {
    // Publicada na sexta 13/02/2026: 16 e 17 são Carnaval e a Quarta de Cinzas (18), de expediente reduzido, não abre prazo.
    const r = contarPrazo({ publicacao: "2026-02-13", dias: 5, contagem: "uteis", calendario: tjsc });
    expect(r.inicio).toBe("2026-02-19");
    expect(r.fim).toBe("2026-02-25");
  });

  test("Quarta de Cinzas conta no meio do prazo", () => {
    // Publicada em 11/02 (quarta): começa 12/02; 13 é o 2º dia; 16 e 17 não contam; 18 conta (3º).
    const r = contarPrazo({ publicacao: "2026-02-11", dias: 3, contagem: "uteis", calendario: tjsc });
    expect(r.inicio).toBe("2026-02-12");
    // O 3º dia seria 18/02, de expediente reduzido: vence em 19/02.
    expect(r.fim).toBe("2026-02-19");
    expect(r.prorrogadoDe).toBe("2026-02-18");
    const r4 = contarPrazo({ publicacao: "2026-02-11", dias: 4, contagem: "uteis", calendario: tjsc });
    expect(r4.fim).toBe("2026-02-19");
    expect(r4.prorrogadoDe).toBeNull();
  });

  test("atravessa a suspensão de fim de ano", () => {
    // Publicada em 15/12/2026 (terça): 16, 17, 18 contam; de 20/12 a 20/01 não; 21/01 é o 4º.
    const r = contarPrazo({ publicacao: "2026-12-15", dias: 5, contagem: "uteis", calendario: tjsc });
    expect(r.inicio).toBe("2026-12-16");
    expect(r.fim).toBe("2027-01-22");
    expect(r.desconsiderados.some((f) => f.dia === "2026-12-25")).toBe(true);
    expect(r.desconsiderados.some((f) => f.tipo === "recesso")).toBe(true);
  });

  test("publicação durante a suspensão: o prazo começa em 21/01", () => {
    // De 7 a 20 de janeiro há expediente (sai publicação), mas o prazo não corre.
    expect(dataDaPublicacao("2027-01-08", tjsc)).toBe("2027-01-11");
    const r = contarPrazo({ publicacao: "2027-01-11", dias: 1, contagem: "uteis", calendario: tjsc });
    expect(r.inicio).toBe("2027-01-21");
    expect(r.fim).toBe("2027-01-21");
  });

  test("feriado municipal cadastrado pelo escritório", () => {
    const joinville = calendarioPara({ tribunal: "TJSC", extras: [{ dia: "2026-11-05", nome: "Feriado municipal", tipo: "local" }] });
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 15, contagem: "uteis", calendario: joinville });
    expect(r.fim).toBe("2026-11-24");
    expect(r.desconsiderados.map((f) => f.dia)).toEqual(["2026-11-02", "2026-11-05", "2026-11-20"]);
  });

  test("TRT12 segue o mesmo calendário nacional e o recesso", () => {
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 8, contagem: "uteis", calendario: trt12 });
    // 30/10, 03, 04, 05, 06, 09, 10 e 11/11.
    expect(r.fim).toBe("2026-11-11");
  });
});

describe("contagem em dias corridos", () => {
  test("vencimento no domingo vai para segunda", () => {
    // Publicada na quinta 29/10: começa sexta 30/10; 30 dias corridos terminam em 28/11 (sábado) → 30/11.
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 30, contagem: "corridos", calendario: tjsc });
    expect(r.inicio).toBe("2026-10-30");
    expect(r.prorrogadoDe).toBe("2026-11-28");
    expect(r.fim).toBe("2026-11-30");
  });

  test("feriados contam no meio dos corridos", () => {
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 5, contagem: "corridos", calendario: tjsc });
    // 30, 31, 01, 02, 03: vence em 03/11.
    expect(r.fim).toBe("2026-11-03");
    expect(r.desconsiderados).toEqual([]);
  });
});

describe("dupla intimação (Tema 1.180 do STJ, sem tese)", () => {
  test("intimação pelo sistema antes da publicação no DJEN: vale a conta que vence primeiro", () => {
    // Pelo sistema em 27/10: começa 28/10; 15 dias úteis, sem 02/11, vencem em 18/11. Pelo DJEN (29/10), em 23/11.
    const c = contarComDoisMarcos({ publicacao: "2026-10-29", intimacaoNoSistema: "2026-10-27", dias: 15, contagem: "uteis", calendario: tjsc });
    expect(c.pelo).toBe("sistema");
    expect(c.conta.inicio).toBe("2026-10-28");
    expect(c.conta.fim).toBe("2026-11-18");
    expect(c.outra?.fim).toBe("2026-11-23");
  });

  test("intimação pelo sistema depois da publicação: vale o DJEN", () => {
    const c = contarComDoisMarcos({ publicacao: "2026-10-29", intimacaoNoSistema: "2026-11-03", dias: 15, contagem: "uteis", calendario: tjsc });
    expect(c.pelo).toBe("publicacao");
    expect(c.conta.fim).toBe("2026-11-23");
    expect(c.outra?.inicio).toBe("2026-11-04");
  });

  test("sem intimação pelo sistema, só a publicação", () => {
    const c = contarComDoisMarcos({ publicacao: "2026-10-29", intimacaoNoSistema: null, dias: 15, contagem: "uteis", calendario: tjsc });
    expect(c.pelo).toBe("publicacao");
    expect(c.conta.fim).toBe("2026-11-23");
    expect(c.outra).toBeNull();
  });
});

describe("tópico de tempestividade da peça", () => {
  test("o caso do design, com a disponibilização no DJEN", () => {
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 15, contagem: "uteis", calendario: tjsc });
    expect(textoDaTempestividade(r, { rito: "cpc", disponibilizacao: "2026-10-28" })).toBe(
      "A intimação foi disponibilizada no Diário de Justiça Eletrônico Nacional (DJEN) em 28/10/2026 e considera-se publicada em 29/10/2026, primeiro dia útil seguinte (Lei 11.419/2006, art. 4º, § 3º). " +
        "O prazo de 15 dias úteis (CPC, art. 219) começou a correr em 30/10/2026 (Lei 11.419/2006, art. 4º, § 4º) e termina em 23/11/2026, excluídos os sábados, os domingos e os dias 02/11/2026 (Finados) e 20/11/2026 (Consciência Negra). " +
        "Apresentada até 23/11/2026, a presente peça é tempestiva.",
    );
  });

  test("com a certidão do DJEN, o tópico cita a certidão como prova da data", () => {
    const r = contarPrazo({ publicacao: "2026-10-29", dias: 15, contagem: "uteis", calendario: tjsc });
    expect(textoDaTempestividade(r, { rito: "cpc", disponibilizacao: "2026-10-28", certidao: true })).toStartWith(
      "A intimação foi disponibilizada no Diário de Justiça Eletrônico Nacional (DJEN) em 28/10/2026, conforme a certidão de publicação emitida pelo próprio DJEN (anexa), e considera-se publicada em 29/10/2026, primeiro dia útil seguinte (Lei 11.419/2006, art. 4º, § 3º). ",
    );
    // Sem a data de disponibilização não há o que a certidão provar no texto.
    expect(textoDaTempestividade(r, { rito: "cpc", disponibilizacao: null, certidao: true })).toStartWith("A intimação foi publicada em 29/10/2026. ");
  });

  test("vencimento prorrogado e dias seguidos agrupados", () => {
    const r = contarPrazo({ publicacao: "2026-02-11", dias: 3, contagem: "uteis", calendario: tjsc });
    expect(textoDaTempestividade(r, { rito: "cpc", disponibilizacao: null })).toBe(
      "A intimação foi publicada em 11/02/2026. " +
        "O prazo de 3 dias úteis (CPC, art. 219) começou a correr em 12/02/2026 (Lei 11.419/2006, art. 4º, § 4º) e termina em 19/02/2026, excluídos os sábados, os domingos e os dias de 16/02/2026 a 17/02/2026 (Carnaval). " +
        "O último dia cairia em 18/02/2026, sem expediente forense completo, e passou para 19/02/2026 (CPC, art. 224, § 1º). " +
        "Apresentada até 19/02/2026, a presente peça é tempestiva.",
    );
  });

  test("a suspensão de fim de ano vira um intervalo, sem parênteses dentro de parênteses", () => {
    const r = contarPrazo({ publicacao: "2026-12-15", dias: 5, contagem: "uteis", calendario: tjsc });
    const t = textoDaTempestividade(r, { rito: "cpc", disponibilizacao: null });
    expect(t).toContain("25/12/2026 (Natal)");
    expect(t).toContain("de 07/01/2027 a 20/01/2027 (Suspensão dos prazos de fim de ano, CPC, art. 220)");
  });

  test("prazo de um dia fica no singular", () => {
    const util = contarPrazo({ publicacao: "2026-10-29", dias: 1, contagem: "uteis", calendario: tjsc });
    expect(textoDaTempestividade(util, { rito: "cpc", disponibilizacao: null })).toContain("O prazo de 1 dia útil (CPC, art. 219) começou a correr em 30/10/2026");
    const corrido = contarPrazo({ publicacao: "2026-10-29", dias: 1, contagem: "corridos", calendario: tjsc });
    expect(textoDaTempestividade(corrido, { rito: "cpc", disponibilizacao: null })).toContain("O prazo de 1 dia corrido começou a correr em 30/10/2026");
  });

  test("CLT em dias úteis; dias corridos sem nada excluído", () => {
    const clt = contarPrazo({ publicacao: "2026-10-29", dias: 8, contagem: "uteis", calendario: trt12 });
    expect(textoDaTempestividade(clt, { rito: "clt", disponibilizacao: null })).toContain("O prazo de 8 dias úteis (CLT, art. 775) começou a correr em 30/10/2026");
    const corridos = contarPrazo({ publicacao: "2026-10-29", dias: 5, contagem: "corridos", calendario: tjsc });
    expect(textoDaTempestividade(corridos, { rito: "cpc", disponibilizacao: null })).toContain("O prazo de 5 dias corridos começou a correr em 30/10/2026 (Lei 11.419/2006, art. 4º, § 4º) e termina em 03/11/2026. ");
  });
});

describe("urgência", () => {
  const hoje = "2026-10-29";
  test("vencido, hoje, breve, no prazo e cumprido", () => {
    expect(urgenciaDoPrazo({ fim: "2026-10-28", situacao: "aberto" }, hoje, tjsc)).toBe("vencido");
    expect(urgenciaDoPrazo({ fim: "2026-10-29", situacao: "aberto" }, hoje, tjsc)).toBe("hoje");
    // 30/10, 03/11, 04/11: três dias úteis (02/11 é feriado).
    expect(urgenciaDoPrazo({ fim: "2026-11-04", situacao: "aberto" }, hoje, tjsc)).toBe("breve");
    expect(urgenciaDoPrazo({ fim: "2026-11-05", situacao: "aberto" }, hoje, tjsc)).toBe("prazo");
    expect(urgenciaDoPrazo({ fim: "2026-10-01", situacao: "cumprido" }, hoje, tjsc)).toBe("cumprido");
  });

  test("dias úteis entre duas datas", () => {
    expect(diasUteisEntre("2026-10-29", "2026-11-04", tjsc)).toBe(3);
    expect(diasUteisEntre("2026-11-04", "2026-10-29", tjsc)).toBe(-3);
  });
});

test("prazo inválido", () => {
  expect(() => contarPrazo({ publicacao: "2026-10-29", dias: 0, contagem: "uteis", calendario: tjsc })).toThrow();
});
