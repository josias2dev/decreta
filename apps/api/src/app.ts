import { invitation, organization, type Database } from "@decreta/db";
import { eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { join, resolve, sep } from "node:path";
import type { Auth } from "./auth.ts";
import type { Env } from "./env.ts";
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
  }

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

  if (deps.rotas) {
    app.use("/api/app/*", cors({ origin: env.WEB_ORIGIN, credentials: true, allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], exposeHeaders: ["x-peca-id"] }));
    app.route("/api/app", deps.rotas);
  }

  if (env.WEB_DIST) servirTelas(app, env.WEB_DIST);

  app.onError((err, c) => {
    if (err instanceof HTTPException) return err.getResponse();
    log("erro na requisição", { path: c.req.path, error: err.message });
    deps.reporter?.error(err, { path: c.req.path, method: c.req.method });
    return c.json({ erro: "falha" }, 500);
  });

  return app;
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
