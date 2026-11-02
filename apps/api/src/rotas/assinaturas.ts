/**
 * Assinatura eletrônica pela ZapSign do escritório: o contrato de honorários, a procuração e o termo de IA
 * da pasta do cliente saem para assinar, e o arquivo assinado volta para a mesma pasta. Atrás do interruptor
 * do escritório; sem chave, baixar e anexar o documento assinado segue como sempre.
 */
import { z } from "zod";
import type { Hono } from "hono";
import { registrar } from "../auditoria.ts";
import { assinaturasDoDocumento, atualizarAssinatura, enviarParaAssinatura, type Assinatura } from "../servicos/assinatura.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { corpo, ehSocio, falha, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const noTela = (a: Assinatura) => ({
  id: a.id,
  documentoId: a.documentoId,
  situacao: a.situacao,
  signatarios: a.signatarios,
  enviadaEm: a.enviadaEm.toISOString(),
  assinadaEm: a.assinadaEm?.toISOString() ?? null,
  documentoAssinadoId: a.documentoAssinadoId,
});

export function rotasDasAssinaturas(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const dep = () => ({ db, arquivos: deps.arquivos, cofre: deps.cofre, fetch: deps.fetchDosProvedores, log: deps.log });
  const auditar = (c: C, acao: string, detalhes: Record<string, unknown>) => registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes, ip: ip(c) }, deps.log);

  /** Mandar um documento para assinar é falar em nome do escritório: só sócio ou advogado com OAB cadastrada. */
  async function exigirAdvogado(c: C) {
    if (ehSocio(c.get("papel"))) return;
    const eu = await tenant(c, deps, async (tx) => (await pessoasDoEscritorio(db, tx, c.get("orgId"))).get(c.get("userId")));
    if (!eu?.oab) falha(403, "sem_oab", "Só sócio ou advogado com OAB cadastrada no perfil manda documento para assinatura.");
  }

  app.post("/documentos/:id/assinatura", async (c) => {
    await exigirAdvogado(c);
    if (c.get("demonstracao")) falha(403, "demonstracao", "Na demonstração nada sai para assinatura: os clientes e os e-mails são inventados.");
    const documentoId = id(c);
    const b = await corpo(
      c,
      z.object({
        signatarios: z
          .array(z.object({ nome: z.string().trim().min(2).max(200), email: z.string().trim().toLowerCase().email().max(200).optional(), telefone: z.string().trim().regex(/^\d{10,11}$/, "Telefone com DDD, só números.").optional() }).refine((s) => !!s.email || !!s.telefone, "Cada pessoa precisa de e-mail ou celular."))
          .min(1)
          .max(6),
      }),
    );
    const a = await enviarParaAssinatura(dep(), c.get("orgId"), c.get("userId"), { documentoId, signatarios: b.signatarios });
    await auditar(c, "assinatura.enviada", { documentoId, assinaturaId: a.id, signatarios: b.signatarios.length });
    return c.json(noTela(a), 201);
  });

  app.get("/documentos/:id/assinaturas", async (c) => c.json({ itens: (await assinaturasDoDocumento(db, c.get("orgId"), id(c))).map(noTela) }));

  /** Pergunta à ZapSign como está. Assinada por todos, o arquivo assinado entra na pasta do cliente. */
  app.post("/assinaturas/:id/atualizar", async (c) => {
    await exigirAdvogado(c);
    const a = await atualizarAssinatura(dep(), c.get("orgId"), id(c));
    if (a.situacao === "assinada") await auditar(c, "assinatura.concluida", { assinaturaId: a.id, documentoAssinadoId: a.documentoAssinadoId });
    return c.json(noTela(a));
  });
}
