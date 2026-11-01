import { describe, expect, test } from "bun:test";
import { documentoDaFonte, extrairFontes, MARCA_DA_FOLHA } from "../src/fontes.ts";

describe("fontes citadas pela IA", () => {
  test("acha evento e folha entre parênteses", () => {
    const f = extrairFontes("O laudo fala em 30% (evento 87, fl. 3). A ré impugnou (evento 89).");
    expect(f.map(({ evento, folha, documento }) => ({ evento, folha, documento }))).toEqual([
      { evento: 87, folha: 3, documento: null },
      { evento: 89, folha: null, documento: null },
    ]);
    expect(f[0]!.trecho).toBe("evento 87, fl. 3");
  });

  test("aceita fls., folhas em intervalo e documento sem evento pelo nome", () => {
    const f = extrairFontes('Ver (evento 52, fls. 4-6) e (documento "Procuração", fl. 2) e (documento "Contrato").');
    expect(f.map(({ evento, folha, documento }) => ({ evento, folha, documento }))).toEqual([
      { evento: 52, folha: 4, documento: null },
      { evento: null, folha: 2, documento: "Procuração" },
      { evento: null, folha: null, documento: "Contrato" },
    ]);
  });

  test("texto sem parênteses de fonte não vira fonte", () => {
    expect(extrairFontes("O evento 87 trouxe o laudo, sem citar folha.")).toEqual([]);
  });

  test("liga a fonte ao documento do evento, na folha certa", () => {
    const docs = [
      { id: "a", nome: "Laudo pericial", evento: 87, paginas: 5 },
      { id: "b", nome: "Procuração", evento: null, paginas: 2 },
    ];
    const [laudo, procuracao, fora, folhaDemais] = extrairFontes('(evento 87, fl. 3) (documento "procuração", fl. 2) (evento 12) (evento 87, fl. 9)');
    expect(documentoDaFonte(laudo!, docs)).toEqual({ id: "a", pagina: 3 });
    expect(documentoDaFonte(procuracao!, docs)).toEqual({ id: "b", pagina: 2 });
    expect(documentoDaFonte(fora!, docs)).toBeNull();
    // Folha que o documento não tem: abre o documento no começo.
    expect(documentoDaFonte(folhaDemais!, docs)).toEqual({ id: "a", pagina: null });
  });

  test("a marca de folha do texto lido", () => {
    expect(MARCA_DA_FOLHA(3)).toBe("[fl. 3]");
  });
});
