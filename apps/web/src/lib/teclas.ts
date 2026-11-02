/**
 * Atalhos de uma letra numa tela (a fila de publicações). A tecla só vale quando
 * ninguém está digitando nem com um diálogo aberto, e segurá-la não repete: cada
 * batida faz uma coisa só.
 */
import { useEffect, useRef } from "react";

export function teclaLivre(e: KeyboardEvent): string | null {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return null;
  if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]')) return null;
  if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return null;
  return e.key.toLowerCase();
}

export function useTeclas(acoes: Record<string, () => void>, ligado: boolean) {
  const atuais = useRef(acoes);
  useEffect(() => {
    atuais.current = acoes;
  });
  useEffect(() => {
    if (!ligado) return;
    const aoApertar = (e: KeyboardEvent) => {
      const tecla = teclaLivre(e);
      if (tecla) atuais.current[tecla]?.();
    };
    window.addEventListener("keydown", aoApertar);
    return () => window.removeEventListener("keydown", aoApertar);
  }, [ligado]);
}
