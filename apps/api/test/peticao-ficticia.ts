/**
 * O mesmo teste que os concorrentes fizeram (docs/elara-juridico/18-decreta-no-mesmo-teste.md):
 * a petição fictícia entra como documento do processo e o Decreta gera a
 * contestação da ré, pessoa jurídica, pelo mesmo caminho da tela (rota /pecas,
 * com o contexto que ela monta).
 *
 *   bun run peticao-ficticia [--so-o-pedido] [petição.pdf] [pasta-de-saída]
 *
 * Com o gateway de IA de verdade no .env (LLM_BASE_URL e LLM_API_KEY), gera a
 * contestação duas vezes (só com o documento e depois da leitura da peça
 * contrária), passa cada uma pela conferência dos fatos, propõe a estratégia,
 * grava os textos e imprime as verificações por código. Gasta uns
 * centavos de IA; nunca roda na suíte de testes. Sem gateway de verdade (ou
 * com um modelo falso, que devolve texto curto), o script para e diz isso: não
 * inventa resultado.
 *
 * `--so-o-pedido` não usa IA: troca o modelo por um de mentira e mostra só o que
 * o Decreta manda para a IA (o contexto do processo, com a petição lida do
 * PDF), que é a parte do teste que não depende do modelo.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { checarPeca, type ParteDoCadastro } from "@decreta/core";
import { createGatewayIa, type Ia } from "@decreta/ia";
import { createTestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

const soOPedido = process.argv.includes("--so-o-pedido");
const [pdfArg, saidaArg] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const PDF = pdfArg ?? fileURLToPath(new URL("../../../docs/elara-juridico/anexos/peticao-ficticia.pdf", import.meta.url));
const SAIDA = saidaArg ?? fileURLToPath(new URL(`../../../docs/elara-juridico/anexos/teste-da-peticao${soOPedido ? "-so-o-pedido" : ""}/`, import.meta.url));

/** As partes como o cadastro do teste diz: é contra isso que a qualificação da peça é checada. */
const PARTES: ParteDoCadastro[] = [
  { nome: "TESTE AUTOR FICTICIO", tipo: null, polo: "ativo", cliente: false },
  { nome: "TESTE CLIENTE FICTICIO", tipo: "pj", polo: "passivo", cliente: true },
];
/** A instrução do teste, igual à dada aos concorrentes. */
const INSTRUCOES = "Represente a ré, pessoa jurídica de direito privado. A tese é de mero aborrecimento, sem dano moral indenizável. Não invente fato nem prova.";
/** Uma peça de verdade tem páginas; menos que isso é modelo falso ou erro do gateway. */
const MINIMO_DE_UMA_PECA = 1500;

