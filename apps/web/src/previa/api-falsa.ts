/**
 * API de mentira da prévia: responde no próprio navegador com as amostras de
 * e2e/amostras (o escritório de demonstração), como a dos testes de tela.
 * Endereço sem amostra própria usa a do mesmo tipo (qualquer processo abre o
 * processo de amostra). O que muda algo responde "ok" e não guarda nada.
 */
import { PECA_LONGA } from "./peca-longa";

type Amostra = { path: string; corpo: unknown };

const amostras = Object.values(import.meta.glob<Amostra>("../../e2e/amostras/*.json", { eager: true, import: "default" }));
const fotos = import.meta.glob<string>("../../public/demonstracao/*.jpg", { eager: true, import: "default" });
const logo = Object.values(import.meta.glob<string>("../../../api/src/demonstracao/imagens/logo.png", { eager: true, import: "default" }))[0];

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const molde = (caminho: string) => caminho.replace(UUID, ":id");
const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

/** A peça de amostra (meia página): toda resposta que a traz leva a de tamanho de verdade. */
const pecaDeAmostra = amostras.find((a) => /^\/pecas\/[0-9a-f-]{36}$/.test(a.path))!.corpo as { id: string; texto: string };
const PECA_CURTA = JSON.stringify(pecaDeAmostra.texto);

/** As fotos da equipe vêm como /demonstracao/x.jpg; na prévia vão embutidas. A peça vai no tamanho de verdade. */
function comFotos(corpo: unknown): unknown {
  const texto = JSON.stringify(corpo).replaceAll(PECA_CURTA, JSON.stringify(PECA_LONGA)).replace(/"\/demonstracao\/([a-z]+\.jpg)"/g, (tudo, nome: string) => {
    const foto = fotos[`../../public/demonstracao/${nome}`];
    return foto ? JSON.stringify(foto) : tudo;
  });
  return JSON.parse(texto);
}

function achar(caminho: string, busca: URLSearchParams): unknown {
  const completo = caminho + (busca.size ? `?${busca}` : "");
  const a =
    amostras.find((x) => x.path === completo) ??
    amostras.find((x) => x.path.split("?")[0] === caminho) ??
    amostras.find((x) => molde(x.path.split("?")[0]!) === molde(caminho));
  if (!a) return undefined;
  const corpo = a.corpo as { itens?: unknown[]; pagina?: number; total?: number };
  if (!Array.isArray(corpo?.itens)) return a.corpo;
  // Listas: a busca filtra pelo texto e a amostra é a única página.
  const termo = semAcento(busca.get("busca") ?? busca.get("q") ?? "");
  const itens = termo ? corpo.itens.filter((i) => semAcento(JSON.stringify(i)).includes(termo)) : corpo.itens;
  const pagina = Number(busca.get("pagina") ?? 1);
  if (pagina > 1) return { ...corpo, pagina, itens: [], total: 0 };
  return { ...corpo, itens, ...(termo && typeof corpo.total === "number" ? { total: itens.length } : {}) };
}

const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });

const eu = amostras.find((a) => a.path === "/eu")!.corpo as { usuario: { id: string; nome: string }; escritorio: { id: string } };
const sessao = {
  session: { id: "sessao", userId: eu.usuario.id, activeOrganizationId: eu.escritorio.id, expiresAt: "2026-11-28T12:00:00.000Z" },
  user: { id: eu.usuario.id, name: eu.usuario.nome, email: "teste@decreta.site", emailVerified: true, twoFactorEnabled: false },
};

const fetchReal = window.fetch.bind(window);

window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const pedido = new Request(entrada, init);
  const url = new URL(pedido.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return fetchReal(entrada, init);
  await new Promise((r) => setTimeout(r, 120));

  if (url.pathname.startsWith("/api/auth/")) return json(200, url.pathname === "/api/auth/get-session" ? sessao : { ok: true });
  if (!url.pathname.startsWith("/api/app/")) return json(404, { erro: "nao_encontrado" });
  const caminho = url.pathname.slice("/api/app".length);
  const metodo = pedido.method;

  if (metodo === "POST" && caminho === "/ia/perguntar") {
    const eventos = amostras.find((a) => a.path === "/ia/perguntar?eventos")!.corpo as unknown[];
    return new Response(`${eventos.map((e) => JSON.stringify(e)).join("\n")}\n`, { headers: { "content-type": "application/x-ndjson" } });
  }
  if (metodo !== "GET") return json(200, { ok: true, id: "00000000-0000-4000-8000-000000000001" });
  const corpo = achar(caminho, url.searchParams);
  return corpo === undefined ? json(404, { erro: "nao_encontrado", detalhe: "Esta tela não tem dados na prévia." }) : json(200, comFotos(corpo));
}) as typeof fetch;

// Imagens e arquivos que o fetch não pega: a logo vai embutida e o download não sai da prévia.
const trocarLogo = (img: HTMLImageElement) => {
  if (logo && img.getAttribute("src")?.startsWith("/api/app/escritorio/logo")) img.src = logo;
};
new MutationObserver((mudancas) => {
  for (const m of mudancas) {
    if (m.target instanceof HTMLImageElement) trocarLogo(m.target);
    for (const n of m.addedNodes) if (n instanceof HTMLElement) for (const img of n.matches("img") ? [n as HTMLImageElement] : n.querySelectorAll("img")) trocarLogo(img);
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });

document.addEventListener(
  "click",
  (e) => {
    const a = (e.target as Element | null)?.closest?.("a[href]");
    if (a && new URL((a as HTMLAnchorElement).href).pathname.startsWith("/api/")) e.preventDefault();
  },
  true,
);

// A prévia abre no Hoje, já dentro do escritório.
if (!location.hash || location.hash === "#" || location.hash === "#/") history.replaceState(null, "", "#/hoje");
