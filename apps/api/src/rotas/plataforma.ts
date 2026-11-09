/**
 * A API do painel da plataforma (`/api/plataforma/*`), só para os operadores (`PLATAFORMA_EMAILS`).
 * Fica fora de `/api/app`: o operador não precisa pertencer a escritório nenhum, e as regras de
 * acesso de um escritório (só leitura, bloqueio) nunca o impedem de agir nos outros.
 *
 * Quem não é operador, esteja ou não logado, recebe 404, como se a rota não existisse. O operador sem o 2FA
 * ligado recebe 403 (`plataforma_2fa`): o painel age sobre todos os escritórios, e uma senha vazada não basta.
 * O que sai daqui é a conta de cada escritório (nome, situação, datas, plano) e totais: nunca cliente, processo nem publicação.
 */
import { FUNCIONALIDADES_DO_PLANO, hojeEm, LIMITES_DO_PLANO, MARCAS_DO_ESCRITORIO } from "@decreta/core";
import type { Database } from "@decreta/db";
import { Hono } from "hono";
import { z } from "zod";
import type { Auth } from "../auth.ts";
import { Ajustes } from "../servicos/ajustes.ts";
import type { ClienteAsaas } from "../servicos/asaas.ts";
import {
  ACOES_NA_PESSOA,
  agirNaPessoa,
  custoDaIaDaPlataforma,
  faturasDaPlataforma,
  fichaDoEscritorio,
  listaDeEscritorios,
  pessoasDaPlataforma,
  temDoisFatores,
  usoDaPlataforma,
  visaoGeralDaPlataforma,
  type ConfigDoPainel,
} from "../servicos/painel-da-plataforma.ts";
import { criarCupom, criarNota, criarPlano, desativarCupom, escritoriosPorPlano, lerCupons, lerPlanos, marcarRetornoFeito, mudarPlano, planoPadrao, tornarPadrao } from "../servicos/planos.ts";
import {
  ACOES_DA_PLATAFORMA,
  agirNaLicenca,
  agirNoEscritorio,
  auditoriaDaPlataformaRecente,
  DIAS_A_MAIS_MAXIMO,
  DIAS_DE_ACESSO_MAXIMO,
  ehOperador,
  indicadoresDaPlataforma,
  MESES_DE_DESCONTO_MAXIMO,
  RecusaDaPlataforma,
} from "../servicos/plataforma.ts";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { rotasDoWhatsappNaPlataforma } from "../whatsapp/rotas.ts";

const motivo = z.string().trim().max(300).nullish();
const centavos = z.number().int().min(0).max(100_000_000);
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use AAAA-MM-DD");

/** As ações sobre a situação do escritório (as da etapa 1) e as da licença. */
const ACAO = z.discriminatedUnion("acao", [
  z.object({ acao: z.enum(ACOES_DA_PLATAFORMA), dias: z.number().int().min(1).max(DIAS_A_MAIS_MAXIMO).optional(), motivo }),
  z.object({ acao: z.literal("licenca"), planoId: z.string().uuid(), pessoasExtras: z.number().int().min(0).max(500), valorCombinadoCentavos: centavos.nullable(), motivo }),
  z.object({ acao: z.literal("desconto"), tipo: z.enum(["percentual", "valor"]), valor: z.number().int().min(1).max(100_000_000), meses: z.number().int().min(1).max(MESES_DE_DESCONTO_MAXIMO), motivo }),
  z.object({ acao: z.literal("tirar_desconto"), motivo }),
  z.object({ acao: z.literal("cupom"), codigo: z.string().trim().min(3).max(40), motivo }),
  z.object({
    acao: z.literal("tetos_ia"),
    tetos: z.object({ diaUsd: z.number().min(0).max(10_000).nullable(), mesUsd: z.number().min(0).max(100_000).nullable(), mensagensPorDia: z.number().int().min(0).max(100_000).nullable() }),
    motivo,
  }),
  z.object({ acao: z.literal("estender_acesso"), dias: z.number().int().min(1).max(DIAS_DE_ACESSO_MAXIMO), motivo }),
  z.object({ acao: z.literal("marcar"), marca: z.enum(MARCAS_DO_ESCRITORIO).nullable(), motivo }),
  z.object({ acao: z.literal("novo_link"), motivo }),
  z.object({ acao: z.literal("encerrar"), confirmacao: z.string().trim().min(1).max(200), motivo }),
]);

