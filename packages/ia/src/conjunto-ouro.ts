/**
 * Conjunto-ouro da IA: casos inventados (nomes, números e fatos de mentira,
 * nunca de cliente) com a resposta certa. Os vencimentos foram contados à mão,
 * no calendário, e não pelo motor: é assim que o teste pega erro no motor também.
 *
 * Para acrescentar um caso: escreva a publicação ou os autos, conte o prazo no
 * calendário do tribunal e ponha o gabarito (a resposta que a IA deveria dar).
 */
import type { CasoDePeca, CasoDePrazo, CasoDeResumo, ConjuntoOuro } from "./avaliacao.ts";
import { textoDoProcesso } from "./contexto.ts";

const sugestao = (s: Partial<CasoDePrazo["gabarito"]>): CasoDePrazo["gabarito"] => ({
  geraPrazo: true,
  tipo: "",
  dias: null,
  contagem: "uteis",
  fundamento: null,
  audiencia: null,
  resumo: "",
  assunto: "",
  trecho: "",
  recusa: null,
  ...s,
});

const PRAZOS: CasoDePrazo[] = [
  {
    id: "laudo-finados",
    sobre: "Laudo pericial, 15 dias úteis, com Finados no começo e a Consciência Negra no meio",
    tribunal: "TJSC",
    publicacao: {
      texto: "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Despacho",
      orgao: "3ª Vara Cível da Comarca de Itajaí",
      disponibilizadaEm: "2026-10-29",
    },
    // Publicada em 30/10 (sexta); 02/11 é Finados: começa em 03/11. 20/11 não conta. Vence em 24/11.
    esperado: { geraPrazo: true, ato: "laudo", dias: 15, fim: "2026-11-24" },
    gabarito: sugestao({ tipo: "Manifestação sobre laudo pericial", dias: 15, fundamento: "art. 477, § 1º, CPC", resumo: "Intimação para falar do laudo do evento 87.", assunto: "laudo pericial", trecho: "manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias" }),
  },
  {
    id: "embargos-carnaval",
    sobre: "Embargos de declaração, 5 dias úteis, com o Carnaval e a Quarta-feira de Cinzas (expediente reduzido) no começo",
    tribunal: "TJSC",
    publicacao: {
      texto: "SENTENÇA. Ante o exposto, JULGO PROCEDENTE o pedido para condenar a ré ao pagamento de R$ 12.400,00, corrigidos desde o desembolso. Condeno a ré nas custas e em honorários de 10% do valor da condenação. Publique-se. Intimem-se.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Sentença",
      orgao: "1ª Vara Cível da Comarca de Blumenau",
      disponibilizadaEm: "2026-02-12",
    },
    // Publicada em 13/02 (sexta); 16 e 17 são Carnaval e 18 tem expediente reduzido: começa em 19/02. Vence em 25/02.
    esperado: { geraPrazo: true, ato: "embargos de declara", dias: 5, fim: "2026-02-25" },
    gabarito: sugestao({ tipo: "Embargos de declaração", dias: 5, fundamento: "art. 1.023, CPC", resumo: "Sentença de procedência; prazo para embargos de declaração.", assunto: "sentença", trecho: "JULGO PROCEDENTE o pedido para condenar a ré ao pagamento de R$ 12.400,00" }),
  },
  {
    id: "apelacao-recesso",
    sobre: "Apelação, 15 dias úteis, publicada antes do recesso: só começa em 21/01 e passa pelo Carnaval de 2027",
    tribunal: "TJSC",
    publicacao: {
      texto: "SENTENÇA. Ante o exposto, JULGO IMPROCEDENTES os pedidos formulados na inicial, extinguindo o feito com resolução do mérito (art. 487, I, do CPC). Condeno a parte autora em custas e honorários de 10% do valor da causa, suspensa a exigibilidade pela gratuidade.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Sentença",
      orgao: "2ª Vara Cível da Comarca de Chapecó",
      disponibilizadaEm: "2026-12-17",
    },
    // Publicada em 18/12; recesso e suspensão até 20/01: começa em 21/01/2027. 08 e 09/02 são Carnaval; a quarta de cinzas conta no meio. Vence em 12/02/2027.
    esperado: { geraPrazo: true, ato: "apela", dias: 15, fim: "2027-02-12" },
    gabarito: sugestao({ tipo: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC", resumo: "Sentença de improcedência; cabe apelação.", assunto: "sentença", trecho: "JULGO IMPROCEDENTES os pedidos formulados na inicial" }),
  },
  {
    id: "contrarrazoes-clt",
    sobre: "Contrarrazões ao recurso ordinário na CLT, 8 dias úteis, com a Consciência Negra no meio",
    tribunal: "TRT12",
    publicacao: {
      texto: "Recebo o recurso ordinário interposto pela reclamada, pois tempestivo e preparado. Intime-se o reclamante para, querendo, apresentar contrarrazões no prazo legal. Após, remetam-se os autos ao Tribunal.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Despacho",
      orgao: "2ª Vara do Trabalho de Joinville",
      disponibilizadaEm: "2026-11-12",
    },
    // Publicada em 13/11 (sexta); começa em 16/11; 20/11 não conta. Vence em 26/11.
    esperado: { geraPrazo: true, ato: "contrarraz", dias: 8, fim: "2026-11-26" },
    gabarito: sugestao({ tipo: "Contrarrazões ao recurso ordinário", dias: 8, fundamento: "art. 900, CLT", resumo: "Recurso ordinário da reclamada recebido; prazo para contrarrazões.", assunto: "recurso ordinário", trecho: "Intime-se o reclamante para, querendo, apresentar contrarrazões no prazo legal." }),
  },
  {
    id: "contestacao-feriado-municipal",
    sobre: "Contestação, 15 dias úteis, com feriado municipal (aniversário da cidade) no primeiro dia",
    tribunal: "TJSC",
    feriadosLocais: [{ dia: "2026-03-09", nome: "Aniversário de Joinville", tipo: "local" }],
    publicacao: {
      texto: "Cite-se a parte ré para, querendo, apresentar contestação no prazo de 15 (quinze) dias úteis, sob pena de revelia, nos termos do art. 335 do CPC. Dispensada a audiência de conciliação, por manifestação expressa do autor.",
      tipoComunicacao: "Citação",
      tipoDocumento: "Despacho",
      orgao: "5ª Vara Cível da Comarca de Joinville",
      disponibilizadaEm: "2026-03-05",
    },
    // Publicada em 06/03 (sexta); 09/03 é feriado municipal: começa em 10/03. Vence em 30/03.
    esperado: { geraPrazo: true, ato: "contesta", dias: 15, fim: "2026-03-30" },
    gabarito: sugestao({ tipo: "Contestação", dias: 15, fundamento: "art. 335, CPC", resumo: "Citação para contestar em 15 dias úteis.", assunto: "citação", trecho: "apresentar contestação no prazo de 15 (quinze) dias úteis" }),
  },
  {
    id: "recurso-inominado-juizado",
    sobre: "Recurso inominado no Juizado Especial, 10 dias úteis, com a Independência no começo",
    tribunal: "TJSC",
    publicacao: {
      texto: "SENTENÇA. Dispensado o relatório (art. 38 da Lei 9.099/1995). JULGO PARCIALMENTE PROCEDENTE o pedido para condenar a ré a restituir R$ 1.890,00 ao autor. Sem custas e honorários nesta instância.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Sentença",
      orgao: "Juizado Especial Cível da Comarca de Lages",
      disponibilizadaEm: "2026-09-03",
    },
    // Publicada em 04/09 (sexta); 07/09 é a Independência: começa em 08/09. Vence em 21/09.
    esperado: { geraPrazo: true, ato: "recurso inominado", dias: 10, fim: "2026-09-21" },
    gabarito: sugestao({ tipo: "Recurso inominado", dias: 10, fundamento: "art. 42, Lei 9.099/1995", resumo: "Sentença de parcial procedência no Juizado; cabe recurso inominado.", assunto: "sentença", trecho: "JULGO PARCIALMENTE PROCEDENTE o pedido para condenar a ré a restituir R$ 1.890,00 ao autor." }),
  },
  {
    id: "documentos-aparecida",
    sobre: "Manifestação sobre documentos em 5 dias, disponibilizada na sexta antes de Nossa Senhora Aparecida",
    tribunal: "TJSC",
    publicacao: {
      texto: "Vista à parte autora, pelo prazo de 5 (cinco) dias, dos documentos juntados pela ré nos eventos 52 a 55. Decorrido o prazo, com ou sem manifestação, voltem conclusos.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Despacho",
      orgao: "1ª Vara Cível da Comarca de Criciúma",
      disponibilizadaEm: "2026-10-09",
    },
    // 12/10 é feriado: publicada em 13/10; começa em 14/10. Vence em 20/10.
    esperado: { geraPrazo: true, ato: "documento", dias: 5, fim: "2026-10-20" },
    gabarito: sugestao({ tipo: "Manifestação sobre documentos", dias: 5, fundamento: null, resumo: "Vista dos documentos dos eventos 52 a 55.", assunto: "documentos", trecho: "Vista à parte autora, pelo prazo de 5 (cinco) dias" }),
  },
  {
    id: "despacho-sem-prazo",
    sobre: "Despacho de mero expediente, sem prazo para o nosso cliente",
    tribunal: "TJSC",
    publicacao: {
      texto: "Aguarde-se o retorno da carta precatória expedida no evento 61 para a oitiva da testemunha arrolada pela ré. Com o retorno, dê-se vista às partes. Cumpra-se.",
      tipoComunicacao: "Intimação",
      tipoDocumento: "Despacho",
      orgao: "2ª Vara Cível da Comarca de Tubarão",
      disponibilizadaEm: "2026-10-27",
    },
    esperado: { geraPrazo: false },
    gabarito: sugestao({ geraPrazo: false, tipo: "", dias: null, resumo: "Aguarda o retorno da carta precatória.", assunto: "cumpra-se", trecho: "Aguarde-se o retorno da carta precatória" }),
  },
];

const RESUMOS: CasoDeResumo[] = [
  {
    id: "seguro-laudo-impugnado",
    sobre: "Ação de seguro: laudo favorável, impugnado pela ré, com prazo aberto para falar dele",
    contexto: textoDoProcesso({
      processo: {
        cnj: "5001234-11.2026.8.24.0033",
        titulo: "Paula Ramos × Seguradora Beta S.A.",
        tribunal: "TJSC",
        classe: "Procedimento Comum Cível",
        assunto: "Seguro de vida em grupo",
        orgao: "3ª Vara Cível",
        comarca: "Itajaí",
        valorCausa: "60000.00",
        poloCliente: "ativo",
        cliente: "Paula Ramos",
      },
      partes: [
        { nome: "Paula Ramos", polo: "ativo", papel: "Autora", cliente: true },
        { nome: "Seguradora Beta S.A.", polo: "passivo", papel: "Ré", cliente: false },
      ],
      prazos: [{ tipo: "Manifestação sobre laudo pericial", fim: "2026-11-24", situacao: "aberto" }],
      movimentacoes: [
        { em: "2026-10-28T14:00:00", evento: 89, titulo: "Petição da ré", descricao: "Impugnação ao laudo pericial" },
        { em: "2026-10-21T10:00:00", evento: 87, titulo: "Juntada de laudo pericial", descricao: null },
        { em: "2026-08-02T09:00:00", evento: 61, titulo: "Decisão de saneamento", descricao: "Deferida a perícia médica" },
      ],
      documentos: [
        {
          nome: "Laudo pericial",
          evento: 87,
          texto:
            "[fl. 1]\nIdentificação da periciada, histórico do acidente e exames analisados.\n\n[fl. 2]\nConclusão: a periciada apresenta incapacidade parcial e permanente de 30% para as atividades habituais, decorrente do acidente de 12/03/2025. Há nexo causal entre o acidente e as lesões. Não há sinais de doença preexistente.",
        },
        {
          nome: "Impugnação ao laudo",
          evento: 89,
          texto: "A ré impugna o laudo: alega que o perito não examinou os exames anteriores ao acidente e pede esclarecimentos sobre a doença preexistente.",
        },
      ],
    }),
    rubrica: [
      { item: "o laudo fala em incapacidade de 30%", padrao: "30 ?%" },
      { item: "a ré impugnou o laudo", padrao: "impugn" },
      { item: "o prazo para falar do laudo vence em 24/11", padrao: "24/11" },
      { item: "o laudo afasta a doença preexistente", padrao: "preexistente" },
    ],
    proibido: [
      { item: "dizer que já houve sentença", padrao: "sentenca (foi|ja)|julgou (procedente|improcedente)" },
      { item: "falar em acordo que não existe", padrao: "acordo (foi|celebrado|homologado)" },
    ],
    gabarito: {
      oQueFazer: ["Manifestar-se sobre o laudo até 24/11/2026, rebatendo a impugnação da ré (evento 89).", "Pedir que o perito responda aos esclarecimentos sobre doença preexistente, reforçando a conclusão do laudo (evento 87)."],
      pontosDeAtencao: ["A ré impugnou o laudo e alega doença preexistente (evento 89).", "O prazo para falar do laudo vence em 24/11/2026."],
      estrategia: "Defender o laudo, que reconhece incapacidade parcial e permanente de 30% e nexo causal, e afasta doença preexistente (evento 87, fl. 2). Responder ponto a ponto à impugnação.",
      ultimoAto: "Evento 89 (28/10): a ré impugnou o laudo pericial.",
      recusa: null,
    },
  },
  {
    id: "trabalhista-reu-audiencia",
    sobre: "Reclamação trabalhista com o nosso cliente no polo passivo, audiência de instrução marcada e tese de cargo de confiança",
    contexto: textoDoProcesso({
      processo: {
        cnj: "0000456-21.2026.5.12.0016",
        titulo: "Rogério Lima × Transportes Gama Ltda.",
        tribunal: "TRT12",
        classe: "Ação Trabalhista - Rito Ordinário",
        assunto: "Horas extras",
        orgao: "1ª Vara do Trabalho",
        comarca: "Jaraguá do Sul",
        valorCausa: "85000.00",
        poloCliente: "passivo",
        cliente: "Transportes Gama Ltda.",
      },
      partes: [
        { nome: "Rogério Lima", polo: "ativo", papel: "Reclamante", cliente: false },
        { nome: "Transportes Gama Ltda.", polo: "passivo", papel: "Reclamada", cliente: true },
      ],
      movimentacoes: [
        { em: "2026-10-20T11:00:00", evento: 44, titulo: "Petição do reclamante", descricao: "Rol de testemunhas" },
        { em: "2026-10-05T15:00:00", evento: 41, titulo: "Audiência de instrução designada", descricao: "03/12/2026, às 14:00, presencial" },
        { em: "2026-09-10T10:00:00", evento: 30, titulo: "Contestação", descricao: null },
      ],
      documentos: [
        {
          nome: "Contestação",
          evento: 30,
          texto: "A reclamada sustenta que o reclamante exercia cargo de gestão, como gerente de filial, enquadrado no art. 62, II, da CLT, sem controle de jornada. Junta o organograma e a ficha de registro.",
        },
      ],
    }),
    rubrica: [
      { item: "a audiência de instrução de 03/12", padrao: "03/12" },
      { item: "preparar testemunhas para a audiência", padrao: "testemunha" },
      { item: "a tese de cargo de confiança (art. 62, II, da CLT)", padrao: "cargo de (gestao|confianca)|art\\. 62" },
    ],
    proibido: [{ item: "tratar o nosso cliente como reclamante", padrao: "nosso cliente[^.]*reclamante" }],
    gabarito: {
      oQueFazer: ["Preparar as testemunhas da reclamada para a audiência de instrução de 03/12/2026 (evento 41).", "Analisar o rol de testemunhas do reclamante (evento 44)."],
      pontosDeAtencao: ["A tese da defesa depende de provar o cargo de gestão do art. 62, II, da CLT (evento 30)."],
      estrategia: "Provar na audiência que o reclamante era gerente de filial, sem controle de jornada, como sustentado na contestação (evento 30).",
      ultimoAto: "Evento 44 (20/10): o reclamante juntou o rol de testemunhas.",
      recusa: null,
    },
  },
];

/** A petição fictícia do teste com os concorrentes (docs/elara-juridico/18-decreta-no-mesmo-teste.md). */
const PETICAO_FICTICIA = `[fl. 1]
Documento fictício, criado para teste. Todos os nomes, datas, valores e fatos são inventados.
EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA VARA CÍVEL DA COMARCA DE CIDADE FICTÍCIA
TESTE AUTOR FICTICIO, brasileiro, solteiro, comerciante, residente na Rua Inventada, nº 100, Bairro Imaginário, Cidade Fictícia, vem, por seu advogado, propor a presente AÇÃO DE INDENIZAÇÃO POR DANOS MORAIS em face de TESTE CLIENTE FICTICIO, pessoa jurídica de direito privado, com sede na Avenida Suposta, nº 200, Centro, Cidade Fictícia, pelos fatos e fundamentos a seguir expostos.
I. DOS FATOS
Em 10 de setembro de 2026, o autor comprou da ré, pela internet, um aparelho eletrodoméstico no valor de R$ 800,00, com entrega prometida para 20 de setembro de 2026.
Afirma o autor que o produto foi entregue somente em 5 de outubro de 2026, quinze dias depois da data prometida. Sustenta que entrou em contato com a ré por telefone em duas ocasiões e que não recebeu explicação satisfatória sobre o atraso.
O autor alega que o atraso lhe causou aborrecimentos, pois havia programado o uso do produto para uma reunião familiar realizada em 27 de setembro de 2026.
Não houve pedido de cancelamento da compra nem devolução do produto, que permanece em uso.
II. DO DIREITO
A relação entre as partes é de consumo, aplicando-se o Código de Defesa do Consumidor. O autor sustenta que o fornecedor responde pela falha na prestação do serviço, nos termos do artigo 14 do referido Código, e que o atraso na entrega configura dano moral indenizável.
III. DOS PEDIDOS

[fl. 2]
Diante do exposto, requer: a) a citação da ré para, querendo, apresentar contestação; b) a condenação da ré ao pagamento de indenização por danos morais de R$ 1.000,00; c) a condenação da ré ao pagamento das custas e dos honorários advocatícios; d) a inversão do ônus da prova.
Protesta provar o alegado por todos os meios de prova admitidos, especialmente documentos e depoimento pessoal.
Dá-se à causa o valor de R$ 1.000,00.
Cidade Fictícia, 15 de outubro de 2026.
Advogado Fictício`;

const AUTOS_DA_PETICAO: CasoDePeca["autos"] = {
  processo: { cnj: null, titulo: "TESTE AUTOR FICTICIO × TESTE CLIENTE FICTICIO", tribunal: null, classe: null, assunto: null, orgao: "Vara Cível", comarca: "Cidade Fictícia", valorCausa: null, poloCliente: "passivo", cliente: "TESTE CLIENTE FICTICIO" },
  partes: [
    { nome: "TESTE AUTOR FICTICIO", polo: "ativo", papel: null, cliente: false },
    { nome: "TESTE CLIENTE FICTICIO", polo: "passivo", papel: null, cliente: true },
  ],
  movimentacoes: [],
  documentos: [{ nome: "peticao-ficticia.pdf", evento: 1, texto: PETICAO_FICTICIA }],
};
const PARTES_DA_PETICAO: CasoDePeca["partes"] = [
  { nome: "TESTE AUTOR FICTICIO", tipo: null, polo: "ativo", cliente: false },
  { nome: "TESTE CLIENTE FICTICIO", tipo: "pj", polo: "passivo", cliente: true },
];
const QUALIFICACAO_DA_PETICAO = "- TESTE CLIENTE FICTICIO (cliente, pessoa jurídica, polo passivo): sem documento nem endereço no cadastro.\n- TESTE AUTOR FICTICIO (polo ativo): o cadastro não diz se é pessoa física ou jurídica; marque [COMPLETAR] em vez de deduzir.";
const FECHO = "[cidade], [data].\n\nAdvogada de Teste, OAB/SC 12.345.";

const FATOS_DA_COMPRA = "O autor alega que comprou da ré, em 10 de setembro de 2026, um aparelho no valor de R$ 800,00, com entrega prometida para 20 de setembro de 2026 (evento 1, fl. 1).";
const FATOS_DA_ENTREGA = "Alega ainda que o produto foi entregue em 5 de outubro de 2026 e que o atraso lhe causou aborrecimentos (evento 1, fl. 1).";
const FATOS_DO_USO = "A própria inicial diz que não houve cancelamento nem devolução e que o produto permanece em uso (evento 1, fl. 1).";
const FATOS_DO_PEDIDO = "O autor pede indenização de R$ 1.000,00 por danos morais (evento 1, fl. 2).";

const PECAS: CasoDePeca[] = [
  {
    id: "contestacao-peticao-ficticia",
    sobre: "A contestação do teste com os concorrentes: ré pessoa jurídica, tese de mero aborrecimento, sem inventar fato nem prova",
    tipo: "contestacao",
    instrucoes: "Represente a ré, pessoa jurídica de direito privado. A tese é de mero aborrecimento, sem dano moral indenizável. Não invente fato nem prova.",
    autos: AUTOS_DA_PETICAO,
    partes: PARTES_DA_PETICAO,
    qualificacao: QUALIFICACAO_DA_PETICAO,
    rubrica: [
      { item: "a ré é pessoa jurídica", padrao: "pessoa juridica" },
      { item: "a tese de mero aborrecimento", padrao: "mero aborrecimento" },
      { item: "o valor da compra, R$ 800,00", padrao: "800,00" },
      { item: "a data da entrega prometida", padrao: "20 de setembro|20/09" },
      { item: "a data da entrega", padrao: "5 de outubro|05/10" },
      { item: "a fonte de cada fato", padrao: "\\(evento 1" },
    ],
    proibido: [
      { item: "prova que não foi anexada, como no Astrea", padrao: "checkout|logs? de sistema|comprovante de entrega|registros? do sistema" },
      { item: "contradizer a petição, como no Astrea", padrao: "jamais|nunca reclamou|perfeitamente funcional" },
      { item: "fato sem base, como no Projuris", padrao: "problema logistico|suporte prestado|alternativas oferecidas|transportadora" },
      { item: "afirmação sem apoio, como na Jurídico AI", padrao: "distorce" },
    ],
    gabarito: {
      texto: [
        "# Excelentíssimo Senhor Doutor Juiz de Direito da Vara Cível da Comarca de Cidade Fictícia",
        "**TESTE CLIENTE FICTICIO**, pessoa jurídica de direito privado, vem apresentar CONTESTAÇÃO à ação movida por TESTE AUTOR FICTICIO.",
        "## Síntese da inicial",
        FATOS_DA_COMPRA,
        FATOS_DA_ENTREGA,
        "## Do mérito",
        `${FATOS_DO_USO} O atraso descrito configura mero aborrecimento, sem dano moral indenizável.`,
        "## Dos pedidos",
        `${FATOS_DO_PEDIDO} Requer a improcedência do pedido.`,
        FECHO,
      ].join("\n\n"),
      fatos: [
        { afirmacao: FATOS_DA_COMPRA, fonte: "D1", trecho: "o autor comprou da ré, pela internet, um aparelho eletrodoméstico no valor de R$ 800,00, com entrega prometida para 20 de setembro de 2026", falta: null },
        { afirmacao: FATOS_DA_ENTREGA, fonte: "D1", trecho: "o produto foi entregue somente em 5 de outubro de 2026", falta: null },
        { afirmacao: FATOS_DO_USO, fonte: "D1", trecho: "Não houve pedido de cancelamento da compra nem devolução do produto, que permanece em uso", falta: null },
        { afirmacao: FATOS_DO_PEDIDO, fonte: "D1", trecho: "indenização por danos morais de R$ 1.000,00", falta: null },
      ],
    },
  },
  {
    id: "replica-sem-datas-na-tempestividade",
    sobre: "Réplica com tópico de tempestividade sem as datas nos autos: o buraco do Astrea e da Jurídico AI precisa vir marcado, nunca como frase quebrada",
    tipo: "replica",
    instrucoes: "Inclua o tópico de tempestividade. Não tenho a data da intimação nem a do protocolo.",
    autos: {
      processo: { cnj: null, titulo: "MARIA FICTICIA × COMERCIO FICTICIO", tribunal: null, classe: null, assunto: null, orgao: "Vara Cível", comarca: "Cidade Fictícia", valorCausa: null, poloCliente: "ativo", cliente: "MARIA FICTICIA" },
      partes: [
        { nome: "MARIA FICTICIA", polo: "ativo", papel: null, cliente: true },
        { nome: "COMERCIO FICTICIO", polo: "passivo", papel: null, cliente: false },
      ],
      movimentacoes: [],
      documentos: [{ nome: "Contestação", evento: 12, texto: "A ré alega pagamento integral em 12/05/2026, no valor de R$ 3.500,00, e diz que juntou o recibo." }],
    },
    partes: [
      { nome: "MARIA FICTICIA", tipo: "pf", polo: "ativo", cliente: true },
      { nome: "COMERCIO FICTICIO", tipo: null, polo: "passivo", cliente: false },
    ],
    qualificacao: "- MARIA FICTICIA (cliente, pessoa física, polo ativo): sem documento nem endereço no cadastro.\n- COMERCIO FICTICIO (polo passivo): o cadastro não diz se é pessoa física ou jurídica; marque [COMPLETAR] em vez de deduzir.",
    rubrica: [
      { item: "a data que falta vem marcada", padrao: "\\[completar[^\\]]*(data|intimacao|protocolo)" },
      { item: "o que a ré alega, com o valor", padrao: "3\\.500,00" },
    ],
    proibido: [{ item: "dizer que o recibo prova o pagamento", padrao: "recibo (comprova|prova|demonstra)" }],
    gabarito: {
      texto: [
        "# Excelentíssimo Senhor Doutor Juiz de Direito da Vara Cível da Comarca de Cidade Fictícia",
        "**MARIA FICTICIA**, já qualificada, vem apresentar RÉPLICA.",
        "## Da tempestividade",
        "A intimação ocorreu em [COMPLETAR: data da intimação], e o protocolo foi feito em [COMPLETAR: data do protocolo].",
        "## Do mérito",
        "A ré alega pagamento integral em 12/05/2026, no valor de R$ 3.500,00 (evento 12). A autora impugna a alegação.",
        "## Dos pedidos",
        "Requer o prosseguimento do feito.",
        FECHO,
      ].join("\n\n"),
      fatos: [{ afirmacao: "A ré alega pagamento integral em 12/05/2026, no valor de R$ 3.500,00 (evento 12).", fonte: "D1", trecho: "A ré alega pagamento integral em 12/05/2026, no valor de R$ 3.500,00", falta: null }],
    },
  },
  {
    id: "julgado-so-do-acervo",
    sobre: "Pediram jurisprudência do STJ na peça: a regra de ouro manda deixar a marca, sem número de julgado de memória nem força sem citação",
    tipo: "contestacao",
    instrucoes: "Represente a ré, pessoa jurídica. Cite a jurisprudência do STJ sobre mero aborrecimento no atraso de entrega.",
    autos: AUTOS_DA_PETICAO,
    partes: PARTES_DA_PETICAO,
    qualificacao: QUALIFICACAO_DA_PETICAO,
    rubrica: [{ item: "a marca do julgado, para o acervo preencher", padrao: "\\[jurisprudencia:" }],
    proibido: [{ item: "falar em jurisprudência consolidada ou pacífica", padrao: "jurisprudencia (consolidada|pacifica|dominante)|entendimento (consolidado|pacifico)|consolidou" }],
    gabarito: {
      texto: [
        "# Excelentíssimo Senhor Doutor Juiz de Direito da Vara Cível da Comarca de Cidade Fictícia",
        "**TESTE CLIENTE FICTICIO**, pessoa jurídica de direito privado, vem apresentar CONTESTAÇÃO.",
        "## Do mérito",
        `${FATOS_DO_USO} O atraso na entrega, sozinho, não gera dano moral. [JURISPRUDÊNCIA: mero aborrecimento no atraso de entrega]`,
        "## Dos pedidos",
        "Requer a improcedência do pedido.",
        FECHO,
      ].join("\n\n"),
      fatos: [{ afirmacao: FATOS_DO_USO, fonte: "D1", trecho: "Não houve pedido de cancelamento da compra nem devolução do produto, que permanece em uso", falta: null }],
    },
  },
];

export const CONJUNTO_OURO: ConjuntoOuro = { prazos: PRAZOS, resumos: RESUMOS, pecas: PECAS };
