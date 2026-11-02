/**
 * O texto da prestação de contas do alvará, em Markdown simples (o formato das peças): vira
 * DOCX no timbre do escritório. Cada conta aparece com os números à vista, para o cliente
 * conferir o que caiu, o que ficou com o escritório e o que foi repassado.
 */
import { formatarDia, type Dia } from "./datas.ts";
import { formatarDocumento } from "./documentos.ts";
import { conferirRepasses, formatarBasePontos, formatarCentavos } from "./honorarios.ts";

export interface DadosDaPrestacao {
  escritorio: string;
  cliente: { nome: string; tipo: "pf" | "pj"; documento: string | null } | null;
  processo: { titulo: string; cnj: string | null; onde: string | null };
  alvara: { descricao: string; expedidoEm: Dia | null; sacadoEm: Dia | null };
  conta: { valorAlvara: number; valorRecebido: number; exitoBp: number | null; honorario: number; cliente: number; semContrato: boolean; retidoNoSaque: boolean };
  contratoTitulo: string | null;
  repasses: { favorecido: string; conta: string; valor: number; repassadoEm: Dia }[];
  responsavel: { nome: string; oab: string | null };
  emitidaEm: Dia;
}

export const TITULO_DA_PRESTACAO = "Prestação de contas";

export function textoDaPrestacaoDeContas(d: DadosDaPrestacao): string {
  const { conta } = d;
  const doc = d.cliente?.documento ? `, ${d.cliente.tipo === "pj" ? "CNPJ" : "CPF"} ${formatarDocumento(d.cliente.documento)}` : "";
  const processo = [d.processo.titulo, d.processo.cnj ? `nº ${d.processo.cnj}` : null, d.processo.onde].filter(Boolean).join(", ");
  const datas = [d.alvara.expedidoEm ? `expedido em ${formatarDia(d.alvara.expedidoEm)}` : null, d.alvara.sacadoEm ? `sacado em ${formatarDia(d.alvara.sacadoEm)}` : null].filter(Boolean).join(" e ");
  const diferenca = conta.valorRecebido - conta.valorAlvara;

  const valores = [
    `- Valor do alvará: ${formatarCentavos(conta.valorAlvara)}.`,
    `- Valor que caiu na conta: ${formatarCentavos(conta.valorRecebido)}.`,
    ...(diferenca !== 0 ? [`- Diferença em relação ao alvará: ${formatarCentavos(diferenca)}.`] : []),
  ];

  const honorarios = conta.semContrato
    ? [
        "Não há contrato de honorários de êxito ligado a este alvará: nenhum honorário foi descontado, e o valor recebido é todo do cliente.",
        `- Parte do cliente: ${formatarCentavos(conta.cliente)}.`,
      ]
    : [
        `Contrato: ${d.contratoTitulo ?? "contrato de honorários"}, com honorário de êxito de ${formatarBasePontos(conta.exitoBp!)} sobre o valor recebido.`,
        `- Honorários do escritório (${formatarBasePontos(conta.exitoBp!)} de ${formatarCentavos(conta.valorRecebido)}): ${formatarCentavos(conta.honorario)}.`,
        `- Parte do cliente: ${formatarCentavos(conta.cliente)}.`,
        conta.retidoNoSaque ? "O escritório reteve o honorário no saque." : "O honorário será cobrado conforme o contrato.",
      ];

  const conferencia = conferirRepasses(conta.cliente, d.repasses);
  const repasses = d.repasses.length
    ? [
        ...d.repasses.map((r) => `- ${formatarDia(r.repassadoEm)} · ${r.favorecido} · ${r.conta} · ${formatarCentavos(r.valor)}`),
        `Total repassado: ${formatarCentavos(conferencia.repassado)}.`,
        conferencia.completo ? "Todo o valor do cliente foi repassado." : `Falta repassar: ${formatarCentavos(conferencia.falta)}.`,
      ]
    : ["Nenhum repasse foi registrado até a data desta prestação de contas."];

  return [
    `# ${TITULO_DA_PRESTACAO}`,
    `**Cliente:** ${d.cliente?.nome ?? "cliente não informado"}${doc}.`,
    `**Processo:** ${processo}.`,
    `**Alvará:** ${d.alvara.descricao}${datas ? `, ${datas}` : ""}.`,
    `**Escritório:** ${d.escritorio}.`,
    "## 1. Valores",
    valores.join("\n"),
    "## 2. Honorários de êxito",
    honorarios.join("\n"),
    "## 3. Repasses ao cliente",
    repasses.join("\n"),
    `Emitida em ${formatarDia(d.emitidaEm)}.`,
    "______________________________",
    `${d.responsavel.nome}${d.responsavel.oab ? `, ${d.responsavel.oab}` : ""}`,
  ].join("\n\n");
}
