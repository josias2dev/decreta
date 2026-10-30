/**
 * O fundo vivo do hero da landing e da tela de entrar: grade, brilhos que se
 * movem devagar, quadrados que acendem e feixes de luz pelas linhas da grade.
 * Estilos em estilos/landing.css (lp-fundo); a landing tem a mesma marcação no HTML dela.
 */
import { useEffect } from "react";

export function FundoVivo() {
  return (
    <div className="lp-fundo" aria-hidden>
      <div className="lp-fundo__grade">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <span key={n} className={`lp-fundo__celula lp-fundo__celula--${n}`} />
        ))}
      </div>
      <div className="lp-fundo__orbe lp-fundo__orbe--1" />
      <div className="lp-fundo__orbe lp-fundo__orbe--2" />
      <div className="lp-fundo__orbe lp-fundo__orbe--3" />
      <span className="lp-fundo__feixe lp-fundo__feixe--h lp-fundo__feixe--1" />
      <span className="lp-fundo__feixe lp-fundo__feixe--h lp-fundo__feixe--2" />
      <span className="lp-fundo__feixe lp-fundo__feixe--v lp-fundo__feixe--3" />
    </div>
  );
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
