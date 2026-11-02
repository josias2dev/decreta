/**
 * Processo salvo sem o número: a tela marca que está incompleto e que não está
 * sendo monitorado, porque o DataJud e o casamento das publicações do DJEN
 * dependem do número. Caso extrajudicial não tem número mesmo, e processo com
 * número fica completo sozinho com o que vem do tribunal.
 */
export interface DadosParaConferir {
  tipo: "judicial" | "extrajudicial";
  cnj: string | null;
  temCliente: boolean;
  orgao: string | null;
}

export interface ProcessoIncompleto {
  /** "o número", "o cliente", "a vara": para a frase "Falta o número e o cliente". */
  faltam: string[];
  monitorado: boolean;
}

export function incompletoDoProcesso(p: DadosParaConferir): ProcessoIncompleto | null {
  if (p.tipo !== "judicial" || p.cnj) return null;
  return { faltam: ["o número", ...(p.temCliente ? [] : ["o cliente"]), ...(p.orgao ? [] : ["a vara"])], monitorado: false };
}
