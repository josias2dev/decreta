/** Cadastro aberto e a configuração inicial: /cadastro → /comecar (quatro etapas) → /hoje. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

/** O /eu de um escritório recém-criado: a sócia, sozinha, com a configuração inicial pendente. */
const euPendente = { ...amostras.eu!.corpo, escritorio: { ...amostras.eu!.corpo.escritorio, nome: "Souza & Mendes Advocacia", pessoas: 1, onboarding: true } };
const escritorioNovo = { ...amostras.escritorio!.corpo, nome: "Souza & Mendes Advocacia", timbre: null, whatsappOficial: null, tribunal: "TJSC", capturaDjen: true, avisos: { manha: true, hora: "07:30" } };

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
  await expect(criar).toBeEnabled();
  // Depois do cadastro a sessão existe: o /eu passa a responder o escritório novo.
  api.responder("/eu", euPendente).responder("/escritorio", escritorioNovo);
  await criar.click();
  await expect(page).toHaveURL(/\/comecar$/);
  expect(api.mudancas("/cadastro")[0]!.corpo).toEqual({ nome: "Beatriz Souza", email: "beatriz@souza.adv.br", senha: "senha-bem-longa-123", escritorio: "Souza & Mendes Advocacia" });
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
  await expect(page.getByText(/É por esta OAB que o Decreta busca/)).toBeVisible();
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
