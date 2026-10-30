/**
 * O que a IA consultou, em cartões que dá para usar: abrir o processo, marcar
 * o prazo cumprido, criar a tarefa que a IA deixou pronta, chamar o cliente no
 * WhatsApp. Cada ferramenta tem o seu cartão; as buscas que só serviram para
 * achar o que a IA abriu depois não aparecem.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  Banknote,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  FileText,
  FolderOpen,
  Gauge,
  Hourglass,
  Inbox,
  ListTodo,
  LoaderCircle,
  MessageCircle,
  Phone,
  Undo2,
  UserPlus,
  Users,
  UsersRound,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { API_URL, api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDaSemana, diaMes, dinheiro, numero, ondeTramita, prazoEmDias, telefone } from "@/lib/formato";
import type {
  AlvaraNaIa,
  AudienciaNaIa,
  ClienteNaIa,
  ContagemNaIa,
  DiaDaAgenda,
  DocumentoNaIa,
  FichaDoCliente,
  FichaDoProcesso,
  Lista,
  NegocioNaIa,
  Panorama,
  Parte,
  PessoaDaEquipe,
  PrazoNaIa,
  ProcessoNaIa,
  PublicacaoNaIa,
  TarefaProposta,
} from "@/lib/perguntar";
import { cn } from "@/lib/util";
import { useAviso } from "./avisos";
import { Avatar, Botao, Selo } from "./ui";

type Ferramenta = Extract<Parte, { tipo: "ferramenta" }>;

/* ------------------------------------------------------------------ */
/* Os passos: o que a IA está consultando ou consultou                 */
/* ------------------------------------------------------------------ */

const ICONE: Record<string, LucideIcon> = {
  panorama: Gauge,
  buscarPrazos: Hourglass,
  buscarProcessos: FolderOpen,
  lerProcesso: FolderOpen,
  buscarPublicacoes: Inbox,
  buscarAudiencias: CalendarDays,
  verAgenda: CalendarDays,
  buscarClientes: Users,
  lerCliente: Users,
  buscarDocumentos: FileText,
  lerDocumento: FileText,
  buscarAlvaras: Banknote,
  buscarNegocios: UserPlus,
  verEquipe: UsersRound,
  contarPrazo: Hourglass,
  proporTarefa: ListTodo,
};

const LENDO: Record<string, string> = {
  panorama: "Vendo os números do escritório",
  buscarPrazos: "Buscando prazos",
  buscarProcessos: "Procurando processos",
  lerProcesso: "Lendo os autos",
  buscarPublicacoes: "Lendo as publicações",
  buscarAudiencias: "Vendo as audiências",
  verAgenda: "Abrindo a agenda",
  buscarClientes: "Procurando clientes",
  lerCliente: "Abrindo a ficha do cliente",
  buscarDocumentos: "Procurando documentos",
  lerDocumento: "Lendo o documento",
  buscarAlvaras: "Vendo os alvarás",
  buscarNegocios: "Vendo os novos negócios",
  verEquipe: "Vendo a equipe",
  contarPrazo: "Contando o prazo",
  proporTarefa: "Preparando a tarefa",
};

const plural = (n: number, um: string, varios: string) => `${numero(n)} ${n === 1 ? um : varios}`;

/** "Prazos · 7", "Autos de Marina Duarte × Seguradora Alfa", "Prazo contado". */
export function rotuloDoPasso(f: Ferramenta): string {
  if (f.saida === undefined) return `${LENDO[f.nome] ?? "Consultando"}…`;
  if (f.erro) return `${LENDO[f.nome] ?? "Consulta"}: não deu`;
  const s = f.saida as Record<string, unknown> | null;
  const total = typeof s?.total === "number" ? s.total : null;
  switch (f.nome) {
    case "panorama":
      return "Números do escritório";
    case "buscarPrazos":
      return total === 0 ? "Nenhum prazo" : plural(total ?? 0, "prazo", "prazos");
    case "buscarProcessos":
      return total === 0 ? "Nenhum processo" : plural(total ?? 0, "processo", "processos");
    case "lerProcesso":
      return `Autos · ${(s as unknown as FichaDoProcesso).processo?.titulo ?? "processo"}`;
    case "buscarPublicacoes":
      return total === 0 ? "Nenhuma publicação" : plural(total ?? 0, "publicação", "publicações");
    case "buscarAudiencias":
      return total === 0 ? "Nenhuma audiência" : plural(total ?? 0, "audiência", "audiências");
    case "verAgenda":
      return "Agenda";
    case "buscarClientes":
      return total === 0 ? "Nenhum cliente" : plural(total ?? 0, "cliente", "clientes");
    case "lerCliente":
      return `Ficha · ${(s as unknown as FichaDoCliente).cliente?.nome ?? "cliente"}`;
    case "buscarDocumentos":
      return total === 0 ? "Nenhum documento" : plural(total ?? 0, "documento", "documentos");
    case "lerDocumento":
      return `Leu · ${(s as unknown as DocumentoNaIa).nome ?? "documento"}`;
    case "buscarAlvaras":
      return total === 0 ? "Nenhum alvará" : plural(total ?? 0, "alvará", "alvarás");
    case "buscarNegocios":
      return total === 0 ? "Nenhum negócio" : plural(total ?? 0, "novo negócio", "novos negócios");
    case "verEquipe":
      return "Equipe";
    case "contarPrazo":
      return "Prazo contado";
    case "proporTarefa":
      return "Tarefa pronta";
    default:
      return "Consulta";
  }
}

