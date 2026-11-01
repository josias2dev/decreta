/**
 * A landing do Decreta (decreta.site). A marcação vem pronta do canvas do Claude Design
 * (landing/pagina.html, estilos em estilos/landing.css e landing-secoes.css); aqui entram
 * o fundo em ASCII, os links para as telas, o contato, as imagens da tela do produto e o atalho
 * para quem já tem sessão.
 */
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useRef, type MouseEvent } from "react";
import { ligarFundoAscii, useCorDaBarra } from "@/componentes/fundo-ascii";
import { euQuery } from "@/lib/consultas";
import pagina from "@/landing/pagina.html?raw";
import vitrineCelular from "@/landing/vitrine-celular.webp";
import vitrineComputador from "@/landing/vitrine-computador.webp";

/** Para onde vão "Falar com a equipe", "Fale com a gente" e o contato do rodapé: o WhatsApp da equipe, com a mensagem pronta. "Criar conta" vai para /cadastro. */
const CONTATO = `https://wa.me/5546999074372?text=${encodeURIComponent("Olá! Quero conhecer o Decreta para o meu escritório.")}`;

const html = pagina
  .replaceAll("__CONTATO__", CONTATO)
  .replace("__VITRINE_COMPUTADOR__", vitrineComputador)
  .replace("__VITRINE_CELULAR__", vitrineCelular);

export function InicioPage() {
  const router = useRouter();
  const raiz = useRef<HTMLDivElement>(null);
  const eu = useQuery({ ...euQuery, retry: false });
  useCorDaBarra("#0b0b0f");

  // Já tem sessão: vai direto para o dia.
  useEffect(() => {
    if (eu.data) router.history.replace("/hoje");
  }, [eu.data, router]);

  // O fundo em ASCII, nos canvas que vêm no HTML da landing: o do topo e o da chamada final.
  useEffect(() => {
    const r = raiz.current;
    if (!r) return;
    const desligar = [...r.querySelectorAll<HTMLCanvasElement>("canvas.lp-ascii")].map((tela) =>
      tela.closest(".lp-hero")
        ? ligarFundoAscii(tela, { miolo: r.querySelector(".lp-hero__texto") })
        : ligarFundoAscii(tela, { miolo: tela.parentElement?.querySelector(".lp-fim__centro") }),
    );
    return () => desligar.forEach((f) => f());
  }, []);

  useEffect(() => {
    document.title = "Decreta · Prazos, publicações e peças com IA para escritórios de advocacia";
    return () => {
      document.title = "Decreta";
    };
  }, []);

  const clicar = (e: MouseEvent<HTMLDivElement>) => {
    // Links para as telas do app (/entrar) navegam sem recarregar a página.
    const link = (e.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='/']");
    if (link && !e.metaKey && !e.ctrlKey && !e.shiftKey && e.button === 0) {
      e.preventDefault();
      void router.navigate({ to: link.getAttribute("href")! });
    }
  };

  return <div ref={raiz} onClick={clicar} dangerouslySetInnerHTML={{ __html: html }} />;
}

