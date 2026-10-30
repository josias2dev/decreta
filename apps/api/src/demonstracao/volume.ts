/**
 * O volume da demonstração: uns cem clientes e processos a mais, inventados,
 * para as listas terem o tamanho das de um escritório de verdade. Sai de um
 * sorteio com semente fixa, então a demonstração é sempre a mesma.
 *
 * Cada processo segue o roteiro da sua área (cível, juizado, trabalhista,
 * previdenciário, família, execução, fiscal, consultivo) até uma etapa, e o
 * resto sai dali: as movimentações, os documentos, os prazos já cumpridos, o
 * prazo aberto da última intimação, as audiências e os alvarás.
 *
 * Nada daqui mexe na tela Hoje: os prazos abertos vencem daqui a uma semana ou
 * mais, as audiências são de outros dias, as publicações já foram lidas e as
 * tarefas abertas são dos próximos dias.
 */
import { somarDias, type Dia } from "@decreta/core";
import {
  CLIENTES,
  PROCESSOS,
  type AlvaraDemo,
  type AtendimentoDemo,
  type AudienciaDemo,
  type ClienteDemo,
  type MovimentacaoDemo,
  type PrazoDemo,
  type ProcessoDemo,
  type PublicacaoDemo,
  type Quem,
  type TarefaDemo,
} from "./dados.ts";

export interface Volume {
  clientes: Record<string, ClienteDemo>;
  processos: Record<string, ProcessoDemo>;
  prazos: PrazoDemo[];
  audiencias: AudienciaDemo[];
  publicacoes: PublicacaoDemo[];
  tarefas: TarefaDemo[];
  alvaras: AlvaraDemo[];
  atendimentos: AtendimentoDemo[];
}

/** mulberry32: o mesmo sorteio para a mesma semente. */
function sorteio(semente: number) {
  let a = semente >>> 0;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const entre = (min: number, max: number) => min + Math.floor(r() * (max - min + 1));
  const um = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
  const chance = (p: number) => r() < p;
  const pesado = <T>(xs: readonly (readonly [T, number])[]): T => {
    let n = r() * xs.reduce((s, [, p]) => s + p, 0);
    for (const [x, p] of xs) if ((n -= p) < 0) return x;
    return xs[xs.length - 1]![0];
  };
  return { r, entre, um, chance, pesado };
}

// Nomes comuns, sem os das pessoas da demonstração principal.
const NOMES_F = ["Adriana", "Aline", "Amanda", "Bianca", "Bruna", "Carla", "Caroline", "Cristiane", "Daniela", "Débora", "Elaine", "Eliane", "Fabiana", "Gabriela", "Gisele", "Isabela", "Jaqueline", "Juliana", "Karina", "Larissa", "Letícia", "Luana", "Michele", "Natália", "Patrícia", "Priscila", "Raquel", "Sabrina", "Silvana", "Tatiane", "Viviane", "Rosângela", "Marli", "Ivone", "Cláudia", "Solange", "Valéria", "Jussara"];
const NOMES_M = ["Alexandre", "André", "Anderson", "Bruno", "Caio", "César", "Cláudio", "Daniel", "Diego", "Douglas", "Edson", "Fabrício", "Felipe", "Gustavo", "Henrique", "Leandro", "Leonardo", "Lucas", "Marcelo", "Maurício", "Nelson", "Sérgio", "Valter", "Vinícius", "Wagner", "Ademir", "Osmar", "Ricardo", "Luiz Carlos", "Renan", "Everton", "Mateus", "Ronaldo", "Juliano"];
const SOBRENOMES = ["Schmitt", "Schneider", "Pereira", "Oliveira", "Costa", "Machado", "Zimmermann", "Krause", "Werner", "Wolff", "Moretti", "Bortolini", "Dalmolin", "Sartori", "Pacheco", "Ramos", "Teixeira", "Nunes", "Moura", "Cardoso", "Barbosa", "Correia", "Medeiros", "Pires", "Lopes", "Campos", "Andrade", "Fagundes", "Brito", "Amaral", "Bittencourt", "Dutra", "Goulart", "Lehmann", "Probst", "Schulz", "Kretzer", "Maas", "Bernardi", "Silveira", "Cunha", "Farias", "Reinert", "Stein", "Klein", "Bauer", "Junkes", "Boing"];
const RAMOS = ["Metalúrgica", "Transportes", "Construtora", "Supermercado", "Malharia", "Distribuidora de Alimentos", "Clínica Médica", "Restaurante", "Farmácia", "Madeireira", "Materiais de Construção", "Auto Peças", "Imobiliária", "Agropecuária", "Panificadora", "Usinagem", "Logística", "Gráfica", "Móveis", "Laticínios"];
const FANTASIA = ["Três Rios", "Bela Vista", "Nova Aliança", "Estrela Guia", "Pinheiral", "Ribeirão Verde", "Morro Azul", "Águas Claras", "Serra Dourada", "Vento Sul", "Boa Safra", "Recanto", "Pioneira", "Mirante", "Lagoa Funda", "Alvorada", "Primavera", "Pedra Branca", "Vale Encantado", "Girassol", "Cedro Alto", "Ipê Amarelo", "Portal do Sul", "Atalaia", "Rio Manso", "Colina Verde"];
/** Empresas grandes, réus de sempre no juizado. Todas inventadas. */
const NEGATIVACAO: [string, string] = ["Negativação indevida", "inclusão indevida do nome nos cadastros de inadimplentes"];
const NAO_ENTREGUE: [string, string] = ["Compra on-line não entregue", "compra on-line paga e não entregue"];
const GRANDES: { nome: string; assuntos: [string, string][] }[] = [
  { nome: "Conecta Sul Telecomunicações S.A.", assuntos: [["Cobrança indevida · telefonia", "cobrança de serviços de telefonia que não contratou"], NEGATIVACAO] },
  { nome: "Voa Brasil Linhas Aéreas S.A.", assuntos: [["Atraso de voo · danos morais", "atraso de mais de dez horas em voo nacional"], ["Extravio de bagagem", "extravio de bagagem em voo nacional"]] },
  { nome: "Banco Austral S.A.", assuntos: [NEGATIVACAO, ["Empréstimo consignado não contratado", "descontos de empréstimo consignado que não contratou"], ["Cobrança de tarifa bancária", "tarifas bancárias que o contrato não prevê"]] },
  { nome: "Lojas Ponto Certo S.A.", assuntos: [["Vício de produto · eletrodoméstico", "defeito em geladeira nova que a loja se recusou a trocar"], NAO_ENTREGUE] },
  { nome: "Energia Litoral Distribuidora S.A.", assuntos: [["Corte indevido de energia", "corte de energia com as faturas pagas"], ["Cobrança indevida · energia elétrica", "cobrança de consumo de energia muito acima da média"]] },
  { nome: "Saúde Litoral Planos de Saúde S.A.", assuntos: [["Plano de saúde · negativa de cobertura", "negativa de cobertura de exame pedido pelo médico"], ["Reajuste abusivo de plano de saúde", "reajuste do plano de saúde acima do permitido"]] },
  { nome: "Mercado Virtual Brasil Ltda.", assuntos: [NAO_ENTREGUE] },
];

