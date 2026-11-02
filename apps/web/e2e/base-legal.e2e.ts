/**
 * 4.9: a base legal que se explica. A tabela fixa preenche primeiro, sem IA; se ela
 * não sabe, a IA sugere, com a marca "sugerida" até o artigo ser achado no acervo. O
 * texto da lei fica ao lado; sem o texto, a tela diz. Nada disso confirma o prazo.
 */
import { expect, test, type Page, type Locator } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

const prazo = amostras.prazo!.corpo;
const previa = { publicacao: prazo.publicadoEm, inicio: prazo.inicio, fim: prazo.fim, dias: prazo.dias, contagem: prazo.contagem, desconsiderados: [], prorrogadoDe: null, explicacao: prazo.conta.explicacao, pelo: "publicacao", outra: null, calendarioCompleto: true, diaDigitado: null };

const TABELA = { ato: "contestação", dias: 15, fundamento: "CPC, art. 335", explicacao: "A resposta de quem está sendo processado." };
const FONTE = { nome: "normas.leg.br (Congresso Nacional)", url: "https://normas.leg.br/?urn=x", capturadoEm: "2026-10-20T12:00:00.000Z" };
const LEI = { trecho: "art. 335 do CPC", selo: "verificada", motivo: "Em vigor no texto compilado do Código de Processo Civil (2015) (CPC).", texto: "O réu poderá oferecer contestação, por petição, no prazo de 15 (quinze) dias.", fonte: FONTE };
const sugestao = (campos: Record<string, unknown> = {}) => ({ id: "00000000-0000-4000-8000-0000000000e1", situacao: "pronto", fundamento: "art. 396, CPC", explicacao: "Serve para pedir que a outra parte mostre um documento.", reconhecida: true, lei: [], ...campos });

async function abrirNovoPrazo(page: Page, api: ApiFalsa) {
  await abrir(page, "/prazos", api.responder("POST /prazos/calcular", previa));
  await page.getByRole("button", { name: "Novo prazo" }).click();
  return page.getByRole("dialog", { name: "Novo prazo" });
}

const campoDaBase = (d: Locator) => d.getByLabel("Base legal");
const oQueFazer = (d: Locator) => d.getByLabel("O que fazer");

test("a tabela preenche a partir de O que fazer, sem chamar a IA, e diz de onde veio em palavras simples", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: true, lei: [LEI] });
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Contestação");
  await expect(campoDaBase(dialogo)).toHaveValue("CPC, art. 335");
  await expect(dialogo.getByText("Da tabela do Decreta")).toBeVisible();
  await expect(dialogo.getByText("A resposta de quem está sendo processado.")).toBeVisible();
  // A tabela não foi revisada por advogado: nada na tela sugere o contrário.
  await expect(dialogo).not.toContainText(/validad|revisad|aprovad|certificad/i);
  // O texto da lei ao lado, com a fonte.
  const lei = dialogo.getByRole("region", { name: "O que diz a lei" });
  await expect(lei).toContainText("O réu poderá oferecer contestação, por petição, no prazo de 15 (quinze) dias.");
  await expect(lei.getByRole("link", { name: /normas\.leg\.br/ })).toHaveAttribute("href", FONTE.url);
  expect(api.mudancas("/ia/base-legal")).toHaveLength(0);
  await expect(dialogo.getByRole("button", { name: "Sugerir com a IA" })).toHaveCount(0);
});

test("a tabela não sabe: a IA sugere, nada entra sem Usar, e a marca fica em sugerida até o artigo ser achado", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/base-legal", sugestao({ lei: [{ trecho: "art. 396 do CPC", selo: "nao_verificada", motivo: "Não está no acervo guardado. Confira na fonte antes de usar.", texto: null, fonte: null }] }));
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Exibir documento");
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();

  const proposta = dialogo.getByRole("region", { name: "Sugestão da IA" });
  await expect(proposta).toContainText("art. 396, CPC");
  await expect(proposta).toContainText("Serve para pedir que a outra parte mostre um documento.");
  await expect(campoDaBase(dialogo)).toHaveValue("");
  expect(api.mudancas("/ia/base-legal").map((p) => p.corpo)).toEqual([{ tipo: "Exibir documento", processoId: null, publicacaoId: null }]);

  // Sem o texto, a tela diz isso em vez de inventar.
  api.responder("POST /base-legal", { tabela: null, semIa: false, reconhecida: true, lei: [{ trecho: "art. 396 do CPC", selo: "nao_verificada", motivo: "Não está no acervo guardado. Confira na fonte antes de usar.", texto: null, fonte: null }] });
  await proposta.getByRole("button", { name: "Usar" }).click();
  await expect(campoDaBase(dialogo)).toHaveValue("art. 396, CPC");
  await expect(dialogo.getByText("Sugerida pela IA")).toBeVisible();
  await expect(dialogo.getByText("Serve para pedir que a outra parte mostre um documento.")).toBeVisible();
  const lei = dialogo.getByRole("region", { name: "O que diz a lei" });
  await expect(lei).toContainText("Não tenho o texto deste artigo aqui.");
  await expect(lei).toContainText("Não está no acervo guardado.");
  await expect.poll(() => api.mudancas("/ia/campo/00000000-0000-4000-8000-0000000000e1/usado")).toHaveLength(1);
});

