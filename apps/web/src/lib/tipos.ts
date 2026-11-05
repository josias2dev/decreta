/** O que a API das telas devolve (apps/api/src/rotas). */
import type { AchadoDaAuditoria, AvisoDaConferencia, ContaAberta, EstrategiaDaPeca, FatoDaPeca, ParteDoCadastro, PrazoInterno } from "@decreta/core";

export interface Pessoa {
  id: string;
  nome: string;
  apelido: string;
  iniciais: string;
  /** Foto de perfil; sem ela, as iniciais. */
  foto?: string | null;
}

export type Urgencia = "vencido" | "hoje" | "breve" | "prazo" | "cumprido";
export type Contagem = "uteis" | "corridos";

export interface Eu {
  /** `financeiro`: a pessoa vê o Financeiro (os sócios, e quem eles liberaram na Equipe). */
  usuario: Pessoa & { cargo: string | null; papel: string; financeiro?: boolean; email?: string; emailConfirmado?: boolean };
  /** `onboarding`: a configuração inicial (/comecar) ainda está pendente e esta pessoa, sócia, pode fazê-la. */
  escritorio: { id: string; nome: string; pessoas: number; timezone: string; logo?: boolean; demonstracao?: boolean; onboarding?: boolean };
  hoje: string;
  ia: boolean;
  equipe: (Pessoa & { cargo: string | null; papel: string })[];
  /** `financeiro`: parcelas de honorários vencidas e não pagas (só para quem vê o Financeiro). */
  menu: { prazos: number; prazosHoje: number; publicacoes: number; processos: number; clientes: number; negocios: number; alvaras: number; financeiro?: number };
  /** Só com a cobrança ligada: o que o escritório pode fazer e o aviso (com data) que a moldura mostra em toda tela. */
  assinatura?: { situacao: SituacaoDoEscritorio; acesso: AcessoDoEscritorio; aviso: AvisoDoPlano | null };
  /** Só para o operador da plataforma: o menu mostra o link do painel. */
  plataforma?: true;
}

export type SituacaoDoEscritorio = "teste" | "ativo" | "inadimplente" | "so_leitura" | "bloqueado" | "cancelado" | "cortesia";
export type AcessoDoEscritorio = "total" | "leitura" | "bloqueado";

/** `info`: discreto (o teste em andamento). `atencao`: vai acontecer. `grave`: já está acontecendo. */
export interface AvisoDoPlano {
  nivel: "info" | "atencao" | "grave";
  texto: string;
  ate: string | null;
}

export interface FaturaDoPlano {
  id: string;
  vencimento: string;
  valorCentavos: number;
  situacao: "pendente" | "paga" | "atrasada" | "estornada" | "removida";
  forma: string | null;
  link: string | null;
  pagaEm: string | null;
}

/** A tela do Plano (Configurações), para os sócios. */
export interface Plano {
  cobrancaAtiva: boolean;
  plano: { nome: string; testeDias: number; valorMensalCentavos: number | null };
  situacao: SituacaoDoEscritorio;
  rotulo: string;
  situacaoGravada: SituacaoDoEscritorio;
  acesso: AcessoDoEscritorio;
  motivo: "fim_do_teste" | "atraso" | "cancelada" | "manual" | null;
  testeAte: string | null;
  diasRestantesDoTeste: number | null;
  diasDeAtraso: number | null;
  viraSoLeituraEm: string | null;
  bloqueiaEm: string | null;
  acessoAte: string | null;
  cancelamentoAgendado: boolean;
  valorMensalCentavos: number | null;
  assinante: boolean;
  podeAssinar: boolean;
  motivoSemAssinar: string | null;
  podeCancelar: boolean;
  faturas: FaturaDoPlano[];
  /** A página da fatura aberta no Asaas, onde se escolhe Pix, boleto ou cartão. */
  trocarFormaEm: string | null;
  aviso: AvisoDoPlano | null;
}

/** Um escritório na lista da plataforma e o que a equipe fez nele: as contas são as de @decreta/core. */
export type { AcaoRegistrada as AcaoDaPlataforma, EscritorioDaPlataforma } from "@decreta/core";

export interface IndicadoresDaPlataforma {
  periodo: { de: string; ate: string; dias: number };
  mrrCentavos: number;
  mrrEmAtrasoCentavos: number;
  porSituacao: Record<SituacaoDoEscritorio, number>;
  conversao: { cadastrados: number; terminaram: number; assinaram: number; taxa: number | null };
  cancelamentos: { total: number; mrrPerdidoCentavos: number };
  inadimplencia: { escritorios: number; mrrCentavos: number };
  funil: { nome: string; rotulo: string; total: number; doAnterior: number | null }[];
}

export interface Analise<C = Record<string, unknown>> {
  id: string;
  acao: string;
  situacao: "pronto" | "recusa" | "erro";
  conteudo: C;
  fonte: string | null;
  em: string;
  desatualizada: boolean;
  erro: string | null;
}

/** O item da lista é o prazo interno, não o vencimento: o fatal é outro dia. */
export interface InternoNaLista {
  fatal: string;
  regra: string;
  aviso: string | null;
}

export interface ItemDoDia {
  tipo: "prazo" | "audiencia" | "tarefa";
  id: string;
  urgencia: Urgencia | "audiencia" | "tarefa";
  quando: string;
  titulo: string;
  detalhe: string;
  cnj: string | null;
  processoId: string | null;
  responsavel: Pessoa | null;
  aConfirmar?: boolean;
  interno?: InternoNaLista;
}

export interface PainelDoDia {
  hoje: string;
  rotulo: string;
  contadores: { vencemHoje: number; vencidos: number; publicacoesNovas: number; publicacoesComPrazo: number; publicacoesSemLeitura: number; audienciasHoje: number; alvarasAguardando: number };
  itens: ItemDoDia[];
  publicacoes: { id: string; titulo: string; detalhe: string; fimSugerido?: string | null }[];
  porResponsavel: { pessoa: Pessoa | null; hoje: number; semana: number }[];
  /** Caderno do DJEN que faltou ou falhou. */
  alertasDaCaptura: string[];
  /** Auditoria da carteira (a resposta antiga, sem ela, ainda pode estar em cache). */
  auditoria?: { itens: AchadoDaAuditoria[]; total: number };
}

