/**
 * A API do painel da plataforma (`/api/plataforma/*`), só para os operadores (`PLATAFORMA_EMAILS`).
 * Fica fora de `/api/app`: o operador não precisa pertencer a escritório nenhum, e as regras de
 * acesso de um escritório (só leitura, bloqueio) nunca o impedem de agir nos outros.
 *
 * Quem não é operador, esteja ou não logado, recebe 404, como se a rota não existisse. O operador sem o 2FA
 * ligado recebe 403 (`plataforma_2fa`): o painel age sobre todos os escritórios, e uma senha vazada não basta.
 * O que sai daqui é a conta de cada escritório (nome, situação, datas) e totais: nunca cliente, processo nem publicação.
 */
import { Hono } from "hono";
import { z } from "zod";
import type { Auth } from "../auth.ts";
import {
  ACOES_DA_PLATAFORMA,
  agirNoEscritorio,
  auditoriaDaPlataformaRecente,
  DIAS_A_MAIS_MAXIMO,
  ehOperador,
  escritoriosDaPlataforma,
  indicadoresDaPlataforma,
  RecusaDaPlataforma,
} from "../servicos/plataforma.ts";
import type { Database } from "@decreta/db";
import { ACOES_NA_PESSOA, agirNaPessoa, custoDaIaDaPlataforma, fichaDoEscritorio, pessoasDaPlataforma, temDoisFatores, usoDaPlataforma, visaoGeralDaPlataforma, type ConfigDoPainel } from "../servicos/painel-da-plataforma.ts";

const ACAO = z.object({
  acao: z.enum(ACOES_DA_PLATAFORMA),
  dias: z.number().int().min(1).max(DIAS_A_MAIS_MAXIMO).optional(),
  motivo: z.string().trim().max(300).nullish(),
});

const ACAO_NA_PESSOA = z.object({ acao: z.enum(ACOES_NA_PESSOA), motivo: z.string().trim().max(300).nullish() });

/** `?dias=` de 1 a `maximo` (o padrão é 30), ou `null` quando vem errado. */
function diasDoPedido(valor: string | undefined, maximo = 366): number | null {
  const dias = Number(valor ?? 30);
  return Number.isInteger(dias) && dias >= 1 && dias <= maximo ? dias : null;
}

/** As contas do painel: a cotação do dólar e os tetos da IA. Sem elas (testes), dólar a 5,50 e sem tetos. */
const CONFIG_PADRAO: ConfigDoPainel = { cotacaoUsd: 5.5, tetos: { siteUsd: 0, avaliacaoUsd: 0 } };

export function rotasDaPlataforma(deps: {
  db: Database;
  auth: Auth;
  emails: ReadonlySet<string>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  config?: ConfigDoPainel;
  /** O operador precisa do 2FA ligado (o padrão). Só a máquina de quem desenvolve desliga. */
  exigirDoisFatores?: boolean;
  /** O e-mail sai de verdade (o link de senha nova e o de confirmar dependem disso). */
  emailLigado?: boolean;
  /** O endereço das telas, para os links dos e-mails. */
  telas?: string;
}) {
  const app = new Hono<{ Variables: { operador: string } }>();
  const config = deps.config ?? CONFIG_PADRAO;

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

  app.get("/escritorios/:id", async (c) => {
    try {
      return c.json(await fichaDoEscritorio(deps.db, c.req.param("id")));
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.get("/pessoas", async (c) => c.json(await pessoasDaPlataforma(deps.db)));

  app.post("/pessoas/:id/acao", async (c) => {
    const r = ACAO_NA_PESSOA.safeParse(await c.req.json().catch(() => null));
    if (!r.success) return c.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ") }, 400);
    try {
      const feito = await agirNaPessoa({ db: deps.db, auth: deps.auth as never, emailLigado: !!deps.emailLigado, telas: deps.telas ?? "", log: deps.log }, { operador: c.get("operador"), userId: c.req.param("id"), ...r.data });
      return c.json({ ok: true, ...feito });
    } catch (err) {
      return recusar(c, err);
    }
  });

  app.get("/uso", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"), 180);
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 180." }, 400);
    return c.json(await usoDaPlataforma(deps.db, dias));
  });

  app.get("/ia", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"), 90);
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 90." }, 400);
    return c.json(await custoDaIaDaPlataforma(deps.db, config, dias));
  });

  app.get("/escritorios", async (c) => c.json({ escritorios: await escritoriosDaPlataforma(deps.db) }));

  /** `?dias=` de 1 a 366 (o padrão é 30): o período do funil, das conversões e dos cancelamentos. */
  app.get("/indicadores", async (c) => {
    const dias = diasDoPedido(c.req.query("dias"));
    if (dias === null) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 366." }, 400);
    return c.json(await indicadoresDaPlataforma(deps.db, dias));
  });

  app.get("/auditoria", async (c) => c.json({ itens: await auditoriaDaPlataformaRecente(deps.db) }));

  app.post("/escritorios/:id/acao", async (c) => {
    const r = ACAO.safeParse(await c.req.json().catch(() => null));
    if (!r.success) return c.json({ erro: "dados_invalidos", detalhe: r.error.issues.map((i) => `${i.path.join(".") || "corpo"}: ${i.message}`).join("; ") }, 400);
    try {
      const resultado = await agirNoEscritorio({ db: deps.db, log: deps.log }, { operador: c.get("operador"), organizationId: c.req.param("id"), ...r.data });
      return c.json({ ok: true, ...resultado });
    } catch (err) {
      return recusar(c, err);
    }
  });

  return app;
}
