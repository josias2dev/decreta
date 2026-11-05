/**
 * Registro do escritório: quem fez o quê. Os sócios veem na tela da Equipe.
 * Gravar nunca derruba a ação: a falha vai para o log e a ação segue.
 */
import { auditoria, withTenant, type Database } from "@decreta/db";
import { desc } from "drizzle-orm";

export interface Registro {
  organizationId: string;
  userId?: string | null;
  nome?: string | null;
  acao: string;
  detalhes?: Record<string, unknown>;
  ip?: string | null;
}

export const ROTULO: Record<string, string> = {
  "escritorio.criado": "Criou o escritório no Decreta",
  login: "Entrou no Decreta",
  "senha.trocada": "Trocou a senha",
  "2fa.ligada": "Ligou a verificação em duas etapas",
  "2fa.desligada": "Desligou a verificação em duas etapas",
  "convite.enviado": "Convidou para a equipe",
  "convite.aceito": "Aceitou o convite",
  "membro.removido": "Tirou alguém da equipe",
  "membro.papel": "Mudou o papel de alguém",
  "plano.cancelamento_pendente": "A assinatura não saiu do Asaas ao encerrar: o sistema tenta de novo",
  "cobranca.pagamento_sem_parcela": "O Asaas avisou de um pagamento que a parcela não aceitou",
  "prazo.confirmado": "Confirmou um prazo",
  "prazo.criado": "Criou um prazo",
  "prazo.ajustado": "Ajustou um prazo",
  "prazo.base_legal": "Mudou a base legal de um prazo",
  "prazo.cumprido": "Marcou um prazo como cumprido",
  "prazo.reaberto": "Reabriu um prazo",
  "prazo.descartado": "Descartou um prazo",
  "publicacao.sem_prazo": "Marcou que a publicação não gera prazo",
  "peca.gerada": "Gerou uma peça com a IA",
  "peca.preparada": "A IA preparou o rascunho da peça do prazo confirmado",
  "mcp.token_criado": "Criou um token do conector MCP",
  "mcp.token_revogado": "Revogou um token do conector MCP",
  "peca.baixada": "Baixou uma peça em DOCX",
  "peca.fatos_conferidos": "Conferiu os fatos de uma peça nos autos",
  "peca.julgado_inserido": "Escolheu um julgado do acervo para a peça",
  "processo.criado": "Cadastrou um processo",
  "cliente.criado": "Cadastrou um cliente",
  "cliente.apagado": "Apagou um cliente",
  "documento.enviado": "Anexou um documento",
  "documento.apagado": "Apagou um documento",
  "escritorio.alterado": "Alterou os dados do escritório",
  "escritorio.encerrado": "Encerrou o escritório no Decreta",
  "plano.assinatura_iniciada": "Abriu a página de assinatura do plano",
  "plano.assinatura_cancelada": "Cancelou a assinatura do plano",
  "plano.cupom": "Usou um cupom de desconto no plano",
  "exportacao.pedida": "Pediu a cópia de todos os dados do escritório",
  "exportacao.baixada": "Baixou a cópia dos dados do escritório",
  "mensagem_cliente.enviada": "Aprovou e enviou uma mensagem ao cliente no WhatsApp",
  "mensagem_cliente.nao_saiu": "Conferiu que uma mensagem ao cliente não saiu no WhatsApp",
  "documento.recebido_do_cliente": "O cliente mandou um documento pelo link de envio",
  "resultado.confirmado": "Confirmou o resultado de uma sentença",
  "peca.revisada": "Marcou uma peça como revisada",
  "modelo.criado": "Guardou um modelo de peça",
  "modelo.apagado": "Apagou um modelo de peça",
  "contrato.criado": "Criou um contrato de honorários",
  "contrato.alterado": "Alterou um contrato de honorários",
  "contrato.encerrado": "Encerrou um contrato de honorários",
  "contrato.cancelado": "Cancelou um contrato de honorários",
  "parcela.criada": "Acrescentou parcelas a um contrato de honorários",
  "parcela.alterada": "Alterou uma parcela de honorários",
  "parcela.cancelada": "Cancelou uma parcela de honorários",
  "pagamento.registrado": "Marcou o pagamento de uma parcela de honorários",
  "pagamento.estornado": "Estornou o pagamento de uma parcela de honorários",
  "honorario.aviso_dispensado": "Dispensou o aviso de processo sem honorário",
  "honorario.aviso_de_volta": "Trouxe de volta o aviso de processo sem honorário",
  "equipe.financeiro": "Mudou o acesso de alguém ao Financeiro",
  "cobranca.asaas_configurado": "Ligou o Asaas do escritório",
  "cobranca.asaas_removido": "Tirou a chave do Asaas do escritório",
  "cobranca.aviso_refeito": "Refez o aviso de pagamento do Asaas",
  "cobranca.opcoes_alteradas": "Mudou o Pix Automático ou a régua de lembretes",
  "cobranca.emitida": "Emitiu uma cobrança de honorários no Asaas",
  "cobranca.cancelada": "Cancelou uma cobrança de honorários no Asaas",
  "cobranca.pix_automatico_pedido": "Pediu a autorização do Pix Automático de uma mensalidade",
  "cobranca.baixa_automatica": "O Asaas avisou um pagamento e o Decreta deu a baixa",
  "cobranca.estorno_automatico": "O Asaas avisou um estorno e o Decreta desfez a baixa",
  "lembrete.criado": "Deixou um lembrete de cobrança para aprovar",
  "prestacao.confirmada": "Confirmou a prestação de contas de um alvará",
  "prestacao.desfeita": "Desfez a prestação de contas de um alvará",
  "prestacao.baixada": "Baixou a prestação de contas de um alvará em DOCX",
  "prestacao.guardada": "Guardou a prestação de contas de um alvará na pasta do cliente",
  "repasse.registrado": "Registrou um repasse da parte do cliente",
  "repasse.desfeito": "Desfez um repasse da parte do cliente",
  "assinatura.zapsign_configurada": "Configurou a ZapSign do escritório",
  "assinatura.zapsign_removida": "Tirou a chave da ZapSign do escritório",
  "assinatura.enviada": "Mandou um documento para assinatura eletrônica",
  "assinatura.concluida": "Um documento mandado para assinatura foi assinado",
};

/** O registro do pagamento que o Asaas avisou e a parcela não aceitou: o Financeiro lê daqui o aviso que mostra aos sócios. */
export const ACAO_DO_PAGAMENTO_SEM_PARCELA = "cobranca.pagamento_sem_parcela";

export async function registrar(db: Database, r: Registro, log?: (msg: string, extra?: Record<string, unknown>) => void): Promise<void> {
  try {
    await withTenant(db, r.organizationId, (tx) =>
      tx.insert(auditoria).values({ organizationId: r.organizationId, userId: r.userId ?? null, nome: r.nome ?? null, acao: r.acao, detalhes: r.detalhes ?? {}, ip: r.ip ?? null }),
    );
  } catch (err) {
    log?.("registro de auditoria falhou", { acao: r.acao, error: err instanceof Error ? err.message : String(err) });
  }
}

export async function listarRegistro(db: Database, organizationId: string, limite = 100) {
  const linhas = await withTenant(db, organizationId, (tx) => tx.select().from(auditoria).orderBy(desc(auditoria.createdAt)).limit(limite));
  return linhas.map((l) => ({ id: l.id, em: l.createdAt.toISOString(), nome: l.nome, acao: l.acao, rotulo: ROTULO[l.acao] ?? l.acao, detalhes: l.detalhes }));
}
