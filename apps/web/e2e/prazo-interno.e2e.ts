/**
 * Prazo interno nas telas: o sócio escolhe em Configurações, e a data, sempre com
 * a regra à vista, aparece na ficha do prazo, em Hoje e na Agenda.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const prazo = amostras.prazo!.corpo;
const REGRA = "2 dias úteis antes do fatal, sem contar 20/11/2026 (Consciência Negra)";
const interno = { dia: "2026-11-19", fatal: "2026-11-24", antecedencia: 2, regra: REGRA, passou: false, aviso: null };
const AVISO = "Já passou: o interno era 28/10/2026. Não cabem mais 2 dias úteis antes do fatal de 03/11/2026.";

test.describe("configurações", () => {
  const escritorio = amostras.escritorio!.corpo;
  const painelDoInterno = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Prazo interno" }) });

  test("o sócio liga e vê a regra", async ({ page }) => {
    const api = await abrir(page, "/configuracoes?aba=calendario", new ApiFalsa().responder("/escritorio", { ...escritorio, prazoInternoDias: 0 }));
    const painel = painelDoInterno(page);
    await expect(painel.getByText("Sem prazo interno: só a data fatal aparece.")).toBeVisible();
    await expect(painel.getByText(/Sempre em dia útil e antes do fatal/)).toBeVisible();
    await painel.getByLabel("Antecedência").selectOption("2");
    await expect.poll(() => api.mudancas("/escritorio").at(-1)?.corpo).toEqual({ prazoInternoDias: 2 });
  });

  test("ligado, mostra um exemplo contado no calendário do tribunal", async ({ page }) => {
    await abrir(page, "/configuracoes?aba=calendario", new ApiFalsa().responder("/escritorio", { ...escritorio, prazoInternoDias: 2 }));
    // Hoje é 29/10/2026: o exemplo vence em 18/11, e dois dias úteis antes é 16/11.
    await expect(painelDoInterno(page).getByText("Um prazo que vence em 18/11/2026 fica com o interno em 16/11/2026.")).toBeVisible();
    await expect(page.getByLabel("Antecedência")).toHaveValue("2");
  });

  test("quem não é sócio vê como está, sem poder mudar", async ({ page }) => {
    const eu = amostras.eu!.corpo;
    const escritorio = amostras.escritorio!.corpo;
    await abrir(page, "/configuracoes?aba=calendario", new ApiFalsa().responder("/eu", { ...eu, usuario: { ...eu.usuario, papel: "member" } }).responder("/escritorio", { ...escritorio, prazoInternoDias: 3 }));
    const campo = page.getByLabel("Antecedência");
    await expect(campo).toBeDisabled();
    await expect(campo).toHaveValue("3");
  });
});

test.describe("na ficha do prazo", () => {
  test("mostra a data do interno com a regra", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}`, { ...prazo, interno }));
    const linha = page.locator(".dc-dados dd").filter({ hasText: REGRA });
    await expect(linha).toContainText("19/11/2026");
    await expect(page.locator(".dc-dados dt", { hasText: "Prazo interno" })).toBeVisible();
  });

  test("prazo muito curto: diz que o interno ficou antes de hoje", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}`, { ...prazo, interno: { ...interno, dia: "2026-10-28", passou: true, aviso: AVISO } }));
    await expect(page.getByText(AVISO)).toBeVisible();
  });

  test("sem prazo interno configurado, nada muda", async ({ page }) => {
    await abrir(page, `/prazos/${ids.prazo}`, new ApiFalsa().responder(`/prazos/${ids.prazo}`, { ...prazo, interno: null }));
    await expect(page.getByRole("heading", { name: "A conta" })).toBeVisible();
    await expect(page.locator(".dc-dados dt", { hasText: "Prazo interno" })).toHaveCount(0);
  });
});

const painel = amostras.hoje!.corpo;
const itemDoInterno = { tipo: "prazo", id: ids.prazo, urgencia: "breve", quando: "Interno hoje", titulo: "Contestação da Alfa", detalhe: "Marina Duarte × Alfa · 2ª Vara Cível", cnj: "5004321-25.2026.8.24.0038", processoId: ids.processo, responsavel: null, aConfirmar: false, interno: { fatal: "2026-11-24", regra: REGRA, aviso: null } };

test.describe("em Hoje", () => {
  test("no computador: o selo diz que é o interno e a segunda linha traz o fatal", async ({ page }) => {
    await abrir(page, "/hoje", new ApiFalsa().responder("/hoje", { ...painel, itens: [itemDoInterno, ...painel.itens] }));
    const linha = page.locator(".dc-tabela tbody tr").filter({ hasText: "Contestação da Alfa" });
    await expect(linha.getByText("Interno hoje")).toBeVisible();
    await expect(linha.getByText(/Fatal 24\/11/)).toBeVisible();
    await expect(linha.locator("[title]").filter({ hasText: "Interno hoje" })).toHaveAttribute("title", new RegExp(REGRA.replace(/[()]/g, "\\$&")));
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    test("o cartão também", async ({ page }) => {
      await abrir(page, "/hoje", new ApiFalsa().responder("/hoje", { ...painel, itens: [itemDoInterno, ...painel.itens] }));
      const cartao = page.locator(".dc-item").filter({ hasText: "Contestação da Alfa" });
      await expect(cartao.getByText("Interno hoje")).toBeVisible();
      await expect(cartao.getByText(/Fatal 24\/11/)).toBeVisible();
      expect(await sobraNaLateral(page)).toBe(0);
    });
  });
});

test.describe("na Agenda", () => {
  const agenda = amostras.agenda!.corpo;
  const itemDaAgenda = { tipo: "prazo", id: ids.prazo, titulo: "Contestação da Alfa", urgencia: "breve", processo: { id: ids.processo, titulo: "Marina Duarte × Alfa", cnj: null }, responsavel: null, aConfirmar: false, interno: { fatal: "2026-11-24", regra: REGRA, aviso: null } };
  const comInterno = () => new ApiFalsa().responder("/agenda", { ...agenda, dias: [{ dia: agenda.hoje, itens: [itemDaAgenda] }] });

  for (const [vista, seletor] of [["semana", ".dc-evento"], ["lista", ".dc-linhas__item"]] as const) {
    test(`na ${vista}: o dia do interno traz a marca e o fatal`, async ({ page }) => {
      await abrir(page, `/agenda?vista=${vista}`, comInterno());
      const item = page.locator(seletor).filter({ hasText: "Contestação da Alfa" });
      await expect(item.getByText("Interno", { exact: true })).toBeVisible();
      await expect(item.getByText(/Fatal 24\/11/)).toBeVisible();
    });
  }

  test("no mês: o rótulo diz que é o interno", async ({ page }) => {
    await abrir(page, "/agenda?vista=mes", comInterno());
    await expect(page.locator(".dc-marca").filter({ hasText: "Interno: Contestação da Alfa" })).toBeVisible();
  });

  test("o resumo do período não conta o interno como mais um prazo", async ({ page }) => {
    await abrir(page, "/agenda?vista=semana", comInterno());
    await expect(page.locator(".dc-cabecalho .dc-sub")).toHaveText("Nada marcado neste período");
  });
});
