/**
 * A moldura das telas logadas. No computador: menu lateral cinza (com busca e
 * Perguntar) e o conteúdo com o véu do topo. No celular: cada tela tem o
 * próprio topo, e embaixo ficam a navegação e o botão Perguntar.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeft,
  Banknote,
  BookMarked,
  Building2,
  CalendarDays,
  FileText,
  FolderOpen,
  Hourglass,
  Inbox,
  LayoutGrid,
  Search,
  Settings,
  Sparkles,
  Sun,
  UserPlus,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { numero } from "@/lib/formato";
import type { Eu } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { Avisos } from "./avisos";
import { Busca } from "./busca";
import { Marca } from "./marca";
import { Avatar, Botao, Carregando } from "./ui";

type Destino = "/hoje" | "/prazos" | "/publicacoes" | "/agenda" | "/perguntar" | "/processos" | "/clientes" | "/negocios" | "/alvaras" | "/documentos" | "/modelos" | "/equipe" | "/configuracoes";

interface ItemDoMenu {
  to: Destino;
  rotulo: string;
  icone: LucideIcon;
  n?: (m: Eu["menu"]) => { n: number; hoje?: boolean } | null;
}

export const MENU: { titulo: string; itens: ItemDoMenu[] }[] = [
  {
    titulo: "Trabalho",
    itens: [
      { to: "/hoje", rotulo: "Hoje", icone: Sun },
      { to: "/prazos", rotulo: "Prazos", icone: Hourglass, n: (m) => (m.prazos ? { n: m.prazos, hoje: m.prazosHoje > 0 } : null) },
      { to: "/publicacoes", rotulo: "Publicações", icone: Inbox, n: (m) => (m.publicacoes ? { n: m.publicacoes } : null) },
      { to: "/agenda", rotulo: "Agenda", icone: CalendarDays },
      { to: "/perguntar", rotulo: "Perguntar", icone: Sparkles },
    ],
  },
  {
    titulo: "Casos",
    itens: [
      { to: "/processos", rotulo: "Processos", icone: FolderOpen, n: (m) => ({ n: m.processos }) },
      { to: "/clientes", rotulo: "Clientes", icone: Users, n: (m) => ({ n: m.clientes }) },
      { to: "/negocios", rotulo: "Novos negócios", icone: UserPlus, n: (m) => (m.negocios ? { n: m.negocios } : null) },
      { to: "/alvaras", rotulo: "Alvarás", icone: Banknote, n: (m) => (m.alvaras ? { n: m.alvaras } : null) },
    ],
  },
  {
    titulo: "Escritório",
    itens: [
      { to: "/documentos", rotulo: "Documentos", icone: FileText },
      { to: "/modelos", rotulo: "Modelos", icone: BookMarked },
      { to: "/equipe", rotulo: "Equipe", icone: UsersRound },
      { to: "/configuracoes", rotulo: "Configurações", icone: Settings },
    ],
  },
];

const NAV_CELULAR: { to: Destino | "/mais"; rotulo: string; icone: LucideIcon }[] = [
  { to: "/hoje", rotulo: "Hoje", icone: Sun },
  { to: "/prazos", rotulo: "Prazos", icone: Hourglass },
  { to: "/processos", rotulo: "Processos", icone: FolderOpen },
  { to: "/clientes", rotulo: "Clientes", icone: Users },
  { to: "/mais", rotulo: "Mais", icone: LayoutGrid },
];

/** Telas do celular que têm ações próprias embaixo e não mostram a navegação. */
const SEM_NAVEGACAO = [/^\/prazos\/[^/]+$/, /^\/publicacoes\/[^/]+$/, /^\/pecas/, /^\/perguntar/, /^\/audiencias\//];

export function AppLayout() {
  const eu = useQuery(euQuery);
  if (eu.isPending) return <Esperando />;
  if (eu.error instanceof ApiError && eu.error.status === 401) return <IrParaEntrar />;
  if (eu.error instanceof ApiError && eu.error.status === 403) return <SemEscritorio />;
  if (eu.error) return <ErroDeConexao aoTentar={() => void eu.refetch()} />;
  return (
    <Avisos>
      <Moldura eu={eu.data} />
    </Avisos>
  );
}

function Moldura({ eu }: { eu: Eu }) {
  const celular = useCelular();
  const caminho = useRouterState({ select: (s) => s.location.pathname });
  const aba = useRouterState({ select: (s) => (s.location.search as { aba?: string }).aba });
  const [buscando, setBuscando] = useState(false);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setBuscando(true);
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  if (celular) {
    // O chat do processo tem o campo preso embaixo, no lugar da navegação.
    // Dentro de um processo, Perguntar abre o chat daquele processo.
    const doProcesso = /^\/processos\/([^/]+)$/.exec(caminho)?.[1];
    const semNav = SEM_NAVEGACAO.some((r) => r.test(caminho)) || (aba === "chat" && !!doProcesso);
    return (
      <div className="dc dc-celular dc-tela">
        <AbrirBusca.Provider value={() => setBuscando(true)}>
          <Outlet />
        </AbrirBusca.Provider>
        {!semNav && (
          <>
            {doProcesso ? (
              <Link to="/processos/$id" params={{ id: doProcesso }} search={{ aba: "chat" }} className="dc-perguntar" style={{ textDecoration: "none" }}>
                <Sparkles /> Perguntar
              </Link>
            ) : (
              <Link to="/perguntar" className="dc-perguntar" style={{ textDecoration: "none" }}>
                <Sparkles /> Perguntar
              </Link>
            )}
            <nav className="dc-nav" aria-label="Navegação">
              {NAV_CELULAR.map((i) => {
                const on = caminho === i.to || caminho.startsWith(`${i.to}/`) || (i.to === "/mais" && ["/publicacoes", "/agenda", "/negocios", "/alvaras", "/documentos", "/equipe", "/configuracoes", "/conta"].some((p) => caminho.startsWith(p)));
                return (
                  <Link key={i.to} to={i.to} className={cn(on && "is-on")} aria-current={on ? "page" : undefined}>
                    <i.icone />
                    {i.rotulo}
                  </Link>
                );
              })}
            </nav>
          </>
        )}
        <Busca aberta={buscando} aoFechar={() => setBuscando(false)} />
      </div>
    );
  }

  return (
    <div className="dc dc-app">
      <nav className="dc-menu" aria-label="Menu principal">
        <div className="dc-menu__marca">
          <Marca />
        </div>
        <div className="dc-menu__escritorio">
          {eu.escritorio.logo ? (
            <img className="dc-menu__escritorio-logo dc-menu__escritorio-logo--imagem" src="/api/app/escritorio/logo" alt="" />
          ) : (
            <span className="dc-menu__escritorio-logo">
              <Building2 />
            </span>
          )}
          <span className="min-w-0">
            <strong className="truncate">{eu.escritorio.nome}</strong>
            <small>
              Advocacia · {eu.escritorio.pessoas} {eu.escritorio.pessoas === 1 ? "pessoa" : "pessoas"}
            </small>
          </span>
        </div>
        <button type="button" className="dc-menu__busca" onClick={() => setBuscando(true)}>
          <Search />
          <span>Buscar</span>
          <span className="dc-tecla">⌘K</span>
        </button>
        {MENU.map((g) => (
          <div key={g.titulo} className="dc-menu__grupo">
            <span className="dc-menu__titulo">{g.titulo}</span>
            {g.itens.map((i) => {
              const n = i.n?.(eu.menu);
              return (
                <Link key={i.to} to={i.to} activeProps={{ className: "is-on" }} activeOptions={{ exact: false }}>
                  <i.icone />
                  {i.rotulo}
                  {n && <span className={cn("dc-menu__n", n.hoje && "dc-menu__n--hoje")}>{numero(n.n)}</span>}
                </Link>
              );
            })}
          </div>
        ))}
        <Link to="/conta" className="dc-menu__pe">
          <Avatar pessoa={eu.usuario} />
          <span className="min-w-0">
            {eu.usuario.nome}
            <small>{eu.usuario.cargo ?? "Equipe"}</small>
          </span>
        </Link>
      </nav>
      <div className="dc-conteudo">
        <div className="dc-veu" aria-hidden="true" />
        <AbrirBusca.Provider value={() => setBuscando(true)}>
          <Outlet />
        </AbrirBusca.Provider>
      </div>
      <Busca aberta={buscando} aoFechar={() => setBuscando(false)} />
    </div>
  );
}

const AbrirBusca = createContext<() => void>(() => {});
export const useAbrirBusca = () => useContext(AbrirBusca);

/**
 * Página no computador: largura máxima, título e ações. `cheia` é a das
 * listas e quadros: ocupa a altura da tela, que fica parada, e só a lista
 * (ou cada coluna do quadro) rola.
 */
export function Pagina({ children, larga, cheia, className }: { children: ReactNode; larga?: boolean; cheia?: boolean; className?: string }) {
  return <main className={cn("dc-pagina", larga && "dc-pagina--larga", cheia && "dc-pagina--cheia", className)}>{children}</main>;
}

/**
 * Tela no celular: topo com título (e voltar, quando é uma tela de detalhe),
 * o miolo rolando e, se houver, as ações presas embaixo. `fixo` (a busca e os
 * filtros das listas) fica preso com o topo, e a lista rola por baixo.
 */
export function TelaCelular({
  titulo,
  sobre,
  voltar,
  direita,
  fixo,
  rodape,
  children,
}: {
  titulo: string;
  sobre?: ReactNode;
  voltar?: boolean | (() => void);
  direita?: ReactNode;
  fixo?: ReactNode;
  rodape?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const navigate = useNavigate();
  const aoVoltar = () => {
    if (typeof voltar === "function") return voltar();
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: "/hoje" });
  };
  return (
    <>
      <div className="dc-cabeca">
        <header className={cn("dc-topo", voltar && "dc-topo--voltar")}>
          {voltar && (
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Voltar" onClick={aoVoltar}>
              <ArrowLeft />
            </button>
          )}
          <div className="dc-topo__texto">
            {sobre && !voltar && <span className="dc-topo__sobre">{sobre}</span>}
            <h1 className="dc-topo__titulo">{titulo}</h1>
            {sobre && voltar && <span className="dc-topo__sobre">{sobre}</span>}
          </div>
          {direita}
        </header>
        {fixo && <div className="dc-cabeca__fixo">{fixo}</div>}
      </div>
      <main className={cn("dc-miolo", rodape && "dc-miolo--com-rodape")}>{children}</main>
      {rodape && <footer className="dc-rodape">{rodape}</footer>}
    </>
  );
}

