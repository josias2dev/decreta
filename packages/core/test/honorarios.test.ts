/**
 * Os cálculos dos honorários, com as contas feitas à mão. Dinheiro é sempre
 * centavos inteiros: nenhum teste aqui depende de número de ponto flutuante.
 */
import { describe, expect, test } from "bun:test";
import {
  calcularAlvara,
  calcularExito,
  centavosDoTexto,
  conferirRepasses,
  dividirEmParcelas,
  formatarCentavos,
  paraBasePontos,
  resumirFinanceiro,
  situacaoDaParcela,
  textoDoCentavo,
  vencimentoDaCobranca,
  vencimentosMensais,
  type ParcelaParaResumo,
} from "../src/honorarios.ts";

describe("dinheiro em centavos", () => {
  test("lê o valor como a pessoa digita, sem passar por número de ponto flutuante", () => {
    expect(centavosDoTexto("1.234,56")).toBe(123_456);
    expect(centavosDoTexto("1234,5")).toBe(123_450);
    expect(centavosDoTexto("1234.56")).toBe(123_456);
    expect(centavosDoTexto("R$ 0,05")).toBe(5);
    expect(centavosDoTexto("10")).toBe(1_000);
    expect(centavosDoTexto("0,29")).toBe(29);
    expect(centavosDoTexto("19,99")).toBe(1_999);
  });

  test("recusa o que não é dinheiro", () => {
    for (const t of ["", "abc", "1,234,56", "12,345", "-5", "1.2.3", "10,5,5"]) expect(centavosDoTexto(t)).toBeNull();
  });

  test("escreve os centavos na ponta da língua: 123456 vira R$ 1.234,56", () => {
    expect(formatarCentavos(123_456)).toBe("R$ 1.234,56");
    expect(formatarCentavos(5)).toBe("R$ 0,05");
    expect(formatarCentavos(0)).toBe("R$ 0,00");
    expect(formatarCentavos(100_000_000)).toBe("R$ 1.000.000,00");
    expect(formatarCentavos(-2_500)).toBe("-R$ 25,00");
  });

  test("o texto com ponto decimal é o que a API troca com o banco", () => {
    expect(textoDoCentavo(123_456)).toBe("1234.56");
    expect(textoDoCentavo(7)).toBe("0.07");
  });
});

describe("percentual de êxito em pontos-base", () => {
  test("30% são 3000 e 12,5% são 1250", () => {
    expect(paraBasePontos("30")).toBe(3_000);
    expect(paraBasePontos("12,5")).toBe(1_250);
    expect(paraBasePontos("12.25%")).toBe(1_225);
    expect(paraBasePontos("100")).toBe(10_000);
  });

  test("zero, mais de 100% e texto torto são recusados", () => {
    for (const t of ["0", "100,01", "101", "-1", "abc", "", "10,555"]) expect(paraBasePontos(t)).toBeNull();
  });
});

