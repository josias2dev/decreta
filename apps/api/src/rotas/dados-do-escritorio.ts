/**
 * Os dados do escritório são do escritório: o sócio baixa uma cópia de tudo e
 * encerra a conta pelo app, sem passar pelo suporte. Só sócio, e a demonstração
 * (que é de todos) não exporta nem encerra.
 */
import { exportacoes, user } from "@decreta/db";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { encerrarEscritorio } from "../servicos/encerramento.ts";
import { marcarExportacaoFalhou } from "../servicos/exportacao.ts";
import { corpo, ehSocio, falha, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

/** Maiúsculas e espaços a mais não pesam na confirmação; o resto tem de bater. */
const comoSeEscreve = (s: string) => s.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

/** Uma cópia pedida e ainda não pronta só bloqueia um novo pedido por esse tempo: passou, a rotina falhou em silêncio e o sócio pode pedir de novo. */
const ESPERA_DA_COPIA_MS = 60 * 60 * 1000;

export function rotasDosDadosDoEscritorio(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const soSocios = (c: C) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios mudam isso.");
  };
  const semDemonstracao = (c: C, acao: string) => {
    if (c.get("demonstracao")) falha(403, "demonstracao", `Na demonstração não dá para ${acao}: ela é de todos.`);
  };

  /** Pede a cópia de tudo: planilhas CSV e os documentos. Sai em segundo plano; a lista abaixo diz quando está pronta. */
  app.post("/escritorio/exportacoes", async (c) => {
    soSocios(c);
    semDemonstracao(c, "levar os dados");
    const ja = await tenant(c, deps, async (tx) => (await tx.select({ id: exportacoes.id }).from(exportacoes).where(and(eq(exportacoes.situacao, "pedida"), gt(exportacoes.createdAt, new Date(Date.now() - ESPERA_DA_COPIA_MS))))).length);
    if (ja) falha(409, "ja_preparando", "A cópia dos dados já está sendo preparada. Avisamos quando estiver pronta.");
    const [linha] = await tenant(c, deps, (tx) => tx.insert(exportacoes).values({ organizationId: c.get("orgId"), pedidaPor: c.get("userId") }).returning({ id: exportacoes.id }));
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "exportacao.pedida", detalhes: { exportacaoId: linha!.id }, ip: ip(c) }, deps.log);
    try {
      await deps.enfileirar({ nome: "exportacao.pedida", organizationId: c.get("orgId"), exportacaoId: linha!.id });
    } catch (err) {
      await marcarExportacaoFalhou(deps.db, c.get("orgId"), linha!.id, err);
      falha(503, "fila_fora", "Não deu para começar agora. Tente de novo em instantes.");
    }
    return c.json({ id: linha!.id }, 202);
  });

  /** As cópias pedidas que ainda valem, da mais nova para a mais velha. */
  app.get("/escritorio/exportacoes", async (c) => {
    soSocios(c);
    return tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select({ e: exportacoes, pedidaPor: user.name })
        .from(exportacoes)
        .leftJoin(user, eq(user.id, exportacoes.pedidaPor))
        .where(or(isNull(exportacoes.expiraEm), gt(exportacoes.expiraEm, sql`now()`)))
        .orderBy(desc(exportacoes.createdAt))
        .limit(5);
      return c.json({
        itens: linhas.map(({ e, pedidaPor }) => ({
          id: e.id,
          situacao: e.situacao,
          pedidaEm: e.createdAt.toISOString(),
          prontaEm: e.prontaEm?.toISOString() ?? null,
          expiraEm: e.expiraEm?.toISOString() ?? null,
          pedidaPor,
          documentos: e.documentos,
          erro: e.erro,
          partes: e.partes.map((p) => ({ n: p.n, nome: p.nome, tamanho: p.tamanho })),
        })),
      });
    });
  });

  /** Baixa um dos ZIP da cópia. */
  app.get("/escritorio/exportacoes/:id/partes/:n", async (c) => {
    soSocios(c);
    const exportacaoId = id(c);
    const n = Number(c.req.param("n"));
    const e = await tenant(c, deps, async (tx) => (await tx.select().from(exportacoes).where(eq(exportacoes.id, exportacaoId)))[0]);
    if (!e) falha(404, "nao_encontrado");
    if (e.situacao !== "pronta") falha(409, "nao_pronta", "A cópia ainda não está pronta.");
    if (!e.expiraEm || e.expiraEm.getTime() <= Date.now()) falha(410, "expirada", "Esta cópia passou do prazo. Peça outra.");
    const parte = e.partes.find((p) => p.n === n);
    if (!parte) falha(404, "nao_encontrado");
    const bytes = await deps.arquivos.read(parte.chave).catch(() => null);
    if (!bytes) falha(410, "expirada", "Esta cópia não está mais disponível. Peça outra.");
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "exportacao.baixada", detalhes: { exportacaoId, parte: n }, ip: ip(c) }, deps.log);
    return new Response(bytes as Uint8Array<ArrayBuffer>, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(parte.nome)}`, "cache-control": "no-store" },
    });
  });

  /**
   * Encerra o escritório: fecha na hora e agenda o apagamento de tudo. A pessoa confirma
   * digitando o nome do escritório (a tela pede em dois passos; a API confere também).
   */
  app.post("/escritorio/encerrar", async (c) => {
    soSocios(c);
    semDemonstracao(c, "encerrar o escritório");
    const b = await corpo(c, z.object({ confirmacao: z.string().max(200) }));
    if (comoSeEscreve(b.confirmacao) !== comoSeEscreve(c.get("orgNome"))) falha(422, "confirmacao_errada", "Digite o nome do escritório, como está na tela, para encerrar.");
    const { apagarEm } = await encerrarEscritorio(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), ip: ip(c), log: deps.log });
    return c.json({ ok: true, apagarEm: apagarEm.toISOString() });
  });
}
