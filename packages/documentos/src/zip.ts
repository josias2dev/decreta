/**
 * ZIP da exportação dos dados do escritório. Usa o JSZip, que já vem aqui para
 * abrir DOCX: nenhuma dependência a mais.
 */
import JSZip from "jszip";

export interface ArquivoParaZip {
  /** O caminho dentro do ZIP ("planilhas/clientes.csv"), sempre com "/" e sem sair da pasta. */
  nome: string;
  conteudo: string | Uint8Array;
  /** `false` guarda sem comprimir: PDF, DOCX e imagem já vêm comprimidos. */
  comprimir?: boolean;
}

/** Caminho que, ao extrair, ficaria dentro da pasta escolhida: sem "..", sem "/" no começo e sem "\". */
const NOME_SEGURO = /^(?!\/)(?!.*\\)(?!(?:.*\/)?\.\.(?:\/|$)).+$/;

export async function compactarEmZip(arquivos: ArquivoParaZip[]): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const a of arquivos) {
    if (!NOME_SEGURO.test(a.nome)) throw new Error(`nome de arquivo fora do ZIP: "${a.nome}"`);
    zip.file(a.nome, a.conteudo, { compression: a.comprimir === false ? "STORE" : "DEFLATE", createFolders: false });
  }
  return zip.generateAsync({ type: "uint8array" });
}
