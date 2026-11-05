import { describe, expect, test } from "bun:test";
import { montarCustoDaIa, montarUso, montarVisaoGeral, precisaDeAtencao, type EscritorioDaPlataforma } from "../src/plataforma.ts";

const HOJE = "2026-11-05";
const base: EscritorioDaPlataforma = {
  id: "x",
  nome: "Escritório X",
  slug: "x",
  demonstracao: false,
  encerrado: false,
  emAvaliacao: false,
  situacao: "ativo",
  situacaoGravada: "ativo",
  criadoEm: "2026-09-01T12:00:00.000Z",
  testeAte: "2026-09-15",
  diasRestantesDoTeste: null,
  diasDeAtraso: null,
  acessoAte: null,
  assinouEm: "2026-09-15T12:00:00.000Z",
  cancelamentoPedidoEm: null,
  valorMensalCentavos: 20_000,
  pessoas: 3,
  processos: 40,
  iaMesUsd: 0,
};
const esc = (id: string, campos: Partial<EscritorioDaPlataforma> = {}): EscritorioDaPlataforma => ({ ...base, id, nome: `Escritório ${id}`, slug: id, ...campos });
const vazio = { ultimosAcessos: [], marcos: [], ia: [], tetos: { siteUsd: 0, avaliacaoUsd: 0 } };

describe("o que precisa de atenção hoje", () => {
  test("teste no fim: sem prazo confirmado pede ajuda; com prazo confirmado e sem assinar, pede o link", () => {
    const itens = precisaDeAtencao({
      ...vazio,
      hoje: HOJE,
      escritorios: [esc("a", { situacao: "teste", situacaoGravada: "teste", diasRestantesDoTeste: 2, assinouEm: null }), esc("b", { situacao: "teste", situacaoGravada: "teste", diasRestantesDoTeste: 0, assinouEm: null })],
      marcos: [
        { organizationId: "a", nome: "oab_cadastrada", em: "2026-10-25T12:00:00Z" },
        { organizationId: "b", nome: "oab_cadastrada", em: "2026-10-25T12:00:00Z" },
        { organizationId: "b", nome: "primeiro_prazo_confirmado", em: "2026-10-26T12:00:00Z" },
      ],
    });
    expect(itens.map((i) => [i.tipo, i.organizationId, i.detalhe])).toEqual([
      ["teste_sem_ativar", "a", "O teste acaba em 2 dias e nenhum prazo foi confirmado"],
      ["teste_ativado_sem_assinar", "b", "O teste acaba hoje; já confirmou prazos"],
    ]);
  });

  test("pagante some depois de 10 dias sem acesso; o teto do site vem primeiro, como alta", () => {
    const itens = precisaDeAtencao({
      ...vazio,
      hoje: HOJE,
      escritorios: [esc("sumido"), esc("presente")],
      marcos: [
        { organizationId: "sumido", nome: "oab_cadastrada", em: "2026-09-02T12:00:00Z" },
        { organizationId: "presente", nome: "oab_cadastrada", em: "2026-09-02T12:00:00Z" },
      ],
      ultimosAcessos: [
        { organizationId: "sumido", userId: "u1", ultimo: "2026-10-24" },
        { organizationId: "presente", userId: "u2", ultimo: "2026-11-03" },
      ],
      ia: [{ organizationId: "presente", dia: HOJE, metodo: "perguntar", origem: "tela", chamadas: 1, mensagens: 1, custoUsd: 3.5, custoEstimadoUsd: 0 }],
      tetos: { siteUsd: 4, avaliacaoUsd: 0.5 },
    });
    expect(itens.map((i) => [i.tipo, i.organizationId])).toEqual([
      ["ia_perto_do_teto", null],
      ["pagante_sumido", "sumido"],
    ]);
    expect(itens[1]!.detalhe).toBe("Nenhum acesso há 12 dias");
  });

  test("a demonstração e o escritório encerrado nunca entram", () => {
    const itens = precisaDeAtencao({ ...vazio, hoje: HOJE, escritorios: [esc("demo", { demonstracao: true }), esc("fim", { encerrado: true })] });
    expect(itens).toEqual([]);
  });
});

describe("a visão geral", () => {
  test("churn do mês: quem cancelou sobre os pagantes do início do mês", () => {
    const v = montarVisaoGeral({
      ...vazio,
      hoje: HOJE,
      acessos: [],
      faturas: [
        { id: "f1", organizationId: "fica", vencimento: "2026-11-02", valorCentavos: 20_000, situacao: "paga", pagaEm: "2026-11-02" },
        { id: "f2", organizationId: "fica", vencimento: "2026-11-20", valorCentavos: 20_000, situacao: "pendente", pagaEm: null },
      ],
      fotos: [{ dia: "2026-10-31", numeros: { mrrCentavos: 40_000, pagantes: 2 } }],
      cotacaoUsd: 5,
      escritorios: [esc("fica"), esc("saiu", { situacao: "cancelado", cancelamentoPedidoEm: "2026-11-03T12:00:00Z" })],
    });
    expect(v.numeros).toMatchObject({ mrrCentavos: 20_000, pagantes: 1, mrrPerdidoCentavos: 20_000, churnEscritorios: 0.5, churnReceita: 0.5, receitaRecebidaCentavos: 20_000, receitaAReceberCentavos: 20_000 });
    expect(v.mrrPorMes).toEqual([
      { mes: "2026-10", mrrCentavos: 40_000, pagantes: 2 },
      { mes: "2026-11", mrrCentavos: 20_000, pagantes: 1 },
    ]);
  });
});

describe("o uso e a IA", () => {
  test("adoção sobre os escritórios ativos e a variação contra o período anterior", () => {
    const u = montarUso({
      periodo: { de: "2026-10-07", ate: HOJE, dias: 30 },
      reais: new Set(["a", "b"]),
      ativos: new Set(["a", "b", "demo"]),
      atual: [
        { organizationId: "a", funcionalidade: "pecas", total: 6 },
        { organizationId: "demo", funcionalidade: "pecas", total: 50 },
      ],
      anterior: [{ organizationId: "a", funcionalidade: "pecas", total: 4 }],
    });
    expect(u.escritoriosAtivos).toBe(2);
    expect(u.funcionalidades.find((f) => f.chave === "pecas")).toMatchObject({ total: 6, escritorios: 1, adocao: 0.5, porEscritorio: 6, totalAnterior: 4, variacao: 0.5 });
  });

  test("o custo de cada escritório sobre a mensalidade, em 30 dias", () => {
    const r = montarCustoDaIa({
      hoje: HOJE,
      dias: 30,
      escritorios: [esc("a")],
      ia: [{ organizationId: "a", dia: HOJE, metodo: "gerar-documento", origem: "tela", chamadas: 4, mensagens: 0, custoUsd: 8, custoEstimadoUsd: 0 }],
      cotacaoUsd: 5,
      tetoSiteUsd: 4,
    });
    expect(r.porEscritorio[0]).toMatchObject({ organizationId: "a", centavos: 4000, sobreAMensalidade: 0.2 });
    expect(r.porMetodo[0]).toMatchObject({ metodo: "gerar-documento", rotulo: "Gerar peça", chamadas: 4 });
    expect(r.porPaganteUsd).toBe(8);
  });
});
