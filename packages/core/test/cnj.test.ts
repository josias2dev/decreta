import { describe, expect, test } from "bun:test";
import {
  cnjValido,
  cnpjValido,
  lerPublicacaoColada,
  limparCnpj,
  limparDocumento,
  cpfValido,
  diaPorExtenso,
  diaPorExtensoCurto,
  dvCnj,
  formatarCnj,
  formatarDocumento,
  formatarTelefone,
  nomeDaAudiencia,
  nomeProprio,
  hojeEm,
  indiceDataJud,
  lerCnj,
  telefoneWhatsapp,
  tribunalDoCnj,
} from "../src/index.ts";

describe("número CNJ", () => {
  test("dígito verificador", () => {
    expect(dvCnj("5004321", "2026", "8", "24", "0038")).toBe("25");
    expect(cnjValido("5004321-25.2026.8.24.0038")).toBe(true);
    expect(cnjValido("50043212520268240038")).toBe(true);
    expect(cnjValido("5004321-18.2026.8.24.0038")).toBe(false);
    expect(cnjValido("123")).toBe(false);
  });

  test("lê e formata", () => {
    const n = lerCnj("50043212520268240038")!;
    expect(n.formatado).toBe("5004321-25.2026.8.24.0038");
    expect(n.ano).toBe("2026");
    expect(n.origem).toBe("0038");
    expect(formatarCnj(" 00008124420265120005 ")).toBe("0000812-44.2026.5.12.0005");
  });

  test("tribunal e índice do DataJud", () => {
    expect(tribunalDoCnj("5004321-25.2026.8.24.0038")).toBe("TJSC");
    expect(tribunalDoCnj("0000812-44.2026.5.12.0005")).toBe("TRT12");
    expect(tribunalDoCnj("5000000-00.2026.4.04.7200")).toBe("TRF4");
    expect(tribunalDoCnj("0700000-00.2026.8.07.0001")).toBe("TJDFT");
    expect(indiceDataJud("5004321-25.2026.8.24.0038")).toBe("api_publica_tjsc");
    expect(indiceDataJud("0000812-44.2026.5.12.0005")).toBe("api_publica_trt12");
  });
});

describe("documentos e telefone", () => {
  test("CPF e CNPJ", () => {
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("111.111.111-11")).toBe(false);
    expect(cnpjValido("11.222.333/0001-81")).toBe(true);
    expect(cnpjValido("11.222.333/0001-80")).toBe(false);
    expect(formatarDocumento("52998224725")).toBe("529.982.247-25");
    expect(formatarDocumento("11222333000181")).toBe("11.222.333/0001-81");
  });

  test("CNPJ com letras, emitido desde julho de 2026", () => {
    // O exemplo da própria Receita.
    expect(cnpjValido("12.ABC.345/01DE-35")).toBe(true);
    expect(cnpjValido("12abc34501de35")).toBe(true);
    expect(cnpjValido("12.ABC.345/01DE-36")).toBe(false);
    expect(cnpjValido("12.ABC.345/01DE-3A")).toBe(false);
    expect(limparCnpj("12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(limparDocumento("pj", "12.abc.345/01de-35")).toBe("12ABC34501DE35");
    expect(limparDocumento("pf", "529.982.247-25")).toBe("52998224725");
    expect(formatarDocumento("12abc34501de35")).toBe("12.ABC.345/01DE-35");
  });

  test("WhatsApp", () => {
    expect(telefoneWhatsapp("(47) 99123-4567")).toBe("5547991234567");
    expect(telefoneWhatsapp("+55 47 99123-4567")).toBe("5547991234567");
    expect(telefoneWhatsapp("1234")).toBeNull();
    expect(formatarTelefone("5547991234567")).toBe("(47) 99123-4567");
  });

  test("nomes em caixa alta do tribunal", () => {
    expect(nomeProprio("SEGURADORA ALFA S.A.")).toBe("Seguradora Alfa S.A.");
    expect(nomeProprio("PADARIA BOM GRÃO LTDA")).toBe("Padaria Bom Grão Ltda");
    expect(nomeProprio("2ª VARA CÍVEL DA COMARCA DE JOINVILLE")).toBe("2ª Vara Cível da Comarca de Joinville");
    expect(nomeProprio("Banco Horizonte S.A.")).toBe("Banco Horizonte S.A.");
    expect(nomeDaAudiencia("Conciliação")).toBe("Audiência de conciliação");
    expect(nomeDaAudiencia("Inicial")).toBe("Audiência inicial");
    expect(nomeDaAudiencia("Una")).toBe("Audiência una");
    expect(nomeDaAudiencia("Audiência de instrução e julgamento")).toBe("Audiência de instrução e julgamento");
  });
});

describe("datas", () => {
  test("hoje no fuso do escritório", () => {
    // 01:30 UTC do dia 30 ainda é dia 29 em São Paulo.
    expect(hojeEm("America/Sao_Paulo", new Date("2026-10-30T01:30:00Z"))).toBe("2026-10-29");
  });
  test("por extenso", () => {
    expect(diaPorExtenso("2026-10-29")).toBe("quinta, 29 de outubro");
    expect(diaPorExtensoCurto("2026-10-28", "2026-10-29")).toBe("28 out");
    expect(diaPorExtensoCurto("2025-12-01", "2026-10-29")).toBe("1 dez 2025");
  });
});

describe("fuso", () => {
  test("instante local e hora", async () => {
    const { instanteLocal, horaLocal } = await import("../src/index.ts");
    expect(instanteLocal("2026-10-29", "14:30").toISOString()).toBe("2026-10-29T17:30:00.000Z");
    expect(horaLocal("2026-10-29T17:30:00.000Z")).toBe("14:30");
  });
});

describe("publicação colada", () => {
  test("número, data e tipo do e-mail do tribunal", () => {
    const texto = `Tipo de comunicação: Intimação
Processo 5004321-25.2026.8.24.0038/SC
Órgão: 2ª Vara Cível da Comarca de Joinville
Data de disponibilização: 28/10/2026
Fica a parte autora intimada para se manifestar sobre o laudo pericial no prazo de 15 dias.`;
    expect(lerPublicacaoColada(texto)).toEqual({ cnj: "5004321-25.2026.8.24.0038", disponibilizadaEm: "2026-10-28", tipoComunicacao: "Intimação" });
  });

  test("sem rótulos: o título, o número sem máscara e o que não dá para saber", () => {
    expect(lerPublicacaoColada("EDITAL DE CITAÇÃO\nAutos 50043212520268240038. Disponibilizado no DJEN em 2026-10-27.")).toEqual({ cnj: "5004321-25.2026.8.24.0038", disponibilizadaEm: "2026-10-27", tipoComunicacao: "Edital" });
    // Dígito verificador errado não vale; data impossível também não.
    expect(lerPublicacaoColada("Processo 5004321-26.2026.8.24.0038, disponibilização 31/02/2026. Intime-se.")).toEqual({ cnj: null, disponibilizadaEm: null, tipoComunicacao: null });
  });
});
