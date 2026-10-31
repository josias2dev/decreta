/**
 * As ferramentas do Perguntar por dentro: o esquema que vai para a IA (sem a
 * regra longa de uuid nem "$schema"), a conferência do pedido com o motivo
 * curto em português, a falha por dentro que não vaza o SQL e os autos que
 * listam o que não coube.
 */
import { describe, expect, test } from "bun:test";
import { asSchema } from "ai";
import { FALHOU, FalhaNaConsulta, ferramentasDoEscritorio, lerPedido, NaoAchou, PedidoErrado, textoDoProcesso, filtroDePrazos, type ContextoDoProcesso, type DadosDoEscritorio } from "../src/index.ts";

const vazio = new Proxy({}, { get: () => async () => ({ total: 0, itens: [] }) }) as DadosDoEscritorio;
const opcoes = { toolCallId: "x", messages: [], context: {} } as never;
const erroDe = async (p: unknown) => {
  try {
    await p;
  } catch (e) {
    return e as Error;
  }
  throw new Error("era para dar erro");
};

describe("o esquema das ferramentas", () => {
  test("o id não leva a regra de uuid nem o esquema leva \"$schema\"; o resto do formato continua", async () => {
    const f = ferramentasDoEscritorio(vazio);
    const esquemas = await Promise.all(Object.values(f).map(async (x) => JSON.stringify(await asSchema(x.inputSchema as never).jsonSchema)));
    const tudo = esquemas.join("");
    expect(tudo).not.toContain("$schema");
    expect(tudo).not.toContain("[0-9a-fA-F]{8}");
    expect(tudo).not.toContain('"format":"uuid"');
    const prazos = (await asSchema(f.buscarPrazos.inputSchema).jsonSchema) as { properties: Record<string, Record<string, unknown>>; additionalProperties: boolean };
    expect(prazos.additionalProperties).toBe(false);
    expect(prazos.properties.limite).toMatchObject({ type: "integer", minimum: 1, maximum: 50 });
    expect(prazos.properties.de).toMatchObject({ type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" });
    expect(prazos.properties.processoId).toEqual({ type: "string", description: "Id do processo, como veio de outra ferramenta" });
    expect(Object.keys(prazos.properties)).toEqual(["de", "ate", "situacao", "aConfirmar", "responsavel", "processoId", "clienteId", "busca", "limite"]);
    expect(Object.keys(f)).toContain("lerPublicacao");
  });
});

describe("o pedido da IA", () => {
  test("errado, volta um motivo curto por campo", () => {
    const motivo = (bruto: unknown) => {
      try {
        lerPedido(filtroDePrazos, bruto);
      } catch (e) {
        expect(e).toBeInstanceOf(PedidoErrado);
        return (e as Error).message;
      }
      return "passou";
    };
    expect(motivo({ limite: 0 })).toBe("limite: no mínimo 1.");
    expect(motivo({ limite: 2.5 })).toBe("limite: precisa ser número inteiro.");
    expect(motivo({ de: "2026-11-31", ate: "29/10/2026" })).toBe("de: 2026-11-31 é um dia que não existe; ate: use o formato AAAA-MM-DD.");
    expect(motivo({ processoId: "Marina" })).toBe("processoId: não é um id: use o id que veio de outra ferramenta.");
    expect(motivo({ responsavel: "   " })).toBe("responsavel: pelo menos 1 caracteres.");
    expect(motivo({ aConfirmar: "sim" })).toBe("aConfirmar: precisa ser true ou false.");
    expect(motivo({ de: "2028-02-29", processoId: "00000000-0000-4000-8000-000000000000" })).toBe("passou");
  });

  test("não achou e pedido errado passam como estão; falha por dentro vira a frase curta, com a causa guardada para o log", async () => {
    const sql = new Error("Failed query: select * from prazos where tipo ilike $1\nparams: %Marina%");
    const f = ferramentasDoEscritorio({
      ...vazio,
      prazos: async () => Promise.reject(sql),
      processo: async () => null,
      clientes: async () => Promise.reject(new PedidoErrado("Diga um nome.")),
    });
    const falha = await erroDe(f.buscarPrazos.execute!({}, opcoes));
    expect(falha).toBeInstanceOf(FalhaNaConsulta);
    expect(falha.message).toBe(FALHOU);
    expect((falha as FalhaNaConsulta).causa).toBe(sql);
    const nao = await erroDe(f.lerProcesso.execute!({ processoId: "00000000-0000-4000-8000-000000000000" }, opcoes));
    expect(nao).toBeInstanceOf(NaoAchou);
    expect((await erroDe(f.buscarClientes.execute!({ busca: "Ma" }, opcoes))).message).toBe("Diga um nome.");
  });

  test("busca por palavra que não achou nada leva a dica do que mais tentar; sem palavra, ou achando, não", async () => {
    const f = ferramentasDoEscritorio(new Proxy({}, { get: (_, nome) => async () => ({ total: nome === "prazos" ? 2 : 0, itens: [] }) }) as DadosDoEscritorio);
    const dica = async (nome: keyof typeof f, entrada: Record<string, unknown>) => ((await f[nome].execute!(entrada as never, opcoes)) as { dica?: string }).dica;
    expect(await dica("buscarProcessos", { busca: "processo da Marina" })).toContain("situacao todos");
    expect(await dica("buscarClientes", { busca: "Marina" })).toContain("buscarProcessos");
    expect(await dica("buscarDocumentos", { busca: "laudo" })).toContain("uma palavra só");
    expect(await dica("buscarPublicacoes", { busca: "50398954020254047215" })).toContain("situacao todas");
    expect(await dica("buscarProcessos", {})).toBeUndefined();
    expect(await dica("buscarPrazos", { busca: "Marina" })).toBeUndefined();
  });
});

describe("os autos que a IA lê", () => {
  const base = (n: { docs?: number; tamanho?: number; andamentos?: number; total?: number }): ContextoDoProcesso => ({
    processo: { cnj: "5004321-25.2026.8.24.0038", titulo: "Marina Duarte × Seguradora Alfa S.A.", tribunal: "TJSC", classe: null, assunto: null, orgao: null, comarca: "Joinville", valorCausa: null, poloCliente: "ativo", cliente: "Marina Duarte" },
    partes: [],
    movimentacoes: Array.from({ length: n.andamentos ?? 3 }, (_, i) => ({ em: `2026-10-${String(28 - (i % 20)).padStart(2, "0")}T10:00`, evento: 100 - i, titulo: `Andamento ${i}`, descricao: null })),
    totalDeMovimentacoes: n.total,
    publicacoes: [{ id: "pub-1", disponibilizadaEm: "2026-10-27", publicadaEm: "2026-10-28", tipoComunicacao: "Intimação", tipoDocumento: "Sentença", orgao: null, texto: "Julgo procedente." }],
    documentos: Array.from({ length: n.docs ?? 0 }, (_, i) => ({ id: `doc-${i + 1}`, nome: `Documento ${i + 1}`, evento: 50 + i, texto: "x".repeat(n.tamanho ?? 100) })),
  });

  test("tudo coube: nada de lista no fim", () => {
    const t = textoDoProcesso(base({ docs: 2 }));
    expect(t).toContain("## Documento: Documento 2 (evento 51)");
    expect(t).not.toContain("Fora deste texto");
  });

  test("o que não coube vai listado no fim, pelo nome; com a dica de leitura, também com o id", () => {
    const t = textoDoProcesso(base({ docs: 4, tamanho: 3_000 }), 8_000);
    expect(t.length).toBeLessThanOrEqual(8_000);
    expect(t).toContain("## Documento: Documento 1 (evento 50)");
    expect(t).toContain("[documento cortado aqui]");
    expect(t).toContain("## Fora deste texto (não couberam)");
    expect(t).toContain("- Documento: Documento 3 (evento 52) (cortado acima)");
    expect(t).toContain("- Documento: Documento 4 (evento 53)");
    expect(t).not.toContain("doc-4");

    const comIds = textoDoProcesso(base({ docs: 4, tamanho: 3_000 }), 8_000, { comoLer: "Use lerDocumento com o id." });
    expect(comIds).toContain("- Documento: Documento 4 (evento 53), id doc-4");
    expect(comIds).toEndWith("Use lerDocumento com o id.");
  });

  test("andamentos que não entraram são contados", () => {
    const t = textoDoProcesso(base({ andamentos: 10, total: 130 }), undefined, { andamentos: 4 });
    expect(t.match(/^- \d{2}\/10\/2026 \(evento/gm)?.length).toBe(4);
    expect(t).toContain("- 126 andamentos mais antigos");
  });
});
