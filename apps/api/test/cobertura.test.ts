/**
 * A página de cobertura lê daqui: por tribunal, a última leitura do DJEN e o
 * calendário da conta. Rota aberta: nada de escritório sai, a resposta fica em
 * cache e o limitador vale.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { randomBytes } from "node:crypto";
import { createApp } from "../src/app.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { readEnv } from "../src/env.ts";

const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

/** A lista de tribunais do DJEN, de mentira: o formato da API do CNJ, por UF. */
const listaDoDjen = async () => new Response(JSON.stringify([{ uf: "SC", instituicoes: [{ sigla: "TJSC", dataUltimoEnvio: "30/10/2026" }, { sigla: "TRT12", dataUltimoEnvio: "29/10/2026" }] }, { uf: "BA", instituicoes: [{ sigla: "TJBA", dataUltimoEnvio: "30/10/2026" }] }]), { status: 200 });
const djenFora = async () => new Response("erro", { status: 503 });

describe.skipIf(!hasTestDatabase)("a cobertura por tribunal", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await t.owner`insert into organization (id, name, slug, created_at) values ('org-a', 'Escritório Secreto A', 'secreto-a', now()), ('org-b', 'Escritório Secreto B', 'secreto-b', now()), ('org-demo', 'Demonstração', ${SLUG_DA_DEMONSTRACAO}, now())`;
    await t.owner`insert into cadernos_djen (organization_id, tribunal, dia, situacao, total, casadas, lido_em, ultimo_envio) values
      ('org-a', 'TJSC', '2026-10-29', 'lido', 900, 7, '2026-10-29T07:31:00Z', '2026-10-29'),
      ('org-b', 'TJSC', '2026-10-30', 'lido', 950, 3, '2026-10-30T07:31:00Z', '2026-10-30'),
      ('org-b', 'TJSC', '2026-10-31', 'ausente', 0, 0, '2026-10-31T07:31:00Z', null),
      ('org-a', 'TJMG', '2026-10-30', 'erro', 0, 0, '2026-10-30T07:40:00Z', null),
      ('org-demo', 'TJRS', '2026-10-30', 'lido', 10, 2, '2026-10-30T07:31:00Z', null)`;
  });
  afterAll(async () => {
    await t?.drop();
  });

  const pedir = (app: ReturnType<typeof createApp>, ip?: string) => app.request("/api/cobertura", ip ? { headers: { "x-forwarded-for": ip } } : undefined);

  test("por tribunal: a última leitura que deu certo, o último envio e o calendário da conta", async () => {
    const app = createApp({ db: t.db, env, fetchDoDjen: listaDoDjen as unknown as typeof fetch, log: () => {} });
    const res = await pedir(app);
    expect(res.status).toBe(200);
    const corpo = (await res.json()) as { listaDoDjen: boolean; tribunais: { sigla: string; calendario: string; ultimaLeitura: { dia: string; em: string } | null; ultimoEnvio: string | null }[] };
    expect(corpo.listaDoDjen).toBe(true);
    const de = (sigla: string) => corpo.tribunais.find((x) => x.sigla === sigla);
    expect(de("TJSC")).toMatchObject({ nome: "Justiça estadual: Santa Catarina", calendario: "proprio", ultimoEnvio: "2026-10-30", ultimaLeitura: { dia: "2026-10-30" } });
    expect(de("TJSC")?.ultimaLeitura?.em).toBe("2026-10-30T07:31:00.000Z");
    // Nunca leu com sucesso: aparece sem leitura, com o calendário que tem.
    expect(de("TJMG")).toMatchObject({ calendario: "proprio", ultimaLeitura: null });
    // Sem nenhum escritório lendo o caderno, o tribunal aparece e o calendário diz a verdade.
    expect(de("TJBA")).toMatchObject({ calendario: "nacional", ultimaLeitura: null, ultimoEnvio: "2026-10-30" });
  });

  test("nada de escritório sai: nem nome, nem contagem, e a demonstração não conta como leitura", async () => {
    const app = createApp({ db: t.db, env, fetchDoDjen: listaDoDjen as unknown as typeof fetch, log: () => {} });
    const texto = await (await pedir(app)).text();
    expect(texto).not.toContain("Secreto");
    expect(texto).not.toContain("org-");
    expect(texto).not.toContain("casadas");
    expect(texto).not.toContain("total");
    const corpo = JSON.parse(texto) as { tribunais: { sigla: string; ultimaLeitura: unknown }[] };
    expect(corpo.tribunais.find((x) => x.sigla === "TJRS")?.ultimaLeitura).toBeNull();
  });

  test("com a lista do DJEN fora do ar, a página continua e diz isso", async () => {
    const app = createApp({ db: t.db, env, fetchDoDjen: djenFora as unknown as typeof fetch, log: () => {} });
    const corpo = (await (await pedir(app)).json()) as { listaDoDjen: boolean; tribunais: { sigla: string; ultimoEnvio: string | null }[] };
    expect(corpo.listaDoDjen).toBe(false);
    // O último envio guardado na leitura do caderno continua valendo.
    expect(corpo.tribunais.find((x) => x.sigla === "TJSC")?.ultimoEnvio).toBe("2026-10-30");
  });

  test("a resposta fica em cache: no navegador e no servidor, sem chamar o DJEN a cada visita", async () => {
    let chamadas = 0;
    const contando = (async () => {
      chamadas++;
      return listaDoDjen();
    }) as unknown as typeof fetch;
    const app = createApp({ db: t.db, env, fetchDoDjen: contando, log: () => {} });
    const res = await pedir(app);
    expect(res.headers.get("cache-control")).toContain("public");
    await pedir(app);
    expect(chamadas).toBe(1);
  });

  test("o limitador das rotas abertas vale", async () => {
    const app = createApp({ db: t.db, env, fetchDoDjen: listaDoDjen as unknown as typeof fetch, log: () => {} });
    let ultimo = 200;
    for (let i = 0; i < 31; i++) ultimo = (await pedir(app, "203.0.113.9")).status;
    expect(ultimo).toBe(429);
    expect((await pedir(app, "203.0.113.10")).status).toBe(200);
  });
});
