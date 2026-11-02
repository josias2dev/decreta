/** Medição do funil na landing: a visita e os cliques vão pelo /api/eventos, só com o nome, e só para quem não tem sessão. */
import { expect, test } from "@playwright/test";
import { abrir, ApiFalsa } from "./apoio";

const semSessao = () => {
  const api = new ApiFalsa();
  api.logado = false;
  return api;
};
const eventos = (api: ApiFalsa) => api.mudancas("/eventos").map((p) => p.corpo);

test("a visita à landing conta uma vez, só com o nome do evento", async ({ page }) => {
  const api = await abrir(page, "/", semSessao());
  await expect(page.locator(".lp-hero").getByRole("link", { name: "Criar conta" })).toBeVisible();
  await expect.poll(() => eventos(api)).toEqual([{ nome: "visita" }]);
  // Rolar e mexer na página não conta de novo.
  await page.mouse.wheel(0, 800);
  await page.waitForTimeout(300);
  expect(eventos(api)).toEqual([{ nome: "visita" }]);
});

test("quem já tem sessão e abre o site segue para o dia, sem contar visita", async ({ page }) => {
  const api = await abrir(page, "/", new ApiFalsa());
  await expect(page).toHaveURL(/\/hoje$/);
  expect(eventos(api)).toEqual([]);
});

test("criar conta: o clique conta clicou_criar_conta e leva ao cadastro", async ({ page }) => {
  const api = await abrir(page, "/", semSessao());
  await expect.poll(() => eventos(api)).toEqual([{ nome: "visita" }]);
  await page.locator(".lp-hero").getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/cadastro$/);
  expect(eventos(api)).toEqual([{ nome: "visita" }, { nome: "clicou_criar_conta" }]);
});

test("o que tem data-evento da lista conta o clique; nome fora da lista não manda nada", async ({ page }) => {
  const api = await abrir(page, "/", semSessao());
  await expect.poll(() => eventos(api)).toEqual([{ nome: "visita" }]);
  await page.evaluate(() => {
    const div = document.createElement("div");
    div.innerHTML = '<a id="demo" href="#demo" data-evento="clicou_demonstracao">Ver um escritório de exemplo</a><a id="estranho" href="#estranho" data-evento="cadastro_concluido">Estranho</a>';
    document.querySelector(".lp-hero")!.appendChild(div);
  });
  await page.locator("#demo").click();
  await page.locator("#estranho").click();
  expect(eventos(api)).toEqual([{ nome: "visita" }, { nome: "clicou_demonstracao" }]);
});
