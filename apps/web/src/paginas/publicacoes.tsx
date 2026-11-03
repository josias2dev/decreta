/**
 * Publicações: a caixa de entrada do DJEN. No computador, a lista à esquerda e
 * a selecionada à direita; no celular, a lista e uma tela por publicação.
 */
import { lerPublicacaoColada, TIPOS_DE_COMUNICACAO } from "@decreta/core";
import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Activity, Check, CircleAlert, ClipboardPaste, LoaderCircle, Pencil, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { BaseLegalLida, CampoBaseLegal } from "@/componentes/base-legal";
import { AvisoDaCaptura, Cancelada, CapturaDoDjen, saudeDaCapturaQuery, useFaltaParaBuscar, VazioPorFalta } from "@/componentes/captura-do-djen";
import { CampoIntimacaoNoSistema, diaDigitadoCompleto, MotivosDaConferencia, MotivosParaConferir, PreviaNoDialogo, SeloDeConfianca } from "@/componentes/conta-do-prazo";
import { DataViva } from "@/componentes/data-viva";
import { Dialogo } from "@/componentes/dialogo";
import { IaNoCampo } from "@/componentes/ia-no-campo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { Rolagem } from "@/componentes/rolagem";
import { Abas, BlocoIa, Botao, Cabecalho, Campo, Carregando, Cnj, Dados, Faixa, ListaIa, MarcaIa, Responsavel, SecaoIa, Vazio } from "@/componentes/ui";
import { API_URL, api, mensagemDoErro, SO_LEITURA } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { atualizarPrazos, caixaQuery, euQuery, podeCriar, publicacaoQuery } from "@/lib/consultas";
import { useTeclas } from "@/lib/teclas";
import { diaCompleto, diaCurto, diaDaSemana, diaDoInstante, hora, ondeTramita, prazoEmDias, RESULTADO_DA_DECISAO, TIPO_DA_DECISAO } from "@/lib/formato";
import type { CaixaDePublicacoes, Contagem, Eu, Pagina as PaginaDaApi, ProcessoNaLista, LeituraDaSentenca, Pessoa, PreviaDaConta, Publicacao, ResultadoDecisao, Selo, SituacaoPublicacao, Sugestao, TipoDecisao } from "@/lib/tipos";
import { cn } from "@/lib/util";

const ABAS: { id: SituacaoPublicacao; rotulo: string }[] = [
  { id: "nova", rotulo: "Novas" },
  { id: "pendente", rotulo: "Pendentes" },
  { id: "lida", rotulo: "Lidas" },
  { id: "vinculada", rotulo: "Vinculadas" },
];
const NA_SITUACAO: Record<SituacaoPublicacao, string> = { nova: "Publicação nova", pendente: "Publicação pendente", lida: "Publicação lida", vinculada: "Publicação vinculada" };
const FONTE = { djen: "DJEN", datajud: "DataJud", manual: "Colada à mão" } as const;

/** A captura do DJEN: os cadernos às 04:30 e a busca pela OAB às 12:40 e às 18:40, de segunda a sexta (apps/api/src/inngest.ts). */
export function proximaBusca(agora = new Date()): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday!);
  const minutos = Number(partes.hour) * 60 + Number(partes.minute);
  const horarios = ["04:30", "12:40", "18:40"];
  if (dia >= 1 && dia <= 5) {
    const h = horarios.find((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) > minutos);
    if (h) return `às ${h}`;
  }
  return dia === 0 || (dia >= 1 && dia <= 4) ? "amanhã às 04:30" : "segunda às 04:30";
}

const NENHUMA: ReadonlySet<string> = new Set();
/** Depois de abrir um item, um instante em que C e N não valem: duas batidas seguidas não tratam o próximo sem ninguém ter visto. */
const ESPERA_ANTES_DE_TRATAR = 400;

function SeloDaLista({ selo }: { selo: Selo }) {
  return (
    <span className={cn("dc-pub__selo", `dc-pub__selo--${selo.tipo}`)}>
      {selo.tipo === "sem_teor" || selo.tipo === "recusa" || selo.tipo === "erro" || selo.tipo === "sem_ia" ? <CircleAlert /> : selo.tipo === "lendo" ? <LoaderCircle className="animate-spin" /> : <MarcaIa />}
      {selo.texto}
    </span>
  );
}

function ItemDaCaixa({ item, ligado, celular, aoEscolher }: { item: CaixaDePublicacoes["itens"][number]; ligado?: boolean; celular: boolean; aoEscolher?: () => void }) {
  const qc = useQueryClient();
  const espera = useRef<ReturnType<typeof setTimeout>>(undefined);
  // No celular, o título é o link que cobre o item. No computador, o item inteiro escolhe, e o título é o alvo do teclado.
  const titulo = celular ? (
    <Link to="/publicacoes/$id" params={{ id: item.id }} className="dc-pub__titulo dc-esticado">
      {item.titulo}
    </Link>
  ) : (
    <button
      type="button"
      className="dc-pub__titulo"
      aria-current={ligado || undefined}
      onClick={(e) => {
        e.stopPropagation();
        aoEscolher?.();
      }}
    >
      {item.titulo}
    </button>
  );
  return (
    <div
      className={cn("dc-pub", celular && "dc-com-esticado", ligado && "is-on")}
      onClick={celular ? undefined : aoEscolher}
      onMouseEnter={
        celular
          ? undefined
          : () => {
              espera.current = setTimeout(() => void qc.prefetchQuery(publicacaoQuery(item.id)), 50);
            }
      }
      onMouseLeave={celular ? undefined : () => clearTimeout(espera.current)}
    >
      <span className="dc-pub__topo">
        {titulo}
        <span className="dc-pub__data">{diaCurto(item.disponibilizadaEm)}</span>
      </span>
      <span className="dc-pub__partes">{item.partes}</span>
      {item.selo.tipo === "prazo" ? (
        <DataViva alvo={{ publicacao: item.id }}>
          <SeloDaLista selo={item.selo} />
        </DataViva>
      ) : (
        <SeloDaLista selo={item.selo} />
      )}
    </div>
  );
}

