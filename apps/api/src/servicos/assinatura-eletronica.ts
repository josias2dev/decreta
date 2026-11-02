/**
 * Assinatura eletrônica pela ZapSign do próprio escritório: o contrato de honorários, a procuração e o
 * termo de IA saem da pasta do cliente para assinatura e o arquivo assinado volta para a mesma pasta.
 * Sem chave da ZapSign (ou com o interruptor desligado), o fluxo de baixar e anexar o documento
 * assinado continua como sempre.
 */
import { assinaturas, cobrancaConfig, documentos, withTenant, type Database } from "@decreta/db";
import { chaveDoDocumento, MIME_DOCX, type Armazenamento } from "@decreta/documentos";
import { desc, eq } from "drizzle-orm";
import type { Cofre } from "../cofre.ts";
import { falha } from "../rotas/base.ts";
import { baixarArquivoAssinado, consultarDocumento, criarDocumentoParaAssinar, ZapSignErro, type ContaZapSign } from "./zapsign.ts";

export type Assinatura = typeof assinaturas.$inferSelect;

export interface DepsDaAssinatura {
  db: Database;
  arquivos: Armazenamento;
  cofre?: Cofre;
  fetch?: typeof fetch;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

/** A conta da ZapSign do escritório, com a chave aberta só aqui. `null`: sem chave, ou o interruptor está desligado. */
export async function contaZapSign(deps: Pick<DepsDaAssinatura, "db" | "cofre" | "fetch">, organizationId: string): Promise<ContaZapSign | null> {
  const [c] = await withTenant(deps.db, organizationId, (tx) => tx.select().from(cobrancaConfig).where(eq(cobrancaConfig.organizationId, organizationId)));
  if (!c?.zapsignChave || !c.zapsignLigada) return null;
  if (!deps.cofre) return falha(503, "cofre_desligado", "O cofre das chaves não está ligado neste servidor. Fale com o suporte do Decreta.");
  try {
    return { chave: deps.cofre.decifrar(c.zapsignChave, organizationId), ambiente: c.zapsignAmbiente, fetch: deps.fetch };
  } catch {
    return falha(409, "chave_ilegivel", "A chave da ZapSign guardada não abre mais. Informe a chave de novo nas Configurações.");
  }
}

export interface PedidoDeEnvio {
  documentoId: string;
  signatarios: { nome: string; email?: string; telefone?: string }[];
}

const falhaDaZapSign = (err: unknown): never => {
  if (err instanceof ZapSignErro) return falha(err.status === 0 ? 504 : 422, "zapsign_recusou", err.message);
  throw err;
};

/** Manda o documento da pasta do cliente para assinar. Só PDF e DOCX. */
export async function enviarParaAssinatura(deps: DepsDaAssinatura, organizationId: string, userId: string, p: PedidoDeEnvio): Promise<Assinatura> {
  const doc = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(documentos).where(eq(documentos.id, p.documentoId)))[0]);
  if (!doc) falha(404, "nao_encontrado");
  const conta = await contaZapSign(deps, organizationId);
  if (!conta) falha(409, "sem_zapsign", "A assinatura eletrônica não está ligada. Informe a chave da ZapSign nas Configurações, ou baixe o documento e anexe o assinado à pasta.");
  const tipo = doc.mime === "application/pdf" ? "pdf" : doc.mime === MIME_DOCX ? "docx" : null;
  if (!tipo) falha(422, "formato_nao_aceito", "Só PDF e DOCX vão para assinatura.");
  const bytes = await deps.arquivos.read(doc.chave).catch(() => null);
  if (!bytes) falha(404, "arquivo_sumiu", "O arquivo deste documento não está mais guardado.");

  let enviado;
  try {
    enviado = await criarDocumentoParaAssinar(conta, { nome: doc.nome.replace(/\.[a-z0-9]+$/i, ""), arquivo: { tipo, bytes }, referencia: doc.id, signatarios: p.signatarios });
  } catch (err) {
    return falhaDaZapSign(err);
  }
  const [a] = await withTenant(deps.db, organizationId, (tx) =>
    tx
      .insert(assinaturas)
      .values({ organizationId, documentoId: doc.id, clienteId: doc.clienteId, token: enviado.token, signatarios: enviado.signatarios, enviadaPor: userId })
      .returning(),
  );
  return a!;
}

