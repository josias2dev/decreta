/**
 * Perguntar: a resposta chegando de verdade (e2e/aos-poucos.ts), parar no
 * meio, a ligação caindo, consultas que não acharam e cartões com defeito.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids, sobraNaLateral } from "./apoio";
import { abrirPortao, aosPoucos, conversa, ia, ligarAosPoucos, noPortao, pedidos, pessoa, prazosDaSemana, roteiro, uuid } from "./aos-poucos";

const comIa = () => new ApiFalsa().responder("/eu", euComIa);
const CONVERSA = uuid(100);
const PERGUNTA = uuid(101);
const RESPOSTA = uuid(102);
const inicio = (pergunta = PERGUNTA, resposta = RESPOSTA, titulo = "Quais prazos vencem esta semana") => ({ t: "inicio", conversa: { id: CONVERSA, titulo, modo: "pergunte" }, pergunta: { id: pergunta }, resposta: { id: resposta } });
const TEXTO: string = amostras.conversaSemana!.corpo.mensagens[1].partes[1].texto;

async function perguntarAgora(page: Page, texto = "Quais prazos vencem esta semana?") {
  const campo = page.getByRole("textbox", { name: "Pergunta" });
  await campo.fill(texto);
  await campo.press("Enter");
}

/** Quantas respostas da IA a tela mostrou ao mesmo tempo, no máximo, durante `ms`. */
async function maximoDeRespostas(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<number>((ok) => {
        let max = 0;
        const fim = performance.now() + ms;
        const olhar = () => {
          max = Math.max(max, document.querySelectorAll(".dc-chat__resposta").length);
          if (performance.now() < fim) requestAnimationFrame(olhar);
          else ok(max);
        };
        requestAnimationFrame(olhar);
      }),
    ms,
  );
}