test("com o artigo achado no acervo, a marca deixa de dizer sugerida", async ({ page }) => {
  const achada = { trecho: "art. 396 do CPC", selo: "verificada", motivo: "Em vigor no texto compilado do Código de Processo Civil (2015) (CPC).", texto: "O juiz pode ordenar que a parte exiba documento.", fonte: FONTE };
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/base-legal", sugestao({ lei: [achada] })).responder("POST /base-legal", { tabela: null, semIa: false, reconhecida: true, lei: [achada] });
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Exibir documento");
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();
  await dialogo.getByRole("region", { name: "Sugestão da IA" }).getByRole("button", { name: "Usar" }).click();
  await expect(dialogo.getByText("Da IA, artigo achado no acervo")).toBeVisible();
  await expect(dialogo.getByText("Sugerida pela IA")).toHaveCount(0);
  await expect(dialogo.getByRole("region", { name: "O que diz a lei" })).toContainText("O juiz pode ordenar que a parte exiba documento.");
});

test("a sugestão é do ato pedido: mudar O que fazer tira a resposta velha da tela", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/base-legal", sugestao());
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Exibir documento");
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();
  await expect(dialogo.getByRole("region", { name: "Sugestão da IA" })).toContainText("art. 396, CPC");
  await oQueFazer(dialogo).fill("Juntar procuração");
  await expect(dialogo.getByRole("region", { name: "Sugestão da IA" })).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Sugerir com a IA" })).toBeVisible();
});

test("usar a sugestão por cima do que a pessoa digitou guarda o texto de antes", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/base-legal", sugestao());
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Exibir documento");
  await campoDaBase(dialogo).fill("contrato, cláusula 7");
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();
  await dialogo.getByRole("region", { name: "Sugestão da IA" }).getByRole("button", { name: "Usar" }).click();
  await expect(campoDaBase(dialogo)).toHaveValue("art. 396, CPC");
  await dialogo.getByRole("button", { name: "Voltar ao texto de antes" }).click();
  await expect(campoDaBase(dialogo)).toHaveValue("contrato, cláusula 7");
});

test("escritório só para leitura não tem como buscar a lei: o painel não oferece", async ({ page }) => {
  const pub = amostras.publicacaoMarina!.corpo;
  const comBase = { ...pub, sugestao: { ...pub.sugestao, conteudo: { ...pub.sugestao.conteudo, fundamento: "art. 477, § 1º, CPC" } } };
  const api = new ApiFalsa().responder("/eu", { ...euComIa, assinatura: { situacao: "so_leitura", acesso: "leitura", aviso: null } }).responder(`/publicacoes/${ids.publicacao}`, comBase);
  await abrir(page, `/publicacoes?id=${ids.publicacao}`, api);
  await expect(page.getByText("art. 477, § 1º, CPC").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Ver a lei" })).toHaveCount(0);
});

test("sem o texto do artigo, como na CLT, a tela diz isso", async ({ page }) => {
  const clt = { trecho: "art. 897 do CLT", selo: "com_ressalva", motivo: "A lei existe, mas a fonte não traz o texto de cada artigo. Confira o artigo no Diário Oficial.", texto: null, fonte: FONTE };
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /base-legal", { tabela: { ato: "agravo de petição", dias: 8, fundamento: "CLT, art. 897", explicacao: "Na Justiça do Trabalho, o recurso contra decisão da fase de cobrança." }, semIa: false, reconhecida: true, lei: [clt] });
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Agravo de petição");
  await expect(campoDaBase(dialogo)).toHaveValue("CLT, art. 897");
  const lei = dialogo.getByRole("region", { name: "O que diz a lei" });
  await expect(lei).toContainText("Não tenho o texto deste artigo aqui.");
  await expect(lei).toContainText("a fonte não traz o texto de cada artigo");
  await expect(lei.getByRole("link", { name: /normas\.leg\.br/ })).toBeVisible();
});

test("a pessoa digita o que quiser: o que ela escreveu fica, sem marca, e a tabela não passa por cima", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa);
  const dialogo = await abrirNovoPrazo(page, api);
  await campoDaBase(dialogo).fill("contrato, cláusula 7");
  await expect(dialogo.getByRole("region", { name: "O que diz a lei" })).toContainText("Não reconheci um artigo de lei neste texto");
  await expect(dialogo.getByText("Da tabela do Decreta")).toHaveCount(0);

  api.responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: false, lei: [] });
  await oQueFazer(dialogo).fill("Contestação");
  await expect(dialogo.getByRole("button", { name: "Usar o da tabela: CPC, art. 335" })).toBeVisible();
  await expect(campoDaBase(dialogo)).toHaveValue("contrato, cláusula 7");
  await dialogo.getByRole("button", { name: "Usar o da tabela: CPC, art. 335" }).click();
  await expect(campoDaBase(dialogo)).toHaveValue("CPC, art. 335");
  await expect(dialogo.getByText("Da tabela do Decreta")).toBeVisible();

  // Apagar também vale: a tabela não preenche de novo por conta própria.
  await campoDaBase(dialogo).fill("");
  await page.waitForTimeout(700);
  await expect(campoDaBase(dialogo)).toHaveValue("");
});

