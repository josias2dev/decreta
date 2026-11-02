/**
 * "Antes de protocolar": a checagem por código da peça, sem IA. Os exemplos vêm
 * dos testes com os concorrentes (docs/elara-juridico): a frase quebrada do
 * Astrea, a etiqueta vazada do Jus IA, as vírgulas soltas do ADVBOX e a
 * "jurisprudência consolidada" sem julgado do Projuris.
 */
import { describe, expect, test } from "bun:test";
import { checarPeca, forcaSemBase, fraseAntesDaMarca } from "../src/checagem-da-peca.ts";

const tipos = (texto: string) => checarPeca(texto).map((p) => p.tipo);
const trechos = (texto: string) => checarPeca(texto).map((p) => p.trecho);

describe("frase quebrada", () => {
  test("a frase do Astrea, com dois campos em branco na tempestividade", () => {
    const texto = "A intimação ocorreu em, o protocolo realizado na data de assegura a tempestividade.";
    const pontos = checarPeca(texto);
    expect(pontos.map((p) => [p.tipo, p.trecho])).toEqual([
      ["frase_quebrada", "em,"],
      ["frase_quebrada", "data de assegura"],
    ]);
    // A posição leva ao ponto do texto.
    expect(texto.slice(pontos[0]!.inicio, pontos[0]!.fim)).toBe("em,");
  });

  test("a preposição seguida de ponto ou de ponto e vírgula", () => {
    expect(trechos("O termo inicial ocorreu em. O protocolo foi feito para; depois nada.")).toEqual(["em.", "para;"]);
  });

  test("o parágrafo que termina no meio, como a geração que parou", () => {
    expect(trechos("A ré alegou que o produto foi entregue na data combinada, conforme o")).toEqual(["o"]);
    expect(tipos("A ré alegou que o produto foi entregue na data combinada, conforme o")).toEqual(["frase_quebrada"]);
  });

  test("o aposto entre vírgulas depois da preposição não é frase quebrada", () => {
    expect(checarPeca("Intime-se a parte para, querendo, apresentar contestação em, no mínimo, cinco dias, a fim de, pelo menos, garantir o contraditório.")).toEqual([]);
  });

  test("a data seguida do que ela é continua valendo", () => {
    expect(checarPeca("O prazo conta da data de sua publicação, na data de emissão da nota e na data de 10/09/2026.")).toEqual([]);
  });

  test("a alínea e o título curto não são frase cortada", () => {
    expect(checarPeca("## Do direito\n\nNos termos do art. 14, a, do CDC.\n\n- Item de\n\nJoinville, 29 de outubro de 2026.")).toEqual([]);
  });
});

describe("campo vazio", () => {
  test("as vírgulas soltas do ADVBOX, com o RG e o CPF em branco", () => {
    const texto = "Fulano de Tal, brasileiro, , , residente na Rua A.";
    expect(checarPeca(texto).map((p) => p.tipo)).toEqual(["campo_vazio"]);
    expect(checarPeca(texto)[0]!.trecho).toBe(", , ,");
  });

  test("vírgula com espaço antes e pontuação repetida", () => {
    expect(tipos("A autora , residente em Joinville.")).toEqual(["campo_vazio"]);
    expect(tipos("A autora,, residente em Joinville.")).toEqual(["campo_vazio"]);
    expect(tipos("A autora reside em Joinville,.")).toEqual(["campo_vazio"]);
  });

  test("valor, documento e data sem o número", () => {
    expect(trechos("A condenação é de R$ ,00 para a autora.")).toEqual(["R$ ,00"]);
    expect(trechos("Pagou R$ . Depois saiu.")).toEqual(["R$ ."]);
    expect(trechos("Inscrita no CNPJ nº , com sede na Rua A.")).toEqual(["CNPJ nº ,"]);
    expect(tipos("Inscrita no CPF: , com sede na Rua A.")).toEqual(["campo_vazio"]);
    expect(tipos("Protocolada em __/__/____ às 10h.")).toEqual(["campo_vazio"]);
    expect(tipos("Assina _________ como testemunha.")).toEqual(["campo_vazio"]);
    expect(tipos("Valor de R$ XXX,XX e processo nº XXXX.")).toEqual(["campo_vazio", "campo_vazio"]);
    expect(tipos("Parênteses vazios ( ) no texto.")).toEqual(["campo_vazio"]);
  });

  test("valor, data e número completos passam", () => {
    expect(checarPeca("Comprou por R$ 1.000,00 em 10/09/2026, CNPJ nº 12.345.678/0001-90, CPF: 529.982.247-25.")).toEqual([]);
  });

  test("o número com ponto depois do nº não é campo em branco", () => {
    expect(checarPeca("Inscrita no CPF nº. 529.982.247-25 e no CNPJ n. 12.345.678/0001-90, nos termos da Lei nº. 9.099/95.")).toEqual([]);
  });
});

