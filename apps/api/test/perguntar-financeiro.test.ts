/**
 * Os atalhos do Perguntar sobre dinheiro: "quem está devendo", "alvarás parados" e "honorários a receber no mês".
 * São ferramentas só de leitura, com a demonstração no banco (os honorários fictícios dela) e a IA de mentira. As contas
 * saem em centavos e em texto; quem não tem acesso ao Financeiro recebe a recusa; cliente que recusou IA fica de fora.
 */
import { afterAll, beforeAll, describe, expect, setDefaultTimeout, setSystemTime, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { somarDias } from "@decreta/core";
import { createTestDatabase, hasTestDatabase, type TestDatabase } from "@decreta/db/testing";
import { armazenamentoEmMemoria } from "@decreta/documentos";
import { createApp } from "../src/app.ts";
import { createAuth } from "../src/auth.ts";
import { criarDemonstracao } from "../src/demonstracao.ts";
import { createLogMailer } from "../src/email.ts";
import { readEnv } from "../src/env.ts";
import { createRotas } from "../src/rotas/index.ts";
import { iaFalsa } from "./ia-falsa.ts";

type Evento = { t: string; [k: string]: any };

setDefaultTimeout(60_000);

describe.skipIf(!hasTestDatabase)("Perguntar: dinheiro do escritório", () => {
  let t: TestDatabase;
  let app: ReturnType<typeof createApp>;
  let orgId = "";
  const cookies: Record<"beatriz" | "rafael" | "tiago" | "camila", string> = { beatriz: "", rafael: "", tiago: "", camila: "" };
  const ia = iaFalsa();
  const env = readEnv({ DATABASE_URL: "postgres://unused@localhost/unused", BETTER_AUTH_SECRET: randomBytes(32).toString("hex"), BETTER_AUTH_URL: "http://localhost:8787" });

  /** Pergunta e devolve o resultado da ferramenta (a saída, ou o erro que a IA leu). */
  const consultar = async (quem: keyof typeof cookies, nome: string, entrada: unknown = {}) => {
    ia.respostas.perguntar = [{ ferramentas: [{ nome, entrada }] }, "Pronto."];
    const r = await app.request("/api/app/ia/perguntar", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN, cookie: cookies[quem] }, body: JSON.stringify({ texto: "Pergunta de teste" }) });
    expect(r.status).toBe(200);
    const eventos = (await r.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l) as Evento);
    const resultado = eventos.find((e) => e.t === "resultado")!;
    return { saida: resultado.saida, erro: resultado.erro as string | undefined };
  };

  beforeAll(async () => {
    setSystemTime(new Date("2026-10-29T09:30:00-03:00"));
    t = await createTestDatabase();
    const auth = createAuth(t.db, env);
    const arquivos = armazenamentoEmMemoria();
    ({ organizationId: orgId } = await criarDemonstracao(t.db, auth, { hoje: "2026-10-29", senha: "demonstracao-123", arquivos }));
    const rotas = createRotas({ db: t.db, auth, ia, arquivos, mailer: createLogMailer(() => {}), telas: "https://decreta.local", captura: { db: t.db, datajudKey: "" }, maxArquivoBytes: 5e6, enfileirar: async () => {}, log: () => {} });
    app = createApp({ db: t.db, env, auth, rotas, log: () => {} });
    const entrar = async (email: string) => {
      const r = await app.request("/api/auth/sign-in/email", { method: "POST", headers: { "content-type": "application/json", origin: env.WEB_ORIGIN }, body: JSON.stringify({ email, password: "demonstracao-123" }) });
      const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
      await app.request("/api/auth/organization/set-active", { method: "POST", headers: { "content-type": "application/json", cookie, origin: env.WEB_ORIGIN }, body: JSON.stringify({ organizationId: orgId }) });
      return cookie;
    };
    cookies.beatriz = await entrar("teste@decreta.site");
    cookies.rafael = await entrar("rafael@demo.decreta.app");
    cookies.tiago = await entrar("tiago@demo.decreta.app");
    cookies.camila = await entrar("camila@demo.decreta.app");
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await t?.drop();
  }, 60_000);

  describe("quem está devendo", () => {
    test("os clientes com parcelas vencidas, do que mais deve para o que menos deve, com a conta em centavos e em texto", async () => {
      const { saida } = await consultar("beatriz", "buscarDevedores");
      expect(saida.total).toBe(4);
      expect(saida.valorTotalCentavos).toBe(1_030_000);
      expect(saida.valorTotal).toBe("R$ 10.300,00");
      expect(saida.itens.map((i: { nome: string; emAtrasoCentavos: number; emAtraso: string }) => [i.nome, i.emAtrasoCentavos, i.emAtraso])).toEqual([
        ["Hotel Mar Azul Ltda.", 450_000, "R$ 4.500,00"],
        ["Roberto Kühn", 300_000, "R$ 3.000,00"],
        ["Padaria Bom Grão Ltda.", 180_000, "R$ 1.800,00"],
        ["Marina Duarte", 100_000, "R$ 1.000,00"],
      ]);
      const roberto = saida.itens[1];
      expect(roberto).toMatchObject({ parcelasEmAtraso: 1, maisAntigaDesde: "2026-10-14", diasDoMaisAntigo: 15, telefone: "(47) 98812-7744" });
      expect(roberto.id).toBeString();
    });

    test("quem já pagou, quem tem parcela só a vencer e o êxito sem valor não aparecem", async () => {
      const { saida } = await consultar("beatriz", "buscarDevedores", { limite: 50 });
      const nomes = saida.itens.map((i: { nome: string }) => i.nome);
      for (const fora of ["Eduardo Lima", "Ana Lúcia Ferraz", "Carlos Henrique Prado"]) expect(nomes).not.toContain(fora);
    });

    test("o limite corta a lista, e o total continua o de todos", async () => {
      const { saida } = await consultar("rafael", "buscarDevedores", { limite: 2 });
      expect(saida.itens).toHaveLength(2);
      expect(saida.total).toBe(4);
    });

    test("o sócio e a sócia têm acesso; quem não é sócio e não foi liberado recebe a recusa, sem dado nenhum", async () => {
      for (const quem of ["tiago", "camila"] as const) {
        const r = await consultar(quem, "buscarDevedores");
        expect(r.saida).toBeUndefined();
        expect(r.erro).toContain("não tem acesso ao Financeiro");
      }
    });

    test("quem foi liberado na Equipe passa a ter acesso", async () => {
      await t.owner`update equipe set financeiro = true where organization_id = ${orgId} and apelido = 'Tiago'`;
      const r = await consultar("tiago", "buscarDevedores");
      expect(r.erro).toBeUndefined();
      expect(r.saida.total).toBe(4);
      await t.owner`update equipe set financeiro = false where organization_id = ${orgId} and apelido = 'Tiago'`;
      expect((await consultar("tiago", "buscarDevedores")).erro).toContain("não tem acesso ao Financeiro");
    });
  });

  describe("honorários a receber, em atraso e recebidos", () => {
    test("a receber no mês: de e ate com o primeiro e o último dia, com o total do que falta", async () => {
      const { saida } = await consultar("beatriz", "buscarHonorarios", { de: "2026-11-01", ate: "2026-11-30" });
      expect(saida.total).toBe(5);
      expect(saida.valorTotalCentavos).toBe(1_270_000);
      expect(saida.valorTotal).toBe("R$ 12.700,00");
      expect(saida.itens.map((i: { vencimento: string }) => i.vencimento)).toEqual(["2026-11-07", "2026-11-09", "2026-11-14", "2026-11-21", "2026-11-24"]);
      expect(saida.itens[0]).toMatchObject({ valorCentavos: 250_000, valor: "R$ 2.500,00", faltaCentavos: 250_000, falta: "R$ 2.500,00", pagoCentavos: 0, situacao: "a_vencer" });
      expect(saida.itens[0].cliente.nome).toBe("Carlos Henrique Prado");
    });

    test("em atraso: as quatro parcelas vencidas, com os dias de atraso", async () => {
      const { saida } = await consultar("beatriz", "buscarHonorarios", { situacao: "em_atraso" });
      expect(saida.total).toBe(4);
      expect(saida.valorTotal).toBe("R$ 10.300,00");
      expect(saida.itens.map((i: { diasEmAtraso: number }) => i.diasEmAtraso).sort((a: number, b: number) => a - b)).toEqual([3, 5, 8, 15]);
      expect(saida.itens.every((i: { situacao: string }) => i.situacao === "em_atraso")).toBe(true);
    });

    test("recebidos: só o que tem pagamento marcado, e a soma é a do que foi pago", async () => {
      const { saida } = await consultar("beatriz", "buscarHonorarios", { situacao: "recebidos", limite: 50 });
      expect(saida.valorTotalCentavos).toBe(1_580_000);
      expect(saida.valorTotal).toBe("R$ 15.800,00");
      expect(saida.itens.every((i: { pagoCentavos: number }) => i.pagoCentavos > 0)).toBe(true);
    });

    test("o êxito sem valor não entra no a receber; por cliente e por processo filtra", async () => {
      const todos = (await consultar("beatriz", "buscarHonorarios", { limite: 50 })).saida;
      expect(todos.itens.some((i: { valorCentavos: number | null }) => i.valorCentavos === null)).toBe(false);
      const [marina] = (await consultar("beatriz", "buscarClientes", { busca: "Marina Duarte" })).saida.itens;
      const dela = (await consultar("beatriz", "buscarHonorarios", { clienteId: marina.id, situacao: "todos" })).saida;
      expect(dela.itens.every((i: { cliente: { nome: string } }) => i.cliente.nome === "Marina Duarte")).toBe(true);
      // As três parcelas da entrada e o êxito sem valor.
      expect(dela.total).toBe(4);
      expect(dela.itens.filter((i: { situacao: string }) => i.situacao === "sem_valor")).toHaveLength(1);
    });

    test("quem não tem acesso ao Financeiro recebe a recusa", async () => {
      expect((await consultar("camila", "buscarHonorarios")).erro).toContain("não tem acesso ao Financeiro");
    });

    test("pedido torto (data que não existe, situação desconhecida) volta como erro curto para a IA corrigir", async () => {
      expect((await consultar("beatriz", "buscarHonorarios", { de: "2026-02-30" })).erro).toContain("é um dia que não existe");
      expect((await consultar("beatriz", "buscarHonorarios", { situacao: "pagos" })).erro).toContain("situacao");
    });

    test("cliente que recusou a IA fica fora das duas ferramentas", async () => {
      await t.owner`update clientes set sem_ia = true where organization_id = ${orgId} and nome = 'Roberto Kühn'`;
      const devedores = (await consultar("beatriz", "buscarDevedores")).saida;
      expect(devedores.itens.map((i: { nome: string }) => i.nome)).not.toContain("Roberto Kühn");
      expect(devedores.total).toBe(3);
      const honorarios = (await consultar("beatriz", "buscarHonorarios", { situacao: "em_atraso" })).saida;
      expect(honorarios.itens.map((i: { cliente: { nome: string } }) => i.cliente.nome)).not.toContain("Roberto Kühn");
      await t.owner`update clientes set sem_ia = false where organization_id = ${orgId} and nome = 'Roberto Kühn'`;
    });
  });

  describe("alvarás parados", () => {
    test("só os que passaram do normal na etapa, com os dias e a marca de parado", async () => {
      const [proc] = await t.owner<{ id: string }[]>`select id from processos where organization_id = ${orgId} and titulo like 'Marina Duarte%' limit 1`;
      const novo = async (descricao: string, etapa: string, expedidoHa: number, sacadoHa: number | null) =>
        t.owner`insert into alvaras (organization_id, processo_id, descricao, valor, etapa, expedido_em, sacado_em) values (${orgId}, ${proc!.id}, ${descricao}, 100, ${etapa}::etapa_alvara, ${somarDias("2026-10-29", -expedidoHa)}, ${sacadoHa === null ? null : somarDias("2026-10-29", -sacadoHa)})`;
      await novo("Parado: aguardando há 20 dias", "aguardando_saque", 20, null);
      await novo("Normal: aguardando há 3 dias", "aguardando_saque", 3, null);
      await novo("Parado: sacado há 7 dias", "sacado", 12, 7);
      await novo("Normal: sacado há 2 dias", "sacado", 6, 2);
      await novo("Já repassado, não espera", "repassado", 60, 50);
      const { saida } = await consultar("beatriz", "buscarAlvaras", { parados: true, limite: 50 });
      const descricoes = saida.itens.map((i: { descricao: string }) => i.descricao);
      expect(descricoes).toContain("Parado: aguardando há 20 dias");
      expect(descricoes).toContain("Parado: sacado há 7 dias");
      for (const fora of ["Normal: aguardando há 3 dias", "Normal: sacado há 2 dias", "Já repassado, não espera"]) expect(descricoes).not.toContain(fora);
      expect(saida.itens.every((i: { parado: boolean }) => i.parado)).toBe(true);
      const sete = saida.itens.find((i: { descricao: string }) => i.descricao.startsWith("Parado: sacado"));
      expect(sete).toMatchObject({ etapa: "sacado", diasNaEtapa: 7, sacadoEm: "2026-10-22" });
      // Sem o filtro, vêm todos os pendentes, cada um com a marca certa.
      const todos = (await consultar("beatriz", "buscarAlvaras", { limite: 50 })).saida;
      expect(todos.itens.find((i: { descricao: string }) => i.descricao.startsWith("Normal: sacado")).parado).toBe(false);
    });
  });
});
