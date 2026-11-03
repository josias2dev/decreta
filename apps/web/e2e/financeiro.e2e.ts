/**
 * Financeiro: os honorários por caso, a tela do escritório, a conta do alvará, a configuração da
 * cobrança (a chave do Asaas nunca volta para a tela), a assinatura no documento e os cartões do Perguntar.
 * Tudo com a API de mentira: nada aqui fala com o Asaas nem com a ZapSign de verdade.
 */
import { expect, test } from "@playwright/test";
import { abrir, abrirCartao, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";
import { conversa, ia, pessoa, uuid } from "./aos-poucos";
import * as R from "./resultados";

type Parcela = {
  id: string;
  descricao: string;
  valor: number | null;
  falta: number | null;
  pago: number;
  vencimento: string | null;
  situacao: string;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; titulo: string } | null;
  vencimentoDaCobranca: { sugerido: string | null; precisaEscolher: boolean; motivo: string | null } | null;
  [campo: string]: unknown;
};

const financeiro = amostras.financeiro!.corpo as { hoje: string; parcelas: Parcela[]; alvarasParaPrestar: { id: string }[] };
const HOJE = "2026-10-29";
const emAtraso = financeiro.parcelas.find((p) => p.situacao === "em_atraso" && p.cliente?.nome === "Roberto Kühn")!;
const aVencer = financeiro.parcelas.find((p) => p.situacao === "a_vencer" && p.valor && p.vencimento && p.vencimento > HOJE)!;
const cobranca = amostras.cobranca!.corpo as Record<string, any>;
const eu = amostras.eu!.corpo;
const escritorio = { ...(amostras.escritorio!.corpo as Record<string, unknown>), demonstracao: false };
/** Um Asaas de mentira ligado, para as telas que mostram o botão de cobrar. */
const comAsaas = { ...cobranca, cofreLigado: true, asaas: { configurado: true, ambiente: "sandbox", avisoLigado: true, conferidaEm: "2026-10-29T12:00:00.000Z", urlDoAviso: null } };
/** O que o servidor devolve depois de marcar o pagamento inteiro. */
const paga = (p: Parcela) => ({ ...p, pago: p.valor, falta: 0, situacao: "paga", pagamentos: [{ id: uuid(900), valor: p.valor, pagoEm: HOJE, forma: "pix", origem: "manual", observacao: null, estornado: false, motivoEstorno: null }] });

test.describe("pagamento que o Asaas recebeu e nenhuma parcela aceitou", () => {
  const geral = amostras.financeiro!.corpo;
  const achado = { em: "2026-10-28T12:00:00.000Z", parcelaId: uuid(901), cobranca: "pay_1", descricao: "Honorários, parcela 1/3", valor: 45_600, motivo: "parcela_cancelada" };

  test("o Financeiro avisa, com o valor, a parcela e o que fazer", async ({ page }) => {
    await abrir(page, "/financeiro", new ApiFalsa().responder("/financeiro", { ...geral, pagamentosSemParcela: [achado] }));
    const aviso = page.locator(".dc-faixa", { hasText: "O Asaas recebeu um pagamento que não entrou no Decreta." });
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("R$ 456,00");
    await expect(aviso).toContainText("Honorários, parcela 1/3");
    await expect(aviso).toContainText("parcela cancelada");
    await expect(aviso).toContainText("marque o pagamento à mão");
  });

  test("sem nada assim, não há aviso", async ({ page }) => {
    await abrir(page, "/financeiro", new ApiFalsa().responder("/financeiro", { ...geral, pagamentosSemParcela: [] }));
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByText("não entrou no Decreta")).toHaveCount(0);
  });
});

