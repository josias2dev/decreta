/**
 * O link de envio que vai ao cliente na cobrança dos documentos (Fase 3.3):
 * sem login, com validade, só para a mensagem que o advogado aprovou e que
 * saiu. A foto vai para a pasta do cliente e passa pela leitura de documentos.
 *
 * O endereço traz o escritório e um segredo; o banco guarda só o hash dele.
 * Por ser aberto a quem tiver o link, o que entra aqui é conferido pelos
 * bytes, tem teto de tamanho e de quantidade, e poucos envios rodam ao mesmo
 * tempo. O limite de pedidos por endereço fica em `app.ts`.
 */
import { createHash } from "node:crypto";
import { hojeEm, RESPOSTA_AUTOMATICA } from "@decreta/core";
import { clientes, documentos, escritorios, mensagensCliente, organization, withTenant, type Database } from "@decreta/db";
import { chaveDoDocumento, lerDocumento, tipoPelosBytes, varrerDocumento, type Armazenamento } from "@decreta/documentos";
import type { Ia } from "@decreta/ia";
import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { registrar } from "../auditoria.ts";
import { ipDoPedido } from "../limitador.ts";
import { semIa } from "../servicos/contexto.ts";
import { precisaDeLeitura } from "../servicos/leitura.ts";
import { falha, type Pedido } from "./base.ts";

/** Quantos dias o link de envio vale depois que a mensagem sai. */
export const VALIDADE_DO_LINK_DIAS = 7;
/** Teto de arquivos por link: o link é sem senha. */
const ARQUIVOS_POR_LINK = 20;
/** Teto de tamanho pelo link, menor que o do escritório: foto de celular e PDF escaneado cabem. */
const TETO_DO_LINK_BYTES = 20e6;
/** Quantos envios pelo link rodam ao mesmo tempo: a leitura do PDF pesa na memória. */
const AO_MESMO_TEMPO = 2;
const EXTENSAO: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "application/pdf": ".pdf" };

export const hashDoSegredo = (segredo: string) => createHash("sha256").update(segredo).digest("hex");

export interface DepsDoEnvio {
  db: Database;
  ia: Ia | null;
  arquivos: Armazenamento;
  maxArquivoBytes: number;
  enfileirar: (p: Pedido) => Promise<void>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
  aoMesmoTempo?: number;
}

const ORG = /^[A-Za-z0-9_-]{1,64}$/;
const SEGREDO = /^[A-Za-z0-9_-]{20,64}$/;

/** O nome como o cliente mandou, sem caractere de controle nem separador de pasta, e com a extensão do tipo real. */
export function nomeSeguro(nome: string, mime: string): string {
  const limpo =
    nome
      .replace(/[\u0000-\u001f\u007f]/g, "")
      .replace(/[\\/]+/g, "-")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "documento";
  const ext = EXTENSAO[mime] ?? "";
  const minusculo = limpo.toLowerCase();
  return minusculo.endsWith(ext) || (ext === ".jpg" && minusculo.endsWith(".jpeg")) ? limpo : `${limpo}${ext}`;
}

/** A cobrança do link, se o segredo é deste escritório, a mensagem saiu e o link ainda vale. */
async function cobrancaDoLink(deps: DepsDoEnvio, c: Context) {
  const org = c.req.param("org") ?? "";
  const segredo = c.req.param("segredo") ?? "";
  if (!ORG.test(org) || !SEGREDO.test(segredo)) falha(404, "nao_encontrado", "Este link não existe.");
  const achada = await withTenant(deps.db, org, async (tx) => {
    const [l] = await tx
      .select({ id: mensagensCliente.id, itens: mensagensCliente.itens, expira: mensagensCliente.linkExpiraEm, recebidos: mensagensCliente.recebidos, clienteId: clientes.id, nome: clientes.nome })
      .from(mensagensCliente)
      .innerJoin(clientes, eq(clientes.id, mensagensCliente.clienteId))
      .where(and(eq(mensagensCliente.linkHash, hashDoSegredo(segredo)), inArray(mensagensCliente.situacao, ["enviando", "enviada"]), eq(mensagensCliente.tipo, "documentos")));
    if (!l) return null;
    const [e] = await tx.select({ timbre: escritorios.timbre }).from(escritorios).where(eq(escritorios.organizationId, org));
    return { ...l, nomeDoTimbre: e?.timbre?.nome ?? null };
  });
  if (!achada) falha(404, "nao_encontrado", "Este link não existe.");
  if (!achada.expira || achada.expira.getTime() < Date.now()) falha(410, "link_vencido", "Este link venceu. Peça um novo ao escritório.");
  const [o] = await deps.db.select({ nome: organization.name, timezone: organization.timezone }).from(organization).where(eq(organization.id, org));
  return { ...achada, org, escritorio: achada.nomeDoTimbre || o?.nome || "Escritório", timezone: o?.timezone ?? "America/Sao_Paulo" };
}

type Cobranca = Awaited<ReturnType<typeof cobrancaDoLink>>;