export type SituacaoNaLista = "a_confirmar" | "confirmado" | "peca_em_revisao" | "cumprido" | "descartado";

export interface ProcessoResumido {
  id: string;
  titulo: string;
  cnj: string | null;
  /** Sem número e judicial: incompleto. Sem número e extrajudicial: não tem número mesmo. */
  tipo?: "judicial" | "extrajudicial";
  orgao: string | null;
  comarca?: string | null;
  tribunal?: string | null;
  /** O cliente recusou o uso de IA (vem nas fichas: prazo, peça, audiência, publicação). */
  semIa?: boolean;
}

export interface PrazoNaLista {
  id: string;
  tipo: string;
  dias: number;
  contagem: Contagem;
  fundamento: string | null;
  /** O artigo veio da IA. */
  fundamentoDaIa: boolean;
  /** O artigo que veio da IA já foi achado no acervo. */
  fundamentoAchado: boolean;
  fim: string;
  urgencia: Urgencia;
  quando: string;
  processo: ProcessoResumido;
  responsavel: Pessoa | null;
  situacao: SituacaoNaLista;
  confirmadoHoje: boolean;
  cumpridoEm: string | null;
  origem: string;
}

export type Quando = "hoje" | "semana" | "vencidos" | "abertos" | "cumpridos";

export interface ListaDePrazos {
  hoje: string;
  chips: Record<Quando, number>;
  responsaveis: { pessoa: Pessoa | null; n: number }[];
  itens: PrazoNaLista[];
}

export interface DiaDesconsiderado {
  dia: string;
  nome: string;
  tipo: string;
}

export interface Briefing {
  decidiu: string;
  fazer: string[];
  aFavor: string[];
  contra: string[];
  recusa?: string | null;
}

export interface LeituraDaPecaContraria {
  peca: string;
  pedidos: string;
  pontos: { tese: string; rebater: string; fonte: string }[];
  recusa?: string | null;
}

export interface Prazo {
  id: string;
  tipo: string;
  fundamento: string | null;
  /** O artigo veio da IA. */
  fundamentoDaIa: boolean;
  /** O artigo que veio da IA já foi achado no acervo. */
  fundamentoAchado: boolean;
  dias: number;
  contagem: Contagem;
  publicadoEm: string;
  inicio: string;
  fim: string;
  desconsiderados: DiaDesconsiderado[];
  situacao: "aberto" | "cumprido" | "descartado";
  urgencia: Urgencia;
  origem: "ia" | "manual";
  confirmado: boolean;
  confirmadoPor: Pessoa | null;
  responsavel: Pessoa | null;
  observacoes: string | null;
  motivoDescarte: string | null;
  processo: ProcessoResumido & { poloCliente: "ativo" | "passivo" | "terceiro" };
  publicacao: ({ id: string; fonte: "djen" | "datajud" | "manual"; texto: string; disponibilizadaEm: string; publicadaEm: string; tipoComunicacao: string | null; tipoDocumento: string | null; link: string | null } & DoDjen) | null;
  briefing: Analise<Briefing> | null;
  /** A peça da outra parte lida em pontos a rebater. */
  pecaContraria?: Analise<LeituraDaPecaContraria> | null;
  /** `preparadaPelaIa`: o rascunho que ficou pronto sozinho quando o prazo foi confirmado. */
  pecas: { id: string; titulo: string; situacao: "rascunho" | "revisada"; atualizadaEm: string; preparadaPelaIa?: boolean }[];
  historico: { em: string; titulo: string; detalhe: string | null }[];
  conta: ContaDoPrazo;
  /** O prazo interno do escritório. Nulo: sem antecedência configurada, ou o prazo não está mais em aberto. */
  interno?: PrazoInterno | null;
  /** A segunda conferência, enquanto a sugestão da IA espera alguém confirmar. */
  conferencia: SegundaConferencia | null;
}

export type Confianca = "alta" | "media" | "baixa";

/** A segunda conferência da sugestão de prazo da IA: a confiança e os motivos. */
export interface SegundaConferencia {
  confianca: Confianca;
  motivos: string[];
}

/** A conta inteira do prazo, para auditar: marcos, regra, calendário, quem confirmou e a tempestividade da peça. */
export interface ContaDoPrazo {
  /** "Dias úteis (CPC, art. 219)". */
  regra: string;
  /** "TJSC, com os feriados cadastrados para a comarca de Joinville". */
  calendario: string;
  /** Falso: o tribunal não tem calendário próprio no Decreta, e a conta usou só os feriados nacionais e o recesso. */
  calendarioCompleto: boolean;
  disponibilizadaEm: string | null;
  publicadoEm: string;
  /** Dupla intimação: o dia em que o sistema do tribunal intimou também. */
  intimadoNoSistemaEm: string | null;
  /** De que marco saiu a conta que vale: o que vence primeiro. */
  pelo: "publicacao" | "sistema";
  outra: { inicio: string; fim: string } | null;
  inicio: string;
  fim: string;
  desconsiderados: DiaDesconsiderado[];
  prorrogadoDe: string | null;
  explicacao: string;
  fimDigitado: boolean;
  /** A conta de hoje dá outra data: a digitada à mão, ou o calendário mudou depois da confirmação. */
  pelaConta: string | null;
  /** O tópico de tempestividade da peça. Nulo quando a data foi digitada ou a conta mudou. */
  tempestividade: string | null;
  /** A publicação cuja certidão do DJEN o tópico cita como anexa. */
  certidaoDe: string | null;
  confirmadoPor: Pessoa | null;
  confirmadoEm: string | null;
}

/** A conta atrás de uma data de prazo, para abrir de qualquer tela. */
export interface ContaParaAbrir {
  /** O prazo gravado. Nulo: é só a sugestão da IA, numa publicação ainda sem processo. */
  prazo: { id: string; tipo: string; situacao: string; confirmado: boolean; processo: { id: string; titulo: string } } | null;
  tipo: string;
  fim: string;
  dias: number;
  contagem: Contagem;
  /** A data foi digitada à mão: não há conta por trás dela. */
  digitada: boolean;
  /** A conta dia a dia. Nula quando a data foi digitada. */
  aberta: ContaAberta | null;
  regra: string;
  calendario: string;
  calendarioCompleto: boolean;
  fora: DiaDesconsiderado[];
  prorrogadoDe: string | null;
  pelaConta: string | null;
  pelo: "publicacao" | "sistema";
  outra: { inicio: string; fim: string } | null;
  interno: PrazoInterno | null;
  conferencia: SegundaConferencia | null;
}

