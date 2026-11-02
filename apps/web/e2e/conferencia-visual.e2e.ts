/**
 * Conferência visual: em 1366×768 e 390×844, todo texto na tela usa um dos seis
 * tamanhos da escala (estilos/tokens.css) e as listas mostram o que prometem.
 * Não compara imagens, porque a fonte renderiza diferente no CI: é a garantia de
 * que ninguém volta a pôr tamanho solto.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const COMPUTADOR = { width: 1366, height: 768 };
const CELULAR = { width: 390, height: 844 };
const ESCALA_DO_COMPUTADOR = [11, 12, 13, 14, 15, 20];
/** No celular o texto não encolhe, e os 16 px são também o tamanho dos campos, que evita o zoom no iPhone. */
const ESCALA_DO_CELULAR = [12, 13, 14, 15, 16, 20];

const TELAS_DO_APP = [
  "/hoje",
  "/prazos",
  `/prazos/${ids.prazo}`,
  "/publicacoes",
  `/publicacoes?id=${ids.sentenca}`,
  "/processos",
  `/processos/${ids.processo}`,
  `/processos/${ids.processo}?aba=movimentacoes`,
  "/clientes",
  `/clientes/${ids.cliente}`,
  "/agenda",
  "/agenda?vista=semana",
  "/agenda?vista=mes",
  `/audiencias/${ids.audiencia}`,
  "/alvaras",
  "/negocios",
  "/documentos",
  "/modelos",
  "/equipe",
  "/configuracoes",
  "/conta",
  `/pecas?id=${ids.peca}`,
  "/perguntar",
  `/perguntar/${ids.conversaSemana}`,
  "/comecar",
];

/** Os tamanhos de letra de todo texto visível; o conteúdo de um arquivo aberto e o rótulo desenhado dos ícones não são da interface. */
function tamanhosNaTela(page: Page) {
  return page.evaluate(() => {
    const achados = new Map<number, string>();
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = andar.nextNode())) {
      const texto = n.textContent?.trim();
      const el = n.parentElement;
      if (!texto || !el || el.closest("svg, script, style, .docx-wrapper")) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || el.getClientRects().length === 0) continue;
      const tamanho = Number.parseFloat(s.fontSize);
      if (!achados.has(tamanho)) achados.set(tamanho, `${el.className || el.tagName}: "${texto.slice(0, 40)}"`);
    }
    return [...achados.entries()];
  });
}

async function telaPronta(page: Page) {
  await expect(page.getByRole("heading").first()).toBeVisible();
  await expect(page.getByLabel("Carregando")).toHaveCount(0);
}

async function conferirEscala(page: Page, escala: number[]) {
  const fora = (await tamanhosNaTela(page)).filter(([t]) => !escala.includes(t));
  expect(fora).toEqual([]);
}

/** Quantas linhas cabem inteiras na janela. */
function linhasInteiras(page: Page, seletor: string) {
  return page.locator(seletor).evaluateAll((els) =>
    els.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight;
    }).length,
  );
}

/** A mesma lista mais comprida que a tela, para medir quantas linhas cabem. */
function repetir<T extends { id: string }>(itens: T[], n: number): T[] {
  return Array.from({ length: n }, (_, i) => ({ ...itens[i % itens.length]!, id: `${itens[i % itens.length]!.id}-${i}` }));
}

