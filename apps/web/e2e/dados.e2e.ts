/** Configurações > Dados: o sócio leva uma cópia de tudo e encerra o escritório, sem falar com o suporte. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa } from "./apoio";

const NOME = "Souza & Mendes Advocacia";
/** O escritório da amostra é o da demonstração; aqui é um escritório de verdade. */
const escritorio = { ...amostras.escritorio!.corpo, nome: NOME, demonstracao: false };
const COPIA = "c0a80123-0000-4000-8000-0000000000aa";
const pedida = { id: COPIA, situacao: "pedida", pedidaEm: "2026-10-29T12:20:00.000Z", prontaEm: null, expiraEm: null, pedidaPor: "Beatriz Souza", documentos: 0, erro: null, partes: [] };
const pronta = {
  ...pedida,
  situacao: "pronta",
  prontaEm: "2026-10-29T12:24:00.000Z",
  expiraEm: "2026-11-05T12:24:00.000Z",
  documentos: 214,
  partes: [
    { n: 1, nome: "decreta-souza-mendes-2026-10-29-parte-1-de-2.zip", tamanho: 48_300_000 },
    { n: 2, nome: "decreta-souza-mendes-2026-10-29-parte-2-de-2.zip", tamanho: 12_900_000 },
  ],
};

const abrirDados = async (page: import("@playwright/test").Page, api: ApiFalsa) => {
  await abrir(page, "/configuracoes", api);
  await page.getByRole("tab", { name: "Dados" }).click();
};

test("com a cobrança ligada, encerrar diz que a assinatura é cancelada junto", async ({ page }) => {
  const eu = amostras.eu!.corpo;
  await abrirDados(page, new ApiFalsa().responder("/eu", { ...eu, assinatura: { situacao: "ativo", acesso: "total", aviso: null } }).responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [] }));
  await page.getByRole("button", { name: "Encerrar o escritório…" }).click();
  await expect(page.getByRole("dialog", { name: "Encerrar o escritório?" }).getByText("A assinatura do Decreta é cancelada junto: nada mais é cobrado.")).toBeVisible();
});

test("com a cobrança desligada, encerrar não fala de assinatura", async ({ page }) => {
  await abrirDados(page, new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [] }));
  await page.getByRole("button", { name: "Encerrar o escritório…" }).click();
  await expect(page.getByRole("dialog", { name: "Encerrar o escritório?" })).toBeVisible();
  await expect(page.getByText("A assinatura do Decreta")).toHaveCount(0);
});

test("levar os dados: o pedido vai em segundo plano, a tela espera e avisa quando a cópia fica pronta, com um botão por ZIP", async ({ page }) => {
  const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [] });
  await abrirDados(page, api);
  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Levar os dados do escritório" }) });
  await expect(painel.getByText(/planilhas em CSV de clientes, processos, prazos, publicações, audiências, tarefas, alvarás, atendimentos, peças/)).toBeVisible();

  api.responder("/escritorio/exportacoes", { itens: [pedida] });
  await painel.getByRole("button", { name: "Preparar a cópia dos dados" }).click();
  expect(api.mudancas("/escritorio/exportacoes")).toHaveLength(1);
  await expect(painel.getByText(/Preparando a cópia pedida em 29\/10 às 09:20 por Beatriz Souza/)).toBeVisible();
  await expect(painel.getByRole("button", { name: "Preparando a cópia…" })).toBeDisabled();

  // A tela olha de novo sozinha: quando a cópia fica pronta, o aviso aparece e os ZIP ficam à mão.
  api.responder("/escritorio/exportacoes", { itens: [pronta] });
  await expect(page.getByRole("status").filter({ hasText: "A cópia dos dados está pronta para baixar." })).toBeVisible({ timeout: 10_000 });
  await expect(painel.getByText(/214 arquivos guardados e as planilhas\. Disponível até 05\/11\/2026\. São 2 arquivos ZIP/)).toBeVisible();
  await expect(painel.getByRole("link", { name: /Baixar parte 1 de 2 · 48,3 MB/ })).toHaveAttribute("href", `/api/app/escritorio/exportacoes/${COPIA}/partes/1`);
  await expect(painel.getByRole("link", { name: /Baixar parte 2 de 2 · 12,9 MB/ })).toHaveAttribute("href", `/api/app/escritorio/exportacoes/${COPIA}/partes/2`);
  await expect(painel.getByRole("button", { name: "Preparar a cópia dos dados" })).toBeEnabled();
});

