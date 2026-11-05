/**
 * Os planos e a licença de cada escritório: as contas puras. Os planos moram no banco (tabela `planos`) e são
 * editados no painel da plataforma; o preço não fica mais no código.
 *
 * A licença de um escritório é plano + pessoas a mais + limites + validade. Um plano tem versão: mudar o preço
 * de um plano cria a versão seguinte, e quem já assina continua na versão em que assinou até a equipe mudar de
 * propósito. Passar de um limite avisa o escritório e não trava o trabalho: só o que gera custo novo para (a IA).
 */
import { somarMeses } from "./assinatura.ts";
import { somarDias, type Dia } from "./datas.ts";

/* ---------------- O plano ---------------- */

/** Os limites que um plano pode ter. Ausente ou nulo: sem limite. */
export const LIMITES_DO_PLANO = ["processos", "oabs", "iaMesUsd", "arquivosGb", "whatsappDia"] as const;
export type ChaveDoLimite = (typeof LIMITES_DO_PLANO)[number];
export type LimitesDoPlano = Partial<Record<ChaveDoLimite, number | null>>;

export const ROTULO_DO_LIMITE: Record<ChaveDoLimite, { rotulo: string; unidade: string; inteiro: boolean }> = {
  processos: { rotulo: "Processos monitorados", unidade: "processos", inteiro: true },
  oabs: { rotulo: "OABs", unidade: "OABs", inteiro: true },
  iaMesUsd: { rotulo: "Gasto de IA por mês", unidade: "US$", inteiro: false },
  arquivosGb: { rotulo: "Espaço de arquivos", unidade: "GB", inteiro: false },
  whatsappDia: { rotulo: "Mensagens de WhatsApp por dia", unidade: "mensagens", inteiro: true },
};

/** O que um plano pode deixar de fora. Ausente: ligada. */
export const FUNCIONALIDADES_DO_PLANO = ["pecas", "financeiro", "assinatura"] as const;
export type FuncionalidadeDoPlano = (typeof FUNCIONALIDADES_DO_PLANO)[number];
export type FuncionalidadesDoPlano = Partial<Record<FuncionalidadeDoPlano, boolean>>;

export const ROTULO_DA_FUNCIONALIDADE_DO_PLANO: Record<FuncionalidadeDoPlano, string> = {
  pecas: "Gerar peças",
  financeiro: "Financeiro e honorários",
  assinatura: "Assinatura eletrônica",
};

export interface Plano {
  id: string;
  /** O mesmo em todas as versões do plano. */
  codigo: string;
  versao: number;
  nome: string;
  /** Nulo: o preço ainda não foi decidido, e ninguém assina este plano. */
  mensalCentavos: number | null;
  /** O preço do ano inteiro, quando há plano anual. */
  anualCentavos: number | null;
  /** Nulo: sem limite de pessoas. */
  pessoasIncluidas: number | null;
  pessoaExtraCentavos: number | null;
  limites: LimitesDoPlano;
  funcionalidades: FuncionalidadesDoPlano;
  /** O plano com que o escritório novo começa. Só a versão viva de um plano é padrão. */
  padrao: boolean;
  criadoEm: string;
  criadoPor: string | null;
  /** Quando a versão seguinte tomou o lugar desta. Quem já está nesta continua nela. */
  substituidoEm: string | null;
}

/** O plano com que o Decreta começa: o de sempre, sem preço, sem limite e com tudo ligado. A migração 0035 grava este. */
export const PLANO_INICIAL = {
  codigo: "escritorio",
  nome: "Escritório",
  mensalCentavos: null,
  anualCentavos: null,
  pessoasIncluidas: null,
  pessoaExtraCentavos: null,
  limites: {},
  funcionalidades: {},
} as const satisfies Omit<Plano, "id" | "versao" | "padrao" | "criadoEm" | "criadoPor" | "substituidoEm">;

/** A duração do teste, quando ninguém mudou no painel. */
export const TESTE_DIAS_PADRAO = 14;

export const funcionalidadeLiberada = (plano: Pick<Plano, "funcionalidades">, f: FuncionalidadeDoPlano) => plano.funcionalidades[f] !== false;

