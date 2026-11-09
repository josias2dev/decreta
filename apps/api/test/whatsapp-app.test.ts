/**
 * O WhatsApp na tela do Decreta: renovar o vínculo. Quem usa o app logado continua com o WhatsApp
 * ligado; quem passa 30 dias sem abrir o Decreta precisa renovar, porque um WhatsApp tomado por golpe
 * não deve ficar com acesso para sempre.
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { hasTestDatabase } from "@decreta/db/testing";
import { painelDoDia } from "../src/servicos/hoje.ts";
import { avisarResumo } from "../src/whatsapp/avisos.ts";
import { montarCenarioDoWhatsapp, textoDe, type CenarioDoWhatsapp } from "./whatsapp-apoio.ts";

const AGORA = new Date("2026-11-10T07:35:00-03:00");
const DIA = 24 * 60 * 60_000;

describe.skipIf(!hasTestDatabase)("o vínculo do WhatsApp na tela", () => {
  let c: CenarioDoWhatsapp;

  beforeAll(async () => {
    setSystemTime(AGORA);
    c = await montarCenarioDoWhatsapp("2026-11-10");
    await c.ligar("beatriz");
  }, 120_000);

  afterAll(async () => {
    setSystemTime();
    await c?.drop();
  });

  test("abrir o app renova o vínculo: quem usa o Decreta não perde o WhatsApp no dia 31", async () => {
    const ligado = (await c.json(c.call("/whatsapp"))).vinculo;
    expect(ligado.renovarAte).toBe(new Date(AGORA.getTime() + 30 * DIA).toISOString());

    const dia25 = new Date(AGORA.getTime() + 25 * DIA);
    setSystemTime(dia25);
    try {
      await c.entrar("beatriz");
      expect((await c.call("/eu")).status).toBe(200);
      expect((await c.json(c.call("/whatsapp"))).vinculo).toMatchObject({ vencido: false, renovarAte: new Date(dia25.getTime() + 30 * DIA).toISOString() });

      setSystemTime(new Date(AGORA.getTime() + 40 * DIA));
      expect((await c.escreve("beatriz", "trocar de escritório")).map(textoDe)).toEqual(["Você está só em Souza & Freitas Advocacia."]);
    } finally {
      setSystemTime(AGORA);
    }
  });

  test("faltando 3 dias sem abrir o app, o resumo da manhã avisa até quando abrir", async () => {
    await c.ligar("rafael");
    const dia28 = new Date("2026-12-08T07:35:00-03:00");
    setSystemTime(dia28);
    try {
      // A janela de 24 h está aberta (ele escreveu hoje): o resumo sai inteiro, e o aviso vai no fim.
      await c.escreve("rafael", "trocar de escritório");
      const painel = await c.noEscritorio((tx) => painelDoDia(c.t.db, tx, c.organizationId, "2026-12-08", "America/Sao_Paulo", { iaLigada: true }));
      const antes = c.canal.enviadas.length;
      expect(await avisarResumo(c.agente, await c.pessoa("rafael"), painel)).toBe(true);
      expect(textoDe(c.canal.enviadas[antes])).toEndWith("Para continuar recebendo por aqui, abra o Decreta até 10/12.");
    } finally {
      setSystemTime(AGORA);
    }
  });

  test("com mais de 3 dias pela frente, o resumo não fala do vínculo", async () => {
    const painel = await c.noEscritorio((tx) => painelDoDia(c.t.db, tx, c.organizationId, "2026-11-10", "America/Sao_Paulo", { iaLigada: true }));
    const antes = c.canal.enviadas.length;
    expect(await avisarResumo(c.agente, await c.pessoa("rafael"), painel)).toBe(true);
    expect(textoDe(c.canal.enviadas[antes])).not.toContain("abra o Decreta até");
  });
});
