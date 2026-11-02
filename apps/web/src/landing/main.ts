/**
 * O JavaScript da landing estática, e só ele: quem tem sessão vai para o dia, a
 * visita e os cliques contam, o fundo em ASCII, a conta aberta, o próximo feriado
 * e a tela que se transforma ao rolar. A página funciona sem nada disto.
 */
import "../estilos/tokens.css";
import "../estilos/landing.css";
import "../estilos/landing-secoes.css";
import { avisoDoDiaSemExpediente, calendarioPara, ehEventoDoSite, hojeEm, proximoFeriadoEmDiaDeSemana } from "@decreta/core";
import { API_URL } from "@/lib/api";
import { registrarEventoDoSite } from "@/lib/eventos";
import { ligarFundoAscii } from "@/lib/fundo-ascii";
import { ligarConta } from "./conta";
import { dadosDoFeriado } from "./feriado";
import { ligarFluxo } from "./fluxo";

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

function atualizarFeriado() {
  const f = proximoFeriadoEmDiaDeSemana(hojeEm());
  const aviso = avisoDoDiaSemExpediente(f.dia, calendarioPara({ tribunal: "nacional" }));
  const dados = dadosDoFeriado(f, aviso?.aviso ?? "");
  for (const el of document.querySelectorAll<HTMLElement>("[data-feriado]")) el.textContent = dados[el.dataset.feriado as keyof typeof dados];
}

const fundo = document.querySelector<HTMLCanvasElement>(".lp-hero .lp-ascii");
if (fundo) ligarFundoAscii(fundo, { miolo: document.querySelector(".lp-hero__texto") });
const conta = document.getElementById("conta");
if (conta) ligarConta(conta);
const fluxo = document.getElementById("fluxo");
if (fluxo) ligarFluxo(fluxo);
atualizarFeriado();
void verSessao();
