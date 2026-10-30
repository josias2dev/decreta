/**
 * A consulta pelo número na demonstração. Os números de lá são inventados e
 * podem ser de processos de verdade, então nada vai ao tribunal: a resposta é
 * montada aqui, sempre a mesma para o mesmo número, com nomes inventados. A
 * primeira parte vira um cliente cadastrado (servicos/consulta.ts), para a
 * tela mostrar o casamento com o cadastro.
 */
import { lerCnj } from "@decreta/core";
import type { ParteDjen } from "@decreta/tribunais";
import type { ConsultaDoCnj } from "../servicos/consulta.ts";
import { EQUIPE } from "./dados.ts";

const VARAS_CIVEIS = ["1ª Vara Cível", "2ª Vara Cível", "3ª Vara Cível", "4ª Vara Cível", "5ª Vara Cível"];
const VARAS_DO_TRABALHO = ["1ª Vara do Trabalho", "2ª Vara do Trabalho", "3ª Vara do Trabalho", "4ª Vara do Trabalho", "5ª Vara do Trabalho"];
const CIDADES = ["Joinville", "Jaraguá do Sul", "São Bento do Sul", "Blumenau", "Itajaí"];
const CIVEIS: { classe: string; assunto: string; juizado?: boolean }[] = [
  { classe: "Procedimento Comum Cível", assunto: "Indenização por dano moral" },
  { classe: "Procedimento Comum Cível", assunto: "Rescisão do contrato e devolução do dinheiro" },
  { classe: "Procedimento do Juizado Especial Cível", assunto: "Inclusão indevida em cadastro de inadimplentes", juizado: true },
  { classe: "Procedimento Comum Cível", assunto: "Seguro" },
  { classe: "Execução de Título Extrajudicial", assunto: "Cheque" },
];
const TRABALHISTAS: { classe: string; assunto: string; juizado?: boolean }[] = [
  { classe: "Ação Trabalhista - Rito Ordinário", assunto: "Horas extras" },
  { classe: "Ação Trabalhista - Rito Sumaríssimo", assunto: "Verbas rescisórias" },
  { classe: "Ação Trabalhista - Rito Ordinário", assunto: "Adicional de insalubridade" },
];
const EMPRESAS = ["Metalúrgica Vento Sul Ltda.", "Transportes Serra Dourada Ltda.", "Seguradora Pinheiral S.A.", "Banco Colina Verde S.A.", "Construtora Águas Claras Ltda.", "Supermercado Bela Vista Ltda."];
const ADVOGADOS = ["Rodrigo Kretzer", "Patrícia Lehmann", "Marcos Bittencourt", "Simone Probst", "Fernando Dalmolin"];

export interface ConsultaDeExemplo {
  base: Omit<ConsultaDoCnj, "cnj" | "tribunal" | "cadastrado" | "partes" | "poloCliente" | "cliente">;
  /** A primeira é a do cliente, do lado da equipe. */
  partes: ParteDjen[];
  poloDaEquipe: "ativo" | "passivo";
}

const somarDias = (dia: string, n: number) => new Date(new Date(`${dia}T12:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
/** Nenhuma data do exemplo passa de ontem. */
const ateOntem = (dia: string) => {
  const ontem = somarDias(new Date().toISOString().slice(0, 10), -1);
  return dia < ontem ? dia : ontem;
};

export function consultaDeExemplo(cnj: string): ConsultaDeExemplo {
  const n = lerCnj(cnj)!;
  const semente = Number(n.sequencial) + Number(n.origem);
  const de = <T,>(lista: T[], salto = 0) => lista[(semente + salto) % lista.length]!;
  const trabalhista = n.segmento === "5";
  const tipo = de(trabalhista ? TRABALHISTAS : CIVEIS);
  const cidade = de(CIDADES, 3);
  const orgao = trabalhista ? `${de(VARAS_DO_TRABALHO, 1)} de ${cidade}` : tipo.juizado ? "Juizado Especial Cível" : de(VARAS_CIVEIS, 1);
  // O cliente costuma ser quem pede; em um de cada três exemplos, quem se defende.
  const poloDaEquipe = semente % 3 === 2 ? "passivo" : "ativo";
  const outro = poloDaEquipe === "ativo" ? "passivo" : "ativo";
  const distribuidoEm = ateOntem(somarDias(`${n.ano}-02-01`, semente % 200));
  return {
    base: {
      exemplo: true,
      fontes: { datajud: "achou", djen: "achou" },
      classe: tipo.classe,
      assunto: tipo.assunto,
      orgao,
      comarca: cidade,
      sistema: trabalhista ? "PJe" : "eproc",
      distribuidoEm,
      segredo: false,
      movimentacoes: 6 + (semente % 30),
      ultimaMovimentacao: { em: `${ateOntem(somarDias(distribuidoEm, 60 + (semente % 90)))}T15:20:00.000Z`, titulo: "Juntada de petição" },
    },
    partes: [
      { nome: "Cliente do exemplo", polo: poloDaEquipe, advogados: [{ nome: EQUIPE.beatriz.nome, oab: EQUIPE.beatriz.oab!.replace(/\D/g, ""), uf: "SC" }] },
      { nome: de(EMPRESAS, 2), polo: outro, advogados: [{ nome: de(ADVOGADOS, 4), oab: String(20_000 + (semente % 9_000)), uf: "SC" }] },
    ],
    poloDaEquipe,
  };
}