describe("honorário de êxito sobre o que caiu na conta", () => {
  test("R$ 10.000,00 a 30% dá R$ 3.000,00 e R$ 7.000,00 para o cliente", () => {
    expect(calcularExito(1_000_000, 3_000)).toEqual({ honorario: 300_000, cliente: 700_000 });
  });

  test("arredonda para o centavo mais perto, e a metade sobe: R$ 0,05 a 50% são R$ 0,03 para o escritório e R$ 0,02 para o cliente", () => {
    expect(calcularExito(5, 5_000)).toEqual({ honorario: 3, cliente: 2 });
  });

  test("R$ 10.000,01 a 30% é R$ 3.000,003 e fica em R$ 3.000,00; o cliente leva o centavo que sobra", () => {
    expect(calcularExito(1_000_001, 3_000)).toEqual({ honorario: 300_000, cliente: 700_001 });
  });

  test("R$ 333,33 a 33,33% é R$ 111,0959 e fica em R$ 111,10", () => {
    expect(calcularExito(33_333, 3_333)).toEqual({ honorario: 11_110, cliente: 22_223 });
  });

  test("R$ 1,01 a 25% é 25,25 centavos e fica em R$ 0,25", () => {
    expect(calcularExito(101, 2_500)).toEqual({ honorario: 25, cliente: 76 });
  });

  test("a soma das duas partes é sempre o valor recebido, em qualquer percentual", () => {
    for (const base of [1, 7, 99, 101, 12_345, 987_654_321]) {
      for (const bp of [1, 333, 1_250, 2_000, 3_333, 5_000, 9_999, 10_000]) {
        const r = calcularExito(base, bp);
        expect(r.honorario + r.cliente).toBe(base);
        expect(r.honorario).toBeGreaterThanOrEqual(0);
        expect(r.cliente).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test("valores grandes não estouram: R$ 90 milhões a 30%", () => {
    expect(calcularExito(9_000_000_000, 3_000)).toEqual({ honorario: 2_700_000_000, cliente: 6_300_000_000 });
  });

  test("sem percentual ou com percentual fora de 0 a 100%, não calcula", () => {
    expect(() => calcularExito(1_000, 0)).toThrow();
    expect(() => calcularExito(1_000, 10_001)).toThrow();
    expect(() => calcularExito(-1, 3_000)).toThrow();
    expect(() => calcularExito(1.5, 3_000)).toThrow();
  });
});

describe("parcelas", () => {
  test("R$ 1.000,00 em 3 vezes: os centavos que sobram vão para as primeiras, e a soma fecha", () => {
    expect(dividirEmParcelas(100_000, 3)).toEqual([33_334, 33_333, 33_333]);
    expect(dividirEmParcelas(100_000, 3).reduce((a, b) => a + b, 0)).toBe(100_000);
  });

  test("R$ 0,05 em 3 vezes: 2, 2 e 1 centavo", () => {
    expect(dividirEmParcelas(5, 3)).toEqual([2, 2, 1]);
  });

  test("divisão exata e uma parcela só", () => {
    expect(dividirEmParcelas(600_000, 4)).toEqual([150_000, 150_000, 150_000, 150_000]);
    expect(dividirEmParcelas(123_456, 1)).toEqual([123_456]);
  });

  test("não dá para dividir em zero parcelas nem um valor sem centavos para todas", () => {
    expect(() => dividirEmParcelas(100, 0)).toThrow();
    expect(() => dividirEmParcelas(2, 3)).toThrow();
  });

  test("mensalidades caem no mesmo dia de cada mês; dia 31 vira o último dia do mês curto", () => {
    expect(vencimentosMensais("2026-11-10", 4)).toEqual(["2026-11-10", "2026-12-10", "2027-01-10", "2027-02-10"]);
    expect(vencimentosMensais("2026-01-31", 4)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(vencimentosMensais("2027-12-30", 3)).toEqual(["2027-12-30", "2028-01-30", "2028-02-29"]);
  });
});

describe("situação da parcela", () => {
  const hoje = "2026-11-02";
  const base = { valor: 100_000, vencimento: "2026-11-10", pago: 0, cancelada: false };

  test("a vencer, vence hoje, em atraso", () => {
    expect(situacaoDaParcela(base, hoje)).toBe("a_vencer");
    expect(situacaoDaParcela({ ...base, vencimento: "2026-11-02" }, hoje)).toBe("a_vencer");
    expect(situacaoDaParcela({ ...base, vencimento: "2026-11-01" }, hoje)).toBe("em_atraso");
  });

  test("paga só quando os pagamentos marcados cobrem o valor", () => {
    expect(situacaoDaParcela({ ...base, pago: 100_000 }, hoje)).toBe("paga");
    expect(situacaoDaParcela({ ...base, pago: 100_001 }, hoje)).toBe("paga");
    expect(situacaoDaParcela({ ...base, pago: 99_999 }, hoje)).toBe("parcial");
    expect(situacaoDaParcela({ ...base, pago: 0, vencimento: "2026-10-01" }, hoje)).toBe("em_atraso");
  });

  test("parcial vencida segue em atraso pelo que falta", () => {
    expect(situacaoDaParcela({ ...base, pago: 40_000, vencimento: "2026-10-01" }, hoje)).toBe("em_atraso");
  });

  test("êxito sem valor ainda não é cobrança; cancelada fica de fora", () => {
    expect(situacaoDaParcela({ valor: null, vencimento: null, pago: 0, cancelada: false }, hoje)).toBe("sem_valor");
    expect(situacaoDaParcela({ ...base, cancelada: true }, hoje)).toBe("cancelada");
    expect(situacaoDaParcela({ ...base, vencimento: null }, hoje)).toBe("a_vencer");
  });

  test("pagamento marcado em parcela sem valor não a torna paga", () => {
    expect(situacaoDaParcela({ valor: null, vencimento: null, pago: 5_000, cancelada: false }, hoje)).toBe("sem_valor");
  });
});

describe("vencimento da cobrança", () => {
  const hoje = "2026-11-02";

  test("sugere o vencimento da parcela, nunca a data de hoje", () => {
    expect(vencimentoDaCobranca("2026-11-30", hoje)).toEqual({ sugerido: "2026-11-30", precisaEscolher: false, motivo: null });
    expect(vencimentoDaCobranca("2026-11-02", hoje)).toEqual({ sugerido: "2026-11-02", precisaEscolher: false, motivo: null });
  });

  test("parcela já vencida: não sugere nada, a pessoa escolhe a nova data", () => {
    const r = vencimentoDaCobranca("2026-10-10", hoje);
    expect(r.sugerido).toBeNull();
    expect(r.precisaEscolher).toBe(true);
    expect(r.motivo).toContain("10/10/2026");
  });

  test("parcela sem vencimento: a pessoa escolhe", () => {
    expect(vencimentoDaCobranca(null, hoje)).toMatchObject({ sugerido: null, precisaEscolher: true });
  });
});

describe("a conta do alvará", () => {
  test("alvará sacado com contrato de êxito de 30%: a conta sai do valor que caiu na conta", () => {
    const r = calcularAlvara({ valorAlvara: 1_000_000, valorRecebido: 1_000_000, exitoBp: 3_000 });
    expect(r).toMatchObject({ base: 1_000_000, baseEhRecebido: true, diferenca: 0, honorario: 300_000, cliente: 700_000, semContrato: false, falta: null });
  });

  test("valor recebido diferente do alvará: a base é o recebido, e a diferença aparece", () => {
    const r = calcularAlvara({ valorAlvara: 1_000_000, valorRecebido: 985_050, exitoBp: 2_000 });
    expect(r).toMatchObject({ base: 985_050, baseEhRecebido: true, diferenca: -14_950, honorario: 197_010, cliente: 788_040 });
    expect(r.honorario + r.cliente).toBe(985_050);
  });

  test("sem o valor recebido, não confirma: a conta usa o valor do alvará só como estimativa", () => {
    const r = calcularAlvara({ valorAlvara: 1_000_000, valorRecebido: null, exitoBp: 3_000 });
    expect(r).toMatchObject({ base: 1_000_000, baseEhRecebido: false, honorario: 300_000, cliente: 700_000, falta: "valor_recebido" });
  });

  test("alvará sem contrato: nenhum honorário, o valor todo é do cliente, e a conta diz que falta o contrato", () => {
    const r = calcularAlvara({ valorAlvara: 450_000, valorRecebido: 450_000, exitoBp: null });
    expect(r).toMatchObject({ base: 450_000, honorario: 0, cliente: 450_000, semContrato: true, falta: null });
  });

  test("contrato sem percentual de êxito conta como sem contrato de êxito", () => {
    expect(calcularAlvara({ valorAlvara: 450_000, valorRecebido: 450_000, exitoBp: 0 }).semContrato).toBe(true);
  });

  test("valor recebido zero ou negativo não é valor recebido", () => {
    expect(calcularAlvara({ valorAlvara: 450_000, valorRecebido: 0, exitoBp: 3_000 }).falta).toBe("valor_recebido");
  });
});

describe("repasses ao cliente e a quem ele indicar", () => {
  test("mais de um favorecido: a soma não passa da parte do cliente", () => {
    const r = conferirRepasses(700_000, [{ valor: 400_000 }, { valor: 200_000 }]);
    expect(r).toEqual({ repassado: 600_000, falta: 100_000, excede: 0, completo: false });
  });

  test("repassado até o último centavo fecha o repasse", () => {
    expect(conferirRepasses(700_000, [{ valor: 400_000 }, { valor: 300_000 }])).toEqual({ repassado: 700_000, falta: 0, excede: 0, completo: true });
  });

  test("passar de um centavo da parte do cliente é excesso", () => {
    expect(conferirRepasses(700_000, [{ valor: 700_001 }])).toEqual({ repassado: 700_001, falta: 0, excede: 1, completo: false });
  });

  test("sem repasse, falta tudo; parte do cliente zero não tem o que repassar", () => {
    expect(conferirRepasses(700_000, [])).toEqual({ repassado: 0, falta: 700_000, excede: 0, completo: false });
    expect(conferirRepasses(0, [])).toEqual({ repassado: 0, falta: 0, excede: 0, completo: true });
  });
});

describe("resumo do financeiro", () => {
  const hoje = "2026-11-02";
  const p = (o: Partial<ParcelaParaResumo> & { id: string }): ParcelaParaResumo => ({
    valor: 100_000,
    vencimento: "2026-11-10",
    pago: 0,
    cancelada: false,
    clienteId: "c1",
    processoId: "p1",
    ...o,
  });

  test("a receber é o que falta; recebido, só o que tem pagamento marcado; atraso, o que venceu sem pagar", () => {
    const r = resumirFinanceiro(
      [
        p({ id: "1", pago: 100_000, vencimento: "2026-10-10" }), // paga
        p({ id: "2", vencimento: "2026-10-20" }), // em atraso: 1.000
        p({ id: "3", valor: 200_000, pago: 50_000, vencimento: "2026-10-25" }), // em atraso: falta 1.500
        p({ id: "4", vencimento: "2026-11-15" }), // a vencer
        p({ id: "5", valor: null, vencimento: null }), // êxito sem valor: fora de tudo
        p({ id: "6", cancelada: true }), // cancelada: fora de tudo
      ],
      hoje,
    );
    expect(r.recebido).toBe(150_000);
    expect(r.emAtraso).toBe(100_000 + 150_000);
    expect(r.aReceber).toBe(100_000 + 150_000 + 100_000);
    expect(r.aVencer).toBe(100_000);
    expect(r.parcelasEmAtraso).toBe(2);
  });

  test("sem nenhum pagamento marcado, o recebido é zero", () => {
    const r = resumirFinanceiro([p({ id: "1" }), p({ id: "2", vencimento: "2026-09-01" })], hoje);
    expect(r.recebido).toBe(0);
    expect(r.emAtraso).toBe(100_000);
  });

  test("por mês de vencimento", () => {
    const r = resumirFinanceiro(
      [p({ id: "1", vencimento: "2026-11-10" }), p({ id: "2", vencimento: "2026-11-30", valor: 50_000 }), p({ id: "3", vencimento: "2026-12-05", valor: 70_000 })],
      hoje,
    );
    expect(r.porMes).toEqual([
      { mes: "2026-11", aReceber: 150_000, emAtraso: 0 },
      { mes: "2026-12", aReceber: 70_000, emAtraso: 0 },
    ]);
  });

  test("por cliente e por processo", () => {
    const r = resumirFinanceiro(
      [p({ id: "1", clienteId: "c1", processoId: "p1", vencimento: "2026-10-01" }), p({ id: "2", clienteId: "c2", processoId: null, valor: 30_000 }), p({ id: "3", clienteId: "c1", processoId: "p2", valor: 20_000 })],
      hoje,
    );
    expect(r.porCliente).toEqual([
      { id: "c1", aReceber: 120_000, emAtraso: 100_000, recebido: 0 },
      { id: "c2", aReceber: 30_000, emAtraso: 0, recebido: 0 },
    ]);
    expect(r.porProcesso).toEqual([
      { id: "p1", aReceber: 100_000, emAtraso: 100_000, recebido: 0 },
      { id: "p2", aReceber: 20_000, emAtraso: 0, recebido: 0 },
    ]);
  });
});
