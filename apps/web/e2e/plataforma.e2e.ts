/**
 * O painel da plataforma (/plataforma): quem não é operador recebe 404 (a tela some), o operador sem a verificação
 * em duas etapas é mandado ligá-la, a visão geral junta o dinheiro, o que precisa de atenção e os gráficos, a lista
 * traz a conta e os totais (nunca o conteúdo do escritório), a ficha abre um escritório, as ações pedem confirmação e
 * vão para a auditoria, e as abas de pessoas, uso, IA e conversão mostram os números. A API é a de mentira de
 * e2e/apoio.ts.
 */
import { readFileSync } from "node:fs";
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

const LIMA = "a0000000-0000-4000-8000-000000000002";
const BARROS = "a0000000-0000-4000-8000-000000000004";
const dia = (n: number) => new Date(Date.UTC(2026, 9, 29 - n)).toISOString().slice(0, 10);

const VISAO = {
  hoje: "2026-10-29",
  cotacaoUsd: 5.5,
  numeros: {
    mrrCentavos: 19_800,
    arrCentavos: 237_600,
    pagantes: 2,
    emTeste: 1,
    cortesia: 1,
    ticketMedioCentavos: 9900,
    mrrNovoCentavos: 9900,
    mrrPerdidoCentavos: 0,
    mrrLiquidoCentavos: 9900,
    churnEscritorios: 0,
    churnReceita: 0,
    receitaRecebidaCentavos: 9900,
    receitaAReceberCentavos: 9900,
    ia30dUsd: 12.5,
    ia30dCentavos: 6875,
    iaDemonstracao30dUsd: 1.2,
    margemDaIa: 0.65,
    pessoas: 10,
    pessoasAtivas: { dia: 3, semana: 6, mes: 8 },
  },
  mrrPorMes: [
    { mes: "2026-08", mrrCentavos: 0, pagantes: 0 },
    { mes: "2026-09", mrrCentavos: 9900, pagantes: 1 },
    { mes: "2026-10", mrrCentavos: 19_800, pagantes: 2 },
  ],
  cadastrosPorSemana: Array.from({ length: 12 }, (_, i) => ({ semana: dia(3 + 7 * (11 - i)), cadastros: i % 3, assinaram: i === 11 ? 1 : 0 })),
  iaPorDia: Array.from({ length: 30 }, (_, i) => ({ dia: dia(29 - i), usd: (i % 5) * 0.2 })),
  porSituacao: { teste: 1, ativo: 1, inadimplente: 1, so_leitura: 1, bloqueado: 0, cancelado: 0, cortesia: 1 },
  atencao: [
    { tipo: "fatura_atrasada", organizationId: BARROS, escritorio: "Barros & Filhos", detalhe: "3 dias de atraso", gravidade: "alta" },
    { tipo: "ia_perto_do_teto", organizationId: null, escritorio: "Decreta inteiro", detalhe: "O site gastou 85% do teto de hoje; acima dele, a IA para nas telas", gravidade: "alta" },
    { tipo: "sem_oab", organizationId: LIMA, escritorio: "Lima Advogados", detalhe: "Cadastrou há 4 dias e ainda não informou a OAB", gravidade: "media" },
  ],
};

const pessoa = (o: Record<string, unknown>) => ({
  id: "p0000000-0000-4000-8000-000000000000",
  nome: "Pessoa",
  email: "pessoa@exemplo.adv.br",
  emailConfirmado: true,
  doisFatores: false,
  termosEmDia: true,
  criadaEm: "2026-10-01T12:00:00.000Z",
  sessoesAbertas: 1,
  escritorios: [{ id: LIMA, nome: "Lima Advogados", papel: "owner" }],
  ultimoAcesso: "2026-10-29",
  aparelho: "celular",
  demonstracao: false,
  ...o,
});

const PESSOAS = {
  pessoas: [
    pessoa({ id: "p0000000-0000-4000-8000-000000000001", nome: "Renata Duarte", email: "renata.duarte@exemplo.adv.br", doisFatores: true, sessoesAbertas: 2 }),
    pessoa({ id: "p0000000-0000-4000-8000-000000000002", nome: "Caio Esteves", email: "caio.esteves@exemplo.adv.br", emailConfirmado: false, ultimoAcesso: "2026-09-10", aparelho: "computador", escritorios: [{ id: BARROS, nome: "Barros & Filhos", papel: "member" }] }),
    pessoa({ id: "p0000000-0000-4000-8000-000000000003", nome: "Pessoa da demonstração", email: "demo@decreta.site", demonstracao: true }),
  ],
  numeros: { total: 2, ativas: { dia: 1, semana: 1, mes: 1 }, habito: 1, comDoisFatores: 1, noCelular: 1, termosAntigos: 0 },
};

