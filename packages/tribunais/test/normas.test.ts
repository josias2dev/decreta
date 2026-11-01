import { describe, expect, test } from "bun:test";
import { acharDispositivo, baixarNorma, ErroNormas, lerNorma, urnDaNorma } from "../src/index.ts";

const URN_CPC = "urn:lex:br:federal:lei:2015-03-16;13105";
const no = (sufixo: string, extra: Record<string, unknown> = {}) => ({ "@type": "Legislation", legislationIdentifier: `${URN_CPC}!${sufixo}`, "@id": `https://normas.leg.br/?urn=${URN_CPC}!${sufixo}`, ...extra });
const versao = (tipo: string, data: string, text: string) => ({ "@type": "Legislation", legislationType: tipo, legislationDate: data, text });

/** Como o normas.leg.br responde (JSON-LD, encurtado do CPC real). */
const CPC = {
  "@type": "Legislation",
  legislationIdentifier: URN_CPC,
  name: "Lei nº 13.105 de 16/03/2015",
  alternateName: ["LEI-13105-2015-03-16", "Código de Processo Civil (2015) (CPC)"],
  dateModified: "2025-03-13",
  hasPart: [
    no("art12", {
      hasPart: [
        no("art12_cpt", {
          workExample: [
            versao("Original_Version", "2015-03-16", "Os juízes e os tribunais deverão obedecer à ordem cronológica de conclusão."),
            versao("Text_Change_Version", "2016-02-04", "Os juízes e os tribunais atenderão, preferencialmente, à ordem cronológica de conclusão."),
          ],
        }),
      ],
    }),
    no("art246", { hasPart: [no("art246_cpt_inc1", { workExample: [versao("Original_Version", "2015-03-16", "pelo correio;"), versao("Repeal_Version", "2021-08-26", "(Revogado)")] })] }),
    no("art53_cpt_inc1_ali4,lei-13894-2019-10-29", {
      workExample: versao("Insertion_Version", "2019-10-29", 'de domicílio da vítima de violência doméstica, nos termos da <span xmlns="http://www.lexml.gov.br/1.0">Lei nº 11.340</span>;'),
    }),
    no("art927_par5", { workExample: versao("Original_Version", "2015-03-16", "Os tribunais darão publicidade a seus precedentes.") }),
  ],
};

/** A CLT, o CDC e outras vêm só com os dados da norma, sem o texto por dispositivo. */
const CDC = { "@type": "Legislation", legislationIdentifier: "urn:lex:br:federal:lei:1990-09-11;8078", name: "Lei nº 8.078 de 11/09/1990", alternateName: ["LEI-8078-1990-09-11", "Código de Defesa do Consumidor"] };

describe("legislação pelo normas.leg.br", () => {
  test("o identificador da norma pela sigla da citação; lei sem a data completa também serve", () => {
    expect(urnDaNorma("CPC")).toBe(URN_CPC);
    expect(urnDaNorma("CF")).toBe("urn:lex:br:federal:constituicao:1988-10-05;1988");
    expect(urnDaNorma("LEI-12527-2011")).toBe("urn:lex:br:federal:lei:2011;12527");
    expect(urnDaNorma("XYZ")).toBeNull();
  });

  test("cada dispositivo com o texto em vigor, revogado marcado e o que foi incluído por lei posterior", () => {
    const cpc = lerNorma(CPC)!;
    expect([cpc.nome, cpc.apelido, cpc.atualizadoEm, cpc.porDispositivo]).toEqual(["Lei nº 13.105 de 16/03/2015", "Código de Processo Civil (2015) (CPC)", "2025-03-13", true]);
    expect(acharDispositivo(cpc, "art12")).toEqual({
      id: "art12_cpt",
      texto: "Os juízes e os tribunais atenderão, preferencialmente, à ordem cronológica de conclusão.",
      revogado: false,
      desde: "2016-02-04",
      url: `https://normas.leg.br/?urn=${URN_CPC}!art12_cpt`,
    });
    // Inciso do caput: a citação escreve "art. 246, I", o normas.leg.br, "art246_cpt_inc1".
    expect(acharDispositivo(cpc, "art246_inc1")).toMatchObject({ texto: "(Revogado)", revogado: true, desde: "2021-08-26" });
    expect(acharDispositivo(cpc, "art53_inc1_ali4")).toMatchObject({ texto: "de domicílio da vítima de violência doméstica, nos termos da Lei nº 11.340;" });
    expect(acharDispositivo(cpc, "art927_par5")?.texto).toBe("Os tribunais darão publicidade a seus precedentes.");
    expect(acharDispositivo(cpc, "art927_par9")).toBeNull();
  });

  test("norma sem o texto por dispositivo: existe, mas não dá para conferir o artigo", () => {
    const cdc = lerNorma(CDC)!;
    expect([cdc.apelido, cdc.porDispositivo]).toEqual(["Código de Defesa do Consumidor", false]);
    expect(acharDispositivo(cdc, "art14")).toBeNull();
  });

  test("baixa pela URN; norma que não existe volta só com a URN e vira null", async () => {
    const pedidos: string[] = [];
    const fetchFalso = (async (url: string) => {
      pedidos.push(String(url));
      return Response.json(String(url).includes("13105") ? CPC : { urn: "urn:lex:br:federal:lei:2011;99999" });
    }) as unknown as typeof fetch;
    expect((await baixarNorma(URN_CPC, { fetch: fetchFalso }))?.nome).toBe("Lei nº 13.105 de 16/03/2015");
    expect(await baixarNorma("urn:lex:br:federal:lei:2011;99999", { fetch: fetchFalso })).toBeNull();
    expect(pedidos[0]).toBe(`https://normas.leg.br/api/public/normas?urn=${encodeURIComponent(URN_CPC)}&tipo_documento=maior-detalhe`);
  });

  test("fonte fora do ar: erro", async () => {
    await expect(baixarNorma(URN_CPC, { fetch: (async () => new Response("", { status: 502 })) as unknown as typeof fetch })).rejects.toBeInstanceOf(ErroNormas);
  });
});
