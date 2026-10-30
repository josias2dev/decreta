/**
 * Gera as respostas de exemplo da API (apps/web/e2e/amostras) a partir da
 * demonstração, num banco de teste. As telas são testadas com elas.
 *
 *   TEST_OWNER_URL=... bun apps/api/test/amostras.ts
 */
import { setSystemTime } from "bun:test";
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
import { conferirPastaDe } from "../src/servicos/conferencia.ts";
import { sugerirPrazoDaPublicacao } from "../src/servicos/prazos.ts";
import { lerSentencaDaPublicacao } from "../src/servicos/sentencas.ts";
import { iaFalsa } from "./ia-falsa.ts";

/** Um prazo da lista. */
type Item = { tipo: string; processo: { titulo: string } };

// O relógio das telas de teste (e2e/apoio.ts): "hoje", "amanhã" e "vencido" saem iguais em qualquer dia.
setSystemTime(new Date("2026-10-29T09:30:00-03:00"));

const DESTINO = new URL("../../web/e2e/amostras/", import.meta.url).pathname;
const t = await createTestDatabase();
try {
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });
  const arquivos = armazenamentoEmMemoria();
  const auth = createAuth(t.db, env);
  const { organizationId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos });
  const rotas = createRotas({ db: t.db, auth, ia: null, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
  const app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
  const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "teste@decreta.site", password: "demonstracao-123" }) });
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
  const marina = prazos.itens.find((i: Item) => i.tipo === "Manifestação sobre laudo pericial" && i.processo.titulo.startsWith("Marina"));
  const alegacoes = prazos.itens.find((i: Item) => i.tipo === "Alegações finais" && i.processo.titulo.startsWith("Roberto"));
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
  await guardar("documentos", `/documentos?processo=${processoId}`);
  await guardar("chat", `/ia/chat/${processoId}`);
  const clientes = await get("/clientes");
  amostras["clientes"] = { path: "/clientes", corpo: clientes };
  const marinaCliente = (await get("/clientes?busca=Marina%20Duarte")).itens[0];
  await guardar("cliente", `/clientes/${marinaCliente.id}`);
  await guardar("agenda", "/agenda");
  await guardar("negocios", "/negocios");
  await guardar("alvaras", "/alvaras");
  await guardar("escritorio", "/escritorio");
  await guardar("equipe", "/equipe");
  await guardar("feriados", "/feriados");
  await guardar("registro", "/registro");
  await guardar("catalogo", "/pecas/catalogo");
  await guardar("preparar", `/pecas/preparar?prazo=${marina.id}`);
  await guardar("prepararComPeca", `/pecas/preparar?prazo=${alegacoes.id}`);
  const pecaId = (await get(`/prazos/${alegacoes.id}`)).pecas[0].id;
  await guardar("peca", `/pecas/${pecaId}`);
  await guardar("perguntar", "/ia/perguntar");
  await guardar("busca", "/busca?q=Marina");
  const agenda = await get("/agenda");
  const aud = agenda.dias?.flatMap((d: { itens: { tipo: string; id: string }[] }) => d.itens).find((i: { tipo: string }) => i.tipo === "audiencia");
  if (aud) await guardar("audiencia", `/audiencias/${aud.id}`);

  /*
   * As telas da leitura da sentença, da conferência da pasta, dos modelos e do
   * retorno sobre a IA, com uma IA de mentira e dados inventados. Vêm depois das
   * amostras de cima, que ficam como estavam (a demonstração não muda).
   */
  const ia = iaFalsa();
  const deps = { db: t.db, ia, log: () => {} };
  const mandar = async (metodo: string, path: string, corpo?: unknown) => {
    const form = corpo instanceof FormData;
    const res = await app.request(`/api/app${path}`, {
      method: metodo,
      headers: { cookie, origin: env.WEB_ORIGIN, ...(form ? {} : { "content-type": "application/json" }) },
      body: form ? corpo : corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    if (!res.ok) throw new Error(`${metodo} ${path}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<any>;
  };
  const enviar = (campos: Record<string, string>, nome: string, texto: string) => {
    const form = new FormData();
    form.set("arquivo", new File([texto], nome, { type: "text/plain" }));
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    return mandar("POST", "/documentos", form);
  };
  const processos = (await get("/processos")).itens as { id: string; titulo: string }[];
  const eduardo = processos.find((p) => p.titulo.startsWith("Eduardo Lima"))!;
  const sentenca = await mandar("POST", "/publicacoes", {
    processoId: eduardo.id,
    disponibilizadaEm: "2026-10-28",
    tipoComunicacao: "Intimação",
    tipoDocumento: "Sentença",
    texto:
      "Vistos. Eduardo Lima ajuizou ação contra Unimed Litoral pedindo a cobertura da cirurgia negada, o reembolso de R$ 18.400,00 e danos morais. A ré alegou exclusão contratual. Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar a ré a custear a cirurgia e a reembolsar R$ 18.400,00, com correção pelo INPC desde o desembolso e juros de 1% ao mês desde a citação. Rejeito o pedido de danos morais. Custas e honorários de 10% do valor da condenação pela ré. Publique-se. Intimem-se.",
  });
  ia.respostas["sugerir-prazo"] = { geraPrazo: true, tipo: "Apelação", dias: 15, contagem: "uteis", fundamento: "art. 1.003, § 5º, CPC", audiencia: null, resumo: "Sentença parcialmente procedente: cirurgia e reembolso, sem danos morais.", assunto: "sentença", recusa: null };
  ia.respostas["ler-sentenca"] = {
    tipo: "sentenca",
    resultado: "parcialmente_procedente",
    resumo: "Ganhamos a cirurgia e o reembolso de R$ 18.400,00; perdemos os danos morais. Cabe apelação para pedir os danos morais.",
    pedidos: [
      { pedido: "Cobertura da cirurgia", decisao: "acolhido", detalhe: "A exclusão contratual não vale para o procedimento indicado pelo médico." },
      { pedido: "Reembolso de R$ 18.400,00", decisao: "acolhido", detalhe: "Com correção pelo INPC desde o desembolso e juros desde a citação." },
      { pedido: "Danos morais", decisao: "rejeitado", detalhe: "O juízo viu mero inadimplemento contratual." },
    ],
    valores: ["R$ 18.400,00, com correção pelo INPC desde o desembolso e juros de 1% ao mês desde a citação"],
    honorarios: "Ré paga custas e 10% do valor da condenação.",
    recurso: { cabivel: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC" },
    recorrer: ["Danos morais: a negativa de cirurgia urgente vai além do inadimplemento (a sentença não enfrentou a urgência)."],
    manter: ["A cláusula de exclusão é abusiva diante da indicação médica."],
    recusa: null,
  };
  await sugerirPrazoDaPublicacao(deps, organizationId, sentenca.id);
  await lerSentencaDaPublicacao(deps, organizationId, sentenca.id, { forcar: true });
  await guardar("publicacaoSentenca", `/publicacoes/${sentenca.id}`);
  await mandar("POST", `/publicacoes/${sentenca.id}/resultado`, { tipo: "sentenca", resultado: "parcialmente_procedente", resumo: "Cirurgia e reembolso; sem danos morais." });
  amostras["publicacaoSentencaConfirmada"] = { path: `/publicacoes/${sentenca.id}?confirmada`, corpo: await get(`/publicacoes/${sentenca.id}`) };
  amostras["processoComResultado"] = { path: `/processos/${eduardo.id}`, corpo: await get(`/processos/${eduardo.id}`) };

  // Conferência da pasta: um negócio na triagem e a cliente Marina.
  const negocio = (await get("/negocios")).itens.find((n: { etapa: string }) => n.etapa === "triagem");
  await enviar({ negocioId: negocio.id }, "procuracao.txt", `PROCURAÇÃO. Outorgante: ${negocio.nome}, CPF 000.000.000-00. Outorgados: os advogados do escritório. Poderes gerais para o foro. Joinville, 20/10/2026.`);
  await enviar({ negocioId: negocio.id }, "conta-de-luz.txt", `Celesc. Titular: ${negocio.nome}. Rua das Palmeiras, 120, Joinville/SC. Referência: 03/2026.`);
  ia.respostas["conferir-pasta"] = {
    itens: [
      { item: "procuracao", situacao: "certo", detalhe: "Assinada em 20/10/2026, com poderes gerais para o foro.", documento: "procuracao.txt" },
      { item: "comprovante_residencia", situacao: "atencao", detalhe: "Conta de março de 2026: tem mais de 90 dias. Peça uma recente.", documento: "conta-de-luz.txt" },
      { item: "documento_identidade", situacao: "falta", detalhe: "Não há documento com foto na pasta.", documento: null },
      { item: "cpf", situacao: "atencao", detalhe: "O CPF da procuração não confere com o cadastro.", documento: "procuracao.txt" },
      { item: "hipossuficiencia", situacao: "falta", detalhe: "Sem declaração. Precisa se for pedir justiça gratuita.", documento: null },
      { item: "contrato_honorarios", situacao: "falta", detalhe: "Sem contrato de honorários na pasta.", documento: null },
      { item: "litispendencia", situacao: "certo", detalhe: "Nenhum processo do escritório com a mesma pessoa e o mesmo assunto.", documento: null },
    ],
    outros: [],
    resumo: "Ainda não dá para protocolar: falta o documento com foto e o comprovante de residência está velho.",
    recusa: null,
  };
  await conferirPastaDe(deps, organizationId, { negocioId: negocio.id }, { timezone: "America/Sao_Paulo" });
  await guardar("pastaDoNegocio", `/negocios/${negocio.id}/pasta`);
  const marinaId = (amostras["cliente"] as { corpo: { id: string } }).corpo.id;
  await enviar({ clienteId: marinaId }, "rg-marina.txt", "Carteira de identidade. Nome: Marina Duarte. CPF 529.982.247-25. Expedida em 2019.");
  ia.respostas["conferir-pasta"] = {
    itens: [
      { item: "procuracao", situacao: "falta", detalhe: "A procuração do processo atual não está na pasta da cliente. Para um caso novo, precisa de outra.", documento: null },
      { item: "comprovante_residencia", situacao: "falta", detalhe: "Sem comprovante de residência na pasta.", documento: null },
      { item: "documento_identidade", situacao: "certo", detalhe: "Carteira de identidade legível, com o mesmo nome do cadastro.", documento: "rg-marina.txt" },
      { item: "cpf", situacao: "certo", detalhe: "O CPF da identidade confere com o cadastro.", documento: "rg-marina.txt" },
      { item: "hipossuficiencia", situacao: "falta", detalhe: "Sem declaração. Precisa se for pedir justiça gratuita.", documento: null },
      { item: "contrato_honorarios", situacao: "falta", detalhe: "Sem contrato de honorários na pasta.", documento: null },
      { item: "litispendencia", situacao: "atencao", detalhe: "Já há a ação contra a Seguradora Alfa. Confira se o caso novo não é o mesmo pedido.", documento: null },
    ],
    outros: ["A identidade foi expedida em 2019: vale, mas a foto pode estar antiga."],
    resumo: "Para um caso novo, faltam a procuração, o comprovante de residência e o contrato de honorários.",
    recusa: null,
  };
  await conferirPastaDe(deps, organizationId, { clienteId: marinaId }, { timezone: "America/Sao_Paulo" });
  amostras["clienteConferido"] = { path: `/clientes/${marinaId}?conferido`, corpo: await get(`/clientes/${marinaId}`) };

  // Banco de teses: a peça da demonstração vira modelo, mais um colado.
  await mandar("POST", "/modelos", { pecaId, tese: "Prova testemunhal confirma o uso habitual do imóvel", assunto: "Alegações finais" });
  const colado = await mandar("POST", "/modelos", {
    titulo: "Contestação · negativa de cobertura de plano de saúde",
    tipo: "contestacao",
    tese: "Exclusão contratual não vale contra indicação médica",
    assunto: "Plano de saúde",
    texto: "# Excelentíssimo Senhor Doutor Juiz de Direito\n\nFULANA DE TAL, já qualificada, vem apresentar CONTESTAÇÃO.\n\n## 1. Dos fatos\n\nA autora teve a cirurgia negada sob o argumento de exclusão contratual.\n\n## 2. Do direito\n\nA indicação médica prevalece sobre a cláusula de exclusão (Súmula 102 do TJSP, por analogia).\n\n## 3. Dos pedidos\n\nPede a improcedência.",
  });
  await guardar("modelos", "/modelos");
  await guardar("modelo", `/modelos/${colado.id}`);
  await mandar("PUT", `/pecas/${pecaId}`, { situacao: "revisada" });
  amostras["pecaRevisada"] = { path: `/pecas/${pecaId}?revisada`, corpo: await get(`/pecas/${pecaId}`) };

  // Retorno sobre a IA.
  const leitura = (await get(`/publicacoes/${sentenca.id}`)).sentenca;
  await mandar("POST", "/ia/retorno", { analiseId: leitura.id, util: true });
  const briefing = (amostras["prazo"] as { corpo: { briefing: { id: string } } }).corpo.briefing;
  await mandar("POST", "/ia/retorno", { analiseId: briefing.id, util: false, comentario: "Contou o prazo do laudo como se fosse corrido." });
  await mandar("POST", "/ia/retorno", { pecaId, util: false, comentario: "Citou o evento errado na seção 2." });
  await guardar("retornos", "/ia/retornos");

  mkdirSync(DESTINO, { recursive: true });
  for (const [nome, v] of Object.entries(amostras)) writeFileSync(`${DESTINO}${nome}.json`, `${JSON.stringify(v, null, 2)}\n`);
  console.log(`${Object.keys(amostras).length} amostras em ${DESTINO}`);
} finally {
  await t.drop();
}
