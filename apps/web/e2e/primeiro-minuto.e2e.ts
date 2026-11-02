/** O primeiro minuto em /comecar: ao informar a OAB, a busca no DJEN aparece ao vivo. A OAB é opcional e nada segura a pessoa. */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa } from "./apoio";

const euNovo = { ...amostras.eu!.corpo, escritorio: { ...amostras.eu!.corpo.escritorio, onboarding: true } };
const pedido = { ok: true, pedidaEm: "2026-10-29T12:30:00.000Z", dias: 7 };
const CAMINHO = "/escritorio/primeira-busca";

function comBusca(progresso: unknown) {
  const api = new ApiFalsa();
  api.responder("/eu", euNovo);
  api.responder(`POST ${CAMINHO}`, pedido);
  api.responder(`GET ${CAMINHO}`, progresso);
  return api;
}

const base = { novas: 0, lidas: 0, comPrazo: 0, iaLigada: true, itens: [], erro: null, proximaBusca: "segunda-feira, às 04:30" };

async function informarOab(page: Page) {
  await page.getByRole("textbox", { name: "OAB" }).fill("41233");
  await page.getByRole("button", { name: "Continuar" }).click();
}

test("achou: quantas, quantas com prazo, a leitura chegando e o atalho para a caixa, enquanto a pessoa segue", async ({ page }) => {
  const item = (id: string, leitura: string, prazo: string | null = null) => ({ id, titulo: "Intimação", tribunal: "TJSC", disponibilizadaEm: "2026-10-28", leitura, prazo });
  const api = comBusca({ ...base, situacao: "pronta", encontradas: 12, novas: 12, lidas: 7, comPrazo: 5, itens: [item("a", "com_prazo", "Manifestação sobre laudo · 15 dias úteis"), item("b", "sem_prazo"), item("c", "lendo")] });
  await abrir(page, "/comecar", api);
  await informarOab(page);
  const busca = page.getByRole("region", { name: "Busca no DJEN" });
  await expect(busca.getByText("Achei 12 publicações, 5 com prazo")).toBeVisible();
  await expect(busca.getByText("A IA leu 7 de 12.")).toBeVisible();
  await expect(busca.getByText("Manifestação sobre laudo · 15 dias úteis")).toBeVisible();
  await expect(busca.getByText("A IA está lendo")).toBeVisible();
  await expect(busca.getByRole("link", { name: "Abrir a caixa de Publicações" })).toHaveAttribute("href", "/publicacoes");
  // A pessoa já está na etapa seguinte, com a busca à vista.
  await expect(page.getByRole("heading", { level: 1, name: "O escritório" })).toBeVisible();
  expect(api.mudancas(CAMINHO)).toHaveLength(1);
  expect(api.mudancas(/\/equipe\//)[0]!.corpo).toMatchObject({ oabNumero: "41233", oabUf: "SC" });
});

test("a tela acompanha: da fila à leitura pronta, sem recarregar", async ({ page }) => {
  const api = comBusca({ ...base, situacao: "na_fila", encontradas: 0 });
  await abrir(page, "/comecar", api);
  await informarOab(page);
  await expect(page.getByText("Buscando no DJEN as publicações da OAB/SC 41233 dos últimos 7 dias…")).toBeVisible();
  api.responder(`GET ${CAMINHO}`, { ...base, situacao: "pronta", encontradas: 2, novas: 2, lidas: 2, comPrazo: 1, itens: [] });
  await expect(page.getByText("Achei 2 publicações, 1 com prazo")).toBeVisible({ timeout: 6000 });
  await expect(page.getByText("A IA leu todas. Falta uma pessoa conferir e confirmar.")).toBeVisible();
});

test("nada encontrado: diz isso e quando o Decreta olha de novo", async ({ page }) => {
  await abrir(page, "/comecar", comBusca({ ...base, situacao: "pronta", encontradas: 0 }));
  await informarOab(page);
  await expect(page.getByText("Nenhuma publicação da OAB/SC 41233 nos últimos 7 dias.")).toBeVisible();
  await expect(page.getByText(/O Decreta olha de novo segunda-feira, às 04:30/)).toBeVisible();
});

test("o DJEN fora do ar: diz claramente e deixa seguir", async ({ page }) => {
  await abrir(page, "/comecar", comBusca({ ...base, situacao: "falhou", encontradas: 0, erro: "DJEN: OAB 41233/SC: DJEN respondeu HTTP 503" }));
  await informarOab(page);
  await expect(page.getByText("O DJEN não respondeu agora. A sua OAB está salva, e o Decreta olha de novo segunda-feira, às 04:30.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Diário e avisos" })).toBeVisible();
});

test("o teto de quem está em avaliação: avisa e a configuração continua", async ({ page }) => {
  const api = comBusca({ ...base, situacao: "na_fila", encontradas: 0 });
  api.responder(`POST ${CAMINHO}`, { erro: "teto_em_avaliacao", detalhe: "Escritório novo faz até 3 buscas imediatas por dia. Fale com a equipe do Decreta para liberar." }, 429);
  await abrir(page, "/comecar", api);
  await informarOab(page);
  await expect(page.getByText("Escritório novo faz até 3 buscas imediatas por dia.")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "O escritório" })).toBeVisible();
});

test("a OAB continua opcional: sem ela não há busca e nada trava", async ({ page }) => {
  const api = comBusca({ ...base, situacao: "na_fila", encontradas: 0 });
  await abrir(page, "/comecar", api);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "O escritório" })).toBeVisible();
  expect(api.mudancas(CAMINHO)).toEqual([]);
  await expect(page.getByRole("region", { name: "Busca no DJEN" })).toHaveCount(0);
});
