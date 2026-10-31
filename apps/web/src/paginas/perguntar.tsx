/**
 * Perguntar: conversas com a IA do escritório. No computador, a tela inteira:
 * o histórico à esquerda, a conversa no meio e, em tela bem larga (1600 px),
 * o que a IA consultou à direita. No celular, a conversa ocupa a tela e o histórico abre
 * numa gaveta.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { ArrowLeft, Banknote, Calculator, CalendarDays, Ellipsis, FolderOpen, Hourglass, Inbox, MessageSquare, MessagesSquare, PanelLeft, Pencil, Pin, PinOff, Scale, Search, SquarePen, Trash2, X, type LucideIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Compositor, esquecerEnvio, esquecerNova, IrParaOFim, Mensagens, NestaConversa, useEnviar, useEnvio, useRolagemDaConversa, type Envio } from "@/componentes/conversa-ia";
import { useAviso } from "@/componentes/avisos";
import { Dialogo, Radix } from "@/componentes/dialogo";
import { Botao, Carregando, Faixa, Vazio } from "@/componentes/ui";
import { api, ApiError, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDaSemana, diaDoInstante, hora, numero } from "@/lib/formato";
import { conversaQuery, conversasQuery, type ConversaAberta, type ConversaNaLista, type Modo } from "@/lib/perguntar";
import type { Eu } from "@/lib/tipos";
import { cn } from "@/lib/util";

const RODAPE = "Gerado por IA. Confira nos autos.";
const NA_PREVIA = import.meta.env.MODE === "previa";

export function PerguntarPage() {
  return <Perguntar conversaId={null} />;
}

export function ConversaPage() {
  const { id } = useParams({ from: "/app/perguntar/$id" });
  return <Perguntar conversaId={id} />;
}

function Perguntar({ conversaId }: { conversaId: string | null }) {
  const celular = useCelular();
  // Até 1099 px não cabem o menu, o histórico e a conversa lado a lado: o histórico vira gaveta.
  const estreito = useMedia("(max-width: 1099px)");
  const navigate = useNavigate();
  const eu = useQuery(euQuery);
  const search = useSearch({ strict: false }) as { modo?: Modo };
  const conversas = useQuery({ ...conversasQuery, queryFn: () => api<{ conversas: ConversaNaLista[] }>("/ia/conversas") });
  const aberta = useQuery({ ...conversaQuery(conversaId ?? "nova"), queryFn: () => api<ConversaAberta>(`/ia/conversas/${conversaId}`), enabled: !!conversaId });
  const envio = useEnvio(conversaId ?? "nova");
  const enviar = useEnviar();
  const [modoNovo, setModoNovo] = useState<Modo>(search.modo ?? "pergunte");
  const [sugerido, setSugerido] = useState<{ texto: string; n: number }>();
  const [gaveta, setGaveta] = useState(false);
  const [historicoEscondido, setHistoricoEscondido] = usePreferencia("dc-perguntar-historico", false);
  // Na conversa aberta, o modo é o dela até a pessoa trocar no campo.
  const [modoEscolhido, setModoEscolhido] = useState<Modo | null>(null);
  useEffect(() => setModoEscolhido(null), [conversaId]);
  const modo: Modo = conversaId ? (modoEscolhido ?? envio?.modo ?? aberta.data?.conversa.modo ?? "pergunte") : modoNovo;

  const mensagens = aberta.data?.mensagens ?? [];
  const ocupado = envio?.estado === "enviando";
  const vazia = !conversaId && !envio;
  const rolagem = useRolagemDaConversa(conversaId, vazia, envio);

  // Voltando à conversa nova, a pergunta que falhou (ou foi parada) antes de ganhar endereço sai.
  useLayoutEffect(() => {
    if (!conversaId) esquecerNova();
  }, [conversaId]);

  // A resposta já gravada voltou do servidor (o mesmo id do "inicio"): a cópia em andamento sai. A do erro fica, com o "Tentar de novo".
  useEffect(() => {
    if (!conversaId || !envio || envio.estado === "enviando" || envio.estado === "erro") return;
    const i = mensagens.findIndex((m) => m.id === envio.perguntaId);
    // Servidor que ainda não manda o id da resposta no "inicio": vale a resposta gravada depois da pergunta.
    const gravada = envio.respostaId ? mensagens.some((m) => m.id === envio.respostaId) : i >= 0 && mensagens.slice(i + 1).some((m) => m.papel === "ia");
    if (gravada) esquecerEnvio(conversaId);
  }, [conversaId, envio, mensagens]);

  const aoNascer = (id: string) => void navigate({ to: "/perguntar/$id", params: { id }, replace: true });
  const mandar = (texto: string) => enviar({ texto, modo, conversaId, aoNascer });
  // Caiu depois de a pergunta ser gravada: refaz a mesma, sem gravar outra.
  const tentarDeNovo = (e: Envio) => enviar({ texto: e.pergunta, modo: e.modo, conversaId, refazer: conversaId ? e.perguntaId : null, aoNascer });
  const mudarModo = (m: Modo) => {
    if (conversaId) return setModoEscolhido(m);
    setModoNovo(m);
    void navigate({ to: "/perguntar", search: m === "jurisprudencia" ? { modo: m } : {}, replace: true });
  };

  const naoAchou = aberta.error instanceof ApiError && aberta.error.status === 404;
  // Na prévia (sem servidor) o Perguntar responde com a IA de mentira dela; nas outras telas a IA continua como o /eu diz.
  const ia = eu.data?.ia || NA_PREVIA;
  const titulo = conversaId ? (aberta.data?.conversa.titulo ?? conversas.data?.conversas.find((k) => k.id === conversaId)?.titulo ?? "Conversa") : "Nova conversa";
  const historicoEmGaveta = celular || estreito;

  const historico = (
    <Historico
      conversas={conversas.data?.conversas}
      ativa={conversaId}
      aoEscolher={() => {
        setGaveta(false);
        esquecerNova();
      }}
      aoApagar={(id) => {
        if (id === conversaId) void navigate({ to: "/perguntar", replace: true });
      }}
    />
  );
  const compositor = ia && !naoAchou && (
    <Compositor modo={modo} aoMudarModo={mudarModo} aoEnviar={mandar} aoParar={() => envio?.controlador.abort()} ocupado={ocupado} rodape={RODAPE} inicial={sugerido} focar={!celular} curto={celular} />
  );

  let conversa: ReactNode;
  if (!eu.data || (conversaId && aberta.isPending && !envio)) {
    conversa = (
      <div className="dc-chat__coluna">
        <Carregando linhas={3} />
      </div>
    );
  } else if (!ia) {
    conversa = (
      <div className="dc-chat__coluna">
        <Vazio titulo="A IA ainda não está ligada">Quando estiver ligada, dá para perguntar sobre prazos, processos e clientes e pesquisar jurisprudência aqui. Quem cuida do sistema do escritório liga.</Vazio>
      </div>
    );
  } else if (naoAchou) {
    conversa = (
      <div className="dc-chat__coluna">
        <Vazio titulo="Conversa não encontrada">
          Pode ter sido apagada.{" "}
          <Link to="/perguntar" className="dc-link">
            Começar uma nova
          </Link>
        </Vazio>
      </div>
    );
  } else if (vazia) {
    conversa = (
      <BoasVindas
        eu={eu.data}
        modo={modoNovo}
        aoSugerir={(texto, enviarJa) => (enviarJa ? mandar(texto) : setSugerido({ texto, n: Date.now() }))}
        campo={celular ? null : compositor}
        recentes={historicoEmGaveta ? conversas.data?.conversas : undefined}
        aoVerTodas={() => setGaveta(true)}
      />
    );
  } else {
    conversa = (
      <div className="dc-chat__coluna">
        {modo === "jurisprudencia" && <AvisoJurisprudencia />}
        <Mensagens conversaId={conversaId} mensagens={mensagens} envio={envio} aoTentarDeNovo={tentarDeNovo} />
      </div>
    );
  }

  const gavetaDoHistorico = historicoEmGaveta && (
    <Radix.Root open={gaveta} onOpenChange={setGaveta}>
      <Radix.Portal>
        <Radix.Overlay className="dc-veu-dialogo" />
        <Radix.Content className={cn("dc dc-gaveta", celular && "dc-celular")} aria-describedby={undefined}>
          <div className="dc-gaveta__topo">
            <Radix.Title className="dc-dialogo__titulo">Conversas</Radix.Title>
            <Radix.Close className="dc-btn dc-btn--fantasma" aria-label="Fechar">
              <X />
            </Radix.Close>
          </div>
          {historico}
        </Radix.Content>
      </Radix.Portal>
    </Radix.Root>
  );

  if (celular) {
    return (
      <div className="dc-chat dc-chat--celular">
        <header className="dc-topo dc-topo--voltar dc-chat__topo">
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Voltar" onClick={() => (window.history.length > 1 ? window.history.back() : void navigate({ to: "/hoje" }))}>
            <ArrowLeft />
          </button>
          <div className="dc-topo__texto">
            <h1 className="dc-topo__titulo">{vazia ? "Perguntar" : titulo}</h1>
            <span className="dc-topo__sobre">{modo === "jurisprudencia" ? "Jurisprudência" : "Só você vê esta conversa"}</span>
          </div>
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Conversas" onClick={() => setGaveta(true)}>
            <MessagesSquare />
          </button>
          <Link to="/perguntar" className="dc-btn dc-btn--fantasma" aria-label="Nova conversa" onClick={esquecerNova}>
            <SquarePen />
          </Link>
        </header>
        <div ref={rolagem.caixa} className={cn("dc-chat__rolagem", vazia && "is-vazia")}>
          {conversa}
        </div>
        {compositor && (
          <div className="dc-chat__campo">
            {rolagem.longe && <IrParaOFim chegando={ocupado} aoClicar={rolagem.irParaOFim} />}
            {compositor}
          </div>
        )}
        {gavetaDoHistorico}
      </div>
    );
  }

  const comHistorico = !historicoEmGaveta && !historicoEscondido;
  return (
    <div className="dc-chat">
      {comHistorico && historico}
      <main className="dc-chat__principal">
        <header className="dc-chat__cabeca">
          <button
            type="button"
            className="dc-btn dc-btn--fantasma dc-btn--sm dc-chat__alternar"
            onClick={() => (historicoEmGaveta ? setGaveta(true) : setHistoricoEscondido(!historicoEscondido))}
            aria-label={comHistorico ? "Esconder as conversas" : "Mostrar as conversas"}
            title={comHistorico ? "Esconder as conversas" : "Mostrar as conversas"}
          >
            <PanelLeft />
          </button>
          <h1 className="dc-chat__titulo">{titulo}</h1>
          {modo === "jurisprudencia" && (
            <span className="dc-selo dc-selo--ia">
              <Scale aria-hidden /> Jurisprudência
            </span>
          )}
          <span className="dc-chat__privado">Só você vê esta conversa</span>
          {!comHistorico && !vazia && (
            <Link to="/perguntar" className="dc-btn dc-btn--secundaria dc-btn--sm" onClick={esquecerNova}>
              <SquarePen /> Nova
            </Link>
          )}
        </header>
        <div ref={rolagem.caixa} className={cn("dc-chat__rolagem", vazia && "is-vazia")}>
          {conversa}
        </div>
        {!vazia && compositor && (
          <div className="dc-chat__campo">
            {rolagem.longe && <IrParaOFim chegando={ocupado} aoClicar={rolagem.irParaOFim} />}
            {compositor}
          </div>
        )}
      </main>
      {!vazia && <NestaConversa key={conversaId ?? "nova"} mensagens={[...mensagens, ...(envio ? [{ partes: envio.partes }] : [])]} />}
      {gavetaDoHistorico}
    </div>
  );
}

function useMedia(consulta: string): boolean {
  return useSyncExternalStore(
    (f) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener("change", f);
      return () => mq.removeEventListener("change", f);
    },
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

function AvisoJurisprudencia() {
  return <Faixa tipo="aviso">A IA não consulta os tribunais ao vivo. Confira cada julgado no site do tribunal antes de citar na peça.</Faixa>;
}

/** Preferência de tela guardada no navegador (o histórico escondido). */
function usePreferencia(chave: string, padrao: boolean): [boolean, (v: boolean) => void] {
  const [v, setV] = useState(() => {
    try {
      const s = localStorage.getItem(chave);
      return s === null ? padrao : s === "1";
    } catch {
      return padrao;
    }
  });
  return [
    v,
    (novo) => {
      setV(novo);
      try {
        localStorage.setItem(chave, novo ? "1" : "0");
      } catch {
        // navegador sem armazenamento: vale só nesta visita
      }
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Conversa nova: saudação e sugestões                                 */
/* ------------------------------------------------------------------ */

function saudacao(): string {
  const h = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 5 ? "Boa noite" : h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

interface Sugestao {
  icone: LucideIcon;
  titulo: string;
  texto: string;
  /** Só põe no campo para a pessoa completar. */
  completar?: boolean;
  n?: number | null;
}

function BoasVindas({
  eu,
  modo,
  aoSugerir,
  campo,
  recentes,
  aoVerTodas,
}: {
  eu: Eu;
  modo: Modo;
  aoSugerir: (texto: string, enviarJa: boolean) => void;
  campo: ReactNode;
  /** Quando o histórico fica na gaveta (celular, tela estreita): as últimas conversas à mão. */
  recentes?: ConversaNaLista[];
  aoVerTodas: () => void;
}) {
  const hoje = diaDoInstante(new Date().toISOString());
  const sugestoes: Sugestao[] =
    modo === "jurisprudencia"
      ? [
          // Sem tribunal escrito: o servidor diz à IA qual é o do escritório.
          { icone: Scale, titulo: "Plano de saúde", texto: "Dano moral por negativa de cobertura de plano de saúde" },
          { icone: Scale, titulo: "DPVAT", texto: "Termo inicial da correção monetária no seguro DPVAT" },
          { icone: Scale, titulo: "Honorários", texto: "Honorários na desistência da ação antes da citação" },
          { icone: Scale, titulo: "Tese para um caso", texto: "Que teses servem para o processo ", completar: true },
        ]
      : [
          // O texto pede o que o número conta: prazos em aberto até daqui a 7 dias, com os vencidos (menu.prazos), e só as publicações novas (menu.publicacoes).
          { icone: Hourglass, titulo: "Prazos da semana", texto: "Quais prazos vencem nos próximos 7 dias? Algum já venceu?", n: eu.menu.prazos || null },
          { icone: Inbox, titulo: "Publicações novas", texto: "Resuma as publicações novas, sem as pendentes, e diga o que cada uma pede", n: eu.menu.publicacoes || null },
          { icone: CalendarDays, titulo: "Minha semana", texto: "O que tenho nos próximos 7 dias? Audiências, prazos e tarefas" },
          { icone: FolderOpen, titulo: "Em que pé está", texto: "Em que pé está o processo de ", completar: true },
          { icone: Calculator, titulo: "Contar um prazo", texto: "Publicado hoje, 15 dias úteis vence quando?" },
          { icone: Banknote, titulo: "Alvarás a receber", texto: "Quais alvarás ainda não foram repassados aos clientes?", n: eu.menu.alvaras || null },
        ];
  return (
    <div className="dc-chat__coluna dc-boas-vindas">
      <div className="dc-boas-vindas__texto">
        <h2>
          {saudacao()}, {eu.usuario.apelido}
        </h2>
        <p>{modo === "jurisprudencia" ? "Diga a tese ou o caso. A IA explica o que costuma prevalecer e dá os termos de busca para os tribunais." : "Pergunte sobre os prazos, processos, publicações e clientes do escritório. A IA consulta os dados, responde e mostra o que achou para você agir dali mesmo."}</p>
      </div>
      {campo}
      {modo === "jurisprudencia" && <AvisoJurisprudencia />}
      <div className="dc-sugestoes">
        {sugestoes.map((s) => (
          <button key={s.titulo} type="button" className="dc-sugestao-ia" onClick={() => aoSugerir(s.texto, !s.completar)}>
            <span className="dc-sugestao-ia__topo">
              <s.icone aria-hidden />
              <strong>{s.titulo}</strong>
              {s.n != null && <span className="dc-sugestao-ia__n dc-num">{numero(s.n)}</span>}
            </span>
            <span className="dc-sugestao-ia__texto">{s.completar ? `${s.texto}…` : s.texto}</span>
          </button>
        ))}
      </div>
      {!!recentes?.length && (
        <section className="dc-recentes" aria-labelledby="dc-recentes">
          <div className="dc-recentes__topo">
            <h3 id="dc-recentes" className="dc-rotulo">
              Recentes
            </h3>
            {recentes.length > 4 && (
              <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" onClick={aoVerTodas}>
                Ver todas
              </button>
            )}
          </div>
          <ul className="dc-recentes__lista">
            {recentes.slice(0, 4).map((k) => (
              <li key={k.id}>
                <Link to="/perguntar/$id" params={{ id: k.id }} className="dc-recentes__item">
                  {k.modo === "jurisprudencia" ? <Scale aria-hidden /> : k.fixada ? <Pin aria-hidden /> : <MessageSquare aria-hidden />}
                  <span className="dc-recentes__titulo">{k.titulo}</span>
                  <span className="dc-recentes__quando dc-num">{quandoFoi(k.atualizadaEm, hoje)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "09:12" hoje, "ontem", "terça" na semana, "12/10" antes. */
function quandoFoi(iso: string, hoje: string): string {
  const d = diaDoInstante(iso);
  const dias = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
  if (dias <= 0) return hora(iso);
  if (dias === 1) return "ontem";
  if (dias < 7) return diaDaSemana(d).split("-")[0]!;
  return diaCurto(d);
}

/* ------------------------------------------------------------------ */
/* O histórico                                                         */
/* ------------------------------------------------------------------ */

function grupoDaData(iso: string, hoje: string): string {
  const d = diaDoInstante(iso);
  const dias = Math.round((Date.parse(`${hoje}T00:00:00Z`) - Date.parse(`${d}T00:00:00Z`)) / 86_400_000);
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Ontem";
  if (dias < 7) return "Últimos 7 dias";
  if (dias < 30) return "Últimos 30 dias";
  return "Mais antigas";
}

function Historico({ conversas, ativa, aoEscolher, aoApagar }: { conversas?: ConversaNaLista[]; ativa: string | null; aoEscolher: () => void; aoApagar: (id: string) => void }) {
  const [busca, setBusca] = useState("");
  const termo = busca.trim();
  const achadas = useQuery({ queryKey: ["conversas", "busca", termo], queryFn: () => api<{ conversas: ConversaNaLista[] }>(`/ia/conversas?busca=${encodeURIComponent(termo)}`), enabled: termo.length >= 2 });
  const lista = termo.length >= 2 ? achadas.data?.conversas : conversas;
  const hoje = diaDoInstante(new Date().toISOString());
  const grupos = useMemo(() => {
    const g = new Map<string, ConversaNaLista[]>();
    for (const k of lista ?? []) {
      const nome = k.fixada ? "Fixadas" : grupoDaData(k.atualizadaEm, hoje);
      g.set(nome, [...(g.get(nome) ?? []), k]);
    }
    return [...g.entries()];
  }, [lista, hoje]);

  return (
    <nav className="dc-historico" aria-label="Conversas">
      <div className="dc-historico__topo">
        <Link to="/perguntar" className="dc-btn dc-btn--secundaria dc-btn--bloco dc-historico__nova" onClick={aoEscolher}>
          <SquarePen /> Nova conversa
        </Link>
        <label className="dc-historico__busca">
          <Search aria-hidden />
          <input type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nas conversas" aria-label="Buscar nas conversas" />
        </label>
      </div>
      <div className="dc-historico__lista">
        {!lista ? (
          <div className="px-3 py-2">
            <Carregando linhas={3} />
          </div>
        ) : !lista.length ? (
          <p className="dc-historico__vazio">{termo.length >= 2 ? "Nenhuma conversa com isso." : "Suas conversas ficam aqui. Só você vê."}</p>
        ) : (
          grupos.map(([nome, ks]) => (
            <section key={nome} className="dc-historico__grupo">
              <h3>{nome}</h3>
              {ks.map((k) => (
                <ItemDoHistorico key={k.id} k={k} ativa={k.id === ativa} aoEscolher={aoEscolher} aoApagar={aoApagar} />
              ))}
            </section>
          ))
        )}
      </div>
    </nav>
  );
}

function ItemDoHistorico({ k, ativa, aoEscolher, aoApagar }: { k: ConversaNaLista; ativa: boolean; aoEscolher: () => void; aoApagar: (id: string) => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [renomeando, setRenomeando] = useState(false);
  const [nome, setNome] = useState(k.titulo);
  const [apagando, setApagando] = useState(false);
  const atualizar = () => void qc.invalidateQueries({ queryKey: ["conversas"] });
  const mudar = useMutation({
    mutationFn: (b: { titulo?: string; fixada?: boolean }) => api(`/ia/conversas/${k.id}`, { method: "PATCH", json: b }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const apagar = useMutation({
    mutationFn: () => api(`/ia/conversas/${k.id}`, { method: "DELETE" }),
    onSuccess: () => {
      setApagando(false);
      aoApagar(k.id);
      qc.setQueryData<{ conversas: ConversaNaLista[] }>(conversasQuery.queryKey, (v) => v && { conversas: v.conversas.filter((x) => x.id !== k.id) });
      atualizar();
      avisar("Conversa apagada");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  if (renomeando) {
    return (
      <form
        className="dc-historico__item is-editando"
        onSubmit={(e) => {
          e.preventDefault();
          if (nome.trim() && nome.trim() !== k.titulo) mudar.mutate({ titulo: nome.trim() });
          setRenomeando(false);
        }}
      >
        <input value={nome} onChange={(e) => setNome(e.target.value)} onBlur={(e) => e.currentTarget.form?.requestSubmit()} onKeyDown={(e) => e.key === "Escape" && setRenomeando(false)} aria-label="Nome da conversa" autoFocus maxLength={120} />
      </form>
    );
  }
  return (
    <div className={cn("dc-historico__item", ativa && "is-on")}>
      <Link to="/perguntar/$id" params={{ id: k.id }} onClick={aoEscolher} aria-current={ativa ? "page" : undefined} title={k.titulo}>
        {k.modo === "jurisprudencia" && <Scale aria-label="Jurisprudência" />}
        <span>{k.titulo}</span>
      </Link>
      <Menu.Root>
        <Menu.Trigger className="dc-historico__mais" aria-label={`Opções de ${k.titulo}`}>
          <Ellipsis />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Content className="dc-menu-flutuante dc" align="end" sideOffset={4}>
            <MenuItem icone={Pencil} aoEscolher={() => (setNome(k.titulo), setRenomeando(true))}>
              Renomear
            </MenuItem>
            <MenuItem icone={k.fixada ? PinOff : Pin} aoEscolher={() => mudar.mutate({ fixada: !k.fixada })}>
              {k.fixada ? "Desafixar" : "Fixar no topo"}
            </MenuItem>
            <MenuItem icone={Trash2} perigo aoEscolher={() => setApagando(true)}>
              Apagar
            </MenuItem>
          </Menu.Content>
        </Menu.Portal>
      </Menu.Root>
      <Dialogo
        aberto={apagando}
        aoFechar={() => setApagando(false)}
        titulo="Apagar a conversa?"
        descricao={`"${k.titulo}" sai do seu histórico. Isso não mexe em nada do escritório (prazos, tarefas e processos continuam).`}
        acoes={
          <>
            <Botao variante="fantasma" onClick={() => setApagando(false)}>
              Cancelar
            </Botao>
            <Botao variante="perigo" onClick={() => apagar.mutate()} ocupado={apagar.isPending}>
              Apagar
            </Botao>
          </>
        }
      />
    </div>
  );
}

function MenuItem({ icone: Icone, perigo, aoEscolher, children }: { icone: LucideIcon; perigo?: boolean; aoEscolher: () => void; children: ReactNode }) {
  return (
    <Menu.Item className={cn("dc-menu-flutuante__item", perigo && "is-perigo")} onSelect={aoEscolher}>
      <Icone aria-hidden />
      {children}
    </Menu.Item>
  );
}
