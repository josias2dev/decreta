/** Alvarás: do expedido ao repassado para o cliente, com quanto falta receber. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { Fragment, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { ColunaDoQuadro, Quadro, Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, Campo, Carregando, Chip, Faixa, Vazio } from "@/componentes/ui";
import { SeletorDeVariante, useVariante } from "@/componentes/variantes";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diasDesde, dinheiro, haQuanto, numero, paraValor, valorNoCampo } from "@/lib/formato";
import { cn } from "@/lib/util";
import type { Alvara, EtapaAlvara, QuadroDeAlvaras } from "@/lib/tipos";

const ETAPA: Record<EtapaAlvara, string> = { novo: "Expedido", aguardando_saque: "Aguardando saque", sacado: "Sacado", repassado: "Repassado ao cliente", finalizado: "Finalizado" };
const ORDEM: EtapaAlvara[] = ["novo", "aguardando_saque", "sacado", "repassado", "finalizado"];
const proxima = (e: EtapaAlvara) => ORDEM[ORDEM.indexOf(e) + 1];

/** A data que levou o alvará à etapa e o rótulo dela. */
const CHEGOU: Record<EtapaAlvara, { rotulo: string; dia: (a: Alvara) => string | null }> = {
  novo: { rotulo: "Expedido", dia: (a) => a.expedidoEm },
  aguardando_saque: { rotulo: "Expedido", dia: (a) => a.expedidoEm },
  sacado: { rotulo: "Sacado", dia: (a) => a.sacadoEm },
  repassado: { rotulo: "Repassado", dia: (a) => a.repassadoEm },
  finalizado: { rotulo: "Repassado", dia: (a) => a.repassadoEm },
};
/** Dias na etapa até chamar atenção: dinheiro sacado é do cliente e sai logo. */
const PARADO: Partial<Record<EtapaAlvara, number>> = { novo: 15, aguardando_saque: 15, sacado: 5 };

const alvaras = (n: number) => `${numero(n)} ${n === 1 ? "alvará" : "alvarás"}`;
/** O que leva à etapa seguinte, no botão. */
const AVANCAR: Partial<Record<EtapaAlvara, string>> = { novo: "Aguardar saque", aguardando_saque: "Marcar sacado", sacado: "Marcar repassado", repassado: "Finalizar" };
const semMoeda = (v: string | number) => dinheiro(v).replace(/^R\$\s?/, "");

type Item = Alvara & { etapa: EtapaAlvara };
type Totais = { valor: number; n: number };

/** Há quanto tempo o alvará está na etapa e se passou do normal. */
function naEtapa(a: Item) {
  const chegou = CHEGOU[a.etapa];
  const dia = chegou.dia(a);
  const limite = PARADO[a.etapa];
  const parado = !!dia && limite != null && diasDesde(dia) > limite;
  return { dia, parado, titulo: dia ? `${chegou.rotulo} em ${diaCompleto(dia)}${parado ? `, há mais de ${limite} dias nesta etapa` : ""}` : undefined };
}

function Quando({ a }: { a: Item }) {
  const { dia, parado, titulo } = naEtapa(a);
  if (!dia) return null;
  return (
    <span className={cn("dc-quando", parado && "is-parado")} title={titulo}>
      {haQuanto(dia)}
    </span>
  );
}

const VARIANTES = [
  { id: "quadro", rotulo: "Atual" },
  { id: "lista", rotulo: "Lista" },
  { id: "etapas", rotulo: "Etapas" },
  { id: "cartoes", rotulo: "Cartões" },
  { id: "colunas", rotulo: "Colunas" },
] as const;
type Variante = (typeof VARIANTES)[number]["id"];