/**
 * A funcionalidade do plano que uma rota das telas usa para gravar, ou nulo. Só gravar para quando o plano deixa a
 * funcionalidade de fora: ler continua liberado, e o que o escritório já tem não fica preso.
 */
export function funcionalidadeDaRota(metodo: string, caminho: string): FuncionalidadeDoPlano | null {
  if (metodo === "GET" || metodo === "HEAD" || metodo === "OPTIONS") return null;
  if (/^\/pecas(\/|$)/.test(caminho)) return "pecas";
  if (/^\/financeiro(\/|$)/.test(caminho)) return "financeiro";
  if (/^\/assinaturas\//.test(caminho) || /^\/documentos\/[^/]+\/assinatura$/.test(caminho)) return "assinatura";
  return null;
}

export const avisoForaDoPlano = (f: FuncionalidadeDoPlano) => `${ROTULO_DA_FUNCIONALIDADE_DO_PLANO[f]} não faz parte do plano do escritório. Para incluir, fale com a equipe do Decreta.`;

/** O limite de um plano, ou nulo sem limite. */
export const limiteDoPlano = (plano: Pick<Plano, "limites">, chave: ChaveDoLimite): number | null => {
  const v = plano.limites[chave];
  return typeof v === "number" && v > 0 ? v : null;
};

/** Quanto o anual economiza sobre doze mensalidades (0 a 1), ou nulo sem os dois preços. */
export function descontoDoAnual(plano: Pick<Plano, "mensalCentavos" | "anualCentavos">): number | null {
  if (!plano.mensalCentavos || !plano.anualCentavos) return null;
  const doze = plano.mensalCentavos * 12;
  return doze > plano.anualCentavos ? (doze - plano.anualCentavos) / doze : 0;
}

/* ---------------- A marca, o desconto e o preço do escritório ---------------- */

/** Uma etiqueta comercial do escritório, só para a equipe. */
export const MARCAS_DO_ESCRITORIO = ["piloto", "parceiro", "indicacao"] as const;
export type MarcaDoEscritorio = (typeof MARCAS_DO_ESCRITORIO)[number];
export const ROTULO_DA_MARCA: Record<MarcaDoEscritorio, string> = { piloto: "Piloto", parceiro: "Parceiro", indicacao: "Indicação" };

export interface DescontoDoEscritorio {
  tipo: "percentual" | "valor";
  /** De 1 a 100 no percentual; em centavos no valor. */
  valor: number;
  /** O último dia com desconto. */
  ate: Dia;
  /** O cupom de onde veio, se veio de um. */
  cupom: string | null;
}

export interface PrecoDoEscritorio {
  /** O plano mais as pessoas a mais, ou o valor combinado. Nulo: o plano não tem preço e nada foi combinado. */
  cheioCentavos: number | null;
  combinado: boolean;
  /** Quanto o desconto tira hoje (0 sem desconto ou depois do fim dele). */
  descontoCentavos: number;
  /** O que a mensalidade cobra hoje. */
  mensalidadeCentavos: number | null;
  /** O último dia do desconto, se ele ainda vale. */
  descontoAte: Dia | null;
}

export interface LicencaGravada {
  pessoasExtras: number;
  valorCombinadoCentavos: number | null;
  desconto: DescontoDoEscritorio | null;
}

/** O preço da mensalidade do escritório hoje: o do plano (ou o combinado com a equipe), menos o desconto que ainda vale. */
export function precoDoEscritorio(plano: Pick<Plano, "mensalCentavos" | "pessoaExtraCentavos">, l: LicencaGravada, hoje: Dia): PrecoDoEscritorio {
  const combinado = l.valorCombinadoCentavos !== null;
  const cheio = combinado ? l.valorCombinadoCentavos : plano.mensalCentavos === null ? null : plano.mensalCentavos + Math.max(0, l.pessoasExtras) * (plano.pessoaExtraCentavos ?? 0);
  const vale = !!l.desconto && l.desconto.ate >= hoje;
  const desconto = cheio === null || !vale ? 0 : Math.min(cheio, l.desconto!.tipo === "percentual" ? Math.round((cheio * l.desconto!.valor) / 100) : l.desconto!.valor);
  return { cheioCentavos: cheio, combinado, descontoCentavos: desconto, mensalidadeCentavos: cheio === null ? null : cheio - desconto, descontoAte: vale ? l.desconto!.ate : null };
}

/** O desconto por `meses` mensalidades a partir de hoje: vale até a véspera do mesmo dia, `meses` meses depois. */
export const fimDoDesconto = (hoje: Dia, meses: number): Dia => somarDias(somarMeses(hoje, meses), -1);

/* ---------------- Os cupons ---------------- */

export interface Cupom {
  id: string;
  /** Em maiúsculas, sem espaço. */
  codigo: string;
  tipo: "percentual" | "valor";
  valor: number;
  /** Por quantas mensalidades o desconto vale. */
  meses: number;
  /** O último dia em que o cupom pode ser usado. */
  validoAte: Dia | null;
  limiteDeUsos: number | null;
  usos: number;
  /** Para que serve: "Subseção da OAB de Campinas", "Indicação do escritório X". */
  nota: string | null;
  criadoPor: string;
  criadoEm: string;
  desativadoEm: string | null;
}

export const normalizarCodigoDoCupom = (codigo: string) => codigo.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, "").toUpperCase();

