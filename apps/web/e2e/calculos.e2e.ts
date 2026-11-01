/** Aba Cálculos do processo: o fluxo principal da atualização monetária, da conta à memória. */
import { expect, test } from "@playwright/test";
import { abrir, ApiFalsa, ids } from "./apoio";

const CALCULO = "6f1c2a4e-0b7d-4c1e-9a55-3d2f8e7b1c90";
const MEMORIA = [
  "## Memória de cálculo · Atualização do débito",
  "Processo 5004321-25.2026.8.24.0038. Cálculo em 29/10/2026.",
  "### Parcelas",
  "- **Condenação**, vencida em 10/03/2025: R$ 10.000,00 × 1,061234 = R$ 10.612,34; juros de 8,12% = R$ 861,72; total R$ 11.474,06.",
  "### Total",
  "**Total atualizado: R$ 11.474,06** (principal R$ 10.000,00; correção R$ 612,34; juros R$ 861,72).",
].join("\n\n");

test("atualizar valores: escolhe o regime, informa a parcela e vê a memória pronta para o cumprimento de sentença", async ({ page }) => {
  const api = new ApiFalsa()
    .responder("GET /calculos", { itens: [] })
    .responder("GET /calculos/previdenciario", {
      dia: "2026-10-29",
      parametros: { teto: 8475.55, salarioMinimo: 1621, tetoDesde: "2026-01-01", salarioMinimoDesde: "2026-01-01" },
      linhaDoTempo: [{ data: "2025-03-12", tipo: "laudo", documentoId: "d1", nome: "Laudo pericial.pdf", evento: 87, dataNoTexto: true, trecho: "Conclusão: incapacidade parcial e permanente." }],
    })
    .responder("POST /calculos/atualizacao", { id: CALCULO }, 201)
    .responder(`GET /calculos/${CALCULO}`, { id: CALCULO, processoId: ids.processo, tipo: "atualizacao", titulo: "Atualização do débito", total: 11474.06, documentoId: null, criadoEm: "2026-10-29T12:30:00.000Z", memoria: MEMORIA });
  await abrir(page, `/processos/${ids.processo}?aba=calculos`, api);

  await expect(page.getByRole("tab", { name: "Cálculos" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("teto do INSS de")).toContainText("R$ 8.475,55");
  await expect(page.getByText("Laudo ou atestado")).toBeVisible();

  await page.getByRole("button", { name: "Atualizar valores" }).click();
  const dialogo = page.getByRole("dialog", { name: "Atualizar valores" });
  await expect(dialogo.getByLabel("Regime")).toHaveValue("civil");
  await dialogo.getByLabel("Data do cálculo").fill("2026-10-29");
  await dialogo.getByLabel("Valor (R$)").fill("10.000,00");
  await dialogo.getByLabel("Vencimento").fill("2025-03-10");
  await dialogo.getByRole("button", { name: "Calcular" }).click();

  const memoria = page.getByRole("dialog", { name: "Atualização do débito" });
  await expect(memoria.getByText("Total atualizado: R$ 11.474,06")).toBeVisible();
  expect(api.mudancas("/calculos/atualizacao")[0]!.corpo).toMatchObject({
    processoId: ids.processo,
    regime: { tipo: "civil" },
    dataDoCalculo: "2026-10-29",
    parcelas: [{ descricao: "Condenação", valor: 10000, vencimento: "2025-03-10" }],
  });
  await expect(memoria.getByRole("link", { name: "Baixar DOCX" })).toHaveAttribute("href", `/api/app/calculos/${CALCULO}/docx`);
  await memoria.getByRole("link", { name: "Gerar cumprimento de sentença" }).click();
  await expect(page).toHaveURL(new RegExp(`/pecas\\?processo=${ids.processo}&tipo=cumprimento-sentenca`));
});
