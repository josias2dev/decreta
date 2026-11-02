/**
 * A landing estática (landing.html), a conta aberta do hero, a demonstração
 * pública e a cobertura. Tudo sem login.
 */
import { readdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ApiFalsa, sobraNaLateral } from "./apoio";

const semSessao = () => {
  const api = new ApiFalsa();
  api.logado = false;
  return api;
};

async function abrirLanding(page: Page, agora = "2026-10-29T09:30:00-03:00") {
  await page.clock.setFixedTime(new Date(agora));
  await semSessao().ligar(page);
  await page.goto("/");
}

const conta = (page: Page) => page.locator("#conta");
/** Espera a contagem animada terminar. */
const contagemPronta = (page: Page) => expect(page.locator("#conta:not(.is-contando) .lp-res__final")).toBeVisible();

test.describe("a conta aberta", () => {
  test.use({ reducedMotion: "reduce" });

  test("abre com o exemplo: publicada em 30/10 no TJSC, 15 dias úteis, vence em 24/11, pulando Finados e a Consciência Negra", async ({ page }) => {
    await abrirLanding(page);
    await expect(conta(page).locator(".lp-res__final strong")).toHaveText("24/11/2026");
    await expect(conta(page).locator(".lp-res__final small")).toHaveText("terça-feira");
    const razao = conta(page).locator(".lp-razao");
    await expect(razao).toContainText("02/11 Finados");
    await expect(razao).toContainText("20/11 Consciência Negra");
    await expect(razao).toContainText("TJSC");
    await expect(razao).toContainText("próprio");
    await expect(conta(page).locator(".lp-dia--contado")).toHaveCount(15);
    await expect(conta(page).locator(".lp-dia--feriado")).toHaveCount(2);
    await expect(conta(page).getByText("É um apoio: confira sempre no tribunal.")).toBeVisible();
  });

  test("tribunal sem calendário próprio: a conta avisa como o app", async ({ page }) => {
    await abrirLanding(page);
    await conta(page).locator("select").selectOption("TJBA");
    await expect(conta(page).getByText("Este tribunal ainda não tem calendário próprio no Decreta: a conta usou os feriados nacionais e o recesso. Confira as suspensões do tribunal.")).toBeVisible();
    await expect(conta(page).locator(".lp-razao")).toContainText("só nacional e recesso");
    await conta(page).locator("select").selectOption("TRF4");
    await expect(conta(page).getByText("Este tribunal ainda não tem calendário próprio")).toHaveCount(0);
  });

  test("dias corridos: o vencimento no sábado vai para a segunda, e a conta explica", async ({ page }) => {
    await abrirLanding(page);
    await conta(page).locator('input[name="dias"]').fill("5");
    await conta(page).getByRole("radio", { name: "Corridos" }).check();
    await expect(conta(page).locator(".lp-res__final strong")).toHaveText("09/11/2026");
    await expect(conta(page).getByText("O último dia caía em 07/11, sem expediente completo, e passou para 09/11.")).toBeVisible();
  });

  test("data ou dias fora da faixa não viram conta, e a tela diz o que conferir", async ({ page }) => {
    await abrirLanding(page);
    await conta(page).locator('input[name="dias"]').fill("0");
    await expect(conta(page).getByText("Confira a data e os dias")).toBeVisible();
    await expect(conta(page).locator(".lp-res__final strong")).toHaveText("24/11/2026");
    await conta(page).locator('input[name="dias"]').fill("10");
    await expect(conta(page).getByText("Confira a data e os dias")).toBeHidden();
  });

  test("prazo longo: a janela do calendário mostra o fim, sem barra de rolagem que prenda a roda do mouse", async ({ page }) => {
    await abrirLanding(page);
    await conta(page).locator('input[name="dias"]').fill("60");
    await expect(conta(page).locator(".lp-res__final strong")).not.toHaveText("24/11/2026");
    await expect(conta(page).locator(".lp-dia--vence")).toBeInViewport();
    const janela = conta(page).locator(".lp-cal__janela");
    expect(await janela.evaluate((e) => getComputedStyle(e).overflowY)).toBe("hidden");
    await janela.hover();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(100);
  });
});