export function rotasDoEnvioPeloCliente(deps: DepsDoEnvio) {
  const app = new Hono();
  const teto = Math.min(deps.maxArquivoBytes, TETO_DO_LINK_BYTES);
  const aoMesmoTempo = deps.aoMesmoTempo ?? AO_MESMO_TEMPO;
  let emCurso = 0;
  const grande = (c: Context) => c.json({ erro: "arquivo_grande", detalhe: `O arquivo passa de ${Math.round(teto / 1e6)} MB. Tire a foto de novo com menos qualidade ou mande o PDF em partes.` }, 413);

  /** O que a página do link mostra: o escritório, o primeiro nome do cliente, a lista e até quando vale. */
  app.get("/:org/:segredo", async (c) => {
    const k = await cobrancaDoLink(deps, c);
    return c.json({
      escritorio: k.escritorio,
      cliente: k.nome.trim().split(/\s+/)[0],
      itens: k.itens,
      validoAte: hojeEm(k.timezone, k.expira!),
      recebidos: k.recebidos,
    });
  });

  /** Uma foto ou PDF do cliente: vai para a pasta dele e, se precisa, para a leitura pela IA. */
  app.post("/:org/:segredo", bodyLimit({ maxSize: teto + 1e6, onError: grande }), async (c) => {
    const k = await cobrancaDoLink(deps, c);
    if (k.recebidos >= ARQUIVOS_POR_LINK) falha(429, "limite", "Este link já recebeu arquivos demais. Fale com o escritório.");
    if (emCurso >= aoMesmoTempo) falha(503, "ocupado", "Muita gente enviando agora. Tente de novo em instantes.");
    emCurso++;
    try {
      return await receber(c, k);
    } finally {
      emCurso--;
    }
  });

  async function receber(c: Context, k: Cobranca) {
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) falha(400, "sem_arquivo", "Escolha a foto ou o PDF.");
    if (arquivo.size > teto) return grande(c);
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // O tipo é o que os bytes dizem, não o que o celular declarou.
    const mime = tipoPelosBytes(bytes);
    if (!mime) falha(422, "tipo_nao_aceito", "Envie uma foto (JPEG, PNG ou WebP) ou um PDF.");
    const nome = nomeSeguro(arquivo.name, mime);
    // A vaga é reservada antes do trabalho pesado: dois envios ao mesmo tempo não furam o teto.
    const [vaga] = await withTenant(deps.db, k.org, (tx) =>
      tx
        .update(mensagensCliente)
        .set({ recebidos: sql`${mensagensCliente.recebidos} + 1` })
        .where(and(eq(mensagensCliente.id, k.id), lt(mensagensCliente.recebidos, ARQUIVOS_POR_LINK)))
        .returning({ id: mensagensCliente.id }),
    );
    if (!vaga) falha(429, "limite", "Este link já recebeu arquivos demais. Fale com o escritório.");
    const docId = crypto.randomUUID();
    let lendo = false;
    try {
      const lido = await lerDocumento(bytes, mime).catch(() => ({ texto: null, paginas: null }));
      const alertas = await varrerDocumento(bytes, mime).catch(() => []);
      const chave = chaveDoDocumento(k.org, docId);
      await deps.arquivos.put(chave, bytes, mime);
      lendo = await withTenant(deps.db, k.org, async (tx) => {
        const lendo = !!deps.ia && !(await semIa(tx, { clienteId: k.clienteId })) && precisaDeLeitura(mime, lido.texto);
        await tx.insert(documentos).values({
          id: docId,
          organizationId: k.org,
          clienteId: k.clienteId,
          nome,
          mime,
          tamanho: bytes.length,
          paginas: lido.paginas,
          chave,
          texto: lido.texto,
          alertas,
          leitura: lendo ? "pendente" : null,
        });
        return lendo;
      });
    } catch (err) {
      // Deu errado antes de o documento existir: a vaga volta.
      await withTenant(deps.db, k.org, (tx) =>
        tx
          .update(mensagensCliente)
          .set({ recebidos: sql`greatest(${mensagensCliente.recebidos} - 1, 0)` })
          .where(eq(mensagensCliente.id, k.id)),
      ).catch(() => {});
      throw err;
    }
    // A fila fora do ar não desfaz o envio: o documento fica guardado com a leitura pendente.
    if (lendo) await deps.enfileirar({ nome: "documento.ler", organizationId: k.org, documentoId: docId }).catch((err) => deps.log("leitura do documento do link não foi para a fila", { documentoId: docId, error: err instanceof Error ? err.message : String(err) }));
    await registrar(deps.db, { organizationId: k.org, nome: `${k.nome} (pelo link de envio)`, acao: "documento.recebido_do_cliente", detalhes: { documentoId: docId, mensagemId: k.id, nome }, ip: ipDoPedido(c) }, deps.log);
    return c.json({ ok: true, nome, aviso: RESPOSTA_AUTOMATICA }, 201);
  }

  return app;
}
