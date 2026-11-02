/**
 * Novo prazo à mão quando a conta não vem: a tela diz isso em português e deixa
 * digitar a data final, em vez de quebrar ou travar o botão.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa } from "./apoio";

const processo = (amostras.processos!.corpo.itens as { id: string; titulo: string }[])[0]!;

async function preencher(page: Page) {
  await page.getByRole("button", { name: "Novo prazo" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo prazo" });
  await dialogo.getByLabel("Buscar processo").fill(processo.titulo.slice(0, 6));
  await dialogo.getByRole("button", { name: new RegExp(processo.titulo.slice(0, 6)) }).first().click();
  await dialogo.getByLabel("O que fazer").fill("Réplica à contestação");
  return dialogo;
}

for (const [caso, status, corpo] of [
  ["o servidor falha", 500, { erro: "erro_interno" }],
  ["a resposta vem sem a data", 200, {}],
] as const) {
  test(`Novo prazo: quando ${caso}, avisa e deixa digitar a data`, async ({ page }) => {
    const api = new ApiFalsa().responder("POST /prazos/calcular", corpo, status).responder("POST /prazos", { id: amostras.prazo!.corpo.id }, 201);
    await abrir(page, "/prazos", api);
    const dialogo = await preencher(page);

    await expect(dialogo.getByRole("alert")).toHaveText("Não consegui contar este prazo agora. Digite a data final ou tente de novo.");
    const criar = dialogo.getByRole("button", { name: "Criar prazo" });
    await expect(criar).toBeDisabled();

    await dialogo.getByLabel("Data final").fill("2026-11-23");
    await criar.click();
    await expect.poll(() => api.mudancas("/prazos").length).toBe(1);
    expect(api.mudancas("/prazos")[0]!.corpo).toMatchObject({ processoId: processo.id, tipo: "Réplica à contestação", fimManual: "2026-11-23" });
  });
}

test("Novo prazo: voltando a responder, a conta volta e a data digitada sai de cena", async ({ page }) => {
  const prazo = amostras.prazo!.corpo;
  const api = new ApiFalsa().responder("POST /prazos/calcular", { erro: "erro_interno" }, 500);
  await abrir(page, "/prazos", api);
  const dialogo = await preencher(page);
  await expect(dialogo.getByRole("alert")).toBeVisible();

  api.responder("POST /prazos/calcular", { publicacao: prazo.publicadoEm, inicio: prazo.inicio, fim: prazo.fim, dias: prazo.dias, contagem: prazo.contagem, desconsiderados: [], prorrogadoDe: null, explicacao: prazo.conta.explicacao, pelo: "publicacao", outra: null, calendarioCompleto: true, diaDigitado: null });
  await dialogo.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(dialogo.getByText("23/11/2026")).toBeVisible();
  await expect(dialogo.getByRole("alert")).toHaveCount(0);
  await expect(dialogo.getByLabel("Data final")).toHaveCount(0);
  await expect(dialogo.getByRole("button", { name: "Criar prazo" })).toBeEnabled();
});
