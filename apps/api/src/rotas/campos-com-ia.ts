/**
 * A IA nos campos de texto e a base legal. Uma rota para todos os campos: o campo
 * diz o contexto e o prompt. Nada entra no campo por aqui: a rota devolve a prévia,
 * e a tela só usa com o clique da pessoa. A consulta da base legal não passa pelos
 * limites nem pela IA: a tabela e o texto da lei valem com a IA desligada.
 */
import { baseLegalDaTabela, CAMPOS_COM_IA, citacaoDaBaseLegal, MODOS_DO_CAMPO, ritoDoProcesso, type Rito } from "@decreta/core";
import { processos, publicacoes, textosDaIa, type ConteudoDoTextoDaIa } from "@decreta/db";
import { colherChamadas, ehTetoDoGateway, escreverNoCampo, IaRecusou, sugerirBaseLegal, type ChamadaDaIa } from "@decreta/ia";
import { and, eq, isNull } from "drizzle-orm";
import type { Hono } from "hono";
import { z } from "zod";
import { verificarCitacoes } from "../servicos/acervo.ts";
import { materialDoCampo } from "../servicos/campos-com-ia.ts";
import { ClienteSemIa, semIa } from "../servicos/contexto.ts";
import { procedenciaDe } from "../servicos/procedencia.ts";
import { AVISOS, LimiteDaIa } from "../servicos/uso-ia.ts";
import { comLimiteDaIa, corpo, falha, iaDaRota, id, temAcessoFinanceiro, tenant, type Ambiente, type C, type DepsDasRotas } from "./base.ts";

/** Um pouco mais que o maior campo das telas (a mensagem ao cliente vai até 3.000). */
const TETO_DO_RASCUNHO = 8_000;
const FORA_DO_AR = "A IA não respondeu agora. O seu texto continua no campo. Tente de novo em instantes.";

const uuid = z.string().uuid().optional();

const pedidoDoCampo = z.object({
  campo: z.enum(CAMPOS_COM_IA),
  modo: z.enum(MODOS_DO_CAMPO),
  texto: z.string().max(TETO_DO_RASCUNHO, "O texto do campo passa do tamanho que a IA aceita. Encurte e tente de novo.").default(""),
  alvo: z.object({ publicacaoId: uuid, prazoId: uuid, processoId: uuid, clienteId: uuid, mensagemId: uuid, negocioId: uuid, alvaraId: uuid, tipoDePeca: z.string().max(80).optional() }).default({}),
});

