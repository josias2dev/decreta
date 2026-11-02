/**
 * O prazo interno: conta para trás a partir do fatal, em dias com expediente
 * completo. Os exemplos foram contados à mão no calendário de 2026 e 2027.
 */
import { describe, expect, test } from "bun:test";
import { calendarioPara, fimDeSemana, prazoInterno, somarDias, temExpediente } from "../src/index.ts";

const tjsc = calendarioPara({ tribunal: "TJSC" });
const HOJE = "2026-11-02";
const pedido = (fatal: string, antecedencia: number, hoje = HOJE, calendario = tjsc) => ({ fatal, antecedencia, hoje, calendario });

describe("o prazo interno", () => {
  test("três dias úteis antes de uma quinta sem feriado no caminho: a segunda da mesma semana", () => {
    expect(prazoInterno(pedido("2026-11-12", 3))).toEqual({ dia: "2026-11-09", fatal: "2026-11-12", antecedencia: 3, regra: "3 dias úteis antes do fatal", passou: false, aviso: null });
  });

  test("no singular, um dia útil antes, e o fim de semana não conta", () => {
    const r = prazoInterno(pedido("2026-11-09", 1))!;
    expect(r.dia).toBe("2026-11-06");
    expect(r.regra).toBe("1 dia útil antes do fatal");
  });

  test("feriado no caminho: não conta, e a regra diz qual ficou de fora", () => {
    // 24/11 é terça: 23/11 é o primeiro; 21 e 22 são fim de semana; 20/11 é Consciência Negra; 19/11 é o segundo.
    const r = prazoInterno(pedido("2026-11-24", 2))!;
    expect(r.dia).toBe("2026-11-19");
    expect(r.regra).toBe("2 dias úteis antes do fatal, sem contar 20/11/2026 (Consciência Negra)");
  });

  test("cairia em dia sem expediente: recua para o dia útil anterior", () => {
    // Na segunda 23/11, um dia antes seria 20/11 (feriado); recua para a quinta 19/11.
    expect(prazoInterno(pedido("2026-11-23", 1))!.dia).toBe("2026-11-19");
  });

  test("o calendário é o do tribunal: Corpus Christi só tira o dia onde é forense", () => {
    expect(prazoInterno(pedido("2026-06-05", 1, "2026-06-01"))!.dia).toBe("2026-06-03");
    expect(prazoInterno(pedido("2026-06-05", 1, "2026-06-01", calendarioPara({ tribunal: "TJPR" })))!.dia).toBe("2026-06-04");
  });

  test("os dias que o escritório cadastrou também saem", () => {
    const comPonte = calendarioPara({ tribunal: "TJSC", extras: [{ dia: "2026-11-11", nome: "Ponte da comarca", tipo: "local" }] });
    const r = prazoInterno(pedido("2026-11-12", 1, HOJE, comPonte))!;
    expect(r.dia).toBe("2026-11-10");
    expect(r.regra).toContain("11/11/2026 (Ponte da comarca)");
  });

  test("expediente reduzido não recebe o prazo: da quinta depois de Cinzas, volta até antes do Carnaval", () => {
    // 18/02/2026 é Cinzas (a partir das 14h); 16 e 17 são Carnaval; 14 e 15, fim de semana.
    expect(prazoInterno(pedido("2026-02-19", 1, "2026-02-02"))!.dia).toBe("2026-02-13");
  });

  test("na suspensão de janeiro há expediente: o interno não salta um mês para trás", () => {
    // De 07/01 a 20/01 o fórum abre, mas o prazo não corre. O fatal cai em 21/01/2027.
    expect(prazoInterno(pedido("2027-01-21", 2, "2027-01-11"))!.dia).toBe("2027-01-19");
  });

  test("no recesso não há expediente: recua para antes do dia 20 de dezembro", () => {
    const r = prazoInterno(pedido("2027-01-07", 1, "2026-12-01"))!;
    expect(r.dia).toBe("2026-12-18");
    expect(r.regra).toContain("Recesso forense");
  });

  test("zero de antecedência é escritório sem prazo interno", () => {
    expect(prazoInterno(pedido("2026-11-12", 0))).toBeNull();
  });

  test("o fatal já passou: o interno não tem mais o que dizer", () => {
    expect(prazoInterno(pedido("2026-10-30", 2))).toBeNull();
  });
});

describe("prazo curto: o interno nunca fica antes de hoje sem dizer", () => {
  test("não cabem os dias de antecedência: marca que passou e diz com todas as letras", () => {
    // Fatal 03/11, três dias úteis: 30/10 (Finados e o fim de semana ficam fora), 29/10 e 28/10. Hoje é 30/10.
    const r = prazoInterno(pedido("2026-11-03", 3, "2026-10-30"))!;
    expect(r.dia).toBe("2026-10-28");
    expect(r.passou).toBe(true);
    expect(r.aviso).toBe("Já passou: o interno era 28/10/2026. Não cabem mais 3 dias úteis antes do fatal de 03/11/2026.");
  });

  test("com um dia só, a frase fica no singular", () => {
    expect(prazoInterno(pedido("2026-11-03", 1, "2026-11-03"))!.aviso).toBe("Já passou: o interno era 30/10/2026. Não cabe mais 1 dia útil antes do fatal de 03/11/2026.");
  });

  test("hoje é o dia do interno: ainda não passou", () => {
    const r = prazoInterno(pedido("2026-11-12", 3, "2026-11-09"))!;
    expect(r.dia).toBe("2026-11-09");
    expect(r.passou).toBe(false);
    expect(r.aviso).toBeNull();
  });
});

describe("em qualquer dia e tribunal", () => {
  test("sempre antes do fatal, em dia com expediente completo, e com os dias de antecedência contados", () => {
    for (const tribunal of ["TJSC", "TRT12", "TRF4", "TJSP", "TJRJ", "TJMG", "TJPR"]) {
      const cal = calendarioPara({ tribunal });
      for (let i = 0; i < 400; i++) {
        const fatal = somarDias("2026-01-15", i);
        for (const antecedencia of [1, 2, 5, 15]) {
          const r = prazoInterno(pedido(fatal, antecedencia, "2026-01-01", cal))!;
          expect(r.dia < fatal).toBe(true);
          expect(fimDeSemana(r.dia)).toBe(false);
          expect(temExpediente(r.dia, cal)).toBe(true);
          expect(cal.reduzido(r.dia)).toBeNull();
          let dias = 0;
          for (let d = r.dia; d < fatal; d = somarDias(d, 1)) if (temExpediente(d, cal) && !cal.reduzido(d)) dias++;
          expect(dias).toBe(antecedencia);
        }
      }
    }
  });
});
