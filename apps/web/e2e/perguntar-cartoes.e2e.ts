/**
 * Perguntar: o espaço que os cartões ocupam (larguras, celular, "Mostrar
 * mais"), os campos novos das consultas (cumprido em, última movimentação,
 * situação da audiência, tarefa atrasada, agenda cortada, calendário da
 * contagem, tarefas no panorama, publicação lida) e as sugestões da conversa
 * nova pedindo o que o número delas conta.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, abrirCartao, acessoAoCartao, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";
import { abrirPortao, audienciasDaSemana, conversa, ia, ligarAosPoucos, noPortao, pessoa, prazosDaSemana, roteiro, uuid } from "./aos-poucos";
import * as R from "./resultados";

const CONVERSA = uuid(300);
const comIa = () => new ApiFalsa().responder("/eu", euComIa);

/** Abre uma conversa com uma resposta da IA feita destas partes. */
function abrirResposta(page: Page, partes: unknown[], pergunta = "Como estamos?") {
  return abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Teste", [pessoa(uuid(301), pergunta), ia(uuid(302), partes)])));
}
/** Quanto a caixa da conversa rola para o lado (a página pode não rolar e a conversa sim). */
const sobraNaConversa = (page: Page) => page.locator(".dc-chat__rolagem").evaluate((el) => el.scrollWidth - el.clientWidth);
const altura = (page: Page, seletor: string, i = 0) => page.locator(seletor).nth(i).evaluate((el) => Math.round(el.getBoundingClientRect().height));

const PANORAMA = {
  hoje: "2026-10-29",
  prazos: { vencidos: 1, hoje: 3, ate7dias: 10, abertos: 61, aConfirmar: 8, semResponsavel: 4 },
  publicacoes: { novas: 7, pendentes: 3 },
  audiencias: { hoje: 2, ate7dias: 4 },
  tarefas: { atrasadas: 1, hoje: 4, minhasAtrasadas: 1, minhasHoje: 1 },
  processos: { ativos: 136, suspensos: 2 },
  clientes: 128,
  alvaras: { pendentes: 8, valorPendente: "121778.95" },
  negocios: { triagem: 3 },
  meus: { prazosAbertos: 16, prazosVencidos: 0, audienciasAte7dias: 2 },
};