test.describe("parar e cair no meio", () => {
  test("parar no meio do texto: a resposta fica uma vez só, com o aviso, e a gravada toma o lugar", async ({ page }) => {
    await ligarAosPoucos(page);
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    const metade = TEXTO.slice(0, 120);
    await roteiro(page, [{ e: inicio() }, { e: { t: "ferramenta", id: "f1", nome: "buscarPrazos", entrada: prazosDaSemana.entrada } }, { e: { t: "resultado", id: "f1", nome: "buscarPrazos", saida: prazosDaSemana.saida }, espera: 50 }, ...aosPoucos(metade), { portao: "meio" }, ...aosPoucos(TEXTO.slice(120))]);
    await perguntarAgora(page);
    await noPortao(page, "meio");
    // O servidor grava o que chegou, com o id do "inicio" e o aviso.
    const gravada = ia(RESPOSTA, [{ ...prazosDaSemana, id: "f1" }, { tipo: "texto", texto: metade }, { tipo: "texto", texto: "[Você parou a resposta aqui.]" }]);
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), gravada]));
    await page.getByRole("button", { name: "Parar a resposta" }).click();
    await expect(page.getByText("[Você parou a resposta aqui.]")).toBeVisible();
    expect(await maximoDeRespostas(page, 1500)).toBe(1);
    // A gravada (com a hora) tomou o lugar da cópia.
    await expect(page.locator(".dc-chat__resposta .dc-chat__pe .dc-chat__hora")).toHaveCount(1);
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
  });

  test("parar antes de o 'inicio' chegar, numa conversa que já existe: a pergunta e o aviso aparecem uma vez só", async ({ page }) => {
    await ligarAosPoucos(page);
    const antes = [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), ia(RESPOSTA, [{ tipo: "texto", texto: "Vencem seis." }])];
    const api = await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", antes)));
    await expect(page.getByText("Vencem seis.")).toBeVisible();
    await roteiro(page, [{ portao: "antes" }, { e: inicio(uuid(103), uuid(104)) }]);
    await perguntarAgora(page, "E as audiências?");
    await noPortao(page, "antes");
    // O servidor já tinha gravado a pergunta, e grava o aviso quando a pessoa para.
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [...antes, pessoa(uuid(103), "E as audiências?"), ia(uuid(104), [{ tipo: "texto", texto: "[Você parou a resposta aqui.]" }])]));
    await page.getByRole("button", { name: "Parar a resposta" }).click();
    const max = page.evaluate(
      () =>
        new Promise<number>((ok) => {
          let n = 0;
          const fim = performance.now() + 2000;
          const olhar = () => {
            n = Math.max(n, document.querySelectorAll(".dc-chat__pergunta").length);
            if (performance.now() < fim) requestAnimationFrame(olhar);
            else ok(n);
          };
          requestAnimationFrame(olhar);
        }),
    );
    expect(await max).toBe(2);
    await expect(page.locator(".dc-chat__pergunta")).toHaveCount(2);
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(2);
    await expect(page.getByText("[Você parou a resposta aqui.]")).toHaveCount(1);
  });

  test("parar antes de qualquer texto: um bloco só, com o aviso", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    await roteiro(page, [{ e: inicio() }, { portao: "pensando" }]);
    await perguntarAgora(page);
    await noPortao(page, "pensando");
    await page.getByRole("button", { name: "Parar a resposta" }).click();
    await expect(page.getByText("[Você parou a resposta aqui.]")).toBeVisible();
    expect(await maximoDeRespostas(page, 1200)).toBe(1);
  });

  test("parar enquanto lê os autos: o passo para de girar e a conversa gravada assim abre", async ({ page }) => {
    await ligarAosPoucos(page);
    const marina = amostras.conversaProcesso!.corpo.mensagens[1].partes;
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Marina", [pessoa(PERGUNTA, "Em que pé está o processo da Marina?")])));
    await roteiro(page, [{ e: inicio() }, { e: { t: "ferramenta", id: "b1", nome: "buscarProcessos", entrada: marina[0].entrada } }, { e: { t: "resultado", id: "b1", nome: "buscarProcessos", saida: marina[0].saida } }, { e: { t: "ferramenta", id: "l1", nome: "lerProcesso", entrada: marina[1].entrada } }, { portao: "lendo" }]);
    await perguntarAgora(page, "Em que pé está o processo da Marina?");
    await noPortao(page, "lendo");
    await expect(page.locator(".dc-passo.is-lendo")).toHaveText("Lendo os autos…");
    await page.getByRole("button", { name: "Parar a resposta" }).click();
    await expect(page.locator(".dc-passo").filter({ hasText: "Lendo os autos: não terminou" })).toBeVisible();
    await expect(page.locator(".dc-passo.is-lendo")).toHaveCount(0);

    // Como ficou gravado antes da correção do servidor (saída nula) e como fica agora (erro): as duas abrem.
    for (const lerProcesso of [{ saida: null }, { saida: null, erro: "Parou antes de terminar." }]) {
      const partes = [{ tipo: "ferramenta", id: "b1", nome: "buscarProcessos", entrada: marina[0].entrada, saida: marina[0].saida }, { tipo: "ferramenta", id: "l1", nome: "lerProcesso", entrada: marina[1].entrada, ...lerProcesso }, { tipo: "texto", texto: "[Você parou a resposta aqui.]" }];
      api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Marina", [pessoa(PERGUNTA, "Em que pé está o processo da Marina?"), ia(RESPOSTA, partes)]));
      await page.goto(`/perguntar/${CONVERSA}`);
      await expect(page.getByText("[Você parou a resposta aqui.]")).toBeVisible();
      await expect(page.locator(".dc-passo").filter({ hasText: lerProcesso.erro ? "Lendo os autos: parou antes de terminar" : "Lendo os autos: não terminou" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
    }
  });

  test("a ligação cai no meio: Tentar de novo refaz a mesma pergunta, sem gravar outra", async ({ page }) => {
    await ligarAosPoucos(page);
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    await roteiro(page, [{ e: inicio() }, ...aosPoucos(TEXTO.slice(0, 90)), { cair: true }]);
    await perguntarAgora(page);
    await expect(page.getByRole("alert").filter({ hasText: "Sem conexão com o servidor" })).toBeVisible();
    // O servidor gravou o pedaço que chegou; a conversa recarregada já o traz.
    const cortada = ia(RESPOSTA, [{ tipo: "texto", texto: TEXTO.slice(0, 90) }, { tipo: "texto", texto: "[A resposta parou no meio. Pergunte de novo.]" }]);
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), cortada]));
    await roteiro(page, [{ e: inicio(PERGUNTA, uuid(104)) }, { portao: "refazendo" }, ...aosPoucos(TEXTO.slice(0, 60)), { e: { t: "fim", mensagem: { id: uuid(104) } } }]);
    await page.getByRole("button", { name: "Tentar de novo" }).click();
    await noPortao(page, "refazendo");
    expect((await pedidos(page))[1]).toEqual({ texto: "Quais prazos vencem esta semana?", modo: "pergunte", conversaId: CONVERSA, refazer: PERGUNTA });
    await expect(page.locator(".dc-chat__pergunta")).toHaveCount(1);
    // A resposta cortada, que o servidor apaga ao refazer, já sai da tela.
    await expect(page.getByText("[A resposta parou no meio. Pergunte de novo.]")).toHaveCount(0);
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), ia(uuid(104), [{ tipo: "texto", texto: TEXTO.slice(0, 60) }])]));
    await abrirPortao(page, "refazendo");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
    await expect(page.locator(".dc-chat__pergunta")).toHaveCount(1);
    await expect(page.locator(".dc-chat__resposta")).toHaveCount(1);
  });

  test("pergunta seguinte logo depois da primeira: o fim da primeira não mexe na segunda", async ({ page }) => {
    await ligarAosPoucos(page);
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    // A primeira fecha só depois do nome da conversa (o servidor pede à IA no fim).
    await roteiro(page, [{ e: inicio() }, ...aosPoucos("Até domingo vencem 6 prazos."), { portao: "fim-1" }, { e: { t: "fim", mensagem: { id: RESPOSTA } } }, { portao: "nome" }, { e: { t: "titulo", v: "Prazos da semana" } }]);
    await perguntarAgora(page);
    await noPortao(page, "fim-1");
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), ia(RESPOSTA, [{ tipo: "texto", texto: "Até domingo vencem 6 prazos." }])]));
    await abrirPortao(page, "fim-1");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeAttached();
    await roteiro(page, [{ e: inicio(uuid(105), uuid(106)) }, ...aosPoucos("Hoje vencem três, dois com você."), { portao: "meio" }, ...aosPoucos(" Amanhã vencem os embargos."), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(106) } } }]);
    await perguntarAgora(page, "E hoje?");
    await noPortao(page, "meio");
    await abrirPortao(page, "nome");
    await expect(page.getByRole("heading", { level: 1, name: "Prazos da semana" })).toBeVisible();
    await page.waitForTimeout(300);
    await expect(page.getByRole("button", { name: "Parar a resposta" })).toBeVisible();
    await expect(page.locator(".dc-md.is-escrevendo")).toHaveCount(1);
    await abrirPortao(page, "meio");
    await noPortao(page, "fim");
    await expect(page.getByText("Hoje vencem três, dois com você. Amanhã vencem os embargos.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Parar a resposta" })).toBeVisible();
    await abrirPortao(page, "fim");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
  });

  test("pergunta seguinte antes de a conversa gravada voltar: a primeira resposta não some", async ({ page }) => {
    await ligarAosPoucos(page);
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    await roteiro(page, [{ e: inicio() }, ...aosPoucos("Até domingo vencem 6 prazos."), { portao: "fim-1" }, { e: { t: "fim", mensagem: { id: RESPOSTA } } }]);
    await perguntarAgora(page);
    await noPortao(page, "fim-1");
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), ia(RESPOSTA, [{ tipo: "texto", texto: "Até domingo vencem 6 prazos." }])]));
    // O servidor demora a devolver a conversa gravada (rede lenta).
    let soltar = () => {};
    const segura = new Promise<void>((ok) => (soltar = ok));
    await page.route(`**/api/app/ia/conversas/${CONVERSA}`, async (r) => {
      await segura;
      await r.fallback();
    });
    await roteiro(page, [{ e: inicio(uuid(105), uuid(106)) }, ...aosPoucos("Hoje vencem três."), { portao: "fim-2" }, { e: { t: "fim", mensagem: { id: uuid(106) } } }]);
    const sumiu = page.evaluate(
      () =>
        new Promise<number>((ok) => {
          let quadros = 0;
          const fim = performance.now() + 1500;
          const olhar = () => {
            const tela = document.querySelector(".dc-chat__mensagens")?.textContent ?? "";
            if (tela.includes("E hoje?") && !tela.includes("Até domingo vencem 6 prazos.")) quadros++;
            if (performance.now() < fim) requestAnimationFrame(olhar);
            else ok(quadros);
          };
          requestAnimationFrame(olhar);
        }),
    );
    await abrirPortao(page, "fim-1");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeAttached();
    await perguntarAgora(page, "E hoje?");
    await noPortao(page, "fim-2");
    soltar();
    expect(await sumiu).toBe(0);
    await abrirPortao(page, "fim-2");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
    // Quando a conversa gravada volta, cada coisa aparece uma vez, na ordem.
    const textos = await page.locator(".dc-chat__mensagens > *").allTextContents();
    expect(textos.filter((t) => t.includes("Até domingo vencem 6 prazos."))).toHaveLength(1);
    expect(textos.findIndex((t) => t.includes("Até domingo"))).toBeLessThan(textos.findIndex((t) => t.includes("E hoje?")));
  });

  test("conversa nova que falhou: Nova conversa e a volta à tela trazem a saudação", async ({ page }) => {
    await abrir(page, "/perguntar", comIa().responder("POST /ia/perguntar", { erro: "limite", detalhe: "Você chegou ao limite de perguntas de hoje." }, 429));
    await page.getByRole("button", { name: /Contar um prazo/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "limite de perguntas" })).toBeVisible();
    await page.getByRole("navigation", { name: "Conversas" }).getByRole("link", { name: "Nova conversa" }).click();
    await expect(page.getByRole("heading", { name: "Bom dia, Beatriz" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Prazos da semana/ })).toBeVisible();

    await page.getByRole("button", { name: /Contar um prazo/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "limite de perguntas" })).toBeVisible();
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Hoje" }).click();
    await expect(page).toHaveURL(/\/hoje$/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Bom dia, Beatriz" })).toBeVisible();
  });
});