test("preencher a base legal não confirma o prazo nem muda a data", async ({ page }) => {
  const sentenca = amostras.publicacaoMarina!.corpo;
  const c = sentenca.sugestao.conteudo;
  const semBase = { ...sentenca, prazo: null, sugestao: { ...sentenca.sugestao, conteudo: { ...c, tipo: "Contestação", fundamento: null, conferencia: { confianca: "alta", motivos: ["ok"] } } } };
  const api = new ApiFalsa().responder("/eu", euComIa).responder(`/publicacoes/${ids.publicacao}`, semBase).responder("POST /prazos/calcular", previa).responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: true, lei: [LEI] });
  await abrir(page, `/publicacoes?id=${ids.publicacao}`, api);
  await page.getByRole("button", { name: "Ajustar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar e confirmar" });
  const dias = await dialogo.getByLabel("Dias").inputValue();
  await expect(campoDaBase(dialogo)).toHaveValue("CPC, art. 335");
  await expect(dialogo.getByText("não confirma o prazo nem muda a data")).toBeVisible();
  await expect(dialogo.getByLabel("Dias")).toHaveValue(dias);
  expect(api.mudancas(new RegExp(`/publicacoes/${ids.publicacao}/confirmar`))).toHaveLength(0);
  const contas = api.mudancas("/prazos/calcular").map((p) => (p.corpo as { dias: number }).dias);
  expect(new Set(contas).size).toBe(1);
  // Quem confirma é a pessoa, e o que está no campo vai junto.
  await dialogo.getByRole("button", { name: "Confirmar prazo" }).click();
  await expect.poll(() => api.mudancas(new RegExp(`/publicacoes/${ids.publicacao}/confirmar`)).map((p) => (p.corpo as { fundamento: string }).fundamento)).toEqual(["CPC, art. 335"]);
});

test("o que a IA já tinha lido da publicação entra com a marca de sugerida, e não é trocado pela tabela", async ({ page }) => {
  const pub = amostras.publicacaoMarina!.corpo;
  const c = pub.sugestao.conteudo;
  const comBase = { ...pub, prazo: null, sugestao: { ...pub.sugestao, conteudo: { ...c, fundamento: "art. 477, § 1º, CPC", conferencia: { confianca: "alta", motivos: ["ok"] } } } };
  const api = new ApiFalsa().responder("/eu", euComIa).responder(`/publicacoes/${ids.publicacao}`, comBase).responder("POST /prazos/calcular", previa).responder("POST /base-legal", { tabela: { ...TABELA, fundamento: "CPC, art. 477, § 1º" }, semIa: false, reconhecida: true, lei: [] });
  await abrir(page, `/publicacoes?id=${ids.publicacao}`, api);
  // No painel da decisão, a base legal lida já diz que é sugestão, e abre a lei.
  const decisao = page.locator(".dc-caixa__decisao");
  await expect(decisao.getByText("art. 477, § 1º, CPC")).toBeVisible();
  await expect(decisao.getByText("Sugerida pela IA")).toBeVisible();
  api.responder("POST /base-legal", { tabela: null, semIa: false, reconhecida: true, lei: [{ ...LEI, trecho: "art. 477, § 1º do CPC", texto: "As partes serão intimadas para se manifestar sobre o laudo." }] });
  await decisao.getByRole("button", { name: "Ver a lei" }).click();
  await expect(decisao.getByRole("region", { name: "O que diz a lei" })).toContainText("As partes serão intimadas para se manifestar sobre o laudo.");
  await expect(decisao.getByText("Da IA, artigo achado no acervo")).toBeVisible();

  await page.getByRole("button", { name: "Ajustar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar e confirmar" });
  await expect(campoDaBase(dialogo)).toHaveValue("art. 477, § 1º, CPC");
});