/** Por que o cupom não pode ser usado hoje, ou nulo se pode. */
export function recusaDoCupom(c: Pick<Cupom, "validoAte" | "limiteDeUsos" | "usos" | "desativadoEm">, hoje: Dia): string | null {
  if (c.desativadoEm) return "Este cupom foi desativado.";
  if (c.validoAte && c.validoAte < hoje) return "Este cupom venceu.";
  if (c.limiteDeUsos !== null && c.usos >= c.limiteDeUsos) return "Este cupom já foi usado o número de vezes combinado.";
  return null;
}

export const descontoDoCupom = (c: Pick<Cupom, "codigo" | "tipo" | "valor" | "meses">, hoje: Dia): DescontoDoEscritorio => ({ tipo: c.tipo, valor: c.valor, ate: fimDoDesconto(hoje, c.meses), cupom: c.codigo });

/* ---------------- A licença: o que está em uso contra os limites ---------------- */

/** A partir de quanto de um limite o painel e o escritório são avisados. */
export const PARTE_DO_LIMITE = 0.8;

export interface ConsumoDoEscritorio {
  pessoas: number;
  processos: number;
  oabs: number;
  iaMesUsd: number;
  arquivosBytes: number;
  whatsappHoje: number;
}

export type EstadoDoLimite = "ok" | "perto" | "passou";

export interface ItemDaLicenca {
  chave: "pessoas" | ChaveDoLimite;
  rotulo: string;
  unidade: string;
  usado: number;
  /** Nulo: sem limite. */
  limite: number | null;
  fracao: number | null;
  estado: EstadoDoLimite;
}

export interface LicencaDoEscritorio {
  itens: ItemDaLicenca[];
  /** O pior estado entre os limites. */
  estado: EstadoDoLimite;
  /** Os que passaram de 80% (inclusive os que passaram do limite). */
  alertas: number;
}

/** Os tetos de IA próprios de um escritório, acima ou abaixo do padrão. Ausente: o padrão. Zero: sem teto. */
export interface TetosDaIaDoEscritorio {
  diaUsd?: number | null;
  mesUsd?: number | null;
  mensagensPorDia?: number | null;
}

/** O teto de IA do mês que vale para o escritório: o próprio, se a equipe deu um, ou o do plano. */
export function tetoDoMesDaIa(plano: Pick<Plano, "limites">, tetos: TetosDaIaDoEscritorio | null): number | null {
  const proprio = tetos?.mesUsd;
  if (proprio !== undefined && proprio !== null) return proprio > 0 ? proprio : null;
  return limiteDoPlano(plano, "iaMesUsd");
}

const GB = 1024 ** 3;

export function estadoDoLimite(usado: number, limite: number | null): EstadoDoLimite {
  if (limite === null) return "ok";
  if (usado > limite) return "passou";
  return usado >= limite * PARTE_DO_LIMITE ? "perto" : "ok";
}