function useBuscarAgora() {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: () => api("/publicacoes/buscar", { method: "POST" }),
    onSuccess: () => {
      avisar("Buscando no DJEN. As novas aparecem aqui em instantes.");
      for (const ms of [8000, 20000, 45000]) setTimeout(() => void qc.invalidateQueries({ queryKey: ["publicacoes"] }), ms);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
}

export function PublicacoesPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/publicacoes" });
  const navigate = useNavigate({ from: "/publicacoes" });
  const situacao: SituacaoPublicacao = search.situacao ?? "nova";
  const eu = useQuery(euQuery);
  const pode = podeCriar(eu.data);
  const caixa = useQuery(caixaQuery(situacao));
  const buscar = useBuscarAgora();
  const [colar, setColar] = useState(false);
  const [captura, setCaptura] = useState(false);
  const saude = useQuery(saudeDaCapturaQuery);
  const qc = useQueryClient();
  // As tratadas nesta sequência, pela aba: saem da fila na hora e contam no fim.
  const [tratadas, setTratadas] = useState<{ situacao: SituacaoPublicacao; ids: ReadonlySet<string> }>({ situacao, ids: new Set() });
  const tratadasAqui = tratadas.situacao === situacao ? tratadas.ids : NENHUMA;

  const c = caixa.data;
  const itensDaFila = useMemo(() => (c?.itens ?? []).filter((i) => !tratadasAqui.has(i.id)), [c?.itens, tratadasAqui]);
  const capturada = c?.ultimaCaptura;
  const sub = !c
    ? " "
    : capturada
      ? `${c.contagens.nova} ${c.contagens.nova === 1 ? "nova" : "novas"} do DJEN, capturadas ${diaDoInstante(capturada.em) === eu.data?.hoje ? "hoje" : `em ${diaCurto(diaDoInstante(capturada.em))}`} às ${capturada.hora} · próxima busca ${proximaBusca()}`
      : `Nenhuma busca no DJEN ainda · próxima ${proximaBusca()}`;
  const abas = c ? ABAS.map((a) => ({ ...a, n: c.contagens[a.id] || undefined })) : ABAS;
  const irPara = (s: SituacaoPublicacao) => void navigate({ search: { situacao: s === "nova" ? undefined : s } });
  const vazio = c && eu.data && <CaixaVazia caixa={c} situacao={situacao} eu={eu.data} alertas={saude.data?.alertas.length ?? 0} irPara={irPara} buscar={() => buscar.mutate()} buscando={buscar.isPending} colar={() => setColar(true)} />;
  const falhou = capturada?.erro && <Faixa tipo="erro">A última busca no DJEN falhou: {capturada.erro}. Tento de novo na próxima.</Faixa>;
  const avisoDaCaptura = (
    <AvisoDaCaptura
      alertas={saude.data?.alertas}
      acao={
        <button type="button" className="dc-link" onClick={() => setCaptura(true)}>
          Ver a captura
        </button>
      }
    />
  );
  const dialogoDaCaptura = <CapturaDoDjen aberto={captura} aoFechar={() => setCaptura(false)} />;

  const selecionada = search.id ?? itensDaFila[0]?.id;
  // Escolher na lista não mexe na rolagem: a lista fica onde está e a publicação abre do começo.
  const escolher = (id: string | undefined) => void navigate({ search: (s) => ({ ...s, id }), replace: true, resetScroll: false });
  /** Depois de tratar: a próxima da lista. A tratada sai da fila na hora, sem esperar a lista voltar do servidor. */
  const proxima = () => {
    const i = itensDaFila.findIndex((x) => x.id === selecionada);
    if (selecionada) setTratadas({ situacao, ids: new Set(tratadasAqui).add(selecionada) });
    escolher(itensDaFila[i + 1]?.id ?? itensDaFila[i - 1]?.id);
  };
  /** O servidor recusou: a publicação volta para a fila e deixa de contar como tratada. */
  const devolverAFila = (id: string) =>
    setTratadas((t) => {
      const ids = new Set(t.ids);
      ids.delete(id);
      return { ...t, ids };
    });
  // A seguinte da fila já vem: ao tratar esta, ela abre na hora.
  const seguinte = itensDaFila[itensDaFila.findIndex((x) => x.id === selecionada) + 1]?.id;
  useEffect(() => {
    if (seguinte && !celular) void qc.prefetchQuery(publicacaoQuery(seguinte));
  }, [seguinte, celular, qc]);
  const andar = (passo: number) => {
    const alvo = itensDaFila[itensDaFila.findIndex((x) => x.id === selecionada) + passo];
    if (alvo) escolher(alvo.id);
  };
  const zerada = !!c && tratadasAqui.size > 0 && !itensDaFila.length;
  useTeclas({ j: () => andar(1), k: () => andar(-1) }, !celular);
  // Andando pelo teclado, o item aberto fica à vista na lista.
  useEffect(() => {
    if (!celular) document.querySelector(".dc-pub.is-on")?.scrollIntoView({ block: "nearest" });
  }, [selecionada, celular]);

  if (celular) {
    return (
      <TelaCelular
        titulo="Publicações"
        sobre={c ? `${c.contagens.nova} ${c.contagens.nova === 1 ? "nova" : "novas"} do DJEN` : " "}
        direita={
          <>
            {pode && (
              <>
                <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Buscar agora no DJEN" onClick={() => buscar.mutate()} disabled={buscar.isPending}>
                  <RefreshCw className={cn(buscar.isPending && "animate-spin")} />
                </button>
                <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Colar publicação" onClick={() => setColar(true)}>
                  <Plus />
                </button>
              </>
            )}
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Captura do DJEN" onClick={() => setCaptura(true)}>
              <Activity />
            </button>
          </>
        }
        fixo={<Abas abas={abas} ativa={situacao} aoMudar={irPara} />}
      >
        {falhou}
        {avisoDaCaptura}
        <section className="dc-painel">
          {!c ? (
            <div className="p-4">
              <Carregando linhas={3} />
            </div>
          ) : c.itens.length ? (
            <div className="dc-linhas">
              {c.itens.map((i) => (
                <ItemDaCaixa key={i.id} item={i} celular />
              ))}
            </div>
          ) : (
            vazio
          )}
        </section>
        <ColarPublicacao aberto={colar} aoFechar={() => setColar(false)} />
        {dialogoDaCaptura}
      </TelaCelular>
    );
  }

  return (
    <Pagina cheia>
      <Cabecalho
        titulo="Publicações"
        sub={
          <>
            {sub} ·{" "}
            <button type="button" className="dc-link" onClick={() => setCaptura(true)}>
              Ver a captura
            </button>
          </>
        }
        acoes={
          pode && (
            <>
              <Botao onClick={() => setColar(true)}>
                <ClipboardPaste /> Colar publicação
              </Botao>
              <Botao onClick={() => buscar.mutate()} ocupado={buscar.isPending}>
                <RefreshCw /> Buscar agora
              </Botao>
            </>
          )
        }
      />
      {falhou}
      {avisoDaCaptura}
      <div className={cn("dc-caixa", !selecionada && !zerada && "dc-caixa--vazia")}>
        <section className="dc-painel dc-caixa__lista">
          <Abas abas={abas} ativa={situacao} aoMudar={irPara} />
          {!c ? (
            <div className="p-4">
              <Carregando linhas={3} />
            </div>
          ) : itensDaFila.length ? (
            <>
              <Rolagem id="publicacoes" className="dc-linhas">
                {itensDaFila.map((i) => (
                  <ItemDaCaixa key={i.id} item={i} celular={false} ligado={i.id === selecionada} aoEscolher={() => escolher(i.id)} />
                ))}
              </Rolagem>
              <TeclasDaFila />
            </>
          ) : (
            vazio
          )}
        </section>
        {selecionada && <Selecionada key={selecionada} id={selecionada} aoTerminar={proxima} aoDevolver={devolverAFila} />}
        {zerada && <CaixaZerada n={tratadasAqui.size} situacao={situacao} pendentes={c.contagens.pendente} aoVerPendentes={() => irPara("pendente")} />}
      </div>
      <ColarPublicacao aberto={colar} aoFechar={() => setColar(false)} />
      {dialogoDaCaptura}
    </Pagina>
  );
}

const ABA_VAZIA: Record<Exclude<SituacaoPublicacao, "nova">, { titulo: string; texto: string }> = {
  pendente: { titulo: "Nada pendente", texto: "Aqui fica a publicação que você quer decidir depois: ao ler, use Deixar pendente, e ela sai das novas sem se perder." },
  lida: { titulo: "Nenhuma publicação lida", texto: "A publicação que não gera prazo, marcada como lida, fica guardada aqui, para consultar." },
  vinculada: { titulo: "Nenhuma publicação vinculada", texto: "A publicação que vira prazo ou audiência fica guardada aqui, ligada ao processo." },
};

/**
 * A caixa sem nada. Nas novas, nunca diz que não há nada quando a causa pode ser outra: busca desligada, nenhuma OAB,
 * busca que falhou ou caderno que faltou. Só o que sobra é a caixa em dia.
 */
