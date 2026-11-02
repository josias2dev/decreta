/**
 * Salvar o processo sem o número: a tela marca que está incompleto e que não está
 * sendo monitorado, e oferece buscar o número.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const processo = amostras.processo!.corpo;
const lista = amostras.processos!.corpo;
const CNJ = "5004321-25.2026.8.24.0038";
const incompleto = { faltam: ["o número", "a vara"], monitorado: false };
const semNumero = { ...processo, cnj: null, tribunal: null, tipo: "judicial", orgao: null, incompleto };
const NA_LISTA = { ...lista.itens[0], id: ids.processo, titulo: "Marina Duarte × Seguradora Alfa", cnj: null, tipo: "judicial", orgao: null, comarca: null, incompleto };
const faixa = (page: Page) => page.locator(".dc-faixa").filter({ hasText: "Processo incompleto e não monitorado" });

async function preencherSemNumero(page: Page) {
  const dialogo = page.getByRole("dialog", { name: "Novo processo" });
  await dialogo.getByLabel("Ainda não tenho o número").check();
  return dialogo;
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("Novo processo: dá para salvar sem o número, avisando antes o que isso significa", async ({ page }) => {
    const api = new ApiFalsa().responder("POST /processos", { id: ids.processo }, 201);
    await abrir(page, "/processos?novo=true", api);
    const dialogo = page.getByRole("dialog", { name: "Novo processo" });
    await expect(dialogo.getByRole("button", { name: "Cadastrar" })).toBeDisabled();

    await preencherSemNumero(page);
    await expect(dialogo.getByLabel("Número do processo (CNJ)")).toHaveCount(0);
    await expect(dialogo.getByText(/fica incompleto e não é monitorado/)).toBeVisible();
    const salvar = dialogo.getByRole("button", { name: "Salvar incompleto" });
    // Sem nada que identifique o processo, não salva.
    await expect(salvar).toBeDisabled();
    await dialogo.getByLabel("Título do processo").fill("Marina Duarte × Seguradora Alfa");
    await salvar.click();
    await expect.poll(() => api.mudancas("/processos").length).toBe(1);
    expect(api.mudancas("/processos")[0]!.corpo).toMatchObject({ tipo: "judicial", cnj: null, titulo: "Marina Duarte × Seguradora Alfa" });
    await expect(page.getByText("Processo salvo incompleto. Busque o número quando puder.")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/processos/${ids.processo}`));
  });

  test("Novo processo: a outra parte também identifica, e o caminho com número não muda", async ({ page }) => {
    await abrir(page, "/processos?novo=true");
    const dialogo = page.getByRole("dialog", { name: "Novo processo" });
    await expect(dialogo.getByLabel("Número do processo (CNJ)")).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Cadastrar" })).toBeVisible();
    await preencherSemNumero(page);
    await dialogo.getByLabel("Outra parte").fill("Seguradora Alfa");
    await expect(dialogo.getByRole("button", { name: "Salvar incompleto" })).toBeEnabled();
    // Quem marca "extrajudicial" sai do incompleto: são caminhos diferentes.
    await dialogo.getByLabel("Caso extrajudicial (sem número)").check();
    await expect(dialogo.getByLabel("Ainda não tenho o número")).not.toBeChecked();
    await expect(dialogo.getByText(/fica incompleto/)).toHaveCount(0);
    await expect(dialogo.getByRole("button", { name: "Cadastrar" })).toBeVisible();
  });

  test("a ficha marca o que falta, que não está sendo monitorado, e diz Sem número no lugar de Extrajudicial", async ({ page }) => {
    await abrir(page, `/processos/${ids.processo}`, new ApiFalsa().responder(`/processos/${ids.processo}`, semNumero));
    await expect(faixa(page)).toContainText("Falta o número e a vara.");
    await expect(faixa(page)).toContainText("não traz os andamentos do DataJud");
    await expect(page.locator(".dc-topo-detalhe .dc-cnj")).toHaveText("Sem número");
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("processo com número não tem marca nenhuma", async ({ page }) => {
    await abrir(page, `/processos/${ids.processo}`);
    await expect(page.getByRole("heading", { name: processo.titulo })).toBeVisible();
    await expect(faixa(page)).toHaveCount(0);
  });

  test("buscar o número: as publicações que combinam, com um clique, e o processo passa a ser monitorado", async ({ page }) => {
    const candidatos = [{ cnj: CNJ, tribunal: "TJSC", orgao: "2ª Vara Cível de Joinville", dia: "2026-10-27", nome: "Marina Duarte" }];
    const api = new ApiFalsa().responder(`/processos/${ids.processo}`, semNumero).responder(`/processos/${ids.processo}/numero`, { candidatos });
    await abrir(page, `/processos/${ids.processo}`, api);
    await faixa(page).getByRole("button", { name: "Buscar o número" }).click();
    const dialogo = page.getByRole("dialog", { name: "Buscar o número" });
    const achado = dialogo.locator(".dc-linhas__item").filter({ hasText: CNJ });
    await expect(achado).toContainText("2ª Vara Cível de Joinville");
    await expect(achado).toContainText("27/10/2026");
    await expect(achado).toContainText("Marina Duarte");
    api.responder(`/processos/${ids.processo}`, processo);
    await achado.getByRole("button", { name: "Usar este número" }).click();
    await expect.poll(() => api.mudancas(`/processos/${ids.processo}`).length).toBe(1);
    expect(api.mudancas(`/processos/${ids.processo}`)[0]!.corpo).toEqual({ cnj: CNJ });
    await expect(page.getByText("Número salvo. O Decreta passa a acompanhar este processo.")).toBeVisible();
    await expect(dialogo).toHaveCount(0);
    await expect(faixa(page)).toHaveCount(0);
  });

  test("buscar o número: sem achado, diz isso e deixa digitar, com o erro do servidor em português", async ({ page }) => {
    const api = new ApiFalsa().responder(`/processos/${ids.processo}`, semNumero).responder(`/processos/${ids.processo}/numero`, { candidatos: [] });
    await abrir(page, `/processos/${ids.processo}`, api);
    await faixa(page).getByRole("button", { name: "Buscar o número" }).click();
    const dialogo = page.getByRole("dialog", { name: "Buscar o número" });
    await expect(dialogo.getByText(/Nenhuma publicação lida combina com este processo/)).toBeVisible();
    const salvar = dialogo.getByRole("button", { name: "Salvar o número" });
    await expect(salvar).toBeDisabled();
    await dialogo.getByLabel("Número do processo (CNJ)").fill(CNJ);
    api.responder(`PUT /processos/${ids.processo}`, { erro: "processo_existe", detalhe: "Este número já está cadastrado." }, 409);
    await salvar.click();
    await expect(dialogo.getByRole("alert")).toHaveText("Este número já está cadastrado.");
    await expect(dialogo).toBeVisible();
  });

  test("a lista marca o incompleto e filtra por ele, e o filtro some quando não há nenhum", async ({ page }) => {
    const api = new ApiFalsa().responder("/processos", { ...lista, incompletos: 1, itens: [NA_LISTA, ...lista.itens.slice(1, 4)] });
    await abrir(page, "/processos", api);
    const linha = page.locator("tr[data-link]").filter({ hasText: "Marina Duarte × Seguradora Alfa" }).first();
    await expect(linha.getByText("Incompleto · não monitorado")).toBeVisible();
    await expect(linha.getByText("Sem número")).toBeVisible();
    const altura = (await linha.boundingBox())!.height;
    expect(altura).toBeLessThanOrEqual(58);
    const chip = page.getByRole("button", { name: /^Incompletos/ });
    await chip.click();
    await expect(page).toHaveURL(/situacao=incompletos/);
    await expect.poll(() => api.pedidos.some((p) => p.caminho === "/processos")).toBe(true);
    await abrir(page, "/processos");
    await expect(page.getByRole("button", { name: "Ativos" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Incompletos/ })).toHaveCount(0);
  });

  test("em Prazos, o processo judicial sem número não vira extrajudicial", async ({ page }) => {
    const prazos = amostras.prazos!.corpo;
    await abrir(page, "/prazos", new ApiFalsa().responder("/prazos", { ...prazos, itens: [{ ...prazos.itens[0], processo: { ...prazos.itens[0].processo, cnj: null, tipo: "judicial" } }] }));
    await expect(page.locator(".dc-tabela .dc-cnj")).toHaveText("Sem número");
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("a ficha e a lista marcam, sem rolar para o lado, e a busca do número abre como folha", async ({ page }) => {
    const candidatos = [{ cnj: CNJ, tribunal: "TJSC", orgao: "2ª Vara Cível de Joinville", dia: "2026-10-27", nome: "Marina Duarte" }];
    await abrir(page, `/processos/${ids.processo}`, new ApiFalsa().responder(`/processos/${ids.processo}`, semNumero).responder(`/processos/${ids.processo}/numero`, { candidatos }));
    await expect(faixa(page)).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
    await faixa(page).getByRole("button", { name: "Buscar o número" }).tap();
    const dialogo = page.getByRole("dialog", { name: "Buscar o número" });
    await expect(dialogo.getByText(CNJ)).toBeVisible();
    expect((await dialogo.boundingBox())!.width).toBe(390);
    expect(await dialogo.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);

    await abrir(page, "/processos", new ApiFalsa().responder("/processos", { ...lista, incompletos: 1, itens: [NA_LISTA] }));
    await expect(page.locator(".dc-item").getByText("Incompleto · não monitorado").first()).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });
});
