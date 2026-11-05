/**
 * As contas do painel da plataforma: o que a equipe do Decreta vê do negócio inteiro.
 *
 * Tudo aqui é cálculo puro sobre linhas que o servidor já leu do banco (pelas funções `plataforma_*`, que só
 * devolvem datas, ids e totais). A mesma conta serve à API e à prévia clicável, que monta as linhas com dados
 * fictícios: o que a prévia mostra é o que o painel mostraria com aqueles números.
 *
 * A demonstração e os escritórios encerrados ficam fora de todo número de negócio. O custo da IA da
 * demonstração entra no custo, porque é dinheiro gasto, mas aparece separado.
 */
import { type SituacaoDoEscritorio, SITUACOES_DO_ESCRITORIO } from "./assinatura.ts";
import { diaDaSemana, diaDoInstante, diferencaEmDias, somarDias, type Dia } from "./datas.ts";

/* ---------------- As linhas que chegam do banco ---------------- */

/** Um escritório na lista da plataforma: a conta e os totais, nunca o que é dele. */
export interface EscritorioDaPlataforma {
  id: string;
  nome: string;
  slug: string;
  demonstracao: boolean;
  encerrado: boolean;
  emAvaliacao: boolean;
  /** A situação de hoje (a gravada, corrigida pelas datas). */
  situacao: SituacaoDoEscritorio;
  situacaoGravada: SituacaoDoEscritorio;
  criadoEm: string;
  /** O fim do teste: o último dia. */
  testeAte: Dia | null;
  diasRestantesDoTeste: number | null;
  diasDeAtraso: number | null;
  acessoAte: Dia | null;
  assinouEm: string | null;
  cancelamentoPedidoEm: string | null;
  valorMensalCentavos: number | null;
  pessoas: number;
  processos: number;
  iaMesUsd: number;
}

export interface AcessoCru {
  organizationId: string;
  userId: string;
  dia: Dia;
  aparelho: string;
}
export interface UltimoAcesso {
  organizationId: string;
  userId: string;
  ultimo: Dia;
}
export interface MarcoCru {
  organizationId: string;
  nome: string;
  em: string;
}
export interface IaCru {
  organizationId: string | null;
  dia: Dia;
  metodo: string;
  origem: string;
  chamadas: number;
  mensagens: number;
  custoUsd: number;
  custoEstimadoUsd: number;
}
export interface FaturaCrua {
  id: string;
  organizationId: string;
  vencimento: Dia;
  valorCentavos: number;
  situacao: string;
  pagaEm: Dia | null;
}
export interface FotoCrua {
  dia: Dia;
  numeros: Record<string, number>;
}
export interface UsoCru {
  organizationId: string;
  funcionalidade: string;
  total: number;
}

/* ---------------- Ajudas ---------------- */

const real = (e: EscritorioDaPlataforma) => !e.demonstracao && !e.encerrado;
/** Quem paga: ativo ou com pagamento em atraso, e ainda não cancelado. */
export const pagante = (e: EscritorioDaPlataforma) => (e.situacaoGravada === "ativo" || e.situacaoGravada === "inadimplente") && e.situacao !== "cancelado";
const valor = (e: EscritorioDaPlataforma) => e.valorMensalCentavos ?? 0;
const soma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);
const fracao = (a: number, b: number): number | null => (b > 0 ? a / b : null);
/** A segunda-feira da semana do dia. */
export const inicioDaSemana = (dia: Dia): Dia => somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
const mesDe = (dia: Dia) => dia.slice(0, 7);

/** O dólar em centavos de real, pela cotação dada. */
export const usdEmCentavos = (usd: number, cotacao: number) => Math.round(usd * cotacao * 100);

/* ---------------- A foto do dia ---------------- */

/** Os números que a foto diária guarda. Só totais: é deles que sai o MRR mês a mês. */
export interface NumerosDaFoto {
  mrrCentavos: number;
  pagantes: number;
  escritorios: number;
  pessoasAtivasSemana: number;
  teste: number;
  ativo: number;
  inadimplente: number;
  so_leitura: number;
  bloqueado: number;
  cancelado: number;
  cortesia: number;
}

export function numerosDaFoto(escritorios: EscritorioDaPlataforma[], acessos: AcessoCru[], hoje: Dia): NumerosDaFoto {
  const reais = escritorios.filter(real);
  const ids = new Set(reais.map((e) => e.id));
  const pagam = reais.filter(pagante);
  const semana = somarDias(hoje, -6);
  const porSituacao = Object.fromEntries(SITUACOES_DO_ESCRITORIO.map((s) => [s, reais.filter((e) => e.situacao === s).length])) as Record<SituacaoDoEscritorio, number>;
  return {
    mrrCentavos: soma(pagam, valor),
    pagantes: pagam.length,
    escritorios: reais.length,
    pessoasAtivasSemana: new Set(acessos.filter((a) => ids.has(a.organizationId) && a.dia >= semana && a.dia <= hoje).map((a) => a.userId)).size,
    ...porSituacao,
  };
}

/* ---------------- O que precisa de atenção hoje ---------------- */

export const TIPOS_DE_ATENCAO = ["fatura_atrasada", "teste_sem_ativar", "teste_ativado_sem_assinar", "pagante_sumido", "sem_oab", "ia_perto_do_teto", "em_avaliacao"] as const;
export type TipoDeAtencao = (typeof TIPOS_DE_ATENCAO)[number];

