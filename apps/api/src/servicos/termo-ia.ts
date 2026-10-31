/**
 * Termo de uso de IA para o cliente (Recomendação CFOAB 001/2024): o escritório
 * informa por escrito, antes de usar IA, o propósito, os benefícios e os
 * limites, os riscos, as medidas de segurança e a revisão humana (item 4.2.1),
 * e o cliente autoriza ou recusa por assinatura (item 4.3.1). O texto diz só o
 * que o Decreta faz de verdade.
 */
import { formatarDocumento } from "@decreta/core";

export interface PedidoDoTermo {
  escritorio: string;
  cliente: { nome: string; tipo: "pf" | "pj"; documento: string | null };
  advogado: { nome: string; oab: string | null };
  /** Endereço da página de segurança do Decreta, com a lista dos fornecedores. */
  seguranca: string;
}

export const TITULO_DO_TERMO = "Termo de uso de inteligência artificial";

export function textoDoTermo({ escritorio, cliente, advogado, seguranca }: PedidoDoTermo): string {
  const doc = cliente.documento ? `, ${cliente.tipo === "pj" ? "CNPJ" : "CPF"} ${formatarDocumento(cliente.documento)}` : "";
  const quemAssina = `${advogado.nome}${advogado.oab ? `, ${advogado.oab}` : ""}`;
  return [
    `# ${TITULO_DO_TERMO}`,
    `**Cliente:** ${cliente.nome}${doc}.`,
    `**Escritório:** ${escritorio}. **Advogado responsável:** ${quemAssina}.`,
    "Este termo segue a Recomendação nº 001/2024 do Conselho Federal da OAB, que orienta a advocacia a informar o cliente por escrito, antes de usar inteligência artificial (IA), e a pedir o consentimento dele.",
    "## 1. Para que usamos a IA",
    "O escritório usa o Decreta, um sistema de gestão de processos com recursos de IA, em tarefas de apoio: ler as publicações e sugerir os prazos, resumir os autos, organizar as anotações dos atendimentos, ler documentos digitalizados, conferir a documentação e preparar minutas de peças. A IA não decide nada sozinha e não fala em seu nome com o juízo nem com ninguém.",
    "## 2. Benefícios e limites",
    "A IA ajuda a equipe a ler mais rápido, a acompanhar os prazos e a dedicar mais tempo à estratégia do seu caso. Ela também erra: pode entender mal um texto, deixar passar um detalhe ou sugerir algo que não se aplica ao caso. Por isso, nada do que ela produz é usado sem revisão.",
    "## 3. Riscos",
    "Os riscos principais são dois: o erro de conteúdo, quando a IA traz uma informação imprecisa ou incompleta, e a exposição de dados, porque o texto do caso é enviado a um fornecedor de tecnologia para ser processado. As medidas abaixo existem para reduzir esses riscos.",
    "## 4. Medidas de segurança",
    "- Os dados do seu caso ficam no sistema do escritório, com acesso só da equipe.",
    `- Os textos vão aos fornecedores de IA só para gerar a resposta: nenhum deles usa o conteúdo para treinar modelos, e nenhum guarda o pedido por mais de 30 dias. A lista dos fornecedores está em ${seguranca}.`,
    "- Os documentos recebidos da parte contrária são conferidos à procura de instruções escondidas para IA, e a IA os lê como informação, nunca como ordem.",
    "- O tratamento dos dados segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e o sigilo profissional do advogado (Lei nº 8.906/1994, art. 7º, II).",
    "## 5. Revisão humana",
    "Toda sugestão de prazo é conferida e confirmada por uma pessoa da equipe, e toda peça feita com apoio da IA é revisada por inteiro pelo advogado responsável antes de ser protocolada. O advogado responde pelo trabalho, com ou sem IA.",
    "## 6. Sua escolha",
    "Você pode autorizar ou recusar o uso de IA no seu caso. Se recusar, o escritório faz todas as etapas sem IA, sem prejuízo do atendimento. Você pode mudar de ideia a qualquer momento, avisando o escritório. Este termo fica arquivado na sua pasta até o fim do serviço.",
    "( ) Autorizo o uso de inteligência artificial nas tarefas descritas acima.",
    "( ) Não autorizo o uso de inteligência artificial no meu caso.",
    "[cidade], [data].",
    "______________________________",
    cliente.nome,
    "______________________________",
    quemAssina,
  ].join("\n\n");
}
