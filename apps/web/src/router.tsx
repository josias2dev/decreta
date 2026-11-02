import type { QueryClient } from "@tanstack/react-query";
import { createHashHistory, createRootRouteWithContext, createRoute, createRouter, lazyRouteComponent, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { FOLHA, VOLTAM_AO_TOPO } from "./componentes/rolagem";
import { ErroNaTela, NaoEncontrada } from "./componentes/nao-encontrada";
import { CONSULTA_DO_CELULAR } from "./lib/celular";
import { caixaQuery, clienteQuery, clientesQuery, euQuery, hojeQuery, prazoQuery, prazosQuery, processoQuery, processosQuery, publicacaoQuery } from "./lib/consultas";
import { ABAS_DO_ENDERECO, ABAS_DO_PROCESSO, SITUACOES_DO_FINANCEIRO, VISTAS_DA_AGENDA, type AbaDaConfiguracao, type AbaDoProcesso, type SituacaoDoFinanceiro, type VistaDaAgenda } from "./lib/rotas";
import type { Quando, SituacaoPublicacao } from "./lib/tipos";

const NA_PREVIA = import.meta.env.MODE === "previa";

/** Cada tela é um pedaço à parte: quem abre o login não baixa o editor de peças. */
const AcessoPage = {
  convite: lazyRouteComponent(() => import("./paginas/acesso"), "ConvitePage"),
  redefinir: lazyRouteComponent(() => import("./paginas/acesso"), "RedefinirSenhaPage"),
};
const AgendaPage = lazyRouteComponent(() => import("./paginas/agenda"), "AgendaPage");
const AudienciaPage = lazyRouteComponent(() => import("./paginas/agenda"), "AudienciaPage");
const AlvarasPage = lazyRouteComponent(() => import("./paginas/alvaras"), "AlvarasPage");
const AppLayout = lazyRouteComponent(() => import("./componentes/moldura"), "AppLayout");
const CadastroPage = lazyRouteComponent(() => import("./paginas/cadastro"), "CadastroPage");
const ClientePage = lazyRouteComponent(() => import("./paginas/clientes"), "ClientePage");
const ClientesPage = lazyRouteComponent(() => import("./paginas/clientes"), "ClientesPage");
const CoberturaPage = lazyRouteComponent(() => import("./paginas/cobertura"), "CoberturaPage");
const ComecarPage = lazyRouteComponent(() => import("./paginas/comecar"), "ComecarPage");
const ConfiguracoesPage = lazyRouteComponent(() => import("./paginas/configuracoes"), "ConfiguracoesPage");
const ContaPage = lazyRouteComponent(() => import("./paginas/conta"), "ContaPage");
const ConversaPage = lazyRouteComponent(() => import("./paginas/perguntar"), "ConversaPage");
const DocumentosPage = lazyRouteComponent(() => import("./paginas/documentos"), "DocumentosPage");
const EnviarDocumentosPage = lazyRouteComponent(() => import("./paginas/enviar"), "EnviarDocumentosPage");
const EntrarPage = lazyRouteComponent(() => import("./paginas/entrar"), "EntrarPage");
const EquipePage = lazyRouteComponent(() => import("./paginas/equipe"), "EquipePage");
const FinanceiroPage = lazyRouteComponent(() => import("./paginas/financeiro"), "FinanceiroPage");
const HojePage = lazyRouteComponent(() => import("./paginas/hoje"), "HojePage");
const MaisPage = lazyRouteComponent(() => import("./paginas/mais"), "MaisPage");
const ModelosPage = lazyRouteComponent(() => import("./paginas/modelos"), "ModelosPage");
const NegociosPage = lazyRouteComponent(() => import("./paginas/negocios"), "NegociosPage");
const PecaPage = lazyRouteComponent(() => import("./paginas/peca"), "PecaPage");
const PerguntarPage = lazyRouteComponent(() => import("./paginas/perguntar"), "PerguntarPage");
const PlataformaPage = lazyRouteComponent(() => import("./paginas/plataforma"), "PlataformaPage");
const PrazoPage = lazyRouteComponent(() => import("./paginas/prazo"), "PrazoPage");
const PrazosPage = lazyRouteComponent(() => import("./paginas/prazos"), "PrazosPage");
const ProcessoPage = lazyRouteComponent(() => import("./paginas/processo"), "ProcessoPage");
const ProcessosPage = lazyRouteComponent(() => import("./paginas/processos"), "ProcessosPage");
const PrivacidadePage = lazyRouteComponent(() => import("./paginas/privacidade"), "PrivacidadePage");
const PublicacaoPage = lazyRouteComponent(() => import("./paginas/publicacoes"), "PublicacaoPage");
const PublicacoesPage = lazyRouteComponent(() => import("./paginas/publicacoes"), "PublicacoesPage");
const SegurancaPage = lazyRouteComponent(() => import("./paginas/seguranca"), "SegurancaPage");
const TermosPage = lazyRouteComponent(() => import("./paginas/termos"), "TermosPage");

/** A landing é outra página (landing.html), servida em "/": um link do app para lá recarrega. Na demonstração, que vive num arquivo só, volta para o dia. */
function ParaOSite() {
  useEffect(() => {
    if (NA_PREVIA) void router.navigate({ to: "/hoje", replace: true });
    else location.replace("/");
  }, []);
  return null;
}

const QUANDO: readonly Quando[] = ["hoje", "semana", "vencidos", "abertos", "cumpridos"];
const SITUACOES: readonly SituacaoPublicacao[] = ["nova", "pendente", "lida", "vinculada"];
const texto = (v: unknown, max = 200) => (typeof v === "string" && v.length <= max ? v : undefined);

/**
 * A pré-carga: passar o mouse ou focar um link roda o `loader` da tela, e o roteador baixa o pedaço dela. O `loader`
 * só começa a buscar os dados e não segura a navegação: a tela abre na hora e usa o que já chegou. Ao navegar sem
 * pré-carga, ele busca os dados junto com o pedaço, e não depois.
 */
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet, notFoundComponent: NaoEncontrada });