test.describe("larguras", () => {
  test("1440 px: a conversa fica com a largura (o painel ao lado só a partir de 1600) e cada prazo numa linha", async ({ page }) => {
    await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
    await expect(acessoAoCartao(page, "Prazos")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Nesta conversa" })).toHaveCount(0);
    expect(await page.locator(".dc-chat__coluna").evaluate((el) => el.getBoundingClientRect().width)).toBeGreaterThan(800);
    const folha = await abrirCartao(page, "Prazos");
    await expect(folha.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    expect(await altura(page, ".dc-linha-prazo")).toBeLessThan(60);
    await page.keyboard.press("Escape");

    await page.setViewportSize({ width: 1600, height: 900 });
    await expect(page.getByRole("complementary", { name: "Nesta conversa" })).toBeVisible();
  });

  test("1100 px, com o histórico: a conversa estreita, e na folha do cartão o prazo continua numa linha", async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
    await expect(acessoAoCartao(page, "Prazos")).toBeVisible();
    expect(await page.locator(".dc-chat__coluna").evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(620);
    const folha = await abrirCartao(page, "Prazos");
    await expect(folha.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    expect(await altura(page, ".dc-linha-prazo")).toBeLessThan(60);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test.describe("no celular", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

    test("processo de nome comprido nos passos: a conversa não anda para o lado, a etiqueta é cortada", async ({ page }) => {
      const titulo = "Restaurante Serra Dourada S.A. · revisão de contratos com fornecedores";
      await abrirResposta(page, [R.ferramenta("l1", "lerProcesso", R.fichaDoProcesso(1, titulo), { processoId: uuid(9) }), R.texto("O processo está na fase de perícia.")]);
      const passo = page.locator(".dc-passo").filter({ hasText: "Autos ·" });
      await expect(passo).toBeVisible();
      expect(await passo.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(280);
      expect(await sobraNaConversa(page)).toBe(0);
      expect(await sobraNaLateral(page)).toBe(0);
    });

    test("prazo na folha do celular: o nome em cima e o selo embaixo, numa linha mais baixa", async ({ page }) => {
      await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
      const folha = await abrirCartao(page, "Prazos");
      const linha = folha.locator(".dc-linha-prazo").first();
      await expect(linha).toBeVisible();
      const [nome, selo] = await Promise.all([linha.locator(".dc-cartao-ia__titulo").boundingBox(), linha.locator(".dc-selo").boundingBox()]);
      expect(selo!.y).toBeGreaterThan(nome!.y);
      expect(await altura(page, ".dc-linha-prazo")).toBeLessThan(92);
      expect(await sobraNaLateral(page)).toBe(0);
    });

    test("tabela larga: rola dentro da caixa, sem quebrar palavra no meio, e o CNJ numa linha", async ({ page }) => {
      const tabela = [
        "| Prazo | Processo | CNJ | Vence | Responsável |",
        "|---|---|---|---|---|",
        "| Alegações finais | Roberto Kühn × Transportes Serra Azul Ltda. | 5009876-57.2025.8.24.0038 | 29/10 | Beatriz |",
        "| Juntar procuração atualizada | Eduardo Lima × Saúde Litoral Planos | 5003390-24.2026.8.24.0005 | 29/10 | sem responsável |",
      ].join("\n");
      await abrirResposta(page, [R.texto(`Os prazos de hoje:\n\n${tabela}`)]);
      const caixa = page.locator(".dc-md__tabela");
      await expect(caixa.getByRole("cell", { name: "5009876-57.2025.8.24.0038" })).toBeVisible();
      expect(await caixa.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeGreaterThan(40);
      // As linhas do texto de cada célula: o CNJ numa só, e "Alegações" inteira (a linha tem a largura da palavra).
      const linhas = (nome: string) =>
        caixa.getByRole("cell", { name: nome }).evaluate((el) => {
          const r = document.createRange();
          r.selectNodeContents(el);
          return [...new Set([...r.getClientRects()].map((x) => Math.round(x.top)))].length;
        });
      expect(await linhas("5009876-57.2025.8.24.0038")).toBe(1);
      const larguras = await caixa.getByRole("cell", { name: "Alegações finais" }).evaluate((el) => {
        const r = document.createRange();
        r.selectNodeContents(el);
        return [...r.getClientRects()].map((x) => Math.round(x.width));
      });
      expect(Math.max(...larguras)).toBeGreaterThan(60);
      expect(await sobraNaConversa(page)).toBe(0);
      expect(await sobraNaLateral(page)).toBe(0);
    });

    test("clientes: os botões só com o ícone e o nome inteiro, com o telefone embaixo", async ({ page }) => {
      const lista = R.clientes(5);
      const empresa = lista.itens.find((c: { nome: string }) => /Ltda/.test(c.nome)) ?? lista.itens[0];
      await abrirResposta(page, [R.ferramenta("c1", "buscarClientes", lista, { busca: "a" })]);
      const folha = await abrirCartao(page, "Clientes");
      const zap = folha.getByRole("link", { name: `WhatsApp de ${empresa.nome}` });
      await expect(zap).toBeVisible();
      expect(await zap.evaluate((el) => el.getBoundingClientRect().width)).toBeLessThanOrEqual(40);
      const nome = folha.locator(".dc-cartao-ia__linha--quebra .dc-cartao-ia__titulo").filter({ hasText: empresa.nome });
      expect(await nome.evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(28);
      await expect(folha.locator(".dc-cartao-ia__linha--quebra").filter({ hasText: empresa.nome }).locator(".dc-cartao-ia__sub")).toContainText("(4");
      expect(await sobraNaLateral(page)).toBe(0);
    });

    test("campo vazio numa linha, com o texto de exemplo curto: não pula ao digitar", async ({ page }) => {
      await abrir(page, `/perguntar/${ids.conversaSemana}`, comIa());
      const campo = page.getByRole("textbox", { name: "Pergunta" });
      await expect(campo).toHaveAttribute("placeholder", "Pergunte sobre o escritório");
      const vazio = await campo.evaluate((el) => el.getBoundingClientRect().height);
      await campo.fill("Q");
      const comLetra = await campo.evaluate((el) => el.getBoundingClientRect().height);
      expect(vazio).toBeLessThan(34);
      expect(Math.abs(vazio - comLetra)).toBeLessThan(2);
    });
  });
});

test.describe("cartões", () => {
  test("Agenda: o número no cabeçalho, 5 itens e Mostrar mais de 10 em 10; audiência redesignada, tarefa atrasada e agenda cortada", async ({ page }) => {
    const agenda = R.agenda("2026-11-05") as { dias: { itens: any[] }[]; cortadoEm?: string };
    const primeiro = agenda.dias[0]!;
    primeiro.itens[0] = { ...primeiro.itens[0], situacao: "redesignada" };
    primeiro.itens.unshift({ tipo: "tarefa", id: uuid(40), titulo: "Devolver documentos à cliente", concluida: false, atrasada: true, processo: null });
    agenda.dias[1]!.itens.unshift({ tipo: "audiencia", id: uuid(41), hora: "10:00", titulo: "Audiência de conciliação", porVideo: false, situacao: "cancelada", processo: { id: ids.processo, titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: null } });
    agenda.cortadoEm = "2026-11-05";
    const total = agenda.dias.reduce((n, d) => n + d.itens.length, 0);
    await abrirResposta(page, [R.ferramenta("a1", "verAgenda", agenda, { de: "2026-10-29", ate: "2026-12-31" })], "O que tenho até o fim do ano?");
    await expect(acessoAoCartao(page, "Agenda")).toContainText(`${total} itens em ${agenda.dias.length} dias`);
    const c = await abrirCartao(page, "Agenda");
    await expect(c.locator(".dc-cartao-ia__linha")).toHaveCount(5);
    await expect(c.getByText("Atrasada")).toBeVisible();
    await expect(c.locator(".dc-cartao-ia__linha").filter({ hasText: "Devolver documentos" }).locator(".dc-selo")).toHaveText("Atrasada");
    await expect(c.locator(".dc-cartao-ia__marca").filter({ hasText: "redesignada" })).toBeVisible();
    await expect(c.getByText("A consulta parou em 05/11")).toBeVisible();
    await c.getByRole("button", { name: "Mostrar mais 10" }).click();
    await expect(c.locator(".dc-cartao-ia__linha")).toHaveCount(15);
    await expect(c.locator(".dc-cartao-ia__marca").filter({ hasText: "cancelada" })).toBeVisible();
    await c.getByRole("button", { name: `Mostrar mais ${total - 15}` }).click();
    await expect(c.locator(".dc-cartao-ia__linha")).toHaveCount(total);
    await c.getByRole("button", { name: "Mostrar menos" }).click();
    await expect(c.locator(".dc-cartao-ia__linha")).toHaveCount(5);
  });

  test("Agenda de conversa antiga (sem situação nem atrasada): abre igual", async ({ page }) => {
    const agenda = R.agenda("2026-10-29") as { dias: { itens: any[] }[] };
    for (const i of agenda.dias[0]!.itens) delete i.situacao;
    await abrirResposta(page, [R.ferramenta("a1", "verAgenda", agenda, { de: "2026-10-29", ate: "2026-10-29" })]);
    await expect(acessoAoCartao(page, "Agenda")).toContainText(`${agenda.dias[0]!.itens.length} itens`);
    const c = await abrirCartao(page, "Agenda");
    await expect(c.locator(".dc-cartao-ia__marca")).toHaveCount(0);
    await expect(c.getByText("A consulta parou")).toHaveCount(0);
  });

  test("Prazos: Mostrar mais de 10 em 10, e o link leva o filtro da consulta à tela de Prazos", async ({ page }) => {
    await abrirResposta(page, [R.ferramenta("p1", "buscarPrazos", R.prazos(20), { ate: "2026-11-05", responsavel: "eu" })]);
    const c = await abrirCartao(page, "Prazos");
    await expect(c.locator(".dc-linha-prazo")).toHaveCount(5);
    await c.getByRole("button", { name: "Mostrar mais 10" }).click();
    await expect(c.locator(".dc-linha-prazo")).toHaveCount(15);
    await c.getByRole("button", { name: "Mostrar mais 5" }).click();
    await expect(c.locator(".dc-linha-prazo")).toHaveCount(20);
    await expect(c.getByRole("button", { name: "Mostrar menos" })).toBeVisible();
    await expect(c.getByRole("link", { name: "Prazos" })).toHaveAttribute("href", `/prazos?quando=semana&responsavel=${euComIa.usuario.id}`);
  });

  test("Publicações e Documentos: a data primeiro e o trecho numa linha só", async ({ page }) => {
    await abrirResposta(page, [R.ferramenta("u1", "buscarPublicacoes", R.publicacoes(5)), R.ferramenta("d1", "buscarDocumentos", R.documentos(5), { busca: "laudo" })]);
    const pub = await abrirCartao(page, "Publicações");
    await expect(pub.locator(".dc-cartao-ia__sub").first()).toHaveText(/^28\/10 · Marina Duarte/);
    expect(await pub.locator(".dc-cartao-ia__trecho").first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(22);
    await page.keyboard.press("Escape");
    const docs = await abrirCartao(page, "Documentos");
    expect(await docs.locator(".dc-cartao-ia__trecho").first().evaluate((el) => el.getBoundingClientRect().height)).toBeLessThan(22);
  });

  test("Audiências: o dia da semana curto antes do processo; a cancelada ganha a marca", async ({ page }) => {
    const saida = structuredClone(audienciasDaSemana.saida);
    saida.itens[1].situacao = "cancelada";
    await abrirResposta(page, [{ ...audienciasDaSemana, saida }]);
    const c = await abrirCartao(page, "Audiências");
    await expect(c.locator(".dc-cartao-ia__sub").first()).toHaveText("qui. · Carlos Henrique Prado × Construtora Vale Norte");
    await expect(c.locator(".dc-cartao-ia__linha").nth(1).locator(".dc-cartao-ia__marca")).toHaveText("cancelada");
    await expect(c.locator(".dc-cartao-ia__linha").first().locator(".dc-cartao-ia__marca")).toHaveCount(0);
  });

  test("ficha do processo: o número de prazos em aberto, Mostrar mais e a última movimentação", async ({ page }) => {
    await abrirResposta(page, [R.ferramenta("l1", "lerProcesso", R.fichaDoProcesso(6), { processoId: uuid(9) })]);
    await expect(acessoAoCartao(page, "Processo")).not.toBeEmpty();
    const c = await abrirCartao(page, "Processo");
    await expect(c.getByRole("heading", { name: "Prazos em aberto · 6" })).toBeVisible();
    await expect(c.locator(".dc-linha-prazo")).toHaveCount(3);
    await c.getByRole("button", { name: "Mostrar mais 3" }).click();
    await expect(c.locator(".dc-linha-prazo")).toHaveCount(6);
    await expect(c.locator(".dc-cartao-ia__movimento")).toHaveText(/^Movimentou em \d\d\/\d\d: Juntada de petição$/);
  });

  test("lista de processos: há quanto tempo cada um andou, e o arquivado ganha a marca", async ({ page }) => {
    const lista = R.processos(3);
    lista.itens[0].ultimaMovimentacao = { dia: "2026-10-28", titulo: "Juntada de petição" };
    lista.itens[1].ultimaMovimentacao = { dia: "2025-06-02", titulo: "Concluso para sentença" };
    lista.itens[1].situacao = "arquivado";
    delete lista.itens[2].ultimaMovimentacao;
    await abrirResposta(page, [R.ferramenta("b1", "buscarProcessos", lista, { ordem: "parados" })]);
    const linhas = (await abrirCartao(page, "Processos")).locator(".dc-cartao-ia__linha");
    await expect(linhas.nth(0).locator(".dc-cartao-ia__sub")).toContainText("Movimentou ontem · ");
    await expect(linhas.nth(1).locator(".dc-cartao-ia__sub")).toContainText("Movimentou há 1 ano · ");
    await expect(linhas.nth(1).locator(".dc-cartao-ia__marca")).toHaveText("arquivado");
    await expect(linhas.nth(2).locator(".dc-cartao-ia__sub")).not.toContainText("Movimentou");
  });

  test("prazo cumprido antes: o selo diz quando foi cumprido e a marca, quando vencia", async ({ page }) => {
    const lista = R.prazos(2);
    lista.itens[0] = { ...lista.itens[0]!, situacao: "cumprido", fim: "2026-11-09", quando: "9 nov", cumpridoEm: "2026-10-29" };
    await abrirResposta(page, [R.ferramenta("p1", "buscarPrazos", lista, { situacao: "cumprido" })]);
    const folha = await abrirCartao(page, "Prazos");
    const linha = folha.locator(".dc-linha-prazo").first();
    await expect(linha.locator(".dc-selo")).toHaveText("Cumprido 29/10");
    await expect(linha.locator(".dc-cartao-ia__marca")).toHaveText("vencia 09/11");
    await expect(folha.getByRole("link", { name: "Prazos" })).toHaveAttribute("href", "/prazos?quando=cumpridos");
  });

  test("contagem: a explicação recolhida em Como contei, com o calendário à vista; a antiga, sem calendário, abre", async ({ page }) => {
    const partes = amostras.conversaContagem!.corpo.mensagens[1].partes;
    // A conversa gravada antes do calendário na contagem.
    const { calendario: _, ...semCalendario } = partes[0].saida;
    const antiga = [{ ...partes[0], saida: semCalendario }, partes[1]];
    const saida = { ...semCalendario, calendario: "TJSC, sem feriados municipais" };
    await abrirResposta(page, [{ ...antiga[0], saida }, antiga[1]], "Publicado hoje, 15 dias úteis vence quando?");
    await expect(acessoAoCartao(page, "Contagem do prazo")).toContainText(/dias úteis · vence em \d\d\/\d\d/);
    const c = await abrirCartao(page, "Contagem do prazo");
    await expect(c.getByText("Como contei")).toBeVisible();
    await expect(c.getByText("TJSC, sem feriados municipais")).toBeVisible();
    await expect(c.getByText(saida.explicacao)).toBeHidden();
    await c.getByText("Como contei").click();
    await expect(c.getByText(saida.explicacao)).toBeVisible();

    await abrirResposta(page, antiga, "Publicado hoje, 15 dias úteis vence quando?");
    const antigo = await abrirCartao(page, "Contagem do prazo");
    await expect(antigo.getByText("Como contei")).toBeVisible();
    await expect(antigo.locator(".dc-contagem__calendario")).toHaveCount(0);

    // O vencimento adiado (caía num feriado): a caixa do Vence diz de onde veio, já que a explicação fica recolhida.
    await abrirResposta(page, [{ ...antiga[0], saida: { ...saida, fim: "2026-11-03", prorrogadoDe: "2026-11-02" } }]);
    await expect((await abrirCartao(page, "Contagem do prazo")).locator(".dc-contagem__passo--fim")).toContainText("adiado de 02/11");
  });

  test("O escritório agora: cada número é o da tela que o link abre, e as tarefas atrasadas aparecem", async ({ page }) => {
    await abrirResposta(page, [R.ferramenta("n1", "panorama", PANORAMA)]);
    await expect(acessoAoCartao(page, "O escritório agora")).toContainText("1 prazo vencido · 4 prazos até hoje · 7 publicações novas");
    const c = await abrirCartao(page, "O escritório agora");
    const numero = (rotulo: string) => c.locator(".dc-contador").filter({ hasText: rotulo });
    await expect(numero("Vencidos").locator(".dc-contador__n")).toHaveText("1");
    await expect(numero("Vencidos")).toHaveAttribute("href", "/prazos?quando=vencidos");
    // Na tela de Prazos, "Hoje" e "Semana" contam os vencidos junto.
    await expect(numero("Até hoje").locator(".dc-contador__n")).toHaveText("4");
    await expect(numero("Até hoje")).toHaveAttribute("href", "/prazos?quando=hoje");
    await expect(numero("Até 7 dias").locator(".dc-contador__n")).toHaveText("11");
    await expect(numero("Até 7 dias")).toHaveAttribute("href", "/prazos?quando=semana");
    await expect(numero("Publicações novas").locator(".dc-contador__n")).toHaveText("7");
    await expect(c.locator(".dc-cartao-ia__rodape")).toContainText("1 tarefa atrasada, 4 para hoje (2 com você)");
    await expect(c.locator(".dc-cartao-ia__rodape")).toContainText("3 publicações pendentes");
    // O número abre a tela pelo roteador, sem recarregar o app.
    await page.evaluate(() => ((window as unknown as { __semRecarregar: boolean }).__semRecarregar = true));
    await numero("Vencidos").click();
    await expect(page).toHaveURL(/\/prazos\?quando=vencidos$/);
    expect(await page.evaluate(() => (window as unknown as { __semRecarregar?: boolean }).__semRecarregar)).toBe(true);
  });

  test("publicação lida: um cartão com ela; a que já está na lista da mesma resposta não repete", async ({ page }) => {
    const lista = R.publicacoes(3);
    const lida = { ...lista.itens[0], teor: "Ante o exposto, JULGO PROCEDENTE o pedido…" };
    await abrirResposta(page, [R.ferramenta("r1", "lerPublicacao", lida, { publicacaoId: lida.id })], "O que a intimação da Marina pede?");
    await expect(page.locator(".dc-passo")).toHaveText("Leu · Intimação");
    await expect(acessoAoCartao(page, "Publicação lida")).toContainText("Intimação");
    const c = await abrirCartao(page, "Publicação lida");
    await expect(c.locator(".dc-cartao-ia__linha")).toHaveCount(1);
    await expect(c.getByRole("link", { name: /Intimação/ })).toHaveAttribute("href", `/publicacoes/${lida.id}`);

    await abrirResposta(page, [R.ferramenta("u1", "buscarPublicacoes", lista), R.ferramenta("r1", "lerPublicacao", lida, { publicacaoId: lida.id })]);
    await expect(acessoAoCartao(page, "Publicações")).toBeVisible();
    await expect(acessoAoCartao(page, "Publicação lida")).toHaveCount(0);
  });
});

test.describe("os passos", () => {
  test("enquanto a IA consulta, cada passo à vista; terminada, as consultas viram uma linha que abre a lista", async ({ page }) => {
    await ligarAosPoucos(page);
    const RESPOSTA = uuid(312);
    const partes = [
      R.ferramenta("f1", "panorama", PANORAMA),
      { ...prazosDaSemana, id: "f2" },
      { ...audienciasDaSemana, id: "f3" },
      R.ferramenta("f4", "lerDocumento", null),
      R.texto("Hoje vencem três prazos."),
    ];
    (partes[3] as { erro?: string }).erro = "Não achei este documento.";
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Hoje", [pessoa(uuid(311), "Como está hoje?")])));
    const eventos = [
      { e: { t: "inicio", conversa: { id: CONVERSA, titulo: "Como está hoje", modo: "pergunte" }, pergunta: { id: uuid(311) }, resposta: { id: RESPOSTA } } },
      ...["f1", "f2", "f3"].flatMap((id, i) => {
        const p = partes[i] as { nome: string; entrada: unknown; saida: unknown };
        return [{ e: { t: "ferramenta", id, nome: p.nome, entrada: p.entrada } }, { e: { t: "resultado", id, nome: p.nome, saida: p.saida } }];
      }),
      { e: { t: "ferramenta", id: "f4", nome: "lerDocumento", entrada: {} } },
      { e: { t: "resultado", id: "f4", nome: "lerDocumento", erro: "Não achei este documento." } },
      { e: { t: "texto", v: "Hoje vencem três prazos." } },
      { portao: "fim" },
      { e: { t: "fim", mensagem: { id: RESPOSTA } } },
    ];
    await roteiro(page, eventos);
    const campo = page.getByRole("textbox", { name: "Pergunta" });
    await campo.fill("Como está hoje?");
    await campo.press("Enter");
    await noPortao(page, "fim");
    await expect(page.locator(".dc-passo")).toHaveCount(4);
    await expect(page.getByRole("button", { name: /Consultou/ })).toHaveCount(0);
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Hoje", [pessoa(uuid(311), "Como está hoje?"), ia(RESPOSTA, partes)]));
    await abrirPortao(page, "fim");
    const resumo = page.getByRole("button", { name: "Consultou 4 coisas · 1 não deu certo" });
    await expect(resumo).toBeVisible();
    await expect(page.getByRole("list", { name: "O que a IA consultou" })).toHaveCount(0);
    expect(await altura(page, ".dc-chat__autor")).toBeLessThanOrEqual(26);
    await resumo.click();
    await expect(page.getByRole("list", { name: "O que a IA consultou" }).getByText("Lendo o documento: não achei este documento")).toBeVisible();
    await expect(resumo).toHaveAttribute("aria-expanded", "true");
  });

  test("com duas consultas, os passos ficam à vista", async ({ page }) => {
    await abrir(page, `/perguntar/${ids.conversaProcesso}`, comIa());
    await expect(page.getByRole("list", { name: "O que a IA consultou" }).first().locator(".dc-passo")).toHaveCount(2);
    await expect(page.getByRole("button", { name: /Consultou/ })).toHaveCount(0);
  });
});

test.describe("sugestões da conversa nova", () => {
  test("cada sugestão pede o que o número dela conta", async ({ page }) => {
    const api = await abrir(page, "/perguntar", comIa());
    const menu = euComIa.menu as { prazos: number; publicacoes: number; alvaras: number };
    const prazos = page.getByRole("button", { name: /Prazos da semana/ });
    await expect(prazos.locator(".dc-sugestao-ia__n")).toHaveText(String(menu.prazos));
    await expect(prazos).toContainText("Quais prazos vencem nos próximos 7 dias? Algum já venceu?");
    const publicacoes = page.getByRole("button", { name: /Publicações novas/ });
    await expect(publicacoes.locator(".dc-sugestao-ia__n")).toHaveText(String(menu.publicacoes));
    await expect(publicacoes).toContainText("sem as pendentes");
    await expect(page.getByRole("button", { name: /Minha semana/ })).toContainText("próximos 7 dias");
    await prazos.click();
    await expect.poll(() => api.mudancas("/ia/perguntar")[0]?.corpo).toMatchObject({ texto: "Quais prazos vencem nos próximos 7 dias? Algum já venceu?" });
  });

  test("Jurisprudência: as sugestões não fixam um tribunal (o do escritório vai para a IA pelo servidor)", async ({ page }) => {
    await abrir(page, "/perguntar", comIa());
    await page.getByRole("radio", { name: "Jurisprudência" }).click();
    const sugestoes = page.locator(".dc-sugestao-ia");
    await expect(sugestoes.first()).toBeVisible();
    await expect(page.getByRole("button", { name: /Plano de saúde/ })).toContainText("Dano moral por negativa de cobertura de plano de saúde");
    for (const texto of await sugestoes.allInnerTexts()) expect(texto).not.toMatch(/\b(TJ|TRT|TRF)[A-Z0-9]*\b/);
  });
});
