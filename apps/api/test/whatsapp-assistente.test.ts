/**
 * O assistente no WhatsApp, quando a pessoa escreve: o pedido sobre o escritório vira proposta com
 * botão, nunca "abra na tela" nem ação feita pelo texto. A IA é de mentira (o roteiro diz quais
 * ferramentas ela chama); o que se confere é o que o código faz com isso. A escolha da ferramenta pela
 * IA de verdade fica no avaliador de conversas.
 */
import { afterAll, afterEach, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { documentos, prazos, processos } from "@decreta/db";
import { hasTestDatabase } from "@decreta/db/testing";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { conteudoDaConversa } from "../src/whatsapp/painel.ts";
import { montarCenarioDoWhatsapp, prazoDo, textoDe, titulosDe, type CenarioDoWhatsapp, type Enviada } from "./whatsapp-apoio.ts";

const AGORA = new Date("2026-11-10T07:35:00-03:00");

describe.skipIf(!hasTestDatabase)("o assistente no WhatsApp propõe em vez de recusar", () => {
  let c: CenarioDoWhatsapp;
  const prazoNaTela = (id: string) => c.json(c.call(`/prazos/${id}`));

  beforeAll(async () => {
    setSystemTime(AGORA);
    c = await montarCenarioDoWhatsapp("2026-11-10");
    await c.ligar("beatriz");
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await c?.drop();
  });

  afterEach(() => {
    const naoTratadas = c.logs.filter((l) => l.msg === "whatsapp: entrada não tratada" || l.msg === "whatsapp: a IA falhou no turno");
    c.logs.length = 0;
    expect(naoTratadas).toEqual([]);
  });

  /** Um prazo aberto e já confirmado da Beatriz, com o processo. */
  async function prazoConfirmadoDaBeatriz() {
    const [p] = await c.noEscritorio((tx) =>
      tx
        .select({ id: prazos.id, tipo: prazos.tipo, titulo: processos.titulo })
        .from(prazos)
        .innerJoin(processos, eq(processos.id, prazos.processoId))
        .where(and(eq(prazos.responsavelId, c.ids.beatriz), eq(prazos.situacao, "aberto"), isNotNull(prazos.confirmadoEm)))
        .limit(1),
    );
    return p!;
  }

  let cumprido: Enviada[] = [];

  test("\"já protocolei\" vira a proposta de cumprido: nada muda até o toque", async () => {
    const p = await prazoConfirmadoDaBeatriz();
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "proporCumprido", entrada: { prazoId: p.id } }] }, `Toque abaixo para marcar a ${p.tipo} como cumprida.`];
    cumprido = await c.escreve("beatriz", `já protocolei a ${p.tipo.toLowerCase()} do ${p.titulo}`);
    expect(cumprido).toHaveLength(1);
    expect(textoDe(cumprido[0])).toBe(`Toque abaixo para marcar a ${p.tipo} como cumprida.`);
    expect(titulosDe(cumprido[0])).toEqual(["Marcar cumprido"]);
    expect((await prazoNaTela(p.id)).situacao).toBe("aberto");

    const r = await c.toca("beatriz", cumprido[0], "Marcar cumprido");
    expect(textoDe(r[0])).toBe(`Marcado como cumprido: ${p.tipo}.`);
    expect(titulosDe(r[0])).toEqual(["Desfazer"]);
    expect((await prazoNaTela(p.id)).situacao).toBe("cumprido");
  });

  /** Um prazo sugerido da Beatriz, ainda a confirmar. */
  async function sugeridoDaBeatriz() {
    const [p] = await c.noEscritorio((tx) => tx.select({ id: prazos.id }).from(prazos).where(and(eq(prazos.responsavelId, c.ids.beatriz), eq(prazos.situacao, "aberto"), isNull(prazos.confirmadoEm), isNotNull(prazos.publicacaoId))).limit(1));
    return p!.id;
  }

  let item: Enviada | undefined;

  test("\"confirma o prazo\" traz o item da fila, com a conta e os botões; nada é confirmado pelo texto", async () => {
    const prazoId = await sugeridoDaBeatriz();
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "mostrarNaFila", entrada: { prazoId } }] }, "Segue o prazo para você conferir e confirmar."];
    const r = await c.escreve("beatriz", "confirma o prazo da Marina");
    expect(r.map(textoDe)[0]).toBe("Segue o prazo para você conferir e confirmar.");
    item = r[1];
    expect(prazoDo(item)).toBe(prazoId);
    expect(textoDe(item)).toContain("Conta: ");
    expect(titulosDe(item)[0]).toStartWith("Confirmar ");
    expect((await prazoNaTela(prazoId)).confirmado).toBe(false);

    const confirmado = await c.toca("beatriz", item, titulosDe(item)[0]!);
    expect(textoDe(confirmado[0])).toStartWith("Confirmado:");
    expect((await prazoNaTela(prazoId)).confirmado).toBe(true);
  });

  test("o prazo que já foi confirmado não volta à fila: a IA fica sabendo quem confirmou", async () => {
    const prazoId = prazoDo(item);
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "mostrarNaFila", entrada: { prazoId } }] }, "Esse já está confirmado."];
    const r = await c.escreve("beatriz", "confirma esse prazo de novo");
    expect(r.map((m) => m.saida.tipo)).toEqual(["texto"]);
    expect(JSON.stringify(c.ia.pedidos.whatsapp)).toContain("Este prazo já foi confirmado por Beatriz");
  });

  test("a resposta com data que nenhuma consulta trouxe não sai: a IA refaz uma vez, sabendo o que não conferiu", async () => {
    c.ia.respostas.whatsapp = ["O prazo do perito vence 23/04.", "Não achei o prazo do perito nas consultas."];
    const chamadas = c.ia.chamadas.length;
    const r = await c.escreve("beatriz", "quando vence o prazo do perito?");
    expect(r.map(textoDe)).toEqual(["Não achei o prazo do perito nas consultas."]);
    expect(c.ia.chamadas.length - chamadas).toBe(2);
    expect(JSON.stringify(c.ia.pedidos.whatsapp)).toContain("não veio das consultas: 23/04");
  });

  test("se a IA insistir, sai a resposta fixa com o link, sem botão, e a conversa fica marcada para revisão", async () => {
    const p = await prazoConfirmadoDaBeatriz();
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "proporCumprido", entrada: { prazoId: p.id } }] }, "Vence 23/04.", "Vence 24/04, com certeza."];
    const r = await c.escreve("beatriz", "e esse, quando vence?");
    expect(r).toHaveLength(1);
    expect(r[0]!.saida).toEqual({ tipo: "link", texto: "Não consegui conferir esta resposta com os dados do Decreta, e não mando o que não confere.", rotulo: "Abrir no Decreta", url: "https://decreta.local/hoje", rodape: "Souza & Freitas Advocacia" });
    const conversa = await conteudoDaConversa(c.t.db, c.organizationId, c.ids.beatriz);
    expect(conversa.mensagens.filter((m) => m.revisao).map((m) => ({ direcao: m.direcao, texto: m.texto, revisao: m.revisao }))).toEqual([{ direcao: "saida", texto: textoDe(r[0]), revisao: "trava: 24/04" }]);
  });

  test("a resposta com um link só do Decreta, numa linha própria, vira o botão Abrir no Decreta", async () => {
    const url = `https://decreta.local/prazos/${prazoDo(item)}`;
    c.ia.respostas.whatsapp = [`Esse prazo é do Rafael: a confirmação chega para ele.\n${url}`];
    const r = await c.escreve("beatriz", "e o prazo do Rafael?");
    expect(r.map((m) => m.saida)).toEqual([{ tipo: "link", texto: "Esse prazo é do Rafael: a confirmação chega para ele.", rotulo: "Abrir no Decreta", url, rodape: "Souza & Freitas Advocacia" }]);
  });

  test("com dois links, a resposta fica em texto, com os dois", async () => {
    c.ia.respostas.whatsapp = ["Os dois prazos:\nhttps://decreta.local/prazos/a\nhttps://decreta.local/prazos/b"];
    const r = await c.escreve("beatriz", "quais os dois?");
    expect(r.map((m) => m.saida.tipo)).toEqual(["texto"]);
  });

  test("a data de hoje, que está em Agora, sai sem refazer", async () => {
    c.ia.respostas.whatsapp = ["Hoje, 10/11, nada seu vence."];
    const chamadas = c.ia.chamadas.length;
    expect((await c.escreve("beatriz", "vence algo meu hoje?")).map(textoDe)).toEqual(["Hoje, 10/11, nada seu vence."]);
    expect(c.ia.chamadas.length - chamadas).toBe(1);
  });

  /** As respostas do agente marcadas para revisão, com o texto e o motivo. */
  const marcadas = async () =>
    (await conteudoDaConversa(c.t.db, c.organizationId, c.ids.beatriz)).mensagens.filter((m) => m.direcao === "saida" && m.revisao).map((m) => ({ texto: m.texto, revisao: m.revisao }));

  test("a reação 👎 numa resposta a marca para revisão, sem mandar nada", async () => {
    c.ia.respostas.whatsapp = ["Nada seu vence amanhã."];
    const [resposta] = await c.escreve("beatriz", "o que vence amanhã?");
    const chamadas = c.ia.chamadas.length;
    expect(await c.chega("5547991230001", { tipo: "reacao", emoji: "👎", wamid: resposta!.wamid })).toEqual([]);
    expect(c.ia.chamadas.length).toBe(chamadas);
    expect(await marcadas()).toContainEqual({ texto: "Nada seu vence amanhã.", revisao: "reação 👎" });
  });

  test("outra reação não marca nada", async () => {
    c.ia.respostas.whatsapp = ["Obrigado."];
    const [resposta] = await c.escreve("beatriz", "valeu");
    expect(await c.chega("5547991230001", { tipo: "reacao", emoji: "👍", wamid: resposta!.wamid })).toEqual([]);
    expect((await marcadas()).map((m) => m.texto)).not.toContain("Obrigado.");
  });

  test("\"está errado\" marca a última resposta para revisão, e a IA responde de novo", async () => {
    c.ia.respostas.whatsapp = ["O prazo vence amanhã, 11/11."];
    await c.escreve("beatriz", "e o da Marina?");
    c.ia.respostas.whatsapp = ["Conferi de novo: vence hoje, 10/11."];
    const r = await c.escreve("beatriz", "está errado");
    expect(r.map(textoDe)).toEqual(["Conferi de novo: vence hoje, 10/11."]);
    expect(await marcadas()).toContainEqual({ texto: "O prazo vence amanhã, 11/11.", revisao: "a pessoa disse que está errado" });
  });

  test("dois documentos possíveis: vai a lista, e o escolhido sai como arquivo pelo código, sem outra rodada de IA", async () => {
    const docs = await c.noEscritorio((tx) => tx.select({ id: documentos.id, nome: documentos.nome }).from(documentos).where(isNotNull(documentos.processoId)).limit(2));
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "escolherDocumento", entrada: { documentoIds: docs.map((d) => d.id) } }] }, "Achei dois. Qual deles?"];
    const r = await c.escreve("beatriz", "me manda o documento da Marina");
    expect(r.map((m) => m.saida.tipo)).toEqual(["texto", "lista"]);
    expect(textoDe(r[0])).toBe("Achei dois. Qual deles?");
    expect(textoDe(r[1])).toBe("Qual destes documentos? O escolhido vem como arquivo.");
    expect(titulosDe(r[1])).toHaveLength(2);

    const chamadas = c.ia.chamadas.length;
    const escolhido = await c.toca("beatriz", r[1], titulosDe(r[1])[1]!);
    expect(escolhido.map((m) => m.saida.tipo)).toEqual(["documento"]);
    expect(escolhido[0]!.saida).toMatchObject({ nome: docs[1]!.nome });
    expect(c.ia.chamadas.length).toBe(chamadas);
  });

  test("dois processos que batem: vai a lista, e a escolha volta para a IA com o id do processo", async () => {
    const procs = await c.noEscritorio((tx) => tx.select({ id: processos.id, titulo: processos.titulo }).from(processos).limit(2));
    c.ia.respostas.whatsapp = [{ ferramentas: [{ nome: "escolherProcesso", entrada: { processoIds: procs.map((p) => p.id) } }] }, "São dois. De qual você fala?"];
    const r = await c.escreve("beatriz", "como está o processo da Marina?");
    expect(r.map((m) => m.saida.tipo)).toEqual(["texto", "lista"]);
    expect(textoDe(r[1])).toBe("Qual destes processos?");

    c.ia.respostas.whatsapp = ["Está concluso para sentença desde 02/10."];
    await c.toca("beatriz", r[1], titulosDe(r[1])[0]!);
    expect(JSON.stringify(c.ia.pedidos.whatsapp)).toContain(`Escolhi o processo ${procs[0]!.titulo} (id do processo: ${procs[0]!.id}).`);
  });

  test("a resposta a uma mensagem citada chega à IA com a mensagem: ela não adivinha de qual processo é", async () => {
    c.ia.respostas.whatsapp = ["É na 2ª Vara Cível."];
    await c.chega("5547991230001", { tipo: "texto", texto: "qual a vara desse?" }, { responde: item!.wamid });
    const pedido = JSON.stringify(c.ia.pedidos.whatsapp);
    expect(pedido).toContain("qual a vara desse?");
    expect(pedido).toContain(`/prazos/${prazoDo(item)}`);
  });
});
