/**
 * Perguntar: a rolagem da conversa com a resposta chegando de verdade
 * (e2e/aos-poucos.ts). O texto que a IA escreve fica à vista, a tela só para
 * de acompanhar quando a pessoa sobe, e o botão de ir para o fim leva de volta.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, euComIa, ids } from "./apoio";
import { abrirPortao, aosPoucos, audienciasDaSemana, conversa, ligarAosPoucos, noPortao, prazosDaSemana, roteiro, uuid, type Passo } from "./aos-poucos";

const comIa = () => new ApiFalsa().responder("/eu", euComIa);
const SEMANA = ids.conversaSemana;

const TEXTO_LONGO = [
  "Até domingo vencem **6 prazos**, e um já passou: a contestação trabalhista da Padaria Bom Grão venceu ontem, 28/10, com o Tiago. Vale confirmar com ele agora se a peça foi protocolada, porque o sistema ainda mostra o prazo em aberto.",
  "Os outros cinco estão dentro do prazo, mas dois vencem amanhã e pedem atenção hoje ainda. A réplica da Ana Lúcia Ferraz depende do parecer do perito, que chegou na terça e ainda não foi lido por ninguém da equipe.",
  "- **Hoje:** conferir a contestação da Padaria Bom Grão com o Tiago.\n- **Amanhã:** réplica da Ana Lúcia Ferraz e manifestação sobre o laudo da Marina Duarte.\n- **Sexta:** embargos de declaração do Carlos Henrique Prado, ainda sem responsável.",
  "Sobre as audiências, são duas nesta semana, as duas hoje à tarde e nenhuma com você. A conciliação do Carlos Henrique Prado é por vídeo, às 14:30, com o Rafael. A instrução da Marina Duarte é presencial, às 16:00, com a Camila.",
  "Se quiser, posso deixar uma tarefa pronta para lembrar o Tiago da contestação, ou listar os prazos que ainda estão com data a confirmar. São 8 nessa situação, e 4 deles estão sem responsável.",
  "Confira cada data nos autos antes de agir. Os cartões abaixo mostram os prazos e as audiências que eu consultei, para você abrir ou marcar como cumprido dali mesmo.",
].join("\n\n");

const inicio = (conversaId = SEMANA, pergunta = uuid(201), resposta = uuid(202)) => ({ e: { t: "inicio", conversa: { id: conversaId, titulo: "Prazos desta semana", modo: "pergunte" }, pergunta: { id: pergunta }, resposta: { id: resposta } } });
const consulta = (id: string, f: { nome: string; entrada: unknown; saida: unknown }): Passo[] => [
  { e: { t: "ferramenta", id, nome: f.nome, entrada: f.entrada }, espera: 150 },
  { e: { t: "resultado", id, nome: f.nome, saida: f.saida }, espera: 300 },
];

async function perguntarAgora(page: Page, texto = "E o que vence esta semana?") {
  await page.getByRole("textbox", { name: "Pergunta" }).fill(texto);
  await page.getByRole("button", { name: "Enviar" }).click();
}

/** A coluna que rola: quanto falta para o fim e onde está o texto que a IA escreve (em relação à parte visível). */
function medir(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector(".dc-chat__rolagem") as HTMLElement;
    const r = el.getBoundingClientRect();
    const esc = el.querySelector(".is-escrevendo");
    return {
      doFim: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
      scrollTop: Math.round(el.scrollTop),
      alto: el.clientHeight,
      /** > 0: o fim do texto sendo escrito está escondido embaixo. */
      escAbaixo: esc ? Math.round(esc.getBoundingClientRect().bottom - (r.top + el.clientHeight)) : null,
      /** Quanto do texto sendo escrito aparece abaixo do topo (< 0: todo acima da tela). */
      escVisivel: esc ? Math.round(esc.getBoundingClientRect().bottom - r.top) : null,
    };
  });
}

