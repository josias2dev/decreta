/**
 * Depois que a IA liga cada fato da peça a uma fonte, o código confere: o trecho
 * existe no documento, a data e o valor batem. O que não confere sai marcado. Os
 * casos vêm dos testes com os concorrentes: "registros do checkout" não anexados
 * (Astrea), "problema logístico regularizado" sem base (Projuris).
 */
import { describe, expect, test } from "bun:test";
import { conferirFatos, datasDe, localizarTrecho, valoresDe, type FonteDoFato } from "../src/conferencia-dos-fatos.ts";

const PETICAO: FonteDoFato = {
  ref: "D1",
  tipo: "documento",
  rotulo: "peticao.pdf · evento 1",
  documentoId: "doc-1",
  evento: 1,
  paginas: 2,
  texto:
    "[fl. 1]\nEm 10 de setembro de 2026, o autor comprou da ré, pela internet, um aparelho\neletrodoméstico no valor de R$ 800,00, com entrega prometida para 20 de\nsetembro de 2026.\n\n[fl. 2]\nDiante do exposto, requer a condenação da ré ao pagamento de indenização por danos morais de R$ 1.000,00.",
};
const LAUDO: FonteDoFato = { ref: "D2", tipo: "documento", rotulo: "Laudo.docx · evento 87", documentoId: "doc-2", evento: 87, paginas: 18, texto: "O perito concluiu pela incapacidade de 40% em 21/10/2026." };
const fontes = [PETICAO, LAUDO];

const COMPRA = "O autor comprou o aparelho por R$ 800,00 em 10/09/2026 (evento 1, fl. 1).";
const listado = (afirmacao: string, fonte: string | null, trecho: string | null, falta: string | null = null) => ({ afirmacao, fonte, trecho, falta });

describe("a ligação de cada fato à fonte", () => {
  test("o trecho que está no documento, mesmo com a quebra de linha, confere e diz a folha", () => {
    const r = conferirFatos({ texto: COMPRA, fontes, listados: [listado(COMPRA, "D1", "um aparelho eletrodoméstico no valor de R$ 800,00")] });
    expect(r.fatos).toEqual([
      {
        afirmacao: COMPRA,
        situacao: "conferido",
        fonte: { ref: "D1", tipo: "documento", rotulo: "peticao.pdf · evento 1", documentoId: "doc-1", evento: 1, folha: 1 },
        trecho: "um aparelho eletrodoméstico no valor de R$ 800,00",
        motivo: null,
      },
    ]);
    expect(r.texto).toBe(COMPRA);
    expect(r.resumo).toEqual({ conferidos: 1, comAviso: 0, aComprovar: 0 });
  });

  test("a folha sai do documento, não da IA", () => {
    const r = conferirFatos({ texto: "A autora pede R$ 1.000,00 de danos morais.", fontes, listados: [listado("A autora pede R$ 1.000,00 de danos morais.", "D1", "indenização por danos morais de R$ 1.000,00")] });
    expect(r.fatos[0]!.fonte!.folha).toBe(2);
  });

  test("o trecho que não está no documento vira a comprovar, com a marca no texto", () => {
    const frase = "Os registros do checkout mostram a entrega no prazo.";
    const r = conferirFatos({ texto: `${frase} A ré cumpriu o contrato.`, fontes, listados: [listado(frase, "D1", "registros do checkout comprovam a entrega")] });
    expect(r.fatos[0]).toMatchObject({ situacao: "a_comprovar", trecho: null });
    expect(r.fatos[0]!.motivo).toContain("peticao.pdf");
    expect(r.texto).toBe(`${frase} [A COMPROVAR: o trecho citado não está nos autos] A ré cumpriu o contrato.`);
    expect(r.resumo).toEqual({ conferidos: 0, comAviso: 0, aComprovar: 1 });
  });

  test("o fato sem fonte vira a comprovar, dizendo o que falta", () => {
    const frase = "O problema logístico foi regularizado pela ré.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, null, null, "comprovante da regularização")] });
    expect(r.fatos[0]).toMatchObject({ situacao: "a_comprovar", fonte: null });
    expect(r.texto).toBe(`${frase} [A COMPROVAR: comprovante da regularização]`);
  });

  test("fonte que não existe e fonte sem trecho também vão para a comprovar", () => {
    const a = "A autora reclamou por telefone duas vezes.";
    const b = "A ré respondeu dentro do prazo do contrato.";
    const r = conferirFatos({ texto: `${a} ${b}`, fontes, listados: [listado(a, "D9", "reclamou por telefone"), listado(b, "D1", null)] });
    expect(r.fatos.map((f) => f.situacao)).toEqual(["a_comprovar", "a_comprovar"]);
  });

  test("a marca entra depois da fonte entre parênteses e do ponto final", () => {
    const frase = "A entrega ocorreu no prazo";
    const r = conferirFatos({ texto: `${frase} (evento 1, fl. 2). Segue a defesa.`, fontes, listados: [listado(frase, null, null, "prova da entrega")] });
    expect(r.texto).toBe(`${frase} (evento 1, fl. 2). [A COMPROVAR: prova da entrega] Segue a defesa.`);
  });

  test("conferir de novo não repete a marca", () => {
    const frase = "O problema logístico foi regularizado pela ré.";
    const uma = conferirFatos({ texto: frase, fontes, listados: [listado(frase, null, null, "comprovante")] });
    const duas = conferirFatos({ texto: uma.texto, fontes, listados: [listado(frase, null, null, "comprovante")] });
    expect(duas.texto).toBe(uma.texto);
  });

  test("a afirmação que não está na peça não entra", () => {
    const r = conferirFatos({ texto: COMPRA, fontes, listados: [listado("Uma frase que a IA inventou agora para a lista.", "D1", "um aparelho eletrodoméstico")] });
    expect(r.fatos).toEqual([]);
  });

  test("a afirmação copiada com outra caixa e outro espaço é a mesma frase, como está no texto", () => {
    const r = conferirFatos({ texto: COMPRA, fontes, listados: [listado("o autor COMPROU  o aparelho por R$ 800,00 em 10/09/2026", "D1", "um aparelho eletrodoméstico no valor de R$ 800,00")] });
    expect(r.fatos[0]!.afirmacao).toBe("O autor comprou o aparelho por R$ 800,00 em 10/09/2026");
  });
});

