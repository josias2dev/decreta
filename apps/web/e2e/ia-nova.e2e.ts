/** IA de nova geração (Fase 5): os fluxos principais de tela, com a API de mentira. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids } from "./apoio";

const processo = amostras.processo!.corpo;
const laudo = (amostras.documentos!.corpo.itens as { id: string; evento: number | null; nome: string }[]).find((d) => d.evento === 87)!;

test("5.1: a fonte do resumo abre o documento na folha citada", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa);
  api.responder(`/processos/${ids.processo}`, {
    ...processo,
    resumo: { ...processo.resumo, conteudo: { ...processo.resumo.conteudo, estrategia: "Apoiar o laudo, que fixa a invalidez em 40% (evento 87, fl. 3), e pedir o julgamento." } },
  });
  await abrir(page, `/processos/${ids.processo}`, api);
  const fonte = page.getByRole("link", { name: /^evento 87, fl\. 3: abrir o documento na folha 3$/ });
  await expect(fonte).toBeVisible();
  await fonte.click();
  await expect(page).toHaveURL(new RegExp(`/documentos\\?doc=${laudo.id}&pagina=3$`));
  await expect(page.getByRole("region", { name: `Documento aberto: ${laudo.nome}` })).toBeVisible();
});