test.describe("no computador", () => {
  test.use({ viewport: COMPUTADOR });

  for (const rota of TELAS_DO_APP) {
    test(`${rota.replace(/[0-9a-f-]{36}/, ":id")}: só os seis tamanhos da escala`, async ({ page }) => {
      await abrir(page, rota);
      await telaPronta(page);
      await conferirEscala(page, ESCALA_DO_COMPUTADOR);
      expect(await sobraNaLateral(page)).toBe(0);
    });
  }

  test("um diálogo aberto também fica na escala", async ({ page }) => {
    const prazo = amostras.prazo!.corpo;
    const previa = { publicacao: prazo.publicadoEm, inicio: prazo.inicio, fim: prazo.fim, dias: prazo.dias, contagem: prazo.contagem, desconsiderados: [], prorrogadoDe: null, explicacao: prazo.conta.explicacao, pelo: "publicacao", outra: null, calendarioCompleto: true, diaDigitado: null };
    await abrir(page, "/prazos", new ApiFalsa().responder("POST /prazos/calcular", previa));
    await telaPronta(page);
    await page.getByRole("button", { name: "Novo prazo" }).click();
    await expect(page.getByRole("dialog", { name: "Novo prazo" })).toBeVisible();
    await conferirEscala(page, ESCALA_DO_COMPUTADOR);
  });

  test("Hoje: cerca de 12 linhas à vista, com o cabeçalho e os números em uma linha", async ({ page }) => {
    const painel = amostras.hoje!.corpo;
    await abrir(page, "/hoje", new ApiFalsa().responder("/hoje", { ...painel, itens: repetir(painel.itens, 24) }));
    await telaPronta(page);
    expect(await linhasInteiras(page, ".dc-colunas > .dc-painel .dc-tabela tbody tr")).toBeGreaterThanOrEqual(12);
    const cabecalho = (await page.locator(".dc-cabecalho").boundingBox())!;
    expect(cabecalho.height).toBeLessThanOrEqual(52);
    const numeros = (await page.getByLabel("Números do dia").boundingBox())!;
    expect(numeros.height).toBeLessThanOrEqual(44);
    expect((await page.locator(".dc-menu").boundingBox())!.width).toBe(208);
  });

  test("Publicações: cerca de 12 itens à vista, cada um em duas linhas", async ({ page }) => {
    const caixa = amostras.publicacoes!.corpo;
    await abrir(page, "/publicacoes", new ApiFalsa().responder("/publicacoes", { ...caixa, itens: repetir(caixa.itens, 24) }));
    await telaPronta(page);
    expect(await linhasInteiras(page, ".dc-pub")).toBeGreaterThanOrEqual(12);
    expect((await page.locator(".dc-pub").first().boundingBox())!.height).toBeLessThanOrEqual(56);
  });

  test("Prazos, Processos e Clientes: as linhas têm duas linhas de texto e até 56 px", async ({ page }) => {
    for (const rota of ["/prazos", "/processos", "/clientes"]) {
      await abrir(page, rota);
      await telaPronta(page);
      const alturas = await page.locator(".dc-tabela tbody tr[data-link]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(alturas.length).toBeGreaterThan(0);
      expect(Math.max(...alturas), rota).toBeLessThanOrEqual(56);
    }
  });

  test("quadro único: Alvarás e Novos negócios com o mesmo cartão e colunas neutras", async ({ page }) => {
    const medir = async (rota: string) => {
      await abrir(page, rota);
      await telaPronta(page);
      const cartao = page.locator(".dc-cartao-quadro").first();
      await expect(cartao).toBeVisible();
      const fundos = await page.locator(".dc-quadro__coluna").evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundColor));
      return { altura: (await cartao.boundingBox())!.height, fundos: new Set(fundos).size };
    };
    const alvaras = await medir("/alvaras");
    const negocios = await medir("/negocios");
    expect(alvaras.fundos).toBe(1);
    expect(negocios.fundos).toBe(1);
    expect(negocios.altura).toBe(alvaras.altura);
  });

  test("os totais dos alvarás usam a mesma faixa dos números do Hoje", async ({ page }) => {
    await abrir(page, "/alvaras");
    await telaPronta(page);
    const totais = page.getByLabel("Totais dos alvarás");
    await expect(totais.locator(".dc-contador")).toHaveCount(3);
    expect((await totais.boundingBox())!.height).toBeLessThanOrEqual(44);
  });

  test("o azul é da IA: filtro ligado, item ativo e botão principal ficam em grafite", async ({ page }) => {
    await abrir(page, "/prazos");
    await telaPronta(page);
    const cor = (seletor: string) => page.locator(seletor).first().evaluate((e) => getComputedStyle(e).backgroundColor);
    const grafite = await cor(".dc-chip.is-on");
    expect(await cor(".dc-btn--primaria")).toBe(grafite);
    const ativo = await page.locator(".dc-menu a.is-on svg").evaluate((e) => getComputedStyle(e).color);
    expect(ativo).toBe(await page.locator(".dc-h1").evaluate((e) => getComputedStyle(e).color));
    // A marca da IA continua com o acento.
    expect(await cor(".dc-ia__marca")).not.toBe(grafite);
  });

  test("o menu recolhe para 52 px, os nomes continuam para o leitor de tela e a escolha fica", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    const menu = page.locator(".dc-menu");
    await page.getByRole("button", { name: "Recolher o menu" }).click();
    await expect.poll(async () => (await menu.boundingBox())!.width).toBe(52);
    await expect(menu.getByRole("link", { name: /^Prazos/ })).toBeVisible();
    await page.reload();
    await telaPronta(page);
    expect((await menu.boundingBox())!.width).toBe(52);
    await conferirEscala(page, ESCALA_DO_COMPUTADOR);
    await page.getByRole("button", { name: "Abrir o menu" }).click();
    await expect.poll(async () => (await menu.boundingBox())!.width).toBe(208);
  });

  test("densidade: Confortável em /conta vale em todas as telas e sobrevive a recarregar", async ({ page }) => {
    await abrir(page, "/conta");
    await telaPronta(page);
    const raiz = page.locator("html");
    await expect(raiz).toHaveAttribute("data-densidade", "compacto");
    const titulo = () => page.locator(".dc-h1").first().evaluate((e) => getComputedStyle(e).fontSize);
    expect(await titulo()).toBe("15px");
    await page.getByRole("radio", { name: "Confortável" }).click();
    await expect(raiz).toHaveAttribute("data-densidade", "confortavel");
    expect(await titulo()).toBe("17px");
    await page.reload();
    await telaPronta(page);
    await expect(raiz).toHaveAttribute("data-densidade", "confortavel");
    await expect(page.getByRole("radio", { name: "Confortável" })).toBeChecked();
    for (const rota of ["/hoje", "/prazos", "/publicacoes", "/alvaras"]) {
      await page.goto(rota);
      await telaPronta(page);
      await expect(raiz).toHaveAttribute("data-densidade", "confortavel");
      expect(await titulo(), rota).toBe("17px");
    }
    const linha = (await page.goto("/prazos"), page.locator(".dc-tabela tbody tr[data-link]").first());
    await expect(linha).toBeVisible();
    expect((await linha.boundingBox())!.height).toBeGreaterThan(52);
  });

  test("densidade é por pessoa: outra conta no mesmo navegador abre compacta", async ({ page }) => {
    await abrir(page, "/conta");
    await telaPronta(page);
    await page.getByRole("radio", { name: "Confortável" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-densidade", "confortavel");
    const eu = amostras.eu!.corpo;
    await new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, id: "outra-pessoa" } }).ligar(page);
    await page.goto("/hoje");
    await telaPronta(page);
    await expect(page.locator("html")).toHaveAttribute("data-densidade", "compacto");
  });
});

