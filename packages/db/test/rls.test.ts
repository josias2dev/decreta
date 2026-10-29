import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { clientes, prazos, processos, withTenant } from "../src/index.ts";
import { createTestDatabase, hasTestDatabase, seedOrganization, type TestDatabase } from "./helpers.ts";

describe.skipIf(!hasTestDatabase)("isolamento por escritório (RLS)", () => {
  let t: TestDatabase;
  let a: string;
  let b: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    a = await seedOrganization(t.owner, "souza");
    b = await seedOrganization(t.owner, "mendes");
    await withTenant(t.db, a, async (tx) => {
      const [c] = await tx.insert(clientes).values({ organizationId: a, nome: "Marina Duarte" }).returning();
      const [p] = await tx
        .insert(processos)
        .values({ organizationId: a, cnj: "5004321-25.2026.8.24.0038", titulo: "Marina Duarte × Seguradora Alfa S.A.", clienteId: c!.id })
        .returning();
      await tx.insert(prazos).values({
        organizationId: a,
        processoId: p!.id,
        tipo: "Manifestação sobre laudo pericial",
        dias: 15,
        publicadoEm: "2026-10-29",
        inicio: "2026-10-30",
        fim: "2026-11-23",
      });
    });
    await withTenant(t.db, b, (tx) => tx.insert(clientes).values({ organizationId: b, nome: "Hotel Mar Azul Ltda." }));
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("cada escritório só vê o que é seu", async () => {
    const deA = await withTenant(t.db, a, (tx) => tx.select({ nome: clientes.nome }).from(clientes));
    const deB = await withTenant(t.db, b, (tx) => tx.select({ nome: clientes.nome }).from(clientes));
    expect(deA.map((c) => c.nome)).toEqual(["Marina Duarte"]);
    expect(deB.map((c) => c.nome)).toEqual(["Hotel Mar Azul Ltda."]);
    expect(await withTenant(t.db, b, (tx) => tx.select().from(prazos))).toEqual([]);
  });

  test("sem escopo, nenhuma linha", async () => {
    expect(await t.db.select().from(clientes)).toEqual([]);
    expect(await t.db.select().from(processos)).toEqual([]);
  });

  test("não grava no escritório de outro", async () => {
    const tentativa = withTenant(t.db, b, (tx) => tx.insert(clientes).values({ organizationId: a, nome: "Intruso" }));
    await expect(tentativa).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  test("não altera nem apaga o que é de outro", async () => {
    const alterados = await withTenant(t.db, b, (tx) => tx.update(clientes).set({ nome: "Trocado" }).where(eq(clientes.nome, "Marina Duarte")).returning());
    expect(alterados).toEqual([]);
    const apagados = await withTenant(t.db, b, (tx) => tx.delete(processos).returning());
    expect(apagados).toEqual([]);
    const [{ n }] = (await t.owner`select count(*)::int as n from processos`) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });

  test("todas as tabelas do domínio têm RLS ligada", async () => {
    const rows = await t.owner<{ relname: string; relrowsecurity: boolean }[]>`
      select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and exists (
        select 1 from information_schema.columns k where k.table_name = c.relname and k.column_name = 'organization_id'
      ) and c.relname not in ('member', 'invitation')`;
    expect(rows.length).toBeGreaterThan(15);
    expect(rows.filter((r) => !r.relrowsecurity).map((r) => r.relname)).toEqual([]);
  });

  test("a conexão da aplicação herda de app_user", async () => {
    const [r] = await t.db.execute<{ membro: boolean }>(sql`select pg_has_role(current_user, 'app_user', 'member') as membro`);
    expect(r?.membro).toBe(true);
  });
});
