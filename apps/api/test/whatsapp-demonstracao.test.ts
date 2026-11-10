/**
 * O WhatsApp no escritório de demonstração, para testar o agente com os dados inventados: liga pelo código como
 * num escritório comum, avisa que os dados são inventados e continua ligado depois da renovação da madrugada
 * (que apaga e recria o escritório com o mesmo id).
 */
import { afterAll, beforeAll, describe, expect, setSystemTime, test } from "bun:test";
import { hasTestDatabase } from "@decreta/db/testing";
import { renovarDemonstracao } from "../src/demonstracao.ts";
import { enviarParaPessoa } from "../src/whatsapp/mensagens.ts";
import { montarCenarioDoWhatsapp, textoDe, type CenarioDoWhatsapp } from "./whatsapp-apoio.ts";

const HOJE = "2026-11-10";

describe.skipIf(!hasTestDatabase)("WhatsApp na demonstração", () => {
  let c: CenarioDoWhatsapp;

  beforeAll(async () => {
    setSystemTime(new Date("2026-11-10T07:35:00-03:00"));
    c = await montarCenarioDoWhatsapp(HOJE, { demonstracao: true });
  }, 180_000);

  afterAll(async () => {
    setSystemTime();
    await c?.drop();
  });

  test("a pessoa liga o WhatsApp com o código e fica sabendo que os dados são inventados", async () => {
    const [ligado] = await c.ligar("rafael");
    expect(textoDe(ligado)).toContain("Ligado ao Decreta de Souza & Freitas Advocacia.");
    expect(textoDe(ligado)).toContain("Este é o escritório de demonstração: os dados são inventados e voltam ao começo toda madrugada.");
    expect((await c.pessoa("rafael")).demonstracao).toBe(true);
  });

  test("o rodapé das mensagens com botão diz que é a demonstração", async () => {
    const enviada = await enviarParaPessoa(c.agente, await c.pessoa("rafael"), { tipo: "botoes", texto: "Teste do rodapé.", botoes: [{ id: "a:dia", titulo: "Ver o meu dia" }] }, { origem: "agente", chave: "teste-do-rodape" });
    expect(enviada?.saida).toMatchObject({ rodape: "Demonstração · Souza & Freitas Advocacia" });
  });

  test("a renovação da madrugada refaz o escritório e o WhatsApp continua ligado", async () => {
    await renovarDemonstracao(c.t.db, c.auth, { hoje: HOJE, arquivos: c.arquivos });
    const rafael = await c.pessoa("rafael");
    expect(rafael.organizationId).toBe(c.organizationId);
    expect(rafael.demonstracao).toBe(true);
  }, 120_000);
});