const USO = {
  periodo: { de: "2026-09-30", ate: "2026-10-29", dias: 30 },
  escritoriosAtivos: 4,
  funcionalidades: [
    { chave: "prazos_confirmados", rotulo: "Prazos confirmados", grupo: "Prazos e publicações", escritorios: 3, adocao: 0.75, total: 120, porEscritorio: 40, totalAnterior: 100, variacao: 0.2 },
    { chave: "pecas", rotulo: "Peças geradas", grupo: "Peças e IA", escritorios: 1, adocao: 0.25, total: 6, porEscritorio: 6, totalAnterior: 0, variacao: null },
  ],
  qualidade: { prazosConfirmados: 120, prazosComDataDigitada: 6, contaAceita: 0.95, retornosUteis: 9, retornosErrados: 1, util: 0.9 },
};

const IA = {
  periodo: { de: "2026-09-30", ate: "2026-10-29", dias: 30 },
  cotacaoUsd: 5.5,
  totalUsd: 12.5,
  totalCentavos: 6875,
  estimadoUsd: 0,
  hojeUsd: 0.4,
  tetoSiteUsd: 8,
  demonstracaoUsd: 1.2,
  fundoUsd: 5,
  telaUsd: 7.5,
  mensagens: 40,
  porPaganteUsd: 4.1,
  dias: Array.from({ length: 30 }, (_, i) => ({ dia: dia(29 - i), usd: 0.4, fundoUsd: 0.15 })),
  porMetodo: [
    { metodo: "gerar-documento", rotulo: "Gerar peça", usd: 6, chamadas: 20, mensagens: 0 },
    { metodo: "sugerir-prazo", rotulo: "Sugerir prazo", usd: 5, chamadas: 300, mensagens: 0 },
  ],
  porEscritorio: [{ organizationId: "a0000000-0000-4000-8000-000000000001", nome: "Souza & Mendes Advocacia", situacao: "ativo", demonstracao: false, usd: 8.2, centavos: 4510, valorMensalCentavos: 9900, sobreAMensalidade: 0.4556 }],
};

const FICHA = {
  escritorio: ESCRITORIOS[1],
  fuso: "America/Sao_Paulo",
  totais: { processos: 7, clientes: 6, publicacoes: 12, prazosAbertos: 2, pecas: 1, documentos: 9, espacoBytes: 3_400_000, conversas: 2, oabs: 0 },
  pessoas: [{ id: "p0000000-0000-4000-8000-000000000001", nome: "Renata Duarte", email: "renata.duarte@exemplo.adv.br", papel: "owner", doisFatores: true, emailConfirmado: true, ultimoAcesso: "2026-10-29", aparelho: "celular" }],
  ativasNaSemana: 1,
  marcos: [
    { nome: "cadastro_concluido", rotulo: "Cadastro concluído", em: "2026-10-20T12:00:00.000Z" },
    { nome: "oab_cadastrada", rotulo: "OAB cadastrada", em: null },
    { nome: "primeira_publicacao", rotulo: "Primeira publicação", em: null },
    { nome: "primeiro_prazo_confirmado", rotulo: "Primeiro prazo confirmado", em: null },
    { nome: "assinou", rotulo: "Primeira mensalidade paga", em: null },
  ],
  faturas: [],
  uso: [{ chave: "processos", rotulo: "Processos cadastrados", grupo: "Cadastro", total: 7 }],
  ia: { totalUsd: 0.1, hojeUsd: 0.02, dias: Array.from({ length: 30 }, (_, i) => ({ dia: dia(29 - i), usd: i === 29 ? 0.02 : 0 })), porMetodo: [{ metodo: "perguntar", rotulo: "Perguntar", usd: 0.1 }] },
  captura: { ultimaEm: null, errosNaSemana: 0, ultimoErro: null },
  acoes: [AUDITORIA.itens[0]],
};

/** O operador: o /eu traz `plataforma` e a API do painel responde. */

