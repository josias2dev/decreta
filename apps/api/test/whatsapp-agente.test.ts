/**
 * O agente do WhatsApp, da mensagem que chega até a resposta: o que o agente mandaria (o canal da
 * memória) e o efeito no escritório, conferido pela API da tela. Banco de verdade (RLS), IA de mentira
 * e os dados da demonstração (ver `whatsapp-apoio.ts`).
 */
import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { processos } from "@decreta/db";
import { hasTestDatabase } from "@decreta/db/testing";
import { eq } from "drizzle-orm";
import { SO_LEITURA } from "../src/whatsapp/acoes.ts";
import { RESPOSTA_AO_DESCONHECIDO } from "../src/whatsapp/entrada.ts";
import { botoesDe, codigoQueChegou, montarCenarioDoWhatsapp, NUMERO_DO_DECRETA, prazoDo, TELEFONES, textoDe, titulosDe, type CenarioDoWhatsapp, type Enviada, type Quem } from "./whatsapp-apoio.ts";

const AGORA = new Date("2026-11-10T07:35:00-03:00");
const DESCONHECIDO = "5511988887777";

describe.skipIf(!hasTestDatabase)("agente do WhatsApp: da mensagem à resposta", () => {
  let c: CenarioDoWhatsapp;
  const prazoNaTela = (id: string) => c.json(c.call(`/prazos/${id}`));

  beforeAll(async () => {
    setSystemTime(AGORA);
    c = await montarCenarioDoWhatsapp("2026-11-10");
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await c?.drop();
  });

  afterEach(() => {
    // Entrada não tratada é defeito: o teste mostra o motivo.
    const naoTratadas = c.logs.filter((l) => l.msg === "whatsapp: entrada não tratada");
    c.logs.length = 0;
    expect(naoTratadas).toEqual([]);
  });

  test("número desconhecido recebe a resposta fixa uma vez, sem IA", async () => {
    const primeira = await c.escreve(DESCONHECIDO, "oi, quero falar com o meu advogado");
    expect(primeira.map(textoDe)).toEqual([RESPOSTA_AO_DESCONHECIDO]);
    expect(await c.escreve(DESCONHECIDO, "alô?")).toEqual([]);
    expect(c.ia.chamadas).toEqual([]);
  });

  let ligado: Enviada | undefined;
  let codigoUsado = "";
  const pedirCodigo = (telefone: string, quem: Quem = "beatriz") => c.call("/whatsapp/codigo", { method: "POST", json: { telefone } }, quem);
  const confirmar = (codigo: string, quem: Quem = "beatriz") => c.call("/whatsapp/confirmar", { method: "POST", json: { codigo } }, quem);
  /** Pede o código e devolve o que chegou no WhatsApp do número. */
  async function codigoPedido(telefone: string, quem: Quem): Promise<string> {
    const antes = c.canal.enviadas.length;
    expect((await pedirCodigo(telefone, quem)).status).toBe(200);
    const codigo = codigoQueChegou(c.canal.enviadas[antes]);
    if (!codigo) throw new Error("o código não chegou");
    return codigo;
  }

  test("a pessoa digita o número, o código chega no WhatsApp dela e ela digita o código na tela", async () => {
    const antes = await c.json(c.call("/whatsapp"));
    expect(antes).toMatchObject({ servidor: true, numero: NUMERO_DO_DECRETA, vinculo: null });
    const n = c.canal.enviadas.length;
    const r = await pedirCodigo("(47) 99123-0001");
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ telefone: "+55 47 9····-0001" });
    const saiu = c.canal.enviadas.slice(n);
    expect(saiu).toHaveLength(1);
    expect(saiu[0]!.para.telefone).toBe(TELEFONES.beatriz);
    // O modelo de autenticação da Meta, com o botão de copiar o código.
    expect(saiu[0]!.saida).toMatchObject({ tipo: "modelo", nome: "codigo_do_whatsapp" });
    codigoUsado = codigoQueChegou(saiu[0]) ?? "";
    expect(codigoUsado).toMatch(/^\d{6}$/);

    expect((await confirmar(codigoUsado)).status).toBe(200);
    const depois = await c.json(c.call("/whatsapp"));
    expect(depois.vinculo).toMatchObject({ ligado: true, telefone: "+55 47 9····-0001", vencido: false });
    // O número que provou ser dela vai para o perfil.
    expect(depois.perfil).toBe(TELEFONES.beatriz);
  });

  test("o primeiro oi depois de ligar traz as boas-vindas, sem IA", async () => {
    const resposta = await c.escreve("beatriz", "Oi!");
    expect(resposta).toHaveLength(1);
    ligado = resposta[0];
    expect(textoDe(ligado)).toStartWith("Ligado ao Decreta de Souza & Freitas Advocacia.");
    expect(titulosDe(ligado)).toEqual(["Ver o meu dia"]);
    expect(c.ia.chamadas).toEqual([]);
  });

  test("o código vale uma vez só", async () => {
    const r = await confirmar(codigoUsado);
    expect(r.status).toBe(404);
    expect(((await r.json()) as { detalhe: string }).detalhe).toBe("Peça um código primeiro.");
  });

  test("o código vence em 10 minutos", async () => {
    const codigo = await codigoPedido(TELEFONES.rafael, "rafael");
    setSystemTime(new Date(AGORA.getTime() + 11 * 60_000));
    try {
      const r = await confirmar(codigo, "rafael");
      expect(r.status).toBe(410);
      expect(((await r.json()) as { detalhe: string }).detalhe).toBe("O código passou dos 10 minutos. Peça outro.");
    } finally {
      setSystemTime(AGORA);
    }
    expect((await c.json(c.call("/whatsapp", {}, "rafael"))).vinculo).toBeNull();
  });

  test("código errado conta: depois da quinta vez, nem o certo vale", async () => {
    const codigo = await codigoPedido(TELEFONES.tiago, "tiago");
    const errado = codigo === "000000" ? "111111" : "000000";
    // O que nem tem 6 dígitos não gasta tentativa.
    const curto = await confirmar("12345", "tiago");
    expect(curto.status).toBe(422);
    expect(((await curto.json()) as { detalhe: string }).detalhe).toBe("O código tem 6 dígitos.");
    for (const restam of [4, 3, 2, 1]) {
      const r = await confirmar(errado, "tiago");
      expect(r.status).toBe(422);
      expect(((await r.json()) as { detalhe: string }).detalhe).toBe(`Código errado. ${restam === 1 ? "Resta 1 tentativa" : `Restam ${restam} tentativas`}.`);
    }
    const quinta = await confirmar(errado, "tiago");
    expect(quinta.status).toBe(429);
    expect(((await quinta.json()) as { detalhe: string }).detalhe).toBe("Código errado 5 vezes. Peça outro.");
    expect((await confirmar(codigo, "tiago")).status).toBe(429);
    expect((await c.json(c.call("/whatsapp", {}, "tiago"))).vinculo).toBeNull();
  });

  test("a primeira mensagem que não é um oi traz as boas-vindas e a resposta", async () => {
    expect((await confirmar(await codigoPedido(TELEFONES.tiago, "tiago"), "tiago")).status).toBe(200);
    c.ia.respostas.whatsapp = ["Hoje, 10/11, nada seu vence."];
    const r = await c.escreve("tiago", "o que vence hoje?");
    expect(r.map(textoDe)).toEqual([expect.stringMatching(/^Ligado ao Decreta de Souza & Freitas Advocacia\./), "Hoje, 10/11, nada seu vence."]);
  });

  test("o número de outra pessoa e o número que não existe não recebem código", async () => {
    const antes = c.canal.enviadas.length;
    const deOutra = await pedirCodigo(TELEFONES.beatriz, "rafael");
    expect(deOutra.status).toBe(409);
    expect(((await deOutra.json()) as { detalhe: string }).detalhe).toBe("Este WhatsApp já está ligado à conta de outra pessoa no Decreta. Quem tem a conta desliga em Minha conta.");
    const invalido = await pedirCodigo("123", "rafael");
    expect(invalido.status).toBe(422);
    expect(c.canal.enviadas.length).toBe(antes);
  });

  test("cada pessoa pede até 5 códigos por hora: o sexto não sai", async () => {
    for (let i = 0; i < 5; i++) expect((await pedirCodigo(TELEFONES.camila, "camila")).status).toBe(200);
    const antes = c.canal.enviadas.length;
    const sexto = await pedirCodigo(TELEFONES.camila, "camila");
    expect(sexto.status).toBe(429);
    expect(c.canal.enviadas.length).toBe(antes);
  });

  test("a mesma mensagem entregue duas vezes é respondida uma vez", async () => {
    const conteudo = { tipo: "texto" as const, texto: "trocar de escritório" };
    expect((await c.chega(TELEFONES.beatriz, conteudo, { wamid: "wamid.repetida" })).map(textoDe)).toEqual(["Você está só em Souza & Freitas Advocacia."]);
    expect(await c.chega(TELEFONES.beatriz, conteudo, { wamid: "wamid.repetida" })).toEqual([]);
  });

  let itemDaBeatriz: Enviada | undefined;
  let semDono = "";

  test("Ver o meu dia traz o dia e o botão da fila; Conferir agora traz o primeiro item com a conta", async () => {
    const dia = await c.toca("beatriz", ligado, "Ver o meu dia");
    expect(textoDe(dia[0])).toStartWith("*Souza & Freitas Advocacia · hoje*");
    expect(titulosDe(dia[1])).toEqual(["Conferir agora"]);
    // Toda mensagem com botão diz de qual escritório é (quem está em dois sabe onde está tocando).
    expect(dia[1]!.saida).toMatchObject({ rodape: "Souza & Freitas Advocacia" });

    const fila = await c.toca("beatriz", dia[1], "Conferir agora");
    expect(fila).toHaveLength(1);
    itemDaBeatriz = fila[0];
    const texto = textoDe(itemDaBeatriz);
    expect(texto).toStartWith("*");
    // A posição e o escritório vão no rodapé: o corpo fica só com o que decide.
    expect(itemDaBeatriz!.saida).toMatchObject({ rodape: "Souza & Freitas Advocacia · 1 de 5" });
    expect(texto).toContain("Conta: ");
    expect(texto).toContain("Sem responsável no processo.");
    semDono = prazoDo(itemDaBeatriz);
    expect(semDono).not.toBe("");
    expect(titulosDe(itemDaBeatriz)).toEqual(["Confirmar e fico", "Outro prazo", "Sem prazo"]);
  });

  test("um sim digitado não confirma o prazo: os botões voltam", async () => {
    const r = await c.escreve("beatriz", "sim");
    expect(r).toHaveLength(1);
    expect(prazoDo(r[0])).toBe(semDono);
    expect(titulosDe(r[0])).toEqual(["Confirmar e fico", "Outro prazo", "Sem prazo"]);
    expect((await prazoNaTela(semDono)).confirmado).toBe(false);
  });

  let itemDoRafael: Enviada | undefined;

  test("o prazo sem dono chega também para o Rafael", async () => {
    const r = await c.ligar("rafael");
    const dia = await c.toca("rafael", r[0], "Ver o meu dia");
    itemDoRafael = (await c.toca("rafael", dia.at(-1), "Conferir agora"))[0];
    expect(prazoDo(itemDoRafael)).toBe(semDono);
  });

  let proximoDaBeatriz: Enviada | undefined;

  test("Confirmar e fico: o prazo fica com quem tocou, confirmado por ela, e a resposta já traz o próximo", async () => {
    const r = await c.toca("beatriz", itemDaBeatriz, "Confirmar e fico");
    expect(r).toHaveLength(1);
    proximoDaBeatriz = r[0];
    expect(textoDe(proximoDaBeatriz)).toMatch(/^Confirmado: .+ vence \d{2}\/\d{2}, com você\.\n\nPróximo:\n\*/);
    // A resposta cita o item tocado: com vários na tela, aponta qual foi.
    expect(proximoDaBeatriz!.responde).toBe(itemDaBeatriz!.wamid);
    expect(await prazoNaTela(semDono)).toMatchObject({ confirmado: true, confirmadoPor: { id: c.ids.beatriz }, responsavel: { id: c.ids.beatriz } });
    expect(c.rascunhos).toEqual([semDono]);
  });

  test("o segundo toque no mesmo botão não faz nada de novo", async () => {
    const r = await c.toca("beatriz", itemDaBeatriz, "Confirmar e fico");
    expect(textoDe(r[0])).toStartWith("Isso já foi feito.\n\nPróximo:");
    expect(c.rascunhos).toEqual([semDono]);
  });

  test("o Rafael toca depois: mudou desde a mensagem, e a fila dele já não tem esse prazo", async () => {
    const r = await c.toca("rafael", itemDoRafael, "Confirmar e fico");
    expect(textoDe(r[0])).toStartWith("Mudou desde a mensagem.");
    expect(prazoDo(r[0])).not.toBe(semDono);
    expect((await prazoNaTela(semDono)).responsavel.id).toBe(c.ids.beatriz);
  });

  test("o botão de outra pessoa não vale", async () => {
    const daBeatriz = botoesDe(proximoDaBeatriz)[0]!;
    const r = await c.chega(TELEFONES.rafael, { tipo: "escolha", id: daBeatriz.id, titulo: daBeatriz.titulo }, { responde: proximoDaBeatriz!.wamid });
    expect(textoDe(r[0])).toStartWith("Esta opção é de outra pessoa.");
    expect((await prazoNaTela(prazoDo(proximoDaBeatriz))).confirmado).toBe(false);
  });

  test("escritório só leitura: o toque não confirma nada", async () => {
    await c.soLeitura(async () => {
      const r = await c.toca("beatriz", proximoDaBeatriz, titulosDe(proximoDaBeatriz)[0]!);
      expect(r.map(textoDe)).toEqual([SO_LEITURA]);
    });
    expect((await prazoNaTela(prazoDo(proximoDaBeatriz))).confirmado).toBe(false);
  });

  test("Outro prazo → Digitar a data: a data digitada vira proposta e, confirmada, fica anotada no prazo", async () => {
    const prazoId = prazoDo(proximoDaBeatriz);
    const lista = await c.toca("beatriz", proximoDaBeatriz, "Outro prazo");
    expect(lista[0]!.saida.tipo).toBe("lista");
    expect(titulosDe(lista[0])).toEqual(["5 dias úteis", "8 dias úteis", "10 dias úteis", "15 dias úteis", "30 dias úteis", "Digitar a data final"]);
    expect((await c.toca("beatriz", lista[0], "Digitar a data final")).map(textoDe)).toEqual(["Escreva a data final, como 05/12. A data digitada fica anotada no prazo."]);

    const proposta = await c.escreve("beatriz", "05/12");
    expect(textoDe(proposta[0])).toBe("Data final digitada: *05/12*. Fica anotado que foi digitada à mão.");
    expect((await prazoNaTela(prazoId)).confirmado).toBe(false);

    const r = await c.toca("beatriz", proposta[0], "Confirmar 05/12");
    expect(textoDe(r[0])).toStartWith("Confirmado com a data digitada: vence 05/12.");
    const p = await prazoNaTela(prazoId);
    expect(p).toMatchObject({ confirmado: true, fim: "2026-12-05" });
    expect(p.observacoes).toContain("Data final digitada à mão");
  });

  test("passou o tempo: a opção vencida não vale", async () => {
    const dia = await c.toca("beatriz", ligado, "Ver o meu dia");
    const item = (await c.toca("beatriz", dia.at(-1), "Conferir agora"))[0];
    setSystemTime(new Date(AGORA.getTime() + 13 * 60 * 60_000));
    try {
      const r = await c.toca("beatriz", item, titulosDe(item)[0]!);
      expect(textoDe(r[0])).toStartWith("Passou o tempo desta opção. Peça de novo.");
      expect((await prazoNaTela(prazoDo(item))).confirmado).toBe(false);
    } finally {
      setSystemTime(AGORA);
    }
  });

  /** A procuração da Marina, como a tela lista. */
  async function procuracaoDaMarina(): Promise<{ processoId: string; id: string; nome: string }> {
    const processoId = (await c.json(c.call("/processos?busca=Marina"))).itens[0].id as string;
    const doc = (await c.json(c.call(`/documentos?processo=${processoId}`))).itens.find((d: { nome: string }) => d.nome.startsWith("Procuração"));
    return { processoId, id: doc.id, nome: doc.nome };
  }

  test("a IA manda o documento pedido como arquivo", async () => {
    const procuracao = await procuracaoDaMarina();
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "enviarDocumento", entrada: { documentoId: procuracao.id } }] }, "Mandei a procuração da Marina."];
    const r = await c.escreve("beatriz", "me manda a procuração da Marina");
    expect(r.map((m) => m.saida.tipo)).toEqual(["documento", "texto"]);
    expect(r[0]!.saida).toMatchObject({ tipo: "documento", nome: procuracao.nome, mime: "application/pdf" });
    expect(textoDe(r[1])).toBe("Mandei a procuração da Marina.");
  });

  test("processo em segredo de justiça: o arquivo não vai, só o link", async () => {
    const procuracao = await procuracaoDaMarina();
    await c.noEscritorio((tx) => tx.update(processos).set({ segredo: true }).where(eq(processos.id, procuracao.processoId)));
    try {
      c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "enviarDocumento", entrada: { documentoId: procuracao.id } }] }, "É segredo de justiça: abra pelo link."];
      const r = await c.escreve("beatriz", "me manda a procuração da Marina de novo");
      expect(r.map((m) => m.saida.tipo)).toEqual(["texto"]);
      expect(JSON.stringify(c.ia.pedidos.whatsapp)).toContain("Processo em segredo de justiça: o arquivo não vai pelo WhatsApp.");
    } finally {
      await c.noEscritorio((tx) => tx.update(processos).set({ segredo: false }).where(eq(processos.id, procuracao.processoId)));
    }
  });

  test("vínculo vencido: o agente só pede para renovar, sem IA", async () => {
    const chamadas = c.ia.chamadas.length;
    setSystemTime(new Date(AGORA.getTime() + 31 * 24 * 60 * 60_000));
    try {
      const r = await c.escreve("beatriz", "o que vence hoje?");
      expect(textoDe(r[0])).toStartWith("O seu WhatsApp precisa ser renovado no Decreta");
      expect(c.ia.chamadas.length).toBe(chamadas);
    } finally {
      setSystemTime(AGORA);
    }
  });

  test("sair desliga o WhatsApp: a próxima mensagem é de um número desconhecido", async () => {
    expect((await c.escreve("rafael", "sair")).map(textoDe)).toEqual(["Pronto: este WhatsApp foi desligado do Decreta. Para ligar de novo, use Configurações > WhatsApp."]);
    expect((await c.json(c.call("/whatsapp", {}, "rafael"))).vinculo).toBeNull();
    expect((await c.escreve("rafael", "oi")).map(textoDe)).toEqual([RESPOSTA_AO_DESCONHECIDO]);
  });
});
