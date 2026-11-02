/**
 * Cobrança pelo Asaas do escritório, contra um Asaas de MENTIRA (apoio-financeiro.ts): a chave guardada
 * cifrada, a cobrança com o vencimento da parcela, a baixa por aviso (webhook) tratada uma vez por evento, a
 * régua de lembretes que passa pelo fluxo de aprovação e o Pix Automático. NADA aqui foi testado contra o Asaas real.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { createHash } from "node:crypto";
import { somarDias } from "@decreta/core";
import { hasTestDatabase } from "@decreta/db/testing";
import JSZip from "jszip";
import { gerarLembretesDoDia } from "../src/servicos/regua.ts";
import { prepararExportacao } from "../src/servicos/exportacao.ts";
import { CHAVE_DE_TESTE, HOJE, montarCenario, type Cenario } from "./apoio-financeiro.ts";

// Banco de verdade e muitos pedidos por teste: com o computador ocupado, 5 s é pouco.
setDefaultTimeout(60_000);

const CHAVE_DE_OUTRO_ESCRITORIO ="$aact_hmlg_000OutraChaveDeOutroEscritorioQueOAsaasNaoReconhece0123456789";

describe.skipIf(!hasTestDatabase)("cobrança pelo Asaas do escritório", () => {
  let s: Cenario;
  beforeAll(async () => {
    s = await montarCenario();
  }, 120_000);
  afterAll(async () => {
    await s?.encerrar();
  }, 60_000);

  const contrato = async (corpo: Record<string, unknown>, quem: "beatriz" | "mendes" = "beatriz") => (await s.json(s.com(quem, "/financeiro/contratos", { json: corpo }))) as any;
  const cobrancaId = async (parcelaId: string) => (await s.t.owner<{ cobranca_id: string | null }[]>`select cobranca_id from parcelas_honorarios where id = ${parcelaId}`)[0]!.cobranca_id;
  const pagamentos = async (parcelaId: string) => s.t.owner<{ valor: number; origem: string; forma: string; registrado_por: string | null; estornado_em: Date | null }[]>`select valor::int as valor, origem, forma, registrado_por, estornado_em from pagamentos_honorarios where parcela_id = ${parcelaId} order by created_at`;
  const aviso = (evento: string, pagamento: string, extra: Record<string, unknown> = {}, id = `evt_${crypto.randomUUID()}`, orgId = s.souza.orgId, token = s.provedores.webhooks.filter((w) => w.url.endsWith(`/${orgId}`)).at(-1)?.authToken ?? "") =>
    s.aviso(orgId, { id, event: evento, dateCreated: `${HOJE} 10:00:00`, payment: { object: "payment", id: pagamento, value: 0, billingType: "PIX", status: "RECEIVED", ...extra } }, { "asaas-access-token": token });

  describe("a chave do Asaas do escritório", () => {
    test("só sócio mexe; quem tem o Financeiro liberado vê o estado, mas não grava", async () => {
      const corpo = { chave: CHAVE_DE_TESTE, ambiente: "sandbox" };
      expect((await s.com("camila", "/financeiro/cobranca/asaas", { metodo: "PUT", json: corpo })).status).toBe(403);
      expect((await s.com("tiago", "/financeiro/cobranca")).status).toBe(403);
      const estado = await s.json(s.com("camila", "/financeiro/cobranca"));
      expect(estado.podeEditar).toBe(false);
      expect(estado.asaas.configurado).toBe(false);
    });

    test("sem chave, a cobrança diz que o Asaas não está ligado e a baixa fica manual", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 5) } });
      const r = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toBe("sem_asaas");
      // A baixa à mão segue funcionando.
      expect((await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE, forma: "pix" } })).status).toBe(201);
    });

    test("chave de outro ambiente, fora do formato ou recusada pelo Asaas não é guardada", async () => {
      const ambiente = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_TESTE, ambiente: "producao" } });
      expect(ambiente.status).toBe(422);
      expect((await ambiente.json()).erro).toBe("ambiente_errado");
      const formato = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: "uma-chave-qualquer-de-outro-lugar", ambiente: "sandbox" } });
      expect((await formato.json()).erro).toBe("chave_invalida");
      const recusada = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_OUTRO_ESCRITORIO, ambiente: "sandbox" } });
      expect(recusada.status).toBe(422);
      const corpo = await recusada.json();
      expect(corpo.erro).toBe("asaas_recusou");
      expect(JSON.stringify(corpo)).not.toContain(CHAVE_DE_OUTRO_ESCRITORIO);
      expect((await s.t.owner`select 1 from cobranca_config where organization_id = ${s.souza.orgId} and asaas_chave is not null`).length).toBe(0);
    });

    test("na demonstração a chave não entra", async () => {
      const r = await s.com("demo", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_TESTE, ambiente: "sandbox" } });
      expect(r.status).toBe(403);
      expect((await r.json()).erro).toBe("demonstracao");
    });

    test("a chave vai cifrada para o banco, nunca volta pela API e o aviso de pagamento nasce na conta do escritório", async () => {
      const r = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_TESTE, ambiente: "sandbox" } });
      expect(r.status).toBe(200);
      const texto = await r.text();
      expect(texto).not.toContain(CHAVE_DE_TESTE);
      expect(texto).not.toContain("aact_hmlg");
      const corpo = JSON.parse(texto);
      expect(corpo).toMatchObject({ avisoLigado: true, erroDoAviso: null });
      expect(corpo.estado.asaas).toMatchObject({ configurado: true, ambiente: "sandbox", avisoLigado: true, urlDoAviso: `https://api.decreta.local/api/cobranca/asaas/${s.souza.orgId}` });
      // O estado em qualquer outra tela também não leva a chave.
      expect(JSON.stringify(await s.json(s.com("camila", "/financeiro/cobranca")))).not.toContain("aact_");

      const [linha] = await s.t.owner<{ asaas_chave: string; asaas_webhook_token_hash: string; asaas_webhook_id: string }[]>`select asaas_chave, asaas_webhook_token_hash, asaas_webhook_id from cobranca_config where organization_id = ${s.souza.orgId}`;
      expect(linha!.asaas_chave.startsWith("v1.")).toBe(true);
      expect(linha!.asaas_chave).not.toContain(CHAVE_DE_TESTE);
      expect(linha!.asaas_chave).not.toContain("aact");
      const webhook = s.provedores.webhooks.at(-1)!;
      expect(webhook.url).toBe(`https://api.decreta.local/api/cobranca/asaas/${s.souza.orgId}`);
      expect(webhook.events).toContain("PAYMENT_RECEIVED");
      // Do segredo do aviso, o banco guarda só o hash.
      expect(linha!.asaas_webhook_token_hash).toBe(createHash("sha256").update(webhook.authToken).digest("hex"));
      expect(JSON.stringify(linha)).not.toContain(webhook.authToken);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao = 'cobranca.asaas_configurado'`)[0]!.n).toBe(1);
    });

    test("nenhuma chamada ao Asaas é feita sem a chave no cabeçalho, e a chave nunca aparece no registro de atividades", async () => {
      for (const c of s.provedores.chamadasDe("asaas")) expect([CHAVE_DE_TESTE, CHAVE_DE_OUTRO_ESCRITORIO]).toContain(c.cabecalhos["access_token"]!);
      const tudo = JSON.stringify(await s.t.owner`select acao, detalhes from auditoria where organization_id = ${s.souza.orgId}`);
      expect(tudo).not.toContain(CHAVE_DE_TESTE);
      expect(tudo).not.toContain("aact_");
    });

    test("a cópia dos dados do escritório leva os honorários e não leva as chaves nem o segredo do aviso", async () => {
      await s.t.owner`update cobranca_config set zapsign_chave = 'v1.zapsign.cifrada.x' where organization_id = ${s.souza.orgId}`;
      const pedida = await s.json(s.com("beatriz", "/escritorio/exportacoes", { json: {} }));
      const [{ asaas_chave: chave, asaas_webhook_token_hash: hash }] = await s.t.owner<{ asaas_chave: string; asaas_webhook_token_hash: string }[]>`select asaas_chave, asaas_webhook_token_hash from cobranca_config where organization_id = ${s.souza.orgId}`;
      await prepararExportacao({ db: s.t.db, arquivos: s.arquivos, telas: "https://decreta.local" }, s.souza.orgId, pedida.id);
      const baixada = await s.com("beatriz", `/escritorio/exportacoes/${pedida.id}/partes/1`);
      const zip = await JSZip.loadAsync(new Uint8Array(await baixada.arrayBuffer()));
      const nomes = Object.keys(zip.files);
      for (const p of ["contratos_de_honorarios", "parcelas_de_honorarios", "pagamentos_de_honorarios", "prestacoes_de_contas", "repasses_de_alvara", "cobranca_e_assinatura", "assinaturas_eletronicas", "lembretes_de_cobranca"]) expect(nomes).toContain(`planilhas/${p}.csv`);
      const tudo = (await Promise.all(nomes.filter((n) => n.endsWith(".csv") || n.endsWith(".txt")).map((n) => zip.file(n)!.async("string")))).join("\n");
      for (const proibido of [chave, hash!, CHAVE_DE_TESTE, "v1.zapsign.cifrada.x", s.provedores.webhooks.at(-1)!.authToken, "asaas_chave", "asaas_webhook_token_hash"]) expect(tudo).not.toContain(proibido);
      expect(tudo).toContain("asaas_ambiente");
      expect(nomes.some((n) => n.includes("eventos_cobranca"))).toBe(false);
    });
  });

  describe("emitir a cobrança", () => {
    test("sai com o vencimento da parcela, nunca o de hoje, pelo link do Asaas (Pix, boleto e cartão)", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 100_000, parcelas: 3, primeiroVencimento: somarDias(HOJE, 20) } });
      const p = c.parcelas[0];
      expect(p.vencimentoDaCobranca).toEqual({ sugerido: somarDias(HOJE, 20), precisaEscolher: false, motivo: null });
      const r = await s.com("beatriz", `/financeiro/parcelas/${p.id}/cobranca`, { json: {} });
      expect(r.status).toBe(201);
      const depois = await r.json();
      expect(depois.cobranca).toMatchObject({ provedor: "asaas", vencimento: somarDias(HOJE, 20) });
      expect(depois.cobranca.link).toMatch(/^https:\/\/sandbox\.asaas\.com\/i\/pay_/);
      expect(depois.vencimentoDaCobranca).toBeNull();
      const pedido = s.provedores.chamadasDe("asaas").filter((x) => x.metodo === "POST" && x.caminho === "/v3/payments").at(-1)!;
      expect(pedido.corpo).toMatchObject({ billingType: "UNDEFINED", value: 333.34, dueDate: somarDias(HOJE, 20), externalReference: p.id, description: "Honorários · parcela 1/3" });
      expect(pedido.corpo.dueDate).not.toBe(HOJE);
      expect(await cobrancaId(p.id)).toMatch(/^pay_/);
    });

    test("o cliente é criado no Asaas uma vez só, e a parcela já cobrada não é cobrada de novo", async () => {
      const antes = s.provedores.chamadasDe("asaas").filter((x) => x.metodo === "POST" && x.caminho === "/v3/customers").length;
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 50_000, parcelas: 2, primeiroVencimento: somarDias(HOJE, 15) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[1].id}/cobranca`, { json: {} });
      expect(s.provedores.chamadasDe("asaas").filter((x) => x.metodo === "POST" && x.caminho === "/v3/customers").length).toBe(antes);
      const de_novo = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      expect(de_novo.status).toBe(409);
      expect((await de_novo.json()).erro).toBe("ja_cobrada");
    });

    test("parcela que já venceu não sugere data: a pessoa escolhe, e a data não pode ser do passado", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 30_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, -5) } });
      const p = c.parcelas[0];
      expect(p.vencimentoDaCobranca.sugerido).toBeNull();
      expect(p.vencimentoDaCobranca.precisaEscolher).toBe(true);
      const sem = await s.com("beatriz", `/financeiro/parcelas/${p.id}/cobranca`, { json: {} });
      expect(sem.status).toBe(422);
      expect((await sem.json()).erro).toBe("escolher_vencimento");
      const passado = await s.com("beatriz", `/financeiro/parcelas/${p.id}/cobranca`, { json: { vencimento: somarDias(HOJE, -1) } });
      expect((await passado.json()).erro).toBe("vencimento_no_passado");
      const ok = await s.com("beatriz", `/financeiro/parcelas/${p.id}/cobranca`, { json: { vencimento: somarDias(HOJE, 4) } });
      expect(ok.status).toBe(201);
      expect((await ok.json()).cobranca.vencimento).toBe(somarDias(HOJE, 4));
      // A parcela segue vencida há 5 dias: a cobrança nova não esconde o atraso.
      expect((await s.json(s.com("beatriz", `/financeiro/contratos/${c.id}`))).parcelas[0]).toMatchObject({ situacao: "em_atraso", diasEmAtraso: 5, vencimento: somarDias(HOJE, -5) });
    });

    test("êxito sem valor, parcela paga, cliente sem CPF/CNPJ e quem não tem acesso não emitem", async () => {
      const exito = await contrato({ tipo: "exito", clienteId: s.souza.clienteId, exitoBp: 2000 });
      const semValor = await s.com("beatriz", `/financeiro/parcelas/${exito.parcelas[0].id}/cobranca`, { json: {} });
      expect((await semValor.json()).erro).toBe("sem_valor");
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 6) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE } });
      expect((await (await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} })).json()).erro).toBe("ja_paga");
      const [semDoc] = await s.t.owner<{ id: string }[]>`insert into clientes (organization_id, nome) values (${s.souza.orgId}, 'Cliente sem documento') returning id`;
      const d = await contrato({ tipo: "fixo", clienteId: semDoc!.id, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 6) } });
      expect((await (await s.com("beatriz", `/financeiro/parcelas/${d.parcelas[0].id}/cobranca`, { json: {} })).json()).erro).toBe("cliente_sem_documento");
      const outro = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 6) } });
      expect((await s.com("tiago", `/financeiro/parcelas/${outro.parcelas[0].id}/cobranca`, { json: {} })).status).toBe(403);
      expect((await s.com("mendes", `/financeiro/parcelas/${outro.parcelas[0].id}/cobranca`, { json: {} })).status).toBe(404);
      expect((await s.com("demo", `/financeiro/parcelas/${outro.parcelas[0].id}/cobranca`, { json: {} })).status).toBe(403);
    });

    test("o Asaas recusa: a frase dele chega à pessoa, e a parcela não fica marcada como cobrada", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 6) } });
      s.provedores.falhas.set("POST /v3/payments", { status: 400, corpo: { errors: [{ code: "invalid_customer", description: "Cliente inválido ou não encontrado." }] } });
      const r = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      s.provedores.falhas.delete("POST /v3/payments");
      expect(r.status).toBe(422);
      expect(await r.json()).toMatchObject({ erro: "asaas_recusou", detalhe: "Cliente inválido ou não encontrado." });
      expect(await cobrancaId(c.parcelas[0].id)).toBeNull();
    });

    test("cancelar a cobrança apaga no Asaas e solta a parcela; o que o Asaas já não tem também solta", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 2, primeiroVencimento: somarDias(HOJE, 9) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[1].id}/cobranca`, { json: {} });
      const idA = (await cobrancaId(c.parcelas[0].id))!;
      const idB = (await cobrancaId(c.parcelas[1].id))!;
      const r = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { metodo: "DELETE" });
      expect(r.status).toBe(200);
      expect((await r.json()).cobranca).toBeNull();
      expect(s.provedores.cobrancas.has(idA)).toBe(false);
      // A cobrança sumiu do Asaas por fora: cancelar no Decreta ainda solta a parcela.
      s.provedores.cobrancas.delete(idB);
      expect((await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[1].id}/cobranca`, { metodo: "DELETE" })).status).toBe(200);
      expect(await cobrancaId(c.parcelas[1].id)).toBeNull();
      expect((await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[1].id}/cobranca`, { metodo: "DELETE" })).status).toBe(409);
    });

    test("com cobrança emitida, valor e vencimento da parcela não mudam sem cancelar a cobrança antes", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 9) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const r = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}`, { metodo: "PUT", json: { valor: 25_000 } });
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toBe("tem_cobranca");
    });
  });

  describe("o aviso de pagamento do Asaas (webhook)", () => {
    let parcelaId = "";
    let pay = "";
    beforeAll(async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 33_334, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      parcelaId = c.parcelas[0].id;
      await s.com("beatriz", `/financeiro/parcelas/${parcelaId}/cobranca`, { json: {} });
      pay = (await cobrancaId(parcelaId))!;
    });

    test("sem o segredo do aviso, com segredo errado ou em escritório que não existe: 401, e nada é baixado", async () => {
      const evento = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: pay, value: 333.34 } };
      expect((await s.aviso(s.souza.orgId, evento)).status).toBe(401);
      expect((await s.aviso(s.souza.orgId, evento, { "asaas-access-token": "segredo-errado-segredo-errado-segredo-errado" })).status).toBe(401);
      expect((await s.aviso("org_que_nao_existe", evento, { "asaas-access-token": s.provedores.webhooks.at(-1)!.authToken })).status).toBe(401);
      expect((await s.aviso("../outro", evento, { "asaas-access-token": s.provedores.webhooks.at(-1)!.authToken })).status).toBe(404);
      // O Mendes ainda não ligou o Asaas: nem o segredo do Souza abre a porta dele.
      expect((await s.aviso(s.mendes.orgId, evento, { "asaas-access-token": s.provedores.webhooks.at(-1)!.authToken })).status).toBe(401);
      expect(await pagamentos(parcelaId)).toEqual([]);
      expect((await s.t.owner`select 1 from eventos_cobranca where organization_id = ${s.souza.orgId} and externo_id = 'evt_1'`).length).toBe(0);
    });

    test("aviso sem id ou sem evento, ou que nem é JSON, é recusado", async () => {
      const token = s.provedores.webhooks.at(-1)!.authToken;
      expect((await s.aviso(s.souza.orgId, { event: "PAYMENT_RECEIVED" }, { "asaas-access-token": token })).status).toBe(400);
      expect((await s.aviso(s.souza.orgId, { id: "evt_x" }, { "asaas-access-token": token })).status).toBe(400);
      expect((await s.aviso(s.souza.orgId, [1, 2], { "asaas-access-token": token })).status).toBe(400);
      const torto = await s.app.request(`/api/cobranca/asaas/${s.souza.orgId}`, { method: "POST", headers: { "content-type": "application/json", "asaas-access-token": token }, body: "{isto não é json" });
      expect(torto.status).toBe(400);
    });

    test("o pagamento avisado dá a baixa: valor em centavos, forma pelo tipo da cobrança, e a origem registrada", async () => {
      const r = await aviso("PAYMENT_RECEIVED", pay, { value: 333.34, billingType: "PIX", paymentDate: HOJE }, "evt_baixa_1");
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ recebido: true, duplicado: false });
      const feitos = await pagamentos(parcelaId);
      expect(feitos).toEqual([{ valor: 33_334, origem: "asaas", forma: "pix", registrado_por: null, estornado_em: null }]);
      const parcela = (await s.json(s.com("beatriz", "/financeiro"))).parcelas.find((p: { id: string }) => p.id === parcelaId);
      expect(parcela).toMatchObject({ situacao: "paga", pago: 33_334, falta: 0 });
      const [reg] = await s.t.owner<{ user_id: string | null; nome: string }[]>`select user_id, nome from auditoria where organization_id = ${s.souza.orgId} and acao = 'cobranca.baixa_automatica' order by created_at desc limit 1`;
      expect(reg).toEqual({ user_id: null, nome: "Asaas" });
    });

    test("o mesmo aviso, repetido (o Asaas manda mais de uma vez), é tratado uma vez só", async () => {
      const r = await aviso("PAYMENT_RECEIVED", pay, { value: 333.34, paymentDate: HOJE }, "evt_baixa_1");
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ recebido: true, duplicado: true });
      expect(await pagamentos(parcelaId)).toHaveLength(1);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from eventos_cobranca where organization_id = ${s.souza.orgId} and externo_id = 'evt_baixa_1'`)[0]!.n).toBe(1);
    });

    test("confirmado e depois recebido do mesmo pagamento (eventos diferentes) baixam uma vez só", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 50_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      expect((await (await aviso("PAYMENT_CONFIRMED", id, { value: 500, billingType: "BOLETO" })).json()).duplicado).toBe(false);
      const segundo = await (await aviso("PAYMENT_RECEIVED", id, { value: 500, billingType: "BOLETO" })).json();
      expect(segundo).toEqual({ recebido: true, duplicado: false });
      const feitos = await pagamentos(c.parcelas[0].id);
      expect(feitos).toHaveLength(1);
      expect(feitos[0]).toMatchObject({ valor: 50_000, forma: "boleto" });
      expect((await s.t.owner<{ resultado: string }[]>`select resultado from eventos_cobranca where recurso = ${id} order by recebido_em`).map((e) => e.resultado)).toEqual(["baixa_feita", "ja_baixado"]);
    });

    test("cinco avisos iguais ao mesmo tempo baixam uma vez só", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 12_345, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      const respostas = await Promise.all(Array.from({ length: 5 }, () => aviso("PAYMENT_RECEIVED", id, { value: 123.45 }, "evt_em_rajada")));
      expect(respostas.every((r) => r.status === 200)).toBe(true);
      const corpos = await Promise.all(respostas.map((r) => r.json()));
      expect(corpos.filter((x) => !x.duplicado)).toHaveLength(1);
      expect(await pagamentos(c.parcelas[0].id)).toHaveLength(1);
    });

    test("19,99 do Asaas são 1999 centavos exatos, e a parcela de R$ 19,99 fica paga", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 1_999, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      await aviso("PAYMENT_RECEIVED", id, { value: 19.99 });
      expect((await pagamentos(c.parcelas[0].id)).map((g) => g.valor)).toEqual([1_999]);
      expect((await s.json(s.com("beatriz", `/financeiro/contratos/${c.id}`))).parcelas[0].situacao).toBe("paga");
    });

    test("valor que o Asaas manda inválido (zero, texto, negativo) não gera pagamento", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 5_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      for (const [i, value] of [0, "50,00", -50, null].entries()) await aviso("PAYMENT_RECEIVED", id, { value }, `evt_valor_${i}_${id}`);
      expect(await pagamentos(c.parcelas[0].id)).toEqual([]);
    });

    test("aviso de cobrança que o Decreta não conhece é recebido e deixado de lado", async () => {
      const r = await aviso("PAYMENT_RECEIVED", "pay_de_outra_origem", { value: 10 }, "evt_desconhecido");
      expect(r.status).toBe(200);
      expect((await s.t.owner<{ resultado: string }[]>`select resultado from eventos_cobranca where externo_id = 'evt_desconhecido'`)[0]!.resultado).toBe("parcela_nao_encontrada");
    });

    test("o aviso de um escritório não baixa a cobrança de outro", async () => {
      // O Mendes liga o Asaas dele e recebe um aviso com o código da cobrança do Souza.
      expect((await s.com("mendes", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_TESTE, ambiente: "sandbox" } })).status).toBe(200);
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 7_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      const tokenDoMendes = s.provedores.webhooks.filter((w) => w.url.endsWith(`/${s.mendes.orgId}`)).at(-1)!.authToken;
      const r = await s.aviso(s.mendes.orgId, { id: "evt_cruzado", event: "PAYMENT_RECEIVED", payment: { id, value: 70 } }, { "asaas-access-token": tokenDoMendes });
      expect(r.status).toBe(200);
      expect(await pagamentos(c.parcelas[0].id)).toEqual([]);
      expect((await s.t.owner<{ resultado: string }[]>`select resultado from eventos_cobranca where organization_id = ${s.mendes.orgId} and externo_id = 'evt_cruzado'`)[0]!.resultado).toBe("parcela_nao_encontrada");
      // E o segredo do Mendes não abre o endereço do Souza.
      expect((await s.aviso(s.souza.orgId, { id: "evt_cruzado_2", event: "PAYMENT_RECEIVED", payment: { id, value: 70 } }, { "asaas-access-token": tokenDoMendes })).status).toBe(401);
    });

    test("estorno avisado desfaz a baixa que o próprio Asaas deu, e a parcela volta a dever", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 8_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      await aviso("PAYMENT_RECEIVED", id, { value: 80 });
      await aviso("PAYMENT_REFUNDED", id, { value: 80 });
      const feitos = await pagamentos(c.parcelas[0].id);
      expect(feitos).toHaveLength(1);
      expect(feitos[0]!.estornado_em).not.toBeNull();
      expect((await s.json(s.com("beatriz", `/financeiro/contratos/${c.id}`))).parcelas[0]).toMatchObject({ pago: 0, falta: 8_000 });
    });

    test("cobrança apagada no Asaas solta a parcela, a não ser que já tenha pagamento", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 9_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      await aviso("PAYMENT_DELETED", id, { deleted: true });
      expect(await cobrancaId(c.parcelas[0].id)).toBeNull();
    });

    test("escritório encerrado recebe o aviso e não faz nada", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 6_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 12) } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const id = (await cobrancaId(c.parcelas[0].id))!;
      await s.t.owner`update organization set encerrado_em = now() where id = ${s.souza.orgId}`;
      const r = await aviso("PAYMENT_RECEIVED", id, { value: 60 });
      await s.t.owner`update organization set encerrado_em = null where id = ${s.souza.orgId}`;
      expect(r.status).toBe(200);
      expect(await pagamentos(c.parcelas[0].id)).toEqual([]);
    });
  });

  describe("a régua de lembretes pelo WhatsApp", () => {
    const REGUA = {
      ligada: true,
      passos: [
        { dias: -3, texto: "Olá, {cliente}. Os honorários ({descricao}), de {valor}, vencem em {vencimento}.\n{link}" },
        { dias: 0, texto: "Olá, {cliente}. Hoje vence o pagamento dos honorários ({descricao}), de {valor}.\n{link}" },
        { dias: 3, texto: "Olá, {cliente}. Não identificamos o pagamento dos honorários ({descricao}), de {valor}. Se já pagou, desconsidere." },
      ],
    };

    test("só sócio salva a régua, e o texto só usa campos que existem; salvar é o aval do escritório", async () => {
      expect((await s.com("camila", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: REGUA } })).status).toBe(403);
      const estranho = await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: { ligada: true, passos: [{ dias: 0, texto: "Olá, {cliente}. Pague {valor_total} hoje, por favor." }] } } });
      expect(estranho.status).toBe(422);
      expect((await estranho.json()).erro).toBe("campo_desconhecido");
      expect((await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: { ligada: true, passos: [] } } })).status).toBe(422);
      expect((await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: { ligada: true, passos: [{ dias: 0, texto: "Curto." }] } } })).status).toBe(400);
      expect((await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: { ligada: true, passos: [REGUA.passos[0], { ...REGUA.passos[0]! }] } } })).status).toBe(400);
    });

    test("régua ligada mas nunca aprovada não gera nada", async () => {
      expect((await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE)).rascunhos).toBe(0);
    });

    test("aprovada, deixa um rascunho por parcela e passo que chegou, sem enviar nada", async () => {
      const r = await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { regua: REGUA } });
      expect(r.status).toBe(200);
      const estado = (await r.json()).estado;
      expect(estado.regua.ligada).toBe(true);
      expect(estado.regua.aprovadaPor).toBe(s.souza.userIds.beatriz);
      expect(estado.regua.aprovadaEm).toBeTruthy();

      // Vence em 3 dias: o passo "3 dias antes" cai hoje.
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, titulo: "Régua", fixo: { valor: 33_334, parcelas: 1, primeiroVencimento: somarDias(HOJE, 3) } });
      const enviadosAntes = s.zap.enviados.length;
      const primeira = await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE);
      expect(primeira.rascunhos).toBeGreaterThanOrEqual(1);
      const msgs = await s.t.owner<{ id: string; tipo: string; situacao: string; texto: string; aprovada_por: string | null }[]>`
        select m.id, m.tipo, m.situacao, m.texto, m.aprovada_por from mensagens_cliente m join lembretes_de_cobranca l on l.mensagem_id = m.id where l.parcela_id = ${c.parcelas[0].id}`;
      expect(msgs).toHaveLength(1);
      expect(msgs[0]).toMatchObject({ tipo: "cobranca", situacao: "rascunho", aprovada_por: null });
      expect(msgs[0]!.texto).toBe(`Olá, Marina Duarte. Os honorários (Honorários), de R$ 333,34, vencem em ${somarDias(HOJE, 3).split("-").reverse().join("/")}.`);
      expect(msgs[0]!.texto).not.toContain("{");
      expect(s.zap.enviados.length).toBe(enviadosAntes);
      // Rodar de novo no mesmo dia não repete o lembrete.
      expect((await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE)).rascunhos).toBe(0);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from lembretes_de_cobranca where parcela_id = ${c.parcelas[0].id}`)[0]!.n).toBe(1);
    });

    test("com a cobrança emitida, o link de pagamento entra no texto; parcela paga, cancelada ou de contrato cancelado fica de fora", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } });
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/cobranca`, { json: {} });
      const paga = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } });
      await s.com("beatriz", `/financeiro/parcelas/${paga.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE } });
      const cancelada = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } });
      await s.com("beatriz", `/financeiro/parcelas/${cancelada.parcelas[0].id}/cancelar`, { json: {} });
      const decontratoCancelado = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } });
      await s.com("beatriz", `/financeiro/contratos/${decontratoCancelado.id}/cancelar`, { json: {} });
      await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE);
      const de = async (parcelaId: string) => s.t.owner<{ texto: string }[]>`select m.texto from mensagens_cliente m join lembretes_de_cobranca l on l.mensagem_id = m.id where l.parcela_id = ${parcelaId} order by l.passo`;
      const textos = await de(c.parcelas[0].id);
      expect(textos).toHaveLength(1);
      expect(textos[0]!.texto).toMatch(/Hoje vence o pagamento dos honorários \(Honorários\), de R\$ 200,00\.\nhttps:\/\/sandbox\.asaas\.com\/i\/pay_/);
      for (const p of [paga, cancelada, decontratoCancelado]) expect(await de(p.parcelas[0].id)).toEqual([]);
    });

    test("lembrete velho demais (passo de mais de 3 dias atrás) e cliente sem celular válido não geram rascunho", async () => {
      const velho = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, -10) } });
      await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE);
      expect((await s.t.owner`select 1 from lembretes_de_cobranca where parcela_id = ${velho.parcelas[0].id}`).length).toBe(0);
      const [semTelefone] = await s.t.owner<{ id: string }[]>`insert into clientes (organization_id, nome, documento, telefone) values (${s.souza.orgId}, 'Sem celular', '11144477735', '12345') returning id`;
      const c = await contrato({ tipo: "fixo", clienteId: semTelefone!.id, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } });
      await gerarLembretesDoDia(s.t.db, s.souza.orgId, HOJE);
      expect((await s.t.owner`select 1 from lembretes_de_cobranca where parcela_id = ${c.parcelas[0].id}`).length).toBe(0);
    });

    test("o rascunho passa pelo fluxo de aprovação: só advogado com OAB e acesso ao Financeiro aprova, e então sai no WhatsApp com o rodapé", async () => {
      const [m] = await s.t.owner<{ id: string; cliente_id: string }[]>`select m.id, m.cliente_id from mensagens_cliente m where m.tipo = 'cobranca' and m.situacao = 'rascunho' and m.organization_id = ${s.souza.orgId} order by m.created_at limit 1`;
      expect(m).toBeTruthy();
      // Quem não vê o Financeiro não enxerga a mensagem de cobrança na lista do cliente, nem mexe nela.
      expect((await s.json(s.com("tiago", `/mensagens-cliente?cliente=${m!.cliente_id}`))).itens.filter((x: { tipo: string }) => x.tipo === "cobranca")).toEqual([]);
      expect((await s.json(s.com("beatriz", `/mensagens-cliente?cliente=${m!.cliente_id}`))).itens.filter((x: { tipo: string }) => x.tipo === "cobranca").length).toBeGreaterThan(0);
      expect((await s.com("tiago", `/mensagens-cliente/${m!.id}`, { metodo: "PUT", json: { texto: "Olá, vou editar sem poder." } })).status).toBe(403);
      expect((await s.com("tiago", `/mensagens-cliente/${m!.id}/enviar`, { json: {} })).status).toBe(403);
      expect((await s.com("tiago", `/mensagens-cliente/${m!.id}/descartar`, { json: {} })).status).toBe(403);
      // Sem o número oficial do escritório no rodapé, nem a sócia envia.
      const semNumero = await s.com("beatriz", `/mensagens-cliente/${m!.id}/enviar`, { json: {} });
      expect((await semNumero.json()).erro).toBe("sem_numero_oficial");
      expect((await s.com("beatriz", "/escritorio", { metodo: "PUT", json: { whatsappOficial: "(47) 3433-0000" } })).status).toBe(200);
      const antes = s.zap.enviados.length;
      const r = await s.com("beatriz", `/mensagens-cliente/${m!.id}/enviar`, { json: { texto: "Olá, Marina. Passando para lembrar do pagamento dos honorários. Qualquer dúvida, é só falar." } });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ tipo: "cobranca", situacao: "enviada", aprovadaPor: { id: s.souza.userIds.beatriz } });
      expect(s.zap.enviados.length).toBe(antes + 1);
      const enviado = s.zap.enviados.at(-1)!;
      expect(enviado.number).toBe("5547991234567");
      expect(enviado.text).toContain("Passando para lembrar do pagamento dos honorários");
      expect(enviado.text).toContain("(47) 3433-0000");
    });

    test("o lembrete pedido à mão vira rascunho para aprovar; quem não tem o Financeiro não pede", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 15_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 8) } });
      expect((await s.com("tiago", `/financeiro/parcelas/${c.parcelas[0].id}/lembrete`, { json: {} })).status).toBe(403);
      const r = await s.com("camila", `/financeiro/parcelas/${c.parcelas[0].id}/lembrete`, { json: {} });
      expect(r.status).toBe(201);
      const m = await r.json();
      expect(m).toMatchObject({ tipo: "cobranca", situacao: "rascunho", cliente: { nome: "Marina Duarte" } });
      expect(m.texto).toContain("R$ 150,00");
      const lista = await s.json(s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/lembretes`));
      expect(lista.itens).toHaveLength(1);
      expect((await s.json(s.com("beatriz", "/financeiro"))).lembretesParaAprovar).toBeGreaterThan(0);
      // Parcela paga ou sem valor não tem o que lembrar.
      const exito = await contrato({ tipo: "exito", clienteId: s.souza.clienteId, exitoBp: 1000 });
      expect((await s.com("beatriz", `/financeiro/parcelas/${exito.parcelas[0].id}/lembrete`, { json: {} })).status).toBe(409);
    });
  });

  describe("Pix Automático da mensalidade", () => {
    let contratoId = "";
    test("desligado por padrão: o pedido de autorização é recusado", async () => {
      const c = await contrato({ tipo: "mensal", clienteId: s.souza.clienteId, mensal: { valor: 150_000, meses: 3, primeiroVencimento: somarDias(HOJE, 10) } });
      contratoId = c.id;
      const r = await s.com("beatriz", `/financeiro/contratos/${contratoId}/pix-automatico`, { json: {} });
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toBe("pix_automatico_desligado");
    });

    test("ligado, o aviso do Asaas é refeito com os eventos da autorização, e a autorização devolve o QR Code", async () => {
      const avisosAntes = s.provedores.webhooks.length;
      const ligar = await s.com("beatriz", "/financeiro/cobranca/opcoes", { metodo: "PUT", json: { pixAutomatico: true } });
      expect(ligar.status).toBe(200);
      expect(s.provedores.webhooks.length).toBe(avisosAntes + 1);
      expect(s.provedores.webhooks.at(-1)!.events.some((e) => e.startsWith("PIX_AUTOMATIC"))).toBe(true);
      const r = await s.com("beatriz", `/financeiro/contratos/${contratoId}/pix-automatico`, { json: {} });
      expect(r.status).toBe(201);
      expect(await r.json()).toMatchObject({ situacao: "CREATED", payload: "00020126pixautomatico", imagem: "iVBORw0KGgo=" });
      const pedido = s.provedores.chamadasDe("asaas").find((x) => x.caminho === "/v3/pix/automatic/authorizations")!;
      expect(pedido.corpo).toMatchObject({ frequency: "MONTHLY", value: 1500, paymentCreationMode: "MANUAL", startDate: somarDias(HOJE, 10), contractId: contratoId.replaceAll("-", "") });
      const c = await s.json(s.com("beatriz", `/financeiro/contratos/${contratoId}`));
      expect(c.pixAutomatico).toMatchObject({ situacao: "CREATED", qr: { payload: "00020126pixautomatico" } });
      expect((await s.com("beatriz", `/financeiro/contratos/${contratoId}/pix-automatico`, { json: {} })).status).toBe(409);
    });

    test("o aviso de ativação muda a situação; a cobrança do mês seguinte sai por Pix, ligada à autorização", async () => {
      const [{ pix_automatico_id: autorizacao }] = await s.t.owner<{ pix_automatico_id: string }[]>`select pix_automatico_id from contratos_honorarios where id = ${contratoId}`;
      const ativado = await s.aviso(s.souza.orgId, { id: "evt_pix_1", event: "PIX_AUTOMATIC_RECURRING_AUTHORIZATION_ACTIVATED", authorization: { id: autorizacao, status: "ACTIVE" } }, { "asaas-access-token": s.provedores.webhooks.at(-1)!.authToken });
      expect(ativado.status).toBe(200);
      const c = await s.json(s.com("beatriz", `/financeiro/contratos/${contratoId}`));
      expect(c.pixAutomatico).toMatchObject({ situacao: "ACTIVE", qr: null });
      const r = await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[1].id}/cobranca`, { json: {} });
      expect(r.status).toBe(201);
      const pedido = s.provedores.chamadasDe("asaas").filter((x) => x.caminho === "/v3/payments").at(-1)!;
      expect(pedido.corpo).toMatchObject({ billingType: "PIX", pixAutomaticAuthorizationId: autorizacao });
    });

    test("contrato sem mensalidade não usa Pix Automático", async () => {
      const c = await contrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 5) } });
      expect((await (await s.com("beatriz", `/financeiro/contratos/${c.id}/pix-automatico`, { json: {} })).json()).erro).toBe("sem_mensalidade");
    });
  });

  describe("tirar a chave", () => {
    test("a chave sai do banco, o aviso sai do Asaas, e a cobrança volta a ser só manual", async () => {
      const webhooksAntes = s.provedores.chamadasDe("asaas").filter((x) => x.metodo === "DELETE" && x.caminho.startsWith("/v3/webhooks/")).length;
      const r = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "DELETE" });
      expect(r.status).toBe(200);
      expect((await r.json()).estado.asaas.configurado).toBe(false);
      expect(s.provedores.chamadasDe("asaas").filter((x) => x.metodo === "DELETE" && x.caminho.startsWith("/v3/webhooks/")).length).toBe(webhooksAntes + 1);
      expect((await s.t.owner`select 1 from cobranca_config where organization_id = ${s.souza.orgId} and (asaas_chave is not null or asaas_webhook_token_hash is not null)`).length).toBe(0);
      // O aviso antigo não vale mais.
      const antigo = s.provedores.webhooks.filter((w) => w.url.endsWith(`/${s.souza.orgId}`)).at(-1)!.authToken;
      expect((await s.aviso(s.souza.orgId, { id: "evt_depois", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", value: 1 } }, { "asaas-access-token": antigo })).status).toBe(401);
    });
  });
});

describe.skipIf(!hasTestDatabase)("sem o cofre das chaves", () => {
  test("o servidor sem cofre não guarda chave nenhuma, e o resto do Financeiro funciona", async () => {
    const s = await montarCenario({ cofre: false });
    try {
      const r = await s.com("beatriz", "/financeiro/cobranca/asaas", { metodo: "PUT", json: { chave: CHAVE_DE_TESTE, ambiente: "sandbox" } });
      expect(r.status).toBe(503);
      expect((await r.json()).erro).toBe("cofre_desligado");
      expect((await s.json(s.com("beatriz", "/financeiro/cobranca"))).cofreLigado).toBe(false);
      expect((await s.com("beatriz", "/financeiro")).status).toBe(200);
    } finally {
      await s.encerrar();
    }
  }, 120_000);
});
