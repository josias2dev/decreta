/**
 * A landing do Decreta (decreta.site). A marcação vem pronta do canvas do Claude Design
 * (landing/pagina.html, estilos em estilos/landing.css); aqui entram as abas da IA,
 * os links para as telas, o contato e o atalho para quem já tem sessão.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type MouseEvent } from "react";
import { ligarFundoAscii, useCorDaBarra } from "@/componentes/fundo-ascii";
import { euQuery } from "@/lib/consultas";
import pagina from "@/landing/pagina.html?raw";

/** Para onde vão "Pedir acesso", "Falar com a equipe" e o contato do rodapé: o WhatsApp da equipe, com a mensagem pronta. */
const CONTATO = `https://wa.me/5546999074372?text=${encodeURIComponent("Olá! Quero conhecer o Decreta para o meu escritório.")}`;

const html = pagina.replaceAll("__CONTATO__", CONTATO);

export function InicioPage() {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const eu = useQuery({ ...euQuery, retry: false });
  useCorDaBarra("#0b0b0f");

  // Já tem sessão: vai direto para o dia.
  useEffect(() => {
    if (eu.data) router.history.replace("/hoje");
  }, [eu.data, router]);

  // O fundo em ASCII do topo, no canvas que vem no HTML da landing
  useEffect(() => {
    const tela = raiz.current?.querySelector<HTMLCanvasElement>("canvas.lp-ascii");
    if (!tela) return;
    return ligarFundoAscii(tela, { miolo: raiz.current?.querySelector(".lp-hero__texto") });
  }, []);

  useEffect(() => {
    document.title = "Decreta · Prazos, publicações e peças com IA para escritórios de advocacia";
    return () => {
      document.title = "Decreta";
    };
  }, []);

  const clicar = (e: MouseEvent<HTMLDivElement>) => {
    const alvo = e.target as HTMLElement;
    const aba = alvo.closest<HTMLElement>("[data-aba]");
    if (aba && raiz.current) {
      abrirAba(raiz.current, aba.dataset.aba!);
      return;
    }
    // Links para as telas do app (/entrar) navegam sem recarregar a página.
    const link = alvo.closest<HTMLAnchorElement>("a[href^='/']");
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      void router.navigate({ to: link.getAttribute("href")! });
    }
  };

  return <div ref={raiz} onClick={clicar} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Briefing, Resumo, Pergunte e Peça: uma aba acesa e o painel dela à mostra. */
function abrirAba(raiz: HTMLElement, id: string) {
  for (const botao of raiz.querySelectorAll<HTMLElement>(".lp-aba[data-aba]")) {
    const ligada = botao.dataset.aba === id;
    botao.classList.toggle("is-on", ligada);
    botao.setAttribute("aria-selected", String(ligada));
  }
  for (const painel of raiz.querySelectorAll<HTMLElement>("[data-painel]")) painel.hidden = painel.dataset.painel !== id;
}
