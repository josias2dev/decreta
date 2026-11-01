/**
 * Cliente no WhatsApp (Fase 3): o rascunho aparece para o advogado revisar e
 * nada sai antes do "Aprovar e enviar". E o link de envio, sem login.
 */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids } from "./apoio";

const MENSAGEM = "00000000-0000-4000-8000-0000000000c1";
const eu = amostras.eu!.corpo.usuario as { id: string; nome: string; apelido: string; iniciais: string };
const RASCUNHO = "Olá, Marina. O juiz pediu que as partes falem sobre o laudo do perito. Vamos preparar a resposta e combinamos os detalhes com você.";
const RODAPE = "_Canal oficial do escritório: (47) 3433-1000. Este escritório nunca pede Pix para liberar valores._";

function mensagem(campos: Record<string, unknown> = {}) {
  const texto = (campos.texto as string | undefined) ?? RASCUNHO;
  return {
    id: MENSAGEM,
    tipo: "decisao",
    situacao: "rascunho",
    envioIncerto: false,
    texto,
    previa: `*Souza & Mendes Advocacia*\n\n${texto}\n\n${RODAPE}`,
    itens: [],
    cliente: { id: ids.cliente, nome: "Marina Duarte" },
    para: "(47) 99123-4567",
    processoId: ids.processo,
    prazoId: ids.prazo,
    linkValeAte: null,
    recebidos: 0,
    criadaEm: "2026-10-29T12:30:00.000Z",
    aprovadaPor: null,
    aprovadaEm: null,
    enviadaEm: null,
    erro: null,
    numeroOficial: "(47) 3433-1000",
    ...campos,
  };
}

test("prazo: a IA escreve ao cliente, o advogado edita e só o clique em Aprovar e enviar manda", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("GET /mensagens-cliente", { itens: [] });
  api.responder(`POST /prazos/${ids.prazo}/mensagem-cliente`, mensagem(), 201);
  await abrir(page, `/prazos/${ids.prazo}`, api);

  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Para o cliente" }) });
  await expect(painel.getByText("nada sai no WhatsApp sem a sua aprovação")).toBeVisible();
  api.responder("GET /mensagens-cliente", { itens: [mensagem()] });
  await painel.getByRole("button", { name: "Escrever ao cliente o que isso significa" }).click();

  // O rascunho aparece com a prévia de como o cliente vai ler: o escritório no alto e o rodapé contra o golpe.
  const campo = painel.getByLabel("Texto para Marina Duarte");
  await expect(campo).toHaveValue(RASCUNHO);
  const previa = painel.getByLabel("Prévia da mensagem");
  await expect(previa).toContainText("*Souza & Mendes Advocacia*");
  await expect(previa).toContainText("Este escritório nunca pede Pix para liberar valores.");
  await expect(painel.getByText(/nada sai sem a sua aprovação, e a mensagem não dá parecer/)).toBeVisible();
  // Escrever o rascunho não manda nada.
  expect(api.mudancas(/\/enviar$/)).toHaveLength(0);

  const editado = `${RASCUNHO} Qualquer dúvida, fale com a Beatriz.`;
  await campo.fill(editado);
  await expect(previa).toContainText("fale com a Beatriz.");
  expect(api.mudancas(/\/enviar$/)).toHaveLength(0);

  api.responder("GET /mensagens-cliente", {
    itens: [mensagem({ texto: editado, situacao: "enviada", aprovadaPor: { id: eu.id, nome: eu.nome, apelido: eu.apelido, iniciais: eu.iniciais }, aprovadaEm: "2026-10-29T12:35:00.000Z", enviadaEm: "2026-10-29T12:35:00.000Z" })],
  });
  await painel.getByRole("button", { name: "Aprovar e enviar" }).click();
  await expect.poll(() => api.mudancas(`/mensagens-cliente/${MENSAGEM}/enviar`).map((p) => p.corpo)).toEqual([{ texto: editado }]);
  await expect(page.getByText("Mensagem enviada no WhatsApp do cliente.")).toBeVisible();
  await expect(painel.getByText(`Enviada por ${eu.apelido}`)).toBeVisible();
  await expect(painel.getByRole("button", { name: "Aprovar e enviar" })).toHaveCount(0);
});

test("prazo: envio sem confirmação pede para conferir, não oferece reenviar, e só manda de novo depois do novo clique", async ({ page }) => {
  const incerta = mensagem({ situacao: "enviando", envioIncerto: true, aprovadaEm: "2026-10-29T12:35:00.000Z", erro: "sem resposta" });
  const api = new ApiFalsa().responder("/eu", euComIa).responder("GET /mensagens-cliente", { itens: [incerta] });
  api.responder(`POST /mensagens-cliente/${MENSAGEM}/conferir-envio`, mensagem({ situacao: "falhou" }));
  await abrir(page, `/prazos/${ids.prazo}`, api);

  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Para o cliente" }) });
  await expect(painel.getByText(/Não conseguimos confirmar se esta mensagem saiu/)).toBeVisible();
  await expect(painel.getByLabel("Mensagem a conferir")).toContainText(RASCUNHO);
  await expect(painel.getByRole("button", { name: "Aprovar e enviar" })).toHaveCount(0);
  await expect(painel.getByRole("button", { name: "Descartar" })).toHaveCount(0);

  api.responder("GET /mensagens-cliente", { itens: [mensagem({ situacao: "falhou" })] });
  await painel.getByRole("button", { name: "Não saiu, voltar a revisar" }).click();
  await expect.poll(() => api.mudancas(`/mensagens-cliente/${MENSAGEM}/conferir-envio`).map((p) => p.corpo)).toEqual([{ saiu: false }]);
  await expect(page.getByText("A mensagem voltou para você revisar. Nada foi enviado.")).toBeVisible();
  await expect(painel.getByText("Esta mensagem não saiu. Confira o texto e tente de novo.")).toBeVisible();
  await expect(painel.getByRole("button", { name: "Aprovar e enviar" })).toBeVisible();
  expect(api.mudancas(/\/enviar$/)).toHaveLength(0);
});

