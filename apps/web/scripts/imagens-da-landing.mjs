/**
 * Refaz as imagens da landing a partir das telas de verdade: a tela de um prazo
 * no computador, com os cartões por cima, a mesma tela no celular (da demonstração,
 * com dados fictícios) e a imagem de compartilhamento (o topo da landing). Rode com
 * o build no ar:
 *
 *   bun run web:build
 *   cd apps/web && bunx vite preview --port 4181
 *   node apps/web/scripts/imagens-da-landing.mjs 4181
 */
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const PORTA = process.argv[2] ?? "4181";
const BASE = `http://localhost:${PORTA}`;
const FONTE = readFileSync(new URL("../node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2", import.meta.url)).toString("base64");

/** O Chromium não salva webp direto: a captura passa por um canvas, que mantém o fundo transparente. */
async function salvarWebp(page, png, destino, qualidade = 0.88) {
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

/** A tela do prazo com o briefing, como está na demonstração. */
async function telaDoPrazo(viewport, extra = {}) {
  const ctx = await navegador.newContext({ viewport, deviceScaleFactor: 2, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce", ...extra });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/demonstracao/app.html#/prazos`);
  await page.getByText("Manifestação sobre laudo pericial").first().click();
  await page.getByText("O que o juízo decidiu").first().waitFor();
  await page.waitForTimeout(900);
  const png = await page.screenshot();
  await ctx.close();
  return png.toString("base64");
}

const ESTILO = `
  @font-face { font-family: Geist; src: url(data:font/woff2;base64,${FONTE}) format("woff2"); font-weight: 100 900; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: transparent; font-family: Geist, sans-serif; color: #1d1d20; -webkit-font-smoothing: antialiased; }
  .cartao { position: absolute; background: #fff; border: 1px solid #e4e2dc; border-radius: 12px; box-shadow: 0 28px 56px -20px rgba(16, 16, 20, 0.42), 0 2px 8px rgba(16, 16, 20, 0.08); }
  .ia { display: inline-grid; place-items: center; width: 20px; height: 18px; border-radius: 4px; background: #3047c4; color: #fff; font-size: 10px; font-weight: 600; flex: none; }
  b { font-weight: 600; }
  small { color: #6b6a70; font-size: 12px; line-height: 16px; display: block; }
`;

async function compor(html, viewport) {
  const ctx = await navegador.newContext({ viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.setContent(`<!doctype html><style>${ESTILO}</style>${html}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return { page, ctx, png: await page.screenshot({ omitBackground: true }) };
}

// No computador: a janela do navegador com a tela, que some embaixo, e dois cartões por cima.
const computador = await telaDoPrazo({ width: 1164, height: 760 });
{
  const { page, ctx, png } = await compor(
    `<div style="position:relative;width:1216px;height:682px;overflow:hidden">
      <div style="position:absolute;left:26px;right:26px;top:0;height:682px;border:1px solid rgba(255,255,255,.14);border-bottom:0;border-radius:14px 14px 0 0;overflow:hidden;background:#f4f3f0;-webkit-mask-image:linear-gradient(#000 74%,transparent 98%)">
        <div style="display:flex;align-items:center;justify-content:center;position:relative;height:34px;border-bottom:1px solid #e4e2dc">
          <span style="position:absolute;left:14px;display:flex;gap:6px"><i style="width:9px;height:9px;border-radius:50%;background:#d6d4cd"></i><i style="width:9px;height:9px;border-radius:50%;background:#d6d4cd"></i><i style="width:9px;height:9px;border-radius:50%;background:#d6d4cd"></i></span>
          <span style="display:block;width:310px;height:20px;border:1px solid #e4e2dc;border-radius:5px;background:#fff;font-size:11px;line-height:18px;text-align:center;color:#6b6a70">decreta.site/prazos</span>
        </div>
        <img src="data:image/png;base64,${computador}" style="display:block;width:1164px">
      </div>
      <div class="cartao" style="right:0;top:150px;width:286px">
        <div style="display:flex;gap:10px;padding:14px 16px;border-bottom:1px solid #eeece6"><span class="ia">IA</span><div><b style="font-size:13px;line-height:18px;display:block">7 publicações novas do DJEN</b><small>Prazo sugerido em 4. Falta confirmar.</small></div></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid #eeece6"><div><span style="font-size:13px;line-height:18px;font-weight:500;display:block">Réplica à contestação</span><small>Ana Lúcia Ferraz × Banco Horizonte</small></div><span style="flex:none;padding:1px 8px;border:1px solid #e4e2dc;border-radius:99px;font-size:12px">19 nov</span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 16px"><div><span style="font-size:13px;line-height:18px;font-weight:500;display:block">Especificação de provas</span><small>Carlos H. Prado × Vale Norte</small></div><span style="flex:none;padding:1px 8px;border:1px solid #e4e2dc;border-radius:99px;font-size:12px">6 nov</span></div>
        <div style="padding:2px 16px 14px"><span style="display:block;height:30px;border:1px solid #e4e2dc;border-radius:6px;font-size:13px;font-weight:500;line-height:28px;text-align:center">Revisar sugestões</span></div>
      </div>
      <div class="cartao" style="left:0;bottom:44px;width:290px">
        <div style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid #eeece6">
          <svg width="26" height="32" viewBox="0 0 26 32" aria-hidden="true"><path d="M3 1h14l8 8v20a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="#fff" stroke="#cfcdc6"/><path d="M17 1v8h8" fill="none" stroke="#cfcdc6"/><path d="M6 14h13M6 18h13M6 22h8" stroke="#b9b7b0" stroke-width="1.4"/><rect x="5" y="25" width="16" height="3" rx="1" fill="#3047c4"/></svg>
          <div><b style="font-size:13px;line-height:18px;display:block">Manifestação sobre laudo.docx</b><small>Word · timbre do escritório · 4 páginas</small></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px"><span style="padding:1px 8px;border:1px solid #e4e2dc;border-radius:99px;font-size:12px">2 trechos a completar</span><span style="padding:4px 10px;border:1px solid #e4e2dc;border-radius:6px;font-size:13px;font-weight:500">Baixar</span></div>
      </div>
    </div>`,
    { width: 1216, height: 682 },
  );
  await salvarWebp(page, png, new URL("../src/landing/vitrine-computador.webp", import.meta.url));
  await ctx.close();
}

// No celular: a mesma tela, dentro do aparelho.
const celular = await telaDoPrazo({ width: 390, height: 838 }, { isMobile: true, hasTouch: true });
{
  const { page, ctx, png } = await compor(
    `<div style="position:relative;width:300px;height:630px;border:8px solid #1d1d20;border-radius:44px;overflow:hidden;background:#fff">
      <span style="position:absolute;z-index:1;left:50%;top:7px;width:84px;height:23px;margin-left:-42px;border-radius:99px;background:#1d1d20"></span>
      <img src="data:image/png;base64,${celular}" style="display:block;width:284px">
    </div>`,
    { width: 300, height: 630 },
  );
  await salvarWebp(page, png, new URL("../src/landing/vitrine-celular.webp", import.meta.url));
  await ctx.close();
}

// O compartilhamento: o topo da landing, em 1200×630.
const ctx = await navegador.newContext({ viewport: { width: 1200, height: 630 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" });
const page = await ctx.newPage();
await page.route("**/api/**", (r) => r.fulfill({ status: 401, contentType: "application/json", body: "{}" }));
await page.goto(`${BASE}/`);
await page.addStyleTag({ content: ".lp-topo, .lp-novo, .lp-ctas, .lp-checks { display: none !important; } .lp-hero { margin: 0; padding-top: 44px; } .lp-h1 { margin-top: 0; }" });
await page.waitForTimeout(800);
await page.screenshot({ path: new URL("../public/compartilhar.png", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), clip: { x: 0, y: 0, width: 1200, height: 630 } });
await ctx.close();
await navegador.close();
console.log("imagens refeitas");
