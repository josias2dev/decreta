/**
 * A situação do escritório na assinatura, e o que ela permite.
 *
 * O banco guarda só a situação "de base" e as datas (o fim do teste, o dia em
 * que a fatura venceu sem pagamento, até quando vale o período pago de quem
 * cancelou). O que o escritório pode fazer HOJE sai daqui, pela data: ninguém
 * precisa rodar uma rotina para o teste acabar ou o atraso virar bloqueio, e o
 * mesmo cálculo serve ao servidor, à tela e aos e-mails.
 *
 * Duas regras valem acima de todas: quem é cortesia (todo escritório que já
 * existia antes da cobrança, a demonstração e os dados por acordo) nunca é
 * travado, e dado nenhum é apagado por falta de pagamento.
 */
import { diferencaEmDias, diaDe, formatarDia, somarDias, type Dia } from "./datas.ts";

export const SITUACOES_DO_ESCRITORIO = ["teste", "ativo", "inadimplente", "so_leitura", "bloqueado", "cancelado", "cortesia"] as const;
export type SituacaoDoEscritorio = (typeof SITUACOES_DO_ESCRITORIO)[number];

export const ROTULO_DA_SITUACAO: Record<SituacaoDoEscritorio, string> = {
  teste: "Em teste",
  ativo: "Ativo",
  inadimplente: "Pagamento em atraso",
  so_leitura: "Só leitura",
  bloqueado: "Bloqueado",
  cancelado: "Cancelado",
  cortesia: "Cortesia",
};

/** Dias de atraso até o escritório virar só leitura (o 7º dia) e até ser bloqueado (o 15º). */
export const DIAS_ATE_SO_LEITURA = 7;
export const DIAS_ATE_BLOQUEIO = 15;

/**
 * O que o escritório pode fazer. `total`: tudo. `leitura`: ver, exportar, pagar e
 * encerrar, mas nada novo é salvo e a captura, o WhatsApp e a IA param.
 * `bloqueado`: só pagar, levar os dados e encerrar.
 */
export type Acesso = "total" | "leitura" | "bloqueado";
export type MotivoDoAcesso = "fim_do_teste" | "atraso" | "cancelada" | "manual";

/** O que o banco guarda da assinatura do escritório. */
export interface FichaDaAssinatura {
  situacao: SituacaoDoEscritorio;
  /** O último dia do teste. */
  testeAte: Dia | null;
  /** O vencimento da fatura em atraso mais antiga. */
  inadimplenteDesde: Dia | null;
  /** Quem cancelou: o último dia do período já pago. */
  acessoAte: Dia | null;
}

export interface EstadoDaAssinatura {
  /** A situação de hoje: a gravada, corrigida pelas datas (o teste que acabou, o atraso que passou de 7 dias). */
  situacao: SituacaoDoEscritorio;
  gravada: SituacaoDoEscritorio;
  acesso: Acesso;
  motivo: MotivoDoAcesso | null;
  testeAte: Dia | null;
  /** 0 no último dia do teste; negativo depois dele. */
  diasRestantesDoTeste: number | null;
  diasDeAtraso: number | null;
  /** O primeiro dia em que o escritório fica só leitura, enquanto isso ainda vai acontecer. */
  viraSoLeituraEm: Dia | null;
  /** O primeiro dia bloqueado, enquanto isso ainda vai acontecer. */
  bloqueiaEm: Dia | null;
  acessoAte: Dia | null;
  /** Cancelou, mas o período pago ainda não acabou. */
  cancelamentoAgendado: boolean;
}

const base = (f: FichaDaAssinatura): EstadoDaAssinatura => ({
  situacao: f.situacao,
  gravada: f.situacao,
  acesso: "total",
  motivo: null,
  testeAte: f.testeAte,
  diasRestantesDoTeste: null,
  diasDeAtraso: null,
  viraSoLeituraEm: null,
  bloqueiaEm: null,
  acessoAte: f.acessoAte,
  cancelamentoAgendado: false,
});

