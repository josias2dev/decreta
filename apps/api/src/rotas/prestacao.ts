/**
 * Do alvará ao honorário: a conta do alvará sacado, a confirmação (um clique de uma pessoa), a
 * prestação de contas em DOCX no timbre e o repasse ao cliente, com mais de um favorecido se for
 * o caso. Tudo vai para o registro de atividades.
 */
import { ehDia, hojeEm, TETO_EM_CENTAVOS, textoDaPrestacaoDeContas, TITULO_DA_PRESTACAO, type DadosDaPrestacao } from "@decreta/core";
import { alvaras, clientes, contratosHonorarios, documentos, prestacoesDeContas, processos, type Tx } from "@decreta/db";
import { chaveDoDocumento, MIME_DOCX, nomeDoArquivo } from "@decreta/documentos";
import { eq } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { cancelarCobranca } from "../servicos/cobranca-de-honorarios.ts";
import { conferirDesfazer, confirmarPrestacao, contaDoAlvara, desfazerPrestacao, estornarRepasse, prestacaoPorId, registrarRepasse, prestacaoDoAlvara } from "../servicos/prestacao.ts";
import { pessoasDoEscritorio } from "../servicos/pessoas.ts";
import { docxNoTimbre, timbreDoEscritorio } from "../servicos/timbre.ts";
import { corpo, exigirFinanceiro, falha, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const centavos = z.number().int().min(1).max(TETO_EM_CENTAVOS);

export function rotasDaPrestacao(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const auditar = (c: C, acao: string, detalhes: Record<string, unknown>) => registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes, ip: ip(c) }, deps.log);

  /** A conta do alvará: o contrato, o valor que caiu, a parte do escritório e a do cliente, e a prestação de contas se já foi confirmada. */
  app.get("/financeiro/alvaras/:id/conta", async (c) => {
    await exigirFinanceiro(c, deps);
    const contrato = c.req.query("contrato");
    return c.json(await tenant(c, deps, (tx) => contaDoAlvara(tx, id(c), contrato && /^[0-9a-f-]{36}$/i.test(contrato) ? contrato : null)));
  });

  /**
   * O clique que confirma a conta. Vai junto o que a pessoa viu (honorário e parte do cliente): se a conta mudou
   * nesse meio-tempo, a confirmação é recusada e ela confere de novo.
   */
  app.post("/financeiro/alvaras/:id/prestacao", async (c) => {
    await exigirFinanceiro(c, deps);
    const alvaraId = id(c);
    const b = await corpo(
      c,
      z.object({
        contratoId: z.string().uuid().nullable().optional(),
        honorario: z.number().int().min(0).max(TETO_EM_CENTAVOS),
        cliente: z.number().int().min(0).max(TETO_EM_CENTAVOS),
        retidoNoSaque: z.boolean().optional(),
        observacao: z.string().trim().max(500).nullable().optional(),
      }),
    );
    const hoje = hojeEm(c.get("timezone"));
    const r = await tenant(c, deps, async (tx) => {
      const feita = await confirmarPrestacao(tx, c.get("orgId"), c.get("userId"), alvaraId, b, hoje);
      return { ...feita, conta: await contaDoAlvara(tx, alvaraId) };
    });
    await auditar(c, "prestacao.confirmada", { alvaraId, prestacaoId: r.prestacao.id, contratoId: r.prestacao.contratoId, valorRecebido: r.prestacao.valorRecebido, honorario: r.prestacao.honorario, cliente: r.prestacao.cliente, retidoNoSaque: r.prestacao.retidoNoSaque });
    return c.json(r.conta, 201);
  });

  app.post("/financeiro/prestacoes/:id/desfazer", async (c) => {
    await exigirFinanceiro(c, deps);
    const prestacaoId = id(c);
    const b = await corpo(c, z.object({ motivo: z.string().trim().min(3).max(300) }));
    // A parcela do êxito pode ter cobrança emitida: ela sai do Asaas antes, para o desfazer não deixar um link de pagamento vivo. Se o Asaas recusar, nada é desfeito.
    const { cobrancaDaParcela } = await tenant(c, deps, (tx) => conferirDesfazer(tx, prestacaoId));
    if (cobrancaDaParcela) await cancelarCobranca({ db: deps.db, cofre: deps.cofre, fetch: deps.fetchDosProvedores, log: deps.log, enderecoDaApi: deps.enderecoDaApi }, c.get("orgId"), cobrancaDaParcela);
    const alvaraId = await tenant(c, deps, async (tx) => {
      const p = await prestacaoPorId(tx, prestacaoId);
      await desfazerPrestacao(tx, prestacaoId, c.get("userId"), b.motivo);
      return p.alvaraId;
    });
    await auditar(c, "prestacao.desfeita", { alvaraId, prestacaoId, motivo: b.motivo });
    return c.json(await tenant(c, deps, (tx) => contaDoAlvara(tx, alvaraId)));
  });

  /** O repasse da parte do cliente, a quem ele indicar. A soma dos repasses não passa da parte do cliente. */
  app.post("/financeiro/prestacoes/:id/repasses", async (c) => {
    await exigirFinanceiro(c, deps);
    const prestacaoId = id(c);
    const b = await corpo(
      c,
      z.object({
        favorecido: z.string().trim().min(2).max(200),
        favorecidoDocumento: z.string().trim().max(20).nullable().optional(),
        conta: z.string().trim().min(3).max(300),
        valor: centavos,
        repassadoEm: z.string().refine(ehDia, "Data inválida."),
        observacao: z.string().trim().max(500).nullable().optional(),
      }),
    );
    const hoje = hojeEm(c.get("timezone"));
    if (b.repassadoEm > hoje) falha(422, "repasse_no_futuro", "A data do repasse não pode ser de amanhã em diante.");
    const r = await tenant(c, deps, async (tx) => {
      const prestacao = await prestacaoPorId(tx, prestacaoId);
      const feito = await registrarRepasse(tx, c.get("orgId"), c.get("userId"), prestacaoId, b);
      return { repasse: feito.repasse, conta: await contaDoAlvara(tx, prestacao.alvaraId) };
    });
    await auditar(c, "repasse.registrado", { prestacaoId, repasseId: r.repasse.id, favorecido: b.favorecido, valor: b.valor, repassadoEm: b.repassadoEm });
    return c.json(r.conta, 201);
  });

  app.post("/financeiro/repasses/:id/estornar", async (c) => {
    await exigirFinanceiro(c, deps);
    const repasseId = id(c);
    const b = await corpo(c, z.object({ motivo: z.string().trim().min(3).max(300) }));
    const { prestacaoId, alvaraId } = await tenant(c, deps, async (tx) => {
      const r = await estornarRepasse(tx, repasseId, c.get("userId"), b.motivo);
      return { prestacaoId: r.prestacaoId, alvaraId: (await prestacaoPorId(tx, r.prestacaoId)).alvaraId };
    });
    await auditar(c, "repasse.desfeito", { prestacaoId, repasseId, motivo: b.motivo });
    return c.json(await tenant(c, deps, (tx) => contaDoAlvara(tx, alvaraId)));
  });

  /* ---------------- A prestação de contas em DOCX ---------------- */

  async function dadosDoDocumento(tx: Tx, c: C, prestacaoId: string): Promise<{ dados: DadosDaPrestacao; processoId: string; clienteId: string | null; alvaraDescricao: string }> {
    const prestacao = await prestacaoPorId(tx, prestacaoId);
    const [l] = await tx
      .select({ a: alvaras, processo: processos, cliente: clientes })
      .from(alvaras)
      .innerJoin(processos, eq(processos.id, alvaras.processoId))
      .leftJoin(clientes, eq(clientes.id, processos.clienteId))
      .where(eq(alvaras.id, prestacao.alvaraId));
    if (!l) falha(404, "nao_encontrado");
    const [contrato] = prestacao.contratoId ? await tx.select({ titulo: contratosHonorarios.titulo }).from(contratosHonorarios).where(eq(contratosHonorarios.id, prestacao.contratoId)) : [];
    const atual = await prestacaoDoAlvara(tx, prestacao.alvaraId);
    const eu = (await pessoasDoEscritorio(db, tx, c.get("orgId"))).get(c.get("userId"));
    const t = await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome"));
    const onde = l.processo.orgao && l.processo.comarca ? `${l.processo.orgao} de ${l.processo.comarca}` : (l.processo.orgao ?? l.processo.comarca ?? null);
    return {
      processoId: l.processo.id,
      clienteId: l.cliente?.id ?? null,
      alvaraDescricao: l.a.descricao,
      dados: {
        escritorio: t.timbre.nome,
        cliente: l.cliente?.id ? { nome: l.cliente.nome, tipo: l.cliente.tipo, documento: l.cliente.documento } : null,
        processo: { titulo: l.processo.titulo, cnj: l.processo.cnj, onde: [onde, l.processo.tribunal].filter(Boolean).join(" · ") || null },
        alvara: { descricao: l.a.descricao, expedidoEm: l.a.expedidoEm, sacadoEm: l.a.sacadoEm },
        conta: { valorAlvara: prestacao.valorAlvara, valorRecebido: prestacao.valorRecebido, exitoBp: prestacao.exitoBp, honorario: prestacao.honorario, cliente: prestacao.cliente, semContrato: prestacao.semContrato, retidoNoSaque: prestacao.retidoNoSaque },
        contratoTitulo: contrato?.titulo ?? null,
        repasses: (atual?.repasses ?? []).filter((r) => !r.estornado).map((r) => ({ favorecido: r.favorecido, conta: r.conta, valor: r.valor, repassadoEm: r.repassadoEm })),
        responsavel: { nome: eu?.nome ?? c.get("userNome"), oab: eu?.oab ?? null },
        emitidaEm: hojeEm(c.get("timezone")),
      },
    };
  }

  /** Baixa a prestação de contas em DOCX, no timbre do escritório, com os repasses de agora. */
  app.get("/financeiro/prestacoes/:id/docx", async (c) => {
    await exigirFinanceiro(c, deps);
    const prestacaoId = id(c);
    const { dados, t } = await tenant(c, deps, async (tx) => ({ dados: await dadosDoDocumento(tx, c, prestacaoId), t: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")) }));
    const docx = await docxNoTimbre(deps.arquivos, t, { titulo: TITULO_DA_PRESTACAO, texto: textoDaPrestacaoDeContas(dados.dados) });
    await auditar(c, "prestacao.baixada", { prestacaoId });
    return new Response(docx as Uint8Array<ArrayBuffer>, {
      headers: {
        "content-type": MIME_DOCX,
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeDoArquivo(`${TITULO_DA_PRESTACAO} - ${dados.alvaraDescricao}`))}`,
        "cache-control": "no-store",
      },
    });
  });

  /** Guarda uma cópia da prestação de contas na pasta do processo e do cliente. */
  app.post("/financeiro/prestacoes/:id/guardar", async (c) => {
    await exigirFinanceiro(c, deps);
    const prestacaoId = id(c);
    const { dados, t } = await tenant(c, deps, async (tx) => ({ dados: await dadosDoDocumento(tx, c, prestacaoId), t: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")) }));
    const docx = await docxNoTimbre(deps.arquivos, t, { titulo: TITULO_DA_PRESTACAO, texto: textoDaPrestacaoDeContas(dados.dados) });
    const docId = crypto.randomUUID();
    const chave = chaveDoDocumento(c.get("orgId"), docId);
    await deps.arquivos.put(chave, docx, MIME_DOCX);
    const nome = `${nomeDoArquivo(`${TITULO_DA_PRESTACAO} - ${dados.alvaraDescricao}`)}`;
    await tenant(c, deps, async (tx) => {
      await tx.insert(documentos).values({ id: docId, organizationId: c.get("orgId"), processoId: dados.processoId, clienteId: dados.clienteId, nome, mime: MIME_DOCX, tamanho: docx.length, chave, origem: "peca", enviadoPor: c.get("userId") });
      await tx.update(prestacoesDeContas).set({ documentoId: docId }).where(eq(prestacoesDeContas.id, prestacaoId));
    });
    await auditar(c, "prestacao.guardada", { prestacaoId, documentoId: docId });
    return c.json({ documentoId: docId, nome }, 201);
  });
}
