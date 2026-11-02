/**
 * Estado vazio que ensina: cada tela vazia diz para que serve e oferece a primeira ação. "Nunca houve dado" e "o
 * filtro não achou" são dois casos, e quem não pode criar não vê o botão de criar.
 */
import { expect, test, type Page } from "@playwright/test";
import { abrir, amostras, ApiFalsa, ids, sobraNaLateral } from "./apoio";

const vazio = (page: Page) => page.locator(".dc-vazio");
const PAGINA_VAZIA = { itens: [], total: 0, pagina: 1, porPagina: 30 };
const eu = amostras.eu!.corpo;

/** Escritório recém-criado: nada em nenhum menu. */
const euNovo = { ...eu, menu: { prazos: 0, prazosHoje: 0, publicacoes: 0, processos: 0, clientes: 0, negocios: 0, alvaras: 0, financeiro: 0 } };
const euMembro = { ...euNovo, usuario: { ...eu.usuario, papel: "member", financeiro: false } };
/** Fim do teste ou fatura em atraso: dá para ver tudo, mas não salvar nada novo. */
const euSoLeitura = { ...euNovo, assinatura: { situacao: "so_leitura", acesso: "leitura", aviso: null } };

const LISTA_DE_PRAZOS_VAZIA = { hoje: amostras.prazos!.corpo.hoje, chips: { abertos: 0, hoje: 0, semana: 0, vencidos: 0, cumpridos: 0 }, responsaveis: [], itens: [] };
const PAINEL_VAZIO = {
  ...amostras.hoje!.corpo,
  itens: [],
  publicacoes: [],
  porResponsavel: [],
  auditoria: null,
  alertasDaCaptura: [],
  contadores: { ...amostras.hoje!.corpo.contadores, vencemHoje: 0, vencidos: 0, publicacoesNovas: 0, publicacoesComPrazo: 0, publicacoesSemLeitura: 0, audienciasHoje: 0, alvarasAguardando: 0 },
};

/** Os seis tamanhos da escala, no computador; no celular os campos têm 16 e nada abaixo de 12. */
async function naEscala(page: Page, escala: number[]) {
  const fora = await vazio(page).evaluateAll(
    (caixas, e) => {
      const achados: string[] = [];
      for (const c of caixas) for (const el of [c, ...c.querySelectorAll("*")]) if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim())) if (!e.includes(Number.parseFloat(getComputedStyle(el).fontSize))) achados.push(el.textContent!.slice(0, 40));
      return achados;
    },
    escala,
  );
  expect(fora).toEqual([]);
}

const CAIXA_VAZIA = { contagens: { nova: 0, pendente: 0, lida: 0, vinculada: 0 }, ultimaCaptura: null, itens: [] };
const CAPTURA_DE_HOJE = { em: "2026-10-29T07:31:00.000Z", hora: "04:31", novas: 0, erro: null };
/** Ninguém da equipe com OAB cadastrada: a busca do DJEN não tem o que procurar. */
const equipeSemOab = { ...amostras.equipe!.corpo, pessoas: amostras.equipe!.corpo.pessoas.map((p: object) => ({ ...p, oab: null, oabNumero: null, oabUf: null })) };
/** A demonstração, de onde vêm as amostras, deixa a busca desligada; um escritório de verdade começa com ela ligada. */
const ESCRITORIO_COM_BUSCA = { ...amostras.escritorio!.corpo, capturaDjen: true };
const apiDaCaixaVazia = () => new ApiFalsa().responder("GET /publicacoes", CAIXA_VAZIA).responder("/publicacoes/saude", { alertas: [], tribunais: [], semProcesso: 0 }).responder("/escritorio", ESCRITORIO_COM_BUSCA);

