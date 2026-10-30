/**
 * Calendário da agenda. No computador: o mês (com o dia escolhido ao lado) e
 * a semana em colunas. No celular: o mês ou a faixa da semana com pontinhos,
 * para escolher o dia, e o dia embaixo. A semana começa na segunda, e sábado e
 * domingo ficam mais estreitos (quase nunca têm prazo ou audiência).
 * As datas são texto AAAA-MM-DD, contadas ao meio-dia UTC para o fuso não pular dia.
 */
import { Link } from "@tanstack/react-router";
import { Video } from "lucide-react";
import { useEffect, useRef, useState, type TouchEvent } from "react";
import type { ItemDaAgenda } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { Avatar } from "./ui";

const data = (dia: string) => new Date(`${dia}T12:00:00Z`);
const texto = (d: Date) => d.toISOString().slice(0, 10);

export const somarDias = (dia: string, n: number) => {
  const d = data(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return texto(d);
};
/** Segunda-feira da semana do dia. */
export const inicioDaSemana = (dia: string) => somarDias(dia, -((data(dia).getUTCDay() + 6) % 7));
export const inicioDoMes = (dia: string) => `${dia.slice(0, 7)}-01`;
export const fimDoMes = (dia: string) => {
  const d = data(inicioDoMes(dia));
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return texto(d);
};
/** Dia 1 do mês n meses adiante (ou atrás, com n negativo). */
export const somarMeses = (dia: string, n: number) => {
  const d = data(inicioDoMes(dia));
  d.setUTCMonth(d.getUTCMonth() + n);
  return texto(d);
};
/** As semanas inteiras, de segunda a domingo, que cobrem o mês. */
export const gradeDoMes = (dia: string) => ({ de: inicioDaSemana(inicioDoMes(dia)), ate: somarDias(inicioDaSemana(fimDoMes(dia)), 6) });
export const diasEntre = (de: string, ate: string) => {
  const dias: string[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) dias.push(d);
  return dias;
};

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const SEMANA_CURTA = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
const SEMANA_LONGA = ["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"];

const mes = (dia: string) => Number(dia.slice(5, 7)) - 1;
const numeroDoDia = (dia: string) => Number(dia.slice(8, 10));
const posicaoNaSemana = (dia: string) => (data(dia).getUTCDay() + 6) % 7;

/** "Outubro de 2026" */
export const nomeDoMes = (dia: string) => `${MESES[mes(dia)]!.replace(/^./, (x) => x.toUpperCase())} de ${dia.slice(0, 4)}`;
/** "2 a 8 nov", "26 out a 1 nov", com o ano quando não é o de hoje. */
export const intervalo = (de: string, ate: string, hoje: string) => {
  const ano = ate.slice(0, 4) !== hoje.slice(0, 4) || de.slice(0, 4) !== ate.slice(0, 4) ? ` de ${ate.slice(0, 4)}` : "";
  const inicio = mes(de) === mes(ate) && de.slice(0, 4) === ate.slice(0, 4) ? `${numeroDoDia(de)}` : `${numeroDoDia(de)} ${MESES_CURTOS[mes(de)]}`;
  return `${inicio} a ${numeroDoDia(ate)} ${MESES_CURTOS[mes(ate)]}${ano}`;
};
/** "Hoje", "Amanhã", "Ontem" ou o dia da semana, para os títulos dos dias. */
export const nomeDoDia = (dia: string, hoje: string) =>
  dia === hoje ? "Hoje" : dia === somarDias(hoje, 1) ? "Amanhã" : dia === somarDias(hoje, -1) ? "Ontem" : SEMANA_LONGA[posicaoNaSemana(dia)]!.replace(/^./, (x) => x.toUpperCase());
const dataPorExtenso = (dia: string) => `${SEMANA_LONGA[posicaoNaSemana(dia)]}, ${numeroDoDia(dia)} de ${MESES[mes(dia)]}`;

type Cor = "audiencia" | "vencido" | "hoje" | "breve" | "prazo" | "tarefa" | "feita";
/** A cor de cada coisa na agenda: audiência em grafite, prazo pela urgência, tarefa neutra. */
export const corDoItem = (i: ItemDaAgenda): Cor =>
  i.tipo === "audiencia" ? "audiencia" : i.tipo === "prazo" ? (i.urgencia === "vencido" || i.urgencia === "hoje" || i.urgencia === "breve" ? i.urgencia : "prazo") : i.concluida ? "feita" : "tarefa";
const URGENCIA: Cor[] = ["vencido", "hoje", "breve", "prazo"];
/** Audiências pela hora, depois os prazos e as tarefas; a tarefa feita vai para o fim. */
export const emOrdem = (itens: ItemDaAgenda[]) => [...itens].sort((a, b) => Number(!!a.concluida) - Number(!!b.concluida));
/** Os pontinhos do dia no celular: um para audiência, um com a cor do prazo mais urgente, um para tarefa aberta. */
const marcasDoDia = (itens: ItemDaAgenda[]): Cor[] => {
  const cores = new Set(itens.map(corDoItem));
  const prazo = URGENCIA.find((c) => cores.has(c));
  return [cores.has("audiencia") && "audiencia", prazo, cores.has("tarefa") && "tarefa"].filter(Boolean) as Cor[];
};
/** "Conciliação" em vez de "Audiência de conciliação": no calendário a hora já diz que é audiência. */
const tituloCurto = (i: ItemDaAgenda) => (i.tipo === "audiencia" ? i.titulo.replace(/^audiência\s+(de\s+)?/i, "").replace(/^./, (x) => x.toUpperCase()) : i.titulo);
const destinoDoItem = (i: ItemDaAgenda) =>
  i.tipo === "audiencia" ? ({ to: "/audiencias/$id", params: { id: i.id } } as const) : i.tipo === "prazo" ? ({ to: "/prazos/$id", params: { id: i.id } } as const) : null;
const dica = (i: ItemDaAgenda) => [i.tipo === "audiencia" ? `${i.hora} · ${i.titulo}` : i.titulo, i.processo?.titulo ?? i.detalhe].filter(Boolean).join(" · ");
const quantos = (n: number) => (n ? `${n} ${n === 1 ? "compromisso" : "compromissos"}` : "nada marcado");

type PorDia = Map<string, ItemDaAgenda[]>;
/** Feriados e suspensões do calendário do escritório; `fechado` quando o fórum não abre (o expediente reduzido só ganha o nome). */
export type FeriadosDoPeriodo = Map<string, { nome: string; fechado: boolean }>;

/* ---------- Mês no computador ---------- */

const ALTURA_DO_ITEM = 22;
const TOPO_DA_CELULA = 36;

export function MesDoCalendario({
  mes: noMes,
  hoje,
  escolhido,
  porDia,
  feriados,
  aoEscolher,
}: {
  mes: string;
  hoje: string;
  escolhido: string;
  porDia: PorDia;
  feriados: FeriadosDoPeriodo;
  aoEscolher: (dia: string) => void;
}) {
  const { de, ate } = gradeDoMes(noMes);
  const dias = diasEntre(de, ate);
  const semanas = dias.length / 7;
  const ref = useRef<HTMLDivElement>(null);
  // Quantos itens cabem em cada dia: depende da altura da tela; o que sobra vira "+3".
  const [cabem, setCabem] = useState(3);
  useEffect(() => {
    const grade = ref.current;
    if (!grade) return;
    const medir = () => setCabem(Math.max(1, Math.floor((grade.clientHeight / semanas - TOPO_DA_CELULA) / ALTURA_DO_ITEM)));
    medir();
    const olho = new ResizeObserver(medir);
    olho.observe(grade);
    return () => olho.disconnect();
  }, [semanas]);
  return (
    <div className="dc-painel dc-mes">
      <div className="dc-mes__cabeca" aria-hidden>
        {SEMANA_CURTA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div ref={ref} className="dc-mes__semanas" style={{ gridTemplateRows: `repeat(${semanas}, minmax(0, 1fr))` }}>
        {dias.map((d) => {
          const itens = emOrdem(porDia.get(d) ?? []);
          const mostrar = itens.length > cabem ? itens.slice(0, cabem - 1) : itens;
          const resto = itens.length - mostrar.length;
          const feriado = feriados.get(d);
          return (
            <div
              key={d}
              className={cn("dc-mes__dia", d.slice(0, 7) !== noMes.slice(0, 7) && "is-fora", d === hoje && "is-hoje", d === escolhido && "is-on", feriado?.fechado && "is-feriado")}
              onClick={() => aoEscolher(d)}
            >
              <div className="dc-mes__topo">
              <button
                type="button"
                className="dc-mes__n dc-num"
                aria-pressed={d === escolhido}
                aria-label={`${dataPorExtenso(d)}: ${quantos(itens.length)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  aoEscolher(d);
                }}
              >
                {numeroDoDia(d) === 1 ? `1 ${MESES_CURTOS[mes(d)]}` : numeroDoDia(d)}
              </button>
              {feriado && (
                <span className="dc-mes__feriado" title={feriado.nome}>
                  {feriado.nome}
                </span>
              )}
              </div>
              <div className="dc-mes__itens">
                {mostrar.map((i) => (
                  <ItemDoMes key={`${i.tipo}-${i.id}`} item={i} />
                ))}
                {resto > 0 && (
                  <button
                    type="button"
                    className="dc-mes__mais"
                    onClick={(e) => {
                      e.stopPropagation();
                      aoEscolher(d);
                    }}
                  >
                    +{resto} {resto === 1 ? "outro" : "outros"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemDoMes({ item: i }: { item: ItemDaAgenda }) {
  const classe = cn("dc-marca", `dc-marca--${corDoItem(i)}`);
  const conteudo = (
    <>
      {i.tipo === "audiencia" && <span className="dc-marca__hora dc-num">{i.hora}</span>}
      <span className="dc-marca__texto">{tituloCurto(i)}</span>
    </>
  );
  const destino = destinoDoItem(i);
  if (!destino)
    return (
      <span className={classe} title={dica(i)}>
        {conteudo}
      </span>
    );
  return (
    <Link {...destino} className={classe} title={dica(i)} onClick={(e) => e.stopPropagation()}>
      {conteudo}
    </Link>
  );
}

/* ---------- Semana no computador ---------- */

export function SemanaDoCalendario({
  semana,
  hoje,
  escolhido,
  porDia,
  feriados,
  aoEscolher,
  aoMarcar,
}: {
  semana: string;
  hoje: string;
  escolhido: string;
  porDia: PorDia;
  feriados: FeriadosDoPeriodo;
  aoEscolher: (dia: string) => void;
  aoMarcar: (i: ItemDaAgenda, feita: boolean) => void;
}) {
  return (
    <div className="dc-painel dc-semana">
      {diasEntre(semana, somarDias(semana, 6)).map((d, n) => {
        const itens = emOrdem(porDia.get(d) ?? []);
        const feriado = feriados.get(d);
        return (
          <section key={d} className={cn("dc-semana__dia", d === hoje && "is-hoje", d === escolhido && "is-on", feriado?.fechado && "is-feriado")} aria-label={`${dataPorExtenso(d)}: ${quantos(itens.length)}`}>
            <button type="button" className="dc-semana__topo" aria-pressed={d === escolhido} onClick={() => aoEscolher(d)}>
              <span className="dc-semana__nome">{SEMANA_CURTA[n]}</span>
              <span className="dc-semana__n dc-num">{numeroDoDia(d)}</span>
              {feriado && (
                <span className="dc-semana__feriado" title={feriado.nome}>
                  {feriado.nome}
                </span>
              )}
            </button>
            <div className="dc-semana__itens dc-rola">
              {itens.map((i) => (
                <EventoDaSemana key={`${i.tipo}-${i.id}`} item={i} aoMarcar={(feita) => aoMarcar(i, feita)} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function EventoDaSemana({ item: i, aoMarcar }: { item: ItemDaAgenda; aoMarcar: (feita: boolean) => void }) {
  const cor = corDoItem(i);
  const sobre = i.processo?.titulo ?? i.detalhe;
  const corpo = (
    <>
      <span className="dc-evento__titulo">{i.tipo === "audiencia" ? tituloCurto(i) : i.titulo}</span>
      {sobre && <span className="dc-evento__sobre">{sobre}</span>}
    </>
  );
  const pessoa = i.responsavel && <Avatar pessoa={i.responsavel} />;
  if (i.tipo === "tarefa")
    return (
      <label className={cn("dc-evento", `dc-evento--${cor}`)} title={dica(i)}>
        <span className="dc-evento__meta">
          <input type="checkbox" className="dc-checa" checked={!!i.concluida} onChange={(e) => aoMarcar(e.target.checked)} aria-label={`Feita: ${i.titulo}`} />
          Tarefa
          {pessoa}
        </span>
        {corpo}
      </label>
    );
  return (
    <Link {...destinoDoItem(i)!} className={cn("dc-evento", `dc-evento--${cor}`)} title={dica(i)}>
      <span className="dc-evento__meta">
        {i.tipo === "audiencia" ? (
          <>
            <span className="dc-num">{i.hora}</span>
            {i.porVideo && <Video aria-label="Por vídeo" />}
          </>
        ) : (
          <>
            Prazo
            {i.aConfirmar && <span className="dc-evento__confirmar">a confirmar</span>}
          </>
        )}
        {pessoa}
      </span>
      {corpo}
    </Link>
  );
}

/* ---------- Celular: mês e semana para escolher o dia ---------- */

/** Arrastar para o lado troca o mês (ou a semana). */
function useArrastar(aoAnterior: () => void, aoProximo: () => void) {
  const inicio = useRef<{ x: number; y: number } | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      const t = e.touches[0]!;
      inicio.current = { x: t.clientX, y: t.clientY };
    },
    onTouchEnd: (e: TouchEvent) => {
      const a = inicio.current;
      inicio.current = null;
      const t = e.changedTouches[0];
      if (!a || !t) return;
      const dx = t.clientX - a.x;
      if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(t.clientY - a.y) * 1.5) return;
      (dx < 0 ? aoProximo : aoAnterior)();
    },
  };
}

export function DiasNoCelular({
  de,
  ate,
  mes: noMes,
  hoje,
  escolhido,
  porDia,
  feriados,
  aoEscolher,
  aoAnterior,
  aoProximo,
}: {
  de: string;
  ate: string;
  /** No mês, os dias de fora ficam apagados. */
  mes?: string;
  hoje: string;
  escolhido: string;
  porDia: PorDia;
  feriados: FeriadosDoPeriodo;
  aoEscolher: (dia: string) => void;
  aoAnterior: () => void;
  aoProximo: () => void;
}) {
  const arrastar = useArrastar(aoAnterior, aoProximo);
  return (
    <div className="dc-painel dc-mini" {...arrastar}>
      <div className="dc-mini__cabeca" aria-hidden>
        {SEMANA_CURTA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="dc-mini__dias">
        {diasEntre(de, ate).map((d) => {
          const itens = porDia.get(d) ?? [];
          const feriado = feriados.get(d);
          return (
            <button
              key={d}
              type="button"
              className={cn("dc-mini__dia", noMes && d.slice(0, 7) !== noMes.slice(0, 7) && "is-fora", d === hoje && "is-hoje", d === escolhido && "is-on", feriado?.fechado && "is-feriado")}
              aria-pressed={d === escolhido}
              aria-label={`${dataPorExtenso(d)}${feriado ? ` (${feriado.nome})` : ""}: ${quantos(itens.length)}`}
              onClick={() => aoEscolher(d)}
            >
              <span className="dc-mini__n dc-num">{numeroDoDia(d)}</span>
              <span className="dc-mini__pontos" aria-hidden>
                {marcasDoDia(itens).map((c) => (
                  <i key={c} className={`is-${c}`} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Legenda: os mesmos rótulos do mês, em miniatura. */
export function Legenda() {
  const cores: [Cor, string][] = [
    ["audiencia", "Audiência"],
    ["vencido", "Vencido"],
    ["hoje", "Vence hoje"],
    ["breve", "Até 3 dias úteis"],
    ["prazo", "Prazo"],
    ["tarefa", "Tarefa"],
  ];
  return (
    <ul className="dc-legenda" aria-label="Legenda">
      {cores.map(([c, rotulo]) => (
        <li key={c} className={cn("dc-marca", `dc-marca--${c}`)}>
          <span className="dc-marca__texto">{rotulo}</span>
        </li>
      ))}
    </ul>
  );
}
