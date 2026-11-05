/** As contas da licença: o preço com pessoas a mais, valor combinado e desconto, os limites a 80%, o que o plano deixa de fora, os cupons e os ajustes. */
import { describe, expect, test } from "bun:test";
import {
  descontoDoAnual,
  descontoDoCupom,
  estadoDoLimite,
  fimDoDesconto,
  funcionalidadeDaRota,
  funcionalidadeLiberada,
  montarLicenca,
  normalizarCodigoDoCupom,
  precoDoEscritorio,
  recusaDoAjuste,
  recusaDoCupom,
} from "../src/index.ts";

const PLANO = { mensalCentavos: 24_900, pessoaExtraCentavos: 4_900 };
const SEM = { pessoasExtras: 0, valorCombinadoCentavos: null, desconto: null };
const CONSUMO = { pessoas: 4, processos: 0, oabs: 0, iaMesUsd: 0, arquivosBytes: 0, whatsappHoje: 0 };

describe("o preço do escritório", () => {
  test("o plano mais as pessoas a mais; sem preço no plano, nada a cobrar", () => {
    expect(precoDoEscritorio(PLANO, { ...SEM, pessoasExtras: 2 }, "2026-11-05")).toMatchObject({ cheioCentavos: 34_700, mensalidadeCentavos: 34_700, combinado: false });
    expect(precoDoEscritorio({ mensalCentavos: null, pessoaExtraCentavos: 4_900 }, { ...SEM, pessoasExtras: 2 }, "2026-11-05")).toMatchObject({ cheioCentavos: null, mensalidadeCentavos: null });
  });

  test("o valor combinado toma o lugar do preço, mesmo num plano sem preço", () => {
    expect(precoDoEscritorio({ mensalCentavos: null, pessoaExtraCentavos: null }, { ...SEM, valorCombinadoCentavos: 15_000 }, "2026-11-05")).toMatchObject({ cheioCentavos: 15_000, combinado: true, mensalidadeCentavos: 15_000 });
  });

  test("o desconto vale até o último dia, e o de valor nunca deixa a mensalidade negativa", () => {
    const desconto = { tipo: "percentual" as const, valor: 20, ate: "2027-02-04", cupom: null };
    expect(precoDoEscritorio(PLANO, { ...SEM, desconto }, "2027-02-04")).toMatchObject({ descontoCentavos: 4_980, mensalidadeCentavos: 19_920, descontoAte: "2027-02-04" });
    expect(precoDoEscritorio(PLANO, { ...SEM, desconto }, "2027-02-05")).toMatchObject({ descontoCentavos: 0, mensalidadeCentavos: 24_900, descontoAte: null });
    expect(precoDoEscritorio(PLANO, { ...SEM, desconto: { tipo: "valor", valor: 99_999, ate: "2027-02-04", cupom: null } }, "2026-11-05").mensalidadeCentavos).toBe(0);
  });

  test("N mensalidades de desconto terminam na véspera do mesmo dia, N meses depois", () => {
    expect(fimDoDesconto("2026-11-05", 3)).toBe("2027-02-04");
    // Fevereiro não tem 31: o mês seguinte a 31/01 é 28/02, e o desconto acaba na véspera.
    expect(fimDoDesconto("2026-01-31", 1)).toBe("2026-02-27");
  });

  test("quanto o anual economiza sobre doze mensalidades", () => {
    expect(descontoDoAnual({ mensalCentavos: 10_000, anualCentavos: 100_000 })).toBeCloseTo(1 / 6);
    expect(descontoDoAnual({ mensalCentavos: 10_000, anualCentavos: null })).toBeNull();
  });
});

