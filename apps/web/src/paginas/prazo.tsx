/** Prazo e briefing: o que o juízo decidiu, o que fazer, a contagem e o histórico. */
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Check, ExternalLink, FileText, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { FalhaAoCarregar } from "@/componentes/nao-encontrada";
import { Avatar, BlocoIa, Botao, Campo, Carregando, Cnj, Dados, Faixa, LinhaDoTempo, ListaIa, Painel, Responsavel, SecaoIa, Selo, TopoDoDetalhe, Trilha } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { POLO_DO_CLIENTE, diaCompleto, diaCurto, diaDaSemana, diaDoInstante, diaMes, hora, juntar, ondeTramita, prazoEmDias } from "@/lib/formato";
import type { Briefing, Contagem, ContagemNaTela, Prazo } from "@/lib/tipos";

/** Tudo que mostra prazo muda junto: a lista, o Hoje, os números do menu e a caixa de publicações. */
export function atualizarPrazos(qc: QueryClient) {
  for (const k of ["prazo", "prazos", "hoje", "eu", "publicacoes", "publicacao", "processo", "agenda"]) void qc.invalidateQueries({ queryKey: [k] });
}

const foraDaConta = (p: Pick<Prazo, "contagem" | "desconsiderados">) => {
  const dias = p.desconsiderados.map((d) => diaCurto(d.dia));
  if (p.contagem === "uteis") return dias.length ? `Fins de semana, ${juntar(dias)}` : "Fins de semana";
  return dias.length ? juntar(dias) : "Nada";
};

const FONTE = { djen: "DJEN", datajud: "DataJud", manual: "Publicação digitada" } as const;

