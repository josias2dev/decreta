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
import { botoesDe, montarCenarioDoWhatsapp, NUMERO_DO_DECRETA, prazoDo, TELEFONES, textoDe, titulosDe, type CenarioDoWhatsapp, type Enviada } from "./whatsapp-apoio.ts";

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

  test("a pessoa liga o WhatsApp mandando o código que a tela deu", async () => {
    const antes = await c.json(c.call("/whatsapp"));
    expect(antes).toMatchObject({ servidor: true, numero: NUMERO_DO_DECRETA, vinculo: null });
    const r = await c.json(c.call("/whatsapp/codigo", { method: "POST" }));
    expect(r.codigo).toMatch(/^DECRETA [2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(r.link).toStartWith(`https://wa.me/${NUMERO_DO_DECRETA}?text=DECRETA`);
    codigoUsado = r.codigo;

    const resposta = await c.escreve("beatriz", r.codigo);
    expect(resposta).toHaveLength(1);
    ligado = resposta[0];
    expect(textoDe(ligado)).toStartWith("Ligado ao Decreta de Souza & Freitas Advocacia.");
    expect(titulosDe(ligado)).toEqual(["Ver o meu dia"]);
    const depois = await c.json(c.call("/whatsapp"));
    expect(depois.vinculo).toMatchObject({ ligado: true, telefone: "+55 47 9····-0001", vencido: false });
  });

  test("o código vale uma vez só", async () => {
    expect((await c.escreve("rafael", codigoUsado)).map(textoDe)).toEqual(["Este código não vale. Gere outro em Configurações > WhatsApp, no Decreta."]);
  });

  test("o código vence em 10 minutos", async () => {
    const r = await c.json(c.call("/whatsapp/codigo", { method: "POST" }, "rafael"));
    setSystemTime(new Date(AGORA.getTime() + 11 * 60_000));
    try {
      expect((await c.escreve("rafael", r.codigo)).map(textoDe)).toEqual(["Este código passou dos 10 minutos. Gere outro em Configurações > WhatsApp, no Decreta."]);
    } finally {
      setSystemTime(AGORA);
    }
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
