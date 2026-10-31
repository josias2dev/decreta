/**
 * API de mentira da prévia: responde no próprio navegador com as amostras de
 * e2e/amostras (o escritório de demonstração), como a dos testes de tela.
 * Endereço sem amostra própria usa a do mesmo tipo (qualquer processo abre o
 * processo de amostra). O que muda algo responde "ok" e não guarda nada.
 */
import { atenderPerguntar } from "./ia-falsa";
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

const fetchReal = window.fetch.bind(window);

window.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
  const pedido = new Request(entrada, init);
  const url = new URL(pedido.url);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/")) return fetchReal(entrada, init);
  await new Promise((r) => setTimeout(r, 120));

  if (url.pathname === "/api/auth/organization/get-full-organization") {
    // O diálogo da Equipe lê os membros daqui (o papel de cada um).
    const { pessoas } = achar("/equipe", new URLSearchParams()) as { pessoas: { id: string; email: string; papel: string }[] };
    return json(200, { id: eu.escritorio.id, members: pessoas.map((p) => ({ id: `membro-${p.id}`, userId: p.id, role: p.papel, user: { email: p.email } })), invitations: [] });
  }
  if (url.pathname.startsWith("/api/auth/")) return json(200, url.pathname === "/api/auth/get-session" ? sessao : { ok: true });
  if (!url.pathname.startsWith("/api/app/")) return json(404, { erro: "nao_encontrado" });
  const caminho = url.pathname.slice("/api/app".length);
  const metodo = pedido.method;

  // O Perguntar: a resposta chega aos poucos, e as conversas novas ficam guardadas enquanto a prévia está aberta.
  const doPerguntar = await atenderPerguntar(metodo, caminho, url.searchParams, pedido, init?.signal);
  if (doPerguntar) return doPerguntar;
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
  if (caminho === "/processos/consulta") {
    // A consulta de verdade espera o DataJud e o DJEN: a prévia mostra o "buscando" e devolve o exemplo com o número digitado.
    await new Promise((r) => setTimeout(r, 1600));
    const exemplo = achar(caminho, new URLSearchParams()) as { cnj: string } | undefined;
    if (exemplo) return json(200, { ...exemplo, cnj: url.searchParams.get("cnj") ?? exemplo.cnj });
  }
  // CNPJ, CPF, CEP e OAB: a amostra com o número digitado. O CNPJ 85.172.639/0001-07 vem baixado, para mostrar o aviso.
  const consulta = /^\/consultas\/(cnpj|cpf|cep)\/(\w+)$/.exec(caminho);
  if (consulta) {
    await new Promise((r) => setTimeout(r, 700));
    const [, tipo, numero] = consulta;
    const amostra = amostras.find((a) => a.path.startsWith(`/consultas/${tipo}/`))!.corpo as Record<string, unknown> & { empresa?: Record<string, unknown> };
    if (tipo === "cpf") {
      const { itens } = achar("/clientes", new URLSearchParams()) as { itens: { id: string; nome: string; documento: string | null }[] };
      const dono = itens.find((c) => c.documento?.replace(/\D/g, "") === numero);
      return json(200, { cpf: numero, cliente: dono ? { id: dono.id, nome: dono.nome } : null });
    }
    if (tipo === "cnpj" && numero === "85172639000107")
      return json(200, { ...amostra, cnpj: "85.172.639/0001-07", empresa: { ...amostra.empresa, cnpj: numero, razaoSocial: "Auto Peças Rota 101 Ltda.", nomeFantasia: "Rota 101", situacao: "Baixada", ativa: false, situacaoDesde: "2025-06-30", atividade: "Comércio de peças para veículos" } });
    if (tipo === "cep") {
      const cep = `${numero!.slice(0, 5)}-${numero!.slice(5)}`;
      return json(200, { ...amostra, cep, endereco: { ...(amostra.endereco as object), cep } });
    }
    return json(200, { ...amostra, cnpj: numero, empresa: { ...amostra.empresa, cnpj: numero } });
  }
  if (caminho === "/consultas/oab") {
    await new Promise((r) => setTimeout(r, 900));
    const amostra = achar(caminho, new URLSearchParams()) as Record<string, unknown>;
    const numero = url.searchParams.get("numero");
    const { pessoas } = achar("/equipe", new URLSearchParams()) as { pessoas: { nome: string; oabNumero: string | null }[] };
    const dono = pessoas.find((p) => p.oabNumero?.replace(/\D/g, "") === numero);
    return json(200, { ...amostra, oab: `OAB/${url.searchParams.get("uf")} ${numero}`, fonte: dono ? "achou" : "nao_achou", nomes: dono ? [{ nome: dono.nome, publicacoes: 25 }] : [] });
  }
  // A busca pelo número inteiro, sem máscara (o Colar publicação procura assim).
  const numeroInteiro = url.searchParams.get("busca")?.replace(/\D/g, "");
  if (caminho === "/processos" && numeroInteiro?.length === 20) {
    const lista = achar(caminho, new URLSearchParams()) as { itens: { cnj: string | null }[] };
    const itens = lista.itens.filter((p) => p.cnj?.replace(/\D/g, "") === numeroInteiro);
    return json(200, { ...lista, itens, total: itens.length });
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
