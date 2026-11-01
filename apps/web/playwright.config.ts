/**
 * Testes de tela: o build das telas (vite preview) num Chromium, com a API
 * de mentira de e2e/apoio.ts (respostas de e2e/amostras). Rode `bun run web:build` antes.
 */
import { defineConfig } from "@playwright/test";

// `E2E_PORTA` para rodar em outra porta quando outra cópia do repositório já usa a 4179.
const PORTA = Number(process.env.E2E_PORTA) || 4179;

export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORTA}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `bunx vite preview --port ${PORTA} --strictPort`,
    url: `http://localhost:${PORTA}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
