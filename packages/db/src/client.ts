import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema/index.ts";

export type Database = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

/**
 * Conexão da aplicação. A URL deve apontar para um usuário que herda de
 * `app_user` (sujeito a RLS), nunca para o dono do schema.
 */
export function createDatabase(url: string, options: { max?: number } = {}): { db: Database; close: () => Promise<void> } {
  const client = postgres(url, { max: options.max ?? 10, onnotice: () => {} });
  return { db: drizzle(client, { schema }), close: () => client.end() };
}

/**
 * Executa `fn` numa transação com `app.org_id` fixado: as políticas de RLS só
 * deixam ler e gravar linhas deste escritório. `set_config(..., true)` vale
 * até o fim da transação, então a conexão volta ao pool sem escopo.
 */
export async function withTenant<T>(db: Database, organizationId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!organizationId) throw new Error("withTenant: organizationId vazio");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.org_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
