/**
 * CNPJ e CEP na demonstração. Como na consulta pelo número do processo, nada
 * vai à Receita nem aos Correios: o número digitado pode ser de uma empresa ou
 * de uma casa de verdade. A resposta é inventada e sempre a mesma para o mesmo
 * número; um CNPJ em cada seis vem baixado, para a tela mostrar o aviso.
 */
import { cepComMascara, limparCnpj, type Endereco } from "@decreta/core";
import type { EmpresaDaReceita } from "@decreta/tribunais";

const EMPRESAS: { nome: string; fantasia: string; atividade: string }[] = [
  { nome: "Metalúrgica Vento Sul Ltda.", fantasia: "Vento Sul", atividade: "Fabricação de estruturas metálicas" },
  { nome: "Transportes Serra Dourada Ltda.", fantasia: "Serra Dourada", atividade: "Transporte rodoviário de carga" },
  { nome: "Supermercado Bela Vista Ltda.", fantasia: "Bela Vista", atividade: "Comércio varejista de mercadorias em geral" },
  { nome: "Construtora Águas Claras Ltda.", fantasia: "Águas Claras", atividade: "Construção de edifícios" },
  { nome: "Clínica Sorriso do Vale Ltda.", fantasia: "Sorriso do Vale", atividade: "Atividade odontológica" },
  { nome: "Malharia Fio Azul Ltda.", fantasia: "Fio Azul", atividade: "Confecção de peças do vestuário" },
  { nome: "Auto Peças Rota 101 Ltda.", fantasia: "Rota 101", atividade: "Comércio de peças para veículos" },
];
const RUAS = ["Rua das Araucárias", "Rua Ipê Amarelo", "Avenida das Hortênsias", "Rua Pedra Branca", "Rua dos Pinheirais", "Rua Vale Verde", "Avenida Beira-Rio"];
const BAIRROS = ["Centro", "América", "Glória", "Boa Vista", "Saguaçu", "Vila Nova"];
const CIDADES = ["Joinville", "Jaraguá do Sul", "São Bento do Sul", "Blumenau", "Itajaí"];

/** Um número a partir do documento ou do CEP, para escolher nas listas. */
const semente = (s: string) => [...s].reduce((n, c, i) => n + (c.charCodeAt(0) - 47) * (i + 1), 0);
const de = <T,>(lista: T[], n: number) => lista[n % lista.length]!;

export function enderecoDeExemplo(cep: string): Endereco {
  const n = semente(cep.replace(/\D/g, ""));
  return { logradouro: de(RUAS, n), numero: null, complemento: null, bairro: de(BAIRROS, n + 1), cidade: de(CIDADES, n + 2), uf: "SC", cep: cepComMascara(cep) };
}

export function empresaDeExemplo(cnpj: string): EmpresaDaReceita {
  const numero = limparCnpj(cnpj);
  const n = semente(numero);
  const e = de(EMPRESAS, n);
  const baixada = n % 6 === 5;
  const ano = 2004 + (n % 18);
  const cep = `89${String(200 + (n % 700)).padStart(3, "0")}${String(n % 1000).padStart(3, "0")}`;
  return {
    cnpj: numero,
    razaoSocial: e.nome,
    nomeFantasia: e.fantasia,
    situacao: baixada ? "Baixada" : "Ativa",
    ativa: !baixada,
    situacaoDesde: baixada ? "2025-06-30" : `${ano}-03-15`,
    abertura: `${ano}-03-15`,
    atividade: e.atividade,
    naturezaJuridica: "Sociedade Empresária Limitada",
    endereco: { ...enderecoDeExemplo(cep), numero: String(100 + (n % 1800)) },
    telefone: `47${3400 + (n % 500)}${String(n % 10000).padStart(4, "0")}`,
    email: null,
    fonte: "BrasilAPI",
  };
}