const ACAO_NA_PESSOA = z.object({ acao: z.enum(ACOES_NA_PESSOA), motivo });

const limite = z.number().min(0).max(1_000_000).nullable().optional();
const PLANO = z.object({
  nome: z.string().trim().min(2).max(60),
  mensalCentavos: centavos.nullable(),
  anualCentavos: centavos.nullable(),
  pessoasIncluidas: z.number().int().min(1).max(10_000).nullable(),
  pessoaExtraCentavos: centavos.nullable(),
  limites: z.object(Object.fromEntries(LIMITES_DO_PLANO.map((k) => [k, limite])) as Record<(typeof LIMITES_DO_PLANO)[number], typeof limite>).strict(),
  funcionalidades: z.object(Object.fromEntries(FUNCIONALIDADES_DO_PLANO.map((k) => [k, z.boolean().optional()])) as Record<(typeof FUNCIONALIDADES_DO_PLANO)[number], z.ZodOptional<z.ZodBoolean>>).strict(),
});

const CUPOM = z.object({
  codigo: z.string().trim().min(3).max(30),
  tipo: z.enum(["percentual", "valor"]),
  valor: z.number().int().min(1).max(100_000_000),
  meses: z.number().int().min(1).max(MESES_DE_DESCONTO_MAXIMO),
  validoAte: dia.nullable(),
  limiteDeUsos: z.number().int().min(1).max(100_000).nullable(),
  nota: z.string().trim().max(200).nullable(),
});

const NOTA = z.object({
  texto: z.string().trim().min(1).max(4000),
  contato: z.string().trim().max(200).nullable(),
  proximoPasso: z.string().trim().max(300).nullable(),
  retornoEm: dia.nullable(),
});

const AJUSTE = z.object({ valor: z.number().finite().nullable() });

/** `?dias=` de 1 a `maximo` (o padrão é 30), ou `null` quando vem errado. */
function diasDoPedido(valor: string | undefined, maximo = 366): number | null {
  const dias = Number(valor ?? 30);
  return Number.isInteger(dias) && dias >= 1 && dias <= maximo ? dias : null;
}

/** As contas do painel: a cotação do dólar e os tetos da IA. Sem elas (testes), dólar a 5,50 e sem tetos. */
const CONFIG_PADRAO: ConfigDoPainel = { cotacaoUsd: 5.5, tetos: { siteUsd: 0, avaliacaoUsd: 0 } };

type Corpo = { json: (b: unknown, s: number) => Response; req: { json: () => Promise<unknown> } };

