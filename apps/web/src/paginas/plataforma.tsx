/**
 * O painel da plataforma (/plataforma): só para quem opera o Decreta (PLATAFORMA_EMAILS, com a verificação em duas
 * etapas; os outros recebem 404). A visão geral junta o dinheiro, as pessoas ativas, os gráficos e o que precisa de
 * atenção hoje; as outras abas abrem os escritórios, as pessoas, o uso de cada funcionalidade, o custo da IA, a
 * conversão e as ações registradas. Tudo é a conta e os totais, nunca o que é de cada escritório.
 */
import { ROTULO_DA_MARCA, ROTULO_DA_SITUACAO, type EscritorioNaLista, type SituacaoDoEscritorio } from "@decreta/core";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AgirNoEscritorio, andamento, escritoriosQuery, ItensDaAuditoria, Kpi, Kpis, Linha, MolduraDaPlataforma, percentual, reais, SELO, usd } from "@/componentes/plataforma";
import { Abas, Botao, CampoDeBusca, Carregando, Chip, Cabecalho, Faixa, Painel, Segmentos, Selo, Vazio } from "@/componentes/ui";
import { apiPlataforma } from "@/lib/api";
import { diaCompleto, diaDoInstante, numero } from "@/lib/formato";
import type { AbaDaPlataforma } from "@/lib/rotas";
import type { AcaoDaPlataforma, IndicadoresDaPlataforma } from "@/lib/tipos";
import { CustoDaIa, Pessoas, Uso, VisaoGeral } from "./plataforma-paineis";
import { Faturas, Planos } from "./plataforma-planos";

export function PlataformaPage() {
  const { aba = "visao" } = useSearch({ from: "/plataforma" });
  const navigate = useNavigate();
  const lista = useQuery(escritoriosQuery);
  const irPara = (a: AbaDaPlataforma) => void navigate({ to: "/plataforma", search: a === "visao" ? {} : { aba: a }, replace: true });
  return (
    <MolduraDaPlataforma>
      <div className="dc-topo-pagina">
        <Cabecalho
          titulo="Plataforma"
          sub="O negócio do Decreta: dinheiro, escritórios, pessoas, uso e IA. Só a conta e os totais, nada do que é de cada escritório."
          acoes={
            <Link to="/hoje" className="dc-btn dc-btn--secundaria dc-btn--md">
              Voltar ao app
            </Link>
          }
        />
        <Abas
          pagina
          ativa={aba}
          aoMudar={irPara}
          abas={[
            { id: "visao", rotulo: "Visão geral" },
            { id: "escritorios", rotulo: "Escritórios", n: lista.data?.escritorios.filter((e) => !e.demonstracao && !e.encerrado).length },
            { id: "planos", rotulo: "Planos" },
            { id: "faturas", rotulo: "Faturas" },
            { id: "pessoas", rotulo: "Pessoas" },
            { id: "uso", rotulo: "Uso" },
            { id: "ia", rotulo: "IA" },
            { id: "conversao", rotulo: "Conversão" },
            { id: "acoes", rotulo: "Ações registradas" },
          ]}
        />
      </div>
      {lista.isError ? (
        <Faixa tipo="erro">Não deu para carregar a plataforma agora. Tente de novo em instantes.</Faixa>
      ) : aba === "visao" ? (
        <VisaoGeral irPara={irPara} />
      ) : aba === "escritorios" ? (
        <Escritorios lista={lista.data?.escritorios} />
      ) : aba === "planos" ? (
        <Planos />
      ) : aba === "faturas" ? (
        <Faturas />
      ) : aba === "pessoas" ? (
        <Pessoas />
      ) : aba === "uso" ? (
        <Uso />
      ) : aba === "ia" ? (
        <CustoDaIa />
      ) : aba === "conversao" ? (
        <Conversao />
      ) : (
        <Acoes />
      )}
    </MolduraDaPlataforma>
  );
}

/* ---------------- Escritórios ---------------- */

