/**
 * Auditoria da carteira: varre todos os processos e devolve uma lista curta do
 * que exige atenção. Roda junto com o resumo da manhã (e na tela Hoje), sobre
 * os dados da madrugada, sem IA: são regras sobre o que está no banco.
 *
 * - Prazo aberto sem responsável.
 * - Publicação que chegou e não casou com processo da carteira.
 * - Alvará expedido há 30 dias e ainda não sacado.
 * - Documento que a última conferência da pasta deu como faltando, de cliente com processo ativo.
 * - Processo ativo sem andamento há 120 dias.
 */
import {
  ACHADOS_NO_RESUMO,
  diaDoInstante,
  diferencaEmDias,
  DIAS_PARA_ALVARA_PARADO,
  DIAS_PARA_PROCESSO_PARADO,
  formatarDiaCurto,
  priorizarAchados,
  somarDias,
  type AchadoDaAuditoria,
  type Dia,
} from "@decreta/core";
import { alvaras, analises, clientes, prazos, processos, publicacoes, type Tx } from "@decreta/db";
import { and, desc, eq, exists, inArray, isNull, lte, sql } from "drizzle-orm";

const DOCUMENTO: Record<string, string> = {
  procuracao: "procuração",
  comprovante_residencia: "comprovante de residência",
  documento_identidade: "documento com foto",
  cpf: "CPF",
  hipossuficiencia: "declaração de hipossuficiência",
  contrato_honorarios: "contrato de honorários",
};

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);

export async function auditarCarteira(tx: Tx, hoje: Dia, timeZone = "America/Sao_Paulo", teto = ACHADOS_NO_RESUMO): Promise<{ itens: AchadoDaAuditoria[]; total: number }> {
  const limiteParado = new Date(`${somarDias(hoje, -DIAS_PARA_PROCESSO_PARADO)}T23:59:59Z`);
  const ativo = and(eq(processos.situacao, "ativo"), eq(processos.tipo, "judicial"));
  const [parados, semDono, soltas, alvarasParados, conferencias] = await Promise.all([
    tx
      .select({ id: processos.id, titulo: processos.titulo, ultima: sql<Date>`coalesce(${processos.ultimaMovimentacaoEm}, ${processos.createdAt})`, responsavelId: processos.responsavelId })
      .from(processos)
      .where(and(ativo, sql`coalesce(${processos.ultimaMovimentacaoEm}, ${processos.createdAt}) <= ${limiteParado.toISOString()}`)),
    tx
      .select({ id: prazos.id, tipo: prazos.tipo, fim: prazos.fim, criado: prazos.createdAt, processo: processos.titulo })
      .from(prazos)
      .innerJoin(processos, eq(processos.id, prazos.processoId))
      .where(and(eq(prazos.situacao, "aberto"), isNull(prazos.responsavelId))),
    tx
      .select({ id: publicacoes.id, disponibilizadaEm: publicacoes.disponibilizadaEm, tribunal: publicacoes.tribunal, cnj: publicacoes.cnj, tipo: publicacoes.tipoComunicacao })
      .from(publicacoes)
      .where(and(isNull(publicacoes.processoId), inArray(publicacoes.situacao, ["nova", "pendente"]), isNull(publicacoes.canceladaEm))),
    tx
      .select({ id: alvaras.id, descricao: alvaras.descricao, expedidoEm: alvaras.expedidoEm, processoId: alvaras.processoId, processo: processos.titulo, responsavelId: processos.responsavelId })
      .from(alvaras)
      .innerJoin(processos, eq(processos.id, alvaras.processoId))
      .where(and(eq(alvaras.etapa, "aguardando_saque"), lte(alvaras.expedidoEm, somarDias(hoje, -DIAS_PARA_ALVARA_PARADO)))),
    // A última conferência de cada cliente com processo ativo.
    tx
      .selectDistinctOn([analises.alvoId], { clienteId: analises.alvoId, conteudo: analises.conteudo, em: analises.createdAt, nome: clientes.nome })
      .from(analises)
      .innerJoin(clientes, eq(clientes.id, analises.alvoId))
      .where(
        and(
          eq(analises.alvo, "cliente"),
          eq(analises.acao, "conferir-pasta"),
          eq(analises.situacao, "pronto"),
          exists(tx.select({ id: processos.id }).from(processos).where(and(eq(processos.clienteId, clientes.id), ativo))),
        ),
      )
      .orderBy(analises.alvoId, desc(analises.createdAt)),
  ]);

  const achados: AchadoDaAuditoria[] = [];
  for (const p of parados) {
    const desde = diaDoInstante(new Date(p.ultima), timeZone);
    const n = diferencaEmDias(desde, hoje);
    achados.push({
      motivo: "processo_parado",
      id: p.id,
      titulo: p.titulo,
      detalhe: `Sem andamento há ${dias(n)} (desde ${formatarDiaCurto(desde)}). Veja se falta impulsionar: risco de extinção por abandono (CPC, art. 485, III) ou de prescrição intercorrente (CPC, art. 921).`,
      caminho: `/processos/${p.id}`,
      dias: n,
      responsavelId: p.responsavelId,
    });
  }
  for (const p of semDono) {
    achados.push({
      motivo: "prazo_sem_dono",
      id: p.id,
      titulo: `${p.tipo} · ${p.processo}`,
      detalhe: `Vence em ${formatarDiaCurto(p.fim)} e ninguém responde por ele.`,
      caminho: `/prazos/${p.id}`,
      dias: Math.max(0, diferencaEmDias(diaDoInstante(p.criado, timeZone), hoje)),
      responsavelId: null,
    });
  }
  for (const p of soltas) {
    const n = Math.max(0, diferencaEmDias(p.disponibilizadaEm, hoje));
    achados.push({
      motivo: "publicacao_sem_processo",
      id: p.id,
      titulo: `${p.tipo ?? "Publicação"} de ${formatarDiaCurto(p.disponibilizadaEm)}${p.tribunal ? ` · ${p.tribunal}` : ""}`,
      detalhe: p.cnj ? `O processo ${p.cnj} não está na carteira. Cadastre ou vincule.` : "Não casou com nenhum processo da carteira. Vincule ou marque como lida.",
      caminho: `/publicacoes/${p.id}`,
      dias: n,
      responsavelId: null,
    });
  }
  for (const a of alvarasParados) {
    const n = diferencaEmDias(a.expedidoEm!, hoje);
    achados.push({
      motivo: "alvara_parado",
      id: a.id,
      titulo: `${a.descricao} · ${a.processo}`,
      detalhe: `Expedido há ${dias(n)} e ainda não sacado.`,
      caminho: "/alvaras",
      dias: n,
      responsavelId: a.responsavelId,
    });
  }
  for (const c of conferencias) {
    const itens = ((c.conteudo as { itens?: { item: string; situacao: string }[] }).itens ?? []).filter((i) => i.situacao === "falta" && DOCUMENTO[i.item]);
    if (!itens.length) continue;
    achados.push({
      motivo: "documento_faltando",
      id: c.clienteId,
      titulo: c.nome,
      detalhe: `A conferência da pasta deu como faltando: ${itens.map((i) => DOCUMENTO[i.item]).join(", ")}.`,
      caminho: `/clientes/${c.clienteId}`,
      dias: Math.max(0, diferencaEmDias(diaDoInstante(c.em, timeZone), hoje)),
      responsavelId: null,
    });
  }
  return priorizarAchados(achados, teto);
}
