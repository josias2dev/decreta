/**
 * Perguntar: as conversas com a IA. As conversas de exemplo são da Beatriz
 * com a IA de mentira, sobre a demonstração (apps/api/test/amostras.ts); a
 * resposta nova chega aos poucos, uma linha JSON por acontecimento.
 */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

const comIa = () => new ApiFalsa().responder("/eu", euComIa);
const prazoDa = (tipo: string) => (amostras.prazos!.corpo.itens as { id: string; tipo: string }[]).find((p) => p.tipo === tipo)!.id;

test.describe("no computador", () => {
  test("conversa nova: saudação, sugestões e o histórico por dia", async ({ page }) => {
    await abrir(page, "/perguntar", comIa());
    await expect(page.getByRole("heading", { name: "Bom dia, Beatriz" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prazos da semana/ })).toBeVisible();
    const historico = page.getByRole("navigation", { name: "Conversas" });
    for (const grupo of ["Fixadas", "Hoje", "Ontem", "Últimos 7 dias"]) await expect(historico.getByRole("heading", { name: grupo })).toBeVisible();
    await expect(historico.getByRole("link", { name: "Prazos desta semana" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Pergunta" })).toBeFocused();
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("a pergunta vai, a resposta chega com o cartão e a conversa ganha nome", async ({ page }) => {
    const api = await abrir(page, "/perguntar", comIa());
    await page.getByRole("textbox", { name: "Pergunta" }).fill("Como está o meu dia?");
    await page.keyboard.press("Enter");
    await expect.poll(() => api.mudancas("/ia/perguntar")[0]?.corpo).toMatchObject({ texto: "Como está o meu dia?", modo: "pergunte" });
    await expect(page).toHaveURL(new RegExp(`/perguntar/${ids.conversaNova}$`));
    await expect(page.getByText("Dos seus 16 prazos abertos, nenhum está atrasado.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "O escritório agora" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Resumo do dia" })).toBeVisible();
  });

  test("a IA fora do ar: o erro aparece e dá para tentar de novo", async ({ page }) => {
    const api = comIa().responder("POST /ia/perguntar", { erro: "ia_indisponivel", detalhe: "A IA não respondeu agora." }, 503);
    await abrir(page, "/perguntar", api);
    await page.getByRole("button", { name: /Contar um prazo/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "A IA não respondeu agora." })).toBeVisible();
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await expect.poll(() => api.mudancas("/ia/perguntar").length).toBe(2);
  });

  test("cartão de prazos: marcar cumprido e os links da resposta abrem as telas", async ({ page }) => {
    const api = await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
    await expect(page.getByRole("heading", { level: 1, name: "Prazos desta semana" })).toBeVisible();
    const contestacao = prazoDa("Contestação trabalhista");
    await page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" }).click();
    await expect.poll(() => api.mudancas(`/prazos/${contestacao}/cumprir`).length).toBe(1);
    await expect(page.getByRole("button", { name: "Desfazer: Contestação trabalhista" })).toBeVisible();
    await page.getByRole("link", { name: "réplica da Ana Lúcia Ferraz" }).click();
    await expect(page).toHaveURL(new RegExp(`/prazos/${prazoDa("Réplica à contestação")}$`));
  });

  test("tarefa proposta: só vira tarefa quando a pessoa cria", async ({ page }) => {
    const api = await abrir(page, `/perguntar/${ids.conversaProcesso}`, comIa());
    const cartao = page.locator(".dc-cartao-ia--tarefa");
    await expect(cartao.getByText("Ligar para a Marina sobre o laudo")).toBeVisible();
    expect(api.mudancas()).toHaveLength(0);
    await cartao.getByRole("button", { name: "Criar tarefa" }).click();
    await expect.poll(() => api.mudancas(`/ia/conversas/${ids.conversaProcesso}/tarefa`)[0]?.corpo).toMatchObject({ ferramentaId: expect.any(String), mensagemId: expect.any(String) });
    await expect(cartao.getByRole("link", { name: "Ver na agenda" })).toBeVisible();
  });

  test("histórico: renomear e apagar pelo menu da conversa", async ({ page }) => {
    const api = await abrir(page, `/perguntar/${ids.conversaProcesso}`, comIa());
    const historico = page.getByRole("navigation", { name: "Conversas" });
    await historico.getByRole("button", { name: "Opções de Processo da Marina Duarte" }).click();
    await page.getByRole("menuitem", { name: "Renomear" }).click();
    const nome = historico.getByRole("textbox", { name: "Nome da conversa" });
    await nome.fill("Laudo da Marina");
    await nome.press("Enter");
    await expect.poll(() => api.mudancas(`/ia/conversas/${ids.conversaProcesso}`)[0]?.corpo).toEqual({ titulo: "Laudo da Marina" });
    await historico.getByRole("button", { name: "Opções de Processo da Marina Duarte" }).click();
    await page.getByRole("menuitem", { name: "Apagar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Apagar" }).click();
    await expect.poll(() => api.mudancas(`/ia/conversas/${ids.conversaProcesso}`).map((p) => p.metodo)).toEqual(["PATCH", "DELETE"]);
    await expect(page).toHaveURL(/\/perguntar$/);
  });

  test("tela larga: o que a IA consultou fica ao lado", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await abrir(page, `/perguntar/${ids.conversaProcesso}`, comIa());
    const lado = page.getByRole("complementary", { name: "Nesta conversa" });
    await expect(lado.getByText("Marina Duarte × Seguradora Alfa S.A.").first()).toBeVisible();
    await expect(lado.getByText("Manifestação sobre laudo pericial")).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("tela larga: sem nada consultado, o painel ao lado não aparece", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await abrir(page, `/perguntar/${ids.conversaJurisprudencia}`, comIa());
    await expect(page.getByRole("heading", { level: 1, name: "Negativa de cirurgia e dano moral" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Nesta conversa" })).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("conversa nova: sugestões e recentes cabem, o campo fica embaixo", async ({ page }) => {
    await abrir(page, "/perguntar", comIa());
    await expect(page.getByRole("heading", { name: "Bom dia, Beatriz" })).toBeInViewport();
    await expect(page.getByRole("link", { name: /Processo da Marina Duarte/ })).toBeInViewport();
    await expect(page.getByRole("textbox", { name: "Pergunta" })).toBeInViewport();
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("conversa aberta: cartões dentro da tela e as conversas na gaveta", async ({ page }) => {
    await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Pergunta" })).toBeInViewport();
    expect(await sobraNaLateral(page)).toBe(0);
    await page.getByRole("button", { name: "Conversas" }).tap();
    const gaveta = page.getByRole("dialog", { name: "Conversas" });
    await gaveta.getByRole("link", { name: "Processo da Marina Duarte" }).tap();
    await expect(page).toHaveURL(new RegExp(`/perguntar/${ids.conversaProcesso}$`));
    await expect(gaveta).toBeHidden();
    await expect(page.getByRole("button", { name: "Criar tarefa" })).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });
});
