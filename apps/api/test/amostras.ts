/**
 * Gera as respostas de exemplo da API (apps/web/e2e/amostras) a partir da
 * demonstração, num banco de teste. As telas são testadas com elas.
 *
 *   TEST_OWNER_URL=... bun apps/api/test/amostras.ts
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createTestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";

const DESTINO = new URL("../../web/e2e/amostras/", import.meta.url).pathname;
const t = await createTestDatabase();
try {
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const arquivos = armazenamentoEmMemoria();
  const auth = createAuth(t.db, env);
  const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
  const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
  const app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@demo.decreta.app", password: "demonstracao-123" }) });
  const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
  await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });
  const get = async (path: string) => {
    const res = await app.request(`/api/app${path}`, { headers: { cookie, origin: env.WEB_ORIGIN } });
    if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<any>;
  };
  const amostras: Record<string, unknown> = {};
  const guardar = async (nome: string, path: string) => (amostras[nome] = { path, corpo: await get(path) });
  await guardar("eu", "/eu");
  await guardar("hoje", "/hoje");
  const prazos = await get("/prazos?quando=abertos");
  amostras["prazos"] = { path: "/prazos?quando=abertos", corpo: prazos };
  const marina = prazos.itens.find((i: { tipo: string }) => i.tipo === "Manifestação sobre laudo pericial");
  const alegacoes = prazos.itens.find((i: { tipo: string }) => i.tipo === "Alegações finais");
  await guardar("prazo", `/prazos/${marina.id}`);
  await guardar("prazoComPeca", `/prazos/${alegacoes.id}`);
  const pubs = await get("/publicacoes");
  amostras["publicacoes"] = { path: "/publicacoes", corpo: pubs };
  await guardar("publicacao", `/publicacoes/${pubs.itens[0].id}`);
  const pubMarina = pubs.itens.find((i: { partes: string }) => i.partes.startsWith("Marina"));
  await guardar("publicacaoMarina", `/publicacoes/${pubMarina.id}`);
  const processoId = pubMarina.processoId;
  await guardar("processos", "/processos");
  await guardar("processo", `/processos/${processoId}`);
  await guardar("movimentacoes", `/processos/${processoId}/movimentacoes`);
  await guardar("pecasDoProcesso", `/processos/${processoId}/pecas`);
  await guardar("documentos", `/documentos?processoId=${processoId}`);
  await guardar("chat", `/ia/chat/${processoId}`);
  const clientes = await get("/clientes");
  amostras["clientes"] = { path: "/clientes", corpo: clientes };
  await guardar("cliente", `/clientes/${clientes.itens.find((c: { nome: string }) => c.nome === "Marina Duarte").id}`);
  await guardar("agenda", "/agenda");
  await guardar("negocios", "/negocios");
  await guardar("alvaras", "/alvaras");
  await guardar("escritorio", "/escritorio");
  await guardar("equipe", "/equipe");
  await guardar("feriados", "/feriados");
  await guardar("registro", "/registro");
  await guardar("catalogo", "/pecas/catalogo");
  await guardar("preparar", `/pecas/preparar?prazo=${marina.id}`);
  const pecaId = (await get(`/prazos/${alegacoes.id}`)).pecas[0].id;
  await guardar("peca", `/pecas/${pecaId}`);
  await guardar("perguntar", "/ia/perguntar");
  await guardar("busca", "/busca?q=Marina");
  const agenda = await get("/agenda");
  const aud = agenda.dias?.flatMap((d: { itens: { tipo: string; id: string }[] }) => d.itens).find((i: { tipo: string }) => i.tipo === "audiencia");
  if (aud) await guardar("audiencia", `/audiencias/${aud.id}`);
  mkdirSync(DESTINO, { recursive: true });
  for (const [nome, v] of Object.entries(amostras)) writeFileSync(`${DESTINO}${nome}.json`, `${JSON.stringify(v, null, 2)}\n`);
  console.log(`${Object.keys(amostras).length} amostras em ${DESTINO}`);
} finally {
  await t.drop();
}
