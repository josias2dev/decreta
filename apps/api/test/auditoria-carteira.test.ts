/** Auditoria da carteira: a varredura que entra no resumo da manhã, com banco de verdade (RLS). */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, seedOrganization, seedUser, type TestDatabase } from "@decreta/db/testing";
import { resumoDaManha } from "../src/servicos/avisos.ts";
import { auditarCarteira } from "../src/servicos/auditoria-carteira.ts";
import type { PainelDoDia } from "../src/servicos/hoje.ts";

const HOJE = "2026-10-29";
const diasAtras = (n: number) => new Date(Date.parse(`${HOJE}T12:00:00Z`) - n * 86_400_000);
const dia = (n: number) => diasAtras(n).toISOString().slice(0, 10);

describe.skipIf(!hasTestDatabase)("auditoria da carteira", () => {
  let t: TestDatabase;
  let orgId = "";
  const ids = { parado: "", vivo: "", prazoSemDono: "", publicacaoSolta: "", alvaraParado: "", cliente: "" };

  beforeAll(async () => {
    t = await createTestDatabase();
    orgId = await seedOrganization(t.owner, "auditoria");
    const outra = await seedOrganization(t.owner, "outra");
    await seedUser(t.owner, orgId, "u_bia", "Beatriz Souza");
    const o = t.owner;
    const [cliente] = await o`insert into clientes (organization_id, nome) values (${orgId}, 'Paula Ramos') returning id`;
    const processo = async (org: string, titulo: string, ultima: Date, extra: { responsavel?: string; situacao?: string } = {}) => {
      const [p] = await o`insert into processos (organization_id, titulo, cnj, ultima_movimentacao_em, responsavel_id, situacao, cliente_id)
        values (${org}, ${titulo}, ${`${titulo}-cnj`}, ${ultima}, ${extra.responsavel ?? null}, ${extra.situacao ?? "ativo"}, ${org === orgId ? cliente!.id : null}) returning id`;
      return p!.id as string;
    };
    ids.parado = await processo(orgId, "Paula Ramos × Banco Delta", diasAtras(200), { responsavel: "u_bia" });
    ids.vivo = await processo(orgId, "Paula Ramos × Seguradora Beta", diasAtras(3));
    await processo(orgId, "Arquivado antigo", diasAtras(900), { situacao: "arquivado" });
    await processo(outra, "Parado de outro escritório", diasAtras(500));

    const prazo = async (responsavel: string | null) => {
      const [p] = await o`insert into prazos (organization_id, processo_id, tipo, dias, publicado_em, inicio, fim, responsavel_id)
        values (${orgId}, ${ids.vivo}, 'Manifestação sobre laudo pericial', 15, ${dia(5)}, ${dia(4)}, '2026-11-24', ${responsavel}) returning id`;
      return p!.id as string;
    };
    ids.prazoSemDono = await prazo(null);
    await prazo("u_bia");

    const publicacao = async (idExterno: string, processoId: string | null, situacao: string) => {
      const [p] = await o`insert into publicacoes (organization_id, id_externo, disponibilizada_em, publicada_em, tribunal, processo_id, texto, situacao)
        values (${orgId}, ${idExterno}, ${dia(2)}, ${dia(1)}, 'TJSC', ${processoId}, 'Intimação.', ${situacao}) returning id`;
      return p!.id as string;
    };
    ids.publicacaoSolta = await publicacao("1", null, "nova");
    await publicacao("2", ids.vivo!, "nova");
    await publicacao("3", null, "lida");

    const alvara = async (expedido: string) => {
      const [a] = await o`insert into alvaras (organization_id, processo_id, descricao, valor, etapa, expedido_em) values (${orgId}, ${ids.vivo}, 'Depósito judicial', '12400.00', 'aguardando_saque', ${expedido}) returning id`;
      return a!.id as string;
    };
    ids.alvaraParado = await alvara(dia(45));
    await alvara(dia(10));

    ids.cliente = cliente!.id;
    await o`insert into analises (organization_id, alvo, alvo_id, acao, situacao, conteudo, base)
      values (${orgId}, 'cliente', ${cliente!.id}, 'conferir-pasta', 'pronto',
        ${o.json({ itens: [{ item: "procuracao", situacao: "falta", detalhe: "Não está na pasta.", documento: null }, { item: "cpf", situacao: "certo", detalhe: "Confere.", documento: "rg.pdf" }], outros: [], resumo: "Falta a procuração.", recusa: null })}, 'x')`;
  }, 60_000);

  afterAll(async () => {
    await t?.drop();
  });

  test("acha o processo parado, o prazo sem dono, a publicação sem processo, o alvará parado e o documento faltando", async () => {
    const r = await withTenant(t.db, orgId, (tx) => auditarCarteira(tx, HOJE));
    expect(r.itens.map((a) => [a.motivo, a.id])).toEqual([
      ["prazo_sem_dono", ids.prazoSemDono],
      ["publicacao_sem_processo", ids.publicacaoSolta],
      ["alvara_parado", ids.alvaraParado],
      ["documento_faltando", ids.cliente],
      ["processo_parado", ids.parado],
    ]);
    const parado = r.itens.find((a) => a.motivo === "processo_parado")!;
    expect(parado).toMatchObject({ caminho: `/processos/${ids.parado}`, dias: 200, responsavelId: "u_bia" });
    expect(parado.detalhe).toContain("200 dias");
    expect(r.itens.find((a) => a.motivo === "documento_faltando")!.detalhe).toContain("procuração");
    expect(r.itens.find((a) => a.motivo === "alvara_parado")!.detalhe).toContain("45 dias");
  });

  test("o resumo da manhã leva a auditoria: o que é da pessoa e o que não tem dono", () => {
    const painel = {
      hoje: HOJE,
      rotulo: "quinta, 29 de outubro",
      contadores: { vencemHoje: 0, vencidos: 0, publicacoesNovas: 0, publicacoesComPrazo: 0, publicacoesSemLeitura: 0, audienciasHoje: 0, alvarasAguardando: 0 },
      itens: [],
      publicacoes: [],
      porResponsavel: [],
      alertasDaCaptura: [],
      auditoria: {
        total: 2,
        itens: [
          { motivo: "processo_parado", id: "p1", titulo: "Paula Ramos × Banco Delta", detalhe: "Sem andamento há 200 dias.", caminho: "/processos/p1", dias: 200, responsavelId: "u_bia" },
          { motivo: "processo_parado", id: "p2", titulo: "Caso do Tiago", detalhe: "Sem andamento há 150 dias.", caminho: "/processos/p2", dias: 150, responsavelId: "u_tiago" },
        ],
      },
    } satisfies PainelDoDia;
    const texto = resumoDaManha(painel, { id: "u_bia", apelido: "Bia" }, "https://decreta.local")!;
    expect(texto).toContain("*Auditoria da carteira (1)*");
    expect(texto).toContain("Processo parado · Paula Ramos × Banco Delta");
    expect(texto).toContain("https://decreta.local/processos/p1");
    expect(texto).not.toContain("Caso do Tiago");
  });
});