export function montarLicenca(e: { plano: Pick<Plano, "limites" | "pessoasIncluidas">; pessoasExtras: number; tetos: TetosDaIaDoEscritorio | null; consumo: ConsumoDoEscritorio }): LicencaDoEscritorio {
  const item = (chave: ItemDaLicenca["chave"], rotulo: string, unidade: string, usado: number, limite: number | null): ItemDaLicenca => ({
    chave,
    rotulo,
    unidade,
    usado,
    limite,
    fracao: limite ? usado / limite : null,
    // As pessoas são as vagas pagas: ter todas ocupadas é o normal. Só avisa quem passou delas.
    estado: chave === "pessoas" ? (limite !== null && usado > limite ? "passou" : "ok") : estadoDoLimite(usado, limite),
  });
  const pessoas = e.plano.pessoasIncluidas === null ? null : e.plano.pessoasIncluidas + Math.max(0, e.pessoasExtras);
  const r = (k: ChaveDoLimite) => ROTULO_DO_LIMITE[k];
  const itens = [
    item("pessoas", "Pessoas", "pessoas", e.consumo.pessoas, pessoas),
    item("processos", r("processos").rotulo, r("processos").unidade, e.consumo.processos, limiteDoPlano(e.plano, "processos")),
    item("oabs", r("oabs").rotulo, r("oabs").unidade, e.consumo.oabs, limiteDoPlano(e.plano, "oabs")),
    item("iaMesUsd", r("iaMesUsd").rotulo, r("iaMesUsd").unidade, e.consumo.iaMesUsd, tetoDoMesDaIa(e.plano, e.tetos)),
    item("arquivosGb", r("arquivosGb").rotulo, r("arquivosGb").unidade, e.consumo.arquivosBytes / GB, limiteDoPlano(e.plano, "arquivosGb")),
    item("whatsappDia", r("whatsappDia").rotulo, r("whatsappDia").unidade, e.consumo.whatsappHoje, limiteDoPlano(e.plano, "whatsappDia")),
  ];
  const estado: EstadoDoLimite = itens.some((i) => i.estado === "passou") ? "passou" : itens.some((i) => i.estado === "perto") ? "perto" : "ok";
  return { itens, estado, alertas: itens.filter((i) => i.estado !== "ok").length };
}

/* ---------------- A licença completa, para a ficha e a tela do Plano ---------------- */

export interface LinhaDaLicenca {
  planoId: string | null;
  pessoasExtras: number;
  valorCombinadoCentavos: number | null;
  desconto: DescontoDoEscritorio | null;
  marca: MarcaDoEscritorio | null;
  tetosIa: TetosDaIaDoEscritorio | null;
}

/** A licença como o painel mostra: o plano, o preço de hoje, o uso contra os limites e o que a equipe combinou. */
export interface LicencaCompleta {
  plano: Plano;
  /** A versão em que o escritório está não é mais a viva: ele assinou um preço antigo. */
  versaoAntiga: boolean;
  pessoasExtras: number;
  preco: PrecoDoEscritorio;
  /** Só o desconto que ainda vale. */
  desconto: DescontoDoEscritorio | null;
  marca: MarcaDoEscritorio | null;
  tetosIa: TetosDaIaDoEscritorio | null;
  uso: LicencaDoEscritorio;
}

export function montarLicencaCompleta(plano: Plano, l: LinhaDaLicenca, consumo: ConsumoDoEscritorio, hoje: Dia): LicencaCompleta {
  return {
    plano,
    versaoAntiga: !!plano.substituidoEm,
    pessoasExtras: l.pessoasExtras,
    preco: precoDoEscritorio(plano, l, hoje),
    desconto: l.desconto && l.desconto.ate >= hoje ? l.desconto : null,
    marca: l.marca,
    tetosIa: l.tetosIa,
    uso: montarLicenca({ plano, pessoasExtras: l.pessoasExtras, tetos: l.tetosIa, consumo }),
  };
}

/** Uma anotação da equipe sobre um escritório (um CRM leve). Nunca vai para o escritório. */
export interface NotaDaEquipe {
  id: string;
  operador: string;
  texto: string;
  contato: string | null;
  proximoPasso: string | null;
  /** O dia de voltar a falar com o escritório. */
  retornoEm: Dia | null;
  retornoFeitoEm: string | null;
  criadaEm: string;
}

