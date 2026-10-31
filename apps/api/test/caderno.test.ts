/**
 * Captura pelo caderno diário do DJEN, com banco de verdade e o DJEN de
 * mentira: o caderno de cada tribunal é baixado uma vez, cada escritório
 * guarda só o que casou com ele (OAB da equipe ou número da carteira) e o
 * resto é descartado.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomBytes } from "node:crypto";
import { dvCnj } from "@decreta/core";
import { processos, withTenant } from "@decreta/db";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import JSZip from "jszip";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { resumoDaManha } from "../src/servicos/avisos.ts";
import { capturarCadernos, certidaoDaPublicacao, saudeDaCaptura, type DepsDaCaptura } from "../src/servicos/captura.ts";
import { painelDoDia } from "../src/servicos/hoje.ts";

const DA_CARTEIRA = "5004321-25.2026.8.24.0038";
const DE_OUTRO = `5007777-${dvCnj("5007777", "2026", "8", "24", "0038")}.2026.8.24.0038`;

const resposta = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function comunicacao(id: number, o: { cnj: string; oab: string; extra?: Record<string, unknown> }) {
  return {
    id,
    hash: `h${id}`,
    data_disponibilizacao: "2026-10-28",
    siglaTribunal: "TJSC",
    tipoComunicacao: "Intimação",
    nomeOrgao: "2ª Vara Cível da Comarca de Joinville",
    numeroprocessocommascara: o.cnj,
    texto: `Intime-se (${id}).`,
    destinatarios: [{ nome: "PARTE INVENTADA", polo: "A" }],
    destinatarioadvogados: [{ advogado: { nome: "ADVOGADO INVENTADO", numero_oab: o.oab, uf_oab: "SC" } }],
    ...o.extra,
  };
}

describe.skipIf(!hasTestDatabase)("captura pelo caderno do DJEN", () => {
  let t: TestDatabase;
  let captura: DepsDaCaptura;
  let souza = "";
  let outro = "";
  let demo = "";
  let mineiro = "";
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  /** Os cadernos publicados: "TJSC/2026-10-28" → versão e comunicações. */
  const cadernos = new Map<string, { versao: number; itens: unknown[]; hashErrado?: boolean }>();
  const baixados: string[] = [];
  const certidoes: string[] = [];
  /** O último envio de cada tribunal, como o DJEN diz em /comunicacao/tribunal (o STF não está na lista). */
  const envios = { fora: false, lista: [{ uf: "", instituicoes: [{ sigla: "STJ", dataUltimoEnvio: "29/10/2026" }] }, { uf: "SC", instituicoes: [{ sigla: "TJSC", dataUltimoEnvio: "30/10/2026" }] }] };
  const fetchFalso = (async (entrada: string | URL) => {
    const url = String(entrada);
    if (url.endsWith("/api/v1/comunicacao/tribunal")) return envios.fora ? resposta({}, 503) : resposta(envios.lista);
    const certidao = /\/api\/v1\/comunicacao\/(\w+)\/certidao$/.exec(url);
    if (certidao) {
      certidoes.push(certidao[1]!);
      return new Response(new TextEncoder().encode("%PDF-1.4 certidão"), { headers: { "content-type": "application/pdf" } });
    }
    const meta = /\/api\/v1\/caderno\/([A-Z0-9]+)\/(\d{4}-\d{2}-\d{2})\/D$/.exec(url);
    const zip = /^https:\/\/s3\.test\/([A-Z0-9]+)\/(\d{4}-\d{2}-\d{2})\/v(\d+)\.zip$/.exec(url);
    const chave = meta ? `${meta[1]}/${meta[2]}` : zip ? `${zip[1]}/${zip[2]}` : "";
    const c = cadernos.get(chave);
    if (!c) return resposta({ erro: "Caderno não encontrado" }, 404);
    const z = new JSZip();
    z.file(`${chave.replace("/", "-D-")}_1.json`, JSON.stringify({ count: c.itens.length, items: c.itens }));
    const bytes = await z.generateAsync({ type: "uint8array" });
    if (zip) {
      baixados.push(chave);
      return new Response(bytes);
    }
    const hash = c.hashErrado ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex");
    return resposta({ status: "Processado", versao: c.versao, total_comunicacoes: c.itens.length, hash, url: `https://s3.test/${chave}/v${c.versao}.zip` });
  }) as unknown as typeof fetch;

  const publicacoesDe = (orgId: string) =>
    t.owner<{ id_externo: string; hash: string | null; processo_id: string | null; cancelada_em: Date | null; motivo_cancelamento: string | null }[]>`
      select id_externo, hash, processo_id, cancelada_em, motivo_cancelamento from publicacoes where organization_id = ${orgId} order by id_externo`;
  const cadernosDe = (orgId: string) =>
    t.owner<{ tribunal: string; dia: string; situacao: string; versao: number | null; total: number; casadas: number; novas: number; canceladas: number; erro: string | null }[]>`
      select tribunal, to_char(dia, 'YYYY-MM-DD') as dia, situacao, versao, total, casadas, novas, canceladas, erro from cadernos_djen where organization_id = ${orgId} order by tribunal, dia`;

  let app: ReturnType<typeof createApp>;
  const arquivos = armazenamentoEmMemoria();
  let cookie = "";
  const call = (path: string) => app.request(`/api/app${path}`, { headers: { origin: env.WEB_ORIGIN, cookie } });

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    captura = { db: t.db, datajudKey: "", fetch: fetchFalso, djen: { dormir: async () => {} } };
    const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const dono = (email: string, oabNumero: string) => ({ email, nome: "Pessoa Inventada", senha: "senha-bem-longa-123", oabNumero, oabUf: "SC" });
    ({ organizationId: souza } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", dono: dono("beatriz@souza.adv.br", "41.233") }));
    ({ organizationId: outro } = await criarEscritorio(t.db, auth, { nome: "Outro Escritório", slug: "outro", dono: dono("tiago@outro.adv.br", "30111") }));
    // OAB de MG: o TJMG não é a Justiça Militar (TJMMG), e os recursos dele vão ao STJ.
    ({ organizationId: mineiro } = await criarEscritorio(t.db, auth, { nome: "Escritório Mineiro", slug: "mineiro", dono: { ...dono("ana@mineiro.adv.br", "77001"), oabUf: "MG" } }));
    // A demonstração tem OAB inventada que pode ser de alguém de verdade: nada dela vai ao DJEN.
    ({ organizationId: demo } = await criarEscritorio(t.db, auth, { nome: "Demonstração", slug: SLUG_DA_DEMONSTRACAO, dono: dono("teste@decreta.site", "41233") }));
    await withTenant(t.db, souza, (tx) => tx.insert(processos).values({ organizationId: souza, titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: DA_CARTEIRA, tribunal: "TJSC" }));
    const entrada = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = entrada.headers.get("set-cookie")?.split(";")[0] ?? "";
    cadernos.set("TJSC/2026-10-28", {
      versao: 1,
      itens: [
        comunicacao(1, { cnj: DE_OUTRO, oab: "41233" }), // da Souza pela OAB
        comunicacao(2, { cnj: DA_CARTEIRA, oab: "99999" }), // da Souza pelo número, com advogado de fora
        comunicacao(3, { cnj: DE_OUTRO, oab: "30111" }), // do Outro pela OAB
        comunicacao(4, { cnj: DE_OUTRO, oab: "55555" }), // de ninguém
      ],
    });
  });

  afterAll(async () => {
    await t?.drop();
  });

  test("baixa o caderno uma vez; cada escritório guarda só o que é dele, pela OAB ou pelo número", async () => {
    const r = await capturarCadernos(captura, ["2026-10-28"]);
    expect(baixados).toEqual(["TJSC/2026-10-28"]);
    expect((await publicacoesDe(souza)).map((p) => p.id_externo)).toEqual(["1", "2"]);
    expect((await publicacoesDe(outro)).map((p) => p.id_externo)).toEqual(["3"]);
    expect((await publicacoesDe(demo)).length).toBe(0);
    // O que não casou com ninguém não fica em lugar nenhum.
    expect((await t.owner`select 1 from publicacoes where id_externo = '4'`).length).toBe(0);
    const [pelaOab, peloNumero] = await publicacoesDe(souza);
    expect(pelaOab).toMatchObject({ hash: "h1", processo_id: null });
    expect(peloNumero!.processo_id).not.toBeNull();
    expect(r.novas.map((n) => n.organizationId).sort()).toEqual([souza, souza, outro].sort());
    expect((await cadernosDe(souza)).find((c) => c.tribunal === "TJSC")).toMatchObject({ dia: "2026-10-28", situacao: "lido", versao: 1, total: 4, casadas: 2, novas: 2, canceladas: 0 });
    expect((await cadernosDe(outro)).find((c) => c.tribunal === "TJSC")).toMatchObject({ situacao: "lido", casadas: 1, novas: 1 });
    expect((await cadernosDe(demo)).length).toBe(0);
    // A tela de Publicações diz quando foi a última captura: a do caderno conta.
    const [rodada] = await t.owner<{ encontradas: number; novas: number; erro: string | null }[]>`select encontradas, novas, erro from capturas where organization_id = ${souza}`;
    expect(rodada).toEqual({ encontradas: 2, novas: 2, erro: null });
  });

  test("também procura nos superiores (os recursos) e registra o dia sem caderno", async () => {
    const tribunais = (await cadernosDe(souza)).map((c) => `${c.tribunal}:${c.situacao}`);
    expect(tribunais).toEqual(["STF:ausente", "STJ:ausente", "TJSC:lido"]);
    expect((await cadernosDe(mineiro)).map((c) => `${c.tribunal}:${c.situacao}`)).toEqual(["STF:ausente", "STJ:ausente", "TJMG:ausente"]);
  });

  test("rodar de novo na mesma versão não baixa de novo nem repete publicação", async () => {
    const r = await capturarCadernos(captura, ["2026-10-28"]);
    expect(baixados).toEqual(["TJSC/2026-10-28"]);
    expect(r.novas).toEqual([]);
    expect((await publicacoesDe(souza)).length).toBe(2);
  });

  test("versão nova: relê, marca a comunicação cancelada pelo tribunal e traz a que entrou", async () => {
    cadernos.set("TJSC/2026-10-28", {
      versao: 2,
      itens: [
        comunicacao(1, { cnj: DE_OUTRO, oab: "41233" }),
        comunicacao(2, { cnj: DA_CARTEIRA, oab: "99999", extra: { ativo: false, motivo_cancelamento: "Publicada em duplicidade" } }),
        comunicacao(5, { cnj: DA_CARTEIRA, oab: "99999" }),
      ],
    });
    const r = await capturarCadernos(captura, ["2026-10-28"]);
    expect(r.novas).toEqual([{ organizationId: souza, publicacaoId: expect.any(String) }]);
    const pubs = await publicacoesDe(souza);
    expect(pubs.map((p) => p.id_externo)).toEqual(["1", "2", "5"]);
    expect(pubs[1]).toMatchObject({ cancelada_em: expect.any(Date), motivo_cancelamento: "Publicada em duplicidade" });
    expect(pubs[0]!.cancelada_em).toBeNull();
    expect((await cadernosDe(souza)).find((c) => c.tribunal === "TJSC")).toMatchObject({ versao: 2, total: 3, casadas: 2, novas: 3, canceladas: 1 });
  });

  test("caderno que não confere fica como erro, sem derrubar os outros dias", async () => {
    cadernos.set("TJSC/2026-10-29", { versao: 1, itens: [comunicacao(6, { cnj: DE_OUTRO, oab: "41233" })], hashErrado: true });
    cadernos.set("TJSC/2026-10-30", { versao: 1, itens: [comunicacao(7, { cnj: DE_OUTRO, oab: "41233" })] });
    await capturarCadernos(captura, ["2026-10-29", "2026-10-30"]);
    const tjsc = (await cadernosDe(souza)).filter((c) => c.tribunal === "TJSC");
    expect(tjsc.map((c) => `${c.dia}:${c.situacao}`)).toEqual(["2026-10-28:lido", "2026-10-29:erro", "2026-10-30:lido"]);
    expect(tjsc[1]!.erro).toContain("hash");
    expect((await publicacoesDe(souza)).map((p) => p.id_externo)).toEqual(["1", "2", "5", "7"]);
  });

  describe("saúde da captura", () => {
    const saude = (hoje: string) => withTenant(t.db, souza, (tx) => saudeDaCaptura(tx, hoje));

    test("o último caderno de cada tribunal e o último que foi lido", async () => {
      const s = await saude("2026-10-31");
      // Os tribunais da carteira primeiro; os superiores depois.
      expect(s.tribunais.map((x) => `${x.tribunal}:${x.ultimo.situacao}`)).toEqual(["TJSC:lido", "STF:ausente", "STJ:ausente"]);
      expect(s.tribunais.find((x) => x.tribunal === "TJSC")!.lido).toMatchObject({ dia: "2026-10-30", total: 1, casadas: 1 });
      expect(s.tribunais.find((x) => x.tribunal === "STF")!.lido).toBeNull();
      // Quando o tribunal enviou ao DJEN pela última vez, pela lista do próprio DJEN.
      expect(Object.fromEntries(s.tribunais.map((x) => [x.tribunal, x.envio]))).toEqual({ TJSC: "2026-10-30", STF: null, STJ: "2026-10-29" });
      // O STF e o STJ nunca publicaram nada para este escritório: a falta deles não é aviso.
      expect(s.alertas).toEqual([]);
    });

    test("avisa o caderno que não deu para ler", async () => {
      expect((await saude("2026-10-30")).alertas).toEqual(["Não deu para ler o caderno do TJSC de 29/10 no DJEN. Tento de novo na próxima leitura; a busca pela OAB das 12:40 e das 18:40 cobre o dia."]);
    });

    test("o aviso vai no resumo da manhã, mesmo num dia sem prazo", async () => {
      const painel = await withTenant(t.db, souza, (tx) => painelDoDia(t.db, tx, souza, "2026-10-30", "America/Sao_Paulo"));
      expect(painel.alertasDaCaptura).toHaveLength(1);
      const texto = resumoDaManha({ ...painel, contadores: { ...painel.contadores, publicacoesNovas: 0 } }, { id: "ninguem", apelido: "Beatriz" }, "https://decreta.local");
      expect(texto).toContain("*Captura do DJEN*\n• Não deu para ler o caderno do TJSC de 29/10 no DJEN.");
    });

    test("avisa o tribunal que ficou sem caderno num dia útil, com o último envio dele; feriado não conta", async () => {
      // A lista dos tribunais fora do ar não para a leitura dos cadernos, e o último envio já visto continua valendo.
      envios.fora = true;
      await capturarCadernos(captura, ["2026-11-02", "2026-11-03"]);
      envios.fora = false;
      // 02/11 é Finados.
      expect((await saude("2026-11-03")).alertas).toEqual([]);
      expect((await saude("2026-11-04")).alertas).toEqual(["O TJSC não publicou o caderno de 03/11 no DJEN: o último envio do tribunal foi em 30/10. A busca pela OAB das 12:40 e das 18:40 cobre o dia."]);
    });

    test("avisa quando a leitura dos cadernos parou", async () => {
      expect((await saude("2026-11-10")).alertas).toEqual(["A leitura dos cadernos do DJEN está parada desde 03/11. A busca pela OAB das 12:40 e das 18:40 continua."]);
    });

    test("escritório que desligou a captura não recebe aviso dela", async () => {
      await t.owner`update escritorios set captura_djen = false where organization_id = ${souza}`;
      // Nem "leitura parada" nem "a busca pela OAB continua": as duas estão desligadas por escolha do escritório.
      expect((await saude("2026-11-10")).alertas).toEqual([]);
      await t.owner`update escritorios set captura_djen = true where organization_id = ${souza}`;
    });
  });

  describe("pela API", () => {
    const idDe = async (idExterno: string) => (await t.owner<{ id: string }[]>`select id from publicacoes where organization_id = ${souza} and id_externo = ${idExterno}`)[0]!.id;

    test("a saúde da captura e as publicações sem processo", async () => {
      const r = await call("/publicacoes/saude");
      expect(r.status).toBe(200);
      const s = (await r.json()) as { tribunais: { tribunal: string }[]; semProcesso: number; alertas: string[] };
      expect(s.tribunais.map((x) => x.tribunal)).toContain("TJSC");
      // A 1 e a 7 vieram pela OAB, de processos que não estão no Decreta.
      expect(s.semProcesso).toBe(2);
    });

    test("a publicação cancelada pelo tribunal aparece assim na lista e na ficha", async () => {
      const lista = (await (await call("/publicacoes")).json()) as { itens: { id: string; selo: { tipo: string; texto: string } }[] };
      const cancelada = await idDe("2");
      expect(lista.itens.find((i) => i.id === cancelada)!.selo).toEqual({ tipo: "erro", texto: "Cancelada pelo tribunal" });
      const ficha = (await (await call(`/publicacoes/${cancelada}`)).json()) as { cancelada: unknown; certidao: boolean };
      expect(ficha).toMatchObject({ cancelada: { em: expect.any(String), motivo: "Publicada em duplicidade" }, certidao: true });
    });

    test("a certidão do DJEN é baixada na primeira vez e fica guardada", async () => {
      const pub = await idDe("1");
      const r = await call(`/publicacoes/${pub}/certidao`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/pdf");
      expect(new TextDecoder().decode(await r.arrayBuffer())).toStartWith("%PDF-");
      expect(certidoes).toEqual(["h1"]);
      expect((await call(`/publicacoes/${pub}/certidao`)).status).toBe(200);
      expect(certidoes).toEqual(["h1"]);
    });

    test("publicação sem hash do DJEN não tem certidão", async () => {
      await t.owner`update publicacoes set hash = null where organization_id = ${souza} and id_externo = '7'`;
      const r = await call(`/publicacoes/${await idDe("7")}/certidao`);
      expect(r.status).toBe(404);
      expect(certidoes).toEqual(["h1"]);
    });
  });

  describe("certidão guardada na captura", () => {
    const certidaoDe = async (orgId: string, idExterno: string) =>
      (await t.owner<{ id: string; certidao: string | null }[]>`select id, certidao from publicacoes where organization_id = ${orgId} and id_externo = ${idExterno}`)[0]!;

    test("a publicação capturada fica com a certidão do DJEN guardada, sem ninguém abrir", async () => {
      const pub = await certidaoDe(souza, "5");
      expect(pub.certidao).toBeNull();
      const bytes = await certidaoDaPublicacao({ db: t.db, arquivos, fetch: fetchFalso }, souza, pub.id);
      expect(new TextDecoder().decode(bytes!)).toStartWith("%PDF-");
      expect(certidoes).toEqual(["h1", "h5"]);
      const guardada = await certidaoDe(souza, "5");
      expect(guardada.certidao).toBe(`${souza}/certidoes/${pub.id}.pdf`);
      expect(new TextDecoder().decode(await arquivos.read(guardada.certidao!))).toStartWith("%PDF-");
      // Pedir de novo (a rotina repetida ou a tela) não vai ao DJEN outra vez.
      await certidaoDaPublicacao({ db: t.db, arquivos, fetch: fetchFalso }, souza, pub.id);
      expect((await call(`/publicacoes/${pub.id}/certidao`)).status).toBe(200);
      expect(certidoes).toEqual(["h1", "h5"]);
    });

    test("a demonstração nunca vai ao DJEN atrás da certidão", async () => {
      const [pub] = await t.owner<{ id: string }[]>`
        insert into publicacoes (organization_id, id_externo, hash, disponibilizada_em, publicada_em, texto)
        values (${demo}, '900', 'h900', '2026-10-28', '2026-10-29', 'Intime-se.') returning id`;
      expect(await certidaoDaPublicacao({ db: t.db, arquivos, fetch: fetchFalso }, demo, pub!.id)).toBeNull();
      expect(certidoes).toEqual(["h1", "h5"]);
      expect((await certidaoDe(demo, "900")).certidao).toBeNull();
    });

    test("o DJEN fora do ar falha, para a rotina tentar de novo; o que não tem certidão não falha", async () => {
      const fora = (async () => new Response("erro", { status: 502 })) as unknown as typeof fetch;
      const pub = await certidaoDe(outro, "3");
      await expect(certidaoDaPublicacao({ db: t.db, arquivos, fetch: fora }, outro, pub.id)).rejects.toThrow();
      expect((await certidaoDe(outro, "3")).certidao).toBeNull();
      const semCertidao = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
      expect(await certidaoDaPublicacao({ db: t.db, arquivos, fetch: semCertidao }, outro, pub.id)).toBeNull();
    });
  });

  describe("versão nova que não deu para ler", () => {
    const tjsc28 = async () => (await cadernosDe(souza)).find((c) => c.tribunal === "TJSC" && c.dia === "2026-10-28")!;

    test("o dia já lido fica lido, mas avisa que a versão nova falhou", async () => {
      const antes = await tjsc28();
      // O tribunal publica a versão 3 (cancelando a comunicação 5), e o arquivo chega corrompido.
      cadernos.set("TJSC/2026-10-28", { versao: 3, itens: [comunicacao(1, { cnj: DE_OUTRO, oab: "41233" }), comunicacao(5, { cnj: DA_CARTEIRA, oab: "99999", extra: { ativo: false, motivo_cancelamento: "Erro material" } })], hashErrado: true });
      await capturarCadernos(captura, ["2026-10-28"]);
      expect(await tjsc28()).toMatchObject({ situacao: "lido", versao: antes.versao, erro: expect.stringContaining("hash") });
      expect((await withTenant(t.db, souza, (tx) => saudeDaCaptura(tx, "2026-10-29"))).alertas).toContain(
        "Não deu para ler a versão nova do caderno do TJSC de 28/10 no DJEN: o tribunal mudou o caderno, e um cancelamento pode não ter chegado. Tento de novo na próxima leitura; confira as publicações desse dia.",
      );
    });

    test("a rodada seguinte tenta de novo o dia que falhou e marca o cancelamento", async () => {
      cadernos.set("TJSC/2026-10-28", { ...cadernos.get("TJSC/2026-10-28")!, hashErrado: false });
      baixados.length = 0;
      await capturarCadernos(captura, ["2026-11-03"]);
      expect(baixados).toContain("TJSC/2026-10-28");
      expect(await tjsc28()).toMatchObject({ situacao: "lido", versao: 3, erro: null });
      expect((await publicacoesDe(souza)).find((p) => p.id_externo === "5")).toMatchObject({ motivo_cancelamento: "Erro material" });
    });
  });
});
