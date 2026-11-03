/**
 * 4.8: a IA nos campos de texto. Nada entra no campo sem o clique em Usar, o texto
 * de antes não se perde e o que falta aparece como [a completar]. O botão some quando
 * a IA não pode ser usada, e a tela diz quando ela falha ou o limite acabou.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

const sentenca = amostras.publicacaoSentenca!.corpo;
const TEXTO = "Ganhamos a indenização de R$ 80.000,00 e perdemos os danos morais de [a completar].";
const previaPronta = (campos: Record<string, unknown> = {}) => ({ id: "00000000-0000-4000-8000-0000000000d1", situacao: "pronto", texto: TEXTO, dicas: [], trocados: ["R$ 3.000,00"], aCompletar: 1, ...campos });

/** Abre o "Resultado da decisão" da sentença da amostra. */
async function abrirResultado(page: Page, api: ApiFalsa) {
  await abrir(page, `/publicacoes?id=${ids.sentenca}`, api.responder(`/publicacoes/${ids.sentenca}`, { ...sentenca, resultado: null }));
  await page.getByRole("button", { name: "Corrigir" }).click();
  return page.getByRole("dialog", { name: "Resultado da decisão" });
}

const botaoDaIa = (lugar: Page | ReturnType<Page["locator"]>) => lugar.getByRole("button", { name: "Pedir ajuda da IA neste campo" });

test("Escrever: a prévia não entra no campo; Usar entra, com o [a completar] à vista, e dá para voltar ao texto de antes", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta());
  const dialogo = await abrirResultado(page, api);
  const campo = dialogo.getByLabel("Em poucas palavras");
  const original = await campo.inputValue();
  await campo.fill("ganhamos quase tudo");

  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Escrever/ }).click();

  const previa = dialogo.getByRole("region", { name: "Prévia da IA" });
  await expect(previa).toContainText("Ganhamos a indenização de R$ 80.000,00");
  // Destacado, e a pessoa vê quantos ficaram.
  await expect(previa.locator("mark")).toHaveText("[a completar]");
  await expect(previa).toContainText("1 a completar");
  // A prévia não mexe no campo nem grava nada.
  await expect(campo).toHaveValue("ganhamos quase tudo");
  expect(api.mudancas(`/publicacoes/${ids.sentenca}/resultado`)).toHaveLength(0);
  expect(api.mudancas("/ia/campo").map((p) => p.corpo)).toEqual([{ campo: "resultado-decisao", modo: "escrever", texto: "ganhamos quase tudo", alvo: { publicacaoId: ids.sentenca } }]);

  await previa.getByRole("button", { name: "Usar" }).click();
  await expect(campo).toHaveValue(TEXTO);
  await expect(dialogo.getByText("Falta 1 dado marcado como [a completar].")).toBeVisible();
  await expect.poll(() => api.mudancas("/ia/campo/00000000-0000-4000-8000-0000000000d1/usado")).toHaveLength(1);

  await dialogo.getByRole("button", { name: "Voltar ao texto de antes" }).click();
  await expect(campo).toHaveValue("ganhamos quase tudo");
  expect(original).not.toBe("ganhamos quase tudo");
  // Voltar também não perde nada: dá para ir de novo ao texto da IA.
  await dialogo.getByRole("button", { name: "Voltar ao texto de antes" }).click();
  await expect(campo).toHaveValue(TEXTO);
});

test("usar duas vezes seguidas não perde o rascunho da pessoa", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta({ texto: "Primeira versão.", aCompletar: 0 }));
  const dialogo = await abrirResultado(page, api);
  const campo = dialogo.getByLabel("Em poucas palavras");
  await campo.fill("meu rascunho");
  const usar = async () => {
    await botaoDaIa(dialogo).click();
    await dialogo.getByRole("button", { name: /^Melhorar/ }).click();
    await dialogo.getByRole("region", { name: "Prévia da IA" }).getByRole("button", { name: "Usar" }).click();
  };
  await usar();
  await expect(campo).toHaveValue("Primeira versão.");
  api.responder("POST /ia/campo", previaPronta({ texto: "Segunda versão.", aCompletar: 0 }));
  await usar();
  await expect(campo).toHaveValue("Segunda versão.");
  await dialogo.getByRole("button", { name: "Voltar ao texto de antes" }).click();
  await expect(campo).toHaveValue("meu rascunho");
});

