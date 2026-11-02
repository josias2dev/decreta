/**
 * Do alvará ao honorário: a conta do alvará sacado, a confirmação por clique, a prestação de contas em DOCX
 * e o repasse ao cliente. É o dinheiro do cliente: os números dos testes foram feitos à mão, com
 * arredondamento de centavo, valor recebido diferente do alvará e alvará sem contrato.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { somarDias } from "@decreta/core";
import { hasTestDatabase } from "@decreta/db/testing";
import JSZip from "jszip";
import { HOJE, montarCenario, type Cenario } from "./apoio-financeiro.ts";

// Banco de verdade e muitos pedidos por teste: com o computador ocupado, 5 s é pouco.
setDefaultTimeout(60_000);

describe.skipIf(!hasTestDatabase)("do alvará ao honorário e à prestação de contas", () => {
  let s: Cenario;
  beforeAll(async () => {
    s = await montarCenario();
  }, 120_000);
  afterAll(async () => {
    await s?.encerrar();
  }, 60_000);

  /** Um processo novo do cliente, para cada teste ter o seu e os contratos não se misturarem. */
  const processoNovo = async (titulo: string) => (await s.t.owner<{ id: string }[]>`insert into processos (organization_id, titulo, cnj, cliente_id) values (${s.souza.orgId}, ${titulo}, ${`50${Math.floor(Math.random() * 1e5)}-00.2026.8.24.0038`}, ${s.souza.clienteId}) returning id`)[0]!.id;
  const contratoDeExito = async (processoId: string, exitoBp: number, extra: Record<string, unknown> = {}) => (await s.json(s.com("beatriz", "/financeiro/contratos", { json: { tipo: "exito", processoId, exitoBp, ...extra } }))) as any;
  /** Um alvará já sacado, com o valor do alvará e o que caiu na conta (em reais, como a tela do alvará grava). */
  const alvaraSacado = async (processoId: string, valor: string, recebido: string | null = valor, descricao = "Depósito judicial do réu") => {
    const criado = await s.json(s.com("beatriz", "/alvaras", { json: { processoId, descricao, valor, expedidoEm: somarDias(HOJE, -6) } }));
    await s.com("beatriz", `/alvaras/${criado.id}`, { metodo: "PUT", json: { etapa: "sacado", sacadoEm: somarDias(HOJE, -2), ...(recebido ? { valorRecebido: recebido } : {}) } });
    return criado.id as string;
  };
  const conta = async (alvaraId: string, quem: "beatriz" | "camila" | "tiago" | "mendes" = "beatriz", contrato?: string) => s.json(s.com(quem, `/financeiro/alvaras/${alvaraId}/conta${contrato ? `?contrato=${contrato}` : ""}`));
  const confirmar = (alvaraId: string, corpo: Record<string, unknown>, quem: "beatriz" | "tiago" | "mendes" = "beatriz") => s.com(quem, `/financeiro/alvaras/${alvaraId}/prestacao`, { json: corpo });
  const recebidoTotal = async () => (await s.json(s.com("beatriz", "/financeiro"))).resumo.recebido as number;

  describe("a conta", () => {
    test("alvará sem contrato: nenhum honorário, o valor todo é do cliente, e a conta diz que falta o contrato", async () => {
      const p = await processoNovo("Sem contrato × Alguém");
      const a = await alvaraSacado(p, "4500.00");
      const c = await conta(a);
      expect(c.contrato).toBeNull();
      expect(c.contratos).toEqual([]);
      expect(c.conta).toMatchObject({ base: 450_000, honorario: 0, cliente: 450_000, semContrato: true, baseEhRecebido: true, diferenca: 0 });
      expect(c.podeConfirmar).toBe(true);
    });

    test("com contrato de êxito de 30% e o valor recebido igual ao do alvará: R$ 10.000,00 → R$ 3.000,00 e R$ 7.000,00", async () => {
      const p = await processoNovo("Marina × Alfa (30%)");
      const k = await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "10000.00");
      const c = await conta(a);
      expect(c.contrato).toMatchObject({ id: k.id, exitoBp: 3000, nivel: "processo" });
      expect(c.conta).toMatchObject({ base: 1_000_000, honorario: 300_000, cliente: 700_000, semContrato: false, diferenca: 0 });
      expect(c.alvara).toMatchObject({ valor: 1_000_000, valorRecebido: 1_000_000, etapa: "sacado" });
    });

    test("o valor recebido manda: caiu menos que o alvará, a conta usa o que caiu e mostra a diferença", async () => {
      const p = await processoNovo("Recebido diferente (20%)");
      await contratoDeExito(p, 2000);
      const a = await alvaraSacado(p, "10000.00", "9850.50");
      const c = await conta(a);
      expect(c.conta).toMatchObject({ base: 985_050, baseEhRecebido: true, diferenca: -14_950, honorario: 197_010, cliente: 788_040 });
      expect(c.conta.honorario + c.conta.cliente).toBe(985_050);
    });

    test("arredondamento de centavo: R$ 10.000,01 a 30% fica em R$ 3.000,00 (e o cliente leva o centavo que sobra)", async () => {
      const p = await processoNovo("Arredondamento 1");
      await contratoDeExito(p, 3000);
      expect((await conta(await alvaraSacado(p, "10000.01"))).conta).toMatchObject({ honorario: 300_000, cliente: 700_001 });
    });

    test("arredondamento de centavo: R$ 0,05 a 50% são R$ 0,03 e R$ 0,02; R$ 333,33 a 33,33% são R$ 111,10 e R$ 222,23", async () => {
      const p1 = await processoNovo("Arredondamento 2");
      await contratoDeExito(p1, 5000);
      expect((await conta(await alvaraSacado(p1, "0.05"))).conta).toMatchObject({ honorario: 3, cliente: 2 });
      const p2 = await processoNovo("Arredondamento 3");
      await contratoDeExito(p2, 3333);
      expect((await conta(await alvaraSacado(p2, "333.33"))).conta).toMatchObject({ honorario: 11_110, cliente: 22_223 });
    });

    test("sem o valor que caiu na conta, a conta é só estimativa e não se confirma", async () => {
      const p = await processoNovo("Sem valor recebido");
      await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "5000.00", null);
      const c = await conta(a);
      expect(c.conta).toMatchObject({ baseEhRecebido: false, falta: "valor_recebido", honorario: 150_000, cliente: 350_000 });
      expect(c.podeConfirmar).toBe(false);
      expect(c.motivo).toContain("valor que caiu na conta");
      const r = await confirmar(a, { honorario: 150_000, cliente: 350_000 });
      expect(r.status).toBe(422);
    });

    test("alvará que ainda não foi sacado não se confirma", async () => {
      const p = await processoNovo("Ainda não sacado");
      await contratoDeExito(p, 3000);
      const criado = await s.json(s.com("beatriz", "/alvaras", { json: { processoId: p, descricao: "Expedido", valor: "1000.00" } }));
      const c = await conta(criado.id);
      expect(c.podeConfirmar).toBe(false);
      expect(c.motivo).toBe("O alvará ainda não foi sacado.");
      expect((await confirmar(criado.id, { honorario: 30_000, cliente: 70_000 })).status).toBe(422);
    });

    test("o contrato do cliente (sem processo) vale para os alvarás dos processos dele; o do processo ganha dele", async () => {
      const [outroCliente] = await s.t.owner<{ id: string }[]>`insert into clientes (organization_id, nome, documento, telefone) values (${s.souza.orgId}, 'Roberto Kühn', '11144477735', '47988127744') returning id`;
      const [proc] = await s.t.owner<{ id: string }[]>`insert into processos (organization_id, titulo, cnj, cliente_id) values (${s.souza.orgId}, 'Roberto × Banco', '5003333-00.2026.8.24.0038', ${outroCliente!.id}) returning id`;
      await s.json(s.com("beatriz", "/financeiro/contratos", { json: { tipo: "exito", clienteId: outroCliente!.id, exitoBp: 1500 } }));
      const a = await alvaraSacado(proc!.id, "2000.00");
      expect((await conta(a)).contrato).toMatchObject({ exitoBp: 1500, nivel: "cliente" });
      const k = await contratoDeExito(proc!.id, 2500);
      expect((await conta(a)).contrato).toMatchObject({ id: k.id, exitoBp: 2500, nivel: "processo" });
    });

    test("mais de um contrato com êxito no mesmo nível: o Decreta não adivinha, a pessoa escolhe", async () => {
      const p = await processoNovo("Dois contratos");
      const a1 = await contratoDeExito(p, 2000, { titulo: "Êxito antigo" });
      const a2 = await contratoDeExito(p, 3000, { titulo: "Êxito novo" });
      const a = await alvaraSacado(p, "1000.00");
      const c = await conta(a);
      expect(c.contrato).toBeNull();
      expect(c.precisaEscolherContrato).toBe(true);
      expect(c.contratos.map((x: { titulo: string }) => x.titulo)).toEqual(["Êxito antigo", "Êxito novo"]);
      expect(c.podeConfirmar).toBe(false);
      expect((await confirmar(a, { honorario: 0, cliente: 100_000 })).status).toBe(422);
      expect((await conta(a, "beatriz", a2.id)).conta).toMatchObject({ honorario: 30_000, cliente: 70_000 });
      expect((await conta(a, "beatriz", a1.id)).conta).toMatchObject({ honorario: 20_000, cliente: 80_000 });
      // Um contrato de outro caso não vale.
      const [doOutro] = await s.t.owner<{ id: string }[]>`select id from contratos_honorarios where organization_id = ${s.souza.orgId} and processo_id is not null and processo_id <> ${p} limit 1`;
      expect((await s.com("beatriz", `/financeiro/alvaras/${a}/conta?contrato=${doOutro!.id}`)).status).toBe(422);
    });

    test("o Financeiro lista os alvarás sacados que esperam a prestação de contas, com a conta de cada um", async () => {
      const p = await processoNovo("Na fila da prestação");
      await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "2000.00", "2000.00", "Alvará da fila");
      const fila = (await s.json(s.com("beatriz", "/financeiro"))).alvarasParaPrestar as { id: string; descricao: string; conta: { honorario: number } }[];
      expect(fila.find((x) => x.id === a)).toMatchObject({ descricao: "Alvará da fila", conta: { honorario: 60_000, cliente: 140_000 } });
    });

    test("quem não tem o Financeiro não vê a conta, e outro escritório não enxerga o alvará", async () => {
      const p = await processoNovo("Permissões");
      const a = await alvaraSacado(p, "100.00");
      expect((await s.com("tiago", `/financeiro/alvaras/${a}/conta`)).status).toBe(403);
      expect((await s.com("bianca", `/financeiro/alvaras/${a}/conta`)).status).toBe(403);
      expect((await confirmar(a, { honorario: 0, cliente: 10_000 }, "tiago")).status).toBe(403);
      expect((await s.com("mendes", `/financeiro/alvaras/${a}/conta`)).status).toBe(404);
      expect((await confirmar(a, { honorario: 0, cliente: 10_000 }, "mendes")).status).toBe(404);
      expect((await s.com("camila", `/financeiro/alvaras/${a}/conta`)).status).toBe(200);
    });
  });

  describe("a confirmação", () => {
    test("o clique grava a prestação, põe o honorário na parcela de êxito do contrato e NÃO marca nada como recebido", async () => {
      const p = await processoNovo("Confirmação");
      const k = await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "10000.00");
      const antes = await recebidoTotal();
      const r = await confirmar(a, { honorario: 300_000, cliente: 700_000 });
      expect(r.status).toBe(201);
      const c = await r.json();
      expect(c.prestacao).toMatchObject({ valorAlvara: 1_000_000, valorRecebido: 1_000_000, exitoBp: 3000, honorario: 300_000, cliente: 700_000, semContrato: false, retidoNoSaque: false, contratoId: k.id });
      expect(c.prestacao.confirmadaPor).toBe(s.souza.userIds.beatriz);
      expect(c.podeConfirmar).toBe(false);
      // A parcela de êxito, que nasceu sem valor, ganha o valor e vence no dia do saque.
      const contrato = await s.json(s.com("beatriz", `/financeiro/contratos/${k.id}`));
      expect(contrato.parcelas).toHaveLength(1);
      expect(contrato.parcelas[0]).toMatchObject({ tipo: "exito", valor: 300_000, vencimento: somarDias(HOJE, -2), alvaraId: a, pago: 0, falta: 300_000, situacao: "em_atraso" });
      expect(contrato.parcelas[0].descricao).toContain("Honorário de êxito");
      expect(contrato.parcelas[0].descricao).toContain("30%");
      // Recebido só existe com pagamento marcado: nenhum nasceu.
      expect(await recebidoTotal()).toBe(antes);
      expect(contrato.parcelas[0].pagamentos).toEqual([]);
      const [reg] = await s.t.owner<{ user_id: string; detalhes: { honorario: number; cliente: number } }[]>`select user_id, detalhes from auditoria where organization_id = ${s.souza.orgId} and acao = 'prestacao.confirmada' order by created_at desc limit 1`;
      expect(reg).toMatchObject({ user_id: s.souza.userIds.beatriz, detalhes: { honorario: 300_000, cliente: 700_000 } });
    });

    test("se a conta mudou desde que a pessoa a viu, a confirmação é recusada e nada é gravado", async () => {
      const p = await processoNovo("Conta mudou");
      await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "10000.00");
      const velha = await conta(a);
      // Alguém corrige o valor recebido enquanto a tela estava aberta.
      await s.com("beatriz", `/alvaras/${a}`, { metodo: "PUT", json: { valorRecebido: "9000.00" } });
      const r = await confirmar(a, { honorario: velha.conta.honorario, cliente: velha.conta.cliente });
      expect(r.status).toBe(409);
      const corpo = await r.json();
      expect(corpo.erro).toBe("conta_mudou");
      expect(corpo.detalhe).toContain("R$ 2.700,00");
      expect((await s.t.owner`select 1 from prestacoes_de_contas where alvara_id = ${a}`).length).toBe(0);
      // E um valor inventado, que não é o da conta, também não passa.
      expect((await confirmar(a, { honorario: 1, cliente: 899_999 })).status).toBe(409);
      expect((await confirmar(a, { honorario: 270_000, cliente: 630_000 })).status).toBe(201);
    });

    test("não confirma duas vezes, e dois cliques ao mesmo tempo gravam uma prestação só", async () => {
      const p = await processoNovo("Clique duplo");
      await contratoDeExito(p, 2500);
      const a = await alvaraSacado(p, "4000.00");
      const corpo = { honorario: 100_000, cliente: 300_000 };
      const [r1, r2] = await Promise.all([confirmar(a, corpo), confirmar(a, corpo)]);
      expect([r1.status, r2.status].sort()).toEqual([201, 409]);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from prestacoes_de_contas where alvara_id = ${a} and cancelada_em is null`)[0]!.n).toBe(1);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from parcelas_honorarios where alvara_id = ${a}`)[0]!.n).toBe(1);
      const de_novo = await confirmar(a, corpo);
      expect(de_novo.status).toBe(409);
      expect((await de_novo.json()).erro).toBe("ja_confirmada");
    });

    test("alvará sem contrato: confirma sem honorário nenhum, e nenhuma parcela nasce", async () => {
      const p = await processoNovo("Confirma sem contrato");
      const a = await alvaraSacado(p, "4500.00");
      const r = await confirmar(a, { honorario: 0, cliente: 450_000 });
      expect(r.status).toBe(201);
      expect((await r.json()).prestacao).toMatchObject({ semContrato: true, contratoId: null, parcelaId: null, honorario: 0, cliente: 450_000, exitoBp: null });
      expect((await s.t.owner`select 1 from parcelas_honorarios where alvara_id = ${a}`).length).toBe(0);
    });

    test("o escritório só marca o honorário como recebido se quem confirma disser que ele ficou retido no saque", async () => {
      const p = await processoNovo("Retido no saque");
      const k = await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "1000.00");
      const antes = await recebidoTotal();
      const r = await confirmar(a, { honorario: 30_000, cliente: 70_000, retidoNoSaque: true });
      expect(r.status).toBe(201);
      expect((await r.json()).prestacao.retidoNoSaque).toBe(true);
      const contrato = await s.json(s.com("beatriz", `/financeiro/contratos/${k.id}`));
      expect(contrato.parcelas[0]).toMatchObject({ pago: 30_000, situacao: "paga" });
      expect(contrato.parcelas[0].pagamentos[0]).toMatchObject({ forma: "retido_no_alvara", origem: "manual", valor: 30_000 });
      expect(await recebidoTotal()).toBe(antes + 30_000);
    });

    test("o segundo alvará do mesmo contrato ganha uma parcela de êxito nova; a primeira não é reescrita", async () => {
      const p = await processoNovo("Dois alvarás");
      const k = await contratoDeExito(p, 2000);
      const a1 = await alvaraSacado(p, "1000.00", "1000.00", "Primeiro alvará");
      const a2 = await alvaraSacado(p, "500.00", "500.00", "Segundo alvará");
      await confirmar(a1, { honorario: 20_000, cliente: 80_000 });
      await confirmar(a2, { honorario: 10_000, cliente: 40_000 });
      const contrato = await s.json(s.com("beatriz", `/financeiro/contratos/${k.id}`));
      expect(contrato.parcelas.map((x: { valor: number; alvaraId: string }) => [x.valor, x.alvaraId])).toEqual([[20_000, a1], [10_000, a2]]);
      expect(contrato.parcelas.map((x: { numero: number }) => x.numero)).toEqual([1, 2]);
    });

    test("depois de confirmada, o valor do alvará e o que caiu na conta não mudam sem desfazer a prestação", async () => {
      const p = await processoNovo("Valores travados");
      await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "1000.00");
      const prestacaoId = (await (await confirmar(a, { honorario: 30_000, cliente: 70_000 })).json()).prestacao.id;
      for (const corpo of [{ valorRecebido: "900.00" }, { valor: "1100.00" }, { valorRecebido: null }]) {
        const r = await s.com("beatriz", `/alvaras/${a}`, { metodo: "PUT", json: corpo });
        expect(r.status).toBe(409);
        expect((await r.json()).erro).toBe("alvara_com_prestacao");
      }
      // O mesmo valor, as datas, a observação e a etapa seguem livres.
      expect((await s.com("beatriz", `/alvaras/${a}`, { metodo: "PUT", json: { valorRecebido: "1000.00", observacoes: "Conferido", etapa: "repassado" } })).status).toBe(200);
      await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "Valor estava errado." } });
      expect((await s.com("beatriz", `/alvaras/${a}`, { metodo: "PUT", json: { valorRecebido: "900.00" } })).status).toBe(200);
    });

    test("honorário que arredonda para zero não cria parcela, mas a prestação fica registrada", async () => {
      const p = await processoNovo("Centavo");
      await contratoDeExito(p, 100);
      const a = await alvaraSacado(p, "0.10");
      const r = await confirmar(a, { honorario: 0, cliente: 10 });
      expect(r.status).toBe(201);
      expect((await r.json()).prestacao).toMatchObject({ honorario: 0, cliente: 10, parcelaId: null });
    });
  });

  describe("o repasse ao cliente", () => {
    let alvaraId = "";
    let prestacaoId = "";
    beforeAll(async () => {
      const p = await processoNovo("Repasses");
      await contratoDeExito(p, 2500);
      alvaraId = await alvaraSacado(p, "4180.00", "4180.00", "Depósito judicial do réu");
      prestacaoId = (await (await confirmar(alvaraId, { honorario: 104_500, cliente: 313_500 })).json()).prestacao.id;
    });

    test("mais de um favorecido, cada um com data, valor, conta e favorecido; a soma não passa da parte do cliente", async () => {
      const r1 = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { favorecido: "Marina Duarte", favorecidoDocumento: "52998224725", conta: "Banco do Brasil, ag. 1234-5, c/c 67890-1", valor: 200_000, repassadoEm: somarDias(HOJE, -1) } });
      expect(r1.status).toBe(201);
      expect((await r1.json()).prestacao.conferencia).toEqual({ repassado: 200_000, falta: 113_500, excede: 0, completo: false });
      const r2 = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { favorecido: "Pedro Duarte (filho)", conta: "Pix 47999112233", valor: 100_000, repassadoEm: HOJE } });
      expect((await r2.json()).prestacao.conferencia).toEqual({ repassado: 300_000, falta: 13_500, excede: 0, completo: false });
      const c = await conta(alvaraId);
      expect(c.prestacao.repasses.map((x: { favorecido: string; valor: number; repassadoEm: string; conta: string }) => [x.favorecido, x.valor, x.repassadoEm, x.conta])).toEqual([
        ["Marina Duarte", 200_000, somarDias(HOJE, -1), "Banco do Brasil, ag. 1234-5, c/c 67890-1"],
        ["Pedro Duarte (filho)", 100_000, HOJE, "Pix 47999112233"],
      ]);
    });

    test("passar de um centavo da parte do cliente é recusado, e a frase diz quanto falta", async () => {
      const r = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { favorecido: "Marina Duarte", conta: "Pix", valor: 13_501, repassadoEm: HOJE } });
      expect(r.status).toBe(422);
      const corpo = await r.json();
      expect(corpo.erro).toBe("passa_da_parte_do_cliente");
      expect(corpo.detalhe).toContain("R$ 135,00");
    });

    test("repasse com data de amanhã, sem favorecido, sem conta ou com valor quebrado é recusado", async () => {
      const base = { favorecido: "Marina Duarte", conta: "Pix 47999112233", valor: 1_000, repassadoEm: HOJE };
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { ...base, repassadoEm: somarDias(HOJE, 1) } })).status).toBe(422);
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { ...base, favorecido: "" } })).status).toBe(400);
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { ...base, conta: "" } })).status).toBe(400);
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { ...base, valor: 10.5 } })).status).toBe(400);
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { ...base, valor: 0 } })).status).toBe(400);
    });

    test("repasses dos dois lados ao mesmo tempo não passam juntos da parte do cliente", async () => {
      const corpo = { favorecido: "Marina Duarte", conta: "Pix 47999112233", valor: 13_500, repassadoEm: HOJE };
      const [a, b] = await Promise.all([s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: corpo }), s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: corpo })]);
      expect([a.status, b.status].sort()).toEqual([201, 422]);
      const c = await conta(alvaraId);
      expect(c.prestacao.conferencia).toEqual({ repassado: 313_500, falta: 0, excede: 0, completo: true });
    });

    test("desfazer um repasse devolve o valor ao que falta repassar; fica no registro", async () => {
      const c = await conta(alvaraId);
      const ultimo = c.prestacao.repasses.at(-1);
      expect((await s.com("beatriz", `/financeiro/repasses/${ultimo.id}/estornar`, { json: { motivo: "" } })).status).toBe(400);
      const r = await s.com("beatriz", `/financeiro/repasses/${ultimo.id}/estornar`, { json: { motivo: "Conta do favorecido estava errada." } });
      expect(r.status).toBe(200);
      expect((await r.json()).prestacao.conferencia).toEqual({ repassado: 300_000, falta: 13_500, excede: 0, completo: false });
      expect((await s.com("beatriz", `/financeiro/repasses/${ultimo.id}/estornar`, { json: { motivo: "De novo" } })).status).toBe(409);
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao in ('repasse.registrado', 'repasse.desfeito')`)[0]!.n).toBeGreaterThanOrEqual(4);
    });

    test("quem não tem o Financeiro não registra repasse; outro escritório não enxerga a prestação", async () => {
      const corpo = { favorecido: "Alguém", conta: "Pix", valor: 100, repassadoEm: HOJE };
      expect((await s.com("tiago", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: corpo })).status).toBe(403);
      expect((await s.com("mendes", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: corpo })).status).toBe(404);
      expect((await s.com("mendes", `/financeiro/prestacoes/${prestacaoId}/docx`)).status).toBe(404);
    });
  });

  describe("desfazer a prestação de contas", () => {
    test("sem repasse nem pagamento do honorário, desfaz: a parcela é cancelada, o alvará volta a esperar a conta, e dá para confirmar de novo", async () => {
      const p = await processoNovo("Desfazer");
      const k = await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "1000.00");
      const prestacaoId = (await (await confirmar(a, { honorario: 30_000, cliente: 70_000, retidoNoSaque: true })).json()).prestacao.id;
      const antes = await recebidoTotal();
      const sem = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "" } });
      expect(sem.status).toBe(400);
      const r = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "Valor recebido estava errado." } });
      expect(r.status).toBe(200);
      const c = await r.json();
      expect(c.prestacao).toBeNull();
      expect(c.podeConfirmar).toBe(true);
      // O pagamento "retido no alvará" nasceu da prestação e sai com ela.
      expect(await recebidoTotal()).toBe(antes - 30_000);
      const contrato = await s.json(s.com("beatriz", `/financeiro/contratos/${k.id}`));
      expect(contrato.parcelas[0].situacao).toBe("cancelada");
      expect((await confirmar(a, { honorario: 30_000, cliente: 70_000 })).status).toBe(201);
      expect((await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "De novo" } })).status).toBe(409);
    });

    test("com repasse registrado, não desfaz; com outro pagamento no honorário, também não", async () => {
      const p = await processoNovo("Não desfaz");
      const k = await contratoDeExito(p, 3000);
      const a = await alvaraSacado(p, "1000.00");
      const prestacaoId = (await (await confirmar(a, { honorario: 30_000, cliente: 70_000 })).json()).prestacao.id;
      await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { favorecido: "Marina Duarte", conta: "Pix", valor: 70_000, repassadoEm: HOJE } });
      const r = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "Engano" } });
      expect(r.status).toBe(409);
      expect((await r.json()).erro).toBe("tem_repasse");
      const c = await conta(a);
      await s.com("beatriz", `/financeiro/repasses/${c.prestacao.repasses[0].id}/estornar`, { json: { motivo: "Desfeito para corrigir." } });
      const contrato = await s.json(s.com("beatriz", `/financeiro/contratos/${k.id}`));
      await s.com("beatriz", `/financeiro/parcelas/${contrato.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE, forma: "pix" } });
      const depois = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/desfazer`, { json: { motivo: "Engano" } });
      expect(depois.status).toBe(409);
      expect((await depois.json()).erro).toBe("tem_pagamento");
    });
  });

  describe("a prestação de contas em DOCX, no timbre", () => {
    test("baixa o DOCX com os valores, o contrato, os repasses e a assinatura de quem emite", async () => {
      const p = await processoNovo("Docx");
      await contratoDeExito(p, 2500);
      const a = await alvaraSacado(p, "4180.00", "4180.00", "Depósito judicial do réu");
      const prestacaoId = (await (await confirmar(a, { honorario: 104_500, cliente: 313_500 })).json()).prestacao.id;
      await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/repasses`, { json: { favorecido: "Marina Duarte", conta: "Banco do Brasil, ag. 1234-5, c/c 67890-1", valor: 313_500, repassadoEm: HOJE } });
      const r = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/docx`);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      expect(r.headers.get("content-disposition")).toContain("Presta%C3%A7%C3%A3o%20de%20contas");
      expect(r.headers.get("cache-control")).toBe("no-store");
      const zip = await JSZip.loadAsync(new Uint8Array(await r.arrayBuffer()));
      const xml = await zip.file("word/document.xml")!.async("string");
      for (const esperado of ["4.180,00", "1.045,00", "3.135,00", "Marina Duarte", "Banco do Brasil", "Beatriz Souza", "Todo o valor do cliente foi repassado"]) expect(xml).toContain(esperado);
      // O texto do documento não leva campo a completar nem escondido.
      expect(xml).not.toContain("COMPLETAR");
      expect((await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao = 'prestacao.baixada'`)[0]!.n).toBeGreaterThan(0);
      expect((await s.com("tiago", `/financeiro/prestacoes/${prestacaoId}/docx`)).status).toBe(403);
    });

    test("guardar põe uma cópia na pasta do cliente e do processo, com o arquivo no armazenamento", async () => {
      const p = await processoNovo("Docx guardado");
      await contratoDeExito(p, 2500);
      const a = await alvaraSacado(p, "1000.00", "1000.00", "Alvará guardado");
      const prestacaoId = (await (await confirmar(a, { honorario: 25_000, cliente: 75_000 })).json()).prestacao.id;
      const r = await s.com("beatriz", `/financeiro/prestacoes/${prestacaoId}/guardar`, { json: {} });
      expect(r.status).toBe(201);
      const { documentoId, nome } = await r.json();
      expect(nome).toMatch(/^Prestação de contas - Alvará guardado\.docx$/);
      const [d] = await s.t.owner<{ cliente_id: string; processo_id: string; chave: string; origem: string; mime: string }[]>`select cliente_id, processo_id, chave, origem, mime from documentos where id = ${documentoId}`;
      expect(d).toMatchObject({ cliente_id: s.souza.clienteId, processo_id: p, origem: "peca" });
      expect(s.arquivos.arquivos.has(d!.chave)).toBe(true);
      expect((await s.t.owner<{ documento_id: string }[]>`select documento_id from prestacoes_de_contas where id = ${prestacaoId}`)[0]!.documento_id).toBe(documentoId);
    });
  });
});