test("sem IA a tabela e a lei continuam, sem o botão; cliente que recusou também", async ({ page }) => {
  // A IA desligada (a amostra de /eu).
  const desligada = new ApiFalsa().responder("POST /base-legal", { tabela: null, semIa: false, reconhecida: false, lei: [] });
  let dialogo = await abrirNovoPrazo(page, desligada);
  await oQueFazer(dialogo).fill("Exibir documento");
  await expect.poll(() => desligada.mudancas("/base-legal").some((p) => (p.corpo as { tipo: string }).tipo === "Exibir documento")).toBe(true);
  await expect(dialogo.getByRole("button", { name: "Sugerir com a IA" })).toHaveCount(0);
  desligada.responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: true, lei: [LEI] });
  await oQueFazer(dialogo).fill("Contestação");
  await expect(campoDaBase(dialogo)).toHaveValue("CPC, art. 335");

  // A API diz que o cliente do processo recusou a IA.
  const recusou = new ApiFalsa().responder("/eu", euComIa).responder("POST /base-legal", { tabela: null, semIa: true, reconhecida: false, lei: [] });
  dialogo = await abrirNovoPrazo(page, recusou);
  await oQueFazer(dialogo).fill("Exibir documento");
  await expect.poll(() => recusou.mudancas("/base-legal").some((p) => (p.corpo as { tipo: string }).tipo === "Exibir documento")).toBe(true);
  await page.waitForTimeout(100);
  await expect(dialogo.getByRole("button", { name: "Sugerir com a IA" })).toHaveCount(0);
});

test("a IA falha, recusa ou o limite acaba: a tela diz, e o campo continua", async ({ page }) => {
  const detalhe = "A IA não respondeu agora. O seu texto continua no campo. Tente de novo em instantes.";
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/base-legal", { erro: "ia_falhou", detalhe }, 503);
  const dialogo = await abrirNovoPrazo(page, api);
  await oQueFazer(dialogo).fill("Exibir documento");
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();
  await expect(dialogo.getByText(detalhe)).toBeVisible();
  await campoDaBase(dialogo).fill("art. 1 do CPC");
  await expect(campoDaBase(dialogo)).toHaveValue("art. 1 do CPC");

  api.responder("POST /ia/base-legal", { id: "00000000-0000-4000-8000-0000000000e2", situacao: "recusa", motivo: "Não dá para apontar o artigo com segurança." });
  await dialogo.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(dialogo.getByText("Não dá para apontar o artigo com segurança.")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Usar" })).toHaveCount(0);
  await dialogo.getByRole("button", { name: "Fechar" }).click();

  const limite = "Você chegou ao limite de uso da IA de hoje. Amanhã, a partir da meia-noite, volta a funcionar.";
  api.responder("POST /ia/base-legal", { erro: "limite_ia", detalhe: limite, passaLogo: false }, 429);
  await dialogo.getByRole("button", { name: "Sugerir com a IA" }).click();
  await expect(dialogo.getByText(limite)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
});

test("Ajustar prazo também tem a base legal explicada", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /prazos/calcular", previa).responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: true, lei: [LEI] });
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await page.getByRole("button", { name: "Ajustar" }).first().click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar prazo" });
  await expect(dialogo.getByRole("region", { name: "O que diz a lei" })).toContainText("O réu poderá oferecer contestação");
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("o campo e a lei cabem em 390 px, um embaixo do outro, sem rolar para o lado", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /base-legal", { tabela: TABELA, semIa: false, reconhecida: true, lei: [LEI] });
    await abrir(page, "/prazos", api.responder("POST /prazos/calcular", previa));
    await page.getByRole("button", { name: /Novo prazo/ }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo prazo" });
    await oQueFazer(dialogo).fill("Contestação");
    const lei = dialogo.getByRole("region", { name: "O que diz a lei" });
    await expect(lei).toBeVisible();
    const campo = (await campoDaBase(dialogo).boundingBox())!;
    const caixa = (await lei.boundingBox())!;
    expect(caixa.y).toBeGreaterThan(campo.y + campo.height - 1);
    expect(await sobraNaLateral(page)).toBe(0);
  });
});
