/**
 * Cálculos (Fase 4): atualização monetária nos três regimes, revisional
 * bancária, parâmetros e linha do tempo do previdenciário e o resumo do
 * PJe-Calc. A memória de cálculo fica guardada, sai em DOCX no timbre, pode
 * ser anexada ao processo e entra no pedido da peça que lhe cabe.
 *
 * As fontes (SGS, SIDRA e Olinda) são públicas e sem chave. Na demonstração,
 * nada sai daqui: os índices vêm do retrato em demonstracao/indices.json.
 */
import {
  atualizar,
  compararTaxas,
  diaDoInstante,
  ehDia,
  ErroDeCalculo,
  hojeEm,
  linhaDoTempoPrevidenciaria,
  memoriaDaAtualizacao,
  memoriaDaRevisional,
  memoriaDoPjeCalc,
  parametrosPrevidenciarios,
  resumoDoPjeCalc,
  type PedidoDeAtualizacao,
} from "@decreta/core";
import { calculos, documentos, processos, type Tx } from "@decreta/db";
import { chaveDoDocumento, lerDocumento, MIME_DOCX, nomeDoArquivo, varrerDocumento } from "@decreta/documentos";
import { MODALIDADES_BCB, taxasDoMesNaOlinda } from "@decreta/tribunais";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { fetchDaDemonstracao } from "../demonstracao/indices.ts";
import { FonteFora, indicesDaAtualizacao } from "../servicos/calculos.ts";
import { docxNoTimbre, timbreDoEscritorio } from "../servicos/timbre.ts";
import { corpo, falha, id, ip, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

const dia = z.string().refine(ehDia, "data no formato AAAA-MM-DD");
const PLANO_REAL = "1994-07-01";
const EC_113_DIA = "2021-12-09";
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "mês no formato AAAA-MM");

const pedidoDeAtualizacao = z.object({
  processoId: z.string().uuid().nullable().optional(),
  titulo: z.string().trim().min(2).max(200),
  regime: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("civil") }),
    z.object({ tipo: z.literal("fazenda"), expedicao: dia.optional() }),
    z.object({ tipo: z.literal("contratual"), indice: z.enum(["ipca", "inpc", "ipcae", "selic", "tr", "nenhum"]), jurosAoMes: z.number().min(0).max(20) }),
  ]),
  dataDoCalculo: dia,
  jurosDesde: dia.optional(),
  parcelas: z
    .array(z.object({ descricao: z.string().trim().min(1).max(200), valor: z.number().positive().max(1e12), vencimento: dia }))
    .min(1)
    .max(240),
});

const pedidoDeRevisional = z.object({
  processoId: z.string().uuid().nullable().optional(),
  titulo: z.string().trim().min(2).max(200).optional(),
  modalidade: z.string().min(1).max(200),
  segmento: z.enum(["Pessoa Física", "Pessoa Jurídica"]).optional(),
  mes,
  cnpj8: z.string().regex(/^\d{8}$/),
  taxaContratoAoMes: z.number().positive().max(100),
});

