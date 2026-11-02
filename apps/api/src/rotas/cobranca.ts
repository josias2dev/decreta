/**
 * Cobrança pelo Asaas do escritório e a régua de lembretes no WhatsApp: as chaves de cada
 * escritório (só sócio mexe, e elas nunca voltam pela API), a cobrança de cada parcela, o Pix Automático
 * da mensalidade e os lembretes, que entram no fluxo de aprovação das mensagens ao cliente.
 * Sem chave do Asaas, o Financeiro segue com a baixa manual.
 */
import { ehDia, hojeEm, PASSOS_PADRAO_DA_REGUA } from "@decreta/core";
import { clientes, cobrancaConfig, lembretesDeCobranca, mensagensCliente, parcelasHonorarios, type ReguaDeLembretes } from "@decreta/db";
import { asc, desc, eq, inArray } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { removerWebhook } from "../servicos/asaas.ts";
import { autorizarPixAutomatico, cancelarCobranca, configDoEscritorio, contaAsaas, emitirCobranca, estadoDaCobranca, ligarOAviso, removerChaveDoAsaas, salvarChaveDoAsaas, type DepsDaCobranca } from "../servicos/cobranca.ts";
import { parcelaNaTela } from "../servicos/honorarios.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { criarLembrete } from "../servicos/regua.ts";
import { corpo, ehSocio, exigirFinanceiro, falha, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";
import { mensagemNaTela } from "./mensagens-cliente.ts";

const CAMPOS_DO_TEXTO = new Set(["cliente", "descricao", "valor", "vencimento", "link", "escritorio"]);
const ambiente = z.enum(["sandbox", "producao"]);

const REGUA = z.object({
  ligada: z.boolean(),
  passos: z
    .array(z.object({ dias: z.number().int().min(-30).max(90), texto: z.string().trim().min(20, "O texto do lembrete é curto demais.").max(1200) }))
    .max(6, "No máximo 6 lembretes por parcela.")
    .refine((ps) => new Set(ps.map((p) => p.dias)).size === ps.length, "Dois lembretes no mesmo dia."),
});

export function rotasDaCobranca(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const dc = (c: C): DepsDaCobranca => ({ db, cofre: deps.cofre, fetch: deps.fetchDosProvedores, log: deps.log, enderecoDaApi: deps.enderecoDaApi });
  const soSocios = (c: C) => {
    if (!ehSocio(c.get("papel"))) falha(403, "so_socios", "Só os sócios mudam isso.");
  };
  const semDemonstracao = (c: C) => {
    if (c.get("demonstracao")) falha(403, "demonstracao", "Na demonstração a cobrança e a assinatura ficam desligadas: os clientes e os valores são inventados.");
  };
  const auditar = (c: C, acao: string, detalhes: Record<string, unknown> = {}) => registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes, ip: ip(c) }, deps.log);
  const estado = async (c: C) => ({ ...estadoDaCobranca(await configDoEscritorio(db, c.get("orgId")), c.get("orgId"), deps.enderecoDaApi), podeEditar: ehSocio(c.get("papel")), cofreLigado: !!deps.cofre, textosPadrao: PASSOS_PADRAO_DA_REGUA });

  /** Como está a cobrança do escritório: o Asaas, a régua e a assinatura. As chaves nunca voltam: só se estão guardadas. */
  app.get("/financeiro/cobranca", async (c) => {
    await exigirFinanceiro(c, deps);
    return c.json(await estado(c));
  });

  app.put("/financeiro/cobranca/asaas", async (c) => {
    soSocios(c);
    semDemonstracao(c);
    const b = await corpo(c, z.object({ chave: z.string().trim().min(20).max(300), ambiente }));
    const email = await emailDeQuemPediu(c);
    const r = await salvarChaveDoAsaas(dc(c), c.get("orgId"), { email }, b);
    await auditar(c, "cobranca.asaas_configurado", { ambiente: b.ambiente, avisoLigado: r.avisoLigado });
    return c.json({ ...r, estado: await estado(c) });
  });

  /** O aviso de pagamento não nasceu (ou foi apagado no Asaas): cria de novo, com um segredo novo. */
  app.post("/financeiro/cobranca/asaas/aviso", async (c) => {
    soSocios(c);
    semDemonstracao(c);
    const cfg = await configDoEscritorio(db, c.get("orgId"));
    const conta = contaAsaas(dc(c), c.get("orgId"), cfg);
    if (!conta) falha(409, "sem_asaas", "Informe a chave do Asaas primeiro.");
    const r = await ligarOAviso(dc(c), c.get("orgId"), { email: await emailDeQuemPediu(c) }, conta, cfg?.pixAutomatico ?? false);
    await auditar(c, "cobranca.aviso_refeito", { avisoLigado: r.avisoLigado });
    return c.json({ ...r, estado: await estado(c) });
  });

  app.delete("/financeiro/cobranca/asaas", async (c) => {
    soSocios(c);
    await removerChaveDoAsaas(dc(c), c.get("orgId"));
    await auditar(c, "cobranca.asaas_removido");
    return c.json({ estado: await estado(c) });
  });

  /** Pix Automático e a régua de lembretes. Salvar a régua ligada é o aval do escritório ao texto de cada passo. */
  app.put("/financeiro/cobranca/opcoes", async (c) => {
    soSocios(c);
    const b = await corpo(c, z.object({ pixAutomatico: z.boolean().optional(), regua: REGUA.optional() }));
    const antes = await configDoEscritorio(db, c.get("orgId"));
    if (b.regua) {
      for (const p of b.regua.passos) {
        const desconhecido = [...p.texto.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]!).find((campo) => !CAMPOS_DO_TEXTO.has(campo));
        if (desconhecido) falha(422, "campo_desconhecido", `O texto usa {${desconhecido}}, que não existe. Os campos são: ${[...CAMPOS_DO_TEXTO].map((x) => `{${x}}`).join(", ")}.`);
      }
      if (b.regua.ligada && !b.regua.passos.length) falha(422, "regua_vazia", "Para ligar a régua, escreva pelo menos um lembrete.");
    }
    const valores: Partial<typeof cobrancaConfig.$inferInsert> = {};
    if (b.pixAutomatico !== undefined) valores.pixAutomatico = b.pixAutomatico;
    if (b.regua) {
      const regua: ReguaDeLembretes = { ...b.regua, aprovadaPor: c.get("userId"), aprovadaEm: new Date().toISOString() };
      valores.regua = regua;
    }
    await tenant(c, deps, (tx) => tx.insert(cobrancaConfig).values({ organizationId: c.get("orgId"), ...valores }).onConflictDoUpdate({ target: cobrancaConfig.organizationId, set: valores }));
    // O aviso do Asaas assina os eventos do Pix Automático só se ele estiver ligado: ao mudar, o aviso é refeito.
    let aviso: { avisoLigado: boolean; erroDoAviso: string | null } | null = null;
    if (b.pixAutomatico !== undefined && b.pixAutomatico !== (antes?.pixAutomatico ?? false) && antes?.asaasChave && !c.get("demonstracao")) {
      const conta = contaAsaas(dc(c), c.get("orgId"), antes);
      if (conta) {
        if (antes.asaasWebhookId) await removerWebhook(conta, antes.asaasWebhookId).catch(() => {});
        aviso = await ligarOAviso(dc(c), c.get("orgId"), { email: await emailDeQuemPediu(c) }, conta, b.pixAutomatico);
      }
    }
    await auditar(c, "cobranca.opcoes_alteradas", { pixAutomatico: b.pixAutomatico ?? null, regua: b.regua ? { ligada: b.regua.ligada, passos: b.regua.passos.map((p) => p.dias) } : null });
    return c.json({ aviso, estado: await estado(c) });
  });

  /** A chave da ZapSign do escritório, atrás de um interruptor. */
  app.put("/financeiro/cobranca/zapsign", async (c) => {
    soSocios(c);
    semDemonstracao(c);
    if (!deps.cofre) falha(503, "cofre_desligado", "O cofre das chaves não está ligado neste servidor. Fale com o suporte do Decreta.");
    const b = await corpo(c, z.object({ chave: z.string().trim().min(20).max(300).optional(), ambiente: ambiente.optional(), ligada: z.boolean().optional() }));
    const valores: Partial<typeof cobrancaConfig.$inferInsert> = {};
    if (b.chave) valores.zapsignChave = deps.cofre.cifrar(b.chave, c.get("orgId"));
    if (b.ambiente) valores.zapsignAmbiente = b.ambiente;
    if (b.ligada !== undefined) valores.zapsignLigada = b.ligada;
    if (b.chave && b.ligada === undefined) valores.zapsignLigada = true;
    if (!Object.keys(valores).length) falha(400, "nada_a_mudar", "Diga o que mudar.");
    await tenant(c, deps, (tx) => tx.insert(cobrancaConfig).values({ organizationId: c.get("orgId"), ...valores }).onConflictDoUpdate({ target: cobrancaConfig.organizationId, set: valores }));
    await auditar(c, "assinatura.zapsign_configurada", { chaveNova: !!b.chave, ligada: valores.zapsignLigada ?? null });
    return c.json({ estado: await estado(c) });
  });

  app.delete("/financeiro/cobranca/zapsign", async (c) => {
    soSocios(c);
    await tenant(c, deps, (tx) => tx.update(cobrancaConfig).set({ zapsignChave: null, zapsignLigada: false }).where(eq(cobrancaConfig.organizationId, c.get("orgId"))));
    await auditar(c, "assinatura.zapsign_removida");
    return c.json({ estado: await estado(c) });
  });

  /* ---------------- A cobrança de cada parcela ---------------- */

  app.post("/financeiro/parcelas/:id/cobranca", async (c) => {
    await exigirFinanceiro(c, deps);
    semDemonstracao(c);
    const parcelaId = id(c);
    const b = await corpo(c, z.object({ vencimento: z.string().refine(ehDia, "Data inválida.").optional() }));
    const hoje = hojeEm(c.get("timezone"));
    const emitida = await emitirCobranca(dc(c), c.get("orgId"), c.get("userId"), parcelaId, hoje, b.vencimento);
    await auditar(c, "cobranca.emitida", { parcelaId, vencimento: emitida.vencimento });
    return c.json(await tenant(c, deps, (tx) => parcelaNaTela(tx, hoje, parcelaId)), 201);
  });

  app.delete("/financeiro/parcelas/:id/cobranca", async (c) => {
    await exigirFinanceiro(c, deps);
    semDemonstracao(c);
    const parcelaId = id(c);
    await cancelarCobranca(dc(c), c.get("orgId"), parcelaId);
    await auditar(c, "cobranca.cancelada", { parcelaId });
    return c.json(await tenant(c, deps, (tx) => parcelaNaTela(tx, hojeEm(c.get("timezone")), parcelaId)));
  });

  /** O QR Code de autorização do Pix Automático da mensalidade: o cliente autoriza uma vez e as cobranças dos meses saem ligadas a ele. */
  app.post("/financeiro/contratos/:id/pix-automatico", async (c) => {
    await exigirFinanceiro(c, deps);
    semDemonstracao(c);
    const contratoId = id(c);
    const a = await autorizarPixAutomatico(dc(c), c.get("orgId"), contratoId, hojeEm(c.get("timezone")));
    await auditar(c, "cobranca.pix_automatico_pedido", { contratoId });
    return c.json({ situacao: a.situacao, payload: a.payload, imagem: a.imagem }, 201);
  });

  /* ---------------- Lembretes ---------------- */

  /**
   * Um lembrete de cobrança pedido à mão: vira rascunho de mensagem ao cliente, com o texto aprovado pelo escritório (o do dia
   * do vencimento, ou o primeiro), que o advogado confere e envia na tela de mensagens. Nada sai daqui.
   */
  app.post("/financeiro/parcelas/:id/lembrete", async (c) => {
    await exigirFinanceiro(c, deps);
    const parcelaId = id(c);
    const hoje = hojeEm(c.get("timezone"));
    const cfg = await configDoEscritorio(db, c.get("orgId"));
    const passos = cfg?.regua.aprovadaEm && cfg.regua.passos.length ? cfg.regua.passos : PASSOS_PADRAO_DA_REGUA;
    const texto = (passos.find((p) => p.dias === 0) ?? passos[0]!).texto;
    const mensagem = await tenant(c, deps, async (tx) => {
      const mensagemId = await criarLembrete(tx, c.get("orgId"), c.get("userId"), parcelaId, hoje, texto, null);
      return mensagemNaTela(tx, c, deps, mensagemId!);
    });
    await auditar(c, "lembrete.criado", { parcelaId });
    return c.json(mensagem, 201);
  });

  /** Os lembretes que esperam um advogado aprovar, dos mais antigos para os mais novos: a régua os deixa, e nenhum sai sozinho. */
  app.get("/financeiro/lembretes", async (c) => {
    await exigirFinanceiro(c, deps);
    return tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select({ mensagemId: mensagensCliente.id, parcelaId: parcelasHonorarios.id, descricao: parcelasHonorarios.descricao, vencimento: parcelasHonorarios.vencimento, cliente: { id: clientes.id, nome: clientes.nome }, criadaEm: mensagensCliente.createdAt, passo: lembretesDeCobranca.passo })
        .from(lembretesDeCobranca)
        .innerJoin(mensagensCliente, eq(mensagensCliente.id, lembretesDeCobranca.mensagemId))
        .innerJoin(parcelasHonorarios, eq(parcelasHonorarios.id, lembretesDeCobranca.parcelaId))
        .innerJoin(clientes, eq(clientes.id, mensagensCliente.clienteId))
        .where(eq(mensagensCliente.situacao, "rascunho"))
        .orderBy(asc(mensagensCliente.createdAt))
        .limit(100);
      return c.json({ itens: linhas.map((l) => ({ ...l, criadaEm: l.criadaEm.toISOString() })) });
    });
  });

  /** Os lembretes de uma parcela, dos mais novos para os mais antigos. */
  app.get("/financeiro/parcelas/:id/lembretes", async (c) => {
    await exigirFinanceiro(c, deps);
    const parcelaId = id(c);
    return tenant(c, deps, async (tx) => {
      const ids = await tx.select({ id: lembretesDeCobranca.mensagemId }).from(lembretesDeCobranca).where(eq(lembretesDeCobranca.parcelaId, parcelaId)).orderBy(desc(lembretesDeCobranca.createdAt));
      const mensagens = ids.length ? await tx.select({ id: mensagensCliente.id }).from(mensagensCliente).where(inArray(mensagensCliente.id, ids.map((x) => x.id))) : [];
      const existentes = new Set(mensagens.map((m) => m.id));
      return c.json({ itens: await Promise.all(ids.filter((x) => existentes.has(x.id)).map((x) => mensagemNaTela(tx, c, deps, x.id))) });
    });
  });

  async function emailDeQuemPediu(c: C): Promise<string> {
    const pessoas = await tenant(c, deps, (tx) => pessoasDoEscritorio(db, tx, c.get("orgId")));
    return pessoas.get(c.get("userId"))?.email ?? "";
  }
}
