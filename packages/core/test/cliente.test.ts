import { describe, expect, test } from "bun:test";
import { comLinkDeEnvio, corpoDaCobranca, documentosQueFaltam, mensagemParaWhatsapp, rodapeAntigolpe } from "../src/index.ts";

describe("cobrança dos documentos que faltam", () => {
  test("só o que falta, em palavras do cliente; litispendência não é documento", () => {
    const itens = [
      { item: "procuracao", situacao: "falta" },
      { item: "comprovante_residencia", situacao: "atencao" },
      { item: "documento_identidade", situacao: "falta" },
      { item: "litispendencia", situacao: "falta" },
      { item: "cpf", situacao: "certo" },
      { item: "termo_ia", situacao: "falta" },
    ];
    expect(documentosQueFaltam(itens)).toEqual(["Procuração assinada", "Documento com foto (RG ou CNH)", "Termo de uso de inteligência artificial assinado"]);
  });

  test("o corpo chama pelo primeiro nome e lista os documentos", () => {
    const c = corpoDaCobranca("Marina Duarte", ["Procuração assinada", "Documento com foto (RG ou CNH)"]);
    expect(c).toStartWith("Olá, Marina.");
    expect(c).toContain("\n• Procuração assinada\n• Documento com foto (RG ou CNH)");
  });

  test("o link de envio vai no fim do corpo, com a validade", () => {
    expect(comLinkDeEnvio("Olá, Marina.", "https://decreta.local/enviar/abc", "2026-11-07")).toBe(
      "Olá, Marina.\n\nMande uma foto de cada documento por este link, sem precisar de senha:\nhttps://decreta.local/enviar/abc\nO link vale até 07/11/2026.",
    );
  });
});

describe("mensagem com a identidade do escritório", () => {
  test("nome do escritório no alto, o corpo do advogado e o rodapé no fim", () => {
    const m = mensagemParaWhatsapp({ escritorio: "Souza & Mendes Advocacia", corpo: "  Olá, Marina. O juiz pediu a sua manifestação sobre o laudo.  ", numeroOficial: "47934331000" });
    const linhas = m.split("\n");
    expect(linhas[0]).toBe("*Souza & Mendes Advocacia*");
    expect(m).toContain("\n\nOlá, Marina. O juiz pediu a sua manifestação sobre o laudo.\n\n");
    expect(linhas.at(-1)).toBe(`_${rodapeAntigolpe("47934331000")}_`);
  });
});

describe("rodapé contra o golpe do falso advogado", () => {
  test("diz que o escritório nunca pede Pix e dá o número oficial formatado", () => {
    const r = rodapeAntigolpe("5547934331000");
    expect(r).toContain("Este escritório nunca pede Pix para liberar valores.");
    expect(r).toContain("(47) 93433-1000");
  });
});