export function rotasDosCalculos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  /** A demonstração lê o retrato; o escritório de verdade, as fontes. */
  const fontes = (c: C): typeof fetch => (c.get("demonstracao") ? fetchDaDemonstracao : (deps.captura.fetch ?? fetch));
  const auditar = (c: C, acao: string, detalhes: Record<string, unknown>) =>
    registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao, detalhes, ip: ip(c) }, deps.log);

  async function processoDoCalculo(tx: Tx, processoId: string | null | undefined): Promise<{ id: string; rotulo: string } | null> {
    if (!processoId) return null;
    const [p] = await tx.select({ id: processos.id, cnj: processos.cnj, titulo: processos.titulo }).from(processos).where(eq(processos.id, processoId));
    if (!p) falha(404, "processo_nao_encontrado");
    return { id: p.id, rotulo: p.cnj ?? p.titulo };
  }

  async function guardar(c: C, v: { processoId: string | null; tipo: "atualizacao" | "revisional" | "pjecalc"; titulo: string; entrada: object; resultado: object; memoria: string; documentoId?: string | null }) {
    const [linha] = await tenant(c, deps, (tx) =>
      tx
        .insert(calculos)
        .values({ organizationId: c.get("orgId"), criadoPor: c.get("userId"), ...v, entrada: v.entrada as Record<string, unknown>, resultado: v.resultado as Record<string, unknown> })
        .returning(),
    );
    await auditar(c, "calculo.feito", { calculoId: linha!.id, tipo: v.tipo });
    return linha!;
  }

  const emJson = (k: typeof calculos.$inferSelect) => ({
    id: k.id,
    processoId: k.processoId,
    tipo: k.tipo,
    titulo: k.titulo,
    entrada: k.entrada,
    resultado: k.resultado,
    memoria: k.memoria,
    documentoId: k.documentoId,
    criadoEm: k.createdAt.toISOString(),
  });

  /** O total que a lista mostra, por tipo de cálculo. */
  const totalDe = (k: typeof calculos.$inferSelect): number | null => {
    const r = k.resultado as { total?: { total?: number }; totalReclamado?: number | null };
    return k.tipo === "atualizacao" ? (r.total?.total ?? null) : k.tipo === "pjecalc" ? (r.totalReclamado ?? null) : null;
  };

  app.get("/calculos", async (c) => {
    const processoId = c.req.query("processo");
    return tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select()
        .from(calculos)
        .where(processoId ? eq(calculos.processoId, processoId) : undefined)
        .orderBy(desc(calculos.createdAt))
        .limit(100);
      return c.json({ itens: linhas.map((k) => ({ id: k.id, processoId: k.processoId, tipo: k.tipo, titulo: k.titulo, total: totalDe(k), documentoId: k.documentoId, criadoEm: k.createdAt.toISOString() })) });
    });
  });

  app.get("/calculos/modalidades", (c) => c.json({ itens: MODALIDADES_BCB }));

  /** As taxas do mês por banco, na modalidade: a pessoa escolhe o banco do contrato. */
  app.get("/calculos/taxas", async (c) => {
    const r = z.object({ modalidade: z.string().min(1), mes, segmento: z.enum(["Pessoa Física", "Pessoa Jurídica"]).optional() }).safeParse(c.req.query());
    if (!r.success) falha(400, "dados_invalidos");
    if (!MODALIDADES_BCB.some((m) => m.modalidade === r.data.modalidade)) falha(422, "modalidade_desconhecida");
    const bancos = await taxasDoMesNaOlinda(r.data, { fetch: fontes(c) }).catch((err) => falha(503, "taxas_indisponiveis", `O Banco Central não respondeu agora. ${err instanceof Error ? err.message : ""}`.trim()));
    return c.json({ modalidade: r.data.modalidade, mes: r.data.mes, bancos });
  });

  /**
   * O que a tela do previdenciário mostra: o teto e o salário mínimo do dia
   * e a linha do tempo dos documentos lidos. Nada fica gravado (dado de saúde).
   */
  app.get("/calculos/previdenciario", async (c) => {
    const processoId = c.req.query("processo") ?? "";
    if (!z.string().uuid().safeParse(processoId).success) falha(404, "nao_encontrado");
    const quando = c.req.query("dia");
    const hoje = quando && ehDia(quando) ? quando : hojeEm(c.get("timezone"));
    return tenant(c, deps, async (tx) => {
      await processoDoCalculo(tx, processoId);
      const docs = await tx
        .select({ id: documentos.id, nome: documentos.nome, texto: documentos.texto, evento: documentos.evento, criadoEm: documentos.createdAt })
        .from(documentos)
        .where(and(eq(documentos.processoId, processoId), isNotNull(documentos.texto)))
        .orderBy(desc(documentos.createdAt))
        .limit(300);
      const linhaDoTempo = linhaDoTempoPrevidenciaria(docs.map((d) => ({ ...d, criadoEm: diaDoInstante(d.criadoEm, c.get("timezone")) })));
      return c.json({ dia: hoje, parametros: parametrosPrevidenciarios(hoje), linhaDoTempo });
    });
  });

  app.get("/calculos/:id", async (c) => {
    const calculoId = id(c);
    const [k] = await tenant(c, deps, (tx) => tx.select().from(calculos).where(eq(calculos.id, calculoId)));
    if (!k) falha(404, "nao_encontrado");
    return c.json(emJson(k));
  });

  app.post("/calculos/atualizacao", async (c) => {
    const b = await corpo(c, pedidoDeAtualizacao);
    if (b.parcelas.some((p) => p.vencimento > b.dataDoCalculo)) falha(422, "vencimento_depois_do_calculo", "Há parcela que vence depois da data do cálculo.");
    // A faixa de datas também protege o servidor: cada mês é uma volta da conta e, na TR, um pedido ao Banco Central.
    if (b.dataDoCalculo > hojeEm(c.get("timezone"))) falha(422, "calculo_no_futuro", "A data do cálculo não pode ser depois de hoje: os índices ainda não existem.");
    if (b.parcelas.some((p) => p.vencimento < PLANO_REAL) || (b.jurosDesde && b.jurosDesde < PLANO_REAL)) falha(422, "antes_do_real", "Datas anteriores a 01/07/1994 (Plano Real) não entram: as séries de índices começam ali.");
    if (b.jurosDesde && b.jurosDesde > b.dataDoCalculo) falha(422, "juros_depois_do_calculo", "O início dos juros não pode ser depois da data do cálculo.");
    if (b.regime.tipo === "fazenda" && b.regime.expedicao && (b.regime.expedicao < EC_113_DIA || b.regime.expedicao > b.dataDoCalculo)) falha(422, "expedicao_fora", "A expedição do requisitório precisa ficar entre 09/12/2021 (EC 113) e a data do cálculo.");
    const processo = await tenant(c, deps, (tx) => processoDoCalculo(tx, b.processoId));
    const pedido: PedidoDeAtualizacao = { parcelas: b.parcelas, dataDoCalculo: b.dataDoCalculo, jurosDesde: b.jurosDesde, regime: b.regime };
    let lidos: Awaited<ReturnType<typeof indicesDaAtualizacao>>;
    try {
      lidos = await indicesDaAtualizacao(pedido, fontes(c));
    } catch (err) {
      if (err instanceof FonteFora) falha(503, "indices_indisponiveis", "O Banco Central não respondeu agora. Tente de novo em alguns minutos.");
      throw err;
    }
    let resultado: ReturnType<typeof atualizar>;
    try {
      resultado = atualizar(pedido, lidos.indices);
    } catch (err) {
      if (err instanceof ErroDeCalculo) falha(422, "calculo_impossivel", err.message);
      throw err;
    }
    const memoria = memoriaDaAtualizacao(pedido, resultado, { titulo: b.titulo, processo: processo?.rotulo, fontes: lidos.fontes });
    const k = await guardar(c, { processoId: processo?.id ?? null, tipo: "atualizacao", titulo: b.titulo, entrada: pedido, resultado, memoria });
    return c.json(emJson(k), 201);
  });

  app.post("/calculos/revisional", async (c) => {
    const b = await corpo(c, pedidoDeRevisional);
    if (!MODALIDADES_BCB.some((m) => m.modalidade === b.modalidade)) falha(422, "modalidade_desconhecida");
    const processo = await tenant(c, deps, (tx) => processoDoCalculo(tx, b.processoId));
    const taxas = await taxasDoMesNaOlinda({ modalidade: b.modalidade, mes: b.mes, cnpj8: b.cnpj8, segmento: b.segmento }, { fetch: fontes(c) }).catch(() =>
      falha(503, "taxas_indisponiveis", "O Banco Central não respondeu agora. Tente de novo em alguns minutos."),
    );
    const banco = taxas[0] ?? falha(422, "banco_sem_taxa", "O Banco Central não publicou a taxa deste banco nessa modalidade e mês.");
    const dados = { banco: banco.instituicao, modalidade: b.modalidade, mes: b.mes, contratoAoMes: b.taxaContratoAoMes, bancoAoMes: banco.taxaAoMes, bancoAoAno: banco.taxaAoAno, periodos: banco.periodos };
    const resultado = { ...dados, cnpj8: banco.cnpj8, comparacao: compararTaxas(b.taxaContratoAoMes, banco.taxaAoMes) };
    const k = await guardar(c, { processoId: processo?.id ?? null, tipo: "revisional", titulo: b.titulo ?? `Revisional · ${banco.instituicao}`, entrada: b, resultado, memoria: memoriaDaRevisional(dados) });
    return c.json(emJson(k), 201);
  });

  /** O relatório em PDF (e o .PJC, se vier) vão para o processo; o resumo sai do PDF. */
  app.post("/calculos/pjecalc", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const processoId = String(form?.get("processoId") ?? "");
    if (!z.string().uuid().safeParse(processoId).success) falha(400, "sem_processo");
    const relatorio = form!.get("relatorio");
    const pjc = form!.get("pjc");
    if (!(relatorio instanceof File) || !/pdf$/i.test(relatorio.type || relatorio.name)) falha(422, "sem_relatorio", "Envie o relatório do PJe-Calc em PDF.");
    if (pjc !== null && (!(pjc instanceof File) || !/\.pjc$/i.test(pjc.name))) falha(422, "pjc_invalido", "O arquivo do PJe-Calc termina em .PJC.");
    for (const f of [relatorio, pjc]) if (f instanceof File && f.size > deps.maxArquivoBytes) falha(422, "arquivo_grande", `O arquivo passa de ${Math.round(deps.maxArquivoBytes / 1e6)} MB.`);

    const bytes = new Uint8Array(await relatorio.arrayBuffer());
    const lido = await lerDocumento(bytes, "application/pdf").catch(() => ({ texto: null, paginas: null }));
    const resumo = lido.texto ? resumoDoPjeCalc(lido.texto) : null;
    if (!resumo) falha(422, "relatorio_nao_reconhecido", "Não achei o resumo do PJe-Calc neste PDF. Envie o relatório completo do cálculo.");
    const alertas = await varrerDocumento(bytes, "application/pdf").catch(() => []);
    const bytesDoPjc = pjc instanceof File ? new Uint8Array(await pjc.arrayBuffer()) : null;

    const ids = await tenant(c, deps, async (tx) => {
      await processoDoCalculo(tx, processoId);
      const guardarDoc = async (nome: string, mime: string, conteudo: Uint8Array, texto: string | null, paginas: number | null, alertasDoDoc: typeof alertas) => {
        const docId = crypto.randomUUID();
        const chave = chaveDoDocumento(c.get("orgId"), docId);
        await deps.arquivos.put(chave, conteudo, mime);
        await tx.insert(documentos).values({ id: docId, organizationId: c.get("orgId"), processoId, nome: nome.slice(0, 250), mime, tamanho: conteudo.length, paginas, chave, texto, alertas: alertasDoDoc, enviadoPor: c.get("userId") });
        return docId;
      };
      const relatorioId = await guardarDoc(relatorio.name || "relatorio-pjecalc.pdf", "application/pdf", bytes, lido.texto, lido.paginas, alertas);
      const pjcId = bytesDoPjc && pjc instanceof File ? await guardarDoc(pjc.name, "application/octet-stream", bytesDoPjc, null, null, []) : null;
      return { relatorioId, pjcId };
    });
    const liquidacao = resumo.dataLiquidacao ? ` · liquidação em ${resumo.dataLiquidacao.slice(8, 10)}/${resumo.dataLiquidacao.slice(5, 7)}/${resumo.dataLiquidacao.slice(0, 4)}` : "";
    const k = await guardar(c, {
      processoId,
      tipo: "pjecalc",
      titulo: `PJe-Calc${liquidacao}`,
      entrada: { relatorio: relatorio.name, pjc: pjc instanceof File ? pjc.name : null, pjcDocumentoId: ids.pjcId },
      resultado: resumo,
      memoria: memoriaDoPjeCalc(resumo),
      documentoId: ids.relatorioId,
    });
    return c.json(emJson(k), 201);
  });

  async function docxDoCalculo(c: C, calculoId: string) {
    const r = await tenant(c, deps, async (tx) => {
      const [k] = await tx.select().from(calculos).where(eq(calculos.id, calculoId));
      if (!k) falha(404, "nao_encontrado");
      return { k, timbre: await timbreDoEscritorio(tx, c.get("orgId"), c.get("orgNome")) };
    });
    const titulo = `Memória de cálculo · ${r.k.titulo}`;
    return { k: r.k, titulo, bytes: await docxNoTimbre(deps.arquivos, r.timbre, { titulo, texto: r.k.memoria }) };
  }

  app.get("/calculos/:id/docx", async (c) => {
    const { titulo, bytes } = await docxDoCalculo(c, id(c));
    return new Response(bytes, {
      headers: { "content-type": MIME_DOCX, "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomeDoArquivo(titulo))}`, "cache-control": "no-store" },
    });
  });

  /** O DOCX da memória entra nos documentos do processo, pronto para juntar. */
  app.post("/calculos/:id/anexar", async (c) => {
    const { k, titulo, bytes } = await docxDoCalculo(c, id(c));
    if (!k.processoId) falha(422, "sem_processo", "Este cálculo não está ligado a um processo.");
    const docId = crypto.randomUUID();
    const chave = chaveDoDocumento(c.get("orgId"), docId);
    await deps.arquivos.put(chave, bytes, MIME_DOCX);
    await tenant(c, deps, async (tx) => {
      await tx
        .insert(documentos)
        .values({ id: docId, organizationId: c.get("orgId"), processoId: k.processoId, nome: nomeDoArquivo(titulo), mime: MIME_DOCX, tamanho: bytes.length, chave, texto: k.memoria, origem: "peca", enviadoPor: c.get("userId") });
      await tx.update(calculos).set({ documentoId: docId }).where(eq(calculos.id, k.id));
    });
    await auditar(c, "calculo.anexado", { calculoId: k.id, documentoId: docId });
    return c.json({ documentoId: docId }, 201);
  });
}
