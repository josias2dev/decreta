import { describe, expect, test } from "bun:test";
import { avisoDoDiaSemExpediente, calendarioPara, proximoDiaUtil } from "../src/index.ts";

const tjsc = calendarioPara({ tribunal: "TJSC" });
const aviso = (dia: string, cal = tjsc) => avisoDoDiaSemExpediente(dia, cal);

describe("aviso de dia sem expediente na data digitada", () => {
  test("domingo que é feriado: o motivo e o próximo dia útil", () => {
    expect(aviso("2026-11-15")).toEqual({
      dia: "2026-11-15",
      aviso: "15/11/2026 é domingo e feriado (Proclamação da República). O próximo dia útil é 16/11/2026.",
      proximoDiaUtil: "2026-11-16",
    });
  });

  test("só fim de semana", () => {
    expect(aviso("2026-11-14")?.aviso).toBe("14/11/2026 é sábado. O próximo dia útil é 16/11/2026.");
  });

  test("feriado em dia de semana: 20/11 vai para a segunda", () => {
    expect(aviso("2026-11-20")?.aviso).toBe("20/11/2026 é feriado (Consciência Negra). O próximo dia útil é 23/11/2026.");
    expect(aviso("2026-11-02")?.aviso).toBe("02/11/2026 é feriado (Finados). O próximo dia útil é 03/11/2026.");
  });

  test("feriado do calendário do processo: o forense do tribunal e o local do escritório", () => {
    expect(aviso("2026-02-16")?.aviso).toBe("16/02/2026 é dia sem expediente forense (Carnaval). O próximo dia útil é 19/02/2026.");
    const joinville = calendarioPara({ tribunal: "TJSC", extras: [{ dia: "2026-11-10", nome: "Aniversário de Joinville", tipo: "local" }] });
    expect(aviso("2026-11-10", joinville)?.aviso).toBe("10/11/2026 é feriado local (Aniversário de Joinville). O próximo dia útil é 11/11/2026.");
    // O mesmo dia, sem o cadastro do escritório, é dia útil.
    expect(aviso("2026-11-10")).toBeNull();
  });

  test("o calendário é o do tribunal do processo: 11/08 fecha a Justiça Federal e não o TJSC", () => {
    expect(aviso("2026-08-11", calendarioPara({ tribunal: "TRF4" }))?.aviso).toBe("11/08/2026 é dia sem expediente forense (Dia do Advogado). O próximo dia útil é 12/08/2026.");
    expect(aviso("2026-08-11")).toBeNull();
  });

  test("recesso e Natal levam para 21/01, depois da suspensão de fim de ano", () => {
    expect(aviso("2026-12-21")?.aviso).toBe("21/12/2026 é recesso forense. O próximo dia útil é 21/01/2027.");
    expect(aviso("2026-12-25")?.aviso).toBe("25/12/2026 é feriado (Natal). O próximo dia útil é 21/01/2027.");
  });

  test("de 7 a 20 de janeiro há expediente, mas o prazo não corre", () => {
    expect(aviso("2027-01-08")?.aviso).toBe("08/01/2027 tem expediente, mas o prazo não corre: Suspensão dos prazos de fim de ano (CPC, art. 220). O próximo dia útil é 21/01/2027.");
  });

  test("expediente reduzido: o prazo não vence nesse dia (CPC, art. 224, § 1º)", () => {
    expect(aviso("2026-02-18")?.aviso).toBe(
      "18/02/2026 tem expediente reduzido: Quarta-feira de Cinzas (expediente a partir das 14h). O prazo não começa nem vence em dia assim (CPC, art. 224, § 1º). O próximo dia útil é 19/02/2026.",
    );
  });

  test("dia útil não tem aviso", () => {
    expect(aviso("2026-11-24")).toBeNull();
    expect(aviso("2026-11-23")).toBeNull();
  });

  test("o próximo dia útil pula o que o prazo não pode abrir ou fechar", () => {
    expect(proximoDiaUtil("2026-02-16", tjsc)).toBe("2026-02-19");
    expect(proximoDiaUtil("2026-11-19", tjsc)).toBe("2026-11-23");
  });
});
