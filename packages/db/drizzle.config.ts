import { defineConfig } from "drizzle-kit";

// Migrations rodam com o dono do schema (DATABASE_OWNER_URL), nunca com o
// usuário da aplicação, que está sujeito a RLS.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: { url: process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL ?? "" },
});
