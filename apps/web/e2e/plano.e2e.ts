/**
 * O Plano (Configurações > Plano) e os avisos de teste, atraso e só leitura: a faixa no alto de toda tela, com a data,
 * antes de acontecer e enquanto durar; assinar abre a página do Asaas; cancelar leva dois cliques; o acesso bloqueado
 * deixa só pagar, levar os dados e encerrar. A API é a de mentira de e2e/apoio.ts.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, sobraNaLateral } from "./apoio";

const ESCALA = [11, 12, 13, 14, 15, 20];

type Aviso = { nivel: "info" | "atencao" | "grave"; texto: string; ate: string | null };

/** O /eu da API com a cobrança ligada. */
function comAssinatura(situacao: string, acesso: "total" | "leitura" | "bloqueado", aviso: Aviso | null, extra: object = {}) {
  return new ApiFalsa().responder("/eu", { ...amostras.eu!.corpo, ...extra, assinatura: { situacao, acesso, aviso } });
}

const plano = (sobre: object = {}) => ({ ...amostras.plano!.corpo, cobrancaAtiva: true, plano: { nome: "Escritório", testeDias: 14, valorMensalCentavos: 9900 }, ...sobre });

const AVISO_DO_TESTE: Aviso = { nivel: "info", texto: "Teste grátis: faltam 9 dias, até 07/11/2026. Sem cartão e sem compromisso.", ate: "2026-11-07" };
const AVISO_PERTO: Aviso = {
  nivel: "atencao",
  texto: "O teste termina em 3 dias (01/11/2026). Depois dessa data o escritório fica só para leitura: nada novo pode ser salvo e as publicações do DJEN deixam de chegar. Assine para continuar.",
  ate: "2026-11-01",
};
const AVISO_SO_LEITURA: Aviso = {
  nivel: "grave",
  texto: "O teste acabou em 28/10/2026. O escritório está só para leitura: nada novo pode ser salvo e as publicações do DJEN não estão chegando. Nada foi apagado. Assine para voltar ao normal.",
  ate: "2026-10-28",
};

