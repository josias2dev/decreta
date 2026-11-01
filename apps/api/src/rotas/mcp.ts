/**
 * Conector MCP somente leitura (Fase 5.10). Um assistente de fora (o Claude
 * no computador, por exemplo) consulta o escritório pelo protocolo MCP, com um
 * token pessoal e as mesmas permissões de quem o criou: as ferramentas de
 * leitura do Perguntar, no escritório dele, sem os casos de cliente que
 * recusou a IA. Nada é escrito por aqui.
 *
 *   POST /api/mcp              JSON-RPC do MCP (HTTP sem sessão, resposta em JSON)
 *   GET/POST/DELETE /api/app/mcp/tokens   a pessoa cria, vê e revoga os tokens dela
 */
import { createHash, randomBytes } from "node:crypto";
import { organization, tokensMcp, withTenant, type Database } from "@decreta/db";
import { FALHOU, ferramentasDoEscritorio, NaoAchou, PedidoErrado } from "@decreta/ia";
import { asSchema } from "ai";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";
import { registrar } from "../auditoria.ts";
import { dadosDoEscritorio } from "../servicos/assistente.ts";
import { ehMembro } from "../servicos/pessoas.ts";
import { corpo, falha, id, ip, tenant, type Ambiente, type DepsDasRotas } from "./base.ts";

const VERSAO_DO_PROTOCOLO = "2025-06-18";
/** As ferramentas do Perguntar que só leem: proporTarefa fica de fora. */
const SO_LEITURA = new Set(["proporTarefa"]);
const TOKEN = /^dcmcp\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{40,64})$/;

const hashDoToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Quem é o dono do token: o escritório e a pessoa, se o token vale e ela ainda está na equipe. */
async function donoDoToken(db: Database, token: string) {
  const m = TOKEN.exec(token);
  if (!m) return null;
  const organizationId = m[1]!;
  const t = await withTenant(db, organizationId, async (tx) => {
    const [linha] = await tx
      .select({ id: tokensMcp.id, userId: tokensMcp.userId })
      .from(tokensMcp)
      .where(and(eq(tokensMcp.hash, hashDoToken(token)), isNull(tokensMcp.revogadoEm)));
    if (linha) await tx.update(tokensMcp).set({ usadoEm: new Date() }).where(eq(tokensMcp.id, linha.id));
    return linha;
  });
  if (!t || !(await ehMembro(db, organizationId, t.userId))) return null;
  const [o] = await db.select({ timezone: organization.timezone }).from(organization).where(eq(organization.id, organizationId));
  return { organizationId, userId: t.userId, timezone: o?.timezone ?? "America/Sao_Paulo" };
}