test("Descartar: o campo fica como estava e nada é marcado como usado", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta());
  const dialogo = await abrirResultado(page, api);
  const campo = dialogo.getByLabel("Em poucas palavras");
  await campo.fill("meu rascunho");
  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Melhorar/ }).click();
  const previa = dialogo.getByRole("region", { name: "Prévia da IA" });
  await previa.getByRole("button", { name: "Descartar" }).click();
  await expect(previa).toHaveCount(0);
  await expect(campo).toHaveValue("meu rascunho");
  expect(api.mudancas(/\/usado$/)).toHaveLength(0);
});

test("Melhorar pede texto no campo; Orientar devolve dicas, sem nada para usar", async ({ page }) => {
  const dicas = ["Diga o que o juiz deu e o que negou.", "Confira o valor de [a completar]."];
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta({ texto: null, dicas, aCompletar: 1 }));
  const dialogo = await abrirResultado(page, api);
  const campo = dialogo.getByLabel("Em poucas palavras");
  await campo.fill("");
  await botaoDaIa(dialogo).click();
  await expect(dialogo.getByRole("button", { name: /^Melhorar/ })).toBeDisabled();
  await dialogo.getByRole("button", { name: /^Orientar/ }).click();
  const previa = dialogo.getByRole("region", { name: "Prévia da IA" });
  await expect(previa.getByRole("listitem")).toHaveCount(2);
  await expect(previa.getByRole("listitem").first()).toHaveText(dicas[0]!);
  await expect(previa.getByRole("button", { name: "Usar" })).toHaveCount(0);
  await previa.getByRole("button", { name: "Fechar" }).click();
  await expect(campo).toHaveValue("");
});

test("a IA recusa: mostra o motivo, sem texto para usar", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", { id: "00000000-0000-4000-8000-0000000000d2", situacao: "recusa", motivo: "Falta o teor da decisão." });
  const dialogo = await abrirResultado(page, api);
  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Escrever/ }).click();
  await expect(dialogo.getByText("Falta o teor da decisão.")).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Usar" })).toHaveCount(0);
});

test("a IA fora do ar: a tela diz, oferece tentar de novo, e o campo continua funcionando", async ({ page }) => {
  const detalhe = "A IA não respondeu agora. O seu texto continua no campo. Tente de novo em instantes.";
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", { erro: "ia_falhou", detalhe }, 503);
  const dialogo = await abrirResultado(page, api);
  const campo = dialogo.getByLabel("Em poucas palavras");
  await campo.fill("meu rascunho");
  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Melhorar/ }).click();
  await expect(dialogo.getByText(detalhe)).toBeVisible();
  await expect(campo).toHaveValue("meu rascunho");
  await campo.fill("meu rascunho, agora à mão");
  await expect(campo).toHaveValue("meu rascunho, agora à mão");
  api.responder("POST /ia/campo", previaPronta());
  await dialogo.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(dialogo.getByRole("region", { name: "Prévia da IA" })).toBeVisible();
});

test("sem limite: diz o motivo em vez de falhar calado, e não oferece tentar de novo o que só volta amanhã", async ({ page }) => {
  const detalhe = "Você chegou ao limite de uso da IA de hoje. Amanhã, a partir da meia-noite, volta a funcionar.";
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", { erro: "limite_ia", detalhe, passaLogo: false }, 429);
  const dialogo = await abrirResultado(page, api);
  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Escrever/ }).click();
  await expect(dialogo.getByText(detalhe)).toBeVisible();
  await expect(dialogo.getByRole("button", { name: "Tentar de novo" })).toHaveCount(0);
});