export const ROTULO_DA_ATENCAO: Record<TipoDeAtencao, { titulo: string; acao: string }> = {
  fatura_atrasada: { titulo: "Fatura em atraso", acao: "Reenviar a cobrança antes do 7º dia, quando vira só leitura" },
  teste_sem_ativar: { titulo: "Teste acabando sem ativar", acao: "Ligar, oferecer ajuda ou estender o teste" },
  teste_ativado_sem_assinar: { titulo: "Ativou e ainda não assinou", acao: "Mandar o link de pagamento" },
  pagante_sumido: { titulo: "Pagante sem acesso", acao: "Perguntar se algo travou" },
  sem_oab: { titulo: "Sem OAB cadastrada", acao: "Ajudar no primeiro passo: sem OAB não há publicação" },
  ia_perto_do_teto: { titulo: "IA perto do teto do dia", acao: "Ver se é uso real ou abuso" },
  em_avaliacao: { titulo: "Em avaliação há dias", acao: "Conferir quem é e liberar" },
};

export interface ItemDeAtencao {
  tipo: TipoDeAtencao;
  /** Nulo quando é do Decreta inteiro (o teto de IA do site). */
  organizationId: string | null;
  escritorio: string;
  detalhe: string;
  /** Alta: há dinheiro ou acesso em jogo nos próximos dias. */
  gravidade: "alta" | "media";
}

/** Os limites que o painel compara com o gasto do dia. 0 desliga a regra. */
export interface TetosDoPainel {
  siteUsd: number;
  /** O teto do dia do escritório em avaliação (o mesmo da demonstração). */
  avaliacaoUsd: number;
}

export const DIAS_ATE_O_FIM_DO_TESTE = 3;
export const DIAS_SEM_ACESSO_DO_PAGANTE = 10;
export const DIAS_SEM_OAB = 2;
export const DIAS_EM_AVALIACAO = 3;
export const PARTE_DO_TETO = 0.8;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function precisaDeAtencao(e: { hoje: Dia; escritorios: EscritorioDaPlataforma[]; ultimosAcessos: UltimoAcesso[]; marcos: MarcoCru[]; ia: IaCru[]; tetos: TetosDoPainel }): ItemDeAtencao[] {
  const itens: ItemDeAtencao[] = [];
  const marcosDe = new Map<string, Set<string>>();
  for (const m of e.marcos) marcosDe.set(m.organizationId, (marcosDe.get(m.organizationId) ?? new Set()).add(m.nome));
  const ultimoDe = new Map<string, Dia>();
  for (const a of e.ultimosAcessos) if (!ultimoDe.has(a.organizationId) || (ultimoDe.get(a.organizationId) as Dia) < a.ultimo) ultimoDe.set(a.organizationId, a.ultimo);
  const iaHoje = new Map<string, number>();
  let iaDoSite = 0;
  for (const i of e.ia) {
    if (i.dia !== e.hoje) continue;
    iaDoSite += i.custoUsd;
    if (i.organizationId) iaHoje.set(i.organizationId, (iaHoje.get(i.organizationId) ?? 0) + i.custoUsd);
  }

  for (const o of e.escritorios.filter(real)) {
    const marcos = marcosDe.get(o.id) ?? new Set<string>();
    const ativou = marcos.has("primeiro_prazo_confirmado");
    const desdeOCadastro = diferencaEmDias(diaDoInstante(o.criadoEm), e.hoje);
    const base = { organizationId: o.id, escritorio: o.nome };

    if (o.diasDeAtraso !== null) itens.push({ ...base, tipo: "fatura_atrasada", gravidade: "alta", detalhe: `${plural(o.diasDeAtraso, "dia", "dias")} de atraso` });
    if (o.situacao === "teste" && o.diasRestantesDoTeste !== null && o.diasRestantesDoTeste <= DIAS_ATE_O_FIM_DO_TESTE) {
      const quando = o.diasRestantesDoTeste === 0 ? "O teste acaba hoje" : `O teste acaba em ${plural(o.diasRestantesDoTeste, "dia", "dias")}`;
      if (!ativou) itens.push({ ...base, tipo: "teste_sem_ativar", gravidade: "alta", detalhe: `${quando} e nenhum prazo foi confirmado` });
      else if (!o.assinouEm) itens.push({ ...base, tipo: "teste_ativado_sem_assinar", gravidade: "alta", detalhe: `${quando}; já confirmou prazos` });
    }
    if (o.situacao === "ativo") {
      const ultimo = ultimoDe.get(o.id);
      const dias = ultimo ? diferencaEmDias(ultimo, e.hoje) : null;
      if (dias === null || dias >= DIAS_SEM_ACESSO_DO_PAGANTE) itens.push({ ...base, tipo: "pagante_sumido", gravidade: "media", detalhe: dias === null ? "Nenhum acesso registrado" : `Nenhum acesso há ${dias} dias` });
    }
    if ((o.situacao === "teste" || o.situacao === "ativo") && !marcos.has("oab_cadastrada") && desdeOCadastro >= DIAS_SEM_OAB) {
      itens.push({ ...base, tipo: "sem_oab", gravidade: "media", detalhe: `Cadastrou há ${desdeOCadastro} dias e ainda não informou a OAB` });
    }
    const gasto = iaHoje.get(o.id) ?? 0;
    if (o.emAvaliacao && e.tetos.avaliacaoUsd > 0 && gasto >= PARTE_DO_TETO * e.tetos.avaliacaoUsd) {
      itens.push({ ...base, tipo: "ia_perto_do_teto", gravidade: "media", detalhe: `Gastou ${Math.round((gasto / e.tetos.avaliacaoUsd) * 100)}% do teto de hoje para contas novas` });
    }
    if (o.emAvaliacao && desdeOCadastro >= DIAS_EM_AVALIACAO) itens.push({ ...base, tipo: "em_avaliacao", gravidade: "media", detalhe: `Em avaliação há ${desdeOCadastro} dias, com tetos menores` });
  }
  if (e.tetos.siteUsd > 0 && iaDoSite >= PARTE_DO_TETO * e.tetos.siteUsd) {
    itens.push({ tipo: "ia_perto_do_teto", organizationId: null, escritorio: "Decreta inteiro", gravidade: "alta", detalhe: `O site gastou ${Math.round((iaDoSite / e.tetos.siteUsd) * 100)}% do teto de hoje; acima dele, a IA para nas telas` });
  }
  const ordem = (i: ItemDeAtencao) => (i.gravidade === "alta" ? 0 : 1) * 10 + TIPOS_DE_ATENCAO.indexOf(i.tipo);
  return itens.sort((a, b) => ordem(a) - ordem(b) || a.escritorio.localeCompare(b.escritorio, "pt-BR"));
}

