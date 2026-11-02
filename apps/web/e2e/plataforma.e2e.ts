/**
 * O painel da plataforma (/plataforma): quem não é operador recebe 404 (a tela some), a lista traz a conta e os
 * totais (nunca o conteúdo do escritório), as ações pedem confirmação e vão para a auditoria, e os indicadores
 * mostram MRR, conversão, cancelamentos, inadimplência e o funil. A API é a de mentira de e2e/apoio.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

const ESCALA = [11, 12, 13, 14, 15, 20];

const escritorio = (o: Record<string, unknown>) => ({
  id: "00000000-0000-4000-8000-000000000000",
  nome: "Escritório",
  slug: "escritorio",
  demonstracao: false,
  encerrado: false,
  emAvaliacao: false,
  situacao: "cortesia",
  situacaoGravada: "cortesia",
  criadoEm: "2026-10-20T12:00:00.000Z",
  testeAte: null,
  diasRestantesDoTeste: null,
  diasDeAtraso: null,
  acessoAte: null,
  assinouEm: null,
  cancelamentoPedidoEm: null,
  valorMensalCentavos: null,
  pessoas: 3,
  processos: 41,
  iaMesUsd: 0.84,
  ...o,
});

const ESCRITORIOS = [
  escritorio({ id: "a0000000-0000-4000-8000-000000000001", nome: "Souza & Mendes Advocacia", slug: "souza-mendes", situacao: "ativo", situacaoGravada: "ativo", assinouEm: "2026-10-10T12:00:00.000Z", valorMensalCentavos: 9900, pessoas: 4, processos: 120, iaMesUsd: 3.2 }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000002", nome: "Lima Advogados", slug: "lima", situacao: "teste", situacaoGravada: "teste", emAvaliacao: true, testeAte: "2026-11-03", diasRestantesDoTeste: 5, pessoas: 1, processos: 7, iaMesUsd: 0.1 }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000003", nome: "Duarte Pinto", slug: "duarte-pinto", situacao: "so_leitura", situacaoGravada: "teste", testeAte: "2026-10-27", diasRestantesDoTeste: -2, pessoas: 2, processos: 15 }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000004", nome: "Barros & Filhos", slug: "barros", situacao: "inadimplente", situacaoGravada: "inadimplente", diasDeAtraso: 3, valorMensalCentavos: 9900, assinouEm: "2026-09-01T12:00:00.000Z" }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000005", nome: "Escritório Antigo", slug: "antigo" }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000006", nome: "Demonstração", slug: "demonstracao", demonstracao: true }),
  escritorio({ id: "a0000000-0000-4000-8000-000000000007", nome: "Já Encerrado", slug: "encerrado", encerrado: true }),
];

const INDICADORES = {
  periodo: { de: "2026-09-30", ate: "2026-10-29", dias: 30 },
  mrrCentavos: 19_800,
  mrrEmAtrasoCentavos: 9900,
  porSituacao: { teste: 1, ativo: 1, inadimplente: 1, so_leitura: 1, bloqueado: 0, cancelado: 0, cortesia: 1 },
  conversao: { cadastrados: 4, terminaram: 2, assinaram: 1, taxa: 0.5 },
  cancelamentos: { total: 1, mrrPerdidoCentavos: 9900 },
  inadimplencia: { escritorios: 1, mrrCentavos: 9900 },
  funil: [
    { nome: "visita", rotulo: "Visitas ao site", total: 1200, doAnterior: null },
    { nome: "clicou_criar_conta", rotulo: "Clicaram em criar conta", total: 180, doAnterior: 0.15 },
    { nome: "cadastro_concluido", rotulo: "Cadastros concluídos", total: 60, doAnterior: 1 / 3 },
    { nome: "oab_cadastrada", rotulo: "OAB cadastrada", total: 45, doAnterior: 0.75 },
    { nome: "primeira_publicacao", rotulo: "Primeira publicação", total: 30, doAnterior: 2 / 3 },
    { nome: "primeiro_prazo_confirmado", rotulo: "Primeiro prazo confirmado", total: 21, doAnterior: 0.7 },
  ],
};

const AUDITORIA = {
  itens: [
    { id: "x1", operador: "equipe@decreta.site", acao: "plataforma.estender_teste", organizationId: "a0000000-0000-4000-8000-000000000002", escritorio: "Lima Advogados", detalhes: { dias: 7, motivo: "pediu mais uma semana", testeAte: "2026-11-03" }, em: "2026-10-29T11:00:00.000Z" },
    { id: "x2", operador: "equipe@decreta.site", acao: "plataforma.liberar", organizationId: "a0000000-0000-4000-8000-000000000001", escritorio: "Souza & Mendes Advocacia", detalhes: { motivo: null }, em: "2026-10-28T15:00:00.000Z" },
  ],
};

/** O operador: o /eu traz `plataforma` e a API do painel responde. */
function operador() {
  return new ApiFalsa()
    .responder("/eu", { ...amostras.eu!.corpo, plataforma: true })
    .responder("GET /plataforma/escritorios", { escritorios: ESCRITORIOS })
    .responder("/plataforma/indicadores?dias=30", INDICADORES)
    .responder("/plataforma/indicadores?dias=7", { ...INDICADORES, periodo: { ...INDICADORES.periodo, de: "2026-10-23", dias: 7 } })
    .responder("GET /plataforma/auditoria", AUDITORIA);
}

