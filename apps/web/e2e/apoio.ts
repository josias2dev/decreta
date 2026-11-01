/**
 * API de mentira para os testes de tela. Responde com as amostras de
 * e2e/amostras (geradas da demonstração por apps/api/test/amostras.ts) e
 * guarda o que as telas mandaram, para o teste conferir.
 */
import { readdirSync, readFileSync } from "node:fs";
import type { Page, Route } from "@playwright/test";

type Amostra = { path: string; corpo: any };
const PASTA = new URL("./amostras/", import.meta.url);
/** Os arquivos dos documentos da amostra, pelo id (apps/api/test/arquivos-das-amostras.ts). */
const ARQUIVOS = new URL("./amostras/arquivos/", import.meta.url);

export const amostras: Record<string, Amostra> = Object.fromEntries(
  readdirSync(PASTA)
    .filter((f) => f.endsWith(".json"))
    .map((f) => [f.replace(/\.json$/, ""), JSON.parse(readFileSync(new URL(f, PASTA), "utf8")) as Amostra]),
);

/** Os ids da demonstração, para montar os endereços. */
export const ids = {
  prazo: amostras.prazo!.corpo.id as string,
  prazoComPeca: amostras.prazoComPeca!.corpo.id as string,
  processo: amostras.processo!.corpo.id as string,
  publicacao: amostras.publicacaoMarina!.corpo.id as string,
  cliente: amostras.cliente!.corpo.id as string,
  audiencia: amostras.audiencia!.corpo.id as string,
  peca: amostras.peca!.corpo.id as string,
  /** Sentença inventada, lida pela IA de mentira (propostas 1 a 5). */
  sentenca: amostras.publicacaoSentenca!.corpo.id as string,
  processoComResultado: amostras.processoComResultado!.corpo.id as string,
  negocio: amostras.pastaDoNegocio!.path.split("/")[2]!,
  modelo: amostras.modelo!.corpo.id as string,
  /** Conversas do Perguntar (a da semana está fixada). */
  conversaSemana: amostras.conversaSemana!.corpo.conversa.id as string,
  conversaProcesso: amostras.conversaProcesso!.corpo.conversa.id as string,
  conversaNova: amostras.conversaNova!.corpo.conversa.id as string,
  conversaJurisprudencia: amostras.conversaJurisprudencia!.corpo.conversa.id as string,
};

/** /eu com a IA ligada, para as telas que mostram Refazer, Conferir e o retorno. */
export const euComIa = { ...amostras.eu!.corpo, ia: true };

/** O "agora" das amostras: quinta, 29/10/2026, de manhã em Joinville. */
export const AGORA = new Date("2026-10-29T09:30:00-03:00");

export type Pedido = { metodo: string; caminho: string; corpo: unknown };

export class ApiFalsa {
  readonly pedidos: Pedido[] = [];
  /** Respostas que valem mais que as amostras, por "MÉTODO /caminho" ou só "/caminho". */
  readonly trocas = new Map<string, { status?: number; corpo: unknown }>();
  logado = true;

  responder(chave: string, corpo: unknown, status = 200) {
    this.trocas.set(chave, { corpo, status });
    return this;
  }

  /** Pedidos que mudam algo (POST, PUT, DELETE), para conferir o que a tela mandou. */
  mudancas(caminho?: string | RegExp) {
    return this.pedidos.filter((p) => p.metodo !== "GET" && (!caminho || (typeof caminho === "string" ? p.caminho === caminho : caminho.test(p.caminho))));
  }

  async ligar(page: Page) {
    await page.route("**/api/**", (route) => this.atender(route));
  }

  private async atender(route: Route) {
    const req = route.request();
    const url = new URL(req.url());
    const metodo = req.method();
    let corpo: unknown = null;
    try {
      corpo = req.postDataJSON();
    } catch {
      corpo = req.postData();
    }
    const json = (status: number, dados: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(dados) });