/* ---------------- A visão geral ---------------- */

export interface VisaoGeralDaPlataforma {
  hoje: Dia;
  /** Reais por dólar usados para o custo da IA. */
  cotacaoUsd: number;
  numeros: {
    mrrCentavos: number;
    arrCentavos: number;
    pagantes: number;
    emTeste: number;
    cortesia: number;
    /** A mensalidade média de quem paga. */
    ticketMedioCentavos: number | null;
    /** No mês corrente: quem assinou, quem cancelou e a diferença. */
    mrrNovoCentavos: number;
    mrrPerdidoCentavos: number;
    mrrLiquidoCentavos: number;
    /** Cancelados no mês sobre os pagantes do início do mês (0 a 1). */
    churnEscritorios: number | null;
    churnReceita: number | null;
    receitaRecebidaCentavos: number;
    receitaAReceberCentavos: number;
    /** Os últimos 30 dias, todos os escritórios (com a demonstração). */
    ia30dUsd: number;
    ia30dCentavos: number;
    iaDemonstracao30dUsd: number;
    /** 1 − custo da IA em 30 dias ÷ MRR. Só a IA: servidor e impostos ficam de fora. */
    margemDaIa: number | null;
    pessoas: number;
    pessoasAtivas: { dia: number; semana: number; mes: number };
  };
  mrrPorMes: { mes: string; mrrCentavos: number; pagantes: number }[];
  cadastrosPorSemana: { semana: Dia; cadastros: number; assinaram: number }[];
  iaPorDia: { dia: Dia; usd: number }[];
  porSituacao: Record<SituacaoDoEscritorio, number>;
  atencao: ItemDeAtencao[];
}

export interface EntradaDaVisaoGeral {
  hoje: Dia;
  escritorios: EscritorioDaPlataforma[];
  /** Os acessos dos últimos 30 dias. */
  acessos: AcessoCru[];
  ultimosAcessos: UltimoAcesso[];
  marcos: MarcoCru[];
  /** O gasto da IA dos últimos 30 dias. */
  ia: IaCru[];
  /** As faturas que vencem ou foram pagas no mês. */
  faturas: FaturaCrua[];
  /** As fotos diárias dos últimos 12 meses. */
  fotos: FotoCrua[];
  cotacaoUsd: number;
  tetos: TetosDoPainel;
}

export const SEMANAS_DE_CADASTRO = 12;
export const MESES_DE_MRR = 12;

