import { describe, expect, test } from "bun:test";
import {
  avisoDaAssinatura,
  DIAS_ATE_BLOQUEIO,
  DIAS_ATE_SO_LEITURA,
  estadoDaAssinatura,
  fimDoPeriodoPago,
  janelaDoAvisoDoTeste,
  somarMeses,
  type FichaDaAssinatura,
} from "../src/assinatura.ts";
import { PLANO } from "../src/plano.ts";

const ficha = (f: Partial<FichaDaAssinatura> & Pick<FichaDaAssinatura, "situacao">): FichaDaAssinatura => ({ testeAte: null, inadimplenteDesde: null, acessoAte: null, ...f });

describe("o plano", () => {
  test("o valor ainda não foi decidido: com null a cobrança não abre", () => {
    expect(PLANO.valorMensalCentavos).toBeNull();
    expect(PLANO.testeDias).toBe(14);
    expect(PLANO.nome).toBe("Escritório");
  });
});

describe("somar meses e o fim do período pago", () => {
  test("mantém o dia do mês e, onde o mês não tem o dia, cai no último", () => {
    expect(somarMeses("2026-11-15", 1)).toBe("2026-12-15");
    expect(somarMeses("2026-12-15", 1)).toBe("2027-01-15");
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2028-01-31", 1)).toBe("2028-02-29");
  });

  test("a mensalidade paga com vencimento no dia 15 cobre até o dia 14 do mês seguinte", () => {
    expect(fimDoPeriodoPago("2026-11-15")).toBe("2026-12-14");
    expect(fimDoPeriodoPago("2026-01-31")).toBe("2026-02-27");
  });
});

describe("escritório antigo e cortesia nunca são travados", () => {
  test("cortesia tem acesso total em qualquer dia, mesmo com datas velhas na ficha", () => {
    const f = ficha({ situacao: "cortesia", testeAte: "2020-01-01", inadimplenteDesde: "2020-01-01" });
    for (const hoje of ["2026-11-02", "2030-01-01", "2020-06-01"]) {
      const e = estadoDaAssinatura(f, hoje);
      expect(e.situacao).toBe("cortesia");
      expect(e.acesso).toBe("total");
      expect(avisoDaAssinatura(e)).toBeNull();
    }
  });
});

describe("teste", () => {
  // Cadastro em 02/11 com 14 dias: o último dia do teste é 16/11.
  const f = ficha({ situacao: "teste", testeAte: "2026-11-16" });

  test("até o último dia o acesso é total, com os dias que faltam", () => {
    expect(estadoDaAssinatura(f, "2026-11-02")).toMatchObject({ situacao: "teste", acesso: "total", diasRestantesDoTeste: 14, viraSoLeituraEm: "2026-11-17" });
    expect(estadoDaAssinatura(f, "2026-11-16")).toMatchObject({ situacao: "teste", acesso: "total", diasRestantesDoTeste: 0 });
  });

  test("no dia seguinte ao último vira só leitura, e nada é apagado", () => {
    const e = estadoDaAssinatura(f, "2026-11-17");
    expect(e).toMatchObject({ situacao: "so_leitura", acesso: "leitura", motivo: "fim_do_teste", bloqueiaEm: null });
    expect(estadoDaAssinatura(f, "2027-03-01")).toMatchObject({ situacao: "so_leitura", acesso: "leitura", motivo: "fim_do_teste" });
  });

  test("teste sem data na ficha nunca trava", () => {
    expect(estadoDaAssinatura(ficha({ situacao: "teste" }), "2030-01-01").acesso).toBe("total");
  });

  test("os avisos do teste caem 3 dias e 1 dia antes do fim", () => {
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-12"))).toBeNull();
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-13"))).toBe("teste_3");
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-14"))).toBe("teste_3");
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-15"))).toBe("teste_1");
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-16"))).toBe("teste_1");
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-17"))).toBe("teste_acabou");
    expect(janelaDoAvisoDoTeste(estadoDaAssinatura(f, "2026-11-18"))).toBeNull();
  });

  test("o aviso do teste é discreto até faltarem 3 dias, depois chama atenção com a data, e depois do fim é grave", () => {
    const cedo = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-05"));
    expect(cedo?.nivel).toBe("info");
    const perto = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-13"));
    expect(perto?.nivel).toBe("atencao");
    expect(perto?.texto).toContain("16/11/2026");
    expect(perto?.texto).toContain("publicações");
    const fim = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-17"));
    expect(fim?.nivel).toBe("grave");
    expect(fim?.texto).toContain("só para leitura");
    expect(fim?.texto).toContain("publicações");
  });
});