    if (url.pathname.startsWith("/api/auth/")) {
      const acao = url.pathname.slice("/api/auth".length);
      this.pedidos.push({ metodo, caminho: acao, corpo });
      if (acao === "/get-session") return json(200, this.logado ? this.sessao() : null);
      return json(200, { ok: true });
    }
    if (url.pathname.startsWith("/api/convites/")) return json(404, { erro: "nao_encontrado" });
    // O cadastro aberto: cria a conta e já abre a sessão.
    if (url.pathname === "/api/cadastro") {
      this.pedidos.push({ metodo, caminho: "/cadastro", corpo });
      const troca = this.trocas.get("/cadastro");
      if (troca) return json(troca.status ?? 200, troca.corpo);
      this.logado = true;
      return json(201, { ok: true, sessao: true, escritorio: { id: amostras.eu!.corpo.escritorio.id, slug: "souza-mendes" } });
    }
    if (!url.pathname.startsWith("/api/app/")) return json(404, { erro: "nao_encontrado" });

    const caminho = url.pathname.slice("/api/app".length);
    const completo = caminho + url.search;
    this.pedidos.push({ metodo, caminho, corpo });
    const troca = this.trocas.get(`${metodo} ${caminho}`) ?? this.trocas.get(caminho) ?? this.trocas.get(completo);
    if (troca) return json(troca.status ?? 200, troca.corpo);
    if (!this.logado) return json(401, { erro: "sem_sessao" });
    // Um documento da amostra e o arquivo dele.
    const doc = metodo === "GET" ? /^\/documentos\/([0-9a-f-]{36})(\/arquivo)?$/.exec(caminho) : null;
    if (doc) {
      const d = (amostras.documentos!.corpo.itens as { id: string; mime: string }[]).find((i) => i.id === doc[1]);
      const arquivo = d && readdirSync(ARQUIVOS).find((f) => f.startsWith(d.id));
      if (!d || (doc[2] && !arquivo)) return json(404, { erro: "nao_encontrado" });
      return doc[2] ? route.fulfill({ status: 200, contentType: d.mime, body: readFileSync(new URL(arquivo!, ARQUIVOS)) }) : json(200, d);
    }
    // A resposta do Perguntar chega aos poucos, uma linha JSON por acontecimento.
    if (metodo === "POST" && caminho === "/ia/perguntar") {
      const linhas = (amostras.perguntarEventos!.corpo as unknown[]).map((e) => JSON.stringify(e)).join("\n");
      return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: `${linhas}\n` });
    }
    if (metodo !== "GET") return json(200, { ok: true, id: "00000000-0000-4000-8000-000000000001" });

    const lista = Object.values(amostras);
    const achada = lista.find((a) => a.path === completo) ?? lista.find((a) => a.path.split("?")[0] === caminho);
    if (achada) return json(200, achada.corpo);
    return json(404, { erro: "nao_encontrado", detalhe: `sem amostra para ${completo}` });
  }

  private sessao() {
    const u = amostras.eu!.corpo.usuario;
    return {
      session: { id: "sessao", userId: u.id, activeOrganizationId: amostras.eu!.corpo.escritorio.id, expiresAt: "2026-11-28T12:00:00.000Z" },
      user: { id: u.id, name: u.nome, email: "teste@decreta.site", emailVerified: true, twoFactorEnabled: false },
    };
  }
}

/** Abre a tela com a API de mentira e o relógio parado no dia das amostras. */
export async function abrir(page: Page, caminho: string, api = new ApiFalsa()) {
  await page.clock.setFixedTime(AGORA);
  await api.ligar(page);
  await page.goto(caminho);
  return api;
}

/** Quanto a página passa da largura da tela (0 é o certo: nada de rolar para o lado). */
export function sobraNaLateral(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** No Perguntar, o cartão da IA é uma linha de acesso na conversa ("Prazos · 6 prazos"). */
export function acessoAoCartao(page: Page, titulo: string) {
  const nome = titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.locator(".dc-chat__cartoes").getByRole("button", { name: new RegExp(`^${nome}(\\s|$)`) });
}

/** Abre o cartão pela linha de acesso e devolve a folha com o conteúdo. */
export async function abrirCartao(page: Page, titulo: string, qual = 0) {
  await acessoAoCartao(page, titulo).nth(qual).click();
  return page.getByRole("dialog", { name: titulo });
}
