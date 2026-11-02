import { tribunalDoCnj } from "@decreta/core";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { NovoProcesso } from "@/componentes/novos";
import { AoChegarNoFim, Rolagem } from "@/componentes/rolagem";
import { Avatar, Botao, Cabecalho, CampoDeBusca, Carregando, Chip, Responsavel, Selo, Vazio } from "@/componentes/ui";
import { api, SO_LEITURA } from "@/lib/api";
import { useBuscaNaUrl } from "@/lib/busca";
import { useCelular } from "@/lib/celular";
import { euQuery, podeCriar } from "@/lib/consultas";
import { diaCompleto, diaDoInstante, haQuanto, numero, ondeTramita } from "@/lib/formato";
import type { Pagina as PaginaDaApi, ProcessoNaLista } from "@/lib/tipos";

type Situacao = "ativos" | "arquivados" | "todos";
const SITUACAO: Record<ProcessoNaLista["situacao"], string> = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", encerrado: "Encerrado" };

/** O tribunal (TJSC, TRT12, TRF4), o número e onde tramita, numa linha: TJSC · 5004321-25.2026.8.24.0038 · 2ª Vara Cível de Joinville. */
function Onde({ p }: { p: ProcessoNaLista }) {
  const tribunal = (p.cnj && tribunalDoCnj(p.cnj)) || (p.tipo === "extrajudicial" ? "Extrajudicial" : null);
  const resto = [p.cnj ? ondeTramita(p) : p.classe, p.situacao !== "ativo" && SITUACAO[p.situacao]].filter(Boolean).join(" · ");
  return (
    <span className="dc-onde">
      {tribunal && <span className="dc-onde__tribunal">{tribunal}</span>}
      {p.cnj && <span className="dc-num dc-onde__cnj">{p.cnj}</span>}
      {resto && <span className="dc-onde__resto">{resto}</span>}
    </span>
  );
}

export function ProcessosPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/processos" });
  const navigate = useNavigate({ from: "/processos" });
  const eu = useQuery(euQuery);
  const pode = podeCriar(eu.data);
  const situacao: Situacao = search.situacao ?? "ativos";
  const [texto, setTexto] = useBuscaNaUrl(search.busca, (busca) => void navigate({ search: (s) => ({ ...s, busca }), replace: true }));
  const [novo, setNovo] = useState(!!search.novo);
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
  // Lista sem nada nos ativos: pode ser o escritório novo ou só que todos foram arquivados. Só nesse caso pergunta.
  const semAtivos = !!lista.data && !total && situacao === "ativos" && !search.busca;
  const todos = useQuery({ queryKey: ["processos", "ha-algum"], queryFn: () => api<PaginaDaApi<ProcessoNaLista>>("/processos?situacao=todos"), enabled: semAtivos });
  const vazio = search.busca ? (
    <Vazio
      titulo={`Nenhum processo com “${search.busca}”`}
      acao={
        <Botao pequeno onClick={() => setTexto("")}>
          Limpar a busca
        </Botao>
      }
    >
      Confira o número ou tente o nome de uma das partes.{situacao === "todos" ? "" : ` A busca olhou só os ${situacao}.`}
    </Vazio>
  ) : situacao === "arquivados" ? (
    <Vazio
      titulo="Nenhum processo arquivado"
      acao={
        <Botao pequeno onClick={() => ir("ativos")}>
          Ver os ativos
        </Botao>
      }
    >
      Processo arquivado ou encerrado sai da lista de ativos e fica guardado aqui, com os documentos e o histórico.
    </Vazio>
  ) : semAtivos && todos.data?.total ? (
    <Vazio
      titulo="Nenhum processo ativo"
      acao={
        <Botao pequeno onClick={() => ir("todos")}>
          Ver todos
        </Botao>
      }
    >
      Os processos do escritório estão arquivados ou encerrados.
    </Vazio>
  ) : (
    <Vazio
      titulo="Nenhum processo ainda"
      acao={
        pode && (
          <Botao variante="primaria" pequeno onClick={() => setNovo(true)}>
            <Plus /> Cadastrar o primeiro processo
          </Botao>
        )
      }
    >
      Cada processo reúne prazos, publicações, documentos e peças. Digite o número CNJ e o Decreta busca as partes, a classe e os andamentos.
      {!pode && <span>{SO_LEITURA}</span>}
    </Vazio>
  );
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
          pode && (
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo processo" onClick={() => setNovo(true)}>
              <Plus />
            </button>
          )
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
                <span className="dc-item__meta">
                  <Onde p={p} />
                </span>
                <span className="dc-item__pe">
                  <Avatar pessoa={p.responsavel} />
                  <span className="min-w-0 truncate">
                    {p.responsavel?.apelido ?? "Sem responsável"}
                    {p.proximoPrazo && <> · {p.proximoPrazo.tipo}</>}
                  </span>
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
          pode && (
            <Botao variante="primaria" onClick={() => setNovo(true)}>
              <Plus /> Novo processo
            </Botao>
          )
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
              <table className="dc-tabela dc-tabela--fixa dc-processos">
                <thead>
                  <tr>
                    <th>Processo</th>
                    <th className="dc-col--pessoa">Responsável</th>
                    <th className="dc-col--prazo">Próximo prazo</th>
                    <th className="dc-col--mov">Movimentou</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((p) => (
                    <tr key={p.id} data-link="" onClick={() => void navigate({ to: "/processos/$id", params: { id: p.id } })}>
                      <td>
                        <span className="dc-celula">
                          <span className="dc-celula__1 dc-celula__1--uma">
                            <Link to="/processos/$id" params={{ id: p.id }} onClick={(e) => e.stopPropagation()}>
                              {p.titulo}
                            </Link>
                          </span>
                          <span className="dc-celula__2">
                            <Onde p={p} />
                          </span>
                        </span>
                      </td>
                      <td>
                        <Responsavel pessoa={p.responsavel} />
                      </td>
                      <td>
                        {p.proximoPrazo ? (
                          <span className="dc-prazo-linha" title={`${p.proximoPrazo.tipo} · ${diaCompleto(p.proximoPrazo.fim)}`}>
                            <Selo urgencia={p.proximoPrazo.urgencia}>{p.proximoPrazo.quando}</Selo>
                            <span className="truncate">{p.proximoPrazo.tipo}</span>
                          </span>
                        ) : (
                          <span className="text-[var(--tinta-3)]">Sem prazo aberto</span>
                        )}
                      </td>
                      <td className="text-[var(--tinta-2)]" title={p.ultimaMovimentacaoEm ? diaCompleto(diaDoInstante(p.ultimaMovimentacaoEm)) : undefined}>
                        {p.ultimaMovimentacaoEm ? haQuanto(p.ultimaMovimentacaoEm) : "—"}
                      </td>
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