export function montarVisaoGeral(e: EntradaDaVisaoGeral): VisaoGeralDaPlataforma {
  const { hoje } = e;
  const mes = mesDe(hoje);
  const reais = e.escritorios.filter(real);
  const ids = new Set(reais.map((o) => o.id));
  const demos = new Set(e.escritorios.filter((o) => o.demonstracao).map((o) => o.id));
  const pagam = reais.filter(pagante);
  const doMes = (iso: string | null) => !!iso && mesDe(diaDoInstante(iso)) === mes;

  const mrr = soma(pagam, valor);
  const novos = reais.filter((o) => doMes(o.assinouEm));
  const cancelados = reais.filter((o) => doMes(o.cancelamentoPedidoEm));
  const mrrNovo = soma(novos, valor);
  const mrrPerdido = soma(cancelados, valor);
  // Os pagantes do início do mês: os de hoje, mais quem cancelou no mês, menos quem entrou no mês.
  const pagantesNoInicio = pagam.length + cancelados.filter((o) => !pagante(o)).length - novos.filter(pagante).length;
  const mrrNoInicio = mrr + soma(cancelados.filter((o) => !pagante(o)), valor) - soma(novos.filter(pagante), valor);

  const faturas = e.faturas.filter((f) => ids.has(f.organizationId));
  const recebida = soma(
    faturas.filter((f) => f.situacao === "paga" && f.pagaEm && mesDe(f.pagaEm) === mes),
    (f) => f.valorCentavos,
  );
  const aReceber = soma(
    faturas.filter((f) => (f.situacao === "pendente" || f.situacao === "atrasada") && mesDe(f.vencimento) === mes),
    (f) => f.valorCentavos,
  );

  const de30 = somarDias(hoje, -29);
  const ia30 = e.ia.filter((i) => i.dia >= de30 && i.dia <= hoje);
  const ia30dUsd = soma(ia30, (i) => i.custoUsd);
  const iaDemo = soma(
    ia30.filter((i) => i.organizationId && demos.has(i.organizationId)),
    (i) => i.custoUsd,
  );
  const ia30dCentavos = usdEmCentavos(ia30dUsd, e.cotacaoUsd);

  const ativosEm = (de: Dia) => new Set(e.acessos.filter((a) => ids.has(a.organizationId) && a.dia >= de && a.dia <= hoje).map((a) => a.userId)).size;

  const porSituacao = Object.fromEntries(SITUACOES_DO_ESCRITORIO.map((s) => [s, reais.filter((o) => o.situacao === s).length])) as Record<SituacaoDoEscritorio, number>;

  // O MRR mês a mês: a última foto de cada mês, e o mês corrente com o número de agora.
  const ultimaDoMes = new Map<string, FotoCrua>();
  for (const f of e.fotos) if (mesDe(f.dia) !== mes && (!ultimaDoMes.has(mesDe(f.dia)) || (ultimaDoMes.get(mesDe(f.dia)) as FotoCrua).dia < f.dia)) ultimaDoMes.set(mesDe(f.dia), f);
  const mrrPorMes = [...ultimaDoMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-(MESES_DE_MRR - 1))
    .map(([m, f]) => ({ mes: m, mrrCentavos: f.numeros.mrrCentavos ?? 0, pagantes: f.numeros.pagantes ?? 0 }));
  mrrPorMes.push({ mes, mrrCentavos: mrr, pagantes: pagam.length });

  const semanaAtual = inicioDaSemana(hoje);
  const cadastrosPorSemana = Array.from({ length: SEMANAS_DE_CADASTRO }, (_, i) => {
    const semana = somarDias(semanaAtual, -7 * (SEMANAS_DE_CADASTRO - 1 - i));
    const daSemana = e.escritorios.filter((o) => !o.demonstracao && inicioDaSemana(diaDoInstante(o.criadoEm)) === semana);
    return { semana, cadastros: daSemana.length, assinaram: daSemana.filter((o) => !!o.assinouEm).length };
  });

  const porDia = new Map<Dia, number>();
  for (const i of ia30) porDia.set(i.dia, (porDia.get(i.dia) ?? 0) + i.custoUsd);
  const iaPorDia = Array.from({ length: 30 }, (_, i) => somarDias(de30, i)).map((dia) => ({ dia, usd: porDia.get(dia) ?? 0 }));

  return {
    hoje,
    cotacaoUsd: e.cotacaoUsd,
    numeros: {
      mrrCentavos: mrr,
      arrCentavos: mrr * 12,
      pagantes: pagam.length,
      emTeste: porSituacao.teste,
      cortesia: porSituacao.cortesia,
      ticketMedioCentavos: pagam.length ? Math.round(mrr / pagam.length) : null,
      mrrNovoCentavos: mrrNovo,
      mrrPerdidoCentavos: mrrPerdido,
      mrrLiquidoCentavos: mrrNovo - mrrPerdido,
      churnEscritorios: fracao(cancelados.length, pagantesNoInicio),
      churnReceita: fracao(mrrPerdido, mrrNoInicio),
      receitaRecebidaCentavos: recebida,
      receitaAReceberCentavos: aReceber,
      ia30dUsd,
      ia30dCentavos,
      iaDemonstracao30dUsd: iaDemo,
      margemDaIa: mrr > 0 ? 1 - ia30dCentavos / mrr : null,
      pessoas: soma(reais, (o) => o.pessoas),
      pessoasAtivas: { dia: ativosEm(hoje), semana: ativosEm(somarDias(hoje, -6)), mes: ativosEm(de30) },
    },
    mrrPorMes,
    cadastrosPorSemana,
    iaPorDia,
    porSituacao,
    atencao: precisaDeAtencao(e),
  };
}

/* ---------------- As pessoas ---------------- */

export interface PessoaCrua {
  id: string;
  nome: string;
  email: string;
  emailConfirmado: boolean;
  doisFatores: boolean;
  termosVersao: string | null;
  criadaEm: string;
  sessoesAbertas: number;
  escritorios: { id: string; nome: string; papel: string; demonstracao: boolean }[];
}

export interface PessoaDaPlataforma {
  id: string;
  nome: string;
  email: string;
  emailConfirmado: boolean;
  doisFatores: boolean;
  /** Aceitou a versão atual dos termos. */
  termosEmDia: boolean;
  criadaEm: string;
  sessoesAbertas: number;
  escritorios: { id: string; nome: string; papel: string }[];
  ultimoAcesso: Dia | null;
  /** O aparelho do acesso mais recente dos últimos 30 dias. */
  aparelho: "celular" | "computador" | null;
  /** Só tem escritório de demonstração: fica fora dos números. */
  demonstracao: boolean;
}

export interface PessoasDaPlataforma {
  pessoas: PessoaDaPlataforma[];
  numeros: {
    total: number;
    ativas: { dia: number; semana: number; mes: number };
    /** Pessoas ativas no dia ÷ no mês: quanto o Decreta virou hábito. */
    habito: number | null;
    comDoisFatores: number;
    /** Das ativas no mês, quantas usaram pelo celular por último. */
    noCelular: number;
    termosAntigos: number;
  };
}

