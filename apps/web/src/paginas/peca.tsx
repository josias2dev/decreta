/**
 * Gerar peça. À esquerda o pedido em três passos (o tipo, o que a IA lê e as
 * instruções), com o botão de gerar sempre à vista; à direita a peça como vai
 * sair. Antes de gerar, a folha mostra as partes do tipo escolhido no timbre,
 * com quem assina; depois, o rascunho, que a pessoa revisa, edita e baixa.
 */
import { blocos, partesDaPeca, trechos, type Bloco } from "@decreta/core";
import * as Popover from "@radix-ui/react-popover";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { BookMarked, Check, ChevronDown, ChevronsUpDown, Download, FolderOpen, ListChecks, Pencil, RefreshCw, Search, Sparkles, type LucideIcon } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { Botao, Campo, Carregando, Cnj, Faixa, MarcaIa, RetornoDaIa, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { API_URL, aosPoucos, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante, diaMes, hora } from "@/lib/formato";
import type { Catalogo, Escritorio, Peca, PreparoDaPeca, ProcessoResumido, Timbre, TipoDePeca } from "@/lib/tipos";
import { cn } from "@/lib/util";

const paginas = (texto: string) => Math.max(1, Math.round(texto.length / 2800));
const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"];

/** O exemplo na caixa de instruções, pelo tipo e, sem um próprio, pelo grupo. */
const EXEMPLO_DO_TIPO: Record<string, string> = {
  "manifestacao-laudo": "Ex.: concordar com o laudo e pedir o julgamento; rebater a falta de vistoria.",
  juntada: "Ex.: juntar a procuração atualizada e o comprovante de residência.",
  "especificacao-provas": "Ex.: prova testemunhal com três testemunhas e perícia médica.",
  "cumprimento-sentenca": "Ex.: valor atualizado de R$ 18.400,00, com a multa de 10%.",
  "embargos-declaracao": "Ex.: a sentença não tratou do pedido de lucros cessantes.",
  outro: "Diga qual é a peça e o que ela deve pedir.",
};
const EXEMPLO_DO_GRUPO: Record<string, string> = {
  "Petições iniciais": "Ex.: pedir tutela de urgência para restabelecer o plano e dano moral de R$ 10 mil.",
  Defesas: "Ex.: alegar prescrição e impugnar o valor do dano moral.",
  Recursos: "Ex.: atacar a falta de fundamentação sobre o nexo causal.",
  Manifestações: "Ex.: o que pedir, o que rebater e o que destacar.",
  "Extrajudicial e consultivo": "Ex.: prazo de 10 dias para pagar, sob pena de ação.",
};

export function PecaPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/pecas" });
  const navigate = useNavigate({ from: "/pecas" });
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);

  const [tipoEscolhido, setTipo] = useState<string | null>(null);
  const pecaSalva = useQuery({ queryKey: ["peca", search.id], queryFn: () => api<Peca>(`/pecas/${search.id}`), enabled: !!search.id });
  const prazoId = search.prazo ?? pecaSalva.data?.prazoId ?? undefined;
  const processoId = search.processo ?? pecaSalva.data?.processoId;
  const consulta = prazoId ? `prazo=${prazoId}` : processoId ? `processo=${processoId}` : null;
  // O tipo vai junto: "O que a IA lê" mostra os modelos do escritório daquele tipo.
  const prep = useQuery({
    queryKey: ["pecas", "preparar", consulta, tipoEscolhido],
    queryFn: () => api<PreparoDaPeca>(`/pecas/preparar?${consulta}${tipoEscolhido ? `&tipo=${encodeURIComponent(tipoEscolhido)}` : ""}`),
    enabled: !!consulta,
    placeholderData: (a: PreparoDaPeca | undefined) => a,
  });
  const catalogo = useQuery({ queryKey: ["pecas", "catalogo"], queryFn: () => api<Catalogo>("/pecas/catalogo"), staleTime: Infinity });
  const escritorio = useQuery({ queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") });

  const pecaId = search.id ?? prep.data?.ultima?.id;
  const peca = pecaSalva.data ?? (prep.data?.ultima && pecaId === prep.data.ultima.id ? prep.data.ultima : undefined);

  const [instrucoesDigitadas, setInstrucoes] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [edicao, setEdicao] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  // O tipo sob o mouse na lista de tipos: a folha vazia mostra as partes dele antes da escolha.
  const [tipoEmVista, setTipoEmVista] = useState<string | null>(null);
  // No celular, com o rascunho pronto, o pedido fica num resumo; "Ajustar" abre os passos de novo.
  const [ajustando, setAjustando] = useState(false);
  // No computador só o papel do rascunho rola (no celular, a tela toda).
  const papel = useRef<HTMLDivElement>(null);
  const lido = useRef(0);

  const tipo = tipoEscolhido ?? peca?.tipo ?? prep.data?.tipoSugerido ?? "";
  const instrucoes = instrucoesDigitadas ?? peca?.instrucoes ?? "";
  const texto = aoVivo ?? peca?.texto ?? "";
  const editando = edicao !== null;
  useAcompanharAIa(papel, gerando, texto);
  // Lendo ou editando, o papel fica no mesmo ponto do texto, e não volta ao começo.
  useLayoutEffect(() => {
    const el = papel.current;
    if (el) el.scrollTop = lido.current * (el.scrollHeight - el.clientHeight);
  }, [editando]);
  const tipoNoCatalogo = (id: string) => {
    for (const g of catalogo.data?.grupos ?? []) {
      const t = g.tipos.find((x) => x.id === id);
      if (t) return { ...t, grupo: g.nome };
    }
    return undefined;
  };
  const tipoAtual = tipoNoCatalogo(tipo);
  const nomeDoTipo = tipoAtual?.nome ?? "Escolha o tipo";

  async function gerar() {
    if (!prep.data) return;
    setGerando(true);
    setAoVivo("");
    setEdicao(null);
    setAjustando(false);
    setTipoEmVista(null);
    // Com o pedido em cima da peça (tablet), a tela desce até a folha para ver a IA escrevendo.
    const rascunho = papel.current?.closest(".dc-peca__rascunho");
    if (rascunho && rascunho.getBoundingClientRect().top > window.innerHeight * 0.6) rascunho.scrollIntoView({ behavior: "smooth", block: "start" });
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
        // O endereço ganha o id sem levar a tela ao começo. Esperar a troca evita que o rascunho suma por um instante.
        await navigate({ search: (s) => ({ ...s, id }), replace: true, resetScroll: false });
      }
    } catch (err) {
      avisar(mensagemDoErro(err), { erro: true });
    } finally {
      setGerando(false);
      setAoVivo(null);
    }
  }

  const salvar = useMutation({
    mutationFn: async (corpo: { texto?: string; situacao?: "rascunho" | "revisada" }) => {
      if (pecaId) return api(`/pecas/${pecaId}`, { method: "PUT", json: corpo });
      // Primeira vez, escrita à mão: cria a peça.
      const r = await api<{ id: string }>("/pecas/manual", { json: { processoId: prep.data!.processo.id, prazoId: prep.data!.prazo?.id ?? null, tipo, texto: corpo.texto ?? "" } });
      await qc.fetchQuery({ queryKey: ["peca", r.id], queryFn: () => api<Peca>(`/pecas/${r.id}`) });
      void navigate({ search: (s) => ({ ...s, id: r.id }), replace: true, resetScroll: false });
      return r;
    },
    onSuccess: (_r, corpo) => {
      void qc.invalidateQueries({ queryKey: ["peca", pecaId] });
      void qc.invalidateQueries({ queryKey: ["pecas", "preparar"] });
      if (corpo.texto !== undefined) setEdicao(null);
      avisar(corpo.situacao === "revisada" ? "Peça marcada como revisada, com o seu nome." : "Texto salvo.");
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
  const quandoGerou = peca && !gerando ? `${diaDoInstante(peca.atualizadaEm) === eu.data?.hoje ? "às" : `em ${diaCurto(diaDoInstante(peca.atualizadaEm))} às`} ${hora(peca.atualizadaEm)}` : null;
  const revisada = peca?.situacao === "revisada";
  const revisao = pecaSalva.data?.revisao;
  const quemRevisou = revisao
    ? [revisao.por ? `Revisada por ${revisao.por.apelido}` : "Revisada", revisao.por?.oab, `${diaDoInstante(revisao.em) === eu.data?.hoje ? "hoje" : diaCurto(diaDoInstante(revisao.em))} às ${hora(revisao.em)}`].filter(Boolean).join(" · ")
    : null;
  const podeAvaliar = !!pecaId && !!texto && !gerando && edicao === null;
  const revisar = () => salvar.mutate({ situacao: "revisada" });
  const comRascunho = !!texto || editando;
  // Mudou o tipo ou as instruções depois do rascunho: gerar de novo volta a ser o principal.
  const mudouOPedido = !!peca?.texto && !gerando && (tipo !== peca.tipo || instrucoes.trim() !== (peca.instrucoes ?? "").trim());
  const livre = tipo === "outro";
  const faltaDizer = livre && !instrucoes.trim();
  const sugerido = p.prazo && tipo === p.tipoSugerido && tipo !== "outro" ? "sugerido pelo prazo" : null;
  const { partes } = partesDaPeca(tipoAtual?.estrutura ?? "");

  const escolherTipo = (t: string) => {
    setTipo(t);
    setTipoEmVista(null);
  };
  const seletor = (
    <SeletorDeTipo catalogo={catalogo.data} tipo={tipo} nome={nomeDoTipo} sugerido={p.prazo ? p.tipoSugerido : null} aoEscolher={escolherTipo} aoVer={comRascunho ? undefined : setTipoEmVista} />
  );
  const campoInstrucoes = (
    <div className="dc-campo">
      <textarea
        aria-label="Instruções para a IA"
        rows={4}
        value={instrucoes}
        onChange={(e) => setInstrucoes(e.target.value)}
        placeholder={EXEMPLO_DO_TIPO[tipo] ?? EXEMPLO_DO_GRUPO[tipoAtual?.grupo ?? ""] ?? EXEMPLO_DO_GRUPO["Manifestações"]}
        className="dc-pedido__instrucoes"
      />
    </div>
  );
  const passos = (
    <>
      <Passo n={1} titulo="Tipo de peça" nota={sugerido}>
        {seletor}
        <p className="dc-pedido__efeito">{celular && partes.length && !livre ? `Partes: ${partes.map((x) => x.replace(/\s*\(.*\)$/, "")).join(" · ")}.` : livre ? "A IA monta as partes pelo que você disser nas instruções." : "Define as partes da peça e a ordem delas."}</p>
      </Passo>
      <Passo n={2} titulo="O que a IA lê">
        <Fontes p={p} />
      </Passo>
      <Passo n={3} titulo="Instruções" nota={livre ? "necessário" : "opcional"}>
        {campoInstrucoes}
        <p className="dc-pedido__efeito">O que pedir, rebater ou destacar. A IA segue isto antes do modelo.</p>
      </Passo>
    </>
  );
  const assinatura = (
    <p className="dc-pedido__assina">
      No timbre do escritório
      {p.assina && (
        <>
          , assinada por <strong>{p.assina.nome}</strong>
          {p.assina.oab && ` · ${p.assina.oab}`}
        </>
      )}
    </p>
  );
  const rotuloGerar = gerando ? "Escrevendo…" : texto ? "Gerar de novo" : "Gerar peça";
  const botaoGerar = (bloco: boolean) => (
    <Botao variante={!texto || mudouOPedido || ajustando ? "primaria" : "secundaria"} bloco={bloco} onClick={() => void gerar()} ocupado={gerando} disabled={!iaLigada || !tipo || faltaDizer}>
      {texto && !gerando ? <RefreshCw /> : <Sparkles />} {rotuloGerar}
    </Botao>
  );
  const semIa = !iaLigada && <Faixa tipo="aviso">A IA ainda não está ligada neste escritório. Dá para escrever a peça à mão e baixar no timbre.</Faixa>;

  const folha =
    edicao !== null ? (
      <Editor valor={edicao} aoMudar={setEdicao} focar={!texto || (!celular && lido.current < 0.01)} />
    ) : texto ? (
      <Folha texto={texto} timbre={timbre} escrevendo={gerando} />
    ) : (
      <Estrutura tipo={tipoNoCatalogo(tipoEmVista ?? tipo)} timbre={timbre} processo={p.processo} assina={p.assina} />
    );
  const editar = () => setEdicao(texto || "# Excelentíssimo Senhor Doutor Juiz de Direito\n\n");
  const acoesDaEdicao = edicao !== null && (
    <>
      <Botao variante="fantasma" onClick={() => setEdicao(null)}>
        Cancelar
      </Botao>
      <Botao variante="primaria" onClick={() => salvar.mutate({ texto: edicao })} ocupado={salvar.isPending} disabled={!pecaId && (!prep.data || !tipo || !edicao?.trim())}>
        Salvar texto
      </Botao>
    </>
  );

  const guardar = peca && pecaId && <GuardarComoModelo pecaId={pecaId} titulo={peca.titulo} aberto={guardando} aoFechar={() => setGuardando(false)} />;

  if (celular) {
    const resumo = [`${p.documentos.length} ${p.documentos.length === 1 ? "documento" : "documentos"}`, p.briefing && "briefing", p.modelos.length && `${p.modelos.length} ${p.modelos.length === 1 ? "modelo" : "modelos"}`, instrucoes.trim() ? "com instruções" : "sem instruções"]
      .filter((x): x is string => !!x)
      .map((x) => x.replaceAll(" ", "\u00a0"))
      .join(" · ");
    return (
      <TelaCelular
        titulo="Gerar peça"
        sobre={p.processo.titulo}
        voltar
        rodape={
          edicao !== null ? (
            <div className="dc-rodape__par">{acoesDaEdicao}</div>
          ) : gerando ? (
            botaoGerar(true)
          ) : ajustando ? (
            <div className="dc-rodape__par">
              <Botao bloco onClick={() => setAjustando(false)}>
                Voltar ao rascunho
              </Botao>
              {botaoGerar(true)}
            </div>
          ) : texto ? (
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
          ) : iaLigada ? (
            <div className="dc-rodape__par">
              <Botao bloco onClick={editar}>
                <Pencil /> Escrever à mão
              </Botao>
              {botaoGerar(true)}
            </div>
          ) : (
            <Botao variante="primaria" bloco onClick={editar}>
              <Pencil /> Escrever à mão
            </Botao>
          )
        }
      >
        {semIa}
        {!comRascunho || ajustando ? (
          <>
            {passos}
            {iaLigada && assinatura}
          </>
        ) : (
          <button
            type="button"
            className="dc-cartao dc-pedido-resumo"
            onClick={() => {
              setAjustando(true);
              window.scrollTo({ top: 0 });
            }}
            aria-label={`Pedido: ${nomeDoTipo}. Ajustar`}
          >
            <span className="flex min-w-0 flex-col">
              <span className="dc-cartao__titulo">{nomeDoTipo}</span>
              <span className="dc-cartao__linha">{resumo}</span>
            </span>
            <span className="dc-link">Ajustar</span>
          </button>
        )}
        {comRascunho && !ajustando && (
          <section className="dc-secao">
            <div className="dc-secao__topo">
              <span className="inline-flex items-center gap-2 font-semibold">
                <MarcaIa /> {gerando ? "Escrevendo…" : revisada ? "Peça revisada" : editando ? "Editando o texto" : "Rascunho pronto"}
              </span>
              {quandoGerou && <span className="dc-nota">{quandoGerou}</span>}
            </div>
            <div className="dc-folha-fundo">{folha}</div>
            <div className="dc-peca__pe dc-peca__pe--solto">
              <span>Gerado por IA. Confira nos autos antes de protocolar.</span>
              {podeAvaliar && <RetornoDaIa key={pecaId} alvo={{ pecaId: pecaId! }} />}
            </div>
            {podeAvaliar &&
              (revisada ? (
                <>
                  {quemRevisou && (
                    <Faixa tipo="ok">
                      <Check /> {quemRevisou}
                    </Faixa>
                  )}
                  <Botao bloco onClick={() => setGuardando(true)}>
                    <BookMarked /> Guardar como modelo
                  </Botao>
                </>
              ) : (
                <Botao bloco onClick={revisar} ocupado={salvar.isPending && salvar.variables?.situacao === "revisada"}>
                  <Check /> Marcar como revisada
                </Botao>
              ))}
          </section>
        )}
        {guardar}
      </TelaCelular>
    );
  }

  const emVista = tipoEmVista && tipoEmVista !== tipo ? tipoNoCatalogo(tipoEmVista) : undefined;
  return (
    <Pagina cheia className="dc-pagina--peca">
      <div className="dc-topo-pagina">
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
            edicao !== null
              ? acoesDaEdicao
              : texto && (
                  <>
                    <Botao onClick={editar} disabled={gerando}>
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
      <div className="dc-colunas dc-colunas--esquerda dc-peca">
        <aside className="dc-painel dc-pedido" aria-label="Pedido para a IA">
          <div className="dc-pedido__passos dc-rola">{passos}</div>
          <div className="dc-pedido__pe">
            {iaLigada ? (
              <>
                {mudouOPedido && <p className="dc-pedido__aviso">O pedido mudou. Gerar de novo troca o rascunho.</p>}
                {botaoGerar(true)}
                {assinatura}
              </>
            ) : (
              <>
                <Botao variante="primaria" bloco onClick={editar} disabled={editando}>
                  <Pencil /> Escrever à mão
                </Botao>
                <p className="dc-pedido__assina">A IA ainda não está ligada neste escritório. Dá para escrever a peça à mão e baixar no timbre.</p>
              </>
            )}
          </div>
        </aside>
        <section className="dc-painel dc-peca__rascunho">
          <div className="dc-painel__topo">
            <span className="inline-flex min-w-0 items-center gap-2">
              {comRascunho && <MarcaIa />}
              <span className="dc-painel__titulo whitespace-nowrap">{editando ? "Editando o texto" : gerando ? "Escrevendo…" : revisada ? "Peça revisada" : texto ? "Rascunho" : "Como a peça vai sair"}</span>
              {texto && !gerando ? (
                <span className="dc-nota truncate">
                  {quandoGerou ? `gerado ${quandoGerou} · ` : ""}
                  {paginas(texto)} {paginas(texto) === 1 ? "página" : "páginas"}
                </span>
              ) : (
                emVista && !comRascunho && <span className="dc-nota truncate">vendo {emVista.nome}</span>
              )}
            </span>
            {!comRascunho && iaLigada && (
              <Botao variante="fantasma" pequeno onClick={editar}>
                <Pencil /> Escrever à mão
              </Botao>
            )}
          </div>
          <div
            ref={papel}
            className="dc-folha-fundo dc-rola"
            data-scroll-restoration-id="rascunho"
            onScroll={(e) => {
              const el = e.currentTarget;
              const fim = el.scrollHeight - el.clientHeight;
              lido.current = fim > 0 ? el.scrollTop / fim : 0;
            }}
          >
            {folha}
          </div>
          {comRascunho ? (
            <div className="dc-peca__pe">
              {revisada && quemRevisou && !gerando ? (
                <span className="dc-peca__revisada">
                  <Check aria-hidden /> {quemRevisou}
                </span>
              ) : (
                <span>Gerado por IA. Confira nos autos antes de protocolar.</span>
              )}
              {/* Revisar fica junto do aviso: quem confere a peça assina embaixo dela. */}
              {podeAvaliar &&
                (revisada ? (
                  <Botao pequeno onClick={() => setGuardando(true)}>
                    <BookMarked /> Guardar como modelo
                  </Botao>
                ) : (
                  <Botao pequeno onClick={revisar} ocupado={salvar.isPending && salvar.variables?.situacao === "revisada"}>
                    <Check /> Marcar como revisada
                  </Botao>
                ))}
              {podeAvaliar && <RetornoDaIa key={pecaId} alvo={{ pecaId: pecaId! }} />}
            </div>
          ) : (
            <div className="dc-peca__pe">Uma prévia das partes. A IA escreve cada uma com os fatos dos autos.</div>
          )}
        </section>
      </div>
      {guardar}
    </Pagina>
  );
}

/** Um passo do pedido: o número, o título e, à direita, uma nota curta. */
function Passo({ n, titulo, nota, children }: { n: number; titulo: string; nota?: ReactNode; children: ReactNode }) {
  return (
    <section className="dc-pedido__passo" aria-label={titulo}>
      <div className="dc-pedido__topo">
        <span className="dc-pedido__n" aria-hidden>
          {n}
        </span>
        <h2 className="dc-pedido__titulo">{titulo}</h2>
        {nota && <span className="dc-pedido__nota">{nota}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * O tipo de peça num campo de escolha. No computador abre uma lista com busca
 * logo embaixo; no celular, uma folha que sobe de baixo.
 */
function SeletorDeTipo({
  catalogo,
  tipo,
  nome,
  sugerido,
  aoEscolher,
  aoVer,
}: {
  catalogo: Catalogo | undefined;
  tipo: string;
  nome: string;
  sugerido: string | null;
  aoEscolher: (t: string) => void;
  aoVer?: (t: string | null) => void;
}) {
  const celular = useCelular();
  const [aberto, setAberto] = useState(false);
  const abrir = (v: boolean) => {
    setAberto(v);
    if (!v) aoVer?.(null);
  };
  const escolher = (t: string) => {
    aoEscolher(t);
    abrir(false);
  };
  const gatilho = (
    <button type="button" className="dc-seletor" aria-haspopup="listbox" aria-expanded={aberto} onClick={celular ? () => abrir(true) : undefined}>
      <span className="dc-seletor__nome">{nome}</span>
      <ChevronsUpDown aria-hidden />
    </button>
  );
  const lista = catalogo ? <ListaDeTipos catalogo={catalogo} tipo={tipo} sugerido={sugerido} aoEscolher={escolher} aoVer={aoVer} focar={!celular} /> : <Carregando linhas={3} />;
  if (celular)
    return (
      <>
        {gatilho}
        <Dialogo aberto={aberto} aoFechar={() => abrir(false)} titulo="Tipo de peça" className="dc-dialogo--tipos">
          {lista}
        </Dialogo>
      </>
    );
  return (
    <Popover.Root open={aberto} onOpenChange={abrir}>
      <Popover.Trigger asChild>{gatilho}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="dc-menu-flutuante dc-tipos-flutuante" align="start" sideOffset={4} collisionPadding={12}>
          {lista}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function ListaDeTipos({
  catalogo,
  tipo,
  sugerido,
  aoEscolher,
  aoVer,
  focar,
}: {
  catalogo: Catalogo;
  tipo: string;
  sugerido: string | null;
  aoEscolher: (t: string) => void;
  aoVer?: (t: string | null) => void;
  focar: boolean;
}) {
  const [busca, setBusca] = useState("");
  const [ativo, setAtivo] = useState(tipo);
  const lista = useRef<HTMLDivElement>(null);
  const termo = semAcento(busca.trim());
  const grupos = catalogo.grupos.map((g) => ({ ...g, tipos: termo ? g.tipos.filter((t) => semAcento(`${t.nome} ${g.nome}`).includes(termo)) : g.tipos })).filter((g) => g.tipos.length);
  const todos = grupos.flatMap((g) => g.tipos);
  useLayoutEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  }, []);
  const ver = (id: string) => {
    setAtivo(id);
    aoVer?.(id);
  };
  const teclas = (e: KeyboardEvent<HTMLInputElement>) => {
    const i = todos.findIndex((t) => t.id === ativo);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const prox = todos[(i + (e.key === "ArrowDown" ? 1 : -1) + todos.length) % todos.length];
      if (!prox) return;
      ver(prox.id);
      lista.current?.querySelector(`[data-tipo="${prox.id}"]`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const t = todos[i] ?? todos[0];
      if (t) aoEscolher(t.id);
    }
  };
  return (
    <div className="dc-tipos">
      <label className="dc-tipos__busca">
        <Search aria-hidden />
        <input
          autoFocus={focar}
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setAtivo("");
          }}
          onKeyDown={teclas}
          placeholder="Buscar tipo de peça"
          aria-label="Buscar tipo de peça"
        />
      </label>
      <div ref={lista} className="dc-tipos__lista dc-rola" role="listbox" aria-label="Tipos de peça" onMouseLeave={() => aoVer?.(null)}>
        {grupos.map((g) => (
          <div key={g.nome} role="group" aria-label={g.nome}>
            <div className="dc-tipos__grupo" aria-hidden>
              {g.nome}
            </div>
            {g.tipos.map((t) => (
              <button
                key={t.id}
                type="button"
                role="option"
                data-tipo={t.id}
                aria-selected={t.id === tipo}
                className={cn("dc-tipos__item", t.id === ativo && "is-ativo")}
                onMouseEnter={() => ver(t.id)}
                onClick={() => aoEscolher(t.id)}
              >
                <span>{t.nome}</span>
                {t.id === sugerido && t.id !== "outro" && <span className="dc-tipos__sugerido">do prazo</span>}
                {t.id === tipo && <Check aria-hidden />}
              </button>
            ))}
          </div>
        ))}
        {!todos.length && <p className="dc-tipos__nada">Nenhum tipo com “{busca.trim()}”. Escolha Outra peça e diga qual é nas instruções.</p>}
      </div>
    </div>
  );
}

/** O que a IA lê, cada um com o que faz na peça. Os autos e os modelos abrem a lista. */
function Fontes({ p }: { p: PreparoDaPeca }) {
  const [aberta, setAberta] = useState<"autos" | "modelos" | null>(null);
  const alternar = (q: "autos" | "modelos") => setAberta(aberta === q ? null : q);
  const m = p.modelos.length;
  return (
    <div className="dc-fontes">
      <Fonte icone={FolderOpen} titulo="Autos do processo" efeito="Fatos, datas e números saem só daqui" conta={p.documentos.length || undefined} aberta={aberta === "autos"} aoAbrir={() => alternar("autos")}>
        {[...p.documentos, "Dados do processo e as movimentações"].map((d) => (
          <li key={d}>{d}</li>
        ))}
      </Fonte>
      {p.briefing && <Fonte icone={ListChecks} titulo="Briefing do prazo" efeito="O que o juízo decidiu e o que fazer" />}
      <Fonte
        icone={BookMarked}
        titulo={m === 1 ? "Modelo do escritório" : "Modelos do escritório"}
        efeito={m ? "Estrutura e estilo, sem copiar os fatos" : "Nenhum deste tipo ainda"}
        conta={m || undefined}
        apagada={!m}
        aberta={aberta === "modelos"}
        aoAbrir={m ? () => alternar("modelos") : undefined}
      >
        {p.modelos.map((x) => (
          <li key={x.id}>{x.titulo}</li>
        ))}
      </Fonte>
    </div>
  );
}

function Fonte({
  icone: Icone,
  titulo,
  efeito,
  conta,
  apagada,
  aberta,
  aoAbrir,
  children,
}: {
  icone: LucideIcon;
  titulo: string;
  efeito: string;
  conta?: number;
  apagada?: boolean;
  aberta?: boolean;
  aoAbrir?: () => void;
  children?: ReactNode;
}) {
  const linha = (
    <>
      <Icone className="dc-fonte__icone" aria-hidden />
      <span className="dc-fonte__texto">
        <span className="dc-fonte__titulo">{titulo}</span>
        <span className="dc-fonte__efeito">{efeito}</span>
      </span>
      {conta != null && <span className="dc-fonte__conta">{conta}</span>}
      {aoAbrir && <ChevronDown className="dc-fonte__seta" aria-hidden />}
    </>
  );
  return (
    <div className={cn("dc-fonte", aberta && "is-aberta", apagada && "is-apagada")}>
      {aoAbrir ? (
        <button type="button" className="dc-fonte__linha" aria-expanded={!!aberta} onClick={aoAbrir}>
          {linha}
        </button>
      ) : (
        <div className="dc-fonte__linha">{linha}</div>
      )}
      {aberta && children && <ul className="dc-fonte__lista">{children}</ul>}
    </div>
  );
}

/**
 * A folha antes de gerar: o timbre, o endereçamento, as partes do tipo
 * escolhido (em linhas cinza, onde a IA vai escrever) e o fecho com quem
 * assina. Trocar o tipo troca as partes na hora.
 */
function Estrutura({ tipo, timbre, processo, assina }: { tipo: TipoDePeca | undefined; timbre: Timbre; processo: ProcessoResumido; assina: PreparoDaPeca["assina"] }) {
  if (!tipo)
    return (
      <div className="dc-folha">
        <Carregando linhas={6} />
      </div>
    );
  const { enderecamento, partes } = partesDaPeca(tipo.estrutura);
  const livre = tipo.id === "outro";
  return (
    <article key={tipo.id} className="dc-folha dc-estrutura" aria-label={`Partes da peça: ${tipo.nome}`}>
      <CabecalhoDoTimbre timbre={timbre} />
      {enderecamento && (
        <div className="dc-estrutura__enderecamento">
          <span>{enderecamento === "Endereçamento" && processo.orgao ? `Endereçamento · ${processo.orgao}` : enderecamento}</span>
          <i />
        </div>
      )}
      <p className="dc-estrutura__nome">{tipo.nome}</p>
      {(livre ? ["As partes que você descrever nas instruções"] : partes).map((parte, i) => (
        <section key={parte} className="dc-estrutura__parte">
          <h3>{livre ? parte : `${ROMANOS[i] ?? i + 1} – ${parte}`}</h3>
          <div className="dc-estrutura__linhas" aria-hidden>
            <i />
            <i />
            <i />
          </div>
        </section>
      ))}
      <footer className="dc-estrutura__fecho">
        <span>[cidade], [data].</span>
        <strong>{assina?.nome ?? "Quem assina"}</strong>
        {assina?.oab && <span>{assina.oab}</span>}
      </footer>
    </article>
  );
}

/**
 * Enquanto a IA escreve, a rolagem acompanha o fim do texto, como quem lê
 * junto. Subindo para reler, para de acompanhar; voltando ao fim, acompanha de
 * novo. Sem o papel (celular), quem rola é a tela.
 */
function useAcompanharAIa(papel: RefObject<HTMLElement | null>, escrevendo: boolean, texto: string) {
  const noFim = useRef(true);
  const alvo = () => papel.current ?? (document.scrollingElement as HTMLElement | null);
  useEffect(() => {
    const el = alvo();
    if (!escrevendo || !el) return;
    const fonte: HTMLElement | Window = el === document.scrollingElement ? window : el;
    const medir = () => {
      noFim.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96;
    };
    // Roda, dedo ou tecla para cima param na hora, antes do próximo pedaço de texto puxar para baixo.
    const subiu = (e: Event) => {
      if (e instanceof WheelEvent ? e.deltaY < 0 : e instanceof KeyboardEvent ? ["ArrowUp", "PageUp", "Home"].includes(e.key) : true) noFim.current = false;
    };
    medir();
    fonte.addEventListener("scroll", medir, { passive: true });
    fonte.addEventListener("wheel", subiu, { passive: true });
    fonte.addEventListener("touchmove", subiu, { passive: true });
    window.addEventListener("keydown", subiu);
    return () => {
      fonte.removeEventListener("scroll", medir);
      fonte.removeEventListener("wheel", subiu);
      fonte.removeEventListener("touchmove", subiu);
      window.removeEventListener("keydown", subiu);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrevendo]);
  useLayoutEffect(() => {
    const el = alvo();
    if (escrevendo && el && noFim.current) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escrevendo, texto]);
}

/**
 * O texto da peça para editar. A caixa cresce com o texto (a cópia escondida
 * ao lado dá a altura), então quem rola é o papel, sem rolagem dentro de rolagem.
 */
function Editor({ valor, aoMudar, focar }: { valor: string; aoMudar: (v: string) => void; focar: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const focarAoAbrir = useRef(focar);
  useEffect(() => {
    if (focarAoAbrir.current) ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="dc-folha">
      <div className="dc-folha__editor" data-texto={valor}>
        <textarea ref={ref} aria-label="Texto da peça" value={valor} onChange={(e) => aoMudar(e.target.value)} />
      </div>
    </div>
  );
}

/** Peça boa vira modelo: a IA segue o jeito dela nas próximas do mesmo tipo e assunto. */
function GuardarComoModelo({ pecaId, titulo, aberto, aoFechar }: { pecaId: string; titulo: string; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const inicial = () => ({ titulo, tese: "", assunto: "" });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const salvar = useMutation({
    mutationFn: () => api("/modelos", { json: { pecaId, titulo: f.titulo.trim(), tese: f.tese.trim() || null, assunto: f.assunto.trim() || null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["modelos"] });
      avisar("Guardada em Modelos. A IA segue este modelo nas próximas peças do tipo.");
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Guardar como modelo"
      descricao="A IA usa os modelos do escritório como referência de estrutura e argumentos. Os fatos e nomes deste caso não passam para os outros."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.titulo.trim().length < 2}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Nome do modelo" htmlFor="gm-titulo">
          <input id="gm-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </Campo>
        <Campo rotulo="Tese" htmlFor="gm-tese" ajuda="Opcional. Ajuda a IA e a busca a achar o modelo certo.">
          <textarea id="gm-tese" rows={2} value={f.tese} onChange={(e) => setF({ ...f, tese: e.target.value })} placeholder="Negativa de cobertura indevida; dano moral pela recusa." />
        </Campo>
        <Campo rotulo="Assunto" htmlFor="gm-assunto" ajuda="Opcional.">
          <input id="gm-assunto" value={f.assunto} onChange={(e) => setF({ ...f, assunto: e.target.value })} placeholder="Seguro de vida" />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
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
      <CabecalhoDoTimbre timbre={timbre} />
      {saida}
      {escrevendo && <span className="dc-ia__cursor" aria-hidden />}
    </article>
  );
}

function CabecalhoDoTimbre({ timbre }: { timbre: Timbre }) {
  const cor = timbre.cor ? (timbre.cor.startsWith("#") ? timbre.cor : `#${timbre.cor}`) : undefined;
  const linha = [timbre.registro, timbre.endereco, timbre.contato].filter(Boolean).join(" · ");
  return (
    <header className="dc-folha__timbre" style={cor ? { borderColor: cor } : undefined}>
      {timbre.logoDocumentoId && <img src={`/api/app/escritorio/logo?v=${timbre.logoDocumentoId}`} alt="" className="dc-folha__logo" />}
      <strong style={cor ? { color: cor } : undefined}>{timbre.nome}</strong>
      {linha && <span>{linha}</span>}
    </header>
  );
}