describe("os limites do plano", () => {
  test("avisa a partir de 80% e marca quando passa; sem limite, está sempre bem", () => {
    expect(estadoDoLimite(79, 100)).toBe("ok");
    expect(estadoDoLimite(80, 100)).toBe("perto");
    expect(estadoDoLimite(100, 100)).toBe("perto");
    expect(estadoDoLimite(101, 100)).toBe("passou");
    expect(estadoDoLimite(10_000, null)).toBe("ok");
  });

  test("as pessoas contam as incluídas mais as a mais, e o pior limite decide o estado", () => {
    const l = montarLicenca({ plano: { pessoasIncluidas: 3, limites: { processos: 100 } }, pessoasExtras: 1, tetos: null, consumo: { ...CONSUMO, processos: 120 } });
    expect(l.itens.find((i) => i.chave === "pessoas")).toMatchObject({ usado: 4, limite: 4, estado: "ok" });
    expect(l.itens.find((i) => i.chave === "processos")).toMatchObject({ estado: "passou" });
    expect(l).toMatchObject({ estado: "passou", alertas: 1 });
  });

  test("as vagas todas ocupadas são o normal; só avisa quem passou delas", () => {
    const vaga = (pessoas: number) => montarLicenca({ plano: { pessoasIncluidas: 5, limites: {} }, pessoasExtras: 0, tetos: null, consumo: { ...CONSUMO, pessoas } }).itens.find((i) => i.chave === "pessoas")!.estado;
    expect([vaga(4), vaga(5), vaga(6)]).toEqual(["ok", "ok", "passou"]);
  });

  test("o teto de IA do mês do escritório vale no lugar do plano", () => {
    const l = montarLicenca({ plano: { pessoasIncluidas: null, limites: { iaMesUsd: 10 } }, pessoasExtras: 0, tetos: { mesUsd: 50 }, consumo: { ...CONSUMO, iaMesUsd: 12 } });
    expect(l.itens.find((i) => i.chave === "iaMesUsd")).toMatchObject({ limite: 50, estado: "ok" });
  });
});

describe("o que o plano deixa de fora", () => {
  test("só para o que grava; ler continua", () => {
    expect(funcionalidadeDaRota("POST", "/pecas")).toBe("pecas");
    expect(funcionalidadeDaRota("PUT", "/pecas/abc")).toBe("pecas");
    expect(funcionalidadeDaRota("GET", "/pecas/abc/docx")).toBeNull();
    expect(funcionalidadeDaRota("POST", "/financeiro/contratos")).toBe("financeiro");
    expect(funcionalidadeDaRota("POST", "/financeiro/alvaras/1/prestacao")).toBe("financeiro");
    expect(funcionalidadeDaRota("POST", "/documentos/1/assinatura")).toBe("assinatura");
    expect(funcionalidadeDaRota("POST", "/assinaturas/1/atualizar")).toBe("assinatura");
    expect(funcionalidadeDaRota("POST", "/documentos/1")).toBeNull();
    expect(funcionalidadeDaRota("POST", "/pecasx")).toBeNull();
  });

  test("ausente é incluída; só `false` deixa de fora", () => {
    expect(funcionalidadeLiberada({ funcionalidades: {} }, "pecas")).toBe(true);
    expect(funcionalidadeLiberada({ funcionalidades: { pecas: false } }, "pecas")).toBe(false);
  });
});

describe("os cupons", () => {
  const CUPOM = { codigo: "OAB-SC", tipo: "percentual" as const, valor: 15, meses: 6, validoAte: "2026-12-31", limiteDeUsos: 2, usos: 1, desativadoEm: null };

  test("o código perde acento e espaço e vira maiúsculo", () => {
    expect(normalizarCodigoDoCupom(" indicação  2026 ")).toBe("INDICACAO2026");
  });

  test("vale até o último dia e até o último uso; desativado, nunca", () => {
    expect(recusaDoCupom(CUPOM, "2026-12-31")).toBeNull();
    expect(recusaDoCupom(CUPOM, "2027-01-01")).toContain("venceu");
    expect(recusaDoCupom({ ...CUPOM, usos: 2 }, "2026-11-05")).toContain("número de vezes");
    expect(recusaDoCupom({ ...CUPOM, desativadoEm: "2026-11-01T00:00:00Z" }, "2026-11-05")).toContain("desativado");
    expect(descontoDoCupom(CUPOM, "2026-11-05")).toEqual({ tipo: "percentual", valor: 15, ate: "2027-05-04", cupom: "OAB-SC" });
  });
});

describe("os ajustes do painel", () => {
  test("cada um com a sua faixa, e inteiro onde precisa", () => {
    expect(recusaDoAjuste("testeDias", 30)).toBeNull();
    expect(recusaDoAjuste("testeDias", 0)).toContain("de 1 a 90");
    expect(recusaDoAjuste("testeDias", 7.5)).toContain("inteiro");
    expect(recusaDoAjuste("cotacaoUsd", 5.42)).toBeNull();
    expect(recusaDoAjuste("ia.tetoSiteUsd", Number.NaN)).toBe("Valor inválido.");
    expect(recusaDoAjuste("inventado", 1)).toBe("Ajuste desconhecido.");
  });
});