interface Comarca {
  nome: string;
  ddd: string;
  tjsc: string;
  trt: string;
  trf: string;
  varas: number;
  bairros: string[];
}
const COMARCAS: (readonly [Comarca, number])[] = [
  [{ nome: "Joinville", ddd: "47", tjsc: "0038", trt: "0004", trf: "7201", varas: 5, bairros: ["Centro", "América", "Glória", "Iririú", "Aventureiro", "Costa e Silva", "Bom Retiro", "Floresta", "Anita Garibaldi", "Boa Vista"] }, 9],
  [{ nome: "Blumenau", ddd: "47", tjsc: "0008", trt: "0002", trf: "7205", varas: 4, bairros: ["Centro", "Velha", "Garcia", "Itoupava Norte", "Vila Nova", "Fortaleza", "Escola Agrícola"] }, 3],
  [{ nome: "Itajaí", ddd: "47", tjsc: "0033", trt: "0005", trf: "7208", varas: 3, bairros: ["Centro", "Fazenda", "São Vicente", "Cordeiros", "Ressacada", "Vila Operária"] }, 3],
  [{ nome: "Jaraguá do Sul", ddd: "47", tjsc: "0036", trt: "0019", trf: "7209", varas: 2, bairros: ["Centro", "Vila Lalau", "Baependi", "Czerniewicz", "Amizade", "Barra do Rio Cerro"] }, 3],
  [{ nome: "Balneário Camboriú", ddd: "47", tjsc: "0005", trt: "0045", trf: "7208", varas: 2, bairros: ["Centro", "Pioneiros", "Nações", "Barra", "Vila Real"] }, 2],
  [{ nome: "Brusque", ddd: "47", tjsc: "0011", trt: "0010", trf: "7215", varas: 2, bairros: ["Centro", "Santa Terezinha", "Azambuja", "Guarani", "Jardim Maluche"] }, 1],
  [{ nome: "São Bento do Sul", ddd: "47", tjsc: "0058", trt: "0028", trf: "7201", varas: 1, bairros: ["Centro", "Serra Alta", "Rio Negro", "Mato Preto"] }, 1],
  [{ nome: "Florianópolis", ddd: "48", tjsc: "0023", trt: "0034", trf: "7200", varas: 5, bairros: ["Centro", "Trindade", "Estreito", "Coqueiros", "Saco dos Limões"] }, 1],
];
const RUAS = ["Rua Sete de Setembro", "Rua Santos Dumont", "Rua Marechal Deodoro", "Rua Tiradentes", "Rua Barão do Rio Branco", "Rua São Paulo", "Rua Bahia", "Rua das Acácias", "Rua dos Imigrantes", "Rua Henrique Meyer", "Rua das Palmeiras", "Rua Pernambuco", "Rua Amazonas", "Rua Paraná", "Rua Itália", "Av. Brasil", "Rua Hermann Lange", "Rua Frederico Jensen"];

type Polo = "ativo" | "passivo";
type Genero = "f" | "m";

interface PrazoDoPasso {
  /** De quem é o prazo: o cliente só tem prazo quando está nesse polo. */
  para: Polo | "ambos";
  tipo: string;
  fundamento: string | null;
  dias: number;
  teor: string;
  manual?: boolean;
}

interface Passo {
  titulo: string;
  /** `{a}` pede, `{r}` responde; `{assunto}`, `{detalhe}`, `{valor}`, `{parcial}`, `{c}` (o cliente). */
  descricao: string;
  autor: "juizo" | "partes" | "cartorio";
  /** Fase do processo depois deste passo. */
  fase?: string;
  documento?: { nome: string; paginas: number; texto: string };
  prazo?: PrazoDoPasso;
  /** O passo é uma audiência: realizada, se ficou para trás; marcada, se é a próxima. */
  audiencia?: string;
  alvara?: string;
  /** Situação do processo quando este é o último passo. */
  fim?: "arquivado" | "encerrado" | "suspenso";
}

const DISTRIBUICAO = (descricao: string, texto: string): Passo => ({ titulo: "Distribuição", descricao, autor: "partes", fase: "Citação", documento: { nome: "Petição inicial.docx", paginas: 12, texto } });
const ARQUIVAMENTO = (descricao: string): Passo => ({ titulo: "Arquivamento", descricao, autor: "cartorio", fase: "Arquivado", fim: "arquivado" });
const TRANSITO: Passo = { titulo: "Trânsito em julgado", descricao: "Certificado o trânsito em julgado", autor: "cartorio", fase: "Cumprimento de sentença" };
const APELACAO: PrazoDoPasso = { para: "ambos", tipo: "Apelação", fundamento: "art. 1.003, § 5º, CPC", dias: 15, teor: "Sentença publicada. Intimem-se as partes." };
const REPLICA: PrazoDoPasso = { para: "ativo", tipo: "Réplica à contestação", fundamento: "art. 351, CPC", dias: 15, teor: "Intime-se a parte autora para, no prazo de 15 (quinze) dias, manifestar-se sobre a contestação e os documentos que a acompanham." };
const RECURSO_INOMINADO: PrazoDoPasso = { para: "ambos", tipo: "Recurso inominado", fundamento: "art. 42, Lei 9.099/95", dias: 10, teor: "Sentença publicada. Prazo de 10 (dez) dias para recurso. Intimem-se." };
const CONTRARRAZOES_INOMINADO: PrazoDoPasso = { para: "ativo", tipo: "Contrarrazões ao recurso inominado", fundamento: "art. 42, § 2º, Lei 9.099/95", dias: 10, teor: "Intime-se a parte recorrida para apresentar contrarrazões em 10 (dez) dias." };

const CIVEL: Passo[] = [
  DISTRIBUICAO("Petição inicial · procedimento comum cível", "{a} propõe ação contra {r} sobre {detalhe}. Narra os fatos, junta os documentos e pede a condenação da parte ré nos termos da inicial, com custas e honorários. Valor da causa: {valor}."),
  { titulo: "Despacho", descricao: "Recebida a inicial; designada audiência de conciliação", autor: "juizo" },
  { titulo: "Citação", descricao: "Carta de citação recebida pela parte ré", autor: "cartorio", prazo: { para: "passivo", tipo: "Contestação", fundamento: "art. 335, CPC", dias: 15, teor: "Cite-se a parte ré para comparecer à audiência de conciliação e, não havendo acordo, apresentar contestação no prazo de 15 (quinze) dias úteis." } },
  { titulo: "Audiência de conciliação", descricao: "Sem acordo entre as partes", autor: "juizo", audiencia: "Conciliação", fase: "Contestação" },
  { titulo: "Contestação", descricao: "{r} contesta os pedidos e junta documentos", autor: "partes", fase: "Réplica", documento: { nome: "Contestação.docx", paginas: 16, texto: "{r} apresenta contestação. Em preliminar, impugna o valor da causa. No mérito, nega os fatos narrados na inicial, sustenta que não há dano a indenizar e pede a improcedência dos pedidos." }, prazo: REPLICA },
  { titulo: "Réplica", descricao: "{a} rebate a contestação", autor: "partes", fase: "Saneamento" },
  { titulo: "Decisão", descricao: "Saneamento: fixados os pontos controvertidos e deferida a prova oral", autor: "juizo", fase: "Instrução", prazo: { para: "ambos", tipo: "Rol de testemunhas", fundamento: "art. 357, § 4º, CPC", dias: 15, teor: "Defiro a produção de prova oral. Apresentem as partes o rol de testemunhas no prazo de 15 (quinze) dias." } },
  { titulo: "Audiência de instrução", descricao: "Ouvidas as testemunhas; encerrada a instrução", autor: "juizo", audiencia: "Instrução e julgamento", fase: "Alegações finais", prazo: { para: "ambos", tipo: "Alegações finais", fundamento: "art. 364, § 2º, CPC", dias: 15, teor: "Encerrada a instrução, concedo às partes o prazo sucessivo de 15 (quinze) dias para alegações finais por memoriais." } },
  { titulo: "Alegações finais", descricao: "Memoriais das duas partes", autor: "partes", fase: "Concluso para sentença" },
  { titulo: "Sentença", descricao: "Pedidos julgados parcialmente procedentes", autor: "juizo", fase: "Sentença", documento: { nome: "Sentença.docx", paginas: 7, texto: "Vistos. {a} move ação contra {r} sobre {detalhe}. Citada, a parte ré contestou. Houve instrução. É o relatório. Decido. A prova dos autos confirma em parte a narrativa da inicial. Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar a parte ré ao pagamento de {parcial}, com correção monetária e juros de mora. Sucumbência recíproca. Publique-se. Intimem-se." }, prazo: APELACAO },
  { titulo: "Apelação", descricao: "{r} recorre da sentença", autor: "partes", fase: "Recurso", prazo: { para: "ativo", tipo: "Contrarrazões de apelação", fundamento: "art. 1.010, § 1º, CPC", dias: 15, teor: "Recebo a apelação. Intime-se a parte apelada para apresentar contrarrazões no prazo legal." } },
  { titulo: "Remessa ao TJSC", descricao: "Autos remetidos ao Tribunal de Justiça", autor: "cartorio", fase: "Recurso · TJSC" },
  { titulo: "Acórdão", descricao: "Apelação desprovida por unanimidade", autor: "juizo", fase: "Acórdão" },
  TRANSITO,
  { titulo: "Depósito judicial", descricao: "{r} deposita o valor da condenação", autor: "partes", alvara: "Depósito do valor da condenação" },
  ARQUIVAMENTO("Processo extinto pelo pagamento; autos arquivados"),
];