test.describe("a contagem animada", () => {
  test("conta os dias em sequência e termina no vencimento, sem pedir nada ao servidor", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-29T09:30:00-03:00"));
    await semSessao().ligar(page);
    const pedidos: string[] = [];
    await page.goto("/");
    await expect(page.locator("#conta.is-contando")).toBeVisible();
    await contagemPronta(page);
    page.on("request", (r) => pedidos.push(r.url()));
    await conta(page).locator('input[name="dias"]').fill("20");
    await expect(page.locator("#conta.is-contando")).toBeVisible();
    await contagemPronta(page);
    await expect(conta(page).locator(".lp-res__final strong")).toHaveText("01/12/2026");
    expect(pedidos).toEqual([]);
    await conta(page).getByRole("button", { name: "Rever a contagem" }).click();
    await expect(page.locator("#conta.is-contando")).toBeVisible();
  });
});

test.describe("o teste do feriado", () => {
  test("a data é sempre a do próximo feriado nacional em dia de semana, calculada ao abrir", async ({ page }) => {
    await abrirLanding(page, "2026-10-29T09:30:00-03:00");
    await expect(page.locator(".lp-teste__data")).toHaveText("02/11/2026");
    await expect(page.locator(".lp-folhinha__nome")).toHaveText("Finados");
    await expect(page.locator(".lp-aviso")).toContainText("02/11/2026 é feriado (Finados). O próximo dia útil é 03/11/2026.");
  });

  test("dias depois, a página já fala do feriado seguinte e pula o que cai no domingo", async ({ page }) => {
    await abrirLanding(page, "2026-11-02T09:30:00-03:00");
    await expect(page.locator(".lp-teste__data")).toHaveText("20/11/2026");
    await expect(page.locator(".lp-aviso")).toContainText("20/11/2026 é feriado (Consciência Negra). O próximo dia útil é 23/11/2026.");
  });
});

