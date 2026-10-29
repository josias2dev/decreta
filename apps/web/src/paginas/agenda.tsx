/** Agenda (audiências, vencimentos e tarefas dia a dia) e a tela da audiência com a preparação da IA. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Plus, Video } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { Avatar, BlocoIa, Botao, Cabecalho, Campo, Carregando, Cnj, Dados, Faixa, ListaIa, Painel, Responsavel, SecaoIa, Selo, TopoDoDetalhe, Trilha, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaDaSemana, diaMes, ondeTramita } from "@/lib/formato";
import type { Agenda, Audiencia, ItemDaAgenda, PreparacaoDeAudiencia } from "@/lib/tipos";
import { cn } from "@/lib/util";

const somar = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const SITUACAO = { marcada: "Marcada", realizada: "Realizada", cancelada: "Cancelada", redesignada: "Redesignada" } as const;

export function AgendaPage() {
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const qc = useQueryClient();
  const avisar = useAviso();
  const hoje = eu.data?.hoje;
  const [de, setDe] = useState<string | null>(null);
  const inicio = de ?? hoje ?? "";
  const ate = inicio ? somar(inicio, 13) : "";
  const agenda = useQuery({ queryKey: ["agenda", inicio], queryFn: () => api<Agenda>(`/agenda?de=${inicio}&ate=${ate}`), enabled: !!inicio, placeholderData: (a) => a });
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

  const a = agenda.data;
  const navegar = (
    <div className="flex items-center gap-1">
      <Botao variante="fantasma" pequeno aria-label="Semanas anteriores" onClick={() => setDe(somar(inicio, -14))}>
        <ChevronLeft />
      </Botao>
      <Botao variante="fantasma" pequeno onClick={() => setDe(null)} disabled={!de || de === hoje}>
        Hoje
      </Botao>
      <Botao variante="fantasma" pequeno aria-label="Próximas semanas" onClick={() => setDe(somar(inicio, 14))}>
        <ChevronRight />
      </Botao>
    </div>
  );
  const sub = a ? `${diaMes(a.de)} a ${diaMes(a.ate)} · ${a.dias.reduce((n, d) => n + d.itens.length, 0)} compromissos` : " ";
  const dias = a?.dias ?? [];

  const lista = !a ? (
    <Carregando />
  ) : dias.length ? (
    dias.map((d) => (
      <section key={d.dia} className="dc-secao">
        <h2 className="dc-secao__titulo" style={{ fontSize: 15, color: d.dia === a.hoje ? "var(--acento)" : undefined }}>
          {d.dia === a.hoje ? "Hoje" : d.dia === somar(a.hoje, 1) ? "Amanhã" : diaDaSemana(d.dia).replace("-feira", "").replace(/^./, (x) => x.toUpperCase())}, {diaMes(d.dia)}
        </h2>
        <div className="dc-painel">
          <div className="dc-linhas">
            {d.itens.map((i) => (
              <LinhaDaAgenda key={`${i.tipo}-${i.id}`} item={i} aoMarcar={(feita) => tarefa.mutate({ id: i.id, feita })} />
            ))}
          </div>
        </div>
      </section>
    ))
  ) : (
    <Vazio titulo="Nada nestas duas semanas">Audiências e tarefas aparecem aqui, com os vencimentos de prazo.</Vazio>
  );

  const dialogos = (
    <>
      <NovaTarefa aberto={nova === "tarefa"} aoFechar={() => setNova(null)} />
      <NovaAudiencia aberto={nova === "audiencia"} aoFechar={() => setNova(null)} />
    </>
  );

  if (celular) {
    return (
      <TelaCelular
        titulo="Agenda"
        sobre={sub}
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Nova tarefa" onClick={() => setNova("tarefa")}>
            <Plus />
          </button>
        }
      >
        <div className="flex items-center justify-between">
          {navegar}
          <Botao pequeno onClick={() => setNova("audiencia")}>
            <Plus /> Audiência
          </Botao>
        </div>
        {lista}
        {dialogos}
      </TelaCelular>
    );
  }
  return (
    <Pagina>
      <Cabecalho
        titulo="Agenda"
        sub={sub}
        acoes={
          <>
            {navegar}
            <Botao onClick={() => setNova("audiencia")}>
              <Plus /> Audiência
            </Botao>
            <Botao variante="primaria" onClick={() => setNova("tarefa")}>
              <Plus /> Tarefa
            </Botao>
          </>
        }
      />
      {lista}
      {dialogos}
    </Pagina>
  );
}

function LinhaDaAgenda({ item: i, aoMarcar }: { item: ItemDaAgenda; aoMarcar: (feita: boolean) => void }) {
  const processo = i.processo ? (
    <span className="dc-celula__2">
      {i.processo.titulo} · <Cnj cnj={i.processo.cnj} />
    </span>
  ) : i.detalhe ? (
    <span className="dc-celula__2">{i.detalhe}</span>
  ) : null;
  const pessoa = i.responsavel ? (
    <span className="dc-pessoa flex-none text-[13px] text-[var(--tinta-2)]">
      <Avatar pessoa={i.responsavel} />
      <span className="max-md:hidden">{i.responsavel.apelido}</span>
    </span>
  ) : (
    <span className="flex-none text-[13px] text-[var(--tinta-3)] max-md:hidden">Sem responsável</span>
  );
  if (i.tipo === "tarefa") {
    return (
      <label className="dc-linhas__item cursor-pointer items-center">
        <span className="w-[64px] flex-none md:w-[76px]">
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
      <span className="w-[64px] flex-none md:w-[76px]">
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

function NovaTarefa({ aberto, aoFechar, processo }: { aberto: boolean; aoFechar: () => void; processo?: { id: string; titulo: string } }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState(processo ?? null);
  const [f, setF] = useState({ titulo: "", detalhe: "", dia: "", responsavelId: eu.data?.usuario.id ?? "" });
  const criar = useMutation({
    mutationFn: () => api("/tarefas", { json: { titulo: f.titulo, detalhe: f.detalhe || null, dia: f.dia || eu.data?.hoje, responsavelId: f.responsavelId || null, processoId: proc?.id ?? null } }),
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
            <input id="nt-dia" type="date" value={f.dia || eu.data?.hoje || ""} onChange={(e) => setF({ ...f, dia: e.target.value })} />
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

function NovaAudiencia({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState<{ id: string; titulo: string } | null>(null);
  const vazio = { dia: "", hora: "14:00", tipo: "Instrução e julgamento", porVideo: false, local: "" };
  const [f, setF] = useState(vazio);
  const criar = useMutation({
    mutationFn: () => api("/audiencias", { json: { processoId: proc!.id, dia: f.dia, hora: f.hora, tipo: f.tipo, porVideo: f.porVideo, local: f.local || null } }),
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
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!proc || !f.dia || f.tipo.trim().length < 2}>
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
            <input id="na-dia" type="date" value={f.dia} min={eu.data?.hoje} onChange={(e) => setF({ ...f, dia: e.target.value })} />
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
