/**
 * Estado vazio que ensina: cada tela vazia diz para que serve e oferece a primeira ação. "Nunca houve dado" e "o
 * filtro não achou" são dois casos, e quem não pode criar não vê o botão de criar.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

const vazio = (page: Page) => page.locator(".dc-vazio");
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: 30 };
const eu = amostras.eu!.corpo;

/** Escritório recém-criado: nada em nenhum menu. */
const euNovo = { ...eu, menu: { prazos: 0, prazosHoje: 0, publicacoes: 0, processos: 0, clientes: 0, negocios: 0, alvaras: 0, financeiro: 0 } };
const euMembro = { ...euNovo, usuario: { ...eu.usuario, papel: "member", financeiro: false } };
/** Fim do teste ou fatura em atraso: dá para ver tudo, mas não salvar nada novo. */
const euSoLeitura = { ...euNovo, assinatura: { situacao: "so_leitura", acesso: "leitura", aviso: null } };

const LISTA_DE_PRAZOS_VAZIA = { hoje: amostras.prazos!.corpo.hoje, chips: { abertos: 0, hoje: 0, semana: 0, vencidos: 0, cumpridos: 0 }, responsaveis: [], itens: [] };
const PAINEL_VAZIO = {
  ...amostras.hoje!.corpo,
  itens: [],
  publicacoes: [],
  porResponsavel: [],
  auditoria: null,
  alertasDaCaptura: [],
  contadores: { ...amostras.hoje!.corpo.contadores, vencemHoje: 0, vencidos: 0, publicacoesNovas: 0, publicacoesComPrazo: 0, publicacoesSemLeitura: 0, audienciasHoje: 0, alvarasAguardando: 0 },
};

