import { formatarDocumento } from "@decreta/core";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { FolderPlus, MessageCircle, MessageSquarePlus, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { CamposDoCliente } from "@/componentes/campos-cliente";
import { ConferenciaDaPasta } from "@/componentes/conferencia";
import { Dialogo } from "@/componentes/dialogo";
import { IconeDoArquivo } from "@/componentes/icone-arquivo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { NovoAtendimento, NovoCliente, NovoProcesso } from "@/componentes/novos";
import { AoChegarNoFim, Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, CampoDeBusca, Campo, Carregando, Cnj, Dados, Faixa, LinhaDoTempo, Painel, Responsavel, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { ehSocio } from "@/lib/auth";
import { useBuscaNaUrl } from "@/lib/busca";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDoInstante, hora, numero, tamanho, telefone } from "@/lib/formato";
import type { Canal, Cliente, ClienteNaLista, Pagina as PaginaDaApi } from "@/lib/tipos";
import { enquantoLe, Enviar, LeituraDaIa } from "./processo";

export const CANAL: Record<Canal, string> = { presencial: "Presencial", telefone: "Telefone", whatsapp: "WhatsApp", video: "Vídeo", email: "E-mail" };
const linkDoWhatsapp = (n: string | null) => (n ? `https://wa.me/${n.replace(/\D/g, "").replace(/^(?!55)/, "55")}` : null);

export function ClientesPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/clientes" });
  const navigate = useNavigate({ from: "/clientes" });
  const [texto, setTexto] = useBuscaNaUrl(search.busca, (busca) => void navigate({ search: { busca }, replace: true }));
  const [novo, setNovo] = useState(false);
  const lista = useInfiniteQuery({
    queryKey: ["clientes", search.busca ?? ""],
    queryFn: ({ pageParam }) => api<PaginaDaApi<ClienteNaLista>>(`/clientes?${new URLSearchParams({ pagina: String(pageParam), ...(search.busca ? { busca: search.busca } : {}) })}`),
    initialPageParam: 1,
    getNextPageParam: (u) => (u.pagina * u.porPagina < u.total ? u.pagina + 1 : undefined),
    placeholderData: (a) => a,
  });
  const itens = lista.data?.pages.flatMap((p) => p.itens) ?? [];
  const total = lista.data?.pages[0]?.total ?? 0;
  const sub = lista.data ? `${numero(total)} ${total === 1 ? "cliente" : "clientes"}` : " ";
  const busca = <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar cliente" placeholder="Nome, CPF, CNPJ ou telefone" />;
  const vazio = <Vazio titulo={search.busca ? "Nada encontrado" : "Nenhum cliente ainda"}>{search.busca ? "Tente parte do nome ou só os números do CPF." : "Cadastre o primeiro cliente."}</Vazio>;
  const mais = lista.hasNextPage && (
    <Botao pequeno onClick={() => void lista.fetchNextPage()} ocupado={lista.isFetchingNextPage}>
      Carregar mais
    </Botao>
  );
  const fim = <AoChegarNoFim ativo={!!lista.hasNextPage && !lista.isFetchingNextPage} aoChegar={() => void lista.fetchNextPage()} />;

  if (celular) {
    return (
      <TelaCelular
        titulo="Clientes"
        sobre={sub}
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo cliente" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
        fixo={busca}
      >
        {!lista.data ? (
          <Carregando />
        ) : itens.length ? (
          <div className="dc-lista">
            {itens.map((c) => (
              <Link key={c.id} to="/clientes/$id" params={{ id: c.id }} className="dc-item">
                <span className="dc-item__titulo">{c.nome}</span>
                <span className="dc-num text-[13px] text-[var(--tinta-2)]">{c.processos ? `${c.processos} ${c.processos === 1 ? "processo" : "processos"}` : ""}</span>
                <span className="dc-item__meta">{[c.documento && formatarDocumento(c.documento), telefone(c.whatsapp ?? c.telefone)].filter(Boolean).join(" · ") || "Sem documento"}</span>
              </Link>
            ))}
            {fim}
            {mais}
          </div>
        ) : (
          vazio
        )}
        <NovoCliente aberto={novo} aoFechar={() => setNovo(false)} />
      </TelaCelular>
    );
  }

  return (
    <Pagina cheia>
      <Cabecalho
        titulo="Clientes"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo cliente
          </Botao>
        }
      />
      <div className="dc-filtros">{busca}</div>
      <section className="dc-painel">
        {!lista.data ? (
          <div className="p-4">
            <Carregando />
          </div>
        ) : itens.length ? (
          <>
            <Rolagem id="clientes" className="dc-tabela-caixa">
              <table className="dc-tabela">
                <thead>
                  <tr>
                    <th>Cliente</th>
                    <th style={{ width: 240 }}>Contato</th>
                    <th style={{ width: 100, textAlign: "right" }}>Processos</th>
                    <th style={{ width: 150 }}>Último atendimento</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((c) => (
                    <tr key={c.id} data-link="" onClick={() => void navigate({ to: "/clientes/$id", params: { id: c.id } })}>
                      <td>
                        <span className="dc-celula">
                          <Link className="dc-celula__1" to="/clientes/$id" params={{ id: c.id }} onClick={(e) => e.stopPropagation()}>
                            {c.nome}
                          </Link>
                          <span className="dc-celula__2 dc-num">{c.documento ? formatarDocumento(c.documento) : c.tipo === "pj" ? "Pessoa jurídica" : "Sem CPF"}</span>
                        </span>
                      </td>
                      <td>
                        <span className="dc-celula">
                          <span className="dc-num">{telefone(c.whatsapp ?? c.telefone) || "—"}</span>
                          {c.email && <span className="dc-celula__2 truncate">{c.email}</span>}
                        </span>
                      </td>
                      <td className="dc-num" style={{ textAlign: "right" }}>
                        {c.processos || "—"}
                      </td>
                      <td className="dc-num text-[var(--tinta-2)]">{c.ultimoAtendimento ? diaCompleto(diaDoInstante(c.ultimoAtendimento)) : "—"}</td>
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
      <NovoCliente aberto={novo} aoFechar={() => setNovo(false)} />
    </Pagina>
  );
}

export function ClientePage() {
  const { id } = useParams({ from: "/app/clientes/$id" });
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["cliente", id], queryFn: () => api<Cliente>(`/clientes/${id}`), refetchInterval: enquantoLe });
  const [dialogo, setDialogo] = useState<"atendimento" | "processo" | "editar" | "apagar" | null>(null);
  const qc = useQueryClient();
  const avisar = useAviso();
  const conferir = useMutation({
    mutationFn: () => api(`/clientes/${id}/conferir`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["cliente", id] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const c = q.data;
  if (!c) {
    const corpo = q.error ? <FalhaAoCarregar erro={q.error} sumiu="Cliente não encontrado" aoTentar={() => void q.refetch()} /> : <Carregando />;
    return celular ? (
      <TelaCelular titulo="Clientes" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }

  const zap = linkDoWhatsapp(c.whatsapp ?? (c.telefone && c.telefone.replace(/\D/g, "").length === 11 ? c.telefone : null));
  const hoje = eu.data?.hoje;
  const sobre = [c.documento && formatarDocumento(c.documento), telefone(c.whatsapp ?? c.telefone), c.email].filter(Boolean).join(" · ");

  const processos = (
    <Painel
      titulo="Processos"
      acao={
        <Botao variante="fantasma" pequeno onClick={() => setDialogo("processo")}>
          <FolderPlus /> Novo
        </Botao>
      }
      corpo={false}
    >
      {c.processos.length ? (
        <div className="dc-linhas">
          {c.processos.map((p) => (
            <Link key={p.id} to="/processos/$id" params={{ id: p.id }} className="dc-linhas__item items-center">
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{p.titulo}</span>
                <span className="dc-celula__2">
                  <Cnj cnj={p.cnj} />
                  {p.orgao && ` · ${p.orgao}`}
                  {p.situacao !== "ativo" && ` · ${p.situacao}`}
                </span>
              </span>
              {!celular && <Responsavel pessoa={p.responsavel} />}
            </Link>
          ))}
        </div>
      ) : (
        <Vazio titulo="Nenhum processo" />
      )}
    </Painel>
  );

  const atendimentos = (
    <Painel
      titulo="Atendimentos"
      acao={
        <Botao variante="fantasma" pequeno onClick={() => setDialogo("atendimento")}>
          <MessageSquarePlus /> Novo
        </Botao>
      }
      corpo={false}
    >
      {c.atendimentos.length ? (
        <div className="dc-linhas">
          {c.atendimentos.map((a) => (
            <div key={a.id} className="dc-linhas__item">
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="dc-nota">
                  {diaDoInstante(a.em) === hoje ? `Hoje ${hora(a.em)}` : `${diaCompleto(diaDoInstante(a.em))} ${hora(a.em)}`} · {CANAL[a.canal]}
                  {a.autor && ` · ${a.autor.apelido}`}
                </span>
                <span className="whitespace-pre-wrap text-[14px] leading-[21px]">{a.resumo}</span>
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Vazio titulo="Nenhum atendimento">Registre a conversa com o cliente. Dá para colar o áudio transcrito e a IA organiza.</Vazio>
      )}
    </Painel>
  );

  const dados = (
    <Painel titulo="Dados" acao={<Botao variante="fantasma" pequeno onClick={() => setDialogo("editar")}>Editar</Botao>}>
      <Dados
        linhas={[
          [c.tipo === "pj" ? "CNPJ" : "CPF", c.documento ? <span className="dc-num">{formatarDocumento(c.documento)}</span> : "—"],
          ["Telefone", c.telefone ? <span className="dc-num">{telefone(c.telefone)}</span> : "—"],
          ["WhatsApp", zap ? <a className="dc-link dc-num" href={zap} target="_blank" rel="noreferrer">{telefone(c.whatsapp ?? c.telefone)}</a> : "—"],
          ["E-mail", c.email ? <a className="dc-link" href={`mailto:${c.email}`}>{c.email}</a> : "—"],
          ["Endereço", c.endereco ?? "—"],
          ["Cliente desde", diaCompleto(diaDoInstante(c.criadoEm))],
          ...(c.observacoes ? ([["Observações", c.observacoes]] as [string, string][]) : []),
        ]}
      />
    </Painel>
  );

  const documentos = (
    <Painel titulo="Documentos" acao={<Enviar clienteId={c.id} />} corpo={false}>
      {c.documentos.length ? (
        <div className="dc-linhas">
          {c.documentos.map((d) => (
            <a key={d.id} href={`${API_URL}/api/app/documentos/${d.id}/arquivo`} className="dc-linhas__item">
              <IconeDoArquivo nome={d.nome} mime={d.mime} />
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1 truncate">{d.nome}</span>
                <span className="dc-celula__2">
                  {diaCurto(diaDoInstante(d.em))} · {tamanho(d.tamanho)}
                </span>
              </span>
              <LeituraDaIa d={d} />
            </a>
          ))}
        </div>
      ) : (
        <Vazio titulo="Nenhum documento">RG, comprovantes, procuração.</Vazio>
      )}
    </Painel>
  );

  const conferencia = (
    <ConferenciaDaPasta
      analise={c.conferencia}
      aoConferir={eu.data?.ia ? () => conferir.mutate() : undefined}
      conferindo={conferir.isPending}
      semDocumentos={!c.documentos.some((d) => d.lido)}
    />
  );

  const tempo = c.linhaDoTempo.length > 0 && (
    <Painel titulo="Linha do tempo">
      <LinhaDoTempo itens={c.linhaDoTempo.slice(0, 12).map((t, i) => ({ data: diaCurto(diaDoInstante(t.em)), titulo: t.titulo, detalhe: t.detalhe ?? undefined, novo: i === 0 }))} />
    </Painel>
  );

  const apagar = ehSocio(eu.data?.usuario.papel) && (
    <button type="button" className="inline-flex items-center gap-1.5 self-start text-[13px] font-medium text-[var(--vencido)] hover:underline" onClick={() => setDialogo("apagar")}>
      <Trash2 className="size-3.5" /> Apagar cliente (LGPD)
    </button>
  );

  const dialogos = (
    <>
      <NovoAtendimento aberto={dialogo === "atendimento"} aoFechar={() => setDialogo(null)} cliente={{ id: c.id, nome: c.nome }} />
      <NovoProcesso aberto={dialogo === "processo"} aoFechar={() => setDialogo(null)} cliente={{ id: c.id, nome: c.nome }} />
      <EditarCliente c={c} aberto={dialogo === "editar"} aoFechar={() => setDialogo(null)} />
      <ApagarCliente c={c} aberto={dialogo === "apagar"} aoFechar={() => setDialogo(null)} />
    </>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Clientes"
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Editar" onClick={() => setDialogo("editar")}>
            <Pencil />
          </button>
        }
      >
        <div className="flex flex-col gap-1">
          <h1 className="dc-h1">{c.nome}</h1>
          {sobre && <span className="dc-num text-[14px] text-[var(--tinta-2)]">{sobre}</span>}
        </div>
        <div className="dc-rodape__par">
          <Botao variante="primaria" bloco onClick={() => setDialogo("atendimento")}>
            <MessageSquarePlus /> Atendimento
          </Botao>
          {zap ? (
            <a className="dc-btn dc-btn--secundaria dc-btn--md dc-btn--bloco" href={zap} target="_blank" rel="noreferrer">
              <MessageCircle /> WhatsApp
            </a>
          ) : (
            <Botao bloco onClick={() => setDialogo("processo")}>
              <FolderPlus /> Processo
            </Botao>
          )}
        </div>
        {processos}
        {atendimentos}
        {dados}
        {documentos}
        {conferencia}
        {tempo}
        {apagar}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina>
      <div className="dc-topo-pagina">
        <Trilha>
          <Link to="/clientes">Clientes</Link>
          <span>{c.nome}</span>
        </Trilha>
        <TopoDoDetalhe
          titulo={c.nome}
          sobre={sobre || undefined}
          acoes={
            <>
              {zap && (
                <a className="dc-btn dc-btn--secundaria dc-btn--md" href={zap} target="_blank" rel="noreferrer">
                  <MessageCircle /> WhatsApp
                </a>
              )}
              <Botao onClick={() => setDialogo("processo")}>
                <FolderPlus /> Novo processo
              </Botao>
              <Botao variante="primaria" onClick={() => setDialogo("atendimento")}>
                <MessageSquarePlus /> Novo atendimento
              </Botao>
            </>
          }
        />
      </div>
      <div className="dc-colunas">
        <div className="dc-pilha">
          {processos}
          {atendimentos}
        </div>
        <div className="dc-pilha">
          {dados}
          {documentos}
          {conferencia}
          {tempo}
          {apagar}
        </div>
      </div>
      {dialogos}
    </Pagina>
  );
}

function EditarCliente({ c, aberto, aoFechar }: { c: Cliente; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const inicial = () => ({ ficha: { nome: c.nome, tipo: c.tipo, documento: c.documento ? formatarDocumento(c.documento) : "", telefone: telefone(c.telefone), email: c.email ?? "", endereco: c.endereco ?? "" }, observacoes: c.observacoes ?? "" });
  const [f, setF] = useState(() => inicial().ficha);
  const [observacoes, setObservacoes] = useState(() => inicial().observacoes);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) {
      setF(inicial().ficha);
      setObservacoes(inicial().observacoes);
    }
  }
  const salvar = useMutation({
    mutationFn: () =>
      api(`/clientes/${c.id}`, {
        method: "PUT",
        json: { nome: f.nome, tipo: f.tipo, documento: f.documento || null, telefone: f.telefone || null, email: f.email || null, endereco: f.endereco || null, observacoes: observacoes || null },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cliente", c.id] });
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      avisar("Cliente atualizado.");
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Dados do cliente"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.nome.trim().length < 2}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <div className="flex gap-4">
          <label className="dc-opcao">
            <input type="radio" name="ec-tipo" checked={f.tipo === "pf"} onChange={() => setF({ ...f, tipo: "pf" })} /> Pessoa física
          </label>
          <label className="dc-opcao">
            <input type="radio" name="ec-tipo" checked={f.tipo === "pj"} onChange={() => setF({ ...f, tipo: "pj" })} /> Empresa
          </label>
        </div>
        <CamposDoCliente f={f} setF={setF} ignorar={c.id} prefixo="ec" />
        <Campo rotulo="Observações" htmlFor="ec-obs">
          <textarea id="ec-obs" rows={3} value={observacoes} onChange={(e) => setObservacoes(e.target.value)} />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function ApagarCliente({ c, aberto, aoFechar }: { c: Cliente; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navigate = useNavigate();
  const [confirma, setConfirma] = useState("");
  const apagar = useMutation({
    mutationFn: () => api(`/clientes/${c.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["clientes"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Cliente apagado.");
      aoFechar();
      void navigate({ to: "/clientes", replace: true });
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Apagar cliente"
      descricao="Apaga o cadastro, os atendimentos e os documentos que são só deste cliente. Os processos ficam, sem o vínculo. Não dá para desfazer."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={() => apagar.mutate()} ocupado={apagar.isPending} disabled={confirma.trim().toLocaleLowerCase("pt-BR") !== c.nome.trim().toLocaleLowerCase("pt-BR")}>
            Apagar para sempre
          </Botao>
        </>
      }
    >
      <Campo rotulo={`Digite o nome do cliente para confirmar: ${c.nome}`} htmlFor="ac-nome">
        <input id="ac-nome" value={confirma} onChange={(e) => setConfirma(e.target.value)} autoComplete="off" />
      </Campo>
      {apagar.error && <Faixa tipo="erro">{mensagemDoErro(apagar.error)}</Faixa>}
    </Dialogo>
  );
}
