/**
 * API de mentira da prévia: responde no próprio navegador com as amostras de
 * e2e/amostras (o escritório de demonstração), como a dos testes de tela.
 * Endereço sem amostra própria usa a do mesmo tipo (qualquer processo abre o
 * processo de amostra). O que muda algo responde "ok" e não guarda nada, menos
 * a peça: Gerar peça escreve uma de mentira aos poucos e a guarda enquanto a
 * prévia está aberta, para revisar, editar e gerar de novo.
 */
import { aosPedacos, pecaDeMentira } from "./peca-gerada";
import { PECA_LONGA } from "./peca-longa";

type Amostra = { path: string; corpo: unknown };

const amostras = Object.values(import.meta.glob<Amostra>("../../e2e/amostras/*.json", { eager: true, import: "default" }));
const fotos = import.meta.glob<string>("../../public/demonstracao/*.jpg", { eager: true, import: "default" });
const logo = Object.values(import.meta.glob<string>("../../../api/src/demonstracao/imagens/logo.png", { eager: true, import: "default" }))[0];
/** Os arquivos dos documentos da amostra (bun apps/api/test/arquivos-das-amostras.ts), pelo id. */
const arquivos = Object.fromEntries(
  Object.entries(import.meta.glob<string>("../../e2e/amostras/arquivos/*", { eager: true, query: "?url", import: "default" })).map(([caminho, url]) => [/([^/]+)\.[a-z]+$/.exec(caminho)![1]!, url]),
);

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
  // Listas: a busca filtra pelo texto (cada palavra, em qualquer ordem) e a amostra é a única página.
  const termo = semAcento(busca.get("busca") ?? busca.get("q") ?? "");
  const palavras = termo.split(/\s+/).filter(Boolean);
  const itens = palavras.length ? corpo.itens.filter((i) => palavras.every((p) => semAcento(JSON.stringify(i)).includes(p))) : corpo.itens;
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

/** A IA fica ligada na prévia; o que ela não faz aqui responde com um aviso. */
const euComIa = { ...eu, ia: true };
const SEM_IA_NA_PREVIA = /^\/(ia\/(briefing|resumo|audiencia|chat)\/|(clientes|negocios)\/[^/]+\/conferir$|documentos\/[^/]+\/ler$|publicacoes\/[^/]+\/(sentenca|sugerir)$)/;

/** A peça que a prévia escreveu ou que a pessoa escreveu à mão, enquanto a prévia está aberta. */
const ID_DA_PECA = "00000000-0000-4000-8000-00000000beef";
type PecaGuardada = { id: string; processoId: string; prazoId: string | null; tipo: string; titulo: string; instrucoes: string; texto: string; situacao: "rascunho" | "revisada"; atualizadaEm: string; rodape: string; revisao: unknown; modelos: unknown[] };
let pecaGuardada: PecaGuardada | null = null;
const catalogo = amostras.find((a) => a.path === "/pecas/catalogo")!.corpo as { grupos: { tipos: { id: string; nome: string; estrutura: string }[] }[] };
const preparos = amostras.filter((a) => a.path.startsWith("/pecas/preparar")).map((a) => a.corpo as { processo: { id: string; titulo: string; cnj: string | null; orgao: string | null }; assina: { nome: string; oab: string | null } | null });
const tipoDePeca = (id: string) => catalogo.grupos.flatMap((g) => g.tipos).find((t) => t.id === id);

function guardarPeca(b: { processoId: string; prazoId?: string | null; tipo: string; instrucoes?: string; texto: string }): PecaGuardada {
  const prep = preparos.find((x) => x.processo.id === b.processoId) ?? preparos[0]!;
  pecaGuardada = {
    id: ID_DA_PECA,
    processoId: b.processoId,
    prazoId: b.prazoId ?? null,
    tipo: b.tipo,
    titulo: `${tipoDePeca(b.tipo)?.nome ?? "Peça"} · ${prep.processo.titulo.split(" × ")[0]}`,
    instrucoes: b.instrucoes ?? "",
    texto: b.texto,
    situacao: "rascunho",
    atualizadaEm: new Date().toISOString(),
    rodape: "Gerado por IA. Confira nos autos.",
    revisao: null,
    modelos: [],
  };
  return pecaGuardada;
}

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

  if (caminho === "/eu") return json(200, comFotos(euComIa));
  if (metodo === "POST" && SEM_IA_NA_PREVIA.test(caminho)) return json(503, { erro: "ia_desligada", detalhe: "Na prévia, a IA só escreve a peça e responde no Perguntar." });
  if (metodo === "POST" && caminho === "/pecas") {
    const b = (await pedido.json()) as { processoId: string; prazoId?: string | null; tipo: string; instrucoes: string };
    const prep = preparos.find((x) => x.processo.id === b.processoId) ?? preparos[0]!;
    const tipo = tipoDePeca(b.tipo) ?? tipoDePeca("outro")!;
    const texto = pecaDeMentira({ tipo, instrucoes: b.instrucoes, processo: prep.processo, assina: prep.assina });
    guardarPeca({ ...b, texto });
    return new Response(aosPedacos(texto), { headers: { "content-type": "text/plain; charset=utf-8", "x-peca-id": ID_DA_PECA } });
  }
  if (metodo === "POST" && caminho === "/pecas/manual") return json(201, { id: guardarPeca((await pedido.json()) as PecaGuardada).id });
  if (caminho === `/pecas/${ID_DA_PECA}` && pecaGuardada) {
    if (metodo === "PUT") {
      const b = (await pedido.json()) as { texto?: string; situacao?: "rascunho" | "revisada" };
      const revisou = b.situacao === "revisada";
      const mudou = b.texto !== undefined && b.texto !== pecaGuardada.texto;
      Object.assign(pecaGuardada, b.texto !== undefined ? { texto: b.texto } : {}, { atualizadaEm: new Date().toISOString() });
      if (revisou) Object.assign(pecaGuardada, { situacao: "revisada", revisao: { por: { ...eu.usuario, oab: "OAB/SC 41.233" }, em: new Date().toISOString() } });
      else if (mudou) Object.assign(pecaGuardada, { situacao: "rascunho", revisao: null });
      return json(200, { ok: true, situacao: pecaGuardada.situacao });
    }
    if (metodo === "GET") return json(200, pecaGuardada);
  }
  if (metodo === "POST" && caminho === "/ia/perguntar") {
    const eventos = amostras.find((a) => a.path === "/ia/perguntar?eventos")!.corpo as unknown[];
    return new Response(`${eventos.map((e) => JSON.stringify(e)).join("\n")}\n`, { headers: { "content-type": "application/x-ndjson" } });
  }
  if (metodo !== "GET") return json(200, { ok: true, id: "00000000-0000-4000-8000-000000000001" });
  // Um documento e o arquivo dele, da amostra dos documentos.
  const doc = /^\/documentos\/([0-9a-f-]{36})(\/arquivo)?$/.exec(caminho);
  if (doc) {
    const { itens } = amostras.find((a) => a.path.startsWith("/documentos"))!.corpo as { itens: { id: string; mime: string }[] };
    const d = itens.find((i) => i.id === doc[1]);
    if (!doc[2]) return d ? json(200, comFotos(d)) : json(404, { erro: "nao_encontrado" });
    const url = arquivos[doc[1]!];
    if (!d || !url) return json(404, { erro: "nao_encontrado" });
    return new Response(await (await fetchReal(url)).blob(), { headers: { "content-type": d.mime } });
  }
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
