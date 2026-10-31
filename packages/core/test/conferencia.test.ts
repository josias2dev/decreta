import { describe, expect, test } from "bun:test";
import { chaveDoAto, conferirSugestao, regraDaContagem, ritoDoProcesso } from "../src/index.ts";

describe("regra aplicada", () => {
  test("Justiça do Trabalho conta pela CLT", () => {
    expect(ritoDoProcesso({ tribunal: "TRT12", classe: "Ação Trabalhista - Rito Ordinário" })).toBe("clt");
    expect(ritoDoProcesso({ tribunal: "TST", classe: null })).toBe("clt");
  });

  test("Juizado Especial conta pela Lei 9.099, pela classe ou pelo órgão", () => {
    expect(ritoDoProcesso({ tribunal: "TJSC", classe: "Procedimento do Juizado Especial Cível" })).toBe("jec");
    expect(ritoDoProcesso({ tribunal: "TJSC", classe: null, orgao: "2º Juizado Especial Cível da Comarca de Joinville" })).toBe("jec");
  });

  test("o resto é CPC", () => {
    expect(ritoDoProcesso({ tribunal: "TJSC", classe: "Procedimento Comum Cível", orgao: "2ª Vara Cível" })).toBe("cpc");
    expect(ritoDoProcesso({ tribunal: null })).toBe("cpc");
  });

  test("o texto da regra, com o artigo", () => {
    expect(regraDaContagem("cpc", "uteis")).toBe("Dias úteis (CPC, art. 219)");
    expect(regraDaContagem("clt", "uteis")).toBe("Dias úteis (CLT, art. 775)");
    expect(regraDaContagem("jec", "uteis")).toBe("Dias úteis (Lei 9.099/1995, art. 12-A)");
    expect(regraDaContagem("cpc", "corridos")).toBe("Dias corridos");
  });
});

describe("segunda conferência da sugestão", () => {
  test("os dias batem com a lei: confiança alta", () => {
    expect(conferirSugestao({ tipo: "Apelação", dias: 15, contagem: "uteis", rito: "cpc" })).toEqual({
      confianca: "alta",
      motivos: ["Bate com a lei: 15 dias (CPC, art. 1.003, § 5º)."],
    });
    expect(conferirSugestao({ tipo: "Embargos de declaração", dias: 5, contagem: "uteis", rito: "clt" }).confianca).toBe("alta");
    expect(conferirSugestao({ tipo: "Recurso inominado", dias: 10, contagem: "uteis", rito: "jec" }).confianca).toBe("alta");
    expect(conferirSugestao({ tipo: "Recurso ordinário", dias: 8, contagem: "uteis", rito: "clt" }).confianca).toBe("alta");
    expect(conferirSugestao({ tipo: "Manifestação sobre laudo pericial", dias: 15, contagem: "uteis", rito: "cpc" }).confianca).toBe("alta");
  });

  test("os dias não batem: confiança baixa, dizendo o que a lei dá", () => {
    expect(conferirSugestao({ tipo: "Apelação", dias: 10, contagem: "uteis", rito: "cpc" })).toEqual({
      confianca: "baixa",
      motivos: ["Para apelação, a lei dá 15 dias (CPC, art. 1.003, § 5º); a sugestão diz 10."],
    });
  });

  test("contrarrazões e réplica não se confundem com apelação e contestação", () => {
    expect(conferirSugestao({ tipo: "Contrarrazões de apelação", dias: 8, contagem: "uteis", rito: "clt" }).confianca).toBe("alta");
    expect(conferirSugestao({ tipo: "Impugnação à contestação", dias: 15, contagem: "uteis", rito: "cpc" }).motivos).toEqual(["Bate com a lei: 15 dias (CPC, arts. 350 e 351)."]);
  });

  test("ato sem prazo fixo em lei: confiança média", () => {
    expect(conferirSugestao({ tipo: "Manifestação sobre documentos", dias: 5, contagem: "uteis", rito: "cpc" })).toEqual({
      confianca: "media",
      motivos: ["Sem prazo fixo em lei para conferir: os dias vêm da publicação."],
    });
    // Contestação na CLT é na audiência: não há quantidade de dias para conferir.
    expect(conferirSugestao({ tipo: "Contestação", dias: 15, contagem: "uteis", rito: "clt" }).confianca).toBe("media");
  });

  test("prazo processual em dias corridos é alerta", () => {
    expect(conferirSugestao({ tipo: "Manifestação sobre documentos", dias: 5, contagem: "corridos", rito: "cpc" })).toEqual({
      confianca: "baixa",
      motivos: ["Prazo processual conta em dias úteis (CPC, art. 219); a sugestão conta em dias corridos."],
    });
  });

  test("o ato não combina com o documento publicado", () => {
    expect(conferirSugestao({ tipo: "Apelação", dias: 15, contagem: "uteis", rito: "cpc", documento: "Despacho" }).motivos).toEqual([
      "Despacho não tem recurso (CPC, art. 1.001); a sugestão é de apelação.",
    ]);
    expect(conferirSugestao({ tipo: "Contestação", dias: 15, contagem: "uteis", rito: "cpc", documento: "Sentença" })).toEqual({
      confianca: "baixa",
      motivos: ["Contestação depois de sentença não combina; confira o ato."],
    });
  });

  test("o que a equipe sempre descarta perde a confiança", () => {
    expect(conferirSugestao({ tipo: "Manifestação sobre documentos", dias: 5, contagem: "uteis", rito: "cpc", historico: { descartadas: 3, confirmadas: 0 } })).toEqual({
      confianca: "baixa",
      motivos: ["A equipe descartou 3 sugestões de manifestação sobre documentos e não confirmou nenhuma."],
    });
    // Se a equipe também confirma, segue a conferência normal.
    expect(conferirSugestao({ tipo: "Apelação", dias: 15, contagem: "uteis", rito: "cpc", historico: { descartadas: 3, confirmadas: 2 } }).confianca).toBe("alta");
  });

  test("a chave do ato agrupa grafias diferentes do mesmo ato", () => {
    expect(chaveDoAto("Apelação")).toBe(chaveDoAto("Interpor apelação"));
    expect(chaveDoAto("  Manifestação sobre  Documentos ")).toBe(chaveDoAto("manifestacao sobre documentos"));
  });
});
