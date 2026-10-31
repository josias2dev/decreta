/** Componentes do design system (classes dc-*) em React. */
import { useMutation } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, RefreshCw, Search, ThumbsDown, ThumbsUp, type LucideIcon } from "lucide-react";
import { Children, Fragment, forwardRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { api, mensagemDoErro } from "@/lib/api";
import type { Analise, Pessoa, Urgencia } from "@/lib/tipos";
import { cn } from "@/lib/util";

type Variante = "primaria" | "secundaria" | "fantasma" | "ia" | "perigo";

export const Botao = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; pequeno?: boolean; bloco?: boolean; ocupado?: boolean }>(
  function Botao({ variante = "secundaria", pequeno, bloco, ocupado, className, children, disabled, type = "button", ...props }, ref) {
    return (
      <button
        ref={ref}
        type={type}
        className={cn("dc-btn", `dc-btn--${variante}`, pequeno ? "dc-btn--sm" : "dc-btn--md", bloco && "dc-btn--bloco", (disabled || ocupado) && "opacity-60", className)}
        disabled={disabled || ocupado}
        aria-busy={ocupado || undefined}
        {...props}
      >
        {children}
      </button>
    );
  },
);

export function Avatar({ pessoa, grande }: { pessoa: Pick<Pessoa, "iniciais" | "foto"> | null | undefined; grande?: boolean }) {
  return (
    <span className="dc-avatar" style={grande ? { width: 36, height: 36, fontSize: 13 } : undefined} aria-hidden>
      {pessoa?.foto ? <img src={pessoa.foto} alt="" /> : (pessoa?.iniciais ?? "—")}
    </span>
  );
}

/** Pessoa com avatar; sem ninguém, o aviso vermelho "Sem responsável". */
export function Responsavel({ pessoa }: { pessoa: Pessoa | null }) {
  if (!pessoa) return <span className="dc-selo dc-selo--vencido">Sem responsável</span>;
  return (
    <span className="dc-pessoa">
      <Avatar pessoa={pessoa} />
      {pessoa.apelido}
    </span>
  );
}

const SELO: Record<Urgencia | "audiencia" | "tarefa", string> = {
  vencido: "dc-selo--vencido",
  hoje: "dc-selo--hoje",
  breve: "dc-selo--breve",
  prazo: "dc-selo--prazo",
  cumprido: "dc-selo--cumprido",
  audiencia: "dc-selo--prazo",
  tarefa: "dc-selo--prazo",
};

export function Selo({ urgencia, children }: { urgencia: Urgencia | "audiencia" | "tarefa"; children: ReactNode }) {
  return <span className={cn("dc-selo", SELO[urgencia])}>{children}</span>;
}

export function Chip({ ligado, n, alerta, onClick, children }: { ligado?: boolean; n?: number; alerta?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cn("dc-chip", ligado && "is-on", alerta && !ligado && "dc-chip--alerta")} onClick={onClick} aria-pressed={ligado}>
      {children}
      {n != null && <span className="dc-chip__n">{n}</span>}
    </button>
  );
}

/** Escolha de uma entre poucas opções (como a vista da agenda): a ligada fica em branco, levantada. */
export function Segmentos<T extends string>({ opcoes, valor, aoMudar, rotulo }: { opcoes: { id: T; rotulo: string; icone?: LucideIcon }[]; valor: T; aoMudar: (id: T) => void; rotulo: string }) {
  return (
    <div className="dc-segmentos" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.id} type="button" role="radio" aria-checked={o.id === valor} className={cn("dc-segmentos__item", o.id === valor && "is-on")} onClick={() => aoMudar(o.id)}>
          {o.icone && <o.icone aria-hidden />}
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}

export function Painel({ titulo, acao, children, className, corpo = true }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string; corpo?: boolean }) {
  return (
    <section className={cn("dc-painel", className)}>
      {(titulo || acao) && (
        <div className="dc-painel__topo">
          {typeof titulo === "string" ? <h2 className="dc-painel__titulo">{titulo}</h2> : titulo}
          {acao}
        </div>
      )}
      {corpo ? <div className="dc-painel__corpo">{children}</div> : children}
    </section>
  );
}

export function Cabecalho({ titulo, sub, acoes }: { titulo: string; sub?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="dc-cabecalho">
      <div className="dc-cabecalho__texto">
        <h1 className="dc-h1">{titulo}</h1>
        {sub && <p className="dc-sub">{sub}</p>}
      </div>
      {acoes && <div className="dc-acoes">{acoes}</div>}
    </div>
  );
}

export function MarcaIa() {
  return <span className="dc-ia__marca">IA</span>;
}

/**
 * O bloco da IA: título, fonte, conteúdo e o rodapé "Gerado por IA". Mostra
 * também a análise desatualizada, a recusa (sem teor) e o erro.
 */