describe("colchetes", () => {
  test("cada marca da peça com o seu tipo e o que falta", () => {
    const pontos = checarPeca("O dano soma [COMPLETAR: valor atualizado]. Requer a procedência. [JURISPRUDÊNCIA: responsabilidade objetiva] A ré cumpriu o contrato. [A COMPROVAR: comprovante de entrega]");
    expect(pontos.map((p) => p.tipo)).toEqual(["completar", "jurisprudencia", "a_comprovar"]);
    expect(pontos[0]!.mensagem).toContain("valor atualizado");
    expect(pontos[1]!.mensagem).toContain("responsabilidade objetiva");
    expect(pontos[2]!.mensagem).toContain("comprovante de entrega");
  });

  test("os marcadores de dado em branco, em maiúsculas ou pelo nome do campo", () => {
    expect(trechos("Inscrita no CNPJ sob o nº [CNPJ], representada por [NOME DO REPRESENTANTE].\n\n[cidade], [data].")).toEqual(["[CNPJ]", "[NOME DO REPRESENTANTE]", "[cidade]", "[data]"]);
    expect(tipos("Campo [] vazio e [inserir o valor] aqui.")).toEqual(["colchete", "colchete"]);
  });

  test("colchete comum, supressão de citação e sic não contam", () => {
    expect(checarPeca("Conforme o laudo [evento 87], o nexo está provado: \"a incapacidade [...] é total [sic]\" [grifo nosso].")).toEqual([]);
  });
});

describe("marca interna", () => {
  test("a etiqueta do Jus IA vazada no corpo da peça", () => {
    const pontos = checarPeca('Nesse sentido, <mention id="j1" tipo="julgado">REsp 1.737.412/SE</mention>, a ré responde.');
    expect(pontos.map((p) => [p.tipo, p.trecho])).toEqual([
      ["marca_interna", '<mention id="j1" tipo="julgado">'],
      ["marca_interna", "</mention>"],
    ]);
  });

  test("etiqueta sem fechar, chaves de modelo e referência numérica", () => {
    expect(tipos('A ré <mention id="9" responde.')).toEqual(["marca_interna"]);
    expect(trechos("Prezado {{nome_do_cliente}}, conforme ${campo} e {valor_total} e 【3†fonte】 e [^2] e [1].")).toEqual(["{{nome_do_cliente}}", "${campo}", "{valor_total}", "【3†fonte】", "[^2]", "[1]"]);
  });

  test("a nota dirigida a quem revisa e a fala do assistente", () => {
    expect(tipos("Nota interna: verificar com o cliente antes de enviar.")).toEqual(["marca_interna"]);
    expect(tipos("Observação ao advogado: revise o tópico.")).toEqual(["marca_interna"]);
    expect(tipos("Aqui está a contestação solicitada.")).toEqual(["marca_interna"]);
    expect(tipos("[A geração parou no meio. Gere de novo ou continue editando.]")).toEqual(["marca_interna"]);
    expect(tipos("```\nA ré contesta.\n```")).toEqual(["marca_interna", "marca_interna"]);
  });

  test("o sinal de menor na frase comum não é etiqueta", () => {
    expect(checarPeca("O valor <1% da condenação e a nota fiscal da compra não mudam o resultado.")).toEqual([]);
  });
});

describe("força sem citação", () => {
  test("a jurisprudência consolidada do Projuris, sem indicar decisão", () => {
    const pontos = checarPeca("A jurisprudência consolidada do STJ é nesse sentido.");
    expect(pontos.map((p) => p.tipo)).toEqual(["forca_sem_citacao"]);
    expect(pontos[0]!.trecho).toBe("jurisprudência consolidada");
  });

  test("o STJ consolidou, o entendimento pacífico e a orientação dominante", () => {
    expect(tipos("O STJ consolidou o entendimento.")).toEqual(["forca_sem_citacao"]);
    expect(tipos("É entendimento pacífico nos tribunais.")).toEqual(["forca_sem_citacao"]);
    expect(tipos("A orientação dominante afasta o dano.")).toEqual(["forca_sem_citacao"]);
  });

  test("com a citação na mesma frase, o selo de quem cita resolve", () => {
    expect(checarPeca("O STJ consolidou o entendimento na Súmula 608 do STJ.")).toEqual([]);
  });

  test("consolidar a propriedade do imóvel não é falar de jurisprudência", () => {
    expect(checarPeca("O banco consolidou a propriedade do imóvel em seu nome.")).toEqual([]);
  });
});

