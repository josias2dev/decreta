/**
 * A landing como HTML estático: `landing.html` recebe a marcação de
 * src/landing/pagina.html no build, já com o contato e o preço do plano inicial; o servidor
 * troca o preço pelo do plano padrão do painel (packages/core/src/preco-da-landing.ts). No dev e
 * no `vite preview`, `/` e `/demonstracao` abrem os arquivos certos, como o servidor
 * faz em produção (apps/api/src/app.ts).
 * Importa do core pelo caminho porque a configuração do Vite não passa pelo alias.
 */
import { readFileSync } from "node:fs";
import type { Connect, Plugin } from "vite";
import { PLANO_INICIAL } from "../../../packages/core/src/plano.ts";
import { CONTATO_DA_LANDING as CONTATO, htmlDoPreco, MARCAS_DO_PRECO } from "../../../packages/core/src/preco-da-landing.ts";

const PAGINA = new URL("../src/landing/pagina.html", import.meta.url);

export function montarLanding(casca: string): string {
  return casca.replace(
    "<!--PAGINA-->",
    readFileSync(PAGINA, "utf8")
      // Entre as marcas: o servidor troca pelo preço do plano padrão do painel a cada visita.
      .replace("<!--PRECO-->", `${MARCAS_DO_PRECO.inicio}${htmlDoPreco({ ...PLANO_INICIAL, valorMensalCentavos: PLANO_INICIAL.mensalCentavos }, CONTATO)}${MARCAS_DO_PRECO.fim}`)
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
