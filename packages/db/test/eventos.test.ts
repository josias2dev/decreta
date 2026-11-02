import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { sql } from "drizzle-orm";
import { eventos, withTenant } from "../src/index.ts";
import { createTestDatabase, hasTestDatabase, seedOrganization, type TestDatabase } from "./helpers.ts";

describe.skipIf(!hasTestDatabase)("eventos do funil (RLS só de escrita)", () => {
  let t: TestDatabase;
  let a: string;
  let b: string;

  beforeAll(async () => {
    t = await createTestDatabase();
    a = await seedOrganization(t.owner, "souza");
    b = await seedOrganization(t.owner, "mendes");
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("o site grava sem escritório, e quantas vezes quiser", async () => {
    await t.db.insert(eventos).values({ nome: "visita" });
    await t.db.insert(eventos).values({ nome: "visita" });
    const [{ n }] = (await t.owner`select count(*)::int as n from eventos where nome = 'visita' and organization_id is null`) as unknown as [{ n: number }];
    expect(n).toBe(2);
  });

  test("o servidor grava o evento do escritório da transação, uma vez só", async () => {
    const gravar = () => withTenant(t.db, a, (tx) => tx.insert(eventos).values({ nome: "cadastro_concluido", organizationId: a }).onConflictDoNothing());
    await gravar();
    await gravar();
    const [{ n }] = (await t.owner`select count(*)::int as n from eventos where nome = 'cadastro_concluido' and organization_id = ${a}`) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });

  test("não grava no nome de outro escritório", async () => {
    const tentativa = withTenant(t.db, b, (tx) => tx.insert(eventos).values({ nome: "cadastro_concluido", organizationId: a }));
    await expect(tentativa).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
  });

  test("a aplicação não lê nenhuma linha, nem as do próprio escritório", async () => {
    expect(await t.db.select().from(eventos)).toEqual([]);
    expect(await withTenant(t.db, a, (tx) => tx.select().from(eventos))).toEqual([]);
  });

  test("a contagem devolve só totais por nome dentro do período, de todos os escritórios", async () => {
    await withTenant(t.db, b, (tx) => tx.insert(eventos).values({ nome: "cadastro_concluido", organizationId: b }));
    await t.owner`insert into eventos (nome, em) values ('visita', '2026-09-01T12:00:00Z')`;
    const linhas = await t.db.execute<{ nome: string; total: number }>(sql`select nome, total from contagem_de_eventos(${"2026-10-01T00:00:00Z"}::timestamptz, ${"2099-01-01T00:00:00Z"}::timestamptz) order by nome`);
    expect([...linhas]).toEqual([
      { nome: "cadastro_concluido", total: 2 },
      { nome: "visita", total: 2 },
    ]);
  });

  test("o evento de um escritório apagado fica, sem o escritório", async () => {
    await t.owner`delete from organization where id = ${b}`;
    const [{ n }] = (await t.owner`select count(*)::int as n from eventos where nome = 'cadastro_concluido' and organization_id is null`) as unknown as [{ n: number }];
    expect(n).toBe(1);
  });
});
