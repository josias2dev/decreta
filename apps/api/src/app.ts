import { ehEventoDoSite, VERSAO_DOS_TERMOS } from "@decreta/core";
import { invitation, organization, user, type Database } from "@decreta/db";
import { eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { csrf } from "hono/csrf";
import { HTTPException } from "hono/http-exception";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { registrar } from "./auditoria.ts";
import { AVISO_DO_ACEITE, type Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { criarEscritorio, slugUnico } from "./escritorio-novo.ts";
import { registrarEvento, registrarEventoSemEscritorio } from "./eventos.ts";
import { ipDoPedido, limitador, limitarPorIp } from "./limitador.ts";
import type { createRotas } from "./rotas/index.ts";
import type { Reporter } from "./sentry.ts";
import type { ClienteAsaas, ConfigDaNfse } from "./servicos/asaas.ts";
import { comoNasce } from "./servicos/assinatura.ts";
import { AvisoInvalido, tokenConfere, tratarAviso } from "./servicos/cobranca.ts";
import { montarCobertura, type Cobertura } from "./servicos/cobertura.ts";

export interface AppDeps {
  db: Database;
  env: Env;
  auth?: Auth;
  /** Rotas das telas (`/api/app/*`), já com a checagem de sessão. */
  rotas?: ReturnType<typeof createRotas>;
  /** O link de envio de documentos pelo cliente (`/api/envio/*`), sem login. */
  envio?: Hono;
  /** O conector MCP somente leitura (`/api/mcp`), com token pessoal no lugar da sessão. */
  mcp?: Hono;
  /** O aviso de pagamento do Asaas de cada escritório (`/api/cobranca/asaas/<escritório>`), com o segredo do aviso no lugar da sessão: são os honorários, na conta de cada escritório. */
  avisoDoAsaas?: Hono;
  /** O painel da plataforma (`/api/plataforma`), só para operadores (ver `rotas/plataforma.ts`). */
  plataforma?: Hono<any>;
  /** Os e-mails dos operadores: o cadastro aberto recusa esses e-mails, para ninguém abrir uma conta com o e-mail de um operador. */
  plataformaEmails?: ReadonlySet<string>;
  /**
   * A cobrança do Decreta (o plano de cada escritório): os avisos (webhooks) do Asaas em `/api/cobranca/asaas`, com o token que o Asaas manda. Sem token, a rota
   * responde 404. `ativa` liga o teste de 14 dias para os escritórios que se cadastram daqui em diante.
   */
  cobranca?: { ativa: boolean; token: string; asaas: ClienteAsaas | null; nfse: ConfigDaNfse | null };
  /** Endpoint que o Inngest chama para rodar as funções (`inngest/hono`). */
  inngestHandler?: (c: Context) => Promise<Response>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  reporter?: Reporter;
  /** O fetch da lista de tribunais do DJEN, na cobertura (os testes passam um de mentira). */
  fetchDoDjen?: typeof fetch;
}

export function createApp(deps: AppDeps) {
  const { db, env } = deps;
  const log = deps.log ?? ((msg, extra) => console.log(JSON.stringify({ msg, ...extra })));
  const app = new Hono();

  // O verificador externo e o deploy olham aqui: de pé é a API respondendo e o banco também.
  app.get("/health", async (c) => {
    try {
      await db.execute(sql`select 1`);
      return c.json({ ok: true });
    } catch (err) {
      log("health: banco fora", { error: err instanceof Error ? err.message : String(err) });
      return c.json({ ok: false, banco: false }, 503);
    }
  });

  if (deps.inngestHandler) {
    const handler = deps.inngestHandler;
    // Só o Inngest da mesma máquina chama esta rota. O que vem da internet passa
    // pelo Caddy, que sempre acrescenta X-Forwarded-For (e o bloco do Caddy já
    // responde 404 para /api/inngest; aqui é a segunda trava).
    app.on(["GET", "POST", "PUT"], "/api/inngest", (c) => (c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") ? c.notFound() : handler(c)));
  }

  if (deps.auth) {
    const auth = deps.auth;
    app.use("/api/auth/*", cors({ origin: env.WEB_ORIGIN, credentials: true, allowMethods: ["GET", "POST", "OPTIONS"] }));
    app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
    app.use("/api/cadastro", cors({ origin: env.WEB_ORIGIN, credentials: true, allowMethods: ["POST", "OPTIONS"] }));
    // Formulário de outro site não entra: sem isso, ele abriria no navegador de alguém a sessão de uma conta do atacante.
    app.use("/api/cadastro", csrf({ origin: env.WEB_ORIGIN }));
    // Cadastro aberto: poucos escritórios por hora de cada endereço, contra quem cria contas em série.
    app.use("/api/cadastro", limitarPorIp({ janelaMs: 60 * 60_000, maximo: 10 }, ipDoPedido));
    app.post("/api/cadastro", bodyLimit({ maxSize: TETO_DO_CADASTRO_BYTES, onError: (c) => c.json({ erro: "muito_grande", detalhe: "Os dados passaram do tamanho aceito." }, 413) }), (c) => cadastrar(c, db, auth, env, log, { ativa: !!deps.cobranca?.ativa, operadores: deps.plataformaEmails ?? new Set() }));
  }

  // Rotas sem login: poucos pedidos por minuto de cada endereço, contra quem tenta adivinhar um segredo ou token.
  app.use("/api/convites/*", limitarPorIp({ janelaMs: 60_000, maximo: 30 }, ipDoPedido));
  app.use("/api/eventos", csrf({ origin: env.WEB_ORIGIN }));
  app.use("/api/eventos", limitarPorIp({ janelaMs: 60_000, maximo: 30 }, ipDoPedido));
  /** A landing conta a visita e os cliques: só o nome, de uma lista fechada. Sem cookie, sem pessoa, e o endereço de quem mandou fica só no limitador, em memória. */
  app.post(
    "/api/eventos",
    bodyLimit({ maxSize: TETO_DO_EVENTO_BYTES, onError: (c) => c.json({ erro: "muito_grande" }, 413) }),
    async (c) => {
      const corpo = (await c.req.json().catch(() => null)) as { nome?: unknown } | null;
      if (!ehEventoDoSite(corpo?.nome)) return c.json({ erro: "evento_invalido" }, 400);
      await registrarEventoSemEscritorio(db, corpo.nome, log);
      return c.body(null, 204);
    },
  );
  /** A página aberta de cobertura: só datas e tribunais, em cache aqui e no navegador, para a visita não virar pedido ao DJEN. */
  app.use("/api/cobertura", limitarPorIp({ janelaMs: 60_000, maximo: 30 }, ipDoPedido));
  let coberturaGuardada: { ate: number; corpo: Cobertura } | null = null;
  app.get("/api/cobertura", async (c) => {
    if (!coberturaGuardada || coberturaGuardada.ate <= Date.now()) {
      coberturaGuardada = { ate: Date.now() + COBERTURA_EM_CACHE_MS, corpo: await montarCobertura({ db, fetch: deps.fetchDoDjen, log }) };
    }
    return c.json(coberturaGuardada.corpo, 200, { "cache-control": `public, max-age=${COBERTURA_EM_CACHE_MS / 1000}` });
  });
  app.use("/api/envio/*", limitarPorIp({ janelaMs: 60_000, maximo: 60 }, ipDoPedido));
  const limiteDoMcp = limitarPorIp({ janelaMs: 60_000, maximo: 120 }, ipDoPedido);
  app.use("/api/mcp", limiteDoMcp);
  app.use("/api/mcp/*", limiteDoMcp);

  /** Convite aberto pelo link do e-mail, antes de a pessoa entrar: de qual escritório é e para qual e-mail. */
  app.get("/api/convites/:id", async (c) => {
    const [row] = await db
      .select({ email: invitation.email, role: invitation.role, status: invitation.status, expiresAt: invitation.expiresAt, escritorio: organization.name })
      .from(invitation)
      .innerJoin(organization, eq(organization.id, invitation.organizationId))
      .where(eq(invitation.id, c.req.param("id")));
    if (!row) return c.json({ erro: "nao_encontrado" }, 404);
    const status = row.status === "pending" && row.expiresAt.getTime() < Date.now() ? "expirado" : row.status;
    return c.json({ email: row.email, papel: row.role, status, escritorio: row.escritorio });
  });

  if (deps.envio) app.route("/api/envio", deps.envio);
  if (deps.mcp) app.route("/api/mcp", deps.mcp);
  // O Asaas manda os avisos em rajada, de poucos endereços: só a tentativa com o segredo errado é limitada por endereço (dentro da rota).
  if (deps.avisoDoAsaas) app.route("/api/cobranca/asaas", deps.avisoDoAsaas);

  if (deps.plataforma) {
    app.use("/api/plataforma/*", cors({ origin: env.WEB_ORIGIN, credentials: true, allowMethods: ["GET", "POST", "OPTIONS"] }));
    app.use("/api/plataforma/*", csrf({ origin: env.WEB_ORIGIN }));
    app.use("/api/plataforma/*", limitarPorIp({ janelaMs: 60_000, maximo: 120 }, ipDoPedido));
    app.route("/api/plataforma", deps.plataforma);
  }

  // Os avisos do Asaas vêm com o token no cabeçalho. Só a tentativa com token errado é limitada por endereço: o aviso
  // verdadeiro nunca disputa a vez com quem tenta adivinhar o token (o endereço de origem pode ser forjado).
  const tentativasComTokenErrado = limitador({ janelaMs: 60_000, maximo: 20 });
  app.post("/api/cobranca/asaas", bodyLimit({ maxSize: TETO_DO_AVISO_BYTES, onError: (c) => c.json({ erro: "muito_grande" }, 413) }), async (c) => {
    const cobranca = deps.cobranca;
    // Sem token configurado a rota não existe: nunca aceita aviso de ninguém.
    if (!cobranca?.token) return c.json({ erro: "nao_encontrado" }, 404);
    if (!tokenConfere(c.req.header("asaas-access-token"), cobranca.token)) {
      const origem = ipDoPedido(c);
      if (origem && !tentativasComTokenErrado.permitir(origem)) return c.json({ erro: "muitas_tentativas" }, 429, { "retry-after": "60" });
      return c.json({ erro: "nao_autorizado" }, 401);
    }
    try {
      const resultado = await tratarAviso({ db, asaas: cobranca.asaas, nfse: cobranca.nfse, log }, await c.req.json().catch(() => null));
      return c.json({ ok: true, resultado });
    } catch (err) {
      if (err instanceof AvisoInvalido) return c.json({ erro: "aviso_invalido", detalhe: err.message }, 400);
      throw err;
    }
  });

  if (deps.rotas) {
    app.use("/api/app/*", cors({ origin: env.WEB_ORIGIN, credentials: true, allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], exposeHeaders: ["x-peca-id"] }));
    app.route("/api/app", deps.rotas);
  }

  if (env.WEB_DIST) servirTelas(app, env.WEB_DIST);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    // A rota, não o caminho: o caminho do link de envio carrega o segredo.
    log("erro na requisição", { rota: c.req.routePath, error: err.message });
    deps.reporter?.error(err, { rota: c.req.routePath, method: c.req.method });
    return c.json({ erro: "falha" }, 500);
  });

  return app;
}

const COBERTURA_EM_CACHE_MS = 15 * 60_000;
const TETO_DO_CADASTRO_BYTES = 16 * 1024;
/** Um aviso do Asaas (a cobrança e o cliente) tem poucos KB. */
const TETO_DO_AVISO_BYTES = 64 * 1024;
/** Um evento do site é `{"nome":"visita"}`: acima disto nem é lido. */
const TETO_DO_EVENTO_BYTES = 1024;

const CADASTRO = z.object({
  nome: z.string().trim().min(2, "Diga como você se chama.").max(120),
  email: z.string().trim().toLowerCase().email("Confira o e-mail.").max(200),
  senha: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(128, "A senha pode ter até 128 caracteres."),
  escritorio: z.string().trim().min(2, "Diga o nome do escritório.").max(120),
  /** O aceite: a versão dos Termos de Uso e da Política de Privacidade que a tela mostrou. Sem ela, ou com outra, não há conta. */
  termos: z.literal(VERSAO_DOS_TERMOS, { error: AVISO_DO_ACEITE }),
});

/**
 * Cadastro aberto: a pessoa (sócia, papel owner), o escritório e a sessão, de
 * uma vez. O e-mail já cadastrado dá 409 sem dizer mais nada sobre a conta. A
 * conta nasce pelo `criarEscritorio`, não pelo sign-up do Better Auth, que
 * continua fechado a quem não tem convite.
 */
async function cadastrar(c: Context, db: Database, auth: Auth, env: Env, log: NonNullable<AppDeps["log"]>, cobranca: { ativa: boolean; operadores: ReadonlySet<string> }) {
  const r = CADASTRO.safeParse(await c.req.json().catch(() => null));
  if (!r.success) return c.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => i.message).join(" ") }, 400);
  const b = r.data;
  const [jaTem] = await db.select({ id: user.id }).from(user).where(eq(user.email, b.email));
  // O e-mail de um operador da plataforma não abre conta pelo cadastro aberto (a conta nasce antes de o e-mail ser confirmado): a conta dele é criada pela equipe.
  if (jaTem || cobranca.operadores.has(b.email)) return c.json({ erro: "email_em_uso", detalhe: "Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova." }, 409);

  const slug = await slugUnico(db, b.escritorio);
  // Com a cobrança ligada, o escritório novo começa um teste de 14 dias, sem cartão; desligada, nasce cortesia e nunca é travado.
  const assinatura = comoNasce(cobranca.ativa, true);
  const { organizationId, userId } = await criarEscritorio(db, auth, { nome: b.escritorio, slug, cadastroAberto: true, assinatura, dono: { email: b.email, nome: b.nome, senha: b.senha, termosVersao: b.termos } });
  await registrar(db, { organizationId, userId, nome: b.nome, acao: "escritorio.criado", detalhes: { escritorio: b.escritorio, slug, termos: b.termos }, ip: ipDoPedido(c) }, log);
  await registrarEvento(db, "cadastro_concluido", organizationId, log);
  // A conta já funciona; falta provar que o e-mail é da pessoa. Se o envio falhar, o cadastro segue e ela pede de novo pelo aviso do Hoje.
  await auth.api.sendVerificationEmail({ body: { email: b.email, callbackURL: `${env.WEB_ORIGIN.replace(/\/$/, "")}/hoje` }, headers: new Headers() }).catch((err: unknown) => log("cadastro: o e-mail de confirmação não saiu", { organizationId, error: err instanceof Error ? err.message : String(err) }));

  // A sessão abre pelo mesmo caminho do login (com o registro de "entrou"): o cookie vai na resposta.
  const headers = new Headers({ "content-type": "application/json" });
  for (const nome of ["origin", "user-agent", "cf-connecting-ip", "x-forwarded-for"]) {
    const v = c.req.header(nome);
    if (v) headers.set(nome, v);
  }
  const login = await auth.handler(new Request(`${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api/auth/sign-in/email`, { method: "POST", headers, body: JSON.stringify({ email: b.email, password: b.senha }) }));
  if (!login.ok) log("cadastro: a sessão não abriu", { organizationId, status: login.status });
  const resposta = c.json({ ok: true, sessao: login.ok, escritorio: { id: organizationId, slug } }, 201);
  for (const cookie of login.headers.getSetCookie()) resposta.headers.append("set-cookie", cookie);
  return resposta;
}

