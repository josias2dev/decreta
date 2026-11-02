/**
 * A tela responde antes do servidor nas ações mais frequentes e volta atrás, com aviso à vista, se ele recusar.
 * Um portão segura a resposta para o teste ver o que aparece nesse meio-tempo. O prazo nunca pode parecer confirmado
 * se o servidor recusou.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids } from "./apoio";

/** Segura os POST e PUT que casam com o padrão até o teste mandar soltar ou recusar. */
async function portao(page: Page, padrao: RegExp) {
  let soltar!: (fazer: "seguir" | { status: number; corpo: unknown } | "sem-rede") => void;
  const resposta = new Promise<"seguir" | { status: number; corpo: unknown } | "sem-rede">((r) => (soltar = r));
  await page.route(padrao, async (route) => {
    if (route.request().method() === "GET") return route.fallback();
    const fazer = await resposta;
    if (fazer === "seguir") return route.fallback();
    if (fazer === "sem-rede") return route.abort();
    return route.fulfill({ status: fazer.status, contentType: "application/json", body: JSON.stringify(fazer.corpo) });
  });
  return soltar;
}

const RECUSA = { status: 409, corpo: { erro: "prazo_mudou", detalhe: "Outra pessoa mexeu neste prazo. Confira de novo." } };
const aviso = (page: Page) => page.locator(".dc-aviso");
const prazo = amostras.prazo!.corpo;
const seloIa = (page: Page) => page.getByText("Sugestão da IA · confira e confirme");
const CAMINHO_DA_PUBLICACAO = new RegExp(`/api/app/publicacoes/${ids.publicacao}/`);
const SEGUNDA = amostras.publicacoes!.corpo.itens[1];

test.describe("confirmar prazo, na tela do prazo", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  const CONFIRMAR = new RegExp(`/api/app/prazos/${ids.prazo}/confirmar`);

  test("a tela muda na hora, sem dizer que confirmou, e só diz Confirmado quando o servidor aceita", async ({ page }) => {
    const api = new ApiFalsa();
    await abrir(page, `/prazos/${ids.prazo}`, api);
    await expect(seloIa(page)).toBeVisible();
    const soltar = await portao(page, CONFIRMAR);
    await page.getByRole("button", { name: "Confirmar prazo" }).click();

    await expect(page.getByText("Confirmando…")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar prazo" })).toHaveCount(0);
    await expect(seloIa(page)).toHaveCount(0);
    await expect(page.locator(".dc-topo-detalhe__selos .dc-selo--ok")).toHaveCount(0);
    await expect(aviso(page)).toHaveCount(0);

    api.responder(`GET /prazos/${ids.prazo}`, { ...prazo, confirmado: true, confirmadoPor: amostras.eu!.corpo.usuario });
    soltar("seguir");
    await expect(page.locator(".dc-topo-detalhe__selos .dc-selo--ok")).toContainText("Confirmado por");
    await expect(page.getByText("Confirmando…")).toHaveCount(0);
    await expect(aviso(page).getByText("Prazo confirmado.")).toBeVisible();
  });

  test("o servidor recusa: volta à sugestão, e o aviso diz que não foi confirmado e fica até fechar", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    const soltar = await portao(page, CONFIRMAR);
    await page.getByRole("button", { name: "Confirmar prazo" }).click();
    await expect(page.getByText("Confirmando…")).toBeVisible();

    soltar(RECUSA);
    const alerta = page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." });
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText("Outra pessoa mexeu neste prazo.");
    await expect(alerta).toContainText("continua como sugestão");
    await expect(seloIa(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar prazo" })).toBeEnabled();
    await expect(page.getByText("Confirmando…")).toHaveCount(0);
    await expect(page.locator(".dc-topo-detalhe__selos .dc-selo--ok")).toHaveCount(0);

    // Os outros avisos somem em segundos; este não pode sumir sem ninguém ver.
    await page.waitForTimeout(6500);
    await expect(alerta).toBeVisible();
    await alerta.getByRole("button", { name: "Fechar o aviso" }).click();
    await expect(alerta).toHaveCount(0);
  });

  test("sem conexão também volta, com o mesmo aviso", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    const soltar = await portao(page, CONFIRMAR);
    await page.getByRole("button", { name: "Confirmar prazo" }).click();
    soltar("sem-rede");
    await expect(page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." })).toContainText("Sem conexão");
    await expect(seloIa(page)).toBeVisible();
  });

  test("o aviso continua à vista se a pessoa mudou de tela antes da recusa", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    const soltar = await portao(page, CONFIRMAR);
    await page.getByRole("button", { name: "Confirmar prazo" }).click();
    await page.locator('nav.dc-menu a[href="/prazos"]').click();
    await expect(page.getByRole("heading", { name: "Prazos", level: 1 })).toBeVisible();
    soltar(RECUSA);
    await expect(page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." })).toBeVisible();
  });

  test("cumprir também responde na hora e volta se recusar", async ({ page }) => {
    const confirmado = { ...prazo, confirmado: true, confirmadoPor: amostras.eu!.corpo.usuario };
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`GET /prazos/${ids.prazo}`, confirmado));
    const soltar = await portao(page, new RegExp(`/api/app/prazos/${ids.prazo}/cumprir`));
    await page.getByRole("button", { name: "Cumprir" }).click();
    await expect(page.getByRole("button", { name: "Reabrir prazo" })).toBeVisible();
    soltar(RECUSA);
    await expect(page.getByRole("button", { name: "Cumprir" })).toBeVisible();
    await expect(aviso(page).getByText(/O prazo não foi marcado como cumprido/)).toBeVisible();
  });
});

