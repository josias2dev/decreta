/**
 * O painel da plataforma na prévia: escritórios, pessoas, acessos, uso, IA e faturas todos inventados, e as mesmas
 * contas do servidor (`montar*` de @decreta/core) por cima. O que a prévia mostra é o que o painel mostraria com esses
 * números. Nenhum nome, e-mail ou escritório aqui é de verdade. A mensalidade de R$ 149 e os planos, cupons e
 * limites são só exemplos: o preço do plano ainda não foi decidido.
 */
import {
  AJUSTES_DA_PLATAFORMA,
  diaDoInstante,
  diferencaEmDias,
  fimDoDesconto,
  FUNCIONALIDADES,
  hojeEm,
  montarCustoDaIa,
  montarFaturas,
  montarFicha,
  montarLicenca,
  montarLicencaCompleta,
  montarPessoas,
  montarRecusasDaIa,
  montarUso,
  montarVisaoGeral,
  normalizarCodigoDoCupom,
  precoDoEscritorio,
  somarDias,
  VERSAO_DOS_TERMOS,
  type AcaoRegistrada,
  type AjusteDaPlataforma,
  type Cupom,
  type EscritorioNaLista,
  type FichaCompleta,
  type LinhaDaLicenca,
  type NotaDaEquipe,
  type Plano,
  type RecusaCrua,
  type AcessoCru,
  type Dia,
  type EscritorioDaPlataforma,
  type FaturaCrua,
  type FotoCrua,
  type IaCru,
  type MarcoCru,
  type PessoaCrua,
  type SituacaoDoEscritorio,
  type UltimoAcesso,
  type UsoCru,
} from "@decreta/core";

const HOJE = hojeEm();
const COTACAO = 5.5;
const TETOS = { siteUsd: 8, avaliacaoUsd: 0.5 };
const MENSALIDADE = 14_900;

