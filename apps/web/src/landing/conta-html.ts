/**
 * O desenho da conta aberta, em HTML: o mesmo no build (a landing já sai pronta,
 * com o exemplo) e no navegador (a cada dado que a pessoa troca). O estado final
 * vem com tudo marcado (`is-on`); a contagem animada (conta.ts) desmarca e marca
 * de novo, um passo por vez. Importa do core pelo caminho porque também roda na
 * configuração do Vite.
 */
import type { ContaAberta, DiaDaConta } from "../../../../packages/core/src/conta-aberta.ts";
import { diaDaSemana, formatarDia, nomeDoDiaDaSemana, somarDias, type Dia } from "../../../../packages/core/src/datas.ts";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dm = (d: Dia) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Quantas semanas cabem na janela do calendário; prazo mais longo rola sozinho durante a contagem. */
export const SEMANAS_NA_JANELA = 6;
const SEMANAS_MINIMAS = 5;

export interface TrechoFora {
  de: Dia;
  ate: Dia;
  motivo: string;
  /** O passo da contagem em que o trecho aparece. */
  passo: number;
}

/** O que ficou fora da conta, com os dias seguidos de mesmo motivo juntos (o fim de semana no meio não separa). */
export function trechosFora(linha: readonly DiaDaConta[]): TrechoFora[] {
  const trechos: TrechoFora[] = [];
  linha.forEach((d, passo) => {
    if (d.tipo !== "feriado" && d.tipo !== "suspensao" && !(d.tipo === "fim_de_semana" && trechos.at(-1)?.motivo === d.motivo && d.motivo)) return;
    const ultimo = trechos.at(-1);
    if (ultimo && ultimo.motivo === d.motivo && linha[passo - 1]?.motivo === d.motivo) ultimo.ate = d.dia;
    else if (d.motivo) trechos.push({ de: d.dia, ate: d.dia, motivo: d.motivo, passo });
  });
  return trechos;
}

const CLASSE: Record<DiaDaConta["tipo"], string> = {
  publicacao: "lp-dia--publicada",
  contado: "lp-dia--contado",
  fim_de_semana: "lp-dia--fds",
  feriado: "lp-dia--feriado",
  suspensao: "lp-dia--suspenso",
  vencimento: "lp-dia--contado",
};

function legendaDoDia(d: DiaDaConta): string {
  const quando = dm(d.dia);
  if (d.vence) return `${quando}: vence aqui`;
  if (d.tipo === "publicacao") return `${quando}: publicada`;
  if (d.tipo === "contado") return `${quando}: dia ${d.n}`;
  return `${quando}: fora da conta${d.motivo ? `, ${d.motivo}` : ", fim de semana"}`;
}

function celula(dia: Dia, semana: number, d: DiaDaConta | undefined, passo: number): string {
  const numero = Number(dia.slice(8, 10));
  if (!d) return `<span class="lp-dia lp-dia--fora" aria-hidden="true"><b>${numero}</b></span>`;
  const classes = ["lp-dia", CLASSE[d.tipo], d.vence ? "lp-dia--vence" : "", "is-on"].filter(Boolean).join(" ");
  const ordem = d.tipo === "contado" ? `<i>${d.n}</i>` : "";
  return `<span class="${classes}" data-passo="${passo}" data-semana="${semana}"${d.n ? ` data-n="${d.n}"` : ""} title="${legendaDoDia(d)}"><b>${numero}</b>${ordem}</span>`;
}