export function montarPessoas(e: { hoje: Dia; pessoas: PessoaCrua[]; acessos: AcessoCru[]; ultimosAcessos: UltimoAcesso[]; versaoDosTermos: string }): PessoasDaPlataforma {
  const ultimo = new Map<string, Dia>();
  for (const a of e.ultimosAcessos) if (!ultimo.has(a.userId) || (ultimo.get(a.userId) as Dia) < a.ultimo) ultimo.set(a.userId, a.ultimo);
  const aparelho = new Map<string, { dia: Dia; aparelho: string }>();
  for (const a of e.acessos) if (!aparelho.has(a.userId) || (aparelho.get(a.userId) as { dia: Dia }).dia < a.dia) aparelho.set(a.userId, { dia: a.dia, aparelho: a.aparelho });

  const pessoas = e.pessoas
    .map((p): PessoaDaPlataforma => {
      const ap = aparelho.get(p.id)?.aparelho;
      return {
        id: p.id,
        nome: p.nome,
        email: p.email,
        emailConfirmado: p.emailConfirmado,
        doisFatores: p.doisFatores,
        termosEmDia: p.termosVersao === e.versaoDosTermos,
        criadaEm: p.criadaEm,
        sessoesAbertas: p.sessoesAbertas,
        escritorios: p.escritorios.map(({ id, nome, papel }) => ({ id, nome, papel })),
        ultimoAcesso: ultimo.get(p.id) ?? null,
        aparelho: ap === "celular" || ap === "computador" ? ap : null,
        demonstracao: p.escritorios.length > 0 && p.escritorios.every((o) => o.demonstracao),
      };
    })
    .sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? "") || a.nome.localeCompare(b.nome, "pt-BR"));

  const reais = pessoas.filter((p) => !p.demonstracao);
  const ativasDesde = (de: Dia) => reais.filter((p) => !!p.ultimoAcesso && p.ultimoAcesso >= de).length;
  const dia = ativasDesde(e.hoje);
  const mes = ativasDesde(somarDias(e.hoje, -29));
  return {
    pessoas,
    numeros: {
      total: reais.length,
      ativas: { dia, semana: ativasDesde(somarDias(e.hoje, -6)), mes },
      habito: fracao(dia, mes),
      comDoisFatores: reais.filter((p) => p.doisFatores).length,
      noCelular: reais.filter((p) => !!p.ultimoAcesso && p.ultimoAcesso >= somarDias(e.hoje, -29) && p.aparelho === "celular").length,
      termosAntigos: reais.filter((p) => !p.termosEmDia).length,
    },
  };
}

/* ---------------- O uso das funcionalidades ---------------- */

export const GRUPOS_DE_FUNCIONALIDADE = ["Prazos e publicações", "Peças e IA", "Cadastro", "Agenda e tarefas", "Dinheiro", "Cliente", "Outros"] as const;
export type GrupoDeFuncionalidade = (typeof GRUPOS_DE_FUNCIONALIDADE)[number];

/** O que o painel conta de cada funcionalidade (as chaves de `plataforma_uso`). */
export const FUNCIONALIDADES: { chave: string; rotulo: string; grupo: GrupoDeFuncionalidade }[] = [
  { chave: "publicacoes", rotulo: "Publicações capturadas", grupo: "Prazos e publicações" },
  { chave: "publicacoes_tratadas", rotulo: "Publicações tratadas", grupo: "Prazos e publicações" },
  { chave: "prazos_sugeridos", rotulo: "Prazos sugeridos pela IA", grupo: "Prazos e publicações" },
  { chave: "prazos_confirmados", rotulo: "Prazos confirmados", grupo: "Prazos e publicações" },
  { chave: "prazos_descartados", rotulo: "Prazos descartados", grupo: "Prazos e publicações" },
  { chave: "pecas", rotulo: "Peças geradas", grupo: "Peças e IA" },
  { chave: "pecas_revisadas", rotulo: "Peças revisadas", grupo: "Peças e IA" },
  { chave: "conversas", rotulo: "Conversas no Perguntar", grupo: "Peças e IA" },
  { chave: "mensagens_chat", rotulo: "Mensagens para a IA", grupo: "Peças e IA" },
  { chave: "modelos", rotulo: "Modelos e teses salvos", grupo: "Peças e IA" },
  { chave: "calculos", rotulo: "Cálculos", grupo: "Peças e IA" },
  { chave: "radar", rotulo: "Alertas do radar de precedentes", grupo: "Peças e IA" },
  { chave: "processos", rotulo: "Processos cadastrados", grupo: "Cadastro" },
  { chave: "clientes", rotulo: "Clientes cadastrados", grupo: "Cadastro" },
  { chave: "documentos", rotulo: "Documentos enviados", grupo: "Cadastro" },
  { chave: "atendimentos", rotulo: "Atendimentos registrados", grupo: "Cadastro" },
  { chave: "audiencias", rotulo: "Audiências marcadas", grupo: "Agenda e tarefas" },
  { chave: "tarefas", rotulo: "Tarefas criadas", grupo: "Agenda e tarefas" },
  { chave: "tarefas_concluidas", rotulo: "Tarefas concluídas", grupo: "Agenda e tarefas" },
  { chave: "contratos_honorarios", rotulo: "Contratos de honorários", grupo: "Dinheiro" },
  { chave: "pagamentos_honorarios", rotulo: "Pagamentos de honorários", grupo: "Dinheiro" },
  { chave: "alvaras", rotulo: "Alvarás", grupo: "Dinheiro" },
  { chave: "negocios", rotulo: "Novos negócios", grupo: "Cliente" },
  { chave: "mensagens_cliente", rotulo: "Mensagens ao cliente enviadas", grupo: "Cliente" },
  { chave: "assinaturas", rotulo: "Documentos enviados para assinar", grupo: "Cliente" },
  { chave: "avisos_enviados", rotulo: "Avisos por WhatsApp e e-mail", grupo: "Outros" },
  { chave: "exportacoes", rotulo: "Exportações", grupo: "Outros" },
  { chave: "mcp", rotulo: "Chaves de MCP usadas", grupo: "Outros" },
];

