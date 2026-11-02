/**
 * Exportar tudo: o sócio pede, a rotina monta planilhas CSV e junta os
 * documentos em ZIP, avisa por e-mail, e a cópia só traz o que é do escritório.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria, type Armazenamento } from "@decreta/documentos";
import JSZip from "jszip";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { createRotas } from "../src/rotas/index.ts";
import { apagarExportacoesVencidas, DIAS_DA_COPIA, marcarExportacaoFalhou, NAO_EXPORTADAS, prepararExportacao, tabelasExportadas } from "../src/servicos/exportacao.ts";

const SENHA = "senha-bem-longa-123";
const DIA_MS = 24 * 60 * 60 * 1000;
const PDF = new Uint8Array([37, 80, 68, 70, 45, 49, 0, 255, 128, 7]);

describe.skipIf(!hasTestDatabase)("exportar tudo", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  const arquivos = armazenamentoEmMemoria();
  const mailer = createLogMailer(() => {});
  const pedidos: Pedido[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  let falhaNaFila = false;

  let souza = "";
  let mendes = "";
  let beatriz = "";
  let cookieBeatriz = "";
  let cookieRafael = "";
  let cookieTiago = "";
  let cookieDemo = "";
  let documentoId = "";

  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const com = (cookie: string, path: string, init: { method?: string; json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { method: init.method ?? (init.json !== undefined ? "POST" : "GET"), headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie }, body: init.json !== undefined ? JSON.stringify(init.json) : undefined });
  const entrar = async (email: string) => {
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: SENHA }) });
    expect(r.status).toBe(200);
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  };
  const deps = (extra: Partial<Parameters<typeof prepararExportacao>[0]> = {}) => ({ db: t.db, arquivos, mailer, telas: "https://decreta.local", ...extra });
  const exportacaoDe = async (orgId: string) => (await t.owner<{ id: string; situacao: string }[]>`select id, situacao from exportacoes where organization_id = ${orgId} order by created_at desc limit 1`)[0]!;
  const abrirZip = async (bytes: Uint8Array) => JSZip.loadAsync(bytes);
  const texto = async (zip: JSZip, nome: string) => zip.file(nome)!.async("string");

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({
      db: t.db,
      auth,
      ia: null,
      arquivos,
      mailer,
      telas: "https://decreta.local",
      captura: { db: t.db, datajudKey: "" },
      maxArquivoBytes: 5e6,
      enfileirar: async (p) => {
        if (falhaNaFila) throw new Error("fila fora do ar");
        pedidos.push(p);
      },
      log: () => {},
    });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const novo = (nome: string, slug: string, email: string, pessoa: string) => criarEscritorio(t.db, auth, { nome, slug, dono: { email, nome: pessoa, senha: SENHA, cargo: "Advogada", oabNumero: "41233", oabUf: "SC", whatsapp: "5547991234567" } });
    ({ organizationId: souza, userId: beatriz } = await novo("Souza & Mendes Advocacia", "souza-mendes", "beatriz@souza.adv.br", "Beatriz Souza"));
    ({ organizationId: mendes } = await novo("Mendes Advogados", "mendes", "tiago@mendes.adv.br", "Tiago Mendes"));
    await novo("Demonstração", SLUG_DA_DEMONSTRACAO, "teste@decreta.site", "Sócia da Demonstração");
    const { organizationId: lima, userId: rafael } = await novo("Rafael Lima Advocacia", "rafael-lima", "rafael@lima.adv.br", "Rafael Lima");
    void lima;
    await t.owner`insert into member (id, organization_id, user_id, role) values (${crypto.randomUUID()}, ${souza}, ${rafael}, 'member')`;
    cookieBeatriz = await entrar("beatriz@souza.adv.br");
    cookieRafael = await entrar("rafael@lima.adv.br");
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie: cookieRafael, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: souza }) });
    cookieTiago = await entrar("tiago@mendes.adv.br");
    cookieDemo = await entrar("teste@decreta.site");

    // O escritório Souza, com um pouco de tudo (e dados de nomes difíceis para o CSV).
    const [cliente] = await t.owner<{ id: string }[]>`insert into clientes (organization_id, nome, documento, email, observacoes) values (${souza}, 'José da Conceição; Filho', '52998224725', 'jose@exemplo.com', ${'Disse: "ligar às 9h"\ne depois às 14h'}) returning id`;
    await t.owner`insert into clientes (organization_id, nome) values (${souza}, '=HYPERLINK("http://golpe.example","clique")')`;
    const [proc] = await t.owner<{ id: string }[]>`insert into processos (organization_id, cnj, titulo, cliente_id, valor_causa) values (${souza}, '5004321-25.2026.8.24.0038', 'José da Conceição × Seguradora Alfa', ${cliente!.id}, 12345.67) returning id`;
    await t.owner`insert into partes (organization_id, processo_id, nome, polo) values (${souza}, ${proc!.id}, 'Seguradora Alfa S.A.', 'passivo')`;
    await t.owner`insert into movimentacoes (organization_id, processo_id, em, titulo, chave) values (${souza}, ${proc!.id}, now(), 'Juntada de laudo', 'm1')`;
    const [pub] = await t.owner<{ id: string }[]>`insert into publicacoes (organization_id, id_externo, disponibilizada_em, publicada_em, texto, certidao, destinatarios) values (${souza}, '4123', '2026-10-28', '2026-10-29', 'Intimem-se para manifestação em 15 dias.', ${`${souza}/certidoes/p1.pdf`}, '[{"nome":"JOSÉ"}]'::jsonb) returning id`;
    await arquivos.put(`${souza}/certidoes/p1.pdf`, PDF, "application/pdf");
    await t.owner`insert into prazos (organization_id, processo_id, publicacao_id, tipo, dias, publicado_em, inicio, fim) values (${souza}, ${proc!.id}, ${pub!.id}, 'Manifestação sobre laudo', 15, '2026-10-29', '2026-10-30', '2026-11-23')`;
    await t.owner`insert into audiencias (organization_id, processo_id, em, tipo) values (${souza}, ${proc!.id}, now(), 'Conciliação')`;
    await t.owner`insert into tarefas (organization_id, titulo, dia) values (${souza}, 'Ligar para o cliente', '2026-11-03')`;
    await t.owner`insert into alvaras (organization_id, processo_id, descricao, valor) values (${souza}, ${proc!.id}, 'Alvará do acordo', 5000)`;
    await t.owner`insert into atendimentos (organization_id, cliente_id, resumo) values (${souza}, ${cliente!.id}, 'Primeira conversa')`;
    await t.owner`insert into negocios (organization_id, nome, assunto) values (${souza}, 'Carla Dias', 'Revisional')`;
    await t.owner`insert into pecas (organization_id, processo_id, tipo, titulo, texto) values (${souza}, ${proc!.id}, 'manifestacao', 'Manifestação sobre o laudo', '# Excelentíssimo Senhor')`;
    await t.owner`insert into modelos (organization_id, titulo, tipo, texto) values (${souza}, 'Contestação padrão', 'contestacao', 'Texto do modelo')`;
    await t.owner`insert into conversas (organization_id, user_id, titulo) values (${souza}, ${beatriz}, 'Prazos da semana')`;
    await t.owner`insert into mensagens_cliente (organization_id, cliente_id, tipo, texto, link_hash) values (${souza}, ${cliente!.id}, 'documentos', 'Faltam documentos', 'hash-secreto-do-link-de-envio')`;
    await t.owner`insert into tokens_mcp (organization_id, user_id, nome, hash) values (${souza}, ${beatriz}, 'Meu computador', 'hash-secreto-do-token')`;
    await t.owner`insert into uso_ia (organization_id, user_id, metodo, origem, em) values (${souza}, ${beatriz}, 'perguntar', 'tela', now())`;
    await t.owner`insert into auditoria (organization_id, user_id, acao) values (${souza}, ${beatriz}, 'prazo.confirmado')`;
    documentoId = crypto.randomUUID();
    await t.owner`insert into documentos (id, organization_id, processo_id, nome, mime, tamanho, chave, texto) values (${documentoId}, ${souza}, ${proc!.id}, 'Laudo pericial.pdf', 'application/pdf', ${PDF.length}, ${`${souza}/${documentoId}`}, 'TEXTO EXTRAIDO DO LAUDO')`;
    await arquivos.put(`${souza}/${documentoId}`, PDF, "application/pdf");
    // Um documento cujo arquivo sumiu do armazenamento.
    await t.owner`insert into documentos (id, organization_id, nome, mime, tamanho, chave) values (${crypto.randomUUID()}, ${souza}, 'Procuração perdida.pdf', 'application/pdf', 3, ${`${souza}/arquivo-que-sumiu`})`;

    // O escritório Mendes: nada disto pode aparecer na cópia da Souza.
    const [c2] = await t.owner<{ id: string }[]>`insert into clientes (organization_id, nome) values (${mendes}, 'Hotel Mar Azul Ltda.') returning id`;
    const mendesDoc = crypto.randomUUID();
    await t.owner`insert into documentos (id, organization_id, cliente_id, nome, mime, tamanho, chave) values (${mendesDoc}, ${mendes}, ${c2!.id}, 'Contrato social do hotel.pdf', 'application/pdf', 3, ${`${mendes}/${mendesDoc}`})`;
    await arquivos.put(`${mendes}/${mendesDoc}`, new Uint8Array([9, 9, 9]), "application/pdf");
  });

  afterAll(async () => {
    await t?.drop();
  });

  describe("quem pode pedir", () => {
    test("só sócio: a equipe recebe 403, e quem não entrou 401", async () => {
      const r = await com(cookieRafael, "/escritorio/exportacoes", { json: {} });
      expect(r.status).toBe(403);
      expect((await json(r)).erro).toBe("so_socios");
      expect((await com(cookieRafael, "/escritorio/exportacoes")).status).toBe(403);
      expect((await com("", "/escritorio/exportacoes", { json: {} })).status).toBe(401);
    });

    test("na demonstração, não", async () => {
      const r = await com(cookieDemo, "/escritorio/exportacoes", { json: {} });
      expect(r.status).toBe(403);
      expect((await json(r)).erro).toBe("demonstracao");
    });

    test("o sócio pede: a resposta é imediata, vai para a fila e o pedido fica no registro; outro pedido enquanto prepara é recusado", async () => {
      const r = await com(cookieBeatriz, "/escritorio/exportacoes", { json: {} });
      expect(r.status).toBe(202);
      const { id } = await json<{ id: string }>(r);
      expect(pedidos).toContainEqual({ nome: "exportacao.pedida", organizationId: souza, exportacaoId: id });
      expect(await exportacaoDe(souza)).toEqual({ id, situacao: "pedida" });
      const [registro] = await t.owner<{ user_id: string }[]>`select user_id from auditoria where organization_id = ${souza} and acao = 'exportacao.pedida'`;
      expect(registro!.user_id).toBe(beatriz);
      const lista = await json(com(cookieBeatriz, "/escritorio/exportacoes"));
      expect(lista.itens).toMatchObject([{ id, situacao: "pedida", pedidaPor: "Beatriz Souza", partes: [] }]);
      const de_novo = await com(cookieBeatriz, "/escritorio/exportacoes", { json: {} });
      expect(de_novo.status).toBe(409);
      expect((await json(de_novo)).erro).toBe("ja_preparando");
    });
  });

  describe("a cópia pronta", () => {
    let id = "";
    let zip: JSZip;
    let partes: { n: number; nome: string; tamanho: number }[] = [];

    beforeAll(async () => {
      id = (await exportacaoDe(souza)).id;
      await prepararExportacao(deps(), souza, id);
      const lista = await json(com(cookieBeatriz, "/escritorio/exportacoes"));
      partes = lista.itens[0].partes;
      const baixada = await com(cookieBeatriz, `/escritorio/exportacoes/${id}/partes/1`);
      expect(baixada.status).toBe(200);
      zip = await abrirZip(new Uint8Array(await baixada.arrayBuffer()));
    });

    test("fica pronta, com validade de 7 dias, e a lista diz onde baixar", async () => {
      const [e] = await t.owner<{ situacao: string; pronta_em: Date; expira_em: Date; documentos: number; erro: string | null }[]>`select situacao, pronta_em, expira_em, documentos, erro from exportacoes where id = ${id}`;
      // Os arquivos guardados que entraram: o documento e a certidão (o outro documento perdeu o arquivo).
      expect(e).toMatchObject({ situacao: "pronta", documentos: 2, erro: null });
      expect(e!.expira_em.getTime() - e!.pronta_em.getTime()).toBe(DIAS_DA_COPIA * DIA_MS);
      expect(partes).toHaveLength(1);
      expect(partes[0]!.nome).toMatch(/^decreta-souza-mendes-\d{4}-\d{2}-\d{2}\.zip$/);
      expect(partes[0]!.tamanho).toBeGreaterThan(0);
    });

    test("quem pediu recebe o aviso por e-mail, com o link das Configurações", async () => {
      const aviso = mailer.sent.find((e) => e.to === "beatriz@souza.adv.br");
      expect(aviso?.subject).toBe("A cópia dos dados de Souza & Mendes Advocacia está pronta");
      expect(aviso?.action?.url).toBe("https://decreta.local/configuracoes");
      expect(aviso?.paragraphs.join(" ")).toContain("7 dias");
    });

    test("tem as planilhas de cada assunto e o LEIA-ME", async () => {
      const nomes = Object.keys(zip.files).sort();
      for (const p of ["clientes", "processos", "partes", "movimentacoes", "publicacoes", "prazos", "audiencias", "tarefas", "alvaras", "atendimentos", "novos_negocios", "pecas", "modelos", "documentos", "equipe", "escritorio", "registro_de_atividades", "conversas", "mensagens_ao_cliente"]) {
        expect(nomes).toContain(`planilhas/${p}.csv`);
      }
      expect(nomes).toContain("LEIA-ME.txt");
      // A configuração do prazo interno vai junto com as outras do escritório.
      expect(await texto(zip, "planilhas/escritorio.csv")).toContain("prazo_interno_dias");
      const leia = await texto(zip, "LEIA-ME.txt");
      expect(leia).toContain("Cópia dos dados de Souza & Mendes Advocacia");
      expect(leia).toContain("- clientes: 2");
      expect(leia).toContain("- documentos/: os 2 arquivos guardados");
    });

    test("o CSV abre no Excel em português: BOM, ponto e vírgula, aspas e quebra de linha dentro da célula, acento certo", async () => {
      const csv = await texto(zip, "planilhas/clientes.csv");
      expect(csv.startsWith("﻿id;organization_id;nome;tipo;documento;telefone;email;endereco;observacoes;")).toBe(true);
      expect(csv).toContain('"José da Conceição; Filho"');
      expect(csv).toContain('"Disse: ""ligar às 9h""\ne depois às 14h"');
      expect(csv).toContain(";52998224725;");
    });

    test("texto que o Excel leria como fórmula ganha apóstrofo; número e data ficam como estão", async () => {
      const clientes = await texto(zip, "planilhas/clientes.csv");
      expect(clientes).toContain("'=HYPERLINK(");
      expect(clientes).not.toMatch(/(^|;)=HYPERLINK/m);
      expect(await texto(zip, "planilhas/processos.csv")).toContain(";12345.67;");
      expect(await texto(zip, "planilhas/prazos.csv")).toContain(";2026-11-23;");
    });

    test("valores com estrutura saem como JSON, e a equipe sai com nome, e-mail e papel da conta", async () => {
      expect(await texto(zip, "planilhas/publicacoes.csv")).toContain('"[{""nome"":""JOSÉ""}]"');
      const equipe = await texto(zip, "planilhas/equipe.csv");
      expect(equipe).toContain("user_id;nome;email;papel;apelido;cargo;oab_numero;oab_uf;whatsapp;aviso_manha");
      expect(equipe).toContain(";Beatriz Souza;beatriz@souza.adv.br;owner;Beatriz;Advogada;41233;SC;5547991234567;true");
      expect(equipe).toContain(";Rafael Lima;rafael@lima.adv.br;member;");
    });

    test("os documentos vão com os bytes exatos, e a planilha diz onde cada um está; a certidão também", async () => {
      const caminho = `documentos/${documentoId.slice(0, 8)}-Laudo pericial.pdf`;
      expect([...(await zip.file(caminho)!.async("uint8array"))]).toEqual([...PDF]);
      expect(await texto(zip, "planilhas/documentos.csv")).toContain(`;${caminho}`);
      expect([...(await zip.file("certidoes/certidao-4123.pdf")!.async("uint8array"))]).toEqual([...PDF]);
      expect(await texto(zip, "planilhas/publicacoes.csv")).toContain(";certidoes/certidao-4123.pdf");
    });

    test("o arquivo que sumiu do armazenamento fica listado no LEIA-ME, e a cópia sai mesmo assim", async () => {
      const leia = await texto(zip, "LEIA-ME.txt");
      expect(leia).toContain("Arquivos que não foram encontrados no armazenamento");
      expect(leia).toContain("Procuração perdida.pdf");
    });

    test("não leva segredo, chave do armazenamento, texto extraído nem registro técnico", async () => {
      const tudo = (await Promise.all(Object.keys(zip.files).filter((n) => n.endsWith(".csv")).map((n) => texto(zip, n)))).join("\n");
      for (const proibido of ["hash-secreto-do-link-de-envio", "hash-secreto-do-token", "TEXTO EXTRAIDO DO LAUDO", `${souza}/${documentoId}`, `${souza}/certidoes/p1.pdf`]) expect(tudo).not.toContain(proibido);
      const nomes = Object.keys(zip.files);
      for (const tecnico of ["uso_ia", "tokens_mcp", "capturas", "cadernos_djen", "avisos_enviados", "observacoes_da_ia", "exportacoes"]) expect(nomes.some((n) => n.includes(tecnico))).toBe(false);
    });

    test("nada de outro escritório entra: nem nas planilhas, nem nos arquivos", async () => {
      const tudo = (await Promise.all(Object.keys(zip.files).filter((n) => !n.startsWith("documentos/") && !n.startsWith("certidoes/")).map((n) => texto(zip, n)))).join("\n");
      expect(tudo).not.toContain("Hotel Mar Azul");
      expect(tudo).not.toContain("tiago@mendes.adv.br");
      expect(Object.keys(zip.files).some((n) => n.includes("Contrato social"))).toBe(false);
    });

    test("toda tabela do escritório foi decidida: entra na cópia ou está na lista dos que ficam de fora, com o motivo", async () => {
      const doBanco = (await t.owner<{ table_name: string }[]>`select distinct table_name from information_schema.columns where table_schema = 'public' and column_name = 'organization_id'`).map((r) => r.table_name);
      const decididas = new Set([...tabelasExportadas(), ...Object.keys(NAO_EXPORTADAS)]);
      expect(doBanco.filter((n) => !decididas.has(n))).toEqual([]);
      for (const motivo of Object.values(NAO_EXPORTADAS)) expect(motivo.length).toBeGreaterThan(10);
    });
  });

  describe("baixar", () => {
    test("o download vale só para sócio do próprio escritório e fica no registro", async () => {
      const id = (await exportacaoDe(souza)).id;
      expect((await com(cookieRafael, `/escritorio/exportacoes/${id}/partes/1`)).status).toBe(403);
      // O outro escritório não enxerga a cópia nem sabendo o endereço.
      expect((await com(cookieTiago, `/escritorio/exportacoes/${id}/partes/1`)).status).toBe(404);
      expect((await json(com(cookieTiago, "/escritorio/exportacoes"))).itens).toEqual([]);
      const r = await com(cookieBeatriz, `/escritorio/exportacoes/${id}/partes/1`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/zip");
      expect(r.headers.get("content-disposition")).toMatch(/^attachment; filename\*=UTF-8''decreta-souza-mendes-/);
      expect(r.headers.get("cache-control")).toBe("no-store");
      expect((await com(cookieBeatriz, `/escritorio/exportacoes/${id}/partes/2`)).status).toBe(404);
      expect((await t.owner`select 1 from auditoria where organization_id = ${souza} and acao = 'exportacao.baixada'`).length).toBeGreaterThan(0);
    });

    test("passou dos 7 dias: o download é recusado e a rotina tira os arquivos e as linhas", async () => {
      const id = (await exportacaoDe(souza)).id;
      const chaves = (await t.owner<{ partes: { chave: string }[] }[]>`select partes from exportacoes where id = ${id}`)[0]!.partes.map((p) => p.chave);
      expect(chaves.every((k) => arquivos.arquivos.has(k))).toBe(true);
      await t.owner`update exportacoes set expira_em = now() - interval '1 minute' where id = ${id}`;
      const r = await com(cookieBeatriz, `/escritorio/exportacoes/${id}/partes/1`);
      expect(r.status).toBe(410);
      expect((await json(com(cookieBeatriz, "/escritorio/exportacoes"))).itens).toEqual([]);
      expect(await apagarExportacoesVencidas({ db: t.db, arquivos })).toBe(1);
      expect(chaves.some((k) => arquivos.arquivos.has(k))).toBe(false);
      expect(await t.owner`select 1 from exportacoes where id = ${id}`).toHaveLength(0);
      expect(await apagarExportacoesVencidas({ db: t.db, arquivos })).toBe(0);
    });
  });

  describe("escritório grande", () => {
    test("os documentos se dividem em mais de um ZIP; as planilhas e o LEIA-ME ficam no primeiro, e nada se perde nem se repete", async () => {
      const grande = (await criarEscritorio(t.db, createAuth(t.db, env), { nome: "Grande Advocacia", slug: "grande", dono: { email: "dono@grande.adv.br", nome: "Dono Grande", senha: SENHA } })).organizationId;
      const esperados = new Map<string, Uint8Array>();
      for (let i = 1; i <= 5; i++) {
        const id = crypto.randomUUID();
        const bytes = new Uint8Array(6).fill(i);
        await t.owner`insert into documentos (id, organization_id, nome, mime, tamanho, chave) values (${id}, ${grande}, ${`peticao ${i}.pdf`}, 'application/pdf', 6, ${`${grande}/${id}`})`;
        await arquivos.put(`${grande}/${id}`, bytes, "application/pdf");
        esperados.set(`documentos/${id.slice(0, 8)}-peticao ${i}.pdf`, bytes);
      }
      const exportacaoId = (await t.owner<{ id: string }[]>`insert into exportacoes (organization_id) values (${grande}) returning id`)[0]!.id;
      // Cada ZIP aceita 14 bytes de documentos: dois arquivos de 6 por parte.
      const r = await prepararExportacao(deps({ limiteDaParte: 14 }), grande, exportacaoId);
      expect(r.partes.map((p) => p.n)).toEqual([1, 2, 3]);
      expect(r.partes.map((p) => p.nome.replace(/\d{4}-\d{2}-\d{2}/, "DATA"))).toEqual(["decreta-grande-DATA-parte-1-de-3.zip", "decreta-grande-DATA-parte-2-de-3.zip", "decreta-grande-DATA-parte-3-de-3.zip"]);
      const lidos = new Map<string, Uint8Array>();
      let planilhasEm = 0;
      for (const p of r.partes) {
        const z = await abrirZip(await arquivos.read(`${grande}/exportacoes/${exportacaoId}/parte-${p.n}.zip`));
        if (z.file("LEIA-ME.txt")) {
          planilhasEm = p.n;
          expect(await texto(z, "LEIA-ME.txt")).toContain("Esta cópia tem 3 arquivos ZIP");
        }
        for (const nome of Object.keys(z.files).filter((n) => n.startsWith("documentos/"))) {
          expect(lidos.has(nome)).toBe(false);
          lidos.set(nome, await z.file(nome)!.async("uint8array"));
        }
      }
      expect(planilhasEm).toBe(1);
      expect([...lidos.keys()].sort()).toEqual([...esperados.keys()].sort());
      for (const [nome, bytes] of esperados) expect([...lidos.get(nome)!]).toEqual([...bytes]);
    });
  });

  describe("quando algo dá errado", () => {
    test("se a fila estiver fora do ar, o pedido falha na hora e o sócio pode tentar de novo", async () => {
      // A cópia anterior já foi limpa: o escritório não tem nenhuma pedida.
      expect((await json(com(cookieBeatriz, "/escritorio/exportacoes"))).itens).toEqual([]);
      falhaNaFila = true;
      const r = await com(cookieBeatriz, "/escritorio/exportacoes", { json: {} });
      expect(r.status).toBe(503);
      expect((await json(r)).erro).toBe("fila_fora");
      expect((await exportacaoDe(souza)).situacao).toBe("falhou");
      falhaNaFila = false;
      const de_novo = await com(cookieBeatriz, "/escritorio/exportacoes", { json: {} });
      expect(de_novo.status).toBe(202);
    });

    test("se a montagem falha, a linha vira 'falhou' com o motivo, e a lista mostra", async () => {
      const { id } = await exportacaoDe(souza);
      const quebrado: Armazenamento = { ...arquivos, put: async () => Promise.reject(new Error("R2 sem espaço")) };
      await expect(prepararExportacao(deps({ arquivos: quebrado }), souza, id)).rejects.toThrow("R2 sem espaço");
      await marcarExportacaoFalhou(t.db, souza, id, new Error("R2 sem espaço"));
      const lista = await json(com(cookieBeatriz, "/escritorio/exportacoes"));
      expect(lista.itens[0]).toMatchObject({ id, situacao: "falhou", erro: "R2 sem espaço", partes: [] });
    });
  });
});
