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

test("5.5: a petição da ré vira pontos a rebater no prazo", async ({ page }) => {
  const prazo = amostras.prazo!.corpo;
  const peticao = (amostras.documentos!.corpo.itens as { id: string; evento: number | null }[]).find((d) => d.evento === 89)!;
  const api = new ApiFalsa().responder("/eu", euComIa).responder(`/prazos/${ids.prazo}`, { ...prazo, pecaContraria: null });
  await abrir(page, `/prazos/${ids.prazo}`, api);
  const bloco = page.locator("section", { hasText: "Peça da outra parte" });
  await bloco.getByRole("combobox", { name: "Peça da outra parte" }).selectOption(peticao.id);

  const leitura = {
    ...prazo.briefing,
    acao: "ler-peca-contraria",
    fonte: "Petição da ré · evento 89",
    conteudo: {
      peca: "Pedido de esclarecimentos da Seguradora Alfa (evento 89)",
      pedidos: "Que o perito esclareça o percentual de 40%.",
      pontos: [{ tese: "O laudo não explica a tabela usada.", rebater: "A tabela da SUSEP está citada no laudo.", fonte: "(evento 87, fl. 3)" }],
      recusa: null,
    },
  };
  api.responder(`/prazos/${ids.prazo}`, { ...prazo, pecaContraria: leitura });
  await bloco.getByRole("button", { name: "Ler a peça" }).click();
  await expect(page.getByRole("list", { name: "Pontos a rebater" }).getByRole("listitem")).toHaveCount(1);
  await expect(bloco).toContainText("Como rebater: A tabela da SUSEP está citada no laudo.");
  expect(api.mudancas(`/ia/peca-contraria/${ids.prazo}`).map((p) => p.corpo)).toEqual([{ documentoId: peticao.id }]);
});

test("5.6: o áudio do atendimento vira texto no campo", async ({ page }) => {
  const texto = "A cliente contou que a seguradora negou o pagamento em março.";
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/transcrever", { texto });
  await abrir(page, `/clientes/${ids.cliente}`, api);
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  const dialogo = page.getByRole("dialog", { name: "Registrar atendimento" });
  await dialogo.getByLabel("Áudio do atendimento").setInputFiles({ name: "atendimento.ogg", mimeType: "audio/ogg", buffer: Buffer.from([1, 2, 3, 4]) });
  await expect(dialogo.getByLabel("O que foi conversado")).toHaveValue(texto);
  expect(api.mudancas("/ia/transcrever")).toHaveLength(1);
});

test("5.7: o sócio descreve o jeito da contestação, e o geral continua guardado", async ({ page }) => {
  const geral = { estilo: "Frases curtas, sem latim.", teses: "", evitar: "" };
  const api = new ApiFalsa().responder("/escritorio", { ...amostras.escritorio!.corpo, jeito: { geral } });
  await abrir(page, "/configuracoes", api);
  await page.getByRole("tab", { name: "Jeito das peças" }).click();
  await expect(page.getByLabel("Estilo")).toHaveValue(geral.estilo);
  await page.getByLabel("Peça", { exact: true }).selectOption("contestacao");
  await expect(page.getByLabel("Estilo")).toHaveValue("");
  await page.getByLabel("Teses que o escritório usa").fill("Prescrição sempre em preliminar.");
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect.poll(() => api.mudancas("/escritorio").map((p) => p.corpo)).toEqual([
    { jeito: { geral, contestacao: { estilo: "", teses: "Prescrição sempre em preliminar.", evitar: "" } } },
  ]);
});

test("5.9: o rascunho da peça vira sugestão, e o prazo continua travado em exigir confirmação", async ({ page }) => {
  const automacao = { "rascunho-da-peca": "automatico", "leitura-da-sentenca": "automatico", prazo: "confirmar", "mensagem-ao-cliente": "confirmar", valores: "confirmar" };
  const api = new ApiFalsa().responder("/escritorio", { ...amostras.escritorio!.corpo, automacao });
  await abrir(page, "/configuracoes", api);
  await page.getByRole("tab", { name: "IA", exact: true }).click();
  const prazo = page.getByRole("radiogroup", { name: "Prazo sugerido pela IA" });
  await expect(prazo.getByRole("radio", { name: "Exige confirmação" })).toBeDisabled();
  await page.getByRole("radiogroup", { name: "Rascunho da peça do prazo" }).getByRole("radio", { name: "Vira sugestão" }).click();
  await expect.poll(() => api.mudancas("/escritorio").map((p) => p.corpo)).toEqual([{ automacao: { "rascunho-da-peca": "sugestao", "leitura-da-sentenca": "automatico" } }]);
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