/** A prévia da conta nos diálogos: com a intimação pelo sistema, vale o que vence primeiro. */
export interface PreviaDaConta extends ContagemNaTela {
  pelo: "publicacao" | "sistema";
  outra: { inicio: string; fim: string } | null;
  calendarioCompleto: boolean;
  /** A data final digitada cai em dia sem expediente: o motivo e o próximo dia útil. Nulo para dia útil ou sem data digitada. */
  diaDigitado: { dia: string; aviso: string; proximoDiaUtil: string } | null;
}

export interface ContagemNaTela {
  publicacao: string;
  inicio: string;
  fim: string;
  dias: number;
  contagem: Contagem;
  desconsiderados: DiaDesconsiderado[];
  prorrogadoDe: string | null;
  explicacao: string;
}

export interface Sugestao {
  geraPrazo: boolean;
  tipo: string;
  dias: number | null;
  contagem: Contagem;
  fundamento: string | null;
  audiencia: { data: string; hora: string; tipo: string; porVideo: boolean } | null;
  resumo: string;
  assunto: string;
  recusa: string | null;
  contagemCalculada: ContagemNaTela | null;
  /** "Dias úteis (CPC, art. 219)". Some nas leituras antigas. */
  regra?: string | null;
  conferencia?: SegundaConferencia | null;
  /** A frase da publicação que sustenta a leitura. Some nas leituras antigas. */
  trecho?: string;
  /** O código achou a frase no teor; sem isso, ela não aparece como da publicação. */
  trechoConfere?: boolean;
  responsavelId: string | null;
}

export type SituacaoPublicacao = "nova" | "pendente" | "lida" | "vinculada";

export interface Selo {
  tipo: "prazo" | "sem_prazo" | "audiencia" | "sem_teor" | "recusa" | "lendo" | "erro" | "sem_ia";
  texto: string;
}

export interface TribunalNaCaptura {
  tribunal: string;
  ultimo: { dia: string; situacao: "lido" | "ausente" | "erro"; erro: string | null; em: string };
  lido: { dia: string; versao: number | null; total: number; casadas: number; canceladas: number; em: string } | null;
  /** O último envio do tribunal ao DJEN, pela lista do próprio DJEN. */
  envio: string | null;
}

/** Como anda a leitura dos cadernos do DJEN. */
export interface SaudeDaCaptura {
  tribunais: TribunalNaCaptura[];
  alertas: string[];
  semProcesso: number;
}

export interface CaixaDePublicacoes {
  contagens: Record<SituacaoPublicacao, number>;
  ultimaCaptura: { em: string; hora: string; novas: number; erro: string | null } | null;
  itens: { id: string; titulo: string; disponibilizadaEm: string; partes: string; processoId: string | null; selo: Selo }[];
}

/** A certidão e o cancelamento, que vêm do DJEN. */
export interface DoDjen {
  /** Dá para abrir a certidão de publicação do DJEN. */
  certidao: boolean;
  /** O tribunal cancelou a comunicação depois de disponibilizar. */
  cancelada: { em: string; motivo: string | null } | null;
}

export interface Publicacao extends DoDjen {
  id: string;
  /** Sem leitura muito depois de chegar: a rotina de fundo não rodou. */
  leituraParada: boolean;
  situacao: SituacaoPublicacao;
  fonte: "djen" | "datajud" | "manual";
  disponibilizadaEm: string;
  publicadaEm: string;
  tribunal: string | null;
  orgao: string | null;
  tipoComunicacao: string | null;
  tipoDocumento: string | null;
  cnj: string | null;
  texto: string;
  link: string | null;
  destinatarios: { nome: string; polo?: string }[];
  advogados: { nome: string; oab?: string; uf?: string }[];
  processo: (ProcessoResumido & { classe: string | null; responsavel: Pessoa | null }) | null;
  sugestao: (Analise<Sugestao> & { responsavel: Pessoa | null }) | null;
  prazo: { id: string; confirmado: boolean; fim: string; tipo: string } | null;
  audiencia: { id: string; em: string; tipo: string } | null;
  /** É sentença ou acórdão: a IA lê pedido a pedido. */
  decisao: boolean;
  sentenca: Analise<LeituraDaSentenca> | null;
  resultado: { id: string; tipo: TipoDecisao; resultado: ResultadoDecisao; resumo: string | null; confirmadoPor: Pessoa | null; confirmadoEm: string } | null;
}

export type TipoDecisao = "sentenca" | "acordao";
export type ResultadoDecisao = "procedente" | "parcialmente_procedente" | "improcedente" | "sem_merito" | "acordo_homologado" | "outro";

export interface LeituraDaSentenca {
  tipo: TipoDecisao;
  resultado: ResultadoDecisao;
  resumo: string;
  pedidos: { pedido: string; decisao: "acolhido" | "parcial" | "rejeitado" | "nao_apreciado"; detalhe: string }[];
  valores: string[];
  honorarios: string | null;
  recurso: { cabivel: string; dias: number | null; fundamento: string | null } | null;
  recorrer: string[];
  manter: string[];
  recusa?: string | null;
}

/** O processo salvo sem o número: o que falta, e que não está sendo monitorado. */
export interface ProcessoIncompleto {
  faltam: string[];
  monitorado: boolean;
}

/** Uma publicação já lida que pode trazer o número do processo. */
export interface CandidatoAoNumero {
  cnj: string;
  tribunal: string | null;
  orgao: string | null;
  dia: string;
  /** O nome que combinou, como está no processo. */
  nome: string;
}

export interface ProcessoNaLista {
  incompleto?: ProcessoIncompleto | null;
  id: string;
  titulo: string;
  cnj: string | null;
  tipo: "judicial" | "extrajudicial";
  classe: string | null;
  orgao: string | null;
  comarca: string | null;
  situacao: "ativo" | "suspenso" | "arquivado" | "encerrado";
  cliente: string | null;
  responsavel: Pessoa | null;
  ultimaMovimentacaoEm: string | null;
  proximoPrazo: { id: string; fim: string; tipo: string; urgencia: Urgencia; quando: string } | null;
}