test.describe("no computador", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test.describe("Publicações", () => {
    test("sem OAB não parece caixa em dia: explica a causa e o sócio vai cadastrar", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("/equipe", equipeSemOab);
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("Falta a OAB para achar as publicações")).toBeVisible();
      await expect(vazio(page).getByText(/vazia mesmo quando há intimação/)).toBeVisible();
      await expect(page.getByText("Nenhuma publicação nova")).toHaveCount(0);
      await vazio(page).getByRole("link", { name: "Cadastrar a OAB" }).click();
      await expect(page).toHaveURL(/\/equipe$/);
      await expect(page.getByText(/Ninguém da equipe tem OAB cadastrada/)).toBeVisible();
    });

    test("sem OAB e com a configuração inicial pendente: leva ao /comecar, que já busca ao salvar", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("/equipe", equipeSemOab).responder("/eu", { ...eu, escritorio: { ...eu.escritorio, onboarding: true } });
      await abrir(page, "/publicacoes", api);
      await vazio(page).getByRole("link", { name: "Cadastrar a OAB" }).click();
      await expect(page).toHaveURL(/\/comecar$/);
    });

    test("sem OAB, para quem não é sócio: pede a um sócio, sem o botão", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("/equipe", equipeSemOab).responder("/eu", euMembro);
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText(/Peça a um sócio para cadastrar a OAB/)).toBeVisible();
      await expect(vazio(page).getByRole("link", { name: "Cadastrar a OAB" })).toHaveCount(0);
    });

    test("busca desligada: diz isso, e o sócio vai ligar", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("/escritorio", { ...amostras.escritorio!.corpo, capturaDjen: false });
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("A busca no DJEN está desligada")).toBeVisible();
      await vazio(page).getByRole("link", { name: "Ligar a busca" }).click();
      await expect(page).toHaveURL(/\/configuracoes\?aba=avisos$/);
      await expect(page.getByRole("tab", { name: "Avisos e captura", selected: true })).toBeVisible();
    });

    test("com OAB e sem nenhuma busca ainda: diz quando sai e oferece buscar agora", async ({ page }) => {
      const api = apiDaCaixaVazia();
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("A primeira busca ainda não rodou")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Buscar agora" }).click();
      await expect.poll(() => api.mudancas("/publicacoes/buscar").length).toBe(1);
    });

    test("a última busca falhou: não diz que não há nada", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("GET /publicacoes", { ...CAIXA_VAZIA, ultimaCaptura: { ...CAPTURA_DE_HOJE, erro: "o DJEN não respondeu" } });
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("A última busca falhou")).toBeVisible();
      await expect(vazio(page).getByText(/Pode haver intimação que ainda não chegou/)).toBeVisible();
      await expect(page.getByText("Nenhuma publicação nova")).toHaveCount(0);
    });

    test("caderno que faltou na captura: também não diz que não há nada", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("GET /publicacoes", { ...CAIXA_VAZIA, ultimaCaptura: CAPTURA_DE_HOJE }).responder("/publicacoes/saude", { alertas: ["O caderno do TJSC de hoje não foi lido."], tribunais: [], semProcesso: 0 });
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("A captura tem um aviso")).toBeVisible();
      await expect(page.getByText("Nenhuma publicação nova")).toHaveCount(0);
    });

    test("buscou e nunca achou nada: explica a caixa e oferece colar", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("GET /publicacoes", { ...CAIXA_VAZIA, ultimaCaptura: CAPTURA_DE_HOJE });
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("Nenhuma publicação até agora")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Colar publicação" }).click();
      await expect(page.getByRole("dialog", { name: /Colar publicação/ })).toBeVisible();
    });

    test("caixa em dia: nenhuma nova, com a hora da última leitura", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("GET /publicacoes", { ...CAIXA_VAZIA, contagens: { ...CAIXA_VAZIA.contagens, lida: 12 }, ultimaCaptura: CAPTURA_DE_HOJE });
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText("Nenhuma publicação nova")).toBeVisible();
      await expect(vazio(page).getByText(/Última busca às 04:31/)).toBeVisible();
    });

    for (const [aba, rota, titulo, texto] of [
      ["Pendentes", "pendente", "Nada pendente", /Deixar pendente/],
      ["Lidas", "lida", "Nenhuma publicação lida", /não gera prazo/],
      ["Vinculadas", "vinculada", "Nenhuma publicação vinculada", /vira prazo ou audiência/],
    ] as const) {
      test(`aba ${aba} sem nada: diz para que serve e volta às novas`, async ({ page }) => {
        const api = apiDaCaixaVazia().responder("GET /publicacoes", { ...CAIXA_VAZIA, contagens: { ...CAIXA_VAZIA.contagens, nova: 3 }, ultimaCaptura: CAPTURA_DE_HOJE });
        await abrir(page, `/publicacoes?situacao=${rota}`, api);
        await expect(vazio(page).getByText(titulo)).toBeVisible();
        await expect(vazio(page).getByText(texto)).toBeVisible();
        await vazio(page).getByRole("button", { name: "Ver as 3 novas" }).click();
        await expect(page).toHaveURL(/\/publicacoes$/);
      });
    }

    test("só para leitura: nem colar nem buscar", async ({ page }) => {
      const api = apiDaCaixaVazia().responder("/eu", euSoLeitura);
      await abrir(page, "/publicacoes", api);
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Colar publicação|Buscar agora/ })).toHaveCount(0);
    });

    test("no Hoje, o painel também diz que falta a OAB, em vez de prometer a próxima busca", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO).responder("/equipe", equipeSemOab).responder("/escritorio", ESCRITORIO_COM_BUSCA);
      await abrir(page, "/hoje", api);
      await expect(page.getByText(/Falta a OAB para achar as publicações/)).toBeVisible();
      await expect(page.getByText(/A próxima busca no DJEN sai no horário de sempre/)).toHaveCount(0);
      await page.getByRole("link", { name: "Cadastrar a OAB" }).click();
      await expect(page).toHaveURL(/\/equipe$/);
    });

    test("no Hoje, com a OAB em dia, continua a frase da próxima busca", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO).responder("/escritorio", ESCRITORIO_COM_BUSCA);
      await abrir(page, "/hoje", api);
      await expect(page.getByText(/A próxima busca no DJEN sai no horário de sempre/)).toBeVisible();
    });
  });

  test.describe("Novos negócios", () => {
    const VAZIO = { contagens: {}, itens: [] };

    test("nunca houve: cada coluna diz o que entra nela, e a triagem oferece o primeiro", async ({ page }) => {
      await abrir(page, "/negocios", new ApiFalsa().responder("GET /negocios", VAZIO));
      await expect(page.getByText("Quem procura o escritório entra aqui até a pasta ficar pronta.")).toBeVisible();
      await expect(page.getByText("Quem já foi passado a um advogado do escritório.")).toBeVisible();
      await expect(page.getByText("Quem virou cliente. A pasta da triagem passa para o cliente.")).toBeVisible();
      await expect(page.getByText("Quem não seguiu com o escritório.")).toBeVisible();
      await expect(page.getByText("Nada aqui")).toHaveCount(0);
      await page.locator(".dc-quadro__vazio").getByRole("button", { name: "Novo negócio" }).click();
      await expect(page.getByRole("dialog", { name: "Novo negócio" })).toBeVisible();
    });

    test("só para leitura: nem o botão da coluna nem o do cabeçalho", async ({ page }) => {
      await abrir(page, "/negocios", new ApiFalsa().responder("GET /negocios", VAZIO).responder("/eu", euSoLeitura));
      await expect(page.getByText("Quem procura o escritório entra aqui até a pasta ficar pronta.")).toBeVisible();
      await expect(page.getByRole("button", { name: "Novo negócio" })).toHaveCount(0);
    });
  });

  test.describe("Alvarás", () => {
    const VAZIO = { totais: { pendente: "0", recebido: "0" }, etapas: ["novo", "aguardando_saque", "sacado", "repassado", "finalizado"].map((etapa) => ({ etapa, total: "0", itens: [] })) };

    test("nunca houve: cada etapa diz o que é, e a primeira oferece o alvará", async ({ page }) => {
      await abrir(page, "/alvaras", new ApiFalsa().responder("GET /alvaras", VAZIO));
      await expect(page.getByText("O alvará expedido pelo juízo entra aqui, com o valor.")).toBeVisible();
      await expect(page.getByText("O dinheiro na conta do escritório, ainda por repassar.")).toBeVisible();
      await expect(page.getByText("Nada aqui")).toHaveCount(0);
      await page.locator(".dc-quadro__vazio").getByRole("button", { name: "Novo alvará" }).click();
      await expect(page.getByRole("dialog", { name: "Novo alvará" })).toBeVisible();
    });

    test("sem processo: leva a cadastrar, porque alvará mora em processo", async ({ page }) => {
      await abrir(page, "/alvaras", new ApiFalsa().responder("GET /alvaras", VAZIO).responder("/eu", euNovo));
      await page.locator(".dc-quadro__vazio").getByRole("link", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("a busca não achou em etapa nenhuma: diz com o que buscou, some o quadro e limpa", async ({ page }) => {
      await abrir(page, "/alvaras");
      await page.getByRole("searchbox", { name: "Buscar alvará" }).fill("ninguém com esse nome");
      await expect(vazio(page).getByText("Nenhum alvará com “ninguém com esse nome”")).toBeVisible();
      await expect(page.locator(".dc-quadro")).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page.locator(".dc-quadro")).toBeVisible();
      await expect(page.getByRole("searchbox", { name: "Buscar alvará" })).toHaveValue("");
    });
  });

  test.describe("Financeiro", () => {
    const VAZIO = { ...amostras.financeiro!.corpo, parcelas: [], alvarasParaPrestar: [], lembretesParaAprovar: 0, semHonorario: { total: 0, itens: [] }, resumo: { ...amostras.financeiro!.corpo.resumo, aReceber: 0, emAtraso: 0, parcelasEmAtraso: 0, porCliente: [], porProcesso: [], porMes: [] } };

    test("nunca houve: explica os honorários e oferece o contrato", async ({ page }) => {
      await abrir(page, "/financeiro", new ApiFalsa().responder("GET /financeiro", VAZIO));
      await expect(vazio(page).getByText("Nenhum honorário registrado")).toBeVisible();
      await expect(vazio(page).getByText(/valor fixo, mensal, êxito ou híbrido/)).toBeVisible();
      await vazio(page).getByRole("button", { name: "Registrar o primeiro contrato" }).click();
      await expect(page.getByRole("dialog", { name: /Novo contrato/ })).toBeVisible();
    });

    test("a busca não achou: limpa, sem falar em criar", async ({ page }) => {
      await abrir(page, "/financeiro");
      await page.getByRole("searchbox", { name: "Buscar parcela" }).fill("nada com isso");
      await expect(vazio(page).getByText("Nenhuma parcela com esse filtro")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /contrato/ })).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Limpar os filtros" }).click();
      await expect(page.getByRole("searchbox", { name: "Buscar parcela" })).toHaveValue("");
      await expect(vazio(page)).toHaveCount(0);
    });

    test("em atraso, sem nenhuma: não diz que nunca houve e volta para as em aberto", async ({ page }) => {
      const semAtraso = amostras.financeiro!.corpo.parcelas.filter((p: { situacao: string }) => p.situacao !== "em_atraso");
      await abrir(page, "/financeiro?situacao=atraso", new ApiFalsa().responder("GET /financeiro", { ...amostras.financeiro!.corpo, parcelas: semAtraso }));
      await expect(vazio(page).getByText("Nada em atraso")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver as em aberto" }).click();
      await expect(page).toHaveURL(/\/financeiro$/);
    });

    test("quem não é sócio nem foi liberado: explica de quem é, sem botão", async ({ page }) => {
      await abrir(page, "/financeiro", new ApiFalsa().responder("/eu", euMembro));
      await expect(vazio(page).getByText("O Financeiro é dos sócios")).toBeVisible();
      await expect(page.getByRole("button", { name: /contrato/i })).toHaveCount(0);
    });

    test("visão por cliente sem nada: fala de cliente, e oferece o contrato", async ({ page }) => {
      await abrir(page, "/financeiro", new ApiFalsa().responder("GET /financeiro", VAZIO));
      await page.getByRole("radio", { name: "Clientes" }).click();
      await expect(vazio(page).getByText("Nenhum cliente com honorário")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: "Registrar o primeiro contrato" })).toBeVisible();
    });
  });

  test.describe("Documentos", () => {
    test("nunca houve: explica e oferece enviar", async ({ page }) => {
      await abrir(page, "/documentos", new ApiFalsa().responder("GET /documentos", { itens: [] }));
      await expect(vazio(page).getByText("Nenhum documento ainda")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: "Enviar" })).toBeVisible();
    });

    test("a busca não achou: limpa", async ({ page }) => {
      await abrir(page, "/documentos", new ApiFalsa().responder("GET /documentos", { itens: [] }));
      await page.getByRole("searchbox", { name: "Buscar documento" }).fill("procuração");
      await expect(vazio(page).getByText("Nenhum documento com “procuração”")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page.getByRole("searchbox", { name: "Buscar documento" })).toHaveValue("");
    });

    test("só para leitura: sem enviar", async ({ page }) => {
      await abrir(page, "/documentos", new ApiFalsa().responder("GET /documentos", { itens: [] }).responder("/eu", euSoLeitura));
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Enviar" })).toHaveCount(0);
    });
  });

  test.describe("Modelos", () => {
    test("nunca houve: oferece o primeiro modelo; só para leitura, não", async ({ page }) => {
      await abrir(page, "/modelos", new ApiFalsa().responder("GET /modelos", { total: 0, itens: [] }));
      await expect(vazio(page).getByText("Nenhum modelo ainda")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: "Novo modelo" })).toBeVisible();
    });

    test("só para leitura: nada de novo modelo", async ({ page }) => {
      await abrir(page, "/modelos", new ApiFalsa().responder("GET /modelos", { total: 0, itens: [] }).responder("/eu", euSoLeitura));
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Novo modelo" })).toHaveCount(0);
    });

    test("o filtro não achou: limpa a busca e o tipo", async ({ page }) => {
      await abrir(page, "/modelos", new ApiFalsa().responder("GET /modelos", { total: 3, itens: [] }));
      await page.getByRole("searchbox", { name: "Buscar modelo" }).fill("tese rara");
      await expect(vazio(page).getByText("Nenhum modelo com esse filtro")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar os filtros" }).click();
      await expect(page.getByRole("searchbox", { name: "Buscar modelo" })).toHaveValue("");
    });
  });

  test.describe("Agenda", () => {
    const SEM_NADA = { hoje: "2026-10-29", de: "2026-10-29", ate: "2026-11-11", dias: [] };

    test("lista sem nada: explica e oferece a tarefa", async ({ page }) => {
      await abrir(page, "/agenda?vista=lista", new ApiFalsa().responder("GET /agenda", SEM_NADA));
      await expect(vazio(page).getByText("Nada nestas duas semanas")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Nova tarefa" }).click();
      await expect(page.getByRole("dialog", { name: "Nova tarefa" })).toBeVisible();
    });

    test("só para leitura: a mesma lista, sem os botões", async ({ page }) => {
      await abrir(page, "/agenda?vista=lista", new ApiFalsa().responder("GET /agenda", SEM_NADA).responder("/eu", euSoLeitura));
      await expect(vazio(page).getByText("Nada nestas duas semanas")).toBeVisible();
      await expect(page.getByRole("button", { name: /Nova tarefa|^Tarefa$|^Audiência$/ })).toHaveCount(0);
    });

    test("dia sem nada, na vista do mês: oferece marcar naquele dia", async ({ page }) => {
      await abrir(page, "/agenda?vista=mes", new ApiFalsa().responder("GET /agenda", SEM_NADA));
      await expect(vazio(page).getByText("Nada neste dia")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: "Nova tarefa" })).toBeVisible();
    });
  });

  test.describe("Equipe", () => {
    test("só você no escritório: o sócio é convidado a chamar a equipe", async ({ page }) => {
      const soEu = { ...amostras.equipe!.corpo, pessoas: amostras.equipe!.corpo.pessoas.slice(0, 1), convites: [] };
      await abrir(page, "/equipe", new ApiFalsa().responder("GET /equipe", soEu));
      await expect(vazio(page).getByText("Por enquanto, só você")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Convidar a equipe" }).click();
      await expect(page.getByRole("dialog", { name: /Convidar/ })).toBeVisible();
    });
  });

  test.describe("Dentro do processo", () => {
    test("Honorários: explica o contrato daquele processo, com a ação", async ({ page }) => {
      const api = new ApiFalsa().responder(`GET /financeiro/processos/${ids.processo}`, { ...amostras.financeiroDoProcesso!.corpo, contratos: [], parcelas: [] });
      await abrir(page, `/processos/${ids.processo}?aba=honorarios`, api);
      await expect(vazio(page).getByText("Nenhum contrato de honorários neste processo")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Registrar o contrato" }).click();
      await expect(page.getByRole("dialog", { name: /Novo contrato/ })).toBeVisible();
    });

    test("Honorários, só para leitura: sem criar", async ({ page }) => {
      const api = new ApiFalsa().responder(`GET /financeiro/processos/${ids.processo}`, { ...amostras.financeiroDoProcesso!.corpo, contratos: [], parcelas: [] }).responder("/eu", { ...eu, assinatura: euSoLeitura.assinatura });
      await abrir(page, `/processos/${ids.processo}?aba=honorarios`, api);
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: /contrato/i })).toHaveCount(0);
    });

    test("Documentos, Prazos e Peças vazios dizem o que entra em cada um", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /documentos", { itens: [] }).responder("GET /prazos", LISTA_DE_PRAZOS_VAZIA).responder(`GET /processos/${ids.processo}/pecas`, { itens: [] });
      await abrir(page, `/processos/${ids.processo}?aba=documentos`, api);
      await expect(vazio(page).getByText("Nenhum documento nos autos")).toBeVisible();
      await page.getByRole("tab", { name: /Prazos/ }).click();
      await expect(vazio(page).getByText("Nenhum prazo neste processo")).toBeVisible();
      await expect(vazio(page).getByText("Nenhuma peça neste processo")).toBeVisible();
      await expect(vazio(page).getByText(/sai no timbre do escritório/)).toBeVisible();
    });

    test("Movimentações: com filtro, é o filtro que não achou, e limpa", async ({ page }) => {
      const k = { todas: 3, juizo: 0, partes: 3, documento: 0 };
      const api = new ApiFalsa().responder(`GET /processos/${ids.processo}/movimentacoes`, { itens: [], pagina: 1, porPagina: 30, contagens: k });
      await abrir(page, `/processos/${ids.processo}?aba=movimentacoes`, api);
      await page.getByRole("button", { name: /^Do juízo/ }).click();
      await expect(vazio(page).getByText("Nenhuma movimentação do juízo")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver todas" }).click();
    });

    test("Movimentações: sem nenhuma, explica de onde vêm", async ({ page }) => {
      const k = { todas: 0, juizo: 0, partes: 0, documento: 0 };
      const api = new ApiFalsa().responder(`GET /processos/${ids.processo}/movimentacoes`, { itens: [], pagina: 1, porPagina: 30, contagens: k });
      await abrir(page, `/processos/${ids.processo}?aba=movimentacoes`, api);
      await expect(vazio(page).getByText("Nenhuma movimentação ainda")).toBeVisible();
      await expect(vazio(page).getByText(/DataJud e das publicações do DJEN/)).toBeVisible();
    });
  });

  test.describe("Dentro do cliente", () => {
    test("Processos e documentos vazios explicam o que entra ali", async ({ page }) => {
      const api = new ApiFalsa().responder(`GET /clientes/${ids.cliente}`, { ...amostras.cliente!.corpo, processos: [], documentos: [], atendimentos: [] });
      await abrir(page, `/clientes/${ids.cliente}`, api);
      await expect(vazio(page).getByText("Nenhum processo deste cliente")).toBeVisible();
      await expect(vazio(page).getByText("Nenhum atendimento registrado")).toBeVisible();
      await expect(vazio(page).getByText("Nenhum documento deste cliente")).toBeVisible();
    });
  });

  test.describe("Plano", () => {
    test("Faturas: sem cobrança aberta, não promete fatura", async ({ page }) => {
      await abrir(page, "/configuracoes?aba=plano");
      await expect(vazio(page).getByText("Nenhuma fatura ainda")).toBeVisible();
      await expect(vazio(page).getByText(/não há nada a pagar/)).toBeVisible();
    });

    test("Faturas: com cobrança aberta e sem assinar, diz como começar", async ({ page }) => {
      const plano = { ...amostras.plano!.corpo, cobrancaAtiva: true, situacao: "teste", testeAte: "2026-11-07", diasRestantesDoTeste: 9, podeAssinar: true, faturas: [] };
      await abrir(page, "/configuracoes?aba=plano", new ApiFalsa().responder("GET /plano", plano));
      await expect(vazio(page).getByText(/A primeira aparece aqui quando o escritório assina/)).toBeVisible();
      await expect(page.getByRole("button", { name: "Assinar o plano" })).toBeVisible();
    });
  });

  test.describe("Configurações", () => {
    test("Quem fez o quê: diz o que entra na lista", async ({ page }) => {
      await abrir(page, "/configuracoes", new ApiFalsa().responder("GET /registro", { itens: [] }));
      await page.getByRole("tab", { name: "Registro" }).click();
      await expect(vazio(page).getByText("Nada registrado ainda")).toBeVisible();
      await expect(vazio(page).getByText(/quem fez, o quê e quando/)).toBeVisible();
    });
  });

  test.describe("Processos", () => {
    test("nunca houve processo: explica e abre o cadastro, como o atalho do /comecar", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos", api);
      await expect(vazio(page).getByText("Nenhum processo ainda")).toBeVisible();
      await expect(vazio(page).getByText(/o Decreta busca as partes, a classe e os andamentos/)).toBeVisible();
      await naEscala(page, [11, 12, 13, 14, 15, 20]);
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("a busca não achou: diz com o que buscou e limpa, sem falar em cadastrar o primeiro", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos?busca=sem-resultado", api);
      await expect(vazio(page).getByText("Nenhum processo com “sem-resultado”")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page).toHaveURL(/\/processos$/);
      await expect(page.getByRole("searchbox", { name: "Buscar processo" })).toHaveValue("");
    });

    test("filtro de arquivados sem nada: não é o escritório vazio, e volta para os ativos", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos?situacao=arquivados", api);
      await expect(vazio(page).getByText("Nenhum processo arquivado")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("button", { name: "Ver os ativos" }).click();
      await expect(page).toHaveURL(/\/processos$/);
    });

    test("escritório só para leitura: nenhum botão de criar, e o texto diz por quê", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euSoLeitura).responder("GET /processos", PAGINA_VAZIA);
      await abrir(page, "/processos", api);
      await expect(vazio(page).getByText(/só para leitura/)).toBeVisible();
      await expect(page.getByRole("button", { name: /Cadastrar|Novo processo/ })).toHaveCount(0);
    });
  });

  test.describe("Clientes", () => {
    test("nunca houve cliente: explica e oferece o cadastro", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /clientes", PAGINA_VAZIA);
      await abrir(page, "/clientes", api);
      await expect(vazio(page).getByText("Nenhum cliente ainda")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro cliente" }).click();
      await expect(page.getByRole("dialog", { name: "Novo cliente" })).toBeVisible();
    });

    test("a busca não achou: limpa", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /clientes", PAGINA_VAZIA);
      await abrir(page, "/clientes?busca=fulano", api);
      await expect(vazio(page).getByText("Nenhum cliente com “fulano”")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar a busca" }).click();
      await expect(page).toHaveURL(/\/clientes$/);
    });
  });

  test.describe("Prazos", () => {
    test("escritório sem processo: leva a cadastrar, porque prazo mora em processo", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /prazos", LISTA_DE_PRAZOS_VAZIA);
      await abrir(page, "/prazos", api);
      await expect(vazio(page).getByText("Nenhum prazo ainda")).toBeVisible();
      await expect(vazio(page).getByText(/nascem das publicações do DJEN/)).toBeVisible();
      await vazio(page).getByRole("link", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("com processo e sem prazo nenhum: a primeira ação é criar o prazo", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", LISTA_DE_PRAZOS_VAZIA).responder("POST /prazos/calcular", { fim: "2026-11-24", explicacao: "15 dias úteis.", calendarioCompleto: true });
      await abrir(page, "/prazos", api);
      await vazio(page).getByRole("button", { name: "Novo prazo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo prazo" })).toBeVisible();
    });

    test("todos cumpridos: não diz que nunca houve, e leva aos cumpridos", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, cumpridos: 3 } });
      await abrir(page, "/prazos", api);
      await expect(vazio(page).getByText("Nenhum prazo em aberto")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver os cumpridos" }).click();
      await expect(page).toHaveURL(/quando=cumpridos/);
    });

    test("filtro de vencidos sem nada: diz quantos há em aberto e volta para eles", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
      await abrir(page, "/prazos?quando=vencidos", api);
      await expect(vazio(page).getByText("Nenhum prazo vencido")).toBeVisible();
      await expect(vazio(page).getByText(/4 em aberto/)).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver os em aberto" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });

    test("filtro por pessoa sem nada: limpa o filtro", async ({ page }) => {
      const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
      await abrir(page, `/prazos?responsavel=${eu.usuario.id}`, api);
      await expect(vazio(page).getByText("Nenhum prazo com esse responsável")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Limpar o filtro" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });
  });

  test.describe("Hoje", () => {
    test("escritório novo: explica o dia e oferece o primeiro processo", async ({ page }) => {
      const api = new ApiFalsa().responder("/eu", euNovo).responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(vazio(page).getByText("Aqui fica o trabalho de cada dia")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).click();
      await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
    });

    test("dia sem nada, mas com escritório em uso: não fala em cadastrar, leva aos próximos prazos", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(vazio(page).getByText("Nada para hoje")).toBeVisible();
      await expect(vazio(page).getByRole("button", { name: /Cadastrar/ })).toHaveCount(0);
      await vazio(page).getByRole("link", { name: "Ver os próximos prazos" }).click();
      await expect(page).toHaveURL(/\/prazos$/);
    });

    test("o filtro do dia não achou: diz isso e volta para tudo", async ({ page }) => {
      const soPrazos = amostras.hoje!.corpo.itens.filter((i: { tipo: string }) => i.tipo === "prazo");
      const api = new ApiFalsa().responder("/hoje", { ...amostras.hoje!.corpo, itens: soPrazos });
      await abrir(page, "/hoje", api);
      await page.getByRole("button", { name: /^Tarefas/ }).click();
      await expect(vazio(page).getByText("Nenhuma tarefa para hoje")).toBeVisible();
      await vazio(page).getByRole("button", { name: "Ver tudo" }).click();
      await expect(vazio(page)).toHaveCount(0);
    });

    test("sem ninguém com prazo aberto, o quadro por responsável explica em vez de ficar em branco", async ({ page }) => {
      const api = new ApiFalsa().responder("/hoje", PAINEL_VAZIO);
      await abrir(page, "/hoje", api);
      await expect(page.getByText("A carga de cada pessoa aparece aqui quando houver prazo aberto.")).toBeVisible();
    });
  });
});