const JUIZADO: Passo[] = [
  DISTRIBUICAO("Petição inicial · juizado especial cível", "{a} propõe ação no Juizado Especial Cível contra {r} por {detalhe}. Pede a reparação dos danos materiais e indenização por danos morais. Valor da causa: {valor}."),
  { titulo: "Designação de audiência", descricao: "Sessão de conciliação por videoconferência", autor: "cartorio" },
  { titulo: "Sessão de conciliação", descricao: "Sem acordo entre as partes", autor: "juizo", audiencia: "Conciliação", fase: "Contestação" },
  { titulo: "Contestação", descricao: "{r} nega a falha e pede a improcedência", autor: "partes", documento: { nome: "Contestação.docx", paginas: 9, texto: "{r} sustenta que não houve falha na prestação do serviço, que eventual problema decorreu de culpa de terceiro e que o caso não passa de mero aborrecimento, sem dano moral a indenizar." }, prazo: { para: "ativo", tipo: "Manifestação sobre a contestação", fundamento: null, dias: 10, teor: "Manifeste-se a parte autora sobre a contestação e os documentos, no prazo de 10 (dez) dias." } },
  { titulo: "Manifestação da parte autora", descricao: "Impugnação à contestação", autor: "partes", fase: "Concluso para sentença" },
  { titulo: "Sentença", descricao: "Pedido julgado procedente", autor: "juizo", fase: "Sentença", documento: { nome: "Sentença.docx", paginas: 4, texto: "Dispensado o relatório (art. 38 da Lei 9.099/95). A falha na prestação do serviço ficou comprovada pelos protocolos de atendimento e pelos documentos da inicial. JULGO PROCEDENTE o pedido para condenar {r} a pagar {parcial} de indenização por danos morais, com correção e juros. Sem custas e honorários nesta instância." }, prazo: RECURSO_INOMINADO },
  { titulo: "Recurso inominado", descricao: "{r} recorre à Turma Recursal", autor: "partes", fase: "Recurso · Turma Recursal", prazo: CONTRARRAZOES_INOMINADO },
  { titulo: "Acórdão", descricao: "Turma Recursal mantém a sentença", autor: "juizo" },
  TRANSITO,
  { titulo: "Depósito judicial", descricao: "{r} deposita o valor da condenação", autor: "partes", alvara: "Depósito da condenação" },
  ARQUIVAMENTO("Extinção pelo pagamento; autos arquivados"),
];

const TRABALHO_INICIO: Passo[] = [
  DISTRIBUICAO("Reclamação trabalhista", "{a} ajuíza reclamação trabalhista contra {r} pelo contrato de trabalho mantido entre as partes. Pede {detalhe}, com reflexos em férias, 13º salário e FGTS. Valor da causa: {valor}."),
  { titulo: "Notificação", descricao: "Notificada a parte reclamada para a audiência inicial", autor: "cartorio", prazo: { para: "passivo", tipo: "Contestação trabalhista", fundamento: "art. 847, CLT", dias: 10, teor: "Notifique-se a reclamada para apresentar defesa escrita no PJe até a audiência, no prazo de 10 (dez) dias." } },
];
const TRABALHISTA: Passo[] = [
  ...TRABALHO_INICIO,
  { titulo: "Audiência inicial", descricao: "Sem acordo; defesa e documentos recebidos", autor: "juizo", audiencia: "Inicial", fase: "Réplica", prazo: { para: "ativo", tipo: "Réplica à defesa", fundamento: null, dias: 10, teor: "Concedo à parte reclamante o prazo de 10 (dez) dias para manifestação sobre a defesa e os documentos." } },
  { titulo: "Réplica", descricao: "Reclamante impugna a defesa e os controles de ponto", autor: "partes", fase: "Perícia" },
  { titulo: "Perícia designada", descricao: "Designada perícia técnica no local de trabalho", autor: "juizo", prazo: { para: "ambos", tipo: "Quesitos e assistente técnico", fundamento: "art. 465, § 1º, CPC", dias: 5, teor: "Designo perícia técnica. Intimem-se as partes para apresentar quesitos e indicar assistente técnico em 5 (cinco) dias." } },
  { titulo: "Laudo pericial", descricao: "Laudo técnico juntado aos autos", autor: "juizo", fase: "Instrução", documento: { nome: "Laudo pericial.docx", paginas: 22, texto: "O perito vistoriou o local de trabalho, ouviu as partes e analisou os documentos. Conclusão: as condições descritas na inicial foram parcialmente confirmadas, conforme as respostas aos quesitos." }, prazo: { para: "ambos", tipo: "Manifestação sobre laudo pericial", fundamento: null, dias: 10, teor: "Manifestem-se as partes sobre o laudo pericial, no prazo comum de 10 (dez) dias." } },
  { titulo: "Audiência de instrução", descricao: "Ouvidas as partes e duas testemunhas; encerrada a instrução", autor: "juizo", audiencia: "Instrução e julgamento", fase: "Concluso para sentença", prazo: { para: "ambos", tipo: "Razões finais", fundamento: "art. 850, CLT", dias: 5, teor: "Encerrada a instrução. Razões finais escritas no prazo de 5 (cinco) dias." } },
  { titulo: "Sentença", descricao: "Reclamação julgada parcialmente procedente", autor: "juizo", fase: "Sentença", documento: { nome: "Sentença.docx", paginas: 9, texto: "Vistos. {a} move reclamação trabalhista contra {r}. Rejeitada a conciliação, a reclamada apresentou defesa. Instrução encerrada. DECIDO. JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar a reclamada ao pagamento de {parcial}, a liquidar, com juros e correção monetária. Custas pela reclamada." }, prazo: { para: "ambos", tipo: "Recurso ordinário", fundamento: "art. 895, I, CLT", dias: 8, teor: "Publicada a sentença. Intimem-se as partes." } },
  { titulo: "Recurso ordinário", descricao: "{r} recorre ao TRT da 12ª Região", autor: "partes", fase: "Recurso · TRT12", prazo: { para: "ativo", tipo: "Contrarrazões ao recurso ordinário", fundamento: "art. 900, CLT", dias: 8, teor: "Intime-se a parte recorrida para contrarrazões no prazo de 8 (oito) dias." } },
  { titulo: "Acórdão", descricao: "TRT12 nega provimento ao recurso", autor: "juizo" },
  { ...TRANSITO, fase: "Liquidação" },
  { titulo: "Homologação de cálculos", descricao: "Homologados os cálculos de liquidação", autor: "juizo" },
  { titulo: "Alvará", descricao: "Liberado o crédito à parte reclamante", autor: "cartorio", alvara: "Crédito trabalhista liberado" },
  ARQUIVAMENTO("Execução extinta; autos arquivados"),
];
const TRABALHISTA_ACORDO: Passo[] = [
  ...TRABALHO_INICIO,
  { titulo: "Audiência inicial", descricao: "Acordo homologado: {parcial} em {parcelas} parcelas", autor: "juizo", audiencia: "Inicial", fase: "Acordo · parcelas" },
  { titulo: "Pagamento de parcela", descricao: "Comprovado o pagamento da 1ª parcela do acordo", autor: "partes", alvara: "Acordo homologado · 1ª parcela" },
  { titulo: "Pagamento de parcela", descricao: "Comprovado o pagamento da última parcela", autor: "partes" },
  ARQUIVAMENTO("Acordo cumprido; autos arquivados"),
];

