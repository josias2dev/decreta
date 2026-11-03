/**
 * Assinatura eletrônica pela ZapSign do escritório, contra uma ZapSign de MENTIRA (apoio-financeiro.ts):
 * a chave cifrada, o interruptor, quem pode mandar, o envio do contrato de honorários, da procuração ou do termo de IA e a cópia
 * assinada que volta para a pasta do cliente. NADA aqui foi testado contra a ZapSign real.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { MIME_DOCX } from "@decreta/documentos";
import { hasTestDatabase } from "@decreta/db/testing";
import { CHAVE_DA_ZAPSIGN, montarCenario, type Cenario } from "./apoio-financeiro.ts";

setDefaultTimeout(60_000);

describe.skipIf(!hasTestDatabase)("assinatura eletrônica pela ZapSign do escritório", () => {
  let s: Cenario;
  let contratoDocx = "";
  let planilha = "";
  beforeAll(async () => {
    s = await montarCenario();
    const novo = async (nome: string, mime: string, bytes: Uint8Array) => {
      const id = crypto.randomUUID();
      const chave = `${s.souza.orgId}/${id}`;
      await s.arquivos.put(chave, bytes, mime);
      await s.t.owner`insert into documentos (id, organization_id, cliente_id, nome, mime, tamanho, chave) values (${id}, ${s.souza.orgId}, ${s.souza.clienteId}, ${nome}, ${mime}, ${bytes.length}, ${chave})`;
      return id;
    };
    contratoDocx = await novo("Contrato de honorários - Marina Duarte.docx", MIME_DOCX, new Uint8Array([80, 75, 3, 4, 20, 0]));
    planilha = await novo("Planilha.csv", "text/csv", new Uint8Array([97, 59, 98]));
  }, 120_000);
  afterAll(async () => {
    await s?.encerrar();
  }, 60_000);

  const signatarios = [
    { nome: "Marina Duarte", email: "marina@exemplo.com.br", telefone: "47991234567" },
    { nome: "Beatriz Souza", email: "beatriz@souza.adv.br" },
  ];
  const enviar = (quem: "beatriz" | "tiago" | "bianca" | "mendes" | "camila", documentoId = contratoDocx, corpo: unknown = { signatarios }) => s.com(quem, `/documentos/${documentoId}/assinatura`, { json: corpo });

  test("sem chave da ZapSign, o fluxo de baixar e anexar continua, e a tela sabe que a assinatura está desligada", async () => {
    const r = await enviar("beatriz");
    expect(r.status).toBe(409);
    expect((await r.json()).erro).toBe("sem_zapsign");
    expect((await s.json(s.com("beatriz", "/escritorio"))).assinaturaLigada).toBe(false);
    expect((await s.com("beatriz", `/documentos/${contratoDocx}`)).status).toBe(200);
    expect(s.provedores.chamadasDe("zapsign")).toEqual([]);
  });

  test("só sócio guarda a chave; ela vai cifrada, nunca volta, e o interruptor liga e desliga", async () => {
    const corpo = { chave: CHAVE_DA_ZAPSIGN, ambiente: "sandbox" };
    expect((await s.com("camila", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: corpo })).status).toBe(403);
    expect((await s.com("demo", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: corpo })).status).toBe(403);
    const r = await s.com("beatriz", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: corpo });
    expect(r.status).toBe(200);
    const texto = await r.text();
    expect(texto).not.toContain(CHAVE_DA_ZAPSIGN);
    expect(JSON.parse(texto).estado.zapsign).toEqual({ configurado: true, ligada: true, ambiente: "sandbox" });
    const [linha] = await s.t.owner<{ zapsign_chave: string }[]>`select zapsign_chave from cobranca_config where organization_id = ${s.souza.orgId}`;
    expect(linha!.zapsign_chave.startsWith("v1.")).toBe(true);
    expect(linha!.zapsign_chave).not.toContain(CHAVE_DA_ZAPSIGN);
    expect((await s.json(s.com("beatriz", "/escritorio"))).assinaturaLigada).toBe(true);
    // Desligado pelo interruptor, a chave fica guardada, mas nada sai.
    await s.com("beatriz", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: { ligada: false } });
    expect((await s.json(s.com("beatriz", "/escritorio"))).assinaturaLigada).toBe(false);
    expect((await (await enviar("beatriz")).json()).erro).toBe("sem_zapsign");
    await s.com("beatriz", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: { ligada: true } });
    expect((await s.json(s.com("beatriz", "/escritorio"))).assinaturaLigada).toBe(true);
  });

  test("só sócio ou advogado com OAB manda documento para assinatura", async () => {
    expect((await enviar("bianca")).status).toBe(403);
    expect((await (await enviar("bianca")).json()).erro).toBe("sem_oab");
    expect((await enviar("mendes")).status).toBe(404);
  });

  test("manda o contrato de honorários em DOCX: a ZapSign recebe o arquivo e os signatários, e a pasta ganha o registro", async () => {
    const r = await enviar("tiago");
    expect(r.status).toBe(201);
    const a = await r.json();
    expect(a).toMatchObject({ documentoId: contratoDocx, situacao: "enviada", assinadaEm: null, documentoAssinadoId: null });
    expect(a.signatarios.map((x: { nome: string; situacao: string }) => [x.nome, x.situacao])).toEqual([["Marina Duarte", "new"], ["Beatriz Souza", "new"]]);
    expect(a.signatarios[0].link).toMatch(/^https:\/\/app\.zapsign\.com\.br\/verificar\//);
    const pedido = s.provedores.chamadasDe("zapsign").find((c) => c.metodo === "POST")!;
    expect(pedido.caminho).toBe("/api/v1/docs/");
    expect(pedido.cabecalhos["authorization"]).toBe(`Bearer ${CHAVE_DA_ZAPSIGN}`);
    expect(pedido.corpo.name).toBe("Contrato de honorários - Marina Duarte");
    expect(pedido.corpo.base64_docx).toBe(Buffer.from([80, 75, 3, 4, 20, 0]).toString("base64"));
    expect(pedido.corpo.signers[0]).toMatchObject({ name: "Marina Duarte", email: "marina@exemplo.com.br", send_automatic_email: true, send_automatic_whatsapp: true, phone_number: "47991234567" });
    expect(pedido.corpo.signers[1]).toMatchObject({ send_automatic_whatsapp: false });
    expect((await s.json(s.com("beatriz", `/documentos/${contratoDocx}/assinaturas`))).itens).toHaveLength(1);
    const [reg] = await s.t.owner<{ user_id: string }[]>`select user_id from auditoria where organization_id = ${s.souza.orgId} and acao = 'assinatura.enviada' order by created_at desc limit 1`;
    expect(reg!.user_id).toBe(s.souza.userIds.tiago);
  });

  test("o link de assinar é de quem assina: só sócio ou advogado com OAB recebe; o resto da equipe vê quem assinou, sem o link", async () => {
    const ver = async (quem: "beatriz" | "tiago" | "bianca") => (await s.json(s.com(quem, `/documentos/${contratoDocx}/assinaturas`))).itens[0].signatarios as { nome: string; situacao: string; link?: string }[];
    for (const quem of ["beatriz", "tiago"] as const) expect((await ver(quem))[0]!.link).toMatch(/^https:\/\/app\.zapsign\.com\.br\/verificar\//);
    const daEquipe = await ver("bianca");
    expect(daEquipe.map((x) => [x.nome, x.situacao])).toEqual([["Marina Duarte", "new"], ["Beatriz Souza", "new"]]);
    expect(daEquipe.every((x) => !("link" in x))).toBe(true);
  });

  test("só PDF e DOCX vão, cada signatário precisa de e-mail ou celular, e na demonstração nada sai", async () => {
    const formato = await enviar("beatriz", planilha);
    expect(formato.status).toBe(422);
    expect((await formato.json()).erro).toBe("formato_nao_aceito");
    expect((await enviar("beatriz", contratoDocx, { signatarios: [{ nome: "Sem contato" }] })).status).toBe(400);
    expect((await enviar("beatriz", contratoDocx, { signatarios: [] })).status).toBe(400);
    expect((await enviar("beatriz", contratoDocx, { signatarios: [{ nome: "Celular torto", telefone: "123" }] })).status).toBe(400);
    expect((await enviar("beatriz", crypto.randomUUID())).status).toBe(404);
    const demo = await s.com("demo", `/documentos/${contratoDocx}/assinatura`, { json: { signatarios } });
    expect(demo.status).toBe(403);
  });

  test("a ZapSign recusa: a frase chega à pessoa sem a chave", async () => {
    s.provedores.falhas.set("POST /api/v1/docs/", { status: 403, corpo: { detail: "Sem plano de API." } });
    const r = await enviar("beatriz");
    s.provedores.falhas.delete("POST /api/v1/docs/");
    expect(r.status).toBe(422);
    const corpo = await r.json();
    expect(corpo.erro).toBe("zapsign_recusou");
    expect(JSON.stringify(corpo)).not.toContain(CHAVE_DA_ZAPSIGN);
  });

  test("atualizar: enquanto falta alguém assinar, nada entra na pasta; todos assinaram, o arquivo assinado volta para a pasta do cliente, uma vez só", async () => {
    const a = (await s.json(s.com("beatriz", `/documentos/${contratoDocx}/assinaturas`))).itens[0];
    const pendente = await s.com("beatriz", `/assinaturas/${a.id}/atualizar`, { json: {} });
    expect(pendente.status).toBe(200);
    expect(await pendente.json()).toMatchObject({ situacao: "enviada", documentoAssinadoId: null });
    const token = (await s.t.owner<{ token: string }[]>`select token from assinaturas where id = ${a.id}`)[0]!.token;
    s.provedores.assinarTudo(token);
    const r = await s.com("beatriz", `/assinaturas/${a.id}/atualizar`, { json: {} });
    expect(r.status).toBe(200);
    const depois = await r.json();
    expect(depois).toMatchObject({ situacao: "assinada" });
    expect(depois.assinadaEm).toBeTruthy();
    expect(depois.signatarios.every((x: { situacao: string }) => x.situacao === "signed")).toBe(true);
    const [d] = await s.t.owner<{ nome: string; mime: string; cliente_id: string; chave: string }[]>`select nome, mime, cliente_id, chave from documentos where id = ${depois.documentoAssinadoId}`;
    expect(d).toMatchObject({ nome: "Contrato de honorários - Marina Duarte (assinado).pdf", mime: "application/pdf", cliente_id: s.souza.clienteId });
    expect([...s.arquivos.arquivos.get(d!.chave)!.bytes]).toEqual([37, 80, 68, 70, 45, 49]);
    // Perguntar de novo não guarda outra cópia.
    await s.com("beatriz", `/assinaturas/${a.id}/atualizar`, { json: {} });
    expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from documentos where organization_id = ${s.souza.orgId} and nome like '%(assinado)%'`)[0]!.n).toBe(1);
    expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao = 'assinatura.concluida'`)[0]!.n).toBe(1);
  });

  test("outro escritório não vê nem atualiza a assinatura", async () => {
    const a = (await s.json(s.com("beatriz", `/documentos/${contratoDocx}/assinaturas`))).itens[0];
    expect((await s.com("mendes", `/assinaturas/${a.id}/atualizar`, { json: {} })).status).toBe(404);
    expect((await s.json(s.com("mendes", `/documentos/${contratoDocx}/assinaturas`))).itens).toEqual([]);
    expect((await s.com("bianca", `/assinaturas/${a.id}/atualizar`, { json: {} })).status).toBe(403);
  });

  test("sem cofre no servidor, a assinatura não liga", async () => {
    const outro = await montarCenario({ cofre: false });
    try {
      const r = await outro.com("beatriz", "/financeiro/cobranca/zapsign", { metodo: "PUT", json: { chave: CHAVE_DA_ZAPSIGN, ambiente: "sandbox" } });
      expect(r.status).toBe(503);
    } finally {
      await outro.encerrar();
    }
  });
});
