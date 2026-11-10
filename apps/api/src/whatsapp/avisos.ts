/**
 * Os avisos que saem sem a pessoa pedir, pelo WhatsApp oficial. Nenhum usa IA: são o painel do dia e
 * a fila, montados pelo código.
 *
 * - O resumo da manhã: com a janela de 24 h aberta, o dia inteiro; fechada, o modelo curto
 *   "resumo_do_dia" com o botão "Ver o dia" (o toque abre a janela e traz o dia inteiro).
 * - Às 15h, o que vence hoje e ainda está aberto: a rede de segurança do prazo esquecido. Só sai quando existe.
 * - A publicação cuja sugestão vence em até 2 dias úteis, na hora (depois do resumo da manhã: a das
 *   04:30 já vai no resumo).
 *
 * A qualidade do número é medida por bloqueios e silenciamentos e é dividida entre todos os escritórios:
 * por isso pouco aviso, e nunca nada de propaganda.
 */
import { formatarDiaCurto, hojeEm, proximoDiaUtil } from "@decreta/core";
import { equipe, prazos, processos, withTenant } from "@decreta/db";
import { eq } from "drizzle-orm";
import type { PainelDoDia } from "../servicos/hoje.ts";
import { resumoDaManha } from "../servicos/avisos.ts";
import { calendarioDoEscritorio, tribunalPadrao } from "../servicos/calendario.ts";
import { prazosQueVencemHoje, venceHoje } from "./acoes.ts";
import type { Saida } from "./canal.ts";
import { filaDaPessoa, mensagemDaFila, mensagemDoItem } from "./fila.ts";
import { enviarParaPessoa } from "./mensagens.ts";
import { agoraDe, type DepsDoAgente } from "./tipos.ts";
import type { PessoaNoWhatsapp } from "./vinculo.ts";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** "2 prazos vencem hoje, 1 audiência e 3 publicações a conferir": o {{2}} do modelo, sem nome de cliente. */
export function contagemDoDia(painel: PainelDoDia, userId: string): string {
  const meus = painel.itens.filter((i) => i.responsavel?.id === userId);
  const vencidos = meus.filter((i) => i.urgencia === "vencido").length;
  const hoje = meus.filter((i) => i.urgencia === "hoje" && i.tipo === "prazo").length;
  const auds = meus.filter((i) => i.tipo === "audiencia").length;
  const pubs = painel.contadores.publicacoesNovas;
  const partes = [
    vencidos ? `${plural(vencidos, "prazo vencido", "prazos vencidos")}` : null,
    hoje ? `${plural(hoje, "prazo vence", "prazos vencem")} hoje` : null,
    auds ? plural(auds, "audiência", "audiências") : null,
    pubs ? `${plural(pubs, "publicação", "publicações")} a conferir` : null,
  ].filter(Boolean) as string[];
  if (!partes.length) return "nada urgente seu";
  return partes.length === 1 ? partes[0]! : `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`;
}

/** Faltando isto para o vínculo vencer, o resumo avisa até quando abrir o app (abrir renova). */
const AVISO_DO_VINCULO_MS = 3 * 24 * 60 * 60_000;

/** "Para continuar recebendo por aqui, abra o Decreta até 10/12.", quando o vínculo vence nos próximos 3 dias. */
function avisoDoVinculo(pessoa: PessoaNoWhatsapp, agora: Date): string | null {
  const falta = pessoa.renovarAte.getTime() - agora.getTime();
  if (falta <= 0 || falta > AVISO_DO_VINCULO_MS) return null;
  return `Para continuar recebendo por aqui, abra o Decreta até ${formatarDiaCurto(hojeEm(pessoa.timezone, pessoa.renovarAte))}.`;
}

/** O resumo da manhã de uma pessoa. Devolve se saiu alguma coisa. */
export async function avisarResumo(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp, painel: PainelDoDia): Promise<boolean> {
  const dia = resumoDaManha(painel, { id: pessoa.userId, apelido: pessoa.apelido }, deps.telas);
  if (!dia) return false;
  const corpo = [dia, avisoDoVinculo(pessoa, agoraDe(deps))].filter(Boolean).join("\n\n");
  const chave = `resumo:${painel.hoje}`;
  const origem = deps.origem === "laboratorio" ? "laboratorio" : "aviso";
  const modelo: Extract<Saida, { tipo: "modelo" }> = { tipo: "modelo", nome: "resumo_do_dia", parametros: [pessoa.apelido, contagemDoDia(painel, pessoa.userId)], botoes: ["a:dia", "a:fila"] };
  if (!pessoa.janelaAberta) return !!(await enviarParaPessoa(deps, pessoa, modelo, { origem, chave }));
  const saiu = await enviarParaPessoa(deps, pessoa, { tipo: "texto", texto: corpo }, { origem, chave, modeloSeFechada: modelo });
  if (!saiu || saiu.saida.tipo === "modelo" || pessoa.acesso !== "total") return !!saiu;
  const fila = await withTenant(deps.db, pessoa.organizationId, (tx) => mensagemDaFila(tx, pessoa, deps.telas, null, agoraDe(deps)));
  if (fila.tipo === "botoes") await enviarParaPessoa(deps, pessoa, { tipo: "botoes", texto: "Há publicações para conferir. Quer resolver agora, uma por uma?", botoes: [{ id: "a:fila", titulo: "Conferir agora" }] }, { origem, chave: `${chave}:fila` });
  return true;
}

