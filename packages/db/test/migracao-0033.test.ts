/** A migração 0033: a origem da base legal dos prazos que já existem e o search_path das funções com os poderes do dono. */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "./helpers.ts";

const SQL_DA_MIGRACAO = readFileSync(new URL("../migrations/0033_base_legal_da_ia.sql", import.meta.url), "utf8");

describe.skipIf(!hasTestDatabase)("migração 0033", () => {
  let t: TestDatabase;
  beforeAll(async () => {
    t = await createTestDatabase();
  }, 120_000);
  afterAll(async () => {
    await t?.drop();
  });

  test("toda função com os poderes do dono procura em public e pg_temp, nesta ordem", async () => {
    const funcoes = await t.owner<{ nome: string; config: string[] | null }[]>`
      select p.proname as nome, p.proconfig as config from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prosecdef order by p.proname`;
    expect(funcoes.map((f) => f.nome)).toEqual([
      "cobertura_do_djen",
      "contagem_de_eventos",
      "gasto_da_ia_no_site",
      // As do painel da plataforma (0034): só ids, datas e totais.
      "plataforma_acessos",
      "plataforma_auditoria",
      "plataforma_escritorios",
      "plataforma_faturas",
      "plataforma_fotos",
      "plataforma_gravar_foto",
      "plataforma_ia",
      "plataforma_marcos",
      "plataforma_ultimos_acessos",
      "plataforma_uso",
    ]);
    for (const f of funcoes) expect(f.config).toEqual(["search_path=public, pg_temp"]);
  });

  test("os prazos que já existem: fica com a marca o artigo que é o que a IA leu, e nenhum outro", async () => {
    const org = crypto.randomUUID();
    await t.owner`insert into organization (id, name, slug) values (${org}, 'Escritório', ${org})`;
    const [proc] = await t.owner<{ id: string }[]>`insert into processos (organization_id, titulo) values (${org}, 'Processo') returning id`;
    const novaPublicacao = async (externo: string) => (await t.owner<{ id: string }[]>`insert into publicacoes (organization_id, fonte, id_externo, disponibilizada_em, publicada_em, processo_id, texto) values (${org}, 'manual', ${externo}, '2026-10-28', '2026-10-29', ${proc!.id}, 'Teor.') returning id`)[0]!.id;
    const novoPrazo = async (publicacao: string | null, fundamento: string | null) =>
      (await t.owner<{ id: string }[]>`insert into prazos (organization_id, processo_id, publicacao_id, tipo, fundamento, dias, publicado_em, inicio, fim) values (${org}, ${proc!.id}, ${publicacao}, 'Prazo', ${fundamento}, 15, '2026-10-29', '2026-10-30', '2026-11-23') returning id`)[0]!.id;
    const leitura = (publicacao: string, fundamento: string | null) => t.owner`insert into analises (organization_id, alvo, alvo_id, acao, situacao, conteudo, base) values (${org}, 'publicacao', ${publicacao}, 'sugerir-prazo', 'pronto', ${t.owner.json({ fundamento })}, 'base')`;

    const pubIgual = await novaPublicacao("igual");
    await leitura(pubIgual, "art. 477, CPC");
    const pubOutro = await novaPublicacao("outro");
    await leitura(pubOutro, "art. 477, CPC");
    const pubSemLeitura = await novaPublicacao("sem-leitura");
    const igual = await novoPrazo(pubIgual, "art. 477, CPC");
    const outro = await novoPrazo(pubOutro, "art. 500, CPC");
    const semLeitura = await novoPrazo(pubSemLeitura, "art. 477, CPC");
    const semPublicacao = await novoPrazo(null, "art. 477, CPC");

    const preencher = SQL_DA_MIGRACAO.split("--> statement-breakpoint").find((s) => s.includes('UPDATE "prazos"'));
    expect(preencher).toBeTruthy();
    await t.owner.unsafe(preencher!);

    const marca = async (id: string) => (await t.owner<{ m: boolean }[]>`select fundamento_da_ia as m from prazos where id = ${id}`)[0]!.m;
    expect(await marca(igual)).toBe(true);
    expect(await marca(outro)).toBe(false);
    expect(await marca(semLeitura)).toBe(false);
    expect(await marca(semPublicacao)).toBe(false);
  });
});
