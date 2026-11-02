/**
 * O modo escuro é só por clique, numa chave de ligar e desligar: começa desligado
 * mesmo com o sistema pedindo escuro, a escolha fica por pessoa e não pisca branco
 * ao carregar. Landing e páginas abertas não dependem dela, e o contraste do texto
 * vale nos dois temas.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids } from "./apoio";

const raizEscura = (page: Page) => page.locator('html[data-theme="escuro"]');
const fundoDoCorpo = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const barra = (page: Page) => page.evaluate(() => document.querySelector('meta[name="theme-color"]')?.getAttribute("content"));
const CLARO = "rgb(251, 250, 247)";
const ESCURO = "rgb(18, 18, 19)";

async function telaPronta(page: Page) {
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByLabel("Carregando")).toHaveCount(0);
}

/** A chave de /conta. No menu da conta, onde o ARIA não prevê "switch", é um item de marcar. */
const chave = (page: Page) => page.getByRole("switch", { name: "Modo escuro" });
const itemDoMenu = (page: Page) => page.getByRole("menuitemcheckbox", { name: "Modo escuro" });

async function escolherEscuroNoMenu(page: Page) {
  await page.getByRole("button", { name: /Menu da conta de/ }).click();
  await itemDoMenu(page).click();
}

/** O texto com contraste abaixo de 4,5:1 sobre o fundo real, na tela. */
function contrasteRuim(page: Page) {
  return page.evaluate(() => {
    const paraRgb = (c: string) => {
      const m = c.match(/[\d.]+/g)!.map(Number);
      if (c.startsWith("color(")) return { r: m[0]! * 255, g: m[1]! * 255, b: m[2]! * 255, a: m[3] ?? 1 };
      return { r: m[0]!, g: m[1]!, b: m[2]!, a: m[3] ?? 1 };
    };
    type Cor = ReturnType<typeof paraRgb>;
    const canal = (v: number) => {
      const x = v / 255;
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
    };
    const luz = (c: Cor) => 0.2126 * canal(c.r) + 0.7152 * canal(c.g) + 0.0722 * canal(c.b);
    const sobre = (f: Cor, b: Cor): Cor => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const fundo = (el: Element): Cor | null => {
      const pilha: Cor[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none" && !s.backgroundImage.includes("data:")) return null;
        const c = paraRgb(s.backgroundColor);
        if (c.a > 0) {
          pilha.push(c);
          if (c.a === 1) break;
        }
      }
      let b: Cor = { r: 255, g: 255, b: 255, a: 1 };
      for (const c of pilha.reverse()) b = sobre(c, b);
      return b;
    };
    const ruins = new Set<string>();
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = andar.nextNode())) {
      const texto = n.textContent?.trim();
      const el = n.parentElement;
      if (!texto || !el || el.closest("svg, script, style, [aria-hidden=true], button:disabled, .opacity-60, .docx-wrapper")) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || Number(s.opacity) === 0 || s.clipPath !== "none") continue;
      const b = fundo(el);
      if (!b) continue;
      const l1 = luz(sobre(paraRgb(s.color), b));
      const l2 = luz(b);
      const k = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      if (k < 4.5) ruins.add(`${el.className || el.tagName} ${k.toFixed(2)}: "${texto.slice(0, 30)}"`);
    }
    return [...ruins];
  });
}

const TELAS_PRINCIPAIS = ["/hoje", "/prazos", `/prazos/${ids.prazo}`, "/publicacoes", "/processos", `/processos/${ids.processo}`, "/clientes", "/agenda", "/agenda?vista=mes", "/alvaras", "/financeiro", "/negocios", "/documentos", "/modelos", "/equipe", "/configuracoes", "/conta", `/pecas?id=${ids.peca}`, "/perguntar"];