export interface UsoDaFuncionalidade {
  chave: string;
  rotulo: string;
  grupo: GrupoDeFuncionalidade;
  /** Quantos escritórios usaram no período. */
  escritorios: number;
  /** Esses escritórios sobre os ativos no período (0 a 1). */
  adocao: number | null;
  total: number;
  /** Quanto cada escritório que usou usou, em média. */
  porEscritorio: number | null;
  totalAnterior: number;
  /** Total contra o período anterior, do mesmo tamanho (−1 a ∞). */
  variacao: number | null;
}

export interface UsoDaPlataforma {
  periodo: { de: Dia; ate: Dia; dias: number };
  /** Escritórios com alguém usando o app no período: a base da adoção. */
  escritoriosAtivos: number;
  funcionalidades: UsoDaFuncionalidade[];
  qualidade: {
    prazosConfirmados: number;
    /** Prazos em que a pessoa digitou a data final, em vez de aceitar a conta. */
    prazosComDataDigitada: number;
    /** Confirmados com a conta do Decreta, sem digitar outra data (0 a 1). */
    contaAceita: number | null;
    retornosUteis: number;
    retornosErrados: number;
    /** "Útil" sobre todos os retornos das peças e leituras (0 a 1). */
    util: number | null;
  };
}

export function montarUso(e: { periodo: { de: Dia; ate: Dia; dias: number }; reais: ReadonlySet<string>; ativos: ReadonlySet<string>; atual: UsoCru[]; anterior: UsoCru[] }): UsoDaPlataforma {
  const porChave = (linhas: UsoCru[]) => {
    const m = new Map<string, { total: number; escritorios: number }>();
    for (const l of linhas) {
      if (!e.reais.has(l.organizationId) || l.total <= 0) continue;
      const v = m.get(l.funcionalidade) ?? { total: 0, escritorios: 0 };
      m.set(l.funcionalidade, { total: v.total + l.total, escritorios: v.escritorios + 1 });
    }
    return m;
  };
  const atual = porChave(e.atual);
  const anterior = porChave(e.anterior);
  const total = (m: typeof atual, k: string) => m.get(k)?.total ?? 0;
  const ativos = [...e.ativos].filter((id) => e.reais.has(id)).length;

  const funcionalidades = FUNCIONALIDADES.map((f): UsoDaFuncionalidade => {
    const a = atual.get(f.chave) ?? { total: 0, escritorios: 0 };
    const antes = total(anterior, f.chave);
    return {
      ...f,
      escritorios: a.escritorios,
      adocao: fracao(a.escritorios, ativos),
      total: a.total,
      porEscritorio: a.escritorios ? a.total / a.escritorios : null,
      totalAnterior: antes,
      variacao: antes > 0 ? a.total / antes - 1 : null,
    };
  });

  const confirmados = total(atual, "prazos_confirmados");
  const digitados = total(atual, "prazos_data_digitada");
  const uteis = total(atual, "retornos_uteis");
  const errados = total(atual, "retornos_errados");
  return {
    periodo: e.periodo,
    escritoriosAtivos: ativos,
    funcionalidades,
    qualidade: {
      prazosConfirmados: confirmados,
      prazosComDataDigitada: digitados,
      contaAceita: confirmados ? 1 - digitados / confirmados : null,
      retornosUteis: uteis,
      retornosErrados: errados,
      util: fracao(uteis, uteis + errados),
    },
  };
}

/* ---------------- O custo da IA ---------------- */

/** O nome de cada ação da IA (o `X-Gateway-Method`) numa palavra que a equipe reconhece. */
export const ROTULO_DO_METODO: Record<string, string> = {
  "sugerir-prazo": "Sugerir prazo",
  "briefing-prazo": "Briefing do prazo",
  "resumo-autos": "Resumo dos autos",
  "chat-processo": "Chat do processo",
  "preparar-audiencia": "Preparar audiência",
  "gerar-documento": "Gerar peça",
  jurisprudencia: "Jurisprudência",
  perguntar: "Perguntar",
  transcription: "Transcrição",
  "ler-sentenca": "Ler sentença",
  "conferir-pasta": "Conferir a pasta",
  "ler-imagem": "Ler foto",
  "ler-pdf": "Ler PDF",
  "titulo-conversa": "Título da conversa",
  "ler-peca-contraria": "Ler peça contrária",
  "mensagem-cliente": "Mensagem ao cliente",
  "conferir-citacao": "Conferir citação",
  "observar-prazo": "Observação da IA",
  "estrategia-peca": "Estratégia da peça",
  "ligar-fatos": "Ligar os fatos",
  "ajustar-peca": "Ajustar peça",
  "papel-do-julgado": "Papel do julgado",
  "campo-texto": "IA nos campos",
  "base-legal": "Base legal",
};
export const rotuloDoMetodo = (m: string) => ROTULO_DO_METODO[m] ?? m;

