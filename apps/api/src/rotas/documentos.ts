import { chaveDoDocumento, lerDocumento, MIMES_COM_TEXTO } from "@decreta/documentos";
import { clientes, documentos, negocios, processos, type Tx } from "@decreta/db";
import { and, desc, eq, like, type SQL, sql } from "drizzle-orm";
import type { Hono } from "hono";
import { registrar } from "../auditoria.ts";
import { precisaDeLeitura } from "../servicos/leitura.ts";
import { pessoasDoEscritorio, resumir } from "../servicos/pessoas.ts";
import { falha, id, ip, palavrasDaBusca, semAcentoNoBanco, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

/** O que a equipe anexa: autos, documentos do cliente, áudio de atendimento, logo do timbre. */
const MIMES_ACEITOS = new Set([
  ...MIMES_COM_TEXTO,
  "application/msword",
  "image/png",
  "image/jpeg",
  "image/webp",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function rotasDosDocumentos(app: Hono<Ambiente>, deps: DepsDasRotas) {
  const { db } = deps;

  app.get("/documentos", async (c) => {
    const processoId = c.req.query("processo");
    const clienteId = c.req.query("cliente");
    const negocioId = c.req.query("negocio");
    const busca = (c.req.query("busca") ?? "").trim();
    return tenant(c, deps, async (tx) => {
      const pessoas = await pessoasDoEscritorio(db, tx, c.get("orgId"));
      const onde: SQL[] = [];
      if (processoId) onde.push(eq(documentos.processoId, processoId));
      if (clienteId) onde.push(eq(documentos.clienteId, clienteId));
      if (negocioId) onde.push(eq(documentos.negocioId, negocioId));
      // Cada palavra no nome do arquivo ou em de quem ele é (processo, cliente, pasta da triagem).
      const alvo = semAcentoNoBanco(sql`${documentos.nome} || ' ' || coalesce(${processos.titulo}, '') || ' ' || coalesce(${clientes.nome}, '') || ' ' || coalesce(${negocios.nome}, '')`);
      for (const p of palavrasDaBusca(busca)) onde.push(like(alvo, `%${p}%`));
      const linhas = await comDeQuem(tx)
        .where(onde.length ? and(...onde) : undefined)
        .orderBy(desc(documentos.createdAt))
        .limit(200);
      return c.json({ itens: linhas.map((l) => naLista(l, pessoas)) });
    });
  });

  /** Um documento, como na lista: o que o painel do arquivo aberto mostra. */
  app.get("/documentos/:id", async (c) => {
    const docId = id(c);
    return tenant(c, deps, async (tx) => {
      const [l] = await comDeQuem(tx).where(eq(documentos.id, docId));
      if (!l) falha(404, "nao_encontrado");
      return c.json(naLista(l, await pessoasDoEscritorio(db, tx, c.get("orgId"))));
    });
  });

  app.post("/documentos", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const arquivo = form?.get("arquivo");
    if (!(arquivo instanceof File)) falha(400, "sem_arquivo");
    if (arquivo.size > deps.maxArquivoBytes) falha(422, "arquivo_grande", `O arquivo passa de ${Math.round(deps.maxArquivoBytes / 1e6)} MB.`);
    // "text/plain;charset=utf-8" é text/plain.
    const mime = (arquivo.type || "application/octet-stream").split(";")[0]!.trim().toLowerCase();
    if (!MIMES_ACEITOS.has(mime)) falha(422, "tipo_nao_aceito", "Envie PDF, Word, imagem, planilha ou áudio.");
    const processoId = (form!.get("processoId") as string | null) || null;
    const clienteId = (form!.get("clienteId") as string | null) || null;
    const negocioId = (form!.get("negocioId") as string | null) || null;
    const eventoBruto = form!.get("evento");
    const evento = typeof eventoBruto === "string" && /^\d+$/.test(eventoBruto) ? Number(eventoBruto) : null;
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    // PDF quebrado ou protegido não impede de guardar: fica sem texto e a tela avisa.
    const lido = await lerDocumento(bytes, mime).catch(() => ({ texto: null, paginas: null }));
    const docId = crypto.randomUUID();
    const chave = chaveDoDocumento(c.get("orgId"), docId);
    // Foto e PDF escaneado: a IA transcreve em segundo plano.
    const lendo = !!deps.ia && precisaDeLeitura(mime, lido.texto);
    await tenant(c, deps, async (tx) => {
      if (processoId && !(await tx.select({ id: processos.id }).from(processos).where(eq(processos.id, processoId))).length) falha(404, "processo_nao_encontrado");
      if (clienteId && !(await tx.select({ id: clientes.id }).from(clientes).where(eq(clientes.id, clienteId))).length) falha(404, "cliente_nao_encontrado");
      if (negocioId && !(await tx.select({ id: negocios.id }).from(negocios).where(eq(negocios.id, negocioId))).length) falha(404, "nao_encontrado");
      await deps.arquivos.put(chave, bytes, mime);
      await tx.insert(documentos).values({
        id: docId,
        organizationId: c.get("orgId"),
        processoId,
        clienteId,
        negocioId,
        nome: arquivo.name.slice(0, 250) || "documento",
        mime,
        tamanho: arquivo.size,
        paginas: lido.paginas,
        chave,
        texto: lido.texto,
        leitura: lendo ? "pendente" : null,
        evento,
        enviadoPor: c.get("userId"),
      });
    });
    if (lendo) await deps.enfileirar({ nome: "documento.ler", organizationId: c.get("orgId"), documentoId: docId });
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "documento.enviado", detalhes: { documentoId: docId, nome: arquivo.name }, ip: ip(c) }, deps.log);
    return c.json({ id: docId, lido: !!lido.texto, lendo, paginas: lido.paginas }, 201);
  });

  /** Pede de novo a leitura pela IA (a anterior falhou, ou a IA foi ligada depois do envio). */
  app.post("/documentos/:id/ler", async (c) => {
    const docId = id(c);
    if (!deps.ia) falha(503, "ia_desligada", "A IA ainda não foi ligada neste servidor.");
    await tenant(c, deps, async (tx) => {
      const [d] = await tx.select({ mime: documentos.mime, texto: documentos.texto, leitura: documentos.leitura }).from(documentos).where(eq(documentos.id, docId));
      if (!d) falha(404, "nao_encontrado");
      if (!precisaDeLeitura(d.mime, d.leitura === "pronta" ? null : d.texto)) falha(422, "nao_precisa", "Este arquivo já tem texto ou não é foto nem PDF.");
      await tx.update(documentos).set({ leitura: "pendente", ...(d.leitura === "pronta" ? { texto: null } : {}) }).where(eq(documentos.id, docId));
    });
    await deps.enfileirar({ nome: "documento.ler", organizationId: c.get("orgId"), documentoId: docId });
    return c.json({ ok: true });
  });

  app.get("/documentos/:id/arquivo", async (c) => {
    const docId = id(c);
    const [d] = await tenant(c, deps, (tx) => tx.select().from(documentos).where(eq(documentos.id, docId)));
    if (!d) falha(404, "nao_encontrado");
    const bytes = await deps.arquivos.read(d.chave);
    const inline = c.req.query("ver") === "1" && (d.mime === "application/pdf" || d.mime.startsWith("image/"));
    return new Response(bytes, {
      headers: {
        "content-type": d.mime,
        "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(d.nome)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  });

  app.delete("/documentos/:id", async (c) => {
    const docId = id(c);
    const chave = await tenant(c, deps, async (tx) => {
      const [d] = await tx.delete(documentos).where(eq(documentos.id, docId)).returning({ chave: documentos.chave });
      return d?.chave ?? null;
    });
    if (!chave) falha(404, "nao_encontrado");
    await deps.arquivos.delete(chave).catch(() => {});
    await registrar(db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "documento.apagado", detalhes: { documentoId: docId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });
}

/** O documento com o nome de quem ele é: processo, cliente ou pasta da triagem. */
const comDeQuem = (tx: Tx) =>
  tx
    .select({ d: documentos, processo: processos.titulo, cliente: clientes.nome, negocio: negocios.nome })
    .from(documentos)
    .leftJoin(processos, eq(processos.id, documentos.processoId))
    .leftJoin(clientes, eq(clientes.id, documentos.clienteId))
    .leftJoin(negocios, eq(negocios.id, documentos.negocioId));

type ComDeQuem = Awaited<ReturnType<typeof comDeQuem>>[number];

function naLista({ d, processo, cliente, negocio }: ComDeQuem, pessoas: Awaited<ReturnType<typeof pessoasDoEscritorio>>) {
  return {
    id: d.id,
    nome: d.nome,
    mime: d.mime,
    tamanho: d.tamanho,
    paginas: d.paginas,
    evento: d.evento,
    origem: d.origem,
    lido: d.texto !== null && d.texto.length > 0,
    semTexto: (MIMES_COM_TEXTO.has(d.mime) || d.mime.startsWith("image/")) && !d.texto,
    /** Leitura pela IA (foto, PDF escaneado): pendente, pronta, falhou; vazio quando não precisou. */
    leitura: d.leitura,
    em: d.createdAt.toISOString(),
    processo: d.processoId ? { id: d.processoId, titulo: processo } : null,
    cliente: d.clienteId ? { id: d.clienteId, nome: cliente } : null,
    negocio: d.negocioId ? { id: d.negocioId, nome: negocio } : null,
    enviadoPor: resumir(pessoas, d.enviadoPor),
  };
}
