/**
 * Gerar peça: escolhe o modelo, diz o que quer, a IA escreve no timbre e a
 * pessoa revisa, edita e baixa o DOCX.
 */
import { blocos, trechos, type Bloco } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { Check, Download, FileText, Pencil, RefreshCw } from "lucide-react";
import { Fragment, useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { Botao, Carregando, Cnj, Faixa, MarcaIa, Painel, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { API_URL, aosPoucos, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante, diaMes, hora } from "@/lib/formato";
import type { Catalogo, Escritorio, Peca, PreparoDaPeca, Timbre } from "@/lib/tipos";
import { cn } from "@/lib/util";

const paginas = (texto: string) => Math.max(1, Math.round(texto.length / 2800));

export function PecaPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/pecas" });
  const navigate = useNavigate({ from: "/pecas" });
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);

  const pecaSalva = useQuery({ queryKey: ["peca", search.id], queryFn: () => api<Peca>(`/pecas/${search.id}`), enabled: !!search.id });
  const prazoId = search.prazo ?? pecaSalva.data?.prazoId ?? undefined;
  const processoId = search.processo ?? pecaSalva.data?.processoId;
  const consulta = prazoId ? `prazo=${prazoId}` : processoId ? `processo=${processoId}` : null;
  const prep = useQuery({ queryKey: ["pecas", "preparar", consulta], queryFn: () => api<PreparoDaPeca>(`/pecas/preparar?${consulta}`), enabled: !!consulta });
  const catalogo = useQuery({ queryKey: ["pecas", "catalogo"], queryFn: () => api<Catalogo>("/pecas/catalogo"), staleTime: Infinity });
  const escritorio = useQuery({ queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") });

  const pecaId = search.id ?? prep.data?.ultima?.id;
  const peca = pecaSalva.data ?? (prep.data?.ultima && pecaId === prep.data.ultima.id ? prep.data.ultima : undefined);

  const [tipoEscolhido, setTipo] = useState<string | null>(null);
  const [instrucoesDigitadas, setInstrucoes] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [edicao, setEdicao] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);

  const tipo = tipoEscolhido ?? peca?.tipo ?? prep.data?.tipoSugerido ?? "";
  const instrucoes = instrucoesDigitadas ?? peca?.instrucoes ?? "";
  const texto = aoVivo ?? peca?.texto ?? "";
  const tipos = catalogo.data?.grupos.flatMap((g) => g.tipos) ?? [];
  const nomeDoTipo = tipos.find((t) => t.id === tipo)?.nome ?? "Escolha o tipo";

  async function gerar() {
    if (!prep.data) return;
    setGerando(true);
    setAoVivo("");
    setEdicao(null);
    try {
      const { headers } = await aosPoucos(
        "/pecas",
        { json: { processoId: prep.data.processo.id, prazoId: prep.data.prazo?.id ?? null, tipo, instrucoes, pecaId: pecaId ?? null } },
        (t) => setAoVivo(t),
      );
      const id = headers.get("x-peca-id");
      if (id) {
        await qc.fetchQuery({ queryKey: ["peca", id], queryFn: () => api<Peca>(`/pecas/${id}`) });
        void qc.invalidateQueries({ queryKey: ["pecas", "preparar"] });
        void qc.invalidateQueries({ queryKey: ["prazo"] });
        void navigate({ search: (s) => ({ ...s, id }), replace: true });
      }
    } catch (err) {
      avisar(mensagemDoErro(err), { erro: true });
    } finally {
      setGerando(false);
      setAoVivo(null);
    }
  }

  const salvar = useMutation({
    mutationFn: (corpo: { texto?: string; situacao?: "rascunho" | "revisada" }) => api(`/pecas/${pecaId}`, { method: "PUT", json: corpo }),
    onSuccess: (_r, corpo) => {
      void qc.invalidateQueries({ queryKey: ["peca", pecaId] });
      void qc.invalidateQueries({ queryKey: ["pecas", "preparar"] });
      if (corpo.texto !== undefined) setEdicao(null);
      avisar(corpo.situacao === "revisada" ? "Peça marcada como revisada." : "Texto salvo.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  if (!consulta && !search.id) {
    const corpo = (
      <Vazio titulo="De qual processo é a peça?">
        Abra Gerar peça a partir de um prazo ou de um processo.
        <Link to="/prazos" className="dc-link">
          Ir para Prazos
        </Link>
      </Vazio>
    );
    return celular ? (
      <TelaCelular titulo="Gerar peça" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }
  const erro = pecaSalva.error ?? prep.error;
  if (!prep.data) {
    const corpo = erro ? <FalhaAoCarregar erro={erro} sumiu="Peça não encontrada" /> : <Carregando />;
    return celular ? (
      <TelaCelular titulo="Gerar peça" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }

  const p = prep.data;
  const iaLigada = !!eu.data?.ia;
  const timbre = escritorio.data?.timbre ?? { nome: eu.data?.escritorio.nome ?? "" };
  const docx = pecaId && texto && !gerando ? `${API_URL}/api/app/pecas/${pecaId}/docx` : undefined;
  const sobreOPrazo = p.prazo ? `Sugerido pelo prazo de ${diaCurto(p.prazo.fim)}` : "Escolha o modelo da peça";
  const quandoGerou = peca && !gerando ? `${diaDoInstante(peca.atualizadaEm) === eu.data?.hoje ? "às" : `em ${diaCurto(diaDoInstante(peca.atualizadaEm))} às`} ${hora(peca.atualizadaEm)}` : null;
  const revisada = peca?.situacao === "revisada";

  const leu = (
    <ul className="dc-lista-check m-0 list-none p-0">
      {(p.leu.length ? p.leu : ["Dados do processo e as movimentações"]).map((l) => (
        <li key={l}>
          <Check /> {l}
        </li>
      ))}
      {p.leu.length > 0 && (
        <li className="text-[var(--tinta-2)]">
          <Check /> Dados do processo e as movimentações
        </li>
      )}
    </ul>
  );
  const campoInstrucoes = (
    <textarea
      aria-label="Instruções para a IA"
      rows={4}
      value={instrucoes}
      onChange={(e) => setInstrucoes(e.target.value)}
      placeholder="Concordar com o laudo e pedir o julgamento. Rebater a falta de vistoria."
      className="w-full"
    />
  );
  const botaoGerar = (bloco: boolean) => (
    <Botao variante={texto ? "secundaria" : "primaria"} bloco={bloco} onClick={() => void gerar()} ocupado={gerando} disabled={!iaLigada || !tipo}>
      {texto ? <RefreshCw /> : <FileText />} {gerando ? "Escrevendo…" : texto ? "Gerar de novo" : "Gerar peça"}
    </Botao>
  );
  const semIa = !iaLigada && <Faixa tipo="aviso">A IA ainda não está ligada neste escritório. Dá para escrever a peça à mão e baixar no timbre.</Faixa>;

  const folha =
    edicao !== null ? (
      <div className="dc-folha">
        <textarea aria-label="Texto da peça" value={edicao} onChange={(e) => setEdicao(e.target.value)} autoFocus />
      </div>
    ) : texto ? (
      <Folha texto={texto} timbre={timbre} escrevendo={gerando} />
    ) : (
      <div className="dc-folha">
        <Vazio titulo="Nenhum rascunho ainda">{iaLigada ? "Escolha o tipo, diga o que quer e gere. A IA escreve no timbre do escritório." : "Clique em Editar texto para escrever."}</Vazio>
      </div>
    );
  const editar = () => setEdicao(texto || "# Excelentíssimo Senhor Doutor Juiz de Direito\n\n");
  const acoesDaEdicao = edicao !== null && (
    <>
      <Botao variante="fantasma" onClick={() => setEdicao(null)}>
        Cancelar
      </Botao>
      <Botao variante="primaria" onClick={() => salvar.mutate({ texto: edicao })} ocupado={salvar.isPending} disabled={!pecaId}>
        Salvar texto
      </Botao>
    </>
  );

  const trocar = (
    <Dialogo aberto={trocando} aoFechar={() => setTrocando(false)} titulo="Tipo de peça" descricao={`${catalogo.data?.total ?? ""} modelos`}>
      <EscolherTipo
        catalogo={catalogo.data}
        tipo={tipo}
        aoEscolher={(t) => {
          setTipo(t);
          setTrocando(false);
        }}
      />
    </Dialogo>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Gerar peça"
        sobre={p.processo.titulo}
        voltar
        rodape={
          edicao !== null ? (
            <div className="dc-rodape__par">{acoesDaEdicao}</div>
          ) : texto && !gerando ? (
            <>
              <a className="dc-btn dc-btn--primaria dc-btn--md dc-btn--bloco" href={docx} download>
                <Download /> Baixar DOCX no timbre
              </a>
              <div className="dc-rodape__par">
                <Botao bloco onClick={editar}>
                  <Pencil /> Editar
                </Botao>
                {botaoGerar(true)}
              </div>
            </>
          ) : (
            botaoGerar(true)
          )
        }
      >
        {semIa}
        <section className="dc-secao">
          <span className="dc-rotulo">Tipo de peça</span>
          <div className="dc-cartao" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <span className="flex min-w-0 flex-col">
              <span className="dc-cartao__titulo">{nomeDoTipo}</span>
              <span className="dc-cartao__linha">{sobreOPrazo}</span>
            </span>
            <Botao variante="fantasma" onClick={() => setTrocando(true)}>
              Trocar
            </Botao>
          </div>
        </section>
        <section className="dc-secao">
          <span className="dc-rotulo">A IA vai ler</span>
          <div className="dc-painel">{leu}</div>
        </section>
        <section className="dc-secao">
          <span className="dc-rotulo">Instruções</span>
          <div className="dc-campo">{campoInstrucoes}</div>
        </section>
        {(texto || edicao !== null) && (
          <section className="dc-secao">
            <div className="dc-secao__topo">
              <span className="inline-flex items-center gap-2 font-semibold">
                <MarcaIa /> {gerando ? "Escrevendo…" : revisada ? "Peça revisada" : "Rascunho pronto"}
              </span>
              {quandoGerou && <span className="dc-nota">{quandoGerou}</span>}
            </div>
            <div className="dc-folha-fundo">{folha}</div>
            <p className="dc-nota m-0">Gerado por IA. Confira nos autos antes de protocolar.</p>
          </section>
        )}
        {trocar}
      </TelaCelular>
    );
  }

  return (
    <Pagina>
      <div className="flex flex-col gap-3">
        <Trilha>
          {p.prazo ? <Link to="/prazos">Prazos</Link> : <Link to="/processos">Processos</Link>}
          {p.prazo ? (
            <Link to="/prazos/$id" params={{ id: p.prazo.id }}>
              {p.prazo.tipo}
            </Link>
          ) : (
            <Link to="/processos/$id" params={{ id: p.processo.id }}>
              {p.processo.titulo}
            </Link>
          )}
          <span>Gerar peça</span>
        </Trilha>
        <TopoDoDetalhe
          titulo="Gerar peça"
          sobre={
            <>
              <strong>{p.processo.titulo}</strong> · <Cnj cnj={p.processo.cnj} />
              {p.prazo && ` · vence ${diaMes(p.prazo.fim)}`}
            </>
          }
          acoes={
            edicao !== null ? (
              acoesDaEdicao
            ) : (
              <>
                {texto && !gerando && !revisada && pecaId && (
                  <Botao variante="fantasma" onClick={() => salvar.mutate({ situacao: "revisada" })}>
                    <Check /> Marcar como revisada
                  </Botao>
                )}
                <Botao onClick={editar} disabled={gerando || (!pecaId && iaLigada)}>
                  <Pencil /> Editar texto
                </Botao>
                {docx ? (
                  <a className="dc-btn dc-btn--primaria dc-btn--md" href={docx} download>
                    <Download /> Baixar DOCX no timbre
                  </a>
                ) : (
                  <Botao variante="primaria" disabled>
                    <Download /> Baixar DOCX no timbre
                  </Botao>
                )}
              </>
            )
          }
        />
      </div>
      {semIa}
      <div className="dc-colunas dc-colunas--esquerda">
        <div className="dc-pilha">
          <Painel titulo="Tipo de peça" acao={catalogo.data && <span className="dc-nota">{catalogo.data.total} modelos</span>} corpo={false}>
            <EscolherTipo catalogo={catalogo.data} tipo={tipo} aoEscolher={setTipo} />
          </Painel>
          <Painel titulo="A IA lê" corpo={false}>
            {leu}
          </Painel>
          <Painel titulo="Instruções" acao={<span className="dc-nota">opcional</span>}>
            <div className="dc-campo">{campoInstrucoes}</div>
            {botaoGerar(true)}
          </Painel>
        </div>
        <section className="dc-painel">
          <div className="dc-painel__topo">
            <span className="inline-flex min-w-0 items-center gap-2">
              <MarcaIa />
              <span className="dc-painel__titulo">{gerando ? "Escrevendo…" : revisada ? "Peça revisada" : "Rascunho"}</span>
              {texto && !gerando && (
                <span className="dc-nota">
                  {quandoGerou ? `gerado ${quandoGerou} · ` : ""}
                  {paginas(texto)} {paginas(texto) === 1 ? "página" : "páginas"}
                </span>
              )}
            </span>
            <span className="dc-nota">Gerado por IA. Confira nos autos antes de protocolar.</span>
          </div>
          <div className="dc-folha-fundo">{folha}</div>
        </section>
      </div>
      {trocar}
    </Pagina>
  );
}

function EscolherTipo({ catalogo, tipo, aoEscolher }: { catalogo: Catalogo | undefined; tipo: string; aoEscolher: (t: string) => void }) {
  const doTipo = catalogo?.grupos.find((g) => g.tipos.some((t) => t.id === tipo))?.nome ?? null;
  const [aberto, setAberto] = useState<string | null>(null);
  const grupoAberto = aberto ?? doTipo;
  if (!catalogo) return <Carregando linhas={3} />;
  return (
    <div className="dc-catalogo" role="listbox" aria-label="Tipo de peça">
      {catalogo.grupos.map((g) => (
        <Fragment key={g.nome}>
          <button type="button" className={cn(grupoAberto === g.nome && "is-grupo-on")} aria-expanded={grupoAberto === g.nome} onClick={() => setAberto(grupoAberto === g.nome ? "" : g.nome)}>
            <span>{g.nome}</span>
            <span>{g.tipos.length}</span>
          </button>
          {grupoAberto === g.nome &&
            g.tipos.map((t) => (
              <button key={t.id} type="button" role="option" aria-selected={t.id === tipo} className={cn("dc-catalogo__tipo", t.id === tipo && "is-on")} onClick={() => aoEscolher(t.id)}>
                <span>{t.nome}</span>
                {t.id === tipo ? <Check /> : <span />}
              </button>
            ))}
        </Fragment>
      ))}
    </div>
  );
}

function Inline({ texto }: { texto: string }) {
  return (
    <>
      {trechos(texto).map((t, i) =>
        t.marcar ? (
          <mark key={i}>{t.texto}</mark>
        ) : t.negrito ? (
          <strong key={i}>{t.texto}</strong>
        ) : t.italico ? (
          <em key={i}>{t.texto}</em>
        ) : (
          <Fragment key={i}>{t.texto}</Fragment>
        ),
      )}
    </>
  );
}

/** A peça como o DOCX vai sair: timbre no alto, endereçamento, seções e parágrafos com recuo. */
export function Folha({ texto, timbre, escrevendo }: { texto: string; timbre: Timbre; escrevendo?: boolean }) {
  const cor = timbre.cor ? (timbre.cor.startsWith("#") ? timbre.cor : `#${timbre.cor}`) : undefined;
  const linha = [timbre.registro, timbre.endereco, timbre.contato].filter(Boolean).join(" · ");
  const saida: ReactNode[] = [];
  let lista: { numerado: boolean; itens: string[] } | null = null;
  const fecharLista = () => {
    if (!lista) return;
    const Tag = lista.numerado ? "ol" : "ul";
    saida.push(
      <Tag key={saida.length}>
        {lista.itens.map((i, n) => (
          <li key={n}>
            <Inline texto={i} />
          </li>
        ))}
      </Tag>,
    );
    lista = null;
  };
  for (const b of blocos(texto) as Bloco[]) {
    if (b.tipo === "item") {
      if (lista && lista.numerado !== b.numerado) fecharLista();
      lista ??= { numerado: b.numerado, itens: [] };
      lista.itens.push(b.texto);
      continue;
    }
    fecharLista();
    const k = saida.length;
    if (b.tipo === "enderecamento")
      saida.push(
        <p key={k} className="dc-folha__enderecamento">
          <Inline texto={b.texto} />
        </p>,
      );
    else if (b.tipo === "secao")
      saida.push(
        <h2 key={k}>
          <Inline texto={b.texto} />
        </h2>,
      );
    else if (b.tipo === "subtitulo")
      saida.push(
        <h3 key={k}>
          <Inline texto={b.texto} />
        </h3>,
      );
    else
      saida.push(
        <p key={k}>
          <Inline texto={b.texto} />
        </p>,
      );
  }
  fecharLista();
  return (
    <article className="dc-folha" aria-busy={escrevendo || undefined}>
      <header className="dc-folha__timbre" style={cor ? { borderColor: cor } : undefined}>
        <strong style={cor ? { color: cor } : undefined}>{timbre.nome}</strong>
        {linha && <span>{linha}</span>}
      </header>
      {saida}
      {escrevendo && <span className="dc-ia__cursor" aria-hidden />}
    </article>
  );
}