/** No primeiro carregamento ainda não se sabe quem entrou (sessão, escritório, acesso bloqueado): quem decide é o /eu, e a tela busca depois dele. */
const seJaEntrou = (qc: QueryClient, buscar: () => unknown) => {
  if (qc.getQueryData(euQuery.queryKey)) void buscar();
};

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
// Cadastro aberto: a pessoa, o escritório e a sessão; depois, a configuração inicial em /comecar.
const cadastroRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cadastro", component: CadastroPage });
const conviteRoute = createRoute({ getParentRoute: () => rootRoute, path: "/convite/$id", component: AcessoPage.convite });
// O link que o cliente recebe no WhatsApp para mandar os documentos que faltam: sem login.
const enviarRoute = createRoute({ getParentRoute: () => rootRoute, path: "/enviar/$org/$segredo", component: EnviarDocumentosPage });
const redefinirRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/redefinir-senha",
  validateSearch: (s: Record<string, unknown>): { token?: string } => (texto(s.token, 500) ? { token: texto(s.token, 500) } : {}),
  component: AcessoPage.redefinir,
});

const inicioRoute = createRoute({ getParentRoute: () => rootRoute, path: "/", component: ParaOSite });
// Segurança e LGPD, aberta: o termo de uso de IA e a política interna apontam para cá.
const segurancaRoute = createRoute({ getParentRoute: () => rootRoute, path: "/seguranca", component: SegurancaPage });
// Termos de Uso e Política de Privacidade, abertos: o cadastro e o convite pedem o aceite deles.
const termosRoute = createRoute({ getParentRoute: () => rootRoute, path: "/termos", component: TermosPage });
const privacidadeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/privacidade", component: PrivacidadePage });
// A cobertura por tribunal, aberta: a última leitura do DJEN e o calendário que a conta usa.
const coberturaRoute = createRoute({ getParentRoute: () => rootRoute, path: "/cobertura", component: CoberturaPage });

// O painel da plataforma: só os operadores (PLATAFORMA_EMAILS), fora do menu do escritório. Os outros recebem 404.
const plataformaRoute = createRoute({ getParentRoute: () => rootRoute, path: "/plataforma", component: PlataformaPage });

const appRoute = createRoute({ getParentRoute: () => rootRoute, id: "app", component: AppLayout });