test("Financeiro: o atraso aparece e o pagamento só entra com o clique em Marcar como pago", async ({ page }) => {
  const api = new ApiFalsa().responder(`POST /financeiro/parcelas/${emAtraso.id}/pagamentos`, paga(emAtraso));
  await abrir(page, "/financeiro", api);

  await expect(page.getByRole("heading", { name: "Financeiro" })).toBeVisible();
  // Está no grupo "Casos" do menu.
  await expect(page.getByRole("link", { name: /^Financeiro/ }).first()).toBeVisible();
  await expect(page.getByLabel("Números do período").getByText("Alvarás para prestar contas")).toBeVisible();

  await page.getByRole("button", { name: /^Em atraso/ }).click();
  await expect(page).toHaveURL(/situacao=atraso/);
  await page.getByRole("row").filter({ hasText: "Roberto Kühn" }).getByRole("button", { name: emAtraso.descricao }).click();

  const parcela = page.getByRole("dialog", { name: emAtraso.descricao });
  await expect(parcela.getByText("Atrasada há 15 dias")).toBeVisible();
  // A data do pagamento nunca passa de hoje, e o valor já vem com o que falta.
  await expect(parcela.getByLabel("Pago em")).toHaveAttribute("max", HOJE);
  await expect(parcela.getByLabel("Valor pago")).toHaveValue("3.000,00");
  expect(api.mudancas(/pagamentos$/)).toHaveLength(0);

  await parcela.getByRole("button", { name: "Marcar como pago" }).click();
  await expect.poll(() => api.mudancas(`/financeiro/parcelas/${emAtraso.id}/pagamentos`).map((p) => p.corpo)).toEqual([{ valor: 300000, pagoEm: HOJE, forma: "pix", observacao: null }]);
  await expect(page.getByText("Pagamento marcado.")).toBeVisible();
  await expect(parcela.getByText("Paga", { exact: true }).first()).toBeVisible();
});

