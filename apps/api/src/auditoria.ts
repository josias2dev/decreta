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
  login: "Entrou no Decreta",
  "senha.trocada": "Trocou a senha",
  "2fa.ligada": "Ligou a verificação em duas etapas",
  "2fa.desligada": "Desligou a verificação em duas etapas",
  "convite.enviado": "Convidou para a equipe",
  "convite.aceito": "Aceitou o convite",
  "membro.removido": "Tirou alguém da equipe",
  "membro.papel": "Mudou o papel de alguém",
  "prazo.confirmado": "Confirmou um prazo",
  "prazo.criado": "Criou um prazo",
  "prazo.ajustado": "Ajustou um prazo",
  "prazo.cumprido": "Marcou um prazo como cumprido",
  "prazo.reaberto": "Reabriu um prazo",
  "prazo.descartado": "Descartou um prazo",
  "publicacao.sem_prazo": "Marcou que a publicação não gera prazo",
  "peca.gerada": "Gerou uma peça com a IA",
  "peca.baixada": "Baixou uma peça em DOCX",
  "processo.criado": "Cadastrou um processo",
  "cliente.criado": "Cadastrou um cliente",
  "cliente.apagado": "Apagou um cliente",
  "documento.enviado": "Anexou um documento",
  "documento.apagado": "Apagou um documento",
  "escritorio.alterado": "Alterou os dados do escritório",
  "mensagem_cliente.enviada": "Aprovou e enviou uma mensagem ao cliente no WhatsApp",
  "resultado.confirmado": "Confirmou o resultado de uma sentença",
  "peca.revisada": "Marcou uma peça como revisada",
  "modelo.criado": "Guardou um modelo de peça",
  "modelo.apagado": "Apagou um modelo de peça",
};

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
