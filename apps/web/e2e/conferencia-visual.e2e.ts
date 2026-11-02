/**
 * Conferência visual: em 1366×768 e 390×844, todo texto na tela usa um dos seis
 * tamanhos da escala (estilos/tokens.css), as linhas têm o respiro combinado e
 * toda tela começa e termina nas mesmas margens. Não compara imagens, porque a
 * fonte renderiza diferente no CI: é a garantia de que ninguém volta a pôr tamanho
 * solto nem margem própria.
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
  `/pecas?id=${ids.pecaConferida}&prazo=${ids.prazo}`,
  "/perguntar",
  `/perguntar/${ids.conversaSemana}`,
  "/comecar",
];
/** O Perguntar ocupa a folha inteira, e o /comecar fica sem o menu em volta. */
const TELAS_COM_A_MARGEM_DA_PAGINA = TELAS_DO_APP.filter((r) => !r.startsWith("/perguntar") && r !== "/comecar");

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

  for (const largura of [1366, 1710]) {
    test(`toda tela começa e termina nas mesmas margens em ${largura} px`, async ({ page }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width: largura, height: 880 });
      const medidas = new Map<string, number[]>();
      for (const rota of TELAS_COM_A_MARGEM_DA_PAGINA) {
        await abrir(page, rota);
        await telaPronta(page);
        const m = await page.evaluate(() => {
          const folha = document.querySelector(".dc-conteudo")!.getBoundingClientRect();
          const pagina = document.querySelector("main.dc-pagina")!;
          const dentro = { esquerda: folha.left + 1, direita: folha.right - 1 };
          // O cabeçalho e o topo do detalhe vão de ponta a ponta (0); o resto começa e termina na margem.
          const filhos = [...pagina.children].map((f) => f.getBoundingClientRect()).filter((r) => r.width > 0);
          return {
            margem: Number.parseFloat(getComputedStyle(pagina).paddingLeft),
            direita: Number.parseFloat(getComputedStyle(pagina).paddingRight),
            esquerdas: filhos.map((r) => Math.round(r.left - dentro.esquerda)),
            direitas: filhos.map((r) => Math.round(dentro.direita - r.right)),
          };
        });
        expect(m.margem, rota).toBe(24);
        expect(m.direita, rota).toBe(24);
        for (const lado of [...m.esquerdas, ...m.direitas]) expect([0, 24], `${rota}: ${m.esquerdas} | ${m.direitas}`).toContain(lado);
        medidas.set(rota, m.esquerdas);
      }
      expect(medidas.size).toBe(TELAS_COM_A_MARGEM_DA_PAGINA.length);
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

  test("Hoje: linhas com respiro, cabeçalho e números em uma linha", async ({ page }) => {
    const painel = amostras.hoje!.corpo;
    await abrir(page, "/hoje", new ApiFalsa().responder("/hoje", { ...painel, itens: repetir(painel.itens, 24) }));
    await telaPronta(page);
    const linha = page.locator(".dc-colunas > .dc-painel .dc-tabela tbody tr");
    const altura = (await linha.first().boundingBox())!.height;
    expect(altura).toBeGreaterThanOrEqual(54);
    expect(altura).toBeLessThanOrEqual(58);
    // Bem mais do que as 5 de antes, sem apertar: é a letra menor e a informação organizada que abrem espaço.
    expect(await linhasInteiras(page, ".dc-colunas > .dc-painel .dc-tabela tbody tr")).toBeGreaterThanOrEqual(7);
    const cabecalho = (await page.locator(".dc-cabecalho").boundingBox())!;
    expect(cabecalho.height).toBeGreaterThanOrEqual(56);
    expect(cabecalho.height).toBeLessThanOrEqual(60);
    const numeros = (await page.getByLabel("Números do dia").boundingBox())!;
    expect(numeros.height).toBeGreaterThanOrEqual(56);
    expect(numeros.height).toBeLessThanOrEqual(60);
    expect((await page.locator(".dc-menu").boundingBox())!.width).toBe(208);
  });

  test("Publicações: as partes numa linha inteira, três colunas e a decisão com a data em destaque", async ({ page }) => {
    const caixa = amostras.publicacoes!.corpo;
    await abrir(page, `/publicacoes?id=${ids.publicacao}`, new ApiFalsa().responder("/publicacoes", { ...caixa, itens: repetir(caixa.itens, 24) }));
    await telaPronta(page);
    const item = page.locator(".dc-pub").first();
    const altura = (await item.boundingBox())!.height;
    expect(altura).toBeGreaterThanOrEqual(68);
    expect(altura).toBeLessThanOrEqual(76);
    expect(await linhasInteiras(page, ".dc-pub")).toBeGreaterThanOrEqual(7);
    // O nome das partes é o que se procura: não divide a linha com o selo.
    const partes = await page.locator(".dc-pub__partes").first().evaluate((e) => ({ largura: e.getBoundingClientRect().width, pai: e.parentElement!.clientWidth, corte: e.scrollWidth > e.clientWidth }));
    expect(partes.corte).toBe(false);
    // Lista, teor e decisão lado a lado, da mesma altura, cada um rolando por si.
    const colunas = await Promise.all([".dc-caixa__lista", ".dc-caixa__teor", ".dc-caixa__decisao"].map(async (s) => (await page.locator(s).boundingBox())!));
    expect(colunas[0]!.x + colunas[0]!.width).toBeLessThan(colunas[1]!.x);
    expect(colunas[1]!.x + colunas[1]!.width).toBeLessThan(colunas[2]!.x);
    expect(new Set(colunas.map((c) => Math.round(c.height))).size).toBe(1);
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBe(0);
    await expect(page.locator(".dc-fatos__data")).toHaveText("23/11/2026");
    await expect(page.locator(".dc-caixa__botoes").getByRole("button", { name: "Confirmar prazo" })).toBeInViewport();
  });

  for (const largura of [1366, 1710]) {
    test(`Publicações em ${largura} px: as abas cabem, a primeira linha das três colunas se alinha e o teor tem uma margem só`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 880 });
      await abrir(page, `/publicacoes?id=${ids.publicacao}`);
      await telaPronta(page);
      const abas = page.locator(".dc-caixa__lista .dc-abas");
      expect(await abas.evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
      const meio = async (s: string) => {
        const r = (await page.locator(s).first().boundingBox())!;
        return r.y + r.height / 2;
      };
      const aba = await meio(".dc-caixa__lista .dc-aba");
      expect(Math.abs((await meio(".dc-caixa__topo strong")) - aba)).toBeLessThanOrEqual(2);
      expect(Math.abs((await meio(".dc-caixa__decisao .dc-ia__marca")) - aba)).toBeLessThanOrEqual(2);
      const esquerda = async (s: string) => (await page.locator(s).first().boundingBox())!.x;
      expect(await esquerda(".dc-lido__titulo")).toBe(await esquerda(".dc-caixa__topo strong"));
    });
  }

  test("o rótulo acompanha o centro da foto, nos dados", async ({ page }) => {
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await telaPronta(page);
    const rotulo = (await page.locator(".dc-dados dt", { hasText: "Responsável" }).boundingBox())!;
    const foto = (await page.locator(".dc-dados .dc-pessoa").first().boundingBox())!;
    expect(Math.abs(rotulo.y + rotulo.height / 2 - (foto.y + foto.height / 2))).toBeLessThanOrEqual(1);
  });

  test("Publicações em Confortável, a 1366 px: as abas cabem e o teor tem largura de leitura", async ({ page }) => {
    await page.addInitScript(([id]) => {
      localStorage.setItem("decreta:densidade", "confortavel");
      localStorage.setItem(`decreta:densidade:${id}`, "confortavel");
    }, [amostras.eu!.corpo.usuario.id as string]);
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await telaPronta(page);
    await expect(page.locator("html")).toHaveAttribute("data-densidade", "confortavel");
    expect(await page.locator(".dc-caixa__lista .dc-abas").evaluate((e) => e.scrollWidth - e.clientWidth)).toBe(0);
    expect((await page.locator(".dc-caixa__teor").boundingBox())!.width).toBeGreaterThanOrEqual(340);
  });

  test("Publicações abaixo de 1280 px: a decisão desce para baixo do teor", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await abrir(page, `/publicacoes?id=${ids.publicacao}`);
    await telaPronta(page);
    const teor = (await page.locator(".dc-caixa__teor").boundingBox())!;
    const decisao = (await page.locator(".dc-caixa__decisao").boundingBox())!;
    expect(decisao.y).toBeGreaterThanOrEqual(teor.y + teor.height);
    expect(decisao.x).toBe(teor.x);
    await expect(page.locator(".dc-caixa__botoes").getByRole("button", { name: "Confirmar prazo" })).toBeInViewport();
  });

  test("Prazos, Processos e Clientes: as linhas ficam perto de 56 px", async ({ page }) => {
    for (const rota of ["/prazos", "/processos", "/clientes"]) {
      await abrir(page, rota);
      await telaPronta(page);
      const alturas = await page.locator(".dc-tabela tbody tr[data-link]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
      expect(alturas.length).toBeGreaterThan(0);
      expect(Math.min(...alturas), rota).toBeGreaterThanOrEqual(54);
      expect(Math.max(...alturas), rota).toBeLessThanOrEqual(58);
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
    // Doze de respiro em volta das três linhas do cartão.
    expect(alvaras.altura).toBeGreaterThanOrEqual(80);
  });

  test("os totais dos alvarás usam a mesma faixa dos números do Hoje", async ({ page }) => {
    await abrir(page, "/alvaras");
    await telaPronta(page);
    const totais = page.getByLabel("Totais dos alvarás");
    await expect(totais.locator(".dc-contador")).toHaveCount(3);
    expect((await totais.boundingBox())!.height).toBeLessThanOrEqual(60);
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

  test("datas e valores na Geist, com os números alinhados: nada de fonte mono na interface", async ({ page }) => {
    await abrir(page, "/alvaras");
    await telaPronta(page);
    const valor = await page.locator(".dc-cartao-quadro__valor").first().evaluate((e) => getComputedStyle(e));
    expect(valor.fontFamily).toContain("Geist");
    expect(valor.fontFamily).not.toContain("Mono");
    await abrir(page, "/prazos");
    await telaPronta(page);
    const cnj = page.locator(".dc-cnj").first();
    expect(await cnj.evaluate((e) => getComputedStyle(e).fontFamily)).not.toMatch(/mono/i);
    expect(await cnj.evaluate((e) => getComputedStyle(e).fontVariantNumeric)).toContain("tabular-nums");
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
    await page.goto("/prazos");
    const linha = page.locator(".dc-tabela tbody tr[data-link]").first();
    await expect(linha).toBeVisible();
    expect((await linha.boundingBox())!.height).toBeGreaterThanOrEqual(64);
    const botao = (await page.getByRole("button", { name: "Novo prazo" }).boundingBox())!;
    expect(botao.height).toBe(36);
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

test.describe("menu rápido da pessoa", () => {
  test.use({ viewport: COMPUTADOR });
  const cartao = (page: Page) => page.getByRole("button", { name: /Menu da conta de/ });

  test("abre para cima com nome e e-mail, e os itens na ordem combinada", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    const posicao = (await cartao(page).boundingBox())!;
    await cartao(page).click();
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    expect((await menu.boundingBox())!.y + (await menu.boundingBox())!.height).toBeLessThanOrEqual(posicao.y);
    await expect(menu.getByText("teste@decreta.site")).toBeVisible();
    const itens = await menu.getByRole("menuitem").allTextContents();
    expect(itens.map((t) => t.trim())).toEqual(["Minha conta", "Configurações", "Segurança e LGPD", "Sair"]);
    await expect(menu.getByRole("menuitemradio")).toHaveText(["Compacto", "Confortável"]);
    await expect(menu.getByRole("switch", { name: "Modo escuro" })).toHaveAttribute("aria-checked", "false");
    await conferirEscala(page, ESCALA_DO_COMPUTADOR);
  });

  test("Minha conta navega, e a densidade troca ali mesmo sem fechar o menu", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await cartao(page).click();
    await page.getByRole("menuitemradio", { name: "Confortável" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-densidade", "confortavel");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "Confortável" })).toBeChecked();
    await page.getByRole("menuitem", { name: "Minha conta" }).click();
    await expect(page).toHaveURL(/\/conta$/);
    await expect(page.getByRole("radio", { name: "Confortável" })).toBeChecked();
  });

  test("pelo teclado: abre, anda com as setas, Esc fecha e o foco volta ao cartão", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await cartao(page).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menuitem", { name: "Minha conta" }).or(page.getByRole("menuitemradio", { name: "Compacto" })).first()).toBeVisible();
    const focado = () => page.evaluate(() => document.activeElement?.textContent?.trim());
    const antes = await focado();
    await page.keyboard.press("ArrowDown");
    expect(await focado()).not.toBe(antes);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(cartao(page)).toBeFocused();
  });

  test("Sair encerra a sessão pelo mesmo caminho de /conta", async ({ page }) => {
    const api = await abrir(page, "/hoje");
    await telaPronta(page);
    await cartao(page).click();
    api.logado = false;
    await page.getByRole("menuitem", { name: "Sair" }).click();
    await expect(page).toHaveURL(/\/entrar/);
    expect(api.pedidos.some((p) => p.metodo === "POST" && p.caminho === "/sign-out")).toBe(true);
  });

  test("com o menu recolhido, o cartão é só a foto e o menu abre ao lado", async ({ page }) => {
    await abrir(page, "/hoje");
    await telaPronta(page);
    await page.getByRole("button", { name: "Recolher o menu" }).click();
    const foto = (await cartao(page).boundingBox())!;
    expect(foto.width).toBeLessThanOrEqual(36);
    await cartao(page).click();
    const menu = (await page.getByRole("menu").boundingBox())!;
    expect(menu.x).toBeGreaterThanOrEqual(foto.x + foto.width);
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

  test("publicação: uma coluna, com a data antes do teor", async ({ page }) => {
    await abrir(page, `/publicacoes/${ids.publicacao}`);
    await telaPronta(page);
    const data = (await page.locator(".dc-fatos__data").boundingBox())!;
    const teor = (await page.getByRole("heading", { name: "Teor da intimação" }).boundingBox())!;
    expect(data.y).toBeLessThan(teor.y);
    expect(await sobraNaLateral(page)).toBe(0);
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