test("cobrança: parcela vencida pede uma data nova e a que vence vai com a data da parcela, nunca com hoje", async ({ page }) => {
  const emitida = { ...aVencer, cobranca: { provedor: "asaas", link: "https://sandbox.asaas.com/i/teste", vencimento: aVencer.vencimento } };
  const api = new ApiFalsa().responder("/financeiro/cobranca", comAsaas).responder(`POST /financeiro/parcelas/${aVencer.id}/cobranca`, emitida, 201);
  await abrir(page, "/financeiro", api);

  // Vencida: sem data sugerida, o botão espera a escolha.
  await page.getByRole("button", { name: /^Em atraso/ }).click();
  await page.getByRole("row").filter({ hasText: "Roberto Kühn" }).getByRole("button", { name: emAtraso.descricao }).click();
  const vencida = page.getByRole("dialog", { name: emAtraso.descricao });
  await expect(vencida.getByText(/já passou, e a cobrança precisa de uma data de hoje em diante/)).toBeVisible();
  await expect(vencida.getByLabel("Vencimento da cobrança")).toHaveValue("");
  await expect(vencida.getByRole("button", { name: "Emitir cobrança no Asaas" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // A vencer: a data sugerida é a da própria parcela.
  await page.getByRole("button", { name: /^Todas/ }).click();
  await page.getByRole("row").filter({ hasText: aVencer.descricao }).filter({ hasText: aVencer.cliente?.nome ?? "" }).first().getByRole("button", { name: aVencer.descricao }).click();
  const aberta = page.getByRole("dialog");
  await expect(aberta.getByLabel("Vencimento da cobrança")).toHaveValue(aVencer.vencimento!);
  await expect(aberta.getByText("É o vencimento da parcela.")).toBeVisible();
  expect(api.mudancas(/cobranca$/)).toHaveLength(0);
  await aberta.getByRole("button", { name: "Emitir cobrança no Asaas" }).click();
  await expect.poll(() => api.mudancas(`/financeiro/parcelas/${aVencer.id}/cobranca`).map((p) => p.corpo)).toEqual([{ vencimento: aVencer.vencimento }]);
  await expect(page.getByText("Cobrança emitida.")).toBeVisible();
  await expect(aberta.getByRole("link", { name: "Abrir o link de pagamento" })).toHaveAttribute("href", "https://sandbox.asaas.com/i/teste");
});

test("sem o Asaas ligado, a parcela diz que a baixa é manual", async ({ page }) => {
  await abrir(page, "/financeiro?situacao=atraso");
  await page.getByRole("row").filter({ hasText: "Roberto Kühn" }).getByRole("button", { name: emAtraso.descricao }).click();
  const parcela = page.getByRole("dialog", { name: emAtraso.descricao });
  await expect(parcela.getByText(/O Asaas do escritório não está ligado: a baixa é manual/)).toBeVisible();
  await expect(parcela.getByRole("button", { name: "Emitir cobrança no Asaas" })).toHaveCount(0);
});

test("quem não tem o Financeiro não vê o item no menu e a tela explica", async ({ page }) => {
  const semAcesso = { ...eu, usuario: { ...eu.usuario, papel: "member", financeiro: false }, menu: { ...eu.menu, financeiro: undefined } };
  await abrir(page, "/financeiro", new ApiFalsa().responder("/eu", semAcesso));
  await expect(page.getByText("O Financeiro é dos sócios")).toBeVisible();
  await expect(page.getByRole("link", { name: /^Financeiro/ })).toHaveCount(0);
});

test("Configurações > Financeiro: a chave do Asaas é guardada e nunca volta para a tela; a régua entra aprovada", async ({ page }) => {
  const chave = "chave-de-teste-do-asaas-000000000000";
  const ligado = { ...comAsaas, asaas: { ...comAsaas.asaas, ambiente: "producao" } };
  const api = new ApiFalsa()
    .responder("/escritorio", escritorio)
    .responder("/financeiro/cobranca", { ...cobranca, cofreLigado: true })
    .responder("PUT /financeiro/cobranca/asaas", { avisoLigado: true, erroDoAviso: null, estado: ligado });
  await abrir(page, "/configuracoes", api);
  await page.getByRole("tab", { name: "Financeiro" }).click();

  const campo = page.getByLabel("Chave de API do Asaas");
  await expect(campo).toHaveAttribute("type", "password");
  await campo.fill(chave);
  api.responder("/financeiro/cobranca", { ...ligado, textosPadrao: cobranca.textosPadrao });
  await page.getByRole("button", { name: "Guardar e conferir" }).click();
  await expect.poll(() => api.mudancas("/financeiro/cobranca/asaas").map((p) => p.corpo)).toEqual([{ chave, ambiente: "producao" }]);
  await expect(page.getByText("Asaas ligado (produção).")).toBeVisible();
  // A chave saiu do campo e não está em lugar nenhum da página.
  await expect(page.getByLabel("Chave de API do Asaas")).toHaveCount(0);
  expect(await page.content()).not.toContain(chave);

  // Nota fiscal: declarada indisponível, desligada e sem como ligar.
  const nfse = page.getByRole("checkbox", { name: /Nota fiscal \(NFS-e\)/ });
  await expect(nfse).toBeDisabled();
  await expect(nfse).not.toBeChecked();

  // A régua: os textos sugeridos, ligada e aprovada num clique só.
  await page.getByRole("button", { name: "Começar pelos textos sugeridos" }).click();
  await expect(page.getByLabel("Texto do lembrete")).toHaveCount(3);
  await page.getByRole("checkbox", { name: /Ligar a régua de lembretes/ }).check();
  await page.getByRole("button", { name: "Aprovar e salvar" }).click();
  await expect.poll(() => api.mudancas("/financeiro/cobranca/opcoes").length).toBe(1);
  const corpo = api.mudancas("/financeiro/cobranca/opcoes")[0]!.corpo as { regua: { ligada: boolean; passos: { dias: number; texto: string }[] } };
  expect(corpo.regua.ligada).toBe(true);
  expect(corpo.regua.passos.map((p) => p.dias)).toEqual([-3, 0, 3]);
  expect(corpo.regua.passos[0]!.texto).toContain("{cliente}");
});

test("Configurações > Financeiro: sócio vê a aba e quem não é sócio não", async ({ page }) => {
  const semAcesso = { ...eu, usuario: { ...eu.usuario, papel: "member", financeiro: false } };
  await abrir(page, "/configuracoes", new ApiFalsa().responder("/eu", semAcesso));
  await expect(page.getByRole("tab", { name: "Calendário" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Financeiro" })).toHaveCount(0);
});

test("alvará sacado: a conta do honorário e da parte do cliente aparece e só vale depois de Confirmar a conta", async ({ page }) => {
  const conta = amostras.contaDoAlvara!.corpo as { alvara: { id: string; descricao: string }; contrato: { id: string }; conta: { honorario: number; cliente: number } };
  const api = new ApiFalsa();
  await abrir(page, "/alvaras", api);
  await page.getByRole("button", { name: /Ana Lúcia Ferraz/ }).first().click();
  const alvara = page.getByRole("dialog", { name: conta.alvara.descricao });
  const secao = alvara.getByRole("region", { name: "Do alvará ao honorário" });
  await expect(secao.getByLabel("A conta do alvará").getByText("R$ 1.045,00")).toBeVisible();
  await expect(secao.getByLabel("A conta do alvará").getByText("R$ 3.135,00")).toBeVisible();
  await expect(secao.getByText("Honorários do escritório (25% de R$ 4.180,00)")).toBeVisible();
  expect(api.mudancas(/prestacao$/)).toHaveLength(0);

  await secao.getByRole("button", { name: "Confirmar a conta" }).click();
  await expect.poll(() => api.mudancas(`/financeiro/alvaras/${conta.alvara.id}/prestacao`).map((p) => p.corpo)).toEqual([{ contratoId: conta.contrato.id, honorario: 104500, cliente: 313500, retidoNoSaque: false }]);
  await expect(page.getByText("Conta confirmada. A prestação de contas está pronta.")).toBeVisible();
});

test("processo: a aba Honorários mostra o contrato e o aviso de processo sem honorário se dispensa", async ({ page }) => {
  const api = new ApiFalsa();
  await abrir(page, `/processos/${ids.processo}?aba=honorarios`, api);
  await expect(page.getByRole("tab", { name: "Honorários" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Honorários · Marina Duarte × Seguradora Alfa S.A.").first()).toBeVisible();
  await expect(page.getByText("Híbrido · êxito de 25%")).toBeVisible();

  const semContrato = new ApiFalsa().responder(`/financeiro/processos/${ids.processo}`, { ...(amostras.financeiroDoProcesso!.corpo as object), contratos: [], semHonorario: true });
  await abrir(page, `/processos/${ids.processo}`, semContrato);
  const aviso = page.getByRole("note").filter({ hasText: "Este processo ainda não tem honorário registrado." });
  await expect(aviso).toBeVisible();
  await aviso.getByRole("button", { name: "Dispensar" }).click();
  await expect.poll(() => semContrato.mudancas(`/financeiro/processos/${ids.processo}/aviso`).map((p) => p.corpo)).toEqual([{ dispensar: true }]);
});

test("novo contrato no cliente: o êxito nasce sem valor e o fixo mostra cada parcela antes de guardar", async ({ page }) => {
  const api = new ApiFalsa();
  await abrir(page, `/clientes/${ids.cliente}`, api);
  await page.getByRole("button", { name: "Novo contrato" }).click();
  const dialogo = page.getByRole("dialog", { name: "Novo contrato de honorários" });

  // Êxito: só o percentual; a parcela nasce sem valor, para o dia em que sair o resultado.
  const previa = dialogo.getByLabel("Parcelas do contrato");
  await expect(previa.getByText("sem valor ainda")).toBeVisible();
  await expect(previa.getByText("no resultado")).toBeVisible();
  await dialogo.getByLabel("Percentual de êxito").fill("12,5");
  await dialogo.getByRole("button", { name: "Guardar contrato" }).click();
  await expect.poll(() => api.mudancas("/financeiro/contratos").map((p) => p.corpo)).toEqual([expect.objectContaining({ tipo: "exito", exitoBp: 1250, clienteId: ids.cliente })]);

  // Valor fixo em 3 parcelas: R$ 4.000,00 em cada, com o vencimento de cada mês.
  await page.getByRole("button", { name: "Novo contrato" }).click();
  const outro = page.getByRole("dialog", { name: "Novo contrato de honorários" });
  await outro.getByRole("radio", { name: "Valor fixo" }).click();
  await outro.getByLabel("Valor total").fill("12.000,00");
  await outro.getByLabel("Parcelas", { exact: true }).fill("3");
  await outro.getByLabel("Primeiro vencimento").fill("2026-11-10");
  const parcelas = outro.getByLabel("Parcelas do contrato");
  await expect(parcelas.getByText("R$ 4.000,00")).toHaveCount(3);
  await expect(parcelas.getByText("10/11")).toBeVisible();
  await expect(parcelas.getByText("10/12")).toBeVisible();
  await expect(parcelas.getByText("10/01")).toBeVisible();
});

test("documento: enviar para assinatura aparece só com o interruptor ligado e o assinado volta para a pasta", async ({ page }) => {
  const doc = (amostras.documentos!.corpo.itens as { id: string; nome: string }[]).find((d) => d.nome === "Laudo pericial.docx")!;
  const enviada = { id: uuid(700), documentoId: doc.id, situacao: "enviada", signatarios: [{ nome: "Marina Duarte", email: "marina@exemplo.test", situacao: "new" }], enviadaEm: "2026-10-29T12:40:00.000Z", assinadaEm: null, documentoAssinadoId: null };
  const assinada = { ...enviada, situacao: "assinada", assinadaEm: "2026-10-29T13:10:00.000Z", documentoAssinadoId: uuid(701), signatarios: [{ nome: "Marina Duarte", email: "marina@exemplo.test", situacao: "signed" }] };

  // Desligado: nada de assinatura na tela (baixar e anexar continua como sempre).
  await abrir(page, `/documentos?doc=${doc.id}`, new ApiFalsa().responder("/escritorio", { ...escritorio, assinaturaLigada: false }));
  await expect(page.getByRole("heading", { name: doc.nome })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar para assinatura" })).toHaveCount(0);

  const api = new ApiFalsa().responder("/escritorio", { ...escritorio, assinaturaLigada: true }).responder(`/documentos/${doc.id}/assinaturas`, { itens: [] }).responder(`POST /documentos/${doc.id}/assinatura`, enviada, 201);
  await abrir(page, `/documentos?doc=${doc.id}`, api);
  await page.getByRole("button", { name: "Enviar para assinatura" }).click();
  const dialogo = page.getByRole("dialog", { name: "Enviar para assinatura" });
  const enviar = dialogo.getByRole("button", { name: "Enviar", exact: true });
  await expect(enviar).toBeDisabled();
  await dialogo.getByLabel("Nome completo").fill("Marina Duarte");
  await dialogo.getByLabel("E-mail").fill("marina@exemplo.test");
  api.responder(`/documentos/${doc.id}/assinaturas`, { itens: [enviada] });
  await enviar.click();
  await expect.poll(() => api.mudancas(`/documentos/${doc.id}/assinatura`).map((p) => p.corpo)).toEqual([{ signatarios: [{ nome: "Marina Duarte", email: "marina@exemplo.test" }] }]);
  const faixa = page.getByRole("region", { name: "Assinatura eletrônica" });
  await expect(faixa.getByText("Aguardando assinaturas")).toBeVisible();

  // Atualizar pergunta à ZapSign; todos assinaram: o arquivo assinado já está na pasta.
  api.responder(`POST /assinaturas/${enviada.id}/atualizar`, assinada);
  api.responder(`/documentos/${doc.id}/assinaturas`, { itens: [assinada] });
  await faixa.getByRole("button", { name: "Atualizar" }).click();
  await expect(page.getByText("Todos assinaram. O arquivo assinado já está na pasta.")).toBeVisible();
  await expect(faixa.getByText("Assinada por todos")).toBeVisible();
  await expect(faixa.getByRole("link", { name: "Abrir o arquivo assinado" })).toBeVisible();
});

test.describe("Perguntar", () => {
  const CONVERSA = uuid(800);
  const comIa = () => new ApiFalsa().responder("/eu", euComIa);
  const abrirResposta = (page: Parameters<typeof abrir>[0], partes: unknown[]) =>
    abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Financeiro", [pessoa(uuid(801), "Quem está devendo?"), ia(uuid(802), partes)])));

  test("quem está devendo, honorários do mês e alvarás parados viram cartões que levam ao Financeiro", async ({ page }) => {
    const devedores = {
      total: 2,
      valorTotalCentavos: 450000,
      valorTotal: "R$ 4.500,00",
      itens: [
        { id: ids.cliente, nome: "Roberto Kühn", telefone: "(47) 99123-4567", parcelasEmAtraso: 1, emAtrasoCentavos: 300000, emAtraso: "R$ 3.000,00", maisAntigaDesde: "2026-10-14", diasDoMaisAntigo: 15 },
        { id: uuid(41), nome: "Padaria Bom Grão", telefone: null, parcelasEmAtraso: 2, emAtrasoCentavos: 150000, emAtraso: "R$ 1.500,00", maisAntigaDesde: "2026-10-20", diasDoMaisAntigo: 9 },
      ],
    };
    const honorarios = {
      total: 1,
      valorTotalCentavos: 250000,
      valorTotal: "R$ 2.500,00",
      itens: [
        { id: uuid(42), descricao: "Honorários · parcela 3/4", situacao: "a_vencer", vencimento: "2026-11-07", diasEmAtraso: 0, valorCentavos: 250000, valor: "R$ 2.500,00", pagoCentavos: 0, pago: "R$ 0,00", faltaCentavos: 250000, falta: "R$ 2.500,00", contrato: "Honorários · Hotel Mar Azul", cliente: { id: uuid(43), nome: "Hotel Mar Azul" }, processo: null },
      ],
    };
    const alvaras = {
      total: 1,
      valorTotal: "4180.00",
      itens: [{ id: uuid(44), descricao: "Depósito judicial do réu", valor: "4180.00", valorRecebido: null, etapa: "aguardando_saque", expedidoEm: "2026-10-05", sacadoEm: null, diasNaEtapa: 24, parado: true, processo: { id: ids.processo, titulo: "Ana Lúcia Ferraz × Banco Horizonte S.A." } }],
    };
    await abrirResposta(page, [R.ferramenta("f1", "buscarDevedores", devedores), R.ferramenta("f2", "buscarHonorarios", honorarios), R.ferramenta("f3", "buscarAlvaras", alvaras, { parados: true }), R.texto("Dois clientes estão devendo.")]);

    const quem = await abrirCartao(page, "Quem está devendo");
    await expect(quem.getByText("1 parcela em atraso · a mais antiga há 15 dias")).toBeVisible();
    await expect(quem.getByText("R$ 3.000,00")).toBeVisible();
    await expect(quem.getByRole("link", { name: "Roberto Kühn" })).toHaveAttribute("href", new RegExp(`/financeiro\\?.*cliente=${ids.cliente}`));
    await page.keyboard.press("Escape");

    const mes = await abrirCartao(page, "Honorários");
    await expect(mes.getByText("Hotel Mar Azul")).toBeVisible();
    await expect(mes.getByText("vence em 07/11")).toBeVisible();
    await page.keyboard.press("Escape");

    const parados = await abrirCartao(page, "Alvarás");
    await expect(parados.getByText(/24 dias na etapa/)).toBeVisible();
    await expect(parados.getByText("Parado · Aguardando saque")).toBeVisible();
  });

  test("as sugestões de dinheiro só aparecem para quem vê o Financeiro", async ({ page }) => {
    await abrir(page, "/perguntar", comIa());
    await expect(page.getByRole("button", { name: /Quem está devendo/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Honorários do mês/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Alvarás parados/ })).toBeVisible();

    await abrir(page, "/perguntar", new ApiFalsa().responder("/eu", { ...euComIa, usuario: { ...euComIa.usuario, papel: "member", financeiro: false } }));
    await expect(page.getByRole("button", { name: /Alvarás parados/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Quem está devendo/ })).toHaveCount(0);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("Financeiro cabe na tela, o campo do valor tem 16 px e os toques têm 44 px", async ({ page }) => {
    await abrir(page, "/financeiro?situacao=atraso");
    const linha = page.locator(".dc-item").first();
    await expect(linha).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
    expect(await linha.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await page.getByRole("button", { name: "Novo contrato" }).evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);

    await linha.tap();
    const dialogo = page.getByRole("dialog");
    const campo = dialogo.getByLabel("Valor pago");
    await expect(campo).toBeVisible();
    expect(await campo.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("processo: as quatro abas continuam cabendo e os honorários vêm no fim do resumo", async ({ page }) => {
    await abrir(page, `/processos/${ids.processo}`);
    await expect(page.getByRole("tablist").getByRole("tab")).toHaveCount(4);
    await expect(page.getByRole("heading", { name: "Honorários" })).toBeVisible();
    await expect(page.getByText("Híbrido · êxito de 25%")).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("Configurações: a cobrança do Financeiro vem no fim de Avisos, sem uma oitava aba, e cabe na tela", async ({ page }) => {
    await abrir(page, "/configuracoes", new ApiFalsa().responder("/escritorio", escritorio).responder("/financeiro/cobranca", { ...cobranca, cofreLigado: true }));
    await expect(page.getByRole("tab", { name: "Financeiro" })).toHaveCount(0);
    await page.getByRole("tab", { name: "Avisos" }).tap();
    await expect(page.getByLabel("Chave de API do Asaas")).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
    expect(await page.getByLabel("Chave de API do Asaas").evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16);
  });
});