test("o botão some quando o cliente recusou a IA, com a IA desligada e no escritório só para leitura", async ({ page }) => {
  // IA desligada (a amostra de /eu).
  let dialogo = await abrirResultado(page, new ApiFalsa());
  await expect(dialogo.getByLabel("Em poucas palavras")).toBeVisible();
  await expect(botaoDaIa(dialogo)).toHaveCount(0);

  // Cliente que recusou.
  const semIa = new ApiFalsa().responder("/eu", euComIa).responder(`/publicacoes/${ids.sentenca}`, { ...sentenca, resultado: null, sentenca: { ...sentenca.sentenca }, processo: { ...sentenca.processo, semIa: true } });
  await abrir(page, `/publicacoes?id=${ids.sentenca}`, semIa);
  await page.getByRole("button", { name: "Corrigir" }).click();
  dialogo = page.getByRole("dialog", { name: "Resultado da decisão" });
  await expect(dialogo.getByLabel("Em poucas palavras")).toBeVisible();
  await expect(botaoDaIa(dialogo)).toHaveCount(0);

  // Quem não pode gravar nada também não vê.
  dialogo = await abrirResultado(page, new ApiFalsa().responder("/eu", { ...euComIa, assinatura: { situacao: "so_leitura", acesso: "leitura", aviso: null } }));
  await expect(dialogo.getByLabel("Em poucas palavras")).toBeVisible();
  await expect(botaoDaIa(dialogo)).toHaveCount(0);
});

test("o campo diz quem é o alvo: mensagem ao cliente, com o envio travado enquanto falta dado", async ({ page }) => {
  const MENSAGEM = "00000000-0000-4000-8000-0000000000c1";
  const rascunho = {
    id: MENSAGEM,
    tipo: "decisao",
    situacao: "rascunho",
    envioIncerto: false,
    texto: "Olá, Marina.",
    previa: "*Escritório*\n\nOlá, Marina.\n\nRodapé",
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
  };
  const api = new ApiFalsa().responder("/eu", euComIa).responder("GET /mensagens-cliente", { itens: [rascunho] }).responder("POST /ia/campo", previaPronta({ texto: "Olá, Marina. A audiência é em [a completar]." }));
  await abrir(page, `/prazos/${ids.prazo}`, api);
  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Para o cliente" }) });
  const campo = painel.getByLabel("Texto para Marina Duarte");
  await expect(campo).toHaveValue("Olá, Marina.");
  await botaoDaIa(painel).click();
  await painel.getByRole("button", { name: /^Escrever/ }).click();
  await painel.getByRole("region", { name: "Prévia da IA" }).getByRole("button", { name: "Usar" }).click();
  await expect(campo).toHaveValue("Olá, Marina. A audiência é em [a completar].");
  expect(api.mudancas("/ia/campo").map((p) => (p.corpo as { alvo: unknown }).alvo)).toEqual([{ mensagemId: MENSAGEM }]);
  await expect(painel.getByRole("button", { name: "Aprovar e enviar" })).toBeDisabled();
  await campo.fill("Olá, Marina. A audiência é em 12/03.");
  await expect(painel.getByRole("button", { name: "Aprovar e enviar" })).toBeEnabled();
});

