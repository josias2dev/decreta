/**
 * API das telas (`/api/app/*`). Toda rota exige sessão do Better Auth com um
 * escritório ativo do qual a pessoa é membro; esse escritório é o tenant de
 * tudo que a rota lê ou grava.
 */
import { hojeEm, somarDias } from "@decreta/core";
import { alvaras, clientes, negocios, organization, prazos, processos, publicacoes } from "@decreta/db";
import { and, eq, ilike, inArray, lte, or, sql } from "drizzle-orm";
import { Hono } from "hono";
import { SLUG_DA_DEMONSTRACAO } from "../demonstracao/slug.ts";
import { ehMembro, pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { painelDoDia } from "../servicos/hoje.ts";
import { tenant, type Ambiente, type DepsDasRotas } from "./base.ts";
import { rotasDaAgenda } from "./agenda.ts";
import { rotasDosClientes } from "./clientes.ts";
import { rotasDosDocumentos } from "./documentos.ts";
import { rotasDoEscritorio } from "./escritorio.ts";
import { rotasDaIa } from "./ia.ts";
import { rotasDosNegocios } from "./negocios.ts";
import { rotasDasPecas } from "./pecas.ts";
import { rotasDosPrazos } from "./prazos.ts";
import { rotasDosProcessos } from "./processos.ts";
import { rotasDasPublicacoes } from "./publicacoes.ts";

export function createRotas(deps: DepsDasRotas) {
  const { db, auth } = deps;
  const app = new Hono<Ambiente>();

  app.use("*", async (c, next) => {
    const sessao = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessao) return c.json({ erro: "nao_autenticado" }, 401);
    const orgId = sessao.session.activeOrganizationId;
    if (!orgId) return c.json({ erro: "sem_escritorio" }, 403);
    // O escritório ativo fica gravado na sessão; confere que o vínculo ainda existe.
    const papel = await ehMembro(db, orgId, sessao.user.id);
    if (!papel) return c.json({ erro: "sem_escritorio" }, 403);
    const [org] = await db.select({ nome: organization.name, slug: organization.slug, timezone: organization.timezone }).from(organization).where(eq(organization.id, orgId));
    c.set("orgId", orgId);
    c.set("orgNome", org?.nome ?? "");
    c.set("demonstracao", org?.slug === SLUG_DA_DEMONSTRACAO);
    c.set("timezone", org?.timezone ?? "America/Sao_Paulo");
    c.set("userId", sessao.user.id);
    c.set("userNome", sessao.user.name || sessao.user.email);
    c.set("papel", papel);
    await next();
  });

  /** Quem está logado, em qual escritório, a equipe e os números do menu. */
  app.get("/eu", async (c) => {
    const hoje = hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const conta = (q: Promise<{ n: number }[]>) => q.then((r) => r[0]?.n ?? 0);
      const n = sql<number>`count(*)::int`;
      const [prazosSemana, prazosHoje, pubsNovas, nProcessos, nClientes, nNegocios, nAlvaras] = await Promise.all([
        conta(tx.select({ n }).from(prazos).where(and(eq(prazos.situacao, "aberto"), lte(prazos.fim, somarDias(hoje, 7))))),
        conta(tx.select({ n }).from(prazos).where(and(eq(prazos.situacao, "aberto"), lte(prazos.fim, hoje)))),
        conta(tx.select({ n }).from(publicacoes).where(eq(publicacoes.situacao, "nova"))),
        conta(tx.select({ n }).from(processos).where(inArray(processos.situacao, ["ativo", "suspenso"]))),
        conta(tx.select({ n }).from(clientes)),
        conta(tx.select({ n }).from(negocios).where(eq(negocios.etapa, "triagem"))),
        conta(tx.select({ n }).from(alvaras).where(inArray(alvaras.etapa, ["novo", "aguardando_saque", "sacado"]))),
      ]);
      const eu = pessoas.get(c.get("userId"));
      return c.json({
        usuario: { id: c.get("userId"), nome: c.get("userNome"), apelido: eu?.apelido ?? c.get("userNome"), iniciais: eu?.iniciais ?? "?", cargo: eu?.cargo ?? null, papel: c.get("papel") },
        escritorio: { id: c.get("orgId"), nome: c.get("orgNome"), pessoas: pessoas.size, timezone: c.get("timezone") },
        hoje,
        ia: deps.ia !== null,
        equipe: [...pessoas.values()].map((p) => ({ id: p.id, nome: p.nome, apelido: p.apelido, iniciais: p.iniciais, cargo: p.cargo, papel: p.papel })),
        menu: { prazos: prazosSemana, prazosHoje, publicacoes: pubsNovas, processos: nProcessos, clientes: nClientes, negocios: nNegocios, alvaras: nAlvaras },
      });
    });
  });

  app.get("/hoje", async (c) => {
    const hoje = hojeEm(c.get("timezone"));
    return c.json(await tenant(c, deps, (tx) => painelDoDia(db, tx, c.get("orgId"), hoje, c.get("timezone"))));
  });

  /** Busca do menu (⌘K): processos por número, partes ou título; clientes por nome, documento ou telefone. */
  app.get("/busca", async (c) => {
    const q = (c.req.query("q") ?? "").trim();
    if (q.length < 2) return c.json({ processos: [], clientes: [] });
    const digitos = q.replace(/\D/g, "");
    const termo = `%${q.replace(/[%_]/g, "")}%`;
    return tenant(c, deps, async (tx) => {
      const [ps, cs] = await Promise.all([
        tx
          .select({ id: processos.id, titulo: processos.titulo, cnj: processos.cnj, orgao: processos.orgao })
          .from(processos)
          .where(or(ilike(processos.titulo, termo), digitos.length >= 4 ? sql`regexp_replace(coalesce(${processos.cnj}, ''), '\\D', '', 'g') like ${`%${digitos}%`}` : sql`false`))
          .limit(8),
        tx
          .select({ id: clientes.id, nome: clientes.nome, documento: clientes.documento, telefone: clientes.telefone })
          .from(clientes)
          .where(or(ilike(clientes.nome, termo), digitos.length >= 4 ? or(ilike(clientes.documento, `%${digitos}%`), sql`regexp_replace(coalesce(${clientes.telefone}, ''), '\\D', '', 'g') like ${`%${digitos}%`}`) : sql`false`))
          .limit(8),
      ]);
      return c.json({ processos: ps, clientes: cs });
    });
  });

  rotasDosPrazos(app, deps);
  rotasDasPublicacoes(app, deps);
  rotasDosProcessos(app, deps);
  rotasDosClientes(app, deps);
  rotasDaIa(app, deps);
  rotasDasPecas(app, deps);
  rotasDosDocumentos(app, deps);
  rotasDaAgenda(app, deps);
  rotasDosNegocios(app, deps);
  rotasDoEscritorio(app, deps);
  return app;
}
