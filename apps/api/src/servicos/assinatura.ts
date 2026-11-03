/**
 * A assinatura do escritório vista pelo servidor: de qual situação ele está hoje e o
 * que pode fazer. A conta (as datas, o que é teste, atraso e cancelamento) mora em
 * `estadoDaAssinatura`, em @decreta/core; aqui ficam a leitura do banco, o que a API
 * recusa em cada acesso e a situação com que um escritório novo nasce.
 *
 * Tudo isto só vale com `COBRANCA_ATIVA`. Desligada, o acesso é sempre total e nenhum
 * aviso aparece: o Decreta age como agia antes da cobrança.
 */
import { estadoDaAssinatura, hojeEm, PLANO, somarDias, type Acesso, type Dia, type EstadoDaAssinatura, type FichaDaAssinatura, type SituacaoDoEscritorio } from "@decreta/core";
import { organization, type Database } from "@decreta/db";
import { eq } from "drizzle-orm";

/** As colunas da `organization` que dizem a situação na assinatura. */
export const colunasDaAssinatura = {
  situacao: organization.situacao,
  testeAte: organization.testeAte,
  inadimplenteDesde: organization.inadimplenteDesde,
  acessoAte: organization.acessoAte,
  timezone: organization.timezone,
};

export type LinhaDaAssinatura = { situacao: SituacaoDoEscritorio; testeAte: Dia | null; inadimplenteDesde: Dia | null; acessoAte: Dia | null; timezone: string };

export const fichaDaLinha = (l: Pick<LinhaDaAssinatura, "situacao" | "testeAte" | "inadimplenteDesde" | "acessoAte">): FichaDaAssinatura => ({
  situacao: l.situacao,
  testeAte: l.testeAte,
  inadimplenteDesde: l.inadimplenteDesde,
  acessoAte: l.acessoAte,
});

/**
 * O estado de hoje. Com a cobrança desligada o acesso é total, sempre: as datas continuam
 * valendo para a tela do Plano, mas nada trava e nenhum aviso sai.
 */
export function estadoDoEscritorio(l: LinhaDaAssinatura, cobrancaAtiva: boolean, agora = new Date()): EstadoDaAssinatura {
  const e = estadoDaAssinatura(fichaDaLinha(l), hojeEm(l.timezone, agora));
  return cobrancaAtiva ? e : { ...e, acesso: "total", motivo: null };
}

export async function carregarEstado(db: Database, organizationId: string, cobrancaAtiva: boolean, agora = new Date()): Promise<EstadoDaAssinatura | null> {
  const [l] = await db.select(colunasDaAssinatura).from(organization).where(eq(organization.id, organizationId));
  return l ? estadoDoEscritorio(l, cobrancaAtiva, agora) : null;
}

/** O escritório que não tem acesso total não manda WhatsApp, não usa a IA e não busca no DataJud. Sem escritório, também não. As publicações do DJEN têm regra própria: `recebePublicacoes`. */
export async function temAcessoTotal(db: Database, organizationId: string, cobrancaAtiva: boolean | undefined, agora = new Date()): Promise<boolean> {
  if (!cobrancaAtiva) return true;
  const e = await carregarEstado(db, organizationId, true, agora);
  return !!e && e.acesso === "total";
}

/**
 * Como um escritório novo começa. Com a cobrança ligada, o cadastro aberto abre um teste de
 * `PLANO.testeDias` dias, sem cartão. Sem a cobrança, e em tudo que a equipe cria (o script,
 * a demonstração), nasce cortesia: nunca é travado por uma regra que ainda não existia.
 */
export function comoNasce(cobrancaAtiva: boolean, cadastroAberto: boolean, hoje: Dia = hojeEm()): { situacao: SituacaoDoEscritorio; testeAte: Dia | null } {
  if (cobrancaAtiva && cadastroAberto) return { situacao: "teste", testeAte: somarDias(hoje, PLANO.testeDias) };
  return { situacao: "cortesia", testeAte: null };
}

/* ---------------- O que a API recusa ---------------- */

/** Permitido mesmo sem acesso total: pagar (a tela do Plano), levar os dados e encerrar. Sair da conta é do Better Auth, fora destas rotas. */
const SEMPRE_PERMITIDO: RegExp[] = [
  /^GET \/eu$/,
  /^GET \/plano$/,
  /^POST \/plano\/(assinar|cancelar)$/,
  /^(GET|POST) \/escritorio\/exportacoes$/,
  /^GET \/escritorio\/exportacoes\/[^/]+\/partes\/\d+$/,
  /^POST \/escritorio\/encerrar$/,
];

/** Só estes métodos não escrevem: qualquer outro (inclusive um que ainda não existe) é recusado sem acesso total. */
const LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

/** `caminho` é o das rotas das telas, sem o `/api/app` na frente. */
export function acessoLiberado(acesso: Acesso, metodo: string, caminho: string): boolean {
  if (acesso === "total") return true;
  if (SEMPRE_PERMITIDO.some((r) => r.test(`${metodo} ${caminho}`))) return true;
  return acesso === "leitura" && LEITURA.has(metodo);
}

const ONDE_PAGAR = "Em Configurações, na aba Plano, dá para assinar ou pagar; ver os dados, levar uma cópia deles e encerrar a conta continuam abertos.";

/** A recusa que a API devolve (e a tela mostra) quando o acesso não é total. Nada é apagado por falta de pagamento. */
export function recusaDeAcesso(e: EstadoDaAssinatura): { status: 403; erro: "so_leitura" | "escritorio_bloqueado"; detalhe: string } {
  if (e.acesso === "bloqueado") {
    return {
      status: 403,
      erro: "escritorio_bloqueado",
      detalhe: `O acesso do escritório está bloqueado${e.motivo === "atraso" ? " por falta de pagamento" : ""}. Os dados continuam guardados. ${ONDE_PAGAR}`,
    };
  }
  const porque =
    e.motivo === "fim_do_teste"
      ? "O teste grátis acabou"
      : e.motivo === "atraso"
        ? "Há uma fatura em atraso"
        : e.motivo === "cancelada"
          ? "A assinatura foi cancelada"
          : "O escritório foi colocado só para leitura pela equipe do Decreta";
  return { status: 403, erro: "so_leitura", detalhe: `${porque} e o escritório está só para leitura: dá para ver tudo, mas não para salvar nada novo. Nada foi apagado. ${ONDE_PAGAR}` };
}