/** Os seis tamanhos da escala, no computador; no celular os campos têm 16 e nada abaixo de 12. */
async function naEscala(page: Page, escala: number[]) {
  const fora = await vazio(page).evaluateAll(
    (caixas, e) => {
      const achados: string[] = [];
      for (const c of caixas) for (const el of [c, ...c.querySelectorAll("*")]) if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) if (!e.includes(Number.parseFloat(getComputedStyle(el).fontSize))) achados.push(el.textContent!.slice(0, 40));
      return achados;
    },
    escala,
  );
  expect(fora).toEqual([]);
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test.describe("Processos", () => {
    test("nunca houve processo: explica e abre o cadastro, como o atalho do /comecar", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos", api);
      await expect(vazio(page).getByText("Nenhum processo ainda")).toBeVisible();
      await expect(vazio(page).getByText(/o Decreta busca as partes, a classe e os andamentos/)).toBeVisible();
      await naEscala(page, [11, 12, 13, 14, 15, 20]);
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("a busca não achou: diz com o que buscou e limpa, sem falar em cadastrar o primeiro", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos?busca=sem-resultado", api);
      await expect(vazio(page).getByText("Nenhum processo com “sem-resultado”")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page).toHaveURL(/\/processos$/);
      await expect(page.getByRole("searchbox", { name: "Buscar processo" })).toHaveValue("");
    });

    test("filtro de arquivados sem nada: não é o escritório vazio, e volta para os ativos", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos?situacao=arquivados", api);
      await expect(vazio(page).getByText("Nenhum processo arquivado")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Ver os ativos" }).click();
      await expect(page).toHaveURL(/\/processos$/);
    });

    test("escritório só para leitura: nenhum botão de criar, e o texto diz por quê", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euSoLeitura).responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos", api);
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Cadastrar|Novo processo/ })).toHaveCount(0);
    });
  });

  test.describe("Clientes", () => {
    test("nunca houve cliente: explica e oferece o cadastro", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /clientes", PAGINA_VAZIA);
      await abrir(page, "/clientes", api);
      await expect(vazio(page).getByText("Nenhum cliente ainda")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro cliente" }).click();
      await expect(page.getByRole("dialog", { name: "Novo cliente" })).toBeVisible();
    });

    test("a busca não achou: limpa", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /clientes", PAGINA_VAZIA);
      await abrir(page, "/clientes?busca=fulano", api);
      await expect(vazio(page).getByText("Nenhum cliente com “fulano”")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page).toHaveURL(/\/clientes$/);
    });
  });

  test.describe("Prazos", () => {
    test("escritório sem processo: leva a cadastrar, porque prazo mora em processo", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /prazos", LISTA_DE_PRAZOS_VAZIA);
      await abrir(page, "/prazos", api);
      await expect(vazio(page).getByText("Nenhum prazo ainda")).toBeVisible();
      await expect(vazio(page).getByText(/nascem das publicações do DJEN/)).toBeVisible();
      await vazio(page).getByRole("link", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("com processo e sem prazo nenhum: a primeira ação é criar o prazo", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", LISTA_DE_PRAZOS_VAZIA).responder("POST /prazos/calcular", { fim: "2026-11-24", explicacao: "15 dias úteis.", calendarioCompleto: true });
      await abrir(page, "/prazos", api);
      await vazio(page).getByRole("button", { name: "Novo prazo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo prazo" })).toBeVisible();
    });

    test("todos cumpridos: não diz que nunca houve, e leva aos cumpridos", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, cumpridos: 3 } });
      await abrir(page, "/prazos", api);
      await expect(vazio(page).getByText("Nenhum prazo em aberto")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver os cumpridos" }).click();
      await expect(page).toHaveURL(/quando=cumpridos/);
    });

    test("filtro de vencidos sem nada: diz quantos há em aberto e volta para eles", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
      await abrir(page, "/prazos?quando=vencidos", api);
      await expect(vazio(page).getByText("Nenhum prazo vencido")).toBeVisible();
      await expect(vazio(page).getByText(/4 em aberto/)).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver os em aberto" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });

    test("filtro por pessoa sem nada: limpa o filtro", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
      await abrir(page, `/prazos?responsavel=${eu.usuario.id}`, api);
      await expect(vazio(page).getByText("Nenhum prazo com esse responsável")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar o filtro" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });
  });

  test.describe("Hoje", () => {
    test("escritório novo: explica o dia e oferece o primeiro processo", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(vazio(page).getByText("Aqui fica o trabalho de cada dia")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("dia sem nada, mas com escritório em uso: não fala em cadastrar, leva aos próximos prazos", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(vazio(page).getByText("Nada para hoje")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("link", { name: "Ver os próximos prazos" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });

    test("o filtro do dia não achou: diz isso e volta para tudo", async ({ page }) => {
      const soPrazos = amostras.hoje!.corpo.itens.filter((i: { tipo: string }) => i.tipo === "prazo");
      const api = new ApiFalsa().responder("/hoje", { ...amostras.hoje!.corpo, itens: soPrazos });
      await abrir(page, "/hoje", api);
      await page.getByRole("button", { name: /^Tarefas/ }).click();
      await expect(vazio(page).getByText("Nenhuma tarefa para hoje")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver tudo" }).click();
      await expect(vazio(page)).toHaveCount(0);
    });

    test("sem ninguém com prazo aberto, o quadro por responsável explica em vez de ficar em branco", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(page.getByText("A carga de cada pessoa aparece aqui quando houver prazo aberto.")).toBeVisible();
    });
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Processos: explica, oferece o cadastro e não rola para o lado", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /processos", PAGINA_VAZIA);
    await abrir(page, "/processos", api);
    await expect(vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" })).toBeVisible();
    await naEscala(page, [12, 13, 14, 15, 16, 20]);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("Prazos, com filtro: mesmo texto do computador", async ({ page }) => {
    const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
    await abrir(page, "/prazos?quando=vencidos", api);
    await expect(vazio(page).getByText("Nenhum prazo vencido")).toBeVisible();
    await vazio(page).getByRole("button", { name: "Ver os em aberto" }).tap();
    await expect(page).toHaveURL(/\/prazos$/);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("Hoje: escritório novo", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euNovo).responder("/hoje", PAINEL_VAZIO);
    await abrir(page, "/hoje", api);
    await expect(vazio(page).getByText("Aqui fica o trabalho de cada dia")).toBeVisible();
    await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).tap();
    await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
  });

  test("Clientes: a equipe também cadastra, sem depender de sócio", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euMembro).responder("GET /clientes", PAGINA_VAZIA);
    await abrir(page, "/clientes", api);
    await expect(vazio(page).getByRole("button", { name: "Cadastrar o primeiro cliente" })).toBeVisible();
  });
});
