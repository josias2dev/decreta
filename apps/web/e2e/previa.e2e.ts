/**
 * A prévia clicável (bun run web:previa): o Perguntar responde com a IA de
 * mentira dela, aos poucos, e o Parar corta a resposta. Roda só quando o
 * arquivo da prévia já foi gerado.
 */
import { existsSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const ARQUIVO = new URL("../dist-previa/decreta-previa.html", import.meta.url);
const ENDERECO = "http://previa.decreta.test/";

async function abrirPrevia(page: Page, hash: string) {
  const html = readFileSync(ARQUIVO, "utf8");
  await page.route(`${ENDERECO}**`, (r) => r.fulfill({ status: 200, contentType: "text/html", body: html }));
  await page.goto(`${ENDERECO}#${hash}`);
}

/** Quantas vezes o texto da resposta mudou de tamanho, durante `ms` (a resposta chegando aos poucos). */
function vezesQueOTextoCresceu(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<number>((ok) => {
        let vezes = 0;
        let antes = -1;
        const fim = performance.now() + ms;
        const olhar = () => {
          const t = document.querySelector(".dc-chat__resposta:last-of-type .dc-md")?.textContent?.length ?? 0;
          if (t !== antes && t > 0) vezes++;
          antes = t;
          if (performance.now() < fim) requestAnimationFrame(olhar);
          else ok(vezes);
        };
        requestAnimationFrame(olhar);
      }),
    ms,
  );
}

test.describe("a prévia", () => {
  test.skip(!existsSync(ARQUIVO), "rode bun run web:previa antes");

  test("o Perguntar responde aos poucos, com a consulta e o cartão, e a conversa fica no histórico", async ({ page }) => {
    await abrirPrevia(page, "/perguntar");
    await expect(page.getByRole("heading", { name: /Beatriz/ })).toBeVisible();
    await expect(page.getByText("A IA ainda não está ligada")).toHaveCount(0);
    await page.getByRole("button", { name: /Prazos da semana/ }).click();
    await expect(page.locator(".dc-chat__pensando")).toBeVisible();
    await expect(page.locator(".dc-passo.is-lendo")).toHaveText("Buscando prazos…");
    await expect(page.getByRole("button", { name: "Parar a resposta" })).toBeVisible();
    await expect(page.locator(".dc-chat__resposta .dc-md").last()).toBeVisible();
    expect(await vezesQueOTextoCresceu(page, 1000)).toBeGreaterThan(5);
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Prazos", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Prazos dos próximos 7 dias" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Prazos dos próximos 7 dias" })).toBeVisible();
    // Recarregada, a conversa abre com a resposta gravada (uma só).
    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Prazos desta semana" }).click();
    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Prazos dos próximos 7 dias" }).click();
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(1);
  });

  test("Parar no meio: a resposta fica uma vez, com o aviso", async ({ page }) => {
    await abrirPrevia(page, "/perguntar");
    const campo = page.getByRole("textbox", { name: "Pergunta" });
    await campo.fill("Em que pé está o processo da Marina?");
    await campo.press("Enter");
    await expect(page.locator(".dc-passo.is-lendo")).toBeVisible();
    await page.getByRole("button", { name: "Parar a resposta" }).click();
    await expect(page.getByText("[Você parou a resposta aqui.]")).toBeVisible();
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
    await page.waitForTimeout(2500);
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(1);
    await expect(page.getByText("[Você parou a resposta aqui.]")).toHaveCount(1);
  });

  test("'Agora não' numa tarefa proposta não esconde a tarefa da resposta seguinte", async ({ page }) => {
    test.setTimeout(60_000);
    await abrirPrevia(page, "/perguntar");
    const campo = page.getByRole("textbox", { name: "Pergunta" });
    const tarefas = page.locator(".dc-cartao-ia--tarefa");
    await campo.fill("Lembrar de ligar para a cliente amanhã");
    await campo.press("Enter");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 20_000 });
    await expect(tarefas).toHaveCount(1);
    await tarefas.getByRole("button", { name: "Agora não" }).click();
    await expect(tarefas).toHaveCount(0);
    await campo.fill("E lembrar de ligar para o perito também");
    await campo.press("Enter");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible({ timeout: 20_000 });
    await expect(tarefas).toHaveCount(1);
    // Fora e de volta: a descartada continua fora, a outra continua lá.
    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Prazos desta semana" }).click();
    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: /Tarefa para amanhã|Lembrar de ligar para a cliente/ }).click();
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(2);
    await expect(tarefas).toHaveCount(1);
  });

  test("fora do Perguntar, a IA continua desligada na prévia", async ({ page }) => {
    await abrirPrevia(page, "/prazos");
    await expect(page.getByRole("heading", { level: 1, name: "Prazos" })).toBeVisible();
    const ia = await page.evaluate(() => fetch("/api/app/eu").then((r) => r.json()).then((e: { ia: boolean }) => e.ia));
    expect(ia).toBe(false);
  });
});
