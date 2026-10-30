import { createDatabase } from "@decreta/db";
import { armazenamentoDoEnv } from "@decreta/documentos";
import { createGatewayIa } from "@decreta/ia";
import { serve } from "inngest/hono";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { createLogMailer, createResendMailer } from "./email.ts";
import { readEnv } from "./env.ts";
import { createFunctions, eventoDoPedido, inngest } from "./inngest.ts";
import { createRotas } from "./rotas/index.ts";
import { startSentry } from "./sentry.ts";
import { limitesDoEnv } from "./servicos/uso-ia.ts";

const env = readEnv();
const log = (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ msg, ...extra }));
const reporter = startSentry(env.SENTRY_DSN, { log });
const { db } = createDatabase(env.DATABASE_URL);

// Sem a chave do projeto no gateway, a IA fica desligada e as telas dizem isso; o resto funciona.
const ia = env.LLM_API_KEY
  ? createGatewayIa({
      baseUrl: env.LLM_BASE_URL,
      apiKey: env.LLM_API_KEY,
      modelos: { juridico: env.MODELO_JURIDICO, autos: env.MODELO_AUTOS, documentos: env.MODELO_DOCUMENTOS, pdf: env.MODELO_PDF, vision: env.MODELO_VISION },
      modeloTranscricao: env.MODELO_TRANSCRICAO,
      log,
    })
  : null;
const arquivos = armazenamentoDoEnv(env);
const wameow = env.WAMEOW_URL && env.WAMEOW_TOKEN ? { url: env.WAMEOW_URL, token: env.WAMEOW_TOKEN } : undefined;
const captura = { db, datajudKey: env.DATAJUD_API_KEY, log };
const mailer = env.RESEND_API_KEY ? createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }) : createLogMailer(log);
const telas = env.WEB_ORIGIN.replace(/\/$/, "");
const limites = limitesDoEnv(env);

const auth = createAuth(db, env, {
  mailer,
  log,
  onEmailError: (err) => {
    log("e-mail falhou", { error: err instanceof Error ? err.message : String(err) });
    reporter.error(err, { tarefa: "email" });
  },
});

const rotas = createRotas({
  db,
  auth,
  ia,
  arquivos,
  mailer,
  telas,
  captura,
  wameow,
  maxArquivoBytes: env.ARQUIVO_MAX_MB * 1e6,
  enfileirar: async (p) => {
    await inngest.send(eventoDoPedido(p));
  },
  log,
  limites,
});

const app = createApp({
  db,
  env,
  auth,
  rotas,
  inngestHandler: serve({ client: inngest, functions: createFunctions({ db, ia, captura, arquivos, wameow, telas, log, reporter, limites }) }),
  log,
  reporter,
});

// A peça e o chat chegam aos poucos e podem levar mais de um minuto; o Bun corta conexão ociosa em 10 s por padrão.
export default { port: env.PORT, hostname: env.HOST, fetch: app.fetch, idleTimeout: 180, maxRequestBodySize: env.ARQUIVO_MAX_MB * 1e6 + 1e6 };
log("api no ar", { host: env.HOST, port: env.PORT, ia: !!ia, whatsapp: !!wameow, datajud: !!env.DATAJUD_API_KEY, arquivos: env.ARQUIVOS, telas: env.WEB_DIST || null });