/**
 * Telas compiladas na mesma origem da API: um endereço só, sem CORS, e o
 * cookie de sessão vale direto. O que está em /assets tem hash no nome e fica
 * em cache para sempre; as demais rotas caem no index.html (rotas do SPA). A
 * landing (`/`) e a demonstração são páginas estáticas à parte.
 */
function servirTelas(app: Hono, dir: string) {
  const raiz = resolve(dir);
  const index = join(raiz, "index.html");
  const pagina = (arquivo: string) => new Response(Bun.file(join(raiz, arquivo)), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  app.get("*", async (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/")) return c.notFound();
    if (path === "/") return pagina("landing.html");
    if (path === "/demonstracao" || path === "/demonstracao/") return pagina("demonstracao/index.html");
    let alvo: string;
    try {
      alvo = resolve(raiz, `.${decodeURIComponent(path)}`);
    } catch {
      return c.notFound();
    }
    const asset = path.startsWith("/assets/") || path.startsWith("/demonstracao/assets/");
    if (alvo.startsWith(raiz + sep)) {
      const file = Bun.file(alvo);
      if (await file.exists()) return new Response(file, { headers: { "cache-control": asset ? "public, max-age=31536000, immutable" : "no-cache" } });
    }
    // Arquivo de build que sumiu (deploy novo com a aba antiga aberta): 404, não HTML no lugar de JS.
    if (asset) return c.notFound();
    return new Response(Bun.file(index), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  });
}
