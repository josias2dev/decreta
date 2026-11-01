import { describe, expect, test } from "bun:test";
import { priorizarAchados, processoParado, type AchadoDaAuditoria } from "../src/auditoria.ts";

const achado = (motivo: AchadoDaAuditoria["motivo"], dias: number, id = `${motivo}-${dias}`): AchadoDaAuditoria => ({ motivo, id, titulo: id, detalhe: "", caminho: "/", dias, responsavelId: null });

describe("auditoria da carteira", () => {
  test("o que pode custar um prazo vem antes; dentro do mesmo motivo, o mais antigo", () => {
    const lista = [achado("processo_parado", 400), achado("alvara_parado", 40), achado("prazo_sem_dono", 1), achado("publicacao_sem_processo", 2), achado("publicacao_sem_processo", 5), achado("documento_faltando", 10)];
    expect(priorizarAchados(lista, 10).itens.map((a) => a.id)).toEqual([
      "prazo_sem_dono-1",
      "publicacao_sem_processo-5",
      "publicacao_sem_processo-2",
      "alvara_parado-40",
      "documento_faltando-10",
      "processo_parado-400",
    ]);
  });

  test("lista curta: no máximo o teto, com o total do que ficou de fora", () => {
    const lista = Array.from({ length: 12 }, (_, i) => achado("processo_parado", 200 + i));
    const r = priorizarAchados(lista, 8);
    expect(r.itens).toHaveLength(8);
    expect(r.total).toBe(12);
  });

  test("processo parado: 120 dias sem andamento", () => {
    expect(processoParado(119)).toBe(false);
    expect(processoParado(120)).toBe(true);
  });
});
