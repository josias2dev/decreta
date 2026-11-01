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

const auditoria = {
  total: 10,
  itens: [
    { motivo: "prazo_sem_dono", id: ids.prazo, titulo: "Manifestação sobre laudo pericial · Marina Duarte × Seguradora Alfa", detalhe: "Vence em 23/11 e ninguém responde por ele.", caminho: `/prazos/${ids.prazo}`, dias: 2, responsavelId: null },
    { motivo: "processo_parado", id: ids.processo, titulo: "Marina Duarte × Seguradora Alfa", detalhe: "Sem andamento há 150 dias (desde 01/06).", caminho: `/processos/${ids.processo}`, dias: 150, responsavelId: null },
  ],
};

test("5.3: o prazo confirmado já mostra o rascunho pronto, e o botão leva a ele", async ({ page }) => {
  const prazo = amostras.prazoComPeca!.corpo;
  const rascunho = { ...prazo.pecas[0], preparadaPelaIa: true };
  const api = new ApiFalsa().responder(`/prazos/${ids.prazoComPeca}`, { ...prazo, pecas: [rascunho] });
  await abrir(page, `/prazos/${ids.prazoComPeca}`, api);
  await expect(page.getByText("Rascunho pronto", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("nada foi enviado nem protocolado")).toBeVisible();
  await page.getByRole("button", { name: "Revisar o rascunho pronto" }).click();
  await expect(page).toHaveURL(new RegExp(`/pecas\\?id=${rascunho.id}$`));
});

test("5.2: a auditoria da carteira aparece no Hoje e cada achado leva aonde resolver", async ({ page }) => {
  const api = new ApiFalsa().responder("/hoje", { ...amostras.hoje!.corpo, auditoria });
  await abrir(page, "/hoje", api);
  const lista = page.getByRole("list", { name: "Auditoria da carteira" });
  await expect(lista.getByRole("listitem")).toHaveCount(2);
  await expect(lista).toContainText("Prazo sem responsável");
  await expect(page.getByText("E mais 8 na carteira.")).toBeVisible();
  await lista.getByRole("link", { name: /Processo parado/ }).click();
  await expect(page).toHaveURL(new RegExp(`/processos/${ids.processo}$`));
});