function tamanhosNaTela(page: Page) {
  return page.evaluate(() => {
    const achados = new Map<number, string>();
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = andar.nextNode())) {
      const texto = n.textContent?.trim();
      const el = n.parentElement;
      if (!texto || !el || el.closest("svg, script, style")) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || el.getClientRects().length === 0) continue;
      const tamanho = Number.parseFloat(s.fontSize);
      if (!achados.has(tamanho)) achados.set(tamanho, `${el.className || el.tagName}: "${texto.slice(0, 40)}"`);
    }
    return [...achados.entries()];
  });
}

test.use({ viewport: { width: 1366, height: 768 } });

test("quem não é operador recebe 404: a tela não existe, e nenhum dado de escritório é pedido", async ({ page }) => {
  const api = await abrir(page, "/plataforma");
  await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  await expect(page.getByText("Souza & Mendes Advocacia")).toHaveCount(0);
  expect(api.pedidos.filter((p) => p.caminho.startsWith("/plataforma")).every((p) => p.metodo === "GET")).toBe(true);
});

test("o operador vê os escritórios com a conta e os totais, sem a demonstração nem os encerrados", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await expect(page.getByRole("heading", { level: 1, name: "Plataforma" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Escritórios/ })).toContainText("5");
  const linha = (nome: string) => page.getByRole("row").filter({ hasText: nome });
  await expect(linha("Souza & Mendes Advocacia")).toContainText("Ativo");
  await expect(linha("Souza & Mendes Advocacia")).toContainText("R$ 99,00 por mês");
  await expect(linha("Souza & Mendes Advocacia")).toContainText("120");
  await expect(linha("Souza & Mendes Advocacia")).toContainText("US$ 3,20");
  await expect(linha("Lima Advogados")).toContainText("Em teste");
  await expect(linha("Lima Advogados")).toContainText("Até 03/11 · 5 dias");
  await expect(linha("Lima Advogados")).toContainText("em avaliação");
  await expect(linha("Duarte Pinto")).toContainText("Só leitura");
  await expect(linha("Duarte Pinto")).toContainText("Acabou em 27/10");
  await expect(linha("Barros & Filhos")).toContainText("3 dias de atraso");
  await expect(page.getByText("Demonstração")).toHaveCount(0);
  await expect(page.getByText("Já Encerrado")).toHaveCount(0);
  expect(await sobraNaLateral(page)).toBe(0);
  expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
});

test("filtrar por situação e buscar pelo nome", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await page.getByRole("button", { name: /^Em teste/ }).click();
  await expect(page.getByRole("row", { name: /Lima Advogados/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Souza & Mendes/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Todos/ }).click();
  await page.getByRole("searchbox", { name: "Buscar escritório" }).fill("duarte");
  await expect(page.getByRole("row", { name: /Duarte Pinto/ })).toBeVisible();
  await expect(page.getByRole("row", { name: /Lima Advogados/ })).toHaveCount(0);
});

