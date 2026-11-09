/**
 * O painel da plataforma (/plataforma): só para quem opera o Decreta (PLATAFORMA_EMAILS; os outros recebem 404).
 * A lista de escritórios mostra a conta e os totais (situação, cadastro, fim do teste, pessoas, processos e gasto
 * de IA do mês) e nunca o que é do escritório. As ações (liberar, estender o teste, só leitura, bloquear,
 * cortesia, reativar) ficam todas na auditoria da plataforma.
 */
import { ROTULO_DA_SITUACAO } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAviso, Avisos } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { IrParaEntrar, Pagina } from "@/componentes/moldura";
import { NaoEncontrada } from "@/componentes/nao-encontrada";
import { ConversasDoWhatsapp, Laboratorio } from "@/componentes/whatsapp-na-plataforma";
import { Abas, Botao, Campo, CampoDeBusca, Carregando, Chip, Cabecalho, Faixa, Painel, Segmentos, Selo, Vazio } from "@/componentes/ui";
import { ApiError, apiPlataforma, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaCurto, diaDoInstante, hora, numero } from "@/lib/formato";
import type { AcaoDaPlataforma, EscritorioDaPlataforma, IndicadoresDaPlataforma, NomeDaAcaoDaPlataforma, SituacaoDoEscritorio } from "@/lib/tipos";
import { cn } from "@/lib/util";

type Aba = "escritorios" | "indicadores" | "acoes" | "whatsapp" | "laboratorio";

const reais = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
const usd = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(v);
const percentual = (f: number) => `${(f * 100).toFixed(1).replace(".", ",")}%`;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

const escritoriosQuery = { queryKey: ["plataforma", "escritorios"], queryFn: () => apiPlataforma<{ escritorios: EscritorioDaPlataforma[] }>("/escritorios"), retry: false } as const;

/** A cor só diz uma coisa: vermelho e âmbar para o que pede atenção, verde para quem paga em dia. */
const SELO: Record<SituacaoDoEscritorio, "vencido" | "hoje" | "cumprido" | "prazo"> = {
  teste: "prazo",
  ativo: "cumprido",
  inadimplente: "hoje",
  so_leitura: "vencido",
  bloqueado: "vencido",
  cancelado: "prazo",
  cortesia: "prazo",
};

const ACOES: { id: NomeDaAcaoDaPlataforma; rotulo: string; ajuda: string; vale: (e: EscritorioDaPlataforma) => boolean }[] = [
  { id: "liberar", rotulo: "Liberar da avaliação", ajuda: "Tira os tetos menores de WhatsApp, convites e IA dos escritórios novos.", vale: (e) => e.emAvaliacao },
  { id: "estender_teste", rotulo: "Estender o teste", ajuda: "Soma dias ao fim do teste, ou a partir de hoje se ele já acabou.", vale: (e) => e.situacaoGravada === "teste" },
  { id: "so_leitura", rotulo: "Pôr em só leitura", ajuda: "O escritório vê tudo, mas não salva nada novo, e a captura, o WhatsApp e a IA param, até alguém reativar.", vale: (e) => e.situacaoGravada !== "so_leitura" },
  { id: "bloquear", rotulo: "Bloquear", ajuda: "Ninguém usa o escritório; só paga, leva os dados e encerra. Nada é apagado.", vale: (e) => e.situacaoGravada !== "bloqueado" },
  { id: "cortesia", rotulo: "Dar cortesia", ajuda: "Acesso total e sem cobrança, até alguém reativar.", vale: (e) => e.situacaoGravada !== "cortesia" },
  { id: "reativar", rotulo: "Reativar", ajuda: "Desfaz a restrição ou a cortesia. Quem assina volta a ser ativo; quem não assina abre um teste novo.", vale: (e) => ["so_leitura", "bloqueado", "cortesia"].includes(e.situacaoGravada) },
];

export function PlataformaPage() {
  const eu = useQuery(euQuery);
  const lista = useQuery(escritoriosQuery);
  const [aba, setAba] = useState<Aba>("escritorios");
  if (eu.error instanceof ApiError && eu.error.status === 401) return <IrParaEntrar />;
  // Quem não é operador recebe 404 da API: a tela também some, como se o endereço não existisse.
  if (lista.error instanceof ApiError && lista.error.status === 404) return <NaoEncontrada />;
  return (
    <Avisos>
      <div className="dc dc-app dc-app--sozinho" data-menu="recolhido">
        <div className="dc-conteudo">
          <Pagina larga>
            <div className="dc-topo-pagina">
              <Cabecalho
                titulo="Plataforma"
                sub="Escritórios, planos e indicadores do Decreta. Só a conta e os totais: nada do que é de cada escritório."
                acoes={
                  <Link to="/hoje" className="dc-btn dc-btn--secundaria dc-btn--md">
                    Voltar ao app
                  </Link>
                }
              />
              <Abas
                pagina
                ativa={aba}
                aoMudar={setAba}
                abas={[
                  { id: "escritorios", rotulo: "Escritórios", n: lista.data?.escritorios.filter((e) => !e.demonstracao && !e.encerrado).length },
                  { id: "indicadores", rotulo: "Indicadores" },
                  { id: "acoes", rotulo: "Ações registradas" },
                  { id: "whatsapp", rotulo: "WhatsApp" },
                  { id: "laboratorio", rotulo: "Laboratório" },
                ]}
              />
            </div>
            {lista.isError ? <Faixa tipo="erro">Não deu para carregar a plataforma agora. Tente de novo em instantes.</Faixa> : aba === "escritorios" ? <Escritorios lista={lista.data?.escritorios} /> : aba === "indicadores" ? <Indicadores /> : aba === "whatsapp" ? <ConversasDoWhatsapp /> : aba === "laboratorio" ? <Laboratorio /> : <Acoes />}
          </Pagina>
        </div>
      </div>
    </Avisos>
  );
}

