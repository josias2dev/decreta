import { useRouter, type NavigateOptions } from "@tanstack/react-router";
import { useRef } from "react";

/** A mesma espera do <Link> do TanStack: passar rápido por várias linhas não dispara uma busca por linha. */
const ESPERA_DO_MOUSE = 50;

/**
 * A pré-carga da linha de tabela, que abre ao clicar em qualquer parte dela e não é um <Link>. Os links de verdade
 * já fazem isso sozinhos (`defaultPreload`, em router.tsx), inclusive ao receber o foco.
 */
export function usePreCarga() {
  const router = useRouter();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  return (destino: NavigateOptions) => ({
    onMouseEnter: () => {
      clearTimeout(espera.current);
      espera.current = setTimeout(() => void router.preloadRoute(destino).catch(() => {}), ESPERA_DO_MOUSE);
    },
    onMouseLeave: () => clearTimeout(espera.current),
  });
}