const PREVIDENCIARIO: Passo[] = [
  DISTRIBUICAO("Petição inicial · {assunto}", "{a} pede a concessão de {detalhe}. O pedido foi negado pelo INSS na via administrativa. Junta o indeferimento, o CNIS, a carteira de trabalho e os documentos médicos. Valor da causa: {valor}."),
  { titulo: "Despacho", descricao: "Citado o INSS; designada perícia médica", autor: "juizo" },
  { titulo: "Contestação", descricao: "INSS sustenta que não há direito ao benefício", autor: "partes", prazo: { ...REPLICA, teor: "Fica a parte autora intimada a se manifestar, no prazo de 15 (quinze) dias, sobre a contestação apresentada pelo INSS." } },
  { titulo: "Perícia médica", descricao: "Perícia realizada na Justiça Federal", autor: "cartorio", fase: "Perícia" },
  { titulo: "Laudo pericial", descricao: "Laudo pericial juntado", autor: "juizo", fase: "Concluso para sentença", documento: { nome: "Laudo pericial.docx", paginas: 6, texto: "Laudo médico pericial. O perito examinou a parte autora e analisou os exames apresentados. Conclusão: há incapacidade para a atividade habitual, com início fixado na data do requerimento administrativo." }, prazo: { para: "ativo", tipo: "Manifestação sobre laudo pericial", fundamento: null, dias: 10, teor: "Intimem-se as partes sobre o laudo pericial, no prazo de 10 (dez) dias." } },
  { titulo: "Sentença", descricao: "Pedido julgado procedente; benefício concedido desde a DER", autor: "juizo", fase: "Sentença", documento: { nome: "Sentença.docx", paginas: 5, texto: "Dispensado o relatório. Os documentos e a prova pericial demonstram o preenchimento dos requisitos. JULGO PROCEDENTE o pedido para condenar o INSS a conceder {detalhe} desde a data do requerimento administrativo, com os atrasados corrigidos. Sem custas e honorários nesta instância." }, prazo: RECURSO_INOMINADO },
  { titulo: "Recurso inominado", descricao: "INSS recorre à Turma Recursal", autor: "partes", fase: "Recurso · Turma Recursal", prazo: CONTRARRAZOES_INOMINADO },
  { titulo: "Acórdão", descricao: "Turma Recursal nega provimento ao recurso do INSS", autor: "juizo" },
  TRANSITO,
  { titulo: "Implantação do benefício", descricao: "INSS comprova a implantação do benefício", autor: "partes", fase: "Requisição de pagamento" },
  { titulo: "RPV", descricao: "Expedida requisição de pequeno valor (RPV)", autor: "cartorio", alvara: "RPV · atrasados do benefício" },
  ARQUIVAMENTO("RPV paga; autos arquivados"),
];

const FAMILIA_INICIO: Passo[] = [
  DISTRIBUICAO("Petição inicial · {assunto}", "{a} propõe ação de {detalhe} contra {r}. Expõe a situação da família, junta certidões e comprovantes de renda e pede a fixação do que é justo para as partes e os filhos."),
  { titulo: "Decisão", descricao: "Fixados alimentos provisórios; designada sessão de mediação", autor: "juizo" },
  { titulo: "Citação", descricao: "Parte requerida citada por oficial de justiça", autor: "cartorio", fase: "Mediação" },
];
const FAMILIA: Passo[] = [
  ...FAMILIA_INICIO,
  { titulo: "Sessão de mediação", descricao: "Sem acordo na sessão do CEJUSC", autor: "juizo", audiencia: "Mediação", fase: "Contestação" },
  { titulo: "Contestação", descricao: "{r} apresenta contestação", autor: "partes", prazo: REPLICA },
  { titulo: "Estudo social", descricao: "Juntado o estudo social", autor: "juizo", fase: "Instrução", documento: { nome: "Estudo social.docx", paginas: 5, texto: "A assistente social entrevistou as partes e visitou as duas residências. Descreve a rotina dos filhos e a condição financeira de cada um e faz as suas recomendações ao juízo." }, prazo: { para: "ambos", tipo: "Manifestação sobre estudo social", fundamento: null, dias: 15, teor: "Juntado o estudo social, manifestem-se as partes em 15 (quinze) dias." } },
  { titulo: "Parecer do Ministério Público", descricao: "Ministério Público opina pela procedência parcial", autor: "partes", fase: "Concluso para sentença" },
  { titulo: "Sentença", descricao: "Pedido julgado parcialmente procedente", autor: "juizo", fase: "Sentença", documento: { nome: "Sentença.docx", paginas: 6, texto: "Vistos. Processo em segredo de justiça. Ouvido o Ministério Público e considerado o estudo social, JULGO PARCIALMENTE PROCEDENTE o pedido, nos termos da fundamentação, que preserva o interesse dos filhos e a capacidade de cada parte." }, prazo: APELACAO },
  TRANSITO,
  ARQUIVAMENTO("Autos arquivados"),
];
const FAMILIA_ACORDO: Passo[] = [
  ...FAMILIA_INICIO,
  { titulo: "Sessão de mediação", descricao: "Acordo entre as partes na sessão do CEJUSC", autor: "juizo", audiencia: "Mediação", fase: "Homologação do acordo" },
  { titulo: "Sentença", descricao: "Homologado o acordo das partes", autor: "juizo", documento: { nome: "Sentença homologatória.docx", paginas: 2, texto: "Homologo, para que produza seus efeitos, o acordo celebrado pelas partes na sessão de mediação, com parecer favorável do Ministério Público. Julgo extinto o processo, com resolução do mérito." } },
  TRANSITO,
  ARQUIVAMENTO("Autos arquivados"),
];

const EXECUCAO: Passo[] = [
  DISTRIBUICAO("Execução de título extrajudicial · {assunto}", "{a} executa {r} com base em {detalhe}, no total de {valor}, com memória de cálculo atualizada. Pede a citação para pagamento em 3 dias, sob pena de penhora."),
  { titulo: "Despacho", descricao: "Cite-se para pagar em 3 dias; honorários fixados em 10%", autor: "juizo" },
  { titulo: "Citação", descricao: "Parte executada citada; não pagou nem indicou bens", autor: "cartorio", fase: "Penhora", prazo: { para: "ativo", tipo: "Indicar bens à penhora", fundamento: null, dias: 15, teor: "Intime-se a parte exequente para indicar bens passíveis de penhora, no prazo de 15 (quinze) dias." } },
  { titulo: "Penhora on-line", descricao: "Bloqueio parcial via Sisbajud", autor: "juizo" },
  { titulo: "Embargos à execução", descricao: "{r} opõe embargos à execução", autor: "partes", fase: "Embargos", prazo: { para: "ativo", tipo: "Impugnação aos embargos", fundamento: "art. 920, I, CPC", dias: 15, teor: "Intime-se a parte embargada para responder aos embargos, em 15 (quinze) dias." } },
  { titulo: "Sentença dos embargos", descricao: "Embargos rejeitados", autor: "juizo", fase: "Expropriação" },
  { titulo: "Alvará", descricao: "Expedido alvará do valor bloqueado", autor: "cartorio", alvara: "Valor bloqueado via Sisbajud" },
  { titulo: "Acordo", descricao: "Acordo para pagamento do saldo em {parcelas} parcelas", autor: "partes", fase: "Acordo · parcelas", fim: "suspenso" },
  { titulo: "Extinção", descricao: "Execução extinta pelo pagamento", autor: "juizo" },
  ARQUIVAMENTO("Autos arquivados"),
];

const FISCAL: Passo[] = [
  { ...DISTRIBUICAO("Execução fiscal · {assunto}", ""), documento: { nome: "Certidão de dívida ativa.docx", paginas: 3, texto: "{a} executa {r} com base na certidão de dívida ativa de {detalhe}, no valor de {valor}, com juros, multa e correção monetária." } },
  { titulo: "Citação", descricao: "Executada citada por carta", autor: "cartorio", fase: "Defesa", prazo: { para: "passivo", tipo: "Embargos à execução fiscal", fundamento: "art. 16, Lei 6.830/80", dias: 30, teor: "Cite-se a executada para pagar ou garantir a execução em 5 (cinco) dias. Garantido o juízo, abre-se o prazo de 30 (trinta) dias para embargos." } },
  { titulo: "Exceção de pré-executividade", descricao: "{r} alega prescrição de parte dos créditos", autor: "partes", fase: "Exceção de pré-executividade" },
  { titulo: "Manifestação da Fazenda", descricao: "{a} concorda em excluir os créditos prescritos", autor: "partes" },
  { titulo: "Decisão", descricao: "Acolhida em parte a exceção; excluídos os créditos mais antigos", autor: "juizo" },
  { titulo: "Parcelamento", descricao: "Débito parcelado; execução suspensa", autor: "partes", fase: "Suspenso · parcelamento", fim: "suspenso" },
  { titulo: "Extinção", descricao: "Execução extinta pelo pagamento do parcelamento", autor: "juizo" },
  ARQUIVAMENTO("Autos arquivados"),
];

