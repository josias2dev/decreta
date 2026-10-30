import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { NovoProcesso } from "@/componentes/novos";
import { AoChegarNoFim, Rolagem } from "@/componentes/rolagem";
import { Avatar, Botao, Cabecalho, CampoDeBusca, Carregando, Chip, Cnj, Responsavel, Selo, Vazio } from "@/componentes/ui";
import { api } from "@/lib/api";
import { useBuscaNaUrl } from "@/lib/busca";
import { useCelular } from "@/lib/celular";
import { diaCurto, diaDoInstante, numero, ondeTramita } from "@/lib/formato";
import type { Pagina as PaginaDaApi, ProcessoNaLista } from "@/lib/tipos";

type Situacao = "ativos" | "arquivados" | "todos";
const SITUACAO: Record<ProcessoNaLista["situacao"], string> = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", encerrado: "Encerrado" };

export function ProcessosPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/processos" });
  const navigate = useNavigate({ from: "/processos" });
  const situacao: Situacao = search.situacao ?? "ativos";
  const [texto, setTexto] = useBuscaNaUrl(search.busca, (busca) => void navigate({ search: (s) => ({ ...s, busca }), replace: true }));
  const [novo, setNovo] = useState(false);
  const lista = useInfiniteQuery({
    queryKey: ["processos", situacao, search.busca ?? ""],
    queryFn: ({ pageParam }) => api<PaginaDaApi<ProcessoNaLista>>(`/processos?${new URLSearchParams({ situacao, pagina: String(pageParam), ...(search.busca ? { busca: search.busca } : {}) })}`),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.pagina * ultima.porPagina < ultima.total ? ultima.pagina + 1 : undefined),
    placeholderData: (a) => a,
  });
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? [];
  const total = lista.data?.pages[0]?.total ?? 0;
  const ir = (s: Situacao) => void navigate({ search: (x) => ({ ...x, situacao: s === "ativos" ? undefined : s }) });

  const filtros = (
    <div className="dc-filtros">
      <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar processo" placeholder="Número, parte, cliente ou vara" />
      <div className="dc-chips">
        <Chip ligado={situacao === "ativos"} onClick={() => ir("ativos")}>
          Ativos
        </Chip>
        <Chip ligado={situacao === "arquivados"} onClick={() => ir("arquivados")}>
          Arquivados
        </Chip>
        <Chip ligado={situacao === "todos"} onClick={() => ir("todos")}>
          Todos
        </Chip>
      </div>
    </div>
  );
  const vazio = <Vazio titulo={search.busca ? "Nada encontrado" : "Nenhum processo aqui"}>{search.busca ? "Confira o número ou tente o nome de uma das partes." : "Cadastre o primeiro processo pelo número CNJ."}</Vazio>;
  const mais = lista.hasNextPage && (
    <Botao pequeno onClick={() => void lista.fetchNextPage()} ocupado={lista.isFetchingNextPage}>
      Carregar mais
    </Botao>
  );
  const fim = <AoChegarNoFim ativo={!!lista.hasNextPage && !lista.isFetchingNextPage} aoChegar={() => void lista.fetchNextPage()} />;
  const sub = lista.data ? `${numero(total)} ${total === 1 ? "processo" : "processos"}${situacao === "ativos" ? " ativos" : situacao === "arquivados" ? " arquivados" : ""}` : " ";

  if (celular) {
    return (
      <TelaCelular
        titulo="Processos"
        sobre={sub}
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo processo" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
        fixo={filtros}
      >
        {!lista.data ? (
          <Carregando />
        ) : itens.length ? (
          <div className="dc-lista">
            {itens.map((p) => (
              <Link key={p.id} to="/processos/$id" params={{ id: p.id }} className="dc-item">
                <span className="dc-item__titulo">{p.titulo}</span>
                {p.proximoPrazo ? <Selo urgencia={p.proximoPrazo.urgencia}>{p.proximoPrazo.quando}</Selo> : <span />}
                <span className="dc-item__meta">{[ondeTramita(p), p.cnj ?? "Extrajudicial"].filter(Boolean).join(" · ")}</span>
                <span className="dc-item__pe">
                  <Avatar pessoa={p.responsavel} /> {p.responsavel?.apelido ?? "Sem responsável"}
                  {p.proximoPrazo && <> · {p.proximoPrazo.tipo}</>}
                  {p.situacao !== "ativo" && <> · {SITUACAO[p.situacao]}</>}
                </span>
              </Link>
            ))}
            {fim}
            {mais}
          </div>
        ) : (
          vazio
        )}
        <NovoProcesso aberto={novo} aoFechar={() => setNovo(false)} />
      </TelaCelular>
    );
  }

  return (
    <Pagina cheia>
      <Cabecalho
        titulo="Processos"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo processo
          </Botao>
        }
      />
      {filtros}
      <section className="dc-painel">
        {!lista.data ? (
          <div className="p-4">
            <Carregando />
          </div>
        ) : itens.length ? (
          <>
            <Rolagem id="processos" className="dc-tabela-caixa">
              <table className="dc-tabela">
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th style={{ width: 200 }}>Número</th>
                    <th style={{ width: 136 }}>Responsável</th>
                    <th style={{ width: 200 }}>Próximo prazo</th>
                    <th style={{ width: 104 }}>Movimentou</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.id} data-link="" onClick={() => void navigate({ to: "/processos/$id", params: { id: p.id } })}>
                      <td>
                        <span className="dc-celula">
                          <Link className="dc-celula__1" to="/processos/$id" params={{ id: p.id }} onClick={(e) => e.stopPropagation()}>
                            {p.titulo}
                          </Link>
                          <span className="dc-celula__2">
                            {[p.classe, ondeTramita(p)].filter(Boolean).join(" · ")}
                            {p.situacao !== "ativo" && ` · ${SITUACAO[p.situacao]}`}
                          </span>
                        </span>
                      </td>
                      <td>
                        <Cnj cnj={p.cnj} />
                      </td>
                      <td>
                        <Responsavel pessoa={p.responsavel} />
                      </td>
                      <td>
                        {p.proximoPrazo ? (
                          <span className="dc-celula">
                            <span>
                              <Selo urgencia={p.proximoPrazo.urgencia}>{p.proximoPrazo.quando}</Selo>
                            </span>
                            <span className="dc-celula__2">{p.proximoPrazo.tipo}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--tinta-3)]">—</span>
                        )}
                      </td>
                      <td className="dc-num text-[var(--tinta-2)]">{p.ultimaMovimentacaoEm ? diaCurto(diaDoInstante(p.ultimaMovimentacaoEm)) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {fim}
            </Rolagem>
            <div className="dc-rodape-lista">
              <span>
                Mostrando {numero(itens.length)} de {numero(total)}
              </span>
              {mais}
            </div>
          </>
        ) : (
          vazio
        )}
      </section>
      <NovoProcesso aberto={novo} aoFechar={() => setNovo(false)} />
    </Pagina>
  );
}