export async function assinaturasDoDocumento(db: Database, organizationId: string, documentoId: string): Promise<Assinatura[]> {
  return withTenant(db, organizationId, (tx) => tx.select().from(assinaturas).where(eq(assinaturas.documentoId, documentoId)).orderBy(desc(assinaturas.enviadaEm)));
}

/**
 * Pergunta à ZapSign como está a assinatura. Assinada por todos, o arquivo assinado é baixado e fica na mesma pasta do
 * documento original (uma vez só: perguntar de novo não guarda de novo).
 */
export async function atualizarAssinatura(deps: DepsDaAssinatura, organizationId: string, assinaturaId: string): Promise<{ assinatura: Assinatura; concluidaAgora: boolean }> {
  const a = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(assinaturas).where(eq(assinaturas.id, assinaturaId)))[0]);
  if (!a) falha(404, "nao_encontrado");
  if (a.situacao === "assinada" && a.documentoAssinadoId) return { assinatura: a, concluidaAgora: false };
  const conta = await contaZapSign(deps, organizationId);
  if (!conta) falha(409, "sem_zapsign", "A assinatura eletrônica não está ligada neste escritório.");
  let atual;
  try {
    atual = await consultarDocumento(conta, a.token);
  } catch (err) {
    return falhaDaZapSign(err);
  }
  const signatarios = a.signatarios.map((s) => ({ ...s, situacao: atual.signatarios.find((x) => x.nome === s.nome)?.situacao ?? s.situacao }));
  if (atual.situacao !== "signed") {
    const [r] = await withTenant(deps.db, organizationId, (tx) => tx.update(assinaturas).set({ signatarios }).where(eq(assinaturas.id, assinaturaId)).returning());
    return { assinatura: r!, concluidaAgora: false };
  }
  let guardado: { id: string } | null = null;
  if (atual.arquivoAssinado) {
    try {
      const bytes = await baixarArquivoAssinado(atual.arquivoAssinado, deps.fetch);
      const original = await withTenant(deps.db, organizationId, async (tx) => (await tx.select().from(documentos).where(eq(documentos.id, a.documentoId)))[0]);
      if (original) {
        const id = crypto.randomUUID();
        const chave = chaveDoDocumento(organizationId, id);
        await deps.arquivos.put(chave, bytes, "application/pdf");
        await withTenant(deps.db, organizationId, (tx) =>
          tx.insert(documentos).values({ id, organizationId, processoId: original.processoId, clienteId: original.clienteId, negocioId: original.negocioId, nome: `${original.nome.replace(/\.[a-z0-9]+$/i, "")} (assinado).pdf`, mime: "application/pdf", tamanho: bytes.length, chave, origem: "upload", enviadoPor: a.enviadaPor }),
        );
        guardado = { id };
      }
    } catch (err) {
      // A assinatura saiu, mas o arquivo não baixou agora: fica "assinada" sem a cópia, e a próxima consulta tenta de novo.
      deps.log("arquivo assinado não baixou", { organizationId, assinaturaId, error: err instanceof Error ? err.message : String(err) });
    }
  }
  const [r] = await withTenant(deps.db, organizationId, (tx) =>
    tx
      .update(assinaturas)
      .set({ situacao: "assinada", assinadaEm: a.assinadaEm ?? new Date(), signatarios, ...(guardado ? { documentoAssinadoId: guardado.id } : {}) })
      .where(eq(assinaturas.id, assinaturaId))
      .returning(),
  );
  return { assinatura: r!, concluidaAgora: a.situacao !== "assinada" };
}
