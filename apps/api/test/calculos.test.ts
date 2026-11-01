/**
 * Cálculos pela API, com banco de verdade (RLS) e as fontes de mentira (SGS,
 * SIDRA e Olinda no formato real): atualização monetária com a memória em
 * DOCX e no cumprimento de sentença, revisional bancária, previdenciário e o
 * PJe-Calc. Os valores esperados foram feitos à mão; os do escritório de
 * demonstração conferem com o IPCA de 2023 do IBGE (4,62%). Pessoas,
 * empresas e números de processo são inventados.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria, extrairTexto, MIME_DOCX } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { SLUG_DA_DEMONSTRACAO } from "../src/demonstracao/slug.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

/** Séries mensais do SGS por código, como a fonte responde. */
const SERIES: Record<string, Array<[string, number]>> = {
  "433": [
    ["2024-09", 1],
    ["2024-10", 2],
  ],
  "29543": [
    ["2024-09", 0.5],
    ["2024-10", -0.2],
  ],
};
/** O IPCA do SIDRA (igual ao do SGS, salvo quando o teste muda). */
let sidra: Array<[string, number]> = SERIES["433"]!;

const diariaDaOlinda = (InicioPeriodo: string, InstituicaoFinanceira: string, cnpj8: string, TaxaJurosAoMes: number, TaxaJurosAoAno: number) => ({
  InicioPeriodo,
  FimPeriodo: InicioPeriodo,
  Segmento: "PESSOA FÍSICA",
  Modalidade: "Crédito pessoal não consignado - Prefixado",
  Posicao: 1,
  InstituicaoFinanceira,
  TaxaJurosAoMes,
  TaxaJurosAoAno,
  cnpj8,
});