/** O que o conector usa de cada ferramenta do Perguntar. */
type Ferramenta = { description?: string; inputSchema: Parameters<typeof asSchema>[0]; execute?: (entrada: unknown, opcoes: { toolCallId: string; messages: [] }) => Promise<unknown> };
type Pedido = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const resposta = (id: Pedido["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const erro = (id: Pedido["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export function rotasDoMcp(deps: { db: Database; log: (msg: string, extra?: Record<string, unknown>) => void }) {
  const app = new Hono();
  // Só JSON-RPC por POST; o fluxo de eventos do servidor não é usado.
  app.get("/", (c) => c.body(null, 405, { allow: "POST" }));

  app.post("/", async (c: Context) => {
    const token = (c.req.header("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const dono = token ? await donoDoToken(deps.db, token) : null;
    if (!dono) return c.json(erro(null, -32001, "Token inválido ou revogado. Crie outro em Minha conta > Conector MCP."), 401, { "www-authenticate": "Bearer" });
    const p = (await c.req.json().catch(() => null)) as Pedido | null;
    if (!p || typeof p.method !== "string") return c.json(erro(null, -32700, "Pedido fora do formato JSON-RPC."), 400);
    // Notificação (sem id): nada a responder.
    if (p.id === undefined) return c.body(null, 202);

    const todas = ferramentasDoEscritorio(dadosDoEscritorio({ db: deps.db, ...dono })) as unknown as Record<string, Ferramenta>;
    const ferramentas = Object.entries(todas).filter(([nome]) => !SO_LEITURA.has(nome));
    switch (p.method) {
      case "initialize":
        return c.json(
          resposta(p.id, {
            protocolVersion: VERSAO_DO_PROTOCOLO,
            capabilities: { tools: {} },
            serverInfo: { name: "decreta", version: "1.0.0" },
            instructions:
              "Dados do escritório no Decreta, só leitura: prazos, processos, publicações, audiências, clientes, documentos e alvarás, e os temas e súmulas do acervo de jurisprudência. Datas no formato AAAA-MM-DD. Confira nos autos antes de agir.",
          }),
        );
      case "ping":
        return c.json(resposta(p.id, {}));
      case "tools/list":
        return c.json(
          resposta(p.id, {
            tools: await Promise.all(
              ferramentas.map(async ([name, f]) => ({ name, description: f.description, inputSchema: await asSchema(f.inputSchema).jsonSchema, annotations: { readOnlyHint: true } })),
            ),
          }),
        );
      case "tools/call": {
        const nome = String(p.params?.name ?? "");
        const f = ferramentas.find(([n]) => n === nome)?.[1];
        if (!f?.execute) return c.json(erro(p.id, -32602, `Ferramenta desconhecida: ${nome}.`));
        try {
          const r = await f.execute(p.params?.arguments ?? {}, { toolCallId: `mcp-${p.id}`, messages: [] });
          return c.json(resposta(p.id, { content: [{ type: "text", text: JSON.stringify(r) }] }));
        } catch (err) {
          const lida = err instanceof NaoAchou || err instanceof PedidoErrado;
          if (!lida) deps.log("mcp: consulta falhou", { ferramenta: nome, organizationId: dono.organizationId, error: err instanceof Error ? err.message : String(err) });
          return c.json(resposta(p.id, { content: [{ type: "text", text: lida ? (err as Error).message : FALHOU }], isError: true }));
        }
      }
      default:
        return c.json(erro(p.id, -32601, `Método não suportado: ${p.method}.`));
    }
  });
  return app;
}

/** Os tokens da pessoa: criar (o token aparece uma vez), ver e revogar. */
export function rotasDosTokensMcp(app: Hono<Ambiente>, deps: DepsDasRotas) {
  app.get("/mcp/tokens", async (c) =>
    tenant(c, deps, async (tx) => {
      const linhas = await tx
        .select()
        .from(tokensMcp)
        .where(and(eq(tokensMcp.userId, c.get("userId")), isNull(tokensMcp.revogadoEm)))
        .orderBy(desc(tokensMcp.createdAt));
      return c.json({ itens: linhas.map((t) => ({ id: t.id, nome: t.nome, criadoEm: t.createdAt.toISOString(), usadoEm: t.usadoEm?.toISOString() ?? null })) });
    }),
  );

  app.post("/mcp/tokens", async (c) => {
    if (c.get("demonstracao")) falha(403, "demonstracao", "Na demonstração o conector MCP fica desligado.");
    const b = await corpo(c, z.object({ nome: z.string().trim().min(2).max(80) }));
    const token = `dcmcp.${c.get("orgId")}.${randomBytes(32).toString("base64url")}`;
    const [linha] = await tenant(c, deps, (tx) =>
      tx.insert(tokensMcp).values({ organizationId: c.get("orgId"), userId: c.get("userId"), nome: b.nome, hash: hashDoToken(token) }).returning({ id: tokensMcp.id }),
    );
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "mcp.token_criado", detalhes: { tokenId: linha!.id, nome: b.nome }, ip: ip(c) }, deps.log);
    return c.json({ id: linha!.id, token }, 201);
  });

  app.delete("/mcp/tokens/:id", async (c) => {
    const tokenId = id(c);
    const [linha] = await tenant(c, deps, (tx) =>
      tx
        .update(tokensMcp)
        .set({ revogadoEm: new Date() })
        .where(and(eq(tokensMcp.id, tokenId), eq(tokensMcp.userId, c.get("userId"))))
        .returning({ id: tokensMcp.id }),
    );
    if (!linha) falha(404, "nao_encontrado");
    await registrar(deps.db, { organizationId: c.get("orgId"), userId: c.get("userId"), nome: c.get("userNome"), acao: "mcp.token_revogado", detalhes: { tokenId }, ip: ip(c) }, deps.log);
    return c.json({ ok: true });
  });
}
