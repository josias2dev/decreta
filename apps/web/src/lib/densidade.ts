/**
 * A densidade da tela: compacto (o padrão) ou confortável. Fica guardada por
 * pessoa neste navegador e vale por um atributo na raiz, que troca os tokens
 * (estilos/tokens.css). Sem nada guardado, ou com o navegador bloqueando, é compacto.
 */
import { useSyncExternalStore } from "react";

export type Densidade = "compacto" | "confortavel";

export const DENSIDADES: { id: Densidade; rotulo: string }[] = [
  { id: "compacto", rotulo: "Compacto" },
  { id: "confortavel", rotulo: "Confortável" },
];

/** A última usada aqui, para a tela não pular ao recarregar, antes de saber quem está logado. */
const ULTIMA = "decreta:densidade";
const daPessoa = (id: string) => `decreta:densidade:${id}`;

/** Com o navegador sem armazenamento, a escolha vale até fechar a página. */
const nestaVisita = new Map<string, Densidade>();
const ouvintes = new Set<() => void>();

function ler(chave: string): Densidade | null {
  try {
    const v = localStorage.getItem(chave);
    return v === "compacto" || v === "confortavel" ? v : null;
  } catch {
    return null;
  }
}

function guardar(chave: string, valor: Densidade) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // Navegador sem armazenamento: vale só nesta visita.
  }
}

export function aplicarDensidade(densidade: Densidade) {
  document.documentElement.dataset.densidade = densidade;
}

/** Antes do primeiro desenho. */
export function aplicarUltimaDensidade() {
  aplicarDensidade(ler(ULTIMA) ?? "compacto");
}

export function densidadeDaPessoa(id: string): Densidade {
  return nestaVisita.get(id) ?? ler(daPessoa(id)) ?? "compacto";
}

export function escolherDensidade(id: string, densidade: Densidade) {
  nestaVisita.set(id, densidade);
  guardar(daPessoa(id), densidade);
  guardar(ULTIMA, densidade);
  aplicarDensidade(densidade);
  for (const avisar of ouvintes) avisar();
}

/** A densidade da pessoa e como trocar: o menu da conta e a tela /conta andam juntos. */
export function useDensidade(id: string): [Densidade, (densidade: Densidade) => void] {
  const densidade = useSyncExternalStore(
    (avisar) => {
      ouvintes.add(avisar);
      return () => ouvintes.delete(avisar);
    },
    () => densidadeDaPessoa(id),
  );
  return [densidade, (nova) => escolherDensidade(id, nova)];
}