export interface CustoDaIaDaPlataforma {
  periodo: { de: Dia; ate: Dia; dias: number };
  cotacaoUsd: number;
  totalUsd: number;
  totalCentavos: number;
  /** A parte que saiu dos tokens, pelo preço de referência, sem o custo informado pelo gateway. */
  estimadoUsd: number;
  hojeUsd: number;
  tetoSiteUsd: number;
  demonstracaoUsd: number;
  /** O que roda sozinho (leitura de publicação, sugestão de prazo) contra o que a pessoa pede na tela. */
  fundoUsd: number;
  telaUsd: number;
  mensagens: number;
  /** A média por escritório pagante no período, em dólar. */
  porPaganteUsd: number | null;
  dias: { dia: Dia; usd: number; fundoUsd: number }[];
  porMetodo: { metodo: string; rotulo: string; usd: number; chamadas: number; mensagens: number }[];
  porEscritorio: { organizationId: string; nome: string; situacao: SituacaoDoEscritorio; demonstracao: boolean; usd: number; centavos: number; valorMensalCentavos: number | null; /** O custo do período sobre a mensalidade (0 a ∞). */ sobreAMensalidade: number | null }[];
}

export const ESCRITORIOS_NO_CUSTO = 10;

export function montarCustoDaIa(e: { hoje: Dia; dias: number; escritorios: EscritorioDaPlataforma[]; ia: IaCru[]; cotacaoUsd: number; tetoSiteUsd: number }): CustoDaIaDaPlataforma {
  const de = somarDias(e.hoje, 1 - e.dias);
  const linhas = e.ia.filter((i) => i.dia >= de && i.dia <= e.hoje);
  const porId = new Map(e.escritorios.map((o) => [o.id, o]));
  const totalUsd = soma(linhas, (i) => i.custoUsd);

  const dias = new Map<Dia, { usd: number; fundoUsd: number }>();
  const metodos = new Map<string, { usd: number; chamadas: number; mensagens: number }>();
  const escritorios = new Map<string, number>();
  for (const i of linhas) {
    const d = dias.get(i.dia) ?? { usd: 0, fundoUsd: 0 };
    dias.set(i.dia, { usd: d.usd + i.custoUsd, fundoUsd: d.fundoUsd + (i.origem === "fundo" ? i.custoUsd : 0) });
    const m = metodos.get(i.metodo) ?? { usd: 0, chamadas: 0, mensagens: 0 };
    metodos.set(i.metodo, { usd: m.usd + i.custoUsd, chamadas: m.chamadas + i.chamadas, mensagens: m.mensagens + i.mensagens });
    if (i.organizationId) escritorios.set(i.organizationId, (escritorios.get(i.organizationId) ?? 0) + i.custoUsd);
  }
  const pagam = e.escritorios.filter((o) => real(o) && pagante(o));
  const gastoDosPagantes = soma(pagam, (o) => escritorios.get(o.id) ?? 0);

  return {
    periodo: { de, ate: e.hoje, dias: e.dias },
    cotacaoUsd: e.cotacaoUsd,
    totalUsd,
    totalCentavos: usdEmCentavos(totalUsd, e.cotacaoUsd),
    estimadoUsd: soma(linhas, (i) => i.custoEstimadoUsd),
    hojeUsd: soma(
      linhas.filter((i) => i.dia === e.hoje),
      (i) => i.custoUsd,
    ),
    tetoSiteUsd: e.tetoSiteUsd,
    demonstracaoUsd: soma(
      linhas.filter((i) => i.organizationId && porId.get(i.organizationId)?.demonstracao),
      (i) => i.custoUsd,
    ),
    fundoUsd: soma(
      linhas.filter((i) => i.origem === "fundo"),
      (i) => i.custoUsd,
    ),
    telaUsd: soma(
      linhas.filter((i) => i.origem !== "fundo"),
      (i) => i.custoUsd,
    ),
    mensagens: soma(linhas, (i) => i.mensagens),
    porPaganteUsd: pagam.length ? gastoDosPagantes / pagam.length : null,
    dias: Array.from({ length: e.dias }, (_, i) => somarDias(de, i)).map((dia) => ({ dia, ...(dias.get(dia) ?? { usd: 0, fundoUsd: 0 }) })),
    porMetodo: [...metodos.entries()].map(([metodo, m]) => ({ metodo, rotulo: rotuloDoMetodo(metodo), ...m })).sort((a, b) => b.usd - a.usd),
    porEscritorio: [...escritorios.entries()]
      .map(([id, usd]) => {
        const o = porId.get(id);
        const centavos = usdEmCentavos(usd, e.cotacaoUsd);
        const mensal = o?.valorMensalCentavos ?? null;
        return { organizationId: id, nome: o?.nome ?? "Escritório apagado", situacao: o?.situacao ?? ("cancelado" as SituacaoDoEscritorio), demonstracao: !!o?.demonstracao, usd, centavos, valorMensalCentavos: mensal, sobreAMensalidade: mensal && o && pagante(o) ? (centavos * (30 / e.dias)) / mensal : null };
      })
      .sort((a, b) => b.usd - a.usd)
      .slice(0, ESCRITORIOS_NO_CUSTO),
  };
}

/* ---------------- A ficha do escritório ---------------- */

/** Os marcos do escritório, na ordem em que ele avança. */
export const MARCOS_DA_FICHA: { nome: string; rotulo: string }[] = [
  { nome: "cadastro_concluido", rotulo: "Cadastro concluído" },
  { nome: "oab_cadastrada", rotulo: "OAB cadastrada" },
  { nome: "primeira_publicacao", rotulo: "Primeira publicação" },
  { nome: "primeiro_prazo_confirmado", rotulo: "Primeiro prazo confirmado" },
  { nome: "assinou", rotulo: "Primeira mensalidade paga" },
];

