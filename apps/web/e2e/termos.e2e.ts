/** Termos de Uso, Política de Privacidade e o aceite no cadastro e no convite. */
import { expect, test } from "@playwright/test";
import { abrir, AGORA, ApiFalsa, sobraNaLateral } from "./apoio";

const semSessao = () => {
  const api = new ApiFalsa();
  api.logado = false;
  return api;
};

test("termos: a página aberta traz a IA com revisão humana e o advogado responsável pelo prazo, sem lacuna a preencher", async ({ page }) => {
  await abrir(page, "/termos", semSessao());
  await expect(page.getByRole("heading", { level: 1, name: "Termos de Uso do Decreta" })).toBeVisible();
  const ia = page.getByRole("region", { name: "Inteligência artificial" });
  await expect(ia.getByText(/Nenhum fornecedor de IA usa o conteúdo do escritório para treinar modelos/)).toBeVisible();
  await expect(ia.getByText(/pela Anthropic, que responde pelos modelos Claude, o pedido fica guardado por até 30 dias/)).toBeVisible();
  await expect(ia.getByText(/A revisão por uma pessoa é obrigatória/)).toBeVisible();
  await expect(ia.getByText(/O advogado continua responsável pelo prazo e pelo que protocola/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Os dados do escritório" }).getByText(/o escritório é o controlador e o Decreta é o operador/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Exportar os dados e encerrar a conta" }).getByText(/apagados de vez 30 dias depois/)).toBeVisible();
  // Sem dados da empresa no repositório, nada de colchete nem de "a preencher" na página.
  const texto = await page.locator("main").innerText();
  expect(texto).not.toMatch(/\[|\]|a preencher|COMPLETAR|undefined|null/i);
  await expect(page.getByText(/^Versão de 2 de novembro de 2026\.$/)).toBeVisible();
  // O contato é o WhatsApp que já está no site.
  await expect(page.getByRole("link", { name: "(46) 99907-4372" })).toHaveAttribute("href", "https://wa.me/5546999074372");
  expect(await sobraNaLateral(page)).toBe(0);
});

test("privacidade: os papéis, a IA, os fornecedores, a medição sem cookie e o prazo de 30 dias", async ({ page }) => {
  await abrir(page, "/privacidade", semSessao());
  await expect(page.getByRole("heading", { level: 1, name: "Política de Privacidade do Decreta" })).toBeVisible();
  await expect(page.getByText("Dados dos clientes e dos casos do escritório", { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/o escritório é o controlador, e o Decreta é o operador/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Inteligência artificial" }).getByText(/Pelo OpenRouter o pedido vai com retenção zero/)).toBeVisible();
  const fornecedores = page.getByRole("table", { name: "Fornecedores que tratam dados" });
  for (const nome of ["Anthropic", "OpenRouter", "Cloudflare R2", "Resend", "WhatsApp (Meta)", "Sentry"]) await expect(fornecedores.getByRole("cell", { name: nome, exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "O site e a medição de uso" }).getByText(/Não há cookie, o endereço de IP não é gravado e nenhuma pessoa é identificada/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Por quanto tempo os dados ficam" }).getByText(/apagados de vez 30 dias depois/)).toBeVisible();
  const texto = await page.locator("main").innerText();
  expect(texto).not.toMatch(/\[|\]|a preencher|COMPLETAR|undefined|null/i);
  expect(await sobraNaLateral(page)).toBe(0);
});

test("as três páginas abertas se ligam pelo rodapé", async ({ page }) => {
  await abrir(page, "/seguranca", semSessao());
  const rodape = page.getByRole("navigation", { name: "Documentos legais" });
  await expect(rodape.getByRole("link")).toHaveText(["Termos de Uso", "Privacidade", "Segurança e LGPD"]);
  await rodape.getByRole("link", { name: "Termos de Uso" }).click();
  await expect(page).toHaveURL(/\/termos$/);
  await page.getByRole("navigation", { name: "Documentos legais" }).getByRole("link", { name: "Privacidade" }).click();
  await expect(page).toHaveURL(/\/privacidade$/);
});

test("a tela de entrar e o rodapé da landing levam aos termos e à privacidade", async ({ page }) => {
  await abrir(page, "/entrar", semSessao());
  const rodape = page.getByRole("navigation", { name: "Documentos legais" });
  await expect(rodape.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
  await expect(rodape.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
  await page.goto("/");
  const landing = page.locator(".lp-rodape");
  await expect(landing.getByRole("link", { name: "Termos de Uso" })).toHaveAttribute("href", "/termos");
  await expect(landing.getByRole("link", { name: "Privacidade" })).toHaveAttribute("href", "/privacidade");
  await landing.getByRole("link", { name: "Termos de Uso" }).click();
  await expect(page).toHaveURL(/\/termos$/);
});

test("convite: a conta só se cria com o aceite, e a versão vai junto no pedido", async ({ page }) => {
  const api = semSessao();
  await page.clock.setFixedTime(AGORA);
  await api.ligar(page);
  await page.route("**/api/convites/*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "rafael@souza.adv.br", papel: "member", status: "pending", escritorio: "Souza & Mendes Advocacia" }) }));
  await page.goto("/convite/c0a80123-0000-4000-8000-000000000001");
  await page.getByLabel("Seu nome").fill("Rafael Lima");
  await page.getByLabel("Crie uma senha").fill("senha-bem-longa-123");
  await page.getByLabel("Repita a senha").fill("senha-bem-longa-123");
  const criar = page.getByRole("button", { name: "Criar conta e entrar" });
  await expect(criar).toBeDisabled();
  await page.getByLabel(/Li e aceito os Termos de Uso e a Política de Privacidade/).check();
  await expect(criar).toBeEnabled();
  await criar.click();
  await expect.poll(() => api.pedidos.filter((p) => p.caminho === "/sign-up/email").length).toBe(1);
  expect(api.pedidos.find((p) => p.caminho === "/sign-up/email")!.corpo).toMatchObject({ email: "rafael@souza.adv.br", name: "Rafael Lima", termosVersao: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
});

test("cadastro: os links do aceite abrem os textos em outra aba, sem perder o formulário", async ({ page, context }) => {
  await abrir(page, "/cadastro", semSessao());
  await page.getByLabel("Seu nome").fill("Beatriz Souza");
  const [aba] = await Promise.all([context.waitForEvent("page"), page.getByRole("main").getByRole("link", { name: "Termos de Uso" }).click()]);
  await aba.waitForLoadState();
  await expect(aba).toHaveURL(/\/termos$/);
  await expect(page.getByLabel("Seu nome")).toHaveValue("Beatriz Souza");
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const rota of ["/termos", "/privacidade", "/cadastro"]) {
    test(`${rota} cabe na largura do celular, com o rodapé dos documentos à mão`, async ({ page }) => {
      await abrir(page, rota, semSessao());
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      expect(await sobraNaLateral(page)).toBe(0);
      const rodape = page.getByRole("navigation", { name: "Documentos legais" });
      await rodape.scrollIntoViewIfNeeded();
      await expect(rodape.getByRole("link", { name: "Termos de Uso" })).toBeInViewport();
    });
  }

  test("cadastro: a caixa de aceite e o botão cabem na tela, com o botão desligado até marcar", async ({ page }) => {
    await abrir(page, "/cadastro", semSessao());
    const aceite = page.getByLabel(/Li e aceito os Termos de Uso/);
    await aceite.scrollIntoViewIfNeeded();
    await expect(aceite).toBeInViewport();
    await expect(page.getByRole("button", { name: "Criar conta" })).toBeDisabled();
  });
});
