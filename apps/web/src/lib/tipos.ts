/** O que a API das telas devolve (apps/api/src/rotas). */

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
}

export type SituacaoNaLista = "a_confirmar" | "confirmado" | "peca_em_revisao" | "cumprido" | "descartado";

export interface ProcessoResumido {
  id: string;
  titulo: string;
  cnj: string | null;
  orgao: string | null;
  comarca?: string | null;
  tribunal?: string | null;
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
  publicacao: { id: string; fonte: "djen" | "datajud" | "manual"; texto: string; disponibilizadaEm: string; publicadaEm: string; tipoComunicacao: string | null; tipoDocumento: string | null; link: string | null } | null;
  briefing: Analise<Briefing> | null;
  pecas: { id: string; titulo: string; situacao: "rascunho" | "revisada"; atualizadaEm: string }[];
  historico: { em: string; titulo: string; detalhe: string | null }[];
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
  responsavelId: string | null;
}

export type SituacaoPublicacao = "nova" | "pendente" | "lida" | "vinculada";

export interface Selo {
  tipo: "prazo" | "sem_prazo" | "audiencia" | "sem_teor" | "lendo" | "erro";
  texto: string;
}

export interface CaixaDePublicacoes {
  contagens: Record<SituacaoPublicacao, number>;
  ultimaCaptura: { em: string; hora: string; novas: number; erro: string | null } | null;
  itens: { id: string; titulo: string; disponibilizadaEm: string; partes: string; processoId: string | null; selo: Selo }[];
}

export interface Publicacao {
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
  cliente: { id: string; nome: string } | null;
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
  em: string;
  processo: { id: string; titulo: string } | null;
  cliente: { id: string; nome: string } | null;
  /** Pasta de quem ainda está na triagem (novos negócios). */
  negocio: { id: string; nome: string } | null;
  enviadoPor: Pessoa | null;
}

export type Leitura = "pendente" | "pronta" | "falhou" | null;

export type ItemDaConferencia = "procuracao" | "comprovante_residencia" | "documento_identidade" | "cpf" | "hipossuficiencia" | "contrato_honorarios" | "litispendencia";

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
