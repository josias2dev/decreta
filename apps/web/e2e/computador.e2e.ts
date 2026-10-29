/** Telas no computador (1440 de largura), com as respostas da demonstração. */
import { expect, test } from "@playwright/test";
import { abrir, ApiFalsa, ids, sobraNaLateral } from "./apoio";

test("sem sessão, vai para Entrar e volta para onde ia", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(`/prazos/${ids.prazo}`);
});

test("Hoje: números do dia, publicações novas e o menu com as contagens", async ({ page }) => {
  await abrir(page, "/hoje");
  const numeros = page.getByLabel("Números do dia");
  await expect(numeros.getByLabel("3 prazos vencem hoje")).toBeVisible();
  await expect(numeros.getByLabel("1 prazos vencidos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar 7" })).toBeVisible();
  const menu = page.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: /Prazos/ })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("prazo: briefing da IA, data final contada e confirmar", async ({ page }) => {
  const api = await abrir(page, `/prazos/${ids.prazo}`);
  await expect(page.getByRole("heading", { name: "Manifestação sobre laudo pericial" })).toBeVisible();
  await expect(page.getByText("O que o juízo decidiu")).toBeVisible();
  await expect(page.getByText("23/11/2026").first()).toBeVisible();
  await expect(page.getByText(/Fins de semana, 02\/11 e 20\/11/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar prazo" }).click();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/confirmar`).length).toBe(1);
  await expect(page.getByText("Prazo confirmado.")).toBeVisible();
});

test("descartar prazo leva o motivo junto", async ({ page }) => {
  const api = await abrir(page, `/prazos/${ids.prazo}`);
  await page.getByRole("button", { name: "Descartar" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  const enviar = dialogo.getByRole("button", { name: "Descartar", exact: true });
  await dialogo.getByLabel("Por quê? (opcional)").fill("Prazo já cumprido no processo físico.");
  await enviar.click();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/descartar`)[0]?.corpo).toMatchObject({ motivo: "Prazo já cumprido no processo físico." });
});

test("publicações: caixa de entrada com a lista e o teor ao lado", async ({ page }) => {
  await abrir(page, "/publicacoes");
  await expect(page.getByRole("heading", { name: "Publicações" })).toBeVisible();
  await page.getByText("Marina Duarte × Seguradora Alfa S.A.").first().click();
  await expect(page.getByText("Teor da intimação")).toBeVisible();
  await expect(page.getByText(/laudo pericial juntado no evento 87/).first()).toBeVisible();
});

test("processo: resumo avisa a novidade e as abas trocam pelo endereço", async ({ page }) => {
  await abrir(page, `/processos/${ids.processo}`);
  await expect(page.getByRole("heading", { name: "Marina Duarte × Seguradora Alfa S.A." })).toBeVisible();
  await expect(page.getByText(/1 movimentação nova desde este resumo/)).toBeVisible();
  await page.getByRole("tab", { name: /Movimentações/ }).click();
  await expect(page).toHaveURL(/aba=movimentacoes/);
  await expect(page.getByText("Petição da ré").first()).toBeVisible();
  await page.getByRole("tab", { name: /Chat do processo/ }).click();
  await expect(page.getByText("A IA ainda não está ligada")).toBeVisible();
});

test("peça: folha no timbre, trechos a completar marcados e DOCX", async ({ page }) => {
  await abrir(page, `/pecas?id=${ids.peca}`);
  const folha = page.locator(".dc-folha").first();
  await expect(folha.getByText("Souza & Freitas Advocacia")).toBeVisible();
  await expect(folha.locator("mark").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Baixar DOCX no timbre/ })).toHaveAttribute("href", new RegExp(`/api/app/pecas/${ids.peca}/docx`));
});

test("peça sem a IA: escreve à mão e guarda", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/pecas/manual", { id: ids.peca }, 201);
  await abrir(page, `/pecas?prazo=${ids.prazo}`, api);
  await expect(page.getByText(/Dá para escrever a peça à mão/)).toBeVisible();
  await page.getByRole("button", { name: "Editar texto" }).click();
  await page.getByLabel("Texto da peça").fill("# Excelentíssimo Senhor Doutor Juiz\n\nManifesta-se sobre o laudo.");
  await page.getByRole("button", { name: "Salvar texto" }).click();
  await expect.poll(() => api.mudancas("/pecas/manual")[0]?.corpo).toMatchObject({ processoId: ids.processo, prazoId: ids.prazo, tipo: "manifestacao-laudo" });
});

test("cliente: dados, processos e a linha do tempo", async ({ page }) => {
  await abrir(page, `/clientes/${ids.cliente}`);
  await expect(page.getByRole("heading", { name: "Marina Duarte" })).toBeVisible();
  await expect(page.getByText("Atendimento · WhatsApp").first()).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("equipe: convidar manda e-mail e papel", async ({ page }) => {
  const api = await abrir(page, "/equipe");
  await expect(page.getByText("Beatriz Souza")).toBeVisible();
  await page.getByRole("button", { name: "Convidar" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("E-mail").fill("nova.pessoa@exemplo.com.br");
  await dialogo.getByRole("button", { name: "Convidar", exact: true }).click();
  await expect.poll(() => api.mudancas("/organization/invite-member")[0]?.corpo).toMatchObject({ email: "nova.pessoa@exemplo.com.br" });
});

test("endereço que não existe mostra a página de não encontrada", async ({ page }) => {
  await abrir(page, "/isso-nao-existe");
  await expect(page.getByText("Página não encontrada")).toBeVisible();
});

for (const rota of ["/prazos", "/processos", "/clientes", "/agenda", "/negocios", "/alvaras", "/documentos", "/configuracoes", "/conta"]) {
  test(`${rota} abre sem erro e sem rolar para o lado`, async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    await abrir(page, rota);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByLabel("Carregando")).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
    expect(erros).toEqual([]);
  });
}