describe("datas e valores do texto contra a fonte", () => {
  test("a data que não bate com a fonte vira aviso, sem marcar o fato como inventado", () => {
    const frase = "O autor comprou o aparelho em 12/09/2026.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, "D1", "o autor comprou da ré, pela internet")] });
    expect(r.fatos[0]).toMatchObject({ situacao: "com_aviso", trecho: "o autor comprou da ré, pela internet" });
    expect(r.fatos[0]!.motivo).toBe("A data 12/09/2026 não está em peticao.pdf · evento 1.");
    expect(r.texto).toBe(frase);
    expect(r.resumo).toEqual({ conferidos: 0, comAviso: 1, aComprovar: 0 });
  });

  test("o valor que não bate com a fonte vira aviso", () => {
    const frase = "O autor comprou o aparelho por R$ 900,00.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, "D1", "o autor comprou da ré, pela internet")] });
    expect(r.fatos[0]!.motivo).toBe("O valor R$ 900,00 não está em peticao.pdf · evento 1.");
  });

  test("a mesma data escrita de outro jeito e o mesmo valor sem centavos batem", () => {
    const frase = "Comprou em 10/09/26, por R$ 800, com entrega para 20 de setembro.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, "D1", "o autor comprou da ré, pela internet")] });
    expect(r.fatos[0]!.situacao).toBe("conferido");
  });

  test("o percentual também é valor", () => {
    const frase = "O perito apontou incapacidade de 50%.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, "D2", "concluiu pela incapacidade")] });
    expect(r.fatos[0]!.motivo).toBe("O valor 50% não está em Laudo.docx · evento 87.");
  });

  test("sem a IA, a peça inteira é conferida por código, sem fatos e sem mexer no texto", () => {
    const texto = "O autor comprou por R$ 800,00 em 10/09/2026 e pagou R$ 77,00 em 03/03/2025.\n\n[COMPLETAR: R$ 55,00 em 01/01/2020]\n\nJoinville, 29 de outubro de 2026.";
    const r = conferirFatos({ texto, fontes, listados: null });
    expect(r.fatos).toEqual([]);
    expect(r.texto).toBe(texto);
    expect(r.avisos).toEqual([
      { tipo: "valor", trecho: "R$ 77,00", mensagem: "O valor R$ 77,00 não aparece nos autos." },
      { tipo: "data", trecho: "03/03/2025", mensagem: "A data 03/03/2025 não aparece nos autos." },
    ]);
  });

  test("o que já tem aviso no fato não se repete nos avisos da peça", () => {
    const frase = "O autor comprou o aparelho em 12/09/2026.";
    const r = conferirFatos({ texto: frase, fontes, listados: [listado(frase, "D1", "o autor comprou da ré, pela internet")] });
    expect(r.avisos).toEqual([]);
  });

  test("a data de outra fonte não é aviso da peça: existe nos autos", () => {
    const r = conferirFatos({ texto: "O laudo é de 21/10/2026 e a compra de 10/09/2026.", fontes, listados: null });
    expect(r.avisos).toEqual([]);
  });
});

describe("referências aos autos", () => {
  test("evento e folha que não existem viram aviso", () => {
    const texto = "O laudo (evento 87, fl. 3) e o andamento (evento 88) e o inventado (evento 412) e a folha demais (evento 87, fl. 99).";
    const r = conferirFatos({ texto, fontes, listados: null, eventos: [88] });
    expect(r.avisos).toEqual([
      { tipo: "fonte", trecho: "evento 412", mensagem: "O evento 412 não está nos autos." },
      { tipo: "fonte", trecho: "evento 87, fl. 99", mensagem: "A folha 99 do evento 87 não existe: o documento tem 18 folhas." },
    ]);
  });
});

