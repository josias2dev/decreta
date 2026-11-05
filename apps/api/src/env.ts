import { z } from "zod";

const vazioIndefinido = (v: unknown) => (v === "" ? undefined : v);
/** Interruptor: "1", "true" ou "sim" liga; vazio ou qualquer outra coisa desliga. */
const interruptor = z.string().default("").transform((v) => ["1", "true", "sim"].includes(v.trim().toLowerCase()));

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  /** Interface de escuta. No servidor, 127.0.0.1: a internet entra só pelo Caddy, na 443. */
  HOST: z.string().default("0.0.0.0"),
  /** App compilado (apps/web/dist). Preenchido, a API serve as telas na mesma origem. */
  WEB_DIST: z.string().default(""),
  /** Usuário da aplicação, membro de `app_user` (sujeito a RLS). */
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  /** Origem das telas, para CORS e cookies. */
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  /** openrouter-gateway (compatível com a API da OpenAI), projeto "decreta". */
  LLM_BASE_URL: z.string().url().default("http://127.0.0.1:8799/v1"),
  /** Chave gw_ do projeto no gateway. Vazia: as ações de IA respondem "IA não configurada". */
  LLM_API_KEY: z.string().default(""),
  /** Aliases do gateway. O modelo de verdade por trás de cada um é configurado lá. */
  MODELO_JURIDICO: z.string().default("juridico"),
  MODELO_AUTOS: z.string().default("autos"),
  MODELO_DOCUMENTOS: z.string().default("documentos"),
  MODELO_PDF: z.string().default("pdf"),
  MODELO_VISION: z.string().default("vision"),
  MODELO_TRANSCRICAO: z.string().default("openai/whisper-1"),
  /** Alias do gateway que o modo observar testa na sugestão de prazo. Vazio: ninguém observa, nada a mais é gasto. */
  MODELO_OBSERVAR: z.string().default(""),
  /**
   * Limites da IA nas telas (0 desliga cada um). O dia vira à meia-noite de
   * Brasília. O teto do site fica abaixo do teto do projeto no gateway (US$ 5)
   * para sobrar para as rotinas de fundo, que nunca são barradas aqui.
   */
  IA_MENSAGENS_POR_MINUTO: z.coerce.number().int().min(0).default(6),
  IA_MENSAGENS_POR_DIA: z.coerce.number().int().min(0).default(150),
  IA_TETO_PESSOA_USD: z.coerce.number().min(0).default(2),
  IA_TETO_SITE_USD: z.coerce.number().min(0).default(4),
  /** Na demonstração (o login que vai para quem quer conhecer): mensagens por pessoa e o gasto do escritório inteiro. */
  IA_DEMONSTRACAO_MENSAGENS_POR_DIA: z.coerce.number().int().min(0).default(30),
  IA_DEMONSTRACAO_TETO_USD: z.coerce.number().min(0).default(0.5),
  IA_PEDIDOS_SIMULTANEOS: z.coerce.number().int().min(0).default(2),
  /** Preço por milhão de tokens para estimar o gasto quando a resposta não traz o custo (o do modelo mais caro). */
  IA_USD_MTOK_ENTRADA: z.coerce.number().min(0).default(4),
  IA_USD_MTOK_SAIDA: z.coerce.number().min(0).default(20),
  /** Chave pública da API do DataJud (wiki do DataJud). Vazia: os andamentos não são atualizados. */
  DATAJUD_API_KEY: z.string().default(""),
  /** wameow: o número do Decreta que manda o resumo da manhã. Vazio: o resumo não sai. */
  WAMEOW_URL: z.string().default(""),
  WAMEOW_TOKEN: z.string().default(""),
  /** Senha da conta de demonstração: a renovação de toda madrugada volta para ela. */
  DEMONSTRACAO_SENHA: z.string().default(""),
  /** Onde ficam os arquivos: pasta local (dev, VPS com volume) ou R2. */
  ARQUIVOS: z.enum(["disco", "r2"]).default("disco"),
  ARQUIVOS_DIR: z.string().default("./data/arquivos"),
  /** Teto de cada arquivo enviado, em MB. */
  ARQUIVO_MAX_MB: z.coerce.number().positive().default(40),
  R2_ENDPOINT: z.preprocess(vazioIndefinido, z.string().url().optional()),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  /**
   * Segredo do cofre das chaves do Asaas e da ZapSign de cada escritório (AES-256-GCM).
   * Vazio: usa o BETTER_AUTH_SECRET. Trocar o segredo invalida as chaves já guardadas:
   * cada escritório as informa de novo.
   */
  COFRE_SECRET: z.string().default(""),
  /** Projeto da API no Sentry. Vazio desliga o envio de erros. */
  SENTRY_DSN: z.string().default(""),
  /** Resend (e-mail transacional). Vazio: os e-mails só vão para o log e a tela mostra o link para copiar. */
  RESEND_API_KEY: z.string().default(""),
  EMAIL_FROM: z.string().default("Decreta <nao-responda@decreta.app>"),
  /**
   * Cobrança da assinatura. Desligada (o padrão), o Decreta age como antes: ninguém é cobrado, nenhum escritório
   * vira só leitura e nenhum aviso de plano aparece. Ligar só depois de definir o valor (`PLANO` em @decreta/core)
   * e de configurar o Asaas e o aviso (webhook) dele.
   */
  COBRANCA_ATIVA: interruptor,
  /** Chave de API do Asaas (a de sandbox e a de produção são diferentes). Sem ela, "Assinar" responde que a cobrança não está configurada. */
  ASAAS_API_KEY: z.string().default(""),
  ASAAS_AMBIENTE: z.enum(["sandbox", "producao"]).default("sandbox"),
  /** O token que o Asaas manda no cabeçalho `asaas-access-token` de cada aviso. Vazio: a rota dos avisos responde 404. Não pode ser a chave de API. */
  ASAAS_WEBHOOK_TOKEN: z.string().default(""),
  /** Emissão automática de NFS-e pela assinatura do Asaas. Desligada: depende dos dados fiscais da empresa (município, código do serviço, alíquotas). */
  NFSE_ATIVA: interruptor,
  /** O serviço municipal cadastrado no Asaas e as alíquotas (em %) que a nota leva. Só entram com `NFSE_ATIVA`. */
  NFSE_SERVICO_MUNICIPAL_ID: z.string().default(""),
  NFSE_SERVICO_CODIGO: z.string().default(""),
  NFSE_SERVICO_NOME: z.string().default(""),
  NFSE_ISS_PERCENTUAL: z.coerce.number().min(0).default(0),
  NFSE_ISS_RETIDO: interruptor,
  /** E-mails dos operadores da plataforma (o painel /plataforma), separados por vírgula. Cada um precisa ter a conta criada pela equipe: o cadastro aberto e o convite recusam esses e-mails. */
  PLATAFORMA_EMAILS: z.string().default(""),
  /** Reais por dólar, para o custo da IA e a margem no painel da plataforma. */
  PLATAFORMA_COTACAO_USD: z.coerce.number().positive().default(5.5),
  /** Abre o painel da plataforma sem 2FA. Só para a máquina de quem desenvolve: em produção, fica vazio. */
  PLATAFORMA_SEM_2FA: interruptor,
}).superRefine((env, ctx) => {
  // O token do aviso do Asaas é o que separa um pagamento de uma mentira: longo, e nunca a própria chave de API.
  if (env.ASAAS_WEBHOOK_TOKEN && env.ASAAS_WEBHOOK_TOKEN.length < 24) ctx.addIssue({ code: "custom", path: ["ASAAS_WEBHOOK_TOKEN"], message: "use um token de pelo menos 24 caracteres (openssl rand -hex 32)" });
  if (env.ASAAS_WEBHOOK_TOKEN && env.ASAAS_WEBHOOK_TOKEN === env.ASAAS_API_KEY) ctx.addIssue({ code: "custom", path: ["ASAAS_WEBHOOK_TOKEN"], message: "não use a chave de API como token do aviso" });
});

export type Env = z.infer<typeof schema>;

export function readEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`Variáveis de ambiente inválidas:\n  ${campos}`);
  }
  return parsed.data;
}
