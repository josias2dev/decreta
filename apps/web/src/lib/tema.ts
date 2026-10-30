/**
 * Claro, escuro ou o do aparelho. A escolha vale só neste aparelho: fica no
 * navegador, e sem ela (ou com o navegador sem armazenamento) segue o sistema.
 */
export type Tema = "auto" | "claro" | "escuro";

const CHAVE = "decreta:tema";
const sistema = window.matchMedia("(prefers-color-scheme: dark)");
let naAba: Tema | null = null;

export function temaEscolhido(): Tema {
  if (naAba) return naAba;
  try {
    const t = localStorage.getItem(CHAVE);
    return t === "claro" || t === "escuro" ? t : "auto";
  } catch {
    return "auto";
  }
}

function aplicar() {
  const t = temaEscolhido();
  document.documentElement.setAttribute("data-theme", t === "auto" ? (sistema.matches ? "escuro" : "claro") : t);
}

export function escolherTema(t: Tema) {
  naAba = t;
  try {
    if (t === "auto") localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, t);
  } catch {
    // Sem armazenamento, vale só até fechar a aba.
  }
  aplicar();
}

/** Aplica o tema e acompanha o sistema quando a escolha é automática. */
export function iniciarTema() {
  aplicar();
  sistema.addEventListener("change", aplicar);
}
