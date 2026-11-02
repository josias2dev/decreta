/**
 * Financeiro: o que há a receber, o que está em atraso e o que já foi recebido, por período, cliente e
 * processo; mais o que espera uma pessoa (a prestação de contas dos alvarás sacados, os lembretes de cobrança
 * e os processos sem honorário). Simples de propósito: contratos, parcelas, pagamento e cobrança. "Recebido"
 * é só o que tem pagamento marcado. Só os sócios e quem eles liberarem entram.
 */
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Plus, X } from "lucide-react";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { ContaDialogo } from "@/componentes/conta-do-alvara";
import { Dialogo } from "@/componentes/dialogo";
import { casoDaParcela, NovoContrato, ParcelaDialogo, SeloDaParcela, useAtualizarFinanceiro } from "@/componentes/honorarios";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { Rolagem } from "@/componentes/rolagem";
import { Botao, Cabecalho, CampoDeBusca, Carregando, Chip, Segmentos, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { numero, reais } from "@/lib/formato";
import type { SituacaoDoFinanceiro } from "@/lib/rotas";
import type { AlvaraParaPrestar, FinanceiroGeral, GrupoDoResumo, ParcelaDeHonorario } from "@/lib/tipos";
import { cn } from "@/lib/util";

type Periodo = "mes" | "30" | "tudo";
type Situacao = SituacaoDoFinanceiro;
type Visao = "parcelas" | "clientes" | "processos" | "meses";

const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
const nomeDoMes = (mes: string) => {
  const t = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${mes}-15T12:00:00Z`));
  return t.charAt(0).toLocaleUpperCase("pt-BR") + t.slice(1);
};
const somarDias = (dia: string, n: number) => {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const ultimoDiaDoMes = (hoje: string) => {
  const [a, m] = hoje.split("-").map(Number) as [number, number];
  return `${hoje.slice(0, 7)}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** O período dos números de cima: este mês, os próximos 30 dias ou tudo. */
function limitesDo(periodo: Periodo, hoje: string): [string, string] | null {
  if (periodo === "mes") return [`${hoje.slice(0, 7)}-01`, ultimoDiaDoMes(hoje)];
  if (periodo === "30") return [hoje, somarDias(hoje, 30)];
  return null;
}
const dentro = (dia: string | null, limites: [string, string] | null) => !limites || (dia !== null && dia >= limites[0] && dia <= limites[1]);

/** Os números do período, tirados das parcelas e dos pagamentos marcados. Recebido é só o que tem pagamento. */
function numerosDoPeriodo(parcelas: ParcelaDeHonorario[], periodo: Periodo, hoje: string) {
  const limites = limitesDo(periodo, hoje);
  let aReceber = 0;
  let recebido = 0;
  let nAReceber = 0;
  let nRecebidos = 0;
  for (const p of parcelas) {
    if (p.falta && (limites ? dentro(p.vencimento, limites) : true)) {
      aReceber += p.falta;
      nAReceber++;
    }
    for (const g of p.pagamentos) {
      if (!g.estornado && dentro(g.pagoEm, limites)) {
        recebido += g.valor;
        nRecebidos++;
      }
    }
  }
  return { aReceber, recebido, nAReceber, nRecebidos };
}

function filtrar(parcelas: ParcelaDeHonorario[], situacao: Situacao, busca: string, cliente: string | undefined, processo: string | undefined) {
  const b = semAcento(busca.trim());
  return parcelas.filter((p) => {
    if (situacao === "abertas" && !(p.falta || p.situacao === "sem_valor")) return false;
    if (situacao === "atraso" && p.situacao !== "em_atraso") return false;
    if (situacao === "pagas" && p.situacao !== "paga") return false;
    if (cliente && p.cliente?.id !== cliente) return false;
    if (processo && p.processo?.id !== processo) return false;
    return !b || semAcento([p.descricao, p.cliente?.nome, p.processo?.titulo, p.contratoTitulo].join(" ")).includes(b);
  });
}

interface Grupo {
  chave: string;
  titulo: string;
  vencido?: boolean;
  total: number;
  itens: ParcelaDeHonorario[];
}

/** Em atraso primeiro, depois cada mês de vencimento, e por fim o êxito que espera o resultado. As pagas vêm numa lista só, das mais novas. */
function agrupar(itens: ParcelaDeHonorario[], situacao: Situacao): Grupo[] {
  const soma = (xs: ParcelaDeHonorario[]) => xs.reduce((s, p) => s + (p.falta ?? 0), 0);
  if (situacao === "pagas") {
    const ultimo = (p: ParcelaDeHonorario) => p.pagamentos.filter((g) => !g.estornado).map((g) => g.pagoEm).sort().at(-1) ?? "";
    return [{ chave: "pagas", titulo: "Pagas", total: 0, itens: [...itens].sort((a, b) => ultimo(b).localeCompare(ultimo(a))) }];
  }
  const grupos = new Map<string, Grupo>();
  const pegar = (chave: string, titulo: string, vencido?: boolean) => {
    const g = grupos.get(chave) ?? { chave, titulo, vencido, total: 0, itens: [] };
    grupos.set(chave, g);
    return g;
  };
  for (const p of itens) {
    const g = p.situacao === "em_atraso" ? pegar("0-atraso", "Em atraso", true) : p.vencimento ? pegar(`1-${p.vencimento.slice(0, 7)}`, nomeDoMes(p.vencimento.slice(0, 7))) : pegar("2-sem", "Aguardando o resultado");
    g.itens.push(p);
  }
  return [...grupos.values()]
    .sort((a, b) => a.chave.localeCompare(b.chave))
    .map((g) => ({ ...g, total: soma(g.itens), itens: g.itens.sort((a, b) => (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999")) }));
}

export function FinanceiroPage() {
  const celular = useCelular();
  const navigate = useNavigate({ from: "/financeiro" });
  const search = useSearch({ from: "/app/financeiro" });
  const eu = useQuery(euQuery);
  const liberado = !!eu.data?.usuario.financeiro;
  const q = useQuery({ queryKey: ["financeiro", "geral"], queryFn: () => api<FinanceiroGeral>("/financeiro"), enabled: liberado, placeholderData: (a) => a });
  const [periodo, setPeriodo] = useState<Periodo>("mes");
  const [visao, setVisao] = useState<Visao>("parcelas");
  const [busca, setBusca] = useState("");
  const [aberta, setAberta] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [fila, setFila] = useState<"prestar" | "lembretes" | "sem" | null>(null);
  const [alvaraAberto, setAlvaraAberto] = useState<AlvaraParaPrestar | null>(null);

  const situacao: Situacao = search.situacao ?? "abertas";
  const irPara = (s: Situacao) => void navigate({ search: (a) => ({ ...a, situacao: s === "abertas" ? undefined : s }), replace: true });
  const soDo = (campo: "cliente" | "processo", id: string | undefined) => void navigate({ search: (a) => ({ ...a, [campo]: id }), replace: true });

  if (eu.data && !liberado) {
    const corpo = <Vazio titulo="O Financeiro é dos sócios">Quem não é sócio entra aqui quando um sócio libera o acesso na tela da Equipe.</Vazio>;
    return celular ? <TelaCelular titulo="Financeiro">{corpo}</TelaCelular> : <Pagina><Cabecalho titulo="Financeiro" />{corpo}</Pagina>;
  }

  const d = q.data;
  const hoje = d?.hoje ?? eu.data?.hoje ?? "";
  const parcelas = d?.parcelas ?? [];
  const n = d ? numerosDoPeriodo(parcelas, periodo, hoje) : null;
  const filtradas = filtrar(parcelas, situacao, busca, search.cliente, search.processo);
  const grupos = agrupar(filtradas, situacao);
  const contagem = {
    abertas: parcelas.filter((p) => p.falta || p.situacao === "sem_valor").length,
    atraso: parcelas.filter((p) => p.situacao === "em_atraso").length,
    pagas: parcelas.filter((p) => p.situacao === "paga").length,
  };
  const parcelaAberta = parcelas.find((p) => p.id === aberta) ?? null;
  const nomeDoCliente = search.cliente ? (parcelas.find((p) => p.cliente?.id === search.cliente)?.cliente?.nome ?? "cliente") : null;
  const nomeDoProcesso = search.processo ? (parcelas.find((p) => p.processo?.id === search.processo)?.processo?.titulo ?? "processo") : null;
  const sub = d ? `${reais(d.resumo.aReceber)} a receber${d.resumo.emAtraso ? ` · ${reais(d.resumo.emAtraso)} em atraso` : ""}` : " ";

  const periodoSegmentos = (
    <Segmentos
      rotulo="Período dos números"
      valor={periodo}
      aoMudar={setPeriodo}
      opcoes={[
        { id: "mes", rotulo: "Este mês" },
        { id: "30", rotulo: "30 dias" },
        { id: "tudo", rotulo: "Tudo" },
      ]}
    />
  );
  const chips = (
    <div className="dc-chips">
      <Chip ligado={situacao === "abertas"} n={contagem.abertas} onClick={() => irPara("abertas")}>
        Em aberto
      </Chip>
      <Chip ligado={situacao === "atraso"} alerta={contagem.atraso > 0} n={contagem.atraso} onClick={() => irPara("atraso")}>
        Em atraso
      </Chip>
      <Chip ligado={situacao === "pagas"} n={contagem.pagas} onClick={() => irPara("pagas")}>
        Pagas
      </Chip>
      <Chip ligado={situacao === "todas"} onClick={() => irPara("todas")}>
        Todas
      </Chip>
    </div>
  );
  const filtrosAtivos = (nomeDoCliente || nomeDoProcesso) && (
    <div className="dc-chips">
      {nomeDoCliente && (
        <Chip ligado onClick={() => soDo("cliente", undefined)}>
          {nomeDoCliente} <X />
        </Chip>
      )}
      {nomeDoProcesso && (
        <Chip ligado onClick={() => soDo("processo", undefined)}>
          {nomeDoProcesso} <X />
        </Chip>
      )}
    </div>
  );
  const afazer = d && (d.alvarasParaPrestar.length > 0 || d.lembretesParaAprovar > 0 || d.semHonorario.total > 0) && (
    <div className="flex flex-wrap items-center gap-2" aria-label="O que espera uma pessoa">
      <span className="dc-rotulo">Para fazer</span>
      {d.alvarasParaPrestar.length > 0 && (
        <Botao pequeno variante="secundaria" onClick={() => setFila("prestar")}>
          Prestar contas de {numero(d.alvarasParaPrestar.length)} {d.alvarasParaPrestar.length === 1 ? "alvará sacado" : "alvarás sacados"}
        </Botao>
      )}
      {d.lembretesParaAprovar > 0 && (
        <Botao pequeno variante="secundaria" onClick={() => setFila("lembretes")}>
          Aprovar {numero(d.lembretesParaAprovar)} {d.lembretesParaAprovar === 1 ? "lembrete" : "lembretes"}
        </Botao>
      )}
      {d.semHonorario.total > 0 && (
        <Botao pequeno variante="fantasma" onClick={() => setFila("sem")}>
          {numero(d.semHonorario.total)} {d.semHonorario.total === 1 ? "processo sem honorário" : "processos sem honorário"}
        </Botao>
      )}
    </div>
  );

  const dialogos = (
    <>
      <NovoContrato aberto={novo} aoFechar={() => setNovo(false)} />
      {parcelaAberta && <ParcelaDialogo key={`${parcelaAberta.id}-${parcelaAberta.pago}-${parcelaAberta.cobranca?.link ?? ""}`} parcela={parcelaAberta} hoje={hoje} aoFechar={() => setAberta(null)} />}
      {alvaraAberto && <ContaDialogo alvara={alvaraAberto} aoFechar={() => setAlvaraAberto(null)} />}
      {d && fila === "prestar" && <FilaDeAlvaras itens={d.alvarasParaPrestar} aoFechar={() => setFila(null)} aoAbrir={(a) => { setFila(null); setAlvaraAberto(a); }} />}
      {d && fila === "lembretes" && <FilaDeLembretes aoFechar={() => setFila(null)} aoAbrir={(parcelaId) => { setFila(null); setAberta(parcelaId); }} />}
      {d && fila === "sem" && <FilaSemHonorario itens={d.semHonorario.itens} total={d.semHonorario.total} aoFechar={() => setFila(null)} />}
    </>
  );

  /** A visão por cliente, processo ou mês: um clique filtra a lista de parcelas. */
  const resumos = (v: Exclude<Visao, "parcelas">) => {
    if (!d) return null;
    const nomes = new Map<string, string>();
    for (const p of parcelas) {
      if (p.cliente) nomes.set(p.cliente.id, p.cliente.nome);
      if (p.processo) nomes.set(p.processo.id, p.processo.titulo);
    }
    const linhas: { id: string; nome: string; g: GrupoDoResumo }[] =
      v === "meses"
        ? d.resumo.porMes.map((m) => ({ id: m.mes, nome: nomeDoMes(m.mes), g: { id: m.mes, aReceber: m.aReceber, emAtraso: m.emAtraso, recebido: 0 } }))
        : (v === "clientes" ? d.resumo.porCliente : d.resumo.porProcesso).map((g) => ({ id: g.id, nome: nomes.get(g.id) ?? "—", g }));
    if (!linhas.length) return <Vazio titulo="Nada por aqui ainda">Os contratos e as parcelas aparecem aqui.</Vazio>;
    const clicar = (id: string) => {
      if (v === "meses") return;
      soDo(v === "clientes" ? "cliente" : "processo", id);
      setVisao("parcelas");
    };
    return (
      <div className="dc-linhas" role="list">
        {linhas.map(({ id, nome, g }) => (
          <button key={id} type="button" role="listitem" className={cn("dc-linhas__item w-full items-center border-0 bg-transparent text-left", v !== "meses" && "cursor-pointer hover:bg-[var(--superficie-2)]")} onClick={() => clicar(id)} disabled={v === "meses"}>
            <span className="min-w-0 flex-1 truncate font-medium">{nome}</span>
            <span className="dc-num text-right">
              <span className="block">{reais(g.aReceber)}</span>
              <span className="dc-nota block">a receber</span>
            </span>
            {g.emAtraso > 0 && (
              <span className="dc-num text-right text-[var(--vencido)]">
                <span className="block">{reais(g.emAtraso)}</span>
                <span className="dc-nota block">em atraso</span>
              </span>
            )}
            {v !== "meses" && (
              <span className="dc-num hidden text-right sm:block">
                <span className="block">{reais(g.recebido)}</span>
                <span className="dc-nota block">recebido</span>
              </span>
            )}
          </button>
        ))}
      </div>
    );
  };

  if (celular) {
    return (
      <TelaCelular
        titulo="Financeiro"
        sobre={sub}
        voltar
        direita={
          <button type="button" className="dc-btn dc-btn--fantasma" aria-label="Novo contrato" onClick={() => setNovo(true)}>
            <Plus />
          </button>
        }
        fixo={
          <div className="flex flex-col gap-2">
            <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar parcela" placeholder="Cliente, processo ou parcela" />
            {chips}
            {filtrosAtivos}
          </div>
        }
      >
        {!d ? (
          <Carregando />
        ) : (
          <>
            <div className="dc-painel" aria-label="Números do período">
              <div className="dc-linhas">
                <div className="dc-linhas__item items-center justify-between">
                  <span className="dc-t-corpo">A receber</span>
                  <strong className="dc-num">{reais(n!.aReceber)}</strong>
                </div>
                <div className="dc-linhas__item items-center justify-between">
                  <span className="dc-t-corpo">Em atraso</span>
                  <strong className={cn("dc-num", d.resumo.emAtraso > 0 && "text-[var(--vencido)]")}>{reais(d.resumo.emAtraso)}</strong>
                </div>
                <div className="dc-linhas__item items-center justify-between">
                  <span className="dc-t-corpo">Recebido</span>
                  <strong className="dc-num">{reais(n!.recebido)}</strong>
                </div>
              </div>
              <div className="px-[var(--respiro-painel)] pb-3">{periodoSegmentos}</div>
            </div>
            {afazer}
            <Segmentos
              rotulo="Ver por"
              valor={visao}
              aoMudar={setVisao}
              opcoes={[
                { id: "parcelas", rotulo: "Parcelas" },
                { id: "clientes", rotulo: "Clientes" },
                { id: "processos", rotulo: "Processos" },
                { id: "meses", rotulo: "Meses" },
              ]}
            />
            {visao !== "parcelas" ? (
              <div className="dc-painel">{resumos(visao)}</div>
            ) : grupos.length ? (
              grupos.map((g) => (
                <section key={g.chave} className="dc-secao">
                  <h2 className={cn("dc-secao__titulo", g.vencido && "text-[var(--vencido)]")}>
                    {g.titulo} <span className="dc-num font-medium text-[var(--tinta-3)]">· {g.itens.length}{g.total ? ` · ${reais(g.total)}` : ""}</span>
                  </h2>
                  <div className="dc-lista">
                    {g.itens.map((p) => (
                      <button key={p.id} type="button" className="dc-item cursor-pointer text-left" onClick={() => setAberta(p.id)}>
                        <span className="dc-item__titulo">{p.descricao}</span>
                        <SeloDaParcela p={p} hoje={hoje} />
                        <span className="dc-item__meta">{casoDaParcela(p)}</span>
                        <span className="dc-item__pe">
                          <span className="dc-num font-medium text-[var(--tinta)]">{p.valor === null ? "sem valor ainda" : reais(p.valor)}</span>
                          {p.pago > 0 && p.falta ? <span className="dc-num">· pago {reais(p.pago)}</span> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              ))
            ) : (
              <Vazio titulo={situacao === "atraso" ? "Nada em atraso" : "Nenhuma parcela aqui"}>{situacao === "atraso" ? "Todas as parcelas vencidas foram pagas." : "Crie um contrato de honorários para começar."}</Vazio>
            )}
          </>
        )}
        {dialogos}
      </TelaCelular>
    );
  }

  return (
    <Pagina larga cheia>
      <Cabecalho
        titulo="Financeiro"
        sub={sub}
        acoes={
          <Botao variante="primaria" onClick={() => setNovo(true)}>
            <Plus /> Novo contrato
          </Botao>
        }
      />
      {!d ? (
        <Carregando />
      ) : (
        <>
          <div className="dc-numeros dc-numeros--totais" aria-label="Números do período">
            <div className="dc-contador" title={`${n!.nAReceber} ${n!.nAReceber === 1 ? "parcela" : "parcelas"}`}>
              <span className="dc-contador__n">{reais(n!.aReceber)}</span>
              <span className="dc-contador__rotulo">A receber</span>
            </div>
            <div className={cn("dc-contador", d.resumo.emAtraso > 0 && "dc-contador--vencido")} title={`${d.resumo.parcelasEmAtraso} ${d.resumo.parcelasEmAtraso === 1 ? "parcela" : "parcelas"}`}>
              <span className="dc-contador__n">{reais(d.resumo.emAtraso)}</span>
              <span className="dc-contador__rotulo">Em atraso</span>
            </div>
            <div className="dc-contador" title={`${n!.nRecebidos} ${n!.nRecebidos === 1 ? "pagamento" : "pagamentos"}`}>
              <span className="dc-contador__n">{reais(n!.recebido)}</span>
              <span className="dc-contador__rotulo">Recebido</span>
            </div>
            <div className="dc-contador">
              <span className="dc-contador__n">{numero(d.alvarasParaPrestar.length)}</span>
              <span className="dc-contador__rotulo">Alvarás para prestar contas</span>
            </div>
          </div>
          <div className="dc-filtros">
            <CampoDeBusca valor={busca} aoMudar={setBusca} rotulo="Buscar parcela" placeholder="Cliente, processo ou parcela" />
            {chips}
            {filtrosAtivos}
            <div className="ml-auto flex flex-wrap items-center gap-3">
              <Segmentos
                rotulo="Ver por"
                valor={visao}
                aoMudar={setVisao}
                opcoes={[
                  { id: "parcelas", rotulo: "Parcelas" },
                  { id: "clientes", rotulo: "Clientes" },
                  { id: "processos", rotulo: "Processos" },
                  { id: "meses", rotulo: "Meses" },
                ]}
              />
              {periodoSegmentos}
            </div>
          </div>
          {afazer}
          <section className="dc-painel">
            {visao !== "parcelas" ? (
              <Rolagem id="financeiro-resumo" topo={visao} className="dc-tabela-caixa">
                {resumos(visao)}
              </Rolagem>
            ) : grupos.length ? (
              <Rolagem id="financeiro" topo={`${situacao}-${busca}-${search.cliente ?? ""}-${search.processo ?? ""}`} className="dc-tabela-caixa">
                <table className="dc-tabela dc-tabela--fixa">
                  <thead>
                    <tr>
                      <th className="dc-col--quando">Vence</th>
                      <th>Parcela</th>
                      <th className="dc-col--valor">Valor</th>
                      <th className="dc-col--situacao">Situação</th>
                    </tr>
                  </thead>
                  {grupos.map((g) => (
                    <tbody key={g.chave}>
                      <tr>
                        <td colSpan={4} className={cn("dc-tabela__grupo", g.vencido && "is-vencido")}>
                          {g.titulo} · <span className="dc-num">{g.itens.length}</span>
                          {g.total > 0 && <span className="dc-num"> · {reais(g.total)}</span>}
                        </td>
                      </tr>
                      {g.itens.map((p) => (
                        <tr key={p.id} data-link="" onClick={() => setAberta(p.id)}>
                          <td className="dc-num">{p.vencimento ? p.vencimento.split("-").reverse().join("/") : "—"}</td>
                          <td>
                            <span className="dc-celula">
                              <span className="dc-celula__1 dc-celula__1--uma">
                                <button type="button" className="dc-link border-0 bg-transparent p-0 text-left font-medium no-underline" onClick={(e) => { e.stopPropagation(); setAberta(p.id); }}>
                                  {p.descricao}
                                </button>
                              </span>
                              <span className="dc-celula__2 dc-celula__2--uma">{casoDaParcela(p)}</span>
                            </span>
                          </td>
                          <td className="dc-col--valor">
                            <span className="dc-celula">
                              <span className="dc-celula__1 dc-celula__1--uma dc-num">{p.valor === null ? "—" : reais(p.valor)}</span>
                              {p.pago > 0 && p.falta ? <span className="dc-celula__2 dc-celula__2--uma dc-num">pago {reais(p.pago)}</span> : null}
                            </span>
                          </td>
                          <td>
                            <SeloDaParcela p={p} hoje={hoje} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  ))}
                </table>
              </Rolagem>
            ) : (
              <Vazio titulo={situacao === "atraso" ? "Nada em atraso" : "Nenhuma parcela aqui"}>{situacao === "atraso" ? "Todas as parcelas vencidas foram pagas." : "Crie um contrato de honorários para começar: valor fixo, mensal, êxito ou híbrido."}</Vazio>
            )}
          </section>
        </>
      )}
      {dialogos}
    </Pagina>
  );
}

/* ------------------------------------------------------------------ */
/* Filas do "Para fazer"                                               */
/* ------------------------------------------------------------------ */

function FilaDeAlvaras({ itens, aoFechar, aoAbrir }: { itens: AlvaraParaPrestar[]; aoFechar: () => void; aoAbrir: (a: AlvaraParaPrestar) => void }) {
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Alvarás sacados esperando a prestação de contas"
      descricao="O Decreta já fez a conta de cada um. Abra para conferir, confirmar e registrar o repasse ao cliente."
      className="dc-dialogo--largo"
      acoes={
        <Botao variante="primaria" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      <div className="dc-painel dc-linhas">
        {itens.map((a) => (
          <button key={a.id} type="button" className="dc-linhas__item w-full cursor-pointer items-center border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => aoAbrir(a)}>
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">{a.cliente?.nome ?? a.processo.titulo}</span>
              <span className="dc-celula__2">
                {a.descricao}
                {a.sacadoEm ? ` · sacado em ${a.sacadoEm.split("-").reverse().slice(0, 2).join("/")}` : ""}
              </span>
            </span>
            <span className="dc-num text-right">
              <span className="block font-medium">{reais(a.conta.cliente)}</span>
              <span className="dc-nota block">{a.precisaEscolherContrato ? "escolha o contrato" : a.conta.falta ? "informe o valor recebido" : a.conta.semContrato ? "sem honorário" : `honorário ${reais(a.conta.honorario)}`}</span>
            </span>
          </button>
        ))}
      </div>
    </Dialogo>
  );
}

function FilaDeLembretes({ aoFechar, aoAbrir }: { aoFechar: () => void; aoAbrir: (parcelaId: string) => void }) {
  const q = useQuery({ queryKey: ["financeiro", "lembretes"], queryFn: () => api<{ itens: { mensagemId: string; parcelaId: string; descricao: string; vencimento: string | null; cliente: { id: string; nome: string }; criadaEm: string }[] }>("/financeiro/lembretes") });
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Lembretes esperando aprovação"
      descricao="A régua deixa o rascunho com o texto que o escritório aprovou. Nada sai sozinho: abra, confira e aprove."
      acoes={
        <Botao variante="primaria" onClick={aoFechar}>
          Fechar
        </Botao>
      }
    >
      {!q.data ? (
        <Carregando linhas={2} />
      ) : (
        <div className="dc-painel dc-linhas">
          {q.data.itens.map((l) => (
            <button key={l.mensagemId} type="button" className="dc-linhas__item w-full cursor-pointer items-center border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => aoAbrir(l.parcelaId)}>
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{l.cliente.nome}</span>
                <span className="dc-celula__2">
                  {l.descricao}
                  {l.vencimento ? ` · vence ${l.vencimento.split("-").reverse().join("/")}` : ""}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialogo>
  );
}

function FilaSemHonorario({ itens, total, aoFechar }: { itens: { id: string; titulo: string; cnj: string | null; cliente: { id: string; nome: string } | null }[]; total: number; aoFechar: () => void }) {
  const avisar = useAviso();
  const atualizar = useAtualizarFinanceiro();
  const [novo, setNovo] = useState<(typeof itens)[number] | null>(null);
  const dispensar = useMutation({
    mutationFn: (id: string) => api(`/financeiro/processos/${id}/aviso`, { method: "PUT", json: { dispensar: true } }),
    onSuccess: atualizar,
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  return (
    <>
      <Dialogo
        aberto
        aoFechar={aoFechar}
        titulo="Processos sem honorário"
        descricao={total > itens.length ? `Os ${itens.length} mais novos de ${total}. Dispensar tira o aviso do processo; o aviso pode voltar pela tela do processo.` : "Dispensar tira o aviso do processo."}
        className="dc-dialogo--largo"
        acoes={
          <Botao variante="primaria" onClick={aoFechar}>
            Fechar
          </Botao>
        }
      >
        <div className="dc-painel dc-linhas">
          {itens.map((p) => (
            <div key={p.id} className="dc-linhas__item items-center">
              <span className="dc-celula min-w-0 flex-1">
                <span className="dc-celula__1">{p.titulo}</span>
                <span className="dc-celula__2">{p.cliente?.nome ?? p.cnj ?? "Extrajudicial"}</span>
              </span>
              <Botao pequeno variante="secundaria" onClick={() => setNovo(p)}>
                Adicionar
              </Botao>
              <Botao pequeno variante="fantasma" onClick={() => dispensar.mutate(p.id)} ocupado={dispensar.isPending && dispensar.variables === p.id}>
                Dispensar
              </Botao>
            </div>
          ))}
        </div>
      </Dialogo>
      {novo && <NovoContrato aberto aoFechar={() => setNovo(null)} caso={{ processo: { id: novo.id, titulo: novo.titulo }, cliente: novo.cliente }} />}
    </>
  );
}
