/**
 * O calendário de cada tribunal à vista: o aviso de dia sem expediente ao
 * digitar a data final, a conta que diz quando o tribunal não tem calendário
 * próprio e os seletores de tribunal.
 */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids } from "./apoio";

const SEM_CALENDARIO = "Este tribunal ainda não tem calendário próprio no Decreta: a conta usou os feriados nacionais e o recesso. Confira as suspensões do tribunal.";
const prazo = amostras.prazo!.corpo;
const previa = {
  publicacao: prazo.publicadoEm,
  inicio: prazo.inicio,
  fim: prazo.fim,
  dias: prazo.dias,
  contagem: prazo.contagem,
  desconsiderados: prazo.conta.desconsiderados,
  prorrogadoDe: null,
  explicacao: prazo.conta.explicacao,
  pelo: "publicacao",
  outra: null,
  calendarioCompleto: true,
  diaDigitado: null,
};
const domingoDeFeriado = { dia: "2026-11-15", aviso: "15/11/2026 é domingo e feriado (Proclamação da República). O próximo dia útil é 16/11/2026.", proximoDiaUtil: "2026-11-16" };

test("ajustar o prazo: a data digitada num domingo de feriado mostra o motivo e o próximo dia útil, e ainda dá para salvar", async ({ page }) => {
  const api = new ApiFalsa().responder("POST /prazos/calcular", { ...previa, diaDigitado: domingoDeFeriado });
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await page.getByRole("button", { name: "Ajustar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar prazo" });
  await dialogo.getByLabel("Sei a data final (suspensão que o Decreta não conhece)").check();
  await dialogo.getByLabel("Data final", { exact: true }).fill("2026-11-15");
  await expect(dialogo.getByText(domingoDeFeriado.aviso)).toBeVisible();
  await expect.poll(() => api.mudancas("/prazos/calcular").some((p) => (p.corpo as { diaDigitado?: string }).diaDigitado === "2026-11-15")).toBe(true);

  // Outra data: o aviso é do dia anterior e sai de cena.
  await dialogo.getByLabel("Data final", { exact: true }).fill("2026-11-24");
  await expect(dialogo.getByText(domingoDeFeriado.aviso)).toHaveCount(0);
  await expect(dialogo.getByText(/Vence em/)).toBeVisible();

  // É só um aviso: a data digitada continua valendo.
  await dialogo.getByLabel("Data final", { exact: true }).fill("2026-11-15");
  await expect(dialogo.getByText(domingoDeFeriado.aviso)).toBeVisible();
  await dialogo.getByRole("button", { name: /^Salvar/ }).click();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}`)[0]?.corpo).toMatchObject({ fimManual: "2026-11-15" });
});

test("confirmar a publicação: o diálogo avisa o dia sem expediente da data digitada", async ({ page }) => {
  const api = new ApiFalsa().responder("POST /prazos/calcular", { ...previa, diaDigitado: domingoDeFeriado });
  await abrir(page, `/publicacoes?id=${ids.publicacao}`, api);
  await page.getByRole("button", { name: "Ajustar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Ajustar e confirmar" });
  await dialogo.getByLabel("Sei a data final (suspensão que o Decreta não conhece)").check();
  await dialogo.getByLabel("Data final", { exact: true }).fill("2026-11-15");
  await expect(dialogo.getByText(domingoDeFeriado.aviso)).toBeVisible();
  await expect.poll(() => api.mudancas("/prazos/calcular").some((p) => (p.corpo as { diaDigitado?: string }).diaDigitado === "2026-11-15")).toBe(true);
  await expect(dialogo.getByRole("button", { name: "Confirmar prazo" })).toBeEnabled();
});

test("tribunal sem calendário próprio: a conta avisa no painel e na prévia do ajuste", async ({ page }) => {
  const api = new ApiFalsa()
    .responder(`/prazos/${ids.prazo}`, { ...prazo, conta: { ...prazo.conta, calendario: "TJPR", calendarioCompleto: false } })
    .responder("POST /prazos/calcular", { ...previa, calendarioCompleto: false });
  await abrir(page, `/prazos/${ids.prazo}`, api);
  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "A conta" }) });
  await expect(painel.getByText(SEM_CALENDARIO)).toBeVisible();
  await page.getByRole("button", { name: "Ajustar" }).click();
  await expect(page.getByRole("dialog", { name: "Ajustar prazo" }).getByText(SEM_CALENDARIO)).toBeVisible();
});

test("tribunal com calendário próprio: nenhum aviso de limite", async ({ page }) => {
  const api = new ApiFalsa()
    .responder(`/prazos/${ids.prazo}`, { ...prazo, conta: { ...prazo.conta, calendario: "TRF4", calendarioCompleto: true } })
    .responder("POST /prazos/calcular", previa);
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await expect(page.getByText("TRF4", { exact: true })).toBeVisible();
  await expect(page.getByText(SEM_CALENDARIO)).toHaveCount(0);
  await page.getByRole("button", { name: "Ajustar" }).click();
  await expect(page.getByRole("dialog", { name: "Ajustar prazo" }).getByText(/Vence em/)).toBeVisible();
  await expect(page.getByText(SEM_CALENDARIO)).toHaveCount(0);
});

test("novo prazo à mão: a prévia também avisa o tribunal sem calendário próprio", async ({ page }) => {
  const api = new ApiFalsa().responder("POST /prazos/calcular", { ...previa, calendarioCompleto: false });
  await abrir(page, "/prazos", api);
  await page.getByRole("button", { name: "Novo prazo" }).click();
  await expect(page.getByRole("dialog", { name: "Novo prazo" }).getByText(SEM_CALENDARIO)).toBeVisible();
});

test("configurações: o calendário avisa quando o tribunal do escritório não tem calendário próprio", async ({ page }) => {
  const feriados = amostras.feriados!.corpo;
  await abrir(page, "/configuracoes", new ApiFalsa().responder("/feriados", { ...feriados, tribunal: "TJPR", calendarioCompleto: false }));
  await page.getByRole("tab", { name: "Calendário" }).click();
  await expect(page.getByText(SEM_CALENDARIO)).toBeVisible();

  await abrir(page, "/configuracoes", new ApiFalsa().responder("/feriados", { ...feriados, calendarioCompleto: true }));
  await page.getByRole("tab", { name: "Calendário" }).click();
  await expect(page.getByText("Feriados de 2026 · TJSC")).toBeVisible();
  await expect(page.getByText(SEM_CALENDARIO)).toHaveCount(0);
});

const COM_CALENDARIO = [
  "TJSC · Justiça estadual de Santa Catarina",
  "TRT12 · Justiça do Trabalho em SC",
  "TRF1 · Justiça Federal da 1ª Região",
  "TRF2 · Justiça Federal da 2ª Região",
  "TRF3 · Justiça Federal da 3ª Região",
  "TRF4 · Justiça Federal da 4ª Região",
  "TRF5 · Justiça Federal da 5ª Região",
  "TRF6 · Justiça Federal da 6ª Região",
  "TJSP · Justiça estadual de São Paulo",
  "TJRJ · Justiça estadual do Rio de Janeiro",
  "TJMG · Justiça estadual de Minas Gerais",
];
const SEM_CALENDARIO_PROPRIO = ["TJPR · Justiça estadual do Paraná", "TJRS · Justiça estadual do Rio Grande do Sul"];

test("o seletor de tribunal das configurações separa quem tem calendário próprio", async ({ page }) => {
  await abrir(page, "/configuracoes");
  const seletor = page.getByLabel("Tribunal principal");
  await expect(seletor.locator('optgroup[label="Com calendário próprio"] option')).toHaveText(COM_CALENDARIO);
  await expect(seletor.locator('optgroup[label="Sem calendário próprio: só feriados nacionais e recesso"] option')).toHaveText(SEM_CALENDARIO_PROPRIO);
  await seletor.selectOption("TRF4");
  await expect(seletor).toHaveValue("TRF4");
});

test("começar: o tribunal padrão oferece os mesmos tribunais, com o limite à mostra", async ({ page }) => {
  const eu = { ...amostras.eu!.corpo, escritorio: { ...amostras.eu!.corpo.escritorio, pessoas: 1, onboarding: true } };
  const escritorio = { ...amostras.escritorio!.corpo, timbre: null, whatsappOficial: null, tribunal: "TJSC" };
  const api = new ApiFalsa().responder("/eu", eu).responder("/escritorio", escritorio);
  await abrir(page, "/comecar", api);
  await page.getByRole("button", { name: "Pular esta etapa" }).click();
  const seletor = page.getByLabel("Tribunal padrão");
  await expect(seletor.locator('optgroup[label="Com calendário próprio"] option')).toHaveText(COM_CALENDARIO);
  await expect(seletor.locator('optgroup[label="Sem calendário próprio: só feriados nacionais e recesso"] option')).toHaveText(SEM_CALENDARIO_PROPRIO);
});