/** PDF mínimo de uma página, uma linha de texto por item. */
function pdfCom(linhas: string[]): Uint8Array {
  const conteudo = linhas.map((l, i) => `BT /F1 10 Tf 40 ${800 - i * 14} Td (${l}) Tj ET`).join("\n");
  const objetos = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${conteudo.length} >>\nstream\n${conteudo}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let saida = "%PDF-1.4\n";
  const posicoes: number[] = [];
  objetos.forEach((o, i) => {
    posicoes.push(saida.length);
    saida += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = saida.length;
  saida += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n${posicoes.map((p) => `${String(p).padStart(10, "0")} 00000 n \n`).join("")}`;
  saida += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(saida);
}

describe.skipIf(!hasTestDatabase)("cálculos pela API", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let cookieOutro = "";
  let cookieDemo = "";
  let processoId = "";
  let calculoId = "";
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const pedidosAFontes: string[] = [];
  let fontesFora = false;

  const fetchFalso = (async (entrada: string | URL) => {
    const url = String(entrada);
    pedidosAFontes.push(url);
    if (fontesFora) return new Response("<html>fora</html>", { status: 503 });
    const sgs = /bcdata\.sgs\.(\d+)\/dados\?formato=json&dataInicial=(\d\d)\/(\d\d)\/(\d{4})&dataFinal=(\d\d)\/(\d\d)\/(\d{4})/.exec(url);
    if (sgs) {
      const [, codigo, , mi, ai, , mf, af] = sgs;
      const valores = (SERIES[codigo!] ?? []).filter(([mes]) => mes >= `${ai}-${mi}` && mes <= `${af}-${mf}`);
      if (!valores.length) return Response.json({ erro: { statusCode: 404, detail: "Value(s) not found" } }, { status: 404 });
      return Response.json(valores.map(([mes, valor]) => ({ data: `01/${mes.slice(5)}/${mes.slice(0, 4)}`, valor: String(valor) })));
    }
    if (url.startsWith("https://apisidra.ibge.gov.br/")) return Response.json([{ V: "Valor", D3C: "Mês (Código)" }, ...sidra.map(([mes, valor]) => ({ V: String(valor), D3C: mes.replace("-", "") }))]);
    if (url.startsWith("https://olinda.bcb.gov.br/")) {
      const linhas = [
        diariaDaOlinda("2024-03-01", "BANCO COLINA VERDE S.A.", "11222333", 4.11, 62.2),
        diariaDaOlinda("2024-03-04", "BANCO COLINA VERDE S.A.", "11222333", 4.1, 61.9),
        diariaDaOlinda("2024-03-05", "BANCO COLINA VERDE S.A.", "11222333", 4.04, 60.8),
        diariaDaOlinda("2024-03-01", "BANCO PINHEIRAL S.A.", "44555666", 2.5, 34.49),
      ];
      return Response.json({ value: url.includes(encodeURIComponent("cnpj8 eq '11222333'")) ? linhas.slice(0, 3) : linhas });
    }
    return Response.json({}, { status: 404 });
  }) as unknown as typeof fetch;

  const call = (path: string, init: RequestInit & { json?: unknown } = {}, comCookie = cookie) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), origin: env.WEB_ORIGIN, cookie: comCookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;

  async function entrar(email: string, nome: string, slug: string, orgNome: string): Promise<string> {
    await criarEscritorio(t.db, createAuth(t.db, env), { nome: orgNome, slug, dono: { email, nome, senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "41233", oabUf: "SC" } });
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "senha-bem-longa-123" }) });
    return r.headers.get("set-cookie")?.split(";")[0] ?? "";
  }

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const captura = { db: t.db, datajudKey: "", fetch: fetchFalso };
    const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    cookie = await entrar("beatriz@souza.adv.br", "Beatriz Souza", "souza-mendes-calculos", "Souza & Mendes Advocacia");
    cookieOutro = await entrar("tiago@outro.adv.br", "Tiago Martins", "outro-calculos", "Outro Escritório");
    cookieDemo = await entrar("demo@decreta.local", "Camila Rocha", SLUG_DA_DEMONSTRACAO, "Escritório de Demonstração");
    const p = await call("/processos", { method: "POST", json: { cnj: null, tipo: "extrajudicial", titulo: "Ana Ribeiro × Banco Colina Verde", partes: [{ nome: "Ana Ribeiro Lopes", polo: "ativo", cliente: true }] } });
    expect(p.status).toBe(201);
    processoId = (await json(p)).id;
  }, 120_000);

  afterAll(async () => {
    await t?.drop();
  });

  const pedidoCivil = () => ({
    processoId,
    titulo: "Indenização da sentença",
    regime: { tipo: "civil" },
    dataDoCalculo: "2024-11-12",
    parcelas: [{ descricao: "Indenização", valor: 1000, vencimento: "2024-09-05" }],
  });

  test("atualização civil: busca no SGS só o que precisa, confere o IPCA no SIDRA e guarda a memória", async () => {
    const r = await call("/calculos/atualizacao", { method: "POST", json: pedidoCivil() });
    expect(r.status).toBe(201);
    const calc = await json(r);
    calculoId = calc.id;
    // À mão: 1.000 × 1,01 × 1,02 = 1.030,20; juros de 0,5% (a taxa negativa de outubro vale zero) = 5,15.
    expect(calc.resultado.total).toEqual({ valor: 1000, corrigido: 1030.2, juros: 5.15, total: 1035.35 });
    expect(calc.memoria).toContain("**Total atualizado: R$ 1.035,35**");
    expect(calc.memoria).toContain("IPCA: série 433 do SGS do Banco Central, conferida no SIDRA/IBGE (tabela 1737): confere.");
    expect(calc.memoria).toContain("Taxa Legal: série 29543 do SGS do Banco Central (Lei 14.905/2024).");
    expect(pedidosAFontes.filter((u) => u.includes("bcdata.sgs.433"))).toEqual(["https://api.bcb.gov.br/dados/serie/bcdata.sgs.433/dados?formato=json&dataInicial=01/09/2024&dataFinal=31/10/2024"]);
    const lista = await json(call(`/calculos?processo=${processoId}`));
    expect(lista.itens).toMatchObject([{ id: calculoId, tipo: "atualizacao", titulo: "Indenização da sentença", total: 1035.35 }]);
  });

  test("IPCA do SGS que não bate com o do SIDRA fica dito na memória", async () => {
    sidra = [
      ["2024-09", 1],
      ["2024-10", 2.01],
    ];
    const calc = await json(call("/calculos/atualizacao", { method: "POST", json: { ...pedidoCivil(), processoId: undefined } }));
    sidra = SERIES["433"]!;
    expect(calc.memoria).toContain("IPCA: série 433 do SGS do Banco Central; no SIDRA/IBGE, diverge em 10/2024 (SGS 2,00%; SIDRA 2,01%). Confira antes de usar.");
  });

  test("índice ainda não publicado é 422 com o mês; fonte fora do ar é 503", async () => {
    const semOutubro = await call("/calculos/atualizacao", { method: "POST", json: { ...pedidoCivil(), dataDoCalculo: "2024-12-02" } });
    expect(semOutubro.status).toBe(422);
    expect((await json(semOutubro)).detalhe).toBe("Faltam valores de IPCA para 11/2024.");
    fontesFora = true;
    const fora = await call("/calculos/atualizacao", { method: "POST", json: pedidoCivil() });
    fontesFora = false;
    expect(fora.status).toBe(503);
    expect((await json(fora)).erro).toBe("indices_indisponiveis");
  });

  test("datas fora da faixa são 422 antes de qualquer conta: futuro, antes do Plano Real, juros depois do cálculo, expedição fora", async () => {
    const base = { titulo: "Teste", regime: { tipo: "contratual", indice: "nenhum", jurosAoMes: 1 }, parcelas: [{ descricao: "Parcela", valor: 100, vencimento: "2024-01-10" }] };
    const erro = async (json: unknown) => (await (await call("/calculos/atualizacao", { method: "POST", json })).json()).erro;
    expect(await erro({ ...base, dataDoCalculo: "2999-01-01" })).toBe("calculo_no_futuro");
    expect(await erro({ ...base, dataDoCalculo: "2024-06-01", parcelas: [{ descricao: "Antiga", valor: 100, vencimento: "1990-01-10" }] })).toBe("antes_do_real");
    expect(await erro({ ...base, dataDoCalculo: "2024-06-01", jurosDesde: "2024-07-01" })).toBe("juros_depois_do_calculo");
    expect(await erro({ ...base, dataDoCalculo: "2024-06-01", regime: { tipo: "fazenda", expedicao: "2020-01-01" } })).toBe("expedicao_fora");
  });

  test("a memória sai em DOCX no timbre e é anexada ao processo", async () => {
    const r = await call(`/calculos/${calculoId}/docx`);
    expect(r.headers.get("content-type")).toBe(MIME_DOCX);
    const texto = await extrairTexto(new Uint8Array(await r.arrayBuffer()), MIME_DOCX);
    expect(texto).toContain("MEMÓRIA DE CÁLCULO · INDENIZAÇÃO DA SENTENÇA");
    expect(texto).toContain("Total atualizado: R$ 1.035,35");
    const anexo = await call(`/calculos/${calculoId}/anexar`, { method: "POST" });
    expect(anexo.status).toBe(201);
    const { documentoId } = await json(anexo);
    const docs = await json(call(`/documentos?processo=${processoId}`));
    expect(docs.itens).toContainEqual(expect.objectContaining({ id: documentoId, nome: "Memória de cálculo · Indenização da sentença.docx", mime: MIME_DOCX }));
    expect((await json(call(`/calculos/${calculoId}`))).documentoId).toBe(documentoId);
  });

  test("o cumprimento de sentença lê a memória de cálculo do processo", async () => {
    const preparar = await json(call(`/pecas/preparar?processo=${processoId}&tipo=cumprimento-sentenca`));
    expect(preparar.leu).toContain("Memória de cálculo · Indenização da sentença");
    ia.respostas["gerar-documento"] = "# Excelentíssimo Senhor Doutor Juiz\n\nCumprimento de sentença.";
    const r = await call("/pecas", { method: "POST", json: { processoId, tipo: "cumprimento-sentenca", instrucoes: "" } });
    expect(r.status).toBe(200);
    await r.text();
    expect(JSON.stringify(ia.pedidos["gerar-documento"])).toContain("Total atualizado: R$ 1.035,35");
  });

  test("revisional: as taxas do mês por banco e o quadro com o tópico da inicial", async () => {
    const modalidade = "Crédito pessoal não consignado - Prefixado";
    const taxas = await json(call(`/calculos/taxas?modalidade=${encodeURIComponent(modalidade)}&mes=2024-03`));
    expect(taxas.bancos).toEqual([
      { instituicao: "BANCO PINHEIRAL S.A.", cnpj8: "44555666", taxaAoMes: 2.5, taxaAoAno: 34.49, periodos: 1 },
      { instituicao: "BANCO COLINA VERDE S.A.", cnpj8: "11222333", taxaAoMes: 4.08, taxaAoAno: 61.63, periodos: 3 },
    ]);
    const r = await call("/calculos/revisional", { method: "POST", json: { processoId, modalidade, mes: "2024-03", cnpj8: "11222333", taxaContratoAoMes: 7 } });
    expect(r.status).toBe(201);
    const calc = await json(r);
    // À mão: média do banco (4,11 + 4,10 + 4,04) / 3 = 4,08; 7 / 4,08 = 1,7157 vez a média.
    expect(calc.resultado).toMatchObject({ banco: "BANCO COLINA VERDE S.A.", bancoAoMes: 4.08, comparacao: { vezesAMedia: 1.7157, acimaDeUmaVezEMeia: true } });
    expect(calc.memoria).toContain("## Da taxa de juros acima da média de mercado");
    ia.respostas["gerar-documento"] = "# Excelentíssimo Senhor Doutor Juiz\n\nInicial.";
    await (await call("/pecas", { method: "POST", json: { processoId, tipo: "inicial-civel", instrucoes: "" } })).text();
    const pedido = JSON.stringify(ia.pedidos["gerar-documento"]);
    const doCalculo = pedido.slice(pedido.indexOf("## Cálculos do processo"), pedido.indexOf("## Quem assina"));
    expect(doCalculo).toContain("Da taxa de juros acima da média de mercado");
    // A inicial lê a revisional; a atualização é do cumprimento de sentença.
    expect(doCalculo).not.toContain("Total atualizado");
  });

  test("previdenciário: o teto e o salário mínimo do dia e a linha do tempo dos documentos lidos", async () => {
    const enviar = async (nome: string, texto: string) => {
      const form = new FormData();
      form.set("arquivo", new File([texto], nome, { type: "text/plain" }));
      form.set("processoId", processoId);
      expect((await call("/documentos", { method: "POST", body: form })).status).toBe(201);
    };
    await enviar("laudo.txt", "LAUDO MÉDICO PERICIAL\nData da perícia: 12/03/2025\nConclusão: há incapacidade parcial e permanente.");
    await enviar("indeferimento.txt", "Comunicação de Decisão\nEm 20/11/2024 foi indeferido o pedido.\nMotivo: não constatação de incapacidade laborativa.");
    const r = await json(call(`/calculos/previdenciario?processo=${processoId}&dia=2026-03-10`));
    expect(r.parametros).toMatchObject({ teto: 8475.55, salarioMinimo: 1621 });
    expect(r.linhaDoTempo.map((m: { tipo: string; data: string }) => [m.tipo, m.data])).toEqual([
      ["indeferimento", "2024-11-20"],
      ["laudo", "2025-03-12"],
    ]);
  });

  test("PJe-Calc: o .PJC e o relatório ficam no processo, e o resumo sai do PDF", async () => {
    const form = new FormData();
    form.set("processoId", processoId);
    form.set("pjc", new File([new Uint8Array([80, 74, 67, 1, 2, 3])], "calculo-joao.PJC", { type: "" }));
    form.set(
      "relatorio",
      new File(
        [
          pdfCom([
            "PLANILHA DE CALCULO",
            "Processo: 0001234-56.2025.5.12.0016",
            "Reclamante: JOAO PEREIRA DA SILVA",
            "Reclamado: TRANSPORTES SERRA DOURADA LTDA",
            "Data Liquidacao: 30/09/2026",
            "RESUMO DO CALCULO",
            "LIQUIDO DEVIDO AO RECLAMANTE 19.871,20",
            "CONTRIBUICAO SOCIAL SOBRE SALARIOS DEVIDOS 2.512,13",
            "Total Devido pelo Reclamado 22.383,33",
          ]),
        ],
        "relatorio.pdf",
        { type: "application/pdf" },
      ),
    );
    const r = await call("/calculos/pjecalc", { method: "POST", body: form });
    expect(r.status).toBe(201);
    const calc = await json(r);
    expect(calc.resultado).toMatchObject({ liquidoReclamante: 19871.2, contribuicaoSocial: 2512.13, totalReclamado: 22383.33, dataLiquidacao: "2026-09-30" });
    const nomes = (await json(call(`/documentos?processo=${processoId}`))).itens.map((d: { nome: string }) => d.nome);
    expect(nomes).toEqual(expect.arrayContaining(["calculo-joao.PJC", "relatorio.pdf"]));

    const errado = new FormData();
    errado.set("processoId", processoId);
    errado.set("relatorio", new File([pdfCom(["PROCURACAO AD JUDICIA"])], "procuracao.pdf", { type: "application/pdf" }));
    const recusado = await call("/calculos/pjecalc", { method: "POST", body: errado });
    expect(recusado.status).toBe(422);
    expect((await json(recusado)).erro).toBe("relatorio_nao_reconhecido");
  });

  test("outro escritório não vê o cálculo", async () => {
    expect((await call(`/calculos/${calculoId}`, {}, cookieOutro)).status).toBe(404);
    expect((await json(call(`/calculos?processo=${processoId}`, {}, cookieOutro))).itens).toEqual([]);
  });

  test("na demonstração, os índices vêm do retrato guardado, sem chamar o Banco Central", async () => {
    const antes = pedidosAFontes.length;
    const r = await call(
      "/calculos/atualizacao",
      { method: "POST", json: { titulo: "IPCA de 2023", regime: { tipo: "contratual", indice: "ipca", jurosAoMes: 0 }, dataDoCalculo: "2024-01-10", parcelas: [{ descricao: "Parcela", valor: 1000, vencimento: "2023-01-15" }] } },
      cookieDemo,
    );
    expect(r.status).toBe(201);
    // O IPCA de 2023 do IBGE: 4,62%.
    expect((await json(r)).resultado.linhas[0].fator).toBeCloseTo(1.0462, 4);
    const taxas = await json(call(`/calculos/taxas?modalidade=${encodeURIComponent("Crédito pessoal não consignado - Prefixado")}&mes=2024-03`, {}, cookieDemo));
    expect(taxas.bancos.length).toBeGreaterThan(10);
    expect(pedidosAFontes.length).toBe(antes);
  });
});