describe("qualificação das partes, conferida com o cadastro", () => {
  const partes = [
    { nome: "Teste Cliente Ficticio", tipo: "pj" as const, polo: "passivo" as const, cliente: true },
    { nome: "José Antônio", tipo: "pf" as const, polo: "ativo" as const, cliente: false },
    { nome: "Parte Sem Cadastro", tipo: null, polo: "ativo" as const, cliente: false },
  ];

  test("a ré pessoa jurídica tratada como física, o erro da Jurídico AI e do Astrea", () => {
    const pontos = checarPeca("TESTE CLIENTE FICTICIO, brasileira, portadora do CPF nº 000, vem contestar.", { partes });
    expect(pontos.map((p) => p.tipo)).toEqual(["qualificacao"]);
    expect(pontos[0]!.mensagem).toContain("pessoa jurídica");
  });

  test("a pessoa física tratada como empresa", () => {
    expect(checarPeca("Jose Antonio, pessoa jurídica de direito privado, inscrita no CNPJ.", { partes }).map((p) => p.tipo)).toEqual(["qualificacao"]);
  });

  test("a parte no polo errado", () => {
    const pontos = checarPeca("TESTE CLIENTE FICTICIO, já qualificada, autora nesta ação, vem contestar.", { partes });
    expect(pontos.map((p) => p.tipo)).toEqual(["qualificacao"]);
    expect(pontos[0]!.mensagem).toContain("polo passivo");
  });

  test("a qualificação certa e a parte sem tipo no cadastro passam", () => {
    expect(checarPeca("TESTE CLIENTE FICTICIO, pessoa jurídica de direito privado, inscrita no CNPJ, e José Antônio, brasileiro, portador do CPF, e Parte Sem Cadastro, brasileira, portadora do CPF.", { partes })).toEqual([]);
  });

  test("o que vem depois do ponto é outra frase", () => {
    expect(checarPeca("A ré é TESTE CLIENTE FICTICIO. O autor, brasileiro, portador do CPF, reclama.", { partes })).toEqual([]);
  });
});

describe("a frase que o julgado sustenta", () => {
  test("a palavra de força que o trecho não diz vem de volta; com base no trecho, não", () => {
    expect(forcaSemBase("O STJ consolidou que o atraso gera dano moral.", "O atraso na entrega gera dano moral.")).toBe("consolidou");
    expect(forcaSemBase("O STJ consolidou que o atraso gera dano moral.", "É firme o entendimento de que o atraso gera dano moral.")).toBeNull();
    expect(forcaSemBase("O atraso gera dano moral.", "O atraso gera dano moral.")).toBeNull();
  });

  test("a frase é a última do parágrafo antes da marca", () => {
    const texto = "Primeira frase do parágrafo. O atraso gera mero aborrecimento. [JURISPRUDÊNCIA: tese]";
    expect(fraseAntesDaMarca(texto, texto.indexOf("["))).toBe("O atraso gera mero aborrecimento.");
    expect(fraseAntesDaMarca("Outro parágrafo.\n\n[JURISPRUDÊNCIA: tese]", 18)).toBeNull();
  });
});

test("os pontos saem na ordem do texto", () => {
  const pontos = checarPeca("[CPF] e depois <b> e [COMPLETAR: valor].");
  expect(pontos.map((p) => p.inicio)).toEqual([...pontos.map((p) => p.inicio)].sort((a, b) => a - b));
});

test("texto limpo não tem nada a avisar", () => {
  const limpo = [
    "# Excelentíssimo Senhor Doutor Juiz de Direito",
    "**TESTE CLIENTE**, pessoa jurídica, vem apresentar CONTESTAÇÃO.",
    "## Dos fatos",
    "O autor comprou em 10/09/2026 um aparelho por R$ 800,00 (evento 1, fl. 1). O produto foi entregue em 05/10/2026 (evento 1, fl. 1).",
    "Joinville, 29 de outubro de 2026.",
    "Advogada de Teste, OAB/SC 12.345.",
  ].join("\n\n");
  expect(checarPeca(limpo)).toEqual([]);
});