export function BlocoIa({
  titulo,
  analise,
  rodape = "Gerado por IA. Confira nos autos.",
  aoRefazer,
  refazendo,
  avisoDesatualizada,
  rotuloGerar = "Gerar",
  children,
  className,
}: {
  titulo: string;
  analise?: (Pick<Analise<object>, "situacao" | "fonte" | "desatualizada" | "erro" | "conteudo"> & { id?: string }) | null;
  rodape?: string;
  aoRefazer?: () => void;
  refazendo?: boolean;
  avisoDesatualizada?: string;
  /** O botão quando ainda não há análise ("Conferir", "Ler a decisão"). */
  rotuloGerar?: string;
  children?: ReactNode;
  className?: string;
}) {
  const recusa = analise?.situacao === "recusa";
  const erro = analise?.situacao === "erro";
  return (
    <section className={cn("dc-ia", recusa && "is-recusa", erro && "is-erro", className)} aria-busy={refazendo || undefined}>
      <div className="dc-ia__topo">
        <MarcaIa />
        <span className="dc-ia__titulo">{titulo}</span>
        {analise?.fonte && <span className="dc-ia__fonte">{analise.fonte}</span>}
      </div>
      {analise?.desatualizada && (
        <div className="dc-ia__aviso">
          <span className="flex-1">{avisoDesatualizada ?? "Há novidade nos autos desde esta leitura."}</span>
          {aoRefazer && (
            <Botao variante="fantasma" pequeno onClick={aoRefazer} ocupado={refazendo}>
              Atualizar
            </Botao>
          )}
        </div>
      )}
      {refazendo ? (
        <div className="flex flex-col gap-2" aria-label="A IA está lendo">
          <div className="dc-ia__linha" style={{ width: "92%" }} />
          <div className="dc-ia__linha" style={{ width: "78%" }} />
          <div className="dc-ia__linha" style={{ width: "64%" }} />
        </div>
      ) : recusa ? (
        <p className="m-0 text-[14px] leading-[22px]">{String((analise?.conteudo as { recusa?: string })?.recusa ?? "A IA não conseguiu ler o material.")}</p>
      ) : erro ? (
        <p className="m-0 text-[14px] leading-[22px] text-[var(--vencido)]">A IA não respondeu agora. Tente de novo em instantes.</p>
      ) : (
        children
      )}
      <div className="dc-ia__pe">
        <span>{rodape}</span>
        {analise?.id && analise.situacao === "pronto" && !refazendo && <RetornoDaIa key={analise.id} alvo={{ analiseId: analise.id }} />}
        {aoRefazer && !analise?.desatualizada && (
          <Botao variante="fantasma" pequeno onClick={aoRefazer} ocupado={refazendo}>
            <RefreshCw /> {analise ? "Refazer" : rotuloGerar}
          </Botao>
        )}
      </div>
    </section>
  );
}

/**
 * "Útil" ou "Errado" no que a IA entregou. O errado pede uma frase do que
 * estava errado; os sócios veem tudo em Configurações. Votar de novo troca o voto.
 */