test("estender o teste pede os dias, confirma e vai para a auditoria com o motivo", async ({ page }) => {
  const api = operador().responder("POST /plataforma/escritorios/a0000000-0000-4000-8000-000000000002/acao", { ok: true, antes: "teste", depois: "teste" });
  await abrir(page, "/plataforma", api);
  await page.getByRole("button", { name: "Agir em Lima Advogados" }).click();
  const dialogo = page.getByRole("dialog", { name: "Agir em Lima Advogados" });
  await dialogo.getByLabel("Ação").selectOption("estender_teste");
  await dialogo.getByLabel("Quantos dias a mais").fill("10");
  await dialogo.getByLabel("Motivo (opcional)").fill("pediu mais uma semana");
  expect(api.mudancas()).toHaveLength(0);
  await dialogo.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Estender o teste: feito. Fica registrado em Ações registradas.")).toBeVisible();
  const [pedido] = api.mudancas("/plataforma/escritorios/a0000000-0000-4000-8000-000000000002/acao");
  expect(pedido!.corpo).toEqual({ acao: "estender_teste", dias: 10, motivo: "pediu mais uma semana" });
});

test("só as ações que valem aparecem para cada escritório", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await page.getByRole("button", { name: "Agir em Escritório Antigo" }).click();
  let opcoes = await page.getByLabel("Ação").locator("option").allTextContents();
  // Cortesia: não dá cortesia de novo, não estende teste que não tem, e reativar abre um teste novo.
  expect(opcoes).toEqual(["Pôr em só leitura", "Bloquear", "Reativar"]);
  // Reativar um escritório de cortesia passa a travá-lo no fim do teste: a tela avisa antes de confirmar.
  await page.getByLabel("Ação").selectOption("reativar");
  await expect(page.getByText("Este escritório é de cortesia e nunca é travado. Reativar abre um teste de 14 dias")).toBeVisible();
  await page.getByRole("button", { name: "Cancelar" }).click();
  await page.getByRole("button", { name: "Agir em Lima Advogados" }).click();
  opcoes = await page.getByLabel("Ação").locator("option").allTextContents();
  expect(opcoes).toEqual(["Liberar da avaliação", "Estender o teste", "Pôr em só leitura", "Bloquear", "Dar cortesia"]);
});

test("indicadores: MRR, conversão, cancelamentos, inadimplência, situações e o funil", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await page.getByRole("tab", { name: "Indicadores" }).click();
  const numeros = page.getByLabel("Indicadores");
  await expect(numeros).toContainText("R$ 198,00");
  await expect(numeros).toContainText("MRR");
  await expect(numeros).toContainText("50,0%");
  await expect(numeros).toContainText("Conversão do teste");
  await expect(numeros).toContainText("Cancelamento");
  await expect(numeros).toContainText("Escritório em atraso");
  await expect(page.getByRole("heading", { name: "Escritórios por situação" })).toBeVisible();
  await expect(page.getByText("Visitas ao site")).toBeVisible();
  await expect(page.getByText("15,0% do passo anterior")).toBeVisible();
  await expect(page.getByText("MRR em atraso")).toBeVisible();
  // O período se troca ali mesmo.
  await page.getByRole("radio", { name: "7 dias" }).click();
  await expect(page.getByText(/De 23\/10\/2026 a 29\/10\/2026/)).toBeVisible();
  expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
});

test("ações registradas: quem fez, em qual escritório, e o motivo", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await page.getByRole("tab", { name: "Ações registradas" }).click();
  const linha = page.locator(".dc-linhas__item", { hasText: "Estendeu o teste · Lima Advogados" });
  await expect(linha).toContainText("equipe@decreta.site");
  await expect(linha).toContainText("+7 dias");
  await expect(linha).toContainText("pediu mais uma semana");
  await expect(page.locator(".dc-linhas__item", { hasText: "Liberou da avaliação · Souza & Mendes Advocacia" })).toBeVisible();
});
