/**
 * Publicações: a caixa de entrada do DJEN. No computador, a lista à esquerda e
 * a selecionada à direita; no celular, a lista e uma tela por publicação.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Check, CircleAlert, ClipboardPaste, LoaderCircle, Pencil, Plus, RefreshCw } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { Abas, BlocoIa, Botao, Cabecalho, Campo, Carregando, Cnj, Faixa, MarcaIa, Responsavel, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDaSemana, diaDoInstante, hora, ondeTramita, prazoEmDias } from "@/lib/formato";
import type { CaixaDePublicacoes, Contagem, ContagemNaTela, Pessoa, Publicacao, Selo, SituacaoPublicacao, Sugestao } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { atualizarPrazos } from "./prazo";

const ABAS: { id: SituacaoPublicacao; rotulo: string }[] = [
  { id: "nova", rotulo: "Novas" },
  { id: "pendente", rotulo: "Pendentes" },
  { id: "lida", rotulo: "Lidas" },
  { id: "vinculada", rotulo: "Vinculadas" },
];
const NA_SITUACAO: Record<SituacaoPublicacao, string> = { nova: "Publicação nova", pendente: "Publicação pendente", lida: "Publicação lida", vinculada: "Publicação vinculada" };
const FONTE = { djen: "DJEN", datajud: "DataJud", manual: "Colada à mão" } as const;

const caixaQuery = (situacao: SituacaoPublicacao) => ({
  queryKey: ["publicacoes", situacao],
  queryFn: () => api<CaixaDePublicacoes>(`/publicacoes?situacao=${situacao}`),
  placeholderData: (a: CaixaDePublicacoes | undefined) => a,
  refetchInterval: 60_000,
});

const publicacaoQuery = (id: string) => ({
  queryKey: ["publicacao", id],
  queryFn: () => api<Publicacao>(`/publicacoes/${id}`),
  // Enquanto a IA lê o teor, a tela pergunta de novo.
  refetchInterval: (q: { state: { data?: Publicacao } }) => (q.state.data && !q.state.data.sugestao ? 4000 : false),
});

/** A captura do DJEN roda às 06:40, 12:40 e 18:40, de segunda a sexta (apps/api/src/inngest.ts). */
export function proximaBusca(agora = new Date()): string {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(agora).map((p) => [p.type, p.value]),
  );
  const dia = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(partes.weekday!);
  const minutos = Number(partes.hour) * 60 + Number(partes.minute);
  const horarios = ["06:40", "12:40", "18:40"];
  if (dia >= 1 && dia <= 5) {
    const h = horarios.find((x) => Number(x.slice(0, 2)) * 60 + Number(x.slice(3)) > minutos);
    if (h) return `às ${h}`;
  }
  return dia === 0 || (dia >= 1 && dia <= 4) ? "amanhã às 06:40" : "segunda às 06:40";
}

function SeloDaLista({ selo }: { selo: Selo }) {
  return (
    <span className={cn("dc-pub__selo", `dc-pub__selo--${selo.tipo}`)}>
      {selo.tipo === "sem_teor" || selo.tipo === "erro" ? <CircleAlert /> : selo.tipo === "lendo" ? <LoaderCircle className="animate-spin" /> : <MarcaIa />}
      {selo.texto}
    </span>
  );
}

function ItemDaCaixa({ item, ligado, celular, aoEscolher }: { item: CaixaDePublicacoes["itens"][number]; ligado?: boolean; celular: boolean; aoEscolher?: () => void }) {
  const miolo = (
    <>
      <span className="dc-pub__topo">
        <span className="dc-pub__titulo">{item.titulo}</span>
        <span className="dc-pub__data">{diaCurto(item.disponibilizadaEm)}</span>
      </span>
      <span className="dc-pub__partes">{item.partes}</span>
      <SeloDaLista selo={item.selo} />
    </>
  );
  if (celular) {
    return (
      <Link to="/publicacoes/$id" params={{ id: item.id }} className="dc-pub">
        {miolo}
      </Link>
    );
  }
  return (
    <button type="button" className={cn("dc-pub", ligado && "is-on")} aria-current={ligado || undefined} onClick={aoEscolher}>
      {miolo}
    </button>
  );
}