test.describe("publicações", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  const lista = (page: Page) => page.locator(".dc-caixa__lista .dc-pub");
  const titulos = (page: Page) => lista(page).locator(".dc-pub__titulo").allTextContents();
  const ABERTA = "Intimação · laudo pericial";

  test("confirmar: sai da caixa e abre a próxima na hora; o aviso de confirmado só vem com a resposta", async ({ page }) => {
    const api = new ApiFalsa().responder(`POST /publicacoes/${ids.publicacao}/confirmar`, { prazoId: ids.prazo, fim: "2026-11-24" });
    await abrir(page, `/publicacoes?id=${ids.publicacao}`, api);
    await expect(lista(page).first()).toContainText(ABERTA);
    const soltar = await portao(page, CAMINHO_DA_PUBLICACAO);
    const antes = await lista(page).count();
    await page.getByRole("button", { name: "Confirmar prazo" }).first().click();

    await expect(lista(page)).toHaveCount(antes - 1);
    await expect(page).toHaveURL(new RegExp(`id=${SEGUNDA.id}`));
    await expect(page.getByRole("tab", { name: /^Novas/ })).toContainText("6");
    await expect(aviso(page)).toHaveCount(0);

    soltar("seguir");
    await expect(aviso(page).getByText("Prazo confirmado: vence em 24/11/2026.")).toBeVisible();
  });

  test("o servidor recusa o prazo: a publicação volta ao mesmo lugar, e o aviso fica, com o caminho de volta", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await expect(lista(page).first()).toBeVisible();
    const ordem = await titulos(page);
    const soltar = await portao(page, CAMINHO_DA_PUBLICACAO);
    await page.getByRole("button", { name: "Confirmar prazo" }).first().click();
    await expect(page).toHaveURL(new RegExp(`id=${SEGUNDA.id}`));

    soltar(RECUSA);
    const alerta = page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." });
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText("Outra pessoa mexeu neste prazo.");
    await expect.poll(() => titulos(page)).toEqual(ordem);
    await expect(page.getByRole("tab", { name: /^Novas/ })).toContainText("7");
    await expect(page.getByText(/^Prazo confirmado/)).toHaveCount(0);

    await alerta.getByRole("button", { name: "Voltar à publicação" }).click();
    await expect(page).toHaveURL(new RegExp(`id=${ids.publicacao}`));
    await expect(page.getByRole("button", { name: "Confirmar prazo" }).first()).toBeVisible();
    await expect(alerta).toHaveCount(0);
  });

  test("marcar sem prazo: sai na hora e volta com aviso se recusar", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await expect(lista(page).first()).toBeVisible();
    const ordem = await titulos(page);
    const soltar = await portao(page, CAMINHO_DA_PUBLICACAO);
    await page.locator(".dc-caixa__botoes").getByRole("button", { name: "Não gera prazo" }).click();
    await expect(lista(page)).toHaveCount(ordem.length - 1);
    await expect(page.getByRole("tab", { name: /^Lidas/ })).toContainText("18");

    soltar(RECUSA);
    await expect(aviso(page).getByText(/A publicação não foi marcada/)).toBeVisible();
    await expect.poll(() => titulos(page)).toEqual(ordem);
    await expect(page.getByRole("tab", { name: /^Lidas/ })).toContainText("17");
  });

  test("marcar sem prazo aceito: o aviso vem com a resposta", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    const soltar = await portao(page, CAMINHO_DA_PUBLICACAO);
    await page.locator(".dc-caixa__botoes").getByRole("button", { name: "Não gera prazo" }).click();
    await expect(aviso(page)).toHaveCount(0);
    soltar("seguir");
    await expect(aviso(page).getByText("Marcada como lida, sem prazo.")).toBeVisible();
  });
});