/** Botão de busca do topo no celular. */
export function BotaoBuscar() {
  const abrir = useAbrirBusca();
  return (
    <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Buscar" onClick={abrir}>
      <Search />
    </button>
  );
}

function Esperando() {
  return (
    <div className="dc" style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <Carregando />
    </div>
  );
}

/**
 * Vai para o login guardando onde a pessoa estava. Lê a localização uma vez,
 * no primeiro render: durante a navegação esta moldura ainda está montada e a
 * URL já é a do login, que não pode virar o `redirect` dela mesma.
 */
export function IrParaEntrar() {
  const router = useRouter();
  const navigate = useNavigate();
  const [origem] = useState(() => router.state.location);
  useEffect(() => {
    if (origem.pathname !== "/entrar") void navigate({ to: "/entrar", search: origem.pathname === "/" ? {} : { redirect: origem.href }, replace: true });
  }, [origem, navigate]);
  return <Esperando />;
}

function SemEscritorio() {
  return (
    <div className="dc dc-entrada">
      <div className="dc-entrada__caixa">
        <div className="dc-entrada__marca">
          <Marca />
        </div>
        <section className="dc-painel">
          <div className="dc-painel__corpo">
            <h1 className="dc-h1">Sem escritório</h1>
            <p className="dc-sub">Sua conta ainda não faz parte de um escritório no Decreta. Peça a um sócio para te convidar pela tela da Equipe.</p>
            <Link to="/entrar" className="dc-link">
              Entrar com outra conta
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

function ErroDeConexao({ aoTentar }: { aoTentar: () => void }) {
  return (
    <div className="dc dc-entrada">
      <div className="dc-entrada__caixa">
        <section className="dc-painel">
          <div className="dc-painel__corpo">
            <h1 className="dc-h1">Sem conexão</h1>
            <p className="dc-sub">Não consegui falar com o servidor do Decreta. Confira a internet.</p>
            <Botao variante="primaria" onClick={aoTentar}>
              Tentar de novo
            </Botao>
          </div>
        </section>
      </div>
    </div>
  );
}
