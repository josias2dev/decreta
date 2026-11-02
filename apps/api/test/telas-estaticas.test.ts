/** Quem serve o quê em produção: a landing em "/", a demonstração em /demonstracao e o app no resto. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "@decreta/db";
import { createApp } from "../src/app.ts";
import { readEnv } from "../src/env.ts";

describe("as telas compiladas", () => {
  let pasta: string;
  let app: ReturnType<typeof createApp>;

  beforeAll(() => {
    pasta = mkdtempSync(join(tmpdir(), "telas-"));
    mkdirSync(join(pasta, "assets"));
    mkdirSync(join(pasta, "demonstracao", "assets"), { recursive: true });
    writeFileSync(join(pasta, "index.html"), "o app");
    writeFileSync(join(pasta, "landing.html"), "a landing");
    writeFileSync(join(pasta, "robots.txt"), "User-agent: *");
    writeFileSync(join(pasta, "assets", "a-123.js"), "js do app");
    writeFileSync(join(pasta, "demonstracao", "index.html"), "a faixa");
    writeFileSync(join(pasta, "demonstracao", "app.html"), "a prévia");
    writeFileSync(join(pasta, "demonstracao", "assets", "previa-123.js"), "js da prévia");
    const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787", WEB_DIST: pasta });
    app = createApp({ db: {} as Database, env, log: () => {} });
  });
  afterAll(() => rmSync(pasta, { recursive: true, force: true }));

  const texto = async (caminho: string) => (await app.request(caminho)).text();

  test("a raiz é a landing estática, e as rotas do app caem no app", async () => {
    expect(await texto("/")).toBe("a landing");
    expect(await texto("/hoje")).toBe("o app");
    expect(await texto("/prazos/123")).toBe("o app");
    expect(await texto("/entrar")).toBe("o app");
  });

  test("a demonstração abre com e sem a barra, e o arquivo dela é servido", async () => {
    expect(await texto("/demonstracao")).toBe("a faixa");
    expect(await texto("/demonstracao/")).toBe("a faixa");
    expect(await texto("/demonstracao/app.html")).toBe("a prévia");
  });

  test("robots.txt é arquivo, não a tela do app", async () => {
    expect(await texto("/robots.txt")).toBe("User-agent: *");
  });

  test("o que tem hash no nome fica em cache para sempre, na demonstração também; o HTML não", async () => {
    expect((await app.request("/assets/a-123.js")).headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/demonstracao/assets/previa-123.js")).headers.get("cache-control")).toContain("immutable");
    expect((await app.request("/")).headers.get("cache-control")).toBe("no-cache");
    expect((await app.request("/demonstracao")).headers.get("cache-control")).toBe("no-cache");
  });

  test("arquivo de build que sumiu é 404, não HTML no lugar de JS", async () => {
    expect((await app.request("/assets/velho.js")).status).toBe(404);
    expect((await app.request("/demonstracao/assets/velho.js")).status).toBe(404);
  });
});