function calendario(c: ContaAberta): string {
  const porDia = new Map(c.linha.map((d, i) => [d.dia, { d, i }]));
  const primeiro = c.linha[0]!.dia;
  const ultimo = c.linha.at(-1)!.dia;
  const linhas: string[] = [];
  let semana = 0;
  let mesDaLinha = -1;
  // Conta curta ainda desenha cinco semanas: o calendário não encolhe a cada troca de dado.
  for (let domingo = somarDias(primeiro, -diaDaSemana(primeiro)); domingo <= ultimo || semana < SEMANAS_MINIMAS; domingo = somarDias(domingo, 7), semana++) {
    const dias = Array.from({ length: 7 }, (_, i) => somarDias(domingo, i));
    const mes = Number(dias[6]!.slice(5, 7));
    const rotulo = mes !== mesDaLinha ? MESES[mes - 1]! : "";
    mesDaLinha = mes;
    const celulas = dias.map((dia) => {
      const achado = porDia.get(dia);
      return celula(dia, semana, achado?.d, achado?.i ?? 0);
    });
    linhas.push(`<span class="lp-cal__mes">${rotulo}</span>${celulas.join("")}`);
  }
  const semanas = linhas.length;
  const cabecalho = ["D", "S", "T", "Q", "Q", "S", "S"].map((l) => `<span>${l}</span>`).join("");
  const resumo = `Calendário da contagem, de ${formatarDia(primeiro)} a ${formatarDia(ultimo)}.`;
  return `<div class="lp-cal" style="--semanas:${Math.min(semanas, SEMANAS_NA_JANELA)}" role="img" aria-label="${resumo}">
    <div class="lp-cal__cab" aria-hidden="true"><span></span>${cabecalho}</div>
    <div class="lp-cal__janela" aria-hidden="true"><div class="lp-cal__grade" data-semanas="${semanas}">${linhas.join("")}</div></div>
    <p class="lp-cal__legenda" aria-hidden="true"><span class="lp-marca lp-marca--contado">contado</span><span class="lp-marca lp-marca--fds">fim de semana</span><span class="lp-marca lp-marca--feriado">fora da conta</span><span class="lp-marca lp-marca--vence">vence</span></p>
  </div>`;
}

function dataCompleta(rotulo: string, dia: Dia): string {
  return `<div><dt>${rotulo}</dt><dd><strong>${formatarDia(dia)}</strong> <small>${nomeDoDiaDaSemana(dia)}</small></dd></div>`;
}

function razao(c: ContaAberta): string {
  const fora = trechosFora(c.linha).map((t) => `<li class="is-on" data-passo="${t.passo}"><b>${t.de === t.ate ? dm(t.de) : `${dm(t.de)} a ${dm(t.ate)}`}</b> ${t.motivo}</li>`);
  const fds = c.contagem === "uteis" ? "<li class=\"lp-razao__fds\">e os fins de semana</li>" : "<li class=\"lp-razao__fds\">em dias corridos, o fim de semana conta</li>";
  return `<dl class="lp-razao">
    ${dataCompleta("Publicada", c.publicacao)}
    ${dataCompleta("Começa", c.inicio)}
    <div class="lp-razao__fora"><dt>Fora da conta</dt><dd><ul>${fora.join("")}${fds}</ul></dd></div>
    <div><dt>Calendário</dt><dd>${c.tribunal} <small>${c.proprio ? "próprio" : "só nacional e recesso"}</small></dd></div>
  </dl>`;
}

function resultado(c: ContaAberta): string {
  const prorrogado = c.prorrogadoDe ? `<p class="lp-res__nota">O último dia caía em ${dm(c.prorrogadoDe)}, sem expediente completo, e passou para ${dm(c.fim)}.</p>` : "";
  const aviso = c.proprio
    ? ""
    : `<p class="lp-conta__aviso" role="note">Este tribunal ainda não tem calendário próprio no Decreta: a conta usou os feriados nacionais e o recesso. Confira as suspensões do tribunal.</p>`;
  return `<div class="lp-res">
    <p class="lp-res__contando" aria-hidden="true"><b data-contador>${c.dias}</b> de ${c.dias} ${c.contagem === "uteis" ? "dias úteis" : "dias corridos"}</p>
    <p class="lp-res__final" role="status"><span>Vence em</span> <strong>${formatarDia(c.fim)}</strong> <small>${nomeDoDiaDaSemana(c.fim)}</small></p>
    <button type="button" class="lp-res__rever" data-rever>Rever a contagem</button>
  </div>${prorrogado}${aviso}`;
}

export function desenharConta(c: ContaAberta): string {
  return `<div class="lp-conta__meio">${calendario(c)}${razao(c)}</div>${resultado(c)}`;
}
