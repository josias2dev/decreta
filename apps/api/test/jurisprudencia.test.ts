/**
 * O modo Jurisprudência do Perguntar procura no acervo (temas e súmulas
 * guardados) e confere cada citação antes de mostrar: o documento existe, o
 * trecho está no texto guardado, a súmula ou o tema continua valendo. Fora do
 * acervo é "não verificada", nunca "inexistente".
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { acervoDocumentos } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { buscarNoAcervo, conferirCitacaoNoAcervo } from "../src/servicos/jurisprudencia.ts";

const CAPTURA = new Date("2026-10-20T06:00:00Z");

const DOCUMENTOS = [
  {
    chave: "sumula:STJ:302",
    fonte: "cnj_bnp",
    situacao: "Vigente",
    cancelado: false,
    texto: "É abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado.",
    url: "https://pangeabnp.pdpj.jus.br/precedentes?id=stj-sum-302",
  },
  {
    chave: "tema:STJ:952",
    fonte: "stj_dados_abertos",
    situacao: "Trânsito em Julgado",
    cancelado: false,
    texto: "O reajuste de mensalidade de plano de saúde individual ou familiar fundado na mudança de faixa etária do beneficiário é válido desde que haja previsão contratual.",
    url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?novaConsulta=true&tipo_pesquisa=T&cod_tema_inicial=952",
  },
  {
    chave: "sumula:STJ:61",
    fonte: "cnj_bnp",
    situacao: "Cancelado",
    cancelado: true,
    texto: "O seguro de vida cobre o suicídio não premeditado.",
    url: "https://pangeabnp.pdpj.jus.br/precedentes?id=stj-sum-61",
  },
  {
    chave: "tema:STJ:1000",
    fonte: "stj_dados_abertos",
    situacao: "Trânsito em Julgado",
    cancelado: false,
    texto: "Não incide ICMS sobre o deslocamento de bens de um estabelecimento para outro do mesmo contribuinte.",
    url: "https://processo.stj.jus.br/repetitivos/temas_repetitivos/pesquisa.jsp?cod_tema_inicial=1000",
  },
];

describe.skipIf(!hasTestDatabase)("jurisprudência no Perguntar: o acervo", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.db.insert(acervoDocumentos).values(DOCUMENTOS.map((d) => ({ ...d, hash: "h", capturadoEm: CAPTURA })));
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("a busca acha pelas palavras da tese, o mais parecido primeiro, com o rótulo montado pelo Decreta", async () => {
    const r = await buscarNoAcervo(t.db, { busca: "plano de saúde e internação" });
    expect(r.total).toBe(2);
    expect(r.itens.map((d) => [d.chave, d.rotulo])).toEqual([
      ["sumula:STJ:302", "Súmula 302 do STJ"],
      ["tema:STJ:952", "Tema 952 do STJ"],
    ]);
    expect(r.itens[0]).toMatchObject({
      situacao: "Vigente",
      cancelado: false,
      texto: "É abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado.",
      fonte: { nome: "CNJ, Banco Nacional de Precedentes", url: "https://pangeabnp.pdpj.jus.br/precedentes?id=stj-sum-302", capturadoEm: "2026-10-20T06:00:00.000Z" },
    });
  });

  test("trecho literal de súmula vigente: verificada, mesmo com aspas, maiúsculas e espaços diferentes", async () => {
    const c = await conferirCitacaoNoAcervo(t.db, { chave: "sumula:STJ:302", trecho: "“é abusiva a cláusula contratual de plano de saúde que limita no tempo  a internação\nhospitalar”" });
    expect(c).toEqual({
      chave: "sumula:STJ:302",
      rotulo: "Súmula 302 do STJ",
      trecho: "“é abusiva a cláusula contratual de plano de saúde que limita no tempo  a internação\nhospitalar”",
      literal: true,
      selo: "verificada",
      motivo: "Súmula 302 do STJ: Vigente.",
      texto: "É abusiva a cláusula contratual de plano de saúde que limita no tempo a internação hospitalar do segurado.",
      fonte: { nome: "CNJ, Banco Nacional de Precedentes", url: "https://pangeabnp.pdpj.jus.br/precedentes?id=stj-sum-302", capturadoEm: "2026-10-20T06:00:00.000Z" },
    });
  });

  test("trecho que não está no texto guardado: com ressalva, e o texto real vai junto", async () => {
    const c = await conferirCitacaoNoAcervo(t.db, { chave: "tema:STJ:952", trecho: "o reajuste por faixa etária é sempre abusivo" });
    expect(c).toMatchObject({
      rotulo: "Tema 952 do STJ",
      literal: false,
      selo: "com_ressalva",
      motivo: "Tema 952 do STJ: Trânsito em Julgado. O trecho citado não está no texto guardado: compare com a tese ao lado.",
      texto: "O reajuste de mensalidade de plano de saúde individual ou familiar fundado na mudança de faixa etária do beneficiário é válido desde que haja previsão contratual.",
    });
  });

  test("súmula cancelada: com ressalva, mesmo com o trecho literal", async () => {
    const c = await conferirCitacaoNoAcervo(t.db, { chave: "sumula:STJ:61", trecho: "O seguro de vida cobre o suicídio não premeditado." });
    expect(c).toMatchObject({ rotulo: "Súmula 61 do STJ", literal: true, selo: "com_ressalva", motivo: "Súmula 61 do STJ: Cancelado. Não use como precedente sem conferir." });
  });

  test("chave fora do acervo: não verificada, confira antes de usar", async () => {
    const c = await conferirCitacaoNoAcervo(t.db, { chave: "sumula:STJ:9999", trecho: "Qualquer coisa que a IA tenha escrito." });
    expect(c).toEqual({
      chave: "sumula:STJ:9999",
      rotulo: "Súmula 9999 do STJ",
      trecho: "Qualquer coisa que a IA tenha escrito.",
      literal: null,
      selo: "nao_verificada",
      motivo: "Não está no acervo do Decreta. Confira na fonte antes de usar.",
      texto: null,
      fonte: null,
    });
  });
});
