/**
 * Refaz as imagens da landing a partir das telas de verdade: a tela Hoje no
 * computador e no celular (da demonstração, com dados fictícios) e a imagem de
 * compartilhamento (o topo da landing). Rode com o build no ar:
 *
 *   bun run web:build
 *   cd apps/web && bunx vite preview --port 4181
 *   node apps/web/scripts/imagens-da-landing.mjs 4181
 */
import { writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORTA = process.argv[2] ?? "4181";
const BASE = `http://localhost:${PORTA}`;

/** O Chromium não salva webp direto: a captura passa por um canvas. */
async function salvarWebp(page, png, destino, qualidade = 0.86) {
  const dados = await page.evaluate(
    async ([base64, q]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${base64}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      c.getContext("2d").drawImage(img, 0, 0);
      return c.toDataURL("image/webp", q);
    },
    [png.toString("base64"), qualidade],
  );
  writeFileSync(destino, Buffer.from(dados.split(",")[1], "base64"));
}

const navegador = await chromium.launch();

async function telaDaDemonstracao(viewport, escala, destino, extra = {}) {
  const ctx = await navegador.newContext({ viewport, deviceScaleFactor: escala, locale: "pt-BR", timezoneId: "America/Sao_Paulo", ...extra });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demonstracao/app.html#/hoje`);
  await page.getByRole("heading", { level: 1 }).first().waitFor();
  await page.waitForTimeout(900);
  await salvarWebp(page, await page.screenshot(), destino);
  await ctx.close();
}

await telaDaDemonstracao({ width: 1280, height: 800 }, 1, new URL("../src/landing/vitrine-computador.webp", import.meta.url));
await telaDaDemonstracao({ width: 390, height: 844 }, 2, new URL("../src/landing/vitrine-celular.webp", import.meta.url), { isMobile: true, hasTouch: true });

// O compartilhamento: o título e a conta já resolvida, em 1200×630.
const ctx = await navegador.newContext({ viewport: { width: 1200, height: 630 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
const page = await ctx.newPage();
await page.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
await page.goto(`${BASE}/`);
await page.addStyleTag({ content: ".lp-topo, .lp-hero__nota, .lp-conta__apoio, .lp-conta__campos, .lp-res__rever, .lp-cal__legenda, .lp-ctas { display: none !important; } .lp-hero { margin: 0; padding: 40px 0; height: 630px; } .lp-hero__grade { height: 100%; } .lp-h1 { font-size: 72px; } .lp-lead { font-size: 21px; line-height: 31px; }" });
await page.waitForTimeout(800);
await page.screenshot({ path: new URL("../public/compartilhar.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
await ctx.close();
await navegador.close();
console.log("imagens refeitas");
