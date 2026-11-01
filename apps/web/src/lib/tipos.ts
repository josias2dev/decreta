/** O que a API das telas devolve (apps/api/src/rotas). */
import type { AchadoDaAuditoria } from "@decreta/core";

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
  usuario: Pessoa & { cargo: string | null; papel: string };
  escritorio: { id: string; nome: string; pessoas: number; timezone: string; logo?: boolean; demonstracao?: boolean };
  hoje: string;
  ia: boolean;
  equipe: (Pessoa & { cargo: string | null; papel: string })[];
  menu: { prazos: number; prazosHoje: number; publicacoes: number; processos: number; clientes: number; negocios: number; alvaras: number };
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
}

export interface PainelDoDia {
  hoje: string;
  rotulo: string;
  contadores: { vencemHoje: number; vencidos: number; publicacoesNovas: number; publicacoesComPrazo: number; audienciasHoje: number; alvarasAguardando: number };
  itens: ItemDoDia[];
  publicacoes: { id: string; titulo: string; detalhe: string }[];
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

/** A prévia da conta nos diálogos: com a intimação pelo sistema, vale o que vence primeiro. */
export interface PreviaDaConta extends ContagemNaTela {
  pelo: "publicacao" | "sistema";
  outra: { inicio: string; fim: string } | null;
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
  responsavelId: string | null;
}

export type SituacaoPublicacao = "nova" | "pendente" | "lida" | "vinculada";

export interface Selo {
  tipo: "prazo" | "sem_prazo" | "audiencia" | "sem_teor" | "lendo" | "erro" | "sem_ia";
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

export interface ProcessoNaLista {
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
  proximoPrazo: { fim: string; tipo: string; urgencia: Urgencia; quando: string } | null;
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
  processos: { id: string; titulo: string; cnj: string | null; orgao: string | null; situacao: string; responsavel: Pessoa | null }[];
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
  processo?: { id: string; titulo: string; cnj: string | null } | null;
  processoId?: string | null;
  responsavel: Pessoa | null;
  situacao?: string;
  concluida?: boolean;
  urgencia?: Urgencia;
  aConfirmar?: boolean;
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
  /** Como o escritório faz cada peça, pelo tipo do catálogo; "geral" vale para todas. */
  jeito?: Record<string, JeitoDaPeca>;
  datajudLigado: boolean;
  iaLigada: boolean;
  suspensoes: { id: string; dia: string; motivo: string; tipo: "local" | "forense" | "recesso" | "reduzido"; tribunal: string | null; comarca: string | null }[];
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
}

export interface Equipe {
  pessoas: PessoaDaEquipe[];
  convites: { id: string; email: string; papel: string; expiraEm: string; link?: string }[];
  emailLigado: boolean;
}

export interface Feriados {
  ano: number;
  tribunal: string;
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
}

export interface Registro {
  itens: { id: string; em: string; nome: string | null; acao: string; rotulo: string; detalhes: Record<string, unknown> }[];
}

/** Mensagem do escritório ao cliente no WhatsApp: só sai depois que um advogado aprova. */
export interface MensagemAoCliente {
  id: string;
  tipo: "decisao" | "documentos";
  situacao: "rascunho" | "enviada" | "falhou" | "descartada";
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
