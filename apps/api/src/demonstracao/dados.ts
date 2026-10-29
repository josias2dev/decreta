/**
 * Dados do escritório de demonstração. Tudo é inventado: nomes, números de
 * processo, CPFs e telefones. Os processos e textos são os das telas do design
 * (Marina Duarte × Seguradora Alfa, Padaria Bom Grão...).
 *
 * As datas são relativas ao dia em que a demonstração é criada: `fim: 0` vence
 * hoje, `fim: -1` venceu no dia útil anterior, `disp: -1` foi disponibilizada
 * no último dia útil. Assim a tela "Hoje" sempre tem o que mostrar.
 */

export type Quem = "beatriz" | "rafael" | "tiago" | "camila";

export const EQUIPE: Record<Quem, { nome: string; cargo: string; papel: "owner" | "admin" | "member"; oab?: string }> = {
  beatriz: { nome: "Beatriz Souza", cargo: "Advogada", papel: "owner", oab: "41.233" },
  rafael: { nome: "Rafael Freitas", cargo: "Advogado", papel: "admin", oab: "45.678" },
  tiago: { nome: "Tiago Martins", cargo: "Advogado", papel: "member", oab: "52.104" },
  camila: { nome: "Camila Azevedo", cargo: "Estagiária", papel: "member" },
};

export const ESCRITORIO = {
  nome: "Souza & Freitas Advocacia",
  slug: "demonstracao",
  timbre: {
    nome: "Souza & Freitas Advocacia",
    registro: "OAB/SC 9.876",
    endereco: "Rua das Palmeiras, 120, sala 804 · Centro · Joinville/SC · 89201-000",
    contato: "(47) 3433-0000 · contato@souzafreitas.adv.br",
    fonte: "Arial" as const,
    cor: "#3346C4",
  },
};

export interface ClienteDemo {
  nome: string;
  tipo: "pf" | "pj";
  /** CPF sem os 2 verificadores (9 dígitos) ou CNPJ sem eles (12). */
  base: string;
  telefone: string;
  email?: string;
  endereco?: string;
}

export const CLIENTES: Record<string, ClienteDemo> = {
  marina: { nome: "Marina Duarte", tipo: "pf", base: "318204567", telefone: "47991234567", email: "marina.duarte@exemplo.com.br", endereco: "Rua Itajaí, 455, apto 302 · América · Joinville/SC" },
  padaria: { nome: "Padaria Bom Grão Ltda.", tipo: "pj", base: "418273650001", telefone: "47933451200", email: "financeiro@bomgrao.com.br", endereco: "Av. Joca Brandão, 900 · Centro · Itajaí/SC" },
  roberto: { nome: "Roberto Kühn", tipo: "pf", base: "207415398", telefone: "47988127744", endereco: "Rua Dona Francisca, 2210 · Saguaçu · Joinville/SC" },
  ana: { nome: "Ana Lúcia Ferraz", tipo: "pf", base: "512398746", telefone: "48996541230", email: "analucia.ferraz@exemplo.com.br" },
  carlos: { nome: "Carlos Henrique Prado", tipo: "pf", base: "674120385", telefone: "47999812345" },
  eduardo: { nome: "Eduardo Lima", tipo: "pf", base: "145786320", telefone: "47984456712" },
  hotel: { nome: "Hotel Mar Azul Ltda.", tipo: "pj", base: "279845120001", telefone: "47933674000", email: "rh@hotelmarazul.com.br" },
  gilberto: { nome: "Gilberto Weiss", tipo: "pf", base: "389012457", telefone: "47991127788" },
  lucia: { nome: "Lúcia Matos", tipo: "pf", base: "456321789", telefone: "47988341290" },
  jorge: { nome: "Jorge Batista", tipo: "pf", base: "602314785", telefone: "47999024411" },
  helena: { nome: "Helena Vieira", tipo: "pf", base: "731025846", telefone: "47984120933" },
  oficina: { nome: "Auto Center Pioneiro Ltda.", tipo: "pj", base: "334512870001", telefone: "47934221100" },
  sandra: { nome: "Sandra Petry", tipo: "pf", base: "815230476", telefone: "47991782210" },
  joao: { nome: "João Pedro Antunes", tipo: "pf", base: "290346187", telefone: "47988903344" },
  renata: { nome: "Renata Cordeiro", tipo: "pf", base: "538102764", telefone: "48999104456" },
  marcos: { nome: "Marcos Tavares", tipo: "pf", base: "417306925", telefone: "47984501122" },
  vanessa: { nome: "Vanessa Hoffmann", tipo: "pf", base: "693027415", telefone: "47999237788" },
  cooperativa: { nome: "Cooperativa Mista Rio Novo", tipo: "pj", base: "512340980001", telefone: "47935212000" },
  antonio: { nome: "Antônio Reis", tipo: "pf", base: "248150937", telefone: "47988451230" },
  simone: { nome: "Simone Gaspar", tipo: "pf", base: "376214059", telefone: "47991340021" },
};

export interface MovimentacaoDemo {
  /** Dias corridos antes da última publicação do processo. */
  antes: number;
  evento: number;
  titulo: string;
  descricao: string;
  autor: "juizo" | "partes" | "cartorio";
  documento?: { nome: string; paginas: number; texto: string };
}

export interface ProcessoDemo {
  cliente: string;
  titulo: string;
  /** [sequencial, ano, segmento, tribunal, origem]; o verificador é calculado. */
  numero?: [string, string, string, string, string];
  tipo?: "judicial" | "extrajudicial";
  tribunal?: string;
  classe: string;
  assunto: string;
  orgao?: string;
  comarca?: string;
  sistema?: string;
  valor?: number;
  poloCliente: "ativo" | "passivo";
  papelCliente: string;
  outraParte: { nome: string; papel: string; tipo?: "pf" | "pj" };
  responsavel: Quem | null;
  fase?: string;
  /** Dias corridos desde a distribuição. */
  distribuidoHa: number;
  movimentacoes?: MovimentacaoDemo[];
}