test.describe("enquanto o texto chega", () => {
  test("cumprido enquanto o texto chega continua cumprido quando a resposta termina", async ({ page }) => {
    await ligarAosPoucos(page);
    const api = await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    const ferramenta = { ...prazosDaSemana, id: "f1" };
    await roteiro(page, [{ e: inicio() }, { e: { t: "ferramenta", id: "f1", nome: "buscarPrazos", entrada: prazosDaSemana.entrada } }, { e: { t: "resultado", id: "f1", nome: "buscarPrazos", saida: prazosDaSemana.saida } }, ...aosPoucos(TEXTO.slice(0, 80)), { portao: "antes-do-fim" }, { e: { t: "fim", mensagem: { id: RESPOSTA } } }]);
    await perguntarAgora(page);
    await noPortao(page, "antes-do-fim");
    // Enquanto a IA escreve, o cartão fica só com o topo; dá para abrir.
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toHaveCount(0);
    await page.getByRole("button", { name: "Abrir o cartão: Prazos" }).click();
    await page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" }).click();
    await expect(page.getByRole("button", { name: "Desfazer: Contestação trabalhista" })).toBeVisible();
    // A resposta gravada traz a foto de quando a IA consultou (o prazo ainda aberto).
    api.responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?"), ia(RESPOSTA, [ferramenta, { tipo: "texto", texto: TEXTO.slice(0, 80) }])]));
    await abrirPortao(page, "antes-do-fim");
    await expect(page.locator(".dc-chat__resposta .dc-chat__pe .dc-chat__hora")).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Desfazer: Contestação trabalhista" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toHaveCount(0);
  });

  test("link, negrito e tabela pela metade não aparecem crus", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, "/perguntar", comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos vencem esta semana?")])));
    const resposta = () => page.locator(".dc-chat__resposta").last();
    await roteiro(page, [
      { e: inicio() },
      { e: { t: "texto", v: "Venceu a [contestação trabalhista](/prazos/f2aa25d5-44" } },
      { portao: "link" },
      { e: { t: "texto", v: "15-454f-8c75-c3edd821b373) e há **3 pra" } },
      { portao: "negrito" },
      { e: { t: "texto", v: "zos** hoje.\n\n| Prazo | Ven" } },
      { portao: "cabecalho" },
      { e: { t: "texto", v: "ce |\n| --- | -" } },
      { portao: "separador" },
      { e: { t: "texto", v: "-- |\n| Réplica | 30/10 |\n" } },
      { e: { t: "fim", mensagem: { id: RESPOSTA } } },
    ]);
    await perguntarAgora(page);
    await noPortao(page, "link");
    await expect(resposta().locator(".dc-md")).toHaveText("Venceu a contestação trabalhista");
    await abrirPortao(page, "link");
    await noPortao(page, "negrito");
    await expect(resposta().getByRole("link", { name: "contestação trabalhista" })).toBeVisible();
    await expect(resposta().locator(".dc-md")).toHaveText("Venceu a contestação trabalhista e há 3 pra");
    await abrirPortao(page, "negrito");
    await noPortao(page, "cabecalho");
    await expect(resposta().locator("strong")).toHaveText("3 prazos");
    await expect(resposta().locator(".dc-md")).not.toContainText("|");
    await abrirPortao(page, "cabecalho");
    await noPortao(page, "separador");
    await expect(resposta().locator(".dc-md")).not.toContainText("|");
    await expect(resposta().locator("table")).toHaveCount(0);
    await abrirPortao(page, "separador");
    await expect(resposta().getByRole("cell", { name: "Réplica" })).toBeVisible();
    await expect(resposta().getByRole("columnheader", { name: "Vence" })).toBeVisible();
  });
});