test.describe("publicações em sequência", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("a resposta da primeira não traz de volta a segunda, que ainda está a caminho", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    const lista = page.locator(".dc-caixa__lista .dc-pub");
    await expect(lista.first()).toBeVisible();
    const inicio = await lista.count();
    const soltarPrimeira = await portao(page, CAMINHO_DA_PUBLICACAO);
    const soltarSegunda = await portao(page, new RegExp(`/api/app/publicacoes/${SEGUNDA.id}/`));
    await page.locator(".dc-caixa__botoes").getByRole("button", { name: "Não gera prazo" }).click();
    await expect(page).toHaveURL(new RegExp(`id=${SEGUNDA.id}`));
    await page.locator(".dc-caixa__botoes").getByRole("button", { name: "Não gera prazo" }).click();
    await expect(lista).toHaveCount(inicio - 2);

    soltarPrimeira("seguir");
    await expect(page.locator(".dc-aviso").getByText("Marcada como lida, sem prazo.")).toBeVisible();
    await page.waitForTimeout(300);
    await expect(lista).toHaveCount(inicio - 2);

    soltarSegunda(RECUSA);
    await expect(page.locator(".dc-aviso").getByText(/A publicação não foi marcada/)).toBeVisible();
  });
});

test.describe("tarefa, na agenda", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  const TAREFA = "Cobrar documentos do cliente novo";
  const marca = (page: Page) => page.getByRole("checkbox", { name: `Feita: ${TAREFA}` });

  test("marca na hora e só avisa com a resposta", async ({ page }) => {
    await abrir(page, "/agenda?vista=lista");
    const soltar = await portao(page, /\/api\/app\/tarefas\/.+\/concluir/);
    await marca(page).click();
    await expect(marca(page)).toBeChecked();
    await expect(aviso(page)).toHaveCount(0);
    soltar("seguir");
    await expect(aviso(page).getByText("Tarefa feita.")).toBeVisible();
  });

  test("o servidor recusa: desmarca e avisa", async ({ page }) => {
    await abrir(page, "/agenda?vista=lista");
    const soltar = await portao(page, /\/api\/app\/tarefas\/.+\/concluir/);
    await marca(page).click();
    await expect(marca(page)).toBeChecked();
    soltar(RECUSA);
    await expect(aviso(page).getByText(/A tarefa não foi marcada como feita/)).toBeVisible();
    await expect(marca(page)).not.toBeChecked();
  });
});

