/**
 * Radar de precedentes (Fase 5.4): no processo, o precedente do BNP que mudou
 * e pode afetá-lo, com o motivo e o link oficial. O advogado descarta o que
 * não serve; sem aviso, o painel nem aparece.
 */
import { expect, test } from "@playwright/test";
import { abrir, ApiFalsa, ids } from "./apoio";

const AVISO = {
  id: "00000000-0000-4000-8000-0000000000d1",
  chave: "irdr:TJSC:37",
  rotulo: "IRDR 37 do TJSC",
  situacao: "Admitido",
  texto: "Definir a possibilidade de utilização da Central Nacional de Indisponibilidade de Bens (CNIB) como instrumento de busca de patrimônio.",
  url: "https://pangeabnp.pdpj.jus.br/pesquisa?orgao=tjsc&tipo=IRDR&nr=37",
  motivo: 'Novo no Banco Nacional de Precedentes. O assunto do processo, "Indisponibilidade de bens", aparece na questão julgada.',
  criadoEm: "2026-10-29T07:30:00.000Z",
  processo: { id: ids.processo, titulo: "Marina Duarte × Seguradora Alfa" },
};

test("processo: o precedente que pode afetar o caso aparece com o motivo e a fonte, e o advogado descarta", async ({ page }) => {
  const api = new ApiFalsa().responder("GET /radar", { itens: [AVISO] });
  await abrir(page, `/processos/${ids.processo}`, api);

  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Precedentes" }) });
  await expect(painel.getByText("IRDR 37 do TJSC")).toBeVisible();
  await expect(painel.getByText("Admitido")).toBeVisible();
  await expect(painel.getByText(/Central Nacional de Indisponibilidade de Bens/)).toBeVisible();
  await expect(painel.getByText(/aparece na questão julgada/)).toBeVisible();
  await expect(painel.getByText(/pode afetar este processo/)).toBeVisible();
  const fonte = painel.getByRole("link", { name: /Banco Nacional de Precedentes/ });
  await expect(fonte).toHaveAttribute("href", AVISO.url);
  await expect(fonte).toHaveAttribute("rel", "noopener noreferrer");

  api.responder("GET /radar", { itens: [] });
  await painel.getByRole("button", { name: "Descartar IRDR 37 do TJSC" }).click();
  await expect.poll(() => api.mudancas(`/radar/${AVISO.id}/descartar`)).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "Precedentes" })).toHaveCount(0);
});

test("processo sem aviso do radar: nenhum painel de precedentes", async ({ page }) => {
  await abrir(page, `/processos/${ids.processo}`, new ApiFalsa().responder("GET /radar", { itens: [] }));
  await expect(page.getByRole("heading", { name: "Dados do processo" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Precedentes" })).toHaveCount(0);
});