export function rotasDosCamposComIa(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;
  const comIa = comLimiteDaIa(deps);

  /** O registro do que a IA escreveu, para a procedência. Devolve o id que a tela manda de volta ao usar. */
  const registrar = async (c: C, campo: string, modo: string, dono: { processoId: string | null; clienteId: string | null }, chamadas: ChamadaDaIa[], r: { situacao: "pronto" | "recusa" | "erro"; conteudo: ConteudoDoTextoDaIa; erro?: string }) => {
    const [linha] = await tenant(c, deps, (tx) =>
      tx
        .insert(textosDaIa)
        .values({ organizationId: c.get("orgId"), campo, modo, ...dono, situacao: r.situacao, conteudo: r.conteudo, erro: r.erro ?? null, procedencia: procedenciaDe(chamadas), pedidaPor: c.get("userId") })
        .returning({ id: textosDaIa.id }),
    );
    return linha!.id;
  };

  /** Falha da IA: o teto do dia diz que é o teto; o resto fica anotado, e a tela avisa que o campo continua igual. */
  const falhaDaIa = async (c: C, campo: string, modo: string, dono: { processoId: string | null; clienteId: string | null }, chamadas: ChamadaDaIa[], err: unknown): Promise<never> => {
    if (ehTetoDoGateway(err)) throw new LimiteDaIa(AVISOS.gateway);
    // A pessoa cancelou ou fechou a tela: não é falha, e ninguém espera a resposta.
    if (c.req.raw.signal.aborted) falha(503, "ia_cancelada");
    const erro = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    deps.log("IA do campo falhou", { campo, modo, error: erro });
    await registrar(c, campo, modo, dono, chamadas, { situacao: "erro", conteudo: {}, erro });
    return falha(503, "ia_falhou", FORA_DO_AR);
  };

  app.post("/ia/campo", comIa, async (c) => {
    const ia = iaDaRota(c);
    const b = await corpo(c, pedidoDoCampo);
    const veCobranca = b.alvo.mensagemId ? await temAcessoFinanceiro(c, deps) : true;
    const material = await tenant(c, deps, (tx) => materialDoCampo(tx, b.campo, b.alvo, { veCobranca }));
    const dono = { processoId: material.processoId, clienteId: material.clienteId };
    const chamadas: ChamadaDaIa[] = [];
    try {
      const r = await colherChamadas(chamadas, () => escreverNoCampo(ia, { campo: b.campo, modo: b.modo, rascunho: b.texto, contexto: material.contexto }, c.req.raw.signal));
      const textoId = await registrar(c, b.campo, b.modo, dono, chamadas, { situacao: "pronto", conteudo: { texto: r.texto, dicas: r.dicas, trocados: r.trocados } });
      return c.json({ id: textoId, situacao: "pronto" as const, ...r });
    } catch (err) {
      if (!(err instanceof IaRecusou)) return await falhaDaIa(c, b.campo, b.modo, dono, chamadas, err);
      const textoId = await registrar(c, b.campo, b.modo, dono, chamadas, { situacao: "recusa", conteudo: { recusa: err.motivo } });
      return c.json({ id: textoId, situacao: "recusa" as const, motivo: err.motivo });
    }
  });

  /** A pessoa clicou em Usar: fica anotado que este texto entrou no campo. Só quem pediu marca. */
  app.post("/ia/campo/:id/usado", async (c) => {
    const textoId = id(c);
    const usados = await tenant(c, deps, (tx) =>
      tx
        .update(textosDaIa)
        .set({ usadoEm: new Date() })
        .where(and(eq(textosDaIa.id, textoId), eq(textosDaIa.pedidaPor, c.get("userId")), isNull(textosDaIa.usadoEm)))
        .returning({ id: textosDaIa.id }),
    );
    if (!usados.length) falha(404, "nao_encontrado");
    return c.json({ ok: true });
  });

  /* ---------------- Base legal ---------------- */

  /** O processo que decide a lei da contagem e se o cliente recusou a IA. */
  const processoDaBase = async (c: C, processoId: string | null | undefined) => {
    if (!processoId) return { rito: "cpc" as Rito, semIa: false, processo: null };
    return tenant(c, deps, async (tx) => {
      const [p] = await tx.select({ tribunal: processos.tribunal, classe: processos.classe, orgao: processos.orgao, assunto: processos.assunto }).from(processos).where(eq(processos.id, processoId));
      if (!p) falha(404, "nao_encontrado");
      return { rito: ritoDoProcesso(p), semIa: await semIa(tx, { processoId }), processo: p };
    });
  };

  /** O texto da lei para o que está no campo. Vazio quando o texto não diz um artigo. */
  const textoDaLei = async (c: C, fundamento: string | null | undefined) => {
    const citacao = fundamento ? citacaoDaBaseLegal(fundamento) : "";
    const lei = citacao ? await verificarCitacoes({ db, fetch: deps.captura.fetch, log: deps.log }, c.get("orgId"), citacao) : [];
    return { reconhecida: !!citacao, lei: lei.map(({ trecho, selo, motivo, texto, fonte }) => ({ trecho, selo, motivo, texto, fonte })) };
  };

  /** A tabela fixa para "O que fazer" e o texto da lei para o que está no campo. Nada aqui chama a IA. */
  app.post("/base-legal", async (c) => {
    const b = await corpo(c, z.object({ tipo: z.string().trim().max(200).default(""), processoId: z.string().uuid().nullable().optional(), fundamento: z.string().trim().max(200).nullable().optional() }));
    const quem = await processoDaBase(c, b.processoId);
    return c.json({ tabela: baseLegalDaTabela(b.tipo, quem.rito), semIa: quem.semIa, ...(await textoDaLei(c, b.fundamento)) });
  });

  /** A tabela não soube: a IA sugere o artigo, e o acervo diz se o achou. Não mexe em prazo nenhum. */
  app.post("/ia/base-legal", comIa, async (c) => {
    const ia = iaDaRota(c);
    const b = await corpo(c, z.object({ tipo: z.string().trim().min(2, "Diga o que fazer antes de pedir a base legal.").max(200), processoId: z.string().uuid().nullable().optional(), publicacaoId: z.string().uuid().nullable().optional() }));
    const pub = b.publicacaoId ? (await tenant(c, deps, (tx) => tx.select({ texto: publicacoes.texto, processoId: publicacoes.processoId }).from(publicacoes).where(eq(publicacoes.id, b.publicacaoId!))))[0] : undefined;
    if (b.publicacaoId && !pub) falha(404, "nao_encontrado");
    const processoId = b.processoId ?? pub?.processoId ?? null;
    const quem = await processoDaBase(c, processoId);
    // A publicação pode ser de outro processo que o pedido: a recusa do dono dela vale também, porque o teor vai ao modelo.
    const pubDeQuemRecusou = !!pub?.processoId && pub.processoId !== processoId && (await tenant(c, deps, (tx) => semIa(tx, { processoId: pub.processoId })));
    if (quem.semIa || pubDeQuemRecusou) throw new ClienteSemIa();
    const tabela = baseLegalDaTabela(b.tipo, quem.rito);
    if (tabela) return c.json({ situacao: "tabela" as const, tabela, ...(await textoDaLei(c, tabela.fundamento)) });
    const dono = { processoId, clienteId: null };
    const chamadas: ChamadaDaIa[] = [];
    try {
      const r = await colherChamadas(chamadas, () => sugerirBaseLegal(ia, { tipo: b.tipo, rito: quem.rito, processo: quem.processo && { classe: quem.processo.classe, assunto: quem.processo.assunto, tribunal: quem.processo.tribunal }, publicacao: pub?.texto ?? null }, c.req.raw.signal));
      const textoId = await registrar(c, "base-legal", "sugerir", dono, chamadas, { situacao: "pronto", conteudo: r });
      return c.json({ id: textoId, situacao: "pronto" as const, ...r, ...(await textoDaLei(c, r.fundamento)) });
    } catch (err) {
      if (!(err instanceof IaRecusou)) return await falhaDaIa(c, "base-legal", "sugerir", dono, chamadas, err);
      const textoId = await registrar(c, "base-legal", "sugerir", dono, chamadas, { situacao: "recusa", conteudo: { recusa: err.motivo } });
      return c.json({ id: textoId, situacao: "recusa" as const, motivo: err.motivo });
    }
  });
}