test.describe("no celular", () => {
  test.use({ viewport: CELULAR, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  for (const rota of [...TELAS_DO_APP, "/mais"]) {
    test(`${rota.replace(/[0-9a-f-]{36}/, ":id")}: a escala do celular`, async ({ page }) => {
      await abrir(page, rota);
      await telaPronta(page);
      await conferirEscala(page, ESCALA_DO_CELULAR);
      expect(await sobraNaLateral(page)).toBe(0);
    });
  }

  test("alvos de toque de 44 px e campos de 16 px", async ({ page }) => {
    await abrir(page, "/processos");
    await telaPronta(page);
    const busca = page.getByRole("searchbox", { name: "Buscar processo" });
    expect(await busca.evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
    expect((await page.locator(".dc-busca").first().boundingBox())!.height).toBe(44);
    await abrir(page, `/prazos/${ids.prazo}`);
    await telaPronta(page);
    const botao = page.getByRole("button", { name: /Confirmar prazo/ });
    expect((await botao.boundingBox())!.height).toBe(44);
    await page.getByRole("button", { name: "Ajustar" }).first().tap();
    await expect(page.getByRole("dialog")).toBeVisible();
    const campos = page.getByRole("dialog").locator("input:not([type=checkbox]), select, textarea");
    const tamanhos = await campos.evaluateAll((els) => els.map((e) => getComputedStyle(e).fontSize));
    expect(tamanhos.length).toBeGreaterThan(0);
    expect(new Set(tamanhos)).toEqual(new Set(["16px"]));
  });

  test("densidade: Confortável também vale no celular e sobrevive a recarregar", async ({ page }) => {
    await abrir(page, "/conta");
    await telaPronta(page);
    const raiz = page.locator("html");
    await page.getByRole("radio", { name: "Confortável" }).tap();
    await expect(raiz).toHaveAttribute("data-densidade", "confortavel");
    await page.reload();
    await telaPronta(page);
    await expect(raiz).toHaveAttribute("data-densidade", "confortavel");
    // O corpo do celular sobe um ponto, e os campos seguem em 16 px.
    expect(await page.locator(".dc-painel__titulo").first().evaluate((e) => getComputedStyle(e).fontSize)).toBe("15px");
    expect(await page.locator(".dc-campo input").first().evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
  });
});

test.describe("no código", () => {
  const SRC = new URL("../src/", import.meta.url);
  const andar = (pasta: URL): URL[] =>
    readdirSync(pasta).flatMap((nome) => {
      const url = new URL(nome, pasta);
      return statSync(url).isDirectory() ? andar(new URL(`${nome}/`, pasta)) : [url];
    });
  const arquivos = andar(SRC);

  test("nenhum tamanho de letra solto no CSS do app", () => {
    for (const nome of ["estilos/app.css", "estilos/componentes.css"]) {
      const css = readFileSync(new URL(nome, SRC), "utf8");
      expect(css.match(/font-size:\s*[\d.]+(px|em|rem)/g), nome).toBeNull();
      expect(css.match(/\bfont:\s*\d+\s+[\d.]+(px|em|rem)/g), nome).toBeNull();
    }
  });

  test("os tokens de tipo são os seis da escala, mais o do campo", () => {
    const css = ["estilos/tokens.css", "estilos/app.css", "estilos/componentes.css"].map((n) => readFileSync(new URL(n, SRC), "utf8")).join("\n");
    const tokens = new Set([...css.matchAll(/--texto-([a-z]+)/g)].map((m) => m[1]));
    expect(tokens).toEqual(new Set(["legenda", "meta", "corpo", "leitura", "titulo", "numero", "campo"]));
  });

  test("nenhum tamanho solto nas telas", () => {
    for (const url of arquivos.filter((u) => u.pathname.endsWith(".tsx"))) {
      const fonte = readFileSync(url, "utf8");
      expect(fonte.match(/\btext-\[\d[^\]]*\]|\bleading-\[|\bfontSize:|\btext-(xs|sm|base|lg|xl|\dxl)\b/g), url.pathname).toBeNull();
    }
  });
});
