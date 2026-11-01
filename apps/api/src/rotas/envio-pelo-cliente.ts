/**
 * O link de envio que vai ao cliente na cobrança dos documentos (Fase 3.3):
 * sem login, com validade, só para a mensagem que o advogado aprovou e que
 * saiu. A foto vai para a pasta do cliente e passa pela leitura de documentos.
 *
 * O endereço traz o escritório e um segredo; o banco guarda só o hash dele.
 */
import { createHash } from "node:crypto";
import { hojeEm, RESPOSTA_AUTOMATICA } from "@decreta/core";
import { clientes, documentos, escritorios, mensagensCliente, organization, withTenant, type Database } from "@decreta/db";
import { chaveDoDocumento, lerDocumento, varrerDocumento, type Armazenamento } from "@decreta/documentos";
import type { Ia } from "@decreta/ia";
import { and, eq, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { registrar } from "../auditoria.ts";
import { semIa } from "../servicos/contexto.ts";
import { precisaDeLeitura } from "../servicos/leitura.ts";
import { falha, type Pedido } from "./base.ts";

/** Quantos dias o link de envio vale depois que a mensagem sai. */
export const VALIDADE_DO_LINK_DIAS = 7;
/** Teto de arquivos por link: o link é sem senha. */
const ARQUIVOS_POR_LINK = 20;
const MIMES_DO_CLIENTE = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export const hashDoSegredo = (segredo: string) => createHash("sha256").update(segredo).digest("hex");

export interface DepsDoEnvio {
  db: Database;
  ia: Ia | null;
  arquivos: Armazenamento;
  maxArquivoBytes: number;
  enfileirar: (p: Pedido) => Promise<void>;
  log: (msg: string, extra?: Record<string, unknown>) => void;
}

const ORG = /^[A-Za-z0-9_-]{1,64}$/;
const SEGREDO = /^[A-Za-z0-9_-]{20,64}$/;

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
      .where(and(eq(mensagensCliente.linkHash, hashDoSegredo(segredo)), eq(mensagensCliente.situacao, "enviada"), eq(mensagensCliente.tipo, "documentos")));
    if (!l) return null;
    const [e] = await tx.select({ timbre: escritorios.timbre }).from(escritorios).where(eq(escritorios.organizationId, org));
    return { ...l, nomeDoTimbre: e?.timbre?.nome ?? null };
  });
  if (!achada) falha(404, "nao_encontrado", "Este link não existe.");
  if (!achada.expira || achada.expira.getTime() < Date.now()) falha(410, "link_vencido", "Este link venceu. Peça um novo ao escritório.");
  const [o] = await deps.db.select({ nome: organization.name, timezone: organization.timezone }).from(organization).where(eq(organization.id, org));
  return { ...achada, org, escritorio: achada.nomeDoTimbre || o?.nome || "Escritório", timezone: o?.timezone ?? "America/Sao_Paulo" };
}

export function rotasDoEnvioPeloCliente(deps: DepsDoEnvio) {
  const app = new Hono();

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
  app.post("/:org/:segredo", async (c) => {
    const k = await cobrancaDoLink(deps, c);
    if (k.recebidos >= ARQUIVOS_POR_LINK) falha(429, "limite", "Este link já recebeu arquivos demais. Fale com o escritório.");
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) falha(400, "sem_arquivo", "Escolha a foto ou o PDF.");
    if (arquivo.size > deps.maxArquivoBytes) falha(422, "arquivo_grande", `O arquivo passa de ${Math.round(deps.maxArquivoBytes / 1e6)} MB.`);
    const mime = (arquivo.type || "").split(";")[0]!.trim().toLowerCase();
    if (!MIMES_DO_CLIENTE.has(mime)) falha(422, "tipo_nao_aceito", "Envie uma foto ou um PDF.");
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const lido = await lerDocumento(bytes, mime).catch(() => ({ texto: null, paginas: null }));
    const alertas = await varrerDocumento(bytes, mime).catch(() => []);
    const docId = crypto.randomUUID();
    const chave = chaveDoDocumento(k.org, docId);
    await deps.arquivos.put(chave, bytes, mime);
    const lendo = await withTenant(deps.db, k.org, async (tx) => {
      const lendo = !!deps.ia && !(await semIa(tx, { clienteId: k.clienteId })) && precisaDeLeitura(mime, lido.texto);
      await tx.insert(documentos).values({
        id: docId,
        organizationId: k.org,
        clienteId: k.clienteId,
        nome: arquivo.name.slice(0, 250) || "documento",
        mime,
        tamanho: arquivo.size,
        paginas: lido.paginas,
        chave,
        texto: lido.texto,
        alertas,
        leitura: lendo ? "pendente" : null,
      });
      await tx.update(mensagensCliente).set({ recebidos: sql`${mensagensCliente.recebidos} + 1` }).where(eq(mensagensCliente.id, k.id));
      return lendo;
    });
    if (lendo) await deps.enfileirar({ nome: "documento.ler", organizationId: k.org, documentoId: docId });
    await registrar(deps.db, { organizationId: k.org, nome: `${k.nome} (pelo link de envio)`, acao: "documento.recebido_do_cliente", detalhes: { documentoId: docId, mensagemId: k.id, nome: arquivo.name } }, deps.log);
    return c.json({ ok: true, nome: arquivo.name, aviso: RESPOSTA_AUTOMATICA }, 201);
  });

  return app;
}
