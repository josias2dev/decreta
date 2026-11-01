/**
 * Conjunto-ouro da IA: casos inventados (nomes, números e fatos de mentira,
 * nunca de cliente) com a resposta certa. Os vencimentos foram contados à mão,
 * no calendário, e não pelo motor: é assim que o teste pega erro no motor também.
 *
 * Para acrescentar um caso: escreva a publicação ou os autos, conte o prazo no
 * calendário do tribunal e ponha o gabarito (a resposta que a IA deveria dar).
 */
import type { CasoDePrazo, CasoDeResumo, ConjuntoOuro } from "./avaliacao.ts";
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
    gabarito: sugestao({ tipo: "Manifestação sobre laudo pericial", dias: 15, fundamento: "art. 477, § 1º, CPC", resumo: "Intimação para falar do laudo do evento 87.", assunto: "laudo pericial" }),
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
    gabarito: sugestao({ tipo: "Embargos de declaração", dias: 5, fundamento: "art. 1.023, CPC", resumo: "Sentença de procedência; prazo para embargos de declaração.", assunto: "sentença" }),
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
    gabarito: sugestao({ tipo: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC", resumo: "Sentença de improcedência; cabe apelação.", assunto: "sentença" }),
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
    gabarito: sugestao({ tipo: "Contrarrazões ao recurso ordinário", dias: 8, fundamento: "art. 900, CLT", resumo: "Recurso ordinário da reclamada recebido; prazo para contrarrazões.", assunto: "recurso ordinário" }),
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
    gabarito: sugestao({ tipo: "Contestação", dias: 15, fundamento: "art. 335, CPC", resumo: "Citação para contestar em 15 dias úteis.", assunto: "citação" }),
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
    gabarito: sugestao({ tipo: "Recurso inominado", dias: 10, fundamento: "art. 42, Lei 9.099/1995", resumo: "Sentença de parcial procedência no Juizado; cabe recurso inominado.", assunto: "sentença" }),
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
    gabarito: sugestao({ tipo: "Manifestação sobre documentos", dias: 5, fundamento: null, resumo: "Vista dos documentos dos eventos 52 a 55.", assunto: "documentos" }),
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
    gabarito: sugestao({ geraPrazo: false, tipo: "", dias: null, resumo: "Aguarda o retorno da carta precatória.", assunto: "cumpra-se" }),
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

export const CONJUNTO_OURO: ConjuntoOuro = { prazos: PRAZOS, resumos: RESUMOS };