test("instruções da peça: o botão fica no campo, e leva o processo, o prazo e o tipo", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta({ texto: "Concordar com o laudo.", aCompletar: 0 }));
  await abrir(page, `/pecas?id=${ids.peca}`, api);
  const campo = page.getByLabel("Instruções para a IA");
  await expect(campo).toBeVisible();
  const painel = page.locator("section.dc-painel").filter({ has: page.getByRole("heading", { name: "Instruções" }) });
  await botaoDaIa(painel).click();
  await painel.getByRole("button", { name: /^Escrever/ }).click();
  await painel.getByRole("region", { name: "Prévia da IA" }).getByRole("button", { name: "Usar" }).click();
  await expect(campo).toHaveValue("Concordar com o laudo.");
  const { alvo } = api.mudancas("/ia/campo")[0]!.corpo as { alvo: { processoId: string; tipoDePeca: string } };
  expect(alvo.processoId).toBe(amostras.peca!.corpo.processoId);
  expect(alvo.tipoDePeca).toBe(amostras.peca!.corpo.tipo);
});

test("resumo de atendimento: Escrever organiza o que foi anotado, e nada entra sozinho", async ({ page }) => {
  const organizado = "A cliente pediu notícias do laudo.\n\nPróximos passos:\n- Ligar na sexta.";
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta({ texto: organizado, aCompletar: 0 }));
  await abrir(page, `/clientes/${ids.cliente}`, api);
  await page.getByRole("button", { name: "Novo atendimento" }).click();
  const dialogo = page.getByRole("dialog", { name: "Registrar atendimento" });
  const campo = dialogo.getByLabel("O que foi conversado");
  await campo.fill("cliente ligou querendo saber do laudo, ligar sexta");
  await botaoDaIa(dialogo).click();
  await dialogo.getByRole("button", { name: /^Escrever/ }).click();
  await expect(dialogo.getByRole("region", { name: "Prévia da IA" })).toContainText("Próximos passos:");
  await expect(campo).toHaveValue("cliente ligou querendo saber do laudo, ligar sexta");
  await dialogo.getByRole("button", { name: "Usar" }).click();
  await expect(campo).toHaveValue(organizado);
  expect(api.mudancas("/ia/campo").map((p) => p.corpo)).toEqual([{ campo: "resumo-atendimento", modo: "escrever", texto: "cliente ligou querendo saber do laudo, ligar sexta", alvo: { clienteId: ids.cliente } }]);
});

test("observações do prazo, do processo e do cliente têm o botão, cada uma com o seu alvo", async ({ page }) => {
  const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta({ texto: "Anotação.", aCompletar: 0 }));
  const pedirEm = async (dialogo: ReturnType<Page["getByRole"]>, rotulo: string) => {
    await botaoDaIa(dialogo).click();
    await dialogo.getByRole("button", { name: /^Escrever/ }).click();
    await dialogo.getByRole("region", { name: "Prévia da IA" }).getByRole("button", { name: "Usar" }).click();
    await expect(dialogo.getByLabel(rotulo)).toHaveValue("Anotação.");
  };
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await page.getByRole("button", { name: "Ajustar" }).first().click();
  await pedirEm(page.getByRole("dialog", { name: "Ajustar prazo" }), "Observações");
  await abrir(page, `/clientes/${ids.cliente}`, api);
  await page.getByRole("button", { name: "Editar" }).first().click();
  await pedirEm(page.getByRole("dialog").first(), "Observações");
  expect(api.mudancas("/ia/campo").map((p) => (p.corpo as { campo: string; alvo: unknown }).alvo)).toEqual([{ prazoId: ids.prazo }, { clienteId: ids.cliente }]);
  expect(api.mudancas("/ia/campo").every((p) => (p.corpo as { campo: string }).campo === "observacoes")).toBe(true);
});

