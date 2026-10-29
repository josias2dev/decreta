import { useEffect, useRef, useState } from "react";

/**
 * Texto da busca que vai para a URL depois de a pessoa parar de digitar
 * (o voltar do navegador volta para a mesma busca).
 */
export function useBuscaNaUrl(daUrl: string | undefined, gravar: (v: string | undefined) => void, espera = 300) {
  const [texto, setTexto] = useState(daUrl ?? "");
  const gravarAgora = useRef(gravar);
  gravarAgora.current = gravar;
  useEffect(() => {
    const t = texto.trim();
    if (t === (daUrl ?? "")) return;
    const id = setTimeout(() => gravarAgora.current(t || undefined), espera);
    return () => clearTimeout(id);
  }, [texto, daUrl, espera]);
  return [texto, setTexto] as const;
}
