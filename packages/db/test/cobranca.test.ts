import { SITUACOES_DO_ESCRITORIO } from "@decreta/core";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { auditoriaDaPlataforma, eventosDeCobranca, faturas, situacaoDoEscritorio, withTenant } from "../src/index.ts";
import { createTestDatabase, hasTestDatabase, seedOrganization, seedUser, type TestDatabase } from "./helpers.ts";

test("a lista de situações do banco é a do core", () => {
  expect([...situacaoDoEscritorio.enumValues]).toEqual([...SITUACOES_DO_ESCRITORIO]);
});

describe.skipIf(!hasTestDatabase)("assinatura e cobrança (RLS e funções da plataforma)", () => {
  let t: TestDatabase;
  let a: string;
  let b: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    a = await seedOrganization(t.owner, "souza");
    b = await seedOrganization(t.owner, "mendes");
    await seedUser(t.owner, a, "ana", "Ana");
    await seedUser(t.owner, a, "caio", "Caio", "member");
    await seedUser(t.owner, b, "bia", "Bia");
    await t.owner`insert into clientes (organization_id, nome) values (${a}, 'Marina Duarte')`;
    await t.owner`insert into processos (organization_id, cnj, titulo) values (${a}, '5004321-25.2026.8.24.0038', 'Marina Duarte × Seguradora Alfa S.A.')`;
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("todo escritório que já existia nasce cortesia: a migração não trava ninguém", async () => {
    const linhas = (await t.owner`select slug, situacao::text as situacao from organization order by slug`) as unknown as { slug: string; situacao: string }[];
    expect([...linhas]).toEqual([
      { slug: "mendes", situacao: "cortesia" },
      { slug: "souza", situacao: "cortesia" },
    ]);
  });

  test("a fatura de um escritório não aparece para o outro, nem sem escopo", async () => {
    await withTenant(t.db, a, (tx) => tx.insert(faturas).values({ id: "pay_a1", organizationId: a, vencimento: "2026-12-01", valorCentavos: 9900 }));
    await withTenant(t.db, b, (tx) => tx.insert(faturas).values({ id: "pay_b1", organizationId: b, vencimento: "2026-12-02", valorCentavos: 9900 }));
    expect((await withTenant(t.db, a, (tx) => tx.select({ id: faturas.id }).from(faturas))).map((f) => f.id)).toEqual(["pay_a1"]);
    expect((await withTenant(t.db, b, (tx) => tx.select({ id: faturas.id }).from(faturas))).map((f) => f.id)).toEqual(["pay_b1"]);
    expect(await t.db.select().from(faturas)).toEqual([]);
    await expect(withTenant(t.db, b, (tx) => tx.insert(faturas).values({ id: "pay_x", organizationId: a, vencimento: "2026-12-03", valorCentavos: 1 }))).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  test("o aviso do Asaas já tratado não entra duas vezes e não é visto por outro escritório", async () => {
    const gravar = () => withTenant(t.db, a, (tx) => tx.insert(eventosDeCobranca).values({ id: "evt_1", organizationId: a, evento: "PAYMENT_RECEIVED" }).onConflictDoNothing().returning({ id: eventosDeCobranca.id }));
    expect(await gravar()).toHaveLength(1);
    expect(await gravar()).toHaveLength(0);
    expect(await withTenant(t.db, b, (tx) => tx.select().from(eventosDeCobranca))).toEqual([]);
  });

  test("a aplicação só grava na auditoria da plataforma; ler é pela função", async () => {
    await t.db.insert(auditoriaDaPlataforma).values({ operador: "equipe@decreta.site", acao: "plataforma.liberar", organizationId: a, detalhes: { motivo: "conferido" } });
    expect(await t.db.select().from(auditoriaDaPlataforma)).toEqual([]);
    const lidas = await t.db.execute<{ operador: string; acao: string; escritorio: string; detalhes: { motivo: string } }>(sql`select operador, acao, escritorio, detalhes from plataforma_auditoria(10)`);
    expect([...lidas]).toEqual([{ operador: "equipe@decreta.site", acao: "plataforma.liberar", escritorio: "souza", detalhes: { motivo: "conferido" } }]);
  });

  test("a função da plataforma devolve a conta e os totais, e nada do que é do escritório", async () => {
    const linhas = await t.db.execute<Record<string, unknown>>(sql`select * from plataforma_escritorios()`);
    const souza = [...linhas].find((l) => l.slug === "souza")!;
    expect(souza).toMatchObject({ nome: "souza", situacao: "cortesia", pessoas: 2, processos: 1, ia_mes_usd: 0 });
    // Só colunas de conta e totais: nenhum nome de cliente, número de processo ou texto de publicação.
    expect(Object.keys(souza).sort()).toEqual(
      ["acesso_ate", "assinou_em", "cancelamento_pedido_em", "criado_em", "em_avaliacao", "encerrado_em", "ia_mes_usd", "id", "inadimplente_desde", "nome", "pessoas", "processos", "situacao", "slug", "teste_ate", "valor_mensal_centavos"].sort(),
    );
    expect(JSON.stringify([...linhas])).not.toContain("Marina");
    expect(JSON.stringify([...linhas])).not.toContain("5004321");
  });
});
