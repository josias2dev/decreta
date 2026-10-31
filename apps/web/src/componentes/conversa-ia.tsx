/**
 * A conversa do Perguntar: as mensagens (texto em Markdown, os passos do que a
 * IA consultou e os cartões), a resposta chegando aos poucos, o campo e o
 * painel "Nesta conversa". A resposta em andamento fica fora da tela (num
 * guardador do módulo): ela continua chegando se a pessoa trocar de conversa
 * e voltar, e a conversa nova ganha o endereço dela sem perder o que chegou.
 */
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowUp, Check, Copy, FileText, FolderOpen, Hourglass, Scale, Sparkles, Square, Users, CalendarDays, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from "react";
import { mensagemDoErro } from "@/lib/api";
import { hora } from "@/lib/formato";
import { Markdown } from "@/lib/markdown";
import { conversaQuery, conversasQuery, juntarEvento, perguntar, type ConversaAberta, type ConversaNaLista, type Evento, type MensagemDaConversa, type Modo, type Parte } from "@/lib/perguntar";
import { cn } from "@/lib/util";
import { Cartao, cartoesDaResposta, Passos, type OndeEsta } from "./cartoes-ia";
import { MarcaIa } from "./ui";

/* ------------------------------------------------------------------ */
/* A resposta em andamento                                             */
/* ------------------------------------------------------------------ */

export interface Envio {
  chave: string;
  conversaId: string | null;
  pergunta: string;
  perguntaId: string | null;
  modo: Modo;
  partes: Parte[];
  estado: "enviando" | "pronto" | "parado" | "erro";
  erro?: string;
  mensagemId: string | null;
  controlador: AbortController;
}

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

/** Manda a pergunta. `aoNascer` recebe o id da conversa nova (para ir ao endereço dela). */
export function useEnviar() {
  const qc = useQueryClient();
  return (p: { texto: string; modo: Modo; conversaId: string | null; aoNascer?: (id: string) => void }) => {
    let chave = p.conversaId ?? "nova";
    envios.get(chave)?.controlador.abort();
    const controlador = new AbortController();
    envios.set(chave, { chave, conversaId: p.conversaId, pergunta: p.texto, perguntaId: null, modo: p.modo, partes: [], estado: "enviando", mensagemId: null, controlador });
    avisar();
    const aoChegar = (e: Evento) => {
      if (e.t === "inicio") {
        if (!p.conversaId) {
          const anterior = envios.get(chave)!;
          envios.delete(chave);
          chave = e.conversa.id;
          envios.set(chave, { ...anterior, chave, conversaId: e.conversa.id });
          const nova: ConversaNaLista = { id: e.conversa.id, titulo: e.conversa.titulo, modo: e.conversa.modo, fixada: false, criadaEm: new Date().toISOString(), atualizadaEm: new Date().toISOString(), processo: null };
          qc.setQueryData<{ conversas: ConversaNaLista[] }>(conversasQuery.queryKey, (v) => ({ conversas: [nova, ...(v?.conversas ?? [])] }));
          p.aoNascer?.(e.conversa.id);
        }
        mudar(chave, (x) => ({ ...x, perguntaId: e.pergunta.id }));
        return;
      }
      if (e.t === "fim") {
        mudar(chave, (x) => ({ ...x, estado: x.estado === "enviando" ? "pronto" : x.estado, mensagemId: e.mensagem?.id ?? null }));
        void qc.invalidateQueries({ queryKey: conversaQuery(chave).queryKey });
        void qc.invalidateQueries({ queryKey: conversasQuery.queryKey, exact: true });
        return;
      }
      if (e.t === "titulo") {
        qc.setQueryData<{ conversas: ConversaNaLista[] }>(conversasQuery.queryKey, (v) => v && { conversas: v.conversas.map((k) => (k.id === chave ? { ...k, titulo: e.v } : k)) });
        qc.setQueryData<ConversaAberta>(conversaQuery(chave).queryKey, (v) => v && { ...v, conversa: { ...v.conversa, titulo: e.v } });
        return;
      }
      mudar(chave, (x) => ({ ...x, partes: juntarEvento(x.partes, e) }));
    };
    perguntar({ texto: p.texto, modo: p.modo, conversaId: p.conversaId }, aoChegar, controlador.signal)
      .then(() => mudar(chave, (x) => (x.estado === "enviando" ? { ...x, estado: "pronto" } : x)))
      .catch((err) => {
        if (controlador.signal.aborted) {
          mudar(chave, (x) => ({ ...x, estado: "parado" }));
          // O servidor guarda o que chegou até ali; a conversa vem de novo com isso.
          setTimeout(() => void qc.invalidateQueries({ queryKey: conversaQuery(chave).queryKey }), 600);
        } else mudar(chave, (x) => ({ ...x, estado: "erro", erro: mensagemDoErro(err) }));
      });
  };
}

