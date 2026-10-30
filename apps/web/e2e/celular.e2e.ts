/** Telas no celular (390 × 844, como um iPhone 14), com as respostas da demonstração. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

test("landing no celular: Entrar e Pedir acesso no topo, sem rolar para o lado", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, "/", api);
  const topo = page.locator(".lp-topo");
  await expect(topo.getByRole("link", { name: "Entrar" })).toBeInViewport();
  await expect(topo.getByRole("link", { name: "Pedir acesso" })).toBeInViewport();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("Hoje: os cinco números numa linha só, dentro da tela", async ({ page }) => {
  await abrir(page, "/hoje");
  const contadores = page.getByLabel("Números do dia").locator(".dc-contador");
  await expect(contadores).toHaveCount(5);
  const caixas = await contadores.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ top: Math.round(r.top), left: r.left, right: r.right })));
  expect(new Set(caixas.map((c) => c.top)).size).toBe(1);
  expect(Math.min(...caixas.map((c) => c.left))).toBeGreaterThanOrEqual(0);
  expect(Math.max(...caixas.map((c) => c.right))).toBeLessThanOrEqual(390);
  await expect(page.getByText("7 publicações novas do DJEN")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navegação" })).toBeVisible();
});

test("prazo: ações presas embaixo e confirmar", async ({ page }) => {
  const api = await abrir(page, `/prazos/${ids.prazo}`);
  const confirmar = page.getByRole("button", { name: "Confirmar prazo" });
  await expect(confirmar).toBeInViewport();
  await expect(page.getByRole("button", { name: "Ajustar" })).toBeInViewport();
  await confirmar.tap();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/confirmar`).length).toBe(1);
});

test("publicação: prazo sugerido e as ações embaixo", async ({ page }) => {
  await abrir(page, `/publicacoes/${ids.publicacao}`);
  await expect(page.getByText("Prazo sugerido")).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar prazo" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Não gera prazo" })).toBeInViewport();
});

test("processo: as abas cabem sem rolar e Perguntar abre o chat do processo", async ({ page }) => {
  await abrir(page, `/processos/${ids.processo}`);
  const abas = page.getByRole("tablist");
  await expect(abas.getByRole("tab")).toHaveCount(4);
  expect(await abas.evaluate((e) => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(0);
  await page.getByRole("link", { name: "Perguntar" }).tap();
  await expect(page).toHaveURL(new RegExp(`/processos/${ids.processo}\\?aba=chat`));
  await expect(page.getByRole("heading", { name: "Perguntar" })).toBeVisible();
  // O chat tem o campo embaixo, no lugar da navegação.
  await expect(page.getByRole("navigation", { name: "Navegação" })).toHaveCount(0);
  await page.getByRole("button", { name: "Voltar" }).tap();
  await expect(page.getByRole("tab", { name: "Resumo" })).toHaveAttribute("aria-selected", "true");
});

test("Mais: o resto do menu, sem repetir a navegação de baixo", async ({ page }) => {
  await abrir(page, "/mais");
  const miolo = page.locator("main");
  for (const item of ["Publicações", "Agenda", "Novos negócios", "Alvarás", "Documentos", "Modelos", "Equipe", "Configurações"]) await expect(miolo.getByRole("link", { name: new RegExp(item) })).toBeVisible();
  for (const item of ["Hoje", "Prazos", "Processos", "Clientes"]) await expect(miolo.getByRole("link", { name: new RegExp(`^${item}`) })).toHaveCount(0);
});

test("peça sem a IA: o botão de baixo é escrever à mão", async ({ page }) => {
  await abrir(page, `/pecas?prazo=${ids.prazo}`);
  await expect(page.getByRole("button", { name: "Escrever à mão" })).toBeInViewport();
});

test("sentença: leitura pedido a pedido, decisão alinhada à direita e confirmar", async ({ page }) => {
  const api = await abrir(page, `/publicacoes/${ids.sentenca}`, new ApiFalsa().responder("/eu", euComIa));
  await expect(page.getByText("Leitura da sentença")).toBeVisible();
  const decisoes = page.locator(".dc-pedidos__decisao");
  await expect(decisoes).toHaveCount(3);
  const direitas = await decisoes.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().right)));
  expect(new Set(direitas).size).toBe(1);
  await page.getByRole("button", { name: "Confirmar resultado" }).tap();
  await expect.poll(() => api.mudancas(`/publicacoes/${ids.sentenca}/resultado`).length).toBe(1);
  expect(await sobraNaLateral(page)).toBe(0);
});

test("peça revisada: quem revisou e guardar como modelo, no meio da tela", async ({ page }) => {
  await abrir(page, `/pecas?id=${ids.peca}`, new ApiFalsa().responder(`/pecas/${ids.peca}`, amostras.pecaRevisada!.corpo));
  await expect(page.getByText(/Revisada por Beatriz · OAB\/SC 41\.233/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar como modelo" })).toBeVisible();
});

const ROTAS = [
  "/hoje",
  "/prazos",
  `/prazos/${ids.prazo}`,
  "/publicacoes",
  `/publicacoes/${ids.publicacao}`,
  "/processos",
  `/processos/${ids.processo}`,
  `/processos/${ids.processo}?aba=movimentacoes`,
  `/pecas?id=${ids.peca}`,
  "/clientes",
  `/clientes/${ids.cliente}`,
  "/agenda",
  `/audiencias/${ids.audiencia}`,
  "/negocios",
  "/alvaras",
  "/documentos",
  "/modelos",
  `/publicacoes/${ids.sentenca}#sentenca`,
  `/processos/${ids.processoComResultado}#resultado`,
  "/equipe",
  "/configuracoes",
  "/conta",
  "/mais",
];
for (const rota of ROTAS) {
  test(`${rota.replace(/[0-9a-f-]{36}/, ":id")} cabe na largura do celular`, async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    await abrir(page, rota);
    await expect(page.locator(".dc-topo__titulo")).toBeVisible();
    await expect(page.getByLabel("Carregando")).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
    // Abas são a única coisa que pode passar da largura sem rolar a página.
    const abasRolando = await page.locator(".dc-abas").evaluateAll((els) => els.filter((e) => e.scrollWidth > e.clientWidth).length);
    expect(abasRolando).toBe(0);
    expect(erros).toEqual([]);
  });
}