/** Um sorteio que dá sempre o mesmo resultado para a mesma chave: a prévia não muda a cada clique. */
function sorte(chave: string): number {
  let h = 2166136261;
  for (let i = 0; i < chave.length; i++) h = Math.imul(h ^ chave.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const id = (n: number) => `b1000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const instante = (dia: Dia, hora = 14) => `${dia}T${String(hora).padStart(2, "0")}:00:00.000Z`;
const diasAtras = (n: number) => somarDias(HOJE, -n);

/* ---------------- Os escritórios ---------------- */

interface Molde {
  nome: string;
  slug: string;
  situacao: SituacaoDoEscritorio;
  gravada?: SituacaoDoEscritorio;
  /** Há quantos dias se cadastrou. */
  idade: number;
  /** Há quantos dias assinou (pagou a primeira). */
  assinou?: number;
  cancelou?: number;
  atraso?: number;
  testeRestante?: number;
  avaliacao?: boolean;
  pessoas: number;
  processos: number;
  /** De 0 a 1: quanto o escritório usa. */
  ritmo: number;
  /** Dias desde o último acesso de qualquer pessoa. */
  sumido?: number;
  /** Até onde chegou nos primeiros passos (0 a 4). */
  passos?: number;
  demonstracao?: boolean;
}

const MOLDES: Molde[] = [
  { nome: "Moraes & Teixeira Advocacia", slug: "moraes-teixeira", situacao: "ativo", idade: 168, assinou: 154, pessoas: 6, processos: 412, ritmo: 1 },
  { nome: "Carvalho Lima Advogados Associados", slug: "carvalho-lima", situacao: "ativo", idade: 140, assinou: 126, pessoas: 4, processos: 233, ritmo: 0.85 },
  { nome: "Ribas Nogueira Advocacia", slug: "ribas-nogueira", situacao: "ativo", idade: 112, assinou: 99, pessoas: 3, processos: 158, ritmo: 0.7 },
  { nome: "Leal & Moura Advocacia", slug: "leal-moura", situacao: "ativo", idade: 96, assinou: 83, pessoas: 2, processos: 97, ritmo: 0.6 },
  { nome: "Prates Advocacia Empresarial", slug: "prates", situacao: "ativo", idade: 75, assinou: 62, pessoas: 3, processos: 121, ritmo: 0.75 },
  { nome: "Fontana & Prado Advogados", slug: "fontana-prado", situacao: "ativo", idade: 70, assinou: 57, pessoas: 2, processos: 64, ritmo: 0.35, sumido: 12 },
  { nome: "Galvão & Sampaio Advocacia", slug: "galvao-sampaio", situacao: "ativo", idade: 88, assinou: 74, cancelou: 3, pessoas: 2, processos: 51, ritmo: 0.2 },
  { nome: "Albuquerque Advocacia Trabalhista", slug: "albuquerque", situacao: "ativo", idade: 17, assinou: 3, pessoas: 3, processos: 88, ritmo: 0.9 },
  { nome: "Siqueira Campos Advocacia", slug: "siqueira-campos", situacao: "inadimplente", idade: 64, assinou: 50, atraso: 4, pessoas: 2, processos: 72, ritmo: 0.5 },
  { nome: "Bastos & Rezende Advogados", slug: "bastos-rezende", situacao: "teste", idade: 12, testeRestante: 2, pessoas: 2, processos: 39, ritmo: 0.8 },
  { nome: "Advocacia Quintela", slug: "quintela", situacao: "teste", idade: 13, testeRestante: 1, pessoas: 1, processos: 4, ritmo: 0.15, passos: 2 },
  { nome: "Torres Menezes Advogados", slug: "torres-menezes", situacao: "teste", idade: 5, testeRestante: 9, avaliacao: true, pessoas: 2, processos: 26, ritmo: 0.95, passos: 3 },
  { nome: "Paiva Advocacia Previdenciária", slug: "paiva-previdenciaria", situacao: "teste", idade: 3, testeRestante: 11, pessoas: 1, processos: 0, ritmo: 0.1, passos: 0 },
  { nome: "Dantas Ferraz Advocacia", slug: "dantas-ferraz", situacao: "teste", idade: 1, testeRestante: 13, avaliacao: true, pessoas: 1, processos: 2, ritmo: 0.4, passos: 1 },
  { nome: "Pacheco Vilela Advogados", slug: "pacheco-vilela", situacao: "so_leitura", gravada: "teste", idade: 24, testeRestante: -10, pessoas: 1, processos: 11, ritmo: 0.1, sumido: 9, passos: 2 },
  { nome: "Rocha Brandão Advocacia", slug: "rocha-brandao", situacao: "cancelado", idade: 150, assinou: 136, cancelou: 46, pessoas: 2, processos: 80, ritmo: 0, sumido: 40 },
  { nome: "Vidal Nascimento Advocacia", slug: "vidal-nascimento", situacao: "cortesia", idade: 180, pessoas: 3, processos: 140, ritmo: 0.65 },
  { nome: "Demonstração", slug: "demonstracao", situacao: "cortesia", idade: 190, pessoas: 4, processos: 30, ritmo: 0.5, demonstracao: true },
];

const RITMO = new Map<string, Molde>();

const escritorios: EscritorioDaPlataforma[] = MOLDES.map((m, i) => {
  const oid = id(i + 1);
  RITMO.set(oid, m);
  const testeAte = m.testeRestante !== undefined ? somarDias(HOJE, m.testeRestante) : null;
  return {
    id: oid,
    nome: m.nome,
    slug: m.slug,
    demonstracao: !!m.demonstracao,
    encerrado: false,
    emAvaliacao: !!m.avaliacao,
    situacao: m.situacao,
    situacaoGravada: m.gravada ?? m.situacao,
    criadoEm: instante(diasAtras(m.idade), 13),
    testeAte,
    diasRestantesDoTeste: testeAte ? diferencaEmDias(HOJE, testeAte) : null,
    diasDeAtraso: m.atraso ?? null,
    acessoAte: m.cancelou !== undefined && m.situacao !== "cancelado" ? somarDias(HOJE, 27) : null,
    assinouEm: m.assinou !== undefined ? instante(diasAtras(m.assinou), 15) : null,
    cancelamentoPedidoEm: m.cancelou !== undefined ? instante(diasAtras(m.cancelou), 18) : null,
    valorMensalCentavos: m.assinou !== undefined ? MENSALIDADE : null,
    pessoas: m.pessoas,
    processos: m.processos,
    iaMesUsd: 0,
  };
});
const porId = new Map(escritorios.map((e) => [e.id, e]));
const ativo = (oid: string, dia: Dia) => {
  const m = RITMO.get(oid)!;
  const o = porId.get(oid)!;
  if (dia < diaDoInstante(o.criadoEm) || dia > HOJE) return false;
  if (m.sumido !== undefined && dia > diasAtras(m.sumido)) return false;
  return true;
};

/* ---------------- As pessoas e os acessos ---------------- */

const NOMES = ["Ana", "Bruno", "Camila", "Diego", "Elisa", "Fábio", "Giovana", "Heitor", "Isadora", "João", "Larissa", "Marcelo", "Natália", "Otávio", "Paula", "Rafael", "Sabrina", "Tiago", "Vanessa", "Wagner", "Yasmin", "Caio", "Débora", "Murilo", "Lívia", "Gustavo", "Renata", "Henrique", "Bianca", "Leonardo", "Mariana", "Eduardo", "Priscila", "Rodrigo", "Tatiana", "Vinícius", "Aline", "Fernando", "Juliana", "Sérgio"];
const SOBRENOMES = ["Azevedo", "Barreto", "Cordeiro", "Duarte", "Esteves", "Fagundes", "Guimarães", "Holanda", "Jardim", "Lacerda", "Macedo", "Neves", "Ornelas", "Peixoto", "Queiroz", "Rangel", "Salgado", "Tavares", "Uchoa", "Valente"];
const tirarAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const pessoasCruas: PessoaCrua[] = [];
const papelNa = new Map<string, string>();
let n = 0;
for (const o of escritorios) {
  const m = RITMO.get(o.id)!;
  for (let k = 0; k < m.pessoas; k++) {
    const nome = NOMES[n % NOMES.length]!;
    const sobrenome = SOBRENOMES[(n * 7 + 3) % SOBRENOMES.length]!;
    const uid = `c2000000-0000-4000-8000-${String(n + 1).padStart(12, "0")}`;
    const papel = k === 0 ? "owner" : k === 1 && m.pessoas > 2 ? "admin" : "member";
    papelNa.set(`${o.id}:${uid}`, papel);
    const criada = somarDias(diaDoInstante(o.criadoEm), k * 3);
    pessoasCruas.push({
      id: uid,
      nome: m.demonstracao ? `Pessoa da demonstração ${k + 1}` : `${nome} ${sobrenome}`,
      email: m.demonstracao ? `demo${k + 1}@decreta.site` : `${tirarAcento(nome)}.${tirarAcento(sobrenome)}@exemplo.adv.br`,
      emailConfirmado: !(k === m.pessoas - 1 && sorte(`email:${uid}`) < 0.25),
      doisFatores: sorte(`2fa:${uid}`) < (k === 0 ? 0.55 : 0.2),
      termosVersao: sorte(`termos:${uid}`) < 0.18 ? "2026-10-01" : VERSAO_DOS_TERMOS,
      criadaEm: instante(criada > HOJE ? HOJE : criada, 12),
      sessoesAbertas: m.sumido && m.sumido > 20 ? 0 : 1 + Math.floor(sorte(`sessoes:${uid}`) * 3),
      escritorios: [{ id: o.id, nome: o.nome, papel, demonstracao: !!m.demonstracao }],
    });
    n++;
  }
}

// Uma pessoa suspensa pela equipe (saiu do escritório Galvão & Sampaio e ainda não foi tirada da equipe).
const suspensa = pessoasCruas.filter((p) => p.escritorios[0]!.nome === "Galvão & Sampaio Advocacia").at(-1);
if (suspensa) suspensa.suspensa = true;
const acessos: AcessoCru[] = [];
for (const p of pessoasCruas) {
  const oid = p.escritorios[0]!.id;
  const m = RITMO.get(oid)!;
  const celular = sorte(`aparelho:${p.id}`) < 0.45;
  for (let d = 0; d < 180; d++) {
    const dia = diasAtras(d);
    if (!ativo(oid, dia) || dia < diaDoInstante(p.criadaEm)) continue;
    const semana = [0, 6].includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
    // Hoje ainda é de manhã na prévia (o relógio dela para às 9h30): metade de quem entra num dia comum.
    const chance = Math.min(0.9, m.ritmo * (semana ? 0.12 : 0.68) * (d === 0 ? 0.5 : 1));
    if (sorte(`acesso:${p.id}:${dia}`) < chance) {
      acessos.push({ organizationId: oid, userId: p.id, dia, aparelho: celular !== sorte(`troca:${p.id}:${dia}`) < 0.15 ? "celular" : "computador" });
    }
  }
}
// Quem sumiu teve o último acesso exatamente no dia em que sumiu.
for (const m of MOLDES.filter((x) => x.sumido)) {
  const o = escritorios.find((e) => e.slug === m.slug)!;
  const dono = pessoasCruas.find((p) => p.escritorios[0]!.id === o.id)!;
  if (!acessos.some((a) => a.userId === dono.id && a.dia === diasAtras(m.sumido!))) acessos.push({ organizationId: o.id, userId: dono.id, dia: diasAtras(m.sumido!), aparelho: "computador" });
}
const ultimos = new Map<string, UltimoAcesso>();
for (const a of acessos) {
  const k = `${a.organizationId}:${a.userId}`;
  if (!ultimos.has(k) || ultimos.get(k)!.ultimo < a.dia) ultimos.set(k, { organizationId: a.organizationId, userId: a.userId, ultimo: a.dia });
}
const ultimosAcessos = [...ultimos.values()];

/* ---------------- Os primeiros passos ---------------- */

const NOMES_DOS_PASSOS = ["cadastro_concluido", "oab_cadastrada", "primeira_publicacao", "primeiro_prazo_confirmado"];
const marcos: MarcoCru[] = [];
for (const o of escritorios) {
  const m = RITMO.get(o.id)!;
  const ate = m.passos ?? 4;
  const inicio = diaDoInstante(o.criadoEm);
  for (let k = 0; k < ate; k++) marcos.push({ organizationId: o.id, nome: NOMES_DOS_PASSOS[k]!, em: instante(somarDias(inicio, k === 0 ? 0 : Math.min(k, m.idade)), 13 + k) });
}

/* ---------------- A IA ---------------- */

const METODOS: { metodo: string; origem: "fundo" | "tela"; usd: number; chance: number; chat?: boolean }[] = [
  { metodo: "sugerir-prazo", origem: "fundo", usd: 0.028, chance: 0.95 },
  { metodo: "observar-prazo", origem: "fundo", usd: 0.008, chance: 0.8 },
  { metodo: "perguntar", origem: "tela", usd: 0.024, chance: 0.6, chat: true },
  { metodo: "gerar-documento", origem: "tela", usd: 0.11, chance: 0.25 },
  { metodo: "resumo-autos", origem: "tela", usd: 0.03, chance: 0.3 },
  { metodo: "chat-processo", origem: "tela", usd: 0.012, chance: 0.35, chat: true },
  { metodo: "briefing-prazo", origem: "tela", usd: 0.01, chance: 0.4 },
  { metodo: "ler-pdf", origem: "tela", usd: 0.015, chance: 0.3 },
  { metodo: "mensagem-cliente", origem: "tela", usd: 0.005, chance: 0.3 },
  { metodo: "jurisprudencia", origem: "tela", usd: 0.018, chance: 0.15 },
  { metodo: "preparar-audiencia", origem: "tela", usd: 0.025, chance: 0.08 },
  { metodo: "transcription", origem: "tela", usd: 0.008, chance: 0.1 },
];
const ia: IaCru[] = [];
for (const o of escritorios) {
  const m = RITMO.get(o.id)!;
  for (let d = 0; d < 120; d++) {
    const dia = diasAtras(d);
    if (!ativo(o.id, dia) || m.ritmo === 0) continue;
    const escala = (m.processos / 120 + 0.4) * m.ritmo;
    for (const x of METODOS) {
      if (sorte(`ia:${o.id}:${dia}:${x.metodo}`) > x.chance * Math.min(1, m.ritmo + 0.2)) continue;
      const vezes = 1 + Math.floor(sorte(`vezes:${o.id}:${dia}:${x.metodo}`) * 4 * escala);
      const custo = Math.round(vezes * x.usd * (0.6 + sorte(`custo:${o.id}:${dia}:${x.metodo}`)) * 1000) / 1000;
      ia.push({ organizationId: o.id, dia, metodo: x.metodo, origem: x.origem, chamadas: vezes, mensagens: x.chat ? vezes : 0, custoUsd: custo, custoEstimadoUsd: x.metodo === "transcription" ? custo : 0 });
    }
  }
}
// O escritório em avaliação está perto do teto de hoje para contas novas (US$ 0,43 de US$ 0,50).
const torres = escritorios.find((e) => e.slug === "torres-menezes")!;
for (let k = ia.length - 1; k >= 0; k--) if (ia[k]!.organizationId === torres.id && ia[k]!.dia === HOJE) ia.splice(k, 1);
ia.push({ organizationId: torres.id, dia: HOJE, metodo: "gerar-documento", origem: "tela", chamadas: 3, mensagens: 0, custoUsd: 0.31, custoEstimadoUsd: 0 }, { organizationId: torres.id, dia: HOJE, metodo: "sugerir-prazo", origem: "fundo", chamadas: 4, mensagens: 0, custoUsd: 0.12, custoEstimadoUsd: 0 });
for (const o of escritorios) o.iaMesUsd = Math.round(ia.filter((i) => i.organizationId === o.id && i.dia.slice(0, 7) === HOJE.slice(0, 7)).reduce((s, i) => s + i.custoUsd, 0) * 100) / 100;

/* ---------------- As faturas ---------------- */

const faturas: (FaturaCrua & { forma: string | null })[] = [];
for (const o of escritorios.filter((x) => x.assinouEm)) {
  const m = RITMO.get(o.id)!;
  const inicio = diaDoInstante(o.assinouEm!);
  const fim = m.situacao === "cancelado" ? diasAtras(m.cancelou!) : somarDias(HOJE, 10);
  const forma = ["pix", "boleto", "cartao"][Math.floor(sorte(`forma:${o.id}`) * 3)]!;
  const vencimentos: Dia[] = [];
  for (let k = 0; somarDias(inicio, 30 * k) <= fim; k++) vencimentos.push(somarDias(inicio, 30 * k));
  // Quem está em atraso tem a última fatura vencida há tantos dias.
  const vencidas = vencimentos.filter((v) => v <= HOJE);
  if (m.atraso !== undefined && vencidas.length) vencimentos[vencidas.length - 1] = somarDias(HOJE, -m.atraso);
  vencimentos.forEach((venc, k) => {
    const atrasada = m.atraso !== undefined && k === vencidas.length - 1;
    const situacao = atrasada ? "atrasada" : venc > HOJE ? "pendente" : "paga";
    faturas.push({ id: `f3000000-0000-4000-8000-${String(faturas.length + 1).padStart(12, "0")}`, organizationId: o.id, vencimento: venc, valorCentavos: MENSALIDADE, situacao, pagaEm: situacao === "paga" ? somarDias(venc, Math.floor(sorte(`paga:${o.id}:${k}`) * 3) - 1) : null, forma: situacao === "paga" ? forma : null });
  });
}

/* ---------------- O uso das funcionalidades ---------------- */

/** Quanto um escritório típico faz de cada coisa por dia, e quantos escritórios usam aquilo. */
const TAXA: Record<string, { porDia: number; adocao: number }> = {
  publicacoes: { porDia: 7, adocao: 1 },
  publicacoes_tratadas: { porDia: 6, adocao: 0.95 },
  prazos_sugeridos: { porDia: 3.2, adocao: 0.95 },
  prazos_confirmados: { porDia: 2.8, adocao: 0.9 },
  prazos_data_digitada: { porDia: 0.3, adocao: 0.6 },
  prazos_descartados: { porDia: 0.3, adocao: 0.7 },
  pecas: { porDia: 0.6, adocao: 0.7 },
  pecas_revisadas: { porDia: 0.45, adocao: 0.6 },
  retornos_uteis: { porDia: 0.35, adocao: 0.5 },
  retornos_errados: { porDia: 0.06, adocao: 0.3 },
  conversas: { porDia: 0.5, adocao: 0.65 },
  mensagens_chat: { porDia: 2.6, adocao: 0.65 },
  modelos: { porDia: 0.04, adocao: 0.3 },
  calculos: { porDia: 0.2, adocao: 0.4 },
  radar: { porDia: 0.1, adocao: 0.35 },
  processos: { porDia: 0.5, adocao: 0.95 },
  clientes: { porDia: 0.4, adocao: 0.9 },
  documentos: { porDia: 1.6, adocao: 0.8 },
  atendimentos: { porDia: 0.8, adocao: 0.45 },
  audiencias: { porDia: 0.3, adocao: 0.7 },
  tarefas: { porDia: 1.3, adocao: 0.6 },
  tarefas_concluidas: { porDia: 1.1, adocao: 0.6 },
  contratos_honorarios: { porDia: 0.15, adocao: 0.4 },
  pagamentos_honorarios: { porDia: 0.3, adocao: 0.35 },
  alvaras: { porDia: 0.08, adocao: 0.3 },
  negocios: { porDia: 0.1, adocao: 0.25 },
  mensagens_cliente: { porDia: 0.7, adocao: 0.5 },
  assinaturas: { porDia: 0.05, adocao: 0.2 },
  avisos_enviados: { porDia: 3, adocao: 0.85 },
  avisos_falhos: { porDia: 0.05, adocao: 0.3 },
  exportacoes: { porDia: 0.01, adocao: 0.1 },
  mcp: { porDia: 0.4, adocao: 0.08 },
};
const CHAVES = [...new Set([...FUNCIONALIDADES.map((f) => f.chave), ...Object.keys(TAXA)])];

function usoEntre(de: Dia, ate: Dia): UsoCru[] {
  const linhas: UsoCru[] = [];
  for (const o of escritorios) {
    const m = RITMO.get(o.id)!;
    let dias = 0;
    for (let d = de; d <= ate; d = somarDias(d, 1)) if (ativo(o.id, d)) dias++;
    if (!dias) continue;
    for (const chave of CHAVES) {
      const t = TAXA[chave] ?? { porDia: 0.1, adocao: 0.3 };
      if (sorte(`adota:${o.id}:${chave}`) > t.adocao * Math.min(1, m.ritmo + 0.3)) continue;
      const escala = (m.processos / 150 + 0.3) * m.ritmo;
      const total = Math.round(t.porDia * dias * escala * (0.7 + 0.6 * sorte(`uso:${o.id}:${chave}:${de}`)));
      if (total > 0) linhas.push({ organizationId: o.id, funcionalidade: chave, total });
    }
  }
  return linhas;
}

/* ---------------- O histórico do MRR ---------------- */

/** A foto do último dia de cada um dos seis meses passados: quem pagava naquele dia. */
function fotos(): FotoCrua[] {
  const [ano, mes] = HOJE.split("-").map(Number) as [number, number];
  return Array.from({ length: 6 }, (_, k) => {
    const ultimoDia = new Date(Date.UTC(ano, mes - 1 - k, 0)).toISOString().slice(0, 10);
    const pagavam = escritorios.filter((o) => !o.demonstracao && o.assinouEm && diaDoInstante(o.assinouEm) <= ultimoDia && !(o.situacao === "cancelado" && o.cancelamentoPedidoEm && diaDoInstante(o.cancelamentoPedidoEm) <= ultimoDia));
    return { dia: ultimoDia, numeros: { mrrCentavos: pagavam.length * MENSALIDADE, pagantes: pagavam.length } };
  });
}

/* ---------------- A auditoria ---------------- */

const acoes: AcaoRegistrada[] = [
  { id: "d4000000-0000-4000-8000-000000000001", operador: "equipe@decreta.site", acao: "plataforma.estender_teste", organizationId: escritorios.find((e) => e.slug === "bastos-rezende")!.id, escritorio: "Bastos & Rezende Advogados", detalhes: { dias: 5, motivo: "Pediu mais uns dias para mostrar ao sócio" }, em: instante(diasAtras(2), 17) },
  { id: "d4000000-0000-4000-8000-000000000002", operador: "equipe@decreta.site", acao: "plataforma.nova_senha", organizationId: escritorios.find((e) => e.slug === "ribas-nogueira")!.id, escritorio: "Ribas Nogueira Advocacia", detalhes: { pessoa: pessoasCruas.find((p) => p.escritorios[0]!.nome === "Ribas Nogueira Advocacia")!.email, motivo: "Esqueceu a senha, pediu por WhatsApp" }, em: instante(diasAtras(4), 12) },
  { id: "d4000000-0000-4000-8000-000000000003", operador: "equipe@decreta.site", acao: "plataforma.liberar", organizationId: escritorios.find((e) => e.slug === "albuquerque")!.id, escritorio: "Albuquerque Advocacia Trabalhista", detalhes: { motivo: "Conferi a OAB no CNA" }, em: instante(diasAtras(15), 19) },
  { id: "d4000000-0000-4000-8000-000000000004", operador: "equipe@decreta.site", acao: "plataforma.cortesia", organizationId: escritorios.find((e) => e.slug === "vidal-nascimento")!.id, escritorio: "Vidal Nascimento Advocacia", detalhes: { motivo: "Escritório parceiro do piloto" }, em: instante(diasAtras(170), 15) },
];

/* ---------------- Os planos, as licenças, os cupons e as notas (exemplos) ---------------- */

const OPERADOR = "equipe@decreta.site";
const planoBase = { padrao: false, criadoPor: OPERADOR, substituidoEm: null as string | null, funcionalidades: {} };
const planos: Plano[] = [
  { ...planoBase, id: "e5000000-0000-4000-8000-000000000001", codigo: "escritorio", versao: 1, nome: "Escritório", mensalCentavos: 12_900, anualCentavos: null, pessoasIncluidas: 3, pessoaExtraCentavos: 3_900, limites: { processos: 800 }, padrao: true, criadoEm: instante(diasAtras(170), 12), criadoPor: null, substituidoEm: instante(diasAtras(60), 12) },
  { ...planoBase, id: "e5000000-0000-4000-8000-000000000002", codigo: "escritorio", versao: 2, nome: "Escritório", mensalCentavos: MENSALIDADE, anualCentavos: 149_000, pessoasIncluidas: 3, pessoaExtraCentavos: 3_900, limites: { processos: 1000, iaMesUsd: 40, whatsappDia: 60, arquivosGb: 20 }, padrao: true, criadoEm: instante(diasAtras(60), 12) },
  { ...planoBase, id: "e5000000-0000-4000-8000-000000000003", codigo: "banca", versao: 1, nome: "Banca", mensalCentavos: 34_900, anualCentavos: 349_000, pessoasIncluidas: 10, pessoaExtraCentavos: 2_900, limites: { processos: 5000, iaMesUsd: 150, whatsappDia: 300, arquivosGb: 100 }, criadoEm: instante(diasAtras(20), 15) },
  { ...planoBase, id: "e5000000-0000-4000-8000-000000000004", codigo: "solo", versao: 1, nome: "Solo", mensalCentavos: 7_900, anualCentavos: null, pessoasIncluidas: 1, pessoaExtraCentavos: null, limites: { processos: 300, iaMesUsd: 15, whatsappDia: 20 }, funcionalidades: { financeiro: false, assinatura: false }, criadoEm: instante(diasAtras(20), 15) },
];
const planoPorId = new Map(planos.map((p) => [p.id, p]));
const [V1, V2, BANCA, SOLO] = planos as [Plano, Plano, Plano, Plano];

/** A licença de cada escritório: quem assinou antes da versão 2 ficou na 1; os outros, na padrão. */
const licencas = new Map<string, LinhaDaLicenca>();
for (const o of escritorios) {
  const m = RITMO.get(o.id)!;
  const antigo = m.assinou !== undefined && m.assinou > 60;
  licencas.set(o.id, { planoId: antigo ? V1.id : V2.id, pessoasExtras: m.pessoas > 3 ? m.pessoas - 3 : 0, valorCombinadoCentavos: null, desconto: null, marca: null, tetosIa: null });
}
const licencaDe = (slug: string) => licencas.get(escritorios.find((e) => e.slug === slug)!.id)!;
Object.assign(licencaDe("moraes-teixeira"), { planoId: BANCA.id, pessoasExtras: 0, marca: "piloto" });
Object.assign(licencaDe("vidal-nascimento"), { marca: "parceiro", valorCombinadoCentavos: 0 });
Object.assign(licencaDe("albuquerque"), { marca: "indicacao", desconto: { tipo: "percentual", valor: 20, ate: fimDoDesconto(diasAtras(3), 3), cupom: "INDICA20" } });
Object.assign(licencaDe("prates"), { desconto: { tipo: "valor", valor: 3_000, ate: fimDoDesconto(diasAtras(40), 6), cupom: null } });
Object.assign(licencaDe("paiva-previdenciaria"), { planoId: SOLO.id });
Object.assign(licencaDe("torres-menezes"), { tetosIa: { diaUsd: 1, mesUsd: null, mensagensPorDia: null } });

/** O uso que a prévia inventa para os limites: os processos e as pessoas são os da lista; o resto, proporcional. */
const consumoDe = (o: EscritorioDaPlataforma) => ({
  pessoas: o.pessoas,
  processos: o.slug === "carvalho-lima" ? 870 : o.processos,
  oabs: Math.max(1, Math.round(o.pessoas * 0.7)),
  iaMesUsd: o.iaMesUsd,
  arquivosBytes: Math.round(o.processos * 3.1 * 410_000),
  whatsappHoje: Math.round(o.pessoas * 2.5 * (RITMO.get(o.id)!.ritmo || 0)),
});

const planoDe = (oid: string) => planoPorId.get(licencas.get(oid)!.planoId!) ?? V2;

// A assinatura acompanha a licença (o servidor acerta o valor no Asaas toda noite): a lista, as faturas e o MRR batem.
for (const o of escritorios) {
  if (o.valorMensalCentavos === null) continue;
  const valor = precoDoEscritorio(planoDe(o.id), licencas.get(o.id)!, HOJE).mensalidadeCentavos ?? o.valorMensalCentavos;
  o.valorMensalCentavos = valor;
  for (const f of faturas) if (f.organizationId === o.id) f.valorCentavos = valor;
}

const lista: EscritorioNaLista[] = escritorios.map((o) => {
  const l = licencas.get(o.id)!;
  const plano = planoDe(o.id);
  const uso = montarLicenca({ plano, pessoasExtras: l.pessoasExtras, tetos: l.tetosIa, consumo: consumoDe(o) });
  const preco = precoDoEscritorio(plano, l, HOJE);
  return {
    ...o,
    plano: { id: plano.id, nome: plano.nome, versao: plano.versao, antigo: !!plano.substituidoEm },
    marca: l.marca,
    mensalidadeCentavos: o.situacao === "cortesia" ? 0 : preco.mensalidadeCentavos,
    comDesconto: preco.descontoCentavos > 0,
    limites: { estado: uso.estado, alertas: uso.alertas, rotulos: uso.itens.filter((i) => i.estado !== "ok").map((i) => i.rotulo) },
  };
});

const cupons: Cupom[] = [
  { id: "e6000000-0000-4000-8000-000000000001", codigo: "OAB-SUBSECAO", tipo: "percentual", valor: 15, meses: 6, validoAte: somarDias(HOJE, 55), limiteDeUsos: 30, usos: 4, nota: "Parceria com uma subseção da OAB (exemplo)", criadoPor: OPERADOR, criadoEm: instante(diasAtras(30), 14), desativadoEm: null },
  { id: "e6000000-0000-4000-8000-000000000002", codigo: "INDICA20", tipo: "percentual", valor: 20, meses: 3, validoAte: null, limiteDeUsos: null, usos: 2, nota: "Indicação entre escritórios", criadoPor: OPERADOR, criadoEm: instante(diasAtras(50), 10), desativadoEm: null },
  { id: "e6000000-0000-4000-8000-000000000003", codigo: "FEIRA-JURIDICA", tipo: "valor", valor: 5_000, meses: 1, validoAte: diasAtras(12), limiteDeUsos: 50, usos: 7, nota: "Estande numa feira (exemplo)", criadoPor: OPERADOR, criadoEm: instante(diasAtras(80), 9), desativadoEm: null },
];

const notas = new Map<string, NotaDaEquipe[]>();
const anotar = (slug: string, n: Omit<NotaDaEquipe, "id" | "operador" | "retornoFeitoEm"> & { retornoFeitoEm?: string | null }) => {
  const o = escritorios.find((e) => e.slug === slug)!;
  const lista_ = notas.get(o.id) ?? [];
  lista_.unshift({ id: `e7000000-0000-4000-8000-${String(lista_.length + notas.size * 10 + 1).padStart(12, "0")}`, operador: OPERADOR, retornoFeitoEm: null, ...n });
  notas.set(o.id, lista_);
};
anotar("bastos-rezende", { texto: "A sócia gostou do resumo da manhã e quer mostrar ao outro sócio antes de assinar.", contato: "WhatsApp da sócia", proximoPasso: "Perguntar se o sócio já viu", retornoEm: HOJE, criadaEm: instante(diasAtras(2), 17) });
anotar("carvalho-lima", { texto: "Chegando no limite de processos do plano. Ofereço a Banca ou um valor combinado.", contato: "E-mail do sócio administrador", proximoPasso: "Mandar a proposta da Banca", retornoEm: diasAtras(1), criadaEm: instante(diasAtras(6), 11) });
anotar("siqueira-campos", { texto: "Fatura em atraso: disseram que o boleto foi para o spam.", contato: "Telefone do escritório", proximoPasso: "Reenviar o link da fatura", retornoEm: somarDias(HOJE, 2), criadaEm: instante(diasAtras(1), 15) });

const retornos = [...notas.entries()].flatMap(([organizationId, ns]) => ns.filter((x) => x.retornoEm && !x.retornoFeitoEm && x.retornoEm <= HOJE).map((x) => ({ organizationId, retornoEm: x.retornoEm!, proximoPasso: x.proximoPasso })));
const limitesNaAtencao = lista.filter((e) => !e.demonstracao && e.limites.estado !== "ok").map((e) => ({ organizationId: e.id, estado: e.limites.estado as "perto" | "passou", rotulos: e.limites.rotulos }));

const PADRAO_DOS_AJUSTES: Record<string, number> = { testeDias: 14, cotacaoUsd: COTACAO, "ia.tetoSiteUsd": TETOS.siteUsd, "ia.tetoPessoaUsd": 2, "ia.mensagensPorDia": 120, "ia.mensagensPorMinuto": 8, "ia.simultaneos": 3, "ia.demonstracaoTetoUsd": TETOS.avaliacaoUsd, "ia.demonstracaoMensagensPorDia": 30 };
const ajustes: AjusteDaPlataforma[] = AJUSTES_DA_PLATAFORMA.map((d) => {
  const mudado = d.chave === "ia.tetoPessoaUsd" ? { valor: 3, mudadoPor: OPERADOR, mudadoEm: instante(diasAtras(5), 16) } : null;
  return { ...d, valor: mudado?.valor ?? PADRAO_DOS_AJUSTES[d.chave]!, padrao: PADRAO_DOS_AJUSTES[d.chave]!, mudadoPor: mudado?.mudadoPor ?? null, mudadoEm: mudado?.mudadoEm ?? null };
});

const recusas: RecusaCrua[] = [];
for (const o of escritorios) {
  for (let d = 0; d < 30; d++) {
    const dia = diasAtras(d);
    const chance = o.slug === "torres-menezes" ? 0.5 : o.slug === "moraes-teixeira" ? 0.25 : o.demonstracao ? 0.35 : 0.02;
    if (sorte(`recusa:${o.id}:${dia}`) < chance) recusas.push({ organizationId: o.id, dia, motivo: o.demonstracao ? "demonstracao" : o.slug === "torres-menezes" ? "em_avaliacao" : o.slug === "moraes-teixeira" ? "mensagens_do_dia" : "minuto", total: 1 + Math.floor(sorte(`recusas:${o.id}:${dia}`) * 3) });
  }
}

const linkDaFatura = (fid: string) => `https://www.asaas.com/i/${fid.slice(-8)}`;

function fichaCompleta(oid: string): FichaCompleta | null {
  const base = ficha(oid);
  if (!base) return null;
  const o = porId.get(oid)!;
  const plano = planoDe(oid);
  return {
    ...base,
    licenca: montarLicencaCompleta(plano, licencas.get(oid)!, consumoDe(o), HOJE),
    notas: notas.get(oid) ?? [],
    planos: [...planos.filter((p) => !p.substituidoEm), ...(plano.substituidoEm ? [plano] : [])].map((p) => ({ id: p.id, nome: p.nome, versao: p.versao, mensalCentavos: p.mensalCentavos, vivo: !p.substituidoEm })),
    cobranca: { linkGuardado: o.situacao === "teste", assinaturaViva: !!o.assinouEm && o.situacao !== "cancelado" },
  };
}

function planosNaLista() {
  return planos.map((p) => {
    const deles = lista.filter((e) => !e.demonstracao && e.plano.id === p.id);
    return { ...p, escritorios: deles.length, assinantes: deles.filter((e) => e.assinouEm).length };
  });
}

/* ---------------- As respostas ---------------- */

const reais = new Set(escritorios.filter((e) => !e.demonstracao && !e.encerrado).map((e) => e.id));

function visaoGeral() {
  return montarVisaoGeral({ hoje: HOJE, escritorios, acessos: acessos.filter((a) => a.dia >= diasAtras(29)), ultimosAcessos, marcos, ia: ia.filter((i) => i.dia >= diasAtras(29)), faturas, fotos: fotos(), cotacaoUsd: COTACAO, tetos: TETOS, extras: { retornos, limites: limitesNaAtencao } });
}

function indicadores(dias: number) {
  const de = somarDias(HOJE, 1 - dias);
  const lista = escritorios.filter((e) => reais.has(e.id));
  const noPeriodo = (iso: string | null) => !!iso && diaDoInstante(iso) >= de;
  const cadastrados = lista.filter((e) => noPeriodo(e.criadoEm));
  const terminaram = cadastrados.filter((e) => e.assinouEm || (e.testeAte && e.testeAte < HOJE));
  const assinaram = cadastrados.filter((e) => e.assinouEm);
  const cancelados = lista.filter((e) => noPeriodo(e.cancelamentoPedidoEm));
  const atraso = lista.filter((e) => e.diasDeAtraso !== null);
  const porSituacao = Object.fromEntries((["teste", "ativo", "inadimplente", "so_leitura", "bloqueado", "cancelado", "cortesia"] as const).map((s) => [s, lista.filter((e) => e.situacao === s).length]));
  const escala = dias / 30;
  const visitas = Math.round(1400 * escala);
  const passos = [visitas, Math.round(visitas * 0.14), Math.round(visitas * 0.14 * 0.42), Math.round(visitas * 0.14 * 0.42 * 0.78), Math.round(visitas * 0.14 * 0.42 * 0.78 * 0.7), Math.round(visitas * 0.14 * 0.42 * 0.78 * 0.7 * 0.72)];
  const rotulos = [
    ["visita", "Visitas ao site"],
    ["clicou_criar_conta", "Clicaram em criar conta"],
    ["cadastro_concluido", "Cadastros concluídos"],
    ["oab_cadastrada", "OAB cadastrada"],
    ["primeira_publicacao", "Primeira publicação"],
    ["primeiro_prazo_confirmado", "Primeiro prazo confirmado"],
  ];
  return {
    periodo: { de, ate: HOJE, dias },
    mrrCentavos: lista.filter((e) => (e.situacaoGravada === "ativo" || e.situacaoGravada === "inadimplente") && e.situacao !== "cancelado").length * MENSALIDADE,
    mrrEmAtrasoCentavos: atraso.length * MENSALIDADE,
    porSituacao,
    conversao: { cadastrados: cadastrados.length, terminaram: terminaram.length, assinaram: assinaram.length, taxa: terminaram.length ? assinaram.length / terminaram.length : null },
    cancelamentos: { total: cancelados.length, mrrPerdidoCentavos: cancelados.length * MENSALIDADE },
    inadimplencia: { escritorios: atraso.length, mrrCentavos: atraso.length * MENSALIDADE },
    funil: rotulos.map(([nome, rotulo], k) => ({ nome: nome!, rotulo: rotulo!, total: passos[k]!, doAnterior: k ? passos[k]! / passos[k - 1]! : null })),
  };
}

function pessoas() {
  return montarPessoas({ hoje: HOJE, pessoas: pessoasCruas, acessos: acessos.filter((a) => a.dia >= diasAtras(29)), ultimosAcessos, versaoDosTermos: VERSAO_DOS_TERMOS });
}

function uso(dias: number) {
  const de = somarDias(HOJE, 1 - dias);
  const ativos = new Set(acessos.filter((a) => a.dia >= de).map((a) => a.organizationId));
  return montarUso({ periodo: { de, ate: HOJE, dias }, reais, ativos, atual: usoEntre(de, HOJE), anterior: usoEntre(somarDias(de, -dias), somarDias(de, -1)) });
}

function ficha(oid: string) {
  const o = porId.get(oid);
  if (!o) return null;
  const m = RITMO.get(oid)!;
  const daqui = pessoasCruas.filter((p) => p.escritorios[0]!.id === oid);
  const prazosDoMes = usoEntre(diasAtras(29), HOJE).filter((u) => u.organizationId === oid);
  const ultimaLeitura = m.ritmo > 0 && m.situacao !== "cancelado" && m.situacao !== "so_leitura" ? `${HOJE}T${String(Math.min(new Date().getUTCHours(), 11)).padStart(2, "0")}:05:00.000Z` : null;
  return montarFicha({
    hoje: HOJE,
    escritorio: o,
    fuso: "America/Sao_Paulo",
    totais: {
      processos: o.processos,
      clientes: Math.round(o.processos * 0.82),
      publicacoes: Math.round(o.processos * 2.6 * Math.min(1, m.idade / 60)),
      prazosAbertos: Math.round(o.processos * 0.09 * m.ritmo),
      pecas: Math.round(m.idade * 0.5 * m.ritmo),
      documentos: Math.round(o.processos * 3.1),
      espacoBytes: Math.round(o.processos * 3.1 * 410_000),
      conversas: Math.round(m.idade * 0.4 * m.ritmo),
      oabs: (m.passos ?? 4) >= 2 ? Math.max(1, Math.round(m.pessoas * 0.7)) : 0,
    },
    pessoas: daqui.map((p) => ({ id: p.id, nome: p.nome, email: p.email, papel: papelNa.get(`${oid}:${p.id}`) ?? "member", doisFatores: p.doisFatores, emailConfirmado: p.emailConfirmado })),
    acessos: acessos.filter((a) => a.organizationId === oid && a.dia >= diasAtras(29)),
    ultimosAcessos: ultimosAcessos.filter((a) => a.organizationId === oid),
    marcos,
    faturas: faturas.filter((f) => f.organizationId === oid).map(({ id: fid, vencimento, valorCentavos, situacao, pagaEm, forma }) => ({ id: fid, vencimento, valorCentavos, situacao, pagaEm, forma })),
    uso: prazosDoMes,
    ia: ia.filter((i) => i.organizationId === oid),
    captura: { ultimaEm: ultimaLeitura, errosNaSemana: m.slug === "siqueira-campos" ? 2 : 0, ultimoErro: m.slug === "siqueira-campos" ? "O DJEN demorou mais de 30 s para responder" : null },
    acoes,
  });
}

const json = (status: number, dados: unknown) => new Response(JSON.stringify(dados), { status, headers: { "content-type": "application/json" } });
const dias = (busca: URLSearchParams, padrao: number) => Math.min(180, Math.max(1, Number(busca.get("dias") ?? padrao) || padrao));

/** Atende /api/plataforma/... na prévia. As ações respondem "feito" e quase nada muda (só a lista de cupons, as notas e os ajustes, até recarregar). */
export async function atenderPlataforma(metodo: string, caminho: string, busca: URLSearchParams, pedido: Request): Promise<Response> {
  if (metodo === "POST") {
    const corpo = (await pedido.clone().json().catch(() => ({}))) as Record<string, any> & { acao?: string };
    if (caminho === "/planos") return json(201, { plano: { ...planoBase, ...corpo, id: crypto.randomUUID(), codigo: normalizarCodigoDoCupom(String(corpo.nome ?? "plano")).toLowerCase(), versao: 1, criadoEm: new Date().toISOString() } });
    const doPlano = /^\/planos\/([^/]+)(\/padrao)?$/.exec(caminho);
    if (doPlano) {
      const p = planoPorId.get(doPlano[1]!);
      if (!p) return json(404, { erro: "recusado", detalhe: "Plano não encontrado." });
      if (doPlano[2]) return json(200, { plano: { ...p, padrao: true } });
      if (p.substituidoEm) return json(409, { erro: "recusado", detalhe: "Esta versão já foi substituída. Mude a versão mais nova do plano." });
      const deles = lista.filter((e) => e.plano.id === p.id);
      return json(200, { plano: { ...p, ...corpo, versao: p.versao + 1 }, passaram: deles.filter((e) => !e.assinouEm).length, ficaram: deles.filter((e) => e.assinouEm).length });
    }
    if (caminho === "/cupons") {
      const codigo = normalizarCodigoDoCupom(String(corpo.codigo ?? ""));
      if (cupons.some((c) => c.codigo === codigo)) return json(409, { erro: "recusado", detalhe: "Já existe um cupom com este código." });
      const cupom: Cupom = { id: crypto.randomUUID(), codigo, tipo: corpo.tipo, valor: corpo.valor, meses: corpo.meses, validoAte: corpo.validoAte ?? null, limiteDeUsos: corpo.limiteDeUsos ?? null, usos: 0, nota: corpo.nota ?? null, criadoPor: OPERADOR, criadoEm: new Date().toISOString(), desativadoEm: null };
      cupons.unshift(cupom);
      return json(201, { cupom });
    }
    const desativar = /^\/cupons\/([^/]+)\/desativar$/.exec(caminho);
    if (desativar) {
      const c = cupons.find((x) => x.id === desativar[1]);
      if (!c) return json(404, { erro: "recusado", detalhe: "Cupom não encontrado." });
      c.desativadoEm = new Date().toISOString();
      return json(200, { cupom: c });
    }
    const ajuste = /^\/ajustes\/([^/]+)$/.exec(caminho);
    if (ajuste) {
      const a = ajustes.find((x) => x.chave === ajuste[1]);
      if (!a) return json(404, { erro: "recusado", detalhe: "Ajuste desconhecido." });
      const volta = corpo.valor === null || corpo.valor === a.padrao;
      Object.assign(a, { valor: volta ? a.padrao : corpo.valor, mudadoPor: volta ? null : OPERADOR, mudadoEm: volta ? null : new Date().toISOString() });
      return json(200, { ajuste: a });
    }
    const nota = /^\/escritorios\/([^/]+)\/notas$/.exec(caminho);
    if (nota) {
      const nova: NotaDaEquipe = { id: crypto.randomUUID(), operador: OPERADOR, texto: corpo.texto, contato: corpo.contato ?? null, proximoPasso: corpo.proximoPasso ?? null, retornoEm: corpo.retornoEm ?? null, retornoFeitoEm: null, criadaEm: new Date().toISOString() };
      notas.set(nota[1]!, [nova, ...(notas.get(nota[1]!) ?? [])]);
      return json(201, { nota: nova });
    }
    const retorno = /^\/notas\/([^/]+)\/retorno-feito$/.exec(caminho);
    if (retorno) {
      const n_ = [...notas.values()].flat().find((x) => x.id === retorno[1]);
      if (!n_ || n_.retornoFeitoEm) return json(404, { erro: "recusado", detalhe: "Nota não encontrada, ou o retorno já foi feito." });
      n_.retornoFeitoEm = new Date().toISOString();
      return json(200, { nota: n_ });
    }
    const naPessoa = /^\/pessoas\/([^/]+)\/acao$/.exec(caminho);
    if (naPessoa) return json(200, { ok: true, ...(corpo.acao === "encerrar_sessoes" ? { sessoesEncerradas: pessoasCruas.find((p) => p.id === naPessoa[1])?.sessoesAbertas ?? 0 } : {}) });
    const noEscritorio = /^\/escritorios\/([^/]+)\/acao$/.exec(caminho);
    if (noEscritorio) {
      const o = porId.get(noEscritorio[1]!);
      return o ? json(200, { ok: true, antes: o.situacao, depois: o.situacao }) : json(404, { erro: "recusado", detalhe: "Escritório não encontrado." });
    }
    return json(404, { erro: "nao_encontrado" });
  }
  if (caminho === "/escritorios") return json(200, { escritorios: lista });
  if (caminho === "/planos") return json(200, { planos: planosNaLista(), cupons, ajustes: ajustes.filter((a) => a.grupo === "Teste"), cobranca: { ativa: true, asaas: true }, hoje: HOJE });
  if (caminho === "/ajustes") return json(200, { ajustes });
  if (caminho === "/faturas") {
    const mes = busca.get("mes") ?? HOJE.slice(0, 7);
    const comLink = faturas.map((f) => ({ ...f, link: f.situacao === "paga" ? null : linkDaFatura(f.id) }));
    return json(200, { ...montarFaturas({ hoje: HOJE, mes, escritorios, faturas: comLink }), cobranca: { ativa: true, asaas: true, nfse: true } });
  }
  if (caminho === "/visao-geral") return json(200, visaoGeral());
  if (caminho === "/indicadores") return json(200, indicadores(dias(busca, 30)));
  if (caminho === "/pessoas") return json(200, pessoas());
  if (caminho === "/uso") return json(200, uso(dias(busca, 30)));
  if (caminho === "/ia") {
    const d = Math.min(90, dias(busca, 30));
    const desde = somarDias(HOJE, 1 - d);
    return json(200, { ...montarCustoDaIa({ hoje: HOJE, dias: d, escritorios, ia, cotacaoUsd: COTACAO, tetoSiteUsd: TETOS.siteUsd }), recusas: montarRecusasDaIa({ hoje: HOJE, dias: d, escritorios, recusas: recusas.filter((r) => r.dia >= desde) }), ajustes: ajustes.filter((a) => a.grupo !== "Teste") });
  }
  if (caminho === "/auditoria") return json(200, { itens: acoes });
  const daFicha = /^\/escritorios\/([^/]+)$/.exec(caminho);
  if (daFicha) {
    const f = fichaCompleta(daFicha[1]!);
    return f ? json(200, f) : json(404, { erro: "nao_encontrado" });
  }
  return json(404, { erro: "nao_encontrado" });
}
