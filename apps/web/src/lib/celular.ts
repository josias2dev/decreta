import { useSyncExternalStore } from "react";

/** Abaixo de 768 px a tela vira a do celular: navegação embaixo, listas em cartões, alvos de 44 px. */
export const CONSULTA_DO_CELULAR = "(max-width: 767px)";

function assinar(aoMudar: () => void) {
  const mq = window.matchMedia(CONSULTA_DO_CELULAR);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

export function useCelular(): boolean {
  return useSyncExternalStore(assinar, () => window.matchMedia(CONSULTA_DO_CELULAR).matches, () => false);
}