/* ---------------- Os ajustes da plataforma ---------------- */

/**
 * O que o dono muda no painel sem mexer no `.env`: a duração do teste, a cotação do dólar e os limites da IA.
 * O padrão de cada um continua vindo do `.env` (ou do código); o painel guarda só o que foi mudado.
 */
export const AJUSTES_DA_PLATAFORMA = [
  { chave: "testeDias", grupo: "Teste", rotulo: "Duração do teste", unidade: "dias", inteiro: true, min: 1, max: 90, ajuda: "Vale para os escritórios que se cadastrarem daqui em diante." },
  { chave: "cotacaoUsd", grupo: "Contas", rotulo: "Cotação do dólar", unidade: "R$ por US$", inteiro: false, min: 0.5, max: 50, ajuda: "Para o custo da IA e a margem no painel." },
  { chave: "ia.tetoSiteUsd", grupo: "IA", rotulo: "Teto do site por dia", unidade: "US$", inteiro: false, min: 0, max: 1000, ajuda: "O gasto das telas no Decreta inteiro. Fica abaixo do teto do gateway, para sobrar para as rotinas." },
  { chave: "ia.tetoPessoaUsd", grupo: "IA", rotulo: "Teto por pessoa por dia", unidade: "US$", inteiro: false, min: 0, max: 1000, ajuda: "Zero: sem teto." },
  { chave: "ia.mensagensPorDia", grupo: "IA", rotulo: "Mensagens no chat por pessoa por dia", unidade: "mensagens", inteiro: true, min: 0, max: 10_000, ajuda: "Zero: sem limite." },
  { chave: "ia.mensagensPorMinuto", grupo: "IA", rotulo: "Mensagens no chat por pessoa por minuto", unidade: "mensagens", inteiro: true, min: 0, max: 600, ajuda: "Contra quem cola um robô no chat. Zero: sem limite." },
  { chave: "ia.simultaneos", grupo: "IA", rotulo: "Pedidos à IA ao mesmo tempo por pessoa", unidade: "pedidos", inteiro: true, min: 0, max: 20, ajuda: "Zero: sem limite." },
  { chave: "ia.demonstracaoTetoUsd", grupo: "IA", rotulo: "Teto da demonstração e das contas novas por dia", unidade: "US$", inteiro: false, min: 0, max: 1000, ajuda: "O gasto do escritório inteiro na demonstração e em quem ainda está em avaliação." },
  { chave: "ia.demonstracaoMensagensPorDia", grupo: "IA", rotulo: "Mensagens por pessoa na demonstração", unidade: "mensagens", inteiro: true, min: 0, max: 10_000, ajuda: "Zero: sem limite." },
] as const;

export type ChaveDoAjuste = (typeof AJUSTES_DA_PLATAFORMA)[number]["chave"];
export type ValoresDosAjustes = Record<ChaveDoAjuste, number>;

export interface AjusteDaPlataforma {
  chave: ChaveDoAjuste;
  grupo: string;
  rotulo: string;
  unidade: string;
  ajuda: string;
  inteiro: boolean;
  min: number;
  max: number;
  valor: number;
  padrao: number;
  /** Quem mudou por último, e quando. Nulo: nunca mudou, vale o padrão. */
  mudadoPor: string | null;
  mudadoEm: string | null;
}

export const definicaoDoAjuste = (chave: string) => AJUSTES_DA_PLATAFORMA.find((a) => a.chave === chave) ?? null;

/** Por que o valor não serve para o ajuste, ou nulo se serve. */
export function recusaDoAjuste(chave: string, valor: number): string | null {
  const d = definicaoDoAjuste(chave);
  if (!d) return "Ajuste desconhecido.";
  if (!Number.isFinite(valor)) return "Valor inválido.";
  if (d.inteiro && !Number.isInteger(valor)) return `${d.rotulo}: use um número inteiro.`;
  if (valor < d.min || valor > d.max) return `${d.rotulo}: de ${d.min} a ${d.max}.`;
  return null;
}
