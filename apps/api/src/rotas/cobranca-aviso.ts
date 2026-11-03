/**
 * O aviso de pagamento do Asaas do escritório (webhook), SEM login: o Asaas chama este endereço a cada
 * pagamento, e o Decreta dá a baixa sozinho. É um endereço por escritório (`/api/cobranca/asaas/<escritório>`),
 * separado do aviso da assinatura do próprio Decreta, e só vale com o segredo que o Decreta pôs no aviso quando criou
 * (cabeçalho `asaas-access-token`), guardado só como hash.
 *
 * Cada evento é tratado uma vez: o id dele é gravado antes da baixa, na mesma transação. O Asaas manda
 * o mesmo evento mais de uma vez, e pode mandar fora de ordem.
 */
import { hojeEm } from "@decreta/core";
import { organization, type Database } from "@decreta/db";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { ACAO_DO_PAGAMENTO_SEM_PARCELA, registrar } from "../auditoria.ts";
import { configDoEscritorio, segredoConfere, tratarAvisoDoAsaas, type AvisoDoAsaas } from "../servicos/cobranca-de-honorarios.ts";

const ORG = /^[A-Za-z0-9_-]{1,64}$/;
/** Um aviso do Asaas tem alguns centenas de bytes; acima disto nem é lido. */
const TETO_DO_AVISO_BYTES = 64 * 1024;

export interface DepsDoAviso {
  db: Database;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

export function rotasDoAvisoDoAsaas(deps: DepsDoAviso) {
  const { db, log } = deps;
  const app = new Hono();
  app.post("/:org", bodyLimit({ maxSize: TETO_DO_AVISO_BYTES, onError: (c) => c.json({ erro: "muito_grande" }, 413) }), async (c) => {
    const orgId = c.req.param("org");
    // Escritório que não existe, sem aviso ligado ou segredo errado: a mesma resposta, sem dizer qual.
    const nao = () => c.json({ erro: "nao_autorizado" }, 401);
    if (!ORG.test(orgId)) return nao();
    const cfg = await configDoEscritorio(db, orgId);
    if (!cfg || !segredoConfere(c.req.header("asaas-access-token"), cfg.asaasWebhookTokenHash)) return nao();
    const [org] = await db.select({ timezone: organization.timezone, encerradoEm: organization.encerradoEm }).from(organization).where(eq(organization.id, orgId));
    // Escritório encerrado: o aviso é recebido (para o Asaas não insistir) e não faz nada.
    if (!org || org.encerradoEm) return c.json({ recebido: true });
    const aviso = (await c.req.json().catch(() => null)) as AvisoDoAsaas | null;
    if (!aviso || typeof aviso !== "object" || Array.isArray(aviso)) return c.json({ erro: "aviso_invalido" }, 400);
    const r = await tratarAvisoDoAsaas(db, orgId, aviso, hojeEm(org.timezone));
    if (!r.duplicado && (r.resultado === "baixa_feita" || r.resultado === "estornado")) {
      await registrar(db, { organizationId: orgId, userId: null, nome: "Asaas", acao: r.resultado === "baixa_feita" ? "cobranca.baixa_automatica" : "cobranca.estorno_automatico", detalhes: { parcelaId: r.parcelaId ?? null, evento: String(aviso.event ?? "") } }, log);
    }
    if (r.semParcela) {
      // Sem parcela para receber, o dinheiro está no Asaas e o Decreta não registrou nada: quem resolve é o sócio.
      log("pagamento do Asaas sem parcela válida", { organizationId: orgId, parcelaId: r.semParcela.parcelaId, cobranca: r.semParcela.cobranca, motivo: r.semParcela.motivo, valor: r.semParcela.valor });
      await registrar(db, { organizationId: orgId, userId: null, nome: "Asaas", acao: ACAO_DO_PAGAMENTO_SEM_PARCELA, detalhes: { ...r.semParcela, evento: String(aviso.event ?? "") } }, log);
    }
    return c.json({ recebido: true, duplicado: r.duplicado });
  });
  return app;
}
