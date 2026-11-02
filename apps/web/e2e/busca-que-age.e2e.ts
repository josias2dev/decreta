/**
 * A busca do menu também age: de qualquer tela, cria prazo, abre processo e
 * confirma. Confirmar mostra antes a data e a conta: nunca confirma em silêncio.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const prazo = amostras.prazo!.corpo;
const conta = amostras.contasDosPrazos!.corpo[ids.prazo];
const busca = amostras.busca!.corpo;
const aConfirmar = { id: ids.prazo, tipo: prazo.tipo, fim: prazo.fim, processo: { id: ids.processo, titulo: prazo.processo.titulo } };
const comPrazo = () => new ApiFalsa().responder("/busca", { ...busca, prazos: [aConfirmar] });
const paleta = (page: Page) => page.getByRole("dialog", { name: "Buscar" });

async function abrirBusca(page: Page, rota = "/hoje", api = comPrazo()) {
  await abrir(page, rota, api);
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await expect(paleta(page)).toBeVisible();
  return api;
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("abre de qualquer tela e, antes de digitar, já oferece criar prazo e o que espera confirmação", async ({ page }) => {
    for (const rota of ["/hoje", "/prazos", "/agenda", `/processos/${ids.processo}`]) {
      await abrirBusca(page, rota);
      await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeVisible();
      await expect(paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) })).toContainText("23/11");
      await page.keyboard.press("Escape");
    }
  });

  test("confirmar mostra antes a data e a conta, e nada sai até a pessoa decidir", async ({ page }) => {
    const api = await abrirBusca(page);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).click();
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    await expect(passo.getByText("15 dias úteis (CPC, art. 219)")).toBeVisible();
    await expect(passo.getByText("Fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra)")).toBeVisible();
    await expect(passo.locator(".dc-mesinho")).toBeVisible();
    await expect(passo.getByText(prazo.processo.titulo)).toBeVisible();
    expect(api.mudancas(/confirmar/)).toHaveLength(0);
    await passo.getByRole("button", { name: "Confirmar prazo" }).click();
    await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/confirmar`).length).toBe(1);
    await expect(page.getByText("Prazo confirmado: vence em 23/11/2026.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("Esc no passo de confirmar volta para a lista, sem confirmar, e outro Esc fecha", async ({ page }) => {
    const api = await abrirBusca(page);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).click();
    await expect(page.getByRole("dialog", { name: "Confirmar prazo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.mudancas(/confirmar/)).toHaveLength(0);
  });

  test("pelo teclado: as setas andam, Enter entra, e o foco no passo não fica sobre Confirmar", async ({ page }) => {
    const api = await abrirBusca(page);
    await page.keyboard.press("ArrowDown");
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.getByRole("button", { name: "Voltar" })).toBeFocused();
    // Dois Enter seguidos saem do passo, não confirmam.
    await page.keyboard.press("Enter");
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeVisible();
    expect(api.mudancas(/confirmar/)).toHaveLength(0);
  });

  test("confiança baixa: como o botão da tela, não confirma num clique e leva para conferir", async ({ page }) => {
    const api = comPrazo().responder(`/prazos/${ids.prazo}/conta`, { ...conta, conferencia: { confianca: "baixa", motivos: ["A lei diz 5 dias."] } });
    await abrirBusca(page, "/hoje", api);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).click();
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.getByText(/A lei diz 5 dias/)).toBeVisible();
    await expect(passo.getByRole("button", { name: "Confirmar prazo" })).toHaveCount(0);
    await passo.getByRole("link", { name: "Conferir e confirmar" }).click();
    await expect(page).toHaveURL(new RegExp(`/prazos/${ids.prazo}`));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.mudancas(/confirmar/)).toHaveLength(0);
  });

  test("já confirmado por outra pessoa enquanto a lista estava aberta: diz isso e não confirma de novo", async ({ page }) => {
    const api = comPrazo().responder(`/prazos/${ids.prazo}/conta`, { ...conta, prazo: { ...conta.prazo, confirmado: true } });
    await abrirBusca(page, "/hoje", api);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).click();
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.getByText("Este prazo já está confirmado.")).toBeVisible();
    await expect(passo.getByRole("button", { name: "Confirmar prazo" })).toHaveCount(0);
  });

  test("sem resposta da conta, não oferece confirmar", async ({ page }) => {
    const api = comPrazo().responder(`/prazos/${ids.prazo}/conta`, { erro: "erro_interno" }, 500);
    await abrirBusca(page, "/hoje", api);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).click();
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.getByRole("alert")).toContainText("Não consegui abrir a conta agora.");
    await expect(passo.getByRole("button", { name: "Confirmar prazo" })).toHaveCount(0);
  });

  test("criar prazo: abre o Novo prazo, e pelo processo já vem com ele escolhido", async ({ page }) => {
    await abrirBusca(page);
    await paleta(page).getByRole("button", { name: "Criar prazo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Novo prazo" });
    await expect(dialogo.getByLabel("Buscar processo")).toBeVisible();
    await dialogo.getByRole("button", { name: "Cancelar" }).click();

    await page.keyboard.press("Control+k");
    await paleta(page).getByLabel("Buscar", { exact: true }).fill("Marina");
    const processo = busca.processos[0];
    await paleta(page).getByRole("button", { name: `Criar prazo em ${processo.titulo}` }).click();
    await expect(paleta(page)).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Novo prazo" }).getByText(processo.titulo)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Novo prazo" }).getByLabel("Buscar processo")).toHaveCount(0);
  });

  test("abrir processo e cliente continuam funcionando, e Enter no campo abre o primeiro resultado", async ({ page }) => {
    await abrirBusca(page);
    const campo = paleta(page).getByLabel("Buscar", { exact: true });
    await campo.fill("Marina");
    const processo = busca.processos[0];
    await paleta(page).getByRole("button", { name: new RegExp(`Abrir ${processo.titulo.replace(/[()]/g, ".")}`) }).click();
    await expect(page).toHaveURL(new RegExp(`/processos/${processo.id}`));

    await page.keyboard.press("Control+k");
    await paleta(page).getByLabel("Buscar", { exact: true }).fill("Marina");
    await expect(paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) })).toBeVisible();
    await paleta(page).getByLabel("Buscar", { exact: true }).press("Enter");
    await expect(page.getByRole("dialog", { name: "Confirmar prazo" })).toBeVisible();
  });

  test("escritório só para leitura: a busca continua, mas não oferece criar nem confirmar", async ({ page }) => {
    const eu = amostras.eu!.corpo;
    const api = comPrazo().responder("/eu", { ...eu, assinatura: { situacao: "so_leitura", acesso: "leitura", aviso: null } });
    await abrirBusca(page, "/hoje", api);
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toHaveCount(0);
    await expect(paleta(page).getByRole("button", { name: /Confirmar:/ })).toHaveCount(0);
    await paleta(page).getByLabel("Buscar", { exact: true }).fill("Marina");
    const processo = busca.processos[0];
    await expect(paleta(page).getByRole("button", { name: new RegExp(`Abrir ${processo.titulo.replace(/[()]/g, ".")}`) })).toBeVisible();
    await expect(paleta(page).getByRole("button", { name: /Criar prazo/ })).toHaveCount(0);
  });

  test("nada a confirmar: o grupo não aparece", async ({ page }) => {
    await abrirBusca(page, "/hoje", new ApiFalsa().responder("/busca", { ...busca, prazos: [] }));
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeVisible();
    await expect(paleta(page).getByText("A confirmar")).toHaveCount(0);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("pela lupa do topo, cabe na largura e confirma mostrando a conta", async ({ page }) => {
    const api = comPrazo();
    await abrir(page, "/prazos", api);
    await page.getByRole("button", { name: "Buscar" }).tap();
    await expect(paleta(page).getByRole("button", { name: "Criar prazo" })).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
    await paleta(page).getByRole("button", { name: new RegExp(`Confirmar: ${prazo.tipo}`) }).tap();
    const passo = page.getByRole("dialog", { name: "Confirmar prazo" });
    await expect(passo.locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    expect(await passo.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    await passo.getByRole("button", { name: "Confirmar prazo" }).tap();
    await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/confirmar`).length).toBe(1);
  });
});