function tamanhosNaTela(page: Page) {
  return page.evaluate(() => {
    const achados = new Map<number, string>();
    const andar = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n: Node | null;
    while ((n = andar.nextNode())) {
      const texto = n.textContent?.trim();
      const el = n.parentElement;
      if (!texto || !el || el.closest("svg, script, style")) continue;
      const s = getComputedStyle(el);
      if (s.visibility === "hidden" || s.display === "none" || el.getClientRects().length === 0) continue;
      const tamanho = Number.parseFloat(s.fontSize);
      if (!achados.has(tamanho)) achados.set(tamanho, `${el.className || el.tagName}: "${texto.slice(0, 40)}"`);
    }
    return [...achados.entries()];
  });
}

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("cobrança desligada: a aba Plano diz que a cobrança não abriu, e a tela não ganha aviso nenhum", async ({ page }) => {
    await abrir(page, "/configuracoes");
    await page.getByRole("tab", { name: "Plano" }).click();
    await expect(page.getByText("A cobrança ainda não foi aberta: por enquanto nada é cobrado e nada é bloqueado.")).toBeVisible();
    await expect(page.getByText("Cobrança ainda não aberta")).toBeVisible();
    await expect(page.getByRole("button", { name: "Assinar o plano" })).toHaveCount(0);
    await expect(page.locator(".dc-faixa-plano")).toHaveCount(0);
    await expect(page.getByText("Nenhuma fatura ainda")).toBeVisible();
  });

  test("durante o teste o aviso é discreto e só no Hoje; a faixa de toda tela não aparece", async ({ page }) => {
    await abrir(page, "/hoje", comAssinatura("teste", "total", AVISO_DO_TESTE));
    const nota = page.getByText(/Teste grátis: faltam 9 dias, até/);
    await expect(nota).toBeVisible();
    await expect(nota.locator("strong")).toHaveText("07/11/2026");
    await expect(page.locator(".dc-faixa-plano")).toHaveCount(0);
    await page.getByRole("link", { name: "Ver o plano" }).click();
    await expect(page.getByRole("tab", { name: "Plano", selected: true })).toBeVisible();
  });

  test("3 dias antes do fim a faixa aparece em toda tela, com a data em destaque e o aviso de que as publicações param", async ({ page }) => {
    await abrir(page, "/prazos", comAssinatura("teste", "total", AVISO_PERTO));
    const faixa = page.locator(".dc-faixa-plano");
    await expect(faixa).toBeVisible();
    await expect(faixa).toHaveAttribute("data-nivel", "atencao");
    await expect(faixa.locator("strong")).toHaveText("01/11/2026");
    await expect(faixa).toContainText("as publicações do DJEN deixam de chegar");
    for (const rota of ["/hoje", "/processos", "/configuracoes"]) {
      await page.goto(rota);
      await expect(page.locator(".dc-faixa-plano")).toBeVisible();
    }
    await page.locator(".dc-faixa-plano").getByRole("link", { name: "Ver o plano" }).click();
    await expect(page).toHaveURL(/\/configuracoes\?aba=plano/);
    await expect(page.getByRole("tab", { name: "Plano", selected: true })).toBeVisible();
  });

  test("só leitura: a faixa é grave, e as telas que ocupam a folha inteira continuam sem rolar", async ({ page }) => {
    await abrir(page, "/publicacoes", comAssinatura("so_leitura", "leitura", AVISO_SO_LEITURA));
    const faixa = page.locator(".dc-faixa-plano");
    await expect(faixa).toHaveAttribute("data-nivel", "grave");
    await expect(faixa).toContainText("não estão chegando");
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByLabel("Carregando")).toHaveCount(0);
    // A folha não ganha barra de rolagem por causa da faixa.
    expect(await page.locator(".dc-conteudo").evaluate((e) => e.scrollHeight - e.clientHeight)).toBe(0);
    expect(await sobraNaLateral(page)).toBe(0);
    expect((await tamanhosNaTela(page)).filter(([t]) => !ESCALA.includes(t))).toEqual([]);
  });

  test("assinar leva para a página de pagamento do Asaas", async ({ page }) => {
    const api = comAssinatura("so_leitura", "leitura", AVISO_SO_LEITURA).responder("/plano", plano({ situacao: "so_leitura", rotulo: "Só leitura", acesso: "leitura", motivo: "fim_do_teste", testeAte: "2026-10-28", podeAssinar: true, motivoSemAssinar: null, aviso: AVISO_SO_LEITURA }));
    api.responder("POST /plano/assinar", { url: "https://sandbox.asaas.com/c/link_1" });
    await page.route("https://sandbox.asaas.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<html><body>Página de pagamento do Asaas</body></html>" }));
    await abrir(page, "/configuracoes?aba=plano", api);
    await expect(page.getByText("O teste acabou em 28/10/2026. O escritório está só para leitura.")).toBeVisible();
    await expect(page.getByText("R$ 99,00 por mês", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Assinar o plano" }).click();
    await expect(page).toHaveURL("https://sandbox.asaas.com/c/link_1");
    expect(api.mudancas("/plano/assinar")).toHaveLength(1);
  });

  test("sem o valor decidido a tela diz para falar com a equipe, em vez de abrir uma cobrança", async ({ page }) => {
    const api = comAssinatura("teste", "total", AVISO_DO_TESTE).responder(
      "/plano",
      plano({ situacao: "teste", rotulo: "Em teste", testeAte: "2026-11-07", diasRestantesDoTeste: 9, plano: { nome: "Escritório", testeDias: 14, valorMensalCentavos: null }, podeAssinar: false, motivoSemAssinar: "O valor do plano ainda não foi definido. Fale com a equipe do Decreta para assinar.", aviso: AVISO_DO_TESTE }),
    );
    await abrir(page, "/configuracoes?aba=plano", api);
    await expect(page.getByText("Teste grátis, sem cartão: 9 dias restantes (até 07/11/2026).")).toBeVisible();
    await expect(page.getByText("O valor do plano ainda não foi definido. Fale com a equipe do Decreta para assinar.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Falar com a equipe" })).toHaveAttribute("href", /wa\.me\//);
    await expect(page.getByRole("button", { name: "Assinar o plano" })).toHaveCount(0);
  });

  test("em atraso: as faturas com o link do Asaas e a troca da forma de pagamento pelo que o Asaas oferece", async ({ page }) => {
    const api = comAssinatura("inadimplente", "total", { nivel: "atencao", texto: "Há uma fatura em atraso. Em 05/11/2026 o escritório passa a ser só para leitura e as publicações do DJEN deixam de chegar. Regularize o pagamento para evitar.", ate: "2026-11-05" }).responder(
      "/plano",
      plano({
        situacao: "inadimplente",
        rotulo: "Pagamento em atraso",
        diasDeAtraso: 2,
        assinante: true,
        valorMensalCentavos: 9900,
        podeAssinar: false,
        podeCancelar: true,
        trocarFormaEm: "https://sandbox.asaas.com/i/atrasada",
        aviso: { nivel: "atencao", texto: "Há uma fatura em atraso. Em 05/11/2026 o escritório passa a ser só para leitura e as publicações do DJEN deixam de chegar. Regularize o pagamento para evitar.", ate: "2026-11-05" },
        faturas: [
          { id: "pay_2", vencimento: "2026-10-27", valorCentavos: 9900, situacao: "atrasada", forma: "indefinida", link: "https://sandbox.asaas.com/i/atrasada", pagaEm: null },
          { id: "pay_1", vencimento: "2026-09-27", valorCentavos: 9900, situacao: "paga", forma: "pix", link: "https://sandbox.asaas.com/i/paga", pagaEm: "2026-09-27" },
        ],
      }),
    );
    await abrir(page, "/configuracoes?aba=plano", api);
    await expect(page.locator(".dc-faixa-plano")).toHaveAttribute("data-nivel", "atencao");
    const atrasada = page.locator(".dc-linhas__item", { hasText: "Vence em 27/10/2026" });
    await expect(atrasada).toContainText("R$ 99,00");
    await expect(atrasada).toContainText("Em atraso");
    await expect(atrasada.getByRole("link", { name: /Abrir a fatura de 27\/10\/2026/ })).toHaveAttribute("href", "https://sandbox.asaas.com/i/atrasada");
    const paga = page.locator(".dc-linhas__item", { hasText: "Vence em 27/09/2026" });
    await expect(paga).toContainText("Paga");
    await expect(paga).toContainText("Pix · paga em 27/09/2026");
    const trocar = page.getByRole("link", { name: /Trocar a forma de pagamento/ });
    await expect(trocar).toHaveAttribute("href", "https://sandbox.asaas.com/i/atrasada");
    await expect(trocar).toHaveAttribute("target", "_blank");
    await expect(page.getByText(/o Decreta nunca vê nem guarda dado de cartão/)).toBeVisible();
  });

  test("cancelar leva dois cliques e diz até quando vale", async ({ page }) => {
    const api = comAssinatura("ativo", "total", null).responder("/plano", plano({ situacao: "ativo", rotulo: "Ativo", assinante: true, valorMensalCentavos: 9900, podeAssinar: false, podeCancelar: true }));
    api.responder("POST /plano/cancelar", { acessoAte: "2026-12-14" });
    await abrir(page, "/configuracoes?aba=plano", api);
    await expect(page.getByText("Assinatura em dia: R$ 99,00 por mês.")).toBeVisible();
    await page.getByRole("button", { name: "Cancelar a assinatura…" }).click();
    const dialogo = page.getByRole("dialog", { name: "Cancelar a assinatura?" });
    await expect(dialogo).toContainText("até o fim do período que já foi pago");
    expect(api.mudancas("/plano/cancelar")).toHaveLength(0);
    await dialogo.getByRole("button", { name: "Cancelar a assinatura" }).click();
    await expect(page.getByText("Assinatura cancelada. O acesso completo vai até 14/12/2026.")).toBeVisible();
    expect(api.mudancas("/plano/cancelar")).toHaveLength(1);
  });

  test("quem não é sócio não vê a aba Plano, e o link de endereço cai no Timbre", async ({ page }) => {
    const membro = { ...amostras.eu!.corpo, usuario: { ...amostras.eu!.corpo.usuario, papel: "member" } };
    await abrir(page, "/configuracoes?aba=plano", new ApiFalsa().responder("/eu", membro));
    await expect(page.getByRole("tab", { name: "Plano" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Timbre", selected: true })).toBeVisible();
  });

  test("acesso bloqueado: só pagar, levar os dados, encerrar e sair; o menu e as telas do escritório não abrem", async ({ page }) => {
    const aviso: Aviso = { nivel: "grave", texto: "O acesso está bloqueado por falta de pagamento. As publicações do DJEN não estão chegando. Pague para voltar a usar; os dados continuam guardados e você pode levá-los a qualquer momento.", ate: null };
    const api = comAssinatura("bloqueado", "bloqueado", aviso).responder(
      "/plano",
      plano({
        situacao: "bloqueado",
        rotulo: "Bloqueado",
        acesso: "bloqueado",
        motivo: "atraso",
        assinante: true,
        podeAssinar: false,
        faturas: [{ id: "pay_9", vencimento: "2026-10-10", valorCentavos: 9900, situacao: "atrasada", forma: "boleto", link: "https://sandbox.asaas.com/i/9", pagaEm: null }],
        trocarFormaEm: "https://sandbox.asaas.com/i/9",
        aviso,
      }),
    );
    api.responder("/escritorio/exportacoes", { itens: [] });
    await abrir(page, "/prazos", api);
    await expect(page.getByRole("heading", { level: 1, name: /O acesso de .* está bloqueado/ })).toBeVisible();
    await expect(page.getByText(/bloqueado por falta de pagamento/).first()).toBeVisible();
    await expect(page.locator(".dc-menu")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Abrir a fatura de 10/10/2026 no Asaas" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Preparar a cópia dos dados" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Encerrar o escritório…" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair do Decreta" })).toBeVisible();
    // Nada do escritório foi pedido: nem os prazos, nem o painel do dia.
    expect(api.pedidos.some((p) => p.caminho.startsWith("/prazos") || p.caminho === "/hoje")).toBe(false);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("o link da plataforma só aparece no menu do operador", async ({ page }) => {
    const comum = await abrir(page, "/hoje");
    await page.getByRole("button", { name: /Menu da conta de/ }).click();
    await expect(page.getByRole("menuitem", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Plataforma" })).toHaveCount(0);
    void comum;
  });

  test("o operador vê o link da plataforma no menu da conta", async ({ page }) => {
    await abrir(page, "/hoje", new ApiFalsa().responder("/eu", { ...amostras.eu!.corpo, plataforma: true }));
    await page.getByRole("button", { name: /Menu da conta de/ }).click();
    await page.getByRole("menuitem", { name: "Plataforma" }).click();
    await expect(page).toHaveURL(/\/plataforma$/);
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a faixa do plano aparece no alto da tela, com a data, e o Plano cabe sem rolar para o lado", async ({ page }) => {
    await abrir(page, "/hoje", comAssinatura("teste", "total", AVISO_PERTO));
    const faixa = page.locator(".dc-faixa-plano");
    await expect(faixa).toBeVisible();
    await expect(faixa.locator("strong")).toHaveText("01/11/2026");
    expect(await sobraNaLateral(page)).toBe(0);

    const api = comAssinatura("teste", "total", AVISO_PERTO).responder("/plano", plano({ situacao: "teste", rotulo: "Em teste", testeAte: "2026-11-01", diasRestantesDoTeste: 3, aviso: AVISO_PERTO, podeAssinar: true, motivoSemAssinar: null }));
    await abrir(page, "/configuracoes?aba=plano", api);
    await expect(page.getByRole("button", { name: "Assinar o plano" })).toBeVisible();
    await expect(page.getByText("Teste grátis, sem cartão: 3 dias restantes (até 01/11/2026).")).toBeVisible();
    expect(await sobraNaLateral(page)).toBe(0);
  });
});