export function PrazoPage() {
  const { id } = useParams({ from: "/app/prazos/$id" });
  const celular = useCelular();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const q = useQuery({ queryKey: ["prazo", id], queryFn: () => api<Prazo>(`/prazos/${id}`) });
  const [dialogo, setDialogo] = useState<"ajustar" | "descartar" | null>(null);

  const acao = useMutation({
    mutationFn: (o: "confirmar" | "cumprir" | "reabrir") => api(`/prazos/${id}/${o}`, { method: "POST" }),
    onSuccess: (_r, o) => {
      atualizarPrazos(qc);
      avisar(o === "confirmar" ? "Prazo confirmado." : o === "cumprir" ? "Prazo cumprido." : "Prazo reaberto.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const refazer = useMutation({
    mutationFn: () => api(`/ia/briefing/${id}`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prazo", id] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  const p = q.data;
  if (!p) {
    const corpo = q.error ? <FalhaAoCarregar erro={q.error} sumiu="Prazo não encontrado" aoTentar={() => void q.refetch()} /> : <Carregando />;
    return celular ? (
      <TelaCelular titulo="Prazos" voltar>
        {corpo}
      </TelaCelular>
    ) : (
      <Pagina>{corpo}</Pagina>
    );
  }

  const aberto = p.situacao === "aberto";
  const peca = p.pecas[0];
  const irParaPeca = () => void navigate(peca ? { to: "/pecas", search: { id: peca.id } } : { to: "/pecas", search: { prazo: p.id } });
  const rotuloPeca = peca ? "Abrir a peça deste prazo" : "Gerar peça para este prazo";

  const selos = (
    <>
      {p.situacao === "cumprido" ? (
        <Selo urgencia="cumprido">
          <Check /> Cumprido
        </Selo>
      ) : p.situacao === "descartado" ? (
        <Selo urgencia="prazo">Descartado</Selo>
      ) : (
        <Selo urgencia={p.urgencia}>
          Vence {diaMes(p.fim)} · {prazoEmDias(p.dias, p.contagem)}
        </Selo>
      )}
      {p.confirmado ? (
        <span className="dc-selo dc-selo--ok">
          <Check /> Confirmado{p.confirmadoPor ? ` por ${p.confirmadoPor.apelido}` : ""}
        </span>
      ) : (
        aberto && <span className="dc-selo dc-selo--ia">Sugestão da IA · confira e confirme</span>
      )}
    </>
  );

  const onde = ondeTramita(p.processo);
  const b = p.briefing;
  const briefing = (b || eu.data?.ia) && (
    <BlocoIa
      titulo="Briefing do prazo"
      analise={b}
      aoRefazer={eu.data?.ia ? () => refazer.mutate() : undefined}
      refazendo={refazer.isPending}
      avisoDesatualizada="Chegou novidade nos autos depois deste briefing."
    >
      {b?.situacao === "pronto" ? <ConteudoDoBriefing c={b.conteudo} /> : <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">A IA ainda não leu este prazo. Gere o briefing para ver o que o juízo decidiu e o que fazer.</p>}
    </BlocoIa>
  );

  const dados = (
    <Dados
      linhas={[
        ["Tipo", p.tipo],
        ["Prazo", prazoEmDias(p.dias, p.contagem)],
        ["Base legal", p.fundamento ?? "—"],
        ["Publicação", diaCompleto(p.publicadoEm)],
        ["Início", diaCompleto(p.inicio)],
        [
          "Data final",
          <span key="fim">
            <strong className="dc-num">{diaCompleto(p.fim)}</strong> <span className="text-[var(--tinta-2)]">{diaDaSemana(p.fim)}</span>
          </span>,
        ],
        ["Fora da conta", <span title={p.desconsiderados.map((d) => `${diaCurto(d.dia)}: ${d.nome}`).join("\n") || undefined}>{foraDaConta(p)}</span>],
        ["Responsável", <Responsavel pessoa={p.responsavel} />],
        ["Origem", p.origem === "ia" ? `${p.publicacao ? FONTE[p.publicacao.fonte] : "Publicação"} · sugerido pela IA` : p.publicacao ? `${FONTE[p.publicacao.fonte]} · criado à mão` : "Criado à mão"],
        ...(p.observacoes ? ([["Observações", p.observacoes]] as [string, string][]) : []),
        ...(p.motivoDescarte ? ([["Motivo do descarte", p.motivoDescarte]] as [string, string][]) : []),
      ]}
    />
  );

  const hojeDia = eu.data?.hoje;
  const historico = p.historico.length > 0 && (
    <Painel titulo="Histórico">
      <LinhaDoTempo
        itens={p.historico.map((h, i) => {
          const dia = diaDoInstante(h.em);
          return { data: dia === hojeDia ? hora(h.em) : diaCurto(dia), titulo: h.titulo, detalhe: h.detalhe ?? undefined, novo: i === 0 };
        })}
      />
    </Painel>
  );

  const pecas = p.pecas.length > 0 && (
    <Painel titulo="Peças" corpo={false}>
      <div className="dc-linhas">
        {p.pecas.map((pc) => (
          <Link key={pc.id} className="dc-linhas__item" to="/pecas" search={{ id: pc.id }}>
            <FileText className="mt-0.5 size-4 flex-none text-[var(--tinta-3)]" />
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">{pc.titulo}</span>
              <span className="dc-celula__2">
                {pc.situacao === "revisada" ? "Revisada" : "Rascunho"} · {diaCurto(diaDoInstante(pc.atualizadaEm))} {hora(pc.atualizadaEm)}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </Painel>
  );

  const dialogos = (
    <>
      <Ajustar prazo={p} aberto={dialogo === "ajustar"} aoFechar={() => setDialogo(null)} />
      <Descartar prazoId={p.id} aberto={dialogo === "descartar"} aoFechar={() => setDialogo(null)} />
    </>
  );

  if (celular) {
    const rodape = !aberto ? (
      <Botao bloco onClick={() => acao.mutate("reabrir")} ocupado={acao.isPending}>
        <RotateCcw /> Reabrir prazo
      </Botao>
    ) : p.confirmado ? (
      <>
        <Botao variante="primaria" bloco onClick={irParaPeca}>
          <FileText /> {peca ? "Abrir a peça" : "Gerar peça para este prazo"}
        </Botao>
        <div className="dc-rodape__par">
          <Botao bloco onClick={() => acao.mutate("cumprir")} ocupado={acao.isPending && acao.variables === "cumprir"}>
            <Check /> Cumprir
          </Botao>
          <Botao variante="perigo" bloco onClick={() => setDialogo("descartar")}>
            Descartar
          </Botao>
        </div>
      </>
    ) : (
      <>
        <Botao variante="primaria" bloco onClick={() => acao.mutate("confirmar")} ocupado={acao.isPending && acao.variables === "confirmar"}>
          <Check /> Confirmar prazo
        </Botao>
        <div className="dc-rodape__par">
          <Botao bloco onClick={() => setDialogo("ajustar")}>
            Ajustar
          </Botao>
          <Botao variante="perigo" bloco onClick={() => setDialogo("descartar")}>
            Descartar
          </Botao>
        </div>
      </>
    );
    return (
      <TelaCelular titulo="Prazos" voltar rodape={rodape}>
        <div className="flex flex-col gap-3">
          <TopoDoDetalhe
            selos={selos}
            titulo={p.tipo}
            sobre={
              <>
                <Link to="/processos/$id" params={{ id: p.processo.id }} className="text-inherit no-underline">
                  <strong>{p.processo.titulo}</strong>
                </Link>
                {[onde, p.processo.cnj ?? "Extrajudicial"].filter(Boolean).join(" · ")}
              </>
            }
          />
          <span className="dc-pessoa text-[14px] text-[var(--tinta-2)]">
            <Avatar pessoa={p.responsavel} />
            {p.responsavel?.apelido ?? <span className="text-[var(--vencido)]">Sem responsável</span>} · {POLO_DO_CLIENTE[p.processo.poloCliente]}
          </span>
        </div>
        {briefing}
        <Painel titulo="Prazo" acao={aberto && p.confirmado ? <Botao variante="fantasma" pequeno onClick={() => setDialogo("ajustar")}>Ajustar</Botao> : undefined}>
          {dados}
        </Painel>
        {p.publicacao && <Teor publicacao={p.publicacao} />}
        {pecas}
        {historico}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina>
      <div className="dc-topo-pagina">
        <Trilha>
          <Link to="/prazos">Prazos</Link>
          <span>{p.tipo}</span>
        </Trilha>
        <TopoDoDetalhe
          selos={selos}
          titulo={p.tipo}
          sobre={
            <>
              <Link to="/processos/$id" params={{ id: p.processo.id }} className="text-inherit no-underline hover:underline">
                <strong>{p.processo.titulo}</strong>
              </Link>
              {" · "}
              <Cnj cnj={p.processo.cnj} />
              {onde && ` · ${onde}`}
            </>
          }
          acoes={
            !aberto ? (
              <Botao onClick={() => acao.mutate("reabrir")} ocupado={acao.isPending}>
                <RotateCcw /> Reabrir prazo
              </Botao>
            ) : p.confirmado ? (
              <>
                <Botao variante="perigo" onClick={() => setDialogo("descartar")}>
                  Descartar
                </Botao>
                <Botao onClick={() => acao.mutate("cumprir")} ocupado={acao.isPending && acao.variables === "cumprir"}>
                  <Check /> Cumprir
                </Botao>
                <Botao variante="primaria" onClick={irParaPeca}>
                  <FileText /> {rotuloPeca}
                </Botao>
              </>
            ) : (
              <>
                <Botao variante="perigo" onClick={() => setDialogo("descartar")}>
                  Descartar
                </Botao>
                <Botao onClick={() => setDialogo("ajustar")}>Ajustar</Botao>
                <Botao variante="primaria" onClick={() => acao.mutate("confirmar")} ocupado={acao.isPending && acao.variables === "confirmar"}>
                  <Check /> Confirmar prazo
                </Botao>
              </>
            )
          }
        />
      </div>
      <div className="dc-colunas">
        <div className="dc-pilha">
          {briefing}
          {p.publicacao && <Teor publicacao={p.publicacao} />}
        </div>
        <div className="dc-pilha">
          <Painel titulo="Prazo" acao={aberto && p.confirmado ? <Botao variante="fantasma" pequeno onClick={() => setDialogo("ajustar")}>Ajustar</Botao> : undefined}>
            {dados}
          </Painel>
          {pecas}
          {historico}
        </div>
      </div>
      {dialogos}
    </Pagina>
  );
}

function ConteudoDoBriefing({ c }: { c: Briefing }) {
  return (
    <>
      <SecaoIa titulo="O que o juízo decidiu">
        <p>{c.decidiu}</p>
      </SecaoIa>
      {c.fazer.length > 0 && (
        <SecaoIa titulo="O que fazer">
          <ListaIa itens={c.fazer} />
        </SecaoIa>
      )}
      {(c.aFavor.length > 0 || c.contra.length > 0) && (
        <div className="dc-ia__duas">
          <SecaoIa titulo="A nosso favor">{c.aFavor.length ? <ListaIa itens={c.aFavor} /> : <p>Nada de destaque.</p>}</SecaoIa>
          <SecaoIa titulo="Contra nós">{c.contra.length ? <ListaIa itens={c.contra} /> : <p>Nada de destaque.</p>}</SecaoIa>
        </div>
      )}
    </>
  );
}

function Teor({ publicacao }: { publicacao: NonNullable<Prazo["publicacao"]> }) {
  const longo = publicacao.texto.length > 1400;
  const [inteiro, setInteiro] = useState(false);
  const titulo = publicacao.tipoComunicacao?.toLocaleLowerCase("pt-BR").startsWith("intima") ? "Teor da intimação" : "Teor da publicação";
  return (
    <Painel titulo={titulo} acao={<span className="dc-nota">Publicada em {diaCompleto(publicacao.publicadaEm)}</span>}>
      <p className="m-0 whitespace-pre-wrap text-[14px] leading-[24px]">{longo && !inteiro ? `${publicacao.texto.slice(0, 1200).trimEnd()}…` : publicacao.texto}</p>
      <div className="dc-linha-acoes">
        {longo && (
          <button type="button" className="dc-link" onClick={() => setInteiro(!inteiro)}>
            {inteiro ? "Mostrar menos" : "Ler o teor inteiro"}
          </button>
        )}
        <Link to="/publicacoes/$id" params={{ id: publicacao.id }} className="dc-link">
          Ver a publicação
        </Link>
        {publicacao.link && (
          <a href={publicacao.link} target="_blank" rel="noreferrer" className="dc-link inline-flex items-center gap-1">
            Abrir no tribunal <ExternalLink className="size-3.5" />
          </a>
        )}
      </div>
    </Painel>
  );
}

function Ajustar({ prazo, aberto, aoFechar }: { prazo: Prazo; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const inicial = () => ({
    tipo: prazo.tipo,
    fundamento: prazo.fundamento ?? "",
    dias: String(prazo.dias),
    contagem: prazo.contagem,
    publicadoEm: prazo.publicadoEm,
    responsavelId: prazo.responsavel?.id ?? "",
    observacoes: prazo.observacoes ?? "",
    sabeData: false,
    fimManual: prazo.fim,
  });
  const [f, setF] = useState(inicial);
  const [visto, setVisto] = useState(aberto);
  // Abriu de novo: começa do que está salvo.
  if (aberto !== visto) {
    setVisto(aberto);
    if (aberto) setF(inicial());
  }
  const dias = Number(f.dias);
  const conta = useQuery({
    queryKey: ["calcular", prazo.processo.id, f.publicadoEm, dias, f.contagem],
    queryFn: () => api<ContagemNaTela>("/prazos/calcular", { json: { processoId: prazo.processo.id, publicadoEm: f.publicadoEm, dias, contagem: f.contagem } }),
    enabled: aberto && /^\d{4}-\d{2}-\d{2}$/.test(f.publicadoEm) && dias >= 1,
  });
  const salvar = useMutation({
    mutationFn: () =>
      api(`/prazos/${prazo.id}`, {
        method: "PUT",
        json: {
          tipo: f.tipo,
          fundamento: f.fundamento || null,
          dias,
          contagem: f.contagem,
          publicadoEm: f.publicadoEm,
          responsavelId: f.responsavelId || null,
          observacoes: f.observacoes || null,
          fimManual: f.sabeData ? f.fimManual : null,
        },
      }),
    onSuccess: () => {
      atualizarPrazos(qc);
      avisar(prazo.confirmado ? "Prazo ajustado." : "Prazo ajustado e confirmado.");
      aoFechar();
    },
  });
  const fim = f.sabeData ? f.fimManual : conta.data?.fim;
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Ajustar prazo"
      descricao="Mudou os dias, a contagem ou a data da publicação? O Decreta conta de novo."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={f.tipo.trim().length < 2 || !(dias >= 1) || (!f.sabeData && !conta.data)}>
            {prazo.confirmado ? "Salvar" : "Salvar e confirmar"}
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="O que fazer" htmlFor="aj-tipo">
          <input id="aj-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dias" htmlFor="aj-dias">
            <input id="aj-dias" inputMode="numeric" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </Campo>
          <Campo rotulo="Contagem" htmlFor="aj-contagem">
            <select id="aj-contagem" value={f.contagem} onChange={(e) => setF({ ...f, contagem: e.target.value as Contagem })}>
              <option value="uteis">Dias úteis</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </Campo>
          <Campo rotulo="Publicado em" htmlFor="aj-pub">
            <input id="aj-pub" type="date" value={f.publicadoEm} onChange={(e) => setF({ ...f, publicadoEm: e.target.value })} />
          </Campo>
          <Campo rotulo="Base legal" htmlFor="aj-fund">
            <input id="aj-fund" value={f.fundamento} onChange={(e) => setF({ ...f, fundamento: e.target.value })} placeholder="art. 477, § 1º, CPC" />
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="aj-resp">
          <select id="aj-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Sem responsável</option>
            {eu.data?.equipe.map((pp) => (
              <option key={pp.id} value={pp.id}>
                {pp.nome}
              </option>
            ))}
          </select>
        </Campo>
        <label className="dc-opcao">
          <input type="checkbox" className="dc-checa" checked={f.sabeData} onChange={(e) => setF({ ...f, sabeData: e.target.checked })} />
          Sei a data final (suspensão que o Decreta não conhece)
        </label>
        {f.sabeData && (
          <Campo rotulo="Data final" htmlFor="aj-fim" ajuda="Vale a data digitada. A conta do Decreta fica anotada nas observações.">
            <input id="aj-fim" type="date" value={f.fimManual} onChange={(e) => setF({ ...f, fimManual: e.target.value })} />
          </Campo>
        )}
        <Campo rotulo="Observações" htmlFor="aj-obs">
          <textarea id="aj-obs" rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </Campo>
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

function Descartar({ prazoId, aberto, aoFechar }: { prazoId: string; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [motivo, setMotivo] = useState("");
  const descartar = useMutation({
    mutationFn: () => api(`/prazos/${prazoId}/descartar`, { json: { motivo: motivo.trim() || null } }),
    onSuccess: () => {
      atualizarPrazos(qc);
      avisar("Prazo descartado.");
      setMotivo("");
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Descartar prazo"
      descricao="O prazo sai da lista e do Hoje. Dá para reabrir depois."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="perigo" onClick={() => descartar.mutate()} ocupado={descartar.isPending}>
            Descartar
          </Botao>
        </>
      }
    >
      <Campo rotulo="Por quê? (opcional)" htmlFor="ds-motivo">
        <textarea id="ds-motivo" rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="A intimação era para a outra parte" />
      </Campo>
      {descartar.error && <Faixa tipo="erro">{mensagemDoErro(descartar.error)}</Faixa>}
    </Dialogo>
  );
}