function CaixaVazia({ caixa, situacao, eu, alertas, irPara, buscar, buscando, colar }: { caixa: CaixaDePublicacoes; situacao: SituacaoPublicacao; eu: Eu; alertas: number; irPara: (s: SituacaoPublicacao) => void; buscar: () => void; buscando: boolean; colar: () => void }) {
  const falta = useFaltaParaBuscar(situacao === "nova");
  const pode = podeCriar(eu);
  const c = caixa.contagens;
  const u = caixa.ultimaCaptura;
  const buscarAgora = pode && (
    <Botao pequeno onClick={buscar} ocupado={buscando}>
      <RefreshCw /> Buscar agora
    </Botao>
  );
  const leitura = !pode && <span>{SO_LEITURA}</span>;
  if (situacao !== "nova") {
    const { titulo, texto } = ABA_VAZIA[situacao];
    return (
      <Vazio
        titulo={titulo}
        acao={
          c.nova > 0 && (
            <Botao pequeno onClick={() => irPara("nova")}>
              Ver {c.nova === 1 ? "a nova" : `as ${c.nova} novas`}
            </Botao>
          )
        }
      >
        {texto}
      </Vazio>
    );
  }
  if (falta === undefined) {
    return (
      <div className="p-4">
        <Carregando linhas={2} />
      </div>
    );
  }
  if (falta) return <VazioPorFalta falta={falta} eu={eu} />;
  if (u?.erro) {
    return (
      <Vazio titulo="A última busca falhou" acao={buscarAgora}>
        Pode haver intimação que ainda não chegou. O Decreta tenta de novo {proximaBusca()}.
        {leitura}
      </Vazio>
    );
  }
  if (alertas > 0) {
    return (
      <Vazio titulo="A captura tem um aviso" acao={buscarAgora}>
        Um caderno do DJEN faltou ou falhou, então a caixa vazia pode não ser o dia todo. Veja o aviso acima.
        {leitura}
      </Vazio>
    );
  }
  if (!u) {
    return (
      <Vazio titulo="A primeira busca ainda não rodou" acao={buscarAgora}>
        O Decreta lê o DJEN de madrugada e busca pelas OABs da equipe. Cada intimação chega aqui explicada, com o prazo sugerido. Próxima busca {proximaBusca()}.
        {leitura}
      </Vazio>
    );
  }
  if (!c.nova && !c.pendente && !c.lida && !c.vinculada) {
    return (
      <Vazio
        titulo="Nenhuma publicação até agora"
        acao={
          pode && (
            <Botao pequeno onClick={colar}>
              <ClipboardPaste /> Colar publicação
            </Botao>
          )
        }
      >
        A busca pelas OABs da equipe não achou nada ainda. Cada intimação chega aqui explicada, com o prazo sugerido. Enquanto isso, dá para colar uma que recebeu por outro caminho.
        {leitura}
      </Vazio>
    );
  }
  return (
    <Vazio titulo="Nenhuma publicação nova">
      Última busca às {u.hora}{diaDoInstante(u.em) === eu.hoje ? "" : ` de ${diaCurto(diaDoInstante(u.em))}`}. Próxima busca {proximaBusca()}.
    </Vazio>
  );
}

function Selecionada({ id, aoTerminar, aoDevolver }: { id: string; aoTerminar: () => void; aoDevolver: (id: string) => void }) {
  const q = useQuery(publicacaoQuery(id));
  if (!q.data) {
    return <section className="dc-painel dc-caixa__carregando p-4">{q.error ? <FalhaAoCarregar erro={q.error} sumiu="Publicação não encontrada" aoTentar={() => void q.refetch()} /> : <Carregando />}</section>;
  }
  return <VerPublicacao pub={q.data} celular={false} aoTerminar={aoTerminar} aoDevolver={aoDevolver} />;
}

/** O pé da lista, só no computador: as teclas da fila, à vista sem pedir atenção. */
function TeclasDaFila() {
  return (
    <p className="dc-caixa__teclas">
      <span>
        <kbd className="dc-tecla">J</kbd> <kbd className="dc-tecla">K</kbd> navegam
      </span>
      <span>
        <kbd className="dc-tecla">C</kbd> confirma
      </span>
      <span>
        <kbd className="dc-tecla">A</kbd> ajusta
      </span>
      <span>
        <kbd className="dc-tecla">N</kbd> não gera prazo
      </span>
    </p>
  );
}

/** O fim da fila: acabou, quantas foram e o que vem depois. Caixa que já chega vazia não passa por aqui. */
function CaixaZerada({ n, situacao, pendentes, aoVerPendentes }: { n: number; situacao: SituacaoPublicacao; pendentes: number; aoVerPendentes: () => void }) {
  return (
    <section className="dc-painel dc-caixa__zerada" role="status">
      <span className="dc-caixa__zerada-marca">
        <Check aria-hidden />
      </span>
      <h2 className="dc-painel__titulo">{situacao === "nova" ? "Caixa zerada" : "Nada mais nesta aba"}</h2>
      <p className="dc-nota m-0">
        Você tratou {n === 1 ? "1 publicação" : `${n} publicações`} nesta sequência.{situacao === "nova" ? ` A próxima busca no DJEN sai ${proximaBusca()}.` : ""}
      </p>
      <div className="dc-linha-acoes">
        <Link to="/prazos" className="dc-btn dc-btn--primaria dc-btn--md">
          Ver os prazos
        </Link>
        {situacao !== "pendente" && pendentes > 0 && <Botao onClick={aoVerPendentes}>Ver {pendentes === 1 ? "1 pendente" : `${pendentes} pendentes`}</Botao>}
      </div>
    </section>
  );
}

/** Tela própria no celular. No computador, a mesma publicação abre dentro da caixa. */
export function PublicacaoPage() {
  const { id } = useParams({ from: "/app/publicacoes/$id" });
  const celular = useCelular();
  const navigate = useNavigate();
  const q = useQuery(publicacaoQuery(id));
  const situacao = q.data?.situacao;
  const caixa = useQuery({ ...caixaQuery(situacao ?? "nova"), enabled: !!situacao && celular });
  const qc = useQueryClient();
  const lista = caixa.data?.itens;
  const seguinte = lista?.[lista.findIndex((i) => i.id === id) + 1]?.id;
  useEffect(() => {
    if (seguinte && celular) void qc.prefetchQuery(publicacaoQuery(seguinte));
  }, [seguinte, celular, qc]);
  if (!celular) return <Navigate to="/publicacoes" search={{ id }} replace />;
  if (!q.data) {
    return (
      <TelaCelular titulo="Publicação" voltar>
        {q.error ? <FalhaAoCarregar erro={q.error} sumiu="Publicação não encontrada" aoTentar={() => void q.refetch()} /> : <Carregando />}
      </TelaCelular>
    );
  }
  const itens = caixa.data?.itens ?? [];
  const pos = itens.findIndex((i) => i.id === id);
  const aoTerminar = () => {
    const prox = itens[pos + 1] ?? itens[pos - 1];
    if (prox && prox.id !== id) void navigate({ to: "/publicacoes/$id", params: { id: prox.id }, replace: true });
    else void navigate({ to: "/publicacoes", replace: true });
  };
  return (
    <VerPublicacao
      key={id}
      pub={q.data}
      celular
      aoTerminar={aoTerminar}
      titulo={NA_SITUACAO[q.data.situacao]}
      sobre={[pos >= 0 ? `${pos + 1} de ${itens.length}` : null, FONTE[q.data.fonte]].filter(Boolean).join(" · ")}
    />
  );
}

type Modo = "prazo" | "audiencia" | "sem_prazo" | "feito";

const TRATAR = ["publicacoes", "tratar"];

