/**
 * A peça que prova o que diz, na tela: a lista "antes de protocolar", o fato que
 * abre o trecho, a estratégia editável, o ajuste com prévia e o julgado do acervo.
 * As respostas saem das rotas de verdade (apps/api/test/amostras.ts), com a IA de
 * mentira; o que o modelo escreve de verdade não é medido aqui.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

const peca = amostras.pecaConferida!.corpo;
const emPeca = `/pecas?id=${ids.pecaConferida}`;
const comIa = () => new ApiFalsa().responder("/eu", euComIa);
const lista = (page: Page) => page.getByRole("list", { name: "Pontos em aberto" });

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("antes de protocolar: a frase quebrada, o campo em branco e o que não bate, sem bloquear nada", async ({ page }) => {
    await abrir(page, emPeca);
    const pontos = lista(page);
    await expect(pontos.getByText('Frase quebrada: falta o que vem depois de "em".')).toBeVisible();
    await expect(pontos.getByText("Frase quebrada: falta a data.")).toBeVisible();
    await expect(pontos.getByText("Campo sem preencher: [cidade].")).toBeVisible();
    await expect(pontos.getByText("Fato a comprovar: prova do atendimento do sinistro.")).toBeVisible();
    await expect(pontos.getByText("O valor 45% não está em Laudo pericial.docx · evento 87.")).toBeVisible();
    await expect(pontos.getByText("O valor R$ 77.000,00 não aparece nos autos.")).toBeVisible();
    await expect(pontos.getByText("Falta o julgado sobre: seguro invalidez parcial proporcional.")).toBeVisible();
  });

  test("o clique no ponto leva ao parágrafo, em destaque", async ({ page }) => {
    await abrir(page, emPeca);
    await lista(page).getByRole("button", { name: "Campo sem preencher: [cidade]." }).click();
    const destaque = page.locator(".dc-folha .is-ponto");
    await expect(destaque).toContainText("[cidade], [data].");
    await expect(destaque).toBeInViewport();
  });

  test("editando, o clique no ponto seleciona o trecho no editor, e a checagem acompanha a digitação", async ({ page }) => {
    await abrir(page, emPeca);
    await page.getByRole("button", { name: "Editar texto" }).click();
    const editor = page.getByLabel("Texto da peça");
    await expect(editor).toHaveValue(/\[A COMPROVAR: prova do atendimento do sinistro\]/);
    await lista(page).getByRole("button", { name: "Campo sem preencher: [cidade]." }).click();
    expect(await editor.evaluate((e: HTMLTextAreaElement) => e.value.slice(e.selectionStart, e.selectionEnd))).toBe("[cidade]");
    await editor.fill(`${peca.texto}\n\nNesta frase ficou <mention id="1"> no meio.`);
    await expect(lista(page).getByText("Marca interna no texto. Apague antes de protocolar.")).toBeVisible();
  });

  test("baixar com pontos em aberto avisa e deixa baixar assim mesmo", async ({ page }) => {
    await abrir(page, emPeca);
    await page.getByRole("link", { name: /Baixar DOCX no timbre/ }).click();
    const aviso = page.getByRole("dialog", { name: "Antes de protocolar" });
    await expect(aviso.getByText(/pontos em aberto nesta peça/)).toBeVisible();
    await expect(aviso.getByText("Campo sem preencher: [cidade].")).toBeVisible();
    await expect(aviso.getByRole("link", { name: "Baixar assim mesmo" })).toHaveAttribute("href", new RegExp(`/api/app/pecas/${ids.pecaConferida}/docx`));
    await aviso.getByRole("button", { name: "Voltar ao texto" }).click();
    await expect(aviso).toHaveCount(0);
  });

  test("sem pontos em aberto, baixar não pergunta nada", async ({ page }) => {
    const limpa = { ...peca, texto: "Texto completo da peça, sem nada em aberto.", conferencia: { ...peca.conferencia, atual: true, fatos: [], avisos: [] }, julgados: [] };
    await abrir(page, emPeca, new ApiFalsa().responder(`/pecas/${ids.pecaConferida}`, limpa));
    await expect(page.getByText("Sem colchete, campo vazio, frase quebrada ou marca interna no texto.")).toBeVisible();
    await page.route("**/docx", (r) => r.fulfill({ status: 200, contentType: "application/octet-stream", body: "docx" }));
    await page.getByRole("link", { name: /Baixar DOCX no timbre/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("o fato conferido abre o trecho, o documento e o motivo; o a comprovar fica marcado na folha", async ({ page }) => {
    await abrir(page, emPeca);
    const folha = page.locator(".dc-folha").first();
    await expect(folha.locator("mark", { hasText: "[A COMPROVAR: prova do atendimento do sinistro]" })).toBeVisible();

    await folha.getByRole("button", { name: /O perito concluiu pelo nexo causal/ }).click();
    const aberto = page.getByRole("dialog", { name: "De onde saiu este fato" });
    await expect(aberto.getByText("Confere com a fonte")).toBeVisible();
    await expect(aberto.getByText("há nexo causal entre o acidente de trânsito de 18/01/2026 e as lesões")).toBeVisible();
    await expect(aberto.getByText("Laudo pericial.docx · evento 87")).toBeVisible();
    const fato = peca.conferencia.fatos[0];
    await expect(aberto.getByRole("link", { name: "Abrir o documento" })).toHaveAttribute("href", new RegExp(`doc=${fato.fonte.documentoId}`));
    await aberto.getByRole("button", { name: "Fechar" }).click();

    await folha.getByRole("button", { name: /O laudo fixou a incapacidade em 45%/ }).click();
    await expect(aberto.getByText("Não bate com a fonte")).toBeVisible();
    await expect(aberto.getByText("O valor 45% não está em Laudo pericial.docx · evento 87.")).toBeVisible();
    await aberto.getByRole("button", { name: "Fechar" }).click();

    await page.getByRole("list", { name: "Fatos da peça" }).getByRole("button", { name: /A seguradora sempre tratou/ }).click();
    await expect(aberto.getByText("A comprovar", { exact: true })).toBeVisible();
    await expect(aberto.getByText(/sai como \[COMPLETAR: \.\.\.\]/)).toBeVisible();
    await expect(aberto.getByRole("link", { name: /Abrir o documento/ })).toHaveCount(0);
  });

  test("a peça gerada passa sozinha pela conferência dos fatos, antes de ser entregue", async ({ page }) => {
    const api = comIa().responder(`/pecas/${ids.pecaConferida}`, peca);
    await api.ligar(page);
    await page.clock.setFixedTime(new Date("2026-10-29T09:30:00-03:00"));
    await page.route("**/api/app/pecas", (r) => (r.request().method() === "POST" ? r.fulfill({ status: 200, contentType: "text/plain", headers: { "x-peca-id": ids.pecaConferida }, body: peca.texto }) : r.fallback()));
    await page.goto(`/pecas?prazo=${ids.prazo}`);
    await page.getByRole("button", { name: "Gerar direto" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}/conferir-fatos`).length).toBe(1);
    await expect(page).toHaveURL(new RegExp(`id=${ids.pecaConferida}`));
    await expect(page.getByRole("list", { name: "Fatos da peça" })).toBeVisible();
  });

  test("o painel dos fatos resume a conferência e oferece conferir de novo", async ({ page }) => {
    const api = comIa();
    await abrir(page, emPeca, api);
    await expect(page.getByText("1 confere com a fonte · 1 com aviso · 2 a comprovar")).toBeVisible();
    await page.getByRole("button", { name: "Conferir de novo" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}/conferir-fatos`).length).toBe(1);
  });

  test("texto que mudou depois da conferência: o aviso aparece e as marcas de fato deixam de valer", async ({ page }) => {
    const mudou = { ...peca, conferencia: { ...peca.conferencia, atual: false } };
    await abrir(page, emPeca, new ApiFalsa().responder(`/pecas/${ids.pecaConferida}`, mudou));
    await expect(lista(page).getByText("O texto mudou depois da conferência dos fatos. Confira de novo.")).toBeVisible();
    await expect(page.getByText("O texto mudou depois da conferência. Confira de novo.")).toBeVisible();
    await expect(page.locator(".dc-folha").first().getByRole("button", { name: /O perito concluiu/ })).toHaveCount(0);
  });

  test("estratégia: partes do cadastro, evidência conferida, editar, reordenar, remover e responder", async ({ page }) => {
    const api = comIa().responder("POST /pecas/estrategia", amostras.estrategiaDaPeca!.corpo);
    await abrir(page, `/pecas?prazo=${ids.prazo}`, api);
    await page.getByRole("button", { name: "Montar estratégia" }).click();

    const estrategia = page.locator(".dc-estrategia");
    await expect(estrategia.getByRole("region", { name: "Partes" }).getByText("Marina Duarte")).toBeVisible();
    await expect(estrategia.getByText(/Pessoa física · polo ativo · nosso cliente/)).toBeVisible();
    await expect(estrategia.getByText("Incapacidade parcial e permanente, fixada em 40%", { exact: false })).toBeVisible();
    await expect(estrategia.getByText(/não achei este trecho na fonte/)).toBeVisible();
    await expect(estrategia.getByText(/Sem prova nos autos\. Falta: prova da demora no atendimento do sinistro/)).toBeVisible();

    await estrategia.getByLabel("Título da tese 1").fill("O laudo fecha a questão da incapacidade");
    await estrategia.getByRole("button", { name: "Remover Dano moral pela demora no sinistro" }).click();
    await estrategia.getByRole("button", { name: "Subir Do pedido de esclarecimentos" }).click();
    await estrategia.getByRole("button", { name: "Acrescentar capítulo" }).click();
    await estrategia.getByRole("textbox", { name: "Capítulo 4" }).fill("Da complementação");
    await estrategia.getByLabel("A autora quer a complementação do valor já neste momento?").fill("Sim, já neste momento.");

    await page.getByRole("button", { name: "Gerar com esta estratégia" }).click();
    await expect.poll(() => api.mudancas("/pecas")[0]?.corpo).toMatchObject({ processoId: ids.processo, prazoId: ids.prazo });
    const { estrategia: enviada } = api.mudancas("/pecas")[0]!.corpo as { estrategia: { teses: { titulo: string }[]; capitulos: { titulo: string }[]; perguntas: { resposta: string }[] } };
    expect(enviada.teses.map((t) => t.titulo)).toEqual(["O laudo fecha a questão da incapacidade", "A vistoria não era necessária"]);
    expect(enviada.capitulos.map((c) => c.titulo)).toEqual(["Do pedido de esclarecimentos", "Do laudo", "Dos pedidos", "Da complementação"]);
    expect(enviada.perguntas[0]!.resposta).toBe("Sim, já neste momento.");
  });

  test("a estratégia sem resposta da IA diz por quê, e dá para gerar direto", async ({ page }) => {
    const api = comIa().responder("POST /pecas/estrategia", { situacao: "recusa", estrategia: null, recusa: "Sem a petição da ré não dá para propor teses." });
    await abrir(page, `/pecas?prazo=${ids.prazo}`, api);
    await page.getByRole("button", { name: "Montar estratégia" }).click();
    await expect(page.getByText("Sem a petição da ré não dá para propor teses.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Gerar direto" })).toBeEnabled();
  });

  test("ajuste: mostra o antes e o depois, aplica só quando a pessoa manda", async ({ page }) => {
    const ajuste = amostras.ajusteDaPeca!.corpo;
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/ajuste`, ajuste);
    await abrir(page, emPeca, api);
    await page.getByLabel("O que ajustar na peça").fill("Tire o que não tem prova.");
    await page.getByRole("button", { name: "Ver a prévia" }).click();
    const previa = page.getByRole("dialog", { name: "Antes e depois" });
    await expect(previa.getByText("Tirei a frase sem prova e o valor que não está nos autos.")).toBeVisible();
    const diferenca = previa.getByLabel("O texto, com o que saiu e o que entrou");
    await expect(diferenca.locator("del", { hasText: "R$ 77.000,00" })).toBeVisible();
    await expect(diferenca.locator("del", { hasText: "A seguradora sempre tratou" })).toBeVisible();
    await expect(diferenca.locator("ins", { hasText: "julgamento do valor da indenização" })).toBeVisible();
    expect(api.mudancas(`/pecas/${ids.pecaConferida}`)).toEqual([]);

    await previa.getByRole("button", { name: "Aplicar" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}`)[0]?.corpo).toEqual({ texto: ajuste.texto });
    await expect(previa).toHaveCount(0);
  });

  test("ajuste: ajustar parte da proposta, e descartar não salva nada", async ({ page }) => {
    const ajuste = amostras.ajusteDaPeca!.corpo;
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/ajuste`, ajuste);
    await abrir(page, emPeca, api);
    await page.getByLabel("O que ajustar na peça").fill("Tire o que não tem prova.");
    await page.getByRole("button", { name: "Ver a prévia" }).click();
    const previa = page.getByRole("dialog", { name: "Antes e depois" });
    await previa.getByLabel("O que mais ajustar").fill("Reforce o pedido de homologação.");
    await previa.getByRole("button", { name: "Ajustar" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}/ajuste`)[1]?.corpo).toEqual({ pedido: "Reforce o pedido de homologação.", base: ajuste.texto, anteriores: ["Tire o que não tem prova."] });
    await previa.getByRole("button", { name: "Descartar" }).click();
    await expect(previa).toHaveCount(0);
    expect(api.mudancas(`/pecas/${ids.pecaConferida}`)).toEqual([]);
  });

  test("ajuste: a recusa da IA aparece, e nada abre", async ({ page }) => {
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/ajuste`, { texto: null, resumo: null, naoAplicadas: [], avisos: [], recusa: "O material não traz a data da vistoria." });
    await abrir(page, emPeca, api);
    await page.getByLabel("O que ajustar na peça").fill("Diga a data da vistoria.");
    await page.getByRole("button", { name: "Ver a prévia" }).click();
    await expect(page.getByText("O material não traz a data da vistoria.")).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("julgados: candidatos com selo, tribunal, trecho e papel, o que aponta para cada lado e o que o acervo não cobre", async ({ page }) => {
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/julgados/buscar`, amostras.julgadosDaTese!.corpo).responder(`POST /pecas/${ids.pecaConferida}/julgados/inserir`, { texto: "x", julgados: [] });
    await abrir(page, emPeca, api);
    await page.getByRole("list", { name: "Teses a pesquisar" }).getByRole("button", { name: "Buscar no acervo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Julgados do acervo" });
    await expect(dialogo.getByText("1 a favor da tese · 1 só tangencia")).toBeVisible();
    const candidatos = dialogo.getByRole("list", { name: "Candidatos do acervo" }).getByRole("listitem");
    await expect(candidatos.first().getByText("Súmula 474 do STJ")).toBeVisible();
    await expect(candidatos.first().getByText("Verificada")).toBeVisible();
    await expect(candidatos.first().getByText("Enfrenta a questão")).toBeVisible();
    await expect(candidatos.first().getByText("será paga de forma proporcional ao grau da invalidez")).toBeVisible();
    await expect(candidatos.nth(1).getByText("Só tangencia")).toBeVisible();
    await expect(dialogo.getByText(/Acórdãos com número de processo/)).toBeVisible();

    await expect(dialogo.getByRole("button", { name: "Pôr na peça" })).toBeDisabled();
    await candidatos.first().getByRole("checkbox").check();
    await dialogo.getByRole("button", { name: "Pôr na peça" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}/julgados/inserir`)[0]?.corpo).toEqual({ tese: "seguro invalidez parcial proporcional", escolhidos: [{ chave: "sumula:STJ:474", trecho: "será paga de forma proporcional ao grau da invalidez" }] });
    await expect(dialogo).toHaveCount(0);
  });

  test("julgados: sem resultado, a explicação diz o que acontece com a marca", async ({ page }) => {
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/julgados/buscar`, amostras.julgadosSemResultado!.corpo);
    await abrir(page, emPeca, api);
    await page.getByRole("button", { name: "Buscar no acervo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Julgados do acervo" });
    await expect(dialogo.getByText(/A marca continua no texto/)).toBeVisible();
    await expect(dialogo.getByRole("button", { name: "Pôr na peça" })).toBeDisabled();
  });

  test("o julgado escolhido aparece com o selo, e a citação no texto é a que o servidor montou", async ({ page }) => {
    await abrir(page, emPeca, comIa().responder(`/pecas/${ids.pecaConferida}`, amostras.pecaComJulgado!.corpo));
    const painel = page.getByRole("list", { name: "Julgados na peça" });
    await expect(painel.getByText("Súmula 474 do STJ", { exact: true })).toBeVisible();
    await expect(painel.getByText("Verificada")).toBeVisible();
    await expect(page.locator(".dc-folha").first().getByText(/Nesse sentido: Súmula 474 do STJ, "será paga de forma proporcional ao grau da invalidez"\./)).toBeVisible();
    await expect(page.getByRole("list", { name: "Teses a pesquisar" })).toHaveCount(0);
  });

  test("sem a IA: sem estratégia nem ajuste, e o código ainda confere datas e valores", async ({ page }) => {
    const semConferir = { ...peca, conferencia: null };
    const api = new ApiFalsa().responder(`/pecas/${ids.pecaConferida}`, semConferir);
    await abrir(page, emPeca, api);
    await expect(page.getByRole("button", { name: /Montar estratégia|Rever a estratégia/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Ver a prévia" })).toHaveCount(0);
    await expect(lista(page).getByText("Os fatos ainda não foram conferidos nos autos.")).toBeVisible();
    await page.getByRole("button", { name: "Conferir datas e valores" }).click();
    await expect.poll(() => api.mudancas(`/pecas/${ids.pecaConferida}/conferir-fatos`).length).toBe(1);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("a lista, os fatos e os julgados cabem na tela, com alvos de 44 px", async ({ page }) => {
    await abrir(page, emPeca, comIa());
    const item = lista(page).getByRole("button").first();
    await expect(item).toBeVisible();
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const fato = page.getByRole("list", { name: "Fatos da peça" }).getByRole("button").first();
    expect((await fato.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const buscar = page.getByRole("button", { name: "Buscar no acervo" });
    expect((await buscar.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("o clique no ponto sobe até o parágrafo", async ({ page }) => {
    await abrir(page, emPeca);
    await lista(page).getByRole("button", { name: "Campo sem preencher: [cidade]." }).click();
    await expect(page.locator(".dc-folha .is-ponto")).toBeInViewport();
  });

  test("a estratégia no celular: campos de 16 px, botões de 44 px e nada para o lado", async ({ page }) => {
    const api = comIa().responder("POST /pecas/estrategia", amostras.estrategiaDaPeca!.corpo);
    await abrir(page, `/pecas?prazo=${ids.prazo}`, api);
    await page.getByRole("button", { name: "Montar estratégia" }).click();
    const titulo = page.getByLabel("Título da tese 1");
    await expect(titulo).toBeVisible();
    expect(await titulo.evaluate((e) => getComputedStyle(e).fontSize)).toBe("16px");
    const remover = page.getByRole("button", { name: /^Remover / }).first();
    const caixa = (await remover.boundingBox())!;
    expect(caixa.height).toBeGreaterThanOrEqual(44);
    expect(caixa.width).toBeGreaterThanOrEqual(44);
    await expect(page.getByRole("button", { name: "Gerar com esta estratégia" })).toBeInViewport();
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("a prévia do ajuste e os julgados no celular cabem na tela", async ({ page }) => {
    const api = comIa().responder(`POST /pecas/${ids.pecaConferida}/ajuste`, amostras.ajusteDaPeca!.corpo).responder(`POST /pecas/${ids.pecaConferida}/julgados/buscar`, amostras.julgadosDaTese!.corpo);
    await abrir(page, emPeca, api);
    await page.getByLabel("O que ajustar na peça").fill("Tire o que não tem prova.");
    await page.getByRole("button", { name: "Ver a prévia" }).click();
    const previa = page.getByRole("dialog", { name: "Antes e depois" });
    await expect(previa.locator("ins").first()).toBeVisible();
    expect((await previa.getByRole("button", { name: "Aplicar" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await previa.getByRole("button", { name: "Descartar" }).click();

    await page.getByRole("button", { name: "Buscar no acervo" }).click();
    const dialogo = page.getByRole("dialog", { name: "Julgados do acervo" });
    await expect(dialogo.getByText("Súmula 474 do STJ")).toBeVisible();
    expect((await dialogo.locator(".dc-julgado__topo").first().boundingBox())!.height).toBeGreaterThanOrEqual(44);
    expect(await sobraNaLateral(page)).toBe(0);
  });
});