test.describe("etapa do quadro", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  const coluna = (page: Page, nome: string) => page.locator(".dc-quadro__coluna").filter({ has: page.locator(".dc-quadro__nome", { hasText: nome }) });

  test("negócio: muda de coluna na hora; se o servidor recusar, volta e avisa", async ({ page }) => {
    await abrir(page, "/negocios");
    // Com o diálogo aberto, o quadro atrás sai da árvore de acessibilidade: aqui procura pelo texto.
    const cartao = (nome: string) => coluna(page, nome).locator(".dc-cartao", { hasText: "José Antunes" });
    await cartao("Triagem").click();
    const soltar = await portao(page, /\/api\/app\/negocios\//);
    await page.getByLabel("Etapa").selectOption("repassado");
    await expect(cartao("Repassados")).toBeVisible();
    await expect(cartao("Triagem")).toHaveCount(0);
    await expect(page.getByLabel("Etapa")).toHaveValue("repassado");

    soltar(RECUSA);
    await expect(aviso(page).getByText(/O negócio não mudou de etapa/)).toBeVisible();
    await expect(cartao("Triagem")).toBeVisible();
    await expect(cartao("Repassados")).toHaveCount(0);
    await expect(page.getByLabel("Etapa")).toHaveValue("triagem");
  });

  test("alvará: avança de coluna na hora e o diálogo fecha; se recusar, volta e avisa", async ({ page }) => {
    const alvara = amostras.alvaras!.corpo.etapas.find((e: { etapa: string }) => e.etapa === "repassado").itens[0];
    await abrir(page, "/alvaras");
    const cartoes = (nome: string) => coluna(page, nome).locator(".dc-cartao", { hasText: alvara.descricao });
    await expect(cartoes("Repassado ao cliente").first()).toBeVisible();
    const emRepassado = await cartoes("Repassado ao cliente").count();
    const emFinalizado = await cartoes("Finalizado").count();
    await cartoes("Repassado ao cliente").first().click();
    const soltar = await portao(page, /\/api\/app\/alvaras\//);
    await page.getByRole("dialog").getByRole("button", { name: /^Finalizado/ }).click();

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cartoes("Finalizado")).toHaveCount(emFinalizado + 1);

    soltar(RECUSA);
    await expect(aviso(page).getByText(/O alvará não mudou de etapa/)).toBeVisible();
    await expect(cartoes("Repassado ao cliente")).toHaveCount(emRepassado);
    await expect(cartoes("Finalizado")).toHaveCount(emFinalizado);
  });

  test("alvará aceito: o aviso da etapa vem com a resposta", async ({ page }) => {
    await abrir(page, "/alvaras");
    await coluna(page, "Repassado ao cliente").locator(".dc-cartao").first().click();
    const soltar = await portao(page, /\/api\/app\/alvaras\//);
    await page.getByRole("dialog").getByRole("button", { name: /^Finalizado/ }).click();
    await expect(aviso(page)).toHaveCount(0);
    soltar("seguir");
    await expect(aviso(page).getByText("Agora em finalizado.")).toBeVisible();
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("confirmar prazo: mesma regra, e o aviso cabe na tela", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`);
    const soltar = await portao(page, new RegExp(`/api/app/prazos/${ids.prazo}/confirmar`));
    await page.getByRole("button", { name: "Confirmar prazo" }).tap();
    await expect(page.getByText("Confirmando…")).toBeVisible();
    soltar(RECUSA);
    const alerta = page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." });
    await expect(alerta).toBeVisible();
    await expect(alerta).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Confirmar prazo" })).toBeVisible();
    const fechar = alerta.getByRole("button", { name: "Fechar o aviso" });
    expect((await fechar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("publicação: vai para a próxima na hora; se recusar, o aviso leva de volta", async ({ page }) => {
    await abrir(page, `/publicacoes/${ids.publicacao}`);
    const soltar = await portao(page, CAMINHO_DA_PUBLICACAO);
    await page.getByRole("button", { name: "Confirmar prazo" }).tap();
    await expect(page).toHaveURL(new RegExp(`/publicacoes/${SEGUNDA.id}`));
    soltar(RECUSA);
    const alerta = page.getByRole("alert").filter({ hasText: "O prazo não foi confirmado." });
    await alerta.getByRole("button", { name: "Voltar à publicação" }).tap();
    await expect(page).toHaveURL(new RegExp(`/publicacoes/${ids.publicacao}`));
  });
});
