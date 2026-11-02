import { describe, expect, test } from "bun:test";
import { EMPRESA, quemEncarrega, quemOferece, versaoPorExtenso, VERSAO_DOS_TERMOS, type DadosDaEmpresa } from "../src/legal.ts";

const SEM_DADOS: DadosDaEmpresa = { razaoSocial: null, cnpj: null, endereco: null, encarregado: null, contato: { whatsapp: "5546999990000", exibicao: "(46) 99999-0000" } };

describe("dados de quem responde pelo Decreta", () => {
  test("sem razão social, a página não diz nada sobre a empresa", () => {
    expect(quemOferece(SEM_DADOS)).toBeNull();
    // O CNPJ e o endereço sozinhos não bastam: sem o nome, a frase ficaria torta.
    expect(quemOferece({ ...SEM_DADOS, cnpj: "12.345.678/0001-90", endereco: "Rua das Flores, 10, Joinville/SC" })).toBeNull();
  });

  test("com os dados, a frase junta só o que foi preenchido", () => {
    expect(quemOferece({ ...SEM_DADOS, razaoSocial: "Exemplo Tecnologia Ltda." })).toBe("O Decreta é oferecido por Exemplo Tecnologia Ltda.");
    expect(quemOferece({ ...SEM_DADOS, razaoSocial: "Exemplo Tecnologia Ltda.", cnpj: "12.345.678/0001-90" })).toBe("O Decreta é oferecido por Exemplo Tecnologia Ltda., CNPJ 12.345.678/0001-90.");
    expect(quemOferece({ ...SEM_DADOS, razaoSocial: "Exemplo Tecnologia Ltda.", cnpj: "12.345.678/0001-90", endereco: "Rua das Flores, 10, Joinville/SC" })).toBe(
      "O Decreta é oferecido por Exemplo Tecnologia Ltda., CNPJ 12.345.678/0001-90, com sede em Rua das Flores, 10, Joinville/SC.",
    );
  });

  test("o encarregado só aparece quando existe", () => {
    expect(quemEncarrega(SEM_DADOS)).toBeNull();
    expect(quemEncarrega({ ...SEM_DADOS, encarregado: { nome: "Ana Prado", email: "privacidade@exemplo.com.br" } })).toBe("O encarregado pelo tratamento de dados pessoais é Ana Prado, em privacidade@exemplo.com.br.");
  });

  test("hoje o repositório não tem os dados da empresa, e o contato é o que já existe no site", () => {
    expect(EMPRESA.razaoSocial).toBeNull();
    expect(EMPRESA.cnpj).toBeNull();
    expect(EMPRESA.endereco).toBeNull();
    expect(EMPRESA.encarregado).toBeNull();
    expect(EMPRESA.contato.whatsapp).toBe("5546999074372");
  });
});

describe("versão dos termos", () => {
  test("é um dia, e sai por extenso em português", () => {
    expect(VERSAO_DOS_TERMOS).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(versaoPorExtenso("2026-11-02")).toBe("2 de novembro de 2026");
    expect(versaoPorExtenso("2027-03-01")).toBe("1º de março de 2027");
  });
});