test.describe("observações do negócio", () => {
  const negocio = amostras.negocios!.corpo.itens.find((n: { id: string }) => n.id === ids.negocio);
  const ORIGINAL = "O cliente prefere contato à tarde.";
  const comObservacoes = { ...amostras.negocios!.corpo, itens: amostras.negocios!.corpo.itens.map((n: { id: string }) => (n.id === ids.negocio ? { ...n, observacoes: ORIGINAL } : n)) };
  async function abrirNegocio(page: Page) {
    const api = new ApiFalsa().responder("/eu", euComIa).responder("GET /negocios", comObservacoes).responder("POST /ia/campo", previaPronta({ texto: "Anotação da IA.", aCompletar: 0 }));
    await abrir(page, "/negocios", api);
    await page.getByText(negocio.nome).first().click();
    const dialogo = page.getByRole("dialog");
    const gravacoes = () => api.mudancas(`/negocios/${ids.negocio}`).map((p) => p.corpo);
    return { api, dialogo, campo: dialogo.getByLabel("Observações"), gravacoes };
  }
  const usarDaIa = async (dialogo: ReturnType<Page["getByRole"]>) => {
    await botaoDaIa(dialogo).click();
    await dialogo.getByRole("button", { name: /^Escrever/ }).click();
    await dialogo.getByRole("region", { name: "Prévia da IA" }).getByRole("button", { name: "Usar" }).click();
  };

  test("Usar só preenche o campo, e fechar sem salvar não troca o que estava guardado", async ({ page }) => {
    const { dialogo, campo, gravacoes } = await abrirNegocio(page);
    await usarDaIa(dialogo);
    await expect(campo).toHaveValue("Anotação da IA.");
    await expect(dialogo.getByText("O texto da IA ainda não foi salvo.")).toBeVisible();
    // Sair do campo também não grava: quem decide é o botão.
    await campo.focus();
    await campo.blur();
    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
    expect(gravacoes()).toEqual([]);
  });

  test("Salvar observações grava o texto da IA", async ({ page }) => {
    const { dialogo, gravacoes } = await abrirNegocio(page);
    await usarDaIa(dialogo);
    await dialogo.getByRole("button", { name: "Salvar observações" }).click();
    await expect.poll(gravacoes).toEqual([{ observacoes: "Anotação da IA." }]);
    await expect(dialogo.getByRole("button", { name: "Salvar observações" })).toHaveCount(0);
  });

  test("Voltar ao texto de antes não grava nada e o botão de salvar some", async ({ page }) => {
    const { dialogo, campo, gravacoes } = await abrirNegocio(page);
    await usarDaIa(dialogo);
    await dialogo.getByRole("button", { name: "Voltar ao texto de antes" }).click();
    await expect(campo).toHaveValue(ORIGINAL);
    await expect(dialogo.getByRole("button", { name: "Salvar observações" })).toHaveCount(0);
    expect(gravacoes()).toEqual([]);
  });

  test("o que a pessoa digita continua sendo gravado ao sair do campo", async ({ page }) => {
    const { campo, gravacoes } = await abrirNegocio(page);
    await campo.fill("Ligar na sexta.");
    await campo.blur();
    await expect.poll(gravacoes).toEqual([{ observacoes: "Ligar na sexta." }]);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a escolha e a prévia cabem em 390 px, sem rolar para o lado", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euComIa).responder("POST /ia/campo", previaPronta());
    await abrir(page, `/publicacoes/${ids.sentenca}`, api.responder(`/publicacoes/${ids.sentenca}`, { ...sentenca, resultado: null }));
    await page.getByRole("button", { name: "Corrigir" }).click();
    const dialogo = page.getByRole("dialog", { name: "Resultado da decisão" });
    const campo = dialogo.getByLabel("Em poucas palavras");
    await campo.fill("ganhamos quase tudo");
    const botao = botaoDaIa(dialogo);
    await botao.click();
    // O alvo de toque do botão, sem cobrir o texto.
    expect((await botao.boundingBox())!.height).toBeGreaterThanOrEqual(36);
    expect(await sobraNaLateral(page)).toBe(0);
    await dialogo.getByRole("button", { name: /^Escrever/ }).click();
    await expect(dialogo.getByRole("region", { name: "Prévia da IA" })).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
    await dialogo.getByRole("button", { name: "Usar" }).click();
    await expect(campo).toHaveValue(TEXTO);
  });
});
