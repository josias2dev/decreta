/**
 * O movimento explica de onde veio a tela: ao abrir um detalhe, a tela entra da direita; ao voltar para a lista, da
 * esquerda; entre telas do mesmo nível, nada se mexe. Só transform e opacity, de 120 a 180 ms, e nada com "reduzir
 * movimento". A pré-carga fica aqui também: passar o mouse ou focar um link já traz o pedaço da tela e os dados.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids } from "./apoio";

type Movimento = { nome: string; alvo: string; duracao: number; propriedades: string[] };

/** Anota toda animação de CSS que começar nos pedaços da tela: o nome, a duração e o que ela anima. */
const anotar = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __movimentos: Movimento[] };
    w.__movimentos = [];
    document.addEventListener(
      "animationstart",
      (e) => {
        const alvo = e.target as HTMLElement;
        if (!alvo.matches("main, .dc-caixa__teor, .dc-caixa__decisao")) return;
        const a = alvo.getAnimations().find((x) => (x as CSSAnimation).animationName === e.animationName);
        if (!a) return;
        const efeito = a.effect as KeyframeEffect;
        const propriedades = [...new Set(efeito.getKeyframes().flatMap((k) => Object.keys(k).filter((p) => !["offset", "computedOffset", "easing", "composite"].includes(p))))];
        w.__movimentos.push({ nome: e.animationName, alvo: alvo.className, duracao: Number(efeito.getTiming().duration), propriedades });
      },
      true,
    );
  });
const movimentos = (page: Page) => page.evaluate(() => (window as unknown as { __movimentos: Movimento[] }).__movimentos);

