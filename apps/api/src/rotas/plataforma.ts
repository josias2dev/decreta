/**
 * A API do painel da plataforma (`/api/plataforma/*`), só para os operadores (`PLATAFORMA_EMAILS`).
 * Fica fora de `/api/app`: o operador não precisa pertencer a escritório nenhum, e as regras de
 * acesso de um escritório (só leitura, bloqueio) nunca o impedem de agir nos outros.
 *
 * Quem não é operador, esteja ou não logado, recebe 404, como se a rota não existisse. O que sai daqui é a
 * conta de cada escritório (nome, situação, datas) e totais: nunca cliente, processo nem publicação.
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

const ACAO = z.object({
  acao: z.enum(ACOES_DA_PLATAFORMA),
  dias: z.number().int().min(1).max(DIAS_A_MAIS_MAXIMO).optional(),
  motivo: z.string().trim().max(300).nullish(),
});

export function rotasDaPlataforma(deps: { db: Database; auth: Auth; emails: ReadonlySet<string>; log: (msg: string, extra?: Record<string, unknown>) => void }) {
  const app = new Hono<{ Variables: { operador: string } }>();

  app.use("*", async (c, next) => {
    const sessao = await deps.auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    // O e-mail precisa ser verificado: uma conta aberta por outra pessoa com o e-mail de um operador não entra.
    if (!sessao || !sessao.user.emailVerified || !ehOperador(deps.emails, sessao.user.email)) return c.json({ erro: "nao_encontrado" }, 404);
    c.set("operador", sessao.user.email.toLowerCase());
    await next();
  });

  app.get("/escritorios", async (c) => c.json({ escritorios: await escritoriosDaPlataforma(deps.db) }));

  /** `?dias=` de 1 a 366 (o padrão é 30): o período do funil, das conversões e dos cancelamentos. */
  app.get("/indicadores", async (c) => {
    const dias = Number(c.req.query("dias") ?? 30);
    if (!Number.isInteger(dias) || dias < 1 || dias > 366) return c.json({ erro: "dados_invalidos", detalhe: "dias: de 1 a 366." }, 400);
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
      if (err instanceof RecusaDaPlataforma) return c.json({ erro: "recusado", detalhe: err.message }, err.status);
      throw err;
    }
  });

  return app;
}