/** A lista inteira numa planilha (separada por ponto e vírgula, como o Excel em português abre). */
function exportarCsv(lista: EscritorioNaLista[]) {
  const celula = (v: string | number | null) => {
    const t = v === null ? "" : String(v);
    return /[";\n]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
  };
  const linhas = [
    ["Escritório", "Endereço", "Situação", "Plano", "Marca", "Cadastro", "Fim do teste", "Dias de atraso", "Mensalidade (R$)", "Com desconto", "Assinou em", "Pessoas", "Processos", "IA no mês (US$)", "Limites", "Em avaliação"],
    ...lista.map((e) => [
      e.nome,
      e.slug,
      ROTULO_DA_SITUACAO[e.situacao],
      `${e.plano.nome} v${e.plano.versao}`,
      e.marca ? ROTULO_DA_MARCA[e.marca] : null,
      diaCompleto(diaDoInstante(e.criadoEm)),
      e.testeAte ? diaCompleto(e.testeAte) : null,
      e.diasDeAtraso,
      e.mensalidadeCentavos === null ? null : (e.mensalidadeCentavos / 100).toFixed(2).replace(".", ","),
      e.comDesconto ? "sim" : "não",
      e.assinouEm ? diaCompleto(diaDoInstante(e.assinouEm)) : null,
      e.pessoas,
      e.processos,
      e.iaMesUsd.toFixed(2).replace(".", ","),
      e.limites.rotulos.join(", ") || null,
      e.emAvaliacao ? "sim" : "não",
    ]),
  ];
  const texto = `﻿${linhas.map((l) => l.map(celula).join(";")).join("\r\n")}`;
  const url = URL.createObjectURL(new Blob([texto], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `escritorios-decreta-${diaDoInstante(new Date().toISOString())}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Escritorios({ lista }: { lista: EscritorioNaLista[] | undefined }) {
  const [filtro, setFiltro] = useState<SituacaoDoEscritorio | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [agindo, setAgindo] = useState<EscritorioNaLista | null>(null);
  if (!lista) return <Carregando />;
  const reais_ = lista.filter((e) => !e.demonstracao && !e.encerrado);
  const conta = (s: SituacaoDoEscritorio) => reais_.filter((e) => e.situacao === s).length;
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const itens = reais_.filter((e) => (filtro === "todos" || e.situacao === filtro) && (!termo || `${e.nome} ${e.slug}`.toLocaleLowerCase("pt-BR").includes(termo)));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="dc-chips">
          <Chip ligado={filtro === "todos"} n={reais_.length} onClick={() => setFiltro("todos")}>
            Todos
          </Chip>
          {(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoEscritorio[]).map((s) => (
            <Chip key={s} ligado={filtro === s} n={conta(s)} onClick={() => setFiltro(s)}>
              {ROTULO_DA_SITUACAO[s]}
            </Chip>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar escritório" placeholder="Buscar escritório" />
          <Botao onClick={() => exportarCsv(itens)} disabled={!itens.length}>
            Exportar planilha
          </Botao>
        </div>
      </div>
      <Painel corpo={false}>
        {itens.length ? (
          <div className="dc-tabela-caixa">
            <table className="dc-tabela">
              <thead>
                <tr>
                  <th>Escritório</th>
                  <th className="dc-col--situacao">Situação</th>
                  <th className="dc-col--data">Cadastro</th>
                  <th className="dc-col--situacao">Teste e cobrança</th>
                  <th className="dc-col--situacao">Plano</th>
                  <th className="dc-direita dc-col--n">Pessoas</th>
                  <th className="dc-direita dc-col--n">Processos</th>
                  <th className="dc-direita dc-col--data">IA no mês</th>
                  <th className="dc-col--data" />
                </tr>
              </thead>
              <tbody>
                {itens.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link to="/plataforma/escritorios/$id" params={{ id: e.id }} className="dc-celula no-underline">
                        <span className="dc-celula__1">{e.nome}</span>
                        <span className="dc-celula__2">
                          {e.slug}
                          {e.emAvaliacao ? " · em avaliação" : ""}
                          {e.marca ? ` · ${ROTULO_DA_MARCA[e.marca].toLocaleLowerCase("pt-BR")}` : ""}
                        </span>
                      </Link>
                    </td>
                    <td>
                      <Selo urgencia={SELO[e.situacao]}>{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
                    </td>
                    <td className="dc-num">{diaCompleto(diaDoInstante(e.criadoEm))}</td>
                    <td className="dc-num">{andamento(e)}</td>
                    <td>
                      <span className="dc-celula">
                        <span className="dc-celula__1">
                          {e.plano.nome}
                          {e.plano.antigo ? ` · v${e.plano.versao}` : ""}
                        </span>
                        <span className="dc-celula__2 dc-num">
                          {e.mensalidadeCentavos === null ? "sem preço" : `${reais(e.mensalidadeCentavos)}${e.comDesconto ? " com desconto" : ""}`}
                          {e.limites.estado !== "ok" ? ` · ${e.limites.estado === "passou" ? "passou do limite" : "perto do limite"}` : ""}
                        </span>
                      </span>
                    </td>
                    <td className="dc-direita dc-num">{numero(e.pessoas)}</td>
                    <td className="dc-direita dc-num">{numero(e.processos)}</td>
                    <td className="dc-direita dc-num">{usd(e.iaMesUsd)}</td>
                    <td className="dc-direita">
                      <Botao pequeno onClick={() => setAgindo(e)} aria-label={`Agir em ${e.nome}`}>
                        Agir
                      </Botao>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Vazio
            titulo={filtro === "todos" && !termo ? "Nenhum escritório ainda" : "Nenhum escritório com esse filtro"}
            acao={
              (filtro !== "todos" || !!termo) && (
                <Botao
                  pequeno
                  onClick={() => {
                    setFiltro("todos");
                    setBusca("");
                  }}
                >
                  Limpar os filtros
                </Botao>
              )
            }
          >
            {filtro === "todos" && !termo ? "Os escritórios aparecem aqui quando se cadastram." : "Tente outro nome ou outra situação."}
          </Vazio>
        )}
      </Painel>
      <AgirNoEscritorio escritorio={agindo} aoFechar={() => setAgindo(null)} />
    </>
  );
}

/* ---------------- Conversão ---------------- */

const DIAS_DO_PERIODO = [
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
] as const;

function Conversao() {
  const [dias, setDias] = useState<"7" | "30" | "90">("30");
  const q = useQuery({ queryKey: ["plataforma", "indicadores", dias], queryFn: () => apiPlataforma<IndicadoresDaPlataforma>(`/indicadores?dias=${dias}`), retry: false });
  const i = q.data;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="dc-nota m-0">{i ? `De ${diaCompleto(i.periodo.de)} a ${diaCompleto(i.periodo.ate)}. O MRR e as situações são de hoje.` : " "}</p>
        <Segmentos opcoes={[...DIAS_DO_PERIODO]} valor={dias} aoMudar={setDias} rotulo="Período" />
      </div>
      {!i ? (
        <Carregando />
      ) : (
        <>
          <Kpis rotulo="Indicadores">
            <Kpi rotulo="MRR" n={reais(i.mrrCentavos)} />
            <Kpi rotulo="Conversão do teste" n={i.conversao.taxa === null ? "—" : percentual(i.conversao.taxa)} sub={`${i.conversao.assinaram} de ${i.conversao.terminaram} que terminaram`} />
            <Kpi rotulo={i.cancelamentos.total === 1 ? "Cancelamento" : "Cancelamentos"} n={String(i.cancelamentos.total)} sub={`${reais(i.cancelamentos.mrrPerdidoCentavos)} de MRR`} />
            <Kpi rotulo={i.inadimplencia.escritorios === 1 ? "Escritório em atraso" : "Escritórios em atraso"} n={String(i.inadimplencia.escritorios)} alerta={i.inadimplencia.escritorios > 0 && "hoje"} sub={`${reais(i.mrrEmAtrasoCentavos)} de MRR`} />
          </Kpis>
          <div className="dc-colunas dc-colunas--meio">
            <Painel titulo="Funil" acao={<span className="dc-nota">Do site ao primeiro prazo confirmado</span>} corpo={false}>
              <div className="dc-linhas">
                {i.funil.map((e) => (
                  <div key={e.nome} className="dc-linhas__item items-center">
                    <span className="min-w-0 flex-1 dc-t-corpo font-medium">{e.rotulo}</span>
                    {e.doAnterior !== null && <span className="dc-nota flex-none">{percentual(e.doAnterior)} do passo anterior</span>}
                    <span className="dc-num w-14 flex-none text-right dc-t-corpo">{numero(e.total)}</span>
                  </div>
                ))}
              </div>
            </Painel>
            <div className="dc-pilha">
              <Painel titulo="Conversão, cancelamento e atraso" corpo={false}>
                <div className="dc-linhas">
                  <Linha rotulo="Cadastrados no período com teste" valor={String(i.conversao.cadastrados)} />
                  <Linha rotulo="Já terminaram o teste (ou assinaram)" valor={String(i.conversao.terminaram)} />
                  <Linha rotulo="Assinaram" valor={String(i.conversao.assinaram)} />
                  <Linha rotulo="MRR perdido em cancelamentos" valor={reais(i.cancelamentos.mrrPerdidoCentavos)} />
                  <Linha rotulo="MRR em atraso" valor={reais(i.mrrEmAtrasoCentavos)} />
                </div>
              </Painel>
              <Painel titulo="Escritórios por situação" corpo={false}>
                <div className="dc-linhas">
                  {(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoEscritorio[]).map((s) => (
                    <Linha key={s} rotulo={ROTULO_DA_SITUACAO[s]} valor={i.porSituacao[s]} />
                  ))}
                </div>
              </Painel>
            </div>
          </div>
        </>
      )}
    </>
  );
}

/* ---------------- Ações registradas ---------------- */

function Acoes() {
  const q = useQuery({ queryKey: ["plataforma", "auditoria"], queryFn: () => apiPlataforma<{ itens: AcaoDaPlataforma[] }>("/auditoria"), retry: false });
  if (!q.data) return <Carregando />;
  return (
    <Painel titulo="Ações registradas" acao={<span className="dc-nota">Quem fez o quê nos escritórios e nas pessoas; só a equipe do Decreta vê</span>} corpo={false}>
      {q.data.itens.length ? (
        <ItensDaAuditoria itens={q.data.itens} />
      ) : (
        <Vazio titulo="Nenhuma ação ainda">O que os operadores fazem nos escritórios e nas pessoas fica registrado aqui, com quem fez e o motivo.</Vazio>
      )}
    </Painel>
  );
}
