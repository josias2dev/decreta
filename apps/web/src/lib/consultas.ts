import { api } from "./api";
import type { Escritorio, Eu } from "./tipos";

export const euQuery = { queryKey: ["eu"], queryFn: () => api<Eu>("/eu"), retry: false, staleTime: 60_000 } as const;
export const escritorioQuery = { queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") } as const;
