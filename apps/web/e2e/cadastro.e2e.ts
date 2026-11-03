/** Cadastro aberto e a configuração inicial: /cadastro → /comecar (quatro etapas) → /hoje. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

/** O /eu de um escritório recém-criado: a sócia, sozinha, com a configuração inicial pendente. */
const euPendente = { ...amostras.eu!.corpo, escritorio: { ...amostras.eu!.corpo.escritorio, nome: "Souza & Mendes Advocacia", pessoas: 1, onboarding: true } };
const escritorioNovo = { ...amostras.escritorio!.corpo, nome: "Souza & Mendes Advocacia", timbre: null, whatsappOficial: null, tribunal: "TJSC", capturaDjen: true, avisos: { manha: true, hora: "07:30" } };

test.describe("confirmar o e-mail", () => {
  const eu = amostras.eu!.corpo;

  test("no Hoje, um aviso discreto com o pedido de reenviar; não trava nada", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, email: "beatriz@souza.adv.br", emailConfirmado: false } });
    await abrir(page, "/hoje", api);
    const aviso = page.locator(".dc-faixa", { hasText: "Confirme o seu e-mail" });
    await expect(aviso).toContainText("beatriz@souza.adv.br");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await aviso.getByRole("button", { name: "Reenviar o e-mail" }).click();
    await expect.poll(() => api.pedidos.find((p) => p.caminho === "/send-verification-email")?.corpo).toMatchObject({ email: "beatriz@souza.adv.br", callbackURL: expect.stringMatching(/\/hoje$/) });
    await expect(page.getByText("Enviamos o e-mail de novo.")).toBeVisible();
  });

  test("confirmado, nem aviso", async ({ page }) => {
    await abrir(page, "/hoje", new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, email: "beatriz@souza.adv.br", emailConfirmado: true } }));
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("Confirme o seu e-mail")).toHaveCount(0);
  });

  test("em /comecar não aparece nada: o primeiro minuto segue igual", async ({ page }) => {
    await abrir(page, "/comecar", new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, email: "beatriz@souza.adv.br", emailConfirmado: false }, escritorio: { ...eu.escritorio, onboarding: true } }));
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("Confirme o seu e-mail")).toHaveCount(0);
  });

  const CONVITE = "c0a80123-0000-4000-8000-000000000001";
  const noConvite = async (page: import("@playwright/test").Page, verificado: boolean, confirmaEmail = true) => {
    const api = new ApiFalsa();
    await api.ligar(page);
    await page.route("**/api/convites/*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "rafael@souza.adv.br", papel: "member", status: "pending", escritorio: "Souza & Mendes Advocacia", confirmaEmail }) }));
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: { id: "s", userId: "u" }, user: { id: "u", name: "Rafael", email: "rafael@souza.adv.br", emailVerified: verificado } }) }));
    await page.goto(`/convite/${CONVITE}`);
    return api;
  };

  test("convite com o e-mail por confirmar: diz o que falta, reenvia, e não oferece entrar na equipe", async ({ page }) => {
    const api = await noConvite(page, false);
    await expect(page.getByText("Falta confirmar que este e-mail é seu.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Entrar na equipe" })).toHaveCount(0);
    await page.getByRole("button", { name: "Reenviar o e-mail" }).click();
    await expect.poll(() => api.pedidos.find((p) => p.caminho === "/send-verification-email")?.corpo).toMatchObject({ email: "rafael@souza.adv.br", callbackURL: expect.stringContaining(`/convite/${CONVITE}`) });
    await expect(page.getByText("Enviamos o e-mail de novo.")).toBeVisible();
    expect(api.pedidos.filter((p) => p.caminho === "/organization/accept-invitation")).toHaveLength(0);
  });

  test("convite com o e-mail confirmado: entra na equipe como antes", async ({ page }) => {
    const api = await noConvite(page, true);
    await page.getByRole("button", { name: "Entrar na equipe" }).click();
    await expect.poll(() => api.pedidos.filter((p) => p.caminho === "/organization/accept-invitation").length).toBe(1);
  });

  test("sem e-mail ligado no servidor: entra na equipe sem pedir uma confirmação que não chegaria", async ({ page }) => {
    const api = await noConvite(page, false, false);
    await expect(page.getByText("Falta confirmar que este e-mail é seu.")).toHaveCount(0);
    await page.getByRole("button", { name: "Entrar na equipe" }).click();
    await expect.poll(() => api.pedidos.filter((p) => p.caminho === "/organization/accept-invitation").length).toBe(1);
  });

  test("criar a conta pelo convite manda voltar para o convite depois de confirmar", async ({ page }) => {
    const api = new ApiFalsa();
    api.logado = false;
    await api.ligar(page);
    await page.route("**/api/convites/*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ email: "rafael@souza.adv.br", papel: "member", status: "pending", escritorio: "Souza & Mendes Advocacia", confirmaEmail: true }) }));
    await page.goto(`/convite/${CONVITE}`);
    await page.getByLabel("Seu nome").fill("Rafael Lima");
    await page.getByLabel("Crie uma senha").fill("senha-bem-longa-123");
    await page.getByLabel("Repita a senha").fill("senha-bem-longa-123");
    await page.getByLabel(/Li e aceito os Termos de Uso/).check();
    await page.route("**/api/auth/get-session", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ session: { id: "s", userId: "u" }, user: { id: "u", name: "Rafael", email: "rafael@souza.adv.br", emailVerified: false } }) }));
    await page.getByRole("button", { name: "Criar conta" }).click();
    await expect(page.getByText("Falta confirmar que este e-mail é seu.")).toBeVisible();
    expect(api.pedidos.find((p) => p.caminho === "/sign-up/email")!.corpo).toMatchObject({ callbackURL: expect.stringContaining(`/convite/${CONVITE}`) });
    expect(api.pedidos.filter((p) => p.caminho === "/organization/accept-invitation")).toHaveLength(0);
  });
});

