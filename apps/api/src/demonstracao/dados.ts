/**
 * Dados do escritório de demonstração. Tudo é inventado: nomes, números de
 * processo, CPFs e telefones. Os processos e textos são os das telas do design
 * (Marina Duarte × Seguradora Alfa, Padaria Bom Grão...).
 *
 * As datas são relativas ao dia em que a demonstração é criada: `fim: 0` vence
 * hoje, `fim: -1` venceu no dia útil anterior, `disp: -1` foi disponibilizada
 * no último dia útil. Assim a tela "Hoje" sempre tem o que mostrar.
 */
import { LOGIN_DA_DEMONSTRACAO, SLUG_DA_DEMONSTRACAO } from "./slug.ts";

export type Quem = "beatriz" | "rafael" | "tiago" | "camila";

export const EQUIPE: Record<Quem, { nome: string; cargo: string; papel: "owner" | "admin" | "member"; oab?: string; email?: string }> = {
  beatriz: { nome: "Beatriz Souza", cargo: "Advogada", papel: "owner", oab: "41.233", email: LOGIN_DA_DEMONSTRACAO },
  rafael: { nome: "Rafael Freitas", cargo: "Advogado", papel: "admin", oab: "45.678" },
  tiago: { nome: "Tiago Martins", cargo: "Advogado", papel: "member", oab: "52.104" },
  camila: { nome: "Camila Azevedo", cargo: "Estagiária", papel: "member" },
};

export const ESCRITORIO = {
  nome: "Souza & Freitas Advocacia",
  slug: SLUG_DA_DEMONSTRACAO,
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
  /** Dias desde o cadastro. */
  desdeHa?: number;
}

