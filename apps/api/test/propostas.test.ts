/**
 * Leitura da sentença, leitura de foto, revisão registrada, retorno sobre a IA,
 * conferência da pasta e banco de teses, pela API, com banco de verdade e IA
 * de mentira. Dados inventados.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { criarEscritorio } from "../src/escritorio-novo.ts";
import type { Pedido } from "../src/rotas/base.ts";
import { createRotas } from "../src/rotas/index.ts";
import { consultaDeTexto } from "../src/servicos/modelos.ts";
import { lerDocumentoComIa } from "../src/servicos/leitura.ts";
import { lerSentencaDaPublicacao } from "../src/servicos/sentencas.ts";
import { iaFalsa } from "./ia-falsa.ts";

const SENTENCA =
  "Vistos. Marina Duarte ajuizou ação de cobrança de seguro contra Seguradora Alfa S.A. Pede a indenização securitária de R$ 80.000,00 e danos morais. O laudo do evento 87 confirmou a invalidez. Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar a ré ao pagamento de R$ 80.000,00, com correção pelo IPCA e juros desde a citação. Rejeito o pedido de danos morais. Condeno a ré em custas e honorários de 15% do valor da condenação.";

const LEITURA = {
  tipo: "sentenca",
  resultado: "parcialmente_procedente",
  resumo: "Ganhamos a indenização de R$ 80.000,00; perdemos os danos morais.",
  pedidos: [
    { pedido: "Indenização securitária de R$ 80.000,00", decisao: "acolhido", detalhe: "O laudo do evento 87 confirmou a invalidez." },
    { pedido: "Danos morais", decisao: "rejeitado", detalhe: "Mero inadimplemento contratual." },
  ],
  valores: ["R$ 80.000,00, com correção pelo IPCA e juros desde a citação"],
  honorarios: "Ré paga 15% do valor da condenação",
  recurso: { cabivel: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC" },
  recorrer: ["Danos morais: a negativa durou 14 meses."],
  manter: ["Laudo do evento 87."],
  recusa: null,
};

describe.skipIf(!hasTestDatabase)("propostas 1 a 5 pela API", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let cookie = "";
  let orgId = "";
  let processoId = "";
  let clienteId = "";
  const ia = iaFalsa();
  const arquivos = armazenamentoEmMemoria();
  const pedidos: Pedido[] = [];
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  const call = (path: string, init: RequestInit & { json?: unknown } = {}) =>
    app.request(`/api/app${path}`, {
      ...init,
      headers: { ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }), origin: env.WEB_ORIGIN, cookie },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  const json = async <T = any>(r: Response | Promise<Response>): Promise<T> => (await r).json() as Promise<T>;
  const enviar = (campos: Record<string, string>, arquivo: File) => {
    const form = new FormData();
    form.set("arquivo", arquivo);
    for (const [k, v] of Object.entries(campos)) form.set(k, v);
    return call("/documentos", { method: "POST", body: form });
  };

  beforeAll(async () => {
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async (p) => void pedidos.push(p), log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    ({ organizationId: orgId } = await criarEscritorio(t.db, auth, { nome: "Souza & Mendes Advocacia", slug: "souza-mendes", dono: { email: "beatriz@souza.adv.br", nome: "Beatriz Souza", senha: "senha-bem-longa-123", cargo: "Advogada · sócia", oabNumero: "41.233", oabUf: "SC" } }));
    const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email: "beatriz@souza.adv.br", password: "senha-bem-longa-123" }) });
    cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
    clienteId = (await json(call("/clientes", { method: "POST", json: { nome: "Marina Duarte", tipo: "pf", documento: "529.982.247-25", endereco: "Rua das Acácias, 45, Joinville/SC" } }))).id;
    processoId = (
      await json(
        call("/processos", {
          method: "POST",
          json: { cnj: "50043212520268240038", clienteId, assunto: "Seguro de vida, invalidez", partes: [{ nome: "Marina Duarte", polo: "ativo", papel: "Autora", cliente: true }, { nome: "Seguradora Alfa S.A.", polo: "passivo", papel: "Ré" }] },
        }),
      )
    ).id;
  });

  afterAll(async () => {
    await t?.drop();
  });

  /* 1. Leitura da sentença */

  test("sentença: a IA lê pedido a pedido e a pessoa confirma o resultado", async () => {
    const pub = await json(call("/publicacoes", { method: "POST", json: { processoId, disponibilizadaEm: "2026-10-28", tipoDocumento: "Sentença", texto: SENTENCA } }));
    expect(pedidos).toContainEqual({ nome: "publicacao.nova", organizationId: orgId, publicacaoId: pub.id });
    expect((await json(call(`/publicacoes/${pub.id}`))).decisao).toBe(true);

    ia.respostas["ler-sentenca"] = LEITURA;
    const a = await lerSentencaDaPublicacao({ db: t.db, ia }, orgId, pub.id);
    expect(a).toMatchObject({ situacao: "pronto", acao: "ler-sentenca", fonte: "Publicação · 28/10/2026", conteudo: { resultado: "parcialmente_procedente" } });
    expect(JSON.stringify(ia.pedidos["ler-sentenca"])).toContain("JULGO PARCIALMENTE PROCEDENTES");

    const lida = await json(call(`/publicacoes/${pub.id}`));
    expect(lida.sentenca.conteudo.pedidos).toHaveLength(2);
    expect(lida.resultado).toBeNull();

    const r = await call(`/publicacoes/${pub.id}/resultado`, { method: "POST", json: { tipo: "sentenca", resultado: "parcialmente_procedente", resumo: LEITURA.resumo } });
    expect(r.status).toBe(200);
    // Confirmar de novo troca, não duplica.
    await call(`/publicacoes/${pub.id}/resultado`, { method: "POST", json: { tipo: "sentenca", resultado: "parcialmente_procedente", resumo: "Ganhamos a indenização." } });
    expect((await json(call(`/publicacoes/${pub.id}`))).resultado).toMatchObject({ resultado: "parcialmente_procedente", confirmadoPor: { apelido: "Beatriz" } });
    const ficha = await json(call(`/processos/${processoId}`));
    expect(ficha.resultados).toEqual([{ id: expect.any(String), tipo: "sentenca", resultado: "parcialmente_procedente", decididoEm: "2026-10-29", resumo: "Ganhamos a indenização.", publicacaoId: pub.id }]);
    expect((await json(call("/registro"))).itens.map((i: { acao: string }) => i.acao)).toContain("resultado.confirmado");
  });

  test("sentença: despacho comum a rotina não lê; à mão dá para forçar", async () => {
    const pub = await json(call("/publicacoes", { method: "POST", json: { processoId, disponibilizadaEm: "2026-10-28", tipoDocumento: "Despacho", texto: "Intimem-se as partes para especificarem as provas que pretendem produzir, no prazo de 15 dias." } }));
    const antes = ia.chamadas.length;
    expect(await lerSentencaDaPublicacao({ db: t.db, ia }, orgId, pub.id)).toBeNull();
    expect(ia.chamadas.length).toBe(antes);
    expect((await json(call(`/publicacoes/${pub.id}`))).decisao).toBe(false);
    expect((await json(call(`/publicacoes/${pub.id}/sentenca`, { method: "POST" }))).situacao).toBe("pronto");
  });

  /* 2. Leitura de foto e PDF escaneado */

  test("foto: guarda na hora, a IA transcreve em segundo plano", async () => {
    const r = await enviar({ clienteId }, new File([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])], "rg-marina.jpg", { type: "image/jpeg" }));
    expect(r.status).toBe(201);
    const { id: docId, lendo } = (await r.json()) as { id: string; lendo: boolean };
    expect(lendo).toBe(true);
    expect(pedidos).toContainEqual({ nome: "documento.ler", organizationId: orgId, documentoId: docId });
    const antes = (await json(call(`/documentos?cliente=${clienteId}`))).itens.find((d: { id: string }) => d.id === docId);
    expect(antes).toMatchObject({ leitura: "pendente", lido: false });

    ia.respostas["ler-imagem"] = "REPÚBLICA FEDERATIVA DO BRASIL\nNome: MARINA DUARTE\nCPF: 529.982.247-25\nData de nascimento: 12/03/1986";
    expect(await lerDocumentoComIa({ db: t.db, ia, arquivos }, orgId, docId)).toBe("pronta");
    const depois = (await json(call(`/documentos?cliente=${clienteId}`))).itens.find((d: { id: string }) => d.id === docId);
    expect(depois).toMatchObject({ leitura: "pronta", lido: true });
    expect(ia.chamadas).toContain("ler-imagem");
  });

  test("PDF com texto não passa pela IA; ler de novo só o que precisa", async () => {
    const r = await enviar({ clienteId }, new File(["Declaro, para fins de justiça gratuita, que não tenho condições de arcar com as custas do processo sem prejuízo do sustento da minha família. Joinville, 20 de outubro de 2026. Marina Duarte."], "declaracao.txt", { type: "text/plain" }));
    const { id: docId, lendo } = (await r.json()) as { id: string; lendo: boolean };
    expect(lendo).toBe(false);
    expect((await call(`/documentos/${docId}/ler`, { method: "POST" })).status).toBe(422);
  });

  /* 3. Revisão registrada e retorno sobre a IA */

  test("revisão: grava quem revisou; mudar o texto volta a rascunho", async () => {
    const { id: pecaId } = await json(call("/pecas/manual", { method: "POST", json: { processoId, tipo: "contrarrazoes", texto: "# Excelentíssimo Senhor Doutor Juiz\n\nContrarrazões." } }));
    const r = await json(call(`/pecas/${pecaId}`, { method: "PUT", json: { situacao: "revisada" } }));
    expect(r.situacao).toBe("revisada");
    expect((await json(call(`/pecas/${pecaId}`))).revisao).toMatchObject({ por: { apelido: "Beatriz", oab: "OAB/SC 41.233" }, em: expect.any(String) });
    expect((await json(call("/registro"))).itens.map((i: { acao: string }) => i.acao)).toContain("peca.revisada");

    // Salvar o mesmo texto não desfaz a revisão; texto novo, sim.
    await call(`/pecas/${pecaId}`, { method: "PUT", json: { texto: "# Excelentíssimo Senhor Doutor Juiz\n\nContrarrazões." } });
    expect((await json(call(`/pecas/${pecaId}`))).situacao).toBe("revisada");
    expect((await json(call(`/pecas/${pecaId}`, { method: "PUT", json: { texto: "# Excelentíssimo Senhor Doutor Juiz\n\nContrarrazões ampliadas." } }))).situacao).toBe("rascunho");
    expect(await json(call(`/pecas/${pecaId}`))).toMatchObject({ situacao: "rascunho", revisao: null });
  });

  test("retorno: útil ou errado, um voto por pessoa, e os sócios veem o que estava errado", async () => {
    const pub = (await json(call(`/processos/${processoId}`))).resultados[0].publicacaoId;
    const analiseId = (await json(call(`/publicacoes/${pub}`))).sentenca.id;
    expect((await call("/ia/retorno", { method: "POST", json: { analiseId, util: true } })).status).toBe(200);
    expect((await call("/ia/retorno", { method: "POST", json: { analiseId, util: false, comentario: "O recurso cabível estava certo, mas faltou o prazo do preparo." } })).status).toBe(200);
    expect((await call("/ia/retorno", { method: "POST", json: { util: true } })).status).toBe(400);
    const r = await json(call("/ia/retornos"));
    expect(r.porAcao).toEqual([{ acao: "ler-sentenca", rotulo: "Leitura da sentença", uteis: 0, errados: 1 }]);
    expect(r.errados[0]).toMatchObject({ rotulo: "Leitura da sentença", comentario: "O recurso cabível estava certo, mas faltou o prazo do preparo.", pessoa: { apelido: "Beatriz" }, onde: { tipo: "publicacao", id: pub } });
  });

  /* 4. Conferência da pasta */

  test("conferência: a IA lê a pasta da triagem e diz item por item", async () => {
    const { id: negocioId } = await json(call("/negocios", { method: "POST", json: { nome: "Carlos Pereira", assunto: "Revisional de aposentadoria", area: "Previdenciário" } }));
    // Sem documento com texto, a IA recusa sem ser chamada.
    expect((await json(call(`/negocios/${negocioId}/conferir`, { method: "POST" }))).situacao).toBe("recusa");

    await enviar({ negocioId }, new File(["PROCURAÇÃO. Outorgante: Carlos Pereira, CPF 111.444.777-35. Outorgado: Beatriz Souza, OAB/SC 41.233, com poderes da cláusula ad judicia. Joinville, 2 de março de 2025. Carlos Pereira."], "procuracao.txt", { type: "text/plain" }));
    ia.respostas["conferir-pasta"] = {
      itens: [
        { item: "procuracao", situacao: "atencao", detalhe: "Assinada em 02/03/2025: tem mais de 12 meses.", documento: "procuracao.txt" },
        { item: "comprovante_residencia", situacao: "falta", detalhe: "Não há comprovante na pasta.", documento: null },
        { item: "documento_identidade", situacao: "falta", detalhe: "Não há documento com foto.", documento: null },
        { item: "cpf", situacao: "certo", detalhe: "CPF da procuração confere.", documento: "procuracao.txt" },
        { item: "hipossuficiencia", situacao: "falta", detalhe: "Sem declaração.", documento: null },
        { item: "contrato_honorarios", situacao: "falta", detalhe: "Sem contrato.", documento: null },
        { item: "litispendencia", situacao: "certo", detalhe: "Nenhum processo parecido.", documento: null },
      ],
      outros: [],
      resumo: "Faltam o comprovante de residência e o documento com foto; a procuração precisa ser renovada.",
      recusa: null,
    };
    const a = await json(call(`/negocios/${negocioId}/conferir`, { method: "POST" }));
    expect(a).toMatchObject({ situacao: "pronto", fonte: expect.stringMatching(/^1 documento · /), conteudo: { itens: expect.arrayContaining([expect.objectContaining({ item: "procuracao", situacao: "atencao" })]) } });
    const pedido = JSON.stringify(ia.pedidos["conferir-pasta"]);
    expect(pedido).toContain("Carlos Pereira");
    expect(pedido).toContain("Tema 1198");

    let pasta = await json(call(`/negocios/${negocioId}/pasta`));
    expect(pasta.documentos.map((d: { nome: string }) => d.nome)).toEqual(["procuracao.txt"]);
    expect(pasta.conferencia).toMatchObject({ situacao: "pronto", desatualizada: false });

    // Documento novo: a conferência fica desatualizada.
    await enviar({ negocioId }, new File(["COMPROVANTE DE RESIDÊNCIA. Companhia de Água de Joinville. Titular: Carlos Pereira. Rua dos Ipês, 200, Joinville/SC. Vencimento: 10/10/2026. Valor: R$ 87,40."], "conta-de-agua.txt", { type: "text/plain" }));
    pasta = await json(call(`/negocios/${negocioId}/pasta`));
    expect(pasta.conferencia.desatualizada).toBe(true);

    // Virou cliente: a pasta vai junto.
    const { clienteId: novo } = await json(call(`/negocios/${negocioId}/concluir`, { method: "POST", json: {} }));
    expect((await json(call(`/clientes/${novo}`))).documentos.map((d: { nome: string }) => d.nome).sort()).toEqual(["conta-de-agua.txt", "procuracao.txt"]);
  });

  test("conferência na ficha do cliente leva os processos dele para a litispendência", async () => {
    const a = await json(call(`/clientes/${clienteId}/conferir`, { method: "POST", json: { assunto: "Seguro de vida" } }));
    expect(a.situacao).toBe("pronto");
    const pedido = JSON.stringify(ia.pedidos["conferir-pasta"]);
    expect(pedido).toContain("Marina Duarte × Seguradora Alfa S.A.");
    expect(pedido).toContain("529.982.247-25".replace(/\D/g, ""));
    expect((await json(call(`/clientes/${clienteId}`))).conferencia).toMatchObject({ situacao: "pronto" });
  });

  /* 5. Banco de teses */

  test("modelos: guardar, achar e a IA seguir na peça", async () => {
    const texto = `# Excelentíssimo Senhor Doutor Juiz de Direito\n\n## Da invalidez comprovada\n\nO laudo pericial comprovou a invalidez permanente, o que basta para a cobertura do seguro de vida. ${"A seguradora não pode negar a indenização sem prova de má-fé do segurado. ".repeat(5)}\n\n## Dos pedidos\n\n- o desprovimento do recurso.`;
    const r = await call("/modelos", { method: "POST", json: { titulo: "Contrarrazões · seguro de vida, invalidez", tipo: "contrarrazoes", tese: "Laudo que comprova invalidez basta para a cobertura", assunto: "Seguro de vida", texto } });
    expect(r.status).toBe(201);
    const { id: modeloId } = (await r.json()) as { id: string };
    await call("/modelos", { method: "POST", json: { titulo: "Notificação · aluguel atrasado", tipo: "notificacao", texto: `Notificação extrajudicial sobre aluguel atrasado. ${"O locatário deve os aluguéis vencidos. ".repeat(8)}` } });
    expect((await call("/modelos", { method: "POST", json: { titulo: "Curto", tipo: "contrarrazoes", texto: "curto demais" } })).status).toBe(400);
    expect((await call("/modelos", { method: "POST", json: { titulo: "Tipo errado", tipo: "nao-existe", texto } })).status).toBe(400);

    expect((await json(call("/modelos?busca=invalidez"))).itens.map((m: { titulo: string }) => m.titulo)).toEqual(["Contrarrazões · seguro de vida, invalidez"]);
    expect((await json(call("/modelos?tipo=notificacao"))).itens).toHaveLength(1);

    // Mesmo tipo vem primeiro; a busca de texto pega o assunto do processo.
    const prep = await json(call(`/pecas/preparar?processo=${processoId}&tipo=contrarrazoes`));
    expect(prep.modelos).toEqual([{ id: modeloId, titulo: "Contrarrazões · seguro de vida, invalidez" }]);

    ia.respostas["gerar-documento"] = "# Excelentíssimo Senhor Doutor Juiz\n\nContrarrazões.";
    const g = await call("/pecas", { method: "POST", json: { processoId, tipo: "contrarrazoes", instrucoes: "Manter a sentença." } });
    const pecaId = g.headers.get("x-peca-id")!;
    await g.text();
    const pedido = JSON.stringify(ia.pedidos["gerar-documento"]);
    expect(pedido).toContain("Modelos do escritório");
    expect(pedido).toContain("Laudo que comprova invalidez basta para a cobertura");
    expect(pedido).not.toContain("aluguel atrasado");
    expect((await json(call(`/pecas/${pecaId}`))).modelos).toEqual([{ id: modeloId, titulo: "Contrarrazões · seguro de vida, invalidez" }]);

    // A peça vira modelo; apagar tira do banco.
    expect((await call("/modelos", { method: "POST", json: { pecaId } })).status).toBe(422);
    expect((await call(`/modelos/${modeloId}`, { method: "DELETE" })).status).toBe(200);
    expect((await json(call("/modelos"))).total).toBe(1);
  });

  test("modelo a partir de um arquivo DOCX ou TXT", async () => {
    const form = new FormData();
    form.set("arquivo", new File([`Contestação. ${"A parte autora não comprovou o fato constitutivo do seu direito. ".repeat(6)}`], "contestacao-padrao.txt", { type: "text/plain" }));
    form.set("tipo", "contestacao");
    form.set("tese", "Ônus da prova do autor");
    const r = await call("/modelos/arquivo", { method: "POST", body: form });
    expect(r.status).toBe(201);
    const m = await json(call(`/modelos/${((await r.json()) as { id: string }).id}`));
    expect(m).toMatchObject({ titulo: "contestacao-padrao", tipo: "contestacao", tipoNome: "Contestação", tese: "Ônus da prova do autor" });
  });

  test("a busca dos modelos aceita qualquer palavra do caso", () => {
    expect(consultaDeTexto("Seguro de vida, invalidez; laudo")).toBe("seguro | vida | invalidez | laudo");
    expect(consultaDeTexto("a de o")).toBeNull();
  });
});