describe("inadimplência", () => {
  // Fatura vencida em 10/11.
  const f = ficha({ situacao: "inadimplente", inadimplenteDesde: "2026-11-10" });

  test("régua: aviso nos primeiros dias, só leitura no 7º, bloqueio no 15º", () => {
    expect(DIAS_ATE_SO_LEITURA).toBe(7);
    expect(DIAS_ATE_BLOQUEIO).toBe(15);
    expect(estadoDaAssinatura(f, "2026-11-11")).toMatchObject({ situacao: "inadimplente", acesso: "total", diasDeAtraso: 1, viraSoLeituraEm: "2026-11-17", bloqueiaEm: "2026-11-25" });
    expect(estadoDaAssinatura(f, "2026-11-16")).toMatchObject({ situacao: "inadimplente", acesso: "total", diasDeAtraso: 6 });
    expect(estadoDaAssinatura(f, "2026-11-17")).toMatchObject({ situacao: "so_leitura", acesso: "leitura", motivo: "atraso", diasDeAtraso: 7, bloqueiaEm: "2026-11-25" });
    expect(estadoDaAssinatura(f, "2026-11-24")).toMatchObject({ situacao: "so_leitura", acesso: "leitura", diasDeAtraso: 14 });
    expect(estadoDaAssinatura(f, "2026-11-25")).toMatchObject({ situacao: "bloqueado", acesso: "bloqueado", motivo: "atraso", diasDeAtraso: 15 });
    expect(estadoDaAssinatura(f, "2027-02-01")).toMatchObject({ situacao: "bloqueado", acesso: "bloqueado" });
  });

  test("cada passo avisa com a data do próximo", () => {
    const a1 = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-11"));
    expect(a1?.nivel).toBe("atencao");
    expect(a1?.texto).toContain("17/11/2026");
    const a2 = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-17"));
    expect(a2?.nivel).toBe("grave");
    expect(a2?.texto).toContain("25/11/2026");
    expect(a2?.texto).toContain("publicações");
    const a3 = avisoDaAssinatura(estadoDaAssinatura(f, "2026-11-25"));
    expect(a3?.nivel).toBe("grave");
  });

  test("sem a data do atraso na ficha, nunca trava", () => {
    expect(estadoDaAssinatura(ficha({ situacao: "inadimplente" }), "2030-01-01").acesso).toBe("total");
  });
});

describe("cancelamento", () => {
  test("cancelou e pagou até 14/12: o acesso é total até esse dia, e depois só leitura", () => {
    const f = ficha({ situacao: "ativo", acessoAte: "2026-12-14" });
    const dentro = estadoDaAssinatura(f, "2026-12-14");
    expect(dentro).toMatchObject({ situacao: "ativo", acesso: "total", cancelamentoAgendado: true });
    expect(avisoDaAssinatura(dentro)?.texto).toContain("14/12/2026");
    expect(estadoDaAssinatura(f, "2026-12-15")).toMatchObject({ situacao: "cancelado", acesso: "leitura", motivo: "cancelada" });
  });

  test("assinatura ativa sem cancelamento fica em dia, sem aviso", () => {
    const e = estadoDaAssinatura(ficha({ situacao: "ativo" }), "2027-06-01");
    expect(e).toMatchObject({ situacao: "ativo", acesso: "total", cancelamentoAgendado: false });
    expect(avisoDaAssinatura(e)).toBeNull();
  });
});

describe("estados que só a equipe do Decreta põe", () => {
  test("só leitura e bloqueado manuais valem até alguém reativar", () => {
    expect(estadoDaAssinatura(ficha({ situacao: "so_leitura" }), "2026-11-02")).toMatchObject({ situacao: "so_leitura", acesso: "leitura", motivo: "manual" });
    expect(estadoDaAssinatura(ficha({ situacao: "bloqueado" }), "2026-11-02")).toMatchObject({ situacao: "bloqueado", acesso: "bloqueado", motivo: "manual" });
  });
});