function operador() {
  return new ApiFalsa()
    .responder("/eu", { ...amostras.eu!.corpo, plataforma: true })
    .responder("GET /plataforma/escritorios", { escritorios: ESCRITORIOS })
    .responder("/plataforma/indicadores?dias=30", INDICADORES)
    .responder("/plataforma/indicadores?dias=7", { ...INDICADORES, periodo: { ...INDICADORES.periodo, de: "2026-10-23", dias: 7 } })
    .responder("GET /plataforma/auditoria", AUDITORIA)
    .responder("GET /plataforma/visao-geral", VISAO)
    .responder("GET /plataforma/pessoas", PESSOAS)
    .responder("/plataforma/uso?dias=30", USO)
    .responder("/plataforma/ia?dias=30", IA)
    .responder(`GET /plataforma/escritorios/${LIMA}`, FICHA);
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
  await abrir(page, "/plataforma?aba=escritorios", operador());
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
  await abrir(page, "/plataforma?aba=escritorios", operador());
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
  await abrir(page, "/plataforma?aba=escritorios", api);
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
  await abrir(page, "/plataforma?aba=escritorios", operador());
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

test("conversão: MRR, conversão, cancelamentos, inadimplência, situações e o funil", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  await page.getByRole("tab", { name: "Conversão" }).click();
  const numeros = page.getByLabel("Indicadores");
  await expect(numeros).toContainText("R$ 198,00");
  await expect(numeros).toContainText("MRR");
  await expect(numeros).toContainText("50,0%");
  await expect(numeros).toContainText("1 de 2 que terminaram");
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

test("o operador sem a verificação em duas etapas é mandado ligá-la em Minha conta, e nada da plataforma aparece", async ({ page }) => {
  const api = new ApiFalsa()
    .responder("/eu", { ...amostras.eu!.corpo, plataforma: true })
    .responder("GET /plataforma/escritorios", { erro: "plataforma_2fa", detalhe: "Para abrir o painel da plataforma, ligue a verificação em duas etapas em Minha conta." }, 403)
    .responder("GET /plataforma/visao-geral", { erro: "plataforma_2fa" }, 403);
  await abrir(page, "/plataforma", api);
  await expect(page.getByRole("heading", { name: "Ligue a verificação em duas etapas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ligar em Minha conta" })).toHaveAttribute("href", "/conta");
  await expect(page.getByText("Souza & Mendes Advocacia")).toHaveCount(0);
});

test("visão geral: o dinheiro, o que precisa de atenção hoje e os gráficos com a dica de cada coluna", async ({ page }) => {
  await abrir(page, "/plataforma", operador());
  const numeros = page.getByLabel("Números do negócio");
  await expect(numeros).toContainText("MRR");
  await expect(numeros).toContainText("R$ 198");
  await expect(numeros).toContainText("ARR R$ 2.376");
  await expect(numeros).toContainText("R$ 99,00 em média");
  await expect(numeros).toContainText("65,0%");
  // O que precisa de atenção: o atraso primeiro, com o que fazer, e o link para a ficha.
  const atraso = page.locator(".dc-linhas__item", { hasText: "Fatura em atraso · Barros & Filhos" });
  await expect(atraso).toContainText("3 dias de atraso. Reenviar a cobrança antes do 7º dia");
  await expect(atraso).toContainText("Urgente");
  await expect(atraso.getByRole("link", { name: "Abrir Barros & Filhos" })).toHaveAttribute("href", `/plataforma/escritorios/${BARROS}`);
  await expect(page.locator(".dc-linhas__item", { hasText: "Sem OAB cadastrada · Lima Advogados" })).not.toContainText("Urgente");
  await expect(page.locator(".dc-linhas__item", { hasText: "IA perto do teto do dia · Decreta inteiro" }).getByRole("button", { name: "Ver a IA" })).toBeVisible();
  // A dica da coluna: passar o mouse no mês de agora.
  const mrr = page.getByRole("group", { name: "MRR por mês" });
  await mrr.locator("rect.dc-colunas-grafico__alvo").last().hover();
  await expect(mrr.locator(".dc-colunas-grafico__dica")).toContainText("outubro de 2026, até hoje");
  await expect(mrr.locator(".dc-colunas-grafico__dica")).toContainText("R$ 198,00");
  await expect(mrr.locator(".dc-colunas-grafico__dica")).toContainText("2 pagantes");
  // As colunas são finas: até 24 px.
  const larguras = await mrr.locator("path.dc-colunas-grafico__barra").evaluateAll((els) => els.map((e) => (e as SVGGraphicsElement).getBBox().width));
  expect(larguras.length).toBe(2);
  expect(Math.max(...larguras)).toBeLessThanOrEqual(24);
  await expect(page.getByRole("group", { name: "Cadastros por semana" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Gasto de IA por dia, em dólar" })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
  expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
});

test("a ficha do escritório: a conta, os primeiros passos, as pessoas e os totais, sem nada do conteúdo", async ({ page }) => {
  await abrir(page, "/plataforma?aba=escritorios", operador());
  await page.getByRole("link", { name: /Lima Advogados/ }).click();
  await expect(page).toHaveURL(new RegExp(`/plataforma/escritorios/${LIMA}$`));
  await expect(page.getByRole("heading", { level: 1, name: "Lima Advogados" })).toBeVisible();
  const totais = page.getByLabel("Totais do escritório");
  await expect(totais).toContainText("Processos");
  await expect(totais).toContainText("0 OABs monitoradas");
  await expect(page.locator(".dc-passos li", { hasText: "Cadastro concluído" })).toContainText("20/10");
  await expect(page.locator(".dc-passos li", { hasText: "OAB cadastrada" })).toContainText("ainda não");
  await expect(page.getByRole("row", { name: /Renata Duarte/ })).toContainText("Sócio");
  await expect(page.getByText("Estendeu o teste")).toBeVisible();
  await expect(page.getByText("Clientes, processos, publicações, documentos, peças e conversas do escritório não aparecem")).toBeVisible();
  // Agir na ficha abre o mesmo diálogo da lista.
  await page.getByRole("button", { name: "Agir", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Agir em Lima Advogados" })).toBeVisible();
  expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
});

test("pessoas: os filtros, sem a demonstração, e encerrar as sessões vai para a auditoria", async ({ page }) => {
  const api = operador().responder("POST /plataforma/pessoas/p0000000-0000-4000-8000-000000000001/acao", { ok: true, sessoesEncerradas: 2 });
  await abrir(page, "/plataforma?aba=pessoas", api);
  await expect(page.getByLabel("Números das pessoas")).toContainText("Com duas etapas");
  await expect(page.getByRole("row", { name: /Renata Duarte/ })).toContainText("Duas etapas");
  await expect(page.getByText("Pessoa da demonstração")).toHaveCount(0);
  await page.getByRole("button", { name: /^E-mail não confirmado/ }).click();
  await expect(page.getByRole("row", { name: /Caio Esteves/ })).toContainText("E-mail sem confirmar");
  await expect(page.getByRole("row", { name: /Renata Duarte/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^Todas/ }).click();
  await page.getByRole("button", { name: "Agir em Renata Duarte" }).click();
  const dialogo = page.getByRole("dialog", { name: "Agir em Renata Duarte" });
  // Com o e-mail confirmado, reenviar a confirmação não aparece.
  expect(await dialogo.getByLabel("Ação").locator("option").allTextContents()).toEqual(["Mandar link de nova senha", "Encerrar as sessões"]);
  await dialogo.getByLabel("Ação").selectOption("encerrar_sessoes");
  await dialogo.getByLabel("Motivo (opcional)").fill("perdeu o celular");
  await dialogo.getByRole("button", { name: "Confirmar" }).click();
  await expect(page.getByText("Sessões encerradas (2). Fica registrado em Ações registradas.")).toBeVisible();
  const [pedido] = api.mudancas("/plataforma/pessoas/p0000000-0000-4000-8000-000000000001/acao");
  expect(pedido!.corpo).toEqual({ acao: "encerrar_sessoes", motivo: "perdeu o celular" });
});

test("uso e IA: adoção, qualidade, custo por ação e por escritório", async ({ page }) => {
  await abrir(page, "/plataforma?aba=uso", operador());
  await expect(page.getByLabel("Qualidade da IA")).toContainText("95,0%");
  const prazos = page.getByRole("row", { name: /Prazos confirmados/ });
  await expect(prazos).toContainText("75%");
  await expect(prazos).toContainText("+20%");
  await page.getByRole("tab", { name: "IA" }).click();
  await expect(page.getByLabel("Custo da IA")).toContainText("US$ 12,50");
  await expect(page.getByLabel("Custo da IA")).toContainText("5% do teto de US$ 8,00");
  await expect(page.getByRole("row", { name: /Gerar peça/ })).toContainText("48,0%");
  await expect(page.getByRole("row", { name: /Souza & Mendes Advocacia/ })).toContainText("45,6%");
  expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
});

test("exportar a lista de escritórios numa planilha", async ({ page }) => {
  await abrir(page, "/plataforma?aba=escritorios", operador());
  const [baixado] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Exportar planilha" }).click()]);
  expect(baixado.suggestedFilename()).toMatch(/^escritorios-decreta-\d{4}-\d{2}-\d{2}\.csv$/);
  const texto = readFileSync(await baixado.path(), "utf8");
  expect(texto.startsWith("﻿Escritório;Endereço;Situação")).toBe(true);
  expect(texto).toContain("Souza & Mendes Advocacia;souza-mendes;Ativo");
  expect(texto).not.toContain("Demonstração;demonstracao");
});
