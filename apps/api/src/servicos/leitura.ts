/**
 * Leitura de foto e PDF escaneado pela IA. O envio guarda o arquivo na hora e
 * marca a leitura como pendente; a rotina de fundo transcreve e grava o texto,
 * que passa a servir para o resumo, o briefing, a conferência e a busca.
 */
import { documentos, withTenant, type Database } from "@decreta/db";
import { TETO_DO_TEXTO, type Armazenamento } from "@decreta/documentos";
import { MIMES_PARA_LER, transcreverDocumento, type Ia } from "@decreta/ia";
import { eq } from "drizzle-orm";

/** Acima disso o gateway recusa o pedido: melhor dizer logo que não deu. */
export const TETO_PARA_LER = 15 * 1024 * 1024;

/** O documento precisa da IA para ter texto? Foto sempre; PDF só quando veio sem camada de texto. */
export function precisaDeLeitura(mime: string, texto: string | null): boolean {
  if (!MIMES_PARA_LER.has(mime)) return false;
  return mime !== "application/pdf" || !texto?.trim();
}

interface Deps {
  db: Database;
  ia: Ia | null;
  arquivos: Armazenamento;
  log?: (msg: string, extra?: Record<string, unknown>) => void;
}

/** Transcreve e grava. Devolve a leitura como ficou. */
export async function lerDocumentoComIa(deps: Deps, organizationId: string, documentoId: string): Promise<"pronta" | "falhou" | "dispensada"> {
  const [d] = await withTenant(deps.db, organizationId, (tx) => tx.select().from(documentos).where(eq(documentos.id, documentoId)));
  if (!d || !deps.ia || !precisaDeLeitura(d.mime, d.texto)) {
    if (d?.leitura === "pendente") await withTenant(deps.db, organizationId, (tx) => tx.update(documentos).set({ leitura: null }).where(eq(documentos.id, documentoId)));
    return "dispensada";
  }
  const gravar = (valores: Partial<typeof documentos.$inferInsert>) => withTenant(deps.db, organizationId, (tx) => tx.update(documentos).set(valores).where(eq(documentos.id, documentoId)));
  if (d.tamanho > TETO_PARA_LER) {
    await gravar({ leitura: "falhou" });
    return "falhou";
  }
  try {
    const bytes = await deps.arquivos.read(d.chave);
    const texto = await transcreverDocumento(deps.ia, { bytes, mime: d.mime, nome: d.nome });
    // Texto vazio é leitura feita: a imagem não tem texto (uma foto do local, uma assinatura solta).
    await gravar({ texto: texto.slice(0, TETO_DO_TEXTO), leitura: "pronta" });
    return "pronta";
  } catch (err) {
    deps.log?.("leitura do documento falhou", { documentoId, error: err instanceof Error ? err.message : String(err) });
    await gravar({ leitura: "falhou" });
    return "falhou";
  }
}
