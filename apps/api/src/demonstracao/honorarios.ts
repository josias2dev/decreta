/**
 * Honorários do escritório de demonstração. Tudo inventado, como o resto da demonstração, e coerente
 * com os clientes, processos e alvarás de ./dados.ts: a Marina paga em parcelas com uma em atraso, a
 * padaria tem mensalidade, o alvará da Ana Lúcia, já sacado, espera a prestação de contas, e o êxito
 * de quem ainda não ganhou nada nasce sem valor. Nada aqui passa pelo Asaas: a demonstração não cobra.
 *
 * As datas saem do dia da demonstração, como as dos prazos, para sempre haver o que está em atraso e o que vem.
 */
import { planejarParcelas, somarDias, type Dia, type PlanoDoContrato } from "@decreta/core";
import { contratosHonorarios, pagamentosHonorarios, parcelasHonorarios, type Tx } from "@decreta/db";

type Chave = string;

interface ContratoDemo {
  /** A chave do processo (o contrato é do processo e do cliente dele), ou só a do cliente. */
  processo?: Chave;
  cliente?: Chave;
  titulo: string;
  plano: PlanoDoContrato;
  /** Quais parcelas (pela ordem, de fixo e mensal) o cliente já pagou: as que vencem até este dia, contado a partir de hoje. */
  pagasAte?: number;
  /** Parcelas pagas depois do vencimento (em dias), para a lista de pagamentos não ficar toda no dia exato. */
  atrasoDoPagamento?: number;
}

/** Os contratos escolhidos à mão, com os valores em centavos. */
export function contratosDaDemonstracao(hoje: Dia): ContratoDemo[] {
  return [
    {
      processo: "marina",
      titulo: "Honorários · Marina Duarte × Seguradora Alfa S.A.",
      // Entrada de R$ 3.000,00 em 3 parcelas (a terceira venceu há 2 dias) e 25% do que a seguradora pagar.
      plano: { tipo: "hibrido", fixo: { valor: 300_000, parcelas: 3, primeiroVencimento: somarDias(hoje, -64) }, exitoBp: 2_500 },
      pagasAte: -10,
    },
    {
      processo: "padaria",
      titulo: "Honorários · Padaria Bom Grão Ltda. × Rodrigo Alves",
      // Mensalidade de R$ 1.800,00: as três primeiras pagas e a de há poucos dias em atraso.
      plano: { tipo: "mensal", mensal: { valor: 180_000, meses: 12, primeiroVencimento: somarDias(hoje, -100) } },
      pagasAte: -25,
      atrasoDoPagamento: 1,
    },
    {
      processo: "roberto",
      titulo: "Honorários · Roberto Kühn",
      // R$ 12.000,00 em 4 parcelas: a primeira paga, a segunda em atraso há 15 dias.
      plano: { tipo: "fixo", fixo: { valor: 1_200_000, parcelas: 4, primeiroVencimento: somarDias(hoje, -45) } },
      pagasAte: -30,
    },
    {
      processo: "ana",
      titulo: "Honorários · Ana Lúcia Ferraz",
      // Êxito de 25%: o alvará de R$ 4.180,00 já foi sacado e espera a prestação de contas.
      plano: { tipo: "exito", exitoBp: 2_500 },
    },
    {
      processo: "carlos",
      titulo: "Honorários · Carlos Henrique Prado × construtora",
      plano: { tipo: "fixo", fixo: { valor: 250_000, parcelas: 1, primeiroVencimento: somarDias(hoje, 9) } },
    },
    {
      processo: "eduardo",
      titulo: "Honorários · Eduardo Lima × Unimed Litoral",
      // R$ 900,00 por mês e 20% do que a sentença rendeu quando o dinheiro sair.
      plano: { tipo: "hibrido", mensal: { valor: 90_000, meses: 6, primeiroVencimento: somarDias(hoje, -20) }, exitoBp: 2_000 },
      pagasAte: -5,
    },
    {
      processo: "hotel",
      titulo: "Honorários · Hotel Mar Azul Ltda.",
      plano: { tipo: "mensal", mensal: { valor: 450_000, meses: 12, primeiroVencimento: somarDias(hoje, -35) } },
      pagasAte: -20,
    },
  ];
}

/**
 * Grava os contratos, as parcelas e os pagamentos. Os processos do volume (o resto da carteira) ganham um contrato de
 * êxito do cliente, sem valor, em três de cada quatro: o aviso "processo sem honorário" aparece em alguns, não em todos.
 */