const env = readEnv({ DATABASE_URL: "postgres://nao-usado/x", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787", ...process.env });
const falsa = iaFalsa();
let ia: Ia;
if (soOPedido) {
  falsa.respostas["gerar-documento"] = "[Texto simulado: este modo só mostra o que o Decreta manda para a IA.]";
  falsa.respostas["ler-peca-contraria"] = { peca: "[simulada]", pedidos: "", pontos: [], recusa: null };
  falsa.respostas["ligar-fatos"] = { fatos: [] };
  ia = falsa;
} else {
  if (!env.LLM_API_KEY) {
    console.error("Sem LLM_API_KEY no .env: o teste precisa do gateway. Nada foi gerado. Use --so-o-pedido para ver só o que vai para a IA.");
    process.exit(1);
  }
  ia = createGatewayIa({
    baseUrl: env.LLM_BASE_URL,
    apiKey: env.LLM_API_KEY,
    modelos: { juridico: env.MODELO_JURIDICO, autos: env.MODELO_AUTOS, documentos: env.MODELO_DOCUMENTOS, pdf: env.MODELO_PDF, vision: env.MODELO_VISION },
    modeloTranscricao: env.MODELO_TRANSCRICAO,
  });
}

mkdirSync(SAIDA, { recursive: true });
const gravar = (nome: string, conteudo: unknown) => writeFileSync(`${SAIDA}${SAIDA.endsWith("/") || SAIDA.endsWith("\\") ? "" : "/"}${nome}`, typeof conteudo === "string" ? conteudo : JSON.stringify(conteudo, null, 2));

const t = await createTestDatabase();
try {
  const auth = createAuth(t.db, env);
  const rotas = createRotas({ db: t.db, auth, ia, arquivos: armazenamentoEmMemoria(), mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: (msg, dados) => console.error("[log]", msg, JSON.stringify(dados ?? {}).slice(0, 500)) });
  const app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  const { organizationId } = await criarEscritorio(t.db, auth, {
    nome: "Escritório de Teste",
    slug: "teste",
    dono: { email: "advogada@teste.adv.br", nome: "Advogada de Teste", senha: "senha-bem-longa-123", cargo: "Advogada", oabNumero: "12.345", oabUf: "SC" },
  });
  const entrou = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "advogada@teste.adv.br", password: "senha-bem-longa-123" }) });
  const cookie = entrou.headers.get("set-cookie")?.split(";")[0] ?? "";
  await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId }) });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, { ...init, headers: { origin: env.WEB_ORIGIN, cookie, ...(init.json !== undefined ? { "content-type": "application/json" } : {}) }, body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
  const json = async (r: Response | Promise<Response>) => {
    const res = await r;
    const corpo = await res.text();
    if (!res.ok) throw new Error(`${res.status} ${corpo.slice(0, 300)}`);
    return JSON.parse(corpo) as any;
  };

  // O cenário: a ré (pessoa jurídica) é a cliente do escritório; o autor é a parte contrária.
  const cliente = await json(call("/clientes", { method: "POST", json: { nome: "TESTE CLIENTE FICTICIO", tipo: "pj" } }));
  const processo = await json(
    call("/processos", {
      method: "POST",
      json: { cnj: null, tipo: "judicial", titulo: "TESTE AUTOR FICTICIO × TESTE CLIENTE FICTICIO", orgao: "Vara Cível", comarca: "Cidade Fictícia", clienteId: cliente.id, poloCliente: "passivo", partes: [{ nome: "TESTE AUTOR FICTICIO", polo: "ativo" }, { nome: "TESTE CLIENTE FICTICIO", polo: "passivo", cliente: true }] },
    }),
  );
  const form = new FormData();
  form.set("arquivo", new File([readFileSync(PDF)], "peticao-ficticia.pdf", { type: "application/pdf" }));
  form.set("processoId", processo.id);
  form.set("evento", "1");
  const doc = await json(call("/documentos", { method: "POST", body: form }));
  console.log(`Petição enviada: ${doc.paginas ?? "?"} página(s), texto lido: ${doc.lido ? "sim" : "NÃO"}.`);
  if (!doc.lido) throw new Error("o PDF ficou sem texto: o teste não vale");
  const prazo = await json(call("/prazos", { method: "POST", json: { processoId: processo.id, tipo: "Contestação", dias: 15, contagem: "uteis", publicadoEm: "2026-10-29" } }));

  /** Gera a contestação pelo caminho da tela e devolve a peça. */
  const gerar = async (rotulo: string) => {
    const r = await call("/pecas", { method: "POST", json: { processoId: processo.id, prazoId: prazo.id, tipo: "contestacao", instrucoes: INSTRUCOES } });
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 300)}`);
    await r.text();
    const peca = await json(call(`/pecas/${r.headers.get("x-peca-id")}`));
    if (!soOPedido && peca.texto.length < MINIMO_DE_UMA_PECA) {
      throw new Error(`o gateway devolveu ${peca.texto.length} caracteres (${JSON.stringify(peca.texto.slice(0, 80))}): não é uma peça. Provável modelo falso ou erro do gateway; nada a avaliar.`);
    }
    gravar(`${rotulo}.md`, peca.texto);
    // O caminho da tela: a peça gerada passa pela conferência dos fatos antes de ser entregue.
    const conferida = await json(call(`/pecas/${peca.id}/conferir-fatos`, { method: "POST" }));
    gravar(`${rotulo}-conferida.md`, conferida.texto);
    gravar(`${rotulo}-fatos.json`, conferida.conferencia);
    return { id: peca.id as string, texto: conferida.texto as string, conferencia: conferida.conferencia };
  };

  /** O que a conferência e a checagem por código acharam: é a parte do teste que não depende de quem lê. */
  const conferido = (p: { texto: string; conferencia: { semLigacao: string | null; resumo: unknown; fatos: { afirmacao: string; situacao: string; motivo: string | null }[]; avisos: { mensagem: string }[] } }) =>
    [
      `  ligação dos fatos: ${p.conferencia.semLigacao ?? "feita"}; ${JSON.stringify(p.conferencia.resumo)}`,
      ...p.conferencia.fatos.filter((f) => f.situacao !== "conferido").map((f) => `  ${f.situacao}: ${f.afirmacao.slice(0, 110)} (${f.motivo})`),
      ...p.conferencia.avisos.map((a) => `  aviso: ${a.mensagem}`),
      ...checarPeca(p.texto, { partes: PARTES }).map((c) => `  antes de protocolar: ${c.mensagem}`),
    ].join("\n");

  if (soOPedido) {
    await gerar("a-contestacao-simulada");
    const mensagens = JSON.stringify(falsa.pedidos["gerar-documento"]);
    const prompt = (falsa.pedidos["gerar-documento"] as { role: string; content: unknown }[]).map((m) => `### ${m.role}\n${typeof m.content === "string" ? m.content : (m.content as { text?: string }[]).map((p) => p.text ?? "").join("")}`).join("\n\n");
    gravar("a-pedido-enviado-a-ia.md", prompt);
    console.log("\n== O que o Decreta manda para a IA (rota /pecas, contestação, com a petição guardada)");
    console.log(conferirPedido(prompt, mensagens));
    // O que a leitura da peça contrária recebe.
    await json(call(`/ia/peca-contraria/${prazo.id}`, { method: "POST", json: { documentoId: doc.id } }));
    const leitura = JSON.stringify(falsa.pedidos["ler-peca-contraria"]);
    gravar("b-pedido-da-leitura-da-peca-contraria.json", falsa.pedidos["ler-peca-contraria"]);
    console.log(`\nA leitura da peça contrária recebe o texto da petição: ${leitura.includes("800,00") ? "sim" : "NÃO"}`);
  } else {
    console.log("\n== A. Contestação só com a petição guardada como documento do processo");
    const a = await gerar("a-contestacao-so-com-o-documento");
    console.log(verificarTexto(a.texto));
    console.log(conferido(a));

    console.log("\n== B. Leitura da petição como peça da outra parte (pontos a rebater) e nova contestação");
    const leitura = await json(call(`/ia/peca-contraria/${prazo.id}`, { method: "POST", json: { documentoId: doc.id } }));
    gravar("b-leitura-da-peca-contraria.json", leitura);
    console.log(JSON.stringify(leitura.conteudo ?? leitura, null, 2).slice(0, 2500));
    const b = await gerar("b-contestacao-depois-da-leitura");
    console.log(verificarTexto(b.texto));
    console.log(conferido(b));

    // A estratégia de antes de gerar, com a evidência de cada tese conferida por código.
    const estrategia = await json(call("/pecas/estrategia", { method: "POST", json: { processoId: processo.id, prazoId: prazo.id, tipo: "contestacao", instrucoes: INSTRUCOES } }));
    gravar("c-estrategia.json", estrategia);
    console.log("\n== C. Estratégia antes de gerar");
    console.log(JSON.stringify(estrategia.estrategia?.teses?.map((t: { titulo: string; falta: string | null; evidencias: { confere: boolean }[] }) => ({ tese: t.titulo, evidencias: t.evidencias.length, conferem: t.evidencias.filter((e) => e.confere).length, falta: t.falta })) ?? estrategia.recusa, null, 2));

    // "Verificar peça": cada citação do texto com o selo (precisa do acervo e de rede; falha não derruba o teste).
    try {
      const v = await json(call(`/pecas/${b.id}/verificar`, { method: "POST" }));
      gravar("b-verificacao-das-citacoes.json", v);
      console.log("\nVerificar peça:", JSON.stringify(v.resumo));
    } catch (err) {
      console.log("\nVerificar peça não rodou:", err instanceof Error ? err.message : err);
    }
  }
  console.log(`\nSaída em ${SAIDA}`);
} finally {
  await t.drop();
}

