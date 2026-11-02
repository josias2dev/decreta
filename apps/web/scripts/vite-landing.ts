/**
 * A landing como HTML estático: `landing.html` recebe a marcação de
 * src/landing/pagina.html no build, já com o preço e o contato resolvidos. No dev e
 * no `vite preview`, `/` e `/demonstracao` abrem os arquivos certos, como o servidor
 * faz em produção (apps/api/src/app.ts).
 * Importa do core pelo caminho porque a configuração do Vite não passa pelo alias.
 */
import { readFileSync } from "node:fs";
import type { Connect, Plugin } from "vite";
import { EMPRESA } from "../../../packages/core/src/legal.ts";
import { PLANO } from "../../../packages/core/src/plano.ts";
import { htmlDoPreco } from "../src/landing/preco.ts";

const PAGINA = new URL("../src/landing/pagina.html", import.meta.url);

/** O WhatsApp da equipe, com a mensagem pronta. */
const CONTATO = `https://wa.me/${EMPRESA.contato.whatsapp}?text=${encodeURIComponent("Olá! Quero conhecer o Decreta para o meu escritório.")}`;

export function montarLanding(casca: string): string {
  return casca.replace(
    "<!--PAGINA-->",
    readFileSync(PAGINA, "utf8")
      .replace("<!--PRECO-->", htmlDoPreco(PLANO, CONTATO))
      .replaceAll("__CONTATO__", CONTATO)
      .replaceAll("__ANO__", String(new Date().getFullYear())),
  );
}

const reescrever: Connect.NextHandleFunction = (req, _res, next) => {
  const [caminho = "", busca] = (req.url ?? "").split("?");
  const alvo = caminho === "/" ? "/landing.html" : caminho === "/demonstracao" || caminho === "/demonstracao/" ? "/demonstracao/index.html" : null;
  if (alvo) req.url = busca ? `${alvo}?${busca}` : alvo;
  next();
};

export function landingEstatica(): Plugin {
  return {
    name: "landing-estatica",
    configureServer: (servidor) => void servidor.middlewares.use(reescrever),
    configurePreviewServer: (servidor) => void servidor.middlewares.use(reescrever),
    transformIndexHtml: {
      order: "pre",
      handler: (html, ctx) => (ctx.filename.endsWith("landing.html") ? montarLanding(html) : html),
    },
  };
}