const hojeRoute = createRoute({ getParentRoute: () => appRoute, path: "/hoje", loader: ({ context: { queryClient: qc } }) => seJaEntrou(qc, () => qc.prefetchQuery(hojeQuery)), component: HojePage });
// A configuração inicial do escritório, uma etapa por tela, sem o menu em volta.
const comecarRoute = createRoute({ getParentRoute: () => appRoute, path: "/comecar", component: ComecarPage });
const prazosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/prazos",
  validateSearch: (s: Record<string, unknown>): { quando?: Quando; responsavel?: string } => ({
    ...(QUANDO.includes(s.quando as Quando) && s.quando !== "abertos" ? { quando: s.quando as Quando } : {}),
    ...(texto(s.responsavel, 80) ? { responsavel: texto(s.responsavel, 80) } : {}),
  }),
  loaderDeps: ({ search }) => ({ quando: search.quando ?? ("abertos" as const), responsavel: search.responsavel }),
  loader: ({ context: { queryClient: qc }, deps }) => seJaEntrou(qc, () => qc.prefetchQuery(prazosQuery(deps.quando, deps.responsavel))),
  component: PrazosPage,
});
const prazoRoute = createRoute({ getParentRoute: () => appRoute, path: "/prazos/$id", loader: ({ context: { queryClient: qc }, params }) => seJaEntrou(qc, () => qc.prefetchQuery(prazoQuery(params.id))), component: PrazoPage });
const publicacoesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/publicacoes",
  validateSearch: (s: Record<string, unknown>): { situacao?: SituacaoPublicacao; id?: string } => ({
    ...(SITUACOES.includes(s.situacao as SituacaoPublicacao) && s.situacao !== "nova" ? { situacao: s.situacao as SituacaoPublicacao } : {}),
    ...(texto(s.id, 40) ? { id: texto(s.id, 40) } : {}),
  }),
  loaderDeps: ({ search }) => ({ situacao: search.situacao ?? ("nova" as const), id: search.id }),
  // No computador a publicação abre ao lado da lista: a primeira (ou a do endereço) já vem junto.
  loader: ({ context: { queryClient: qc }, deps }) =>
    seJaEntrou(qc, () =>
      qc
        .fetchQuery(caixaQuery(deps.situacao))
        .then((caixa) => {
          const id = deps.id ?? caixa.itens[0]?.id;
          if (id && !window.matchMedia(CONSULTA_DO_CELULAR).matches) void qc.prefetchQuery(publicacaoQuery(id));
        })
        .catch(() => {}),
    ),
  component: PublicacoesPage,
});
const publicacaoRoute = createRoute({ getParentRoute: () => appRoute, path: "/publicacoes/$id", loader: ({ context: { queryClient: qc }, params }) => seJaEntrou(qc, () => qc.prefetchQuery(publicacaoQuery(params.id))), component: PublicacaoPage });
const pecaRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/pecas",
  validateSearch: (s: Record<string, unknown>): { prazo?: string; processo?: string; id?: string; tipo?: string } => ({
    ...(texto(s.prazo, 40) ? { prazo: texto(s.prazo, 40) } : {}),
    ...(texto(s.processo, 40) ? { processo: texto(s.processo, 40) } : {}),
    ...(texto(s.id, 40) ? { id: texto(s.id, 40) } : {}),
    // Peça já escolhida por quem chamou (o cumprimento de sentença, da aba Cálculos).
    ...(texto(s.tipo, 60) ? { tipo: texto(s.tipo, 60) } : {}),
  }),
  component: PecaPage,
});
const processosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/processos",
  // `novo`: abre já com o diálogo de novo processo (o atalho do /comecar).
  validateSearch: (s: Record<string, unknown>): { busca?: string; situacao?: "arquivados" | "todos"; novo?: true } => ({
    ...(texto(s.busca) ? { busca: texto(s.busca) } : {}),
    ...(s.situacao === "arquivados" || s.situacao === "todos" ? { situacao: s.situacao } : {}),
    ...(s.novo === true ? { novo: true } : {}),
  }),
  loaderDeps: ({ search }) => ({ situacao: search.situacao ?? ("ativos" as const), busca: search.busca }),
  loader: ({ context: { queryClient: qc }, deps }) => seJaEntrou(qc, () => qc.prefetchInfiniteQuery(processosQuery(deps.situacao, deps.busca))),
  component: ProcessosPage,
});
const processoRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/processos/$id",
  validateSearch: (s: Record<string, unknown>): { aba?: AbaDoProcesso } => (ABAS_DO_PROCESSO.includes(s.aba as AbaDoProcesso) && s.aba !== "resumo" ? { aba: s.aba as AbaDoProcesso } : {}),
  loader: ({ context: { queryClient: qc }, params }) => seJaEntrou(qc, () => qc.prefetchQuery(processoQuery(params.id))),
  component: ProcessoPage,
});
const clientesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/clientes",
  validateSearch: (s: Record<string, unknown>): { busca?: string } => (texto(s.busca) ? { busca: texto(s.busca) } : {}),
  loaderDeps: ({ search }) => ({ busca: search.busca }),
  loader: ({ context: { queryClient: qc }, deps }) => seJaEntrou(qc, () => qc.prefetchInfiniteQuery(clientesQuery(deps.busca))),
  component: ClientesPage,
});
const clienteRoute = createRoute({ getParentRoute: () => appRoute, path: "/clientes/$id", loader: ({ context: { queryClient: qc }, params }) => seJaEntrou(qc, () => qc.prefetchQuery(clienteQuery(params.id))), component: ClientePage });
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
const financeiroRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/financeiro",
  validateSearch: (s: Record<string, unknown>): { situacao?: SituacaoDoFinanceiro; cliente?: string; processo?: string } => ({
    ...(SITUACOES_DO_FINANCEIRO.includes(s.situacao as SituacaoDoFinanceiro) && s.situacao !== "abertas" ? { situacao: s.situacao as SituacaoDoFinanceiro } : {}),
    ...(texto(s.cliente, 40) ? { cliente: texto(s.cliente, 40) } : {}),
    ...(texto(s.processo, 40) ? { processo: texto(s.processo, 40) } : {}),
  }),
  component: FinanceiroPage,
});
const documentosRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/documentos",
  // `pagina`: a folha que a fonte citada pela IA aponta ("evento 87, fl. 3").
  validateSearch: (s: Record<string, unknown>): { doc?: string; pagina?: number } => {
    const doc = texto(s.doc, 40);
    const pagina = Number(s.pagina);
    return doc ? { doc, ...(Number.isInteger(pagina) && pagina > 1 && pagina < 10_000 ? { pagina } : {}) } : {};
  },
  component: DocumentosPage,
});
const modelosRoute = createRoute({ getParentRoute: () => appRoute, path: "/modelos", component: ModelosPage });
const equipeRoute = createRoute({ getParentRoute: () => appRoute, path: "/equipe", component: EquipePage });
const configuracoesRoute = createRoute({
  getParentRoute: () => appRoute,
  path: "/configuracoes",
  // `aba`: a aba que abre direto (o Asaas devolve a pessoa para ?aba=plano depois de pagar).
  validateSearch: (s: Record<string, unknown>): { aba?: AbaDaConfiguracao } => (ABAS_DO_ENDERECO.includes(s.aba as AbaDaConfiguracao) ? { aba: s.aba as AbaDaConfiguracao } : {}),
  component: ConfiguracoesPage,
});
const contaRoute = createRoute({ getParentRoute: () => appRoute, path: "/conta", component: ContaPage });
const maisRoute = createRoute({ getParentRoute: () => appRoute, path: "/mais", component: MaisPage });