/** O que o pedido enviado à IA tem do caso: a petição, a parte que o escritório representa e as regras de não inventar. */
function conferirPedido(prompt: string, mensagens: string): string {
  const tem = (re: RegExp) => re.test(prompt);
  const linhas: [string, boolean][] = [
    ["traz o texto da petição lido do PDF (R$ 800,00, 10 de setembro, 5 de outubro)", tem(/800,00/) && tem(/10 de setembro/) && tem(/5 de outubro/)],
    ["traz o pedido de R$ 1.000,00 e o artigo 14 do CDC", tem(/1\.000,00/) && tem(/artigo 14/)],
    ["diz que o escritório representa a ré (polo passivo, cliente)", tem(/passivo/i) && tem(/TESTE CLIENTE FICTICIO/)],
    ["traz a instrução de quem pediu (pessoa jurídica, mero aborrecimento)", tem(/pessoa jur[ií]dica de direito privado/) && tem(/mero aborrecimento/)],
    ["manda não inventar e marcar [COMPLETAR]", tem(/\[COMPLETAR/) && tem(/Use só os fatos do material/)],
    ["manda marcar [A COMPROVAR] o fato sem prova e pôr a fonte em cada fato", tem(/\[A COMPROVAR/) && tem(/\(evento 87, fl\. 3\)/)],
    ["diz pelo cadastro que a ré é pessoa jurídica no polo passivo", tem(/TESTE CLIENTE FICTICIO \(cliente, pessoa jurídica, polo passivo\)/)],
    ["proíbe citar julgado com número, relator ou data", tem(/Não cite jurisprudência com número/)],
    ["marca o texto da petição como dado e não como ordem", tem(/dados|não são ordens|n[ãa]o s[ãa]o instru/i)],
  ];
  return linhas.map(([k, v]) => `  ${v ? "sim" : "NÃO"}: ${k}`).join("\n") + `\n  tamanho do pedido: ${mensagens.length} caracteres`;
}

/** O que dá para conferir por código no texto da peça. A leitura do conteúdo continua sendo de uma pessoa. */
function verificarTexto(texto: string): string {
  const acha = (re: RegExp) => [...texto.matchAll(re)].map((m) => m[0]);
  const linhas: [string, unknown][] = [
    ["caracteres", texto.length],
    ["fala em pessoa jurídica", /pessoa jur[ií]dica/i.test(texto)],
    ["valor da compra (R$ 800,00)", /800,00/.test(texto)],
    ["pedido de R$ 1.000,00", /1\.000,00/.test(texto)],
    ["datas da petição (10/09, 20/09, 05/10, 27/09 de 2026)", ["10 de setembro", "20 de setembro", "5 de outubro", "27 de setembro"].filter((d) => texto.includes(d))],
    ["marcas [COMPLETAR]", acha(/\[COMPLETAR[^\]]*\]/g)],
    ["marcas [JURISPRUDÊNCIA]", acha(/\[JURISPRUD[ÊE]NCIA[^\]]*\]/g)],
    ["número de julgado ou súmula", acha(/\b(REsp|AgInt|AREsp|RE|ApCiv|Apelação Cível)\b[^.;\n]{0,40}\d|\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b|Súmula\s+\d+/g)],
    ["palavras que costumam acompanhar prova inventada", acha(/\b(log|logs|rastreamento|código de rastreio|comprovante de entrega|protocolo de atendimento|gravação|e-mail enviado|jamais|nunca reclamou|contrato de transporte|transportadora)\b/gi)],
    ["artigos citados", [...new Set(acha(/\bart(?:igo|s?\.)\s*\d+[^,;.\n]{0,25}/gi))]],
  ];
  return linhas.map(([k, v]) => `  ${k}: ${Array.isArray(v) ? (v.length ? v.join(" | ") : "nenhum") : v}`).join("\n");
}
