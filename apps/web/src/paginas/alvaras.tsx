/** Alvarás: do expedido ao repassado para o cliente, com quanto falta receber. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, CircleCheck, Landmark, Plus, Wallet, type LucideIcon } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { Pagina, TelaCelular } from "@/componentes/moldura";
import { EscolherProcesso } from "@/componentes/novo-prazo";
import { ColunaDoQuadro, Quadro } from "@/componentes/rolagem";
import { Botao, Cabecalho, Campo, CampoDeBusca, Carregando, Chip, Faixa, Vazio } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diasDesde, dinheiro, haQuanto, numero, paraValor, valorNoCampo } from "@/lib/formato";
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
const semAcento = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");

type Item = Alvara & { etapa: EtapaAlvara };
type Etapa = { etapa: EtapaAlvara; total: number; itens: Item[] };

/** Há quanto tempo o alvará está na etapa e se passou do normal. */
function naEtapa(a: Item) {
  const chegou = CHEGOU[a.etapa];
  const dia = chegou.dia(a);
  const limite = PARADO[a.etapa];
  const parado = !!dia && limite != null && diasDesde(dia) > limite;
  return { dia, parado, titulo: dia ? `${chegou.rotulo} em ${diaCompleto(dia)}${parado ? `, há mais de ${limite} dias nesta etapa` : ""}` : undefined };
}

/** Há quanto tempo está na etapa. O "há" sai quando o cartão é estreito, para o valor e o tempo caberem na mesma linha. */
function Quando({ a }: { a: Item }) {
  const { dia, parado, titulo } = naEtapa(a);
  if (!dia) return null;
  const texto = haQuanto(dia);
  return (
    <span className={cn("dc-quando", parado && "is-parado")} title={titulo}>
      <span>
        {texto.startsWith("há ") ? (
          <>
            <span className="dc-quando__ha">há </span>
            {texto.slice(3)}
          </>
        ) : (
          texto
        )}
      </span>
    </span>
  );
}

