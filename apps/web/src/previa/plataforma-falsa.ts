/**
 * O painel da plataforma na prévia: escritórios, pessoas, acessos, uso, IA e faturas todos inventados, e as mesmas
 * contas do servidor (`montar*` de @decreta/core) por cima. O que a prévia mostra é o que o painel mostraria com esses
 * números. Nenhum nome, e-mail ou escritório aqui é de verdade. A mensalidade de R$ 149 é só um exemplo: o preço do
 * plano ainda não foi decidido.
 */
import {
  diaDoInstante,
  diferencaEmDias,
  FUNCIONALIDADES,
  hojeEm,
  montarCustoDaIa,
  montarFicha,
  montarPessoas,
  montarUso,
  montarVisaoGeral,
  somarDias,
  VERSAO_DOS_TERMOS,
  type AcaoRegistrada,
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

/* ---------------- As respostas ---------------- */

const reais = new Set(escritorios.filter((e) => !e.demonstracao && !e.encerrado).map((e) => e.id));

function visaoGeral() {
  return montarVisaoGeral({ hoje: HOJE, escritorios, acessos: acessos.filter((a) => a.dia >= diasAtras(29)), ultimosAcessos, marcos, ia: ia.filter((i) => i.dia >= diasAtras(29)), faturas, fotos: fotos(), cotacaoUsd: COTACAO, tetos: TETOS });
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

/** Atende /api/plataforma/... na prévia. As ações respondem "feito" e não mudam nada. */
export async function atenderPlataforma(metodo: string, caminho: string, busca: URLSearchParams, pedido: Request): Promise<Response> {
  if (metodo === "POST") {
    const corpo = (await pedido.clone().json().catch(() => ({}))) as { acao?: string };
    const naPessoa = /^\/pessoas\/([^/]+)\/acao$/.exec(caminho);
    if (naPessoa) return json(200, { ok: true, ...(corpo.acao === "encerrar_sessoes" ? { sessoesEncerradas: pessoasCruas.find((p) => p.id === naPessoa[1])?.sessoesAbertas ?? 0 } : {}) });
    const noEscritorio = /^\/escritorios\/([^/]+)\/acao$/.exec(caminho);
    if (noEscritorio) {
      const o = porId.get(noEscritorio[1]!);
      return o ? json(200, { ok: true, antes: o.situacao, depois: o.situacao }) : json(404, { erro: "recusado", detalhe: "Escritório não encontrado." });
    }
    return json(404, { erro: "nao_encontrado" });
  }
  if (caminho === "/escritorios") return json(200, { escritorios });
  if (caminho === "/visao-geral") return json(200, visaoGeral());
  if (caminho === "/indicadores") return json(200, indicadores(dias(busca, 30)));
  if (caminho === "/pessoas") return json(200, pessoas());
  if (caminho === "/uso") return json(200, uso(dias(busca, 30)));
  if (caminho === "/ia") return json(200, montarCustoDaIa({ hoje: HOJE, dias: Math.min(90, dias(busca, 30)), escritorios, ia, cotacaoUsd: COTACAO, tetoSiteUsd: TETOS.siteUsd }));
  if (caminho === "/auditoria") return json(200, { itens: acoes });
  const daFicha = /^\/escritorios\/([^/]+)$/.exec(caminho);
  if (daFicha) {
    const f = ficha(daFicha[1]!);
    return f ? json(200, f) : json(404, { erro: "nao_encontrado" });
  }
  return json(404, { erro: "nao_encontrado" });
}
