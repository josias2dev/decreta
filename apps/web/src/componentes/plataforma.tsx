/**
 * O que as telas da plataforma têm em comum: a moldura (com o 404 para quem não é operador e o aviso da verificação
 * em duas etapas), os números do topo, o gráfico de colunas, o medidor e o diálogo de agir num escritório.
 */
import { ROTULO_DA_SITUACAO, type EscritorioDaPlataforma, type EscritorioNaLista, type SituacaoDoEscritorio } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useAviso, Avisos } from "@/componentes/avisos";
import { Dialogo } from "@/componentes/dialogo";
import { IrParaEntrar, Pagina } from "@/componentes/moldura";
import { NaoEncontrada } from "@/componentes/nao-encontrada";
import { Botao, Campo, Faixa } from "@/componentes/ui";
import { ApiError, apiPlataforma, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { AcaoDaPlataforma } from "@/lib/tipos";
import { cn } from "@/lib/util";

/* ---------------- Números ---------------- */

export const reais = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(centavos / 100);
/** Sem os centavos: "R$ 1.980". Para os números grandes do topo. */
export const reaisRedondos = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(centavos / 100);
export const reaisCurtos = (centavos: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 }).format(centavos / 100);
export const usd = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(v);
export const usdCurto = (v: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: v >= 10 ? 0 : 1 }).format(v);
export const percentual = (f: number) => `${(f * 100).toFixed(1).replace(".", ",")}%`;
export const plural = (n: number, um: string, varios: string) => `${new Intl.NumberFormat("pt-BR").format(n)} ${n === 1 ? um : varios}`;

/** A cor só diz uma coisa: vermelho e âmbar para o que pede atenção, verde para quem paga em dia. */
export const SELO: Record<SituacaoDoEscritorio, "vencido" | "hoje" | "cumprido" | "prazo"> = {
  teste: "prazo",
  ativo: "cumprido",
  inadimplente: "hoje",
  so_leitura: "vencido",
  bloqueado: "vencido",
  cancelado: "prazo",
  cortesia: "prazo",
};

export const escritoriosQuery = { queryKey: ["plataforma", "escritorios"], queryFn: () => apiPlataforma<{ escritorios: EscritorioNaLista[] }>("/escritorios"), retry: false } as const;

/** O que importa de cada escritório numa frase: o teste, o atraso, o cancelamento ou o que paga. */
export function andamento(e: EscritorioDaPlataforma): string {
  if (e.situacao === "teste" && e.testeAte) return `Até ${diaCurto(e.testeAte)} · ${plural(e.diasRestantesDoTeste ?? 0, "dia", "dias")}`;
  if (e.situacao === "so_leitura" && e.situacaoGravada === "teste" && e.testeAte) return `Acabou em ${diaCurto(e.testeAte)}`;
  if (e.diasDeAtraso !== null) return `${plural(e.diasDeAtraso, "dia", "dias")} de atraso`;
  if (e.cancelamentoPedidoEm && e.acessoAte) return `Cancelou · até ${diaCurto(e.acessoAte)}`;
  if (e.valorMensalCentavos && (e.situacao === "ativo" || e.situacao === "inadimplente")) return `${reais(e.valorMensalCentavos)} por mês`;
  return "—";
}

/* ---------------- A moldura ---------------- */

/**
 * A tela da plataforma, fora do menu do escritório. Quem não é operador recebe 404 da API e a tela some, como se o
 * endereço não existisse; o operador sem a verificação em duas etapas vê o que falta ligar.
 */
export function MolduraDaPlataforma({ children }: { children: ReactNode }) {
  const eu = useQuery(euQuery);
  const lista = useQuery(escritoriosQuery);
  if (eu.error instanceof ApiError && eu.error.status === 401) return <IrParaEntrar />;
  if (lista.error instanceof ApiError && lista.error.status === 404) return <NaoEncontrada />;
  if (lista.error instanceof ApiError && lista.error.code === "plataforma_2fa") return <LigueAsDuasEtapas />;
  return (
    <Avisos>
      <div className="dc dc-app dc-app--sozinho" data-menu="recolhido">
        <div className="dc-conteudo">
          <Pagina larga className="dc-plataforma">{children}</Pagina>
        </div>
      </div>
    </Avisos>
  );
}

