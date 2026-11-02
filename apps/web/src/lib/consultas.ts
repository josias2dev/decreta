import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { Escritorio, Eu } from "./tipos";

export const euQuery = { queryKey: ["eu"], queryFn: () => api<Eu>("/eu"), retry: false, staleTime: 60_000 } as const;
export const escritorioQuery = { queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") } as const;

/** Tudo que mostra prazo muda junto: a lista, o Hoje, os números do menu, a caixa de publicações, a conta e a busca. */
export function atualizarPrazos(qc: QueryClient) {
  for (const k of ["prazo", "prazos", "hoje", "eu", "publicacoes", "publicacao", "processo", "agenda", "conta", "busca"]) void qc.invalidateQueries({ queryKey: [k] });
}