/* ---------------- Escritórios ---------------- */

function Escritorios({ lista }: { lista: EscritorioDaPlataforma[] | undefined }) {
  const [filtro, setFiltro] = useState<SituacaoDoEscritorio | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [agindo, setAgindo] = useState<EscritorioDaPlataforma | null>(null);
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
        <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar escritório" placeholder="Buscar escritório" />
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
                      <span className="dc-celula">
                        <span className="dc-celula__1">{e.nome}</span>
                        <span className="dc-celula__2">{e.slug}{e.emAvaliacao ? " · em avaliação" : ""}</span>
                      </span>
                    </td>
                    <td>
                      <Selo urgencia={SELO[e.situacao]}>{ROTULO_DA_SITUACAO[e.situacao]}</Selo>
                    </td>
                    <td className="dc-num">{diaCompleto(diaDoInstante(e.criadoEm))}</td>
                    <td className="dc-num">{andamento(e)}</td>
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

/** O que importa de cada escritório numa frase: o teste, o atraso, o cancelamento ou o que paga. */
function andamento(e: EscritorioDaPlataforma): string {
  if (e.situacao === "teste" && e.testeAte) return `Até ${diaCurto(e.testeAte)} · ${plural(e.diasRestantesDoTeste ?? 0, "dia", "dias")}`;
  if (e.situacao === "so_leitura" && e.situacaoGravada === "teste" && e.testeAte) return `Acabou em ${diaCurto(e.testeAte)}`;
  if (e.diasDeAtraso !== null) return `${plural(e.diasDeAtraso, "dia", "dias")} de atraso`;
  if (e.cancelamentoPedidoEm && e.acessoAte) return `Cancelou · até ${diaCurto(e.acessoAte)}`;
  if (e.valorMensalCentavos && (e.situacao === "ativo" || e.situacao === "inadimplente")) return `${reais(e.valorMensalCentavos)} por mês`;
  return "—";
}

function AgirNoEscritorio({ escritorio, aoFechar }: { escritorio: EscritorioDaPlataforma | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [acao, setAcao] = useState<NomeDaAcaoDaPlataforma | "">("");
  const [dias, setDias] = useState("7");
  const [motivo, setMotivo] = useState("");
  const possiveis = escritorio ? ACOES.filter((a) => a.vale(escritorio)) : [];
  const escolhida = possiveis.find((a) => a.id === (acao || possiveis[0]?.id));
  const fechar = () => {
    setAcao("");
    setDias("7");
    setMotivo("");
    aoFechar();
  };
  const agir = useMutation({
    mutationFn: () => apiPlataforma<{ antes: SituacaoDoEscritorio; depois: SituacaoDoEscritorio }>(`/escritorios/${escritorio!.id}/acao`, { json: { acao: escolhida!.id, ...(escolhida!.id === "estender_teste" ? { dias: Number(dias) } : {}), motivo: motivo.trim() || undefined } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["plataforma"] });
      avisar(`${escolhida!.rotulo}: feito. Fica registrado em Ações registradas.`);
      fechar();
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <Dialogo
      aberto={!!escritorio}
      aoFechar={fechar}
      titulo={escritorio ? `Agir em ${escritorio.nome}` : "Agir"}
      descricao={escritorio ? `Hoje: ${ROTULO_DA_SITUACAO[escritorio.situacao].toLocaleLowerCase("pt-BR")}. Toda ação fica registrada, com o seu e-mail.` : undefined}
      acoes={
        <>
          <Botao variante="fantasma" onClick={fechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => agir.mutate()} ocupado={agir.isPending} disabled={!escolhida || (escolhida.id === "estender_teste" && !(Number(dias) >= 1 && Number(dias) <= 60))}>
            Confirmar
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        {possiveis.length ? (
          <>
            <Campo rotulo="Ação" htmlFor="pl-acao" ajuda={escolhida?.ajuda}>
              <select id="pl-acao" value={escolhida?.id ?? ""} onChange={(ev) => setAcao(ev.target.value as NomeDaAcaoDaPlataforma)}>
                {possiveis.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
            {escolhida?.id === "reativar" && escritorio?.situacaoGravada === "cortesia" && (
              <Faixa tipo="aviso">Este escritório é de cortesia e nunca é travado. Reativar abre um teste de 14 dias: se ele não assinar, passa a ser só leitura no fim.</Faixa>
            )}
            {escolhida?.id === "estender_teste" && (
              <Campo rotulo="Quantos dias a mais" htmlFor="pl-dias" ajuda="De 1 a 60.">
                <input id="pl-dias" type="number" min={1} max={60} value={dias} onChange={(ev) => setDias(ev.target.value)} />
              </Campo>
            )}
            <Campo rotulo="Motivo (opcional)" htmlFor="pl-motivo" ajuda="Fica na auditoria.">
              <input id="pl-motivo" value={motivo} maxLength={300} onChange={(ev) => setMotivo(ev.target.value)} placeholder="Ex.: pediu mais uma semana para testar" />
            </Campo>
          </>
        ) : (
          <p className="dc-nota m-0">Nenhuma ação vale para este escritório agora.</p>
        )}
      </div>
    </Dialogo>
  );
}

/* ---------------- Indicadores ---------------- */

const DIAS_DO_PERIODO = [
  { id: "7", rotulo: "7 dias" },
  { id: "30", rotulo: "30 dias" },
  { id: "90", rotulo: "90 dias" },
] as const;

function Indicadores() {
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
          <div className="dc-numeros" aria-label="Indicadores">
            <Contador n={reais(i.mrrCentavos)} rotulo="MRR" />
            <Contador n={i.conversao.taxa === null ? "—" : percentual(i.conversao.taxa)} rotulo="Conversão do teste" />
            <Contador n={String(i.cancelamentos.total)} rotulo={i.cancelamentos.total === 1 ? "Cancelamento" : "Cancelamentos"} />
            <Contador n={String(i.inadimplencia.escritorios)} rotulo={i.inadimplencia.escritorios === 1 ? "Escritório em atraso" : "Escritórios em atraso"} alerta={i.inadimplencia.escritorios > 0} />
          </div>
          <div className="dc-colunas dc-colunas--meio">
            <Painel titulo="Escritórios por situação" corpo={false}>
              <div className="dc-linhas">
                {(Object.keys(ROTULO_DA_SITUACAO) as SituacaoDoEscritorio[]).map((s) => (
                  <div key={s} className="dc-linhas__item items-center">
                    <span className="min-w-0 flex-1 dc-t-corpo font-medium">{ROTULO_DA_SITUACAO[s]}</span>
                    <span className="dc-num flex-none dc-t-corpo">{i.porSituacao[s]}</span>
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
              <Painel titulo="Funil" acao={<span className="dc-nota">O mesmo do bun run funil</span>} corpo={false}>
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
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Contador({ n, rotulo, alerta }: { n: string; rotulo: string; alerta?: boolean }) {
  return (
    <div className={cn("dc-contador", alerta && "dc-contador--hoje")}>
      <span className="dc-contador__n">{n}</span>
      <span className="dc-contador__rotulo">{rotulo}</span>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="dc-linhas__item items-center">
      <span className="min-w-0 flex-1 dc-t-corpo">{rotulo}</span>
      <span className="dc-num flex-none dc-t-corpo font-medium">{valor}</span>
    </div>
  );
}

/* ---------------- Ações registradas ---------------- */

const ROTULO_DA_ACAO: Record<string, string> = {
  "plataforma.liberar": "Liberou da avaliação",
  "plataforma.estender_teste": "Estendeu o teste",
  "plataforma.so_leitura": "Pôs em só leitura",
  "plataforma.bloquear": "Bloqueou",
  "plataforma.cortesia": "Deu cortesia",
  "plataforma.reativar": "Reativou",
};

function Acoes() {
  const q = useQuery({ queryKey: ["plataforma", "auditoria"], queryFn: () => apiPlataforma<{ itens: AcaoDaPlataforma[] }>("/auditoria"), retry: false });
  if (!q.data) return <Carregando />;
  return (
    <Painel titulo="Ações registradas" acao={<span className="dc-nota">Quem fez o quê nos escritórios, só a equipe do Decreta vê</span>} corpo={false}>
      {q.data.itens.length ? (
        <div className="dc-linhas">
          {q.data.itens.map((a) => {
            const motivo = typeof a.detalhes.motivo === "string" ? a.detalhes.motivo : null;
            const dias = typeof a.detalhes.dias === "number" ? `+${plural(a.detalhes.dias, "dia", "dias")}` : null;
            return (
              <div key={a.id} className="dc-linhas__item">
                <span className="dc-num w-[132px] flex-none dc-t-meta text-[var(--tinta-2)]">
                  {diaCurto(diaDoInstante(a.em))} {hora(a.em)}
                </span>
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1">
                    {ROTULO_DA_ACAO[a.acao] ?? a.acao} · {a.escritorio ?? "escritório apagado"}
                  </span>
                  <span className="dc-celula__2">{[a.operador, dias, motivo].filter(Boolean).join(" · ")}</span>
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <Vazio titulo="Nenhuma ação ainda">O que os operadores fazem nos escritórios fica registrado aqui, com quem fez e o motivo.</Vazio>
      )}
    </Painel>
  );
}