export function AlvarasPage() {
  const celular = useCelular();
  const q = useQuery({ queryKey: ["alvaras"], queryFn: () => api<QuadroDeAlvaras>("/alvaras") });
  const [etapa, setEtapa] = useState<EtapaAlvara>("aguardando_saque");
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [variante, setVariante] = useVariante<Variante>("alvaras", VARIANTES);
  const d = q.data;
  const todos = d?.etapas.flatMap((e) => e.itens.map((i) => ({ ...i, etapa: e.etapa }))) ?? [];
  const selecionado = todos.find((i) => i.id === aberto) ?? null;
  const daEtapa = (e: EtapaAlvara) => d?.etapas.find((x) => x.etapa === e);
  const soma = (...es: EtapaAlvara[]): Totais => es.reduce((t, e) => ({ valor: t.valor + Number(daEtapa(e)?.total ?? 0), n: t.n + (daEtapa(e)?.itens.length ?? 0) }), { valor: 0, n: 0 });
  const sub = d ? `${alvaras(soma("novo", "aguardando_saque", "sacado").n)} em andamento` : " ";

  /** Quem, o quê e quanto, sempre nas mesmas três linhas; embaixo à direita, há quanto tempo está na etapa. */
  const cartao = (a: Alvara & { etapa: EtapaAlvara }) => {
    const chegou = CHEGOU[a.etapa];
    const dia = chegou.dia(a);
    const limite = PARADO[a.etapa];
    const parado = !!dia && limite != null && diasDesde(dia) > limite;
    return (
      <button key={a.id} type="button" className={cn("dc-cartao dc-alvara", parado && "is-parado")} onClick={() => setAberto(a.id)}>
        <span className="dc-alvara__cliente">{a.cliente ?? a.processo.titulo}</span>
        <span className="dc-alvara__desc">{a.descricao}</span>
        <span className="dc-alvara__pe">
          <span className="dc-alvara__valor">{dinheiro(a.valor)}</span>
          {dia && (
            <span className="dc-alvara__quando" title={`${chegou.rotulo} em ${diaCompleto(dia)}${parado ? `, há mais de ${limite} dias nesta etapa` : ""}`}>
              {haQuanto(dia)}
            </span>
          )}
        </span>
      </button>
    );
  };
  const dialogos = (
    <>
      <NovoAlvara aberto={novo} aoFechar={() => setNovo(false)} />
      {selecionado && <VerAlvara a={selecionado} aoFechar={() => setAberto(null)} />}
    </>
  );

  if (celular) {
    const lista = daEtapa(etapa);
    return (
      <TelaCelular
        titulo="Alvarás"
        sobre={d ? `${dinheiro(d.totais.pendente)} a receber` : " "}
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo alvará" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
        fixo={
          <div className="dc-chips">
            {ORDEM.map((e) => (
              <Chip key={e} ligado={etapa === e} n={daEtapa(e)?.itens.length} onClick={() => setEtapa(e)}>
                {ETAPA[e]}
              </Chip>
            ))}
          </div>
        }
      >
        {!d ? (
          <Carregando />
        ) : lista?.itens.length ? (
          <div className="dc-lista">
            <span className="dc-nota">Total da etapa: {dinheiro(lista.total)}</span>
            {lista.itens.map((i) => cartao({ ...i, etapa }))}
          </div>
        ) : (
          <Vazio titulo="Nada nesta etapa" />
        )}
        {dialogos}
      </TelaCelular>
    );
  }
  return (
    <Pagina larga cheia>
      <Cabecalho
        titulo="Alvarás"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo alvará
          </Botao>
        }
      />
      {!d ? (
        <Carregando />
      ) : (
        <>
          {variante !== "etapas" && <Totais a={soma("novo", "aguardando_saque")} b={soma("sacado")} c={soma("repassado", "finalizado")} />}
          {variante === "quadro" && (
            <Quadro id="alvaras" className="dc-quadro--alvaras">
              {d.etapas.map((e) => (
                <ColunaDoQuadro key={e.etapa} id={`alvaras-${e.etapa}`} titulo={ETAPA[e.etapa]} valor={e.itens.length} sub={dinheiro(e.total)}>
                  {e.itens.length ? e.itens.map((i) => cartao({ ...i, etapa: e.etapa })) : <div className="dc-quadro__vazio">Nada aqui</div>}
                </ColunaDoQuadro>
              ))}
            </Quadro>
          )}
          {variante === "lista" && <Lista d={d} abrir={setAberto} />}
          {variante === "etapas" && <Etapas d={d} abrir={setAberto} />}
          {variante === "cartoes" && <Cartoes d={d} abrir={setAberto} />}
          {variante === "colunas" && <Colunas d={d} abrir={setAberto} />}
        </>
      )}
      <SeletorDeVariante opcoes={[...VARIANTES]} valor={variante} aoMudar={setVariante} />
      {dialogos}
    </Pagina>
  );
}

