/**
 * A conta aberta do hero: lê os campos, conta com o motor do `@decreta/core`, no
 * navegador, e anima o calendário: os dias contados, os feriados pulados, com o
 * nome de cada um, e o vencimento. Com "reduzir movimento", vai direto ao fim.
 */
import { abrirConta, type PedidoDaContaAberta } from "@decreta/core";
import { desenharConta, SEMANAS_NA_JANELA } from "./conta-html";

/** Quanto dura a contagem inteira, e os limites de cada passo: prazo curto não arrasta, prazo longo não vira borrão. */
const DURACAO_MS = 1900;
const PASSO_MIN_MS = 14;
const PASSO_MAX_MS = 115;
/** A pausa no feriado pulado: é o momento que a conta quer mostrar. */
const PAUSA_NO_FERIADO_MS = 260;
const ESPERA_AO_ABRIR_MS = 650;
const DIAS_MAX = 365;

function lerPedido(form: HTMLFormElement): PedidoDaContaAberta | null {
  const dados = new FormData(form);
  const publicacao = String(dados.get("publicacao") ?? "");
  const dias = Number(dados.get("dias"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(publicacao) || publicacao < "2000-01-01" || publicacao > "2099-12-31") return null;
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAX) return null;
  return { publicacao, dias, contagem: dados.get("contagem") === "corridos" ? "corridos" : "uteis", tribunal: String(dados.get("tribunal") ?? "TJSC") };
}

export function ligarConta(raiz: HTMLElement): void {
  const form = raiz.querySelector("form")!;
  const corpo = raiz.querySelector<HTMLElement>("[data-conta]")!;
  const calmo = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let relogio = 0;

  const moverJanela = (semana: number) => {
    const grade = corpo.querySelector<HTMLElement>(".lp-cal__grade");
    if (!grade) return;
    const total = Number(grade.dataset.semanas);
    if (total <= SEMANAS_NA_JANELA) return;
    const topo = Math.max(0, Math.min(semana - SEMANAS_NA_JANELA + 1, total - SEMANAS_NA_JANELA));
    grade.style.setProperty("--topo", String(topo));
  };

  const fimDaConta = () => {
    window.clearTimeout(relogio);
    raiz.classList.remove("is-contando");
    for (const el of corpo.querySelectorAll("[data-passo]")) el.classList.add("is-on");
    moverJanela(Number.MAX_SAFE_INTEGER);
  };

  const contar = () => {
    window.clearTimeout(relogio);
    if (calmo) return fimDaConta();
    const marcados = [...corpo.querySelectorAll<HTMLElement>("[data-passo]")];
    const passos = new Map<number, HTMLElement[]>();
    for (const el of marcados) {
      el.classList.remove("is-on");
      const n = Number(el.dataset.passo);
      passos.set(n, [...(passos.get(n) ?? []), el]);
    }
    const contador = corpo.querySelector<HTMLElement>("[data-contador]");
    if (contador) contador.textContent = "0";
    raiz.classList.add("is-contando");
    moverJanela(0);
    const ordem = [...passos.keys()].sort((a, b) => a - b);
    const ritmo = Math.min(PASSO_MAX_MS, Math.max(PASSO_MIN_MS, DURACAO_MS / ordem.length));
    let i = 0;
    const andar = () => {
      if (i >= ordem.length) return fimDaConta();
      let pausa = ritmo;
      for (const el of passos.get(ordem[i]!)!) {
        el.classList.add("is-on");
        if (el.dataset.n && contador) contador.textContent = el.dataset.n;
        if (el.dataset.semana) moverJanela(Number(el.dataset.semana));
        if (el.classList.contains("lp-dia--feriado")) pausa += PAUSA_NO_FERIADO_MS;
      }
      i++;
      relogio = window.setTimeout(andar, pausa);
    };
    andar();
  };

  const atualizar = () => {
    const pedido = lerPedido(form);
    raiz.classList.toggle("is-invalida", !pedido);
    if (!pedido) return;
    corpo.innerHTML = desenharConta(abrirConta(pedido));
    contar();
    // No celular, os campos ficam abaixo do calendário: quem mudou um dado precisa ver a conta andando.
    const cal = corpo.querySelector(".lp-cal");
    if (cal && cal.getBoundingClientRect().top < 0) cal.scrollIntoView({ block: "start", behavior: calmo ? "auto" : "smooth" });
  };

  let digitando = 0;
  form.addEventListener("input", () => {
    window.clearTimeout(digitando);
    digitando = window.setTimeout(atualizar, 220);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    atualizar();
  });
  corpo.addEventListener("click", (e) => {
    if ((e.target as Element).closest("[data-rever]")) contar();
  });

  // Abre contando, se o hero está à vista; quem chega por um link no meio da página não precisa da animação.
  if (!calmo && window.scrollY < 200) relogio = window.setTimeout(contar, ESPERA_AO_ABRIR_MS);
}