/* ------------------------------------------------------------------ */
/* As mensagens                                                        */
/* ------------------------------------------------------------------ */

export function Mensagens({ conversaId, mensagens, envio, aoTentarDeNovo }: { conversaId: string | null; mensagens: MensagemDaConversa[]; envio?: Envio; aoTentarDeNovo: (texto: string) => void }) {
  const ids = new Set(mensagens.map((m) => m.id));
  const mostrarPergunta = envio && !(envio.perguntaId && ids.has(envio.perguntaId));
  const mostrarResposta = envio && !(envio.mensagemId && ids.has(envio.mensagemId));
  return (
    <div className="dc-chat__mensagens" aria-live="polite">
      {mensagens.map((m) =>
        m.papel === "pessoa" ? (
          <Pergunta key={m.id} texto={m.texto} em={m.em} />
        ) : (
          <Resposta key={m.id} partes={m.partes ?? [{ tipo: "texto", texto: m.texto }]} texto={m.texto} em={m.em} onde={{ conversaId: conversaId ?? "", mensagemId: m.id }} />
        ),
      )}
      {mostrarPergunta && <Pergunta texto={envio.pergunta} />}
      {mostrarResposta && (
        <>
          <Resposta partes={envio.partes} texto={envio.partes.flatMap((p) => (p.tipo === "texto" ? [p.texto] : [])).join("\n\n")} escrevendo={envio.estado === "enviando"} onde={{ conversaId: envio.conversaId ?? "", mensagemId: envio.mensagemId }} />
          {envio.estado === "erro" && (
            <div className="dc-chat__erro" role="alert">
              <span>{envio.erro}</span>
              <button type="button" className="dc-link" onClick={() => aoTentarDeNovo(envio.pergunta)}>
                Tentar de novo
              </button>
            </div>
          )}
        </>
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

function Resposta({ partes, texto, em, escrevendo, onde }: { partes: Parte[]; texto: string; em?: string; escrevendo?: boolean; onde: OndeEsta }) {
  const ferramentas = partes.filter((p): p is Extract<Parte, { tipo: "ferramenta" }> => p.tipo === "ferramenta");
  const textos = partes.filter((p): p is Extract<Parte, { tipo: "texto" }> => p.tipo === "texto" && !!p.texto.trim());
  const cartoes = cartoesDaResposta(partes);
  const lendo = ferramentas.some((f) => f.saida === undefined);
  const [copiado, setCopiado] = useState(false);
  return (
    <article className="dc-chat__resposta" aria-busy={escrevendo || undefined}>
      <div className="dc-chat__autor">
        <MarcaIa />
        {ferramentas.length > 0 && <Passos ferramentas={ferramentas} />}
      </div>
      {textos.map((t, i) => (
        <Markdown key={i} texto={t.texto} className={cn(escrevendo && i === textos.length - 1 && "is-escrevendo")} />
      ))}
      {escrevendo && !textos.length && !lendo && (
        <div className="dc-chat__pensando" aria-label="A IA está pensando">
          <span />
          <span />
          <span />
        </div>
      )}
      {cartoes.length > 0 && (
        <div className="dc-chat__cartoes">
          {cartoes.map((f) => (
            <Cartao key={f.id} f={f} onde={onde} />
          ))}
        </div>
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

/** Desce junto com a resposta, a menos que a pessoa tenha subido para ler. */
export function useDescerJunto(dep: unknown, chave: string | null, vazia: boolean) {
  const caixa = useRef<HTMLDivElement>(null);
  const colado = useRef(true);
  useLayoutEffect(() => {
    const el = caixa.current;
    if (el) el.scrollTop = vazia ? 0 : el.scrollHeight;
    colado.current = true;
  }, [chave, vazia]);
  useEffect(() => {
    const el = caixa.current;
    if (el && colado.current && !vazia) el.scrollTop = el.scrollHeight;
  }, [dep, vazia]);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const rolar = () => (colado.current = el.scrollHeight - el.scrollTop - el.clientHeight < 140);
    el.addEventListener("scroll", rolar, { passive: true });
    return () => el.removeEventListener("scroll", rolar);
  }, []);
  return caixa;
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
}) {
  const [texto, setTexto] = useState("");
  const campo = useRef<HTMLTextAreaElement>(null);
  const ajustar = () => {
    const el = campo.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
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
  const placeholder = modo === "jurisprudencia" ? "Que tese ou decisão você procura?" : "Pergunte sobre prazos, processos, clientes ou o que precisar";
  return (
    <div className="dc-compositor">
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
      if (p.tipo !== "ferramenta" || !p.saida || p.erro) continue;
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
          por("documentos", { id: s.id, titulo: s.nome, sub: s.processo?.titulo ?? s.cliente?.nome, to: `/documentos/${s.id}`, externo: true });
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