const CONSULTIVO: Passo[] = [
  { titulo: "Abertura do caso", descricao: "Reunião com o cliente e levantamento dos documentos", autor: "partes", fase: "Levantamento" },
  { titulo: "Minuta", descricao: "Primeira minuta enviada ao cliente", autor: "partes", fase: "Revisão do cliente", documento: { nome: "Minuta.docx", paginas: 8, texto: "Minuta preparada para {c}: {detalhe}. Versão para revisão do cliente, com os pontos em aberto destacados." } },
  { titulo: "Ajustes", descricao: "Cliente devolveu a minuta com ajustes", autor: "partes", fase: "Versão final", prazo: { para: "ambos", tipo: "Entregar a versão final ao cliente", fundamento: null, dias: 10, teor: "Combinado com o cliente na reunião.", manual: true } },
  { titulo: "Versão final", descricao: "Versão final aprovada pelo cliente", autor: "partes", fase: "Assinatura" },
  { titulo: "Assinatura", descricao: "Documento assinado pelas partes", autor: "partes", fase: "Registro" },
  { titulo: "Registro", descricao: "Protocolado no órgão de registro", autor: "cartorio" },
  { titulo: "Concluído", descricao: "Caso concluído e entregue ao cliente", autor: "cartorio", fase: "Concluído", fim: "encerrado" },
];

interface Assunto {
  assunto: string;
  /** Como o assunto entra nos textos ("a aposentadoria por idade"). */
  detalhe: string;
  valor: [number, number] | null;
}
const as = (assunto: string, detalhe: string, valor: [number, number] | null): Assunto => ({ assunto, detalhe, valor });

type Justica = "tjsc" | "trt" | "trf" | "nenhuma";
type Papeis = "comum" | "trabalho" | "execucao" | "familia";
const PAPEIS: Record<Papeis, Record<Polo, Record<Genero, string>>> = {
  comum: { ativo: { m: "Autor", f: "Autora" }, passivo: { m: "Réu", f: "Ré" } },
  trabalho: { ativo: { m: "Reclamante", f: "Reclamante" }, passivo: { m: "Reclamado", f: "Reclamada" } },
  execucao: { ativo: { m: "Exequente", f: "Exequente" }, passivo: { m: "Executado", f: "Executada" } },
  familia: { ativo: { m: "Requerente", f: "Requerente" }, passivo: { m: "Requerido", f: "Requerida" } },
};

interface Area {
  chave: "civel" | "juizado" | "trabalhista" | "previdenciario" | "familia" | "execucao" | "fiscal" | "consultivo";
  peso: number;
  justica: Justica;
  papeis: Papeis;
  /** Dias, em média, de um passo ao outro. */
  ritmo: number;
  responsaveis: Quem[];
  assuntos: Assunto[];
}
const AREAS: Area[] = [
  {
    chave: "civel",
    peso: 15,
    justica: "tjsc",
    papeis: "comum",
    ritmo: 55,
    responsaveis: ["beatriz", "beatriz", "rafael", "tiago"],
    assuntos: [
      as("Acidente de trânsito · danos materiais e morais", "o acidente de trânsito causado pela parte ré", [30000, 180000]),
      as("Indenização por danos morais", "os danos morais sofridos", [15000, 60000]),
      as("Cobrança · prestação de serviços", "a cobrança de serviços prestados e não pagos", [20000, 140000]),
      as("Despejo por falta de pagamento", "o despejo por falta de pagamento e a cobrança dos aluguéis", [18000, 70000]),
      as("Rescisão contratual · devolução de valores", "a rescisão do contrato e a devolução dos valores pagos", [25000, 200000]),
      as("Vício construtivo · imóvel novo", "os vícios construtivos no imóvel novo", [40000, 260000]),
      as("Usucapião extraordinária", "a usucapião do imóvel ocupado há mais de 15 anos", [80000, 350000]),
    ],
  },
  {
    chave: "juizado",
    peso: 14,
    justica: "tjsc",
    papeis: "comum",
    ritmo: 32,
    responsaveis: ["rafael", "rafael", "camila", "tiago"],
    assuntos: [],
  },
  {
    chave: "trabalhista",
    peso: 18,
    justica: "trt",
    papeis: "trabalho",
    ritmo: 42,
    responsaveis: ["tiago", "tiago", "rafael"],
    assuntos: [
      as("Horas extras e intervalo intrajornada", "horas extras e o intervalo intrajornada não concedido", [25000, 120000]),
      as("Verbas rescisórias", "as verbas rescisórias não pagas e a multa do art. 477 da CLT", [12000, 45000]),
      as("Reconhecimento de vínculo de emprego", "o reconhecimento do vínculo de emprego e a anotação na carteira", [30000, 110000]),
      as("Adicional de insalubridade", "o adicional de insalubridade em grau máximo", [20000, 70000]),
      as("Acidente de trabalho · indenização", "indenização pelo acidente de trabalho e a estabilidade acidentária", [60000, 220000]),
      as("Equiparação salarial", "a equiparação salarial com colega da mesma função", [25000, 90000]),
      as("Rescisão indireta", "a rescisão indireta do contrato pelas faltas do empregador", [20000, 80000]),
    ],
  },
  {
    chave: "previdenciario",
    peso: 16,
    justica: "trf",
    papeis: "comum",
    ritmo: 40,
    responsaveis: ["tiago", "beatriz", "camila"],
    assuntos: [
      as("Aposentadoria por idade", "aposentadoria por idade", [15000, 70000]),
      as("Aposentadoria por tempo de contribuição", "aposentadoria por tempo de contribuição, com o reconhecimento de período rural", [30000, 90000]),
      as("Auxílio por incapacidade temporária", "auxílio por incapacidade temporária", [8000, 30000]),
      as("Aposentadoria por incapacidade permanente", "aposentadoria por incapacidade permanente", [25000, 80000]),
      as("Benefício assistencial (BPC/LOAS)", "benefício assistencial à pessoa com deficiência (BPC/LOAS)", [12000, 50000]),
      as("Pensão por morte", "pensão por morte do companheiro", [20000, 75000]),
      as("Aposentadoria especial", "aposentadoria especial pelo tempo de exposição a agentes nocivos", [35000, 95000]),
    ],
  },
  {
    chave: "familia",
    peso: 10,
    justica: "tjsc",
    papeis: "familia",
    ritmo: 40,
    responsaveis: ["beatriz", "beatriz", "camila"],
    assuntos: [
      as("Divórcio litigioso", "divórcio litigioso com partilha de bens", null),
      as("Alimentos", "alimentos para os filhos", [9000, 36000]),
      as("Guarda e regulamentação de visitas", "guarda e regulamentação de visitas", null),
      as("Revisão de alimentos", "revisão de alimentos", [7000, 30000]),
      as("Reconhecimento e dissolução de união estável", "reconhecimento e dissolução de união estável", [60000, 400000]),
    ],
  },
  {
    chave: "execucao",
    peso: 9,
    justica: "tjsc",
    papeis: "execucao",
    ritmo: 55,
    responsaveis: ["camila", "rafael", "beatriz"],
    assuntos: [
      as("Duplicatas mercantis", "duplicatas mercantis aceitas e não pagas", [8000, 90000]),
      as("Confissão de dívida", "contrato de confissão de dívida assinado por duas testemunhas", [15000, 220000]),
      as("Cheques devolvidos", "cheques devolvidos por falta de fundos", [5000, 40000]),
      as("Nota promissória", "nota promissória vencida e não paga", [10000, 80000]),
      as("Aluguéis em atraso", "contrato de locação com aluguéis em atraso", [9000, 45000]),
    ],
  },
  {
    chave: "fiscal",
    peso: 5,
    justica: "tjsc",
    papeis: "execucao",
    ritmo: 80,
    responsaveis: ["rafael"],
    assuntos: [
      as("ISS", "ISS sobre serviços prestados de 2020 a 2022", [12000, 160000]),
      as("IPTU e taxas", "IPTU e taxa de coleta de lixo de 2019 a 2023", [6000, 40000]),
      as("ICMS · diferencial de alíquota", "ICMS-diferencial de alíquota de 2021", [30000, 280000]),
      as("Multa administrativa", "multa aplicada pela vigilância sanitária em 2022", [8000, 30000]),
    ],
  },
  {
    chave: "consultivo",
    peso: 7,
    justica: "nenhuma",
    papeis: "comum",
    ritmo: 10,
    responsaveis: ["rafael", "beatriz"],
    assuntos: [
      as("Alteração do contrato social", "alteração do contrato social para a entrada de um novo sócio", null),
      as("Acordo de sócios", "acordo de sócios com regras de saída e sucessão", null),
      as("Revisão de contratos com fornecedores", "revisão dos contratos com os principais fornecedores", null),
      as("Inventário extrajudicial", "inventário extrajudicial em cartório, com todos os herdeiros de acordo", null),
      as("Notificação extrajudicial · cobrança", "notificação extrajudicial para cobrança de valores em atraso", null),
      as("Registro de marca", "pedido de registro da marca da empresa", null),
    ],
  },
];