export interface Pagina<T> {
  total: number;
  pagina: number;
  porPagina: number;
  itens: T[];
}

export interface Movimentacao {
  id: string;
  em: string;
  evento: number | null;
  titulo: string;
  descricao: string | null;
  autor: "juizo" | "partes" | "cartorio" | null;
  fonte: "djen" | "datajud" | "manual";
  nova: boolean;
  documento: { id: string; nome: string; paginas: number | null } | null;
}

export interface ResumoDosAutos {
  oQueFazer: string[];
  pontosDeAtencao: string[];
  estrategia: string;
  ultimoAto: string;
}

export interface Parte {
  id: string;
  nome: string;
  polo: "ativo" | "passivo" | "terceiro";
  papel: string | null;
  advogados: string | null;
  cliente: boolean;
  documento: string | null;
}

/** O que o tribunal sabe do número (GET /processos/consulta), para o Novo processo vir preenchido. */
export interface ConsultaDoCnj {
  cnj: string;
  tribunal: string | null;
  cadastrado: { id: string; titulo: string } | null;
  /** Demonstração: dados inventados. */
  exemplo: boolean;
  fontes: { datajud: SituacaoDaFonte; djen: SituacaoDaFonte };
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  sistema: string | null;
  distribuidoEm: string | null;
  segredo: boolean;
  movimentacoes: number;
  ultimaMovimentacao: { em: string; titulo: string } | null;
  partes: { nome: string; polo: "ativo" | "passivo" | "terceiro"; advogados: string | null; cliente: { id: string; nome: string } | null }[];
  poloCliente: "ativo" | "passivo" | null;
  cliente: { id: string; nome: string } | null;
}

export type SituacaoDaFonte = "achou" | "nao_achou" | "falhou" | "desligado";

export interface Endereco {
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
}

/** A empresa pelo CNPJ (GET /consultas/cnpj/:numero), dos dados abertos da Receita. */
export interface ConsultaDoCnpj {
  cnpj: string;
  fonte: SituacaoDaFonte;
  empresa: {
    cnpj: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    situacao: string;
    ativa: boolean;
    situacaoDesde: string | null;
    abertura: string | null;
    atividade: string | null;
    naturezaJuridica: string | null;
    endereco: Endereco | null;
    enderecoEmTexto: string | null;
    telefone: string | null;
    email: string | null;
    fonte: string;
  } | null;
  cliente: { id: string; nome: string } | null;
  exemplo: boolean;
}

export interface ConsultaDoCpf {
  cpf: string;
  cliente: { id: string; nome: string } | null;
}

export interface ConsultaDoCep {
  cep: string;
  fonte: SituacaoDaFonte;
  endereco: Endereco | null;
  exemplo: boolean;
}

/** Os nomes que o Diário mostra com a OAB (GET /consultas/oab). */
export interface ConsultaDaOab {
  oab: string;
  fonte: SituacaoDaFonte;
  nomes: { nome: string; publicacoes: number }[];
  dias: number;
  exemplo: boolean;
}

export interface Processo {
  incompleto?: ProcessoIncompleto | null;
  id: string;
  titulo: string;
  cnj: string | null;
  tipo: "judicial" | "extrajudicial";
  tribunal: string | null;
  sistema: string | null;
  classe: string | null;
  assunto: string | null;
  orgao: string | null;
  comarca: string | null;
  valorCausa: string | null;
  fase: string | null;
  situacao: ProcessoNaLista["situacao"];
  poloCliente: "ativo" | "passivo" | "terceiro";
  distribuidoEm: string | null;
  segredo: boolean;
  observacoes: string | null;
  datajudEm: string | null;
  /** Quando o tribunal mandou o processo ao DataJud pela última vez. */
  datajudAtualizadoEm: string | null;
  /** Até quando o DataJud tem dados do tribunal deste processo (o maior @timestamp do índice). */
  datajudAte: string | null;
  cliente: { id: string; nome: string; semIa: boolean } | null;
  responsavel: Pessoa | null;
  link: { rotulo: string; url: string } | null;
  partes: Parte[];
  contadores: { movimentacoes: number; prazos: number; documentos: number };
  resumo: Analise<ResumoDosAutos> | null;
  novidades: string[];
  ultimasMovimentacoes: Movimentacao[];
  proximoPrazo: { id: string; tipo: string; fim: string; dias: number; contagem: Contagem; urgencia: Urgencia; quando: string; confirmado: boolean; responsavel: Pessoa | null } | null;
  audiencias: { id: string; em: string; tipo: string; porVideo: boolean }[];
  alvaras: { id: string; descricao: string; valor: string; etapa: EtapaAlvara }[];
  /** Sentenças e acórdãos confirmados, do mais recente ao mais antigo. */
  resultados: { id: string; tipo: TipoDecisao; resultado: ResultadoDecisao; decididoEm: string; resumo: string | null; publicacaoId: string | null }[];
}

export interface Movimentacoes {
  contagens: { todas: number; juizo: number; partes: number; documento: number };
  pagina: number;
  porPagina: number;
  itens: Movimentacao[];
}

export interface Documento {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  paginas: number | null;
  evento: number | null;
  origem: "upload" | "peca" | "captura";
  lido: boolean;
  semTexto: boolean;
  /** Foto ou PDF escaneado que a IA transcreve; nulo quando não precisou. */
  leitura: Leitura;
  /** Texto escondido ou frase dirigida a uma IA, achados no envio. */
  alertas: AlertaDoDocumento[];
  em: string;
  processo: { id: string; titulo: string } | null;
  cliente: { id: string; nome: string } | null;
  /** Pasta de quem ainda está na triagem (novos negócios). */
  negocio: { id: string; nome: string } | null;
  enviadoPor: Pessoa | null;
}

export type Leitura = "pendente" | "pronta" | "falhou" | null;

export interface AlertaDoDocumento {
  tipo: "texto_oculto" | "fonte_branca" | "fonte_minuscula" | "texto_invisivel" | "codigo_de_campo" | "metadados" | "comando_para_ia";
  trecho: string;
}

/** O termo de uso de IA vem do cadastro do cliente, não da IA. */
export type ItemDaConferencia = "procuracao" | "comprovante_residencia" | "documento_identidade" | "cpf" | "hipossuficiencia" | "contrato_honorarios" | "litispendencia" | "termo_ia";