/** Grava a cada quadro onde está o texto que a IA escreve e a altura dos cartões da última resposta. */
async function gravar(page: Page) {
  await page.evaluate(() => {
    const w = window as any;
    w.__quadros = [];
    w.__gravando = true;
    const passo = () => {
      const el = document.querySelector(".dc-chat__rolagem") as HTMLElement | null;
      const esc = el?.querySelector(".is-escrevendo");
      if (el && esc) {
        const r = el.getBoundingClientRect();
        const ultima = [...el.querySelectorAll(".dc-chat__resposta")].at(-1);
        w.__quadros.push({
          escAbaixo: Math.round(esc.getBoundingClientRect().bottom - (r.top + el.clientHeight)),
          escVisivel: Math.round(esc.getBoundingClientRect().bottom - r.top),
          cartoes: ultima ? [...ultima.querySelectorAll(".dc-cartao-ia")].map((c) => Math.round(c.getBoundingClientRect().height)) : [],
        });
      }
      if (w.__gravando) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });
}

function pararDeGravar(page: Page): Promise<{ escAbaixo: number; escVisivel: number; cartoes: number[] }[]> {
  return page.evaluate(() => {
    const w = window as any;
    w.__gravando = false;
    return w.__quadros;
  });
}

async function rodar(page: Page, dy: number) {
  const caixa = (await page.locator(".dc-chat__rolagem").boundingBox())!;
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.mouse.wheel(0, dy);
}

const telas = [
  { nome: "computador 1440x900", viewport: { width: 1440, height: 900 } },
  { nome: "computador 1280x720", viewport: { width: 1280, height: 720 } },
  { nome: "celular", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
];

for (const tela of telas) {
  test.describe(tela.nome, () => {
    test.use({ viewport: tela.viewport, isMobile: !!tela.isMobile, hasTouch: !!tela.hasTouch });

    test("da segunda pergunta em diante, o texto que a IA escreve fica à vista, e no fim os cartões abrem embaixo dele", async ({ page }) => {
      await ligarAosPoucos(page);
      await abrir(page, `/perguntar/${SEMANA}`, comIa());
      await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
      await roteiro(page, [inicio(), ...consulta("f-prazos", prazosDaSemana), ...consulta("f-audiencias", audienciasDaSemana), ...aosPoucos(TEXTO_LONGO, 10, 15), { portao: "antes-do-fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
      await gravar(page);
      await perguntarAgora(page);
      await noPortao(page, "antes-do-fim");
      const quadros = await pararDeGravar(page);
      expect(quadros.length).toBeGreaterThan(20);
      // O fim do texto nunca fica escondido (no máximo uma linha, no quadro em que ela chega) nem sobe para fora da tela.
      expect(Math.max(...quadros.map((q) => q.escAbaixo))).toBeLessThanOrEqual(26);
      expect(Math.min(...quadros.map((q) => q.escVisivel))).toBeGreaterThanOrEqual(24);
      // Os cartões ficam só com o topo enquanto a IA escreve.
      expect(Math.max(...quadros.flatMap((q) => q.cartoes))).toBeLessThanOrEqual(60);

      await abrirPortao(page, "antes-do-fim");
      await expect(page.getByRole("button", { name: "Enviar" })).toBeVisible();
      const ultima = page.locator(".dc-chat__resposta").last();
      await expect(ultima.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeAttached();
      // No fim, o fim do texto continua à vista, com o começo dos cartões embaixo.
      await expect(ultima.locator(".dc-md p").last()).toBeInViewport();
      const cartoes = await ultima.locator(".dc-chat__cartoes").boundingBox();
      const coluna = (await page.locator(".dc-chat__rolagem").boundingBox())!;
      expect(cartoes!.y).toBeLessThan(coluna.y + coluna.height - 20);
    });
  });
}

test.describe("no computador", () => {
  test("subir com a roda enquanto a resposta chega: a tela para de puxar, e o botão leva de volta ao fim", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await roteiro(page, [inicio(), ...aosPoucos(`${TEXTO_LONGO}\n\n${TEXTO_LONGO}`, 8, 25), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page);
    await page.waitForFunction(() => (document.querySelector(".is-escrevendo")?.textContent?.length ?? 0) > 200);
    // Um giro só, devagar: antes a tela puxava de volta a cada pedaço de texto.
    await rodar(page, -150);
    await page.waitForTimeout(800);
    const depois = await medir(page);
    expect(depois.doFim).toBeGreaterThan(150);
    const botao = page.getByRole("button", { name: "Ir para o fim: a resposta está chegando" });
    await expect(botao).toBeVisible();
    await expect(botao.locator(".dc-chat__ir-fim-ponto")).toBeVisible();
    // No campo, ao lado do Parar: não fica por cima de nada da conversa.
    await expect(page.locator(".dc-compositor__barra").getByRole("button", { name: "Ir para o fim: a resposta está chegando" })).toBeVisible();
    const caixa = await botao.boundingBox();
    const rolagem = await page.locator(".dc-chat__rolagem").boundingBox();
    expect(caixa!.y).toBeGreaterThanOrEqual(rolagem!.y + rolagem!.height);
    await botao.click();
    await expect.poll(async () => (await medir(page)).doFim).toBeLessThanOrEqual(2);
    await page.waitForTimeout(400);
    expect((await medir(page)).doFim).toBeLessThanOrEqual(2);
    await expect(page.locator(".dc-chat__ir-fim")).toHaveCount(0);
    await abrirPortao(page, "fim");
  });

  test("PageUp fora do campo também para de acompanhar", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await roteiro(page, [inicio(), ...aosPoucos(`${TEXTO_LONGO}\n\n${TEXTO_LONGO}`, 8, 25), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page);
    await page.waitForFunction(() => (document.querySelector(".is-escrevendo")?.textContent?.length ?? 0) > 200);
    await page.locator(".dc-chat__rolagem").click({ position: { x: 10, y: 10 } });
    await page.keyboard.press("PageUp");
    await page.waitForTimeout(800);
    expect((await medir(page)).doFim).toBeGreaterThan(150);
    await abrirPortao(page, "fim");
  });

  test("a tecla logo depois de a tela descer: a rolagem que a própria tela fez não volta a puxar", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await roteiro(page, [inicio(), ...aosPoucos(`${TEXTO_LONGO}\n\n${TEXTO_LONGO}`, 8, 25), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page);
    await page.waitForFunction(() => (document.querySelector(".is-escrevendo")?.textContent?.length ?? 0) > 200);
    // A tela acabou de descer com o texto novo e o evento de rolar ainda não chegou: aí a pessoa aperta PageUp, e a tela sobe no quadro seguinte.
    await page.evaluate(
      () =>
        new Promise<void>((ok) => {
          const el = document.querySelector(".dc-chat__rolagem") as HTMLElement;
          let antes = el.scrollTop;
          const ro = new ResizeObserver(() => {
            if (el.scrollTop <= antes) return void (antes = el.scrollTop);
            ro.disconnect();
            document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", bubbles: true }));
            requestAnimationFrame(() => requestAnimationFrame(() => ((el.scrollTop -= 500), ok())));
          });
          ro.observe(el.firstElementChild!);
        }),
    );
    await page.waitForTimeout(800);
    expect((await medir(page)).doFim).toBeGreaterThan(450);
    await abrirPortao(page, "fim");
  });

  test("o cartão que chega fica à vista, e descer um pouco não desliga o acompanhamento", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await roteiro(page, [inicio(), ...aosPoucos("Vou olhar os prazos e as audiências.\n\n", 8, 20), ...consulta("f-prazos", prazosDaSemana), ...consulta("f-audiencias", audienciasDaSemana), { portao: "cartoes" }, ...aosPoucos(TEXTO_LONGO, 10, 20), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page);
    await noPortao(page, "cartoes");
    await expect(page.locator(".dc-chat__resposta").last().locator(".dc-cartao-ia").last()).toBeInViewport({ ratio: 1 });
    await rodar(page, 60);
    await abrirPortao(page, "cartoes");
    await page.waitForTimeout(1200);
    const m = await medir(page);
    expect(m.escAbaixo).toBeLessThanOrEqual(26);
    expect(m.escVisivel).toBeGreaterThanOrEqual(24);
    await abrirPortao(page, "fim");
  });

  test("depois de subir para reler, a pergunta nova e a resposta aparecem", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await rodar(page, -5000);
    await expect.poll(async () => (await medir(page)).scrollTop).toBe(0);
    await roteiro(page, [inicio(), ...aosPoucos(TEXTO_LONGO.slice(0, 400), 8, 20), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page, "E a réplica, quem faz?");
    await expect(page.locator(".dc-chat__pergunta").filter({ hasText: "E a réplica, quem faz?" })).toBeInViewport();
    await noPortao(page, "fim");
    const m = await medir(page);
    expect(m.escAbaixo).toBeLessThanOrEqual(26);
    expect(m.escVisivel).toBeGreaterThanOrEqual(24);
    await abrirPortao(page, "fim");
  });

  test("abrir uma conversa cuja última resposta é comprida: a última pergunta fica no alto e o botão leva ao fim", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const semana = amostras.conversaSemana!.corpo.mensagens;
    const id = uuid(300);
    await abrir(page, `/perguntar/${id}`, comIa().responder(`/ia/conversas/${id}`, conversa(id, "Semana ao contrário", [semana[2], semana[3], semana[0], semana[1]])));
    const ultimaPergunta = page.locator(".dc-chat__pergunta").last();
    await expect(ultimaPergunta).toBeInViewport();
    const caixa = (await page.locator(".dc-chat__rolagem").boundingBox())!;
    expect((await ultimaPergunta.boundingBox())!.y).toBeLessThan(caixa.y + 60);
    expect((await medir(page)).doFim).toBeGreaterThan(200);
    await page.getByRole("button", { name: "Ir para o fim da conversa" }).click();
    await expect.poll(async () => (await medir(page)).doFim).toBeLessThanOrEqual(2);
    await expect(page.locator(".dc-chat__ir-fim")).toHaveCount(0);
  });

  test("voltar pelo histórico a uma conversa já aberta abre na mesma posição da primeira vez, não na da outra", async ({ page }) => {
    const id = uuid(400);
    const base = [...amostras.conversaSemana!.corpo.mensagens, ...amostras.conversaProcesso!.corpo.mensagens];
    const longa = Array.from({ length: 10 }, (_, i) => base.slice((i * 2) % base.length, ((i * 2) % base.length) + 2)).flatMap((par, i) =>
      par.map((m: any) => ({ ...m, id: `${m.id.slice(0, 24)}${String(i).padStart(4, "0")}${m.id.slice(28)}`, partes: m.partes?.map((p: any) => (p.tipo === "ferramenta" ? { ...p, id: `${p.id}-${i}` } : p)) ?? null })),
    );
    const lista = amostras.conversas!.corpo.conversas;
    const api = comIa()
      .responder(`/ia/conversas/${id}`, conversa(id, "Conversa longa", longa))
      .responder("/ia/conversas", { conversas: [...lista, { ...conversa(id, "Conversa longa", []).conversa, atualizadaEm: "2026-10-29T12:40:00.000Z" }] });
    await abrir(page, `/perguntar/${SEMANA}`, api);
    const historico = page.getByRole("navigation", { name: "Conversas" });
    await expect(page.getByRole("heading", { level: 1, name: "Prazos desta semana" })).toBeVisible();
    await historico.getByRole("link", { name: "Conversa longa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Conversa longa" })).toBeVisible();
    await expect(page.locator(".dc-chat__pergunta").last()).toBeInViewport();
    await page.waitForTimeout(300);
    const primeira = await medir(page);
    await historico.getByRole("link", { name: "Prazos desta semana" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Prazos desta semana" })).toBeVisible();
    await historico.getByRole("link", { name: "Conversa longa" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Conversa longa" })).toBeVisible();
    await page.waitForTimeout(300);
    const segunda = await medir(page);
    expect(Math.abs(segunda.scrollTop - primeira.scrollTop)).toBeLessThanOrEqual(4);
    await expect(page.locator(".dc-chat__pergunta").last()).toBeInViewport();
  });

  test("o campo crescendo não esconde o fim da conversa", async ({ page }) => {
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await expect.poll(async () => (await medir(page)).doFim).toBeLessThanOrEqual(1);
    const antes = await medir(page);
    await page.getByRole("textbox", { name: "Pergunta" }).fill(Array.from({ length: 9 }, (_, i) => `linha ${i + 1}`).join("\n"));
    await expect.poll(async () => (await medir(page)).alto).toBeLessThan(antes.alto - 100);
    expect((await medir(page)).doFim).toBeLessThanOrEqual(1);
  });

  test("escrevendo letra a letra, com Shift+Enter, o fim da conversa continua à vista", async ({ page }) => {
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeVisible();
    await expect.poll(async () => (await medir(page)).doFim).toBeLessThanOrEqual(1);
    const antes = await medir(page);
    const campo = page.getByRole("textbox", { name: "Pergunta" });
    await campo.click();
    // Cada letra mede o campo de novo: a conversa não pode sair do fim enquanto ele mede.
    for (let i = 1; i <= 9; i++) {
      await campo.pressSequentially(`linha ${i} da pergunta`);
      if (i < 9) await campo.press("Shift+Enter");
    }
    await expect.poll(async () => (await medir(page)).alto).toBeLessThan(antes.alto - 100);
    await page.waitForTimeout(200);
    expect((await medir(page)).doFim).toBeLessThanOrEqual(1);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  test("arrastar o dedo para ler o começo enquanto a resposta chega: a tela para de puxar", async ({ page }) => {
    await ligarAosPoucos(page);
    await abrir(page, `/perguntar/${SEMANA}`, comIa());
    await expect(page.getByRole("button", { name: "Marcar cumprido: Contestação trabalhista" })).toBeAttached();
    await roteiro(page, [inicio(), ...aosPoucos(`${TEXTO_LONGO}\n\n${TEXTO_LONGO}`, 8, 25), { portao: "fim" }, { e: { t: "fim", mensagem: { id: uuid(202) } } }]);
    await perguntarAgora(page);
    await page.waitForFunction(() => (document.querySelector(".is-escrevendo")?.textContent?.length ?? 0) > 200);
    const caixa = (await page.locator(".dc-chat__rolagem").boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const x = caixa.x + caixa.width / 2;
    let y = caixa.y + 150;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 0; i < 8; i++) {
      y += 25;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await page.waitForTimeout(30);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(800);
    expect((await medir(page)).doFim).toBeGreaterThan(150);
    await expect(page.getByRole("button", { name: "Ir para o fim: a resposta está chegando" })).toBeVisible();
    await abrirPortao(page, "fim");
  });
});
