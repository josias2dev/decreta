/**
 * A landing como HTML estático: `landing.html` recebe a marcação de
 * src/landing/pagina.html no build, já com o exemplo da conta, os tribunais, o
 * preço e o contato resolvidos. No dev e no `vite preview`, `/` e `/demonstracao`
 * abrem os arquivos certos, como o servidor faz em produção (apps/api/src/app.ts).
 * Importa do core pelo caminho porque a configuração do Vite não passa pelo alias.
 */
import { readFileSync } from "node:fs";
import type { Connect, Plugin } from "vite";
import { TRIBUNAIS_COM_CALENDARIO } from "../../../packages/core/src/calendario.ts";
import { avisoDoDiaSemExpediente } from "../../../packages/core/src/prazos.ts";
import { calendarioPara, proximoFeriadoNacional } from "../../../packages/core/src/calendario.ts";
import { abrirConta } from "../../../packages/core/src/conta-aberta.ts";
import { hojeEm } from "../../../packages/core/src/datas.ts";
import { EMPRESA } from "../../../packages/core/src/legal.ts";
import { PLANO } from "../../../packages/core/src/plano.ts";
import { TRIBUNAIS_DO_DJEN } from "../../../packages/core/src/tribunais.ts";
import { desenharConta } from "../src/landing/conta-html.ts";
import { dadosDoFeriado } from "../src/landing/feriado.ts";
import { htmlDoPreco } from "../src/landing/preco.ts";

const PAGINA = new URL("../src/landing/pagina.html", import.meta.url);
const LOGO = new URL("../src/landing/logo.svg", import.meta.url);

/** O WhatsApp da equipe, com a mensagem pronta. */
const CONTATO = `https://wa.me/${EMPRESA.contato.whatsapp}?text=${encodeURIComponent("Olá! Quero conhecer o Decreta para o meu escritório.")}`;

/** O exemplo com que a conta abre. */
const EXEMPLO = { publicacao: "2026-10-30", dias: 15, contagem: "uteis", tribunal: "TJSC" } as const;

function opcoesDeTribunal(): string {
  // O nome curto: a sigla já diz o ramo.
  const curto = (nome: string) => nome.replace("Justiça estadual: ", "").replace(/^Justiça (Federal|do Trabalho) da /, "");
  const opcao = (sigla: string, nome: string) => `<option value="${sigla}"${sigla === EXEMPLO.tribunal ? " selected" : ""}>${sigla} · ${curto(nome)}</option>`;
  const lista = TRIBUNAIS_DO_DJEN.filter((t) => t.ramo !== "superior");
  const proprio = lista.filter((t) => TRIBUNAIS_COM_CALENDARIO.includes(t.sigla));
  const nacional = lista.filter((t) => !TRIBUNAIS_COM_CALENDARIO.includes(t.sigla));
  return `<optgroup label="Com calendário próprio">${proprio.map((t) => opcao(t.sigla, t.nome)).join("")}</optgroup><optgroup label="Só feriados nacionais e recesso">${nacional.map((t) => opcao(t.sigla, t.nome)).join("")}</optgroup>`;
}

/** O teste do feriado sai com o próximo feriado no dia do build; no navegador, a data é recalculada ao abrir (landing/main.ts). */
function feriadoNoBuild() {
  const f = proximoFeriadoNacional(hojeEm());
  return dadosDoFeriado(f, avisoDoDiaSemExpediente(f.dia, calendarioPara({ tribunal: "nacional" }))!.aviso);
}

export function montarLanding(casca: string): string {
  const pagina = readFileSync(PAGINA, "utf8");
  const feriado = feriadoNoBuild();
  const logo = readFileSync(LOGO, "utf8").trim();
  return casca.replace(
    "<!--PAGINA-->",
    pagina
      .replace("<!--LOGO-->", logo)
      .replace("<!--CONTA-->", desenharConta(abrirConta(EXEMPLO)))
      .replace("<!--TRIBUNAIS-->", opcoesDeTribunal())
      .replace("<!--PRECO-->", htmlDoPreco(PLANO, CONTATO))
      .replaceAll("__CONTATO__", CONTATO)
      .replaceAll("__ANO__", String(new Date().getFullYear()))
      .replaceAll("__FERIADO_DATA__", feriado.data)
      .replaceAll("__FERIADO_DIA__", feriado.dia)
      .replaceAll("__FERIADO_MES__", feriado.mes)
      .replaceAll("__FERIADO_SEMANA__", feriado.semana)
      .replaceAll("__FERIADO_NOME__", feriado.nome)
      .replaceAll("__FERIADO_AVISO__", feriado.aviso),
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
