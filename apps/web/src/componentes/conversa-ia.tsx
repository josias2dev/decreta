/**
 * A conversa do Perguntar: as mensagens (texto em Markdown, os passos do que a
 * IA consultou e os cartões), a resposta chegando aos poucos, o campo e o
 * painel "Nesta conversa". A resposta em andamento fica fora da tela (num
 * guardador do módulo): ela continua chegando se a pessoa trocar de conversa
 * e voltar, e a conversa nova ganha o endereço dela sem perder o que chegou.
 */
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Check, CircleAlert, Copy, FileText, FolderOpen, Hourglass, Scale, Sparkles, Square, Users, CalendarDays, type LucideIcon } from "lucide-react";
import { Component, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { ApiError, mensagemDoErro } from "@/lib/api";
import { hora } from "@/lib/formato";
import { DestinoDoLink, Markdown } from "@/lib/markdown";
import { conversaQuery, conversasQuery, juntarEvento, perguntar, type AlvaraNaIa, type ConversaAberta, type ConversaNaLista, type Evento, type MensagemDaConversa, type Modo, type Parte } from "@/lib/perguntar";
import { cn } from "@/lib/util";
import { Cartao, CartoesCompactos, cartoesDaResposta, erroDaParte, Passos, type OndeEsta } from "./cartoes-ia";
import { AvisoDoLimite, usoDaIaQuery } from "./limite-da-ia";
import { MarcaIa } from "./ui";

/* ------------------------------------------------------------------ */
/* A resposta em andamento                                             */
/* ------------------------------------------------------------------ */

export interface Envio {
  chave: string;
  conversaId: string | null;
  pergunta: string;
  perguntaId: string | null;
  /** O id com que o servidor grava a resposta (vem no "inicio"): a gravada toma o lugar da cópia, mesmo quando a pessoa para. */
  respostaId: string | null;
  modo: Modo;
  partes: Parte[];
  estado: "enviando" | "pronto" | "parado" | "erro";
  erro?: string;
  /** Se "Tentar de novo" pode dar certo agora: não nos limites que só passam amanhã nem na conversa apagada. */
  repetir?: boolean;
  /** Vem no "fim", com a resposta já gravada (para criar a tarefa que a IA propôs). */
  mensagemId: string | null;
  controlador: AbortController;
}

/** O aviso que o servidor grava quando a pessoa para. */
const PAROU = "[Você parou a resposta aqui.]";

const envios = new Map<string, Envio>();
const ouvintes = new Set<() => void>();
const avisar = () => ouvintes.forEach((f) => f());
const assinar = (f: () => void) => {
  ouvintes.add(f);
  return () => ouvintes.delete(f);
};
const mudar = (chave: string, f: (e: Envio) => Envio) => {
  const e = envios.get(chave);
  if (!e) return;
  envios.set(chave, f(e));
  avisar();
};

/** A resposta em andamento desta conversa ("nova" = a que ainda não tem endereço). */
export function useEnvio(chave: string): Envio | undefined {
  return useSyncExternalStore(assinar, () => envios.get(chave));
}

export function esquecerEnvio(chave: string) {
  if (envios.delete(chave)) avisar();
}

/** A pergunta que falhou ou foi parada antes de a conversa ganhar endereço não fica presa na "Nova conversa". */
export function esquecerNova() {
  const e = envios.get("nova");
  if (e && e.estado !== "enviando") esquecerEnvio("nova");
}

/** Depois de parar: o servidor grava o que chegou, com o id do "inicio". Busca a conversa até a resposta aparecer. */
function buscarAteGravar(qc: QueryClient, chave: string, respostaId: string | null) {
  const { queryKey } = conversaQuery(chave);
  let vezes = 0;
  const buscar = () =>
    void qc.invalidateQueries({ queryKey }).then(() => {
      const gravada = qc.getQueryData<ConversaAberta>(queryKey)?.mensagens.some((m) => m.id === respostaId);
      if (respostaId && !gravada && ++vezes < 4) setTimeout(buscar, 800 * vezes);
    });
  setTimeout(buscar, 600);
}

/**
 * A pergunta seguinte toma o lugar da anterior no guardador. Se a conversa
 * gravada ainda não voltou do servidor, a anterior entra nela já, com os ids
 * que o servidor deu (senão a resposta sumia por um instante).
 */
function guardarNaConversa(qc: QueryClient, chave: string, e: Envio) {
  const { perguntaId, respostaId } = e;
  if (!perguntaId) return;
  const em = new Date().toISOString();
  qc.setQueryData<ConversaAberta>(conversaQuery(chave).queryKey, (v) => {
    if (!v) return v;
    const tem = new Set(v.mensagens.map((m) => m.id));
    const faltam: MensagemDaConversa[] = [];
    if (!tem.has(perguntaId)) faltam.push({ id: perguntaId, papel: "pessoa", texto: e.pergunta, partes: null, em });
    // Com erro, o servidor pode não ter gravado a resposta: só a pergunta fica.
    if (respostaId && !tem.has(respostaId) && e.estado !== "erro" && e.partes.length)
      faltam.push({ id: respostaId, papel: "ia", texto: e.partes.flatMap((p) => (p.tipo === "texto" ? [p.texto] : [])).join("\n\n"), partes: e.partes, em });
    return faltam.length ? { ...v, mensagens: [...v.mensagens, ...faltam] } : v;
  });
}

/** Queda, erro do servidor e os limites que passam em instantes; não o limite do dia, a conversa apagada nem o pedido recusado. */
function daParaRepetir(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  if (err.status === 429) return err.code !== "limite_ia" || !!err.passaLogo;
  return err.status >= 500;
}

/**
 * Manda a pergunta. `aoNascer` recebe o id da conversa nova (para ir ao
 * endereço dela). `refazer` é a pergunta já gravada cuja resposta caiu no
 * meio ("Tentar de novo"): o servidor responde de novo sem gravar outra.
 */
export function useEnviar() {
  const qc = useQueryClient();
  return (p: { texto: string; modo: Modo; conversaId: string | null; refazer?: string | null; aoNascer?: (id: string) => void }) => {
    let chave = p.conversaId ?? "nova";
    const anterior = envios.get(chave);
    if (anterior?.estado === "enviando") anterior.controlador.abort();
    else if (anterior) guardarNaConversa(qc, chave, anterior);
    const controlador = new AbortController();
    envios.set(chave, { chave, conversaId: p.conversaId, pergunta: p.texto, perguntaId: p.refazer ?? null, respostaId: null, modo: p.modo, partes: [], estado: "enviando", mensagemId: null, controlador });
    avisar();
    // Cada envio só mexe no que é seu: a resposta anterior pode fechar depois (o nome da conversa vem no fim dela).
    const meu = (f: (e: Envio) => Envio) => mudar(chave, (x) => (x.controlador === controlador ? f(x) : x));
    let respostaId: string | null = null;
    const aoChegar = (e: Evento) => {
      if (e.t === "inicio") {
        respostaId = e.resposta?.id ?? null;
        const atual = envios.get(chave);
        if (!p.conversaId && atual?.controlador === controlador) {
          envios.delete(chave);
          chave = e.conversa.id;
          envios.set(chave, { ...atual, chave, conversaId: e.conversa.id });
          const nova: ConversaNaLista = { id: e.conversa.id, titulo: e.conversa.titulo, modo: e.conversa.modo, fixada: false, criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), processo: null };
          qc.setQueryData<{ conversas: ConversaNaLista[] }>(conversasQuery.queryKey, (v) => ({ conversas: [nova, ...(v?.conversas ?? [])] }));
          p.aoNascer?.(e.conversa.id);
        }
        meu((x) => ({ ...x, perguntaId: e.pergunta.id, respostaId }));
        return;
      }
      if (e.t === "fim") {
        respostaId ??= e.mensagem?.id ?? null;
        meu((x) => ({ ...x, estado: x.estado === "enviando" ? "pronto" : x.estado, mensagemId: e.mensagem?.id ?? null, respostaId }));
        void qc.invalidateQueries({ queryKey: conversaQuery(chave).queryKey });
        void qc.invalidateQueries({ queryKey: conversasQuery.queryKey, exact: true });
        return;
      }
      if (e.t === "titulo") {
        qc.setQueryData<{ conversas: ConversaNaLista[] }>(conversasQuery.queryKey, (v) => v && { conversas: v.conversas.map((k) => (k.id === chave ? { ...k, titulo: e.v } : k)) });
        qc.setQueryData<ConversaAberta>(conversaQuery(chave).queryKey, (v) => v && { ...v, conversa: { ...v.conversa, titulo: e.v } });
        return;
      }
      meu((x) => ({ ...x, partes: juntarEvento(x.partes, e) }));
    };
    perguntar({ texto: p.texto, modo: p.modo, conversaId: p.conversaId, ...(p.refazer ? { refazer: p.refazer } : {}) }, aoChegar, controlador.signal)
      .then(() => meu((x) => (x.estado === "enviando" ? { ...x, estado: "pronto" } : x)))
      .catch((err) => {
        if (!controlador.signal.aborted) return meu((x) => (x.estado === "enviando" ? { ...x, estado: "erro", erro: mensagemDoErro(err), repetir: daParaRepetir(err) } : x));
        meu((x) => (x.estado === "enviando" ? { ...x, estado: "parado", partes: [...x.partes, { tipo: "texto", texto: PAROU }] } : x));
        if (respostaId || !p.conversaId) return buscarAteGravar(qc, chave, respostaId);
        // Parou antes do "inicio", numa conversa que já existe: sem os ids, a cópia não acha o que o servidor gravou. Fica só o gravado.
        setTimeout(() => void qc.invalidateQueries({ queryKey: conversaQuery(chave).queryKey }).then(() => envios.get(chave)?.controlador === controlador && esquecerEnvio(chave)), 600);
      })
      .finally(() => void qc.invalidateQueries({ queryKey: usoDaIaQuery.queryKey }));
  };
}