export function Passos({ ferramentas }: { ferramentas: Ferramenta[] }) {
  if (!ferramentas.length) return null;
  return (
    <ul className="dc-passos" aria-label="O que a IA consultou">
      {ferramentas.map((f) => {
        const Icone = ICONE[f.nome] ?? FileText;
        const lendo = f.saida === undefined;
        return (
          <li key={f.id} className={cn("dc-passo", lendo && "is-lendo", f.erro && "is-erro")} title={f.erro ?? undefined}>
            {lendo ? <LoaderCircle className="dc-gira" aria-hidden /> : f.erro ? <CircleAlert aria-hidden /> : <Icone aria-hidden />}
            <span>{rotuloDoPasso(f)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Quais viram cartão                                                  */
/* ------------------------------------------------------------------ */

const SEM_CARTAO = new Set(["verEquipe"]);
/** Busca que levou a abrir um item: o cartão do item basta. */
const ABRE: Record<string, { busca: string; chave: string }> = {
  lerProcesso: { busca: "buscarProcessos", chave: "processoId" },
  lerCliente: { busca: "buscarClientes", chave: "clienteId" },
  lerDocumento: { busca: "buscarDocumentos", chave: "documentoId" },
};

export function cartoesDaResposta(partes: Parte[]): Ferramenta[] {
  const fs = partes.filter((p): p is Ferramenta => p.tipo === "ferramenta" && p.saida != null && !p.erro && !SEM_CARTAO.has(p.nome));
  const escondidas = new Set<string>();
  fs.forEach((f, i) => {
    const regra = ABRE[f.nome];
    if (!regra) return;
    const aberto = f.entrada?.[regra.chave];
    for (const anterior of fs.slice(0, i)) {
      if (anterior.nome !== regra.busca) continue;
      const itens = (anterior.saida as Lista<{ id: string }>).itens ?? [];
      if (itens.some((x) => x.id === aberto)) escondidas.add(anterior.id);
    }
  });
  // A mesma consulta duas vezes (a IA conferindo) vira um cartão só: o último.
  const vistas = new Map<string, string>();
  for (const f of fs) vistas.set(`${f.nome}:${JSON.stringify(f.entrada ?? {})}`, f.id);
  const ultimas = new Set(vistas.values());
  return fs.filter((f) => !escondidas.has(f.id) && ultimas.has(f.id) && !vazio(f));
}

function vazio(f: Ferramenta): boolean {
  const s = f.saida as { total?: number; dias?: unknown[] } | null;
  if (typeof s?.total === "number") return s.total === 0;
  if (f.nome === "verAgenda") return !(s?.dias as unknown[] | undefined)?.length;
  return false;
}

/* ------------------------------------------------------------------ */
/* Os cartões                                                          */
/* ------------------------------------------------------------------ */

export interface OndeEsta {
  conversaId: string;
  mensagemId: string | null;
}

export function Cartao({ f, onde }: { f: Ferramenta; onde: OndeEsta }) {
  const s = f.saida as never;
  switch (f.nome) {
    case "panorama":
      return <CartaoPanorama p={s} />;
    case "buscarPrazos":
      return <CartaoPrazos lista={s} />;
    case "buscarProcessos":
      return <CartaoProcessos lista={s} />;
    case "lerProcesso":
      return <CartaoProcesso ficha={s} />;
    case "buscarPublicacoes":
      return <CartaoPublicacoes lista={s} />;
    case "buscarAudiencias":
      return <CartaoAudiencias lista={s} />;
    case "verAgenda":
      return <CartaoAgenda agenda={s} />;
    case "buscarClientes":
      return <CartaoClientes lista={s} />;
    case "lerCliente":
      return <CartaoCliente ficha={s} />;
    case "buscarDocumentos":
      return <CartaoDocumentos lista={s} />;
    case "lerDocumento":
      return <CartaoDocumentos lista={{ total: 1, itens: [s] }} titulo="Documento lido" />;
    case "buscarAlvaras":
      return <CartaoAlvaras lista={s} />;
    case "buscarNegocios":
      return <CartaoNegocios lista={s} />;
    case "contarPrazo":
      return <CartaoContagem c={s} />;
    case "proporTarefa":
      return <CartaoTarefa t={s} f={f} onde={onde} />;
    default:
      return null;
  }
}

function Moldura({ icone: Icone, titulo, n, acao, children, className }: { icone: LucideIcon; titulo: string; n?: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("dc-cartao-ia", className)}>
      <header className="dc-cartao-ia__topo">
        <Icone aria-hidden />
        <h3>{titulo}</h3>
        {n && <span className="dc-cartao-ia__n">{n}</span>}
        {acao && <span className="dc-cartao-ia__acao">{acao}</span>}
      </header>
      {children}
    </section>
  );
}

/** Os primeiros itens e "Mostrar mais". */
function Mais<T>({ itens, primeiros = 5, children }: { itens: T[]; primeiros?: number; children: (item: T) => ReactNode }) {
  const [todos, setTodos] = useState(false);
  const vistos = todos ? itens : itens.slice(0, primeiros);
  return (
    <>
      <div className="dc-cartao-ia__linhas">{vistos.map(children)}</div>
      {itens.length > primeiros && (
        <button type="button" className="dc-cartao-ia__mais" onClick={() => setTodos(!todos)} aria-expanded={todos}>
          <ChevronDown aria-hidden style={todos ? { transform: "rotate(180deg)" } : undefined} />
          {todos ? "Mostrar menos" : `Mostrar mais ${itens.length - primeiros}`}
        </button>
      )}
    </>
  );
}

const nDeTotal = (l: Lista<unknown>, um: string, varios: string) => (l.total > l.itens.length ? `${numero(l.itens.length)} de ${numero(l.total)}` : plural(l.total, um, varios));

function IrPara({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="dc-cartao-ia__ir">
      {children}
      <ChevronRight aria-hidden />
    </Link>
  );
}

/* ---------- Prazos ---------- */

function CartaoPrazos({ lista }: { lista: Lista<PrazoNaIa> }) {
  return (
    <Moldura icone={Hourglass} titulo="Prazos" n={nDeTotal(lista, "prazo", "prazos")} acao={<IrPara to="/prazos">Prazos</IrPara>}>
      <Mais itens={lista.itens}>{(p) => <LinhaDoPrazo key={p.id} p={p} />}</Mais>
    </Moldura>
  );
}

function LinhaDoPrazo({ p, semProcesso }: { p: PrazoNaIa; semProcesso?: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [cumprido, setCumprido] = useState(p.situacao === "cumprido");
  const mudar = useMutation({
    mutationFn: (acao: "cumprir" | "reabrir") => api(`/prazos/${p.id}/${acao}`, { method: "POST" }),
    onSuccess: (_r, acao) => {
      setCumprido(acao === "cumprir");
      void qc.invalidateQueries({ queryKey: ["prazos"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      if (acao === "cumprir") avisar(`Cumprido: ${p.tipo}`);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const aberto = !cumprido && p.situacao !== "descartado";
  return (
    <div className={cn("dc-cartao-ia__linha dc-linha-prazo", cumprido && "is-feito")}>
      <span className="dc-linha-prazo__quando">{cumprido ? <Selo urgencia="cumprido">Cumprido</Selo> : <Selo urgencia={p.urgencia}>{p.quando}</Selo>}</span>
      <span className="dc-linha-prazo__texto">
        <span>
          <Link to="/prazos/$id" params={{ id: p.id }} className="dc-cartao-ia__titulo">
            {p.tipo}
          </Link>
          {p.situacao === "a_confirmar" && aberto && <span className="dc-cartao-ia__marca">a confirmar</span>}
        </span>
        {!semProcesso && (
          <Link to="/processos/$id" params={{ id: p.processo.id }} className="dc-cartao-ia__sub">
            {p.processo.titulo}
          </Link>
        )}
      </span>
      <span className="dc-linha-prazo__quem" title={p.responsavel?.apelido ?? "Sem responsável"}>
        {p.responsavel ? <Avatar pessoa={p.responsavel} /> : <span className="dc-cartao-ia__sem">sem resp.</span>}
      </span>
      <span className="dc-linha-prazo__acoes">
        {aberto ? (
          <Botao variante="fantasma" pequeno onClick={() => mudar.mutate("cumprir")} ocupado={mudar.isPending} aria-label={`Marcar cumprido: ${p.tipo}`} title="Marcar cumprido">
            <Check /> <span className="dc-so-largo">Cumprido</span>
          </Botao>
        ) : cumprido ? (
          <Botao variante="fantasma" pequeno onClick={() => mudar.mutate("reabrir")} ocupado={mudar.isPending} aria-label={`Desfazer: ${p.tipo}`} title="Desfazer">
            <Undo2 /> <span className="dc-so-largo">Desfazer</span>
          </Botao>
        ) : null}
      </span>
    </div>
  );
}

/* ---------- Processos ---------- */

function CartaoProcessos({ lista }: { lista: Lista<ProcessoNaIa> }) {
  return (
    <Moldura icone={FolderOpen} titulo="Processos" n={nDeTotal(lista, "processo", "processos")} acao={<IrPara to="/processos">Processos</IrPara>}>
      <Mais itens={lista.itens}>{(p) => <LinhaDoProcesso key={p.id} p={p} />}</Mais>
    </Moldura>
  );
}

function LinhaDoProcesso({ p }: { p: ProcessoNaIa }) {
  return (
    <Link to="/processos/$id" params={{ id: p.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
      <span className="dc-celula min-w-0 flex-1">
        <span className="dc-cartao-ia__titulo">{p.titulo}</span>
        <span className="dc-cartao-ia__sub">
          <span className="dc-num">{p.cnj ?? "Extrajudicial"}</span>
          {ondeTramita(p) && ` · ${ondeTramita(p)}`}
        </span>
      </span>
      {p.proximoPrazo && (
        <span className="dc-cartao-ia__lado" title={p.proximoPrazo.tipo}>
          <Selo urgencia={p.proximoPrazo.urgencia}>{p.proximoPrazo.quando}</Selo>
        </span>
      )}
      <ChevronRight className="dc-cartao-ia__seta" aria-hidden />
    </Link>
  );
}

function CartaoProcesso({ ficha }: { ficha: FichaDoProcesso }) {
  const p = ficha.processo;
  if (!p) return null;
  const proxima = ficha.audiencias.find((a) => a.situacao === "marcada");
  return (
    <Moldura icone={FolderOpen} titulo="Processo" acao={<IrPara to={`/processos/${p.id}`}>Abrir</IrPara>} className="dc-cartao-ia--ficha">
      <div className="dc-cartao-ia__ficha">
        <Link to="/processos/$id" params={{ id: p.id }} className="dc-cartao-ia__nome">
          {p.titulo}
        </Link>
        <span className="dc-cartao-ia__sub">
          <span className="dc-num">{p.cnj ?? "Extrajudicial"}</span>
          {ondeTramita(p) && ` · ${ondeTramita(p)}`}
          {p.classe && ` · ${p.classe}`}
        </span>
        <div className="dc-cartao-ia__selos">
          {p.fase && <span className="dc-selo dc-selo--prazo">{p.fase}</span>}
          {p.situacao !== "ativo" && <span className="dc-selo dc-selo--prazo">{p.situacao}</span>}
          {p.cliente && (
            <Link to="/clientes/$id" params={{ id: p.cliente.id }} className="dc-selo dc-selo--prazo">
              {p.cliente.nome}
            </Link>
          )}
          {p.responsavel && (
            <span className="dc-selo dc-selo--prazo">
              <Avatar pessoa={p.responsavel} /> {p.responsavel.apelido}
            </span>
          )}
        </div>
      </div>
      {ficha.prazos.length > 0 && (
        <div className="dc-cartao-ia__bloco">
          <h4>Prazos em aberto</h4>
          <div className="dc-cartao-ia__linhas">
            {ficha.prazos.slice(0, 3).map((x) => (
              <LinhaDoPrazo key={x.id} p={x} semProcesso />
            ))}
          </div>
        </div>
      )}
      {proxima && (
        <div className="dc-cartao-ia__bloco">
          <h4>Próxima audiência</h4>
          <div className="dc-cartao-ia__linhas">
            <LinhaDaAudiencia a={proxima} semProcesso />
          </div>
        </div>
      )}
      <div className="dc-cartao-ia__botoes">
        <Link to="/processos/$id" params={{ id: p.id }} search={{ aba: "chat" }} className="dc-btn dc-btn--secundaria dc-btn--sm">
          <MessageCircle /> Chat do processo
        </Link>
        <Link to="/pecas" search={{ processo: p.id }} className="dc-btn dc-btn--secundaria dc-btn--sm">
          <FileText /> Gerar peça
        </Link>
      </div>
    </Moldura>
  );
}

/* ---------- Publicações ---------- */

const SITUACAO_DA_PUBLICACAO: Record<PublicacaoNaIa["situacao"], string> = { nova: "Nova", pendente: "Pendente", lida: "Sem prazo", vinculada: "Tratada" };

function CartaoPublicacoes({ lista }: { lista: Lista<PublicacaoNaIa> }) {
  return (
    <Moldura icone={Inbox} titulo="Publicações" n={nDeTotal(lista, "publicação", "publicações")} acao={<IrPara to="/publicacoes">Publicações</IrPara>}>
      <Mais itens={lista.itens}>
        {(p) => (
          <Link key={p.id} to="/publicacoes/$id" params={{ id: p.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link dc-cartao-ia__linha--alta">
            <span className="dc-celula min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="dc-cartao-ia__titulo">{p.tipo}</span>
                <span className={cn("dc-cartao-ia__marca", p.situacao === "nova" && "is-nova")}>{SITUACAO_DA_PUBLICACAO[p.situacao]}</span>
              </span>
              <span className="dc-cartao-ia__sub">
                {p.processo?.titulo ?? p.cnj ?? "Sem processo"} · <span className="dc-num">{diaCurto(p.disponibilizadaEm)}</span>
              </span>
              <span className="dc-cartao-ia__trecho">{p.resumo ?? p.teor}</span>
            </span>
            <ChevronRight className="dc-cartao-ia__seta" aria-hidden />
          </Link>
        )}
      </Mais>
    </Moldura>
  );
}

/* ---------- Audiências e agenda ---------- */

function CartaoAudiencias({ lista }: { lista: Lista<AudienciaNaIa> }) {
  return (
    <Moldura icone={CalendarDays} titulo="Audiências" n={nDeTotal(lista, "audiência", "audiências")} acao={<IrPara to="/agenda">Agenda</IrPara>}>
      <Mais itens={lista.itens}>{(a) => <LinhaDaAudiencia key={a.id} a={a} />}</Mais>
    </Moldura>
  );
}

function LinhaDaAudiencia({ a, semProcesso }: { a: AudienciaNaIa; semProcesso?: boolean }) {
  const [d, m] = diaMes(a.dia).split(" ");
  return (
    <Link to="/audiencias/$id" params={{ id: a.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
      <span className="dc-data-bloco" aria-hidden>
        <strong>{d}</strong>
        <span>{m}</span>
      </span>
      <span className="dc-celula min-w-0 flex-1">
        <span className="dc-cartao-ia__titulo">
          {a.tipo} · <span className="dc-num">{a.hora}</span>
        </span>
        <span className="dc-cartao-ia__sub">
          {diaDaSemana(a.dia)}
          {!semProcesso && ` · ${a.processo.titulo}`}
        </span>
      </span>
      <span className="dc-cartao-ia__lado">
        {a.porVideo ? (
          <span className="dc-selo dc-selo--prazo">
            <Video aria-hidden /> Vídeo
          </span>
        ) : (
          <span className="dc-selo dc-selo--prazo">Presencial</span>
        )}
      </span>
      <ChevronRight className="dc-cartao-ia__seta" aria-hidden />
    </Link>
  );
}

function CartaoAgenda({ agenda }: { agenda: { dias: DiaDaAgenda[] } }) {
  return (
    <Moldura icone={CalendarDays} titulo="Agenda" acao={<IrPara to="/agenda">Agenda</IrPara>}>
      <div className="dc-cartao-ia__dias">
        {agenda.dias.map((d) => (
          <div key={d.dia} className="dc-cartao-ia__dia">
            <h4>{d.rotulo}</h4>
            <div className="dc-cartao-ia__linhas">
              {d.itens.map((i) => {
                const conteudo = (
                  <>
                    <span className="dc-cartao-ia__tipo">
                      {i.tipo === "audiencia" ? <span className="dc-num">{i.hora}</span> : i.tipo === "prazo" ? <Selo urgencia={i.urgencia}>Prazo</Selo> : <span className="dc-selo dc-selo--prazo">{i.concluida ? "Feita" : "Tarefa"}</span>}
                    </span>
                    <span className="dc-celula min-w-0 flex-1">
                      <span className={cn("dc-cartao-ia__titulo", i.tipo === "tarefa" && i.concluida && "line-through opacity-60")}>{i.titulo}</span>
                      {i.processo && <span className="dc-cartao-ia__sub">{i.processo.titulo}</span>}
                    </span>
                  </>
                );
                return i.tipo === "audiencia" ? (
                  <Link key={i.id} to="/audiencias/$id" params={{ id: i.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
                    {conteudo}
                  </Link>
                ) : i.tipo === "prazo" ? (
                  <Link key={i.id} to="/prazos/$id" params={{ id: i.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
                    {conteudo}
                  </Link>
                ) : (
                  <div key={i.id} className="dc-cartao-ia__linha">
                    {conteudo}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Moldura>
  );
}

/* ---------- Clientes ---------- */

const zap = (t: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  return d.length >= 10 ? `https://wa.me/${d.length <= 11 ? `55${d}` : d}` : null;
};

function ContatoDoCliente({ c }: { c: ClienteNaIa }) {
  const w = zap(c.telefone);
  return (
    <span className="dc-cartao-ia__botoes dc-cartao-ia__botoes--linha">
      {w && (
        <a href={w} target="_blank" rel="noopener noreferrer" className="dc-btn dc-btn--secundaria dc-btn--sm" aria-label={`WhatsApp de ${c.nome}`}>
          <MessageCircle /> WhatsApp
        </a>
      )}
      {c.telefone && (
        <a href={`tel:${c.telefone.replace(/\D/g, "")}`} className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Ligar para ${c.nome}`}>
          <Phone /> <span className="dc-num">{telefone(c.telefone)}</span>
        </a>
      )}
    </span>
  );
}

function CartaoClientes({ lista }: { lista: Lista<ClienteNaIa> }) {
  return (
    <Moldura icone={Users} titulo="Clientes" n={nDeTotal(lista, "cliente", "clientes")} acao={<IrPara to="/clientes">Clientes</IrPara>}>
      <Mais itens={lista.itens}>
        {(c) => (
          <div key={c.id} className="dc-cartao-ia__linha dc-cartao-ia__linha--quebra">
            <span className="dc-celula min-w-0 flex-1">
              <Link to="/clientes/$id" params={{ id: c.id }} className="dc-cartao-ia__titulo">
                {c.nome}
              </Link>
              <span className="dc-cartao-ia__sub">
                {plural(c.processos, "processo", "processos")}
                {c.email && ` · ${c.email}`}
              </span>
            </span>
            <ContatoDoCliente c={c} />
          </div>
        )}
      </Mais>
    </Moldura>
  );
}

function CartaoCliente({ ficha }: { ficha: FichaDoCliente }) {
  const c = ficha.cliente;
  if (!c) return null;
  const ultimo = ficha.atendimentos[0];
  return (
    <Moldura icone={Users} titulo="Cliente" acao={<IrPara to={`/clientes/${c.id}`}>Abrir ficha</IrPara>} className="dc-cartao-ia--ficha">
      <div className="dc-cartao-ia__ficha">
        <Link to="/clientes/$id" params={{ id: c.id }} className="dc-cartao-ia__nome">
          {c.nome}
        </Link>
        <span className="dc-cartao-ia__sub">
          {plural(ficha.processos.length, "processo", "processos")}
          {c.email && ` · ${c.email}`}
        </span>
        <ContatoDoCliente c={c} />
      </div>
      {ficha.processos.length > 0 && (
        <div className="dc-cartao-ia__bloco">
          <h4>Processos</h4>
          <Mais itens={ficha.processos} primeiros={3}>
            {(p) => <LinhaDoProcesso key={p.id} p={p} />}
          </Mais>
        </div>
      )}
      {ultimo && (
        <div className="dc-cartao-ia__bloco">
          <h4>Último atendimento · {diaCurto(ultimo.em)}</h4>
          <p className="dc-cartao-ia__trecho dc-cartao-ia__trecho--solto">{ultimo.resumo}</p>
        </div>
      )}
    </Moldura>
  );
}

/* ---------- Documentos ---------- */

function CartaoDocumentos({ lista, titulo = "Documentos" }: { lista: Lista<DocumentoNaIa>; titulo?: string }) {
  return (
    <Moldura icone={FileText} titulo={titulo} n={lista.total > 1 ? nDeTotal(lista, "documento", "documentos") : undefined}>
      <Mais itens={lista.itens}>
        {(d) => (
          <a key={d.id} href={`${API_URL}/api/app/documentos/${d.id}/arquivo`} target="_blank" rel="noopener" className="dc-cartao-ia__linha dc-cartao-ia__linha--link dc-cartao-ia__linha--alta">
            <span className="dc-arquivo" aria-hidden>
              {/pdf/.test(d.mime) ? "PDF" : /word|docx/.test(d.mime) ? "DOC" : /image/.test(d.mime) ? "IMG" : "TXT"}
            </span>
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-cartao-ia__titulo">{d.nome}</span>
              <span className="dc-cartao-ia__sub">
                {[d.processo?.titulo ?? d.cliente?.nome, d.evento != null ? `evento ${d.evento}` : null, d.paginas ? `${d.paginas} p.` : null].filter(Boolean).join(" · ")}
              </span>
              {d.trecho && <span className="dc-cartao-ia__trecho">{d.trecho}</span>}
            </span>
            <ExternalLink className="dc-cartao-ia__seta" aria-hidden />
          </a>
        )}
      </Mais>
    </Moldura>
  );
}

/* ---------- Alvarás e novos negócios ---------- */

const ETAPA_DO_ALVARA: Record<string, string> = { novo: "Novo", aguardando_saque: "Aguardando saque", sacado: "Sacado", repassado: "Repassado", finalizado: "Finalizado" };

function CartaoAlvaras({ lista }: { lista: Lista<AlvaraNaIa> & { valorTotal: string } }) {
  return (
    <Moldura icone={Banknote} titulo="Alvarás" n={`${nDeTotal(lista, "alvará", "alvarás")} · ${dinheiro(lista.valorTotal)}`} acao={<IrPara to="/alvaras">Alvarás</IrPara>}>
      <Mais itens={lista.itens}>
        {(a) => (
          <Link key={a.id} to="/processos/$id" params={{ id: a.processo.id }} className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-cartao-ia__titulo">{a.descricao}</span>
              <span className="dc-cartao-ia__sub">
                {a.processo.titulo}
                {a.expedidoEm && ` · expedido em ${diaCurto(a.expedidoEm)}`}
              </span>
            </span>
            <span className="dc-cartao-ia__lado dc-cartao-ia__valor">
              <strong className="dc-num">{dinheiro(a.valor)}</strong>
              <span className="dc-cartao-ia__marca">{ETAPA_DO_ALVARA[a.etapa] ?? a.etapa}</span>
            </span>
          </Link>
        )}
      </Mais>
    </Moldura>
  );
}

const PASTA: Record<string, string> = { completa: "Pasta completa", faltam_documentos: "Faltam documentos", sem_pasta: "Sem pasta" };

function CartaoNegocios({ lista }: { lista: Lista<NegocioNaIa> }) {
  return (
    <Moldura icone={UserPlus} titulo="Novos negócios" n={nDeTotal(lista, "negócio", "negócios")} acao={<IrPara to="/negocios">Novos negócios</IrPara>}>
      <Mais itens={lista.itens}>
        {(x) => (
          <Link key={x.id} to="/negocios" className="dc-cartao-ia__linha dc-cartao-ia__linha--link">
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-cartao-ia__titulo">{x.nome}</span>
              <span className="dc-cartao-ia__sub">
                {x.assunto}
                {x.area && ` · ${x.area}`} · desde {diaCurto(x.desde)}
              </span>
            </span>
            <span className="dc-cartao-ia__lado">
              <span className={cn("dc-cartao-ia__marca", x.pasta !== "completa" && "is-nova")}>{PASTA[x.pasta] ?? x.pasta}</span>
            </span>
          </Link>
        )}
      </Mais>
    </Moldura>
  );
}

/* ---------- Panorama ---------- */

function CartaoPanorama({ p }: { p: Panorama }) {
  // No cartão estreito vale o rótulo curto, numa linha só (os números ficam todos na mesma altura).
  const numeros: { rotulo: string; curto?: string; n: number; to: string; cor?: "vencido" | "hoje" }[] = [
    { rotulo: "Vencidos", n: p.prazos.vencidos, to: "/prazos?quando=vencidos", cor: p.prazos.vencidos ? "vencido" : undefined },
    { rotulo: "Vencem hoje", curto: "Hoje", n: p.prazos.hoje, to: "/prazos?quando=hoje", cor: p.prazos.hoje ? "hoje" : undefined },
    { rotulo: "Próx. 7 dias", curto: "7 dias", n: p.prazos.ate7dias, to: "/prazos?quando=semana" },
    { rotulo: "Publicações", n: p.publicacoes.novas, to: "/publicacoes" },
    { rotulo: "Audiências hoje", curto: "Audiências", n: p.audiencias.hoje, to: "/agenda" },
  ];
  return (
    <Moldura icone={Gauge} titulo="O escritório agora" acao={<IrPara to="/hoje">Hoje</IrPara>}>
      <div className="dc-numeros dc-cartao-ia__numeros">
        {numeros.map((x) => (
          <a key={x.rotulo} href={x.to} className={cn("dc-contador", x.cor && `dc-contador--${x.cor}`)}>
            <span className="dc-contador__n">{numero(x.n)}</span>
            <span className="dc-contador__rotulo" title={x.rotulo}>
              {x.curto ? (
                <>
                  <span className="dc-so-largo">{x.rotulo}</span>
                  <span className="dc-so-estreito">{x.curto}</span>
                </>
              ) : (
                x.rotulo
              )}
            </span>
          </a>
        ))}
      </div>
      <p className="dc-cartao-ia__rodape">
        {plural(p.prazos.abertos, "prazo aberto", "prazos abertos")}
        {p.prazos.aConfirmar > 0 && `, ${numero(p.prazos.aConfirmar)} a confirmar`}
        {p.prazos.semResponsavel > 0 && `, ${numero(p.prazos.semResponsavel)} sem responsável`} · {plural(p.processos.ativos, "processo ativo", "processos ativos")} ·{" "}
        {plural(p.alvaras.pendentes, "alvará pendente", "alvarás pendentes")} ({dinheiro(p.alvaras.valorPendente)})
      </p>
    </Moldura>
  );
}

/* ---------- Contagem de prazo ---------- */

function CartaoContagem({ c }: { c: ContagemNaIa }) {
  return (
    <Moldura icone={Hourglass} titulo="Contagem do prazo" n={prazoEmDias(c.dias, c.contagem)}>
      <div className="dc-contagem">
        <div className="dc-contagem__passo">
          <span className="dc-rotulo">Publicação</span>
          <strong className="dc-num">{diaCurto(c.publicacao)}</strong>
          <span className="dc-cartao-ia__sub">{diaDaSemana(c.publicacao)}</span>
        </div>
        <ChevronRight className="dc-contagem__seta" aria-hidden />
        <div className="dc-contagem__passo">
          <span className="dc-rotulo">Começa</span>
          <strong className="dc-num">{diaCurto(c.inicio)}</strong>
          <span className="dc-cartao-ia__sub">{diaDaSemana(c.inicio)}</span>
        </div>
        <ChevronRight className="dc-contagem__seta" aria-hidden />
        <div className="dc-contagem__passo dc-contagem__passo--fim">
          <span className="dc-rotulo">Vence</span>
          <strong className="dc-num">{diaCurto(c.fim)}</strong>
          <span className="dc-cartao-ia__sub">{diaDaSemana(c.fim)}</span>
        </div>
      </div>
      {c.desconsiderados.length > 0 && (
        <div className="dc-cartao-ia__selos dc-cartao-ia__selos--solto">
          {c.desconsiderados.map((f) => (
            <span key={f.dia} className="dc-selo dc-selo--prazo">
              <span className="dc-num">{diaCurto(f.dia)}</span> {f.nome}
            </span>
          ))}
        </div>
      )}
      <p className="dc-cartao-ia__rodape">{c.explicacao}</p>
    </Moldura>
  );
}

/* ---------- Tarefa proposta ---------- */

function CartaoTarefa({ t, f, onde }: { t: TarefaProposta; f: Ferramenta; onde: OndeEsta }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [criada, setCriada] = useState<{ id: string } | null>(t.criada ?? null);
  const [descartada, setDescartada] = useState(false);
  const criar = useMutation({
    mutationFn: () => api<{ id: string }>(`/ia/conversas/${onde.conversaId}/tarefa`, { json: { mensagemId: onde.mensagemId, ferramentaId: f.id } }),
    onSuccess: (r) => {
      setCriada(r);
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      void qc.invalidateQueries({ queryKey: ["conversas", onde.conversaId] });
      avisar("Tarefa criada");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  if (descartada) return null;
  return (
    <Moldura icone={ListTodo} titulo={criada ? "Tarefa criada" : "Tarefa para criar"} className={cn("dc-cartao-ia--tarefa", criada && "is-feita")}>
      <div className="dc-cartao-ia__ficha">
        <span className="dc-cartao-ia__nome">{t.titulo}</span>
        <span className="dc-cartao-ia__sub">
          <span className="dc-num">{diaCurto(t.dia)}</span>, {diaDaSemana(t.dia)}
          {t.responsavel && ` · ${t.responsavel.apelido}`}
          {t.processo && ` · ${t.processo.titulo}`}
          {t.cliente && !t.processo && ` · ${t.cliente.nome}`}
        </span>
        {t.detalhe && <p className="dc-cartao-ia__trecho dc-cartao-ia__trecho--solto">{t.detalhe}</p>}
      </div>
      <div className="dc-cartao-ia__botoes">
        {criada ? (
          <Link to="/agenda" className="dc-btn dc-btn--secundaria dc-btn--sm">
            <CalendarDays /> Ver na agenda
          </Link>
        ) : (
          <>
            <Botao variante="primaria" pequeno onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!onde.mensagemId}>
              <CalendarPlus /> Criar tarefa
            </Botao>
            <Botao variante="fantasma" pequeno onClick={() => setDescartada(true)}>
              Agora não
            </Botao>
          </>
        )}
      </div>
    </Moldura>
  );
}

/* A equipe não vira cartão, mas o tipo fica aqui com os outros. */
export type { PessoaDaEquipe };