function explica(m: Movimento, nome: string) {
  expect(m.nome).toBe(nome);
  expect(m.duracao).toBeGreaterThanOrEqual(120);
  expect(m.duracao).toBeLessThanOrEqual(180);
  for (const p of m.propriedades) expect(["transform", "opacity"]).toContain(p);
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("da lista ao detalhe, a tela entra da direita; ao voltar, da esquerda", async ({ page }) => {
    await abrir(page, "/prazos");
    await page.locator("tr[data-link]").first().waitFor();
    await anotar(page);
    await page.locator(`tr[data-link] a[href="/prazos/${ids.prazo}"]`).click();
    await expect(page.locator(".dc-topo-detalhe h1")).toBeVisible();
    await expect.poll(() => movimentos(page).then((m) => m.length)).toBe(1);
    explica((await movimentos(page))[0]!, "dc-entra-detalhe");

    await page.goBack();
    await expect(page.getByRole("heading", { name: "Prazos", level: 1 })).toBeVisible();
    await expect.poll(() => movimentos(page).then((m) => m.length)).toBe(2);
    explica((await movimentos(page))[1]!, "dc-volta-lista");
  });

  test("do prazo à peça também é ir mais fundo, mesmo com o endereço mais curto", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazoComPeca}`);
    await expect(page.locator(".dc-topo-detalhe h1")).toBeVisible();
    await anotar(page);
    await page.getByRole("button", { name: /Abrir a peça|Revisar o rascunho/ }).click();
    await expect(page).toHaveURL(/\/pecas/);
    await expect.poll(() => movimentos(page).then((m) => m.length)).toBeGreaterThan(0);
    explica((await movimentos(page))[0]!, "dc-entra-detalhe");
  });

  test("entre telas do mesmo nível e ao mudar o filtro, nada se mexe", async ({ page }) => {
    await abrir(page, "/prazos");
    await page.locator("tr[data-link]").first().waitFor();
    await anotar(page);
    await page.locator('nav.dc-menu a[href="/processos"]').click();
    await expect(page.getByRole("heading", { name: "Processos", level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Arquivados" }).click();
    await expect(page).toHaveURL(/situacao=arquivados/);
    await page.waitForTimeout(250);
    expect(await movimentos(page)).toEqual([]);
  });

  test("Perguntar cuida da própria rolagem: nada se mexe ao abrir uma conversa", async ({ page }) => {
    await abrir(page, "/perguntar");
    await expect(page.locator(".dc-historico__item").first()).toBeVisible();
    await anotar(page);
    await page.locator(".dc-historico__item > a").first().click();
    await expect(page).toHaveURL(/\/perguntar\/.+/);
    await page.waitForTimeout(250);
    expect((await movimentos(page)).filter((m) => m.alvo.includes("dc-pagina"))).toEqual([]);
  });

  test("trocar de publicação na caixa só esmaece o que mudou", async ({ page }) => {
    const segunda = amostras.publicacoes!.corpo.itens[1].id;
    await abrir(page, `/publicacoes?id=${ids.publicacao}`, new ApiFalsa().responder(`GET /publicacoes/${segunda}`, { ...amostras.publicacaoMarina!.corpo, id: segunda }));
    await page.locator(".dc-caixa__teor").waitFor();
    await anotar(page);
    await page.locator(".dc-caixa__lista .dc-pub").nth(1).click();
    await expect.poll(() => movimentos(page).then((m) => m.length)).toBeGreaterThan(0);
    for (const m of await movimentos(page)) {
      explica(m, "dc-troca");
      expect(m.propriedades).toEqual(["opacity"]);
    }
  });

  test("o caminho do movimento não deixa barra de rolagem de lado, nem na página nem na folha", async ({ page }) => {
    await abrir(page, "/prazos");
    await page.locator("tr[data-link]").first().waitFor();
    expect(await page.locator(".dc-conteudo").evaluate((f) => getComputedStyle(f).overflowX)).toBe("hidden");
    await page.evaluate(() => {
      const w = window as unknown as { __sobra: number };
      w.__sobra = 0;
      const olhar = () => {
        w.__sobra = Math.max(w.__sobra, document.documentElement.scrollWidth - document.documentElement.clientWidth);
        requestAnimationFrame(olhar);
      };
      olhar();
    });
    await page.locator(`tr[data-link] a[href="/prazos/${ids.prazo}"]`).click();
    await expect(page.locator(".dc-topo-detalhe h1")).toBeVisible();
    await page.waitForTimeout(300);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sobra: number }).__sobra)).toBe(0);
  });
});

test.describe("com reduzir movimento", () => {
  test.use({ viewport: { width: 1366, height: 768 }, reducedMotion: "reduce" });

  test("nada se mexe, nem ao abrir o detalhe nem ao voltar", async ({ page }) => {
    await abrir(page, "/prazos");
    await page.locator("tr[data-link]").first().waitFor();
    await anotar(page);
    await page.locator(`tr[data-link] a[href="/prazos/${ids.prazo}"]`).click();
    await expect(page.locator(".dc-topo-detalhe h1")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Prazos", level: 1 })).toBeVisible();
    await page.waitForTimeout(250);
    expect(await movimentos(page)).toEqual([]);
  });

  test("nem ao trocar de publicação", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await page.locator(".dc-caixa__teor").waitFor();
    await anotar(page);
    await page.locator(".dc-caixa__lista .dc-pub").nth(1).click();
    await expect(page).toHaveURL(new RegExp(amostras.publicacoes!.corpo.itens[1].id));
    await page.waitForTimeout(250);
    expect(await movimentos(page)).toEqual([]);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a tela entra da direita sem deixar a página rolar para o lado, nem no meio do caminho", async ({ page }) => {
    await abrir(page, "/prazos");
    await page.locator(".dc-item").first().waitFor();
    await anotar(page);
    await page.evaluate(() => {
      const w = window as unknown as { __sobra: number };
      w.__sobra = 0;
      const olhar = () => {
        w.__sobra = Math.max(w.__sobra, document.documentElement.scrollWidth - document.documentElement.clientWidth, document.body.scrollWidth - document.body.clientWidth);
        requestAnimationFrame(olhar);
      };
      olhar();
    });
    await page.locator(`a.dc-item[href="/prazos/${ids.prazo}"]`).tap();
    await expect(page.getByRole("button", { name: "Voltar" })).toBeVisible();
    await expect.poll(() => movimentos(page).then((m) => m.length)).toBe(1);
    explica((await movimentos(page))[0]!, "dc-entra-detalhe");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => (window as unknown as { __sobra: number }).__sobra)).toBe(0);
  });
});

test.describe("pré-carga", () => {
  test.use({ viewport: { width: 1366, height: 768 } });
  const pediu = (api: ApiFalsa, caminho: string) => api.pedidos.some((p) => p.metodo === "GET" && p.caminho === caminho);
  /** Os arquivos que o navegador pedir, daqui em diante. */
  const arquivos = (page: Page) => {
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    return (pedaco: RegExp) => urls.some((u) => pedaco.test(u));
  };

  test("passar o mouse num item do menu traz o pedaço da tela e os dados, sem navegar", async ({ page }) => {
    const baixou = arquivos(page);
    const api = await abrir(page, "/equipe");
    await page.locator('nav.dc-menu a[href="/prazos"]').waitFor();
    expect(pediu(api, "/prazos")).toBe(false);
    expect(baixou(/\/assets\/prazos-[^/]+\.js$/)).toBe(false);
    await page.locator('nav.dc-menu a[href="/prazos"]').hover();
    await expect.poll(() => pediu(api, "/prazos")).toBe(true);
    await expect.poll(() => baixou(/\/assets\/prazos-[^/]+\.js$/)).toBe(true);
    await expect(page).toHaveURL(/\/equipe$/);
  });

  test("focar um link pelo teclado traz também", async ({ page }) => {
    const api = await abrir(page, "/equipe");
    await page.locator('nav.dc-menu a[href="/processos"]').waitFor();
    await page.locator('nav.dc-menu a[href="/processos"]').focus();
    await expect.poll(() => pediu(api, "/processos")).toBe(true);
    await expect(page).toHaveURL(/\/equipe$/);
  });

  test("depois da pré-carga, clicar abre a tela pronta, mesmo que a rede caia", async ({ page }) => {
    const baixou = arquivos(page);
    const api = await abrir(page, "/equipe");
    const link = page.locator('nav.dc-menu a[href="/processos"]');
    await link.hover();
    await expect.poll(() => pediu(api, "/processos")).toBe(true);
    await expect.poll(() => baixou(/\/assets\/processos-[^/]+\.js$/)).toBe(true);
    await page.waitForTimeout(100);
    await page.route("**/api/app/processos**", (route) => route.abort());
    await link.click();
    await expect(page.locator("tr[data-link]").first()).toBeVisible();
    await expect(page.getByLabel("Carregando")).toHaveCount(0);
  });

  test("abrir o endereço direto não busca a tela antes de saber quem entrou", async ({ page }) => {
    const api = new ApiFalsa();
    api.logado = false;
    await abrir(page, "/prazos", api);
    await expect(page).toHaveURL(/\/entrar/);
    expect(pediu(api, "/prazos")).toBe(false);
  });

  test("passar o mouse em qualquer parte da linha da tabela traz o detalhe", async ({ page }) => {
    const api = await abrir(page, "/processos");
    const linha = page.locator("tr[data-link]").first();
    await linha.waitFor();
    const id = await linha.locator('a[href^="/processos/"]').getAttribute("href");
    await linha.locator("td").nth(1).hover();
    await expect.poll(() => pediu(api, id!)).toBe(true);
  });

  test("passar rápido por várias linhas não pede o detalhe de todas", async ({ page }) => {
    const api = await abrir(page, "/processos");
    const linhas = page.locator("tr[data-link]");
    await linhas.first().waitFor();
    const n = await linhas.count();
    const caixas = await Promise.all([0, 1, 2, 3].map((i) => linhas.nth(i).boundingBox()));
    for (const c of caixas) await page.mouse.move(c!.x + 200, c!.y + c!.height / 2, { steps: 1 });
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    expect(n).toBeGreaterThan(3);
    expect(api.pedidos.filter((p) => p.metodo === "GET" && /^\/processos\/[0-9a-f-]{36}$/.test(p.caminho)).length).toBeLessThan(4);
  });

  test("a publicação seguinte já vem antes de ser aberta, e a que está sob o mouse também", async ({ page }) => {
    const itens = amostras.publicacoes!.corpo.itens as { id: string }[];
    const api = await abrir(page, `/publicacoes?id=${itens[0]!.id}`);
    await page.locator(".dc-caixa__teor").waitFor();
    await expect.poll(() => pediu(api, `/publicacoes/${itens[1]!.id}`)).toBe(true);
    expect(pediu(api, `/publicacoes/${itens[3]!.id}`)).toBe(false);
    await page.locator(".dc-caixa__lista .dc-pub").nth(3).hover();
    await expect.poll(() => pediu(api, `/publicacoes/${itens[3]!.id}`)).toBe(true);
  });

  test("abrir Publicações pelo menu já traz a primeira da lista", async ({ page }) => {
    const itens = amostras.publicacoes!.corpo.itens as { id: string }[];
    const api = new ApiFalsa();
    await abrir(page, "/equipe", api);
    await page.locator('nav.dc-menu a[href="/publicacoes"]').hover();
    await expect.poll(() => pediu(api, `/publicacoes/${itens[0]!.id}`)).toBe(true);
  });
});
