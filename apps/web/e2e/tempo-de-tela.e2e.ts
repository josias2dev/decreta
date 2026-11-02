/**
 * Quanto demora para mudar de tela no build de produção, com a API de mentira. Não é teste (tempo sob carga não
 * dá verde nem vermelho confiável): só roda quando pedido, um de cada vez, e imprime a tabela.
 *
 *   E2E_MEDIR=1 E2E_PORTA=4431 bun run web:e2e -- e2e/tempo-de-tela.e2e.ts --workers=1
 *
 * Do clique, em dois marcos: "título" (a tela nova à vista, mesmo com o esqueleto) e "conteúdo" (sem esqueleto e
 * com a lista na tela). O "atraso" soma esse tanto a cada pedido à API e a cada arquivo, o que imita a rede de longe.
 * Não cobre: rede de verdade (TLS, perda, banda), o cache do navegador (o Playwright desliga com as rotas), consulta
 * real ao banco e aparelho lento.
 */
import { test, type Browser, type Page } from "@playwright/test";
import { ApiFalsa } from "./apoio";

const VEZES = Number(process.env.E2E_MEDIR_VEZES) || 7;
const CAMINHO_DO_MENU = (rota: string) => `nav.dc-menu a[href="${rota}"]`;

type Destino = { nome: string; de: string; link: string; h1: string; texto?: string; conteudo: string };
const DESTINOS: Destino[] = [
  { nome: "Hoje", de: "/equipe", link: CAMINHO_DO_MENU("/hoje"), h1: "h1.dc-h1", texto: "Hoje", conteudo: ".dc-numeros--dia" },
  { nome: "Prazos", de: "/equipe", link: CAMINHO_DO_MENU("/prazos"), h1: "h1.dc-h1", texto: "Prazos", conteudo: "tr[data-link]" },
  { nome: "Publicações", de: "/equipe", link: CAMINHO_DO_MENU("/publicacoes"), h1: "h1.dc-h1", texto: "Publicações", conteudo: ".dc-pub" },
  { nome: "Processos", de: "/equipe", link: CAMINHO_DO_MENU("/processos"), h1: "h1.dc-h1", texto: "Processos", conteudo: "tr[data-link]" },
  { nome: "Um processo", de: "/processos", link: 'tr[data-link] a[href^="/processos/"]', h1: ".dc-topo-detalhe h1", conteudo: ".dc-topo-detalhe" },
];

type Medida = { titulo: number; conteudo: number };
declare global {
  interface Window {
    __medida: Promise<Medida>;
  }
}

/** Fica olhando, quadro a quadro, a partir do próximo clique. Dentro da página, para o relógio ser o do navegador. */
const armar = (page: Page, d: Destino) =>
  page.evaluate(
    ({ h1, texto, conteudo }) => {
      window.__medida = new Promise((resolve) => {
        document.addEventListener(
          "click",
          () => {
            const inicio = performance.now();
            let titulo: number | null = null;
            const olhar = () => {
              const el = document.querySelector(h1);
              const mudou = !!el && (texto === undefined || el.textContent === texto);
              if (mudou && titulo === null) titulo = performance.now() - inicio;
              if (mudou && document.querySelector(conteudo) && !document.querySelector('[aria-label="Carregando"]')) resolve({ titulo: titulo!, conteudo: performance.now() - inicio });
              else requestAnimationFrame(olhar);
            };
            requestAnimationFrame(olhar);
          },
          { capture: true, once: true },
        );
      });
    },
    { h1: d.h1, texto: d.texto, conteudo: d.conteudo },
  );

type Como = "clique direto" | "mouse antes" | "tela já vista";

async function umaVez(browser: Browser, d: Destino, como: Como, atraso: number): Promise<Medida> {
  const contexto = await browser.newContext({ baseURL: test.info().project.use.baseURL, viewport: { width: 1366, height: 768 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
  const page = await contexto.newPage();
  await new ApiFalsa().ligar(page);
  if (atraso) {
    await page.route(/\/(api|assets)\//, async (route) => {
      await new Promise((r) => setTimeout(r, atraso));
      await route.fallback();
    });
  }
  await page.goto(d.de);
  await page.locator(d.link).first().waitFor();
  if (como === "tela já vista") {
    await page.locator(d.link).first().click();
    await page.locator(d.conteudo).first().waitFor();
    await page.goBack();
    await page.locator(d.link).first().waitFor();
  }
  await armar(page, d);
  const link = page.locator(d.link).first();
  if (como === "mouse antes") {
    await link.hover();
    await page.waitForTimeout(200 + atraso);
    await page.mouse.down();
    await page.mouse.up();
  } else {
    await link.click();
  }
  const medida = await page.evaluate(() => window.__medida);
  await contexto.close();
  return medida;
}

const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!;

test.describe("tempo de tela", () => {
  test.skip(!process.env.E2E_MEDIR, "Só com E2E_MEDIR=1: é medição, não teste.");
  test.describe.configure({ mode: "serial" });

  for (const atraso of [0, 100]) {
    for (const como of ["clique direto", "mouse antes", "tela já vista"] as Como[]) {
      test(`${como}, atraso de ${atraso} ms`, async ({ browser }) => {
        test.setTimeout(10 * 60_000);
        const linhas: Record<string, string | number>[] = [];
        for (const d of DESTINOS) {
          const medidas: Medida[] = [];
          for (let i = 0; i < VEZES; i++) medidas.push(await umaVez(browser, d, como, atraso));
          const titulos = medidas.map((m) => m.titulo);
          const conteudos = medidas.map((m) => m.conteudo);
          linhas.push({ tela: d.nome, titulo: Math.round(mediana(titulos)), conteudo: Math.round(mediana(conteudos)), pior: Math.round(Math.max(...conteudos)) });
        }
        console.log(`\n## ${como}, atraso de ${atraso} ms (${VEZES} vezes, mediana em ms)\n${linhas.map((l) => `${String(l.tela).padEnd(12)} título ${String(l.titulo).padStart(5)}  conteúdo ${String(l.conteudo).padStart(5)}  pior ${String(l.pior).padStart(5)}`).join("\n")}`);
      });
    }
  }
});
