/**
 * Financeiro (honorários por caso): contratos, parcelas, pagamentos e quem pode ver. Banco de verdade
 * (com RLS) e dois escritórios. Os valores são centavos inteiros, e os números dos testes foram feitos à mão.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, test } from "bun:test";
import { somarDias } from "@decreta/core";
import { contratosHonorarios, parcelasHonorarios, withTenant } from "@decreta/db";
import { hasTestDatabase } from "@decreta/db/testing";
import { apagarEscritoriosEncerrados } from "../src/servicos/encerramento.ts";
import { HOJE, montarCenario, type Cenario } from "./apoio-financeiro.ts";

// Banco de verdade e muitos pedidos por teste: com o computador ocupado, 5 s é pouco.
setDefaultTimeout(60_000);

describe.skipIf(!hasTestDatabase)("financeiro: honorários por caso", () => {
  let s: Cenario;
  beforeAll(async () => {
    s = await montarCenario();
  }, 120_000);
  afterAll(async () => {
    await s?.encerrar();
  }, 60_000);

  const novoContrato = (corpo: Record<string, unknown>, quem: "beatriz" | "camila" | "tiago" | "mendes" = "beatriz") => s.com(quem, "/financeiro/contratos", { json: corpo });
  const resumo = async (quem: "beatriz" | "camila" | "mendes" = "beatriz") => (await s.json(s.com(quem, "/financeiro"))).resumo;

  describe("quem entra no Financeiro", () => {
    test("os sócios e quem eles liberaram entram; os outros recebem 403 em tudo", async () => {
      for (const quem of ["beatriz", "rafael", "camila"] as const) expect((await s.com(quem, "/financeiro")).status).toBe(200);
      for (const quem of ["tiago", "bianca"] as const) {
        expect((await s.com(quem, "/financeiro")).status).toBe(403);
        expect((await s.com(quem, "/financeiro/contratos")).status).toBe(403);
        expect((await s.com(quem, "/financeiro/contratos", { json: { tipo: "exito", exitoBp: 3000, clienteId: s.souza.clienteId } })).status).toBe(403);
        expect((await s.com(quem, `/financeiro/clientes/${s.souza.clienteId}`)).status).toBe(403);
        expect((await s.com(quem, `/financeiro/processos/${s.souza.processoId}`)).status).toBe(403);
        expect((await s.com(quem, "/financeiro/cobranca")).status).toBe(403);
      }
      expect((await s.json(s.com("tiago", "/financeiro"))).erro).toBe("sem_acesso_financeiro");
    });

    test("o /eu diz se a pessoa vê o Financeiro, e o número do menu só vem para quem vê", async () => {
      expect((await s.json(s.com("beatriz", "/eu"))).usuario.financeiro).toBe(true);
      expect((await s.json(s.com("camila", "/eu"))).usuario.financeiro).toBe(true);
      const tiago = await s.json(s.com("tiago", "/eu"));
      expect(tiago.usuario.financeiro).toBe(false);
      expect(tiago.menu.financeiro).toBe(0);
    });

    test("só sócio libera ou tira o acesso, e fica no registro", async () => {
      // A Camila tem o acesso, mas não é sócia: não libera ninguém.
      expect((await s.com("camila", `/equipe/${s.souza.userIds.tiago}`, { metodo: "PUT", json: { financeiro: true } })).status).toBe(403);
      expect((await s.com("tiago", "/financeiro")).status).toBe(403);
      expect((await s.com("beatriz", `/equipe/${s.souza.userIds.tiago}`, { metodo: "PUT", json: { financeiro: true } })).status).toBe(200);
      expect((await s.com("tiago", "/financeiro")).status).toBe(200);
      expect((await s.json(s.com("beatriz", "/equipe"))).pessoas.find((p: { id: string }) => p.id === s.souza.userIds.tiago).financeiro).toBe(true);
      expect((await s.com("beatriz", `/equipe/${s.souza.userIds.tiago}`, { metodo: "PUT", json: { financeiro: false } })).status).toBe(200);
      expect((await s.com("tiago", "/financeiro")).status).toBe(403);
      const [registro] = await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao = 'equipe.financeiro'`;
      expect(registro!.n).toBe(2);
    });

    test("sócio tem acesso mesmo sem marca na Equipe", async () => {
      const equipe = await s.json(s.com("beatriz", "/equipe"));
      expect(equipe.pessoas.find((p: { id: string }) => p.id === s.souza.userIds.rafael).financeiro).toBe(true);
    });
  });

  describe("contratos e parcelas", () => {
    test("valor fixo em 3 parcelas: a soma fecha no centavo, cada uma com o vencimento próprio", async () => {
      const r = await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 100_000, parcelas: 3, primeiroVencimento: somarDias(HOJE, 10) } });
      expect(r.status).toBe(201);
      const c = await r.json();
      expect(c.tipo).toBe("fixo");
      expect(c.parcelas.map((p: { valor: number }) => p.valor)).toEqual([33_334, 33_333, 33_333]);
      expect(c.parcelas.reduce((t: number, p: { valor: number }) => t + p.valor, 0)).toBe(100_000);
      expect(c.parcelas.map((p: { descricao: string }) => p.descricao)).toEqual(["Honorários · parcela 1/3", "Honorários · parcela 2/3", "Honorários · parcela 3/3"]);
      expect(c.parcelas[0].vencimento).toBe(somarDias(HOJE, 10));
      expect(c.totais).toEqual({ aReceber: 100_000, recebido: 0, emAtraso: 0 });
      expect(c.parcelas.every((p: { situacao: string }) => p.situacao === "a_vencer")).toBe(true);
    });

    test("o êxito nasce sem valor e sem vencimento: guarda só o percentual, e não entra em nenhuma soma", async () => {
      const antes = await resumo();
      const r = await novoContrato({ tipo: "exito", processoId: s.souza.processoId, exitoBp: 3000 });
      expect(r.status).toBe(201);
      const c = await r.json();
      // O contrato do processo leva o cliente do processo.
      expect(c.cliente.id).toBe(s.souza.clienteId);
      expect(c.processo.id).toBe(s.souza.processoId);
      expect(c.parcelas).toHaveLength(1);
      expect(c.parcelas[0]).toMatchObject({ tipo: "exito", valor: null, vencimento: null, falta: null, situacao: "sem_valor", descricao: "Honorário de êxito (30%)", pago: 0 });
      expect(c.exitoRotulo).toBe("30%");
      const depois = await resumo();
      expect(depois.aReceber).toBe(antes.aReceber);
      expect(depois.recebido).toBe(antes.recebido);
    });

    test("híbrido: entrada fixa e êxito sem valor", async () => {
      const c = await (await novoContrato({ tipo: "hibrido", clienteId: s.souza.clienteId, fixo: { valor: 200_000, parcelas: 2, primeiroVencimento: somarDias(HOJE, 5) }, exitoBp: 2000, titulo: "Híbrido da Marina" })).json();
      expect(c.titulo).toBe("Híbrido da Marina");
      expect(c.parcelas.map((p: { tipo: string; valor: number | null }) => [p.tipo, p.valor])).toEqual([["fixo", 100_000], ["fixo", 100_000], ["exito", null]]);
    });

    test("mensal: uma parcela por mês, e dá para acrescentar mais meses a partir da última", async () => {
      const c = await (await novoContrato({ tipo: "mensal", clienteId: s.souza.clienteId, mensal: { valor: 150_000, meses: 3, primeiroVencimento: somarDias(HOJE, 20) } })).json();
      expect(c.parcelas).toHaveLength(3);
      expect(c.mensalidade).toBe(150_000);
      const ultima = c.parcelas[2].vencimento as string;
      const mais = await s.com("beatriz", `/financeiro/contratos/${c.id}/parcelas`, { json: { tipo: "mensal", meses: 2 } });
      expect(mais.status).toBe(201);
      const depois = await mais.json();
      expect(depois.parcelas).toHaveLength(5);
      expect(depois.parcelas[3].vencimento > ultima).toBe(true);
      expect(depois.parcelas.map((p: { numero: number }) => p.numero)).toEqual([1, 2, 3, 4, 5]);
    });

    test("parcela avulsa", async () => {
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 50_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 3) } })).json();
      const r = await s.com("beatriz", `/financeiro/contratos/${c.id}/parcelas`, { json: { tipo: "avulso", descricao: "Custas adiantadas", valor: 12_345, vencimento: somarDias(HOJE, 8) } });
      expect(r.status).toBe(201);
      const depois = await r.json();
      expect(depois.parcelas.map((p: { descricao: string }) => p.descricao)).toContain("Custas adiantadas");
    });

    test("contrato que não combina é recusado com a frase do motivo", async () => {
      const sem = await novoContrato({ tipo: "exito", exitoBp: 3000 });
      expect(sem.status).toBe(422);
      expect((await sem.json()).detalhe).toBe("Escolha o cliente ou o processo do contrato.");
      const mistura = await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, exitoBp: 2000, fixo: { valor: 1000, parcelas: 1, primeiroVencimento: HOJE } });
      expect(mistura.status).toBe(422);
      expect((await mistura.json()).detalhe).toBe("Êxito só no contrato de êxito ou no híbrido.");
      expect((await novoContrato({ tipo: "exito", clienteId: s.souza.clienteId, exitoBp: 10_001 })).status).toBe(400);
      expect((await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 100.5, parcelas: 1, primeiroVencimento: HOJE } })).status).toBe(400);
    });

    test("valor e vencimento mudam enquanto não há cobrança; o valor não fica abaixo do já pago", async () => {
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 80_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 6) } })).json();
      const p = c.parcelas[0];
      const r = await s.com("beatriz", `/financeiro/parcelas/${p.id}`, { metodo: "PUT", json: { valor: 90_000, vencimento: somarDias(HOJE, 9) } });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ valor: 90_000, vencimento: somarDias(HOJE, 9) });
      await s.com("beatriz", `/financeiro/parcelas/${p.id}/pagamentos`, { json: { valor: 40_000, pagoEm: HOJE, forma: "pix" } });
      const abaixo = await s.com("beatriz", `/financeiro/parcelas/${p.id}`, { metodo: "PUT", json: { valor: 30_000 } });
      expect(abaixo.status).toBe(422);
    });
  });

  describe("recebido só com pagamento marcado", () => {
    let parcelaId = "";
    test("parcela nova, de contrato novo, nunca aparece como recebida", async () => {
      const antes = (await resumo()).recebido;
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 100_000, parcelas: 2, primeiroVencimento: somarDias(HOJE, 4) } })).json();
      parcelaId = c.parcelas[0].id;
      expect(c.parcelas.every((p: { pago: number; pagamentos: unknown[] }) => p.pago === 0 && p.pagamentos.length === 0)).toBe(true);
      expect(c.totais.recebido).toBe(0);
      expect((await resumo()).recebido).toBe(antes);
      // Nem a cobrança emitida, nem o vencimento passado, nem o tempo: só o pagamento.
      const [linha] = await s.t.owner<{ n: number }[]>`select count(*)::int as n from pagamentos_honorarios where organization_id = ${s.souza.orgId} and parcela_id = ${parcelaId}`;
      expect(linha!.n).toBe(0);
    });

    test("o pagamento marcado vira recebido; parcela só fica paga quando os pagamentos cobrem o valor", async () => {
      const antes = (await resumo()).recebido;
      const parcial = await s.com("beatriz", `/financeiro/parcelas/${parcelaId}/pagamentos`, { json: { valor: 20_000, pagoEm: HOJE, forma: "pix" } });
      expect(parcial.status).toBe(201);
      expect(await parcial.json()).toMatchObject({ pago: 20_000, falta: 30_000, situacao: "parcial" });
      expect((await resumo()).recebido).toBe(antes + 20_000);
      // Sem o valor, vale o que falta.
      const resto = await (await s.com("beatriz", `/financeiro/parcelas/${parcelaId}/pagamentos`, { json: { pagoEm: HOJE, forma: "transferencia" } })).json();
      expect(resto).toMatchObject({ pago: 50_000, falta: 0, situacao: "paga" });
      expect((await resumo()).recebido).toBe(antes + 50_000);
      expect(resto.pagamentos.map((g: { valor: number }) => g.valor)).toEqual([20_000, 30_000]);
    });

    test("não paga duas vezes, não passa do que falta, não marca pagamento no futuro nem em parcela sem valor", async () => {
      expect((await s.com("beatriz", `/financeiro/parcelas/${parcelaId}/pagamentos`, { json: { valor: 1, pagoEm: HOJE } })).status).toBe(409);
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 10_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 4) } })).json();
      const id = c.parcelas[0].id;
      const passa = await s.com("beatriz", `/financeiro/parcelas/${id}/pagamentos`, { json: { valor: 10_001, pagoEm: HOJE } });
      expect(passa.status).toBe(422);
      expect((await passa.json()).erro).toBe("passa_do_que_falta");
      expect((await s.com("beatriz", `/financeiro/parcelas/${id}/pagamentos`, { json: { valor: 1000, pagoEm: somarDias(HOJE, 1) } })).status).toBe(422);
      const exito = await (await novoContrato({ tipo: "exito", clienteId: s.souza.clienteId, exitoBp: 1000 })).json();
      const semValor = await s.com("beatriz", `/financeiro/parcelas/${exito.parcelas[0].id}/pagamentos`, { json: { valor: 1000, pagoEm: HOJE } });
      expect(semValor.status).toBe(422);
      expect((await semValor.json()).detalhe).toContain("ainda não tem valor");
      // Sem informar o valor, também não: não há o que "dar baixa".
      expect((await s.com("beatriz", `/financeiro/parcelas/${exito.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE } })).status).toBe(409);
    });

    test("estornar não apaga: a parcela volta a dever, e o pagamento fica no histórico", async () => {
      const antes = (await resumo()).recebido;
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 70_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, 2) } })).json();
      const pago = await (await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE, forma: "dinheiro" } })).json();
      expect((await resumo()).recebido).toBe(antes + 70_000);
      const sem = await s.com("beatriz", `/financeiro/pagamentos/${pago.pagamentos[0].id}/estornar`, { json: { motivo: "" } });
      expect(sem.status).toBe(400);
      const r = await s.com("beatriz", `/financeiro/pagamentos/${pago.pagamentos[0].id}/estornar`, { json: { motivo: "Marcado na parcela errada." } });
      expect(r.status).toBe(200);
      const depois = await r.json();
      expect(depois).toMatchObject({ pago: 0, falta: 70_000, situacao: "a_vencer" });
      expect(depois.pagamentos[0]).toMatchObject({ estornado: true, motivoEstorno: "Marcado na parcela errada." });
      expect((await resumo()).recebido).toBe(antes);
      expect((await s.com("beatriz", `/financeiro/pagamentos/${pago.pagamentos[0].id}/estornar`, { json: { motivo: "De novo" } })).status).toBe(409);
    });

    test("pagamento e estorno ficam no registro de atividades, com quem e quando", async () => {
      const [r] = await s.t.owner<{ n: number }[]>`select count(*)::int as n from auditoria where organization_id = ${s.souza.orgId} and acao in ('pagamento.registrado', 'pagamento.estornado') and user_id is not null`;
      expect(r!.n).toBeGreaterThanOrEqual(4);
    });
  });

  describe("em atraso e por período", () => {
    test("parcela vencida sem pagar entra no atraso, no resumo e no número do menu; paga, sai", async () => {
      const antes = await resumo();
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 25_000, parcelas: 1, primeiroVencimento: somarDias(HOJE, -5) } })).json();
      const p = c.parcelas[0];
      expect(p).toMatchObject({ situacao: "em_atraso", diasEmAtraso: 5 });
      const depois = await resumo();
      expect(depois.emAtraso).toBe(antes.emAtraso + 25_000);
      expect(depois.parcelasEmAtraso).toBe(antes.parcelasEmAtraso + 1);
      expect((await s.json(s.com("beatriz", "/eu"))).menu.financeiro).toBe(depois.parcelasEmAtraso);
      await s.com("beatriz", `/financeiro/parcelas/${p.id}/pagamentos`, { json: { pagoEm: HOJE, forma: "pix" } });
      expect((await resumo()).emAtraso).toBe(antes.emAtraso);
    });

    test("por mês de vencimento, por cliente e por processo", async () => {
      const r = await s.json(s.com("beatriz", "/financeiro"));
      expect(r.resumo.porMes.length).toBeGreaterThan(0);
      expect(r.resumo.porCliente.some((c: { id: string }) => c.id === s.souza.clienteId)).toBe(true);
      expect(r.parcelas.every((p: { situacao: string }) => p.situacao !== "cancelada")).toBe(true);
    });

    test("a tela do cliente e a do processo mostram os contratos de cada um", async () => {
      const cliente = await s.json(s.com("beatriz", `/financeiro/clientes/${s.souza.clienteId}`));
      expect(cliente.contratos.length).toBeGreaterThan(3);
      expect(cliente.cliente.nome).toBe("Marina Duarte");
      const processo = await s.json(s.com("beatriz", `/financeiro/processos/${s.souza.processoId}`));
      // O contrato do processo e, junto, os do cliente que valem para todos os casos dele.
      expect(processo.contratos.some((c: { processo: { id: string } | null }) => c.processo?.id === s.souza.processoId)).toBe(true);
      expect(processo.contratos.some((c: { processo: unknown }) => c.processo === null)).toBe(true);
    });
  });

  describe("cancelar", () => {
    test("parcela sem pagamento se cancela e sai das contas; com pagamento marcado, não", async () => {
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 60_000, parcelas: 2, primeiroVencimento: somarDias(HOJE, 3) } })).json();
      const [a, b] = c.parcelas;
      const antes = await resumo();
      const r = await s.com("beatriz", `/financeiro/parcelas/${a.id}/cancelar`, { json: { motivo: "Combinado de outro jeito." } });
      expect(r.status).toBe(200);
      expect(await r.json()).toMatchObject({ situacao: "cancelada" });
      expect((await resumo()).aReceber).toBe(antes.aReceber - 30_000);
      await s.com("beatriz", `/financeiro/parcelas/${b.id}/pagamentos`, { json: { valor: 5_000, pagoEm: HOJE } });
      const nao = await s.com("beatriz", `/financeiro/parcelas/${b.id}/cancelar`, { json: {} });
      expect(nao.status).toBe(409);
      expect((await nao.json()).erro).toBe("tem_pagamento");
    });

    test("cancelar o contrato cancela o que ninguém pagou e deixa o que já tem pagamento", async () => {
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.souza.clienteId, fixo: { valor: 90_000, parcelas: 3, primeiroVencimento: somarDias(HOJE, 3) } })).json();
      await s.com("beatriz", `/financeiro/parcelas/${c.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE } });
      const r = await s.com("beatriz", `/financeiro/contratos/${c.id}/cancelar`, { json: { motivo: "Cliente desistiu." } });
      expect(r.status).toBe(200);
      const depois = await r.json();
      expect(depois.situacao).toBe("cancelado");
      expect(depois.parcelas.map((p: { situacao: string }) => p.situacao)).toEqual(["paga", "cancelada", "cancelada"]);
      expect((await s.com("beatriz", `/financeiro/contratos/${c.id}/cancelar`, { json: {} })).status).toBe(409);
    });

    test("encerrar o contrato não mexe nas parcelas", async () => {
      const c = await (await novoContrato({ tipo: "mensal", clienteId: s.souza.clienteId, mensal: { valor: 10_000, meses: 2, primeiroVencimento: somarDias(HOJE, 3) } })).json();
      const depois = await (await s.com("beatriz", `/financeiro/contratos/${c.id}/encerrar`, { json: {} })).json();
      expect(depois.situacao).toBe("encerrado");
      expect(depois.parcelas.every((p: { situacao: string }) => p.situacao === "a_vencer")).toBe(true);
    });
  });

  describe("processo sem honorário", () => {
    test("o aviso aparece, dispensa-se, e some quando o processo ganha contrato", async () => {
      const processo = await s.t.owner<{ id: string }[]>`insert into processos (organization_id, titulo, cnj) values (${s.souza.orgId}, 'Sem contrato × Ninguém', '5009999-00.2026.8.24.0038') returning id`;
      const id = processo[0]!.id;
      expect((await s.json(s.com("beatriz", `/financeiro/processos/${id}`))).semHonorario).toBe(true);
      const geral = await s.json(s.com("beatriz", "/financeiro"));
      expect(geral.semHonorario.itens.some((p: { id: string }) => p.id === id)).toBe(true);
      expect((await s.com("beatriz", `/financeiro/processos/${id}/aviso`, { metodo: "PUT", json: { dispensar: true } })).status).toBe(200);
      const dispensado = await s.json(s.com("beatriz", `/financeiro/processos/${id}`));
      expect(dispensado).toMatchObject({ semHonorario: false, dispensado: true });
      expect((await s.json(s.com("beatriz", "/financeiro"))).semHonorario.itens.some((p: { id: string }) => p.id === id)).toBe(false);
      await s.com("beatriz", `/financeiro/processos/${id}/aviso`, { metodo: "PUT", json: { dispensar: false } });
      expect((await s.json(s.com("beatriz", `/financeiro/processos/${id}`))).semHonorario).toBe(true);
      await novoContrato({ tipo: "exito", processoId: id, exitoBp: 2500 });
      expect((await s.json(s.com("beatriz", `/financeiro/processos/${id}`))).semHonorario).toBe(false);
    });

    test("o contrato do cliente vale para os processos dele; quem não tem acesso não vê o aviso", async () => {
      const [p] = await s.t.owner<{ id: string }[]>`insert into processos (organization_id, titulo, cnj, cliente_id) values (${s.souza.orgId}, 'Outro caso da Marina', '5008888-00.2026.8.24.0038', ${s.souza.clienteId}) returning id`;
      // A Marina já tem contratos por cliente (sem processo): este processo não está "sem honorário".
      expect((await s.json(s.com("beatriz", `/financeiro/processos/${p!.id}`))).semHonorario).toBe(false);
      expect((await s.com("bianca", `/financeiro/processos/${p!.id}`)).status).toBe(403);
      expect((await s.com("bianca", `/financeiro/processos/${p!.id}/aviso`, { metodo: "PUT", json: { dispensar: true } })).status).toBe(403);
    });
  });

  describe("um escritório não enxerga o outro (RLS)", () => {
    test("o Mendes não vê contrato, parcela nem pagamento do Souza, e não mexe neles", async () => {
      const lista = await s.json(s.com("mendes", "/financeiro"));
      expect(lista.parcelas).toEqual([]);
      expect(lista.resumo).toMatchObject({ aReceber: 0, recebido: 0, emAtraso: 0 });
      const c = (await s.json(s.com("beatriz", "/financeiro/contratos"))).itens[0];
      const parcela = c.parcelas[0];
      expect((await s.com("mendes", `/financeiro/contratos/${c.id}`)).status).toBe(404);
      expect((await s.com("mendes", `/financeiro/parcelas/${parcela.id}/pagamentos`, { json: { valor: 100, pagoEm: HOJE } })).status).toBe(404);
      expect((await s.com("mendes", `/financeiro/parcelas/${parcela.id}`, { metodo: "PUT", json: { valor: 1 } })).status).toBe(404);
      expect((await s.com("mendes", `/financeiro/parcelas/${parcela.id}/cancelar`, { json: {} })).status).toBe(404);
      expect((await s.com("mendes", `/financeiro/contratos/${c.id}/cancelar`, { json: {} })).status).toBe(404);
      // E não cria contrato para um cliente ou processo de outro escritório.
      expect((await novoContrato({ tipo: "exito", clienteId: s.souza.clienteId, exitoBp: 1000 }, "mendes")).status).toBe(404);
      expect((await novoContrato({ tipo: "exito", processoId: s.souza.processoId, exitoBp: 1000 }, "mendes")).status).toBe(404);
    });

    test("no banco, sem o escritório fixado nenhuma linha aparece, e gravar no de outro é barrado", async () => {
      expect(await s.t.db.select().from(contratosHonorarios)).toEqual([]);
      expect(await s.t.db.select().from(parcelasHonorarios)).toEqual([]);
      const doMendes = await withTenant(s.t.db, s.mendes.orgId, (tx) => tx.select().from(contratosHonorarios));
      expect(doMendes).toEqual([]);
      const tentativa = withTenant(s.t.db, s.mendes.orgId, (tx) => tx.insert(contratosHonorarios).values({ organizationId: s.souza.orgId, titulo: "Intruso", tipo: "exito", exitoBp: 1000, inicio: HOJE }));
      await expect(tentativa).rejects.toMatchObject({ cause: { message: expect.stringMatching(/row-level security/) } });
    });
  });

  describe("encerramento do escritório", () => {
    test("os honorários, as parcelas, os pagamentos e as chaves somem junto com o escritório; o outro fica inteiro", async () => {
      // Um contrato com pagamento e uma configuração de cobrança no Mendes.
      const c = await (await novoContrato({ tipo: "fixo", clienteId: s.mendes.clienteId, fixo: { valor: 20_000, parcelas: 1, primeiroVencimento: HOJE } }, "mendes")).json();
      await s.com("mendes", `/financeiro/parcelas/${c.parcelas[0].id}/pagamentos`, { json: { pagoEm: HOJE } });
      await s.t.owner`insert into cobranca_config (organization_id, asaas_chave) values (${s.mendes.orgId}, 'v1.x.y.z')`;
      const contar = async (org: string) =>
        (
          await s.t.owner<{ n: number }[]>`select (
            (select count(*) from contratos_honorarios where organization_id = ${org}) +
            (select count(*) from parcelas_honorarios where organization_id = ${org}) +
            (select count(*) from pagamentos_honorarios where organization_id = ${org}) +
            (select count(*) from cobranca_config where organization_id = ${org}))::int as n`
        )[0]!.n;
      expect(await contar(s.mendes.orgId)).toBeGreaterThan(0);
      const antesDoSouza = await contar(s.souza.orgId);
      await s.t.owner`update organization set encerrado_em = now() - interval '31 days' where id = ${s.mendes.orgId}`;
      const r = await apagarEscritoriosEncerrados({ db: s.t.db, arquivos: s.arquivos });
      expect(r.falhas).toEqual([]);
      expect(r.apagados.map((x) => x.organizationId)).toEqual([s.mendes.orgId]);
      expect(await contar(s.mendes.orgId)).toBe(0);
      expect(await contar(s.souza.orgId)).toBe(antesDoSouza);
    });
  });
});
