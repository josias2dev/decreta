/**
 * Escritório do cadastro aberto, ainda em avaliação: a conta nasce sem ninguém
 * conferir quem é, e o número de WhatsApp e o e-mail são os do Decreta. Sem teto,
 * dariam para mandar texto livre a qualquer telefone (o golpe do falso advogado)
 * e queimar o número. Por isso, até a equipe liberar, a saída para terceiros e a
 * IA têm tetos menores, por escritório e para todos os em avaliação juntos.
 *
 * Para liberar um escritório: `update organization set em_avaliacao = false where slug = '...'`.
 */
import { limitador } from "../limitador.ts";

const UM_DIA = 24 * 60 * 60_000;

/** Quantas saídas por dia. Na memória, como os outros limites: a API é um processo só. */
export function tetoDeSaida(teto: { porEscritorio: number; todos: number }, agora: () => number = Date.now) {
  const porEscritorio = limitador({ janelaMs: UM_DIA, maximo: teto.porEscritorio }, agora);
  const todos = limitador({ janelaMs: UM_DIA, maximo: teto.todos }, agora);
  return { permitir: (organizationId: string) => porEscritorio.permitir(organizationId) && todos.permitir("todos") };
}

export const WHATSAPP_EM_AVALIACAO = tetoDeSaida({ porEscritorio: 10, todos: 60 });
export const CONVITES_EM_AVALIACAO = tetoDeSaida({ porEscritorio: 5, todos: 30 });

export const AVISO_DO_WHATSAPP = "Escritório novo manda até 10 mensagens por dia pelo WhatsApp do Decreta. Fale com a equipe do Decreta para liberar.";
export const AVISO_DOS_CONVITES = "Escritório novo manda até 5 convites por dia. Fale com a equipe do Decreta para liberar.";