const TJSC_JOINVILLE = { tribunal: "TJSC", comarca: "Joinville", sistema: "eproc" };

export const PROCESSOS: Record<string, ProcessoDemo> = {
  marina: {
    cliente: "marina",
    titulo: "Marina Duarte × Seguradora Alfa S.A.",
    numero: ["5004321", "2026", "8", "24", "0038"],
    ...TJSC_JOINVILLE,
    classe: "Procedimento comum cível",
    assunto: "Seguro · indenização por invalidez",
    orgao: "2ª Vara Cível",
    valor: 86400,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Seguradora Alfa S.A.", papel: "Ré", tipo: "pj" },
    responsavel: "beatriz",
    fase: "Instrução · laudo juntado",
    distribuidoHa: 230,
    movimentacoes: [
      { antes: 0, evento: 89, titulo: "Petição da ré", descricao: "Pede esclarecimentos ao perito sobre a falta de vistoria", autor: "partes", documento: { nome: "Petição da ré · pedido de esclarecimentos.docx", paginas: 4, texto: "A ré requer a intimação do perito para esclarecer por que não realizou vistoria no veículo envolvido no acidente, entendendo que a dinâmica do sinistro interfere na avaliação da incapacidade." } },
      { antes: 0, evento: 88, titulo: "Intimação", descricao: "Manifestação das partes sobre o laudo em 15 dias", autor: "juizo" },
      { antes: 7, evento: 87, titulo: "Laudo pericial", descricao: "Incapacidade parcial permanente de 40%; nexo confirmado", autor: "juizo", documento: { nome: "Laudo pericial.docx", paginas: 18, texto: "LAUDO PERICIAL MÉDICO. Periciada: Marina Duarte. Conclusão: há nexo causal entre o acidente de trânsito de 18/01/2026 e as lesões no membro inferior esquerdo. Incapacidade parcial e permanente, fixada em 40% segundo a tabela da Lei 6.194/74. Não foi realizada vistoria no veículo, por não ser necessária à avaliação médica." } },
      { antes: 28, evento: 79, titulo: "Perícia realizada", descricao: "Exame clínico da autora no consultório do perito", autor: "cartorio" },
      { antes: 56, evento: 44, titulo: "Petição da autora", descricao: "Quesitos e indicação de assistente técnico", autor: "partes", documento: { nome: "Quesitos da autora.docx", paginas: 3, texto: "Quesitos da autora: 1. Há nexo causal entre o acidente e as lesões? 2. A incapacidade é permanente? 3. Qual o grau de incapacidade segundo a tabela legal?" } },
      { antes: 77, evento: 38, titulo: "Decisão", descricao: "Saneamento: perícia médica deferida e perito nomeado", autor: "juizo", documento: { nome: "Decisão de saneamento.docx", paginas: 2, texto: "Fixo como ponto controvertido o grau de incapacidade da autora. Defiro a prova pericial médica e nomeio perito o Dr. Paulo Rezende. Honorários pela ré." } },
      { antes: 120, evento: 31, titulo: "Réplica", descricao: "Autora rebate a tese de quitação administrativa", autor: "partes", documento: { nome: "Réplica.docx", paginas: 9, texto: "O pagamento administrativo considerou 15% de incapacidade, sem exame. A quitação dada no recibo não impede a cobrança da diferença (Súmula 474 do STJ)." } },
      { antes: 145, evento: 24, titulo: "Contestação", descricao: "Ré alega pagamento integral na via administrativa", autor: "partes", documento: { nome: "Contestação.docx", paginas: 21, texto: "A ré sustenta que pagou administrativamente R$ 13.500,00, correspondentes a 15% de incapacidade, e que houve quitação." } },
      { antes: 167, evento: 18, titulo: "Audiência de conciliação", descricao: "Sem acordo; proposta de R$ 18.000,00 recusada", autor: "juizo", documento: { nome: "Ata da audiência de conciliação.docx", paginas: 2, texto: "Aberta a audiência, a ré ofereceu R$ 18.000,00 para encerrar o processo. A autora recusou a proposta. Sem acordo." } },
      { antes: 230, evento: 1, titulo: "Distribuição", descricao: "Petição inicial · procedimento comum cível", autor: "partes", documento: { nome: "Petição inicial.docx", paginas: 14, texto: "Marina Duarte move ação de cobrança de diferença de indenização securitária contra Seguradora Alfa S.A. pelo acidente de 18/01/2026, pedindo a diferença entre o grau real de incapacidade e os 15% pagos, com correção desde o pagamento administrativo." } },
    ],
  },
  padaria: {
    cliente: "padaria",
    titulo: "Padaria Bom Grão Ltda. × Rodrigo Alves",
    numero: ["0000812", "2026", "5", "12", "0005"],
    tribunal: "TRT12",
    classe: "Ação trabalhista · rito ordinário",
    assunto: "Horas extras e adicional noturno",
    orgao: "1ª Vara do Trabalho",
    comarca: "Itajaí",
    sistema: "PJe",
    valor: 64200,
    poloCliente: "passivo",
    papelCliente: "Reclamada",
    outraParte: { nome: "Rodrigo Alves", papel: "Reclamante" },
    responsavel: "tiago",
    distribuidoHa: 40,
  },
  roberto: {
    cliente: "roberto",
    titulo: "Roberto Kühn × Transportes Serra Azul Ltda.",
    numero: ["5009876", "2025", "8", "24", "0038"],
    ...TJSC_JOINVILLE,
    classe: "Procedimento comum cível",
    assunto: "Acidente de trânsito · danos materiais e morais",
    orgao: "4ª Vara Cível",
    valor: 124000,
    poloCliente: "ativo",
    papelCliente: "Autor",
    outraParte: { nome: "Transportes Serra Azul Ltda.", papel: "Ré", tipo: "pj" },
    responsavel: "beatriz",
    fase: "Alegações finais",
    distribuidoHa: 410,
  },
  ana: {
    cliente: "ana",
    titulo: "Ana Lúcia Ferraz × Banco Horizonte S.A.",
    numero: ["5011873", "2026", "8", "24", "0023"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Contrato bancário · juros abusivos",
    orgao: "3ª Vara Cível",
    comarca: "Florianópolis",
    sistema: "eproc",
    valor: 38750,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Banco Horizonte S.A.", papel: "Réu", tipo: "pj" },
    responsavel: "beatriz",
    distribuidoHa: 95,
  },
  carlos: {
    cliente: "carlos",
    titulo: "Carlos Henrique Prado × Construtora Vale Norte",
    numero: ["5007745", "2026", "8", "24", "0008"],
    tribunal: "TJSC",
    classe: "Procedimento do Juizado Especial Cível",
    assunto: "Atraso na entrega de imóvel",
    orgao: "Juizado Especial Cível",
    comarca: "Blumenau",
    sistema: "eproc",
    valor: 28000,
    poloCliente: "ativo",
    papelCliente: "Autor",
    outraParte: { nome: "Construtora Vale Norte Ltda.", papel: "Ré", tipo: "pj" },
    responsavel: "rafael",
    distribuidoHa: 60,
  },
  eduardo: {
    cliente: "eduardo",
    titulo: "Eduardo Lima × Unimed Litoral",
    numero: ["5003390", "2026", "8", "24", "0005"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Plano de saúde · negativa de cobertura",
    orgao: "1ª Vara Cível",
    comarca: "Balneário Camboriú",
    sistema: "eproc",
    valor: 52000,
    poloCliente: "ativo",
    papelCliente: "Autor",
    outraParte: { nome: "Unimed Litoral Cooperativa de Trabalho Médico", papel: "Ré", tipo: "pj" },
    responsavel: null,
    distribuidoHa: 30,
  },
  hotel: {
    cliente: "hotel",
    titulo: "Hotel Mar Azul Ltda. × Fernanda Rocha",
    numero: ["0001145", "2026", "5", "12", "0045"],
    tribunal: "TRT12",
    classe: "Ação trabalhista · rito sumaríssimo",
    assunto: "Verbas rescisórias",
    orgao: "2ª Vara do Trabalho",
    comarca: "Balneário Camboriú",
    sistema: "PJe",
    valor: 21400,
    poloCliente: "passivo",
    papelCliente: "Reclamada",
    outraParte: { nome: "Fernanda Rocha", papel: "Reclamante" },
    responsavel: "rafael",
    distribuidoHa: 120,
  },
  gilberto: {
    cliente: "gilberto",
    titulo: "Gilberto Weiss × Cooperativa Agro Vale",
    numero: ["5000456", "2024", "8", "24", "0054"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Cédula de crédito rural",
    orgao: "1ª Vara Cível",
    comarca: "Rio do Sul",
    sistema: "eproc",
    valor: 210000,
    poloCliente: "ativo",
    papelCliente: "Autor",
    outraParte: { nome: "Cooperativa Agro Vale", papel: "Ré", tipo: "pj" },
    responsavel: "camila",
    fase: "Recurso",
    distribuidoHa: 700,
  },
  lucia: {
    cliente: "lucia",
    titulo: "Lúcia Matos × Município de Brusque",
    numero: ["5002210", "2025", "8", "24", "0011"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Servidor público · adicional de insalubridade",
    orgao: "Vara da Fazenda Pública",
    comarca: "Brusque",
    sistema: "eproc",
    valor: 47300,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Município de Brusque", papel: "Réu", tipo: "pj" },
    responsavel: "rafael",
    fase: "Apelação do Município",
    distribuidoHa: 380,
  },
  luciaPrevidencia: {
    cliente: "lucia",
    titulo: "Lúcia Matos × Instituto de Previdência de Brusque",
    numero: ["5003114", "2025", "8", "24", "0011"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Revisão de pensão por morte",
    orgao: "Vara da Fazenda Pública",
    comarca: "Brusque",
    sistema: "eproc",
    valor: 33800,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Instituto de Previdência de Brusque", papel: "Réu", tipo: "pj" },
    responsavel: "rafael",
    distribuidoHa: 300,
  },
  jorge: {
    cliente: "jorge",
    titulo: "Jorge Batista × Mercado Bom Preço Ltda.",
    numero: ["0000977", "2026", "5", "12", "0004"],
    tribunal: "TRT12",
    classe: "Ação trabalhista · rito ordinário",
    assunto: "Rescisão indireta",
    orgao: "4ª Vara do Trabalho",
    comarca: "Joinville",
    sistema: "PJe",
    valor: 58900,
    poloCliente: "ativo",
    papelCliente: "Reclamante",
    outraParte: { nome: "Mercado Bom Preço Ltda.", papel: "Reclamada", tipo: "pj" },
    responsavel: "tiago",
    distribuidoHa: 75,
  },
  helena: {
    cliente: "helena",
    titulo: "Helena Vieira × Instituto Nacional do Seguro Social",
    numero: ["5018822", "2026", "4", "04", "7201"],
    tribunal: "TRF4",
    classe: "Procedimento comum",
    assunto: "Aposentadoria por incapacidade permanente",
    orgao: "2ª Vara Federal",
    comarca: "Joinville",
    sistema: "eproc",
    valor: 71500,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Instituto Nacional do Seguro Social", papel: "Réu", tipo: "pj" },
    responsavel: "beatriz",
    distribuidoHa: 150,
  },
  oficina: {
    cliente: "oficina",
    titulo: "Auto Center Pioneiro Ltda. × Distribuidora Peças Sul",
    numero: ["5012450", "2025", "8", "24", "0038"],
    ...TJSC_JOINVILLE,
    classe: "Execução de título extrajudicial",
    assunto: "Duplicata",
    orgao: "1ª Vara Cível",
    valor: 18600,
    poloCliente: "ativo",
    papelCliente: "Exequente",
    outraParte: { nome: "Distribuidora Peças Sul Ltda.", papel: "Executada", tipo: "pj" },
    responsavel: "camila",
    distribuidoHa: 330,
  },
  sandra: {
    cliente: "sandra",
    titulo: "Sandra Petry × Gilmar Petry",
    numero: ["5006671", "2026", "8", "24", "0038"],
    ...TJSC_JOINVILLE,
    classe: "Divórcio litigioso",
    assunto: "Divórcio · partilha e guarda",
    orgao: "1ª Vara da Família",
    poloCliente: "ativo",
    papelCliente: "Requerente",
    outraParte: { nome: "Gilmar Petry", papel: "Requerido" },
    responsavel: "beatriz",
    distribuidoHa: 85,
  },
  joao: {
    cliente: "joao",
    titulo: "João Pedro Antunes × Banco Horizonte S.A.",
    numero: ["5000981", "2026", "8", "24", "0036"],
    tribunal: "TJSC",
    classe: "Procedimento do Juizado Especial Cível",
    assunto: "Negativação indevida",
    orgao: "Juizado Especial Cível",
    comarca: "Jaraguá do Sul",
    sistema: "eproc",
    valor: 15000,
    poloCliente: "ativo",
    papelCliente: "Autor",
    outraParte: { nome: "Banco Horizonte S.A.", papel: "Réu", tipo: "pj" },
    responsavel: "rafael",
    distribuidoHa: 45,
  },
  renata: {
    cliente: "renata",
    titulo: "Renata Cordeiro × Clínica Sorriso Pleno",
    numero: ["5021334", "2025", "8", "24", "0023"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Erro odontológico",
    orgao: "5ª Vara Cível",
    comarca: "Florianópolis",
    sistema: "eproc",
    valor: 45000,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Clínica Sorriso Pleno Ltda.", papel: "Ré", tipo: "pj" },
    responsavel: "tiago",
    distribuidoHa: 260,
  },
  marcos: {
    cliente: "marcos",
    titulo: "Construtora Litoral Norte × Marcos Tavares",
    numero: ["5008890", "2026", "8", "24", "0005"],
    tribunal: "TJSC",
    classe: "Procedimento comum cível",
    assunto: "Cobrança · contrato de empreitada",
    orgao: "2ª Vara Cível",
    comarca: "Balneário Camboriú",
    sistema: "eproc",
    valor: 96000,
    poloCliente: "passivo",
    papelCliente: "Réu",
    outraParte: { nome: "Construtora Litoral Norte Ltda.", papel: "Autora", tipo: "pj" },
    responsavel: "beatriz",
    distribuidoHa: 20,
  },
  vanessa: {
    cliente: "vanessa",
    titulo: "Vanessa Hoffmann × Instituto Nacional do Seguro Social",
    numero: ["5020176", "2026", "4", "04", "7201"],
    tribunal: "TRF4",
    classe: "Procedimento do Juizado Especial Cível",
    assunto: "Salário-maternidade",
    orgao: "Juizado Especial Federal",
    comarca: "Joinville",
    sistema: "eproc",
    valor: 9800,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Instituto Nacional do Seguro Social", papel: "Réu", tipo: "pj" },
    responsavel: "camila",
    distribuidoHa: 50,
  },
  cooperativa: {
    cliente: "cooperativa",
    titulo: "Cooperativa Mista Rio Novo · revisão do estatuto",
    tipo: "extrajudicial",
    classe: "Consultivo",
    assunto: "Revisão do estatuto social e regimento interno",
    poloCliente: "ativo",
    papelCliente: "Cliente",
    outraParte: { nome: "Assembleia geral", papel: "—" },
    responsavel: "rafael",
    distribuidoHa: 25,
  },
  antonio: {
    cliente: "antonio",
    titulo: "Antônio Reis × Transportadora Vale Verde",
    numero: ["0000533", "2025", "5", "12", "0028"],
    tribunal: "TRT12",
    classe: "Ação trabalhista · rito ordinário",
    assunto: "Acidente de trabalho",
    orgao: "Vara do Trabalho",
    comarca: "Rio do Sul",
    sistema: "PJe",
    valor: 132000,
    poloCliente: "ativo",
    papelCliente: "Reclamante",
    outraParte: { nome: "Transportadora Vale Verde Ltda.", papel: "Reclamada", tipo: "pj" },
    responsavel: "tiago",
    distribuidoHa: 240,
  },
  simone: {
    cliente: "simone",
    titulo: "Simone Gaspar × Condomínio Residencial Atlântico",
    numero: ["5004418", "2026", "8", "24", "0038"],
    ...TJSC_JOINVILLE,
    classe: "Procedimento do Juizado Especial Cível",
    assunto: "Danos em unidade · infiltração",
    orgao: "Juizado Especial Cível",
    valor: 12400,
    poloCliente: "ativo",
    papelCliente: "Autora",
    outraParte: { nome: "Condomínio Residencial Atlântico", papel: "Réu", tipo: "pj" },
    responsavel: "camila",
    distribuidoHa: 35,
  },
};

/** O que a IA "leu" na publicação, guardado como se ela tivesse acabado de ler. */
export interface SugestaoDemo {
  tipo: string;
  dias: number | null;
  contagem?: "uteis" | "corridos";
  fundamento?: string | null;
  resumo: string;
  assunto: string;
  audiencia?: { emDiasUteis: number; hora: string; tipo: string; porVideo: boolean };
}

export interface PublicacaoDemo {
  processo: string;
  /** Dias úteis antes de hoje em que foi disponibilizada (1 = o último dia útil). */
  disp: number;
  tipoComunicacao: string;
  tipoDocumento: string;
  teor: string;
  situacao: "nova" | "pendente" | "lida";
  /** `null`: a IA recusou (sem teor). */
  sugestao: SugestaoDemo | null;
}

export const TEOR_MARINA =
  "Intimem-se as partes para, querendo, manifestarem-se sobre o laudo pericial juntado no evento 87, no prazo comum de 15 (quinze) dias. Após, voltem conclusos para sentença.";

/** A caixa de Publicações: 7 novas, 3 pendentes e algumas lidas. */
export const PUBLICACOES: PublicacaoDemo[] = [
  {
    processo: "marina",
    disp: 1,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: TEOR_MARINA,
    situacao: "nova",
    sugestao: { tipo: "Manifestação sobre laudo pericial", dias: 15, fundamento: "art. 477, § 1º, CPC", resumo: "Intimação para falar do laudo pericial do evento 87.", assunto: "laudo pericial" },
  },
  {
    processo: "luciaPrevidencia",
    disp: 1,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Sentença",
    teor: "SENTENÇA. Ante o exposto, JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar o réu a revisar a pensão por morte da autora desde o requerimento administrativo, afastando o pedido de dano moral. Sucumbência recíproca. Publique-se. Registre-se. Intimem-se.",
    situacao: "nova",
    sugestao: { tipo: "Apelação", dias: 15, fundamento: "art. 1.003, § 5º, CPC", resumo: "Sentença parcialmente procedente: revisão deferida, dano moral negado.", assunto: "sentença" },
  },
  {
    processo: "eduardo",
    disp: 1,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: "Cumpra-se o acórdão. Aguarde-se o retorno do agravo de instrumento e, após, voltem conclusos para decisão sobre a tutela de urgência.",
    situacao: "nova",
    sugestao: { tipo: "", dias: null, resumo: "Despacho de mero expediente: aguardar o agravo.", assunto: "cumpra-se" },
  },
  {
    processo: "carlos",
    disp: 2,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: "Designo audiência de instrução e julgamento para a data indicada no sistema, às 15h, na sala de audiências do Juizado Especial Cível de Blumenau. As partes deverão comparecer acompanhadas de suas testemunhas, até o máximo de três, independentemente de intimação.",
    situacao: "nova",
    sugestao: { tipo: "", dias: null, resumo: "Audiência de instrução designada.", assunto: "audiência designada", audiencia: { emDiasUteis: 10, hora: "15:00", tipo: "Instrução e julgamento", porVideo: false } },
  },
  {
    processo: "hotel",
    disp: 2,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Notificação",
    teor: "Sem teor disponível. Consulte o processo no sistema.",
    situacao: "nova",
    sugestao: null,
  },
  {
    processo: "jorge",
    disp: 2,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Decisão",
    teor: "Defiro a produção de prova testemunhal. Intime-se o reclamante para, no prazo de 5 (cinco) dias, apresentar o rol de testemunhas, sob pena de preclusão.",
    situacao: "nova",
    sugestao: { tipo: "Rol de testemunhas", dias: 5, fundamento: "art. 825, CLT", resumo: "Prova testemunhal deferida; rol em 5 dias.", assunto: "rol de testemunhas" },
  },
  {
    processo: "marcos",
    disp: 1,
    tipoComunicacao: "Citação",
    tipoDocumento: "Despacho",
    teor: "Cite-se o réu para, querendo, contestar a ação no prazo de 15 (quinze) dias úteis, sob pena de revelia. Dispensada a audiência de conciliação, por manifestação expressa da autora.",
    situacao: "nova",
    sugestao: { tipo: "Contestação", dias: 15, fundamento: "art. 335, CPC", resumo: "Citação para contestar em 15 dias úteis.", assunto: "citação" },
  },
  {
    processo: "eduardo",
    disp: 6,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: "Intime-se a parte autora para regularizar a representação processual, juntando procuração atualizada, no prazo de 5 (cinco) dias, sob pena de extinção.",
    situacao: "pendente",
    sugestao: { tipo: "Juntar procuração atualizada", dias: 5, fundamento: "art. 76, CPC", resumo: "Regularizar a procuração em 5 dias.", assunto: "procuração" },
  },
  {
    processo: "renata",
    disp: 3,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: "Intime-se a parte autora para, no prazo de 15 (quinze) dias, especificar as provas que pretende produzir, justificando a pertinência.",
    situacao: "pendente",
    sugestao: { tipo: "Especificação de provas", dias: 15, fundamento: null, resumo: "Especificar provas em 15 dias.", assunto: "especificação de provas" },
  },
  {
    processo: "helena",
    disp: 4,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Ato ordinatório",
    teor: "Fica a parte autora intimada a se manifestar, no prazo de 15 (quinze) dias, sobre a contestação apresentada pelo INSS no evento 21.",
    situacao: "pendente",
    sugestao: { tipo: "Réplica à contestação", dias: 15, fundamento: "art. 351, CPC", resumo: "Réplica à contestação do INSS.", assunto: "réplica" },
  },
  {
    processo: "oficina",
    disp: 3,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Despacho",
    teor: "Junte-se. Aguarde-se o cumprimento do mandado de penhora.",
    situacao: "lida",
    sugestao: { tipo: "", dias: null, resumo: "Junte-se; aguardar a penhora.", assunto: "junte-se" },
  },
  {
    processo: "sandra",
    disp: 5,
    tipoComunicacao: "Intimação",
    tipoDocumento: "Ato ordinatório",
    teor: "Remetam-se os autos ao CEJUSC para sessão de mediação familiar.",
    situacao: "lida",
    sugestao: { tipo: "", dias: null, resumo: "Autos enviados ao CEJUSC.", assunto: "mediação" },
  },
];

export interface PrazoDemo {
  processo: string;
  tipo: string;
  fundamento: string | null;
  dias: number;
  contagem?: "uteis" | "corridos";
  /** Dias úteis a partir de hoje (0 = vence hoje, -1 = venceu no dia útil anterior). */
  fim: number;
  responsavel?: Quem | null;
  estado: "confirmado" | "cumprido";
  /** `djen`: nasce de uma publicação já vinculada; `manual`: digitado pela equipe. */
  fonte: "djen" | "manual";
  teor?: string;
  /** Rascunho de peça em revisão. */
  peca?: { tipo: string; titulo: string; texto: string };
}

/** Prazos já confirmados (ou cumpridos). Os "a confirmar" nascem das publicações acima. */
export const PRAZOS: PrazoDemo[] = [
  { processo: "padaria", tipo: "Contestação trabalhista", fundamento: "art. 847, CLT", dias: 10, fim: -1, estado: "confirmado", fonte: "djen", teor: "Notifique-se a reclamada para apresentar defesa escrita no PJe até a data da audiência, no prazo de 10 (dez) dias." },
  {
    processo: "roberto",
    tipo: "Alegações finais",
    fundamento: "art. 364, § 2º, CPC",
    dias: 15,
    fim: 0,
    estado: "confirmado",
    fonte: "djen",
    teor: "Encerrada a instrução, concedo às partes o prazo sucessivo de 15 (quinze) dias para apresentação de alegações finais por memoriais.",
    peca: {
      tipo: "alegacoes-finais",
      titulo: "Alegações finais · Roberto Kühn",
      texto: [
        "EXCELENTÍSSIMO SENHOR DOUTOR JUIZ DE DIREITO DA 4ª VARA CÍVEL DA COMARCA DE JOINVILLE/SC",
        "",
        "**ROBERTO KÜHN**, já qualificado nos autos da ação que move em face de **TRANSPORTES SERRA AZUL LTDA.**, vem apresentar ALEGAÇÕES FINAIS POR MEMORIAIS.",
        "",
        "## 1. DOS FATOS PROVADOS",
        "",
        "A prova testemunhal confirmou que o caminhão da ré invadiu a preferencial e atingiu o veículo do autor. O boletim de ocorrência e as fotografias juntadas na inicial vão no mesmo sentido.",
        "",
        "## 2. DOS DANOS",
        "",
        "Os orçamentos de conserto não foram impugnados de forma específica. [COMPLETAR: valor atualizado dos lucros cessantes]",
        "",
        "## 3. DOS PEDIDOS",
        "",
        "Requer a procedência integral dos pedidos, com a condenação da ré nos termos da inicial. [JURISPRUDÊNCIA: responsabilidade objetiva da transportadora]",
      ].join("\n"),
    },
  },
  { processo: "ana", tipo: "Réplica à contestação", fundamento: "art. 351, CPC", dias: 15, fim: 0, estado: "confirmado", fonte: "djen", teor: "Intime-se a parte autora para, no prazo de 15 (quinze) dias, manifestar-se sobre a contestação e os documentos que a acompanham." },
  { processo: "hotel", tipo: "Embargos de declaração", fundamento: "art. 897-A, CLT", dias: 5, fim: 1, estado: "confirmado", fonte: "djen", teor: "Intimem-se as partes da sentença proferida no evento 52." },
  { processo: "gilberto", tipo: "Recolher custas do recurso", fundamento: "art. 1.007, CPC", dias: 5, fim: 1, estado: "confirmado", fonte: "manual" },
  { processo: "lucia", tipo: "Contrarrazões de apelação", fundamento: "art. 1.010, § 1º, CPC", dias: 15, fim: 5, estado: "confirmado", fonte: "djen", teor: "Recebo a apelação interposta pelo Município. Intime-se a apelada para contrarrazões no prazo legal." },
  { processo: "jorge", tipo: "Manifestação sobre documentos", fundamento: null, dias: 5, fim: 2, estado: "confirmado", fonte: "djen", teor: "Manifeste-se o reclamante sobre os documentos juntados pela reclamada, no prazo de 5 (cinco) dias." },
  { processo: "helena", tipo: "Quesitos e assistente técnico", fundamento: "art. 465, § 1º, CPC", dias: 15, fim: 3, estado: "confirmado", fonte: "djen", teor: "Defiro a perícia médica. Intimem-se as partes para apresentar quesitos e indicar assistente técnico em 15 dias." },
  { processo: "oficina", tipo: "Indicar bens à penhora", fundamento: null, dias: 15, fim: 4, estado: "confirmado", fonte: "djen", teor: "Intime-se a exequente para indicar bens passíveis de penhora, no prazo de 15 (quinze) dias." },
  { processo: "sandra", tipo: "Manifestação sobre estudo social", fundamento: null, dias: 15, fim: 6, estado: "confirmado", fonte: "djen", teor: "Juntado o estudo social, manifestem-se as partes em 15 dias." },
  { processo: "joao", tipo: "Recurso inominado", fundamento: "art. 42, Lei 9.099/95", dias: 10, fim: 7, estado: "confirmado", fonte: "djen", teor: "Sentença: julgo improcedente o pedido. Sem custas e honorários nesta instância (art. 55 da Lei 9.099/95). Intimem-se." },
  { processo: "renata", tipo: "Impugnação ao laudo", fundamento: "art. 477, § 1º, CPC", dias: 15, fim: 9, estado: "confirmado", fonte: "djen", teor: "Intimem-se as partes sobre o laudo odontológico juntado, em 15 dias." },
  { processo: "antonio", tipo: "Razões finais", fundamento: "art. 850, CLT", dias: 5, fim: 3, estado: "confirmado", fonte: "manual" },
  { processo: "vanessa", tipo: "Juntar CNIS atualizado", fundamento: null, dias: 10, fim: 8, estado: "confirmado", fonte: "manual" },
  { processo: "simone", tipo: "Manifestação sobre contestação", fundamento: null, dias: 15, fim: 12, estado: "confirmado", fonte: "djen", teor: "Manifeste-se a autora sobre a contestação, em 15 dias." },
  { processo: "padaria", tipo: "Juntar documentos da defesa", fundamento: null, dias: 10, fim: 14, estado: "confirmado", fonte: "manual" },
  { processo: "marina", tipo: "Quesitos e assistente técnico", fundamento: "art. 465, § 1º, CPC", dias: 15, fim: -40, estado: "cumprido", fonte: "djen", teor: "Defiro a prova pericial. Intimem-se as partes para apresentar quesitos e indicar assistente técnico no prazo de 15 dias." },
  { processo: "roberto", tipo: "Rol de testemunhas", fundamento: "art. 357, § 4º, CPC", dias: 15, fim: -30, estado: "cumprido", fonte: "djen", teor: "Designo audiência de instrução. Apresentem as partes o rol de testemunhas em 15 dias." },
  { processo: "ana", tipo: "Emenda à inicial", fundamento: "art. 321, CPC", dias: 15, fim: -50, estado: "cumprido", fonte: "djen", teor: "Emende a autora a inicial, em 15 dias, juntando o contrato e os extratos." },
];

export interface AudienciaDemo {
  processo: string;
  /** Dias úteis a partir de hoje. */
  dia: number;
  hora: string;
  tipo: string;
  porVideo: boolean;
  local: string;
  responsavel: Quem;
  preparada?: boolean;
}

export const AUDIENCIAS: AudienciaDemo[] = [
  { processo: "carlos", dia: 0, hora: "14:30", tipo: "Conciliação", porVideo: true, local: "https://videoconf.tjsc.jus.br/sala/jec-blumenau-3", responsavel: "rafael", preparada: true },
  { processo: "antonio", dia: 0, hora: "16:00", tipo: "Instrução e julgamento", porVideo: false, local: "Vara do Trabalho de Rio do Sul · Rua XV de Novembro, 1200", responsavel: "tiago" },
  { processo: "sandra", dia: 3, hora: "10:00", tipo: "Mediação", porVideo: false, local: "CEJUSC de Joinville · Fórum, 2º andar", responsavel: "beatriz" },
  { processo: "padaria", dia: 6, hora: "13:30", tipo: "Una", porVideo: false, local: "1ª Vara do Trabalho de Itajaí", responsavel: "tiago" },
  { processo: "simone", dia: 8, hora: "09:15", tipo: "Conciliação", porVideo: true, local: "https://videoconf.tjsc.jus.br/sala/jec-joinville-1", responsavel: "camila" },
];

export const TAREFAS: { titulo: string; detalhe: string; dia: number; responsavel: Quem; processo?: string; negocio?: string }[] = [
  { titulo: "Cobrar documentos do cliente novo", detalhe: "faltam RG e comprovante de residência", dia: 0, responsavel: "rafael", negocio: "jose" },
  { titulo: "Ligar para a cliente sobre o laudo", detalhe: "explicar o resultado da perícia e os próximos passos", dia: 1, responsavel: "beatriz", processo: "marina" },
  { titulo: "Conferir cálculo das verbas rescisórias", detalhe: "planilha enviada pelo contador do hotel", dia: 2, responsavel: "camila", processo: "hotel" },
  { titulo: "Pedir certidão de inteiro teor", detalhe: "para instruir o recurso", dia: 4, responsavel: "camila", processo: "gilberto" },
];

export const NEGOCIOS: { chave: string; nome: string; telefone: string; assunto: string; area: string; pasta: "completa" | "faltam_documentos" | "sem_pasta"; etapa: "triagem" | "repassado" | "concluido" | "desistiu"; responsavel: Quem | null; feitos: number; observacoes?: string }[] = [
  { chave: "jose", nome: "José Antunes", telefone: "47991208833", assunto: "Revisão de aposentadoria", area: "Previdenciário", pasta: "faltam_documentos", etapa: "triagem", responsavel: "rafael", feitos: 2, observacoes: "Faltam RG e comprovante de residência." },
  { chave: "luiza", nome: "Luiza Brandt", telefone: "47988014422", assunto: "Indenização por acidente de moto", area: "Cível", pasta: "completa", etapa: "triagem", responsavel: "beatriz", feitos: 6 },
  { chave: "paulo", nome: "Paulo Siqueira", telefone: "47999321177", assunto: "Horas extras · motorista", area: "Trabalhista", pasta: "sem_pasta", etapa: "triagem", responsavel: "tiago", feitos: 0 },
  { chave: "teresa", nome: "Teresa Mello", telefone: "48996671200", assunto: "Inventário", area: "Família e sucessões", pasta: "faltam_documentos", etapa: "triagem", responsavel: "beatriz", feitos: 1 },
  { chave: "fabio", nome: "Fábio Krüger", telefone: "47984459011", assunto: "Cobrança de cheques", area: "Cível", pasta: "sem_pasta", etapa: "triagem", responsavel: null, feitos: 0 },
  { chave: "rosa", nome: "Rosa Lemos", telefone: "47991560032", assunto: "Benefício assistencial (BPC)", area: "Previdenciário", pasta: "completa", etapa: "triagem", responsavel: "camila", feitos: 6 },
  { chave: "igor", nome: "Igor Paiva", telefone: "47988770011", assunto: "Rescisão de contrato de aluguel", area: "Cível", pasta: "completa", etapa: "repassado", responsavel: "rafael", feitos: 6 },
];

export const ALVARAS: { processo: string; descricao: string; valor: number; etapa: "novo" | "aguardando_saque" | "sacado" | "repassado" | "finalizado"; expedidoHa: number; recebido?: number }[] = [
  { processo: "oficina", descricao: "Valor bloqueado via Sisbajud", valor: 7420.55, etapa: "novo", expedidoHa: 1 },
  { processo: "jorge", descricao: "Depósito recursal liberado", valor: 12978.0, etapa: "aguardando_saque", expedidoHa: 6 },
  { processo: "vanessa", descricao: "RPV · salário-maternidade", valor: 9612.4, etapa: "aguardando_saque", expedidoHa: 9 },
  { processo: "ana", descricao: "Depósito judicial do réu", valor: 4180.0, etapa: "sacado", expedidoHa: 14, recebido: 4180.0 },
  { processo: "joao", descricao: "Acordo homologado · 1ª parcela", valor: 3500.0, etapa: "repassado", expedidoHa: 30, recebido: 3500.0 },
];

export const ATENDIMENTOS: { cliente: string; processo?: string; haDias: number; canal: "presencial" | "telefone" | "whatsapp" | "video" | "email"; resumo: string; autor: Quem }[] = [
  { cliente: "marina", processo: "marina", haDias: 9, canal: "whatsapp", resumo: "Cliente perguntou sobre a perícia. Expliquei que o laudo sai em até 10 dias e que vamos avisar. Pedi o comprovante das despesas médicas de agosto.", autor: "beatriz" },
  { cliente: "marina", processo: "marina", haDias: 60, canal: "presencial", resumo: "Reunião para preparar a perícia: levar exames, receitas e relatório do ortopedista. Assistente técnico indicado: Dra. Juliana Prates.", autor: "beatriz" },
  { cliente: "padaria", processo: "padaria", haDias: 5, canal: "video", resumo: "Reunião com o sócio da padaria. Vai mandar os cartões de ponto e os recibos de pagamento dos últimos 2 anos.", autor: "tiago" },
  { cliente: "carlos", processo: "carlos", haDias: 2, canal: "telefone", resumo: "Confirmou presença na audiência por vídeo. Testou o link da sala.", autor: "rafael" },
];

/** Resumo dos autos da Marina: lido até o evento 88, antes da petição da ré. */
export const RESUMO_MARINA = {
  oQueFazer: ["Protocolar a manifestação sobre o laudo até {fim} e, em seguida, preparar memoriais.", "Depois das manifestações o processo vai concluso para sentença."],
  pontosDeAtencao: ["O laudo não fez vistoria no veículo; é o ponto que a ré tende a explorar.", "A cliente ainda não entregou o comprovante das despesas médicas de agosto."],
  estrategia: "Apoiar o laudo, pedir o julgamento e cobrar a diferença entre os 40% do laudo e os 15% pagos pela ré, com correção desde o pagamento administrativo.",
  ultimoAto: "{disp} · Intimação das partes para manifestação sobre o laudo em 15 dias úteis (evento 88).",
};

export const BRIEFING_MARINA = {
  decidiu: "Juntou o laudo pericial e abriu prazo comum de 15 dias úteis para as duas partes se manifestarem. Depois disso o processo vai concluso para sentença, sem nova audiência.",
  fazer: ["Protocolar manifestação até {fim} concordando com a conclusão do laudo, pedindo o julgamento e reforçando o pedido de correção desde o pagamento administrativo."],
  aFavor: ["O perito confirmou o nexo entre o acidente e a incapacidade parcial (laudo, evento 87).", "O percentual de 40% fica acima do que a seguradora pagou administrativamente (contestação, evento 24)."],
  contra: ["O laudo não fez vistoria no veículo; a seguradora já pediu esclarecimentos sobre isso (evento 89)."],
};

export const PREPARACAO_CARLOS = {
  oQueE: "Audiência de conciliação do Juizado Especial, por vídeo. Não há produção de provas; é a chance de acordo antes da instrução.",
  objetivo: "Sair com proposta de indenização pelos 7 meses de atraso ou com a instrução marcada, sem abrir mão do dano moral.",
  controvertidos: ["Se o atraso passou do prazo de tolerância de 180 dias do contrato (cláusula 9ª).", "Se a falta de mão de obra na pandemia afasta a culpa da construtora (contestação)."],
  criticos: ["O cliente assinou aditivo prorrogando a entrega por 60 dias; a ré vai usar isso.", "Sem comprovante dos aluguéis pagos no período, o dano material fica fraco."],
  checklist: ["Testar o link da sala com o cliente 15 minutos antes", "Ter à mão os recibos de aluguel de março a setembro", "Combinar com o cliente o valor mínimo para acordo", "Procuração e documento com foto do cliente"],
};

export const CHAT_MARINA = [
  { papel: "pessoa" as const, quem: "beatriz" as Quem, texto: "A seguradora já fez proposta de acordo?" },
  { papel: "ia" as const, quem: "beatriz" as Quem, texto: "Sim, uma vez. Na audiência de conciliação (evento 18) a ré ofereceu R$ 18.000,00, recusados pela autora. Não há proposta posterior nos autos.\n\nFonte: Ata da audiência · evento 18" },
];

export const SUSPENSOES: { dia: string; motivo: string; tipo: "local" | "forense" | "recesso" | "reduzido"; tribunal?: string; comarca?: string }[] = [
  { dia: "2027-03-09", motivo: "Aniversário de Joinville", tipo: "local", comarca: "Joinville" },
  { dia: "2026-11-25", motivo: "Instabilidade do eproc (portaria da Presidência)", tipo: "forense", tribunal: "TJSC" },
];