function Totais({ a, b, c }: { a: Totais; b: Totais; c: Totais }) {
  return (
    <div className="dc-numeros dc-numeros--alvaras" aria-label="Totais dos alvarás">
      {[
        { rotulo: "A sacar", ...a },
        { rotulo: "A repassar", ...b },
        { rotulo: "Já repassado", ...c },
      ].map((t) => (
        <div key={t.rotulo} className="dc-contador">
          <span className="dc-contador__n">{dinheiro(t.valor)}</span>
          <span className="dc-contador__rotulo">{t.rotulo}</span>
          <span className="dc-contador__nota">{alvaras(t.n)}</span>
        </div>
      ))}
    </div>
  );
}

type Vista = { d: QuadroDeAlvaras; abrir: (id: string) => void };

/** B · Lista: uma tabela com as etapas como grupos; os finalizados ficam recolhidos. */
function Lista({ d, abrir }: Vista) {
  const [finalizados, setFinalizados] = useState(false);
  return (
    <section className="dc-painel">
      <Rolagem id="alvaras-lista" className="dc-tabela-caixa">
        <table className="dc-tabela dc-tabela--fixa dc-alvaras-lista">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Alvará</th>
              <th style={{ width: 132 }}>Na etapa</th>
              <th style={{ width: 160 }} className="dc-direita">
                Valor
              </th>
            </tr>
          </thead>
          <tbody>
            {d.etapas.map((e) => {
              const recolhido = e.etapa === "finalizado" && !finalizados;
              return (
                <Fragment key={e.etapa}>
                  <tr className="dc-alvaras-lista__grupo">
                    <td colSpan={3}>
                      {ETAPA[e.etapa]} <span className="dc-alvaras-lista__n">{e.itens.length}</span>
                      {e.etapa === "finalizado" && (
                        <button type="button" className="dc-alvaras-lista__ver" onClick={() => setFinalizados(!finalizados)}>
                          {recolhido ? "Mostrar" : "Esconder"}
                        </button>
                      )}
                    </td>
                    <td className="dc-direita">{dinheiro(e.total)}</td>
                  </tr>
                  {!recolhido &&
                    e.itens.map((i) => {
                      const a = { ...i, etapa: e.etapa };
                      return (
                        <tr key={a.id} data-link="" onClick={() => abrir(a.id)}>
                          <td>
                            <span className="dc-celula">
                              <span className="dc-celula__1 truncate">{a.cliente ?? a.processo.titulo}</span>
                              <span className="dc-celula__2 dc-num truncate">{a.processo.cnj ?? a.processo.titulo}</span>
                            </span>
                          </td>
                          <td className="truncate text-[var(--tinta-2)]">{a.descricao}</td>
                          <td>
                            <Quando a={a} />
                          </td>
                          <td className="dc-direita dc-alvaras-lista__valor">{dinheiro(a.valor)}</td>
                        </tr>
                      );
                    })}
                  {!recolhido && !e.itens.length && (
                    <tr>
                      <td colSpan={4} className="text-[var(--tinta-3)]">
                        Nada nesta etapa
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </Rolagem>
    </section>
  );
}

function useAvancar() {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  return useMutation({
    mutationFn: (a: Item) => {
      const seguinte = proxima(a.etapa)!;
      const hoje = eu.data?.hoje;
      return api(`/alvaras/${a.id}`, {
        method: "PUT",
        json: { etapa: seguinte, ...(seguinte === "sacado" && !a.sacadoEm ? { sacadoEm: hoje } : {}), ...(seguinte === "repassado" && !a.repassadoEm ? { repassadoEm: hoje } : {}) },
      });
    },
    onSuccess: (_r, a) => {
      void qc.invalidateQueries({ queryKey: ["alvaras"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar(`Agora em ${ETAPA[proxima(a.etapa)!].toLocaleLowerCase("pt-BR")}.`);
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
}

/** C · Etapas: o caminho do alvará em cima, cada etapa com o total; embaixo, os da etapa escolhida com as datas e o próximo passo. */
function Etapas({ d, abrir }: Vista) {
  const [escolhida, setEscolhida] = useState<EtapaAlvara>(() => d.etapas.find((e) => e.itens.length)?.etapa ?? "novo");
  const avancar = useAvancar();
  const etapa = d.etapas.find((e) => e.etapa === escolhida) ?? d.etapas[0]!;
  return (
    <>
      <div className="dc-fluxo" role="tablist" aria-label="Etapas do alvará">
        {d.etapas.map((e, n) => {
          const parados = e.itens.filter((i) => naEtapa({ ...i, etapa: e.etapa }).parado).length;
          return (
            <Fragment key={e.etapa}>
              {n > 0 && <ChevronRight className="dc-fluxo__seta" aria-hidden />}
              <button type="button" role="tab" aria-selected={e.etapa === escolhida} className={cn("dc-fluxo__etapa", e.etapa === escolhida && "is-on")} onClick={() => setEscolhida(e.etapa)}>
                <span className="dc-fluxo__nome">{ETAPA[e.etapa]}</span>
                <span className="dc-fluxo__total">{dinheiro(e.total)}</span>
                <span className="dc-fluxo__n">
                  {alvaras(e.itens.length)}
                  {parados > 0 && <span className="dc-quando is-parado">{parados === 1 ? "1 parado" : `${parados} parados`}</span>}
                </span>
              </button>
            </Fragment>
          );
        })}
      </div>
      <section className="dc-painel">
        <Rolagem id={`alvaras-etapa-${etapa.etapa}`} topo={etapa.etapa} className="dc-linhas">
          {etapa.itens.length ? (
            etapa.itens.map((i) => {
              const a = { ...i, etapa: etapa.etapa };
              const acao = AVANCAR[a.etapa];
              return (
                <div key={a.id} className="dc-etapa-linha" role="button" tabIndex={0} onClick={() => abrir(a.id)} onKeyDown={(ev) => ev.key === "Enter" && abrir(a.id)}>
                  <span className="dc-celula min-w-0">
                    <span className="dc-celula__1 truncate">{a.cliente ?? a.processo.titulo}</span>
                    <span className="dc-celula__2 truncate">
                      {a.descricao} · <span className="dc-num">{a.processo.cnj ?? a.processo.titulo}</span>
                    </span>
                  </span>
                  <Datas a={a} className="dc-datas" />
                  <Quando a={a} />
                  <span className="dc-etapa-linha__valor">{dinheiro(a.valor)}</span>
                  <span className="dc-etapa-linha__acao">
                    {acao && (
                      <Botao
                        pequeno
                        onClick={(ev) => {
                          ev.stopPropagation();
                          avancar.mutate(a);
                        }}
                        ocupado={avancar.isPending && avancar.variables?.id === a.id}
                      >
                        {acao}
                      </Botao>
                    )}
                  </span>
                </div>
              );
            })
          ) : (
            <Vazio titulo="Nada nesta etapa" />
          )}
        </Rolagem>
      </section>
    </>
  );
}

/** As três datas do alvará, com traço no que ainda não aconteceu. */
function Datas({ a, className }: { a: Item; className: string }) {
  return (
    <span className={className}>
      {(
        [
          ["Expedido", a.expedidoEm],
          ["Sacado", a.sacadoEm],
          ["Repassado", a.repassadoEm],
        ] as const
      ).map(([rotulo, dia]) => (
        <span key={rotulo} className={cn("dc-datas__item", dia && "is-feito")}>
          <small>{rotulo}</small>
          <span className="dc-num">{dia ? diaCurto(dia) : "—"}</span>
        </span>
      ))}
    </span>
  );
}

/** D · Cartões largos: só as quatro etapas em andamento, com espaço para o valor em cima e as datas embaixo. */
function Cartoes({ d, abrir }: Vista) {
  return (
    <Quadro id="alvaras-cartoes" className="dc-quadro--cartoes">
      {d.etapas
        .filter((e) => e.etapa !== "finalizado")
        .map((e) => (
          <ColunaDoQuadro key={e.etapa} id={`alvaras-cartoes-${e.etapa}`} titulo={ETAPA[e.etapa]} valor={e.itens.length} sub={dinheiro(e.total)}>
            {e.itens.length ? (
              e.itens.map((i) => {
                const a = { ...i, etapa: e.etapa };
                return (
                  <button key={a.id} type="button" className="dc-cartao dc-alvara-d" onClick={() => abrir(a.id)}>
                    <span className="dc-alvara-d__topo">
                      <span className="dc-alvara-d__valor">{dinheiro(a.valor)}</span>
                      <Quando a={a} />
                    </span>
                    <span className="dc-alvara-d__cliente">{a.cliente ?? a.processo.titulo}</span>
                    <span className="dc-alvara-d__desc">{a.descricao}</span>
                    <Datas a={a} className="dc-datas dc-alvara-d__datas" />
                  </button>
                );
              })
            ) : (
              <div className="dc-quadro__vazio">Nada aqui</div>
            )}
          </ColunaDoQuadro>
        ))}
    </Quadro>
  );
}

/** E · Colunas: cada etapa é uma folha branca com o total em destaque e os alvarás em linhas, como um livro-caixa (quem, e embaixo quanto e há quanto tempo). */
function Colunas({ d, abrir }: Vista) {
  return (
    <Quadro id="alvaras-colunas" className="dc-quadro--alvaras dc-quadro--colunas">
      {d.etapas.map((e) => (
        <ColunaDoQuadro key={e.etapa} id={`alvaras-colunas-${e.etapa}`} titulo={ETAPA[e.etapa]} valor={e.itens.length} sub={dinheiro(e.total)}>
          {e.itens.length ? (
            e.itens.map((i) => {
              const a = { ...i, etapa: e.etapa };
              return (
                <button key={a.id} type="button" className="dc-razao" onClick={() => abrir(a.id)}>
                  <span className="dc-razao__cliente" title={a.descricao}>
                    {a.cliente ?? a.processo.titulo}
                  </span>
                  <span className="dc-razao__valor">{semMoeda(a.valor)}</span>
                  <Quando a={a} />
                </button>
              );
            })
          ) : (
            <div className="dc-razao__vazio">Nada aqui</div>
          )}
        </ColunaDoQuadro>
      ))}
    </Quadro>
  );
}

function NovoAlvara({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState<{ id: string; titulo: string } | null>(null);
  const vazio = { descricao: "", valor: "", expedidoEm: "" };
  const [f, setF] = useState(vazio);
  const valor = paraValor(f.valor);
  const criar = useMutation({
    mutationFn: () => api("/alvaras", { json: { processoId: proc!.id, descricao: f.descricao, valor, expedidoEm: f.expedidoEm || eu.data?.hoje } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["alvaras"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Alvará guardado.");
      setF(vazio);
      setProc(null);
      aoFechar();
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo alvará"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!proc || f.descricao.trim().length < 2 || !valor}>
            Guardar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Processo">
          <EscolherProcesso valor={proc} aoEscolher={setProc} />
        </Campo>
        <Campo rotulo="Descrição" htmlFor="nal-desc">
          <input id="nal-desc" value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} placeholder="Alvará da condenação" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Valor" htmlFor="nal-valor" erro={f.valor && !valor ? "Valor em reais, como 12.345,67" : null}>
            <input id="nal-valor" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="12.345,67" />
          </Campo>
          <Campo rotulo="Expedido em" htmlFor="nal-exp">
            <input id="nal-exp" type="date" value={f.expedidoEm || eu.data?.hoje || ""} onChange={(e) => setF({ ...f, expedidoEm: e.target.value })} />
          </Campo>
        </div>
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}

function VerAlvara({ a, aoFechar }: { a: Alvara & { etapa: EtapaAlvara }; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [f, setF] = useState({ valor: valorNoCampo(a.valor), valorRecebido: valorNoCampo(a.valorRecebido), sacadoEm: a.sacadoEm ?? "", repassadoEm: a.repassadoEm ?? "", observacoes: a.observacoes ?? "" });
  const salvar = useMutation({
    mutationFn: (corpo: Record<string, unknown>) => api(`/alvaras/${a.id}`, { method: "PUT", json: corpo }),
    onSuccess: (_r, corpo) => {
      void qc.invalidateQueries({ queryKey: ["alvaras"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      void qc.invalidateQueries({ queryKey: ["processo"] });
      avisar(corpo.etapa ? `Agora em ${ETAPA[corpo.etapa as EtapaAlvara].toLocaleLowerCase("pt-BR")}.` : "Alvará atualizado.");
      aoFechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const seguinte = proxima(a.etapa);
  const hoje = eu.data?.hoje;
  const avancar = () =>
    salvar.mutate({
      etapa: seguinte,
      ...(seguinte === "sacado" && !a.sacadoEm ? { sacadoEm: hoje } : {}),
      ...(seguinte === "repassado" && !a.repassadoEm ? { repassadoEm: hoje } : {}),
    });
  const guardar = () => {
    const valor = paraValor(f.valor);
    const recebido = f.valorRecebido.trim() ? paraValor(f.valorRecebido) : null;
    if (!valor || (f.valorRecebido.trim() && !recebido)) return avisar("Confira os valores, em reais.", { erro: true });
    salvar.mutate({ valor, valorRecebido: recebido, sacadoEm: f.sacadoEm || null, repassadoEm: f.repassadoEm || null, observacoes: f.observacoes || null });
  };
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo={a.descricao}
      descricao={
        <>
          {ETAPA[a.etapa]} ·{" "}
          <Link to="/processos/$id" params={{ id: a.processo.id }} className="dc-link">
            {a.processo.titulo}
          </Link>
        </>
      }
      acoes={
        <>
          <Botao variante="fantasma" onClick={guardar} ocupado={salvar.isPending && !salvar.variables?.etapa}>
            Salvar
          </Botao>
          {seguinte && (
            <Botao variante="primaria" onClick={avancar} ocupado={salvar.isPending && !!salvar.variables?.etapa}>
              {ETAPA[seguinte]} <ArrowRight />
            </Botao>
          )}
        </>
      }
    >
      <div className="dc-form">
        <div className="dc-grade-2">
          <Campo rotulo="Valor do alvará" htmlFor="va-valor">
            <input id="va-valor" inputMode="decimal" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} />
          </Campo>
          <Campo rotulo="Valor recebido" htmlFor="va-rec">
            <input id="va-rec" inputMode="decimal" value={f.valorRecebido} onChange={(e) => setF({ ...f, valorRecebido: e.target.value })} placeholder="Depois do saque" />
          </Campo>
          <Campo rotulo="Sacado em" htmlFor="va-sac">
            <input id="va-sac" type="date" value={f.sacadoEm} onChange={(e) => setF({ ...f, sacadoEm: e.target.value })} />
          </Campo>
          <Campo rotulo="Repassado em" htmlFor="va-rep">
            <input id="va-rep" type="date" value={f.repassadoEm} onChange={(e) => setF({ ...f, repassadoEm: e.target.value })} />
          </Campo>
        </div>
        <Campo rotulo="Observações" htmlFor="va-obs">
          <textarea id="va-obs" rows={2} value={f.observacoes} onChange={(e) => setF({ ...f, observacoes: e.target.value })} />
        </Campo>
      </div>
    </Dialogo>
  );
}
