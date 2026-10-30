import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { AppLayout } from "./componentes/moldura";
import { FOLHA, VOLTAM_AO_TOPO } from "./componentes/rolagem";
import { NaoEncontrada } from "./componentes/nao-encontrada";
import type { Quando, SituacaoPublicacao } from "./lib/tipos";
import { ConvitePage, RedefinirSenhaPage } from "./paginas/acesso";
import { AgendaPage, AudienciaPage, VISTAS_DA_AGENDA, type VistaDaAgenda } from "./paginas/agenda";
import { AlvarasPage } from "./paginas/alvaras";
import { ClientePage, ClientesPage } from "./paginas/clientes";
import { ConfiguracoesPage } from "./paginas/configuracoes";
import { ContaPage } from "./paginas/conta";
import { DocumentosPage } from "./paginas/documentos";
import { ModelosPage } from "./paginas/modelos";
import { EntrarPage } from "./paginas/entrar";
import { EquipePage } from "./paginas/equipe";
import { HojePage } from "./paginas/hoje";
import { InicioPage } from "./paginas/inicio";
import { MaisPage } from "./paginas/mais";
import { NegociosPage } from "./paginas/negocios";
import { PecaPage } from "./paginas/peca";
import { ConversaPage, PerguntarPage } from "./paginas/perguntar";
import { PrazoPage } from "./paginas/prazo";
import { PrazosPage } from "./paginas/prazos";
import { ProcessoPage, type AbaDoProcesso, ABAS_DO_PROCESSO } from "./paginas/processo";
import { ProcessosPage } from "./paginas/processos";
import { PublicacaoPage, PublicacoesPage } from "./paginas/publicacoes";

const QUANDO: readonly Quando[] = ["hoje", "semana", "vencidos", "abertos", "cumpridos"];
const SITUACOES: readonly SituacaoPublicacao[] = ["nova", "pendente", "lida", "vinculada"];
const texto = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : undefined);

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NaoEncontrada });

const entrarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entrar",
  // Só caminhos das próprias telas, para o login não virar redirecionamento aberto.
  validateSearch: (s: Record<string, unknown>): { redirect?: string; email?: string } => ({
    ...(typeof s.redirect === "string" && s.redirect.startsWith("/") && !s.redirect.startsWith("//") ? { redirect: s.redirect } : {}),
    ...(texto(s.email) ? { email: texto(s.email) } : {}),
  }),
  component: EntrarPage,
});
const conviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/convite/$id", component: ConvitePage });
const redefinirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/redefinir-senha",
  validateSearch: (s: Record<string, unknown>): { token?: string } => (texto(s.token, 500) ? { token: texto(s.token, 500) } : {}),
  component: RedefinirSenhaPage,
});

// decreta.site: a landing para quem chega de fora; quem tem sessão segue para /hoje.
const inicioRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: InicioPage });

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });

