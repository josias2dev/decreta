/** O DOCX no timbre do escritório: o da peça, o do termo de uso de IA e o da política de IA. */
import { documentos, escritorios, type Tx } from "@decreta/db";
import { gerarDocx, type Armazenamento } from "@decreta/documentos";
import { eq } from "drizzle-orm";

export type TimbreGuardado = NonNullable<typeof escritorios.$inferSelect.timbre>;

/** O timbre do escritório (ou só o nome, sem timbre cadastrado) e onde está o logo. */
export async function timbreDoEscritorio(tx: Tx, organizationId: string, nomeDoEscritorio: string): Promise<{ timbre: TimbreGuardado; logo: string | null }> {
  const [esc] = await tx.select().from(escritorios).where(eq(escritorios.organizationId, organizationId));
  const timbre = esc?.timbre ?? { nome: nomeDoEscritorio };
  const [doc] = timbre.logoDocumentoId ? await tx.select({ chave: documentos.chave }).from(documentos).where(eq(documentos.id, timbre.logoDocumentoId)) : [];
  return { timbre, logo: doc?.chave ?? null };
}

/** Fora da transação: o logo vem do armazenamento. */
export async function docxNoTimbre(arquivos: Armazenamento, t: { timbre: TimbreGuardado; logo: string | null }, doc: { titulo: string; texto: string }): Promise<Uint8Array> {
  const bytesDoLogo = t.logo ? await arquivos.read(t.logo).catch(() => null) : null;
  return gerarDocx({
    titulo: doc.titulo,
    texto: doc.texto,
    timbre: {
      nome: t.timbre.nome,
      registro: t.timbre.registro,
      endereco: t.timbre.endereco,
      contato: t.timbre.contato,
      fonte: t.timbre.fonte,
      tamanho: t.timbre.tamanho,
      cor: t.timbre.cor,
      logo: bytesDoLogo ? { bytes: bytesDoLogo, ...tamanhoDoPng(bytesDoLogo) } : undefined,
    },
  });
}

/** Largura e altura de um PNG, do cabeçalho IHDR. */
export function tamanhoDoPng(bytes: Uint8Array): { largura: number; altura: number } {
  if (bytes.length < 24 || bytes[0] !== 0x89 || bytes[1] !== 0x50) return { largura: 3, altura: 1 };
  const v = new DataView(bytes.buffer, bytes.byteOffset);
  return { largura: v.getUint32(16) || 3, altura: v.getUint32(20) || 1 };
}