/** Às 15h: o que é da pessoa (ou sem dono), vence hoje e ainda está aberto. Nada aberto, nada sai. */
export async function avisarVenceHoje(deps: DepsDoAgente, pessoa: PessoaNoWhatsapp): Promise<boolean> {
  const hoje = hojeEm(pessoa.timezone, agoraDe(deps));
  const abertos = await withTenant(deps.db, pessoa.organizationId, (tx) => prazosQueVencemHoje(tx, pessoa.userId, hoje));
  if (!abertos.length) return false;
  const chave = `vence:${hoje}`;
  const origem = deps.origem === "laboratorio" ? "laboratorio" : "aviso";
  if (!pessoa.janelaAberta) return !!(await enviarParaPessoa(deps, pessoa, { tipo: "modelo", nome: "vence_hoje", parametros: [String(abertos.length)], botoes: ["a:vence"] }, { origem, chave }));
  // Uma mensagem só: a lista (ou o cartão, quando é um prazo). Cada mensagem custa e pesa na qualidade do número.
  const [aviso] = await venceHoje(deps, pessoa, "Aviso das 15h: ");
  return !!aviso && !!(await enviarParaPessoa(deps, pessoa, aviso, { origem, chave: `${chave}:0` }));
}

/** Dois dias úteis a partir de hoje, no calendário do escritório: o que vence até lá é "prazo curto". */
async function limiteDoPrazoCurto(organizationId: string, deps: DepsDoAgente, hoje: string): Promise<string> {
  return withTenant(deps.db, organizationId, async (tx) => {
    const cal = await calendarioDoEscritorio(tx, await tribunalPadrao(tx, organizationId));
    return proximoDiaUtil(proximoDiaUtil(hoje, cal), cal);
  });
}

/**
 * A publicação recém-lida cuja sugestão vence em até 2 dias úteis: avisa o responsável (ou todos, sem
 * dono) que ligaram o aviso. Devolve para quantas pessoas saiu.
 */
export async function avisarPrazoCurto(deps: DepsDoAgente, pessoas: PessoaNoWhatsapp[], organizationId: string, publicacaoId: string): Promise<number> {
  const agora = agoraDe(deps);
  const primeira = pessoas[0];
  if (!primeira) return 0;
  const hoje = hojeEm(primeira.timezone, agora);
  const prazo = await withTenant(deps.db, organizationId, async (tx) => {
    const [p] = await tx.select({ id: prazos.id, fim: prazos.fim, confirmadoEm: prazos.confirmadoEm, responsavelId: prazos.responsavelId, titulo: processos.titulo, cnj: processos.cnj }).from(prazos).innerJoin(processos, eq(processos.id, prazos.processoId)).where(eq(prazos.publicacaoId, publicacaoId));
    return p ?? null;
  });
  if (!prazo || prazo.confirmadoEm) return 0;
  if (prazo.fim > (await limiteDoPrazoCurto(organizationId, deps, hoje))) return 0;
  const querem = await withTenant(deps.db, organizationId, async (tx) => new Set((await tx.select({ userId: equipe.userId }).from(equipe).where(eq(equipe.avisoPrazoCurto, true))).map((e) => e.userId)));
  let n = 0;
  for (const pessoa of pessoas) {
    if (!querem.has(pessoa.userId) || (prazo.responsavelId && prazo.responsavelId !== pessoa.userId) || pessoa.vencido || pessoa.pausado) continue;
    const chave = `curto:${publicacaoId}`;
    const origem = deps.origem === "laboratorio" ? "laboratorio" : "aviso";
    // A Meta não aceita variável vazia: o processo extrajudicial vai como "sem número".
    const modelo: Extract<Saida, { tipo: "modelo" }> = { tipo: "modelo", nome: "prazo_sugerido", parametros: [prazo.cnj || "sem número", formatarDiaCurto(prazo.fim)], botoes: ["a:fila"] };
    const saiu = pessoa.janelaAberta
      ? await withTenant(deps.db, organizationId, async (tx) => {
          // O item é o desta publicação, não o primeiro da fila: o aviso fala dele.
          const item = (await filaDaPessoa(tx, pessoa)).itens.find((i) => i.publicacaoId === publicacaoId);
          if (!item) return null;
          const m = await mensagemDoItem(tx, pessoa, deps.telas, item, { n: 1, total: 1 }, agora);
          return enviarParaPessoa(deps, pessoa, { tipo: "botoes", texto: `Publicação com prazo curto: a sugestão vence ${formatarDiaCurto(prazo.fim)}.\n\n${m.texto}`, botoes: m.botoes, rodape: m.rodape }, { origem, chave, modeloSeFechada: modelo });
        })
      : await enviarParaPessoa(deps, pessoa, modelo, { origem, chave });
    if (saiu) n++;
  }
  return n;
}
