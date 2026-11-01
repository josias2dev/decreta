/**
 * Níveis de automação: o que a IA faz sozinha, o que ela deixa como sugestão
 * e o que sempre exige alguém confirmar. Prazo, mensagem ao cliente e valores
 * ficam travados em exigir confirmação: um erro neles custa caro e é do
 * advogado a decisão.
 */
export type NivelDeAutomacao = "automatico" | "sugestao" | "confirmar";

export const ROTULO_DO_NIVEL: Record<NivelDeAutomacao, string> = {
  automatico: "Entra sozinho",
  sugestao: "Vira sugestão",
  confirmar: "Exige confirmação",
};

export type AcaoAutomatizavel = "rascunho-da-peca" | "leitura-da-sentenca" | "prazo" | "mensagem-ao-cliente" | "valores";

export interface RegraDeAutomacao {
  id: AcaoAutomatizavel;
  nome: string;
  /** O que cada nível quer dizer nesta ação. */
  niveis: Partial<Record<NivelDeAutomacao, string>>;
  padrao: NivelDeAutomacao;
  travada: boolean;
}

export const REGRAS_DE_AUTOMACAO: RegraDeAutomacao[] = [
  {
    id: "rascunho-da-peca",
    nome: "Rascunho da peça do prazo",
    niveis: {
      automatico: "Confirmado o prazo, a IA já deixa a peça sugerida em rascunho. Nada é enviado nem protocolado.",
      sugestao: "A tela do prazo sugere a peça; a IA só escreve quando alguém pedir.",
    },
    padrao: "automatico",
    travada: false,
  },
  {
    id: "leitura-da-sentenca",
    nome: "Leitura da sentença ou do acórdão",
    niveis: {
      automatico: "A IA lê a decisão assim que a publicação chega.",
      sugestao: "A publicação mostra Ler a decisão; a IA só lê quando alguém pedir.",
    },
    padrao: "automatico",
    travada: false,
  },
  {
    id: "prazo",
    nome: "Prazo sugerido pela IA",
    niveis: { confirmar: "O prazo que a IA conta só vale depois que alguém confere e confirma." },
    padrao: "confirmar",
    travada: true,
  },
  {
    id: "mensagem-ao-cliente",
    nome: "Mensagem ao cliente",
    niveis: { confirmar: "Nenhuma mensagem sai sem o advogado aprovar o texto." },
    padrao: "confirmar",
    travada: true,
  },
  {
    id: "valores",
    nome: "Valores e cálculos",
    niveis: { confirmar: "Valor que a IA calcula ou lê só vale depois que alguém confere." },
    padrao: "confirmar",
    travada: true,
  },
];

const POR_ID = new Map(REGRAS_DE_AUTOMACAO.map((r) => [r.id, r]));

/** O nível que vale para a ação: o escolhido pelo escritório, se a ação aceita; senão, o padrão. Travada é sempre "confirmar". */
export function nivelDaAcao(config: Partial<Record<string, string>>, acao: AcaoAutomatizavel): NivelDeAutomacao {
  const regra = POR_ID.get(acao)!;
  if (regra.travada) return "confirmar";
  const escolhido = config[acao] as NivelDeAutomacao | undefined;
  return escolhido && Object.hasOwn(regra.niveis, escolhido) ? escolhido : regra.padrao;
}

/** A configuração que chega da tela: só ações conhecidas, destravadas, com um nível que elas aceitam. */
export function automacaoValida(config: Record<string, string>): boolean {
  return Object.entries(config).every(([id, nivel]) => {
    const regra = POR_ID.get(id as AcaoAutomatizavel);
    return !!regra && !regra.travada && Object.hasOwn(regra.niveis, nivel);
  });
}