const routeTree = rootRoute.addChildren([
  inicioRoute,
  segurancaRoute,
  termosRoute,
  privacidadeRoute,
  coberturaRoute,
  entrarRoute,
  cadastroRoute,
  conviteRoute,
  enviarRoute,
  redefinirRoute,
  plataformaRoute,
  appRoute.addChildren([
    hojeRoute,
    comecarRoute,
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
    financeiroRoute,
    documentosRoute,
    modelosRoute,
    equipeRoute,
    configuracoesRoute,
    contaRoute,
    maisRoute,
  ]),
]);

export const router = createRouter({
  routeTree,
  // O QueryClient de verdade entra pelo RouterProvider (main.tsx).
  context: { queryClient: undefined! },
  defaultPreload: "intent",
  // Uma tela que quebra mostra o aviso no lugar dela; o menu fica.
  defaultErrorComponent: ErroNaTela,
  // O Perguntar cuida da própria rolagem (abre na última pergunta, acompanha a resposta).
  scrollRestoration: ({ location }) => !location.pathname.startsWith("/perguntar"),
  scrollToTopSelectors: [...VOLTAM_AO_TOPO, FOLHA],
  // A prévia (vite build --mode previa) vive num arquivo só, então as rotas vão no #.
  ...(NA_PREVIA ? { history: createHashHistory() } : {}),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
