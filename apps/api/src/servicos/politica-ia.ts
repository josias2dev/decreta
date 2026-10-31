/**
 * Modelo de política interna de uso de IA do escritório (Recomendação CFOAB
 * 001/2024, item 3.6). O texto diz só o que o Decreta faz de verdade; o que é
 * decisão do escritório fica marcado para completar.
 */
export interface PedidoDaPolitica {
  escritorio: string;
  responsavel: { nome: string; oab: string | null };
  /** Endereço da página de segurança do Decreta, com a lista dos fornecedores. */
  seguranca: string;
}

export const TITULO_DA_POLITICA = "Política interna de uso de inteligência artificial";

export function textoDaPolitica({ escritorio, responsavel, seguranca }: PedidoDaPolitica): string {
  const quemAssina = `${responsavel.nome}${responsavel.oab ? `, ${responsavel.oab}` : ""}`;
  return [
    `# ${TITULO_DA_POLITICA}`,
    `**Escritório:** ${escritorio}. **Responsável pela política:** ${quemAssina}.`,
    "Esta política segue a Recomendação nº 001/2024 do Conselho Federal da OAB, que orienta os escritórios a definir por escrito como a equipe usa inteligência artificial (IA). É um modelo: ajuste os trechos marcados antes de adotar.",
    "## 1. Objetivo e alcance",
    "Esta política vale para sócios, advogados, estagiários e equipe de apoio, em todo trabalho feito com ferramentas de IA, dentro ou fora do Decreta.",
    "## 2. Ferramentas autorizadas",
    "- Decreta: leitura das publicações e sugestão de prazos, resumo dos autos, organização dos atendimentos, leitura de documentos digitalizados, conferência da pasta, minutas de peças e o Perguntar.",
    "- [COMPLETAR: outras ferramentas de IA autorizadas pelo escritório, ou “nenhuma”]",
    "Dado de cliente não entra em ferramenta de IA fora desta lista.",
    "## 3. Antes de usar IA num caso",
    "- O cliente recebe o termo de uso de IA e assina a autorização. O Decreta gera o termo no timbre e cobra o assinado na conferência da pasta.",
    "- Se o cliente recusar, ele é marcado como “cliente sem IA” no Decreta, e a equipe faz todas as etapas dos casos dele sem IA.",
    "## 4. Revisão humana",
    "- Nada do que a IA produz vai ao processo, ao cliente ou a terceiros sem revisão integral por um advogado do escritório.",
    "- Todo prazo sugerido pela IA é conferido com a publicação e confirmado por uma pessoa da equipe.",
    "- Toda citação de lei, súmula, jurisprudência ou doutrina é conferida na fonte oficial antes de protocolar.",
    "- A peça só é protocolada depois de marcada como revisada no Decreta, que registra quem revisou, quando e a versão que a IA gerou.",
    "## 5. Sigilo e proteção de dados",
    "- Os dados dos casos ficam no sistema do escritório, com acesso só da equipe.",
    `- No Decreta, os textos vão aos fornecedores de IA só para gerar a resposta: nenhum deles usa o conteúdo para treinar modelos, e nenhum guarda o pedido por mais de 30 dias. A lista dos fornecedores está em ${seguranca}.`,
    "- O tratamento dos dados segue a Lei Geral de Proteção de Dados (Lei nº 13.709/2018) e o sigilo profissional do advogado (Lei nº 8.906/1994, art. 7º, II).",
    "- O acesso é pessoal e não se empresta. [COMPLETAR: regras de senha e de acesso fora do escritório]",
    "## 6. Documentos da parte contrária",
    "Documentos recebidos podem trazer instruções escondidas dirigidas à IA. O Decreta procura essas instruções e avisa; o documento é sempre tratado como prova a analisar, nunca como orientação.",
    "## 7. Responsabilidade",
    "O advogado responsável pelo caso responde pelo trabalho, com ou sem IA. A IA não assina, não decide e não fala em nome do escritório com o juízo, com o cliente nem com ninguém.",
    "## 8. Incidentes",
    "Erro relevante da IA, vazamento de dados ou suspeita de uso indevido é comunicado no mesmo dia a [COMPLETAR: responsável], com o registro do que aconteceu.",
    "## 9. Treinamento e revisão",
    "A equipe recebe orientação sobre esta política ao entrar no escritório. A política é revista [COMPLETAR: periodicidade, por exemplo a cada seis meses] e sempre que mudar a regulação da OAB.",
    "[cidade], [data].",
    "______________________________",
    quemAssina,
  ].join("\n\n");
}