export interface Conferencia {
  itens: { item: ItemDaConferencia; situacao: "certo" | "atencao" | "falta"; detalhe: string; documento: string | null }[];
  outros: string[];
  resumo: string;
  recusa?: string | null;
}

/** Um arquivo da pasta (cliente ou negócio), com a leitura pela IA. */
export interface DocumentoDaPasta {
  id: string;
  nome: string;
  mime: string;
  tamanho: number;
  leitura: Leitura;
  lido: boolean;
  em: string;
}

export interface PastaDoNegocio {
  documentos: DocumentoDaPasta[];
  conferencia: Analise<Conferencia> | null;
}

export interface MensagemIa {
  id: string;
  papel: "pessoa" | "ia";
  texto: string;
  em: string;
  autor: Pessoa | null;
}

export interface Conversa {
  rodape: string;
  mensagens: MensagemIa[];
}

export interface ClienteNaLista {
  id: string;
  nome: string;
  tipo: "pf" | "pj";
  documento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  processos: number;
  ultimoAtendimento: string | null;
  semIa?: boolean;
}

export type Canal = "presencial" | "telefone" | "whatsapp" | "video" | "email";

export interface Cliente {
  id: string;
  nome: string;
  tipo: "pf" | "pj";
  documento: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  observacoes: string | null;
  /** O cliente recusou o uso de IA: nada dos casos dele vai a um modelo. */
  semIa: boolean;
  /** O termo de uso de IA assinado, na pasta do cliente. */
  termoIa: { em: string; documento: { id: string; nome: string } } | null;
  criadoEm: string;
  processos: { id: string; titulo: string; cnj: string | null; tipo?: "judicial" | "extrajudicial"; orgao: string | null; situacao: string; responsavel: Pessoa | null }[];
  atendimentos: { id: string; em: string; canal: Canal; resumo: string; autor: Pessoa | null; processoId: string | null }[];
  documentos: DocumentoDaPasta[];
  conferencia: Analise<Conferencia> | null;
  linhaDoTempo: { em: string; titulo: string; detalhe: string | null; tipo: string }[];
}

export interface ItemDaAgenda {
  tipo: "audiencia" | "tarefa" | "prazo";
  id: string;
  hora?: string | null;
  titulo: string;
  detalhe?: string | null;
  porVideo?: boolean;
  processo?: { id: string; titulo: string; cnj: string | null; tipo?: "judicial" | "extrajudicial" } | null;
  processoId?: string | null;
  responsavel: Pessoa | null;
  situacao?: string;
  concluida?: boolean;
  urgencia?: Urgencia;
  aConfirmar?: boolean;
  interno?: InternoNaLista;
}

export interface Agenda {
  hoje: string;
  de: string;
  ate: string;
  dias: { dia: string; itens: ItemDaAgenda[] }[];
}

export interface PreparacaoDeAudiencia {
  oQueE: string;
  objetivo: string;
  controvertidos: string[];
  criticos: string[];
  checklist: string[];
}

export interface Audiencia {
  id: string;
  dia: string;
  hora: string;
  em: string;
  tipo: string;
  porVideo: boolean;
  local: string | null;
  situacao: string;
  checklist: { texto: string; feito: boolean }[];
  responsavel: Pessoa | null;
  processo: ProcessoResumido;
  preparacao: Analise<PreparacaoDeAudiencia> | null;
}

export type EtapaNegocio = "triagem" | "repassado" | "concluido" | "desistiu";
export type Pasta = "completa" | "faltam_documentos" | "sem_pasta";

export interface Negocio {
  id: string;
  nome: string;
  telefone: string | null;
  assunto: string;
  area: string | null;
  pasta: Pasta;
  etapa: EtapaNegocio;
  checklist: { texto: string; feito: boolean }[];
  observacoes: string | null;
  responsavel: Pessoa | null;
  clienteId: string | null;
  /** Já virou cliente, e ele recusou a IA. */
  semIa?: boolean;
  em: string;
}

export type EtapaAlvara = "novo" | "aguardando_saque" | "sacado" | "repassado" | "finalizado";

export interface Alvara {
  id: string;
  descricao: string;
  valor: string;
  valorRecebido: string | null;
  expedidoEm: string | null;
  sacadoEm: string | null;
  repassadoEm: string | null;
  observacoes: string | null;
  processo: { id: string; titulo: string; cnj: string | null };
  cliente: string | null;
  semIa?: boolean;
}

export interface QuadroDeAlvaras {
  totais: { pendente: string; recebido: string };
  etapas: { etapa: EtapaAlvara; total: string; itens: Alvara[] }[];
}

export interface Timbre {
  nome: string;
  registro?: string;
  endereco?: string;
  contato?: string;
  fonte?: string;
  tamanho?: number;
  cor?: string;
  logoDocumentoId?: string;
}

export interface Escritorio {
  nome: string;
  tribunal: string;
  timbre: Timbre | null;
  avisos: { manha: boolean; hora: string };
  capturaDjen: boolean;
  /** Escritório de demonstração: DJEN e DataJud ficam desligados. */
  demonstracao: boolean;
  capturaDatajud: boolean;
  whatsappLigado: boolean;
  /** O número oficial do rodapé das mensagens ao cliente. */
  whatsappOficial: string | null;
  /** A assinatura eletrônica (ZapSign) do escritório está ligada: o documento oferece "Enviar para assinatura". */
  assinaturaLigada?: boolean;
  /** Como o escritório faz cada peça, pelo tipo do catálogo; "geral" vale para todas. */
  jeito?: Record<string, JeitoDaPeca>;
  /** O nível de automação que vale em cada ação ("rascunho-da-peca" → "automatico"). */
  automacao?: Record<string, "automatico" | "sugestao" | "confirmar">;
  /** Dias úteis antes do fatal do prazo interno. Zero: o escritório não usa. */
  prazoInternoDias?: number;
  datajudLigado: boolean;
  iaLigada: boolean;
  suspensoes: { id: string; dia: string; motivo: string; tipo: "local" | "forense" | "recesso" | "reduzido"; tribunal: string | null; comarca: string | null }[];
}

