/**
 * Mensagens do escritório para o cliente no WhatsApp. Toda mensagem sai com a
 * identidade do escritório no alto e o rodapé contra o golpe do falso
 * advogado embaixo; o corpo é escrito (ou aprovado) pelo advogado.
 */
import { formatarTelefone } from "./documentos.ts";

/** O rodapé padrão: o escritório nunca pede Pix, e o número oficial para conferir. */
export function rodapeAntigolpe(numeroOficial: string): string {
  return `Canal oficial do escritório: ${formatarTelefone(numeroOficial)}. Este escritório nunca pede Pix para liberar valores.`;
}

/** O texto que sai no WhatsApp: o nome do escritório em negrito, o corpo e o rodapé em itálico. */
export function mensagemParaWhatsapp(m: { escritorio: string; corpo: string; numeroOficial: string }): string {
  return `*${m.escritorio.trim()}*\n\n${m.corpo.trim()}\n\n_${rodapeAntigolpe(m.numeroOficial)}_`;
}
