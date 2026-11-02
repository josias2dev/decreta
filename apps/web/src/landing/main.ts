/**
 * O JavaScript da landing estática, e só ele: quem tem sessão vai para o dia, a
 * visita e os cliques contam, e o fundo em ASCII. A página funciona sem nada disto.
 */
import "../estilos/tokens.css";
import "../estilos/componentes.css";
import "../estilos/landing.css";
import "../estilos/landing-secoes.css";
import { ehEventoDoSite } from "@decreta/core";
import { API_URL } from "@/lib/api";
import { registrarEventoDoSite } from "@/lib/eventos";
import { ligarFundoAscii } from "@/lib/fundo-ascii";

/** Sessão aberta: direto para o dia. Sem sessão, conta a visita (quem volta logado ao site não é visita nova). */
async function verSessao() {
  const eu = await fetch(`${API_URL}/api/app/eu`, { credentials: "include" }).catch(() => null);
  if (eu?.ok) location.replace("/hoje");
  else registrarEventoDoSite("visita");
}

document.addEventListener("click", (e) => {
  const marca = (e.target as Element).closest<HTMLElement>("[data-evento]")?.dataset.evento;
  if (ehEventoDoSite(marca)) registrarEventoDoSite(marca);
});

// O fundo do topo e o da chamada final.
for (const tela of document.querySelectorAll<HTMLCanvasElement>("canvas.lp-ascii")) {
  ligarFundoAscii(tela, { miolo: tela.parentElement?.querySelector(".lp-hero__texto, .lp-fim__centro") });
}
void verSessao();