/* ------------------------------------------------------------------ */
/* As mensagens                                                        */
/* ------------------------------------------------------------------ */

export function Mensagens({ conversaId, mensagens, envio, aoTentarDeNovo }: { conversaId: string | null; mensagens: MensagemDaConversa[]; envio?: Envio; aoTentarDeNovo: (e: Envio) => void }) {
  const ids = new Set(mensagens.map((m) => m.id));
  // Com a resposta chegando, o que o servidor tem depois da pergunta é dela (a resposta cortada que está sendo refeita sai).
  const corte = envio?.estado === "enviando" && envio.perguntaId ? mensagens.findIndex((m) => m.id === envio.perguntaId) : -1;
  const vistas = corte < 0 ? mensagens : mensagens.filter((m, i) => i <= corte || m.id === envio?.respostaId);
  // Uma lista só, com o id do servidor como chave: a cópia em andamento e a resposta gravada são o mesmo componente (o cartão não nasce de novo).
  const itens: ReactNode[] = vistas.map((m) =>
    m.papel === "pessoa" ? (
      <Pergunta key={m.id} texto={m.texto} em={m.em} />
    ) : (
      <Resposta key={m.id} partes={m.partes ?? [{ tipo: "texto", texto: m.texto }]} texto={m.texto} em={m.em} onde={{ conversaId: conversaId ?? "", mensagemId: m.id }} />
    ),
  );
  if (envio && !(envio.perguntaId && ids.has(envio.perguntaId))) itens.push(<Pergunta key={envio.perguntaId ?? "pergunta"} texto={envio.pergunta} />);
  if (envio && !(envio.respostaId && ids.has(envio.respostaId)) && (envio.partes.length || envio.estado === "enviando")) {
    itens.push(
      <Resposta
        key={envio.respostaId ?? "resposta"}
        partes={envio.partes}
        texto={envio.partes.flatMap((p) => (p.tipo === "texto" ? [p.texto] : [])).join("\n\n")}
        escrevendo={envio.estado === "enviando"}
        onde={{ conversaId: envio.conversaId ?? "", mensagemId: envio.mensagemId }}
      />,
    );
  }
  return (
    <div className="dc-chat__mensagens" aria-live="polite">
      {itens}
      {envio?.estado === "erro" && (
        <div className="dc-chat__erro" role="alert">
          <span>{envio.erro}</span>
          {envio.repetir !== false && (
            <button type="button" className="dc-link" onClick={() => aoTentarDeNovo(envio)}>
              Tentar de novo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Pergunta({ texto, em }: { texto: string; em?: string }) {
  return (
    <div className="dc-chat__pergunta">
      <div className="dc-chat__balao">{texto}</div>
      {em && <span className="dc-chat__hora dc-num">{hora(em)}</span>}
    </div>
  );
}

/** Alvará não tem tela própria: o link que a IA fizer para ele leva ao processo do alvará (se a resposta o consultou), ou fica só o texto. */
function destinoDosLinks(partes: Parte[]) {
  const processoDoAlvara = new Map<string, string>();
  for (const p of partes) {
    if (p.tipo !== "ferramenta" || p.nome !== "buscarAlvaras" || erroDaParte(p)) continue;
    const itens = (p.saida as { itens?: unknown } | null)?.itens;
    for (const a of Array.isArray(itens) ? (itens as AlvaraNaIa[]) : []) if (a?.processo?.id) processoDoAlvara.set(a.id, a.processo.id);
  }
  return (alvo: string) => {
    const processo = processoDoAlvara.get(/^\/alvaras\/([\w-]+)\/?$/.exec(alvo)?.[1] ?? "");
    return processo ? `/processos/${processo}` : undefined;
  };
}

function Resposta({ partes, texto, em, escrevendo = false, onde }: { partes: Parte[]; texto: string; em?: string; escrevendo?: boolean; onde: OndeEsta }) {
  const ferramentas = partes.filter((p): p is Extract<Parte, { tipo: "ferramenta" }> => p.tipo === "ferramenta");
  const textos = partes.filter((p): p is Extract<Parte, { tipo: "texto" }> => p.tipo === "texto" && !!p.texto.trim());
  const cartoes = cartoesDaResposta(partes);
  const lendo = escrevendo && ferramentas.some((f) => f.saida === undefined && !f.erro);
  const destino = useMemo(() => destinoDosLinks(partes), [partes]);
  const [copiado, setCopiado] = useState(false);
  return (
    <article className="dc-chat__resposta" aria-busy={escrevendo || undefined}>
      <div className="dc-chat__autor">
        <MarcaIa />
        {ferramentas.length > 0 && <Passos ferramentas={ferramentas} escrevendo={escrevendo} />}
      </div>
      <DestinoDoLink.Provider value={destino}>
        {textos.map((t, i) => (
          <Markdown key={i} texto={t.texto} escrevendo={escrevendo && i === textos.length - 1} />
        ))}
      </DestinoDoLink.Provider>
      {escrevendo && !textos.length && !lendo && (
        <div className="dc-chat__pensando" aria-label="A IA está pensando">
          <span />
          <span />
          <span />
        </div>
      )}
      {/* Os cartões vêm depois do texto, quando a resposta termina; enquanto ela chega, os passos dizem o que a IA consulta. */}
      {cartoes.length > 0 && !escrevendo && (
        <CartoesCompactos.Provider value>
          <div className="dc-chat__cartoes">
            {cartoes.map((f) => (
              <Limite key={f.id} falha={<CartaoComDefeito />}>
                <Cartao f={f} onde={onde} />
              </Limite>
            ))}
          </div>
        </CartoesCompactos.Provider>
      )}
      {!escrevendo && texto.trim() && (
        <div className="dc-chat__pe">
          <button
            type="button"
            className="dc-btn dc-btn--fantasma dc-btn--sm"
            onClick={() => {
              void navigator.clipboard?.writeText(texto).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 1500);
              });
            }}
            aria-label="Copiar a resposta"
          >
            {copiado ? <Check /> : <Copy />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
          {em && <span className="dc-chat__hora dc-num">{hora(em)}</span>}
        </div>
      )}
    </article>
  );
}

/** Um cartão (ou o painel ao lado) com defeito, por uma saída que a tela não esperava, não derruba a conversa. */
class Limite extends Component<{ children: ReactNode; falha: ReactNode }, { falhou: boolean }> {
  override state = { falhou: false };
  static getDerivedStateFromError() {
    return { falhou: true };
  }
  override render() {
    return this.state.falhou ? this.props.falha : this.props.children;
  }
}

function CartaoComDefeito() {
  return (
    <section className="dc-cartao-ia dc-cartao-ia--falha">
      <header className="dc-cartao-ia__topo">
        <CircleAlert aria-hidden />
        <h3>Não deu para mostrar esta consulta</h3>
      </header>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* A rolagem                                                           */
/* ------------------------------------------------------------------ */

/** Até onde do fim a tela ainda conta como "no fim" (descendo, volta a acompanhar). */
const PERTO = 40;
/** A partir de quanto longe do fim aparece o botão de ir para o fim. */
const LONGE = 200;

/** Posição de um elemento dentro da caixa que rola. */
const topoNaCaixa = (caixa: HTMLElement, el: Element) => el.getBoundingClientRect().top - caixa.getBoundingClientRect().top + caixa.scrollTop;

/**
 * Onde a tela fica acompanhando: o fim da conversa. Enquanto a IA escreve e a
 * resposta já tem cartões, o fim do texto não passa do meio da tela (os
 * cartões, recolhidos, ficam embaixo dele).
 */
function alvo(caixa: HTMLElement, escrevendo: boolean): number {
  const fim = caixa.scrollHeight - caixa.clientHeight;
  if (!escrevendo) return fim;
  const respostas = caixa.querySelectorAll(".dc-chat__resposta");
  const texto = respostas[respostas.length - 1]?.querySelector(":scope > .dc-chat__cartoes")?.previousElementSibling;
  if (!texto) return fim;
  const fimDoTexto = topoNaCaixa(caixa, texto) + texto.getBoundingClientRect().height;
  return Math.max(0, Math.min(fim, Math.round(fimDoTexto - caixa.clientHeight / 2)));
}

/**
 * A rolagem da conversa. Enquanto a resposta chega, a tela acompanha o que a
 * IA escreve; só a pessoa desliga isso, subindo (roda, dedo, PageUp, seta para
 * cima, Home). Descer até perto do fim, mandar outra pergunta ou o botão de ir
 * para o fim religam. No fim da resposta, os cartões abrem embaixo do texto
 * sem tirar o texto da tela. Ao abrir uma conversa, a última pergunta fica no
 * alto (ou a tela vai ao fim, se tudo couber).
 */
export function useRolagemDaConversa(chave: string | null, vazia: boolean, envio: Envio | undefined) {
  const [caixa, setCaixa] = useState<HTMLDivElement | null>(null);
  const acompanhando = useRef(true);
  const posicionar = useRef(true);
  const [longe, setLonge] = useState(false);
  const escrevendo = envio?.estado === "enviando";
  const agora = useRef({ vazia, escrevendo });
  useLayoutEffect(() => {
    agora.current = { vazia, escrevendo };
  });
  // Onde a própria tela pôs a rolagem: o evento de rolar que isso gera chega depois e não é a pessoa descendo.
  const ondeFoi = useRef(0);
  const rolar = useCallback((caixa: HTMLElement, top: number) => {
    caixa.scrollTop = top;
    ondeFoi.current = caixa.scrollTop;
  }, []);

  const medir = useCallback(() => {
    if (caixa) setLonge(!agora.current.vazia && !acompanhando.current && caixa.scrollHeight - caixa.clientHeight - caixa.scrollTop > LONGE);
  }, [caixa]);

  const ajustar = useCallback(
    (caixaMudou = false) => {
      if (!caixa) return;
      const fim = caixa.scrollHeight - caixa.clientHeight;
      if (agora.current.vazia) rolar(caixa, 0);
      else if (agora.current.escrevendo) {
        posicionar.current = false;
        const a = alvo(caixa, true);
        // Acompanhar só desce: quem desceu para ver um cartão não é puxado de volta.
        if (acompanhando.current && caixa.scrollTop < a) rolar(caixa, a);
      } else if (posicionar.current) {
        const perguntas = caixa.querySelectorAll(".dc-chat__pergunta");
        const ultima = perguntas[perguntas.length - 1];
        if (ultima) {
          posicionar.current = false;
          rolar(caixa, Math.min(fim, Math.max(0, topoNaCaixa(caixa, ultima) - 16)));
          acompanhando.current = caixa.scrollTop >= fim - 2;
        }
      } else if (caixaMudou && acompanhando.current) rolar(caixa, fim);
      medir();
    },
    [caixa, medir, rolar],
  );

  useLayoutEffect(() => {
    if (!caixa) return;
    // O tamanho da caixa (o campo crescendo, o teclado) e o do que está dentro (a resposta chegando).
    let altura = caixa.clientHeight;
    const ro = new ResizeObserver(() => {
      const mudou = caixa.clientHeight !== altura;
      altura = caixa.clientHeight;
      ajustar(mudou);
    });
    ro.observe(caixa);
    let dentro: Element | null = null;
    const trocouDentro = () => {
      if (caixa.firstElementChild === dentro) return;
      if (dentro) ro.unobserve(dentro);
      dentro = caixa.firstElementChild;
      if (dentro) ro.observe(dentro);
    };
    trocouDentro();
    const mo = new MutationObserver(trocouDentro);
    mo.observe(caixa, { childList: true });

    const soltar = () => {
      acompanhando.current = false;
    };
    let dedo: number | null = null;
    const aoRodar = (e: WheelEvent) => e.deltaY < 0 && soltar();
    const aoTocar = (e: TouchEvent) => (dedo = e.touches[0]?.clientY ?? null);
    const aoArrastar = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY;
      if (y == null) return;
      if (dedo != null && y > dedo + 2) soltar();
      dedo = y;
    };
    const aoTeclar = (e: globalThis.KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest("input, textarea, select, [contenteditable]")) return;
      if (e.key === "PageUp" || e.key === "ArrowUp" || e.key === "Home" || (e.key === " " && e.shiftKey)) soltar();
    };
    ondeFoi.current = caixa.scrollTop;
    const aoRolar = () => {
      const desceu = caixa.scrollTop > ondeFoi.current;
      ondeFoi.current = caixa.scrollTop;
      if (!acompanhando.current && desceu && caixa.scrollTop >= alvo(caixa, agora.current.escrevendo) - PERTO) acompanhando.current = true;
      medir();
    };
    const aoMudarAJanela = () => ajustar(true);
    caixa.addEventListener("wheel", aoRodar, { passive: true });
    caixa.addEventListener("touchstart", aoTocar, { passive: true });
    caixa.addEventListener("touchmove", aoArrastar, { passive: true });
    caixa.addEventListener("scroll", aoRolar, { passive: true });
    document.addEventListener("keydown", aoTeclar);
    window.visualViewport?.addEventListener("resize", aoMudarAJanela);
    return () => {
      ro.disconnect();
      mo.disconnect();
      caixa.removeEventListener("wheel", aoRodar);
      caixa.removeEventListener("touchstart", aoTocar);
      caixa.removeEventListener("touchmove", aoArrastar);
      caixa.removeEventListener("scroll", aoRolar);
      document.removeEventListener("keydown", aoTeclar);
      window.visualViewport?.removeEventListener("resize", aoMudarAJanela);
    };
  }, [caixa, ajustar, medir]);

  // Outra conversa (ou a nova): posiciona quando as mensagens chegarem.
  useLayoutEffect(() => {
    posicionar.current = true;
    acompanhando.current = true;
    ajustar();
  }, [chave, vazia, ajustar]);

  // Pergunta nova: volta a acompanhar, de onde a pessoa estiver.
  const novo = escrevendo ? envio.controlador : null;
  useLayoutEffect(() => {
    if (!novo) return;
    acompanhando.current = true;
    ajustar();
  }, [novo, ajustar]);

  // A resposta terminou (ou parou) e os cartões abriram: o fim do texto continua à vista, com o começo dos cartões embaixo.
  const antes = useRef<{ controlador?: AbortController; escrevendo: boolean }>({ escrevendo: false });
  useLayoutEffect(() => {
    const terminou = antes.current.escrevendo && !escrevendo && antes.current.controlador === envio?.controlador;
    antes.current = { controlador: envio?.controlador, escrevendo };
    if (!terminou || !caixa || !acompanhando.current) return;
    const fim = caixa.scrollHeight - caixa.clientHeight;
    rolar(caixa, Math.min(fim, Math.max(caixa.scrollTop, envio?.estado === "erro" ? fim : alvo(caixa, true))));
    acompanhando.current = caixa.scrollTop >= fim - 2;
    medir();
  }, [escrevendo, envio, caixa, medir, rolar]);

  const irParaOFim = useCallback(() => {
    if (!caixa) return;
    acompanhando.current = true;
    setLonge(false);
    caixa.scrollTo({ top: alvo(caixa, agora.current.escrevendo), behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [caixa]);

  return { caixa: setCaixa, longe, irParaOFim };
}

/** Longe do fim: o botão redondo no campo, ao lado do enviar, leva de volta (com um ponto quando a resposta ainda está chegando). */
export function IrParaOFim({ chegando, aoClicar }: { chegando: boolean; aoClicar: () => void }) {
  return (
    <button type="button" className="dc-chat__ir-fim" onClick={aoClicar} aria-label={chegando ? "Ir para o fim: a resposta está chegando" : "Ir para o fim da conversa"} title="Ir para o fim">
      <ArrowDown aria-hidden />
      {chegando && <span className="dc-chat__ir-fim-ponto" aria-hidden />}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* O campo                                                             */
/* ------------------------------------------------------------------ */

export function Compositor({
  modo,
  aoMudarModo,
  aoEnviar,
  aoParar,
  ocupado,
  rodape,
  inicial,
  focar,
  curto,
  irParaOFim,
}: {
  modo: Modo;
  aoMudarModo: (m: Modo) => void;
  aoEnviar: (texto: string) => void;
  aoParar: () => void;
  ocupado: boolean;
  rodape: string;
  /** Texto que uma sugestão deixou no campo. */
  inicial?: { texto: string; n: number };
  focar?: boolean;
  /** Celular: o texto de exemplo curto, para o campo vazio ficar numa linha. */
  curto?: boolean;
  /** O botão de voltar ao fim, ao lado do enviar: no campo ele não cobre nada da conversa. */
  irParaOFim?: ReactNode;
}) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const ajustar = () => {
    const el = campo.current;
    if (!el) return;
    // A caixa segura a altura enquanto o campo mede: sem isso a conversa crescia por um instante e a rolagem dela saía do fim a cada letra.
    const caixa = el.parentElement;
    if (caixa) caixa.style.minHeight = `${caixa.offsetHeight}px`;
    el.style.height = "auto";
    // Vazio, o campo tem uma linha: o texto de exemplo não conta (no celular ele quebrava e o campo pulava ao digitar).
    el.style.height = el.value ? `${Math.min(el.scrollHeight, 220)}px` : "";
    if (caixa) caixa.style.minHeight = "";
  };
  useEffect(() => {
    if (!inicial) return;
    setTexto(inicial.texto);
    requestAnimationFrame(() => {
      ajustar();
      const el = campo.current;
      el?.focus();
      el?.setSelectionRange(inicial.texto.length, inicial.texto.length);
    });
  }, [inicial]);
  useEffect(() => {
    if (focar) campo.current?.focus();
  }, [focar]);
  useLayoutEffect(ajustar, [texto]);

  const mandar = () => {
    const t = texto.trim();
    if (!t || ocupado) return;
    aoEnviar(t);
    setTexto("");
  };
  const tecla = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && !window.matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      mandar();
    }
  };
  const placeholder = modo === "jurisprudencia" ? (curto ? "Que tese você procura?" : "Que tese ou decisão você procura?") : curto ? "Pergunte sobre o escritório" : "Pergunte sobre prazos, processos, clientes ou o que precisar";
  return (
    <div className="dc-compositor">
      <AvisoDoLimite />
      <form
        className="dc-compositor__caixa"
        onSubmit={(e) => {
          e.preventDefault();
          mandar();
        }}
      >
        <textarea ref={campo} rows={1} value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={tecla} placeholder={placeholder} aria-label="Pergunta" enterKeyHint="send" />
        <div className="dc-compositor__barra">
          <div className="dc-modos" role="radiogroup" aria-label="Modo">
            <ModoBotao ligado={modo === "pergunte"} icone={Sparkles} aoClicar={() => aoMudarModo("pergunte")}>
              Pergunte
            </ModoBotao>
            <ModoBotao ligado={modo === "jurisprudencia"} icone={Scale} aoClicar={() => aoMudarModo("jurisprudencia")}>
              Jurisprudência
            </ModoBotao>
          </div>
          <div className="dc-compositor__direita">
            {irParaOFim}
            {ocupado ? (
              <button type="button" className="dc-compositor__enviar is-parar" onClick={aoParar} aria-label="Parar a resposta" title="Parar">
                <Square />
              </button>
            ) : (
              <button type="submit" className="dc-compositor__enviar" disabled={!texto.trim()} aria-label="Enviar" title="Enviar">
                <ArrowUp />
              </button>
            )}
          </div>
        </div>
      </form>
      <p className="dc-compositor__nota">{rodape}</p>
    </div>
  );
}

function ModoBotao({ ligado, icone: Icone, aoClicar, children }: { ligado: boolean; icone: LucideIcon; aoClicar: () => void; children: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={ligado} className={cn("dc-modo", ligado && "is-on")} onClick={aoClicar}>
      <Icone aria-hidden />
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Nesta conversa: tudo o que a IA consultou, num lugar                */
/* ------------------------------------------------------------------ */

type Item = { id: string; titulo: string; sub?: string; to: string; externo?: boolean };

export function itensDaConversa(mensagens: { partes: Parte[] | null }[]) {
  const grupos: Record<"processos" | "prazos" | "audiencias" | "clientes" | "documentos", Map<string, Item>> = {
    processos: new Map(),
    prazos: new Map(),
    audiencias: new Map(),
    clientes: new Map(),
    documentos: new Map(),
  };
  const por = (g: keyof typeof grupos, i: Item) => grupos[g].set(i.id, i);
  for (const m of mensagens)
    for (const p of m.partes ?? []) {
      if (p.tipo !== "ferramenta" || !p.saida || erroDaParte(p)) continue;
      const s = p.saida as any;
      const lista: any[] = Array.isArray(s.itens) ? s.itens : [];
      switch (p.nome) {
        case "buscarPrazos":
          lista.forEach((x) => por("prazos", { id: x.id, titulo: x.tipo, sub: `${x.quando} · ${x.processo.titulo}`, to: `/prazos/${x.id}` }));
          break;
        case "buscarProcessos":
          lista.forEach((x) => por("processos", { id: x.id, titulo: x.titulo, sub: x.cnj ?? "Extrajudicial", to: `/processos/${x.id}` }));
          break;
        case "lerProcesso":
          if (s.processo) por("processos", { id: s.processo.id, titulo: s.processo.titulo, sub: s.processo.cnj ?? "Extrajudicial", to: `/processos/${s.processo.id}` });
          (s.prazos ?? []).forEach((x: any) => por("prazos", { id: x.id, titulo: x.tipo, sub: `${x.quando} · ${x.processo.titulo}`, to: `/prazos/${x.id}` }));
          break;
        case "buscarAudiencias":
          lista.forEach((x) => por("audiencias", { id: x.id, titulo: x.tipo, sub: `${x.quando} · ${x.processo.titulo}`, to: `/audiencias/${x.id}` }));
          break;
        case "buscarClientes":
          lista.forEach((x) => por("clientes", { id: x.id, titulo: x.nome, to: `/clientes/${x.id}` }));
          break;
        case "lerCliente":
          if (s.cliente) por("clientes", { id: s.cliente.id, titulo: s.cliente.nome, to: `/clientes/${s.cliente.id}` });
          break;
        case "buscarDocumentos":
          lista.forEach((x) => por("documentos", { id: x.id, titulo: x.nome, sub: x.processo?.titulo ?? x.cliente?.nome, to: `/documentos/${x.id}`, externo: true }));
          break;
        case "lerDocumento":
          if (s.id) por("documentos", { id: s.id, titulo: s.nome, sub: s.processo?.titulo ?? s.cliente?.nome, to: `/documentos/${s.id}`, externo: true });
          break;
      }
    }
  return grupos;
}

const GRUPOS: { chave: keyof ReturnType<typeof itensDaConversa>; titulo: string; icone: LucideIcon }[] = [
  { chave: "processos", titulo: "Processos", icone: FolderOpen },
  { chave: "prazos", titulo: "Prazos", icone: Hourglass },
  { chave: "audiencias", titulo: "Audiências", icone: CalendarDays },
  { chave: "clientes", titulo: "Clientes", icone: Users },
  { chave: "documentos", titulo: "Documentos", icone: FileText },
];

/** Só aparece depois que a IA consulta algo: vazio, a conversa fica com a largura toda. */
export function NestaConversa({ mensagens }: { mensagens: { partes: Parte[] | null }[] }) {
  return (
    <Limite falha={null}>
      <PainelNestaConversa mensagens={mensagens} />
    </Limite>
  );
}

function PainelNestaConversa({ mensagens }: { mensagens: { partes: Parte[] | null }[] }) {
  const grupos = itensDaConversa(mensagens);
  if (!GRUPOS.some((g) => grupos[g.chave].size > 0)) return null;
  return (
    <aside className="dc-chat__contexto" aria-label="Nesta conversa">
      <h2 className="dc-chat__contexto-titulo">Nesta conversa</h2>
      {GRUPOS.map((g) => {
        const itens = [...grupos[g.chave].values()];
        if (!itens.length) return null;
        return (
          <section key={g.chave} className="dc-chat__contexto-grupo">
            <h3>
              <g.icone aria-hidden /> {g.titulo} <span className="dc-num">{itens.length}</span>
            </h3>
            <ul>
              {itens.slice(0, 12).map((i) => (
                <li key={i.id}>
                  {i.externo ? (
                    <a href={`/api/app/documentos/${i.id}/arquivo`} target="_blank" rel="noopener">
                      <span>{i.titulo}</span>
                      {i.sub && <small>{i.sub}</small>}
                    </a>
                  ) : (
                    <Link to={i.to}>
                      <span>{i.titulo}</span>
                      {i.sub && <small>{i.sub}</small>}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </aside>
  );
}
