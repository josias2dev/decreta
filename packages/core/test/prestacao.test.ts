/** O texto da prestação de contas do alvará: o que o cliente lê, com cada conta à vista. */
import { describe, expect, test } from "bun:test";
import { textoDaPrestacaoDeContas, type DadosDaPrestacao } from "../src/prestacao.ts";

const base: DadosDaPrestacao = {
  escritorio: "Souza & Freitas Advocacia",
  cliente: { nome: "Ana Lúcia Ferraz", tipo: "pf", documento: "52998224725" },
  processo: { titulo: "Ana Lúcia Ferraz × Rodrigo Alves", cnj: "5004321-25.2026.8.24.0038", onde: "2ª Vara Cível de Joinville" },
  alvara: { descricao: "Depósito judicial do réu", expedidoEm: "2026-10-15", sacadoEm: "2026-10-19" },
  conta: { valorAlvara: 418_000, valorRecebido: 418_000, exitoBp: 2_500, honorario: 104_500, cliente: 313_500, semContrato: false, retidoNoSaque: false },
  contratoTitulo: "Honorários · Ana Lúcia Ferraz",
  repasses: [],
  responsavel: { nome: "Beatriz Souza", oab: "OAB/SC 41.233" },
  emitidaEm: "2026-11-02",
};

describe("prestação de contas do alvará", () => {
  test("mostra o valor, a parte do escritório e a do cliente, cada uma com a conta feita", () => {
    const t = textoDaPrestacaoDeContas(base);
    expect(t).toContain("# Prestação de contas");
    expect(t).toContain("**Cliente:** Ana Lúcia Ferraz, CPF 529.982.247-25.");
    expect(t).toContain("5004321-25.2026.8.24.0038");
    expect(t).toContain("2ª Vara Cível de Joinville");
    expect(t).toContain("expedido em 15/10/2026 e sacado em 19/10/2026");
    expect(t).toContain("Valor do alvará: R$ 4.180,00.");
    expect(t).toContain("Valor que caiu na conta: R$ 4.180,00.");
    expect(t).toContain("Honorários do escritório (25% de R$ 4.180,00): R$ 1.045,00.");
    expect(t).toContain("Parte do cliente: R$ 3.135,00.");
    expect(t).not.toContain("Diferença");
  });

  test("valor recebido diferente do alvará: a diferença aparece, e a conta usa o que caiu", () => {
    const t = textoDaPrestacaoDeContas({ ...base, conta: { ...base.conta, valorRecebido: 415_050, honorario: 103_763, cliente: 311_287 } });
    expect(t).toContain("Valor do alvará: R$ 4.180,00.");
    expect(t).toContain("Valor que caiu na conta: R$ 4.150,50.");
    expect(t).toContain("Diferença em relação ao alvará: -R$ 29,50.");
    expect(t).toContain("Honorários do escritório (25% de R$ 4.150,50): R$ 1.037,63.");
  });

  test("alvará sem contrato: nenhum honorário, e o texto diz isso com clareza", () => {
    const t = textoDaPrestacaoDeContas({ ...base, contratoTitulo: null, conta: { ...base.conta, exitoBp: null, honorario: 0, cliente: 418_000, semContrato: true } });
    expect(t).toContain("Não há contrato de honorários de êxito ligado a este alvará: nenhum honorário foi descontado, e o valor recebido é todo do cliente.");
    expect(t).toContain("Parte do cliente: R$ 4.180,00.");
    expect(t).not.toContain("Honorários do escritório");
  });

  test("honorário retido no saque ou a cobrar", () => {
    expect(textoDaPrestacaoDeContas({ ...base, conta: { ...base.conta, retidoNoSaque: true } })).toContain("O escritório reteve o honorário no saque.");
    expect(textoDaPrestacaoDeContas(base)).toContain("O honorário será cobrado conforme o contrato.");
  });

  test("repasses de mais de um favorecido, com data, conta e valor, e o que falta repassar", () => {
    const t = textoDaPrestacaoDeContas({
      ...base,
      repasses: [
        { favorecido: "Ana Lúcia Ferraz", conta: "Banco do Brasil, ag. 1234-5, c/c 67890-1", valor: 200_000, repassadoEm: "2026-10-20" },
        { favorecido: "Pedro Ferraz (filho)", conta: "Pix 47999112233", valor: 100_000, repassadoEm: "2026-10-21" },
      ],
    });
    expect(t).toContain("- 20/10/2026 · Ana Lúcia Ferraz · Banco do Brasil, ag. 1234-5, c/c 67890-1 · R$ 2.000,00");
    expect(t).toContain("- 21/10/2026 · Pedro Ferraz (filho) · Pix 47999112233 · R$ 1.000,00");
    expect(t).toContain("Total repassado: R$ 3.000,00.");
    expect(t).toContain("Falta repassar: R$ 135,00.");
  });

  test("repasse completo, e nenhum repasse ainda", () => {
    const completo = textoDaPrestacaoDeContas({ ...base, repasses: [{ favorecido: "Ana Lúcia Ferraz", conta: "Pix 47999112233", valor: 313_500, repassadoEm: "2026-10-20" }] });
    expect(completo).toContain("Total repassado: R$ 3.135,00.");
    expect(completo).toContain("Todo o valor do cliente foi repassado.");
    expect(textoDaPrestacaoDeContas(base)).toContain("Nenhum repasse foi registrado até a data desta prestação de contas.");
  });

  test("termina com a data e a assinatura do advogado responsável", () => {
    const t = textoDaPrestacaoDeContas(base);
    expect(t).toContain("Emitida em 02/11/2026.");
    expect(t.trimEnd().endsWith("Beatriz Souza, OAB/SC 41.233")).toBe(true);
  });

  test("cliente sem CPF cadastrado e advogado sem OAB não deixam buracos no texto", () => {
    const t = textoDaPrestacaoDeContas({ ...base, cliente: { nome: "Hotel Mar Azul Ltda.", tipo: "pj", documento: null }, responsavel: { nome: "Rafael Freitas", oab: null } });
    expect(t).toContain("**Cliente:** Hotel Mar Azul Ltda.");
    expect(t).not.toContain("CNPJ null");
    expect(t.trimEnd().endsWith("Rafael Freitas")).toBe(true);
  });

  test("não tem campo para completar: o documento sai pronto", () => {
    expect(textoDaPrestacaoDeContas(base)).not.toMatch(/\[COMPLETAR/);
  });
});