test("prazo: a pessoa confere que a mensagem saiu e ela vira enviada, sem mandar nada", async ({ page }) => {
  const incerta = mensagem({ situacao: "enviando", envioIncerto: true, aprovadaEm: "2026-10-29T12:35:00.000Z" });
  const api = new ApiFalsa().responder("/eu", euComIa).responder("GET /mensagens-cliente", { itens: [incerta] });
  const enviada = mensagem({ situacao: "enviada", aprovadaPor: { id: eu.id, nome: eu.nome, apelido: eu.apelido, iniciais: eu.iniciais }, aprovadaEm: "2026-10-29T12:35:00.000Z", enviadaEm: "2026-10-29T12:35:00.000Z" });
  api.responder(`POST /mensagens-cliente/${MENSAGEM}/conferir-envio`, enviada);
  await abrir(page, `/prazos/${ids.prazo}`, api);

  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Para o cliente" }) });
  const saiu = painel.getByRole("button", { name: "A mensagem saiu" });
  await expect(saiu).toBeVisible();
  api.responder("GET /mensagens-cliente", { itens: [enviada] });
  await saiu.click();
  await expect.poll(() => api.mudancas(`/mensagens-cliente/${MENSAGEM}/conferir-envio`).map((p) => p.corpo)).toEqual([{ saiu: true }]);
  await expect(painel.getByText(`Enviada por ${eu.apelido}`)).toBeVisible();
  await expect(painel.getByText(/Não conseguimos confirmar/)).toHaveCount(0);
  expect(api.mudancas(/\/enviar$/)).toHaveLength(0);
});

test("cliente: a cobrança lista o que falta e avisa que o link entra na aprovação", async ({ page }) => {
  const cobranca = mensagem({
    tipo: "documentos",
    texto: "Olá, Marina. Para seguir com o seu caso, precisamos destes documentos:\n• Procuração assinada",
    previa: "*Souza & Mendes Advocacia*\n\nOlá, Marina. Para seguir com o seu caso, precisamos destes documentos:\n• Procuração assinada\n\nMande uma foto de cada documento por este link, sem precisar de senha:\n[link de envio]\nO link vale até 05/11/2026.\n\n" + RODAPE,
    itens: ["Procuração assinada"],
    prazoId: null,
    processoId: null,
  });
  const api = new ApiFalsa().responder("/eu", euComIa).responder(`/clientes/${ids.cliente}`, amostras.clienteConferido!.corpo).responder("GET /mensagens-cliente", { itens: [] });
  api.responder(`POST /clientes/${ids.cliente}/cobrar-documentos`, cobranca, 201);
  await abrir(page, `/clientes/${ids.cliente}`, api);
  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Documentos que faltam" }) });
  const cobrar = painel.getByRole("button", { name: "Cobrar do cliente os documentos que faltam" });
  await expect(cobrar).toBeVisible();
  api.responder("GET /mensagens-cliente", { itens: [cobranca] });
  await cobrar.click();
  await expect(painel.getByText(/O link de envio, sem senha e válido por 7 dias, entra quando você aprovar/)).toBeVisible();
  await expect(painel.getByLabel("Prévia da mensagem")).toContainText("[link de envio]");
  expect(api.mudancas(/\/enviar$/)).toHaveLength(0);
});

test("link de envio: abre sem login, mostra a lista e a foto volta com o aviso de resposta automática", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  const enviados: string[] = [];
  await page.clock.setFixedTime(new Date("2026-10-29T09:30:00-03:00"));
  await api.ligar(page);
  await page.route("**/api/envio/**", async (route) => {
    const req = route.request();
    if (req.method() === "POST") {
      enviados.push(req.url());
      return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ok: true, nome: "procuracao.jpg", aviso: "Recebemos o arquivo. Esta é uma resposta automática do sistema do escritório: uma pessoa da equipe ainda vai conferir o documento." }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ escritorio: "Souza & Mendes Advocacia", cliente: "Marina", itens: ["Procuração assinada", "Documento com foto (RG ou CNH)"], validoAte: "2026-11-05", recebidos: 0 }) });
  });
  await page.goto("/enviar/org-de-teste/segredo-de-teste-com-mais-de-vinte");

  await expect(page.getByRole("heading", { name: "Olá, Marina. Faltam estes documentos:" })).toBeVisible();
  await expect(page.getByText("Souza & Mendes Advocacia")).toBeVisible();
  await expect(page.getByText("Documento com foto (RG ou CNH)")).toBeVisible();
  await expect(page.getByText("O link vale até 05/11/2026", { exact: false })).toBeVisible();
  await page.getByLabel("Foto ou PDF do documento").setInputFiles({ name: "procuracao.jpg", mimeType: "image/jpeg", buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
  await expect(page.getByText(/resposta automática do sistema do escritório/)).toBeVisible();
  expect(enviados).toEqual([expect.stringContaining("/api/envio/org-de-teste/segredo-de-teste-com-mais-de-vinte")]);
  // A página do cliente não pede login.
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toHaveCount(0);
});