export function AlvarasPage() {
  const celular = useCelular();
  const q = useQuery({ queryKey: ["alvaras"], queryFn: () => api<QuadroDeAlvaras>("/alvaras") });
  const [etapa, setEtapa] = useState<EtapaAlvara>("aguardando_saque");
  const [aberto, setAberto] = useState<string | null>(null);
  const [novo, setNovo] = useState(false);
  const [texto, setTexto] = useState("");
  const [soParados, setSoParados] = useState(false);
  const busca = semAcento(useDeferredValue(texto.trim()));
  const d = q.data;

  // A busca e o filtro dos parados valem para o quadro e para os totais.
  const todas: Etapa[] = (d?.etapas ?? []).map((e) => ({ etapa: e.etapa, total: Number(e.total), itens: e.itens.map((i) => ({ ...i, etapa: e.etapa })) }));
  const parados = todas.flatMap((e) => e.itens).filter((a) => naEtapa(a).parado).length;
  const filtrando = !!busca || soParados;
  const etapas = filtrando
    ? todas.map((e) => {
        const itens = e.itens.filter((a) => (!soParados || naEtapa(a).parado) && (!busca || semAcento([a.cliente, a.descricao, a.processo.titulo, a.processo.cnj].join(" ")).includes(busca)));
        return { ...e, itens, total: itens.reduce((t, a) => t + Number(a.valor), 0) };
      })
    : todas;
  const daEtapa = (x: EtapaAlvara) => etapas.find((e) => e.etapa === x);
  const soma = (...es: EtapaAlvara[]) => es.reduce((t, x) => ({ valor: t.valor + (daEtapa(x)?.total ?? 0), n: t.n + (daEtapa(x)?.itens.length ?? 0) }), { valor: 0, n: 0 });
  const achados = etapas.reduce((t, e) => t + e.itens.length, 0);
  const sub = !d ? " " : filtrando ? `${alvaras(achados)} ${achados === 1 ? "encontrado" : "encontrados"}` : `${alvaras(soma("novo", "aguardando_saque", "sacado").n)} em andamento`;
  const selecionado = todas.flatMap((e) => e.itens).find((i) => i.id === aberto) ?? null;

  /** No desenho do cartão da agenda: em cima, na cor da etapa, o valor e há quanto tempo está nela (o finalizado não precisa); embaixo, quem e o quê. */
  const cartao = (a: Item) => (
    <button key={a.id} type="button" className={cn("dc-cartao dc-alvara", naEtapa(a).parado && "is-parado")} onClick={() => setAberto(a.id)}>
      <span className="dc-alvara__topo">
        <span className="dc-alvara__valor">{dinheiro(a.valor)}</span>
        {a.etapa !== "finalizado" && <Quando a={a} />}
      </span>
      <span className="dc-alvara__cliente">{a.cliente ?? a.processo.titulo}</span>
      <span className="dc-alvara__desc">{a.descricao}</span>
    </button>
  );
  const campo = <CampoDeBusca valor={texto} aoMudar={setTexto} rotulo="Buscar alvará" placeholder="Cliente, processo ou descrição" />;
  const chipParados = parados > 0 && (
    <Chip ligado={soParados} n={parados} onClick={() => setSoParados(!soParados)}>
      Parados
    </Chip>
  );
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
          <div className="dc-filtros">
            {campo}
            <div className="dc-chips">
              {ORDEM.map((e) => (
                <Chip key={e} ligado={etapa === e} n={daEtapa(e)?.itens.length} onClick={() => setEtapa(e)}>
                  <span className={`dc-etapa-ponto dc-etapa--${e}`} aria-hidden />
                  {ETAPA[e]}
                </Chip>
              ))}
            </div>
          </div>
        }
      >
        {!d ? (
          <Carregando />
        ) : lista?.itens.length ? (
          <div className={`dc-lista dc-etapa--${etapa}`}>
            <span className="dc-nota">Total da etapa: {dinheiro(lista.total)}</span>
            {lista.itens.map(cartao)}
          </div>
        ) : (
          <Vazio titulo={busca ? "Nada encontrado nesta etapa" : "Nada nesta etapa"} />
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
          <div className="dc-numeros dc-numeros--alvaras" aria-label="Totais dos alvarás">
            <Total icone={Landmark} etapa="aguardando_saque" rotulo="A sacar" {...soma("novo", "aguardando_saque")} />
            <Total icone={Wallet} etapa="sacado" rotulo="A repassar" {...soma("sacado")} />
            <Total icone={CircleCheck} etapa="repassado" rotulo="Já repassado" {...soma("repassado", "finalizado")} />
          </div>
          <div className="dc-filtros">
            {campo}
            {chipParados}
          </div>
          <Quadro id="alvaras" className="dc-quadro--alvaras">
            {etapas.map((e) => (
              <ColunaDoQuadro key={e.etapa} id={`alvaras-${e.etapa}`} className={`dc-etapa dc-etapa--${e.etapa}`} titulo={ETAPA[e.etapa]} valor={e.itens.length} sub={dinheiro(e.total)}>
                {e.itens.length ? e.itens.map(cartao) : <div className="dc-quadro__vazio">{filtrando ? "Nada encontrado" : "Nada aqui"}</div>}
              </ColunaDoQuadro>
            ))}
          </Quadro>
        </>
      )}
      {dialogos}
    </Pagina>
  );
}

/** Um dos três totais de cima, com o ícone na cor da etapa a que se refere. */
function Total({ icone: Icone, etapa, rotulo, valor, n }: { icone: LucideIcon; etapa: EtapaAlvara; rotulo: string; valor: number; n: number }) {
  return (
    <div className={`dc-contador dc-total dc-etapa--${etapa}`}>
      <span className="dc-total__icone" aria-hidden>
        <Icone />
      </span>
      <span className="dc-total__texto">
        <span className="dc-total__rotulo">{rotulo}</span>
        <span className="dc-total__valor">{dinheiro(valor)}</span>
      </span>
      <span className="dc-total__n">{alvaras(n)}</span>
    </div>
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