/** Tira a publicação da caixa e acerta as contagens. Devolve como pôr de volta, no mesmo lugar. */
function tirarDaCaixa(qc: QueryClient, id: string, de: SituacaoPublicacao, para: SituacaoPublicacao) {
  const chave = ["publicacoes", de];
  const antes = qc.getQueryData<CaixaDePublicacoes>(chave);
  const lugar = antes?.itens.findIndex((i) => i.id === id) ?? -1;
  if (!antes || lugar < 0) return () => {};
  const item = antes.itens[lugar]!;
  const contar = (c: CaixaDePublicacoes, n: number) => ({ ...c.contagens, [de]: c.contagens[de] - n, [para]: c.contagens[para] + n });
  qc.setQueryData<CaixaDePublicacoes>(chave, (c) => c && { ...c, itens: c.itens.filter((i) => i.id !== id), contagens: contar(c, 1) });
  return () => {
    qc.setQueryData<CaixaDePublicacoes>(chave, (c) => c && { ...c, itens: [...c.itens.slice(0, lugar), item, ...c.itens.slice(lugar)], contagens: contar(c, -1) });
  };
}

function VerPublicacao({ pub, celular, aoTerminar, aoDevolver, titulo, sobre }: { pub: Publicacao; celular: boolean; aoTerminar: () => void; aoDevolver?: (id: string) => void; titulo?: string; sobre?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navigate = useNavigate();
  const eu = useQuery(euQuery);
  const [dialogo, setDialogo] = useState<"prazo" | "audiencia" | null>(null);
  const s = pub.sugestao;
  const c = s?.situacao === "pronto" ? s.conteudo : null;
  // Publicação cancelada pelo tribunal não puxa a confirmação do prazo: a pessoa decide.
  const modo: Modo = pub.prazo?.confirmado || pub.audiencia ? "feito" : pub.cancelada ? "sem_prazo" : c?.audiencia ? "audiencia" : c?.geraPrazo && c.dias ? "prazo" : "sem_prazo";
  const semProcesso = !pub.processo;

  const pronto = (texto: string) => {
    atualizarPrazos(qc);
    avisar(texto);
    aoTerminar();
  };
  // Confirmar e marcar: a publicação sai da caixa e a próxima abre na hora. O aviso de que deu certo só vem com a
  // resposta; se o servidor recusar, ela volta ao mesmo lugar, com aviso. Com várias em seguida, a lista só é pedida
  // de novo depois da última resposta, para não trazer de volta as que ainda estão a caminho.
  const sairDaCaixa = async (para: SituacaoPublicacao) => {
    await qc.cancelQueries({ queryKey: ["publicacoes"] });
    const voltarNaCaixa = tirarDaCaixa(qc, pub.id, pub.situacao, para);
    aoTerminar();
    const devolver = () => {
      voltarNaCaixa();
      aoDevolver?.(pub.id);
    };
    return { devolver };
  };
  const seForAUltima = () => {
    if (qc.isMutating({ mutationKey: TRATAR }) === 1) void atualizarPrazos(qc);
  };
  const confirmar = useMutation({
    mutationKey: TRATAR,
    mutationFn: () => api<{ prazoId: string; fim: string }>(`/publicacoes/${pub.id}/confirmar`, { json: { tipo: c!.tipo, fundamento: c!.fundamento, fundamentoDaIa: !!c!.fundamento, dias: c!.dias!, contagem: c!.contagem, responsavelId: s?.responsavel?.id } }),
    onMutate: () => sairDaCaixa("vinculada"),
    onSuccess: (r) => avisar(`Prazo confirmado: vence em ${diaCompleto(r.fim)}.`),
    onError: (err, _v, ctx) => {
      ctx?.devolver();
      avisar(`O prazo não foi confirmado. ${mensagemDoErro(err)} A publicação voltou para a caixa.`, { erro: true, fixo: true, acao: { rotulo: "Voltar à publicação", fazer: () => void navigate({ to: "/publicacoes/$id", params: { id: pub.id } }) } });
    },
    onSettled: seForAUltima,
  });
  const agendar = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/audiencia`, { json: { dia: c!.audiencia!.data, hora: c!.audiencia!.hora, tipo: c!.audiencia!.tipo, porVideo: c!.audiencia!.porVideo } }),
    onSuccess: () => pronto("Audiência na agenda."),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const marcar = useMutation({
    mutationKey: TRATAR,
    mutationFn: (o: "sem-prazo" | "pendente") => api(`/publicacoes/${pub.id}/${o}`, { method: "POST" }),
    onMutate: (o) => sairDaCaixa(o === "pendente" ? "pendente" : "lida"),
    onSuccess: (_r, o) => avisar(o === "pendente" ? "Ficou em Pendentes." : "Marcada como lida, sem prazo."),
    onError: (err, _o, ctx) => {
      ctx?.devolver();
      avisar(`A publicação não foi marcada. ${mensagemDoErro(err)} Ela voltou para a caixa.`, { erro: true });
    },
    onSettled: seForAUltima,
  });
  const refazer = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/sugerir`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] });
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const vincular = useMutation({
    mutationFn: (processoId: string) => api(`/publicacoes/${pub.id}/vincular`, { json: { processoId } }),
    onSuccess: () => {
      avisar("Publicação vinculada ao processo. A IA lê de novo.");
      void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] });
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const ocupado = confirmar.isPending || agendar.isPending || marcar.isPending;
  const onde = pub.processo ? ondeTramita(pub.processo) : pub.orgao;
  const tituloTeor = pub.tipoComunicacao?.toLocaleLowerCase("pt-BR").startsWith("intima") ? "Teor da intimação" : `Teor ${pub.tipoComunicacao ? `· ${pub.tipoComunicacao}` : "da publicação"}`;
  const datas = `Disponibilizada em ${diaCompleto(pub.disponibilizadaEm)} · publicada em ${diaCompleto(pub.publicadaEm)}`;

  const processo = pub.processo ? (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="dc-t-titulo font-semibold">{pub.processo.titulo}</strong>
        {celular && (pub.processo.classe || onde) && <span className="dc-t-meta text-[var(--tinta-2)]">{[pub.processo.classe, onde].filter(Boolean).join(" · ")}</span>}
        <span className="dc-t-meta text-[var(--tinta-2)]">
          <Cnj cnj={pub.processo.cnj} tipo={pub.processo.tipo} />
          {!celular && [onde, pub.processo.responsavel?.apelido].filter(Boolean).map((x) => ` · ${x}`)}
        </span>
      </div>
      {!celular && (
        <Link to="/processos/$id" params={{ id: pub.processo.id }} className="dc-btn dc-btn--secundaria dc-btn--sm flex-none">
          Abrir processo
        </Link>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <Faixa tipo="aviso">
        <CircleAlert />
        {pub.cnj ? `O processo ${pub.cnj} não está no Decreta.` : "Esta publicação não está ligada a um processo."} Vincule para contar o prazo.
      </Faixa>
      <EscolherProcesso valor={null} aoEscolher={(p) => p && vincular.mutate(p.id)} />
    </div>
  );

  const teor = (
    <section className="dc-lido">
      <h3 className="dc-lido__titulo">{tituloTeor}</h3>
      <span className="dc-lido__meta">{datas}</span>
      <p className="dc-lido__texto">{pub.texto || "Sem teor. Abra a publicação no sistema do tribunal."}</p>
      {(pub.link || pub.certidao) && (
        <div className="dc-lido__acoes">
          {pub.link && (
            <a href={pub.link} target="_blank" rel="noreferrer" className="dc-link">
              Abrir no tribunal
            </a>
          )}
          {pub.certidao && (
            <a href={`${API_URL}/api/app/publicacoes/${pub.id}/certidao`} target="_blank" rel="noreferrer" className="dc-link">
              Certidão do DJEN
            </a>
          )}
        </div>
      )}
    </section>
  );

  const cancelada = pub.cancelada && <Cancelada cancelada={pub.cancelada} comPrazo={!!pub.prazo} />;

  const tituloIa = !c ? "Prazo sugerido" : c.audiencia ? "Audiência designada" : c.geraPrazo ? "Prazo sugerido" : "Leitura da IA";
  // Cliente que recusou a IA: a rotina de fundo não lê, e a pessoa cria o prazo à mão.
  const semIa = !!pub.processo?.semIa;
  const iaAqui = !!eu.data?.ia && !semIa;
  const ia = (
    <BlocoIa
      titulo={tituloIa}
      analise={s}
      aoRefazer={iaAqui && (s || pub.leituraParada) ? () => refazer.mutate() : undefined}
      rotuloGerar="Ler de novo"
      refazendo={refazer.isPending || (!s && iaAqui && !pub.leituraParada)}
      rodape={s ? "Gerado por IA. Confira nos autos." : !iaAqui ? undefined : pub.leituraParada ? "Sem leitura da IA." : "A IA está lendo o teor."}
    >
      {c ? (
        <FatosDaSugestao c={c} responsavel={s!.responsavel} publicacaoId={pub.id} processoId={pub.processo?.id} />
      ) : !iaAqui ? (
        <p className="m-0 dc-t-corpo">{semIa ? "O cliente não autorizou o uso de IA." : "A IA não está ligada."} Confira o teor e crie o prazo à mão.</p>
      ) : pub.leituraParada ? (
        <p className="m-0 dc-t-corpo">A IA não conseguiu ler esta publicação. Confira o teor e o prazo, ou peça para ler de novo.</p>
      ) : null}
    </BlocoIa>
  );

  const feito =
    modo === "feito" &&
    (pub.prazo?.confirmado ? (
      <Faixa tipo="ok">
        <Check />
        <span className="flex-1">
          Prazo confirmado: {pub.prazo.tipo}, vence em{" "}
          <DataViva alvo={{ prazo: pub.prazo.id }} texto>
            {diaCompleto(pub.prazo.fim)}
          </DataViva>
          .
        </span>
        <Link to="/prazos/$id" params={{ id: pub.prazo.id }} className="dc-link">
          Abrir prazo
        </Link>
      </Faixa>
    ) : pub.audiencia ? (
      <Faixa tipo="ok">
        <Check />
        <span className="flex-1">
          Na agenda: {pub.audiencia.tipo}, {diaCompleto(diaDoInstante(pub.audiencia.em))} às {hora(pub.audiencia.em)}.
        </span>
        <Link to="/audiencias/$id" params={{ id: pub.audiencia.id }} className="dc-link">
          Abrir audiência
        </Link>
      </Faixa>
    ) : null);
  const lida = modo === "sem_prazo" && pub.situacao === "lida" && <Faixa tipo="ok">Marcada como lida, sem prazo.</Faixa>;

  // Ações: [principal, secundária, terciária, extra]. `teclas`: o atalho na fila de publicações; a primeira é a que aparece no botão.
  type Acao = { rotulo: string; icone?: ReactNode; fazer: () => void; ocupado?: boolean; desligado?: boolean; teclas?: string[] };
  const acoes: Acao[] =
    modo === "prazo"
      ? [
          // Confiança baixa: não confirma num clique; abre o ajuste com os motivos no topo.
          ...(c?.conferencia?.confianca === "baixa"
            ? [{ rotulo: "Conferir e confirmar", icone: <Pencil />, fazer: () => setDialogo("prazo"), desligado: semProcesso, teclas: ["c", "a"] }]
            : [
                { rotulo: "Confirmar prazo", icone: <Check />, fazer: () => confirmar.mutate(), ocupado: confirmar.isPending, desligado: semProcesso, teclas: ["c"] },
                { rotulo: "Ajustar", icone: <Pencil />, fazer: () => setDialogo("prazo"), desligado: semProcesso, teclas: ["a"] },
              ]),
          { rotulo: "Não gera prazo", fazer: () => marcar.mutate("sem-prazo"), teclas: ["n"] },
          ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
        ]
      : modo === "audiencia"
        ? [
            { rotulo: "Pôr na agenda", icone: <Check />, fazer: () => agendar.mutate(), ocupado: agendar.isPending, desligado: semProcesso, teclas: ["c"] },
            { rotulo: "Ajustar", icone: <Pencil />, fazer: () => setDialogo("audiencia"), desligado: semProcesso, teclas: ["a"] },
            { rotulo: "Não gera prazo", fazer: () => marcar.mutate("sem-prazo"), teclas: ["n"] },
            ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
          ]
        : modo === "sem_prazo"
          ? [
              ...(pub.situacao !== "lida" ? [{ rotulo: "Marcar como lida", icone: <Check />, fazer: () => marcar.mutate("sem-prazo"), ocupado: marcar.isPending && marcar.variables === "sem-prazo", teclas: ["n"] }] : []),
              { rotulo: "Criar prazo", icone: <Plus />, fazer: () => setDialogo("prazo"), desligado: semProcesso, teclas: ["a"] },
              ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
            ]
          : [];

  // A fila pelo teclado: a tecla faz o que o botão faria, e não faz o que ele não deixaria.
  const aberta = useRef(performance.now());
  const apertar = (tecla: string) => {
    const a = acoes.find((x) => x.teclas?.includes(tecla));
    if (!a || ocupado) return;
    if (a.desligado) return avisar("Vincule a publicação a um processo antes.", { erro: true });
    if (tecla !== "a" && performance.now() - aberta.current < ESPERA_ANTES_DE_TRATAR) return;
    a.fazer();
  };
  useTeclas({ c: () => apertar("c"), a: () => apertar("a"), n: () => apertar("n") }, !celular);

  const dialogos = (
    <>
      <ConfirmarComAjuste pub={pub} sugestao={c} aberto={dialogo === "prazo"} aoFechar={() => setDialogo(null)} aoConfirmar={(fim) => pronto(`Prazo confirmado: vence em ${diaCompleto(fim)}.`)} />
      {c?.audiencia && <AjustarAudiencia pub={pub} audiencia={c.audiencia} aberto={dialogo === "audiencia"} aoFechar={() => setDialogo(null)} aoMarcar={() => pronto("Audiência na agenda.")} />}
    </>
  );

  const prova = c && <ProvaDaSugestao c={c} />;
  const leituraDaDecisao = pub.decisao && <LeituraDaDecisao pub={pub} />;

  if (celular) {
    const [a1, a2, a3] = acoes;
    return (
      <TelaCelular
        titulo={titulo ?? "Publicação"}
        sobre={sobre}
        voltar
        rodape={
          a1 && (
            <>
              <Botao variante="primaria" bloco onClick={a1.fazer} ocupado={a1.ocupado} disabled={a1.desligado || ocupado}>
                {a1.icone} {a1.rotulo}
              </Botao>
              {(a2 || a3) && (
                <div className="dc-rodape__par">
                  {a2 && (
                    <Botao bloco onClick={a2.fazer} disabled={a2.desligado || ocupado}>
                      {a2.rotulo}
                    </Botao>
                  )}
                  {a3 && (
                    <Botao variante="fantasma" bloco onClick={a3.fazer} disabled={a3.desligado || ocupado}>
                      {a3.rotulo}
                    </Botao>
                  )}
                </div>
              )}
            </>
          )
        }
      >
        {cancelada}
        <section className="dc-painel">
          <div className="dc-painel__corpo">{processo}</div>
        </section>
        {feito}
        {lida}
        {ia}
        {teor}
        {prova}
        {leituraDaDecisao}
        {acoes[3] && (
          <button type="button" className="dc-link self-center" onClick={acoes[3].fazer} disabled={ocupado}>
            {acoes[3].rotulo}
          </button>
        )}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <>
      <section className="dc-painel dc-caixa__teor">
        <div className="dc-caixa__topo">{processo}</div>
        <Rolagem id="publicacao" className="dc-caixa__leitura">
          {cancelada}
          {teor}
          {prova}
          {leituraDaDecisao}
        </Rolagem>
      </section>
      <aside className="dc-painel dc-caixa__decisao">
        <div className="dc-caixa__fatos">
          {feito || lida}
          {ia}
        </div>
        {acoes.length > 0 && (
          <div className="dc-caixa__botoes">
            {acoes.map((a, i) => (
              <Botao key={a.rotulo} variante={i === 0 ? "primaria" : i === 1 ? "secundaria" : "fantasma"} onClick={a.fazer} ocupado={a.ocupado} disabled={a.desligado || ocupado} aria-keyshortcuts={a.teclas?.[0]?.toUpperCase()}>
                {i < 2 && a.icone} {a.rotulo}
                {a.teclas && (
                  <span className="dc-tecla" aria-hidden>
                    {a.teclas[0]!.toUpperCase()}
                  </span>
                )}
              </Botao>
            ))}
          </div>
        )}
      </aside>
      {dialogos}
    </>
  );
}

const DECISAO_DO_PEDIDO = { acolhido: "Acolhido", parcial: "Em parte", rejeitado: "Rejeitado", nao_apreciado: "Não apreciado" } as const;

/**
 * Sentença ou acórdão: a IA lê pedido a pedido e a pessoa confirma o resultado,
 * que fica no processo. A leitura roda sozinha quando a publicação chega.
 */
function LeituraDaDecisao({ pub }: { pub: Publicacao }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [corrigir, setCorrigir] = useState(false);
  const a = pub.sentenca;
  const l = a?.situacao === "pronto" ? a.conteudo : null;
  const tipo: TipoDecisao = pub.resultado?.tipo ?? l?.tipo ?? (/ac[óo]rd[ãa]o/i.test(pub.tipoDocumento ?? "") ? "acordao" : "sentenca");
  const ler = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/sentenca`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const confirmar = useMutation({
    mutationFn: (b: { tipo: TipoDecisao; resultado: ResultadoDecisao; resumo: string | null }) => api(`/publicacoes/${pub.id}/resultado`, { json: b }),
    onSuccess: () => {
      setCorrigir(false);
      avisar("Resultado guardado no processo.");
      void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] });
      if (pub.processo) void qc.invalidateQueries({ queryKey: ["processo", pub.processo.id] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  // As duas leituras saem juntas quando a publicação chega: enquanto não há nenhuma, a IA está lendo.
  const semIa = !!pub.processo?.semIa;
  const iaAqui = !!eu.data?.ia && !semIa;
  const lendo = ler.isPending || (!a && iaAqui && !pub.sugestao && !pub.leituraParada);
  const r = pub.resultado;
  return (
    <BlocoIa
      titulo={tipo === "acordao" ? "Leitura do acórdão" : "Leitura da sentença"}
      analise={a}
      aoRefazer={iaAqui ? () => ler.mutate() : undefined}
      refazendo={lendo}
      rodape={a ? "Gerado por IA. Confira na decisão." : "A IA lê a decisão pedido a pedido."}
    >
      {l && <ConteudoDaSentenca l={l} />}
      {!a && !iaAqui && <p className="m-0 dc-t-corpo">{semIa ? "O cliente não autorizou o uso de IA." : "A IA não está ligada."} Leia a decisão e confirme o resultado à mão.</p>}
      {r ? (
        <Faixa tipo="ok">
          <Check />
          <span className="flex-1">
            No processo: {TIPO_DA_DECISAO[r.tipo].toLocaleLowerCase("pt-BR")} {RESULTADO_DA_DECISAO[r.resultado].toLocaleLowerCase("pt-BR")}
            {r.confirmadoPor ? `, confirmado por ${r.confirmadoPor.apelido}` : ""}.
          </span>
          <button type="button" className="dc-link" onClick={() => setCorrigir(true)}>
            Corrigir
          </button>
        </Faixa>
      ) : (
        (l || (!a && !iaAqui)) && (
          <div className="dc-sentenca__confirmar">
            <span className="dc-nota">{pub.processo ? "Confirme para o resultado ficar no processo." : "Vincule a um processo para guardar o resultado."}</span>
            <div className="dc-linha-acoes">
              {l && (
                <Botao pequeno onClick={() => confirmar.mutate({ tipo: l.tipo, resultado: l.resultado, resumo: l.resumo })} ocupado={confirmar.isPending} disabled={!pub.processo}>
                  <Check /> Confirmar resultado
                </Botao>
              )}
              <Botao variante={l ? "fantasma" : "secundaria"} pequeno onClick={() => setCorrigir(true)} disabled={!pub.processo}>
                {l ? "Corrigir" : "Informar resultado"}
              </Botao>
            </div>
          </div>
        )
      )}
      <CorrigirResultado
        aberto={corrigir}
        aoFechar={() => setCorrigir(false)}
        publicacaoId={pub.id}
        semIa={semIa}
        inicial={{ tipo, resultado: r?.resultado ?? l?.resultado ?? "procedente", resumo: r?.resumo ?? l?.resumo ?? "" }}
        salvando={confirmar.isPending}
        aoSalvar={(b) => confirmar.mutate(b)}
      />
    </BlocoIa>
  );
}

function ConteudoDaSentenca({ l }: { l: LeituraDaSentenca }) {
  const recurso = l.recurso ? [l.recurso.cabivel, l.recurso.dias ? `${l.recurso.dias} dias` : null].filter(Boolean).join(" · ") : "Não cabe recurso";
  return (
    <>
      <div className="dc-sentenca">
        <Par rotulo="Resultado" valor={RESULTADO_DA_DECISAO[l.resultado]} />
        <Par rotulo="Recurso cabível" valor={recurso} nota={l.recurso?.fundamento} />
        <p className="dc-inteira">{l.resumo}</p>
      </div>
      {l.pedidos.length > 0 && (
        <SecaoIa titulo="Pedido a pedido">
          <div className="dc-pedidos">
            {l.pedidos.map((p, i) => (
              <div key={i}>
                <span className="dc-pedidos__nome">{p.pedido}</span>
                <span className="dc-pedidos__decisao">{DECISAO_DO_PEDIDO[p.decisao]}</span>
                <span className="dc-pedidos__detalhe">{p.detalhe}</span>
              </div>
            ))}
          </div>
        </SecaoIa>
      )}
      {(l.valores.length > 0 || l.honorarios) && (
        <div className="dc-ia__duas">
          {l.valores.length > 0 && (
            <SecaoIa titulo="Valores">
              <ListaIa itens={l.valores} />
            </SecaoIa>
          )}
          {l.honorarios && (
            <SecaoIa titulo="Honorários e custas">
              <p>{l.honorarios}</p>
            </SecaoIa>
          )}
        </div>
      )}
      {(l.recorrer.length > 0 || l.manter.length > 0) && (
        <div className="dc-ia__duas">
          {l.recorrer.length > 0 && (
            <SecaoIa titulo="Para recorrer">
              <ListaIa itens={l.recorrer} />
            </SecaoIa>
          )}
          {l.manter.length > 0 && (
            <SecaoIa titulo="Para manter a decisão">
              <ListaIa itens={l.manter} />
            </SecaoIa>
          )}
        </div>
      )}
    </>
  );
}

function CorrigirResultado({
  aberto,
  aoFechar,
  publicacaoId,
  semIa,
  inicial,
  salvando,
  aoSalvar,
}: {
  aberto: boolean;
  aoFechar: () => void;
  publicacaoId: string;
  semIa: boolean;
  inicial: { tipo: TipoDecisao; resultado: ResultadoDecisao; resumo: string };
  salvando: boolean;
  aoSalvar: (b: { tipo: TipoDecisao; resultado: ResultadoDecisao; resumo: string | null }) => void;
}) {
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial);
  }
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Resultado da decisão"
      descricao="Fica no processo e na ficha do cliente."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => aoSalvar({ ...f, resumo: f.resumo.trim() || null })} ocupado={salvando}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="Decisão" htmlFor="rs-tipo">
            <select id="rs-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value as TipoDecisao })}>
              {Object.entries(TIPO_DA_DECISAO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Resultado" htmlFor="rs-resultado">
            <select id="rs-resultado" value={f.resultado} onChange={(e) => setF({ ...f, resultado: e.target.value as ResultadoDecisao })}>
              {Object.entries(RESULTADO_DA_DECISAO).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Em poucas palavras" htmlFor="rs-resumo" ajuda="O que ganhamos e o que perdemos.">
          <IaNoCampo campo="resultado-decisao" alvo={{ publicacaoId }} semIa={semIa} valor={f.resumo} aoUsar={(resumo) => setF({ ...f, resumo })}>
            <textarea id="rs-resumo" rows={3} value={f.resumo} onChange={(e) => setF({ ...f, resumo: e.target.value })} />
          </IaNoCampo>
        </Campo>
      </div>
    </Dialogo>
  );
}

function Par({ rotulo, valor, nota, className }: { rotulo: string; valor: ReactNode; nota?: ReactNode; className?: string }) {
  return (
    <div className={cn("dc-par", className)}>
      <span className="dc-rotulo">{rotulo}</span>
      <span className="dc-valor">{valor}</span>
      {nota && <span className="dc-nota">{nota}</span>}
    </div>
  );
}

function Lido({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <section className="dc-lido">
      <h3 className="dc-lido__titulo">{titulo}</h3>
      <p className="dc-lido__texto">{texto}</p>
    </section>
  );
}

/** O que sustenta a leitura, para ler junto do teor: a conta ou o que a publicação diz e a frase que o código achou nela. */
function ProvaDaSugestao({ c }: { c: Sugestao }) {
  const abrePrazo = !c.audiencia && c.geraPrazo && !!c.dias;
  const conta = c.contagemCalculada;
  return (
    <>
      {abrePrazo && <Lido titulo="Contagem" texto={conta ? [c.regra && `${c.regra}.`, conta.explicacao].filter(Boolean).join(" ") : "Falta saber o tribunal e a comarca do processo."} />}
      {!abrePrazo && c.resumo && <Lido titulo={c.audiencia ? "O que diz" : "Por que não abre prazo"} texto={c.resumo} />}
      {c.trechoConfere && c.trecho && <Lido titulo="Trecho da publicação" texto={`“${c.trecho}”`} />}
    </>
  );
}

/** Os fatos que se decidem: a data em destaque e, abaixo, rótulo e valor num padrão só. */
function FatosDaSugestao({ c, responsavel, publicacaoId, processoId }: { c: Sugestao; responsavel: Pessoa | null; publicacaoId: string; processoId?: string | null }) {
  const confianca: [ReactNode, ReactNode][] = c.conferencia ? [["Confiança", <SeloDeConfianca key="confianca" confianca={c.conferencia.confianca} />]] : [];
  const motivos = c.conferencia && <MotivosDaConferencia conferencia={c.conferencia} />;
  if (c.audiencia) {
    const a = c.audiencia;
    return (
      <div className="dc-fatos">
        <span className="dc-fatos__ato">{a.tipo}</span>
        <div className="dc-fatos__destaque">
          <span className="dc-rotulo">Data</span>
          <strong className="dc-fatos__data">{diaCompleto(a.data)}</strong>
          <span className="dc-nota">{diaDaSemana(a.data)}</span>
        </div>
        <Dados linhas={[["Hora", <span key="hora" className="dc-num">{a.hora}</span>], ["Formato", a.porVideo ? "Por vídeo" : "Presencial"], ...confianca]} />
        {motivos}
      </div>
    );
  }
  if (!c.geraPrazo || !c.dias) {
    return (
      <div className="dc-fatos">
        <span className="dc-fatos__ato">Não abre prazo para o escritório</span>
        {confianca.length > 0 && <Dados linhas={confianca} />}
        {motivos}
      </div>
    );
  }
  const conta = c.contagemCalculada;
  return (
    <div className="dc-fatos">
      <span className="dc-fatos__ato">{c.tipo}</span>
      <div className="dc-fatos__destaque">
        <span className="dc-rotulo">Data final</span>
        {conta ? (
          <DataViva alvo={{ publicacao: publicacaoId }} texto>
            <strong className="dc-fatos__data">{diaCompleto(conta.fim)}</strong>
          </DataViva>
        ) : (
          <strong className="dc-fatos__data">—</strong>
        )}
        <span className="dc-nota">{conta ? diaDaSemana(conta.fim) : "Vincule a um processo para contar"}</span>
      </div>
      <Dados
        linhas={[
          ["Prazo", prazoEmDias(c.dias, c.contagem)],
          ["Base legal", c.fundamento ? <BaseLegalLida key="base" fundamento={c.fundamento} processoId={processoId} /> : "—"],
          ["Responsável", <Responsavel key="responsavel" pessoa={responsavel ?? null} />],
          ...confianca,
        ]}
      />
      {motivos}
    </div>
  );
}

/** Ajustar antes de confirmar (ou criar o prazo quando a IA disse que não tem). */
function ConfirmarComAjuste({ pub, sugestao, aberto, aoFechar, aoConfirmar }: { pub: Publicacao; sugestao: Sugestao | null; aberto: boolean; aoFechar: () => void; aoConfirmar: (fim: string) => void }) {
  const eu = useQuery(euQuery);
  const inicial = () => ({
    tipo: sugestao?.geraPrazo ? sugestao.tipo : "",
    fundamento: sugestao?.fundamento ?? "",
    fundamentoDaIa: !!sugestao?.fundamento,
    dias: String(sugestao?.dias ?? 15),
    contagem: (sugestao?.contagem ?? "uteis") as Contagem,
    responsavelId: pub.sugestao?.responsavel?.id ?? pub.processo?.responsavel?.id ?? "",
    intimadoNoSistemaEm: "",
    sabeData: false,
    fimManual: sugestao?.contagemCalculada?.fim ?? pub.publicadaEm,
  });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const dias = Number(f.dias);
  const intimadoNoSistemaEm = /^\d{4}-\d{2}-\d{2}$/.test(f.intimadoNoSistemaEm) ? f.intimadoNoSistemaEm : null;
  // Com a data final digitada, a prévia também confere se ela cai em dia sem expediente no calendário do processo.
  const diaDigitado = f.sabeData ? diaDigitadoCompleto(f.fimManual) : null;
  const conta = useQuery({
    queryKey: ["calcular", pub.processo?.id, pub.publicadaEm, intimadoNoSistemaEm, dias, f.contagem, diaDigitado],
    queryFn: () => api<PreviaDaConta>("/prazos/calcular", { json: { processoId: pub.processo?.id ?? null, publicadoEm: pub.publicadaEm, intimadoNoSistemaEm, dias, contagem: f.contagem, diaDigitado } }),
    enabled: aberto && dias >= 1,
    // Digitando a data, o aviso do tribunal não pisca a cada tecla; o aviso do dia só vale para o dia de que fala.
    placeholderData: f.sabeData ? keepPreviousData : undefined,
  });
  const salvar = useMutation({
    mutationFn: () =>
      api<{ prazoId: string; fim: string }>(`/publicacoes/${pub.id}/confirmar`, {
        json: { tipo: f.tipo, fundamento: f.fundamento || null, fundamentoDaIa: f.fundamentoDaIa, dias, contagem: f.contagem, responsavelId: f.responsavelId || null, intimadoNoSistemaEm, fimManual: f.sabeData ? f.fimManual : null },
      }),
    onSuccess: (r) => {
      aoFechar();
      aoConfirmar(r.fim);
    },
  });
  const fim = f.sabeData ? f.fimManual : conta.data?.fim;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={sugestao?.geraPrazo ? "Ajustar e confirmar" : "Criar prazo desta publicação"}
      descricao={`Publicada em ${diaCompleto(pub.publicadaEm)}. O Decreta conta a partir do primeiro dia útil seguinte.`}
      className="dc-dialogo--largo"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.tipo.trim().length < 2 || !(dias >= 1) || (!f.sabeData && !conta.data)}>
            Confirmar prazo
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <MotivosParaConferir conferencia={sugestao?.conferencia} />
        <Campo rotulo="O que fazer" htmlFor="cf-tipo">
          <input id="cf-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="Manifestação sobre laudo pericial" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dias" htmlFor="cf-dias">
            <input id="cf-dias" inputMode="numeric" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </Campo>
          <Campo rotulo="Contagem" htmlFor="cf-contagem">
            <select id="cf-contagem" value={f.contagem} onChange={(e) => setF({ ...f, contagem: e.target.value as Contagem })}>
              <option value="uteis">Dias úteis</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="cf-resp">
          <select id="cf-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Sem responsável</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <CampoBaseLegal id="cf-fund" valor={f.fundamento} aoMudar={(fundamento, fundamentoDaIa) => setF((atual) => ({ ...atual, fundamento, fundamentoDaIa }))} tipo={f.tipo} processoId={pub.processo?.id} publicacaoId={pub.id} semIa={!!pub.processo?.semIa} sugeridaPelaIa={sugestao?.fundamento} placeholder="art. 477, § 1º, CPC" />
        <CampoIntimacaoNoSistema id="cf-sistema" valor={f.intimadoNoSistemaEm} aoMudar={(v) => setF({ ...f, intimadoNoSistemaEm: v })} />
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.sabeData} onChange={(e) => setF({ ...f, sabeData: e.target.checked })} />
          Sei a data final (suspensão que o Decreta não conhece)
        </label>
        {f.sabeData && (
          <Campo rotulo="Data final" htmlFor="cf-fim">
            <input id="cf-fim" type="date" value={f.fimManual} onChange={(e) => setF({ ...f, fimManual: e.target.value })} />
          </Campo>
        )}
        {fim && <PreviaNoDialogo fim={fim} previa={conta.data} sabeData={f.sabeData} />}
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function AjustarAudiencia({ pub, audiencia, aberto, aoFechar, aoMarcar }: { pub: Publicacao; audiencia: NonNullable<Sugestao["audiencia"]>; aberto: boolean; aoFechar: () => void; aoMarcar: () => void }) {
  const eu = useQuery(euQuery);
  const inicial = () => ({ dia: audiencia.data, hora: audiencia.hora, tipo: audiencia.tipo, porVideo: audiencia.porVideo, local: "", responsavelId: pub.processo?.responsavel?.id ?? "" });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const salvar = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/audiencia`, { json: { ...f, local: f.local || null, responsavelId: f.responsavelId || null } }),
    onSuccess: () => {
      aoFechar();
      aoMarcar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Audiência"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!f.dia || !/^\d{2}:\d{2}$/.test(f.hora) || f.tipo.trim().length < 2}>
            Pôr na agenda
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Tipo" htmlFor="au-tipo">
          <input id="au-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dia" htmlFor="au-dia">
            <input id="au-dia" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Hora" htmlFor="au-hora">
            <input id="au-hora" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
          </Campo>
        </div>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.porVideo} onChange={(e) => setF({ ...f, porVideo: e.target.checked })} />
          Por vídeo
        </label>
        <Campo rotulo={f.porVideo ? "Link da sala" : "Local"} htmlFor="au-local">
          <input id="au-local" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </Campo>
        <Campo rotulo="Responsável" htmlFor="au-resp">
          <select id="au-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Sem responsável</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

/**
 * Publicação que chegou por outro caminho (e-mail, sistema do tribunal). A
 * pessoa cola o texto; o número, a data e o tipo saem dele, e o processo vem
 * pelo número. O que ela escolher à mão vale mais que o texto.
 */
function ColarPublicacao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navigate = useNavigate();
  const celular = useCelular();
  const eu = useQuery(euQuery);
  /** `undefined`: o do texto. `null`: a pessoa tirou e vai buscar outro. */
  const [proc, setProc] = useState<{ id: string; titulo: string } | null | undefined>(undefined);
  const vazio = { texto: "", cnj: null as string | null, disponibilizadaEm: null as string | null, tipoComunicacao: null as string | null };
  const [f, setF] = useState(vazio);
  const lido = useMemo(() => lerPublicacaoColada(f.texto), [f.texto]);
  const cnj = f.cnj ?? lido.cnj ?? "";
  const dia = f.disponibilizadaEm ?? lido.disponibilizadaEm ?? eu.data?.hoje ?? "";
  const tipo = f.tipoComunicacao ?? lido.tipoComunicacao ?? "Intimação";
  const digitos = (lido.cnj ?? "").replace(/\D/g, "");
  const pelo = useQuery({
    queryKey: ["processos", "pelo-numero", digitos],
    queryFn: () => api<PaginaDaApi<ProcessoNaLista>>(`/processos?busca=${digitos}&situacao=todas`),
    enabled: !!digitos && proc === undefined,
    staleTime: 60_000,
  });
  const doTexto = proc === undefined ? (pelo.data?.itens.find((p) => p.cnj === lido.cnj) ?? null) : null;
  const processo = proc === undefined ? doTexto : proc;
  const fechar = () => {
    setProc(undefined);
    setF(vazio);
    aoFechar();
  };
  const criar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/publicacoes", {
        json: { processoId: processo?.id ?? null, cnj: processo ? null : cnj || null, disponibilizadaEm: dia, tipoComunicacao: tipo, texto: f.texto },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
      avisar("Publicação guardada. A IA está lendo.");
      fechar();
      void (celular ? navigate({ to: "/publicacoes/$id", params: { id: r.id } }) : navigate({ to: "/publicacoes", search: { id: r.id } }));
    },
  });
  const doTextoAjuda = (campo: "cnj" | "disponibilizadaEm" | "tipoComunicacao") => (f[campo] === null && lido[campo] ? "Achado no texto" : undefined);
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={fechar}
      titulo="Colar publicação"
      descricao="Para a intimação que chegou por e-mail ou pelo sistema do tribunal. Cole o texto: o número do processo, a data e o tipo saem dele."
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={f.texto.trim().length < 20}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Teor" htmlFor="cp-texto">
          <textarea id="cp-texto" rows={7} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Cole aqui o texto inteiro da publicação" autoFocus />
        </Campo>
        <Campo rotulo="Processo" ajuda={doTexto ? "Achado pelo número no texto" : undefined}>
          <EscolherProcesso valor={processo} aoEscolher={setProc} />
        </Campo>
        {!processo && (
          <Campo rotulo="Ou o número CNJ" htmlFor="cp-cnj" ajuda={doTextoAjuda("cnj") && (pelo.isFetching ? "Achado no texto · procurando o processo…" : "Achado no texto · não há processo cadastrado com este número")}>
            <input id="cp-cnj" className="dc-num" inputMode="numeric" value={cnj} onChange={(e) => setF({ ...f, cnj: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />
          </Campo>
        )}
        <div className="dc-grade-2">
          <Campo rotulo="Disponibilizada em" htmlFor="cp-dia" ajuda={doTextoAjuda("disponibilizadaEm")}>
            <input id="cp-dia" type="date" value={dia} onChange={(e) => setF({ ...f, disponibilizadaEm: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo" htmlFor="cp-tipo" ajuda={doTextoAjuda("tipoComunicacao")}>
            <select id="cp-tipo" value={tipo} onChange={(e) => setF({ ...f, tipoComunicacao: e.target.value })}>
              {TIPOS_DE_COMUNICACAO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
        </div>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