test("criar conta: os quatro campos, o pedido ao /api/cadastro e a chegada ao /comecar", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, "/cadastro", api);
  await expect(page.getByRole("heading", { name: "Criar conta no Decreta" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Já tenho conta" })).toHaveAttribute("href", "/entrar");
  const criar = page.getByRole("button", { name: "Criar conta" });
  await expect(criar).toBeDisabled();
  await page.getByLabel("Seu nome").fill("Beatriz Souza");
  await page.getByLabel("E-mail").fill("Beatriz@souza.adv.br");
  await page.getByLabel("Senha").fill("curta");
  await expect(page.getByText("Pelo menos 10 caracteres").first()).toBeVisible();
  await page.getByLabel("Senha").fill("senha-bem-longa-123");
  await page.getByLabel("Nome do escritório").fill("Souza & Mendes Advocacia");
  // Com os quatro campos e sem o aceite dos termos, a conta não se cria.
  await expect(criar).toBeDisabled();
  await page.getByLabel(/Li e aceito os Termos de Uso e a Política de Privacidade/).check();
  await expect(criar).toBeEnabled();
  // Depois do cadastro a sessão existe: o /eu passa a responder o escritório novo.
  api.responder("/eu", euPendente).responder("/escritorio", escritorioNovo);
  await criar.click();
  await expect(page).toHaveURL(/\/comecar$/);
  expect(api.mudancas("/cadastro")[0]!.corpo).toEqual({ nome: "Beatriz Souza", email: "beatriz@souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia", termos: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
  await expect(page.getByRole("heading", { name: /^Olá, / })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("criar conta: e-mail já cadastrado mostra o aviso e fica na tela", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  api.responder("/cadastro", { erro: "email_em_uso", detalhe: "Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova." }, 409);
  await abrir(page, "/cadastro", api);
  await page.getByLabel("Seu nome").fill("Beatriz Souza");
  await page.getByLabel("E-mail").fill("beatriz@souza.adv.br");
  await page.getByLabel("Senha").fill("senha-bem-longa-123");
  await page.getByLabel("Nome do escritório").fill("Souza & Mendes Advocacia");
  await page.getByLabel(/Li e aceito/).check();
  await page.getByRole("button", { name: "Criar conta" }).click();
  await expect(page.getByRole("alert")).toHaveText("Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova.");
  await expect(page).toHaveURL(/\/cadastro$/);
});

test("começar: cada etapa grava pela rota que já existe, Pular segue sem gravar e o atalho final conclui e leva ao Hoje", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/eu", euPendente).responder("/escritorio", escritorioNovo);
  await abrir(page, "/comecar", api);

  // Etapa 1: você. A OAB vai com a UF; o WhatsApp é opcional.
  await expect(page.getByRole("heading", { name: "Olá, Beatriz" })).toBeVisible();
  await expect(page.getByText("Etapa 1 de 4")).toBeVisible();
  await expect(page.getByText(/Com ela, o Decreta já busca agora as suas publicações/)).toBeVisible();
  await page.getByLabel("Cargo").fill("Advogada");
  await page.getByLabel("OAB", { exact: true }).fill("41233");
  await page.getByLabel("UF da OAB").selectOption("SC");
  await page.getByLabel("WhatsApp (opcional)").fill("(47) 99123-4567");
  await page.getByRole("button", { name: "Continuar" }).click();
  const perfil = api.mudancas(/^\/equipe\//);
  expect(perfil).toHaveLength(1);
  expect(perfil[0]).toMatchObject({ metodo: "PUT", corpo: { cargo: "Advogada", oabNumero: "41233", oabUf: "SC", whatsapp: "(47) 99123-4567" } });

  // Etapa 2: o escritório. O nome do timbre já vem do cadastro.
  await expect(page.getByText("Etapa 2 de 4")).toBeVisible();
  await expect(page.getByLabel("Nome no timbre")).toHaveValue("Souza & Mendes Advocacia");
  await page.getByLabel("Cidade e UF").fill("Joinville/SC");
  await page.getByLabel("Tribunal padrão").selectOption("TRT12");
  await page.getByLabel(/WhatsApp oficial/).fill("(47) 3433-1000");
  await page.getByRole("button", { name: "Continuar" }).click();
  expect(api.mudancas("/escritorio").at(-1)).toMatchObject({ metodo: "PUT", corpo: { timbre: { nome: "Souza & Mendes Advocacia", endereco: "Joinville/SC" }, tribunal: "TRT12", whatsappOficial: "(47) 3433-1000" } });

  // Etapa 3: o Diário vem ligado; "Pular esta etapa" segue sem gravar.
  await expect(page.getByText("Etapa 3 de 4")).toBeVisible();
  await expect(page.getByLabel("Publicações do DJEN")).toBeChecked();
  await expect(page.getByLabel("Hora do resumo")).toHaveValue("07:30");
  const antes = api.mudancas().length;
  await page.getByRole("button", { name: "Pular esta etapa" }).click();
  expect(api.mudancas().length).toBe(antes);

  // Etapa 4: pronto. O atalho conclui a configuração e vai para o Hoje.
  await expect(page.getByRole("heading", { name: "Tudo pronto, Beatriz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pular esta etapa" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Cadastrar o primeiro processo/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Convidar a equipe/ })).toBeVisible();
  api.responder("/eu", amostras.eu!.corpo);
  await page.getByRole("button", { name: /Ver o Hoje/ }).click();
  await expect(page).toHaveURL(/\/hoje$/);
  expect(api.mudancas("/escritorio/onboarding")).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Hoje" })).toBeVisible();
  await expect(page.getByText("Terminar de configurar o escritório")).toHaveCount(0);
});

test("começar: voltar à etapa anterior e o atalho do primeiro processo abre o diálogo em /processos", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/eu", euPendente).responder("/escritorio", escritorioNovo);
  await abrir(page, "/comecar", api);
  await page.getByRole("button", { name: "Pular esta etapa" }).click();
  await expect(page.getByText("Etapa 2 de 4")).toBeVisible();
  await page.getByRole("button", { name: "Voltar" }).click();
  await expect(page.getByText("Etapa 1 de 4")).toBeVisible();
  for (let i = 0; i < 3; i++) await page.getByRole("button", { name: "Pular esta etapa" }).click();
  await page.getByRole("button", { name: /Cadastrar o primeiro processo/ }).click();
  await expect(page).toHaveURL(/\/processos\?novo=true$/);
  await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
});

test("Hoje com a configuração pendente: o aviso discreto leva ao /comecar, e 'Não mostrar mais' conclui", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/eu", euPendente);
  await page.addInitScript(() => sessionStorage.setItem("dc-comecar-aberto", "1"));
  await abrir(page, "/hoje", api);
  const aviso = page.getByRole("status").filter({ hasText: "Terminar de configurar o escritório" });
  await expect(aviso).toBeVisible();
  await expect(aviso.getByRole("link")).toHaveAttribute("href", "/comecar");
  api.responder("/eu", amostras.eu!.corpo);
  await aviso.getByRole("button", { name: "Não mostrar mais" }).click();
  expect(api.mudancas("/escritorio/onboarding")).toHaveLength(1);
  await expect(aviso).toHaveCount(0);
});

test("depois do login com a configuração pendente, o app abre em /comecar uma vez", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/eu", euPendente).responder("/escritorio", escritorioNovo);
  await abrir(page, "/hoje", api);
  await expect(page).toHaveURL(/\/comecar$/);
  await page.goto("/hoje");
  await expect(page).toHaveURL(/\/hoje$/);
  await expect(page.getByText("Terminar de configurar o escritório")).toBeVisible();
});
