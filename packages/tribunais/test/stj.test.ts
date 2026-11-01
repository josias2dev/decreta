import { describe, expect, test } from "bun:test";
import { baixarTemasDoStj, ErroStj, lerTemasDoStj } from "../src/index.ts";

const CABECALHO =
  "sequencialPrecedente,tipoPrecedente,numeroPrecedente,dataPrimeiraAfetacao,dataJulgamento,dataPublicacaoAcordao,situacao,informacoesComplementares,questaoSubmetidaAJulgamento,teseFirmada,anotacoesNUGEPNAC,delimitacaoJulgado,entendimentoAnterior,referenciaLegislativa,referenciaSumular,sumulaOriginada,audienciaPublica,dataAudienciaPublica,orgaoJulgador,Assuntos,numeroRepercussaoGeralSTF,descricaoRepercussaoGeral";

/** Como o STJ publica: vírgula, aspas, quebra de linha na célula e uma linha por tema do STF ligado. */
const CSV = [
  CABECALHO,
  '1200,Tema,952,2016-04-20,2016-12-14,2016-12-19,Trânsito em Julgado,,"Validade de cláusula de reajuste, por faixa etária, de plano de saúde.","O reajuste é válido desde que (i) haja previsão contratual;\n(ii) sejam observadas as normas da ""ANS"".",,,,,,,,,S2,,,',
  '280,Tema,18,2008-10-01,2009-04-22,2009-05-04,Trânsito em Julgado,,Majoração do auxílio-acidente.,A majoração não alcança benefícios anteriores.,,,,,,,,,S3,,165,Revisão da pensão por morte.',
  '280,Tema,18,2008-10-01,2009-04-22,2009-05-04,Trânsito em Julgado,,Majoração do auxílio-acidente.,A majoração não alcança benefícios anteriores.,,,,,,,,,S3,,388,Revisão de auxílio-acidente.',
  "77,Tema,56,2008-09-01,,,Cancelado,,Questão cancelada.,,,,,,,,,,S2,,,",
  "4781,Controvérsia,1475,2026-10-15,,,Relevância reconhecida,,Uma controvérsia.,,,,,,,,,,S1,,,",
].join("\r\n");

describe("temas repetitivos do STJ (dados abertos)", () => {
  test("lê os temas, junta as linhas de cada tema do STF e deixa de fora o que não é tema", () => {
    expect(lerTemasDoStj(CSV)).toEqual([
      {
        numero: 952,
        situacao: "Trânsito em Julgado",
        questao: "Validade de cláusula de reajuste, por faixa etária, de plano de saúde.",
        tese: 'O reajuste é válido desde que (i) haja previsão contratual;\n(ii) sejam observadas as normas da "ANS".',
        orgao: "S2",
        julgadoEm: "2016-12-14",
        publicadoEm: "2016-12-19",
        temasDoStf: [],
        url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=952&cod_tema_final=952",
      },
      {
        numero: 18,
        situacao: "Trânsito em Julgado",
        questao: "Majoração do auxílio-acidente.",
        tese: "A majoração não alcança benefícios anteriores.",
        orgao: "S3",
        julgadoEm: "2009-04-22",
        publicadoEm: "2009-05-04",
        temasDoStf: [165, 388],
        url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=18&cod_tema_final=18",
      },
      {
        numero: 56,
        situacao: "Cancelado",
        questao: "Questão cancelada.",
        tese: null,
        orgao: "S2",
        julgadoEm: null,
        publicadoEm: null,
        temasDoStf: [],
        url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=56&cod_tema_final=56",
      },
    ]);
  });

  test("arquivo sem as colunas esperadas é erro, não lista vazia: o STJ mudou o formato", () => {
    expect(() => lerTemasDoStj("numero,tese\r\n1,Uma tese.")).toThrow(ErroStj);
  });
});

describe("baixar os temas do STJ", () => {
  const PACOTE = "https://dadosabertos.web.stj.jus.br/api/3/action/package_show?id=precedentes-qualificados";
  const ARQUIVO = "https://dadosabertos.web.stj.jus.br/dataset/x/resource/y/download/temas.csv";
  const pacote = {
    success: true,
    result: {
      resources: [
        { name: "dicionario-temas.csv", url: "https://dadosabertos.web.stj.jus.br/dicionario-temas.csv", last_modified: "2022-07-11T22:40:56.921473" },
        { name: "Temas.csv", url: ARQUIVO, last_modified: "2026-10-25T11:06:22.548438" },
      ],
    },
  };

  test("acha o Temas.csv pelo catálogo do portal, baixa e diz de quando é", async () => {
    const pedidos: string[] = [];
    const fetchFalso = (async (url: string) => {
      pedidos.push(String(url));
      return String(url) === PACOTE ? Response.json(pacote) : new Response(CSV);
    }) as unknown as typeof fetch;
    const { temas, atualizadoEm } = await baixarTemasDoStj({ fetch: fetchFalso });
    expect(pedidos).toEqual([PACOTE, ARQUIVO]);
    expect(temas.map((t) => t.numero)).toEqual([952, 18, 56]);
    expect(atualizadoEm).toBe("2026-10-25T11:06:22.548438");
  });

  test("portal fora do ar ou sem o Temas.csv no catálogo: erro", async () => {
    await expect(baixarTemasDoStj({ fetch: (async () => new Response("", { status: 503 })) as unknown as typeof fetch })).rejects.toBeInstanceOf(ErroStj);
    const semArquivo = (async () => Response.json({ success: true, result: { resources: [] } })) as unknown as typeof fetch;
    await expect(baixarTemasDoStj({ fetch: semArquivo })).rejects.toBeInstanceOf(ErroStj);
  });
});