/** Uma cópia dos dados do escritório (planilhas e documentos em ZIP), pedida por um sócio. */
export interface Exportacao {
  id: string;
  situacao: "pedida" | "pronta" | "falhou";
  pedidaEm: string;
  prontaEm: string | null;
  /** Os arquivos saem do servidor depois disto. */
  expiraEm: string | null;
  pedidaPor: string | null;
  /** Quantos arquivos guardados entraram nos ZIP. */
  documentos: number;
  erro: string | null;
  /** Um ZIP por parte: o escritório grande vira mais de um. */
  partes: { n: number; nome: string; tamanho: number }[];
}

export interface PessoaDaEquipe extends Pessoa {
  email: string;
  cargo: string | null;
  papel: string;
  oab: string | null;
  whatsapp: string | null;
  avisoManha: boolean;
  oabNumero: string | null;
  oabUf: string | null;
  /** Vê o Financeiro: sempre os sócios; os outros, só se um sócio liberou. */
  financeiro?: boolean;
}

export interface Equipe {
  pessoas: PessoaDaEquipe[];
  convites: { id: string; email: string; papel: string; expiraEm: string; link?: string }[];
  emailLigado: boolean;
}

export interface Feriados {
  ano: number;
  tribunal: string;
  /** Falso: o tribunal não tem calendário próprio no Decreta; a lista tem só os feriados nacionais e os do escritório. */
  calendarioCompleto: boolean;
  dias: { dia: string; nome: string; tipo: string; origem: string }[];
  suspensaoDeFimDeAno: { de: string; ate: string };
}

export interface JeitoDaPeca {
  estilo: string;
  teses: string;
  evitar: string;
}

export interface Catalogo {
  total: number;
  grupos: { nome: string; tipos: { id: string; nome: string }[] }[];
}

export interface PreparoDaPeca {
  processo: ProcessoResumido;
  prazo: { id: string; tipo: string; fim: string } | null;
  tipoSugerido: string;
  leu: string[];
  /** Os modelos do escritório que a IA vai seguir. */
  modelos: { id: string; titulo: string }[];
  ultima: { id: string; titulo: string; tipo: string; instrucoes: string | null; texto: string; situacao: "rascunho" | "revisada"; atualizadaEm: string } | null;
  /** As partes como o cadastro diz. */
  partes: ParteDoCadastro[];
  /** A estratégia aprovada na peça deste tipo ou, sem ela, a última que a IA propôs. */
  estrategia: EstrategiaDaPeca | null;
}

export interface Peca {
  id: string;
  processoId: string;
  prazoId: string | null;
  tipo: string;
  titulo: string;
  instrucoes: string | null;
  texto: string;
  situacao: "rascunho" | "revisada";
  atualizadaEm: string;
  rodape: string;
  /** Quem revisou, com a OAB, e quando. */
  revisao: { por: (Pessoa & { oab: string | null }) | null; em: string } | null;
  modelos: { id: string; titulo: string }[];
  /** Cada vez que alguém marcou como revisada, da mais nova à mais antiga. */
  revisoes: RevisaoDaPeca[];
  semIa: boolean;
  /** A última verificação das citações; `atual` cai quando o texto muda depois dela. */
  verificacao: (VerificacaoDaPeca & { atual: boolean }) | null;
  /** As partes como o cadastro diz. */
  partes: ParteDoCadastro[];
  /** A última geração trouxe texto da IA. */
  geradaPorIa: boolean;
  /** Cada fato ligado ao trecho; `atual` cai quando o texto muda depois da conferência. */
  conferencia: ConferenciaDaPeca | null;
  /** A estratégia aprovada na última geração. */
  estrategia: EstrategiaDaPeca | null;
  /** Os julgados que a pessoa escolheu do acervo. */
  julgados: JulgadoDaPeca[];
}

export interface ConferenciaDaPeca {
  em: string;
  atual: boolean;
  /** Por que os fatos não foram ligados, quando não foram: valeu só a parte do código. */
  semLigacao: "cliente_sem_ia" | "ia_desligada" | "ia_falhou" | null;
  fatos: FatoDaPeca[];
  avisos: AvisoDaConferencia[];
  resumo: { conferidos: number; comAviso: number; aComprovar: number };
}

export interface JulgadoDaPeca {
  chave: string;
  rotulo: string;
  tese: string;
  afirmacao: string;
  trecho: string;
  /** Como ficou no texto da peça. */
  citacao: string;
  selo: SeloDaCitacao;
  motivo: string;
  sustenta: "sim" | "parcial" | "nao" | null;
  fonte: { nome: string; url: string; capturadoEm: string } | null;
  avisoDeForca: string | null;
  em: string;
}

export type PapelDoJulgado = "enfrenta" | "contraponto" | "tangencia";

export interface CandidatoDaTese {
  chave: string;
  rotulo: string;
  tribunal: string;
  selo: SeloDaCitacao;
  motivo: string;
  situacao: string;
  trecho: string;
  texto: string | null;
  questao: string | null;
  /** Nulo sem a leitura da IA. */
  papel: PapelDoJulgado | null;
  porque: string | null;
  fonte: { nome: string; url: string; capturadoEm: string };
}

export interface BuscaDaTese {
  tese: string;
  itens: CandidatoDaTese[];
  lados: { aFavor: number; contra: number; tangenciam: number };
  semLeitura: boolean;
  cobertura: { tem: string[]; naoCobre: string[] };
  explicacao: string | null;
}

export interface AjusteDaPeca {
  /** O texto com as trocas aplicadas; nulo na recusa. */
  texto: string | null;
  resumo: string | null;
  naoAplicadas: string[];
  avisos: string[];
  recusa: string | null;
}

export interface RespostaDaEstrategia {
  situacao: "pronto" | "recusa" | "erro";
  estrategia: EstrategiaDaPeca | null;
  recusa: string | null;
}

/** Radar de precedentes: o precedente do BNP que mudou e pode afetar um processo. */
export interface AvisoDoRadar {
  id: string;
  chave: string;
  /** "IRDR 37 do TJSC" */
  rotulo: string;
  situacao: string;
  texto: string | null;
  url: string;
  motivo: string;
  criadoEm: string;
  processo: { id: string; titulo: string };
}

export type SeloDaCitacao = "verificada" | "com_ressalva" | "nao_verificada";

export interface CitacaoVerificada {
  chave: string;
  /** Como está escrito na peça. */
  trecho: string;
  inicio: number;
  selo: SeloDaCitacao;
  motivo: string;
  /** A tese, o enunciado ou o texto do artigo na fonte. */
  texto: string | null;
  fonte: { nome: string; url: string; capturadoEm: string } | null;
}

