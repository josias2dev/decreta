/**
 * Data viva: toda data de prazo, em qualquer tela, abre a própria conta. Por
 * clique e por teclado, fecha com Esc, e no celular é uma folha de baixo. Data
 * digitada à mão diz isso, e data que não é prazo não abre nada.
 */
import { expect, test, type Locator, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const COMPUTADOR = { width: 1366, height: 768 };
const CELULAR = { width: 390, height: 844 };
const ESCALA = [11, 12, 13, 14, 15, 20];
const conta = (page: Page) => page.getByRole("dialog", { name: "A conta" });
const viva = (onde: Locator | Page) => onde.locator(".dc-data-viva");
const contaDoPrazo = amostras.contasDosPrazos!.corpo[ids.prazo];

/** Nenhum botão dentro de link ou de outro botão, em nenhuma tela: o que é HTML inválido quebra teclado e leitor de tela. */
async function semInterativoAninhado(page: Page) {
  expect(await page.locator("a button, button button, a a, button a").count()).toBe(0);
}

test.describe("no computador", () => {
  test.use({ viewport: COMPUTADOR });

  test("a conta tem o calendário, a regra e os dias fora, tudo contado pelo motor", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    await viva(page.locator(".dc-dados")).first().click();
    const c = conta(page);
    await expect(c.locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    await expect(c.getByText("segunda-feira")).toBeVisible();
    await expect(c.getByText("15 dias úteis (CPC, art. 219)")).toBeVisible();
    await expect(c.getByText("TJSC, com os feriados cadastrados para a comarca de Joinville")).toBeVisible();
    await expect(c.getByText("Fins de semana, 02/11 (Finados) e 20/11 (Consciência Negra)")).toBeVisible();
    // Novembro: o dia 23 vence, o 20 fica de fora com o nome, o 21 é fim de semana e o 19 é o 14º dia.
    await expect(c.locator(".dc-mesinho__nome")).toHaveText("Novembro de 2026");
    const dia = (titulo: string) => c.locator(`.dc-mesinho__dia[title="${titulo}"]`);
    await expect(dia("23/11: vence aqui")).toHaveClass(/is-vence/);
    await expect(dia("20/11: fora da conta, Consciência Negra")).toHaveClass(/is-feriado/);
    await expect(dia("19/11: 14º dia")).toHaveClass(/is-contado/);
    // O mês da publicação fica a uma seta.
    await c.getByRole("button", { name: "Mês anterior" }).click();
    await expect(c.locator(".dc-mesinho__nome")).toHaveText("Outubro de 2026");
    await expect(c.locator('.dc-mesinho__dia[title="29/10: publicada, não conta"]')).toHaveClass(/is-publicacao/);
    await expect(c.getByRole("button", { name: "Mês anterior" })).toBeDisabled();
    await expect(c.getByRole("button", { name: "Próximo mês" })).toBeEnabled();
  });

  test("abre por teclado (Enter e espaço), fecha com Esc e o foco volta para a data", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    const data = viva(page.locator(".dc-dados")).first();
    await data.focus();
    await page.keyboard.press("Enter");
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(conta(page)).toHaveCount(0);
    await expect(data).toBeFocused();
    await page.keyboard.press("Space");
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(data).toBeFocused();
  });

  test("Prazos: a data da linha abre a conta sem abrir o prazo", async ({ page }) => {
    await abrir(page, "/prazos");
    const linha = page.locator("tr[data-link]").filter({ hasText: "Manifestação sobre laudo pericial" }).filter({ hasText: "Marina" });
    await viva(linha).click();
    await expect(conta(page).locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    await conta(page).locator(".dc-conta-viva__data").click();
    await expect(page).toHaveURL(/\/prazos$/);
    await page.keyboard.press("Escape");
    // O resto da linha continua abrindo o prazo.
    await linha.getByText("Marina").first().click();
    await expect(page).toHaveURL(new RegExp(`/prazos/${ids.prazo}`));
    await semInterativoAninhado(page);
  });

  test("Hoje: a data do prazo abre; audiência e tarefa não", async ({ page }) => {
    await abrir(page, "/hoje");
    const painel = amostras.hoje!.corpo;
    const prazos = painel.itens.filter((i: { tipo: string }) => i.tipo === "prazo");
    const linhas = page.locator(".dc-colunas > .dc-painel tbody tr");
    await expect(viva(linhas)).toHaveCount(prazos.length);
    await viva(linhas).first().click();
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    for (const tipo of ["audiencia", "tarefa"]) {
      for (const item of painel.itens.filter((i: { tipo: string }) => i.tipo === tipo)) {
        const linha = linhas.filter({ hasText: item.titulo });
        await expect(linha.getByText(item.quando, { exact: true })).toBeVisible();
        await expect(viva(linha)).toHaveCount(0);
      }
    }
  });

  test("Hoje: a data sugerida da publicação nova também abre, e o resto continua levando à caixa", async ({ page }) => {
    await abrir(page, "/hoje");
    const lateral = page.locator("section").filter({ has: page.getByRole("heading", { name: "Publicações novas" }) });
    await viva(lateral).first().click();
    await expect(conta(page).locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    await page.keyboard.press("Escape");
    await lateral.getByRole("link", { name: "Manifestação sobre laudo pericial" }).click();
    await expect(page).toHaveURL(new RegExp(`/publicacoes\\?id=${ids.publicacao}`));
  });

  test("Publicações: a data em destaque, a do selo da lista e a do prazo confirmado abrem", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await viva(page.locator(".dc-fatos")).click();
    await expect(conta(page).locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    await page.keyboard.press("Escape");
    const item = page.locator(".dc-pub").filter({ hasText: "Marina Duarte" }).first();
    await viva(item).click();
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(new RegExp(`id=${ids.publicacao}`));
    await semInterativoAninhado(page);
    // Um selo sem prazo continua sendo só texto.
    await expect(viva(page.locator(".dc-pub").filter({ hasText: "Não gera prazo" }).first())).toHaveCount(0);
    // A linha continua escolhendo a publicação.
    const outra = page.locator(".dc-pub").filter({ hasText: "Não gera prazo" }).first();
    await outra.click();
    await expect(outra).toHaveClass(/is-on/);
  });

  test("Processo e Processos: o próximo prazo e os prazos da aba abrem", async ({ page }) => {
    await abrir(page, `/processos/${ids.processo}`);
    await viva(page.locator("section").filter({ has: page.getByRole("heading", { name: "Próximo prazo" }) })).click();
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByRole("tab", { name: /Prazos/ }).click();
    await viva(page.locator("tr[data-link]").first()).click();
    await expect(conta(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await abrir(page, "/processos");
    await viva(page.locator("tr[data-link]").filter({ has: page.locator(".dc-prazo-linha .dc-selo") }).first()).click();
    await expect(conta(page)).toBeVisible();
    await expect(page).toHaveURL(/\/processos$/);
  });

  for (const vista of ["lista", "semana"]) {
    test(`Agenda (${vista}): o prazo abre a conta e a audiência não`, async ({ page }) => {
      await abrir(page, `/agenda?vista=${vista}`);
      await viva(page.locator("main")).first().click();
      await expect(conta(page)).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page).toHaveURL(/\/agenda/);
      await semInterativoAninhado(page);
      const audiencias = vista === "lista" ? page.locator(".dc-linhas__item").filter({ has: page.locator(".dc-selo--prazo.dc-num") }) : page.locator(".dc-evento--audiencia");
      await expect(audiencias.first()).toBeVisible();
      await expect(viva(audiencias.first())).toHaveCount(0);
    });
  }

  test("a linha da Agenda continua abrindo o prazo", async ({ page }) => {
    await abrir(page, "/agenda?vista=lista");
    await page.locator(".dc-linhas__item").filter({ has: page.locator(".dc-data-viva") }).first().click({ position: { x: 300, y: 12 } });
    await expect(page).toHaveURL(/\/prazos\//);
  });

  test("Prazo digitado à mão diz isso, sem calendário nem contagem inventada", async ({ page }) => {
    const digitada = { ...contaDoPrazo, digitada: true, aberta: null, fim: "2026-12-01", pelaConta: "2026-11-23" };
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}/conta`, digitada));
    await viva(page.locator(".dc-dados")).first().click();
    const c = conta(page);
    await expect(c.locator(".dc-conta-viva__fim")).toHaveText("01/12/2026");
    await expect(c.getByText("Data digitada à mão: não saiu da conta do Decreta. Pela conta, com 15 dias úteis, venceria em 23/11/2026.")).toBeVisible();
    await expect(c.locator(".dc-mesinho")).toHaveCount(0);
    await expect(c.getByText("Fora da conta")).toHaveCount(0);
  });

  test("Prazo digitado que bate com a conta também não finge ter sido contado", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}/conta`, { ...contaDoPrazo, digitada: true, aberta: null, pelaConta: null }));
    await viva(page.locator(".dc-dados")).first().click();
    await expect(conta(page).getByText("Data digitada à mão: não saiu da conta do Decreta. A conta do Decreta chega na mesma data.")).toBeVisible();
  });

  test("calendário que mudou, tribunal sem calendário próprio e dupla intimação aparecem na conta", async ({ page }) => {
    const c = { ...contaDoPrazo, pelaConta: "2026-11-24", calendarioCompleto: false, calendario: "TJPR", pelo: "sistema", outra: { inicio: "2026-11-03", fim: "2026-11-25" } };
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}/conta`, c));
    await viva(page.locator(".dc-dados")).first().click();
    await expect(conta(page).getByText(/O calendário mudou depois da confirmação: pela conta de hoje, vence em 24\/11\/2026/)).toBeVisible();
    await expect(conta(page).getByText(/ainda não tem calendário próprio/)).toBeVisible();
    await expect(conta(page).getByText(/Dupla intimação/)).toBeVisible();
  });

  test("o interno aparece na conta, marcado no calendário, com a regra", async ({ page }) => {
    const c = { ...contaDoPrazo, interno: { dia: "2026-11-19", fatal: "2026-11-23", antecedencia: 1, regra: "1 dia útil antes do fatal", passou: false, aviso: null } };
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}/conta`, c));
    await viva(page.locator(".dc-dados")).first().click();
    await expect(conta(page).getByText("1 dia útil antes do fatal")).toBeVisible();
    await expect(conta(page).locator('.dc-mesinho__dia[title="19/11: 14º dia"]')).toHaveClass(/is-interno/);
  });

  test("sem resposta do servidor, diz isso e oferece tentar de novo, sem quebrar a tela", async ({ page }) => {
    const api = new ApiFalsa().responder(`/prazos/${ids.prazo}/conta`, { erro: "erro_interno" }, 500);
    await abrir(page, `/prazos/${ids.prazo}`, api);
    await viva(page.locator(".dc-dados")).first().click();
    await expect(conta(page).getByRole("alert")).toContainText("Não consegui abrir a conta agora.");
    api.responder(`/prazos/${ids.prazo}/conta`, contaDoPrazo);
    await conta(page).getByRole("button", { name: "Tentar de novo" }).click();
    await expect(conta(page).locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
  });

  test("a conta aberta fica na escala de fontes e inteira na tela", async ({ page }) => {
    await abrir(page, "/prazos");
    await viva(page.locator("tr[data-link]").first()).click();
    await expect(conta(page).locator(".dc-conta-viva__fim")).toBeVisible();
    const tamanhos = await conta(page).evaluate((raiz) => {
      const achados = new Set<number>();
      const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = andar.nextNode())) if (n.textContent?.trim() && n.parentElement) achados.add(Number.parseFloat(getComputedStyle(n.parentElement).fontSize));
      return [...achados];
    });
    for (const t of tamanhos) expect(ESCALA).toContain(t);
    // Inteira de verdade: nada a rolar por dentro.
    expect(await conta(page).evaluate((e) => e.scrollHeight - e.clientHeight)).toBe(0);
    const caixa = (await conta(page).boundingBox())!;
    expect(caixa.y).toBeGreaterThanOrEqual(0);
    expect(caixa.y + caixa.height).toBeLessThanOrEqual(COMPUTADOR.height);
    expect(caixa.x + caixa.width).toBeLessThanOrEqual(COMPUTADOR.width);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("a conta é uma folha de baixo, cabe na largura e fecha", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    await viva(page.locator(".dc-dados")).first().tap();
    const folha = conta(page);
    await expect(folha.locator(".dc-conta-viva__fim")).toHaveText("23/11/2026");
    const caixa = (await folha.boundingBox())!;
    expect(caixa.width).toBe(CELULAR.width);
    expect(Math.round(caixa.y + caixa.height)).toBe(CELULAR.height);
    expect(await sobraNaLateral(page)).toBe(0);
    expect(await folha.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    await folha.getByRole("button", { name: "Fechar" }).tap();
    await expect(folha).toHaveCount(0);
  });

  for (const [rota, cartao] of [
    ["/hoje", ".dc-item"],
    ["/prazos", ".dc-item"],
    ["/processos", ".dc-item"],
    ["/publicacoes", ".dc-pub"],
    ["/agenda?vista=lista", ".dc-linhas__item"],
  ] as const) {
    test(`${rota}: a data do cartão abre a folha sem abrir o item, e o resto do cartão continua sendo o link`, async ({ page }) => {
      await abrir(page, rota);
      const comData = page.locator(cartao).filter({ has: page.locator(".dc-data-viva") }).first();
      await expect(comData).toBeVisible();
      await viva(comData).tap();
      await expect(conta(page)).toBeVisible();
      await conta(page).getByRole("button", { name: "Fechar" }).tap();
      await expect(conta(page)).toHaveCount(0);
      await expect(page).toHaveURL(new RegExp(`${rota.split("?")[0]}`));
      await semInterativoAninhado(page);
      expect(await sobraNaLateral(page)).toBe(0);
      const caixa = (await comData.boundingBox())!;
      await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height - 8);
      await expect(page).not.toHaveURL(new RegExp(`${rota.split("?")[0]}$`));
    });
  }

  test("Abrir o prazo pela folha leva à ficha, e a tela continua respondendo", async ({ page }) => {
    await abrir(page, "/prazos");
    const cartao = page.locator(".dc-item").filter({ hasText: "Manifestação sobre laudo pericial" }).filter({ hasText: "Marina" });
    await viva(cartao).tap();
    await conta(page).getByRole("link", { name: "Abrir o prazo" }).tap();
    await expect(page).toHaveURL(new RegExp(`/prazos/${ids.prazo}`));
    await expect(conta(page)).toHaveCount(0);
    await page.getByRole("button", { name: "Ajustar" }).first().tap();
    await expect(page.getByRole("dialog", { name: "Ajustar prazo" })).toBeVisible();
  });

  test("o toque na data tem pelo menos 44 px de altura", async ({ page }) => {
    await abrir(page, "/prazos");
    const altura = await viva(page.locator(".dc-item").first()).evaluate((e) => {
      const antes = getComputedStyle(e, "::after");
      return e.getBoundingClientRect().height + 2 * Math.abs(Number.parseFloat(antes.top));
    });
    expect(altura).toBeGreaterThanOrEqual(44);
  });
});
