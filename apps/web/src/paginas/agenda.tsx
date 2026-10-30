/** Agenda (audiências, vencimentos e tarefas: em lista, na semana ou no mês) e a tela da audiência com a preparação da IA. */
import * as Menu from "@radix-ui/react-dropdown-menu";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { CalendarDays, CalendarRange, Check, ChevronDown, ChevronLeft, ChevronRight, Gavel, List, ListTodo, Plus, Video, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import {
  DiasNoCelular,
  emOrdem,
  fimDoMes,
  gradeDoMes,
  inicioDaSemana,
  inicioDoMes,
  intervalo,
  Legenda,
  MesDoCalendario,
  nomeDoDia,
  nomeDoMes,
  SemanaDoCalendario,
  somarDias,
  somarMeses,
  type FeriadosDoPeriodo,
} from "@/componentes/calendario";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { Rolagem } from "@/componentes/rolagem";
import { Avatar, BlocoIa, Botao, Cabecalho, Campo, Carregando, Cnj, Dados, Faixa, ListaIa, Painel, Responsavel, SecaoIa, Segmentos, Selo, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaDaSemana, diaMes, juntar, ondeTramita } from "@/lib/formato";
import type { Agenda, Audiencia, Feriados, ItemDaAgenda, PreparacaoDeAudiencia } from "@/lib/tipos";
import { cn } from "@/lib/util";

const SITUACAO = { marcada: "Marcada", realizada: "Realizada", cancelada: "Cancelada", redesignada: "Redesignada" } as const;

export const VISTAS_DA_AGENDA = ["lista", "semana", "mes"] as const;
export type VistaDaAgenda = (typeof VISTAS_DA_AGENDA)[number];
const VISTAS: { id: VistaDaAgenda; rotulo: string; icone: LucideIcon }[] = [
  { id: "lista", rotulo: "Lista", icone: List },
  { id: "semana", rotulo: "Semana", icone: CalendarRange },
  { id: "mes", rotulo: "Mês", icone: CalendarDays },
];
/**
 * O que cada vista mostra (de/ate, para o título e a contagem) e o que busca:
 * a lista, duas semanas a partir do dia; a semana, de segunda a domingo; o mês,
 * as semanas inteiras que o cobrem.
 */
function periodoDa(vista: VistaDaAgenda, dia: string) {
  if (vista === "mes") return { de: inicioDoMes(dia), ate: fimDoMes(dia), busca: gradeDoMes(dia) };
  const de = vista === "semana" ? inicioDaSemana(dia) : dia;
  const ate = somarDias(de, vista === "semana" ? 6 : 13);
  return { de, ate, busca: { de, ate } };
}
/** Anterior e próximo. Na semana e no mês que têm hoje, o dia escolhido volta a ser hoje. */
function passo(vista: VistaDaAgenda, dia: string, n: number, hoje: string) {
  const novo = vista === "mes" ? somarMeses(dia, n) : somarDias(dia, n * (vista === "semana" ? 7 : 14));
  const p = periodoDa(vista, novo);
  return vista !== "lista" && hoje >= p.de && hoje <= p.ate ? hoje : novo;
}
const contar = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export function AgendaPage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const qc = useQueryClient();
  const avisar = useAviso();
  const search = useSearch({ from: "/app/agenda" });
  const navigate = useNavigate({ from: "/agenda" });
  const hoje = eu.data?.hoje ?? "";
  // A agenda abre na semana; a vista escolhida fica no endereço (voltar de uma audiência volta nela).
  const vista = search.vista ?? "semana";
  const dia = search.dia ?? hoje;
  const p = dia ? periodoDa(vista, dia) : null;
  const buscar = (de: string, ate: string) => ({ queryKey: ["agenda", de, ate], queryFn: () => api<Agenda>(`/agenda?de=${de}&ate=${ate}`) });
  const agenda = useQuery({ ...buscar(p?.busca.de ?? "", p?.busca.ate ?? ""), enabled: !!p, placeholderData: (a) => a });
  // O ano do período e, na virada, o seguinte: os feriados marcam o calendário.
  const anos = p ? [...new Set([p.busca.de.slice(0, 4), p.busca.ate.slice(0, 4)])] : [];
  const feriadosDoAno = useQuery({ queryKey: ["feriados", anos[0]], queryFn: () => api<Feriados>(`/feriados?ano=${anos[0]}`), enabled: !!anos[0], staleTime: 3_600_000 });
  const feriadosDaVirada = useQuery({ queryKey: ["feriados", anos[1]], queryFn: () => api<Feriados>(`/feriados?ano=${anos[1]}`), enabled: !!anos[1], staleTime: 3_600_000 });
  const feriados = useMemo(() => {
    const m: FeriadosDoPeriodo = new Map();
    const marcar = (dia: string, nome: string, fechado: boolean) => {
      const antes = m.get(dia);
      m.set(dia, { nome: antes && antes.nome !== nome ? `${antes.nome} · ${nome}` : nome, fechado: (antes?.fechado ?? false) || fechado });
    };
    for (const ano of [feriadosDoAno.data, feriadosDaVirada.data]) {
      if (!ano) continue;
      for (const f of ano.dias) marcar(f.dia, f.nome.replace(/\s*\(.*\)$/, ""), f.tipo !== "reduzido");
      // A suspensão de fim de ano (20/12 a 20/01) não fecha o fórum: só o começo e o fim ganham o nome.
      marcar(ano.suspensaoDeFimDeAno.de, "Início da suspensão de prazos", false);
      marcar(ano.suspensaoDeFimDeAno.ate, "Fim da suspensão de prazos", false);
    }
    return m;
  }, [feriadosDoAno.data, feriadosDaVirada.data]);

  // Anterior e próximo já ficam carregados: trocar de semana ou de mês é na hora.
  useEffect(() => {
    if (!hoje || !dia) return;
    for (const n of [-1, 1]) {
      const b = periodoDa(vista, passo(vista, dia, n, hoje)).busca;
      void qc.prefetchQuery(buscar(b.de, b.ate));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista, dia, hoje, qc]);

  const [nova, setNova] = useState<"tarefa" | "audiencia" | null>(null);
  const tarefa = useMutation({
    mutationFn: ({ id, feita }: { id: string; feita: boolean }) => api(`/tarefas/${id}/${feita ? "concluir" : "reabrir"}`, { method: "POST" }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      if (v.feita) avisar("Tarefa feita.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const marcar = (i: ItemDaAgenda, feita: boolean) => tarefa.mutate({ id: i.id, feita });

  const ir = (mudanca: { vista?: VistaDaAgenda; dia?: string }) => {
    void navigate({
      search: (s) => {
        const novoDia = mudanca.dia ?? s.dia;
        return { ...s, ...mudanca, dia: novoDia && novoDia !== hoje ? novoDia : undefined };
      },
      replace: true,
    });
  };
  const anterior = () => ir({ dia: passo(vista, dia, -1, hoje) });
  const proximo = () => ir({ dia: passo(vista, dia, 1, hoje) });
  const escolher = (d: string) => ir({ dia: d });

  const a = agenda.data;
  const porDia = useMemo(() => new Map((a?.dias ?? []).map((d) => [d.dia, d.itens])), [a]);
  const titulo = !p ? " " : vista === "mes" ? nomeDoMes(p.de) : intervalo(p.de, p.ate, hoje);
  const noPeriodo = p ? (a?.dias ?? []).filter((d) => d.dia >= p.de && d.dia <= p.ate).flatMap((d) => d.itens) : [];
  const n = (tipo: ItemDaAgenda["tipo"]) => noPeriodo.filter((i) => i.tipo === tipo).length;
  const resumo = !a
    ? " "
    : noPeriodo.length
      ? juntar([n("audiencia") && contar(n("audiencia"), "audiência", "audiências"), n("prazo") && contar(n("prazo"), "prazo", "prazos"), n("tarefa") && contar(n("tarefa"), "tarefa", "tarefas")].filter(Boolean) as string[])
      : "Nada marcado neste período";
  const calendario = vista !== "lista";
  const diaDoDialogo = calendario ? dia : undefined;

  const tituloDoDia = (d: string) => (
    <>
      {nomeDoDia(d, hoje)}, {diaMes(d)}
      {feriados.get(d) && <span className="dc-agenda__feriado">{feriados.get(d)!.nome}</span>}
    </>
  );
  const linhas = (itens: ItemDaAgenda[], compacta?: boolean) => (
    <div className="dc-linhas">
      {emOrdem(itens).map((i) => (
        <LinhaDaAgenda key={`${i.tipo}-${i.id}`} item={i} compacta={compacta} aoMarcar={(feita) => marcar(i, feita)} />
      ))}
    </div>
  );
  const dias = (a?.dias ?? []).filter((d) => p && d.dia >= p.de && d.dia <= p.ate);
  const lista = !a ? (
    <Carregando />
  ) : dias.length ? (
    dias.map((d) => (
      <section key={d.dia} className="dc-secao">
        <h2 className={cn("dc-secao__titulo dc-agenda__dia", d.dia === hoje && "is-hoje")}>{tituloDoDia(d.dia)}</h2>
        <div className="dc-painel">{linhas(d.itens)}</div>
      </section>
    ))
  ) : (
    <Vazio titulo="Nada nestas duas semanas">Audiências e tarefas aparecem aqui, com os vencimentos de prazo.</Vazio>
  );
  const doDia = porDia.get(dia) ?? [];
  const vazioDoDia = (
    <Vazio titulo={feriados.get(dia)?.fechado ? feriados.get(dia)!.nome : "Nada neste dia"}>
      {dia < hoje ? "Nenhuma audiência, prazo aberto ou tarefa." : `Nenhuma audiência, prazo ou tarefa. ${celular ? "Toque em + para" : "Use Tarefa ou Audiência para"} marcar algo neste dia.`}
    </Vazio>
  );

  const dialogos = (
    <>
      <NovaTarefa aberto={nova === "tarefa"} aoFechar={() => setNova(null)} dia={diaDoDialogo} />
      <NovaAudiencia aberto={nova === "audiencia"} aoFechar={() => setNova(null)} dia={diaDoDialogo} />
    </>
  );
  const vistas = <Segmentos rotulo="Ver a agenda em" opcoes={VISTAS} valor={vista} aoMudar={(v) => ir({ vista: v })} />;
  // Anterior, o período e próximo num controle só. Clicar no período abre o calendário do aparelho para ir a qualquer data.
  const data = useRef<HTMLInputElement>(null);
  const escolherData = () => {
    try {
      data.current?.showPicker();
    } catch {
      data.current?.focus();
    }
  };
  const passos = (rotulo: boolean) => (
    <div className="dc-periodo" role="group" aria-label="Período">
      <button type="button" className="dc-periodo__seta" aria-label={vista === "mes" ? "Mês anterior" : vista === "semana" ? "Semana anterior" : "Semanas anteriores"} onClick={anterior}>
        <ChevronLeft />
      </button>
      {rotulo && (
        <span className="dc-periodo__meio">
          <button type="button" className="dc-periodo__rotulo" title="Ir para uma data" aria-live="polite" onClick={escolherData}>
            <CalendarDays aria-hidden />
            {titulo}
          </button>
          <input ref={data} type="date" className="dc-periodo__data" tabIndex={-1} aria-hidden value={dia} onChange={(e) => e.target.value && escolher(e.target.value)} />
        </span>
      )}
      <button type="button" className="dc-periodo__seta" aria-label={vista === "mes" ? "Próximo mês" : vista === "semana" ? "Próxima semana" : "Próximas semanas"} onClick={proximo}>
        <ChevronRight />
      </button>
    </div>
  );

  if (celular) {
    const escolherDia = p && (
      <DiasNoCelular
        de={vista === "mes" ? p.busca.de : p.de}
        ate={vista === "mes" ? p.busca.ate : p.ate}
        mes={vista === "mes" ? p.de : undefined}
        hoje={hoje}
        escolhido={dia}
        porDia={porDia}
        feriados={feriados}
        aoEscolher={escolher}
        aoAnterior={anterior}
        aoProximo={proximo}
      />
    );
    return (
      <TelaCelular
        titulo="Agenda"
        sobre={
          <span className="dc-periodo__meio dc-periodo__meio--topo">
            <button type="button" className="dc-topo__data" aria-live="polite" onClick={escolherData}>
              {titulo}
              <ChevronDown aria-hidden />
            </button>
            <input ref={data} type="date" className="dc-periodo__data" tabIndex={-1} aria-hidden value={dia} onChange={(e) => e.target.value && escolher(e.target.value)} />
          </span>
        }
        voltar
        direita={
          <>
            <button type="button" className="dc-btn dc-btn--fantasma dc-topo__texto-btn" onClick={() => ir({ dia: hoje })}>
              Hoje
            </button>
            <Menu.Root>
              <Menu.Trigger className="dc-btn dc-btn--fantasma" aria-label="Nova tarefa ou audiência">
                <Plus />
              </Menu.Trigger>
              <Menu.Portal>
                <Menu.Content className="dc-menu-flutuante dc dc-celular" align="end" sideOffset={4}>
                  <Menu.Item className="dc-menu-flutuante__item" onSelect={() => setNova("tarefa")}>
                    <ListTodo aria-hidden /> Nova tarefa
                  </Menu.Item>
                  <Menu.Item className="dc-menu-flutuante__item" onSelect={() => setNova("audiencia")}>
                    <Gavel aria-hidden /> Nova audiência
                  </Menu.Item>
                </Menu.Content>
              </Menu.Portal>
            </Menu.Root>
          </>
        }
        fixo={
          <div className="dc-agenda-barra">
            {vistas}
            {passos(false)}
          </div>
        }
      >
        {calendario ? (
          <>
            {escolherDia}
            <section className="dc-secao">
              <h2 className={cn("dc-secao__titulo dc-agenda__dia", dia === hoje && "is-hoje")}>{tituloDoDia(dia)}</h2>
              {!a ? <Carregando linhas={2} /> : doDia.length ? <div className="dc-painel">{linhas(doDia)}</div> : vazioDoDia}
            </section>
          </>
        ) : (
          lista
        )}
        {dialogos}
      </TelaCelular>
    );
  }
  return (
    <Pagina cheia className="dc-pagina--agenda">
      <Cabecalho
        titulo="Agenda"
        sub={resumo}
        acoes={
          <>
            <Botao onClick={() => setNova("audiencia")}>
              <Plus /> Audiência
            </Botao>
            <Botao variante="primaria" onClick={() => setNova("tarefa")}>
              <Plus /> Tarefa
            </Botao>
          </>
        }
      />
      <div className="dc-agenda-barra">
        <div className="dc-agenda-barra__periodo">
          <Botao onClick={() => ir({ dia: hoje })}>Hoje</Botao>
          {passos(true)}
        </div>
        {vistas}
      </div>
      {vista === "lista" && (
        <Rolagem id="agenda" topo={dia} className="dc-rola--secoes">
          {lista}
        </Rolagem>
      )}
      {vista === "semana" && p && <SemanaDoCalendario semana={p.de} hoje={hoje} escolhido={dia} porDia={porDia} feriados={feriados} aoEscolher={escolher} aoMarcar={marcar} />}
      {vista === "mes" && p && (
        <div className="dc-agenda-mes">
          <MesDoCalendario mes={p.de} hoje={hoje} escolhido={dia} porDia={porDia} feriados={feriados} aoEscolher={escolher} />
          <Painel
            className="dc-agenda-mes__dia"
            corpo={false}
            titulo={<h2 className={cn("dc-painel__titulo dc-agenda__dia", dia === hoje && "is-hoje")}>{tituloDoDia(dia)}</h2>}
            acao={doDia.length > 0 && <span className="dc-nota dc-num">{contar(doDia.length, "compromisso", "compromissos")}</span>}
          >
            <div className="dc-rola">{!a ? <Carregando linhas={3} /> : doDia.length ? linhas(doDia, true) : vazioDoDia}</div>
            <Legenda />
          </Painel>
        </div>
      )}
      {dialogos}
    </Pagina>
  );
}

function LinhaDaAgenda({ item: i, compacta, aoMarcar }: { item: ItemDaAgenda; compacta?: boolean; aoMarcar: (feita: boolean) => void }) {
  const processo = i.processo ? (
    <span className={cn("dc-celula__2", compacta && "truncate")}>
      {i.processo.titulo}
      {!compacta && (
        <>
          {" · "}
          <Cnj cnj={i.processo.cnj} className="whitespace-nowrap" />
        </>
      )}
    </span>
  ) : i.detalhe ? (
    <span className={cn("dc-celula__2", compacta && "truncate")}>{i.detalhe}</span>
  ) : null;
  const pessoa = i.responsavel ? (
    <span className="dc-pessoa flex-none text-[13px] text-[var(--tinta-2)]" title={i.responsavel.nome}>
      <Avatar pessoa={i.responsavel} />
      {!compacta && <span className="max-md:hidden">{i.responsavel.apelido}</span>}
    </span>
  ) : compacta ? null : (
    <span className="flex-none text-[13px] text-[var(--tinta-3)] max-md:hidden">Sem responsável</span>
  );
  const marcador = cn("flex-none", compacta ? "w-[64px]" : "w-[64px] md:w-[76px]");
  if (i.tipo === "tarefa") {
    return (
      <label className="dc-linhas__item cursor-pointer items-center">
        <span className={marcador}>
          <input type="checkbox" className="dc-checa" checked={!!i.concluida} onChange={(e) => aoMarcar(e.target.checked)} aria-label={`Feita: ${i.titulo}`} />
        </span>
        <span className="dc-celula min-w-0 flex-1">
          <span className={cn("dc-celula__1", i.concluida && "text-[var(--tinta-3)] line-through")}>{i.titulo}</span>
          {processo}
        </span>
        {pessoa}
      </label>
    );
  }
  const destino = i.tipo === "audiencia" ? ({ to: "/audiencias/$id", params: { id: i.id } } as const) : ({ to: "/prazos/$id", params: { id: i.id } } as const);
  return (
    <Link {...destino} className="dc-linhas__item items-center">
      <span className={marcador}>
        {i.tipo === "audiencia" ? (
          <span className="dc-selo dc-selo--prazo dc-num">
            {i.porVideo && <Video />}
            {i.hora}
          </span>
        ) : (
          <Selo urgencia={i.urgencia ?? "prazo"}>Prazo</Selo>
        )}
      </span>
      <span className="dc-celula min-w-0 flex-1">
        <span className="dc-celula__1">
          {i.titulo}
          {i.aConfirmar && <span className="dc-selo dc-selo--ia ml-2">a confirmar</span>}
          {i.situacao && i.situacao !== "marcada" && <span className="ml-2 text-[13px] font-normal text-[var(--tinta-2)]">{SITUACAO[i.situacao as keyof typeof SITUACAO]}</span>}
        </span>
        {processo}
      </span>
      {pessoa}
    </Link>
  );
}

function NovaTarefa({ aberto, aoFechar, processo, dia }: { aberto: boolean; aoFechar: () => void; processo?: { id: string; titulo: string }; dia?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState(processo ?? null);
  const [f, setF] = useState({ titulo: "", detalhe: "", dia: "", responsavelId: eu.data?.usuario.id ?? "" });
  const criar = useMutation({
    mutationFn: () => api("/tarefas", { json: { titulo: f.titulo, detalhe: f.detalhe || null, dia: f.dia || dia || eu.data?.hoje, responsavelId: f.responsavelId || null, processoId: proc?.id ?? null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      avisar("Tarefa criada.");
      setF({ titulo: "", detalhe: "", dia: "", responsavelId: eu.data?.usuario.id ?? "" });
      setProc(processo ?? null);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Nova tarefa"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={f.titulo.trim().length < 2}>
            Criar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="O que fazer" htmlFor="nt-titulo">
          <input id="nt-titulo" value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} placeholder="Ligar para o cliente sobre o laudo" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dia" htmlFor="nt-dia">
            <input id="nt-dia" type="date" value={f.dia || dia || eu.data?.hoje || ""} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Quem faz" htmlFor="nt-resp">
            <select id="nt-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
              <option value="">Ninguém ainda</option>
              {eu.data?.equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Processo (opcional)">
          <EscolherProcesso valor={proc} aoEscolher={setProc} />
        </Campo>
        <Campo rotulo="Detalhe (opcional)" htmlFor="nt-det">
          <textarea id="nt-det" rows={2} value={f.detalhe} onChange={(e) => setF({ ...f, detalhe: e.target.value })} />
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function NovaAudiencia({ aberto, aoFechar, dia }: { aberto: boolean; aoFechar: () => void; dia?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState<{ id: string; titulo: string } | null>(null);
  const vazio = { dia: "", hora: "14:00", tipo: "Instrução e julgamento", porVideo: false, local: "" };
  const [f, setF] = useState(vazio);
  // O dia escolhido no calendário já vem no campo (se não for passado).
  const noDia = f.dia || (dia && eu.data && dia >= eu.data.hoje ? dia : "");
  const criar = useMutation({
    mutationFn: () => api("/audiencias", { json: { processoId: proc!.id, dia: noDia, hora: f.hora, tipo: f.tipo, porVideo: f.porVideo, local: f.local || null } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      avisar("Audiência na agenda.");
      setF(vazio);
      setProc(null);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Nova audiência"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!proc || !noDia || f.tipo.trim().length < 2}>
            Pôr na agenda
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Processo">
          <EscolherProcesso valor={proc} aoEscolher={setProc} />
        </Campo>
        <Campo rotulo="Tipo" htmlFor="na-tipo">
          <input id="na-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dia" htmlFor="na-dia">
            <input id="na-dia" type="date" value={noDia} min={eu.data?.hoje} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Hora" htmlFor="na-hora">
            <input id="na-hora" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
          </Campo>
        </div>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.porVideo} onChange={(e) => setF({ ...f, porVideo: e.target.checked })} />
          Por vídeo
        </label>
        <Campo rotulo={f.porVideo ? "Link da sala" : "Local"} htmlFor="na-local">
          <input id="na-local" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

export function AudienciaPage() {
  const { id } = useParams({ from: "/app/audiencias/$id" });
  const celular = useCelular();
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["audiencia", id], queryFn: () => api<Audiencia>(`/audiencias/${id}`) });
  const [editando, setEditando] = useState(false);
  const atualizar = () => {
    for (const k of ["audiencia", "agenda", "hoje", "processo"]) void qc.invalidateQueries({ queryKey: [k] });
  };
  const mudar = useMutation({
    mutationFn: (corpo: Partial<Pick<Audiencia, "situacao" | "checklist">>) => api(`/audiencias/${id}`, { method: "PUT", json: corpo }),
    onSuccess: (_r, corpo) => {
      atualizar();
      if (corpo.situacao) avisar(corpo.situacao === "realizada" ? "Audiência realizada." : corpo.situacao === "cancelada" ? "Audiência cancelada." : "Audiência atualizada.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const preparar = useMutation({
    mutationFn: () => api(`/ia/audiencia/${id}`, { method: "POST" }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const a = q.data;
  if (!a) {
    const corpo = q.error ? <FalhaAoCarregar erro={q.error} sumiu="Audiência não encontrada" aoTentar={() => void q.refetch()} /> : <Carregando />;
    return celular ? (
      <TelaCelular titulo="Agenda" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }

  const marcada = a.situacao === "marcada";
  const selos = (
    <>
      <span className="dc-selo dc-selo--prazo dc-num">
        {a.porVideo && <Video />}
        {diaMes(a.dia)} às {a.hora}
      </span>
      {!marcada && <span className={cn("dc-selo", a.situacao === "realizada" ? "dc-selo--ok" : "dc-selo--prazo")}>{SITUACAO[a.situacao as keyof typeof SITUACAO]}</span>}
    </>
  );
  const pr = a.preparacao;
  const preparacao = (pr || eu.data?.ia) && (
    <BlocoIa titulo="Preparação da audiência" analise={pr} aoRefazer={eu.data?.ia ? () => preparar.mutate() : undefined} refazendo={preparar.isPending} avisoDesatualizada="Chegou novidade nos autos depois desta preparação.">
      {pr?.situacao === "pronto" ? <ConteudoDaPreparacao c={pr.conteudo} /> : <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">A IA lê os autos e monta o que é a audiência, o objetivo, os pontos controvertidos e o checklist.</p>}
    </BlocoIa>
  );
  const checklist = (
    <Painel titulo="Checklist" acao={a.checklist.length > 0 && <span className="dc-nota dc-num">{a.checklist.filter((i) => i.feito).length} de {a.checklist.length}</span>} corpo={false}>
      {a.checklist.length ? (
        <div className="dc-linhas">
          {a.checklist.map((item, n) => (
            <label key={n} className="dc-linhas__item cursor-pointer items-center">
              <input
                type="checkbox"
                className="dc-checa"
                checked={item.feito}
                onChange={(e) => mudar.mutate({ checklist: a.checklist.map((x, k) => (k === n ? { ...x, feito: e.target.checked } : x)) })}
              />
              <span className={cn("text-[14px]", item.feito && "text-[var(--tinta-3)] line-through")}>{item.texto}</span>
            </label>
          ))}
        </div>
      ) : (
        <Vazio titulo="Sem checklist">{eu.data?.ia ? "Gere a preparação: o checklist da IA aparece aqui para marcar." : "Nada para marcar ainda."}</Vazio>
      )}
    </Painel>
  );
  const dados = (
    <Painel titulo="Audiência" acao={<Botao variante="fantasma" pequeno onClick={() => setEditando(true)}>Editar</Botao>}>
      <Dados
        linhas={[
          ["Tipo", a.tipo],
          ["Dia", `${diaCompleto(a.dia)}, ${diaDaSemana(a.dia)}`],
          ["Hora", <span className="dc-num">{a.hora}</span>],
          ["Formato", a.porVideo ? "Por vídeo" : "Presencial"],
          [a.porVideo ? "Sala" : "Local", a.local ? a.porVideo && /^https?:/.test(a.local) ? <a className="dc-link" href={a.local} target="_blank" rel="noreferrer">Entrar na sala</a> : a.local : "—"],
          ["Responsável", <Responsavel pessoa={a.responsavel} />],
          ["Situação", SITUACAO[a.situacao as keyof typeof SITUACAO] ?? a.situacao],
        ]}
      />
    </Painel>
  );
  const sobre = (
    <>
      <Link to="/processos/$id" params={{ id: a.processo.id }} className="text-inherit no-underline hover:underline">
        <strong>{a.processo.titulo}</strong>
      </Link>
      {celular ? [ondeTramita(a.processo), a.processo.cnj].filter(Boolean).join(" · ") : <> · <Cnj cnj={a.processo.cnj} /> {ondeTramita(a.processo) && `· ${ondeTramita(a.processo)}`}</>}
    </>
  );
  const editar = <EditarAudiencia a={a} aberto={editando} aoFechar={() => setEditando(false)} aoSalvar={atualizar} />;

  if (celular) {
    return (
      <TelaCelular
        titulo="Agenda"
        voltar
        rodape={
          marcada ? (
            <div className="dc-rodape__par">
              <Botao variante="primaria" bloco onClick={() => mudar.mutate({ situacao: "realizada" })}>
                <Check /> Realizada
              </Botao>
              <Botao bloco onClick={() => setEditando(true)}>
                Redesignar
              </Botao>
            </div>
          ) : undefined
        }
      >
        <TopoDoDetalhe selos={selos} titulo={a.tipo} sobre={sobre} />
        {preparacao}
        {checklist}
        {dados}
        {editar}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <div className="flex flex-col gap-3">
        <Trilha>
          <Link to="/agenda">Agenda</Link>
          <span>{a.tipo}</span>
        </Trilha>
        <TopoDoDetalhe
          selos={selos}
          titulo={a.tipo}
          sobre={sobre}
          acoes={
            marcada ? (
              <>
                <Botao variante="perigo" onClick={() => mudar.mutate({ situacao: "cancelada" })}>
                  Cancelar audiência
                </Botao>
                <Botao onClick={() => setEditando(true)}>Redesignar</Botao>
                <Botao variante="primaria" onClick={() => mudar.mutate({ situacao: "realizada" })}>
                  <Check /> Marcar como realizada
                </Botao>
              </>
            ) : (
              <Botao onClick={() => mudar.mutate({ situacao: "marcada" })}>Voltar para marcada</Botao>
            )
          }
        />
      </div>
      <div className="dc-colunas">
        <div className="dc-pilha">
          {preparacao}
          {checklist}
        </div>
        <div className="dc-pilha">{dados}</div>
      </div>
      {editar}
    </Pagina>
  );
}

function ConteudoDaPreparacao({ c }: { c: PreparacaoDeAudiencia }) {
  return (
    <>
      <SecaoIa titulo="O que é">
        <p>{c.oQueE}</p>
      </SecaoIa>
      <SecaoIa titulo="Objetivo">
        <p>{c.objetivo}</p>
      </SecaoIa>
      <div className="dc-ia__duas">
        <SecaoIa titulo="Pontos controvertidos">{c.controvertidos.length ? <ListaIa itens={c.controvertidos} /> : <p>Nada de destaque.</p>}</SecaoIa>
        <SecaoIa titulo="Pontos críticos">{c.criticos.length ? <ListaIa itens={c.criticos} /> : <p>Nada de destaque.</p>}</SecaoIa>
      </div>
    </>
  );
}

function EditarAudiencia({ a, aberto, aoFechar, aoSalvar }: { a: Audiencia; aberto: boolean; aoFechar: () => void; aoSalvar: () => void }) {
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const inicial = () => ({ dia: a.dia, hora: a.hora, tipo: a.tipo, porVideo: a.porVideo, local: a.local ?? "", responsavelId: a.responsavel?.id ?? "" });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const mudouData = f.dia !== a.dia || f.hora !== a.hora;
  const salvar = useMutation({
    mutationFn: () => api(`/audiencias/${a.id}`, { method: "PUT", json: { ...f, local: f.local || null, responsavelId: f.responsavelId || null } }),
    onSuccess: () => {
      aoSalvar();
      avisar(mudouData ? "Audiência redesignada." : "Audiência atualizada.");
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Audiência"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!f.dia || f.tipo.trim().length < 2}>
            Salvar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Tipo" htmlFor="ea-tipo">
          <input id="ea-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dia" htmlFor="ea-dia">
            <input id="ea-dia" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Hora" htmlFor="ea-hora">
            <input id="ea-hora" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
          </Campo>
        </div>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.porVideo} onChange={(e) => setF({ ...f, porVideo: e.target.checked })} />
          Por vídeo
        </label>
        <Campo rotulo={f.porVideo ? "Link da sala" : "Local"} htmlFor="ea-local">
          <input id="ea-local" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </Campo>
        <Campo rotulo="Responsável" htmlFor="ea-resp">
          <select id="ea-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Sem responsável</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