test("levar os dados: se a cópia não deu certo, a tela diz e deixa pedir de novo", async ({ page }) => {
  const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [{ ...pedida, situacao: "falhou", erro: "R2 sem espaço" }] });
  await abrirDados(page, api);
  await expect(page.getByRole("alert").filter({ hasText: "não deu certo (R2 sem espaço). Peça de novo." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Preparar a cópia dos dados" })).toBeEnabled();
});

test("encerrar: dois passos, digitando o nome; só então o pedido vai, e a tela diz quando os dados somem", async ({ page }) => {
  const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [] });
  await abrirDados(page, api);
  await page.getByRole("button", { name: "Encerrar o escritório…" }).click();

  // Passo 1: o que acontece, com o prazo de 30 dias e o caminho para levar os dados antes.
  const explicacao = page.getByRole("dialog", { name: "Encerrar o escritório?" });
  await expect(explicacao.getByText(/Em 30 dias os dados são apagados de vez/)).toBeVisible();
  await expect(explicacao.getByText(/baixe a cópia antes, no painel Levar os dados do escritório/)).toBeVisible();
  await expect(explicacao.getByRole("link", { name: "(46) 99907-4372" })).toHaveAttribute("href", "https://wa.me/5546999074372");
  await explicacao.getByRole("button", { name: "Continuar" }).click();

  // Passo 2: o nome do escritório. Nome errado não libera; maiúsculas e espaços a mais não pesam.
  const confirmacao = page.getByRole("dialog", { name: "Confirme o nome do escritório" });
  const encerrar = confirmacao.getByRole("button", { name: "Encerrar o escritório" });
  await expect(encerrar).toBeDisabled();
  await confirmacao.getByLabel(`Digite ${NOME}`).fill("Souza Mendes");
  await expect(encerrar).toBeDisabled();
  expect(api.mudancas("/escritorio/encerrar")).toHaveLength(0);
  await confirmacao.getByLabel(`Digite ${NOME}`).fill("  souza & mendes ADVOCACIA ");
  await expect(encerrar).toBeEnabled();
  api.responder("/escritorio/encerrar", { ok: true, apagarEm: "2026-12-02T12:00:00.000Z" });
  await encerrar.click();
  expect(api.mudancas("/escritorio/encerrar")[0]!.corpo).toEqual({ confirmacao: "  souza & mendes ADVOCACIA " });

  const fim = page.getByRole("dialog", { name: "Escritório encerrado" });
  await expect(fim.getByText("Ninguém mais entra. Os dados serão apagados de vez em 02/12/2026.")).toBeVisible();
  // Sair leva para a tela de entrar; a sessão já caiu no servidor.
  api.logado = false;
  await fim.getByRole("button", { name: "Sair do Decreta" }).click();
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
});

test("encerrar: desistir no primeiro passo não manda nada, e a API recusando mostra o motivo e fica na tela", async ({ page }) => {
  const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [] });
  await abrirDados(page, api);
  await page.getByRole("button", { name: "Encerrar o escritório…" }).click();
  await page.getByRole("dialog", { name: "Encerrar o escritório?" }).getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(api.mudancas()).toHaveLength(0);

  api.responder("/escritorio/encerrar", { erro: "confirmacao_errada", detalhe: "Digite o nome do escritório, como está na tela, para encerrar." }, 422);
  await page.getByRole("button", { name: "Encerrar o escritório…" }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  const confirmacao = page.getByRole("dialog", { name: "Confirme o nome do escritório" });
  await confirmacao.getByLabel(`Digite ${NOME}`).fill(NOME);
  await confirmacao.getByRole("button", { name: "Encerrar o escritório" }).click();
  await expect(confirmacao.getByRole("alert")).toHaveText("Digite o nome do escritório, como está na tela, para encerrar.");
  await expect(page).toHaveURL(/\/configuracoes$/);
});

test("a demonstração não leva nem encerra: os botões ficam desligados e a tela explica", async ({ page }) => {
  const api = new ApiFalsa().responder("/escritorio", { ...escritorio, demonstracao: true }).responder("/escritorio/exportacoes", { itens: [] });
  await abrirDados(page, api);
  await expect(page.getByText("Na demonstração não há dados para levar: ela é de todos.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Preparar a cópia dos dados" })).toBeDisabled();
  await expect(page.getByText("A demonstração é de todos e não pode ser encerrada.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Encerrar o escritório…" })).toBeDisabled();
});

test("quem é da equipe e não é sócio não vê a aba Dados", async ({ page }) => {
  const eu = amostras.eu!.corpo;
  const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/eu", { ...eu, usuario: { ...eu.usuario, papel: "member" } });
  await abrir(page, "/configuracoes", api);
  await expect(page.getByRole("tab", { name: "Timbre" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Dados" })).toHaveCount(0);
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a aba Dados e os dois passos de encerrar cabem na largura da tela", async ({ page }) => {
    const api = new ApiFalsa().responder("/escritorio", escritorio).responder("/escritorio/exportacoes", { itens: [pronta] });
    await abrirDados(page, api);
    await expect(page.getByRole("link", { name: /Baixar parte 1 de 2/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    await page.getByRole("button", { name: "Encerrar o escritório…" }).click();
    const explicacao = page.getByRole("dialog", { name: "Encerrar o escritório?" });
    await expect(explicacao).toBeInViewport();
    await explicacao.getByRole("button", { name: "Continuar" }).click();
    const confirmacao = page.getByRole("dialog", { name: "Confirme o nome do escritório" });
    await expect(confirmacao.getByRole("button", { name: "Encerrar o escritório" })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  });
});
