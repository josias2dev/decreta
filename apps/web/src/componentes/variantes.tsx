/**
 * Variações de uma tela para escolher na prévia (bun run web:previa): um
 * seletor flutuante embaixo da folha. No build normal o seletor não aparece
 * e vale sempre a primeira opção.
 */
import { useState } from "react";
import { Segmentos } from "@/componentes/ui";

export const NA_PREVIA = import.meta.env.MODE === "previa";

export function useVariante<T extends string>(chave: string, opcoes: readonly { id: T }[]): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    if (!NA_PREVIA) return opcoes[0]!.id;
    try {
      const salvo = localStorage.getItem(`variante:${chave}`);
      return opcoes.find((o) => o.id === salvo)?.id ?? opcoes[0]!.id;
    } catch {
      return opcoes[0]!.id;
    }
  });
  const mudar = (novo: T) => {
    setV(novo);
    try {
      localStorage.setItem(`variante:${chave}`, novo);
    } catch {
      // sem armazenamento: vale só nesta visita
    }
  };
  return [v, mudar];
}

export function SeletorDeVariante<T extends string>({ opcoes, valor, aoMudar }: { opcoes: { id: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void }) {
  if (!NA_PREVIA) return null;
  return (
    <div className="dc-variantes">
      <span>Variação</span>
      <Segmentos opcoes={opcoes} valor={valor} aoMudar={aoMudar} rotulo="Variação da tela" />
    </div>
  );
}