function useBuscarAgora() {
  const qc = useQueryClient();
  const avisar = useAviso();
  return useMutation({
    mutationFn: () => api("/publicacoes/buscar", { method: "POST" }),
    onSuccess: () => {
      avisar("Buscando no DJEN. As novas aparecem aqui em instantes.");
      for (const ms of [8000, 20000, 45000]) setTimeout(() => void qc.invalidateQueries({ queryKey: ["publicacoes"] }), ms);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
}

export function PublicacoesPage() {
  const celular = useCelular();
  const search = useSearch({ from: "/app/publicacoes" });
  const navigate = useNavigate({ from: "/publicacoes" });
  const situacao: SituacaoPublicacao = search.situacao ?? "nova";
  const eu = useQuery(euQuery);
  const caixa = useQuery(caixaQuery(situacao));
  const buscar = useBuscarAgora();
  const [colar, setColar] = useState(false);

  const c = caixa.data;
  const capturada = c?.ultimaCaptura;
  const sub = !c
    ? " "
    : capturada
      ? `${c.contagens.nova} ${c.contagens.nova === 1 ? "nova" : "novas"} do DJEN, capturadas ${diaDoInstante(capturada.em) === eu.data?.hoje ? "hoje" : `em ${diaCurto(diaDoInstante(capturada.em))}`} às ${capturada.hora} · próxima busca ${proximaBusca()}`
      : `Nenhuma busca no DJEN ainda · próxima ${proximaBusca()}`;
  const abas = c ? ABAS.map((a) => ({ ...a, n: c.contagens[a.id] || undefined })) : ABAS;
  const irPara = (s: SituacaoPublicacao) => void navigate({ search: { situacao: s === "nova" ? undefined : s } });
  const vazio = (
    <Vazio titulo={situacao === "nova" ? "Nenhuma publicação nova" : situacao === "pendente" ? "Nada pendente" : "Nada aqui ainda"}>
      {situacao === "nova" ? `O Decreta busca no DJEN pelas OABs da equipe. Próxima busca ${proximaBusca()}.` : null}
    </Vazio>
  );
  const falhou = capturada?.erro && <Faixa tipo="erro">A última busca no DJEN falhou: {capturada.erro}. Tento de novo na próxima.</Faixa>;

  if (celular) {
    return (
      <TelaCelular
        titulo="Publicações"
        sobre={c ? `${c.contagens.nova} ${c.contagens.nova === 1 ? "nova" : "novas"} do DJEN` : " "}
        direita={
          <>
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Buscar agora no DJEN" onClick={() => buscar.mutate()} disabled={buscar.isPending}>
              <RefreshCw className={cn(buscar.isPending && "animate-spin")} />
            </button>
            <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Colar publicação" onClick={() => setColar(true)}>
              <Plus />
            </button>
          </>
        }
      >
        {falhou}
        <section className="dc-painel">
          <Abas abas={abas} ativa={situacao} aoMudar={irPara} />
          {!c ? (
            <div className="p-4">
              <Carregando linhas={3} />
            </div>
          ) : c.itens.length ? (
            <div className="dc-linhas">
              {c.itens.map((i) => (
                <ItemDaCaixa key={i.id} item={i} celular />
              ))}
            </div>
          ) : (
            vazio
          )}
        </section>
        <ColarPublicacao aberto={colar} aoFechar={() => setColar(false)} />
      </TelaCelular>
    );
  }

  const selecionada = search.id ?? c?.itens[0]?.id;
  const escolher = (id: string | undefined) => void navigate({ search: (s) => ({ ...s, id }), replace: true });
  /** Depois de tratar: a próxima da lista (a tratada sai da aba Novas). */
  const proxima = () => {
    const itens = c?.itens ?? [];
    const i = itens.findIndex((x) => x.id === selecionada);
    escolher(itens[i + 1]?.id ?? itens[i - 1]?.id);
  };

  return (
    <Pagina>
      <Cabecalho
        titulo="Publicações"
        sub={sub}
        acoes={
          <>
            <Botao onClick={() => setColar(true)}>
              <ClipboardPaste /> Colar publicação
            </Botao>
            <Botao onClick={() => buscar.mutate()} ocupado={buscar.isPending}>
              <RefreshCw /> Buscar agora
            </Botao>
          </>
        }
      />
      {falhou}
      <div className="dc-caixa">
        <section className="dc-painel dc-caixa__lista">
          <Abas abas={abas} ativa={situacao} aoMudar={(s) => void navigate({ search: { situacao: s === "nova" ? undefined : s } })} />
          {!c ? (
            <div className="p-4">
              <Carregando linhas={3} />
            </div>
          ) : c.itens.length ? (
            <div className="dc-linhas">
              {c.itens.map((i) => (
                <ItemDaCaixa key={i.id} item={i} celular={false} ligado={i.id === selecionada} aoEscolher={() => escolher(i.id)} />
              ))}
            </div>
          ) : (
            vazio
          )}
        </section>
        {selecionada ? <Selecionada id={selecionada} aoTerminar={proxima} /> : <div />}
      </div>
      <ColarPublicacao aberto={colar} aoFechar={() => setColar(false)} />
    </Pagina>
  );
}

function Selecionada({ id, aoTerminar }: { id: string; aoTerminar: () => void }) {
  const q = useQuery(publicacaoQuery(id));
  if (!q.data) {
    return <section className="dc-painel p-4">{q.error ? <FalhaAoCarregar erro={q.error} sumiu="Publicação não encontrada" aoTentar={() => void q.refetch()} /> : <Carregando />}</section>;
  }
  return <VerPublicacao pub={q.data} celular={false} aoTerminar={aoTerminar} />;
}

/** Tela própria no celular. No computador, a mesma publicação abre dentro da caixa. */
export function PublicacaoPage() {
  const { id } = useParams({ from: "/app/publicacoes/$id" });
  const celular = useCelular();
  const navigate = useNavigate();
  const q = useQuery(publicacaoQuery(id));
  const situacao = q.data?.situacao;
  const caixa = useQuery({ ...caixaQuery(situacao ?? "nova"), enabled: !!situacao && celular });
  if (!celular) return <Navigate to="/publicacoes" search={{ id }} replace />;
  if (!q.data) {
    return (
      <TelaCelular titulo="Publicação" voltar>
        {q.error ? <FalhaAoCarregar erro={q.error} sumiu="Publicação não encontrada" aoTentar={() => void q.refetch()} /> : <Carregando />}
      </TelaCelular>
    );
  }
  const itens = caixa.data?.itens ?? [];
  const pos = itens.findIndex((i) => i.id === id);
  const aoTerminar = () => {
    const prox = itens[pos + 1] ?? itens[pos - 1];
    if (prox && prox.id !== id) void navigate({ to: "/publicacoes/$id", params: { id: prox.id }, replace: true });
    else void navigate({ to: "/publicacoes", replace: true });
  };
  return (
    <VerPublicacao
      pub={q.data}
      celular
      aoTerminar={aoTerminar}
      titulo={NA_SITUACAO[q.data.situacao]}
      sobre={[pos >= 0 ? `${pos + 1} de ${itens.length}` : null, FONTE[q.data.fonte]].filter(Boolean).join(" · ")}
    />
  );
}

type Modo = "prazo" | "audiencia" | "sem_prazo" | "feito";

function VerPublicacao({ pub, celular, aoTerminar, titulo, sobre }: { pub: Publicacao; celular: boolean; aoTerminar: () => void; titulo?: string; sobre?: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [dialogo, setDialogo] = useState<"prazo" | "audiencia" | null>(null);
  const s = pub.sugestao;
  const c = s?.situacao === "pronto" ? s.conteudo : null;
  const modo: Modo = pub.prazo?.confirmado || pub.audiencia ? "feito" : c?.audiencia ? "audiencia" : c?.geraPrazo && c.dias ? "prazo" : "sem_prazo";
  const semProcesso = !pub.processo;

  const pronto = (texto: string) => {
    atualizarPrazos(qc);
    avisar(texto);
    aoTerminar();
  };
  const confirmar = useMutation({
    mutationFn: () => api<{ prazoId: string; fim: string }>(`/publicacoes/${pub.id}/confirmar`, { json: { tipo: c!.tipo, fundamento: c!.fundamento, dias: c!.dias!, contagem: c!.contagem, responsavelId: s?.responsavel?.id } }),
    onSuccess: (r) => pronto(`Prazo confirmado: vence em ${diaCompleto(r.fim)}.`),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const agendar = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/audiencia`, { json: { dia: c!.audiencia!.data, hora: c!.audiencia!.hora, tipo: c!.audiencia!.tipo, porVideo: c!.audiencia!.porVideo } }),
    onSuccess: () => pronto("Audiência na agenda."),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const marcar = useMutation({
    mutationFn: (o: "sem-prazo" | "pendente") => api(`/publicacoes/${pub.id}/${o}`, { method: "POST" }),
    onSuccess: (_r, o) => pronto(o === "pendente" ? "Ficou em Pendentes." : "Marcada como lida, sem prazo."),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const refazer = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/sugerir`, { method: "POST" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] });
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const vincular = useMutation({
    mutationFn: (processoId: string) => api(`/publicacoes/${pub.id}/vincular`, { json: { processoId } }),
    onSuccess: () => {
      avisar("Publicação vinculada ao processo. A IA lê de novo.");
      void qc.invalidateQueries({ queryKey: ["publicacao", pub.id] });
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const ocupado = confirmar.isPending || agendar.isPending || marcar.isPending;
  const onde = pub.processo ? ondeTramita(pub.processo) : pub.orgao;
  const tituloTeor = pub.tipoComunicacao?.toLocaleLowerCase("pt-BR").startsWith("intima") ? "Teor da intimação" : `Teor ${pub.tipoComunicacao ? `· ${pub.tipoComunicacao}` : "da publicação"}`;
  const datas = `Disponibilizada em ${diaCompleto(pub.disponibilizadaEm)} · publicada em ${diaCompleto(pub.publicadaEm)}`;

  const processo = pub.processo ? (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <strong className="text-[16px] leading-[22px]">{pub.processo.titulo}</strong>
        {celular && (pub.processo.classe || onde) && <span className="text-[14px] leading-[20px] text-[var(--tinta-2)]">{[pub.processo.classe, onde].filter(Boolean).join(" · ")}</span>}
        <span className="text-[14px] leading-[20px] text-[var(--tinta-2)]">
          <Cnj cnj={pub.processo.cnj} />
          {!celular && [onde, pub.processo.responsavel?.apelido].filter(Boolean).map((x) => ` · ${x}`)}
        </span>
      </div>
      {!celular && (
        <Link to="/processos/$id" params={{ id: pub.processo.id }} className="dc-btn dc-btn--secundaria dc-btn--sm flex-none">
          Abrir processo
        </Link>
      )}
    </div>
  ) : (
    <div className="flex flex-col gap-2">
      <Faixa tipo="aviso">
        <CircleAlert />
        {pub.cnj ? `O processo ${pub.cnj} não está no Decreta.` : "Esta publicação não está ligada a um processo."} Vincule para contar o prazo.
      </Faixa>
      <EscolherProcesso valor={null} aoEscolher={(p) => p && vincular.mutate(p.id)} />
    </div>
  );

  const teor = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <h3 className="m-0 text-[14px] font-semibold leading-[20px]">{tituloTeor}</h3>
        <span className="dc-nota">{celular ? `Disponibilizada em ${diaCompleto(pub.disponibilizadaEm)}` : datas}</span>
      </div>
      <p className={cn("m-0 whitespace-pre-wrap", celular ? "dc-teor" : "text-[14px] leading-[24px]")}>{pub.texto || "Sem teor. Abra a publicação no sistema do tribunal."}</p>
      {pub.link && (
        <a href={pub.link} target="_blank" rel="noreferrer" className="dc-link">
          Abrir no tribunal
        </a>
      )}
    </>
  );

  const tituloIa = !c ? "Prazo sugerido" : c.audiencia ? "Audiência designada" : c.geraPrazo ? "Prazo sugerido" : "Leitura da IA";
  const ia = (
    <BlocoIa
      titulo={tituloIa}
      analise={s}
      aoRefazer={eu.data?.ia && s ? () => refazer.mutate() : undefined}
      refazendo={refazer.isPending || (!s && !!eu.data?.ia)}
      rodape={s ? "Gerado por IA. Confira nos autos." : "A IA está lendo o teor."}
    >
      {c ? <ConteudoDaSugestao c={c} responsavel={s!.responsavel} /> : !eu.data?.ia ? <p className="m-0 text-[14px]">A IA não está ligada. Confira o teor e crie o prazo à mão.</p> : null}
    </BlocoIa>
  );

  const feito =
    modo === "feito" &&
    (pub.prazo?.confirmado ? (
      <Faixa tipo="ok">
        <Check />
        <span className="flex-1">
          Prazo confirmado: {pub.prazo.tipo}, vence em {diaCompleto(pub.prazo.fim)}.
        </span>
        <Link to="/prazos/$id" params={{ id: pub.prazo.id }} className="dc-link">
          Abrir prazo
        </Link>
      </Faixa>
    ) : pub.audiencia ? (
      <Faixa tipo="ok">
        <Check />
        <span className="flex-1">
          Na agenda: {pub.audiencia.tipo}, {diaCompleto(diaDoInstante(pub.audiencia.em))} às {hora(pub.audiencia.em)}.
        </span>
        <Link to="/audiencias/$id" params={{ id: pub.audiencia.id }} className="dc-link">
          Abrir audiência
        </Link>
      </Faixa>
    ) : null);
  const lida = modo === "sem_prazo" && pub.situacao === "lida" && <Faixa tipo="ok">Marcada como lida, sem prazo.</Faixa>;

  // Ações: [principal, secundária, terciária, extra]
  type Acao = { rotulo: string; icone?: ReactNode; fazer: () => void; ocupado?: boolean; desligado?: boolean };
  const acoes: Acao[] =
    modo === "prazo"
      ? [
          { rotulo: "Confirmar prazo", icone: <Check />, fazer: () => confirmar.mutate(), ocupado: confirmar.isPending, desligado: semProcesso },
          { rotulo: "Ajustar", icone: <Pencil />, fazer: () => setDialogo("prazo"), desligado: semProcesso },
          { rotulo: "Não gera prazo", fazer: () => marcar.mutate("sem-prazo") },
          ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
        ]
      : modo === "audiencia"
        ? [
            { rotulo: "Pôr na agenda", icone: <Check />, fazer: () => agendar.mutate(), ocupado: agendar.isPending, desligado: semProcesso },
            { rotulo: "Ajustar", icone: <Pencil />, fazer: () => setDialogo("audiencia"), desligado: semProcesso },
            { rotulo: "Não gera prazo", fazer: () => marcar.mutate("sem-prazo") },
            ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
          ]
        : modo === "sem_prazo"
          ? [
              ...(pub.situacao !== "lida" ? [{ rotulo: "Marcar como lida", icone: <Check />, fazer: () => marcar.mutate("sem-prazo"), ocupado: marcar.isPending && marcar.variables === "sem-prazo" }] : []),
              { rotulo: "Criar prazo", icone: <Plus />, fazer: () => setDialogo("prazo"), desligado: semProcesso },
              ...(pub.situacao === "nova" ? [{ rotulo: "Deixar pendente", fazer: () => marcar.mutate("pendente") }] : []),
            ]
          : [];

  const dialogos = (
    <>
      <ConfirmarComAjuste pub={pub} sugestao={c} aberto={dialogo === "prazo"} aoFechar={() => setDialogo(null)} aoConfirmar={(fim) => pronto(`Prazo confirmado: vence em ${diaCompleto(fim)}.`)} />
      {c?.audiencia && <AjustarAudiencia pub={pub} audiencia={c.audiencia} aberto={dialogo === "audiencia"} aoFechar={() => setDialogo(null)} aoMarcar={() => pronto("Audiência na agenda.")} />}
    </>
  );

  if (celular) {
    const [a1, a2, a3] = acoes;
    return (
      <TelaCelular
        titulo={titulo ?? "Publicação"}
        sobre={sobre}
        voltar
        rodape={
          a1 && (
            <>
              <Botao variante="primaria" bloco onClick={a1.fazer} ocupado={a1.ocupado} disabled={a1.desligado || ocupado}>
                {a1.icone} {a1.rotulo}
              </Botao>
              {(a2 || a3) && (
                <div className="dc-rodape__par">
                  {a2 && (
                    <Botao bloco onClick={a2.fazer} disabled={a2.desligado || ocupado}>
                      {a2.rotulo}
                    </Botao>
                  )}
                  {a3 && (
                    <Botao variante="fantasma" bloco onClick={a3.fazer} disabled={a3.desligado || ocupado}>
                      {a3.rotulo}
                    </Botao>
                  )}
                </div>
              )}
            </>
          )
        }
      >
        <section className="dc-painel">
          <div className="dc-painel__corpo">{processo}</div>
        </section>
        {feito}
        {lida}
        <section className="flex flex-col gap-2">{teor}</section>
        {ia}
        {acoes[3] && (
          <button type="button" className="dc-link self-center" onClick={acoes[3].fazer} disabled={ocupado}>
            {acoes[3].rotulo}
          </button>
        )}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <section className="dc-painel">
      <div className="dc-painel__secao">{processo}</div>
      <div className="dc-painel__secao">{teor}</div>
      {ia}
      {(feito || lida) && <div className="dc-painel__secao">{feito || lida}</div>}
      {acoes.length > 0 && (
        <div className="dc-painel__acoes">
          {acoes.map((a, i) => (
            <Botao key={a.rotulo} variante={i === 0 ? "primaria" : i === 1 ? "secundaria" : "fantasma"} onClick={a.fazer} ocupado={a.ocupado} disabled={a.desligado || ocupado}>
              {i < 2 && a.icone} {a.rotulo}
            </Botao>
          ))}
        </div>
      )}
      {dialogos}
    </section>
  );
}

function Par({ rotulo, valor, nota, className }: { rotulo: string; valor: ReactNode; nota?: ReactNode; className?: string }) {
  return (
    <div className={cn("dc-par", className)}>
      <span className="dc-rotulo">{rotulo}</span>
      <span className="dc-valor">{valor}</span>
      {nota && <span className="dc-nota">{nota}</span>}
    </div>
  );
}

function ConteudoDaSugestao({ c, responsavel }: { c: Sugestao; responsavel: Pessoa | null }) {
  if (c.audiencia) {
    const a = c.audiencia;
    return (
      <div className="dc-sugestao">
        <Par rotulo="Tipo" valor={a.tipo} />
        <Par rotulo="Data" valor={<span className="dc-num">{diaCompleto(a.data)}</span>} nota={diaDaSemana(a.data)} />
        <Par rotulo="Hora" valor={<span className="dc-num">{a.hora}</span>} nota={a.porVideo ? "Por vídeo" : "Presencial"} />
        {c.resumo && (
          <div className="dc-par dc-inteira" style={{ gridColumn: "1 / -1" }}>
            <span className="dc-rotulo">O que diz</span>
            <p>{c.resumo}</p>
          </div>
        )}
      </div>
    );
  }
  if (!c.geraPrazo || !c.dias) {
    return (
      <div className="dc-sugestao">
        <div className="dc-par" style={{ gridColumn: "1 / -1" }}>
          <span className="dc-rotulo">Não abre prazo para o escritório</span>
          <p>{c.resumo}</p>
        </div>
      </div>
    );
  }
  const conta = c.contagemCalculada;
  return (
    <div className="dc-sugestao">
      <Par rotulo="Tipo" valor={c.tipo} className="dc-inteira" />
      <Par rotulo="Prazo" valor={prazoEmDias(c.dias, c.contagem)} nota={c.fundamento} />
      <Par rotulo="Data final" valor={conta ? <span className="dc-num">{diaCompleto(conta.fim)}</span> : "—"} nota={conta ? diaDaSemana(conta.fim) : "Vincule a um processo para contar"} />
      <div className="dc-par dc-largo">
        <span className="dc-rotulo">Contagem</span>
        <p>{conta?.explicacao ?? "Falta saber o tribunal e a comarca do processo."}</p>
      </div>
      <div className="dc-par">
        <span className="dc-rotulo">Responsável</span>
        <span className="dc-valor">
          <Responsavel pessoa={responsavel ?? null} />
        </span>
      </div>
    </div>
  );
}

/** Ajustar antes de confirmar (ou criar o prazo quando a IA disse que não tem). */
function ConfirmarComAjuste({ pub, sugestao, aberto, aoFechar, aoConfirmar }: { pub: Publicacao; sugestao: Sugestao | null; aberto: boolean; aoFechar: () => void; aoConfirmar: (fim: string) => void }) {
  const eu = useQuery(euQuery);
  const inicial = () => ({
    tipo: sugestao?.geraPrazo ? sugestao.tipo : "",
    fundamento: sugestao?.fundamento ?? "",
    dias: String(sugestao?.dias ?? 15),
    contagem: (sugestao?.contagem ?? "uteis") as Contagem,
    responsavelId: pub.sugestao?.responsavel?.id ?? pub.processo?.responsavel?.id ?? "",
    sabeData: false,
    fimManual: sugestao?.contagemCalculada?.fim ?? pub.publicadaEm,
  });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const dias = Number(f.dias);
  const conta = useQuery({
    queryKey: ["calcular", pub.processo?.id, pub.publicadaEm, dias, f.contagem],
    queryFn: () => api<ContagemNaTela>("/prazos/calcular", { json: { processoId: pub.processo?.id ?? null, publicadoEm: pub.publicadaEm, dias, contagem: f.contagem } }),
    enabled: aberto && dias >= 1,
  });
  const salvar = useMutation({
    mutationFn: () =>
      api<{ prazoId: string; fim: string }>(`/publicacoes/${pub.id}/confirmar`, {
        json: { tipo: f.tipo, fundamento: f.fundamento || null, dias, contagem: f.contagem, responsavelId: f.responsavelId || null, fimManual: f.sabeData ? f.fimManual : null },
      }),
    onSuccess: (r) => {
      aoFechar();
      aoConfirmar(r.fim);
    },
  });
  const fim = f.sabeData ? f.fimManual : conta.data?.fim;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo={sugestao?.geraPrazo ? "Ajustar e confirmar" : "Criar prazo desta publicação"}
      descricao={`Publicada em ${diaCompleto(pub.publicadaEm)}. O Decreta conta a partir do primeiro dia útil seguinte.`}
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.tipo.trim().length < 2 || !(dias >= 1) || (!f.sabeData && !conta.data)}>
            Confirmar prazo
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="O que fazer" htmlFor="cf-tipo">
          <input id="cf-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="Manifestação sobre laudo pericial" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dias" htmlFor="cf-dias">
            <input id="cf-dias" inputMode="numeric" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </Campo>
          <Campo rotulo="Contagem" htmlFor="cf-contagem">
            <select id="cf-contagem" value={f.contagem} onChange={(e) => setF({ ...f, contagem: e.target.value as Contagem })}>
              <option value="uteis">Dias úteis</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </Campo>
          <Campo rotulo="Base legal" htmlFor="cf-fund">
            <input id="cf-fund" value={f.fundamento} onChange={(e) => setF({ ...f, fundamento: e.target.value })} placeholder="art. 477, § 1º, CPC" />
          </Campo>
          <Campo rotulo="Responsável" htmlFor="cf-resp">
            <select id="cf-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
              <option value="">Sem responsável</option>
              {eu.data?.equipe.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
        </div>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.sabeData} onChange={(e) => setF({ ...f, sabeData: e.target.checked })} />
          Sei a data final (suspensão que o Decreta não conhece)
        </label>
        {f.sabeData && (
          <Campo rotulo="Data final" htmlFor="cf-fim">
            <input id="cf-fim" type="date" value={f.fimManual} onChange={(e) => setF({ ...f, fimManual: e.target.value })} />
          </Campo>
        )}
        {fim && (
          <Faixa tipo="ia">
            <span>
              Vence em <strong className="dc-num">{diaCompleto(fim)}</strong>, {diaDaSemana(fim)}.{!f.sabeData && conta.data ? ` ${conta.data.explicacao}` : ""}
            </span>
          </Faixa>
        )}
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function AjustarAudiencia({ pub, audiencia, aberto, aoFechar, aoMarcar }: { pub: Publicacao; audiencia: NonNullable<Sugestao["audiencia"]>; aberto: boolean; aoFechar: () => void; aoMarcar: () => void }) {
  const eu = useQuery(euQuery);
  const inicial = () => ({ dia: audiencia.data, hora: audiencia.hora, tipo: audiencia.tipo, porVideo: audiencia.porVideo, local: "", responsavelId: pub.processo?.responsavel?.id ?? "" });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const salvar = useMutation({
    mutationFn: () => api(`/publicacoes/${pub.id}/audiencia`, { json: { ...f, local: f.local || null, responsavelId: f.responsavelId || null } }),
    onSuccess: () => {
      aoFechar();
      aoMarcar();
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
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!f.dia || !/^\d{2}:\d{2}$/.test(f.hora) || f.tipo.trim().length < 2}>
            Pôr na agenda
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Tipo" htmlFor="au-tipo">
          <input id="au-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dia" htmlFor="au-dia">
            <input id="au-dia" type="date" value={f.dia} onChange={(e) => setF({ ...f, dia: e.target.value })} />
          </Campo>
          <Campo rotulo="Hora" htmlFor="au-hora">
            <input id="au-hora" type="time" value={f.hora} onChange={(e) => setF({ ...f, hora: e.target.value })} />
          </Campo>
        </div>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.porVideo} onChange={(e) => setF({ ...f, porVideo: e.target.checked })} />
          Por vídeo
        </label>
        <Campo rotulo={f.porVideo ? "Link da sala" : "Local"} htmlFor="au-local">
          <input id="au-local" value={f.local} onChange={(e) => setF({ ...f, local: e.target.value })} />
        </Campo>
        <Campo rotulo="Responsável" htmlFor="au-resp">
          <select id="au-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
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

/** Publicação que chegou por outro caminho (e-mail, sistema do tribunal). */
function ColarPublicacao({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const navigate = useNavigate();
  const celular = useCelular();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState<{ id: string; titulo: string } | null>(null);
  const [f, setF] = useState({ cnj: "", disponibilizadaEm: "", tipoComunicacao: "Intimação", texto: "" });
  const criar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/publicacoes", {
        json: { processoId: proc?.id ?? null, cnj: proc ? null : f.cnj || null, disponibilizadaEm: f.disponibilizadaEm || eu.data?.hoje, tipoComunicacao: f.tipoComunicacao, texto: f.texto },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
      avisar("Publicação guardada. A IA está lendo.");
      setProc(null);
      setF({ cnj: "", disponibilizadaEm: "", tipoComunicacao: "Intimação", texto: "" });
      aoFechar();
      void (celular ? navigate({ to: "/publicacoes/$id", params: { id: r.id } }) : navigate({ to: "/publicacoes", search: { id: r.id } }));
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Colar publicação"
      descricao="Para a intimação que chegou por e-mail ou pelo sistema do tribunal e não veio do DJEN."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={f.texto.trim().length < 20}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Processo">
          <EscolherProcesso valor={proc} aoEscolher={setProc} />
        </Campo>
        {!proc && (
          <Campo rotulo="Ou o número CNJ" htmlFor="cp-cnj">
            <input id="cp-cnj" inputMode="numeric" value={f.cnj} onChange={(e) => setF({ ...f, cnj: e.target.value })} placeholder="0000000-00.0000.0.00.0000" />
          </Campo>
        )}
        <div className="dc-grade-2">
          <Campo rotulo="Disponibilizada em" htmlFor="cp-dia">
            <input id="cp-dia" type="date" value={f.disponibilizadaEm || eu.data?.hoje || ""} onChange={(e) => setF({ ...f, disponibilizadaEm: e.target.value })} />
          </Campo>
          <Campo rotulo="Tipo" htmlFor="cp-tipo">
            <select id="cp-tipo" value={f.tipoComunicacao} onChange={(e) => setF({ ...f, tipoComunicacao: e.target.value })}>
              {["Intimação", "Citação", "Notificação", "Edital", "Despacho", "Sentença", "Acórdão"].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Campo>
        </div>
        <Campo rotulo="Teor" htmlFor="cp-texto">
          <textarea id="cp-texto" rows={7} value={f.texto} onChange={(e) => setF({ ...f, texto: e.target.value })} placeholder="Cole aqui o texto inteiro da publicação" />
        </Campo>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
