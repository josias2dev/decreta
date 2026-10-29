import { useSyncExternalStore } from "react";

/** Abaixo de 768 px a tela vira a do celular: navegação embaixo, listas em cartões, alvos de 44 px. */
const CONSULTA = "(max-width: 767px)";

function assinar(aoMudar: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

export function useCelular(): boolean {
  return useSyncExternalStore(assinar, () => window.matchMedia(CONSULTA).matches, () => false);
}