export function RetornoDaIa({ alvo }: { alvo: { analiseId: string } | { pecaId: string } }) {
  const avisar = useAviso();
  const [voto, setVoto] = useState<boolean | null>(null);
  const [comentando, setComentando] = useState(false);
  const [comentario, setComentario] = useState("");
  const enviar = useMutation({
    mutationFn: (b: { util: boolean; comentario?: string }) => api("/ia/retorno", { json: { ...alvo, ...b } }),
    onSuccess: (_r, b) => {
      setVoto(b.util);
      if (b.comentario !== undefined) {
        setComentando(false);
        avisar("Obrigado. O retorno fica com os sócios.");
      } else setComentando(!b.util);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <>
      <span className="dc-retorno" role="group" aria-label="Avaliar a IA">
        <Botao variante="fantasma" pequeno aria-label="Útil" title="Útil" aria-pressed={voto === true} disabled={enviar.isPending} onClick={() => enviar.mutate({ util: true })}>
          <ThumbsUp />
        </Botao>
        <Botao variante="fantasma" pequeno aria-label="Errado" title="Errado" aria-pressed={voto === false} disabled={enviar.isPending} onClick={() => enviar.mutate({ util: false })}>
          <ThumbsDown />
        </Botao>
      </span>
      {comentando && (
        <form
          className="dc-campo dc-retorno__comentario"
          onSubmit={(e) => {
            e.preventDefault();
            enviar.mutate({ util: false, comentario: comentario.trim() });
          }}
        >
          <textarea rows={2} value={comentario} onChange={(e) => setComentario(e.target.value)} placeholder="O que estava errado? Uma frase já ajuda." aria-label="O que estava errado" autoFocus />
          <div className="dc-linha-acoes">
            <Botao type="submit" pequeno ocupado={enviar.isPending} disabled={!comentario.trim()}>
              Enviar
            </Botao>
            <Botao variante="fantasma" pequeno onClick={() => setComentando(false)}>
              Agora não
            </Botao>
          </div>
        </form>
      )}
    </>
  );
}

export function SecaoIa({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="dc-ia__sec">
      <h4>{titulo}</h4>
      {children}
    </div>
  );
}

export function ListaIa({ itens }: { itens: string[] }) {
  if (itens.length === 1) return <p>{itens[0]}</p>;
  return (
    <ul>
      {itens.map((i) => (
        <li key={i}>{i}</li>
      ))}
    </ul>
  );
}

export function Dados({ linhas }: { linhas: [ReactNode, ReactNode][] }) {
  return (
    <dl className="dc-dados">
      {linhas.map(([rotulo, valor], i) => (
        <div key={i} className="contents">
          <dt>{rotulo}</dt>
          <dd>{valor}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="dc-vazio">
      <strong>{titulo}</strong>
      {children}
    </div>
  );
}

export function Esqueleto({ altura = 16, largura = "100%", className }: { altura?: number; largura?: number | string; className?: string }) {
  return <div className={cn("dc-esqueleto", className)} style={{ height: altura, width: largura }} />;
}

export function Carregando({ linhas = 4 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <Esqueleto key={i} altura={i === 0 ? 24 : 56} largura={i === 0 ? "40%" : "100%"} />
      ))}
    </div>
  );
}

export function Abas<T extends string>({ abas, ativa, aoMudar, pagina }: { abas: { id: T; rotulo: string; n?: number }[]; ativa: T; aoMudar: (id: T) => void; pagina?: boolean }) {
  return (
    <div className={cn("dc-abas", pagina && "dc-abas--pagina")} role="tablist">
      {abas.map((a) => (
        <button key={a.id} type="button" role="tab" aria-selected={a.id === ativa} className={cn("dc-aba", a.id === ativa && "is-on")} onClick={() => aoMudar(a.id)}>
          {a.rotulo}
          {a.n != null && <span className="dc-chip__n">{a.n}</span>}
        </button>
      ))}
    </div>
  );
}

export function Campo({ rotulo, ajuda, erro, children, htmlFor }: { rotulo: string; ajuda?: ReactNode; erro?: string | null; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="dc-campo">
      <label htmlFor={htmlFor}>{rotulo}</label>
      {children}
      {erro ? <span className="dc-erro-campo">{erro}</span> : ajuda ? <span className="dc-campo__ajuda">{ajuda}</span> : null}
    </div>
  );
}

export function Faixa({ tipo, children }: { tipo: "aviso" | "erro" | "ok" | "ia"; children: ReactNode }) {
  return (
    <div className={cn("dc-faixa", `dc-faixa--${tipo}`)} role={tipo === "erro" ? "alert" : undefined}>
      {children}
    </div>
  );
}

/** Número CNJ ou "Extrajudicial". */
export function Cnj({ cnj, className }: { cnj: string | null | undefined; className?: string }) {
  return <span className={cn("dc-num dc-cnj", className)}>{cnj ?? "Extrajudicial"}</span>;
}

export function LinkProcesso({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <Link to="/processos/$id" params={{ id }} className={className}>
      {children}
    </Link>
  );
}

/** Prazos › Manifestação sobre laudo pericial */
export function Trilha({ children }: { children: ReactNode }) {
  const itens = Children.toArray(children);
  return (
    <nav className="dc-trilha" aria-label="Você está em">
      {itens.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight aria-hidden />}
          {item}
        </Fragment>
      ))}
    </nav>
  );
}

/** Topo das telas de detalhe: selos, título, de qual processo é e as ações. */
export function TopoDoDetalhe({ selos, titulo, sobre, acoes }: { selos?: ReactNode; titulo: ReactNode; sobre?: ReactNode; acoes?: ReactNode }) {
  return (
    <div className="dc-topo-detalhe">
      {selos && <div className="dc-topo-detalhe__selos">{selos}</div>}
      <div className="dc-topo-detalhe__linha">
        <div className="dc-topo-detalhe__texto">
          <h1 className="dc-h1">{titulo}</h1>
          {sobre && <p className="dc-topo-detalhe__sobre">{sobre}</p>}
        </div>
        {acoes && <div className="dc-acoes">{acoes}</div>}
      </div>
    </div>
  );
}

/** Linha do tempo (histórico do prazo, do cliente). */
export function LinhaDoTempo({ itens }: { itens: { data: string; titulo: ReactNode; detalhe?: ReactNode; novo?: boolean }[] }) {
  return (
    <ol className="dc-tempo">
      {itens.map((i, n) => (
        <li key={n}>
          <span className="dc-tempo__data">{i.data}</span>
          <span className="dc-tempo__eixo">
            <span className={cn("dc-tempo__ponto", i.novo && "is-novo")} />
          </span>
          <span className="dc-tempo__texto">
            <strong>{i.titulo}</strong>
            {i.detalhe}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Campo de busca das listas (processos, clientes, documentos). */
export function CampoDeBusca({ valor, aoMudar, rotulo, placeholder }: { valor: string; aoMudar: (v: string) => void; rotulo: string; placeholder: string }) {
  return (
    <label className="dc-busca">
      <Search aria-hidden />
      <input type="search" value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} aria-label={rotulo} autoComplete="off" />
    </label>
  );
}
