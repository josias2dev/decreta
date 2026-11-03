import { PLANO } from "@decreta/core";
import { createDatabase } from "@decreta/db";
import { armazenamentoDoEnv } from "@decreta/documentos";
import { createGatewayIa } from "@decreta/ia";
import { serve } from "inngest/hono";
import { createApp } from "./app.ts";
import { createAuth } from "./auth.ts";
import { criarCofre, segredoDoCofre } from "./cofre.ts";
import { createLogMailer, createResendMailer } from "./email.ts";
import { readEnv } from "./env.ts";
import { createFunctions, eventoDoPedido, inngest } from "./inngest.ts";
import { candidatoDoPrazo } from "./servicos/observacao.ts";
import { rotasDoEnvioPeloCliente } from "./rotas/envio-pelo-cliente.ts";
import { rotasDoAvisoDoAsaas } from "./rotas/cobranca-aviso.ts";
import { rotasDoMcp } from "./rotas/mcp.ts";
import { createRotas } from "./rotas/index.ts";
import { rotasDaPlataforma } from "./rotas/plataforma.ts";
import { startSentry } from "./sentry.ts";
import { criarClienteAsaas } from "./servicos/asaas.ts";
import { emailsDaPlataforma } from "./servicos/plataforma.ts";
import { limitesDoEnv } from "./servicos/uso-ia.ts";

const env = readEnv();
const log = (msg: string, extra?: Record<string, unknown>) => console.log(JSON.stringify({ msg, ...extra }));
const reporter = startSentry(env.SENTRY_DSN, { log });
const { db } = createDatabase(env.DATABASE_URL);

// Sem a chave do projeto no gateway, a IA fica desligada e as telas dizem isso; o resto funciona.
const gateway = {
  baseUrl: env.LLM_BASE_URL,
  apiKey: env.LLM_API_KEY,
  modelos: { juridico: env.MODELO_JURIDICO, autos: env.MODELO_AUTOS, documentos: env.MODELO_DOCUMENTOS, pdf: env.MODELO_PDF, vision: env.MODELO_VISION },
  modeloTranscricao: env.MODELO_TRANSCRICAO,
  log,
};
const ia = env.LLM_API_KEY ? createGatewayIa(gateway) : null;
const observacao = env.LLM_API_KEY && env.MODELO_OBSERVAR ? { ia: createGatewayIa({ ...gateway, modelos: { ...gateway.modelos, juridico: env.MODELO_OBSERVAR } }), ...candidatoDoPrazo(env.MODELO_OBSERVAR) } : undefined;
const arquivos = armazenamentoDoEnv(env);
const wameow = env.WAMEOW_URL && env.WAMEOW_TOKEN ? { url: env.WAMEOW_URL, token: env.WAMEOW_TOKEN } : undefined;
const captura = { db, datajudKey: env.DATAJUD_API_KEY, log, cobrancaAtiva: env.COBRANCA_ATIVA };
// A cobrança: o Asaas (sem chave, "Assinar" responde que a cobrança não está configurada) e a NFS-e, que só liga com os dados fiscais.
const asaas = env.ASAAS_API_KEY ? criarClienteAsaas({ apiKey: env.ASAAS_API_KEY, ambiente: env.ASAAS_AMBIENTE }) : null;
const nfse = env.NFSE_ATIVA && env.NFSE_SERVICO_MUNICIPAL_ID ? { servicoMunicipalId: env.NFSE_SERVICO_MUNICIPAL_ID, servicoCodigo: env.NFSE_SERVICO_CODIGO, servicoNome: env.NFSE_SERVICO_NOME, issPercentual: env.NFSE_ISS_PERCENTUAL, issRetido: env.NFSE_ISS_RETIDO } : null;
const cobranca = { ativa: env.COBRANCA_ATIVA, asaas };
const plataformaEmails = emailsDaPlataforma(env.PLATAFORMA_EMAILS);
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
  cobranca,
  plataformaEmails,
  cofre: criarCofre(segredoDoCofre(env, { producao: process.env.NODE_ENV === "production", log })),
  enderecoDaApi: env.BETTER_AUTH_URL,
});

const enfileirarPedido = async (p: Parameters<typeof eventoDoPedido>[0]) => {
  await inngest.send(eventoDoPedido(p));
};

const app = createApp({
  db,
  env,
  auth,
  rotas,
  envio: rotasDoEnvioPeloCliente({ db, ia, arquivos, maxArquivoBytes: env.ARQUIVO_MAX_MB * 1e6, enfileirar: enfileirarPedido, log, cobrancaAtiva: env.COBRANCA_ATIVA }),
  mcp: rotasDoMcp({ db, log, cobrancaAtiva: env.COBRANCA_ATIVA }),
  avisoDoAsaas: rotasDoAvisoDoAsaas({ db, log }),
  plataforma: rotasDaPlataforma({ db, auth, emails: plataformaEmails, log }),
  plataformaEmails,
  cobranca: { ...cobranca, token: env.ASAAS_WEBHOOK_TOKEN, nfse },
  inngestHandler: serve({ client: inngest, functions: createFunctions({ db, ia, captura, arquivos, wameow, telas, log, reporter, limites, observacao, mailer, cobrancaAtiva: env.COBRANCA_ATIVA, asaas }) }),
  log,
  reporter,
});

// A peça e o chat chegam aos poucos e podem levar mais de um minuto; o Bun corta conexão ociosa em 10 s por padrão.
export default { port: env.PORT, hostname: env.HOST, fetch: app.fetch, idleTimeout: 180, maxRequestBodySize: env.ARQUIVO_MAX_MB * 1e6 + 1e6 };
log("api no ar", { host: env.HOST, port: env.PORT, ia: !!ia, whatsapp: !!wameow, datajud: !!env.DATAJUD_API_KEY, arquivos: env.ARQUIVOS, telas: env.WEB_DIST || null, cobranca: env.COBRANCA_ATIVA, asaas: !!asaas, operadores: plataformaEmails.size });
if (env.COBRANCA_ATIVA) {
  // Ligada sem o necessário: o teste corre e o escritório vira só leitura no fim, mas ninguém consegue assinar. Melhor avisar alto no log.
  if (PLANO.valorMensalCentavos === null) log("COBRANCA_ATIVA ligada, mas o valor do plano não foi definido (PLANO em packages/core/src/plano.ts): ninguém consegue assinar");
  if (!asaas) log("COBRANCA_ATIVA ligada, mas falta ASAAS_API_KEY: ninguém consegue assinar");
  if (!env.ASAAS_WEBHOOK_TOKEN) log("COBRANCA_ATIVA ligada, mas falta ASAAS_WEBHOOK_TOKEN: os avisos de pagamento do Asaas são recusados e o escritório não vira ativo ao pagar");
}