const hojeRoute = createRoute({ getParentRoute: () => appRoute, path: "/hoje", component: HojePage });
const prazosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/prazos",
  validateSearch: (s: Record<string, unknown>): { quando?: Quando; responsavel?: string } => ({
    ...(QUANDO.includes(s.quando as Quando) && s.quando !== "abertos" ? { quando: s.quando as Quando } : {}),
    ...(texto(s.responsavel, 80) ? { responsavel: texto(s.responsavel, 80) } : {}),
  }),
  component: PrazosPage,
});
const prazoRoute = createRoute({ getParentRoute: () => appRoute, path: "/prazos/$id", component: PrazoPage });
const publicacoesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/publicacoes",
  validateSearch: (s: Record<string, unknown>): { situacao?: SituacaoPublicacao; id?: string } => ({
    ...(SITUACOES.includes(s.situacao as SituacaoPublicacao) && s.situacao !== "nova" ? { situacao: s.situacao as SituacaoPublicacao } : {}),
    ...(texto(s.id, 40) ? { id: texto(s.id, 40) } : {}),
  }),
  component: PublicacoesPage,
});
const publicacaoRoute = createRoute({ getParentRoute: () => appRoute, path: "/publicacoes/$id", component: PublicacaoPage });
const pecaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/pecas",
  validateSearch: (s: Record<string, unknown>): { prazo?: string; processo?: string; id?: string } => ({
    ...(texto(s.prazo, 40) ? { prazo: texto(s.prazo, 40) } : {}),
    ...(texto(s.processo, 40) ? { processo: texto(s.processo, 40) } : {}),
    ...(texto(s.id, 40) ? { id: texto(s.id, 40) } : {}),
  }),
  component: PecaPage,
});
const processosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/processos",
  validateSearch: (s: Record<string, unknown>): { busca?: string; situacao?: "arquivados" | "todos" } => ({
    ...(texto(s.busca) ? { busca: texto(s.busca) } : {}),
    ...(s.situacao === "arquivados" || s.situacao === "todos" ? { situacao: s.situacao } : {}),
  }),
  component: ProcessosPage,
});
const processoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/processos/$id",
  validateSearch: (s: Record<string, unknown>): { aba?: AbaDoProcesso } => (ABAS_DO_PROCESSO.includes(s.aba as AbaDoProcesso) && s.aba !== "resumo" ? { aba: s.aba as AbaDoProcesso } : {}),
  component: ProcessoPage,
});
const clientesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/clientes",
  validateSearch: (s: Record<string, unknown>): { busca?: string } => (texto(s.busca) ? { busca: texto(s.busca) } : {}),
  component: ClientesPage,
});
const clienteRoute = createRoute({ getParentRoute: () => appRoute, path: "/clientes/$id", component: ClientePage });
const agendaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/agenda",
  validateSearch: (s: Record<string, unknown>): { vista?: VistaDaAgenda; dia?: string } => ({
    ...(VISTAS_DA_AGENDA.includes(s.vista as VistaDaAgenda) ? { vista: s.vista as VistaDaAgenda } : {}),
    ...(typeof s.dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.dia) ? { dia: s.dia } : {}),
  }),
  component: AgendaPage,
});
const audienciaRoute = createRoute({ getParentRoute: () => appRoute, path: "/audiencias/$id", component: AudienciaPage });
const perguntarRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/perguntar",
  validateSearch: (s: Record<string, unknown>): { modo?: "jurisprudencia" } => (s.modo === "jurisprudencia" ? { modo: "jurisprudencia" } : {}),
  component: PerguntarPage,
});
const conversaRoute = createRoute({ getParentRoute: () => appRoute, path: "/perguntar/$id", component: ConversaPage });
const negociosRoute = createRoute({ getParentRoute: () => appRoute, path: "/negocios", component: NegociosPage });
const alvarasRoute = createRoute({ getParentRoute: () => appRoute, path: "/alvaras", component: AlvarasPage });
const documentosRoute = createRoute({ getParentRoute: () => appRoute, path: "/documentos", component: DocumentosPage });
const modelosRoute = createRoute({ getParentRoute: () => appRoute, path: "/modelos", component: ModelosPage });
const equipeRoute = createRoute({ getParentRoute: () => appRoute, path: "/equipe", component: EquipePage });
const configuracoesRoute = createRoute({ getParentRoute: () => appRoute, path: "/configuracoes", component: ConfiguracoesPage });
const contaRoute = createRoute({ getParentRoute: () => appRoute, path: "/conta", component: ContaPage });
const maisRoute = createRoute({ getParentRoute: () => appRoute, path: "/mais", component: MaisPage });

const routeTree = rootRoute.addChildren([
  inicioRoute,
  entrarRoute,
  conviteRoute,
  redefinirRoute,
  appRoute.addChildren([
    hojeRoute,
    prazosRoute,
    prazoRoute,
    publicacoesRoute,
    publicacaoRoute,
    pecaRoute,
    processosRoute,
    processoRoute,
    clientesRoute,
    clienteRoute,
    agendaRoute,
    audienciaRoute,
    perguntarRoute,
    conversaRoute,
    negociosRoute,
    alvarasRoute,
    documentosRoute,
    modelosRoute,
    equipeRoute,
    configuracoesRoute,
    contaRoute,
    maisRoute,
  ]),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true, scrollToTopSelectors: [...VOLTAM_AO_TOPO, FOLHA] });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
