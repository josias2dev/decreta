import { describe, expect, test } from "bun:test";
import { buscarNoBnp, ErroBnp, listarNoBnp } from "../src/index.ts";

const BNP = "https://pangeabnp.pdpj.jus.br/api/v1/precedentes";

/** Como o Pangea responde (encurtado de respostas reais). */
const SUMULA_297 = {
  id: "stj-sum-297",
  nr: 297,
  orgao: "STJ",
  situacao: "Vigente",
  tese: "<p>O Código de Defesa do Consumidor é aplicável às instituições financeiras.</p><br>",
  tipo: "SUM",
  ultimaAtualizacao: "01/04/2025",
  historico: [{ situacao: "Admitido" }],
  highlight: { tese: "<p>…</p>" },
};
const SUMULA_61 = { alertaSituacao: "cancelado", id: "stj-sum-61", nr: 61, orgao: "STJ", situacao: "Cancelado", tese: "<p>O seguro de vida cobre o suicídio não premeditado.</p><br>", tipo: "SUM", ultimaAtualizacao: "01/04/2025" };
/** Na súmula vinculante, o enunciado vem em "questao" e a tese, "não informado". */
const SV_13 = { id: "stf-sv-13", nr: 13, orgao: "STF", questao: "A nomeação de cônjuge, companheiro ou parente […] viola a Constituição Federal.   ", situacao: "APROVADO", tese: "não informado", tipo: "SV", ultimaAtualizacao: "22/05/2025" };

const pagina = (resultados: unknown[], total: number) => ({ aggsEspecies: [], aggsOrgaos: [], posicao_inicial: 1, posicao_final: resultados.length, resultados, total });

function fetchFalso(respostas: unknown[]) {
  const corpos: unknown[] = [];
  const f = (async (url: string, init: RequestInit) => {
    expect(String(url)).toBe(BNP);
    expect(init.method).toBe("POST");
    corpos.push(JSON.parse(String(init.body)));
    return Response.json(respostas.shift());
  }) as unknown as typeof fetch;
  return { f, corpos };
}

describe("precedentes no BNP (Pangea, CNJ)", () => {
  test("busca um precedente pelo tribunal, espécie e número; a tese sai sem HTML", async () => {
    const { f, corpos } = fetchFalso([pagina([SUMULA_297], 1)]);
    expect(await buscarNoBnp({ orgao: "STJ", tipo: "SUM", numero: 297 }, { fetch: f })).toEqual({
      id: "stj-sum-297",
      orgao: "STJ",
      tipo: "SUM",
      numero: 297,
      situacao: "Vigente",
      cancelado: false,
      texto: "O Código de Defesa do Consumidor é aplicável às instituições financeiras.",
      questao: null,
      atualizadoEm: "2025-04-01",
      url: "https://pangeabnp.pdpj.jus.br/pesquisa?orgao=stj&tipo=SUM&nr=297",
    });
    expect(corpos).toEqual([{ filtro: { orgaos: ["STJ"], tipos: ["SUM"], nr: "297", cancelados: true, ordenacao: "Text", pagina: 1, tamanhoPagina: 10 } }]);
  });

  test("número que o BNP não tem: null, não erro", async () => {
    const { f } = fetchFalso([pagina([], 0)]);
    expect(await buscarNoBnp({ orgao: "STJ", tipo: "SUM", numero: 9999 }, { fetch: f })).toBeNull();
  });

  test("lista uma espécie inteira em páginas, com as canceladas, e o enunciado da vinculante", async () => {
    const { f, corpos } = fetchFalso([pagina([SUMULA_61, SUMULA_297], 3), pagina([SV_13], 3)]);
    const pausas: number[] = [];
    const lista = await listarNoBnp({ orgao: "STJ", tipo: "SUM" }, { fetch: f, porPagina: 2, dormir: async (ms) => void pausas.push(ms) });
    expect(lista.map((p) => [p.id, p.cancelado, p.texto])).toEqual([
      ["stj-sum-61", true, "O seguro de vida cobre o suicídio não premeditado."],
      ["stj-sum-297", false, "O Código de Defesa do Consumidor é aplicável às instituições financeiras."],
      ["stf-sv-13", false, "A nomeação de cônjuge, companheiro ou parente […] viola a Constituição Federal."],
    ]);
    expect(corpos.map((c) => (c as { filtro: { pagina: number; ordenacao: string } }).filtro)).toMatchObject([
      { pagina: 1, ordenacao: "Crono-Asc", tamanhoPagina: 2 },
      { pagina: 2, ordenacao: "Crono-Asc", tamanhoPagina: 2 },
    ]);
    expect(pausas).toEqual([1000]);
  });

  test("a questão submetida a julgamento vem à parte, sem HTML: é o que o radar cruza com a carteira", async () => {
    const IRDR_37 = { id: "tjsc-irdr-37", nr: 37, orgao: "TJSC", tipo: "IRDR", situacao: "Admitido", tese: "-", questao: "<p>Definir a possibilidade de utilização da <b>CNIB</b> como instrumento de busca de patrimônio.</p>", ultimaAtualizacao: "14/09/2026" };
    const { f } = fetchFalso([pagina([IRDR_37], 1)]);
    const [p] = await listarNoBnp({ orgao: "TJSC", tipo: "IRDR" }, { fetch: f });
    expect(p).toMatchObject({ situacao: "Admitido", questao: "Definir a possibilidade de utilização da CNIB como instrumento de busca de patrimônio.", url: "https://pangeabnp.pdpj.jus.br/pesquisa?orgao=tjsc&tipo=IRDR&nr=37" });
  });

  test("BNP fora do ar ou fora do formato: erro, para a sincronização manter a última versão", async () => {
    const fora = (async () => new Response("<!doctype html>", { status: 500 })) as unknown as typeof fetch;
    await expect(buscarNoBnp({ orgao: "STJ", tipo: "SUM", numero: 297 }, { fetch: fora })).rejects.toBeInstanceOf(ErroBnp);
    const outroFormato = (async () => Response.json({ itens: [] })) as unknown as typeof fetch;
    await expect(listarNoBnp({ orgao: "STJ", tipo: "SUM" }, { fetch: outroFormato })).rejects.toBeInstanceOf(ErroBnp);
  });
});