function LigueAsDuasEtapas() {
  return (
    <div className="dc dc-entrada">
      <div className="dc-entrada__caixa">
        <section className="dc-painel">
          <div className="dc-painel__corpo dc-form">
            <h1 className="dc-h1">Ligue a verificação em duas etapas</h1>
            <p className="dc-sub m-0">O painel da plataforma mostra a conta de todos os escritórios e deixa bloquear, liberar e mandar links de senha. Por isso ele só abre para quem entra com a senha e o código do aplicativo.</p>
            <div className="flex flex-wrap gap-2">
              <Link to="/conta" className="dc-btn dc-btn--primaria dc-btn--md">
                Ligar em Minha conta
              </Link>
              <Link to="/hoje" className="dc-btn dc-btn--secundaria dc-btn--md">
                Voltar ao app
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

/* ---------------- Os números do topo ---------------- */

export function Kpis({ children, rotulo }: { children: ReactNode; rotulo: string }) {
  return (
    <div className="dc-kpis" aria-label={rotulo}>
      {children}
    </div>
  );
}

export function Kpi({ rotulo, n, sub, alerta }: { rotulo: string; n: string; sub?: ReactNode; alerta?: "hoje" | "vencido" | false }) {
  return (
    <div className={cn("dc-kpi", alerta === "hoje" && "dc-kpi--alerta", alerta === "vencido" && "dc-kpi--vencido")}>
      <span className="dc-kpi__rotulo">{rotulo}</span>
      <span className="dc-kpi__n">{n}</span>
      {sub && <span className="dc-kpi__sub">{sub}</span>}
    </div>
  );
}

export function Linha({ rotulo, valor, sub }: { rotulo: ReactNode; valor: ReactNode; sub?: ReactNode }) {
  return (
    <div className="dc-linhas__item items-center">
      <span className="dc-celula min-w-0 flex-1">
        <span className="dc-t-corpo">{rotulo}</span>
        {sub && <span className="dc-celula__2">{sub}</span>}
      </span>
      <span className="dc-num flex-none dc-t-corpo font-medium">{valor}</span>
    </div>
  );
}

/** A fração (0 a 1) num traço que enche, com o percentual ao lado. */
export function Medidor({ fracao }: { fracao: number | null }) {
  return (
    <span className="dc-medidor">
      <span className="dc-medidor__trilho" aria-hidden>
        <span className="dc-medidor__cheio" style={{ width: `${Math.min(1, Math.max(0, fracao ?? 0)) * 100}%` }} />
      </span>
      <span className="dc-medidor__n">{fracao === null ? "—" : `${Math.round(fracao * 100)}%`}</span>
    </span>
  );
}

/* ---------------- As colunas ---------------- */

export interface Coluna {
  chave: string;
  /** O que vai embaixo da coluna (só algumas aparecem, para não encavalar). */
  eixo: string;
  /** O primeiro texto da dica. */
  titulo: string;
  valor: number;
  detalhe?: string;
}

/** Um teto redondo para a escala: 1, 2, 2,5 ou 5 vezes uma potência de 10. */
function topoRedondo(v: number, inteiro: boolean): number {
  if (v <= 0) return inteiro ? 2 : 1;
  const e = 10 ** Math.floor(Math.log10(v));
  const f = v / e;
  const t = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * e;
  return inteiro ? Math.max(2, Math.ceil(t / 2) * 2) : t;
}

function useLargura() {
  const ref = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, largura] as const;
}

/**
 * A dica fica em cima da coluna; quando a coluna quase chega ao topo, vai para o lado dela (à esquerda na metade
 * direita do gráfico), presa no alto, para não cobrir o título do painel.
 */
function posicaoDaDica(centro: number, topo: number, barra: number, aDireita: boolean): CSSProperties {
  if (topo > 64) return { left: `clamp(72px, ${centro}px, calc(100% - 72px))`, top: topo, transform: "translate(-50%, calc(-100% - 8px))" };
  return { left: centro + (aDireita ? -1 : 1) * (barra / 2 + 8), top: TOPO, transform: aDireita ? "translateX(-100%)" : "none" };
}

const ESQUERDA = 56;
const TOPO = 8;
const BASE = 22;

/**
 * Colunas de uma série só. Barras finas (até 24 px) presas na base, com a ponta arredondada; a grade fica clara e os
 * números do eixo, na tinta. Passar o mouse (ou as setas, com o foco no gráfico) mostra a dica da coluna; a tabela
 * por trás fica para o leitor de tela.
 */
export function Colunas({ pontos, formatar, formatarEixo, rotulo, altura = 168, inteiro }: { pontos: Coluna[]; formatar: (v: number) => string; formatarEixo?: (v: number) => string; rotulo: string; altura?: number; inteiro?: boolean }) {
  const [caixa, largura] = useLargura();
  const [ativo, setAtivo] = useState<number | null>(null);
  const util = Math.max(0, largura - ESQUERDA);
  const alto = altura - TOPO - BASE;
  const topo = topoRedondo(Math.max(0, ...pontos.map((p) => p.valor)), !!inteiro);
  const marcas = inteiro && topo % 2 ? [0, topo] : [0, topo / 2, topo];
  const fatia = pontos.length ? util / pontos.length : 0;
  const barra = Math.min(24, Math.max(2, fatia * 0.62));
  const y = (v: number) => TOPO + alto - (v / topo) * alto;
  // Os rótulos de baixo: um a cada tantos, contando da última coluna (a de agora sempre tem).
  const passo = Math.max(1, Math.ceil(pontos.length / Math.max(1, Math.floor(util / 46))));
  const noEixo = formatarEixo ?? formatar;
  const mover = (ev: KeyboardEvent) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    setAtivo((a) => Math.min(pontos.length - 1, Math.max(0, (a ?? pontos.length - 1) + (ev.key === "ArrowLeft" ? -1 : 1))));
  };
  const dica = ativo !== null ? pontos[ativo] : undefined;
  return (
    <div
      className={cn("dc-colunas-grafico", dica && "is-ativo")}
      role="group"
      aria-label={rotulo}
      tabIndex={0}
      onKeyDown={mover}
      onFocus={() => setAtivo((a) => a ?? pontos.length - 1)}
      onBlur={() => setAtivo(null)}
      onMouseLeave={() => setAtivo(null)}
    >
      <div ref={caixa} className="dc-colunas-grafico__area" style={{ height: altura }}>
      {largura > 0 && (
        <svg width={largura} height={altura} aria-hidden>
          {marcas.map((m) => (
            <g key={m}>
              <line className={m === 0 ? "dc-colunas-grafico__base" : "dc-colunas-grafico__grade"} x1={ESQUERDA} x2={largura} y1={y(m) + 0.5} y2={y(m) + 0.5} />
              <text className="dc-colunas-grafico__eixo" x={ESQUERDA - 8} y={y(m) + 4} textAnchor="end">
                {noEixo(m)}
              </text>
            </g>
          ))}
          {pontos.map((p, i) => {
            const x = ESQUERDA + fatia * i + (fatia - barra) / 2;
            const h = Math.max(0, y(0) - y(p.valor));
            const r = Math.min(4, barra / 2, h);
            const yt = y(p.valor);
            const yb = y(0);
            return (
              <g key={p.chave}>
                {h > 0 && <path className={cn("dc-colunas-grafico__barra", ativo === i && "is-on")} d={`M${x},${yb} V${yt + r} Q${x},${yt} ${x + r},${yt} H${x + barra - r} Q${x + barra},${yt} ${x + barra},${yt + r} V${yb} Z`} />}
                {(pontos.length - 1 - i) % passo === 0 && (
                  <text className="dc-colunas-grafico__eixo" x={ESQUERDA + fatia * (i + 0.5)} y={altura - 6} textAnchor="middle">
                    {p.eixo}
                  </text>
                )}
                <rect className="dc-colunas-grafico__alvo" x={ESQUERDA + fatia * i} y={0} width={fatia} height={altura} onMouseEnter={() => setAtivo(i)} />
              </g>
            );
          })}
        </svg>
      )}
      {dica && ativo !== null && (
        <div className="dc-colunas-grafico__dica" style={posicaoDaDica(ESQUERDA + fatia * (ativo + 0.5), y(dica.valor), barra, ativo >= pontos.length / 2)}>
          <span className="dc-colunas-grafico__dica-titulo">{dica.titulo}</span>
          <span className="dc-colunas-grafico__dica-valor">{formatar(dica.valor)}</span>
          {dica.detalhe && <span className="dc-colunas-grafico__dica-detalhe">{dica.detalhe}</span>}
        </div>
      )}
      </div>
      <table className="sr-only">
        <caption>{rotulo}</caption>
        <tbody>
          {pontos.map((p) => (
            <tr key={p.chave}>
              <th scope="row">{p.titulo}</th>
              <td>{formatar(p.valor)}</td>
              {p.detalhe && <td>{p.detalhe}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Agir num escritório ---------------- */

export type NomeDaAcaoNoEscritorio = "liberar" | "estender_teste" | "so_leitura" | "bloquear" | "cortesia" | "reativar";

const ACOES: { id: NomeDaAcaoNoEscritorio; rotulo: string; ajuda: string; vale: (e: EscritorioDaPlataforma) => boolean }[] = [
  { id: "liberar", rotulo: "Liberar da avaliação", ajuda: "Tira os tetos menores de WhatsApp, convites e IA dos escritórios novos.", vale: (e) => e.emAvaliacao },
  { id: "estender_teste", rotulo: "Estender o teste", ajuda: "Soma dias ao fim do teste, ou a partir de hoje se ele já acabou.", vale: (e) => e.situacaoGravada === "teste" },
  { id: "so_leitura", rotulo: "Pôr em só leitura", ajuda: "O escritório vê tudo, mas não salva nada novo, e a captura, o WhatsApp e a IA param, até alguém reativar.", vale: (e) => e.situacaoGravada !== "so_leitura" },
  { id: "bloquear", rotulo: "Bloquear", ajuda: "Ninguém usa o escritório; só paga, leva os dados e encerra. Nada é apagado.", vale: (e) => e.situacaoGravada !== "bloqueado" },
  { id: "cortesia", rotulo: "Dar cortesia", ajuda: "Acesso total e sem cobrança, até alguém reativar.", vale: (e) => e.situacaoGravada !== "cortesia" },
  { id: "reativar", rotulo: "Reativar", ajuda: "Desfaz a restrição ou a cortesia. Quem assina volta a ser ativo; quem não assina abre um teste novo.", vale: (e) => ["so_leitura", "bloqueado", "cortesia"].includes(e.situacaoGravada) },
];

export function AgirNoEscritorio({ escritorio, aoFechar }: { escritorio: EscritorioDaPlataforma | null; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [acao, setAcao] = useState<NomeDaAcaoNoEscritorio | "">("");
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
              <select id="pl-acao" value={escolhida?.id ?? ""} onChange={(ev) => setAcao(ev.target.value as NomeDaAcaoNoEscritorio)}>
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

/* ---------------- O que fica registrado ---------------- */

export const ROTULO_DA_ACAO: Record<string, string> = {
  "plataforma.liberar": "Liberou da avaliação",
  "plataforma.estender_teste": "Estendeu o teste",
  "plataforma.so_leitura": "Pôs em só leitura",
  "plataforma.bloquear": "Bloqueou",
  "plataforma.cortesia": "Deu cortesia",
  "plataforma.reativar": "Reativou",
  "plataforma.encerrar_sessoes": "Encerrou as sessões",
  "plataforma.nova_senha": "Mandou link de nova senha",
  "plataforma.confirmar_email": "Reenviou a confirmação do e-mail",
  "plataforma.desligar_2fa": "Desligou a verificação em duas etapas",
  "plataforma.suspender": "Suspendeu a pessoa",
  "plataforma.reativar_pessoa": "Reativou a pessoa",
  "plataforma.licenca": "Mudou o plano e o valor",
  "plataforma.desconto": "Deu um desconto",
  "plataforma.tirar_desconto": "Tirou o desconto",
  "plataforma.cupom": "Aplicou um cupom",
  "plataforma.tetos_ia": "Mudou os tetos de IA do escritório",
  "plataforma.estender_acesso": "Estendeu o acesso",
  "plataforma.marcar": "Mudou a marca",
  "plataforma.novo_link": "Tirou do ar o link de pagamento",
  "plataforma.encerrar": "Encerrou a pedido do escritório",
  "plataforma.nota": "Anotou na ficha",
  "plataforma.retorno_feito": "Fez o retorno marcado",
  "plataforma.plano_criado": "Criou um plano",
  "plataforma.plano_mudado": "Mudou um plano (versão nova)",
  "plataforma.plano_padrao": "Mudou o plano padrão",
  "plataforma.cupom_criado": "Criou um cupom",
  "plataforma.cupom_desativado": "Desativou um cupom",
  "plataforma.ajuste": "Mudou um ajuste da plataforma",
};

/** O que as ações da plataforma inteira (planos, cupons, ajustes) mudaram, já que elas não são de um escritório. */
function doQueFoi(a: AcaoDaPlataforma): string | null {
  const d = a.detalhes as Record<string, unknown>;
  const para = d.para as { nome?: string; versao?: number; mensalCentavos?: number | null } | string | null | undefined;
  switch (a.acao) {
    case "plataforma.ajuste":
      return typeof d.rotulo === "string" ? `${d.rotulo}: ${String(d.de)} → ${String(d.para)}${d.padrao ? " (padrão)" : ""}` : null;
    case "plataforma.plano_criado":
    case "plataforma.plano_mudado":
      return para && typeof para === "object" ? `${para.nome} v${para.versao} · ${para.mensalCentavos == null ? "sem preço" : reais(para.mensalCentavos)}` : null;
    case "plataforma.plano_padrao":
      return typeof para === "string" ? `agora ${para}` : null;
    case "plataforma.cupom_criado":
    case "plataforma.cupom_desativado":
      return typeof d.codigo === "string" ? d.codigo : null;
    default:
      return null;
  }
}

export function ItensDaAuditoria({ itens, comEscritorio = true }: { itens: AcaoDaPlataforma[]; comEscritorio?: boolean }) {
  return (
    <div className="dc-linhas">
      {itens.map((a) => {
        const motivo = typeof a.detalhes.motivo === "string" ? a.detalhes.motivo : null;
        const dias = typeof a.detalhes.dias === "number" ? `+${plural(a.detalhes.dias, "dia", "dias")}` : null;
        const pessoa = typeof a.detalhes.pessoa === "string" ? a.detalhes.pessoa : null;
        const assunto = doQueFoi(a);
        const onde = [pessoa, assunto, comEscritorio && !assunto ? (a.escritorio ?? (pessoa ? null : "escritório apagado")) : null].filter(Boolean).join(" · ");
        return (
          <div key={a.id} className="dc-linhas__item">
            <span className="dc-num w-[132px] flex-none dc-t-meta text-[var(--tinta-2)]">
              {diaCurto(diaDoInstante(a.em))} {hora(a.em)}
            </span>
            <span className="dc-celula min-w-0 flex-1">
              <span className="dc-celula__1">
                {ROTULO_DA_ACAO[a.acao] ?? a.acao}
                {onde ? ` · ${onde}` : ""}
              </span>
              <span className="dc-celula__2">{[a.operador, dias, motivo].filter(Boolean).join(" · ")}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
