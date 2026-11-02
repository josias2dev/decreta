/** O fundo em ASCII (lib/fundo-ascii.ts) para as telas em React: entrar e as páginas abertas. */
import { useEffect, useRef } from "react";
import { ligarFundoAscii } from "@/lib/fundo-ascii";

/** O canvas do fundo, para telas em React (entrar). `miolo` é o seletor do bloco a deixar limpo, dentro do mesmo pai. */
export function FundoAscii({ miolo }: { miolo: string }) {
  const tela = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = tela.current;
    if (!c) return;
    return ligarFundoAscii(c, { miolo: c.parentElement?.querySelector(miolo) });
  }, [miolo]);
  return <canvas ref={tela} className="lp-ascii" aria-hidden />;
}

/** A barra do navegador no celular fica preta enquanto a tela escura está aberta. */
export function useCorDaBarra(cor: string) {
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) return;
    const antes = meta.content;
    meta.content = cor;
    return () => {
      meta.content = antes;
    };
  }, [cor]);
}
