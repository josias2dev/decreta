import { api } from "./api";
import type { Eu } from "./tipos";

export const euQuery = { queryKey: ["eu"], queryFn: () => api<Eu>("/eu"), retry: false, staleTime: 60_000 } as const;
