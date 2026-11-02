/**
 * A tela do Plano (Configurações), para os sócios: a situação do escritório, o teste, as
 * faturas, assinar e cancelar. Quem paga é o Asaas, na página dele (Pix, boleto ou cartão):
 * `assinar` só devolve o link para onde a tela leva a pessoa.
 *
 * Estas rotas continuam abertas quando o escritório está só leitura ou bloqueado: é por
 * aqui que ele paga (ver `acessoLiberado` em `servicos/assinatura.ts`).
 */
import type { Hono } from "hono";
import { registrar } from "../auditoria.ts";
import { cancelarAssinatura, iniciarAssinatura, planoDoEscritorio, RecusaDaCobranca } from "../servicos/cobranca.ts";
import { ehSocio, falha, ip, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

export function rotasDoPlano(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const cobranca = { db: deps.db, asaas: deps.cobranca?.asaas ?? null, cobrancaAtiva: !!deps.cobranca?.ativa, telas: deps.telas, log: deps.log };
  const soSocios = (c: C) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios veem e mudam o plano.");
  };
  const semDemonstracao = (c: C) => {
    if (c.get("demonstracao")) falha(403, "demonstracao", "A demonstração é de todos e não tem plano.");
  };
  /** A recusa da cobrança vira a resposta da API, com a frase que a tela mostra. */
  const recusar = (err: unknown): never => {
    if (err instanceof RecusaDaCobranca) return falha(err.status, err.codigo, err.message);
    throw err;
  };

  app.get("/plano", async (c) => {
    soSocios(c);
    const plano = await planoDoEscritorio(cobranca, c.get("orgId"));
    return plano ? c.json(plano) : falha(404, "nao_encontrado");
  });

  /** O link do Asaas onde o escritório assina. Nada é cobrado antes de a pessoa preencher o link lá. */
  app.post("/plano/assinar", async (c) => {
    soSocios(c);
    semDemonstracao(c);
    const r = await iniciarAssinatura(cobranca, c.get("orgId")).catch(recusar);
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "plano.assinatura_iniciada", ip: ip(c) }, deps.log);
    return c.json(r);
  });

  /** Cancela: vale até o fim do período já pago, e nada é apagado. */
  app.post("/plano/cancelar", async (c) => {
    soSocios(c);
    semDemonstracao(c);
    const r = await cancelarAssinatura(cobranca, c.get("orgId")).catch(recusar);
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "plano.assinatura_cancelada", detalhes: { acessoAte: r.acessoAte }, ip: ip(c) }, deps.log);
    return c.json(r);
  });
}
