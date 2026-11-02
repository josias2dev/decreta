/**
 * Gerar peça: escolhe o modelo, diz o que quer, a IA escreve no timbre e a
 * pessoa revisa, edita e baixa o DOCX.
 */
import { blocosComPosicao, lacunas, trechos, type BlocoNoTexto, type EstrategiaDaPeca, type FatoDaPeca } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { BookMarked, Check, CircleAlert, Download, FileText, ListTree, Pencil, RefreshCw } from "lucide-react";
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import { AjusteDaPecaPainel } from "@/componentes/ajuste-da-peca";
import { AntesDeProtocolar, AvisoAoBaixar, pontosAntesDeProtocolar, type PontoNaLista } from "@/componentes/antes-de-protocolar";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { EstrategiaDaPecaEditor } from "@/componentes/estrategia-da-peca";
import { DialogoDoFato, FatosDaPeca } from "@/componentes/fatos-da-peca";
import { FontesDoProcesso, TextoComFontes } from "@/componentes/fontes";
import { JulgadosDaPeca } from "@/componentes/julgados-da-peca";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { RegistroDeRevisao } from "@/componentes/revisao-da-peca";
import { VerificacaoDaPeca } from "@/componentes/verificacao-da-peca";
import { Botao, Campo, Carregando, Cnj, Faixa, MarcaIa, Painel, RetornoDaIa, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { API_URL, aosPoucos, api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante, diaMes, hora } from "@/lib/formato";
import type { Catalogo, Escritorio, Peca, PreparoDaPeca, RespostaDaEstrategia, Timbre } from "@/lib/tipos";
import { cn } from "@/lib/util";

/** Por quanto tempo o parágrafo fica em destaque depois de um clique em "Antes de protocolar". */
const DESTAQUE_DO_PONTO_MS = 1800;

const paginas = (texto: string) => Math.max(1, Math.round(texto.length / 2800));

export function PecaPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/pecas" });
  const navigate = useNavigate({ from: "/pecas" });
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);

  const [tipoEscolhido, setTipo] = useState<string | null>(search.tipo ?? null);
  const pecaSalva = useQuery({ queryKey: ["peca", search.id], queryFn: () => api<Peca>(`/pecas/${search.id}`), enabled: !!search.id });
  const prazoId = search.prazo ?? pecaSalva.data?.prazoId ?? undefined;
  const processoId = search.processo ?? pecaSalva.data?.processoId;
  const consulta = prazoId ? `prazo=${prazoId}` : processoId ? `processo=${processoId}` : null;
  // O tipo vai junto: a lista "A IA lê" mostra os modelos do escritório daquele tipo.
  const prep = useQuery({
    queryKey: ["pecas", "preparar", consulta, tipoEscolhido],
    queryFn: () => api<PreparoDaPeca>(`/pecas/preparar?${consulta}${tipoEscolhido ? `&tipo=${encodeURIComponent(tipoEscolhido)}` : ""}`),
    enabled: !!consulta,
    placeholderData: (a: PreparoDaPeca | undefined) => a,
  });
  const catalogo = useQuery({ queryKey: ["pecas", "catalogo"], queryFn: () => api<Catalogo>("/pecas/catalogo"), staleTime: Infinity });
  const escritorio = useQuery({ queryKey: ["escritorio"], queryFn: () => api<Escritorio>("/escritorio") });

  const pecaId = search.id ?? prep.data?.ultima?.id;
  // A peça inteira, com a conferência e os julgados: também quando ela veio do preparo, sem o id no endereço.
  const pecaAtual = useQuery({ queryKey: ["peca", pecaId], queryFn: () => api<Peca>(`/pecas/${pecaId}`), enabled: !!pecaId });
  const salva = pecaAtual.data;
  const peca = salva ?? (prep.data?.ultima && pecaId === prep.data.ultima.id ? prep.data.ultima : undefined);

  const [instrucoesDigitadas, setInstrucoes] = useState<string | null>(null);
  const [aoVivo, setAoVivo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [conferindo, setConferindo] = useState(false);
  const [edicao, setEdicao] = useState<string | null>(null);
  const [trocando, setTrocando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [fatoAberto, setFatoAberto] = useState<FatoDaPeca | null>(null);
  const [avisoAoBaixar, setAvisoAoBaixar] = useState(false);
  const [estrategiaAberta, setEstrategiaAberta] = useState<boolean | null>(null);
  /** O parágrafo em destaque depois de um clique em "Antes de protocolar". */
  const [blocoAtivo, setBlocoAtivo] = useState<number | null>(null);
  // No computador só o papel do rascunho rola (no celular, a tela toda).
  const papel = useRef<HTMLDivElement>(null);
  const campoDoEditor = useRef<HTMLTextAreaElement>(null);
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
  const tipos = catalogo.data?.grupos.flatMap((g) => g.tipos) ?? [];
  const nomeDoTipo = tipos.find((t) => t.id === tipo)?.nome ?? "Escolha o tipo";

  // A estratégia em edição fica guardada na sessão: abrir um documento e voltar não perde o que a pessoa mudou.
  const chaveDaEstrategia = ["pecas", "estrategia-em-edicao", consulta ?? search.id, tipo];
  const estrategiaEmEdicao = useQuery<EstrategiaDaPeca | null>({ queryKey: chaveDaEstrategia, queryFn: () => null, enabled: false, gcTime: Number.POSITIVE_INFINITY });
  const estrategia = estrategiaEmEdicao.data ?? (salva?.tipo === tipo ? salva.estrategia : null) ?? prep.data?.estrategia ?? null;
  const definirEstrategia = (e: EstrategiaDaPeca) => qc.setQueryData(chaveDaEstrategia, e);
  const montar = useMutation({
    mutationFn: () => api<RespostaDaEstrategia>("/pecas/estrategia", { json: { processoId: prep.data!.processo.id, prazoId: prep.data!.prazo?.id ?? null, tipo, instrucoes } }),
    onSuccess: (r) => {
      if (r.estrategia) {
        definirEstrategia(r.estrategia);
        setEstrategiaAberta(true);
      } else avisar(r.recusa ?? "A IA não conseguiu montar a estratégia agora. Tente de novo em instantes.", { erro: !r.recusa });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  async function conferirFatos(id: string) {
    setConferindo(true);
    try {
      await api(`/pecas/${id}/conferir-fatos`, { method: "POST" });
      await qc.fetchQuery({ queryKey: ["peca", id], queryFn: () => api<Peca>(`/pecas/${id}`) });
      void qc.invalidateQueries({ queryKey: ["pecas", "preparar"] });
    } catch (err) {
      avisar(mensagemDoErro(err), { erro: true });
    } finally {
      setConferindo(false);
    }
  }

  async function gerar(comEstrategia: EstrategiaDaPeca | null) {
    if (!prep.data) return;
    setGerando(true);
    setAoVivo("");
    setEdicao(null);
    setEstrategiaAberta(false);
    let gerada: string | null = null;
    try {
      const { headers } = await aosPoucos(
        "/pecas",
        { json: { processoId: prep.data.processo.id, prazoId: prep.data.prazo?.id ?? null, tipo, instrucoes, pecaId: pecaId ?? null, ...(comEstrategia ? { estrategia: comEstrategia } : {}) } },
        (t) => setAoVivo(t),
      );
      gerada = headers.get("x-peca-id");
      if (gerada) {
        const id = gerada;
        const nova = await qc.fetchQuery({ queryKey: ["peca", id], queryFn: () => api<Peca>(`/pecas/${id}`) });
        // Sem texto da IA (a geração falhou logo de saída), não há fato a conferir.
        if (!nova.geradaPorIa) gerada = null;
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
    // Antes de entregar, cada fato passa pela conferência. Falhou, o painel oferece conferir de novo.
    if (gerada) await conferirFatos(gerada);
  }

  function irAoPonto(p: PontoNaLista) {
    if (p.inicio === null) return;
    if (edicao !== null) {
      const caixa = campoDoEditor.current;
      if (!caixa) return;
      caixa.focus({ preventScroll: true });
      caixa.setSelectionRange(p.inicio, p.fim ?? p.inicio);
      // A caixa cresce com o texto: quem rola é o papel (no celular, a tela), na proporção do ponto.
      const rola = papel.current ?? (document.scrollingElement as HTMLElement);
      const topoDaCaixa = caixa.getBoundingClientRect().top - rola.getBoundingClientRect().top + rola.scrollTop;
      rola.scrollTop = topoDaCaixa + (p.inicio / Math.max(1, edicao.length)) * caixa.offsetHeight - rola.clientHeight / 2;
      return;
    }
    let alvo: HTMLElement | null = null;
    for (const el of document.querySelectorAll<HTMLElement>(".dc-folha [data-inicio]")) if (Number(el.dataset.inicio) <= p.inicio) alvo = el;
    if (!alvo) return;
    alvo.scrollIntoView({ block: "center" });
    setBlocoAtivo(Number(alvo.dataset.inicio));
    window.setTimeout(() => setBlocoAtivo(null), DESTAQUE_DO_PONTO_MS);
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
  const iaLigada = !!eu.data?.ia && !p.processo.semIa;
  const timbre = escritorio.data?.timbre ?? { nome: eu.data?.escritorio.nome ?? "" };
  const docx = pecaId && texto && !gerando ? `${API_URL}/api/app/pecas/${pecaId}/docx` : undefined;
  const sobreOPrazo = p.prazo ? `Sugerido pelo prazo de ${diaCurto(p.prazo.fim)}` : "Escolha o modelo da peça";
  const quandoGerou = peca && !gerando ? `${diaDoInstante(peca.atualizadaEm) === eu.data?.hoje ? "às" : `em ${diaCurto(diaDoInstante(peca.atualizadaEm))} às`} ${hora(peca.atualizadaEm)}` : null;
  const revisada = peca?.situacao === "revisada";
  const revisao = salva?.revisao;
  const quemRevisou = revisao
    ? [revisao.por ? `Revisada por ${revisao.por.apelido}` : "Revisada", revisao.por?.oab, `${diaDoInstante(revisao.em) === eu.data?.hoje ? "hoje" : diaCurto(diaDoInstante(revisao.em))} às ${hora(revisao.em)}`].filter(Boolean).join(" · ")
    : null;
  const podeAvaliar = !!pecaId && !!texto && !gerando && edicao === null;
  const revisar = () => salvar.mutate({ situacao: "revisada" });
  // Antes da revisão, o caminho é completar as lacunas e marcar como revisada; baixar vem depois.
  const aRevisar = podeAvaliar && !revisada;
  const faltam = aRevisar ? lacunas(texto) : 0;
  const avisoDasLacunas = faltam > 0 && (
    <Faixa tipo="aviso">
      <CircleAlert />
      <span>{faltam === 1 ? "Falta 1 lacuna no texto, marcada em amarelo." : `Faltam ${faltam} lacunas no texto, marcadas em amarelo.`} Complete antes de marcar como revisada.</span>
    </Faixa>
  );
  const revisando = salvar.isPending && salvar.variables?.situacao === "revisada";
  // A checagem roda no texto que está na tela, inclusive enquanto a pessoa edita.
  const textoDaChecagem = edicao ?? texto;
  const pontos = gerando ? [] : pontosAntesDeProtocolar(textoDaChecagem, salva?.partes ?? p.partes ?? [], salva);
  // Não bloqueia o download: mostra o que está em aberto, e baixar continua a um clique.
  const avisarAntesDeBaixar = (e: MouseEvent) => {
    if (!pontos.length) return;
    e.preventDefault();
    setAvisoAoBaixar(true);
  };
  const mostrarEstrategia = !gerando && edicao === null && !!estrategia && (estrategiaAberta ?? !texto);

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
      {p.modelos.map((m) => (
        <li key={m.id}>
          <BookMarked /> Modelo do escritório: {m.titulo}
        </li>
      ))}
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
    <Botao variante={texto || iaLigada ? "secundaria" : "primaria"} bloco={bloco} onClick={() => void gerar(salva?.estrategia ?? null)} ocupado={gerando} disabled={!iaLigada || !tipo || conferindo}>
      {texto ? <RefreshCw /> : <FileText />} {gerando ? "Escrevendo…" : texto ? "Gerar de novo" : iaLigada ? "Gerar direto" : "Gerar peça"}
    </Botao>
  );
  /** A estratégia vem antes da peça: é o caminho principal enquanto não há texto. */
  const botaoEstrategia = (bloco: boolean) =>
    iaLigada && (
      <Botao variante={texto ? "fantasma" : "primaria"} bloco={bloco} onClick={() => (estrategia ? setEstrategiaAberta(true) : montar.mutate())} ocupado={montar.isPending} disabled={!tipo || gerando || conferindo}>
        <ListTree /> {montar.isPending ? "Montando…" : estrategia ? "Rever a estratégia" : "Montar estratégia"}
      </Botao>
    );
  const acoesDaEstrategia = estrategia && (
    <>
      <Botao variante="fantasma" onClick={() => setEstrategiaAberta(false)}>
        Fechar
      </Botao>
      <Botao onClick={() => montar.mutate()} ocupado={montar.isPending}>
        Montar de novo
      </Botao>
      <Botao variante="primaria" onClick={() => void gerar(estrategia)} disabled={!tipo}>
        <FileText /> Gerar com esta estratégia
      </Botao>
    </>
  );
  const editorDaEstrategia = estrategia && <EstrategiaDaPecaEditor estrategia={estrategia} partes={salva?.partes ?? p.partes ?? []} aoMudar={definirEstrategia} />;
  const semIa = !iaLigada && <Faixa tipo="aviso">{p.processo.semIa ? "O cliente não autorizou o uso de IA." : "A IA ainda não está ligada neste escritório."} Dá para escrever a peça à mão e baixar no timbre.</Faixa>;

  const fatosAtuais = salva?.conferencia?.atual ? salva.conferencia.fatos : undefined;
  const folha =
    edicao !== null ? (
      <Editor valor={edicao} aoMudar={setEdicao} focar={!texto || (!celular && lido.current < 0.01)} campo={campoDoEditor} />
    ) : texto ? (
      <FontesDoProcesso processoId={p.processo.id}>
        <Folha texto={texto} timbre={timbre} escrevendo={gerando} fatos={fatosAtuais} aoAbrirFato={setFatoAberto} ativo={blocoAtivo} />
      </FontesDoProcesso>
    ) : (
      <div className="dc-folha">
        <Vazio titulo="Nenhum rascunho ainda">{iaLigada ? "Escolha o tipo, diga o que quer e gere. A IA escreve no timbre do escritório. Ou escreva à mão em Editar texto." : "Clique em Editar texto para escrever."}</Vazio>
      </div>
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

  // Confere o texto salvo: enquanto edita ou a IA escreve, não há o que conferir.
  const citacoes = podeAvaliar && salva && <VerificacaoDaPeca pecaId={pecaId!} verificacao={salva.verificacao} hoje={eu.data?.hoje} />;
  const registro = pecaId && salva && !gerando && <RegistroDeRevisao pecaId={pecaId} revisoes={salva.revisoes} hoje={eu.data?.hoje} folha={(t) => <Folha texto={t} timbre={timbre} />} />;
  const guardar = peca && pecaId && <GuardarComoModelo pecaId={pecaId} titulo={peca.titulo} aberto={guardando} aoFechar={() => setGuardando(false)} />;
  const antes = textoDaChecagem.trim() && !gerando && <AntesDeProtocolar pontos={pontos} aoIr={irAoPonto} />;
  const fatos = podeAvaliar && salva && <FatosDaPeca conferencia={salva.conferencia} conferindo={conferindo} iaLigada={iaLigada} aoConferir={() => void conferirFatos(pecaId!)} aoAbrir={setFatoAberto} />;
  const julgados = podeAvaliar && salva && <JulgadosDaPeca pecaId={pecaId!} texto={texto} julgados={salva.julgados} aoInserir={() => void qc.invalidateQueries({ queryKey: ["peca", pecaId] })} />;
  const ajuste = podeAvaliar && salva && iaLigada && <AjusteDaPecaPainel pecaId={pecaId!} texto={texto} aoAplicar={(novo) => salvar.mutate({ texto: novo })} aplicando={salvar.isPending} />;
  const dialogos = (
    <>
      <DialogoDoFato fato={fatoAberto} aoFechar={() => setFatoAberto(null)} />
      <AvisoAoBaixar aberto={avisoAoBaixar} pontos={pontos} docx={docx} aoFechar={() => setAvisoAoBaixar(false)} />
    </>
  );
  const pe = (solto: boolean) => (
    <div className={cn("dc-peca__pe", solto && "dc-peca__pe--solto")}>
      <span>Gerado por IA. Confira nos autos antes de protocolar.</span>
      {podeAvaliar && <RetornoDaIa key={pecaId} alvo={{ pecaId: pecaId! }} />}
    </div>
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
          ) : mostrarEstrategia ? (
            <>
              <Botao variante="primaria" bloco onClick={() => void gerar(estrategia)} disabled={!tipo}>
                <FileText /> Gerar com esta estratégia
              </Botao>
              <div className="dc-rodape__par">
                <Botao bloco variante="fantasma" onClick={() => setEstrategiaAberta(false)}>
                  Fechar
                </Botao>
                <Botao bloco onClick={() => montar.mutate()} ocupado={montar.isPending}>
                  Montar de novo
                </Botao>
              </div>
            </>
          ) : aRevisar ? (
            <>
              <Botao variante="primaria" bloco onClick={revisar} ocupado={revisando} disabled={conferindo}>
                <Check /> Marcar como revisada
              </Botao>
              <div className="dc-rodape__par">
                <Botao bloco onClick={editar} disabled={conferindo}>
                  <Pencil /> Editar
                </Botao>
                <a className="dc-btn dc-btn--secundaria dc-btn--md dc-btn--bloco" href={docx} download onClick={avisarAntesDeBaixar}>
                  <Download /> Baixar DOCX
                </a>
              </div>
            </>
          ) : texto && !gerando ? (
            <>
              <a className="dc-btn dc-btn--primaria dc-btn--md dc-btn--bloco" href={docx} download onClick={avisarAntesDeBaixar}>
                <Download /> Baixar DOCX no timbre
              </a>
              <div className="dc-rodape__par">
                <Botao bloco onClick={editar} disabled={conferindo}>
                  <Pencil /> Editar
                </Botao>
                {botaoGerar(true)}
              </div>
            </>
          ) : iaLigada ? (
            <>
              {botaoEstrategia(true)}
              <div className="dc-rodape__par">
                <Botao bloco onClick={editar} disabled={gerando}>
                  <Pencil /> Escrever
                </Botao>
                {botaoGerar(true)}
              </div>
            </>
          ) : (
            <Botao variante="primaria" bloco onClick={editar}>
              <Pencil /> Escrever à mão
            </Botao>
          )
        }
      >
        {semIa}
        {mostrarEstrategia && (
          <section className="dc-secao">
            <div className="dc-secao__topo">
              <span className="inline-flex items-center gap-2 font-semibold">
                <MarcaIa /> Estratégia da peça
              </span>
              <span className="dc-nota">edite antes de gerar</span>
            </div>
            {editorDaEstrategia}
          </section>
        )}
        {!mostrarEstrategia && (texto || edicao !== null) && (
          <section className="dc-secao">
            <div className="dc-secao__topo">
              <span className="inline-flex items-center gap-2 font-semibold">
                <MarcaIa /> {gerando ? "Escrevendo…" : conferindo ? "Conferindo os fatos…" : revisada ? "Peça revisada" : "Rascunho pronto"}
              </span>
              {quandoGerou && <span className="dc-nota">{quandoGerou}</span>}
            </div>
            {avisoDasLacunas}
            <div className="dc-folha-fundo">{folha}</div>
            {pe(true)}
            {podeAvaliar && revisada && (
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
            )}
          </section>
        )}
        {antes}
        {fatos}
        {julgados}
        {citacoes}
        {ajuste}
        <section className="dc-secao">
          <span className="dc-rotulo">Tipo de peça</span>
          <div className="dc-cartao dc-cartao--linha">
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
          {texto && botaoEstrategia(true)}
          {aRevisar && iaLigada && botaoGerar(true)}
        </section>
        {registro}
        {trocar}
        {guardar}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina cheia>
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
            edicao !== null ? (
              acoesDaEdicao
            ) : (
              <>
                {podeAvaliar && revisada && (
                  <Botao variante="fantasma" onClick={() => setGuardando(true)}>
                    <BookMarked /> Guardar como modelo
                  </Botao>
                )}
                <Botao onClick={editar} disabled={gerando || conferindo}>
                  <Pencil /> Editar texto
                </Botao>
                {aRevisar ? (
                  <>
                    <a className="dc-btn dc-btn--secundaria dc-btn--md" href={docx} download onClick={avisarAntesDeBaixar}>
                      <Download /> Baixar DOCX no timbre
                    </a>
                    <Botao variante="primaria" onClick={revisar} ocupado={revisando} disabled={conferindo}>
                      <Check /> Marcar como revisada
                    </Botao>
                  </>
                ) : docx ? (
                  <a className="dc-btn dc-btn--primaria dc-btn--md" href={docx} download onClick={avisarAntesDeBaixar}>
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
      <div className="dc-colunas dc-colunas--esquerda dc-peca">
        <div className="dc-pilha dc-rola dc-peca__lado">
          {antes}
          {fatos}
          {julgados}
          {citacoes}
          {ajuste}
          <Painel titulo="Tipo de peça" acao={catalogo.data && <span className="dc-nota">{catalogo.data.total} modelos</span>} corpo={false}>
            <EscolherTipo catalogo={catalogo.data} tipo={tipo} aoEscolher={setTipo} />
          </Painel>
          <Painel titulo="A IA lê" corpo={false}>
            {leu}
          </Painel>
          <Painel titulo="Instruções" acao={<span className="dc-nota">opcional</span>}>
            <div className="dc-campo">{campoInstrucoes}</div>
            <div className="dc-peca__gerar">
              {!mostrarEstrategia && botaoEstrategia(true)}
              {botaoGerar(true)}
            </div>
          </Painel>
          {registro}
        </div>
        <section className="dc-painel dc-peca__rascunho">
          <div className="dc-painel__topo">
            <span className="inline-flex min-w-0 items-center gap-2">
              <MarcaIa />
              <span className="dc-painel__titulo">{mostrarEstrategia ? "Estratégia da peça" : gerando ? "Escrevendo…" : conferindo ? "Conferindo os fatos…" : revisada ? "Peça revisada" : "Rascunho"}</span>
              {mostrarEstrategia && <span className="dc-nota">edite antes de gerar</span>}
              {texto && !gerando && !mostrarEstrategia && (
                <span className="dc-nota">
                  {quandoGerou ? `gerado ${quandoGerou} · ` : ""}
                  {paginas(texto)} {paginas(texto) === 1 ? "página" : "páginas"}
                </span>
              )}
            </span>
            {revisada && quemRevisou && !gerando && !mostrarEstrategia && (
              <span className="inline-flex items-center gap-1.5 dc-t-meta text-[var(--tinta-2)]">
                <Check className="size-3.5 text-[var(--cumprido)]" /> {quemRevisou}
              </span>
            )}
          </div>
          {avisoDasLacunas && !mostrarEstrategia && <div className="dc-peca__lacunas">{avisoDasLacunas}</div>}
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
            {mostrarEstrategia ? editorDaEstrategia : folha}
          </div>
          {mostrarEstrategia ? <div className="dc-peca__acoes-da-estrategia">{acoesDaEstrategia}</div> : pe(false)}
        </section>
      </div>
      {trocar}
      {guardar}
      {dialogos}
    </Pagina>
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
function Editor({ valor, aoMudar, focar, campo }: { valor: string; aoMudar: (v: string) => void; focar: boolean; campo: RefObject<HTMLTextAreaElement | null> }) {
  const focarAoAbrir = useRef(focar);
  useEffect(() => {
    if (focarAoAbrir.current) campo.current?.focus({ preventScroll: true });
  }, [campo]);
  return (
    <div className="dc-folha">
      <div className="dc-folha__editor" data-texto={valor}>
        <textarea ref={campo} aria-label="Texto da peça" value={valor} onChange={(e) => aoMudar(e.target.value)} />
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

/** O texto corrido: cada fato conferido vira um toque que mostra o trecho, e "(evento 87, fl. 3)" abre o documento na folha. */
function ComFatos({ texto, fatos, aoAbrir }: { texto: string; fatos: readonly FatoDaPeca[]; aoAbrir?: (f: FatoDaPeca) => void }) {
  const partes: ReactNode[] = [];
  let resto = texto;
  for (;;) {
    let primeiro: { i: number; fato: FatoDaPeca } | null = null;
    for (const fato of fatos) {
      const i = fato.afirmacao ? resto.indexOf(fato.afirmacao) : -1;
      if (i >= 0 && (!primeiro || i < primeiro.i)) primeiro = { i, fato };
    }
    if (!primeiro) break;
    const { i, fato } = primeiro;
    if (i > 0) partes.push(<TextoComFontes key={partes.length} texto={resto.slice(0, i)} />);
    // Um <button> vira caixa e não quebra junto com a linha: o fato precisa correr dentro do parágrafo.
    partes.push(
      <span
        key={partes.length}
        role="button"
        tabIndex={0}
        className={`dc-fato dc-fato--${fato.situacao}`}
        title="Ver de onde saiu este fato"
        onClick={() => aoAbrir?.(fato)}
        onKeyDown={(e) => {
          if (e.key !== "Enter" && e.key !== " ") return;
          e.preventDefault();
          aoAbrir?.(fato);
        }}
      >
        {fato.afirmacao}
      </span>,
    );
    resto = resto.slice(i + fato.afirmacao.length);
  }
  if (resto) partes.push(<TextoComFontes key={partes.length} texto={resto} />);
  return <>{partes}</>;
}

function Inline({ texto, fatos = [], aoAbrirFato }: { texto: string; fatos?: readonly FatoDaPeca[]; aoAbrirFato?: (f: FatoDaPeca) => void }) {
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
          <ComFatos key={i} texto={t.texto} fatos={fatos} aoAbrir={aoAbrirFato} />
        ),
      )}
    </>
  );
}

/** A peça como o DOCX vai sair: timbre no alto, endereçamento, seções e parágrafos com recuo. Cada bloco diz onde está no texto, para os avisos levarem até ele. */
export function Folha({ texto, timbre, escrevendo, fatos, aoAbrirFato, ativo }: { texto: string; timbre: Timbre; escrevendo?: boolean; fatos?: readonly FatoDaPeca[]; aoAbrirFato?: (f: FatoDaPeca) => void; ativo?: number | null }) {
  const cor = timbre.cor ? (timbre.cor.startsWith("#") ? timbre.cor : `#${timbre.cor}`) : undefined;
  const linha = [timbre.registro, timbre.endereco, timbre.contato].filter(Boolean).join(" · ");
  const saida: ReactNode[] = [];
  let lista: { numerado: boolean; itens: BlocoNoTexto[] } | null = null;
  const destaque = (inicio: number) => (ativo === inicio ? "is-ponto" : undefined);
  const fecharLista = () => {
    if (!lista) return;
    const Tag = lista.numerado ? "ol" : "ul";
    saida.push(
      <Tag key={saida.length}>
        {lista.itens.map((i) => (
          <li key={i.inicio} data-inicio={i.inicio} className={destaque(i.inicio)}>
            <Inline texto={i.texto} fatos={fatos} aoAbrirFato={aoAbrirFato} />
          </li>
        ))}
      </Tag>,
    );
    lista = null;
  };
  for (const b of blocosComPosicao(texto)) {
    if (b.tipo === "item") {
      if (lista && lista.numerado !== b.numerado) fecharLista();
      lista ??= { numerado: b.numerado, itens: [] };
      lista.itens.push(b);
      continue;
    }
    fecharLista();
    const k = saida.length;
    if (b.tipo === "enderecamento")
      saida.push(
        <p key={k} data-inicio={b.inicio} className={cn("dc-folha__enderecamento", destaque(b.inicio))}>
          <Inline texto={b.texto} />
        </p>,
      );
    else if (b.tipo === "secao")
      saida.push(
        <h2 key={k} data-inicio={b.inicio} className={destaque(b.inicio)}>
          <Inline texto={b.texto} />
        </h2>,
      );
    else if (b.tipo === "subtitulo")
      saida.push(
        <h3 key={k} data-inicio={b.inicio} className={destaque(b.inicio)}>
          <Inline texto={b.texto} />
        </h3>,
      );
    else
      saida.push(
        <p key={k} data-inicio={b.inicio} className={destaque(b.inicio)}>
          <Inline texto={b.texto} fatos={fatos} aoAbrirFato={aoAbrirFato} />
        </p>,
      );
  }
  fecharLista();
  return (
    <article className="dc-folha" aria-busy={escrevendo || undefined}>
      <header className="dc-folha__timbre" style={cor ? { borderColor: cor } : undefined}>
        {timbre.logoDocumentoId && <img src={`/api/app/escritorio/logo?v=${timbre.logoDocumentoId}`} alt="" className="dc-folha__logo" />}
        <strong style={cor ? { color: cor } : undefined}>{timbre.nome}</strong>
        {linha && <span>{linha}</span>}
      </header>
      {saida}
      {escrevendo && <span className="dc-ia__cursor" aria-hidden />}
    </article>
  );
}