test.describe("o que a IA não achou, e cartão com defeito", () => {
  test("consulta que não achou vira aviso no passo, sem cartão; cartão com defeito não derruba a conversa", async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    const partes = [
      // Como as conversas antigas guardaram o "não achei": dentro da saída.
      { tipo: "ferramenta", id: "d1", nome: "lerDocumento", entrada: { documentoId: ids.processo }, saida: { erro: "Não achei documento com esse id." } },
      { tipo: "ferramenta", id: "c1", nome: "lerCliente", entrada: { clienteId: uuid(7) }, saida: { erro: "Não achei este cliente." } },
      // Como fica agora: erro da ferramenta, sem saída.
      { tipo: "ferramenta", id: "p1", nome: "lerProcesso", entrada: { processoId: uuid(8) }, saida: null, erro: "Não achei este processo." },
      // Uma saída que a tela não esperava (prazo sem processo).
      { tipo: "ferramenta", id: "z1", nome: "buscarPrazos", entrada: {}, saida: { total: 1, itens: [{ id: uuid(9), tipo: "Réplica", quando: "Hoje", urgencia: "hoje", situacao: "confirmado" }] } },
      { tipo: "texto", texto: "Não achei esse documento nem o processo. Confira o nome." },
    ];
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Documento", [pessoa(PERGUNTA, "Leia o documento"), ia(RESPOSTA, partes)])));
    await expect(page.getByText("Não achei esse documento nem o processo. Confira o nome.")).toBeVisible();
    // Quatro consultas: terminada a resposta, viram uma linha só, que abre a lista.
    await page.getByRole("button", { name: "Consultou 4 coisas · 3 não deram certo" }).click();
    const passos = page.getByRole("list", { name: "O que a IA consultou" });
    await expect(passos.getByText("Lendo o documento: não achei documento com esse id")).toBeVisible();
    await expect(passos.getByText("Abrindo a ficha do cliente: não achei este cliente")).toBeVisible();
    await expect(passos.getByText("Lendo os autos: não achei este processo")).toBeVisible();
    await expect(page.locator(".dc-cartao-ia")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Não deu para mostrar esta consulta" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Nesta conversa" })).toHaveCount(0);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("o 'não achei' do servidor, com a dica para a IA: o passo mostra a primeira frase, e o erro inteiro fica no title", async ({ page }) => {
    const partes = [
      { tipo: "ferramenta", id: "p1", nome: "lerProcesso", entrada: { processoId: uuid(8) }, saida: null, erro: "Não achei processo com este id. Busque de novo pelo nome." },
      { tipo: "ferramenta", id: "u1", nome: "lerPublicacao", entrada: { publicacaoId: uuid(9) }, saida: null, erro: "Não achei publicação com este id. Busque de novo pelo nome." },
      // Frase com nome entre aspas (e abreviação): não é cortada no meio.
      { tipo: "ferramenta", id: "b1", nome: "buscarPrazos", entrada: { responsavel: "Dra. Bia" }, saida: null, erro: 'Não há ninguém chamado "Dra. Bia" na equipe. A equipe: Beatriz Souza, Rafael Lima.' },
      { tipo: "texto", texto: "Não achei esse processo. Confira o número." },
    ];
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Processo", [pessoa(PERGUNTA, "Em que pé está o processo?"), ia(RESPOSTA, partes)])));
    await page.getByRole("button", { name: "Consultou 3 coisas · 3 não deram certo" }).click();
    const passos = page.getByRole("list", { name: "O que a IA consultou" });
    await expect(passos.locator(".dc-passo").nth(0)).toHaveText("Lendo os autos: não achei processo com este id");
    await expect(passos.locator(".dc-passo").nth(0)).toHaveAttribute("title", "Não achei processo com este id. Busque de novo pelo nome.");
    await expect(passos.locator(".dc-passo").nth(1)).toHaveText("Lendo a publicação: não achei publicação com este id");
    await expect(passos.locator(".dc-passo").nth(2)).toHaveText("Buscando prazos: não deu");
    await expect(page.locator(".dc-cartao-ia")).toHaveCount(0);
  });

  test("agenda vazia: o passo diz que está livre, e nenhum cartão aparece", async ({ page }) => {
    const partes = [
      { tipo: "ferramenta", id: "a1", nome: "verAgenda", entrada: { de: "2026-10-31", ate: "2026-11-01" }, saida: { dias: [{ dia: "2026-10-31", rotulo: "Sábado, 31 de outubro", itens: [] }, { dia: "2026-11-01", rotulo: "Domingo, 1º de novembro", itens: [] }] } },
      { tipo: "ferramenta", id: "a2", nome: "buscarAudiencias", entrada: {}, saida: { total: 0, itens: [] } },
      { tipo: "texto", texto: "O fim de semana está livre." },
    ];
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Fim de semana", [pessoa(PERGUNTA, "O que tenho no fim de semana?"), ia(RESPOSTA, partes)])));
    await expect(page.getByRole("list", { name: "O que a IA consultou" }).getByRole("listitem")).toHaveCount(2);
    await expect(page.getByRole("listitem", { name: "Agenda livre" })).toBeVisible();
    await expect(page.getByRole("listitem", { name: "Nenhuma audiência" })).toBeVisible();
    await expect(page.locator(".dc-cartao-ia")).toHaveCount(0);
  });

  test("pedido errado que a IA refez logo depois: só o passo que deu certo aparece", async ({ page }) => {
    const partes = [
      { tipo: "ferramenta", id: "e1", nome: "buscarPrazos", entrada: { limite: 100 }, saida: null, erro: "limite: no máximo 50." },
      { tipo: "ferramenta", id: "e2", nome: "buscarPrazos", entrada: { limite: 50 }, saida: { total: 0, itens: [] } },
      // Outra ferramenta depois não conta como refazer: o erro fica à vista.
      { tipo: "ferramenta", id: "e3", nome: "lerProcesso", entrada: { processoId: uuid(8) }, saida: null, erro: "Não achei processo com este id. Busque de novo pelo nome." },
      { tipo: "ferramenta", id: "e4", nome: "buscarProcessos", entrada: { busca: "Marina" }, saida: { total: 0, itens: [] } },
      { tipo: "texto", texto: "Não há prazos abertos." },
    ];
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Prazos", [pessoa(PERGUNTA, "Quais prazos?"), ia(RESPOSTA, partes)])));
    await page.getByRole("button", { name: "Consultou 3 coisas · 1 não deu certo" }).click();
    const passos = page.getByRole("list", { name: "O que a IA consultou" }).locator(".dc-passo");
    await expect(passos).toHaveText(["Nenhum prazo", "Lendo os autos: não achei processo com este id", "Nenhum processo"]);
  });

  test("tela que quebra: o aviso em português, com o menu", async ({ page }) => {
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, { rodape: "", conversa: null, mensagens: [] }));
    await expect(page.getByRole("alert").getByText("Algo deu errado nesta tela")).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Menu principal" })).toBeVisible();
    await page.getByRole("navigation", { name: "Menu principal" }).getByRole("link", { name: "Perguntar" }).click();
    await expect(page.getByRole("heading", { name: "Bom dia, Beatriz" })).toBeVisible();
  });

  test("links para o que não tem tela: o alvará leva ao processo dele, o negócio fica só texto", async ({ page }) => {
    const alvara = uuid(20);
    const processo = ids.processo;
    const partes = [
      { tipo: "ferramenta", id: "a1", nome: "buscarAlvaras", entrada: {}, saida: { total: 1, valorTotal: "1520.00", itens: [{ id: alvara, descricao: "Alvará de honorários", valor: "1520.00", valorRecebido: null, etapa: "aguardando_saque", expedidoEm: "2026-10-20", processo: { id: processo, titulo: "Marina Duarte × Seguradora Alfa S.A.", cnj: null } }] } },
      { tipo: "texto", texto: `O [alvará da Marina](/alvaras/${alvara}) espera o saque. A [Carla](/negocios/${uuid(21)}) mandou os documentos, e a [peça do laudo](/pecas/${ids.peca}) está pronta; veja a [audiência](/agenda/${uuid(22)}).` },
    ];
    await abrir(page, `/perguntar/${CONVERSA}`, comIa().responder(`/ia/conversas/${CONVERSA}`, conversa(CONVERSA, "Alvarás", [pessoa(PERGUNTA, "Quais alvarás faltam?"), ia(RESPOSTA, partes)])));
    const texto = page.locator(".dc-chat__resposta .dc-md");
    await expect(texto.getByRole("link", { name: "alvará da Marina" })).toHaveAttribute("href", `/processos/${processo}`);
    await expect(texto.getByRole("link", { name: "peça do laudo" })).toHaveAttribute("href", `/pecas?id=${ids.peca}`);
    await expect(texto.getByText("Carla")).toBeVisible();
    await expect(texto.getByRole("link", { name: "Carla" })).toHaveCount(0);
    await expect(texto.getByRole("link", { name: "audiência" })).toHaveCount(0);
    await texto.getByRole("link", { name: "alvará da Marina" }).click();
    await expect(page).toHaveURL(new RegExp(`/processos/${processo}$`));
  });
});
