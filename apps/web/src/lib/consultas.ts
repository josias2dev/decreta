/**
 * As consultas que mais de um lugar precisa conhecer: as telas e o roteador, que as dispara ao passar o mouse num link
 * (router.tsx). Fica fora das telas para o roteador não carregar o código delas.
 */
import { infiniteQueryOptions, type QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { CaixaDePublicacoes, Cliente, ClienteNaLista, Equipe, Escritorio, Eu, ListaDePrazos, Pagina, PainelDoDia, Prazo, Processo, ProcessoNaLista, Publicacao, Quando, SituacaoPublicacao } from "./tipos";

export const euQuery = { queryKey: ["eu"], queryFn: () => api<Eu>("/eu"), retry: false, staleTime: 60_000 } as const;
export const escritorioQuery = { queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") } as const;
export const equipeQuery = { queryKey: ["equipe"], queryFn: () => api<Equipe>("/equipe") } as const;

/** Com a assinatura parada, o escritório é só para leitura: nada de botão de criar. */
export const podeCriar = (eu: Eu | undefined) => eu?.assinatura?.acesso !== "leitura";

export const hojeQuery = { queryKey: ["hoje"], queryFn: () => api<PainelDoDia>("/hoje"), refetchInterval: 60_000 } as const;

export const prazosQuery = (quando: Quando, responsavel: string | undefined) => ({
  queryKey: ["prazos", quando, responsavel ?? ""],
  queryFn: () => api<ListaDePrazos>(`/prazos?${new URLSearchParams({ quando, ...(responsavel ? { responsavel } : {}) })}`),
});
export const prazoQuery = (id: string) => ({ queryKey: ["prazo", id], queryFn: () => api<Prazo>(`/prazos/${id}`) });

export const caixaQuery = (situacao: SituacaoPublicacao) => ({
  queryKey: ["publicacoes", situacao],
  queryFn: () => api<CaixaDePublicacoes>(`/publicacoes?situacao=${situacao}`),
  placeholderData: (a: CaixaDePublicacoes | undefined) => a,
  refetchInterval: 60_000,
});
export const publicacaoQuery = (id: string) => ({
  queryKey: ["publicacao", id],
  queryFn: () => api<Publicacao>(`/publicacoes/${id}`),
  // Enquanto a IA lê o teor, a tela pergunta de novo; a leitura da sentença chega logo depois (e só se a IA estiver ligada).
  refetchInterval: (q: { state: { data?: Publicacao; dataUpdateCount: number } }) => {
    const d = q.state.data;
    return d && ((!d.sugestao && !d.leituraParada) || (d.decisao && !d.sentenca && q.state.dataUpdateCount < 30)) ? 4000 : false;
  },
});

export type SituacaoDosProcessos = "ativos" | "arquivados" | "todos" | "incompletos";
export const processosQuery = (situacao: SituacaoDosProcessos, busca: string | undefined) =>
  infiniteQueryOptions({
    queryKey: ["processos", situacao, busca ?? ""],
    queryFn: ({ pageParam }) => api<Pagina<ProcessoNaLista> & { incompletos?: number }>(`/processos?${new URLSearchParams({ situacao, pagina: String(pageParam), ...(busca ? { busca } : {}) })}`),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.pagina * ultima.porPagina < ultima.total ? ultima.pagina + 1 : undefined),
  });
export const processoQuery = (id: string) => ({ queryKey: ["processo", id], queryFn: () => api<Processo>(`/processos/${id}`) });

export const clientesQuery = (busca: string | undefined) =>
  infiniteQueryOptions({
    queryKey: ["clientes", busca ?? ""],
    queryFn: ({ pageParam }) => api<Pagina<ClienteNaLista>>(`/clientes?${new URLSearchParams({ pagina: String(pageParam), ...(busca ? { busca } : {}) })}`),
    initialPageParam: 1,
    getNextPageParam: (u) => (u.pagina * u.porPagina < u.total ? u.pagina + 1 : undefined),
  });
export const clienteQuery = (id: string) => ({ queryKey: ["cliente", id], queryFn: () => api<Cliente>(`/clientes/${id}`) });

/** Tudo que mostra prazo muda junto: a lista, o Hoje, os números do menu, a caixa de publicações, a conta e a busca. Termina quando as telas abertas tiverem os dados novos. */
export function atualizarPrazos(qc: QueryClient) {
  return Promise.all(["prazo", "prazos", "hoje", "eu", "publicacoes", "publicacao", "processo", "agenda", "conta", "busca"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
}