export function estadoDaAssinatura(f: FichaDaAssinatura, hoje: Dia): EstadoDaAssinatura {
  const e = base(f);
  switch (f.situacao) {
    case "cortesia":
    case "ativo": {
      if (f.situacao === "ativo" && f.acessoAte) {
        if (hoje > f.acessoAte) return { ...e, situacao: "cancelado", acesso: "leitura", motivo: "cancelada" };
        return { ...e, cancelamentoAgendado: true, viraSoLeituraEm: somarDias(f.acessoAte, 1) };
      }
      return e;
    }
    case "teste": {
      // Sem a data na ficha, o escritório não é travado: dado faltando nunca é motivo de bloqueio.
      if (!f.testeAte) return e;
      const dias = diferencaEmDias(hoje, f.testeAte);
      if (dias >= 0) return { ...e, diasRestantesDoTeste: dias, viraSoLeituraEm: somarDias(f.testeAte, 1) };
      return { ...e, situacao: "so_leitura", acesso: "leitura", motivo: "fim_do_teste", diasRestantesDoTeste: dias };
    }
    case "inadimplente": {
      if (!f.inadimplenteDesde) return e;
      const atraso = diferencaEmDias(f.inadimplenteDesde, hoje);
      const soLeitura = somarDias(f.inadimplenteDesde, DIAS_ATE_SO_LEITURA);
      const bloqueio = somarDias(f.inadimplenteDesde, DIAS_ATE_BLOQUEIO);
      if (atraso >= DIAS_ATE_BLOQUEIO) return { ...e, situacao: "bloqueado", acesso: "bloqueado", motivo: "atraso", diasDeAtraso: atraso };
      if (atraso >= DIAS_ATE_SO_LEITURA) return { ...e, situacao: "so_leitura", acesso: "leitura", motivo: "atraso", diasDeAtraso: atraso, bloqueiaEm: bloqueio };
      return { ...e, diasDeAtraso: atraso, viraSoLeituraEm: soLeitura, bloqueiaEm: bloqueio };
    }
    case "so_leitura":
      return { ...e, acesso: "leitura", motivo: "manual" };
    case "bloqueado":
      return { ...e, acesso: "bloqueado", motivo: "manual" };
    case "cancelado":
      return { ...e, acesso: "leitura", motivo: "cancelada" };
  }
}

/* ---------------- Meses e período pago ---------------- */

/** Soma meses mantendo o dia; onde o mês não tem aquele dia, cai no último. */
export function somarMeses(dia: Dia, n: number): Dia {
  const [a, m, d] = dia.split("-").map(Number) as [number, number, number];
  const total = a * 12 + (m - 1) + n;
  const ano = Math.floor(total / 12);
  const mes = (total % 12) + 1;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return diaDe(ano, mes, Math.min(d, ultimo));
}

/** A mensalidade com vencimento em `vencimento` cobre até o dia anterior ao do mês seguinte. */
export function fimDoPeriodoPago(vencimento: Dia): Dia {
  return somarDias(somarMeses(vencimento, 1), -1);
}

/* ---------------- Avisos ---------------- */

export interface AvisoDaAssinatura {
  /** `info`: discreto. `atencao`: vai acontecer. `grave`: já está acontecendo. */
  nivel: "info" | "atencao" | "grave";
  texto: string;
  /** A data que o texto cita, para a tela destacar. */
  ate: Dia | null;
}

const dias = (n: number) => (n === 1 ? "1 dia" : `${n} dias`);
const SEM_PUBLICACAO = "nada novo pode ser salvo e as publicações do DJEN deixam de chegar";