test.describe("no celular", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("Processos: explica, oferece o cadastro e não rola para o lado", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euNovo).responder("GET /processos", PAGINA_VAZIA);
    await abrir(page, "/processos", api);
    await expect(vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" })).toBeVisible();
    await naEscala(page, [12, 13, 14, 15, 16, 20]);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("Prazos, com filtro: mesmo texto do computador", async ({ page }) => {
    const api = new ApiFalsa().responder("GET /prazos", { ...LISTA_DE_PRAZOS_VAZIA, chips: { ...LISTA_DE_PRAZOS_VAZIA.chips, abertos: 4 } });
    await abrir(page, "/prazos?quando=vencidos", api);
    await expect(vazio(page).getByText("Nenhum prazo vencido")).toBeVisible();
    await vazio(page).getByRole("button", { name: "Ver os em aberto" }).tap();
    await expect(page).toHaveURL(/\/prazos$/);
    expect(await sobraNaLateral(page)).toBe(0);
  });

  test("Hoje: escritório novo", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euNovo).responder("/hoje", PAINEL_VAZIO);
    await abrir(page, "/hoje", api);
    await expect(vazio(page).getByText("Aqui fica o trabalho de cada dia")).toBeVisible();
    await vazio(page).getByRole("button", { name: "Cadastrar o primeiro processo" }).tap();
    await expect(page.getByRole("dialog", { name: "Novo processo" })).toBeVisible();
  });

  test("Clientes: a equipe também cadastra, sem depender de sócio", async ({ page }) => {
    const api = new ApiFalsa().responder("/eu", euMembro).responder("GET /clientes", PAGINA_VAZIA);
    await abrir(page, "/clientes", api);
    await expect(vazio(page).getByRole("button", { name: "Cadastrar o primeiro cliente" })).toBeVisible();
  });
});
