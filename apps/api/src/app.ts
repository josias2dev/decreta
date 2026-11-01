import { invitation, organization, user, type Database } from "@decreta/db";
import { eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { join, resolve, sep } from "node:path";
import { z } from "zod";
import { registrar } from "./auditoria.ts";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
import { criarEscritorio, slugUnico } from "./escritorio-novo.ts";
import { ipDoPedido, limitarPorIp } from "./limitador.ts";
import type { createRotas } from "./rotas/index.ts";
import type { Reporter } from "./sentry.ts";

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
  /** Endpoint que o Inngest chama para rodar as funções (`inngest/hono`). */
  inngestHandler?: (c: Context) => Promise<Response>;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
  reporter?: Reporter;
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
    // Cadastro aberto: poucos escritórios por hora de cada endereço, contra quem cria contas em série.
    app.use("/api/cadastro", limitarPorIp({ janelaMs: 60 * 60_000, maximo: 10 }, ipDoPedido));
    app.post("/api/cadastro", (c) => cadastrar(c, db, auth, env, log));
  }

  // Rotas sem login: poucos pedidos por minuto de cada endereço, contra quem tenta adivinhar um segredo ou token.
  app.use("/api/convites/*", limitarPorIp({ janelaMs: 60_000, maximo: 30 }, ipDoPedido));
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

const CADASTRO = z.object({
  nome: z.string().trim().min(2, "Diga como você se chama.").max(120),
  email: z.string().trim().toLowerCase().email("Confira o e-mail.").max(200),
  senha: z.string().min(10, "A senha precisa ter pelo menos 10 caracteres.").max(200),
  escritorio: z.string().trim().min(2, "Diga o nome do escritório.").max(120),
});

/**
 * Cadastro aberto: a pessoa (sócia, papel owner), o escritório e a sessão, de
 * uma vez. O e-mail já cadastrado dá 409 sem dizer mais nada sobre a conta. A
 * conta nasce pelo `criarEscritorio`, não pelo sign-up do Better Auth, que
 * continua fechado a quem não tem convite.
 */
async function cadastrar(c: Context, db: Database, auth: Auth, env: Env, log: NonNullable<AppDeps["log"]>) {
  const r = CADASTRO.safeParse(await c.req.json().catch(() => null));
  if (!r.success) return c.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => i.message).join(" ") }, 400);
  const b = r.data;
  const [jaTem] = await db.select({ id: user.id }).from(user).where(eq(user.email, b.email));
  if (jaTem) return c.json({ erro: "email_em_uso", detalhe: "Já existe uma conta com este e-mail. Entre com ela ou peça uma senha nova." }, 409);

  const slug = await slugUnico(db, b.escritorio);
  const { organizationId, userId } = await criarEscritorio(db, auth, { nome: b.escritorio, slug, onboarding: true, dono: { email: b.email, nome: b.nome, senha: b.senha } });
  await registrar(db, { organizationId, userId, nome: b.nome, acao: "escritorio.criado", detalhes: { escritorio: b.escritorio, slug }, ip: ipDoPedido(c) }, log);

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
 * em cache para sempre; as demais rotas caem no index.html (rotas do SPA).
 */
function servirTelas(app: Hono, dir: string) {
  const raiz = resolve(dir);
  const index = join(raiz, "index.html");
  app.get("*", async (c) => {
    const path = c.req.path;
    if (path.startsWith("/api/")) return c.notFound();
    let alvo: string;
    try {
      alvo = resolve(raiz, `.${decodeURIComponent(path)}`);
    } catch {
      return c.notFound();
    }
    const asset = path.startsWith("/assets/");
    if (alvo.startsWith(raiz + sep)) {
      const file = Bun.file(alvo);
      if (await file.exists()) return new Response(file, { headers: { "cache-control": asset ? "public, max-age=31536000, immutable" : "no-cache" } });
    }
    // Arquivo de build que sumiu (deploy novo com a aba antiga aberta): 404, não HTML no lugar de JS.
    if (asset) return c.notFound();
    return new Response(Bun.file(index), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  });
}
