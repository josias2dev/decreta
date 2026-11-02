/**
 * A fila de publicações pelo teclado: J e K navegam, C confirma, A ajusta, N é
 * "não gera prazo", e o próximo item abre sozinho até zerar a caixa. Sem lote: cada
 * tecla trata um item só, pelas mesmas regras e pelo mesmo endpoint do botão.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

const base = amostras.publicacaoMarina!.corpo;
const caixa = amostras.publicacoes!.corpo;
const sugestao = base.sugestao;
const c = sugestao.conteudo;

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [A, B, D] = [uuid(1), uuid(2), uuid(3)];
const item = (id: string, partes: string) => ({ ...caixa.itens[0], id, titulo: `Intimação ${partes}`, partes, selo: { tipo: "prazo", texto: "Prazo sugerido · 23/11" } });

/** Três publicações na caixa, cada uma com a mesma sugestão de prazo; `mudar` troca o detalhe de alguma. */
function fila(mudar: Record<string, Record<string, unknown>> = {}) {
  const api = new ApiFalsa().responder("/publicacoes", { ...caixa, contagens: { ...caixa.contagens, nova: 3 }, itens: [item(A!, "Ana"), item(B!, "Bruno"), item(D!, "Dora")] });
  for (const id of [A!, B!, D!]) {
    api.responder(`/publicacoes/${id}`, { ...base, id, ...(mudar[id] ?? {}) });
    api.responder(`POST /publicacoes/${id}/confirmar`, { prazoId: uuid(90), fim: "2026-11-23" });
  }
  return api;
}