/** Lê o corpo pelo esquema; errado, a resposta 400 sai com o que faltou. */
async function ler<S extends z.ZodType>(c: Corpo, schema: S): Promise<{ ok: true; dados: z.infer<S> } | { ok: false; resposta: Response }> {
  const r = schema.safeParse(await c.req.json().catch(() => null));
  if (r.success) return { ok: true, dados: r.data };
  return { ok: false, resposta: c.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ") }, 400) };
}

export function rotasDaPlataforma(deps: {
  db: Database;
  auth: Auth;
  emails: ReadonlySet<string>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  config?: ConfigDoPainel;
  /** Os ajustes que o dono muda no painel. Sem eles (testes), um conjunto só deste painel, sobre a config dada. */
  ajustes?: Ajustes;
  /** A cobrança do Decreta: o Asaas para acertar o valor da assinatura e tirar um link do ar. */
  cobranca?: { ativa: boolean; asaas: ClienteAsaas | null; nfse?: boolean };
  /** O operador precisa do 2FA ligado (o padrão). Só a máquina de quem desenvolve desliga. */
  exigirDoisFatores?: boolean;
  /** O e-mail sai de verdade (o link de senha nova e o de confirmar dependem disso). */
  emailLigado?: boolean;
  /** O endereço das telas, para os links dos e-mails. */
  telas?: string;
  /** O WhatsApp oficial: as conversas e o Laboratório no painel. */
  whatsapp?: Parameters<typeof rotasDoWhatsappNaPlataforma>[1];
}) {
  const app = new Hono<{ Variables: { operador: string } }>();
  const config = deps.config ?? { ...CONFIG_PADRAO, tetos: { ...CONFIG_PADRAO.tetos } };
  const ajustes = deps.ajustes ?? new Ajustes({ painel: config });
  const cobranca = { db: deps.db, asaas: deps.cobranca?.asaas ?? null, cobrancaAtiva: !!deps.cobranca?.ativa, log: deps.log };

  app.use("*", async (c, next) => {
    const sessao = await deps.auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    // O e-mail precisa ser verificado: uma conta aberta por outra pessoa com o e-mail de um operador não entra.
    if (!sessao || !sessao.user.emailVerified || !ehOperador(deps.emails, sessao.user.email)) return c.json({ erro: "nao_encontrado" }, 404);
    if (deps.exigirDoisFatores !== false && !(await temDoisFatores(deps.db, sessao.user.id))) {
      return c.json({ erro: "plataforma_2fa", detalhe: "Para abrir o painel da plataforma, ligue a verificação em duas etapas em Minha conta." }, 403);
    }
    c.set("operador", sessao.user.email.toLowerCase());
    await next();
  });

  const recusar = (c: { json: (b: unknown, s: number) => Response }, err: unknown) => {
    if (err instanceof RecusaDaPlataforma) return c.json({ erro: "recusado", detalhe: err.message }, err.status);
    throw err;
  };

  app.get("/visao-geral", async (c) => c.json(await visaoGeralDaPlataforma(deps.db, config)));

  app.get("/escritorios", async (c) => c.json({ escritorios: await listaDeEscritorios(deps.db) }));

  app.get("/escritorios/:id", async (c) => {
    try {
      return c.json(await fichaDoEscritorio(deps.db, c.req.param("id")));
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.post("/escritorios/:id/acao", async (c) => {
    const r = await ler(c, ACAO);
    if (!r.ok) return r.resposta;
    const base = { operador: c.get("operador"), organizationId: c.req.param("id") };
    try {
      const p = r.dados;
      if ((ACOES_DA_PLATAFORMA as readonly string[]).includes(p.acao)) {
        const q = p as { acao: (typeof ACOES_DA_PLATAFORMA)[number]; dias?: number; motivo?: string | null };
        return c.json({ ok: true, ...(await agirNoEscritorio({ db: deps.db, log: deps.log, testeDias: ajustes.testeDias }, { ...base, ...q })) });
      }
      return c.json({ ok: true, ...(await agirNaLicenca(cobranca, { ...base, ...(p as Exclude<typeof p, { acao: (typeof ACOES_DA_PLATAFORMA)[number] }>) })) });
    } catch (err) {
      return recusar(c, err);
    }
  });

  /* ---------------- As notas da equipe ---------------- */

  app.post("/escritorios/:id/notas", async (c) => {
    const r = await ler(c, NOTA);
    if (!r.ok) return r.resposta;
    try {
      return c.json({ nota: await criarNota(deps.db, c.get("operador"), c.req.param("id"), r.dados) }, 201);
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.post("/notas/:id/retorno-feito", async (c) => {
    try {
      return c.json({ nota: await marcarRetornoFeito(deps.db, c.get("operador"), c.req.param("id")) });
    } catch (err) {
      return recusar(c, err);
    }
  });

  /* ---------------- Os planos, os cupons e os ajustes ---------------- */

  app.get("/planos", async (c) => {
    const [planos, cupons, padrao] = await Promise.all([lerPlanos(deps.db), lerCupons(deps.db), planoPadrao(deps.db)]);
    const contagem = await escritoriosPorPlano(deps.db, padrao.id, SLUG_DA_DEMONSTRACAO);
    return c.json({
      planos: planos.map((p) => ({ ...p, ...(contagem.get(p.id) ?? { escritorios: 0, assinantes: 0 }) })),
      cupons,
      ajustes: ajustes.listar().filter((a) => a.grupo === "Teste"),
      cobranca: { ativa: cobranca.cobrancaAtiva, asaas: !!cobranca.asaas },
      hoje: hojeEm("America/Sao_Paulo"),
    });
  });

  app.post("/planos", async (c) => {
    const r = await ler(c, PLANO);
    if (!r.ok) return r.resposta;
    return c.json({ plano: await criarPlano(deps.db, c.get("operador"), r.dados) }, 201);
  });

  app.post("/planos/:id", async (c) => {
    const r = await ler(c, PLANO);
    if (!r.ok) return r.resposta;
    try {
      const feito = await mudarPlano(deps.db, c.get("operador"), c.req.param("id"), r.dados);
      // Quem assina e passou para a versão nova não existe (fica na antiga); quem ainda não assina não tem valor no Asaas. Nada a acertar lá.
      return c.json(feito);
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.post("/planos/:id/padrao", async (c) => {
    try {
      return c.json({ plano: await tornarPadrao(deps.db, c.get("operador"), c.req.param("id")) });
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.post("/cupons", async (c) => {
    const r = await ler(c, CUPOM);
    if (!r.ok) return r.resposta;
    try {
      return c.json({ cupom: await criarCupom(deps.db, c.get("operador"), r.dados) }, 201);
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.post("/cupons/:id/desativar", async (c) => {
    try {
      return c.json({ cupom: await desativarCupom(deps.db, c.get("operador"), c.req.param("id")) });
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.get("/ajustes", (c) => c.json({ ajustes: ajustes.listar() }));

  app.post("/ajustes/:chave", async (c) => {
    const r = await ler(c, AJUSTE);
    if (!r.ok) return r.resposta;
    try {
      return c.json({ ajuste: await ajustes.mudar(deps.db, c.get("operador"), c.req.param("chave"), r.dados.valor) });
    } catch (err) {
      return recusar(c, err);
    }
  });

  /* ---------------- As faturas ---------------- */

  app.get("/faturas", async (c) => {
    const mes = c.req.query("mes") ?? hojeEm("America/Sao_Paulo").slice(0, 7);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return c.json({ erro: "dados_invalidos", detalhe: "mes: use AAAA-MM." }, 400);
    return c.json({ ...(await faturasDaPlataforma(deps.db, mes)), cobranca: { ativa: cobranca.cobrancaAtiva, asaas: !!cobranca.asaas, nfse: !!deps.cobranca?.nfse } });
  });

  /* ---------------- As pessoas ---------------- */

  app.get("/pessoas", async (c) => c.json(await pessoasDaPlataforma(deps.db)));

  app.post("/pessoas/:id/acao", async (c) => {
    const r = await ler(c, ACAO_NA_PESSOA);
    if (!r.ok) return r.resposta;
    try {
      const feito = await agirNaPessoa({ db: deps.db, auth: deps.auth as never, emailLigado: !!deps.emailLigado, telas: deps.telas ?? "", log: deps.log, operadores: deps.emails }, { operador: c.get("operador"), userId: c.req.param("id"), ...r.dados });
      return c.json({ ok: true, ...feito });
    } catch (err) {
      return recusar(c, err);
    }
  });

  /* ---------------- O uso, a IA, a conversão e a auditoria ---------------- */

  app.get("/uso", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"), 180);
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 180." }, 400);
    return c.json(await usoDaPlataforma(deps.db, dias));
  });

  app.get("/ia", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"), 90);
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 90." }, 400);
    return c.json({ ...(await custoDaIaDaPlataforma(deps.db, config, dias)), ajustes: ajustes.listar().filter((a) => a.grupo !== "Teste") });
  });

  /** `?dias=` de 1 a 366 (o padrão é 30): o período do funil, das conversões e dos cancelamentos. */
  app.get("/indicadores", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"));
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 366." }, 400);
    return c.json(await indicadoresDaPlataforma(deps.db, dias));
  });

  app.get("/auditoria", async (c) => c.json({ itens: await auditoriaDaPlataformaRecente(deps.db) }));

  // As conversas do WhatsApp e o Laboratório: o conteúdo só abre com motivo, e o Laboratório só fala com a demonstração.
  if (deps.whatsapp) rotasDoWhatsappNaPlataforma(app, deps.whatsapp);

  return app;
}