export const CLIENTES: Record<string, ClienteDemo> = {
  marina: { nome: "Marina Duarte", tipo: "pf", base: "318204567", telefone: "47991234567", email: "marina.duarte@exemplo.com.br", endereco: "Rua Itajaí, 455, apto 302 · América · Joinville/SC" },
  padaria: { nome: "Padaria Bom Grão Ltda.", tipo: "pj", base: "418273650001", telefone: "4733451200", email: "financeiro@bomgrao.com.br", endereco: "Av. Joca Brandão, 900 · Centro · Itajaí/SC" },
  roberto: { nome: "Roberto Kühn", tipo: "pf", base: "207415398", telefone: "47988127744", endereco: "Rua Dona Francisca, 2210 · Saguaçu · Joinville/SC" },
  ana: { nome: "Ana Lúcia Ferraz", tipo: "pf", base: "512398746", telefone: "48996541230", email: "analucia.ferraz@exemplo.com.br" },
  carlos: { nome: "Carlos Henrique Prado", tipo: "pf", base: "674120385", telefone: "47999812345" },
  eduardo: { nome: "Eduardo Lima", tipo: "pf", base: "145786320", telefone: "47984456712" },
  hotel: { nome: "Hotel Mar Azul Ltda.", tipo: "pj", base: "279845120001", telefone: "4733674000", email: "rh@hotelmarazul.com.br" },
  gilberto: { nome: "Gilberto Weiss", tipo: "pf", base: "389012457", telefone: "47991127788" },
  lucia: { nome: "Lúcia Matos", tipo: "pf", base: "456321789", telefone: "47988341290" },
  jorge: { nome: "Jorge Batista", tipo: "pf", base: "602314785", telefone: "47999024411" },
  helena: { nome: "Helena Vieira", tipo: "pf", base: "731025846", telefone: "47984120933" },
  oficina: { nome: "Auto Center Pioneiro Ltda.", tipo: "pj", base: "334512870001", telefone: "4734221100" },
  sandra: { nome: "Sandra Petry", tipo: "pf", base: "815230476", telefone: "47991782210" },
  joao: { nome: "João Pedro Antunes", tipo: "pf", base: "290346187", telefone: "47988903344" },
  renata: { nome: "Renata Cordeiro", tipo: "pf", base: "538102764", telefone: "48999104456" },
  marcos: { nome: "Marcos Tavares", tipo: "pf", base: "417306925", telefone: "47984501122" },
  vanessa: { nome: "Vanessa Hoffmann", tipo: "pf", base: "693027415", telefone: "47999237788" },
  cooperativa: { nome: "Cooperativa Mista Rio Novo", tipo: "pj", base: "512340980001", telefone: "4735212000" },
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
  situacao?: "ativo" | "suspenso" | "arquivado" | "encerrado";
  segredo?: boolean;
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
    titulo: "Eduardo Lima × Saúde Litoral Planos",
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
    outraParte: { nome: "Saúde Litoral Planos de Saúde S.A.", papel: "Ré", tipo: "pj" },
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
    segredo: true,
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

const mov = (antes: number, evento: number, titulo: string, descricao: string, autor: MovimentacaoDemo["autor"], documento?: MovimentacaoDemo["documento"]): MovimentacaoDemo => ({ antes, evento, titulo, descricao, autor, ...(documento ? { documento } : {}) });
const inicial = (texto: string, paginas = 12) => ({ nome: "Petição inicial.docx", paginas, texto });

/**
 * O andamento dos outros processos principais, até a publicação que está na
 * caixa ou o prazo que está aberto. `antes` conta da última disponibilização.
 */
export const ANDAMENTOS: Record<string, MovimentacaoDemo[]> = {
  padaria: [
    mov(15, 4, "Notificação", "Reclamada notificada para defesa e audiência una", "cartorio"),
    mov(39, 1, "Distribuição", "Reclamação trabalhista · rito ordinário", "partes", inicial("Rodrigo Alves ajuíza reclamação trabalhista contra Padaria Bom Grão Ltda., onde trabalhou como padeiro no turno da madrugada. Pede horas extras, adicional noturno e reflexos, com base nos horários que diz ter cumprido das 22h às 6h.", 9)),
  ],
  roberto: [
    mov(21, 37, "Intimação", "Alegações finais por memoriais em 15 dias", "juizo"),
    mov(23, 36, "Audiência de instrução", "Ouvidas três testemunhas; instrução encerrada", "juizo", { nome: "Ata da audiência de instrução.docx", paginas: 4, texto: "Ouvidas as testemunhas Pedro Lenz e Márcia Fontes, arroladas pelo autor, e Valdir Rosa, arrolado pela ré. As duas primeiras confirmaram que o caminhão avançou a via preferencial. Encerrada a instrução." }),
    mov(63, 31, "Decisão", "Saneamento: designada audiência de instrução; rol de testemunhas em 15 dias", "juizo"),
    mov(330, 19, "Réplica", "Autor rebate a tese de culpa concorrente", "partes"),
    mov(362, 14, "Contestação", "Ré atribui a culpa ao autor, por excesso de velocidade", "partes", { nome: "Contestação.docx", paginas: 15, texto: "Transportes Serra Azul Ltda. sustenta que o autor trafegava acima da velocidade da via e que isso causou o acidente. Impugna os orçamentos e o pedido de danos morais." }),
    mov(380, 9, "Audiência de conciliação", "Sem acordo; a ré ofereceu R$ 20.000,00", "juizo"),
    mov(409, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Roberto Kühn pede indenização por danos materiais e morais contra Transportes Serra Azul Ltda., cujo caminhão invadiu a via preferencial e atingiu o carro do autor em Joinville. Junta boletim de ocorrência, fotografias e três orçamentos de conserto.")),
  ],
  ana: [
    mov(21, 17, "Intimação", "Réplica à contestação em 15 dias", "juizo"),
    mov(23, 16, "Contestação", "Banco defende a taxa contratada e a capitalização mensal", "partes", { nome: "Contestação.docx", paginas: 18, texto: "O Banco Horizonte S.A. sustenta que a taxa foi livremente pactuada, que a capitalização mensal está prevista no contrato e que não há abusividade." }),
    mov(44, 12, "Citação", "Réu citado pelo portal eletrônico", "cartorio"),
    mov(60, 9, "Decisão", "Recebida a emenda; dispensada a audiência de conciliação", "juizo"),
    mov(70, 7, "Emenda à inicial", "Autora junta o contrato e os extratos", "partes"),
    mov(91, 4, "Despacho", "Emendar a inicial: juntar o contrato e os extratos", "juizo"),
    mov(94, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Ana Lúcia Ferraz pede a revisão de contrato de empréstimo pessoal com o Banco Horizonte S.A., com juros de 9,8% ao mês, muito acima da taxa média do Banco Central para a operação, e a devolução do que pagou a mais.")),
  ],
  carlos: [
    mov(1, 9, "Despacho", "Designada audiência de instrução e julgamento", "juizo"),
    mov(40, 5, "Citação", "Ré citada por carta com aviso de recebimento", "cartorio"),
    mov(52, 3, "Designação de audiência", "Sessão de conciliação por videoconferência", "cartorio"),
    mov(59, 1, "Distribuição", "Petição inicial · juizado especial cível", "partes", inicial("Carlos Henrique Prado pede indenização contra a Construtora Vale Norte Ltda. pelo atraso de 14 meses na entrega do apartamento comprado na planta em Blumenau: os aluguéis pagos no período e danos morais.", 8)),
  ],
  eduardo: [
    mov(0, 10, "Despacho", "Cumpra-se o acórdão; aguardar o retorno do agravo", "juizo"),
    mov(8, 8, "Despacho", "Regularizar a procuração em 5 dias", "juizo"),
    mov(24, 5, "Agravo de instrumento", "Autor recorre ao TJSC contra o indeferimento da tutela", "partes"),
    mov(27, 3, "Decisão", "Tutela de urgência indeferida", "juizo"),
    mov(29, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Eduardo Lima pede que a Saúde Litoral Planos de Saúde S.A. autorize a cirurgia indicada pelo médico, negada por suposta doença preexistente, com pedido de tutela de urgência.")),
  ],
  hotel: [
    mov(6, 53, "Intimação", "Partes intimadas da sentença", "cartorio"),
    mov(8, 52, "Sentença", "Reclamação parcialmente procedente: diferenças rescisórias e multa do art. 477", "juizo", { nome: "Sentença.docx", paginas: 6, texto: "Julgo parcialmente procedentes os pedidos para condenar a reclamada ao pagamento das diferenças de verbas rescisórias e da multa do art. 477, § 8º, da CLT. Improcede o pedido de horas extras. Custas pela reclamada, sobre o valor provisório de R$ 9.000,00." }),
    mov(84, 14, "Audiência una", "Sem acordo; ouvidas as partes e uma testemunha", "juizo", { nome: "Ata da audiência una.docx", paginas: 3, texto: "Proposta de acordo de R$ 6.000,00 recusada pela reclamante. Ouvidas as partes e a testemunha Joana Pires. Encerrada a instrução, com razões finais remissivas." }),
    mov(112, 6, "Notificação", "Reclamada notificada para a audiência una", "cartorio"),
    mov(119, 1, "Distribuição", "Reclamação trabalhista · rito sumaríssimo", "partes", inicial("Fernanda Rocha, camareira do Hotel Mar Azul Ltda. por três anos, diz que não recebeu as verbas rescisórias completas nem a multa do art. 477 da CLT, e pede a diferença com os reflexos.", 7)),
  ],
  gilberto: [
    mov(8, 50, "Embargos de declaração", "Rejeitados os embargos do autor", "juizo"),
    mov(20, 47, "Acórdão", "Apelação desprovida, por maioria", "juizo"),
    mov(300, 41, "Remessa ao TJSC", "Apelação distribuída à 3ª Câmara de Direito Comercial", "cartorio"),
    mov(385, 35, "Apelação", "Autor apela da sentença", "partes"),
    mov(400, 33, "Sentença", "Pedidos julgados improcedentes", "juizo", { nome: "Sentença.docx", paginas: 8, texto: "Julgo improcedentes os pedidos. Embora comprovada a perda de safra, o autor não pediu o alongamento na via administrativa antes do vencimento. Custas e honorários de 10% pelo autor." }),
    mov(560, 24, "Laudo pericial", "Perícia agronômica confirma perda de 46% da safra de soja", "juizo", { nome: "Laudo pericial agronômico.docx", paginas: 26, texto: "A perícia confirmou perda de 46% da produção de soja na safra 2023/2024, por estiagem, comprovada por laudo técnico e pelas notas de venda." }),
    mov(640, 11, "Contestação", "Cooperativa nega a quebra de safra e defende os encargos", "partes"),
    mov(699, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Gilberto Weiss, produtor rural, pede a revisão da cédula de crédito rural emitida em favor da Cooperativa Agro Vale, com o alongamento da dívida previsto em lei para a quebra de safra, e a exclusão dos encargos de inadimplência.", 16)),
  ],
  lucia: [
    mov(14, 33, "Despacho", "Recebida a apelação; contrarrazões no prazo legal", "juizo"),
    mov(40, 31, "Apelação", "Município apela da sentença", "partes"),
    mov(120, 27, "Sentença", "Pedido procedente: grau máximo e atrasados", "juizo", { nome: "Sentença.docx", paginas: 7, texto: "Acolho o laudo pericial e JULGO PROCEDENTE o pedido para condenar o Município de Brusque a pagar à autora o adicional de insalubridade em grau máximo, com os atrasados dos últimos cinco anos, corrigidos." }),
    mov(250, 18, "Laudo pericial", "Perito conclui pela insalubridade em grau máximo", "juizo", { nome: "Laudo pericial.docx", paginas: 14, texto: "O trabalho na ala de isolamento expõe a servidora a pacientes com doenças infectocontagiosas de forma habitual e permanente. Insalubridade em grau máximo." }),
    mov(340, 9, "Contestação", "Município sustenta que o grau médio já pago é o correto", "partes"),
    mov(379, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Lúcia Matos, técnica de enfermagem do Município de Brusque, pede o adicional de insalubridade em grau máximo pelo trabalho na ala de isolamento da unidade de pronto atendimento, com os atrasados dos últimos cinco anos.")),
  ],
  luciaPrevidencia: [
    mov(0, 23, "Sentença", "Pedidos parcialmente procedentes: revisão deferida, dano moral negado", "juizo", { nome: "Sentença.docx", paginas: 6, texto: "JULGO PARCIALMENTE PROCEDENTES os pedidos para condenar o réu a revisar a pensão por morte da autora desde o requerimento administrativo, incluindo a gratificação incorporada. Afasto o pedido de dano moral. Sucumbência recíproca." }),
    mov(90, 19, "Decisão", "Julgamento antecipado: matéria só de direito", "juizo"),
    mov(200, 12, "Réplica", "Autora rebate o cálculo do instituto", "partes"),
    mov(260, 7, "Contestação", "Instituto defende o cálculo pela última remuneração-base", "partes"),
    mov(299, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Lúcia Matos pede a revisão da pensão por morte paga pelo Instituto de Previdência de Brusque, calculada sem a gratificação que o marido recebia havia mais de dez anos.")),
  ],
  jorge: [
    mov(1, 18, "Decisão", "Deferida a prova testemunhal; rol em 5 dias", "juizo"),
    mov(4, 16, "Despacho", "Reclamante deve se manifestar sobre os documentos em 5 dias", "juizo"),
    mov(12, 15, "Petição da reclamada", "Junta extratos do FGTS e recibos de salário", "partes"),
    mov(40, 11, "Audiência inicial", "Sem acordo; defesa e documentos recebidos", "juizo"),
    mov(66, 5, "Notificação", "Reclamada notificada para a audiência inicial", "cartorio"),
    mov(74, 1, "Distribuição", "Reclamação trabalhista · rito ordinário", "partes", inicial("Jorge Batista, repositor do Mercado Bom Preço Ltda., pede a rescisão indireta do contrato pelos salários pagos com atraso nos últimos seis meses e pelo FGTS não recolhido, com as verbas rescisórias e a multa de 40%.", 10)),
  ],
  helena: [
    mov(4, 22, "Ato ordinatório", "Autora intimada a se manifestar sobre a contestação", "cartorio"),
    mov(6, 21, "Contestação", "INSS alega que a autora pode exercer outras funções", "partes", { nome: "Contestação do INSS.docx", paginas: 5, texto: "O INSS sustenta que a perícia administrativa não constatou incapacidade total e que a autora pode ser reabilitada para funções que não exijam esforço físico." }),
    mov(17, 19, "Decisão", "Deferida a perícia médica; quesitos em 15 dias", "juizo"),
    mov(140, 4, "Decisão", "Indeferida a tutela de urgência; citado o INSS", "juizo"),
    mov(149, 1, "Distribuição", "Petição inicial · procedimento comum", "partes", inicial("Helena Vieira, costureira de 58 anos, pede a aposentadoria por incapacidade permanente, negada pelo INSS, por hérnia de disco lombar e artrose nos joelhos, com laudos do ortopedista desde 2024.")),
  ],
  oficina: [
    mov(1, 25, "Alvará", "Expedido alvará do valor bloqueado", "cartorio"),
    mov(3, 24, "Despacho", "Junte-se; aguardar o mandado de penhora", "juizo"),
    mov(15, 22, "Despacho", "Exequente deve indicar outros bens em 15 dias", "juizo"),
    mov(120, 17, "Decisão", "Rejeitada a alegação de impenhorabilidade", "juizo"),
    mov(200, 13, "Penhora on-line", "Sisbajud bloqueou R$ 7.420,55", "juizo"),
    mov(280, 8, "Citação", "Executada citada; não pagou nem indicou bens", "cartorio"),
    mov(320, 4, "Despacho", "Cite-se para pagar em 3 dias; honorários de 10%", "juizo"),
    mov(329, 1, "Distribuição", "Execução de título extrajudicial · duplicatas", "partes", inicial("Auto Center Pioneiro Ltda. executa três duplicatas mercantis aceitas e não pagas pela Distribuidora Peças Sul Ltda., no total de R$ 18.600,00, com protesto e comprovante de entrega das mercadorias.", 6)),
  ],
  sandra: [
    mov(6, 18, "Ato ordinatório", "Autos remetidos ao CEJUSC para mediação", "cartorio"),
    mov(13, 17, "Estudo social", "Juntado o estudo social; manifestação em 15 dias", "juizo", { nome: "Estudo social.docx", paginas: 5, texto: "A assistente social visitou as duas casas. Os filhos têm boa relação com ambos os pais e rotina escolar estável na casa da mãe. Recomenda a guarda compartilhada, com residência materna." }),
    mov(38, 13, "Contestação", "Requerido concorda com o divórcio e discute a partilha", "partes"),
    mov(60, 9, "Citação", "Requerido citado por oficial de justiça", "cartorio"),
    mov(80, 4, "Decisão", "Fixados alimentos provisórios de 25% do salário", "juizo"),
    mov(84, 1, "Distribuição", "Petição inicial · divórcio litigioso", "partes", inicial("Sandra Petry pede o divórcio de Gilmar Petry, a partilha da casa e do carro comprados durante o casamento e a guarda compartilhada dos dois filhos, com residência na casa da mãe e alimentos de 30% do salário do pai.", 10)),
  ],
  joao: [
    mov(4, 12, "Sentença", "Pedido julgado improcedente", "juizo", { nome: "Sentença.docx", paginas: 4, texto: "Dispensado o relatório. O réu juntou o contrato do cartão assinado digitalmente, com foto e geolocalização, e faturas pagas pelo autor. A dívida existe. JULGO IMPROCEDENTE o pedido. Sem custas e honorários nesta instância (art. 55 da Lei 9.099/95)." }),
    mov(18, 8, "Contestação", "Banco junta o contrato assinado digitalmente", "partes", { nome: "Contestação.docx", paginas: 11, texto: "O Banco Horizonte S.A. junta o contrato de cartão assinado digitalmente, com foto e geolocalização, e as faturas pagas pelo autor em 2024." }),
    mov(20, 7, "Sessão de conciliação", "Sem acordo entre as partes", "juizo"),
    mov(38, 3, "Designação de audiência", "Sessão de conciliação por vídeo", "cartorio"),
    mov(44, 1, "Distribuição", "Petição inicial · juizado especial cível", "partes", inicial("João Pedro Antunes pede a retirada do seu nome dos cadastros de inadimplentes e indenização por danos morais contra o Banco Horizonte S.A., por uma dívida de cartão de crédito que diz nunca ter contratado.", 7)),
  ],
  renata: [
    mov(3, 24, "Despacho", "Especificar provas em 15 dias", "juizo"),
    mov(8, 22, "Laudo pericial", "Perito aponta erro no planejamento dos implantes", "juizo", { nome: "Laudo pericial odontológico.docx", paginas: 12, texto: "Os implantes foram instalados sem a tomografia prévia recomendada e em ângulo inadequado, o que causou a perda de dois deles. Não há indício de falta de cuidado da paciente no pós-operatório." }),
    mov(150, 14, "Decisão", "Saneamento: perícia odontológica deferida", "juizo"),
    mov(200, 10, "Réplica", "Autora rebate a tese de falta de cuidados", "partes"),
    mov(230, 6, "Contestação", "Clínica atribui a falha à falta de cuidados pós-operatórios", "partes"),
    mov(259, 1, "Distribuição", "Petição inicial · procedimento comum cível", "partes", inicial("Renata Cordeiro pede indenização contra a Clínica Sorriso Pleno Ltda. por implantes dentários mal posicionados, que exigiram nova cirurgia em outra clínica: o reembolso de R$ 14.800,00 e danos morais.")),
  ],
  marcos: [
    mov(1, 4, "Despacho", "Cite-se o réu; dispensada a audiência de conciliação", "juizo"),
    mov(19, 1, "Distribuição", "Petição inicial · cobrança", "partes", inicial("Construtora Litoral Norte Ltda. cobra de Marcos Tavares R$ 96.000,00 pela reforma de uma casa em Balneário Camboriú, alegando que a última etapa da obra foi entregue e não foi paga.", 9)),
  ],
  vanessa: [
    mov(9, 14, "RPV", "Expedida requisição de pequeno valor (RPV)", "cartorio"),
    mov(22, 11, "Sentença", "Homologado o acordo com o INSS", "juizo"),
    mov(30, 9, "Proposta de acordo", "INSS propõe pagar 90% dos atrasados", "partes"),
    mov(45, 4, "Citação", "INSS citado pelo portal eletrônico", "cartorio"),
    mov(49, 1, "Distribuição", "Petição inicial · salário-maternidade", "partes", inicial("Vanessa Hoffmann, contribuinte individual, pede o salário-maternidade negado pelo INSS por suposta falta de carência, com as guias de contribuição pagas desde 2023.", 6)),
  ],
  cooperativa: [
    mov(6, 3, "Ajustes", "Diretoria devolveu a minuta com ajustes no capítulo das sobras", "partes"),
    mov(15, 2, "Minuta", "Primeira minuta do novo estatuto enviada à diretoria", "partes", { nome: "Minuta do estatuto.docx", paginas: 14, texto: "Minuta do estatuto social da Cooperativa Mista Rio Novo, com as mudanças pedidas pela diretoria: mandato de quatro anos para o conselho, assembleia por meio eletrônico e novo critério de distribuição das sobras." }),
    mov(24, 1, "Abertura do caso", "Reunião com a diretoria para levantar os pontos do estatuto", "partes"),
  ],
  antonio: [
    mov(30, 28, "Despacho", "Designada audiência de instrução", "juizo"),
    mov(120, 23, "Manifestação sobre o laudo", "Reclamante concorda com o laudo; reclamada impugna", "partes"),
    mov(150, 19, "Laudo pericial", "Laudo aponta redução de 25% da capacidade de trabalho", "juizo", { nome: "Laudo pericial médico.docx", paginas: 11, texto: "O reclamante tem sequela no ombro direito, com redução de 25% da capacidade de trabalho, e nexo com o acidente de 2025. Não está apto a dirigir caminhão." }),
    mov(200, 12, "Audiência inicial", "Sem acordo; defesa recebida", "juizo"),
    mov(230, 5, "Notificação", "Reclamada notificada para a audiência inicial", "cartorio"),
    mov(239, 1, "Distribuição", "Reclamação trabalhista · rito ordinário", "partes", inicial("Antônio Reis, motorista de caminhão da Transportadora Vale Verde Ltda., pede indenização por danos materiais, morais e estéticos pelo acidente de 2025, quando o caminhão da empresa perdeu o freio, e a estabilidade acidentária de 12 meses.", 14)),
  ],
  simone: [
    mov(4, 7, "Despacho", "Autora deve se manifestar sobre a contestação", "juizo"),
    mov(6, 6, "Contestação", "Condomínio diz que a infiltração vem do apartamento de cima", "partes"),
    mov(26, 3, "Citação", "Condomínio citado por carta", "cartorio"),
    mov(34, 1, "Distribuição", "Petição inicial · juizado especial cível", "partes", inicial("Simone Gaspar pede que o Condomínio Residencial Atlântico conserte a infiltração que vem da área comum e atinge o seu apartamento, e indenize os danos no forro e nos móveis, orçados em R$ 7.400,00.", 6)),
  ],
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
  { processo: "padaria", tipo: "Juntar documentos da defesa", fundamento: null, dias: 20, fim: 14, estado: "confirmado", fonte: "manual" },
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
  /** Sem ela, marcada. */
  situacao?: "marcada" | "realizada" | "cancelada" | "redesignada";
}

export const AUDIENCIAS: AudienciaDemo[] = [
  { processo: "carlos", dia: 0, hora: "14:30", tipo: "Conciliação", porVideo: true, local: "https://videoconf.tjsc.jus.br/sala/jec-blumenau-3", responsavel: "rafael", preparada: true },
  { processo: "antonio", dia: 0, hora: "16:00", tipo: "Instrução e julgamento", porVideo: false, local: "Vara do Trabalho de Rio do Sul · Rua XV de Novembro, 1200", responsavel: "tiago" },
  { processo: "sandra", dia: 3, hora: "10:00", tipo: "Mediação", porVideo: false, local: "CEJUSC de Joinville · Fórum, 2º andar", responsavel: "beatriz" },
  { processo: "padaria", dia: 6, hora: "13:30", tipo: "Una", porVideo: false, local: "1ª Vara do Trabalho de Itajaí", responsavel: "tiago" },
  { processo: "simone", dia: 8, hora: "09:15", tipo: "Conciliação", porVideo: true, local: "https://videoconf.tjsc.jus.br/sala/jec-joinville-1", responsavel: "camila" },
];

export interface TarefaDemo {
  titulo: string;
  detalhe: string;
  /** Dias úteis a partir de hoje. */
  dia: number;
  responsavel: Quem;
  processo?: string;
  negocio?: string;
  concluida?: boolean;
}

export const TAREFAS: TarefaDemo[] = [
  { titulo: "Cobrar documentos do cliente novo", detalhe: "faltam RG e comprovante de residência", dia: 0, responsavel: "rafael", negocio: "jose" },
  { titulo: "Ligar para a cliente sobre o laudo", detalhe: "explicar o resultado da perícia e os próximos passos", dia: 1, responsavel: "beatriz", processo: "marina" },
  { titulo: "Conferir cálculo das verbas rescisórias", detalhe: "planilha enviada pelo contador do hotel", dia: 2, responsavel: "camila", processo: "hotel" },
  { titulo: "Pedir certidão de inteiro teor", detalhe: "para instruir o recurso", dia: 4, responsavel: "camila", processo: "gilberto" },
];

export interface NegocioDemo {
  chave: string;
  nome: string;
  telefone: string;
  assunto: string;
  area: string;
  pasta: "completa" | "faltam_documentos" | "sem_pasta";
  etapa: "triagem" | "repassado" | "concluido" | "desistiu";
  responsavel: Quem | null;
  feitos: number;
  observacoes?: string;
}

export const NEGOCIOS: NegocioDemo[] = [
  { chave: "jose", nome: "José Antunes", telefone: "47991208833", assunto: "Revisão de aposentadoria", area: "Previdenciário", pasta: "faltam_documentos", etapa: "triagem", responsavel: "rafael", feitos: 2, observacoes: "Faltam RG e comprovante de residência." },
  { chave: "luiza", nome: "Luiza Brandt", telefone: "47988014422", assunto: "Indenização por acidente de moto", area: "Cível", pasta: "completa", etapa: "triagem", responsavel: "beatriz", feitos: 6 },
  { chave: "paulo", nome: "Paulo Siqueira", telefone: "47999321177", assunto: "Horas extras · motorista", area: "Trabalhista", pasta: "sem_pasta", etapa: "triagem", responsavel: "tiago", feitos: 0 },
  { chave: "teresa", nome: "Teresa Mello", telefone: "48996671200", assunto: "Inventário", area: "Família e sucessões", pasta: "faltam_documentos", etapa: "triagem", responsavel: "beatriz", feitos: 1 },
  { chave: "fabio", nome: "Fábio Krüger", telefone: "47984459011", assunto: "Cobrança de cheques", area: "Cível", pasta: "sem_pasta", etapa: "triagem", responsavel: null, feitos: 0 },
  { chave: "rosa", nome: "Rosa Lemos", telefone: "47991560032", assunto: "Benefício assistencial (BPC)", area: "Previdenciário", pasta: "completa", etapa: "triagem", responsavel: "camila", feitos: 6 },
  { chave: "igor", nome: "Igor Paiva", telefone: "47988770011", assunto: "Rescisão de contrato de aluguel", area: "Cível", pasta: "completa", etapa: "repassado", responsavel: "rafael", feitos: 6 },
  { chave: "murilo", nome: "Murilo Fontana", telefone: "47991452266", assunto: "Vínculo de emprego · motorista de aplicativo", area: "Trabalhista", pasta: "faltam_documentos", etapa: "triagem", responsavel: "tiago", feitos: 3, observacoes: "Falta o extrato das corridas dos últimos 12 meses." },
  { chave: "ines", nome: "Inês Carvalho", telefone: "47984337120", assunto: "Revisão de financiamento imobiliário", area: "Cível", pasta: "faltam_documentos", etapa: "triagem", responsavel: "rafael", feitos: 2 },
  { chave: "celia", nome: "Célia Wagner", telefone: "47999615048", assunto: "Pensão alimentícia", area: "Família e sucessões", pasta: "completa", etapa: "repassado", responsavel: "beatriz", feitos: 6 },
  { chave: "neusa", nome: "Neusa Bertoldi", telefone: "47988204417", assunto: "Aposentadoria rural", area: "Previdenciário", pasta: "completa", etapa: "concluido", responsavel: "tiago", feitos: 6, observacoes: "Virou cliente; processo distribuído." },
  { chave: "otavio", nome: "Otávio Linhares", telefone: "47991870035", assunto: "Danos morais · negativação", area: "Consumidor", pasta: "completa", etapa: "concluido", responsavel: "rafael", feitos: 6 },
  { chave: "laura", nome: "Laura Esteves", telefone: "48996120874", assunto: "Auxílio-acidente", area: "Previdenciário", pasta: "completa", etapa: "concluido", responsavel: "camila", feitos: 6 },
  { chave: "denise", nome: "Denise Arruda", telefone: "47984096651", assunto: "Usucapião de terreno", area: "Cível", pasta: "sem_pasta", etapa: "desistiu", responsavel: "beatriz", feitos: 1, observacoes: "Preferiu esperar o inventário do pai." },
  { chave: "wilson", nome: "Wilson Prestes", telefone: "47999318840", assunto: "Recurso de multa de trânsito", area: "Administrativo", pasta: "sem_pasta", etapa: "desistiu", responsavel: null, feitos: 0, observacoes: "Pagou a multa com desconto." },
];

export interface AlvaraDemo {
  processo: string;
  descricao: string;
  valor: number;
  etapa: "novo" | "aguardando_saque" | "sacado" | "repassado" | "finalizado";
  expedidoHa: number;
  recebido?: number;
}

export const ALVARAS: AlvaraDemo[] = [
  { processo: "oficina", descricao: "Valor bloqueado via Sisbajud", valor: 7420.55, etapa: "novo", expedidoHa: 1 },
  { processo: "jorge", descricao: "Depósito recursal liberado", valor: 12978.0, etapa: "aguardando_saque", expedidoHa: 6 },
  { processo: "vanessa", descricao: "RPV · salário-maternidade", valor: 9612.4, etapa: "aguardando_saque", expedidoHa: 9 },
  { processo: "ana", descricao: "Depósito judicial do réu", valor: 4180.0, etapa: "sacado", expedidoHa: 14, recebido: 4180.0 },
];

export interface AtendimentoDemo {
  cliente: string;
  processo?: string;
  haDias: number;
  canal: "presencial" | "telefone" | "whatsapp" | "video" | "email";
  resumo: string;
  autor: Quem;
}

export const ATENDIMENTOS: AtendimentoDemo[] = [
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