/** O que a tela e o e-mail dizem sobre a situação, sempre com a data do próximo passo. Nulo quando está tudo em dia. */
export function avisoDaAssinatura(e: EstadoDaAssinatura, hoje: Dia): AvisoDaAssinatura | null {
  void hoje;
  switch (e.situacao) {
    case "teste": {
      const n = e.diasRestantesDoTeste;
      if (n === null || !e.testeAte) return null;
      const fim = formatarDia(e.testeAte);
      if (n > 3) return { nivel: "info", texto: `Teste grátis: ${n === 1 ? "falta" : "faltam"} ${dias(n)}, até ${fim}. Sem cartão e sem compromisso.`, ate: e.testeAte };
      const quando = n === 0 ? "hoje" : n === 1 ? "amanhã" : `em ${dias(n)}`;
      return { nivel: "atencao", texto: `O teste termina ${quando} (${fim}). Depois dessa data o escritório fica só para leitura: ${SEM_PUBLICACAO}. Assine para continuar.`, ate: e.testeAte };
    }
    case "so_leitura": {
      if (e.motivo === "fim_do_teste" && e.testeAte) {
        return { nivel: "grave", texto: `O teste acabou em ${formatarDia(e.testeAte)}. O escritório está só para leitura: ${SEM_PUBLICACAO.replace("deixam de chegar", "não estão chegando")}. Nada foi apagado. Assine para voltar ao normal.`, ate: e.testeAte };
      }
      if (e.motivo === "atraso" && e.bloqueiaEm) {
        return { nivel: "grave", texto: `A fatura em atraso deixou o escritório só para leitura: ${SEM_PUBLICACAO.replace("deixam de chegar", "não estão chegando")}. Em ${formatarDia(e.bloqueiaEm)} o acesso será bloqueado. Pague para voltar ao normal.`, ate: e.bloqueiaEm };
      }
      return { nivel: "grave", texto: `O escritório está só para leitura por decisão da equipe do Decreta: ${SEM_PUBLICACAO.replace("deixam de chegar", "não estão chegando")}. Fale com a equipe para voltar ao normal.`, ate: null };
    }
    case "inadimplente": {
      if (!e.viraSoLeituraEm) return null;
      return { nivel: "atencao", texto: `Há uma fatura em atraso. Em ${formatarDia(e.viraSoLeituraEm)} o escritório passa a ser só para leitura e as publicações do DJEN deixam de chegar. Regularize o pagamento para evitar.`, ate: e.viraSoLeituraEm };
    }
    case "bloqueado":
      return {
        nivel: "grave",
        texto:
          e.motivo === "atraso"
            ? "O acesso está bloqueado por falta de pagamento. As publicações do DJEN não estão chegando. Pague para voltar a usar; os dados continuam guardados e você pode levá-los a qualquer momento."
            : "O acesso do escritório está bloqueado por decisão da equipe do Decreta. As publicações do DJEN não estão chegando. Fale com a equipe; os dados continuam guardados.",
        ate: null,
      };
    case "cancelado":
      return {
        nivel: "grave",
        texto: `A assinatura foi cancelada${e.acessoAte ? ` e o período pago acabou em ${formatarDia(e.acessoAte)}` : ""}. O escritório está só para leitura: ${SEM_PUBLICACAO.replace("deixam de chegar", "não estão chegando")}. Assine de novo para voltar ao normal.`,
        ate: e.acessoAte,
      };
    case "ativo": {
      if (!e.cancelamentoAgendado || !e.acessoAte) return null;
      return { nivel: "atencao", texto: `A assinatura foi cancelada. O acesso completo vai até ${formatarDia(e.acessoAte)}. Depois dessa data o escritório fica só para leitura e as publicações do DJEN deixam de chegar.`, ate: e.acessoAte };
    }
    case "cortesia":
      return null;
  }
}

/* ---------------- Avisos por e-mail ---------------- */

export type TipoDeAvisoDaAssinatura = "teste_3" | "teste_1" | "teste_acabou" | "atraso_1" | "atraso_5" | "atraso_7" | "atraso_13" | "atraso_15";

/** O aviso do teste que vale hoje: 3 dias antes do fim (faltando 3 ou 2), 1 dia antes (faltando 1 ou 0) e o dia seguinte ao fim. */
export function janelaDoAvisoDoTeste(e: EstadoDaAssinatura): TipoDeAvisoDaAssinatura | null {
  const n = e.diasRestantesDoTeste;
  if (n === null || (e.gravada !== "teste")) return null;
  if (n === 3 || n === 2) return "teste_3";
  if (n === 1 || n === 0) return "teste_1";
  if (n === -1) return "teste_acabou";
  return null;
}

/** Os dias de atraso em que sai e-mail: o primeiro aviso, 2 dias antes de virar só leitura, o dia em que vira, 2 dias antes do bloqueio e o dia do bloqueio. */
export const DIAS_DE_AVISO_DO_ATRASO = [1, 5, 7, 13, 15] as const;

export function janelaDoAvisoDoAtraso(e: EstadoDaAssinatura): TipoDeAvisoDaAssinatura | null {
  if (e.gravada !== "inadimplente" || e.diasDeAtraso === null) return null;
  return (DIAS_DE_AVISO_DO_ATRASO as readonly number[]).includes(e.diasDeAtraso) ? (`atraso_${e.diasDeAtraso}` as TipoDeAvisoDaAssinatura) : null;
}