const aberta = (page: Page) => page.locator(".dc-pub.is-on");
/** A tecla só vale com o item aberto há um instante: espera a tela firmar, como uma pessoa que leu. */
async function apertar(page: Page, tecla: string) {
  await expect(page.locator(".dc-caixa__decisao")).toBeVisible();
  await page.waitForTimeout(450);
  await page.keyboard.press(tecla);
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("J e K navegam, sem dar a volta, e a publicação abre à direita", async ({ page }) => {
    await abrir(page, "/publicacoes", fila());
    await expect(aberta(page)).toContainText("Ana");
    await page.keyboard.press("j");
    await expect(aberta(page)).toContainText("Bruno");
    await expect(page).toHaveURL(new RegExp(`id=${B}`));
    await page.keyboard.press("j");
    await expect(aberta(page)).toContainText("Dora");
    await page.keyboard.press("j");
    await expect(aberta(page)).toContainText("Dora");
    await page.keyboard.press("k");
    await expect(aberta(page)).toContainText("Bruno");
    await page.keyboard.press("k");
    await page.keyboard.press("k");
    await expect(aberta(page)).toContainText("Ana");
  });

  test("C confirma pelo mesmo endpoint e com o mesmo corpo do botão, e o próximo abre sozinho", async ({ page }) => {
    const pelaTecla = fila();
    await abrir(page, "/publicacoes", pelaTecla);
    await expect(aberta(page)).toContainText("Ana");
    await apertar(page, "c");
    await expect.poll(() => pelaTecla.mudancas(`/publicacoes/${A}/confirmar`).length).toBe(1);
    await expect(page.getByText("Prazo confirmado: vence em 23/11/2026.")).toBeVisible();
    await expect(aberta(page)).toContainText("Bruno");
    await expect(page.locator(".dc-pub").filter({ hasText: "Ana" })).toHaveCount(0);

    const peloBotao = fila();
    await abrir(page, "/publicacoes", peloBotao);
    await page.locator(".dc-caixa__botoes").getByRole("button", { name: "Confirmar prazo" }).click();
    await expect.poll(() => peloBotao.mudancas(`/publicacoes/${A}/confirmar`).length).toBe(1);
    expect(pelaTecla.mudancas(`/publicacoes/${A}/confirmar`)[0]!.corpo).toEqual(peloBotao.mudancas(`/publicacoes/${A}/confirmar`)[0]!.corpo);
    expect(peloBotao.mudancas(`/publicacoes/${A}/confirmar`)[0]!.corpo).toMatchObject({ tipo: c.tipo, dias: c.dias, contagem: c.contagem });
  });

  test("N marca que não gera prazo, e o próximo abre sozinho", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await apertar(page, "n");
    await expect.poll(() => api.mudancas(`/publicacoes/${A}/sem-prazo`).length).toBe(1);
    await expect(aberta(page)).toContainText("Bruno");
    expect(api.mudancas(`/publicacoes/${A}/confirmar`)).toHaveLength(0);
  });

  test("A abre o ajuste, e dentro do diálogo as teclas não agem", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await page.keyboard.press("a");
    const dialogo = page.getByRole("dialog", { name: "Ajustar e confirmar" });
    await expect(dialogo).toBeVisible();
    // Com o foco fora dos campos, ainda dentro do diálogo: nada confirma, nada navega.
    await dialogo.getByRole("heading").click();
    for (const tecla of ["c", "n", "j", "k"]) await page.keyboard.press(tecla);
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(0);
    await expect(aberta(page)).toContainText("Ana");
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
  });

  test("segurar a tecla não confirma em lote", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await expect(page.locator(".dc-caixa__decisao")).toBeVisible();
    await page.waitForTimeout(450);
    await page.keyboard.down("c");
    await expect.poll(() => api.mudancas(`/publicacoes/${A}/confirmar`).length).toBe(1);
    await expect(aberta(page)).toContainText("Bruno");
    await expect(page.locator(".dc-caixa__decisao")).toBeVisible();
    // Repetição do teclado: a tecla continua descida.
    await page.waitForTimeout(450);
    for (let i = 0; i < 5; i++) await page.keyboard.down("c");
    await page.keyboard.up("c");
    await page.waitForTimeout(100);
    expect(api.mudancas(`/publicacoes/${B}/confirmar`)).toHaveLength(0);
  });

  test("duas batidas seguidas não confirmam o próximo sem ninguém ter visto", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await expect(page.locator(".dc-caixa__decisao")).toBeVisible();
    await page.waitForTimeout(450);
    await page.keyboard.press("c");
    await expect(aberta(page)).toContainText("Bruno");
    await page.keyboard.press("c");
    await page.keyboard.press("n");
    await page.waitForTimeout(100);
    expect(api.mudancas(`/publicacoes/${B}/confirmar`)).toHaveLength(0);
    expect(api.mudancas(`/publicacoes/${B}/sem-prazo`)).toHaveLength(0);
    // Passado o instante, a tecla volta a valer.
    await apertar(page, "c");
    await expect.poll(() => api.mudancas(`/publicacoes/${B}/confirmar`).length).toBe(1);
  });

  test("até zerar: o estado final é claro, diz quantas foram e sai do caminho das teclas", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await apertar(page, "c");
    await expect(aberta(page)).toContainText("Bruno");
    await apertar(page, "n");
    await expect(aberta(page)).toContainText("Dora");
    await apertar(page, "c");
    const zerada = page.getByRole("status").filter({ hasText: "Caixa zerada" });
    await expect(zerada).toBeVisible();
    await expect(zerada).toContainText("Você tratou 3 publicações");
    await expect(zerada.getByRole("link", { name: "Ver os prazos" })).toHaveAttribute("href", "/prazos");
    await expect(page.locator(".dc-caixa__decisao")).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
    for (const tecla of ["c", "n", "a", "j", "k"]) await page.keyboard.press(tecla);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(3);
  });

  test("caixa que já chega vazia não diz que você zerou nada", async ({ page }) => {
    await abrir(page, "/publicacoes", new ApiFalsa().responder("/publicacoes", { ...caixa, itens: [], contagens: { ...caixa.contagens, nova: 0 } }));
    await expect(page.getByRole("heading", { name: "Publicações" })).toBeVisible();
    await expect(page.getByText("Nenhuma publicação nova")).toBeVisible();
    await expect(page.getByText("Caixa zerada")).toHaveCount(0);
  });

  test("confiança baixa: como o botão, C não confirma, abre a conferência", async ({ page }) => {
    const baixa = { sugestao: { ...sugestao, conteudo: { ...c, conferencia: { confianca: "baixa", motivos: ["A lei diz 5 dias."] } } } };
    const api = fila({ [A!]: baixa });
    await abrir(page, "/publicacoes", api);
    await expect(page.locator(".dc-caixa__botoes").getByRole("button", { name: "Conferir e confirmar" })).toBeVisible();
    await apertar(page, "c");
    await expect(page.getByRole("dialog", { name: "Ajustar e confirmar" })).toBeVisible();
    await expect(page.getByRole("dialog").getByText(/A lei diz 5 dias/)).toBeVisible();
    expect(api.mudancas(`/publicacoes/${A}/confirmar`)).toHaveLength(0);
  });

  test("sem processo: como o botão, C não confirma, e a tela diz por quê", async ({ page }) => {
    const api = fila({ [A!]: { processo: null } });
    await abrir(page, "/publicacoes", api);
    await expect(page.locator(".dc-caixa__botoes").getByRole("button", { name: "Confirmar prazo" })).toBeDisabled();
    await apertar(page, "c");
    await page.keyboard.press("a");
    await expect(page.getByText("Vincule a publicação a um processo antes.").first()).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(api.mudancas(`/publicacoes/${A}/confirmar`)).toHaveLength(0);
    await expect(aberta(page)).toContainText("Ana");
  });

  test("com a IA ainda lendo, não há o que confirmar", async ({ page }) => {
    const api = fila({ [A!]: { sugestao: null, leituraParada: false, prazo: null } });
    await abrir(page, "/publicacoes", api);
    await expect(page.getByRole("button", { name: "Marcar como lida" })).toBeVisible();
    await apertar(page, "c");
    await page.waitForTimeout(100);
    expect(api.mudancas(`/publicacoes/${A}/confirmar`)).toHaveLength(0);
    await expect(aberta(page)).toContainText("Ana");
  });

  test("prazo já confirmado: as teclas de ação não têm o que fazer", async ({ page }) => {
    const api = fila({ [A!]: { prazo: { id: uuid(90), confirmado: true, fim: "2026-11-23", tipo: c.tipo } } });
    await abrir(page, "/publicacoes", api);
    await expect(page.getByText(/Prazo confirmado:/)).toBeVisible();
    await apertar(page, "c");
    await page.keyboard.press("n");
    await page.keyboard.press("a");
    await page.waitForTimeout(100);
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(0);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("audiência: C põe na agenda, como o botão principal", async ({ page }) => {
    const audiencia = { sugestao: { ...sugestao, conteudo: { ...c, geraPrazo: false, audiencia: { data: "2026-11-13", hora: "15:00", tipo: "Conciliação", porVideo: false } } } };
    const api = fila({ [A!]: audiencia }).responder(`POST /publicacoes/${A}/audiencia`, { ok: true });
    await abrir(page, "/publicacoes", api);
    await expect(page.getByRole("button", { name: "Pôr na agenda" })).toBeVisible();
    await apertar(page, "c");
    await expect.poll(() => api.mudancas(`/publicacoes/${A}/audiencia`).length).toBe(1);
    await expect(aberta(page)).toContainText("Bruno");
  });

  test("digitando num campo, as teclas são só letras", async ({ page }) => {
    const api = fila({ [A!]: { processo: null } });
    await abrir(page, "/publicacoes", api);
    const campo = page.getByLabel("Buscar processo");
    await campo.click();
    await page.keyboard.type("jack");
    await expect(campo).toHaveValue("jack");
    await expect(aberta(page)).toContainText("Ana");
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(0);
  });

  test("com a busca ou a conta abertas, e com Ctrl apertado, as teclas não agem", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(aberta(page)).toContainText("Ana");
    await expect(page.locator(".dc-caixa__decisao")).toBeVisible();
    await page.waitForTimeout(450);
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+n");
    await page.keyboard.press("Control+k");
    await expect(page.getByRole("dialog", { name: "Buscar" })).toBeVisible();
    await page.getByRole("dialog", { name: "Buscar" }).locator("h2").evaluate(() => (document.activeElement as HTMLElement).blur());
    await page.keyboard.press("c");
    await page.keyboard.press("Escape");
    await page.locator(".dc-fatos .dc-data-viva").click();
    await expect(page.getByRole("dialog", { name: "A conta" })).toBeVisible();
    await page.keyboard.press("c");
    await page.keyboard.press("j");
    await page.keyboard.press("Escape");
    await expect(aberta(page)).toContainText("Ana");
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(0);
  });

  test("as teclas aparecem de forma discreta: nos botões e no pé da lista", async ({ page }) => {
    await abrir(page, "/publicacoes", fila());
    const botoes = page.locator(".dc-caixa__botoes");
    await expect(botoes.getByRole("button", { name: "Confirmar prazo" }).locator(".dc-tecla")).toHaveText("C");
    await expect(botoes.getByRole("button", { name: "Ajustar" }).locator(".dc-tecla")).toHaveText("A");
    await expect(botoes.getByRole("button", { name: "Não gera prazo" }).locator(".dc-tecla")).toHaveText("N");
    await expect(botoes.getByRole("button", { name: "Confirmar prazo", exact: true })).toHaveAttribute("aria-keyshortcuts", "C");
    await expect(page.locator(".dc-caixa__teclas")).toContainText("navegam");
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("nada muda: sem teclas à vista, e apertar não faz nada", async ({ page }) => {
    const api = fila();
    await abrir(page, "/publicacoes", api);
    await expect(page.locator(".dc-pub").first()).toBeVisible();
    await expect(page.locator(".dc-tecla")).toHaveCount(0);
    await expect(page.locator(".dc-caixa__teclas")).toHaveCount(0);
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/\/publicacoes$/);
    await abrir(page, `/publicacoes/${A}`, api);
    await expect(page.getByRole("button", { name: /Confirmar prazo/ })).toBeVisible();
    await expect(page.locator(".dc-tecla")).toHaveCount(0);
    await page.keyboard.press("c");
    await page.keyboard.press("n");
    await page.waitForTimeout(100);
    expect(api.mudancas(/\/publicacoes\//)).toHaveLength(0);
  });
});
