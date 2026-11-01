/**
 * O modo Jurisprudência do Perguntar com fonte: a IA procura no acervo do
 * Decreta (temas e súmulas guardados) e cita apontando a chave de um documento
 * que o servidor recuperou. Ela não escreve número de súmula, tema, processo,
 * relator nem data: quem monta a citação é o servidor, a partir do banco, e
 * cada citação ganha um selo antes de aparecer.
 */
import { z } from "zod";

export const filtroDeJurisprudencia = z.object({
  busca: z.string().trim().min(3).max(200).describe('Termos jurídicos da tese, de 2 a 6 palavras: "plano de saúde negativa de cobertura dano moral".'),
  tribunal: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{2,6}$/, 'use a sigla em maiúsculas: "STJ", "STF", "TST", "TJSC"')
    .optional()
    .describe("Só deste tribunal. Sem ele, todos."),
  limite: z.number().int().min(1).max(20).optional().describe("Quantos documentos no máximo. Padrão 8."),
});
export type FiltroDeJurisprudencia = z.infer<typeof filtroDeJurisprudencia>;

/** A fonte oficial de onde o documento foi copiado, e quando. */
export interface FonteDoAcervo {
  nome: string;
  url: string;
  capturadoEm: string;
}

/** O mesmo selo do "Verificar peça": fora do acervo é "não verificada" ("confira antes de usar"), nunca "inexistente". */
export type SeloNaIa = "verificada" | "com_ressalva" | "nao_verificada";

/** Uma citação conferida no acervo: o que a IA apontou (chave e trecho) e o que o banco diz. */
export interface CitacaoNoAcervo {
  chave: string;
  rotulo: string;
  /** O trecho como a IA copiou. */
  trecho: string;
  /** O trecho está no texto guardado (depois de igualar espaços, aspas e maiúsculas)? Nulo fora do acervo. */
  literal: boolean | null;
  selo: SeloNaIa;
  motivo: string;
  /** O texto guardado, para a pessoa comparar. */
  texto: string | null;
  fonte: FonteDoAcervo | null;
}

/** Um tema ou súmula do acervo, como a IA e a tela veem. */
export interface DocumentoDoAcervoNaIa {
  /** O que a IA usa para citar: "tema:STJ:952". */
  chave: string;
  /** Montado pelo servidor: "Tema 952 do STJ". */
  rotulo: string;
  situacao: string;
  cancelado: boolean;
  /** A tese ou o enunciado, como está guardado. */
  texto: string | null;
  questao: string | null;
  fonte: FonteDoAcervo;
}
