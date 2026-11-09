/**
 * Os avisos que o agente manda sem a pessoa pedir (o resumo da manhã, o das 15h e o de prazo curto),
 * chamados como as rotinas chamam: o que sairia pelo canal da memória e o efeito do toque, conferido
 * pela API da tela. Nenhum usa IA.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { prazos } from "@decreta/db";
import { hasTestDatabase } from "@decreta/db/testing";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { painelDoDia } from "../src/servicos/hoje.ts";
import { avisarPrazoCurto, avisarResumo, avisarVenceHoje } from "../src/whatsapp/avisos.ts";
import { FORA_DA_JANELA } from "../src/whatsapp/canal.ts";
import { montarCenarioDoWhatsapp, prazoDo, textoDe, titulosDe, type CenarioDoWhatsapp, type Enviada, type Quem } from "./whatsapp-apoio.ts";

const AGORA = new Date("2026-11-10T07:35:00-03:00");
const HOJE = "2026-11-10";

describe.skipIf(!hasTestDatabase)("avisos do agente do WhatsApp", () => {
  let c: CenarioDoWhatsapp;
  const painel = () => c.noEscritorio((tx) => painelDoDia(c.t.db, tx, c.organizationId, HOJE, "America/Sao_Paulo", { iaLigada: true }));
  /** O que saiu enquanto `fn` rodava, e o que ela devolveu. */
  async function durante<T>(fn: () => Promise<T>): Promise<{ r: T; saiu: Enviada[] }> {
    const antes = c.canal.enviadas.length;
    const r = await fn();
    return { r, saiu: c.canal.enviadas.slice(antes) };
  }
  const prazoNaTela = (id: string) => c.json(c.call(`/prazos/${id}`));

  beforeAll(async () => {
    setSystemTime(AGORA);
    c = await montarCenarioDoWhatsapp(HOJE);
    for (const quem of ["beatriz", "rafael", "tiago", "camila"] as Quem[]) await c.ligar(quem);
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await c?.drop();
  });

  test("resumo com a janela aberta: o dia inteiro e o botão da fila", async () => {
    const beatriz = await c.pessoa("beatriz");
    expect(beatriz.janelaAberta).toBe(true);
    const { r, saiu } = await durante(async () => avisarResumo(c.agente, beatriz, await painel()));
    expect(r).toBe(true);
    expect(saiu.map((m) => m.saida.tipo)).toEqual(["texto", "botoes"]);
    expect(textoDe(saiu[0])).toStartWith("Bom dia, Beatriz. O seu dia no Decreta");
    expect(titulosDe(saiu[1])).toEqual(["Conferir agora"]);
  });

  test("o resumo do dia sai uma vez só, mesmo que a rotina rode de novo", async () => {
    const { r, saiu } = await durante(async () => avisarResumo(c.agente, await c.pessoa("beatriz"), await painel()));
    expect(r).toBe(false);
    expect(saiu).toEqual([]);
  });

  test("janela fechada: sai o modelo curto, sem nome de cliente, e o toque traz o dia inteiro", async () => {
    const rafael = { ...(await c.pessoa("rafael")), janelaAberta: false };
    const { saiu } = await durante(async () => avisarResumo(c.agente, rafael, await painel()));
    expect(saiu).toHaveLength(1);
    expect(saiu[0]!.saida).toMatchObject({ tipo: "modelo", nome: "resumo_do_dia" });
    expect(textoDe(saiu[0])).toMatch(/^Bom dia, Rafael\. Hoje no Decreta: [a-zà-ú0-9 ,]+\. Toque abaixo para ver o dia\.$/);
    expect(textoDe(saiu[0])).not.toContain("Marina");

    expect(titulosDe(saiu[0])).toEqual(["Ver o dia", "Conferir agora"]);

    const dia = await c.toca("rafael", saiu[0], "Ver o dia");
    expect(textoDe(dia[0])).toStartWith("*Souza & Freitas Advocacia · hoje*");
  });

  test("o segundo botão do modelo vai direto à fila: a publicação é conferida em dois toques", async () => {
    const camila = { ...(await c.pessoa("camila")), janelaAberta: false };
    const { saiu } = await durante(async () => avisarResumo(c.agente, camila, await painel()));
    const fila = await c.toca("camila", saiu[0], "Conferir agora");
    expect(prazoDo(fila[0])).not.toBe("");
    expect(titulosDe(fila[0])[0]).toStartWith("Confirmar");
  });

  test("a Meta diz que a janela fechou (131047): o resumo sai como modelo, e a próxima mensagem já sabe", async () => {
    const tiago = await c.pessoa("tiago");
    expect(tiago.janelaAberta).toBe(true);
    c.canal.falharCom(FORA_DA_JANELA, "Re-engagement message");
    const { r, saiu } = await durante(async () => avisarResumo(c.agente, tiago, await painel()));
    expect(r).toBe(true);
    expect(saiu.map((m) => m.saida.tipo)).toEqual(["modelo"]);
    expect((await c.pessoa("tiago")).janelaAberta).toBe(false);
  });

  let lista: Enviada | undefined;
  let cartao: Enviada | undefined;

  test("às 15h: uma mensagem só, com a lista do que vence hoje e está aberto", async () => {
    const { r, saiu } = await durante(async () => avisarVenceHoje(c.agente, await c.pessoa("beatriz")));
    expect(r).toBe(true);
    expect(saiu).toHaveLength(1);
    lista = saiu[0];
    expect(lista!.saida.tipo).toBe("lista");
    const n = titulosDe(lista).length;
    expect(n).toBeGreaterThan(1);
    expect(textoDe(lista)).toBe(`Aviso das 15h: vencem hoje e ainda estão abertos ${n} prazos seus. Toque para ver cada um e marcar o que já foi protocolado.`);
    if (lista!.saida.tipo === "lista") {
      expect(lista!.saida.botao).toBe("Ver os prazos");
      // A linha diz o ato; a descrição, o processo.
      for (const item of lista!.saida.itens) expect(item.descricao).toBeString();
    }
  });

  test("o toque numa linha traz o prazo com o botão de cumprido", async () => {
    const r = await c.toca("beatriz", lista, titulosDe(lista)[0]!);
    cartao = r[0];
    expect(textoDe(cartao)).toContain("Vence hoje (10/11).");
    expect(prazoDo(cartao)).not.toBe("");
    expect(titulosDe(cartao)).toEqual(["Já protocolei"]);
  });

  test("Já protocolei marca como cumprido e já traz o Desfazer, que volta atrás", async () => {
    const prazoId = prazoDo(cartao);
    const cumprido = await c.toca("beatriz", cartao, "Já protocolei");
    expect(textoDe(cumprido[0])).toStartWith("Marcado como cumprido:");
    expect(cumprido[0]!.responde).toBe(cartao!.wamid);
    expect(titulosDe(cumprido[0])).toEqual(["Desfazer"]);
    expect((await prazoNaTela(prazoId)).situacao).toBe("cumprido");

    const desfeito = await c.toca("beatriz", cumprido[0], "Desfazer");
    expect(textoDe(desfeito[0])).toStartWith("Voltou para aberto:");
    expect((await prazoNaTela(prazoId)).situacao).toBe("aberto");
  });

  test("às 15h com a janela fechada: o modelo com quantos prazos", async () => {
    const beatriz = { ...(await c.pessoa("beatriz")), janelaAberta: false };
    const { saiu } = await durante(() => avisarVenceHoje(c.agente, beatriz));
    // A chave do dia já saiu no teste anterior: o modelo tem a própria chave e sai.
    expect(saiu.map((m) => m.saida)).toEqual([expect.objectContaining({ tipo: "modelo", nome: "vence_hoje", parametros: [String(titulosDe(lista).length)] })]);
  });

  test("um prazo só vencendo hoje: o cartão dele direto, sem lista", async () => {
    const { saiu } = await durante(async () => avisarVenceHoje(c.agente, await c.pessoa("camila")));
    expect(saiu).toHaveLength(1);
    expect(textoDe(saiu[0])).toStartWith("Aviso das 15h: vence hoje e ainda está aberto.\n\n*");
    expect(titulosDe(saiu[0])).toEqual(["Já protocolei"]);
  });

  test("escritório só leitura: o prazo vem sem o botão, pelo aviso ou pela lista", async () => {
    await c.soLeitura(async () => {
      const { saiu } = await durante(async () => avisarVenceHoje(c.agente, await c.pessoa("rafael")));
      expect(saiu.map((m) => m.saida.tipo)).toEqual(["texto"]);
      const r = await c.toca("beatriz", lista, titulosDe(lista)[0]!);
      expect(r.map((m) => m.saida.tipo)).toEqual(["texto"]);
    });
  });

  /**
   * Um prazo sugerido da pessoa, a confirmar, com a data final trocada para `fim`. Cada chamada pega
   * outro: o aviso de prazo curto sai uma vez por publicação.
   */
  const usados = new Set<string>();
  async function sugeridoDe(quem: Quem, fim: string): Promise<{ prazoId: string; publicacaoId: string }> {
    const lista = await c.noEscritorio((tx) => tx.select({ id: prazos.id, publicacaoId: prazos.publicacaoId }).from(prazos).where(and(eq(prazos.responsavelId, c.ids[quem]), isNull(prazos.confirmadoEm), isNotNull(prazos.publicacaoId), eq(prazos.situacao, "aberto"))));
    const p = lista.find((x) => !usados.has(x.id));
    if (!p) throw new Error(`${quem} não tem mais prazo sugerido na demonstração`);
    usados.add(p.id);
    await c.noEscritorio((tx) => tx.update(prazos).set({ fim }).where(eq(prazos.id, p.id)));
    return { prazoId: p.id, publicacaoId: p.publicacaoId! };
  }

  test("prazo curto: a publicação cuja sugestão vence em até 2 dias úteis chega na hora, com os botões", async () => {
    const { prazoId, publicacaoId } = await sugeridoDe("rafael", "2026-11-11");
    const { r, saiu } = await durante(async () => avisarPrazoCurto(c.agente, [await c.pessoa("rafael")], c.organizationId, publicacaoId));
    expect(r).toBe(1);
    expect(textoDe(saiu[0])).toStartWith("Publicação com prazo curto: a sugestão vence 11/11.");
    expect(prazoDo(saiu[0])).toBe(prazoId);
    expect(titulosDe(saiu[0])).toEqual(["Confirmar 11/11", "Outro prazo", "Sem prazo"]);
  });

  test("a mesma publicação não avisa duas vezes", async () => {
    const [p] = [...usados];
    const [linha] = await c.noEscritorio((tx) => tx.select({ publicacaoId: prazos.publicacaoId }).from(prazos).where(eq(prazos.id, p!)));
    const { r, saiu } = await durante(async () => avisarPrazoCurto(c.agente, [await c.pessoa("rafael")], c.organizationId, linha!.publicacaoId!));
    expect(r).toBe(0);
    expect(saiu).toEqual([]);
  });

  test("prazo curto com a janela fechada: o modelo com a data", async () => {
    const { publicacaoId } = await sugeridoDe("tiago", "2026-11-12");
    const tiago = { ...(await c.pessoa("tiago")), janelaAberta: false };
    const { saiu } = await durante(() => avisarPrazoCurto(c.agente, [tiago], c.organizationId, publicacaoId));
    expect(saiu.map((m) => m.saida)).toEqual([expect.objectContaining({ tipo: "modelo", nome: "prazo_curto", parametros: ["12/11"] })]);
  });

  test("prazo que vence depois de 2 dias úteis não avisa na hora: espera o resumo", async () => {
    const { publicacaoId } = await sugeridoDe("tiago", "2026-11-20");
    const { r, saiu } = await durante(async () => avisarPrazoCurto(c.agente, [await c.pessoa("tiago")], c.organizationId, publicacaoId));
    expect(r).toBe(0);
    expect(saiu).toEqual([]);
  });

  test("quem desligou o aviso de prazo curto na tela não recebe", async () => {
    expect((await c.call("/whatsapp/avisos", { method: "PUT", json: { prazoCurto: false } }, "tiago")).status).toBe(200);
    expect((await c.json(c.call("/whatsapp", {}, "tiago"))).avisos).toMatchObject({ prazoCurto: false });
    const [semDono] = await c.noEscritorio((tx) => tx.select({ publicacaoId: prazos.publicacaoId }).from(prazos).where(and(isNull(prazos.responsavelId), isNull(prazos.confirmadoEm), isNotNull(prazos.publicacaoId), eq(prazos.situacao, "aberto"))).limit(1));
    await c.noEscritorio((tx) => tx.update(prazos).set({ fim: "2026-11-11" }).where(eq(prazos.publicacaoId, semDono!.publicacaoId!)));
    // O prazo sem dono avisa todos que ligaram o aviso: a Beatriz recebe, o Tiago não.
    const { r, saiu } = await durante(async () => avisarPrazoCurto(c.agente, [await c.pessoa("tiago"), await c.pessoa("beatriz")], c.organizationId, semDono!.publicacaoId!));
    expect(r).toBe(1);
    expect(saiu.map((m) => m.para.telefone)).toEqual(["5547991230001"]);
  });
});
