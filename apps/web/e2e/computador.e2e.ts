/** Telas no computador (1440 de largura), com as respostas da demonstração. */
import { expect, test } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";

test("sem sessão, vai para Entrar e volta para onde ia", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, `/prazos/${ids.prazo}`, api);
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("redirect")).toBe(`/prazos/${ids.prazo}`);
});

test("landing: sem sessão fica na página, as abas da IA trocam e Entrar abre o login", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, "/", api);
  await expect(page.getByRole("heading", { name: /O escritório em dia/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  const abas = page.getByRole("tablist").first();
  await abas.getByRole("tab", { name: /Peça em Word/ }).click();
  await expect(abas.getByRole("tab", { name: /Peça em Word/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-painel="peca"]')).toBeVisible();
  await expect(page.locator('[data-painel="briefing"]')).toBeHidden();
  await expect(page.locator(".lp-hero").getByRole("link", { name: "Pedir acesso" })).toHaveAttribute("href", /^https:\/\/wa\.me\/55\d+\?text=/);
  await page.locator(".lp-topo").getByRole("link", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("landing: com sessão vai direto para Hoje", async ({ page }) => {
  await abrir(page, "/");
  await expect(page).toHaveURL(/\/hoje$/);
});

test("Hoje: números do dia, publicações novas e o menu com as contagens", async ({ page }) => {
  await abrir(page, "/hoje");
  const numeros = page.getByLabel("Números do dia");
  await expect(numeros.getByLabel("3 prazos vencem hoje")).toBeVisible();
  await expect(numeros.getByLabel("1 prazos vencidos")).toBeVisible();
  await expect(page.getByRole("link", { name: "Revisar 7" })).toBeVisible();
  const menu = page.getByRole("navigation").first();
  await expect(menu.getByRole("link", { name: /Prazos/ })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("prazo: briefing da IA, data final contada e confirmar", async ({ page }) => {
  const api = await abrir(page, `/prazos/${ids.prazo}`);
  await expect(page.getByRole("heading", { name: "Manifestação sobre laudo pericial" })).toBeVisible();
  await expect(page.getByText("O que o juízo decidiu")).toBeVisible();
  await expect(page.getByText("23/11/2026").first()).toBeVisible();
  await expect(page.getByText(/Fins de semana, 02\/11 e 20\/11/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar prazo" }).click();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/confirmar`).length).toBe(1);
  await expect(page.getByText("Prazo confirmado.")).toBeVisible();
});

test("descartar prazo leva o motivo junto", async ({ page }) => {
  const api = await abrir(page, `/prazos/${ids.prazo}`);
  await page.getByRole("button", { name: "Descartar" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo).toBeVisible();
  const enviar = dialogo.getByRole("button", { name: "Descartar", exact: true });
  await dialogo.getByLabel("Por quê? (opcional)").fill("Prazo já cumprido no processo físico.");
  await enviar.click();
  await expect.poll(() => api.mudancas(`/prazos/${ids.prazo}/descartar`)[0]?.corpo).toMatchObject({ motivo: "Prazo já cumprido no processo físico." });
});

test("publicações: caixa de entrada com a lista e o teor ao lado", async ({ page }) => {
  await abrir(page, "/publicacoes");
  await expect(page.getByRole("heading", { name: "Publicações" })).toBeVisible();
  await page.getByText("Marina Duarte × Seguradora Alfa S.A.").first().click();
  await expect(page.getByText("Teor da intimação")).toBeVisible();
  await expect(page.getByText(/laudo pericial juntado no evento 87/).first()).toBeVisible();
});

test("processo: resumo avisa a novidade e as abas trocam pelo endereço", async ({ page }) => {
  await abrir(page, `/processos/${ids.processo}`);
  await expect(page.getByRole("heading", { name: "Marina Duarte × Seguradora Alfa S.A." })).toBeVisible();
  await expect(page.getByText(/1 movimentação nova desde este resumo/)).toBeVisible();
  await page.getByRole("tab", { name: /Movimentações/ }).click();
  await expect(page).toHaveURL(/aba=movimentacoes/);
  await expect(page.getByText("Petição da ré").first()).toBeVisible();
  await page.getByRole("tab", { name: /Chat do processo/ }).click();
  await expect(page.getByText("A IA ainda não está ligada")).toBeVisible();
});

test("peça: folha no timbre, trechos a completar marcados e DOCX", async ({ page }) => {
  await abrir(page, `/pecas?id=${ids.peca}`);
  const folha = page.locator(".dc-folha").first();
  await expect(folha.getByText("Souza & Freitas Advocacia")).toBeVisible();
  await expect(folha.locator("mark").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Baixar DOCX no timbre/ })).toHaveAttribute("href", new RegExp(`/api/app/pecas/${ids.peca}/docx`));
});

test("peça sem a IA: escreve à mão e guarda", async ({ page }) => {
  const api = new ApiFalsa();
  api.responder("/pecas/manual", { id: ids.peca }, 201);
  await abrir(page, `/pecas?prazo=${ids.prazo}`, api);
  await expect(page.getByText(/Dá para escrever a peça à mão/)).toBeVisible();
  await page.getByRole("button", { name: "Editar texto" }).click();
  await page.getByLabel("Texto da peça").fill("# Excelentíssimo Senhor Doutor Juiz\n\nManifesta-se sobre o laudo.");
  await page.getByRole("button", { name: "Salvar texto" }).click();
  await expect.poll(() => api.mudancas("/pecas/manual")[0]?.corpo).toMatchObject({ processoId: ids.processo, prazoId: ids.prazo, tipo: "manifestacao-laudo" });
});

test("cliente: dados, processos e a linha do tempo", async ({ page }) => {
  await abrir(page, `/clientes/${ids.cliente}`);
  await expect(page.getByRole("heading", { name: "Marina Duarte" })).toBeVisible();
  await expect(page.getByText("Atendimento · WhatsApp").first()).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("minha conta: o tema escolhido vale na hora e fica no aparelho", async ({ page }) => {
  await abrir(page, "/conta");
  await page.getByRole("button", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "escuro");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "escuro");
  await page.getByRole("button", { name: "Automático" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "claro");
  // A conta da demonstração é de todos: não troca a senha.
  await expect(page.getByText("Esta é a conta de demonstração")).toBeVisible();
  await expect(page.getByRole("button", { name: "Trocar senha" })).toHaveCount(0);
});

test("equipe: convidar manda e-mail e papel", async ({ page }) => {
  const api = await abrir(page, "/equipe");
  await expect(page.getByText("Beatriz Souza")).toBeVisible();
  await page.getByRole("button", { name: "Convidar" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("E-mail").fill("nova.pessoa@exemplo.com.br");
  await dialogo.getByRole("button", { name: "Convidar", exact: true }).click();
  await expect.poll(() => api.mudancas("/organization/invite-member")[0]?.corpo).toMatchObject({ email: "nova.pessoa@exemplo.com.br" });
});

test("sentença: a IA lê pedido a pedido e a pessoa confirma o resultado", async ({ page }) => {
  const api = await abrir(page, `/publicacoes?id=${ids.sentenca}`, new ApiFalsa().responder("/eu", euComIa));
  await expect(page.getByText("Leitura da sentença")).toBeVisible();
  await expect(page.getByText("Pedido a pedido")).toBeVisible();
  await expect(page.getByText("Danos morais", { exact: true })).toBeVisible();
  await expect(page.getByText("Rejeitado")).toBeVisible();
  await expect(page.getByText("Parcialmente procedente", { exact: true })).toBeVisible();
  await expect(page.getByText(/Apelação · 15 dias/)).toBeVisible();
  await page.getByRole("button", { name: "Confirmar resultado" }).click();
  await expect.poll(() => api.mudancas(`/publicacoes/${ids.sentenca}/resultado`)[0]?.corpo).toMatchObject({ tipo: "sentenca", resultado: "parcialmente_procedente" });
});

test("retorno sobre a IA: errado pede uma frase e manda junto", async ({ page }) => {
  const api = await abrir(page, `/publicacoes?id=${ids.sentenca}`, new ApiFalsa().responder("/eu", euComIa));
  const leitura = page.locator(".dc-ia").filter({ hasText: "Leitura da sentença" });
  await leitura.getByRole("button", { name: "Errado" }).click();
  await expect.poll(() => api.mudancas("/ia/retorno")[0]?.corpo).toMatchObject({ analiseId: amostras.publicacaoSentenca!.corpo.sentenca.id, util: false });
  await leitura.getByLabel("O que estava errado").fill("Os danos morais foram acolhidos em parte.");
  await leitura.getByRole("button", { name: "Enviar" }).click();
  await expect.poll(() => api.mudancas("/ia/retorno")[1]?.corpo).toMatchObject({ util: false, comentario: "Os danos morais foram acolhidos em parte." });
  await expect(leitura.getByRole("button", { name: "Errado" })).toHaveAttribute("aria-pressed", "true");
});

test("sentença confirmada: o resultado fica no processo", async ({ page }) => {
  await abrir(page, `/publicacoes?id=${ids.sentenca}`, new ApiFalsa().responder(`/publicacoes/${ids.sentenca}`, amostras.publicacaoSentencaConfirmada!.corpo));
  await expect(page.getByText(/No processo: sentença parcialmente procedente, confirmado por Beatriz/)).toBeVisible();
  await page.goto(`/processos/${ids.processoComResultado}`);
  await expect(page.getByText("Parcialmente procedente · sentença de 29/10/2026")).toBeVisible();
});

test("negócio na triagem: a pasta e a conferência item por item", async ({ page }) => {
  const api = await abrir(page, "/negocios", new ApiFalsa().responder("/eu", euComIa));
  const nome = amostras.negocios!.corpo.itens.find((n: { id: string }) => n.id === ids.negocio).nome as string;
  await page.getByText(nome).first().click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText("procuracao.txt").first()).toBeVisible();
  await expect(dialogo.getByText("Conferência da pasta")).toBeVisible();
  await expect(dialogo.getByText("Documento com foto", { exact: true })).toBeVisible();
  await expect(dialogo.getByText(/falta o documento com foto/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Refazer" }).click();
  await expect.poll(() => api.mudancas(`/negocios/${ids.negocio}/conferir`).length).toBe(1);
});

test("cliente: conferência da pasta e o arquivo lido", async ({ page }) => {
  await abrir(page, `/clientes/${ids.cliente}`, new ApiFalsa().responder(`/clientes/${ids.cliente}`, amostras.clienteConferido!.corpo));
  await expect(page.getByText("Conferência da pasta")).toBeVisible();
  await expect(page.getByRole("link", { name: /rg-marina\.txt/ })).toBeVisible();
  await expect(page.locator(".dc-leitura").filter({ hasText: "Lido" })).toBeVisible();
});

test("foto na leitura da IA: lendo, transcrito e não deu para ler", async ({ page }) => {
  const base = amostras.documentos!.corpo.itens[0];
  const itens = [
    { ...base, id: "00000000-0000-4000-8000-0000000000a1", nome: "foto-do-rg.jpg", mime: "image/jpeg", lido: false, semTexto: true, leitura: "pendente" },
    { ...base, id: "00000000-0000-4000-8000-0000000000a2", nome: "contrato-escaneado.pdf", mime: "application/pdf", lido: true, semTexto: false, leitura: "pronta" },
    { ...base, id: "00000000-0000-4000-8000-0000000000a3", nome: "comprovante-borrado.jpg", mime: "image/jpeg", lido: false, semTexto: true, leitura: "falhou" },
  ];
  const api = await abrir(page, `/processos/${ids.processo}?aba=documentos`, new ApiFalsa().responder("/eu", euComIa).responder("/documentos", { itens }));
  await expect(page.getByText("Lendo")).toBeVisible();
  await expect(page.getByText("Transcrito")).toBeVisible();
  await expect(page.getByText("Não deu para ler")).toBeVisible();
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect.poll(() => api.mudancas("/documentos/00000000-0000-4000-8000-0000000000a3/ler").length).toBe(1);
});

test("modelos: a lista, abrir um e colar um novo", async ({ page }) => {
  const api = await abrir(page, "/modelos");
  await expect(page.getByRole("heading", { name: "Modelos" })).toBeVisible();
  await page.getByRole("button", { name: "Contestação · negativa de cobertura de plano de saúde" }).click();
  const dialogo = page.getByRole("dialog");
  await expect(dialogo.getByText(/A indicação médica prevalece/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Novo modelo" }).click();
  const novo = page.getByRole("dialog");
  await novo.getByRole("button", { name: "Colar o texto" }).click();
  await novo.getByLabel("Tipo de peça").selectOption("contestacao");
  await novo.getByLabel("Texto da peça").fill("Contestação de exemplo. ".repeat(12));
  await novo.getByLabel("Nome do modelo").fill("Contestação · seguro prestamista");
  await novo.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => api.mudancas("/modelos")[0]?.corpo).toMatchObject({ titulo: "Contestação · seguro prestamista", tipo: "contestacao" });
});

test("peça revisada: quem revisou, com a OAB, e guardar como modelo", async ({ page }) => {
  const api = await abrir(page, `/pecas?id=${ids.peca}`, new ApiFalsa().responder(`/pecas/${ids.peca}`, amostras.pecaRevisada!.corpo));
  await expect(page.getByText(/Revisada por Beatriz · OAB\/SC 41\.233/)).toBeVisible();
  await page.getByRole("button", { name: "Guardar como modelo" }).click();
  const dialogo = page.getByRole("dialog");
  await dialogo.getByLabel("Tese").fill("Prova testemunhal do uso do imóvel");
  await dialogo.getByRole("button", { name: "Guardar" }).click();
  await expect.poll(() => api.mudancas("/modelos")[0]?.corpo).toMatchObject({ pecaId: ids.peca, tese: "Prova testemunhal do uso do imóvel" });
});

test("configurações: o retorno sobre a IA para os sócios", async ({ page }) => {
  await abrir(page, "/configuracoes");
  await page.getByRole("tab", { name: "Retorno sobre a IA" }).click();
  await expect(page.getByText("Como a IA está indo")).toBeVisible();
  await expect(page.getByText("Contou o prazo do laudo como se fosse corrido. · Beatriz")).toBeVisible();
});

test("endereço que não existe mostra a página de não encontrada", async ({ page }) => {
  await abrir(page, "/isso-nao-existe");
  await expect(page.getByText("Página não encontrada")).toBeVisible();
});

test("processos: título, busca e filtros parados, só a lista rola e sem barra à vista", async ({ page }) => {
  const api = await abrir(page, "/processos");
  const lista = page.locator('[data-scroll-restoration-id="processos"]');
  await expect(lista.getByRole("link", { name: "Marina Duarte × Seguradora Alfa S.A." })).toBeVisible();
  const busca = page.getByLabel("Buscar processo");
  const antes = await busca.boundingBox();
  await lista.hover();
  await page.mouse.wheel(0, 1200);
  await expect.poll(() => lista.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBe(0);
  expect((await busca.boundingBox())?.y).toBe(antes?.y);
  await expect(page.getByRole("columnheader", { name: "Processo" })).toBeInViewport();
  await expect(page.getByRole("button", { name: "Carregar mais" })).toBeInViewport();
  expect(await lista.evaluate((e: HTMLElement) => e.offsetWidth - e.clientWidth)).toBe(0);
  // Outro filtro: a lista volta ao começo.
  await page.getByRole("button", { name: "Arquivados" }).click();
  await expect(page).toHaveURL(/situacao=arquivados/);
  await expect.poll(() => lista.evaluate((e) => e.scrollTop)).toBe(0);
  // Pelo teclado também rola.
  await lista.getByRole("link").first().focus();
  await page.keyboard.press("PageDown");
  await expect.poll(() => lista.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  // Chegando no fim, vem a próxima página sem clicar.
  const pedidos = api.pedidos.filter((p) => p.caminho === "/processos").length;
  await lista.evaluate((e) => e.scrollTo({ top: e.scrollHeight }));
  await expect.poll(() => api.pedidos.filter((p) => p.caminho === "/processos").length).toBeGreaterThan(pedidos);
});

test("processos: ao voltar de um processo, a lista está onde estava", async ({ page }) => {
  await abrir(page, "/processos");
  const lista = page.locator('[data-scroll-restoration-id="processos"]');
  await expect(lista.getByRole("link").first()).toBeVisible();
  await lista.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => lista.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  const onde = await lista.evaluate((e) => e.scrollTop);
  // Um processo que está à vista no meio da lista, para o clique não rolar nada antes.
  const nome = await lista.evaluate((e) => {
    const r = e.getBoundingClientRect();
    return document.elementFromPoint(r.left + 80, r.top + r.height / 2)?.closest("tr")?.querySelector("a")?.textContent ?? "";
  });
  await lista.getByRole("link", { name: nome, exact: true }).click();
  await expect(page).toHaveURL(/\/processos\/[^/]+$/);
  await page.goBack();
  await expect(lista.getByRole("link", { name: nome, exact: true })).toBeVisible();
  await expect.poll(() => lista.evaluate((e) => e.scrollTop)).toBe(onde);
});

test("alvarás: cada coluna do quadro rola sozinha e o título fica", async ({ page }) => {
  await abrir(page, "/alvaras");
  const finalizado = page.locator('[data-scroll-restoration-id="alvaras-finalizado"]');
  const expedido = page.locator('[data-scroll-restoration-id="alvaras-novo"]');
  await expect(finalizado.locator(".dc-cartao").first()).toBeVisible();
  await finalizado.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => finalizado.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  expect(await expedido.evaluate((e) => e.scrollTop)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBe(0);
  await expect(page.getByRole("heading", { name: "Alvarás" })).toBeInViewport();
  await expect(page.getByText("Finalizado", { exact: true })).toBeInViewport();
  expect(await finalizado.evaluate((e: HTMLElement) => e.offsetWidth - e.clientWidth)).toBe(0);
});

for (const rota of ["/prazos", "/processos", "/clientes", "/agenda", "/negocios", "/alvaras", "/documentos", "/modelos", "/configuracoes", "/conta"]) {
  test(`${rota} abre sem erro e sem rolar para o lado`, async ({ page }) => {
    const erros: string[] = [];
    page.on("pageerror", (e) => erros.push(String(e)));
    await abrir(page, rota);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByLabel("Carregando")).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
    expect(erros).toEqual([]);
  });
}
