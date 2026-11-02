import { api } from "./api";
import type { Equipe, Escritorio, Eu } from "./tipos";

export const euQuery = { queryKey: ["eu"], queryFn: () => api<Eu>("/eu"), retry: false, staleTime: 60_000 } as const;
export const escritorioQuery = { queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") } as const;
export const equipeQuery = { queryKey: ["equipe"], queryFn: () => api<Equipe>("/equipe") } as const;

/** Com a assinatura parada, o escritório é só para leitura: nada de botão de criar. */
export const podeCriar = (eu: Eu | undefined) => eu?.assinatura?.acesso !== "leitura";