const ATENDE: Record<Area["chave"], string[]> = {
  civel: ["Cliente pediu notícias do processo. Expliquei a fase atual e o próximo passo.", "Assinou a procuração e o contrato de honorários.", "Mandou por WhatsApp os comprovantes que faltavam.", "Expliquei a sentença e as chances do recurso.", "Reunião para preparar a audiência: repassamos as perguntas mais prováveis."],
  juizado: ["Mandou os protocolos de atendimento e as faturas contestadas.", "Testou o link da sessão de conciliação por vídeo.", "Expliquei a sentença e o valor da indenização.", "Avisei que o depósito da condenação saiu e que o alvará foi pedido."],
  trabalhista: ["Mandou fotos dos controles de ponto e o nome de duas testemunhas.", "Expliquei como funciona a audiência inicial e a chance de acordo.", "Cliente perguntou quando recebe. Expliquei a fase de liquidação.", "Conferimos juntos os recibos de pagamento dos últimos dois anos."],
  previdenciario: ["Pedi o CNIS e a carteira de trabalho antiga para conferir os vínculos.", "Cliente trouxe os laudos novos do médico para a perícia.", "Expliquei como vai ser a perícia médica e o que levar.", "Avisei que o benefício foi implantado e quando cai o primeiro pagamento."],
  familia: ["Conversamos sobre a proposta de acordo da outra parte para a pensão.", "Cliente contou que a pensão deste mês atrasou.", "Preparação para a sessão de mediação no CEJUSC.", "Expliquei o estudo social e como vai ser a visita da assistente social."],
  execucao: ["Informou um imóvel do devedor para pedirmos a penhora.", "Aprovou a proposta de acordo em parcelas.", "Expliquei o bloqueio pelo Sisbajud e o prazo do alvará."],
  fiscal: ["Contador da empresa enviou as guias do parcelamento.", "Reunião com o financeiro sobre a exceção de pré-executividade.", "Expliquei o que muda com o parcelamento e o que acontece se atrasar."],
  consultivo: ["Reunião para revisar a minuta.", "Cliente aprovou a versão final por e-mail.", "Enviei a minuta com os pontos em aberto destacados."],
};
const CONSULTAS = [
  "Consulta sobre o contrato de aluguel. Orientei a guardar os comprovantes e aguardar a proposta do locador.",
  "Consulta sobre o inventário do pai. Expliquei o caminho do inventário em cartório, se todos os herdeiros concordarem.",
  "Dúvida sobre rescisão de contrato de trabalho. Por enquanto não há o que cobrar; ficou de voltar se não receber as verbas.",
  "Consulta sobre aposentadoria. Pedi o CNIS para fazer a contagem do tempo de contribuição.",
  "Orientação sobre um cliente que não pagou. Vai tentar um acordo antes de entrar com a ação.",
  "Consulta sobre pensão alimentícia. Expliquei como funciona a revisão e quais documentos trazer.",
];
const TAREFAS_GERAIS: [string, string][] = [
  ["Ligar para o cliente", "explicar a última movimentação"],
  ["Pedir documentos ao cliente", "comprovante de residência atualizado e RG"],
  ["Conferir cálculos", "planilha da contadoria"],
  ["Agendar reunião com o cliente", "para preparar a próxima etapa"],
  ["Pedir certidão de objeto e pé", "o cliente precisa levar ao banco"],
  ["Atualizar o cálculo do débito", "com a correção até este mês"],
  ["Enviar resumo do processo ao cliente", "por WhatsApp, em linguagem simples"],
  ["Confirmar as testemunhas", "endereço e telefone de cada uma"],
  ["Revisar contrato de honorários", "cliente pediu para parcelar"],
  ["Conferir guia de custas", "vencimento e código de barras"],
];

const HORAS = ["09:00", "09:30", "10:00", "10:30", "13:30", "14:00", "14:30", "15:00", "16:00"];

const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
/** "Aposentadoria por idade" → "aposentadoria por idade"; siglas ficam como estão. */
const minuscula = (t: string) => (/^\p{Lu}\p{Ll}/u.test(t) ? t[0]!.toLocaleLowerCase("pt-BR") + t.slice(1) : t);
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
/** Dias corridos → dias úteis, de longe (o motor de prazos acerta a data). */
const uteis = (corridos: number) => Math.round((corridos * 5) / 7);

interface Pessoa {
  nome: string;
  genero: Genero;
  tipo: "pf" | "pj";
  /** Da empresa: "Três Rios". */
  fantasia?: string;
}

