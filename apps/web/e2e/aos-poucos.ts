/**
 * A resposta do Perguntar chegando aos poucos de verdade: o fetch de
 * /api/app/ia/perguntar é trocado, no navegador, por um corpo que solta uma
 * linha JSON por vez, com esperas e portões (o teste segura a resposta num
 * ponto e solta depois). Parar corta o corpo como a rede corta; `cair` faz a
 * ligação cair no meio. Cada pergunta usa o próximo roteiro da fila.
 */
import type { Page } from "@playwright/test";
import { amostras } from "./apoio";

export type Passo = { e?: unknown; espera?: number; portao?: string; cair?: boolean };

export async function ligarAosPoucos(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    const original = window.fetch.bind(window);
    w.__roteiros = [];
    w.__pedidos = [];
    w.__portoes = {};
    w.__noPortao = [];
    const portao = (nome: string) => (w.__portoes[nome] ||= { aberto: false, soltar: [] as (() => void)[] });
    w.__abrir = (nome: string) => {
      const p = portao(nome);
      p.aberto = true;
      p.soltar.splice(0).forEach((f: () => void) => f());
    };
    const esperar = (nome: string) =>
      new Promise<void>((ok) => {
        const p = portao(nome);
        if (p.aberto) return ok();
        w.__noPortao.push(nome);
        p.soltar.push(() => {
          w.__noPortao = w.__noPortao.filter((n: string) => n !== nome);
          ok();
        });
      });
    w.fetch = async (entrada: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url;
      if (!url.includes("/api/app/ia/perguntar") || init?.method !== "POST") return original(entrada, init);
      w.__pedidos.push(JSON.parse(String(init.body)));
      const roteiro = (w.__roteiros.shift() ?? []) as { e?: unknown; espera?: number; portao?: string; cair?: boolean }[];
      const enc = new TextEncoder();
      const corpo = new ReadableStream<Uint8Array>({
        async start(ctrl) {
          let fechado = false;
          init.signal?.addEventListener("abort", () => {
            fechado = true;
            try {
              ctrl.error(new DOMException("parou", "AbortError"));
            } catch {
              // já fechou
            }
          });
          for (const passo of roteiro) {
            if (passo.espera) await new Promise((ok) => setTimeout(ok, passo.espera));
            if (passo.portao) await esperar(passo.portao);
            if (fechado) return;
            if (passo.cair) {
              fechado = true;
              return ctrl.error(new TypeError("Failed to fetch"));
            }
            if (passo.e) ctrl.enqueue(enc.encode(`${JSON.stringify(passo.e)}\n`));
          }
          ctrl.close();
        },
      });
      return new Response(corpo, { status: 200, headers: { "content-type": "application/x-ndjson" } });
    };
  });
}

/** Põe o roteiro da próxima pergunta na fila. */
export function roteiro(page: Page, passos: Passo[]) {
  return page.evaluate((p) => void (window as any).__roteiros.push(p), passos);
}

export function abrirPortao(page: Page, nome: string) {
  return page.evaluate((n) => (window as any).__abrir(n), nome);
}

/** Espera a resposta chegar ao portão (e a tela desenhar o que veio antes). */
export async function noPortao(page: Page, nome: string) {
  await page.waitForFunction((n) => (window as any).__noPortao.includes(n), nome);
  await page.waitForTimeout(150);
}

/** O que a tela mandou em cada POST /ia/perguntar. */
export function pedidos(page: Page): Promise<Record<string, unknown>[]> {
  return page.evaluate(() => (window as any).__pedidos);
}

/** Texto em pedaços pequenos, como a IA manda. */
export function aosPoucos(texto: string, tamanho = 7, espera = 20): Passo[] {
  const passos: Passo[] = [];
  for (let i = 0; i < texto.length; i += tamanho) passos.push({ e: { t: "texto", v: texto.slice(i, i + tamanho) }, espera });
  return passos;
}

const semana = amostras.conversaSemana!.corpo;
/** O que a IA consultou nas amostras: os prazos e as audiências da semana. */
export const prazosDaSemana = semana.mensagens[1].partes.find((p: { tipo: string }) => p.tipo === "ferramenta");
export const audienciasDaSemana = semana.mensagens[3].partes.find((p: { tipo: string }) => p.tipo === "ferramenta");

/** Uma conversa como o GET /ia/conversas/ID devolve. */
export function conversa(id: string, titulo: string, mensagens: unknown[]) {
  return {
    rodape: "Gerado por IA. Confira nos autos.",
    conversa: { id, titulo, modo: "pergunte", fixada: false, criadaEm: "2026-10-29T12:00:00.000Z", atualizadaEm: "2026-10-29T12:30:00.000Z", processo: null },
    mensagens,
  };
}

export const pessoa = (id: string, texto: string, em = "2026-10-29T12:20:00.000Z") => ({ id, papel: "pessoa", texto, partes: null, em });
export const ia = (id: string, partes: unknown[], em = "2026-10-29T12:20:30.000Z") => ({
  id,
  papel: "ia",
  texto: partes.flatMap((p: any) => (p.tipo === "texto" ? [p.texto] : [])).join("\n\n"),
  partes,
  em,
});

/** Ids de mentira, fáceis de ler nos testes. */
export const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