test.describe("a página", () => {
  test("as seções na ordem das perguntas de quem avalia", async ({ page }) => {
    await abrirLanding(page);
    const perguntas = await page.locator(".lp-pergunta").allTextContents();
    expect(perguntas.map((p) => p.replace(/^§ \d+/, ""))).toEqual(["Funciona mesmo?", "Como fica meu dia?", "E se a IA inventar?", "E fora do escritório?", "E o dinheiro do cliente?", "O que falta?", "É seguro? E a OAB?", "Quanto custa?", "E para trocar de sistema?"]);
    await expect(page.locator(".lp-ascii")).toHaveCount(1);
  });

  test("o texto não promete o que não pode: sem concorrente, sem preço de mentira, sem depoimento", async ({ page }) => {
    await abrirLanding(page);
    const texto = (await page.locator("body").innerText()).toLocaleLowerCase("pt-BR");
    for (const proibido of ["astrea", "projuris", "advbox", "jus ia", "jurídico ai", "promad", "advise", "easyjur", "legal one", "cpj", "zero alucinação", "substitui o advogado", "peça pronta", "sob consulta", "num lugar só", "depoimento"]) {
      expect(texto, proibido).not.toContain(proibido);
    }
    expect(texto).not.toContain("todos os tribunais");
  });

  test("o que ainda não vem está escrito: contabilidade, portal do cliente e aplicativo nativo", async ({ page }) => {
    await abrirLanding(page);
    const falta = page.locator(".lp-vem__falta");
    for (const item of ["Contabilidade.", "Portal do cliente.", "Aplicativo nativo."]) await expect(falta.getByText(item)).toBeVisible();
    await expect(falta.getByText("Financeiro.")).toHaveCount(0);
  });

  test("os honorários e a prestação de contas aparecem no que já vem, sem prometer serviço ainda não testado de verdade", async ({ page }) => {
    await abrirLanding(page);
    const vem = page.locator(".lp-vem__colunas");
    await expect(vem.getByText("Honorários por caso: a receber, recebido e em atraso")).toBeVisible();
    await expect(vem.getByText("Prestação de contas do alvará, em Word, no timbre")).toBeVisible();
    const texto = (await page.locator("body").innerText()).toLowerCase();
    for (const servico of ["asaas", "zapsign", "pix automático"]) expect(texto, servico).not.toContain(servico);
  });

  test("preço: o plano único e o convite para a equipe, enquanto o valor não existe", async ({ page }) => {
    await abrirLanding(page);
    const preco = page.locator("#preco");
    await expect(preco.getByText("Plano Escritório")).toBeVisible();
    await expect(preco.getByRole("link", { name: "Perguntar o valor no WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/55\d+\?text=/);
    await expect(preco.getByText("Sem taxa de adesão")).toBeVisible();
  });

  test("dúvidas: como cancelar e o link da cobertura", async ({ page }) => {
    await abrirLanding(page);
    const duvidas = page.locator("#duvidas");
    await duvidas.getByText("Como eu cancelo?").click();
    await expect(duvidas.getByText("Em Configurações, na aba Dados.")).toBeVisible();
    await duvidas.getByText("O meu tribunal está coberto?").click();
    await expect(duvidas.getByRole("link", { name: /situação de cada tribunal/ })).toHaveAttribute("href", "/cobertura");
    await expect(page.locator(".lp-rodape").getByRole("link", { name: "Cobertura por tribunal" })).toHaveAttribute("href", "/cobertura");
  });

  test("os dois caminhos: demonstração antes de criar conta, com o evento certo", async ({ page }) => {
    await abrirLanding(page);
    const cta = page.locator(".lp-hero .lp-ctas a");
    await expect(cta.nth(0)).toHaveText(/Ver um escritório de exemplo/);
    await expect(cta.nth(0)).toHaveAttribute("href", "/demonstracao");
    await expect(cta.nth(0)).toHaveAttribute("data-evento", "clicou_demonstracao");
    await expect(cta.nth(1)).toHaveText("Criar conta");
    await expect(cta.nth(1)).toHaveAttribute("data-evento", "clicou_criar_conta");
  });

  test("a tela de cada passo muda com a rolagem", async ({ page }) => {
    await abrirLanding(page);
    const palco = page.locator(".lp-palco");
    await expect(palco.getByText("15 (quinze) dias").first()).toBeVisible();
    await page.locator('.lp-passo[data-passo="3"]').evaluate((e) => window.scrollBy({ top: e.getBoundingClientRect().top - innerHeight / 2 + 10, behavior: "instant" }));
    await expect(palco).toHaveAttribute("data-passo", "3");
    await expect(palco.locator('[data-tela="3"]')).toBeVisible();
    await page.locator('.lp-passo[data-passo="6"]').evaluate((e) => window.scrollBy({ top: e.getBoundingClientRect().top - innerHeight / 2 + 10, behavior: "instant" }));
    await expect(palco).toHaveAttribute("data-passo", "6");
    await expect(palco.getByText("[COMPLETAR: data do pagamento]")).toBeVisible();
  });
});

test.describe("estática e leve", () => {
  test("o HTML já vem pronto: título, descrição, compartilhamento e a conta do exemplo, sem JavaScript", async ({ request }) => {
    const html = await (await request.get("/")).text();
    expect(html).toContain("<title>Decreta · Todo prazo com a conta à mostra</title>");
    expect(html).toMatch(/<meta name="description" content="[^"]{80,}"/);
    expect(html).toContain('property="og:image" content="https://decreta.site/compartilhar.png"');
    expect(html).toContain("Todo prazo com a conta à mostra.");
    expect(html).toContain("24/11/2026");
    expect(html).toContain("clicou_demonstracao");
    expect(html).not.toContain('id="root"');
  });

  test("robots.txt, sitemap.xml e a imagem de compartilhamento existem", async ({ request }) => {
    expect(await (await request.get("/robots.txt")).text()).toContain("Sitemap: https://decreta.site/sitemap.xml");
    const sitemap = await (await request.get("/sitemap.xml")).text();
    for (const caminho of ["/demonstracao", "/cobertura", "/seguranca"]) expect(sitemap).toContain(`https://decreta.site${caminho}`);
    expect((await request.get("/compartilhar.png")).headers()["content-type"]).toBe("image/png");
  });

  test("a landing só baixa o JavaScript dela, sem o app: abaixo do limite de 150 KB", async ({ page }) => {
    const baixados: { url: string; bytes: number }[] = [];
    page.on("response", async (r) => {
      if (r.url().endsWith(".js")) baixados.push({ url: r.url(), bytes: (await r.body()).length });
    });
    await abrirLanding(page);
    await expect(page.locator(".lp-res__final strong")).toHaveText("24/11/2026");
    await page.waitForLoadState("networkidle");
    expect(baixados.length).toBeGreaterThan(0);
    // Sem comprimir: comprimido fica ainda menor.
    expect(baixados.reduce((soma, b) => soma + b.bytes, 0)).toBeLessThan(150 * 1024);
    for (const { url } of baixados) expect(url).not.toMatch(/\/(index|moldura|hoje)-/);
  });

  test("o app em pedaços: abrir o login não baixa as telas de dentro", async ({ page }) => {
    const baixados: string[] = [];
    page.on("request", (r) => {
      if (r.url().endsWith(".js")) baixados.push(r.url());
    });
    await semSessao().ligar(page);
    await page.goto("/entrar");
    await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
    expect(baixados.filter((u) => /\/(peca|processo|publicacoes|perguntar|hoje)-/.test(u))).toEqual([]);
  });

  test("do login, o link do site volta para a landing estática", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-29T09:30:00-03:00"));
    await semSessao().ligar(page);
    await page.goto("/entrar");
    await page.getByRole("link", { name: "decreta.site" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Todo prazo com a conta à mostra." })).toBeVisible();
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });

  test("a conta e o resultado aparecem logo, com alvos de toque e sem rolar para o lado", async ({ page }) => {
    await abrirLanding(page);
    await expect(conta(page).locator(".lp-cal")).toBeInViewport();
    await expect(conta(page).locator(".lp-res__final strong")).toHaveText("24/11/2026");
    expect((await conta(page).locator('input[name="dias"]').boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await conta(page).locator('input[name="dias"]').evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
    await conta(page).locator("select").selectOption("TJPR");
    await expect(conta(page).getByText("Este tribunal ainda não tem calendário próprio")).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });
});

test.describe("a demonstração pública", () => {
  test("a faixa fixa, o app dentro, sem login e sem nenhum pedido à rede", async ({ page }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("data:") && !r.url().startsWith("blob:")) pedidos.push(r.url());
    });
    await page.goto("/demonstracao");
    await expect(page.getByText("Escritório de exemplo, com dados fictícios. As respostas da IA são simuladas.")).toBeVisible();
    const app = page.frameLocator("iframe");
    await expect(app.getByRole("heading", { level: 1, name: "Hoje" })).toBeVisible();
    await app.getByRole("link", { name: /^Prazos/ }).first().click();
    await expect(app.getByRole("heading", { level: 1, name: "Prazos" })).toBeVisible();
    await app.getByRole("link", { name: /^Publicações/ }).first().click();
    await expect(app.getByRole("heading", { level: 1, name: "Publicações" })).toBeVisible();
    // A faixa continua lá, e o app não chamou API nenhuma nem outro endereço.
    await expect(page.getByText("Escritório de exemplo, com dados fictícios.")).toBeInViewport();
    const origem = new URL(page.url()).origin;
    expect(pedidos.filter((u) => !u.startsWith(`${origem}/demonstracao`))).toEqual([]);
    await expect(page.getByRole("link", { name: "Criar conta" })).toHaveAttribute("href", "/cadastro");
  });

  test("nenhum dado de gente de verdade nas amostras: só os e-mails de exemplo da demonstração", () => {
    const pasta = new URL("./amostras/", import.meta.url);
    const emails = new Set<string>();
    for (const nome of readdirSync(pasta).filter((f) => f.endsWith(".json"))) {
      for (const m of readFileSync(new URL(nome, pasta), "utf8").matchAll(/[\w.%+-]+@[\w.-]+\.[a-z]{2,}/g)) emails.add(m[0]);
    }
    expect(emails.size).toBeGreaterThan(0);
    for (const email of emails) expect(email).toMatch(/[@.]exemplo\.com\.br$|@demo\.decreta\.app$|@decreta\.site$/);
  });
});

test.describe("com a CSP do servidor", () => {
  /** A política de cada caminho, lida do próprio bloco do Caddy, para o teste não envelhecer. */
  const caddy = readFileSync(new URL("../../../deploy/Caddyfile.decreta", import.meta.url), "utf8");
  const politica = (matcher: string) => new RegExp(`header @${matcher} \\{[\\s\\S]*?Content-Security-Policy "([^"]+)"`).exec(caddy)![1]!;

  async function comCsp(page: Page, padrao: string | ((url: URL) => boolean), csp: string) {
    await page.route(padrao, async (r) => {
      const resposta = await r.fetch();
      await r.fulfill({ response: resposta, headers: { ...resposta.headers(), "content-security-policy": csp } });
    });
    const recusas: string[] = [];
    page.on("console", (m) => {
      if (/Content Security Policy|Refused to/.test(m.text())) recusas.push(m.text());
    });
    return recusas;
  }

  test("a demonstração abre e abre um documento embutido, sem nada recusado, e a política não deixa sair para a rede", async ({ page }) => {
    const csp = politica("demonstracao");
    expect(csp).toContain("connect-src data: blob:");
    expect(csp).not.toContain("'unsafe-inline'; img");
    const recusas = await comCsp(page, "**/demonstracao**", csp);
    await page.goto("/demonstracao");
    const app = page.frameLocator("iframe");
    await expect(app.getByRole("heading", { level: 1, name: "Hoje" })).toBeVisible();
    await app.getByRole("link", { name: /^Documentos/ }).first().click();
    await expect(app.getByRole("heading", { level: 1, name: "Documentos" })).toBeVisible();
    expect(recusas).toEqual([]);
  });

  test("a landing roda inteira sem script inline", async ({ page }) => {
    const recusas = await comCsp(page, (u) => u.pathname === "/", politica("telas"));
    await semSessao().ligar(page);
    await page.goto("/");
    await expect(page.locator(".lp-res__final strong")).toHaveText("24/11/2026");
    await page.locator("#conta select").selectOption("TJBA");
    await expect(page.getByText("Este tribunal ainda não tem calendário próprio")).toBeVisible();
    expect(recusas).toEqual([]);
  });
});

test.describe("a cobertura", () => {
  const COBERTURA = {
    geradaEm: "2026-10-30T12:00:00.000Z",
    listaDoDjen: true,
    tribunais: [
      { sigla: "TJSC", nome: "Justiça estadual: Santa Catarina", ramo: "estadual", calendario: "proprio", ultimaLeitura: { dia: "2026-10-30", em: "2026-10-30T07:31:00.000Z" }, ultimoEnvio: "2026-10-30" },
      { sigla: "TJBA", nome: "Justiça estadual: Bahia", ramo: "estadual", calendario: "nacional", ultimaLeitura: null, ultimoEnvio: "2026-10-29" },
      { sigla: "TRT12", nome: "Justiça do Trabalho da 12ª Região", ramo: "trabalho", calendario: "proprio", ultimaLeitura: null, ultimoEnvio: null },
    ],
  };

  test("os limites vêm antes da tabela, e cada tribunal mostra a última leitura e o calendário", async ({ page }) => {
    const api = semSessao();
    api.responder("/cobertura", COBERTURA);
    await api.ligar(page);
    await page.goto("/cobertura");
    await expect(page.getByRole("heading", { name: "O que o Decreta lê em cada tribunal" })).toBeVisible();
    await expect(page.getByText(/O que não vai ao DJEN/)).toBeVisible();
    const tjsc = page.getByRole("row").filter({ hasText: "TJSC" });
    await expect(tjsc.getByRole("cell", { name: "30/10/2026" })).toBeVisible();
    await expect(tjsc.getByText(/Caderno de 30\/10/)).toBeVisible();
    await expect(tjsc.getByRole("cell", { name: "Próprio" })).toBeVisible();
    const tjba = page.getByRole("row").filter({ hasText: "TJBA" });
    await expect(tjba.getByText("Ainda sem leitura do caderno")).toBeVisible();
    await expect(tjba.getByRole("cell", { name: "Nacional e recesso" })).toBeVisible();
    await page.getByRole("searchbox", { name: "Procurar tribunal" }).fill("bahia");
    await expect(page.getByRole("row").filter({ hasText: "TJSC" })).toHaveCount(0);
    await expect(page.getByRole("row").filter({ hasText: "TJBA" })).toBeVisible();
  });

  test("com a API fora, a página diz isso em vez de ficar em branco", async ({ page }) => {
    const api = semSessao();
    api.responder("/cobertura", { erro: "falha" }, 500);
    await api.ligar(page);
    await page.goto("/cobertura");
    await expect(page.getByText("Não deu para carregar a cobertura agora.")).toBeVisible({ timeout: 10_000 });
  });
});