export interface VerificacaoDaPeca {
  em: string;
  resumo: { verificadas: number; comRessalva: number; naoVerificadas: number };
  citacoes: CitacaoVerificada[];
}

/** Quanto a pessoa ainda tem de IA hoje (o dia vira à meia-noite de Brasília). */
export interface UsoDaIa {
  /** Nulo sem limite de mensagens. */
  mensagens: { restam: number; limite: number } | null;
  /** Quanto do teto do dia já foi, de 0 a 1; nulo sem teto. */
  gasto: number | null;
  /** Perto do limite, ou por que a IA barrou. */
  aviso: string | null;
}

export interface RevisaoDaPeca {
  id: string;
  em: string;
  por: (Pessoa & { oab: string | null }) | null;
  geradaPorIa: boolean;
  /** Parágrafos da versão revisada e quantos não estavam na versão da IA. */
  paragrafos: number;
  mudaram: number;
}

export interface ModeloNaLista {
  id: string;
  titulo: string;
  tipo: string;
  tipoNome: string;
  tese: string | null;
  assunto: string | null;
  pecaId: string | null;
  criadoPor: Pessoa | null;
  em: string;
  tamanho: number;
}

export interface Modelo extends Omit<ModeloNaLista, "tamanho"> {
  texto: string;
}

export interface RetornosDaIa {
  porAcao: { acao: string; rotulo: string; uteis: number; errados: number }[];
  errados: { id: string; acao: string; rotulo: string; comentario: string | null; em: string; pessoa: Pessoa | null; onde: { tipo: string; id: string; processoId?: string | null } | null }[];
}

export interface Busca {
  processos: ProcessoResumido[];
  clientes: { id: string; nome: string; documento: string | null; telefone: string | null }[];
  /** Os prazos que esperam confirmação: os mais próximos, ou os que batem com o termo. */
  prazos?: { id: string; tipo: string; fim: string; processo: { id: string; titulo: string } }[];
}

export interface Registro {
  itens: { id: string; em: string; nome: string | null; acao: string; rotulo: string; detalhes: Record<string, unknown> }[];
}

/** Mensagem do escritório ao cliente no WhatsApp: só sai depois que um advogado aprova. */
export interface MensagemAoCliente {
  id: string;
  tipo: "decisao" | "documentos" | "cobranca";
  situacao: "rascunho" | "enviando" | "enviada" | "falhou" | "descartada";
  /** Em "enviando" sem resposta do WhatsApp: ninguém sabe se saiu, e o advogado confere. */
  envioIncerto: boolean;
  /** O corpo que o advogado revisa. */
  texto: string;
  /** Como o cliente vai ler: o nome do escritório, o corpo e o rodapé contra o golpe. */
  previa: string;
  itens: string[];
  cliente: { id: string; nome: string };
  para: string | null;
  processoId: string | null;
  prazoId: string | null;
  linkValeAte: string | null;
  recebidos: number;
  criadaEm: string;
  aprovadaPor: Pessoa | null;
  aprovadaEm: string | null;
  enviadaEm: string | null;
  erro: string | null;
  numeroOficial: string | null;
}

/** A página do link de envio, aberta pelo cliente sem login. */
export interface PedidoDeDocumentos {
  escritorio: string;
  cliente: string;
  itens: string[];
  validoAte: string;
  recebidos: number;
}

/* ------------------------------------------------------------------ */
/* Financeiro: todo valor aqui é um inteiro de centavos                */
/* ------------------------------------------------------------------ */

export type TipoDeContrato = "fixo" | "mensal" | "exito" | "hibrido";
export type SituacaoDaParcela = "sem_valor" | "a_vencer" | "em_atraso" | "parcial" | "paga" | "cancelada";
export type FormaDePagamento = "pix" | "boleto" | "cartao" | "transferencia" | "dinheiro" | "retido_no_alvara" | "outro";

export interface PagamentoDaParcela {
  id: string;
  valor: number;
  pagoEm: string;
  forma: FormaDePagamento;
  origem: "manual" | "asaas";
  observacao: string | null;
  estornado: boolean;
  motivoEstorno: string | null;
}

export interface VencimentoDaCobranca {
  sugerido: string | null;
  precisaEscolher: boolean;
  motivo: string | null;
}

export interface ParcelaDeHonorario {
  id: string;
  contratoId: string;
  contratoTitulo: string;
  contratoTipo: TipoDeContrato;
  contratoSituacao: "ativo" | "encerrado" | "cancelado";
  tipo: "fixo" | "mensal" | "exito" | "avulso";
  numero: number;
  descricao: string;
  /** Nulo no honorário de êxito que ainda não tem resultado. */
  valor: number | null;
  vencimento: string | null;
  /** A soma dos pagamentos marcados: é o único "recebido" que existe. */
  pago: number;
  falta: number | null;
  situacao: SituacaoDaParcela;
  diasEmAtraso: number;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; titulo: string; cnj: string | null } | null;
  cobranca: { provedor: string; link: string | null; vencimento: string | null } | null;
  vencimentoDaCobranca: VencimentoDaCobranca | null;
  alvaraId: string | null;
  prestacaoId: string | null;
  criadaEm: string;
  pagamentos: PagamentoDaParcela[];
}

export interface GrupoDoResumo {
  id: string;
  aReceber: number;
  emAtraso: number;
  recebido: number;
}

export interface ResumoDoFinanceiro {
  aReceber: number;
  aVencer: number;
  emAtraso: number;
  parcelasEmAtraso: number;
  recebido: number;
  porMes: { mes: string; aReceber: number; emAtraso: number }[];
  porCliente: GrupoDoResumo[];
  porProcesso: GrupoDoResumo[];
}

export interface ContaDoAlvara {
  base: number;
  baseEhRecebido: boolean;
  diferenca: number | null;
  honorario: number;
  cliente: number;
  semContrato: boolean;
  falta: "valor_recebido" | null;
}

export interface AlvaraParaPrestar {
  id: string;
  descricao: string;
  valor: number;
  valorRecebido: number | null;
  sacadoEm: string | null;
  processo: { id: string; titulo: string };
  cliente: { id: string; nome: string } | null;
  conta: ContaDoAlvara;
  contratoTitulo: string | null;
  precisaEscolherContrato: boolean;
}