export interface TotaisDoEscritorio {
  processos: number;
  clientes: number;
  publicacoes: number;
  prazosAbertos: number;
  pecas: number;
  documentos: number;
  espacoBytes: number;
  conversas: number;
  oabs: number;
}

export interface AcaoRegistrada {
  id: string;
  operador: string;
  acao: string;
  organizationId: string | null;
  escritorio: string | null;
  detalhes: Record<string, unknown>;
  em: string;
}

export interface FichaDoEscritorio {
  escritorio: EscritorioDaPlataforma;
  fuso: string;
  totais: TotaisDoEscritorio;
  pessoas: { id: string; nome: string; email: string; papel: string; doisFatores: boolean; emailConfirmado: boolean; ultimoAcesso: Dia | null; aparelho: "celular" | "computador" | null }[];
  /** Pessoas com acesso nos últimos 7 dias. */
  ativasNaSemana: number;
  marcos: { nome: string; rotulo: string; em: string | null }[];
  faturas: { id: string; vencimento: Dia; valorCentavos: number; situacao: string; pagaEm: Dia | null; forma: string | null }[];
  /** As funcionalidades usadas nos últimos 30 dias, só as com uso. */
  uso: { chave: string; rotulo: string; grupo: GrupoDeFuncionalidade; total: number }[];
  ia: { totalUsd: number; hojeUsd: number; dias: { dia: Dia; usd: number }[]; porMetodo: { metodo: string; rotulo: string; usd: number }[] };
  captura: { ultimaEm: string | null; errosNaSemana: number; ultimoErro: string | null };
  acoes: AcaoRegistrada[];
}

export function montarFicha(e: {
  hoje: Dia;
  escritorio: EscritorioDaPlataforma;
  fuso: string;
  totais: TotaisDoEscritorio;
  pessoas: { id: string; nome: string; email: string; papel: string; doisFatores: boolean; emailConfirmado: boolean }[];
  acessos: AcessoCru[];
  ultimosAcessos: UltimoAcesso[];
  marcos: MarcoCru[];
  faturas: FichaDoEscritorio["faturas"];
  uso: UsoCru[];
  ia: IaCru[];
  captura: FichaDoEscritorio["captura"];
  acoes: AcaoRegistrada[];
}): FichaDoEscritorio {
  const id = e.escritorio.id;
  const ultimo = new Map(e.ultimosAcessos.filter((a) => a.organizationId === id).map((a) => [a.userId, a.ultimo]));
  const aparelho = new Map<string, { dia: Dia; aparelho: string }>();
  for (const a of e.acessos) if (a.organizationId === id && (!aparelho.has(a.userId) || (aparelho.get(a.userId) as { dia: Dia }).dia < a.dia)) aparelho.set(a.userId, a);
  const semana = somarDias(e.hoje, -6);
  const marcos = new Map(e.marcos.filter((m) => m.organizationId === id).map((m) => [m.nome, m.em]));
  if (e.escritorio.assinouEm) marcos.set("assinou", e.escritorio.assinouEm);
  const uso = new Map<string, number>();
  for (const u of e.uso) if (u.organizationId === id) uso.set(u.funcionalidade, (uso.get(u.funcionalidade) ?? 0) + u.total);
  const de30 = somarDias(e.hoje, -29);
  const ia = e.ia.filter((i) => i.organizationId === id && i.dia >= de30 && i.dia <= e.hoje);
  const porDia = new Map<Dia, number>();
  const porMetodo = new Map<string, number>();
  for (const i of ia) {
    porDia.set(i.dia, (porDia.get(i.dia) ?? 0) + i.custoUsd);
    porMetodo.set(i.metodo, (porMetodo.get(i.metodo) ?? 0) + i.custoUsd);
  }
  const pessoas = e.pessoas
    .map((p) => {
      const ap = aparelho.get(p.id)?.aparelho;
      return { ...p, ultimoAcesso: ultimo.get(p.id) ?? null, aparelho: ap === "celular" || ap === "computador" ? (ap as "celular" | "computador") : null };
    })
    .sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? "") || a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    escritorio: e.escritorio,
    fuso: e.fuso,
    totais: e.totais,
    pessoas,
    ativasNaSemana: pessoas.filter((p) => !!p.ultimoAcesso && p.ultimoAcesso >= semana).length,
    marcos: MARCOS_DA_FICHA.map((m) => ({ ...m, em: marcos.get(m.nome) ?? null })),
    faturas: [...e.faturas].sort((a, b) => b.vencimento.localeCompare(a.vencimento)),
    uso: FUNCIONALIDADES.filter((f) => (uso.get(f.chave) ?? 0) > 0).map((f) => ({ chave: f.chave, rotulo: f.rotulo, grupo: f.grupo, total: uso.get(f.chave) as number })),
    ia: {
      totalUsd: soma(ia, (i) => i.custoUsd),
      hojeUsd: porDia.get(e.hoje) ?? 0,
      dias: Array.from({ length: 30 }, (_, i) => somarDias(de30, i)).map((dia) => ({ dia, usd: porDia.get(dia) ?? 0 })),
      porMetodo: [...porMetodo.entries()].map(([metodo, usd]) => ({ metodo, rotulo: rotuloDoMetodo(metodo), usd })).sort((a, b) => b.usd - a.usd),
    },
    captura: e.captura,
    acoes: e.acoes.filter((a) => a.organizationId === id),
  };
}