export async function criarHonorariosDaDemonstracao(
  tx: Tx,
  o: { organizationId: string; hoje: Dia; pessoa: string; clienteId: Record<Chave, string>; processoId: Record<Chave, string>; clienteDoProcesso: Record<Chave, Chave>; chavesDoVolume: Chave[]; criadoEm: (dia: Dia) => Date },
): Promise<void> {
  const { organizationId, hoje, pessoa } = o;
  for (const c of contratosDaDemonstracao(hoje)) {
    const clienteChave = c.cliente ?? (c.processo ? o.clienteDoProcesso[c.processo] : undefined);
    const [contrato] = await tx
      .insert(contratosHonorarios)
      .values({
        organizationId,
        clienteId: clienteChave ? o.clienteId[clienteChave]! : null,
        processoId: c.processo ? o.processoId[c.processo]! : null,
        titulo: c.titulo,
        tipo: c.plano.tipo,
        valorFixo: c.plano.fixo?.valor ?? null,
        mensalidade: c.plano.mensal?.valor ?? null,
        exitoBp: c.plano.exitoBp ?? null,
        inicio: somarDias(hoje, -110),
        criadoPor: pessoa,
        createdAt: o.criadoEm(somarDias(hoje, -110)),
      })
      .returning({ id: contratosHonorarios.id });
    const parcelas = planejarParcelas(c.plano);
    const criadas = await tx
      .insert(parcelasHonorarios)
      .values(parcelas.map((p) => ({ organizationId, contratoId: contrato!.id, tipo: p.tipo, numero: p.numero, descricao: p.descricao, valor: p.valor, vencimento: p.vencimento, createdAt: o.criadoEm(somarDias(hoje, -110)) })))
      .returning({ id: parcelasHonorarios.id, vencimento: parcelasHonorarios.vencimento, valor: parcelasHonorarios.valor, tipo: parcelasHonorarios.tipo });
    // Pagas: as que venceram até `pagasAte` dias contados de hoje.
    if (c.pagasAte !== undefined) {
      const limite = somarDias(hoje, c.pagasAte);
      const pagas = criadas.filter((p) => p.tipo !== "exito" && p.valor !== null && p.vencimento !== null && p.vencimento <= limite);
      if (pagas.length) {
        await tx.insert(pagamentosHonorarios).values(
          pagas.map((p, i) => {
            const pagoEm = somarDias(p.vencimento!, c.atrasoDoPagamento ?? 0);
            return { organizationId, parcelaId: p.id, valor: p.valor!, pagoEm: pagoEm > hoje ? hoje : pagoEm, forma: i % 2 === 0 ? ("pix" as const) : ("transferencia" as const), origem: "manual" as const, registradoPor: pessoa };
          }),
        );
      }
    }
  }

  // O resto da carteira: contrato de êxito do cliente, com o percentual combinado e sem valor até sair o resultado.
  const percentuais = [2_000, 2_500, 3_000];
  // Quem já tem contrato à mão (acima) não ganha outro; cada cliente do volume ganha no máximo um.
  const clientesComContrato = new Set<Chave>(contratosDaDemonstracao(hoje).flatMap((c) => [c.cliente ?? (c.processo ? o.clienteDoProcesso[c.processo] : undefined)]).filter((x): x is Chave => !!x));
  for (const [i, chave] of o.chavesDoVolume.entries()) {
    if (i % 4 === 3) continue;
    const clienteChave = o.clienteDoProcesso[chave];
    if (!clienteChave || clientesComContrato.has(clienteChave)) continue;
    clientesComContrato.add(clienteChave);
    const [contrato] = await tx
      .insert(contratosHonorarios)
      .values({ organizationId, clienteId: o.clienteId[clienteChave]!, titulo: "Honorários de êxito", tipo: "exito", exitoBp: percentuais[i % percentuais.length]!, inicio: somarDias(hoje, -90), criadoPor: pessoa, createdAt: o.criadoEm(somarDias(hoje, -90)) })
      .returning({ id: contratosHonorarios.id });
    const [parcela] = planejarParcelas({ tipo: "exito", exitoBp: percentuais[i % percentuais.length]! });
    await tx.insert(parcelasHonorarios).values({ organizationId, contratoId: contrato!.id, tipo: parcela!.tipo, numero: parcela!.numero, descricao: parcela!.descricao, valor: null, vencimento: null, createdAt: o.criadoEm(somarDias(hoje, -90)) });
  }
}