test.describe("no computador, com o sistema pedindo escuro", () => {
  test.use({ viewport: { width: 1366, height: 768 }, colorScheme: "dark" });

  test("começa claro, clicar troca e recarregar mantém a escolha", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await expect(raizEscura(page)).toHaveCount(0);
    expect(await fundoDoCorpo(page)).toBe(CLARO);
    expect(await barra(page)).toBe("#fbfaf7");

    await page.getByRole("button", { name: /Menu da conta de/ }).click();
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "false");
    await itemDoMenu(page).click();
    // Alterna ali mesmo: o menu fica aberto, para ver a tela mudar.
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "true");
    await expect(raizEscura(page)).toHaveCount(1);
    await expect.poll(() => fundoDoCorpo(page)).toBe(ESCURO);
    expect(await barra(page)).toBe("#121213");
    await page.keyboard.press("Escape");

    await page.reload();
    await telaPronta(page);
    await expect(raizEscura(page)).toHaveCount(1);
    expect(await fundoDoCorpo(page)).toBe(ESCURO);

    await page.getByRole("button", { name: /Menu da conta de/ }).click();
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "true");
    await itemDoMenu(page).click();
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "false");
    await expect(raizEscura(page)).toHaveCount(0);
    await expect.poll(() => fundoDoCorpo(page)).toBe(CLARO);
  });

  test("é uma chave só, sem seletor de duas opções, e funciona pelo teclado no menu", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await page.getByRole("button", { name: /Menu da conta de/ }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: /Claro|Escuro/ })).toHaveCount(0);
    for (let i = 0; i < 8; i++) {
      if (await itemDoMenu(page).evaluate((e) => e === document.activeElement)) break;
      await page.keyboard.press("ArrowDown");
    }
    await expect(itemDoMenu(page)).toBeFocused();
    await page.keyboard.press("Space");
    await expect(raizEscura(page)).toHaveCount(1);
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "true");
    await expect(itemDoMenu(page)).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(raizEscura(page)).toHaveCount(0);
    await expect(itemDoMenu(page)).toHaveAttribute("aria-checked", "false");
    await expect(page.getByRole("menu")).toBeVisible();
  });

  test("em /conta: a linha inteira alterna, pelo clique e pelo teclado, sem seletor de duas opções", async ({ page }) => {
    await abrir(page, "/conta");
    await telaPronta(page);
    await expect(page.getByRole("radio", { name: /^(Claro|Escuro)$/ })).toHaveCount(0);
    await expect(chave(page)).toHaveAttribute("aria-checked", "false");
    await chave(page).locator(".dc-rotulo").click();
    await expect(raizEscura(page)).toHaveCount(1);
    await expect(chave(page)).toHaveAttribute("aria-checked", "true");
    await chave(page).focus();
    await page.keyboard.press("Space");
    await expect(raizEscura(page)).toHaveCount(0);
    await page.keyboard.press("Enter");
    await expect(raizEscura(page)).toHaveCount(1);
    await expect(chave(page)).toHaveAttribute("aria-checked", "true");
  });

  test("não pisca: o tema já vale antes de o app carregar, com um script de arquivo", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await escolherEscuroNoMenu(page);
    await expect(raizEscura(page)).toHaveCount(1);
    // Sem o JavaScript do app: só o que está no <head> roda.
    await page.route(/\/assets\/.*\.js$/, (r) => r.abort());
    await page.goto("/prazos");
    await expect(raizEscura(page)).toHaveCount(1);
    expect(await barra(page)).toBe("#121213");
    // A CSP do site não aceita script inline.
    const inline = await page.evaluate(() => [...document.querySelectorAll("script:not([src])")].length);
    expect(inline).toBe(0);
  });

  test("é por pessoa: outra conta no mesmo navegador abre clara", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await escolherEscuroNoMenu(page);
    await expect(raizEscura(page)).toHaveCount(1);
    await page.keyboard.press("Escape");
    const eu = amostras.eu!.corpo;
    await new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, id: "outra-pessoa" } }).ligar(page);
    await page.goto("/hoje");
    await telaPronta(page);
    await expect(raizEscura(page)).toHaveCount(0);
  });

  test("landing, páginas abertas e entrar não dependem da preferência", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await escolherEscuroNoMenu(page);
    await expect(raizEscura(page)).toHaveCount(1);
    for (const rota of ["/termos", "/privacidade", "/seguranca"]) {
      await page.goto(rota);
      await expect(page.locator("h1").first()).toBeVisible();
      await expect(raizEscura(page)).toHaveCount(0);
    }
    const semSessao = new ApiFalsa();
    semSessao.logado = false;
    await semSessao.ligar(page);
    for (const rota of ["/", "/entrar", "/cadastro"]) {
      await page.goto(rota);
      await expect(page.locator("h1, h2").first()).toBeVisible();
      await expect(raizEscura(page)).toHaveCount(0);
    }
    await expect(page.locator('html[data-theme="escuro"] .lp')).toHaveCount(0);
  });

  test("sair da conta deixa a raiz como era", async ({ page }) => {
    const api = await abrir(page, "/hoje");
    await telaPronta(page);
    await escolherEscuroNoMenu(page);
    await expect(raizEscura(page)).toHaveCount(1);
    api.logado = false;
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);
    await expect(raizEscura(page)).toHaveCount(0);
  });

  test("a folha da peça continua papel: fundo branco e tinta escura", async ({ page }) => {
    await abrir(page, `/pecas?id=${ids.peca}`);
    await telaPronta(page);
    await escolherEscuroNoMenu(page);
    await expect(raizEscura(page)).toHaveCount(1);
    const folha = page.locator(".dc-folha").first();
    await expect(folha).toBeVisible();
    const cores = await folha.evaluate((e) => {
      const s = getComputedStyle(e);
      return { fundo: s.backgroundColor, tinta: s.color };
    });
    expect(cores.fundo).toBe("rgb(255, 255, 255)");
    expect(cores.tinta).toBe("rgb(29, 29, 32)");
  });

  for (const tema of ["claro", "escuro"] as const) {
    test(`contraste de 4,5:1 em todo texto das telas principais, tema ${tema}`, async ({ page }) => {
      test.setTimeout(90_000);
      const eu = amostras.eu!.corpo.usuario.id as string;
      if (tema === "escuro") {
        await page.addInitScript(([id]) => {
          localStorage.setItem("decreta:tema", "escuro");
          localStorage.setItem(`decreta:tema:${id}`, "escuro");
        }, [eu]);
      }
      for (const rota of TELAS_PRINCIPAIS) {
        await abrir(page, rota);
        await telaPronta(page);
        expect(await contrasteRuim(page), rota).toEqual([]);
      }
    });
  }
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" });

  test("a opção fica em /conta, começa clara e a escolha fica", async ({ page }) => {
    await abrir(page, "/conta");
    await telaPronta(page);
    await expect(raizEscura(page)).toHaveCount(0);
    await expect(chave(page)).toHaveAttribute("aria-checked", "false");
    expect((await chave(page).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await chave(page).tap();
    await expect(raizEscura(page)).toHaveCount(1);
    await page.reload();
    await telaPronta(page);
    await expect(raizEscura(page)).toHaveCount(1);
    await expect(chave(page)).toHaveAttribute("aria-checked", "true");
  });
});