describe("a regra de ouro: julgado só do acervo", () => {
  test("o julgado escrito de memória sai marcado", () => {
    const texto = "Conforme o REsp 1.737.412/SE, a ré não responde.";
    const r = conferirFatos({ texto, fontes, listados: null });
    expect(r.texto).toBe("Conforme o REsp 1.737.412/SE [A COMPROVAR: julgado fora do acervo], a ré não responde.");
    expect(r.avisos).toEqual([{ tipo: "julgado", trecho: "REsp 1.737.412/SE", mensagem: "REsp 1.737.412/SE não veio do acervo nem dos autos. Busque no acervo ou apague." }]);
  });

  test("o que está no acervo, nos autos ou o artigo de lei fica como está", () => {
    const comSumula: FonteDoFato = { ref: "D3", tipo: "documento", rotulo: "Inicial", texto: "Invoca a Súmula 297 do STJ." };
    const texto = "A Súmula 608 do STJ e a Súmula 297 do STJ, com o art. 14 do CDC.";
    const r = conferirFatos({ texto, fontes: [comSumula], listados: null, citacoesAceitas: new Set(["sumula:STJ:608"]) });
    expect(r.texto).toBe(texto);
    expect(r.avisos).toEqual([]);
  });

  test("o número do próprio processo não é julgado", () => {
    const cadastro: FonteDoFato = { ref: "C", tipo: "cadastro", rotulo: "Cadastro", texto: "Número: 5004321-25.2026.8.24.0038" };
    const texto = "Autos n. 5004321-25.2026.8.24.0038.";
    expect(conferirFatos({ texto, fontes: [cadastro], listados: null }).avisos).toEqual([]);
  });
});

describe("cobertura: o que a IA não listou", () => {
  test("a frase da seção de fatos sem ligação vira a comprovar; fora dela, não", () => {
    const texto = ["## Dos fatos", COMPRA, "A ré sempre prestou todo o suporte necessário ao autor.", "É o relato.", "## Do direito", "A responsabilidade da ré depende de prova do dano alegado na inicial."].join("\n\n");
    const r = conferirFatos({ texto, fontes, listados: [listado(COMPRA, "D1", "um aparelho eletrodoméstico no valor de R$ 800,00")] });
    expect(r.fatos.map((f) => [f.afirmacao, f.situacao])).toEqual([
      [COMPRA, "conferido"],
      ["A ré sempre prestou todo o suporte necessário ao autor.", "a_comprovar"],
    ]);
    expect(r.texto).toContain("ao autor. [A COMPROVAR: sem fonte nos autos]");
    expect(r.texto).toContain("É o relato.\n");
    expect(r.texto).not.toContain("alegado na inicial. [A COMPROVAR");
  });

  test("sem a lista da IA, não há o que cobrir", () => {
    const texto = "## Dos fatos\n\nA ré sempre prestou todo o suporte necessário ao autor.";
    expect(conferirFatos({ texto, fontes, listados: null }).texto).toBe(texto);
  });
});

describe("as peças da conferência", () => {
  test("datas por extenso, numéricas e curtas", () => {
    expect(datasDe("Em 5 de outubro de 2026, em 1º de março e em 28/10 e 10/09/26 e 03.04.2025; art. 5/6 não.").map((d) => [d.texto, d.dia, d.mes, d.ano])).toEqual([
      ["5 de outubro de 2026", 5, 10, 2026],
      ["1º de março", 1, 3, null],
      ["28/10", 28, 10, null],
      ["10/09/26", 10, 9, 2026],
      ["03.04.2025", 3, 4, 2025],
    ]);
  });

  test("valores em real e percentuais", () => {
    expect(valoresDe("R$ 1.000,00, R$ 800 e 40% e 12,5% e R$ 18.400,5").map((v) => [v.texto, v.chave])).toEqual([
      ["R$ 1.000,00", "r:100000"],
      ["R$ 800", "r:80000"],
      ["40%", "p:40"],
      ["12,5%", "p:12.5"],
      ["R$ 18.400,5", "r:1840050"],
    ]);
  });

  test("localizar o trecho: caixa, acento, espaço, palavra partida e a marca da folha não contam; palavra trocada, sim", () => {
    const doc = "[fl. 1]\nO perito conclu-\niu pela incapacidade\n\n[fl. 2]\nparcial e permanente da autora.";
    expect(localizarTrecho(doc, "CONCLUIU PELA INCAPACIDADE")).toEqual({ folha: 1 });
    expect(localizarTrecho(doc, "incapacidade parcial e permanente")).toEqual({ folha: 1 });
    expect(localizarTrecho(doc, "permanente da autora")).toEqual({ folha: 2 });
    expect(localizarTrecho("sem marca de folha nenhuma aqui", "marca de folha nenhuma")).toEqual({ folha: null });
    expect(localizarTrecho(doc, "incapacidade total e permanente")).toBeNull();
    expect(localizarTrecho(doc, "o")).toBeNull();
  });
});
