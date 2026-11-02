/**
 * Variações de uma tela para escolher: um seletor pequeno, só em desenvolvimento
 * e na prévia (bun run web:previa). A escolha fica no navegador, e `daUrl` deixa
 * mandar o link direto. Em produção o seletor não aparece e vale sempre a primeira.
 */
import { useState } from "react";
import { Segmentos } from "@/componentes/ui";

export const COM_VARIANTES = import.meta.env.DEV || import.meta.env.MODE === "previa";

function guardar(chave: string, valor: string) {
  try {
    localStorage.setItem(`variante:${chave}`, valor);
  } catch {
    // sem armazenamento: vale só nesta visita
  }
}

export function useVariante<T extends string>(chave: string, opcoes: readonly { id: T }[], daUrl?: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    if (!COM_VARIANTES) return opcoes[0]!.id;
    if (daUrl) {
      guardar(chave, daUrl);
      return daUrl;
    }
    try {
      const salvo = localStorage.getItem(`variante:${chave}`);
      return opcoes.find((o) => o.id === salvo)?.id ?? opcoes[0]!.id;
    } catch {
      return opcoes[0]!.id;
    }
  });
  const mudar = (novo: T) => {
    setV(novo);
    guardar(chave, novo);
  };
  return [COM_VARIANTES && daUrl ? daUrl : v, mudar];
}

export function SeletorDeVariante<T extends string>({ opcoes, valor, aoMudar }: { opcoes: { id: T; rotulo: string }[]; valor: T; aoMudar: (v: T) => void }) {
  if (!COM_VARIANTES) return null;
  return (
    <div className="dc-variantes">
      <span>Variação</span>
      <Segmentos opcoes={opcoes} valor={valor} aoMudar={aoMudar} rotulo="Variação da tela" />
    </div>
  );
}
