/**
 * Uma preferência de tela guardada por pessoa neste navegador (densidade, tema).
 * Guarda também a última usada aqui, que vale antes de saber quem está logado.
 * Sem nada guardado, ou com o navegador bloqueando o armazenamento, vale o padrão,
 * e a escolha dura até fechar a página.
 */
import { useSyncExternalStore } from "react";

export function preferenciaDaPessoa<T extends string>({ chave, padrao, valores, aplicar }: { chave: string; padrao: T; valores: readonly T[]; aplicar: (valor: T) => void }) {
  const ULTIMA = `decreta:${chave}`;
  const daPessoa = (id: string) => `${ULTIMA}:${id}`;
  const nestaVisita = new Map<string, T>();
  const ouvintes = new Set<() => void>();

  const ler = (k: string): T | null => {
    try {
      const v = localStorage.getItem(k);
      return valores.includes(v as T) ? (v as T) : null;
    } catch {
      return null;
    }
  };
  const guardar = (k: string, valor: T) => {
    try {
      localStorage.setItem(k, valor);
    } catch {
      // Navegador sem armazenamento: vale só nesta visita.
    }
  };
  const valorDaPessoa = (id: string): T => nestaVisita.get(id) ?? ler(daPessoa(id)) ?? padrao;
  const escolher = (id: string, valor: T) => {
    nestaVisita.set(id, valor);
    guardar(daPessoa(id), valor);
    guardar(ULTIMA, valor);
    aplicar(valor);
    for (const avisar of ouvintes) avisar();
  };

  return {
    ultima: (): T => ler(ULTIMA) ?? padrao,
    valorDaPessoa,
    /** O valor da pessoa e como trocar; quem usa o mesmo valor em outra tela anda junto. */
    useValor(id: string): [T, (valor: T) => void] {
      const valor = useSyncExternalStore(
        (avisar) => {
          ouvintes.add(avisar);
          return () => ouvintes.delete(avisar);
        },
        () => valorDaPessoa(id),
      );
      return [valor, (novo) => escolher(id, novo)];
    },
  };
}
