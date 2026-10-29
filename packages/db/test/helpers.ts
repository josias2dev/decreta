/**
 * Banco descartável para testes de integração.
 *
 * `TEST_OWNER_URL` aponta para um usuário com CREATEDB e CREATEROLE (o dono das
 * migrations). Cada suíte cria um banco novo, aplica as migrations como dono e
 * devolve uma conexão com o usuário da aplicação, que herda de `app_user` e
 * portanto passa pelas políticas de RLS: o mesmo caminho da produção.
 */
import postgres from "postgres";
import { createDatabase, type Database } from "../src/client.ts";
import { runMigrations } from "../src/migrate.ts";

export const TEST_OWNER_URL = process.env.TEST_OWNER_URL ?? "";
export const hasTestDatabase = TEST_OWNER_URL !== "";

const APP_ROLE = "dc_test_app";
const APP_PASSWORD = "dc_test_app";

export interface TestDatabase {
  /** Conexão como usuário da aplicação (sujeita a RLS). */
  db: Database;
  /** Conexão como dono, para montar cenários sem passar pela RLS. */
  owner: postgres.Sql;
  /** URL do usuário da aplicação, para quem precisa abrir a própria conexão. */
  appUrl: string;
  drop: () => Promise<void>;
}

function withDatabase(url: string, database: string, credentials?: { user: string; password: string }): string {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (credentials) {
    u.username = credentials.user;
    u.password = credentials.password;
  }
  return u.toString();
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `dc_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const admin = postgres(TEST_OWNER_URL, { max: 1, onnotice: () => {} });
  await admin.unsafe(`create database ${name}`);

  const ownerUrl = withDatabase(TEST_OWNER_URL, name);
  await runMigrations(ownerUrl);

  const [exists] = await admin`select 1 from pg_roles where rolname = ${APP_ROLE}`;
  if (!exists) await admin.unsafe(`create role ${APP_ROLE} login password '${APP_PASSWORD}' in role app_user`);

  const owner = postgres(ownerUrl, { max: 2, onnotice: () => {} });
  const appUrl = withDatabase(TEST_OWNER_URL, name, { user: APP_ROLE, password: APP_PASSWORD });
  const app = createDatabase(appUrl, { max: 4 });

  return {
    db: app.db,
    owner,
    appUrl,
    drop: async () => {
      await app.close();
      await owner.end();
      await admin.unsafe(`drop database if exists ${name} with (force)`);
      await admin.end();
    },
  };
}

/** Cria um escritório direto como dono e devolve o id. */
export async function seedOrganization(owner: postgres.Sql, slug: string): Promise<string> {
  const orgId = `org_${slug}`;
  await owner`insert into organization (id, name, slug) values (${orgId}, ${slug}, ${slug})`;
  await owner`insert into escritorios (organization_id) values (${orgId})`;
  return orgId;
}

/** Usuário de teste (sem senha) já membro do escritório. */
export async function seedUser(owner: postgres.Sql, orgId: string, id: string, name: string, role = "owner"): Promise<string> {
  await owner`insert into "user" (id, name, email, email_verified) values (${id}, ${name}, ${`${id}@teste.local`}, true) on conflict do nothing`;
  await owner`insert into member (id, organization_id, user_id, role) values (${`m_${orgId}_${id}`}, ${orgId}, ${id}, ${role})`;
  return id;
}
