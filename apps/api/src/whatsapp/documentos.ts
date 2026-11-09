/**
 * Mandar um documento do escritório pelo WhatsApp, como arquivo. Vale para o pedido à IA ("me manda a
 * procuração da Marina") e para o toque na lista de documentos (sem IA no caminho).
 *
 * As guardas valem nos dois: cliente sem IA não manda; segredo de justiça e arquivo grande vão como link;
 * no máximo 10 documentos por pessoa por dia, para um WhatsApp tomado não virar torneira de RG e procuração.
 */
import { hojeEm } from "@decreta/core";
import { clientes, documentos, processos, withTenant } from "@decreta/db";
import { eq } from "drizzle-orm";
import { registrar } from "../auditoria.ts";
import type { Saida } from "./canal.ts";
import { enviarParaPessoa, saidasDesde } from "./mensagens.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import type { PessoaNoWhatsapp } from "./vinculo.ts";

/** Documentos que um WhatsApp pode tirar do escritório por dia. */
export const DOCUMENTOS_POR_DIA = 10;
/** Até 10 MB pelo WhatsApp (a Meta aceita 100): acima disso, vai o link. */
const TETO_DO_DOCUMENTO = 10 * 1024 * 1024;

export type EnvioDoDocumento =
  | { situacao: "enviado"; nome: string }
  | { situacao: "nao_achou" }
  | { situacao: "sem_ia" | "segredo" | "teto" | "grande" | "nao_abriu" | "nao_saiu"; link: string };

export async function mandarDocumento(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, documentoId: string): Promise<EnvioDoDocumento> {
  const agora = agoraDe(deps);
  const d = await withTenant(deps.db, pessoa.organizationId, async (tx) => {
    const [doc] = await tx.select({ id: documentos.id, nome: documentos.nome, mime: documentos.mime, tamanho: documentos.tamanho, chave: documentos.chave, processoId: documentos.processoId, clienteId: documentos.clienteId }).from(documentos).where(eq(documentos.id, documentoId));
    if (!doc) return null;
    const [proc] = doc.processoId ? await tx.select({ segredo: processos.segredo, clienteId: processos.clienteId }).from(processos).where(eq(processos.id, doc.processoId)) : [];
    const clienteId = doc.clienteId ?? proc?.clienteId ?? null;
    const [cl] = clienteId ? await tx.select({ semIa: clientes.semIa }).from(clientes).where(eq(clientes.id, clienteId)) : [];
    const inicioDoDia = new Date(`${hojeEm(pessoa.timezone, agora)}T00:00:00-03:00`);
    const hoje = await saidasDesde(tx, pessoa.userId, "documento", inicioDoDia);
    return { doc, segredo: !!proc?.segredo, semIa: !!cl?.semIa, hoje };
  });
  if (!d) return { situacao: "nao_achou" };
  const link = `${deps.telas.replace(/\/$/, "")}/documentos/${d.doc.id}`;
  if (d.semIa) return { situacao: "sem_ia", link };
  if (d.segredo) return { situacao: "segredo", link };
  if (d.hoje >= DOCUMENTOS_POR_DIA) return { situacao: "teto", link };
  if (d.doc.tamanho > TETO_DO_DOCUMENTO) return { situacao: "grande", link };
  const bytes = await deps.arquivos.read(d.doc.chave).catch(() => null);
  if (!bytes) return { situacao: "nao_abriu", link };
  const canal = deps.origem === "laboratorio" ? "laboratorio" : "whatsapp";
  const enviado = await enviarParaPessoa(deps, pessoa, { tipo: "documento", nome: d.doc.nome, mime: d.doc.mime, bytes, legenda: d.doc.nome }, { origem: deps.origem === "laboratorio" ? "laboratorio" : "agente", chave: `documento:${d.doc.id}:${agora.getTime()}` });
  if (!enviado) return { situacao: "nao_saiu", link };
  await registrar(deps.db, { organizationId: pessoa.organizationId, userId: pessoa.userId, nome: pessoa.nome, acao: "documento.enviado_whatsapp", detalhes: { documentoId: d.doc.id, canal }, ip: null }, deps.log);
  return { situacao: "enviado", nome: d.doc.nome };
}

/** O que a IA lê depois de pedir o envio. */
export function paraIa(r: EnvioDoDocumento): string {
  switch (r.situacao) {
    case "enviado":
      return `Mandei o arquivo "${r.nome}" nesta conversa. Na resposta, diga só que mandou, em uma linha.`;
    case "nao_achou":
      return "Não achei o documento com este id. Busque de novo com buscarDocumentos.";
    case "sem_ia":
      return "O cliente deste documento está marcado sem IA: não mando pelo WhatsApp. Diga à pessoa para abrir no Decreta.";
    case "segredo":
      return `Processo em segredo de justiça: o arquivo não vai pelo WhatsApp. Dê o link para abrir no Decreta: ${r.link}`;
    case "teto":
      return `Já foram ${DOCUMENTOS_POR_DIA} documentos hoje por este WhatsApp, o teto do dia. Dê o link para abrir no Decreta: ${r.link}`;
    case "grande":
      return `O arquivo é grande demais para o WhatsApp. Dê o link para abrir no Decreta: ${r.link}`;
    case "nao_abriu":
      return "O arquivo não abriu agora. Diga à pessoa para tentar no Decreta.";
    case "nao_saiu":
      return `O arquivo não saiu pelo WhatsApp. Dê o link para abrir no Decreta: ${r.link}`;
  }
}

/** O que a pessoa lê quando escolheu o documento na lista: o arquivo já foi, ou o motivo e o botão para abrir no Decreta. */
export function paraPessoa(r: EnvioDoDocumento): Saida[] {
  const abrir = (texto: string, url: string): Saida => ({ tipo: "link", texto, rotulo: "Abrir no Decreta", url });
  switch (r.situacao) {
    case "enviado":
      return [];
    case "nao_achou":
      return [{ tipo: "texto", texto: "Não achei mais este documento no Decreta." }];
    case "sem_ia":
      return [abrir("O cliente deste documento está marcado sem IA: o arquivo não vai pelo WhatsApp.", r.link)];
    case "segredo":
      return [abrir("Processo em segredo de justiça: o arquivo não vai pelo WhatsApp.", r.link)];
    case "teto":
      return [abrir(`Já foram ${DOCUMENTOS_POR_DIA} documentos hoje por este WhatsApp, o teto do dia.`, r.link)];
    case "grande":
      return [abrir("O arquivo é grande demais para o WhatsApp.", r.link)];
    case "nao_abriu":
      return [abrir("O arquivo não abriu agora. Tente de novo daqui a pouco.", r.link)];
    case "nao_saiu":
      return [abrir("O arquivo não saiu pelo WhatsApp.", r.link)];
  }
}
