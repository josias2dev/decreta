/**
 * Mensagens do escritório para o cliente no WhatsApp. Toda mensagem sai com a
 * identidade do escritório no alto e o rodapé contra o golpe do falso
 * advogado embaixo; o corpo é escrito (ou aprovado) pelo advogado.
 */
import { formatarDia } from "./datas.ts";
import { formatarTelefone } from "./documentos.ts";

/** Cada item da conferência da pasta como o cliente entende. A litispendência não é documento: fica de fora. */
const DOCUMENTO_PARA_O_CLIENTE: Record<string, string> = {
  procuracao: "Procuração assinada",
  comprovante_residencia: "Comprovante de residência dos últimos 90 dias",
  documento_identidade: "Documento com foto (RG ou CNH)",
  cpf: "CPF",
  hipossuficiencia: "Declaração de hipossuficiência assinada",
  contrato_honorarios: "Contrato de honorários assinado",
  termo_ia: "Termo de uso de inteligência artificial assinado",
};

/** Os documentos que a conferência da pasta deu como faltando, em palavras do cliente. */
export function documentosQueFaltam(itens: readonly { item: string; situacao: string }[]): string[] {
  return [...new Set(itens.filter((i) => i.situacao === "falta" && DOCUMENTO_PARA_O_CLIENTE[i.item]).map((i) => DOCUMENTO_PARA_O_CLIENTE[i.item]!))];
}

/** O pedido dos documentos que faltam, para o advogado revisar. O link entra só no envio. */
export function corpoDaCobranca(nome: string, documentos: readonly string[]): string {
  const primeiro = nome.trim().split(/\s+/)[0] ?? nome;
  return `Olá, ${primeiro}. Para seguir com o seu caso, precisamos destes documentos:\n${documentos.map((d) => `• ${d}`).join("\n")}`;
}

/** O link de envio sem login, com a validade, no fim do corpo. */
export function comLinkDeEnvio(corpo: string, link: string, validoAte: string): string {
  return `${corpo.trim()}\n\nMande uma foto de cada documento por este link, sem precisar de senha:\n${link}\nO link vale até ${formatarDia(validoAte)}.`;
}

/** A resposta que o sistema dá sozinho ao cliente se identifica como máquina (Recomendação CFOAB 001/2024, item 2.4). */
export const RESPOSTA_AUTOMATICA = "Recebemos o arquivo. Esta é uma resposta automática do sistema do escritório: uma pessoa da equipe ainda vai conferir o documento.";

/** O rodapé padrão: o escritório nunca pede Pix, e o número oficial para conferir. */
export function rodapeAntigolpe(numeroOficial: string): string {
  return `Canal oficial do escritório: ${formatarTelefone(numeroOficial)}. Este escritório nunca pede Pix para liberar valores.`;
}

/** O texto que sai no WhatsApp: o nome do escritório em negrito, o corpo e o rodapé em itálico. */
export function mensagemParaWhatsapp(m: { escritorio: string; corpo: string; numeroOficial: string }): string {
  return `*${m.escritorio.trim()}*\n\n${m.corpo.trim()}\n\n_${rodapeAntigolpe(m.numeroOficial)}_`;
}
