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

test("landing: sem sessão fica na página, mostra as seções e Entrar abre o login", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, "/", api);
  await expect(page.getByRole("heading", { name: /O escritório em dia/ })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
  for (const titulo of ["Cada intimação já chega explicada", "Tudo o que o escritório usa, num lugar só", "Começa no primeiro dia"]) {
    await expect(page.getByRole("heading", { name: titulo })).toBeAttached();
  }
  await expect(page.locator("#recursos .lp-bloco")).toHaveCount(8);
  await expect(page.locator("#acesso").getByRole("link", { name: "Pedir acesso" })).toHaveAttribute("href", /^https:\/\/wa\.me\//);
  await expect(page.locator(".lp-hero").getByRole("link", { name: "Pedir acesso" })).toHaveAttribute("href", /^https:\/\/wa\.me\/55\d+\?text=/);
  await page.locator(".lp-topo").getByRole("link", { name: "Entrar" }).click();
  await expect(page.getByRole("heading", { name: "Entrar no Decreta" })).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("landing: a tela do produto no topo é imagem e a roda do mouse em cima dela rola a página", async ({ page }) => {
  const api = new ApiFalsa();
  api.logado = false;
  await abrir(page, "/", api);
  const vitrine = page.locator(".lp-hero .lp-vitrine__img");
  await expect.poll(() => vitrine.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  expect(await vitrine.evaluate((img: HTMLImageElement) => img.currentSrc)).toContain("vitrine-computador");
  const caixa = (await vitrine.boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, Math.min(caixa.y + caixa.height / 2, 800));
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(300);
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
  await page.getByRole("button", { name: "Escrever à mão" }).click();
  await page.getByLabel("Texto da peça").fill("# Excelentíssimo Senhor Doutor Juiz\n\nManifesta-se sobre o laudo.");
  await page.getByRole("button", { name: "Salvar texto" }).click();
  await expect.poll(() => api.mudancas("/pecas/manual")[0]?.corpo).toMatchObject({ processoId: ids.processo, prazoId: ids.prazo, tipo: "manifestacao-laudo" });
});

test("peça: o pedido em três passos, o botão de gerar à vista e as partes do tipo na folha", async ({ page }) => {
  const api = await abrir(page, `/pecas?prazo=${ids.prazo}`, new ApiFalsa().responder("/eu", euComIa));
  const pedido = page.getByRole("complementary", { name: "Pedido para a IA" });
  for (const passo of ["Tipo de peça", "O que a IA lê", "Instruções"]) await expect(pedido.getByRole("heading", { name: passo })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gerar peça" })).toBeInViewport();
  await expect(pedido.getByText(/assinada por Beatriz Souza · OAB\/SC 41\.233/)).toBeVisible();
  // Antes de gerar, a folha mostra as partes do tipo sugerido pelo prazo, e o fecho com quem assina.
  const folha = page.getByRole("article", { name: /Partes da peça/ });
  await expect(folha.getByRole("heading", { name: "I – Síntese do laudo" })).toBeVisible();
  await expect(folha.getByText("Beatriz Souza")).toBeVisible();
  // Os autos abrem a lista dos documentos que a IA lê.
  await pedido.getByRole("button", { name: /Autos do processo/ }).click();
  await expect(pedido.getByText("Laudo pericial.docx · evento 87")).toBeVisible();
  // Trocar o tipo pela busca troca as partes na folha.
  await pedido.getByRole("button", { name: "Manifestação sobre laudo pericial" }).click();
  await page.getByLabel("Buscar tipo de peça").fill("apela");
  await page.getByLabel("Buscar tipo de peça").press("Enter");
  await expect(folha.getByRole("heading", { name: "I – Petição de interposição e razões" })).toBeVisible();
  await pedido.getByLabel("Instruções para a IA").fill("Atacar a falta de fundamentação.");
  await page.getByRole("button", { name: "Gerar peça" }).click();
  await expect.poll(() => api.mudancas("/pecas")[0]?.corpo).toMatchObject({ tipo: "apelacao", instrucoes: "Atacar a falta de fundamentação.", prazoId: ids.prazo });
});

test("peça: só o papel do rascunho rola, e o editor cresce com o texto em vez de rolar por dentro", async ({ page }) => {
  const peca = amostras.peca!.corpo;
  const longa = { ...peca, texto: Array.from({ length: 8 }, () => peca.texto).join("\n\n") };
  await abrir(page, `/pecas?id=${ids.peca}`, new ApiFalsa().responder("/eu", euComIa).responder(`/pecas/${ids.peca}`, longa));
  const papel = page.locator('[data-scroll-restoration-id="rascunho"]');
  await expect(papel.getByText("Souza & Freitas Advocacia")).toBeVisible();
  await papel.hover();
  await page.mouse.wheel(0, 1500);
  await expect.poll(() => papel.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  // A folha branca não rola: o título, os botões, o topo do rascunho e o aviso da IA ficam à vista.
  expect(await page.locator('[data-scroll-restoration-id="folha"]').evaluate((e) => e.scrollTop)).toBe(0);
  await expect(page.getByRole("heading", { name: "Gerar peça" })).toBeInViewport();
  await expect(page.getByRole("link", { name: /Baixar DOCX no timbre/ })).toBeInViewport();
  await expect(page.getByText(/Gerado por IA\. Confira nos autos/)).toBeInViewport();
  // Editando, o papel fica no mesmo ponto do texto e a caixa não tem rolagem própria.
  const onde = await papel.evaluate((e) => e.scrollTop / (e.scrollHeight - e.clientHeight));
  await page.getByRole("button", { name: "Editar texto" }).click();
  const editor = page.getByLabel("Texto da peça");
  await expect(editor).toBeVisible();
  expect(await editor.evaluate((e) => e.scrollHeight - e.clientHeight)).toBe(0);
  expect(await papel.evaluate((e) => e.scrollTop / (e.scrollHeight - e.clientHeight))).toBeCloseTo(onde, 2);
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(papel.getByText("Souza & Freitas Advocacia")).toBeAttached();
  expect(await papel.evaluate((e) => e.scrollTop / (e.scrollHeight - e.clientHeight))).toBeCloseTo(onde, 2);
});

test("cliente: dados, processos e a linha do tempo", async ({ page }) => {
  await abrir(page, `/clientes/${ids.cliente}`);
  await expect(page.getByRole("heading", { name: "Marina Duarte" })).toBeVisible();
  await expect(page.getByText("Atendimento · WhatsApp").first()).toBeVisible();
  expect(await sobraNaLateral(page)).toBe(0);
});

test("minha conta: sempre claro, mesmo com o aparelho no escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await abrir(page, "/conta");
  await expect(page.locator("html")).not.toHaveAttribute("data-theme", "escuro");
  await expect(page.getByRole("group", { name: "Tema" })).toHaveCount(0);
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

test("documentos: abrir um mostra o arquivo ao lado; as setas trocam e o Esc fecha", async ({ page }) => {
  const itens = amostras.documentos!.corpo.itens as { id: string; nome: string }[];
  const pdf = itens.find((d) => d.nome.endsWith(".pdf"))!;
  const erros: string[] = [];
  page.on("pageerror", (e) => erros.push(String(e)));
  await abrir(page, "/documentos");
  await page.getByRole("link", { name: pdf.nome, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`doc=${pdf.id}`));
  const painel = page.getByRole("region", { name: `Documento aberto: ${pdf.nome}` });
  await expect(painel.getByText("1 / 2")).toBeVisible();
  // O PDF sai desenhado (worker e decodificadores do build), não só o espaço da página.
  await expect.poll(() => painel.locator('[data-pagina="1"] canvas').evaluate((c: HTMLCanvasElement) => c.width)).toBeGreaterThan(0);
  // A lista fica só com o nome; o resto está no painel.
  await expect(page.getByRole("columnheader", { name: "Leitura da IA" })).toBeHidden();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("region", { name: /Recibo do pagamento administrativo/ }).locator("img")).toBeVisible();
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("region", { name: /Petição inicial/ }).locator("section.docx")).toContainText("Marina Duarte move ação de cobrança");
  expect(await sobraNaLateral(page)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".dc-doc")).toHaveCount(0);
  await expect(page.getByRole("columnheader", { name: "Leitura da IA" })).toBeVisible();
  expect(erros).toEqual([]);
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

test("agenda: abre na semana; lista e mês, com o dia escolhido ao lado do mês", async ({ page }) => {
  await abrir(page, "/agenda");
  const periodo = page.locator(".dc-periodo__rotulo");
  await expect(page.getByRole("radio", { name: "Semana" })).toHaveAttribute("aria-checked", "true");
  await expect(periodo).toHaveText("26 out a 1 nov");
  await expect(page.locator(".dc-evento").first()).toBeVisible();
  await page.getByRole("button", { name: "Próxima semana" }).click();
  await expect(periodo).toHaveText("2 a 8 de novembro");
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(periodo).toHaveText("26 out a 1 nov");
  await page.getByRole("radio", { name: "Lista" }).click();
  await expect(periodo).toHaveText("29 out a 11 nov");
  await page.getByRole("radio", { name: "Mês" }).click();
  await expect(page).toHaveURL(/vista=mes/);
  await expect(periodo).toHaveText("Outubro de 2026");
  // O feriado aparece no dia; o dia escolhido abre ao lado, e a tarefa nova já vem nele.
  await expect(page.locator(".dc-mes__dia", { hasText: "Nossa Senhora Aparecida" })).toBeVisible();
  await page.getByRole("button", { name: /^sexta, 30 de outubro/ }).click();
  await expect(page.getByRole("heading", { name: "Amanhã, 30 out" })).toBeVisible();
  await page.getByRole("button", { name: "Tarefa", exact: true }).click();
  await expect(page.locator("#nt-dia")).toHaveValue("2026-10-30");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(periodo).toHaveText("Novembro de 2026");
  // Ir para uma data pelo calendário do período.
  await page.locator(".dc-periodo__data").fill("2027-03-15");
  await expect(periodo).toHaveText("Março de 2027");
  expect(await sobraNaLateral(page)).toBe(0);
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
