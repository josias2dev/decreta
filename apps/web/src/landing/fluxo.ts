/**
 * Da publicação à peça: o passo que está no meio da tela diz qual estado a tela
 * fixa mostra. A troca em si é CSS (landing-secoes.css), e sem JavaScript a tela
 * fica no primeiro passo, com todos os textos à vista.
 */
export function ligarFluxo(raiz: HTMLElement): void {
  const palco = raiz.querySelector<HTMLElement>(".lp-palco");
  const passos = [...raiz.querySelectorAll<HTMLElement>(".lp-passo")];
  if (!palco || !passos.length) return;
  raiz.classList.add("is-vivo");
  const marcar = (passo: HTMLElement) => {
    palco.dataset.passo = passo.dataset.passo;
    for (const p of passos) p.classList.toggle("is-on", p === passo);
  };
  marcar(passos[0]!);
  const io = new IntersectionObserver(
    (entradas) => {
      for (const e of entradas) if (e.isIntersecting) marcar(e.target as HTMLElement);
    },
    // Uma faixa fina na altura da tela fixa: entra um passo de cada vez.
    { rootMargin: "-48% 0px -48% 0px" },
  );
  for (const p of passos) io.observe(p);
}