export interface FinanceiroGeral {
  hoje: string;
  resumo: ResumoDoFinanceiro;
  parcelas: ParcelaDeHonorario[];
  alvarasParaPrestar: AlvaraParaPrestar[];
  semHonorario: { total: number; itens: { id: string; titulo: string; cnj: string | null; cliente: { id: string; nome: string } | null }[] };
  lembretesParaAprovar: number;
  /** O que o Asaas avisou que recebeu e nenhuma parcela aceitou (cancelada ou sem valor). */
  pagamentosSemParcela: PagamentoSemParcela[];
}

export interface PagamentoSemParcela {
  em: string;
  parcelaId: string;
  cobranca: string;
  descricao: string;
  valor: number;
  motivo: "parcela_cancelada" | "parcela_sem_valor" | "pagamento_recusado";
}

export interface ContratoDeHonorarios {
  id: string;
  titulo: string;
  tipo: TipoDeContrato;
  situacao: "ativo" | "encerrado" | "cancelado";
  valorFixo: number | null;
  mensalidade: number | null;
  exitoBp: number | null;
  exitoRotulo: string | null;
  inicio: string;
  observacoes: string | null;
  documentoId: string | null;
  cliente: { id: string; nome: string } | null;
  processo: { id: string; titulo: string; cnj: string | null } | null;
  pixAutomatico: { situacao: string | null; qr: { payload: string; imagem: string | null } | null } | null;
  totais: { aReceber: number; recebido: number; emAtraso: number };
  parcelas: ParcelaDeHonorario[];
}

/** A aba financeira de um cliente ou de um processo. */
export interface FinanceiroDoCaso {
  cliente?: { id: string; nome: string };
  processo?: { id: string; titulo: string };
  resumo: ResumoDoFinanceiro;
  contratos: ContratoDeHonorarios[];
  /** Só no processo: está em andamento, não tem contrato e ninguém dispensou o aviso. */
  semHonorario?: boolean;
  dispensado?: boolean;
}

export interface ContratoCandidato {
  id: string;
  titulo: string;
  exitoBp: number;
  nivel: "processo" | "cliente";
}

export interface RepasseDoAlvara {
  id: string;
  favorecido: string;
  favorecidoDocumento: string | null;
  conta: string;
  valor: number;
  repassadoEm: string;
  observacao: string | null;
  estornado: boolean;
}

export interface PrestacaoDeContas {
  id: string;
  alvaraId: string;
  contratoId: string | null;
  parcelaId: string | null;
  valorAlvara: number;
  valorRecebido: number;
  exitoBp: number | null;
  honorario: number;
  cliente: number;
  semContrato: boolean;
  retidoNoSaque: boolean;
  observacao: string | null;
  confirmadaEm: string;
  confirmadaPor: string | null;
  documentoId: string | null;
  repasses: RepasseDoAlvara[];
  conferencia: { repassado: number; falta: number; excede: number; completo: boolean };
}

/** A conta do alvará: o contrato que vale, os números, e a prestação de contas quando já foi confirmada. */
export interface ContaDoAlvaraNaTela {
  alvara: { id: string; descricao: string; etapa: EtapaAlvara; valor: number; valorRecebido: number | null; sacadoEm: string | null; processo: { id: string; titulo: string; cnj: string | null }; cliente: { id: string; nome: string } | null };
  contratos: ContratoCandidato[];
  contrato: ContratoCandidato | null;
  precisaEscolherContrato: boolean;
  conta: ContaDoAlvara;
  prestacao: PrestacaoDeContas | null;
  podeConfirmar: boolean;
  motivo: string | null;
}

export interface PassoDaRegua {
  dias: number;
  texto: string;
}

export interface EstadoDaCobranca {
  asaas: { configurado: boolean; ambiente: "sandbox" | "producao" | null; avisoLigado: boolean; conferidaEm: string | null; urlDoAviso: string | null };
  pixAutomatico: boolean;
  regua: { ligada: boolean; passos: PassoDaRegua[]; aprovadaPor?: string | null; aprovadaEm?: string | null };
  zapsign: { configurado: boolean; ligada: boolean; ambiente: "sandbox" | "producao" | null };
  podeEditar: boolean;
  cofreLigado: boolean;
  textosPadrao: PassoDaRegua[];
}

export interface AssinaturaDoDocumento {
  id: string;
  documentoId: string;
  situacao: "enviada" | "assinada" | "cancelada";
  signatarios: { nome: string; email?: string; telefone?: string; situacao: string; link?: string }[];
  enviadaEm: string;
  assinadaEm: string | null;
  documentoAssinadoId: string | null;
}

/** De quem é o campo em que a IA ajuda: a API lê o contexto a partir daqui. */
export interface AlvoDoCampo {
  publicacaoId?: string;
  prazoId?: string;
  processoId?: string;
  clienteId?: string;
  mensagemId?: string;
  negocioId?: string;
  alvaraId?: string;
  tipoDePeca?: string;
}

export type RespostaDoCampo =
  | { id: string; situacao: "pronto"; texto: string | null; dicas: string[]; trocados: string[]; aCompletar: number }
  | { id: string; situacao: "recusa"; motivo: string };

/** O que a lei diz para o artigo que está no campo Base legal; sem o texto, `motivo` diz por quê. */
export type LeiDaBase = Pick<CitacaoVerificada, "trecho" | "selo" | "motivo" | "texto" | "fonte">;

export interface TabelaDaBaseLegal {
  ato: string;
  dias: number;
  fundamento: string;
  explicacao: string;
}

export interface ConsultaDaBaseLegal {
  tabela: TabelaDaBaseLegal | null;
  /** O cliente do processo recusou a IA. */
  semIa: boolean;
  /** O texto do campo diz um artigo e uma lei. */
  reconhecida: boolean;
  lei: LeiDaBase[];
}

export type RespostaDaBaseLegal =
  | { id: string; situacao: "pronto"; fundamento: string; explicacao: string; reconhecida: boolean; lei: LeiDaBase[] }
  | { id: string; situacao: "recusa"; motivo: string }
  | { situacao: "tabela"; tabela: TabelaDaBaseLegal; reconhecida: boolean; lei: LeiDaBase[] };
