/**
 * A régua de lembretes de cobrança no WhatsApp. O escritório aprova o texto de cada passo (3 dias
 * antes, no dia, 3 dias depois...) e a rotina do dia deixa, para cada parcela que chegou num passo, um
 * rascunho de mensagem ao cliente. NADA sai sozinho: o rascunho entra no mesmo fluxo de aprovação das
 * outras mensagens ao cliente, e só um advogado com OAB aprova e envia.
 */
import { hojeEm, preencherLembrete, somarDias, telefoneWhatsapp, type Dia } from "@decreta/core";
import { clientes, cobrancaConfig, contratosHonorarios, escritorios, lembretesDeCobranca, mensagensCliente, organization, parcelasHonorarios, withTenant, type Database, type Tx } from "@decreta/db";
import { and, eq, isNull } from "drizzle-orm";
import { falha } from "../rotas/base.ts";
import { parcelasNaTela } from "./honorarios.ts";

/** Até quantos dias depois do dia do passo a rotina ainda deixa o rascunho: lembrete velho demais não vale. */
export const TOLERANCIA_DO_PASSO_DIAS = 3;

/** O texto de uma parcela, com o nome do escritório, para o rascunho. */
async function textoDaParcela(tx: Tx, organizationId: string, parcela: { id: string; cliente: { nome: string } | null; descricao: string; falta: number | null; vencimento: Dia | null; cobranca: { link: string | null } | null }, template: string): Promise<string> {
  const [e] = await tx.select({ timbre: escritorios.timbre }).from(escritorios).where(eq(escritorios.organizationId, organizationId));
  const [org] = await tx.select({ nome: organization.name }).from(organization).where(eq(organization.id, organizationId));
  return preencherLembrete(template, {
    cliente: parcela.cliente?.nome ?? "cliente",
    descricao: parcela.descricao,
    valorCentavos: parcela.falta ?? 0,
    vencimento: parcela.vencimento ?? hojeEm(),
    link: parcela.cobranca?.link ?? null,
    escritorio: e?.timbre?.nome ?? org?.nome ?? "",
  });
}

/**
 * O lembrete pedido à mão, de uma parcela: um rascunho com o texto do escritório (o do passo do dia, ou o
 * primeiro), que o advogado confere e aprova na tela de mensagens ao cliente.
 */
export async function criarLembrete(tx: Tx, organizationId: string, userId: string | null, parcelaId: string, hoje: Dia, template: string, passo: number | null): Promise<string | null> {
  const [parcela] = await tx.select({ contratoId: parcelasHonorarios.contratoId }).from(parcelasHonorarios).where(eq(parcelasHonorarios.id, parcelaId)).for("update");
  if (!parcela) falha(404, "nao_encontrado");
  const p = (await parcelasNaTela(tx, hoje, { contratoId: parcela.contratoId, comCanceladas: true })).find((x) => x.id === parcelaId);
  if (!p || p.situacao === "cancelada") falha(409, "parcela_cancelada", "Esta parcela foi cancelada.");
  if (p.valor === null || !p.falta) falha(409, "nada_a_cobrar", "Esta parcela não tem nada a cobrar agora: está paga ou ainda sem valor.");
  if (!p.vencimento) falha(422, "sem_vencimento", "A parcela não tem vencimento: defina a data antes de lembrar o cliente.");
  if (!p.cliente) falha(422, "sem_cliente", "O contrato não tem cliente para receber o lembrete.");
  if (passo !== null) {
    const [ja] = await tx.select({ id: lembretesDeCobranca.id }).from(lembretesDeCobranca).where(and(eq(lembretesDeCobranca.parcelaId, parcelaId), eq(lembretesDeCobranca.passo, passo)));
    if (ja) return null;
  }
  const [contrato] = await tx.select({ processoId: contratosHonorarios.processoId }).from(contratosHonorarios).where(eq(contratosHonorarios.id, parcela.contratoId));
  const texto = await textoDaParcela(tx, organizationId, p, template);
  const [m] = await tx
    .insert(mensagensCliente)
    .values({ organizationId, clienteId: p.cliente.id, processoId: contrato?.processoId ?? null, tipo: "cobranca", texto, criadaPor: userId })
    .returning({ id: mensagensCliente.id });
  await tx.insert(lembretesDeCobranca).values({ organizationId, parcelaId, mensagemId: m!.id, passo });
  return m!.id;
}

export interface ResultadoDaRegua {
  rascunhos: number;
}

/**
 * A rotina do dia para um escritório: para cada parcela em aberto que chegou num passo da régua (e ainda
 * não ganhou o lembrete dele), deixa um rascunho. Régua desligada ou sem texto aprovado: nada. Cliente sem
 * celular válido no cadastro também fica de fora, porque a mensagem não teria como sair.
 */
export async function gerarLembretesDoDia(db: Database, organizationId: string, hoje: Dia, timezone = "America/Sao_Paulo"): Promise<ResultadoDaRegua> {
  return withTenant(db, organizationId, async (tx) => {
    const [cfg] = await tx.select({ regua: cobrancaConfig.regua }).from(cobrancaConfig).where(eq(cobrancaConfig.organizationId, organizationId));
    const regua = cfg?.regua;
    if (!regua?.ligada || !regua.aprovadaEm || !regua.passos.length) return { rascunhos: 0 };
    const parcelas = (await parcelasNaTela(tx, hoje)).filter((p) => p.contratoSituacao === "ativo" && p.valor !== null && !!p.falta && !!p.vencimento && !!p.cliente);
    if (!parcelas.length) return { rascunhos: 0 };
    const telefones = new Map((await tx.select({ id: clientes.id, telefone: clientes.telefone }).from(clientes)).map((c) => [c.id, c.telefone]));
    let rascunhos = 0;
    for (const p of parcelas) {
      const celular = telefones.get(p.cliente!.id);
      if (!celular || !telefoneWhatsapp(celular)) continue;
      // Um passo que caiu antes de a parcela existir ("3 dias antes" de uma parcela criada hoje) não vale.
      const criadaNoDia = hojeEm(timezone, new Date(p.criadaEm));
      for (const [i, passo] of regua.passos.entries()) {
        const dia = somarDias(p.vencimento!, passo.dias);
        if (dia > hoje || dia < somarDias(hoje, -TOLERANCIA_DO_PASSO_DIAS) || dia < criadaNoDia) continue;
        if (await criarLembrete(tx, organizationId, null, p.id, hoje, passo.texto, i)) rascunhos++;
      }
    }
    return { rascunhos };
  });
}

/** Os rascunhos de cobrança que esperam o advogado aprovar. */
export async function lembretesParaAprovar(tx: Tx): Promise<number> {
  const linhas = await tx
    .select({ id: mensagensCliente.id })
    .from(mensagensCliente)
    .where(and(eq(mensagensCliente.tipo, "cobranca"), eq(mensagensCliente.situacao, "rascunho"), isNull(mensagensCliente.aprovadaPor)));
  return linhas.length;
}
