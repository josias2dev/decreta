/** Ficha do processo: resumo da IA, movimentações, prazos, documentos e o chat dos autos. */
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { ArrowRight, Download, ExternalLink, FileText, MessageSquare, Plus, RefreshCw, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Conversa } from "@/componentes/conversa";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { NovoPrazo } from "@/componentes/novo-prazo";
import { Abas, Avatar, BlocoIa, Botao, Campo, Carregando, Chip, Cnj, Dados, Faixa, ListaIa, Painel, Responsavel, SecaoIa, Selo, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { API_URL, aosPoucos, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDoInstante, diaMes, dinheiro, hora, numero, ondeTramita, prazoEmDias, tamanho } from "@/lib/formato";
import type { Conversa as ConversaDaApi, Documento, ListaDePrazos, Movimentacao, Movimentacoes, Parte, Processo, ResumoDosAutos } from "@/lib/tipos";
import { Situacao } from "./prazos";

export type AbaDoProcesso = "resumo" | "movimentacoes" | "prazos" | "documentos" | "chat";
export const ABAS_DO_PROCESSO: readonly AbaDoProcesso[] = ["resumo", "movimentacoes", "prazos", "documentos", "chat"];

const POLO = { ativo: "Polo ativo", passivo: "Polo passivo", terceiro: "Terceiro" } as const;
const SITUACAO = { ativo: "Ativo", suspenso: "Suspenso", arquivado: "Arquivado", encerrado: "Encerrado" } as const;
const iniciais = (nome: string) =>
  nome
    .replace(/^(dr|dra)\.?\s+/i, "")
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÀ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
const arquivo = (id: string) => `${API_URL}/api/app/documentos/${id}/arquivo`;

export function ProcessoPage() {
  const { id } = useParams({ from: "/app/processos/$id" });
  const search = useSearch({ from: "/app/processos/$id" });
  const navigate = useNavigate({ from: "/processos/$id" });
  const celular = useCelular();
  const aba: AbaDoProcesso = search.aba ?? "resumo";
  const q = useQuery({ queryKey: ["processo", id], queryFn: () => api<Processo>(`/processos/${id}`) });
  const irPara = (a: AbaDoProcesso) => void navigate({ search: { aba: a === "resumo" ? undefined : a }, replace: true });

  const p = q.data;
  if (!p) {
    const corpo = q.error ? <FalhaAoCarregar erro={q.error} sumiu="Processo não encontrado" aoTentar={() => void q.refetch()} /> : <Carregando />;
    return celular ? (
      <TelaCelular titulo="Processos" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }

  const onde = ondeTramita(p);
  const abas = (
    <Abas
      pagina={!celular}
      ativa={aba}
      aoMudar={irPara}
      abas={[
        { id: "resumo", rotulo: celular ? "Resumo" : "Resumo IA" },
        { id: "movimentacoes", rotulo: "Movimentações", n: p.contadores.movimentacoes },
        { id: "prazos", rotulo: "Prazos", n: p.contadores.prazos },
        { id: "documentos", rotulo: "Documentos", n: p.contadores.documentos },
        { id: "chat", rotulo: celular ? "Chat" : "Chat do processo" },
      ]}
    />
  );
  const conteudo =
    aba === "resumo" ? (
      <AbaResumo p={p} celular={celular} irPara={irPara} />
    ) : aba === "movimentacoes" ? (
      <AbaMovimentacoes p={p} celular={celular} />
    ) : aba === "prazos" ? (
      <AbaPrazos p={p} celular={celular} />
    ) : aba === "documentos" ? (
      <AbaDocumentos p={p} celular={celular} />
    ) : (
      <AbaChat p={p} celular={celular} />
    );

  if (celular) {
    return (
      <TelaCelular titulo="Processos" voltar>
        <div className="flex flex-col gap-1">
          <h1 className="dc-h1">{p.titulo}</h1>
          <Cnj cnj={p.cnj} className="text-[14px] font-medium text-[var(--tinta-2)]" />
          <span className="text-[14px] leading-[20px] text-[var(--tinta-2)]">{[p.classe, onde, p.tribunal].filter(Boolean).join(" · ")}</span>
          <span className="dc-pessoa mt-1 text-[14px] text-[var(--tinta-2)]">
            <Avatar pessoa={p.responsavel} /> {p.responsavel?.apelido ?? "Sem responsável"}
            {p.valorCausa && <> · Valor da causa {dinheiro(p.valorCausa)}</>}
          </span>
        </div>
        <div className="-mx-4 px-4">{abas}</div>
        {conteudo}
      </TelaCelular>
    );
  }

  return (
    <Pagina>
      <div className="flex flex-col gap-3">
        <Trilha>
          <Link to="/processos">Processos</Link>
          <span>{p.titulo}</span>
        </Trilha>
        <TopoDoDetalhe
          titulo={p.titulo}
          sobre={
            <>
              <Cnj cnj={p.cnj} />
              {[p.classe, onde].filter(Boolean).map((x) => ` · ${x}`)}
              {p.situacao !== "ativo" && ` · ${SITUACAO[p.situacao]}`}
            </>
          }
          acoes={
            <>
              {p.link?.url && (
                <a className="dc-btn dc-btn--secundaria dc-btn--md" href={p.link.url} target="_blank" rel="noreferrer">
                  <ExternalLink /> {p.link.rotulo}
                </a>
              )}
              <Botao variante="ia" onClick={() => irPara("chat")}>
                <MessageSquare /> Perguntar sobre o processo
              </Botao>
            </>
          }
        />
        {abas}
      </div>
      {conteudo}
    </Pagina>
  );
}

/* ---------------- Resumo ---------------- */

function AbaResumo({ p, celular, irPara }: { p: Processo; celular: boolean; irPara: (a: AbaDoProcesso) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [editando, setEditando] = useState(false);
  const [novaParte, setNovaParte] = useState(false);
  const refazer = useMutation({
    mutationFn: () => api(`/ia/resumo/${p.id}`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["processo", p.id] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const tirarParte = useMutation({
    mutationFn: (parteId: string) => api(`/processos/${p.id}/partes/${parteId}`, { method: "DELETE" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["processo", p.id] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const r = p.resumo;
  const n = p.novidades.length;
  const resumo = (r || eu.data?.ia) && (
    <BlocoIa
      titulo="Resumo dos autos"
      analise={r}
      aoRefazer={eu.data?.ia ? () => refazer.mutate() : undefined}
      refazendo={refazer.isPending}
      avisoDesatualizada={n ? `${n === 1 ? "1 movimentação nova" : `${n} movimentações novas`} desde este resumo: ${p.novidades.slice(0, 3).join("; ")}.` : undefined}
    >
      {r?.situacao === "pronto" ? <ConteudoDoResumo c={r.conteudo} /> : <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">A IA ainda não resumiu este processo. Gere o resumo para ver o que fazer, os pontos de atenção e a estratégia.</p>}
    </BlocoIa>
  );

  const proximo = p.proximoPrazo && (
    <Painel titulo="Próximo prazo" acao={<Selo urgencia={p.proximoPrazo.urgencia}>{p.proximoPrazo.quando}</Selo>}>
      <div className="flex flex-col gap-0.5">
        <Link to="/prazos/$id" params={{ id: p.proximoPrazo.id }} className="font-semibold text-[var(--tinta)] no-underline hover:underline">
          {p.proximoPrazo.tipo}
        </Link>
        <span className="dc-nota">
          {[prazoEmDias(p.proximoPrazo.dias, p.proximoPrazo.contagem), p.proximoPrazo.responsavel?.apelido ?? "sem responsável", p.proximoPrazo.confirmado ? "confirmado" : "a confirmar"].join(" · ")}
        </span>
      </div>
      <div className="dc-rodape__par mt-1">
        <Link to="/prazos/$id" params={{ id: p.proximoPrazo.id }} className="dc-btn dc-btn--secundaria dc-btn--sm dc-btn--bloco">
          Ver briefing
        </Link>
        <Link to="/pecas" search={{ prazo: p.proximoPrazo.id }} className="dc-btn dc-btn--ia dc-btn--sm dc-btn--bloco">
          <FileText /> Gerar peça
        </Link>
      </div>
    </Painel>
  );

  const dados = (
    <Painel titulo="Dados do processo" acao={<Botao variante="fantasma" pequeno onClick={() => setEditando(true)}>Editar</Botao>}>
      <Dados
        linhas={[
          ["Cliente", p.cliente ? <Link to="/clientes/$id" params={{ id: p.cliente.id }} className="dc-link">{p.cliente.nome}</Link> : "—"],
          ["Classe", p.classe ?? "—"],
          ["Assunto", p.assunto ?? "—"],
          ["Juízo", ondeTramita(p) ?? "—"],
          ["Sistema", [p.sistema, p.tribunal].filter(Boolean).join(" · ") || "—"],
          ["Distribuído", p.distribuidoEm ? diaCompleto(p.distribuidoEm) : "—"],
          ["Valor da causa", dinheiro(p.valorCausa)],
          ["Fase", p.fase ?? "—"],
          ["Situação", SITUACAO[p.situacao]],
          ["Responsável", <Responsavel pessoa={p.responsavel} />],
          ...(p.observacoes ? ([["Observações", p.observacoes]] as [string, string][]) : []),
        ]}
      />
    </Painel>
  );

  const pessoas = (
    <Painel titulo="Partes" acao={<Botao variante="fantasma" pequeno onClick={() => setNovaParte(true)}>Adicionar</Botao>} corpo={false}>
      {p.partes.length ? (
        <div className="dc-linhas">
          {p.partes.map((pt: Parte) => (
            <div key={pt.id} className="dc-linhas__item group items-center">
              <span className="dc-avatar" aria-hidden>
                {iniciais(pt.nome)}
              </span>
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{pt.nome}</span>
                <span className="dc-celula__2">{[pt.papel ?? POLO[pt.polo], pt.cliente ? "cliente do escritório" : pt.advogados && `adv. ${pt.advogados}`].filter(Boolean).join(" · ")}</span>
              </span>
              <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm opacity-0 group-hover:opacity-100 focus:opacity-100" aria-label={`Tirar ${pt.nome}`} onClick={() => tirarParte.mutate(pt.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Vazio titulo="Sem partes">Adicione autor, réu e terceiros.</Vazio>
      )}
    </Painel>
  );

  const agenda = (p.audiencias.length > 0 || p.alvaras.length > 0) && (
    <Painel titulo="Audiências e alvarás" corpo={false}>
      <div className="dc-linhas">
        {p.audiencias.slice(0, 4).map((a) => (
          <Link key={a.id} to="/audiencias/$id" params={{ id: a.id }} className="dc-linhas__item">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">{a.tipo}</span>
              <span className="dc-celula__2 dc-num">
                {diaCompleto(diaDoInstante(a.em))} às {hora(a.em)}
                {a.porVideo ? " · por vídeo" : ""}
              </span>
            </span>
          </Link>
        ))}
        {p.alvaras.map((a) => (
          <Link key={a.id} to="/alvaras" className="dc-linhas__item">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">{a.descricao}</span>
              <span className="dc-celula__2 dc-num">Alvará · {dinheiro(a.valor)}</span>
            </span>
          </Link>
        ))}
      </div>
    </Painel>
  );

  const ultimas = (
    <Painel
      titulo="Últimas movimentações"
      acao={
        <button type="button" className="dc-link inline-flex items-center gap-1 text-[13px]" onClick={() => irPara("movimentacoes")}>
          Ver as {numero(p.contadores.movimentacoes)} <ArrowRight className="size-3.5" />
        </button>
      }
      corpo={false}
    >
      <ListaDeMovimentacoes itens={p.ultimasMovimentacoes} celular={celular} />
    </Painel>
  );

  const dialogos = (
    <>
      <EditarProcesso p={p} aberto={editando} aoFechar={() => setEditando(false)} />
      <NovaParte processoId={p.id} aberto={novaParte} aoFechar={() => setNovaParte(false)} />
    </>
  );

  if (celular) {
    return (
      <>
        {resumo}
        {proximo}
        {ultimas}
        {dados}
        {pessoas}
        {agenda}
        {dialogos}
      </>
    );
  }
  return (
    <div className="dc-colunas">
      <div className="dc-pilha">
        {resumo}
        {ultimas}
      </div>
      <div className="dc-pilha">
        {proximo}
        {dados}
        {pessoas}
        {agenda}
      </div>
      {dialogos}
    </div>
  );
}

function ConteudoDoResumo({ c }: { c: ResumoDosAutos }) {
  return (
    <>
      {c.oQueFazer.length > 0 && (
        <SecaoIa titulo="O que fazer">
          <ListaIa itens={c.oQueFazer} />
        </SecaoIa>
      )}
      <div className="dc-ia__duas">
        <SecaoIa titulo="Pontos de atenção">{c.pontosDeAtencao.length ? <ListaIa itens={c.pontosDeAtencao} /> : <p>Nada de destaque.</p>}</SecaoIa>
        <SecaoIa titulo="Estratégia">
          <p>{c.estrategia}</p>
        </SecaoIa>
      </div>
      {c.ultimoAto && (
        <div className="dc-ia__duas" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <SecaoIa titulo="Último ato do juízo">
            <p>{c.ultimoAto}</p>
          </SecaoIa>
        </div>
      )}
    </>
  );
}

/* ---------------- Movimentações ---------------- */

function ListaDeMovimentacoes({ itens, celular }: { itens: Movimentacao[]; celular: boolean }) {
  if (!itens.length) return <Vazio titulo="Nenhuma movimentação">As movimentações chegam do DataJud e das publicações do DJEN.</Vazio>;
  if (celular) {
    return (
      <div className="dc-linhas">
        {itens.map((m) => (
          <div key={m.id} className="dc-linhas__item">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__2 dc-num">
                {diaCompleto(diaDoInstante(m.em))}
                {m.evento != null && ` · evento ${m.evento}`}
              </span>
              <span className="dc-celula__1">
                {m.titulo} {m.nova && <span className="dc-selo dc-selo--ia">Nova</span>}
              </span>
              {m.descricao && <span className="dc-celula__2">{m.descricao}</span>}
              {m.documento && (
                <a href={arquivo(m.documento.id)} className="dc-link mt-1 inline-flex items-center gap-1 text-[14px]">
                  <FileText className="size-4" /> {m.documento.nome}
                  {m.documento.paginas ? ` · ${m.documento.paginas} p.` : ""}
                </a>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="dc-tabela-caixa">
      <table className="dc-tabela">
        <thead>
          <tr>
            <th style={{ width: 120 }}>Data</th>
            <th>Movimentação</th>
            <th style={{ width: 200 }}>Documento</th>
          </tr>
        </thead>
        <tbody>
          {itens.map((m) => (
            <tr key={m.id}>
              <td>
                <span className="dc-celula">
                  <span className="dc-num">{diaCompleto(diaDoInstante(m.em))}</span>
                  {m.evento != null && <span className="dc-celula__2">evento {m.evento}</span>}
                </span>
              </td>
              <td>
                <span className="dc-celula">
                  <span className="dc-celula__1">
                    {m.titulo} {m.nova && <span className="dc-selo dc-selo--ia">Nova</span>}
                  </span>
                  {m.descricao && <span className="dc-celula__2">{m.descricao}</span>}
                </span>
              </td>
              <td>
                {m.documento ? (
                  <a href={arquivo(m.documento.id)} className="inline-flex items-center gap-1.5 text-[var(--tinta)] no-underline hover:underline">
                    <FileText className="size-4 flex-none text-[var(--tinta-3)]" />
                    <span className="truncate">{m.documento.nome}</span>
                    {m.documento.paginas ? <span className="flex-none text-[var(--tinta-2)]"> · {m.documento.paginas} p.</span> : null}
                  </a>
                ) : (
                  <span className="text-[var(--tinta-3)]">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Filtro = "todas" | "juizo" | "partes" | "documento";

function AbaMovimentacoes({ p, celular }: { p: Processo; celular: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const lista = useInfiniteQuery({
    queryKey: ["processo", p.id, "movimentacoes", filtro],
    queryFn: ({ pageParam }) => api<Movimentacoes>(`/processos/${p.id}/movimentacoes?filtro=${filtro}&pagina=${pageParam}`),
    initialPageParam: 1,
    getNextPageParam: (u) => (u.itens.length === u.porPagina ? u.pagina + 1 : undefined),
    placeholderData: (a) => a,
  });
  const datajud = useMutation({
    mutationFn: () => api<{ novas: number }>(`/processos/${p.id}/datajud`, { method: "POST" }),
    onSuccess: (r) => {
      avisar(r.novas ? `${r.novas === 1 ? "1 movimentação nova" : `${r.novas} movimentações novas`} do DataJud.` : "Nada novo no DataJud.");
      void qc.invalidateQueries({ queryKey: ["processo", p.id] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const itens = lista.data?.pages.flatMap((x) => x.itens) ?? [];
  const k = lista.data?.pages[0]?.contagens;
  const totalDoFiltro = k ? k[filtro] : 0;
  return (
    <Painel
      titulo={
        <div className="dc-chips">
          {(["todas", "juizo", "partes", "documento"] as const).map((f) => (
            <Chip key={f} ligado={filtro === f} n={k?.[f]} onClick={() => setFiltro(f)}>
              {f === "todas" ? "Todas" : f === "juizo" ? "Do juízo" : f === "partes" ? "Das partes" : "Com documento"}
            </Chip>
          ))}
        </div>
      }
      acao={
        p.cnj && (
          <Botao variante="fantasma" pequeno onClick={() => datajud.mutate()} ocupado={datajud.isPending} title={p.datajudEm ? `Última consulta ${diaCurto(diaDoInstante(p.datajudEm))} ${hora(p.datajudEm)}` : undefined}>
            <RefreshCw /> {celular ? "DataJud" : "Atualizar do DataJud"}
          </Botao>
        )
      }
      corpo={false}
    >
      {!lista.data ? (
        <div className="p-4">
          <Carregando linhas={3} />
        </div>
      ) : (
        <>
          <ListaDeMovimentacoes itens={itens} celular={celular} />
          {itens.length > 0 && (
            <div className="dc-rodape-lista">
              <span>
                Mostrando {numero(itens.length)} de {numero(totalDoFiltro)} · mais recentes primeiro
              </span>
              {lista.hasNextPage && (
                <Botao pequeno onClick={() => void lista.fetchNextPage()} ocupado={lista.isFetchingNextPage}>
                  Carregar mais
                </Botao>
              )}
            </div>
          )}
        </>
      )}
    </Painel>
  );
}

/* ---------------- Prazos ---------------- */

function AbaPrazos({ p, celular }: { p: Processo; celular: boolean }) {
  const navigate = useNavigate();
  const [novo, setNovo] = useState(false);
  const abertos = useQuery({ queryKey: ["prazos", "processo", p.id, "abertos"], queryFn: () => api<ListaDePrazos>(`/prazos?processo=${p.id}&quando=abertos`) });
  const cumpridos = useQuery({ queryKey: ["prazos", "processo", p.id, "cumpridos"], queryFn: () => api<ListaDePrazos>(`/prazos?processo=${p.id}&quando=cumpridos`) });
  const pecas = useQuery({ queryKey: ["processo", p.id, "pecas"], queryFn: () => api<{ itens: { id: string; titulo: string; situacao: "rascunho" | "revisada"; atualizadaEm: string }[] }>(`/processos/${p.id}/pecas`) });
  const itens = [...(abertos.data?.itens ?? []), ...(cumpridos.data?.itens ?? [])];
  const carregando = !abertos.data || !cumpridos.data;

  return (
    <>
      <Painel
        titulo="Prazos do processo"
        acao={
          <Botao pequeno onClick={() => setNovo(true)}>
            <Plus /> Novo prazo
          </Botao>
        }
        corpo={false}
      >
        {carregando ? (
          <div className="p-4">
            <Carregando linhas={2} />
          </div>
        ) : !itens.length ? (
          <Vazio titulo="Nenhum prazo">Os prazos chegam das publicações do DJEN. Dá para criar à mão também.</Vazio>
        ) : celular ? (
          <div className="dc-linhas">
            {itens.map((i) => (
              <Link key={i.id} to="/prazos/$id" params={{ id: i.id }} className="dc-linhas__item">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{i.tipo}</span>
                  <span className="dc-celula__2">
                    {prazoEmDias(i.dias, i.contagem)} · {i.responsavel?.apelido ?? "sem responsável"}
                  </span>
                </span>
                <Selo urgencia={i.situacao === "cumprido" ? "cumprido" : i.urgencia}>{i.situacao === "cumprido" ? diaMes(i.fim) : i.quando}</Selo>
              </Link>
            ))}
          </div>
        ) : (
          <div className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th style={{ width: 124 }}>Vence</th>
                  <th>Prazo</th>
                  <th style={{ width: 136 }}>Responsável</th>
                  <th style={{ width: 176 }}>Situação</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <tr key={i.id} data-link="" onClick={() => void navigate({ to: "/prazos/$id", params: { id: i.id } })}>
                    <td>
                      <Selo urgencia={i.situacao === "cumprido" ? "cumprido" : i.urgencia}>{i.situacao === "cumprido" ? diaMes(i.fim) : i.quando}</Selo>
                    </td>
                    <td>
                      <span className="dc-celula">
                        <span className="dc-celula__1">{i.tipo}</span>
                        <span className="dc-celula__2">{[prazoEmDias(i.dias, i.contagem), i.fundamento].filter(Boolean).join(" · ")}</span>
                      </span>
                    </td>
                    <td>
                      <Responsavel pessoa={i.responsavel} />
                    </td>
                    <td>
                      <Situacao item={i} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Painel>
      <Painel
        titulo="Peças"
        acao={
          <Link to="/pecas" search={{ processo: p.id }} className="dc-btn dc-btn--secundaria dc-btn--sm">
            <FileText /> Gerar peça
          </Link>
        }
        corpo={false}
      >
        {pecas.data?.itens.length ? (
          <div className="dc-linhas">
            {pecas.data.itens.map((pc) => (
              <Link key={pc.id} to="/pecas" search={{ id: pc.id }} className="dc-linhas__item">
                <FileText className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">{pc.titulo}</span>
                  <span className="dc-celula__2">
                    {pc.situacao === "revisada" ? "Revisada" : "Rascunho"} · {diaCurto(diaDoInstante(pc.atualizadaEm))}
                  </span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Vazio titulo="Nenhuma peça ainda" />
        )}
      </Painel>
      <NovoPrazo aberto={novo} aoFechar={() => setNovo(false)} processo={{ id: p.id, titulo: p.titulo }} />
    </>
  );
}

/* ---------------- Documentos ---------------- */

export function Enviar({ processoId, clienteId, aoEnviar }: { processoId?: string; clienteId?: string; aoEnviar?: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const entrada = useRef<HTMLInputElement>(null);
  const enviar = useMutation({
    mutationFn: async (arquivos: File[]) => {
      let lidos = 0;
      for (const a of arquivos) {
        const form = new FormData();
        form.set("arquivo", a);
        if (processoId) form.set("processoId", processoId);
        if (clienteId) form.set("clienteId", clienteId);
        const r = await api<{ lido: boolean }>("/documentos", { form });
        if (r.lido) lidos++;
      }
      return { n: arquivos.length, lidos };
    },
    onSuccess: ({ n, lidos }) => {
      avisar(n === 1 ? (lidos ? "Documento guardado e lido." : "Documento guardado.") : `${n} documentos guardados.`);
      void qc.invalidateQueries({ queryKey: ["documentos"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      void qc.invalidateQueries({ queryKey: ["cliente"] });
      aoEnviar?.();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <>
      <input
        ref={entrada}
        type="file"
        multiple
        hidden
        accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.xlsx,image/*,application/pdf"
        onChange={(e) => {
          const fs = [...(e.target.files ?? [])];
          e.target.value = "";
          if (fs.length) enviar.mutate(fs);
        }}
      />
      <Botao pequeno onClick={() => entrada.current?.click()} ocupado={enviar.isPending}>
        <Upload /> Enviar
      </Botao>
    </>
  );
}

function LeituraDaIa({ d }: { d: Documento }) {
  if (d.lido)
    return (
      <span className="inline-flex items-center gap-1 text-[var(--tinta-2)]">
        <span className="text-[var(--cumprido)]">✓</span> Lido
      </span>
    );
  if (d.semTexto) return <span className="text-[var(--hoje)]">Sem texto (imagem)</span>;
  return <span className="text-[var(--tinta-3)]">Não lido</span>;
}

function AbaDocumentos({ p, celular }: { p: Processo; celular: boolean }) {
  const docs = useQuery({ queryKey: ["documentos", "processo", p.id], queryFn: () => api<{ itens: Documento[] }>(`/documentos?processo=${p.id}`) });
  const itens = docs.data?.itens ?? [];
  const paginas = itens.reduce((s, d) => s + (d.paginas ?? 0), 0);
  return (
    <Painel
      titulo="Documentos dos autos"
      acao={
        <span className="flex items-center gap-3">
          {docs.data && !celular && (
            <span className="dc-nota">
              {numero(itens.length)} {itens.length === 1 ? "documento" : "documentos"}
              {paginas ? ` · ${numero(paginas)} páginas` : ""}
            </span>
          )}
          <Enviar processoId={p.id} />
        </span>
      }
      corpo={false}
    >
      {!docs.data ? (
        <div className="p-4">
          <Carregando linhas={3} />
        </div>
      ) : !itens.length ? (
        <Vazio titulo="Nenhum documento">Envie PDF, DOCX ou imagem. A IA lê o texto e usa no resumo, no briefing e nas peças.</Vazio>
      ) : celular ? (
        <div className="dc-linhas">
          {itens.map((d) => (
            <a key={d.id} href={arquivo(d.id)} className="dc-linhas__item">
              <FileText className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{d.nome}</span>
                <span className="dc-celula__2">
                  {[d.evento != null && `evento ${d.evento}`, diaCurto(diaDoInstante(d.em)), d.paginas && `${d.paginas} p.`].filter(Boolean).join(" · ")}
                </span>
              </span>
              <LeituraDaIa d={d} />
            </a>
          ))}
        </div>
      ) : (
        <div className="dc-tabela-caixa">
          <table className="dc-tabela">
            <thead>
              <tr>
                <th>Documento</th>
                <th style={{ width: 112 }}>Juntado</th>
                <th style={{ width: 80, textAlign: "right" }}>Páginas</th>
                <th style={{ width: 150 }}>Leitura da IA</th>
                <th style={{ width: 44 }} />
              </tr>
            </thead>
            <tbody>
              {itens.map((d) => (
                <tr key={d.id}>
                  <td>
                    <span className="flex items-start gap-2">
                      <FileText className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
                      <span className="dc-celula">
                        <a className="dc-celula__1 no-underline hover:underline" href={`${arquivo(d.id)}?ver=1`} target="_blank" rel="noreferrer">
                          {d.nome}
                        </a>
                        <span className="dc-celula__2">{[d.evento != null && `evento ${d.evento}`, d.origem === "peca" && "peça do escritório", d.enviadoPor && `enviado por ${d.enviadoPor.apelido}`, tamanho(d.tamanho)].filter(Boolean).join(" · ")}</span>
                      </span>
                    </span>
                  </td>
                  <td className="dc-num">{diaCompleto(diaDoInstante(d.em))}</td>
                  <td className="dc-num" style={{ textAlign: "right" }}>
                    {d.paginas ?? "—"}
                  </td>
                  <td>
                    <LeituraDaIa d={d} />
                  </td>
                  <td>
                    <a href={arquivo(d.id)} className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Baixar ${d.nome}`}>
                      <Download />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Painel>
  );
}

/* ---------------- Chat ---------------- */

function AbaChat({ p, celular }: { p: Processo; celular: boolean }) {
  const qc = useQueryClient();
  const eu = useQuery(euQuery);
  const chat = useQuery({ queryKey: ["chat", p.id], queryFn: () => api<ConversaDaApi>(`/ia/chat/${p.id}`) });
  const enviar = async (texto: string, aoChegar: (t: string) => void) => {
    await aosPoucos(`/ia/chat/${p.id}`, { json: { texto } }, aoChegar);
    await qc.refetchQueries({ queryKey: ["chat", p.id] });
  };
  const corpo = !chat.data ? (
    <Carregando linhas={3} />
  ) : !eu.data?.ia ? (
    <Faixa tipo="aviso">A IA ainda não está ligada neste escritório.</Faixa>
  ) : (
    <Conversa
      mensagens={chat.data.mensagens}
      enviar={enviar}
      rodape={chat.data.rodape}
      placeholder="Pergunte sobre este processo"
      sugestoes={["Quando foi a citação?", "Resuma a contestação", "O que falta juntar?"]}
      vazio={<p className="dc-nota m-0">A conversa é da equipe toda. A IA responde só com o que está nos autos e diz o evento.</p>}
      fixo={celular}
    />
  );
  if (celular) return corpo;
  return (
    <Painel titulo="Chat do processo" acao={<span className="dc-nota">Responde só com o que está nos autos, citando o evento.</span>}>
      {corpo}
    </Painel>
  );
}

/* ---------------- Diálogos ---------------- */

function EditarProcesso({ p, aberto, aoFechar }: { p: Processo; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const inicial = () => ({
    titulo: p.titulo,
    cnj: p.cnj ?? "",
    classe: p.classe ?? "",
    assunto: p.assunto ?? "",
    orgao: p.orgao ?? "",
    comarca: p.comarca ?? "",
    sistema: p.sistema ?? "",
    fase: p.fase ?? "",
    valorCausa: p.valorCausa ? String(p.valorCausa).replace(".", ",") : "",
    situacao: p.situacao,
    responsavelId: p.responsavel?.id ?? "",
    observacoes: p.observacoes ?? "",
  });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const vazioNulo = (v: string) => v.trim() || null;
  const valor = f.valorCausa.trim() ? f.valorCausa.replace(/[^\d,]/g, "").replace(",", ".") : null;
  const salvar = useMutation({
    mutationFn: () =>
      api(`/processos/${p.id}`, {
        method: "PUT",
        json: {
          titulo: f.titulo.trim(),
          cnj: p.tipo === "judicial" ? vazioNulo(f.cnj) : undefined,
          classe: vazioNulo(f.classe),
          assunto: vazioNulo(f.assunto),
          orgao: vazioNulo(f.orgao),
          comarca: vazioNulo(f.comarca),
          sistema: vazioNulo(f.sistema),
          fase: vazioNulo(f.fase),
          valorCausa: valor,
          situacao: f.situacao,
          responsavelId: f.responsavelId || null,
          observacoes: vazioNulo(f.observacoes),
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["processo", p.id] });
      void qc.invalidateQueries({ queryKey: ["processos"] });
      avisar("Processo atualizado.");
      aoFechar();
    },
  });
  const campo = (k: keyof typeof f, rotulo: string, extra?: { placeholder?: string; inputMode?: "numeric" | "decimal" }) => (
    <Campo rotulo={rotulo} htmlFor={`ep-${k}`}>
      <input id={`ep-${k}`} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} {...extra} />
    </Campo>
  );
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Dados do processo"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.titulo.trim().length < 2}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        {campo("titulo", "Título", { placeholder: "Autor × Réu" })}
        {p.tipo === "judicial" && campo("cnj", "Número CNJ", { inputMode: "numeric" })}
        <div className="dc-grade-2">
          {campo("classe", "Classe")}
          {campo("assunto", "Assunto")}
          {campo("orgao", "Juízo", { placeholder: "2ª Vara Cível" })}
          {campo("comarca", "Comarca")}
          {campo("sistema", "Sistema", { placeholder: "eproc" })}
          {campo("fase", "Fase")}
          {campo("valorCausa", "Valor da causa", { inputMode: "decimal", placeholder: "86400,00" })}
          <Campo rotulo="Situação" htmlFor="ep-situacao">
            <select id="ep-situacao" value={f.situacao} onChange={(e) => setF({ ...f, situacao: e.target.value as Processo["situacao"] })}>
              {Object.entries(SITUACAO).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="ep-resp">
          <select id="ep-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Sem responsável</option>
            {eu.data?.equipe.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Observações" htmlFor="ep-obs">
          <textarea id="ep-obs" rows={3} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function NovaParte({ processoId, aberto, aoFechar }: { processoId: string; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const vazio = { nome: "", polo: "passivo" as Parte["polo"], papel: "", advogados: "", cliente: false };
  const [f, setF] = useState(vazio);
  const criar = useMutation({
    mutationFn: () => api(`/processos/${processoId}/partes`, { json: { nome: f.nome, polo: f.polo, papel: f.papel || null, advogados: f.advogados || null, cliente: f.cliente } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["processo", processoId] });
      avisar("Parte adicionada.");
      setF(vazio);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Adicionar parte"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={f.nome.trim().length < 2}>
            Adicionar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Nome" htmlFor="np-nome">
          <input id="np-nome" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Polo" htmlFor="np-polo">
            <select id="np-polo" value={f.polo} onChange={(e) => setF({ ...f, polo: e.target.value as Parte["polo"] })}>
              <option value="ativo">Polo ativo</option>
              <option value="passivo">Polo passivo</option>
              <option value="terceiro">Terceiro</option>
            </select>
          </Campo>
          <Campo rotulo="Papel" htmlFor="np-papel">
            <input id="np-papel" value={f.papel} onChange={(e) => setF({ ...f, papel: e.target.value })} placeholder="Ré, perito, assistente" />
          </Campo>
        </div>
        <Campo rotulo="Advogados" htmlFor="np-adv">
          <input id="np-adv" value={f.advogados} onChange={(e) => setF({ ...f, advogados: e.target.value })} placeholder="Nome, OAB/UF 00.000" />
        </Campo>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.cliente} onChange={(e) => setF({ ...f, cliente: e.target.checked })} />É cliente do escritório
        </label>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