export function gerarVolume(hoje: Dia): Volume {
  const s = sorteio(20261029);
  const v: Volume = { clientes: {}, processos: {}, prazos: [], audiencias: [], publicacoes: [], tarefas: [], alvaras: [], atendimentos: [] };

  // Nomes e documentos que não se repetem (nem com os da demonstração principal).
  const nomes = new Set(Object.values(CLIENTES).map((c) => c.nome));
  const documentos = new Set(Object.values(CLIENTES).map((c) => c.base));
  const numeros = new Set(Object.values(PROCESSOS).flatMap((p) => (p.numero ? [`${p.numero[0]}.${p.numero[2]}.${p.numero[3]}`] : [])));

  const pessoaFisica = (genero?: Genero): Pessoa => {
    for (;;) {
      const g = genero ?? (s.chance(0.5) ? "f" : "m");
      const sobrenome = s.chance(0.4) ? `${s.um(SOBRENOMES)} ${s.um(SOBRENOMES)}` : s.um(SOBRENOMES);
      const nome = `${s.um(g === "f" ? NOMES_F : NOMES_M)} ${sobrenome}`;
      if (new Set(nome.split(" ")).size < nome.split(" ").length || nomes.has(nome)) continue;
      nomes.add(nome);
      return { nome, genero: g, tipo: "pf" };
    }
  };
  const empresa = (): Pessoa => {
    for (;;) {
      const fantasia = s.um(FANTASIA);
      const nome = `${s.um(RAMOS)} ${fantasia} ${s.chance(0.15) ? "S.A." : "Ltda."}`;
      if (nomes.has(nome)) continue;
      nomes.add(nome);
      return { nome, genero: "f", tipo: "pj", fantasia };
    }
  };
  const base = (tipo: "pf" | "pj") => {
    for (;;) {
      const b = tipo === "pf" ? String(s.entre(100_000_000, 899_999_999)) : `${s.entre(10_000_000, 79_999_999)}0001`;
      if (documentos.has(b)) continue;
      documentos.add(b);
      return b;
    }
  };

  // Clientes: gente e empresas; algumas empresas têm vários processos.
  interface ClienteGerado extends Pessoa {
    chave: string;
    comarca: Comarca;
    processos: number;
  }
  const pf: ClienteGerado[] = [];
  const pj: ClienteGerado[] = [];
  const novoCliente = (p: Pessoa): ClienteGerado => {
    const comarca = s.pesado(COMARCAS);
    const chave = `v${String(pf.length + pj.length + 1).padStart(3, "0")}`;
    const c: ClienteDemo = {
      nome: p.nome,
      tipo: p.tipo,
      base: base(p.tipo),
      telefone: p.tipo === "pf" ? `${comarca.ddd}9${s.entre(8100, 9999)}${String(s.entre(0, 9999)).padStart(4, "0")}` : `${comarca.ddd}3${s.entre(300, 499)}${String(s.entre(0, 9999)).padStart(4, "0")}`,
      email: p.fantasia ? `financeiro.${semAcento(p.fantasia)}@exemplo.com.br` : s.chance(0.6) ? `${semAcento(p.nome.split(" ")[0]!)}.${semAcento(p.nome.split(" ").pop()!)}@exemplo.com.br` : undefined,
      endereco: p.tipo === "pj" || s.chance(0.55) ? `${s.um(RUAS)}, ${s.entre(12, 3400)}${p.tipo === "pf" && s.chance(0.25) ? `, apto ${s.entre(1, 12)}0${s.entre(1, 4)}` : ""} · ${s.um(comarca.bairros)} · ${comarca.nome}/SC` : undefined,
    };
    v.clientes[chave] = c;
    const g = { ...p, chave, comarca, processos: 0 };
    (p.tipo === "pf" ? pf : pj).push(g);
    return g;
  };
  for (let i = 0; i < 92; i++) novoCliente(pessoaFisica());
  for (let i = 0; i < 16; i++) novoCliente(empresa());
  const livre = (lista: ClienteGerado[]) => lista.find((c) => c.processos === 0);
  const pegarPf = () => (s.chance(0.12) ? s.um(pf.filter((c) => c.processos > 0).concat(pf)) : (livre(pf) ?? s.um(pf)));
  const pegarPj = () => (s.chance(0.55) ? s.um(pj.slice(0, 6)) : (livre(pj) ?? s.um(pj)));

  const desde = new Map<string, number>();
  let n = 0;
  for (let i = 0; i < 130; i++) {
    const area = s.pesado(AREAS.map((x) => [x, x.peso] as const));
    const chave = `p${String(++n).padStart(3, "0")}`;

    // Quem é o cliente, quem é a outra parte e de que lado cada um está.
    let polo: Polo = "ativo";
    let cliente: ClienteGerado;
    let outra: Pessoa;
    let assunto: Assunto;
    let roteiro: Passo[];
    if (area.chave === "juizado") {
      const g = s.um(GRANDES);
      const [nome, detalhe] = s.um(g.assuntos);
      assunto = as(nome, detalhe, [6000, 40000]);
      cliente = pegarPf();
      outra = { nome: g.nome, genero: "f", tipo: "pj" };
      roteiro = JUIZADO;
    } else {
      assunto = s.um(area.assuntos);
      roteiro = { civel: CIVEL, trabalhista: s.chance(0.25) ? TRABALHISTA_ACORDO : TRABALHISTA, previdenciario: PREVIDENCIARIO, familia: s.chance(0.4) ? FAMILIA_ACORDO : FAMILIA, execucao: EXECUCAO, fiscal: FISCAL, consultivo: CONSULTIVO }[area.chave];
      if (area.chave === "trabalhista") {
        polo = s.chance(0.65) ? "ativo" : "passivo";
        cliente = polo === "ativo" ? pegarPf() : pegarPj();
        outra = polo === "ativo" ? empresa() : pessoaFisica();
      } else if (area.chave === "previdenciario") {
        cliente = pegarPf();
        outra = { nome: "Instituto Nacional do Seguro Social", genero: "m", tipo: "pj" };
      } else if (area.chave === "familia") {
        polo = s.chance(0.75) ? "ativo" : "passivo";
        cliente = pegarPf();
        outra = pessoaFisica(cliente.genero === "f" ? "m" : "f");
      } else if (area.chave === "execucao") {
        cliente = s.chance(0.7) ? pegarPj() : pegarPf();
        outra = s.chance(0.5) ? empresa() : pessoaFisica();
      } else if (area.chave === "fiscal") {
        polo = "passivo";
        cliente = pegarPj();
        outra = assunto.assunto.startsWith("ICMS") ? { nome: "Estado de Santa Catarina", genero: "m", tipo: "pj" } : { nome: `Município de ${cliente.comarca.nome}`, genero: "m", tipo: "pj" };
      } else if (area.chave === "consultivo") {
        cliente = s.chance(0.7) ? pegarPj() : pegarPf();
        outra = { nome: assunto.assunto.startsWith("Inventário") ? "Herdeiros" : assunto.assunto.startsWith("Notificação") ? "Devedor notificado" : assunto.assunto.startsWith("Registro") ? "INPI" : "Sócios e contratantes", genero: "m", tipo: "pj" };
      } else {
        polo = s.chance(0.8) ? "ativo" : "passivo";
        cliente = s.chance(0.25) ? pegarPj() : pegarPf();
        outra = s.chance(0.65) ? empresa() : pessoaFisica();
      }
    }
    cliente.processos++;
    const comarca = cliente.comarca;
    const ativo = polo === "ativo" ? cliente : outra;
    const passivo = polo === "ativo" ? outra : cliente;
    const valor = assunto.valor ? Math.round(s.entre(assunto.valor[0], assunto.valor[1]) / 100) * 100 : null;
    const textos = (t: string) =>
      t
        .replaceAll("{a}", ativo.nome)
        .replaceAll("{r}", passivo.nome)
        .replaceAll("{c}", cliente.nome)
        .replaceAll("{assunto}", minuscula(assunto.assunto))
        .replaceAll("{detalhe}", assunto.detalhe)
        .replaceAll("{valor}", valor ? reais(valor) : "a estimar")
        .replaceAll("{parcial}", reais(Math.round(((valor ?? 20000) * s.entre(35, 80)) / 10000) * 100))
        .replaceAll("{parcelas}", String(s.entre(3, 10)));

    // Até onde o processo andou. Parte deles para logo antes de uma audiência
    // ou logo depois de uma intimação com prazo, para a agenda ter o que mostrar.
    const aplica = (p?: PrazoDoPasso) => !!p && (p.para === "ambos" || p.para === polo);
    const D = Math.round(15 + Math.pow(s.r(), 1.5) * 1450);
    const kMax = Math.min(roteiro.length, 1 + Math.floor(D / area.ritmo));
    const etapa = (quer: (k: number) => boolean) => {
      for (let k = kMax; k >= Math.max(2, kMax - 6); k--) if (quer(k)) return k;
      return null;
    };
    const foco = s.r();
    const k =
      (foco < 0.3 ? etapa((k) => !!roteiro[k]?.audiencia) : foco < 0.65 ? etapa((k) => aplica(roteiro[k - 1]!.prazo) && roteiro[k - 1]!.prazo!.dias >= 8) : null) ??
      s.entre(Math.max(1, kMax - 3), kMax);
    const ultimo = roteiro[k - 1]!;
    const situacao = ultimo.fim ?? "ativo";
    const responsavel = s.chance(0.04) ? null : s.um(area.responsaveis);

    // Quando foi o último passo: a intimação do prazo aberto, ou dias atrás.
    let L = situacao === "ativo" ? s.entre(4, 70) : situacao === "suspenso" ? s.entre(30, 150) : s.entre(15, 300);
    let aberto: { fim: number; p: PrazoDoPasso } | null = null;
    if (situacao === "ativo" && aplica(ultimo.prazo) && ultimo.prazo!.dias >= 8 && s.chance(0.9)) {
      const fim = s.entre(6, ultimo.prazo!.dias - 2);
      const quando = Math.round(((ultimo.prazo!.dias + 1 - fim) * 7) / 5) - 1;
      if (quando < D - k * 3) {
        aberto = { fim, p: ultimo.prazo! };
        L = Math.max(2, quando);
      }
    }
    L = Math.max(2, Math.min(L, D - 1 - (k - 1) * 3));

    // As datas dos passos, da distribuição até o último.
    const antes: number[] = [];
    for (let j = 0; j < k; j++) {
      if (j === 0) antes.push(D - 1);
      else if (j === k - 1) antes.push(L);
      else {
        const alvo = Math.round(D - 1 - ((D - 1 - L) * j) / (k - 1) + s.entre(-4, 4));
        antes.push(Math.max(L + (k - 1 - j), Math.min(antes[j - 1]! - 1, alvo)));
      }
    }

    let evento = 1;
    const movimentacoes: MovimentacaoDemo[] = roteiro.slice(0, k).map((passo, j) => {
      const m: MovimentacaoDemo = { antes: antes[j]!, evento, titulo: passo.titulo, descricao: textos(passo.descricao), autor: passo.autor };
      if (passo.documento) m.documento = { nome: passo.documento.nome, paginas: Math.max(1, passo.documento.paginas + s.entre(-2, 4)), texto: textos(passo.documento.texto) };
      evento += s.entre(1, 6);
      return m;
    });

    const judicial = area.justica !== "nenhuma";
    let numero: ProcessoDemo["numero"];
    if (judicial) {
      const [seg, trib, origem] = area.justica === "trt" ? ["5", "12", comarca.trt] : area.justica === "trf" ? ["4", "04", comarca.trf] : ["8", "24", comarca.tjsc];
      let seq: string;
      do seq = area.justica === "trt" ? `000${s.entre(1000, 2999)}` : `50${s.entre(10000, 39999)}`;
      while (numeros.has(`${seq}.${seg}.${trib}`));
      numeros.add(`${seq}.${seg}.${trib}`);
      numero = [seq, somarDias(hoje, -D).slice(0, 4), seg, trib, origem];
    }
    const vara = (tipo: string) => (comarca.varas > 1 ? `${s.entre(1, comarca.varas)}ª ${tipo}` : tipo);
    const orgao = { civel: vara("Vara Cível"), juizado: "Juizado Especial Cível", trabalhista: vara("Vara do Trabalho"), previdenciario: "Juizado Especial Federal", familia: vara("Vara da Família"), execucao: vara("Vara Cível"), fiscal: "Vara da Fazenda Pública", consultivo: undefined }[area.chave];
    const classe = {
      civel: "Procedimento comum cível",
      juizado: "Procedimento do Juizado Especial Cível",
      trabalhista: valor && valor <= 40000 ? "Ação trabalhista · rito sumaríssimo" : "Ação trabalhista · rito ordinário",
      previdenciario: "Procedimento do Juizado Especial Cível",
      familia: assunto.assunto,
      execucao: "Execução de título extrajudicial",
      fiscal: "Execução fiscal",
      consultivo: "Consultivo",
    }[area.chave];
    const papel = (quem: Pessoa, lado: Polo) => PAPEIS[area.papeis][lado][quem.genero];
    v.processos[chave] = {
      cliente: cliente.chave,
      titulo: judicial ? `${ativo.nome} × ${passivo.nome}` : `${cliente.nome} · ${minuscula(assunto.assunto)}`,
      numero,
      tipo: judicial ? "judicial" : "extrajudicial",
      tribunal: judicial ? { tjsc: "TJSC", trt: "TRT12", trf: "TRF4" }[area.justica as "tjsc" | "trt" | "trf"] : undefined,
      classe,
      assunto: assunto.assunto,
      orgao,
      comarca: judicial ? comarca.nome : undefined,
      sistema: judicial ? (area.justica === "trt" ? "PJe" : "eproc") : undefined,
      valor: valor ?? undefined,
      poloCliente: polo,
      papelCliente: judicial ? papel(cliente, polo) : "Cliente",
      outraParte: { nome: outra.nome, papel: judicial ? papel(outra, polo === "ativo" ? "passivo" : "ativo") : "—", tipo: outra.tipo },
      responsavel,
      fase: roteiro.slice(0, k).reverse().find((p) => p.fase)?.fase,
      distribuidoHa: D,
      situacao,
      segredo: area.chave === "familia" || undefined,
      movimentacoes,
    };
    desde.set(cliente.chave, Math.max(desde.get(cliente.chave) ?? 0, D + s.entre(3, 40)));

    // Prazos que ficaram para trás (cumpridos) e o da última intimação (aberto).
    roteiro.slice(0, k).forEach((passo, j) => {
      if (!aplica(passo.prazo) || (aberto && j === k - 1)) return;
      const p = passo.prazo!;
      const fim = p.dias + 1 - uteis(antes[j]! + 1);
      if (fim > -2 || !s.chance(0.85)) return;
      v.prazos.push({ processo: chave, tipo: p.tipo, fundamento: p.fundamento, dias: p.dias, fim, responsavel, estado: "cumprido", fonte: p.manual || s.chance(0.25) ? "manual" : "djen", teor: p.teor });
    });
    if (aberto) v.prazos.push({ processo: chave, tipo: aberto.p.tipo, fundamento: aberto.p.fundamento, dias: aberto.p.dias, fim: aberto.fim, responsavel, estado: "confirmado", fonte: aberto.p.manual ? "manual" : "djen", teor: aberto.p.teor });

    // Audiências: as que já aconteceram e a próxima, se o processo chegou nela.
    const quemVai: Quem = responsavel ?? "camila";
    const local = (tipo: string, porVideo: boolean) =>
      porVideo
        ? "Videoconferência · link no processo"
        : tipo === "Mediação"
          ? `CEJUSC de ${comarca.nome}`
          : area.justica === "trt"
            ? `${orgao} de ${comarca.nome}`
            : area.justica === "trf"
              ? `Justiça Federal de ${comarca.nome}`
              : `Fórum de ${comarca.nome} · ${orgao}`;
    roteiro.slice(0, k).forEach((passo, j) => {
      if (!passo.audiencia) return;
      const porVideo = s.chance(0.45);
      v.audiencias.push({ processo: chave, dia: -Math.max(1, uteis(antes[j]! + 1)), hora: s.um(HORAS), tipo: passo.audiencia, porVideo, local: local(passo.audiencia, porVideo), responsavel: quemVai, situacao: "realizada" });
    });
    const proximo = roteiro[k];
    if (situacao === "ativo" && proximo?.audiencia && s.chance(0.9)) {
      const porVideo = s.chance(0.45);
      v.audiencias.push({ processo: chave, dia: s.entre(2, 40), hora: s.um(HORAS), tipo: proximo.audiencia, porVideo, local: local(proximo.audiencia, porVideo), responsavel: quemVai });
    }

    // Publicações já lidas: despachos e decisões sem prazo.
    roteiro.slice(0, k).forEach((passo, j) => {
      if (passo.autor !== "juizo" || passo.prazo || passo.audiencia || antes[j]! > 160 || !judicial || !s.chance(0.5)) return;
      const tipoDocumento = passo.titulo.startsWith("Sentença") ? "Sentença" : passo.titulo.startsWith("Decisão") ? "Decisão" : passo.titulo === "Acórdão" ? "Acórdão" : "Despacho";
      const descricao = textos(passo.descricao);
      v.publicacoes.push({ processo: chave, disp: Math.max(2, uteis(antes[j]! + 1)), tipoComunicacao: "Intimação", tipoDocumento, teor: `${descricao}. Intimem-se.`, situacao: "lida", sugestao: { tipo: "", dias: null, resumo: `${descricao}.`, assunto: minuscula(passo.titulo) } });
    });

    // Alvarás dos depósitos e requisições.
    roteiro.slice(0, k).forEach((passo, j) => {
      if (!passo.alvara || polo !== "ativo") return;
      const total = Math.round((valor ?? s.entre(4000, 30000)) * s.entre(30, 90)) / 100;
      const recente = antes[j]! < 25;
      const etapa = recente ? s.um(["novo", "sacado"] as const) : s.um(["repassado", "finalizado", "finalizado"] as const);
      v.alvaras.push({ processo: chave, descricao: passo.alvara, valor: total, etapa, expedidoHa: antes[j]! + 1, recebido: etapa === "novo" ? undefined : total });
    });

    // Atendimentos e tarefas.
    if (s.chance(0.55)) {
      for (let j = s.entre(1, 3); j > 0; j--) v.atendimentos.push({ cliente: cliente.chave, processo: chave, haDias: s.entre(1, Math.min(D, 400)), canal: s.pesado([["whatsapp", 8], ["telefone", 5], ["presencial", 4], ["video", 2], ["email", 1]] as const), resumo: s.um(ATENDE[area.chave]), autor: quemVai });
    }
    if (situacao === "ativo" && s.chance(0.3)) {
      const [titulo, detalhe] = s.um(TAREFAS_GERAIS);
      const feita = s.chance(0.45);
      v.tarefas.push({ titulo, detalhe, dia: feita ? -s.entre(1, 25) : s.entre(1, 20), responsavel: quemVai, processo: chave, concluida: feita || undefined });
    }
  }

  // Quem ainda não tem processo veio para uma consulta.
  for (const c of [...pf, ...pj]) {
    if (c.processos === 0) {
      v.atendimentos.push({ cliente: c.chave, haDias: s.entre(3, 500), canal: s.pesado([["presencial", 3], ["whatsapp", 3], ["telefone", 2]] as const), resumo: s.um(CONSULTAS), autor: s.um(["beatriz", "rafael", "tiago", "camila"] as const) });
    }
    v.clientes[c.chave]!.desdeHa = desde.get(c.chave) ?? s.entre(20, 900);
  }
  return v;
}
