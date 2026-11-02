/**
 * Data viva: toda data de prazo abre a própria conta, em qualquer tela. Um
 * calendário pequeno, a regra e os dias que ficaram de fora, contados pelo motor
 * no calendário do processo. Abre por clique e por teclado, fecha com Esc; no
 * computador fica junto da data, no celular é uma folha que sobe de baixo.
 * Data digitada à mão diz que foi digitada, e nenhuma contagem é inventada.
 */
import type { DiaDaConta } from "@decreta/core";
import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState, type ReactNode } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { diaCompleto, diaCurto, diaDaSemana, prazoEmDias } from "@/lib/formato";
import type { ContaParaAbrir } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { diasEntre, gradeDoMes, inicioDoMes, nomeDoMes, SEMANA_CURTA, somarMeses } from "./calendario";
import { AvisoSemCalendarioProprio, DataDoInterno, duplaIntimacao, foraDaConta, MotivosParaConferir } from "./conta-do-prazo";
import { Dialogo } from "./dialogo";
import { Botao, Carregando, Dados, Faixa } from "./ui";

export type AlvoDaConta = { prazo: string } | { publicacao: string };

const caminho = (alvo: AlvoDaConta) => ("prazo" in alvo ? `/prazos/${alvo.prazo}/conta` : `/publicacoes/${alvo.publicacao}/conta`);
export const contaQuery = (alvo: AlvoDaConta) => ({ queryKey: ["conta", caminho(alvo)], queryFn: () => api<ContaParaAbrir>(caminho(alvo)), staleTime: 30_000, retry: false });

const LEGENDA = { contado: "Conta", publicacao: "Publicada", fora: "Fora da conta", vence: "Vence" };

function sobreODia(d: DiaDaConta): string {
  const dia = diaCurto(d.dia);
  if (d.vence) return `${dia}: vence aqui`;
  if (d.tipo === "publicacao") return `${dia}: publicada, não conta`;
  if (d.tipo === "contado") return `${dia}: ${d.n}º dia`;
  return `${dia}: fora da conta${d.motivo ? `, ${d.motivo}` : ", fim de semana"}`;
}

/** Um mês por vez, da publicação ao vencimento, abrindo no mês do vencimento. */
function CalendarioDaConta({ linha, fim, interno }: { linha: DiaDaConta[]; fim: string; interno?: string }) {
  const [mes, setMes] = useState(() => inicioDoMes(fim));
  const primeiro = inicioDoMes(linha[0]!.dia);
  const ultimo = inicioDoMes(fim);
  const porDia = new Map(linha.map((d) => [d.dia, d]));
  const grade = gradeDoMes(mes);
  const semSetas = primeiro === ultimo;
  return (
    <div className="dc-mesinho">
      <div className="dc-mesinho__topo">
        {!semSetas && (
          <button type="button" className="dc-mesinho__seta" aria-label="Mês anterior" disabled={mes <= primeiro} onClick={() => setMes(somarMeses(mes, -1))}>
            <ChevronLeft aria-hidden />
          </button>
        )}
        <span className="dc-mesinho__nome" aria-live="polite">
          {nomeDoMes(mes)}
        </span>
        {!semSetas && (
          <button type="button" className="dc-mesinho__seta" aria-label="Próximo mês" disabled={mes >= ultimo} onClick={() => setMes(somarMeses(mes, 1))}>
            <ChevronRight aria-hidden />
          </button>
        )}
      </div>
      <div className="dc-mesinho__semana" aria-hidden>
        {SEMANA_CURTA.map((s) => (
          <span key={s}>{s}</span>
        ))}
      </div>
      <div className="dc-mesinho__dias">
        {diasEntre(grade.de, grade.ate).map((dia) => {
          const d = porDia.get(dia);
          const noMes = dia.slice(0, 7) === mes.slice(0, 7);
          return (
            <span
              key={dia}
              className={cn("dc-mesinho__dia dc-num", !noMes && "is-outro-mes", d && `is-${d.tipo}`, d?.vence && "is-vence", dia === interno && "is-interno")}
              title={d ? sobreODia(d) : undefined}
              aria-hidden={!noMes || undefined}
            >
              {Number(dia.slice(8, 10))}
            </span>
          );
        })}
      </div>
      <div className="dc-mesinho__legenda">
        <span className="is-contado">{LEGENDA.contado}</span>
        <span className="is-publicacao">{LEGENDA.publicacao}</span>
        <span className="is-feriado">{LEGENDA.fora}</span>
        <span className="is-vence">{LEGENDA.vence}</span>
      </div>
    </div>
  );
}

/** A conta aberta: a data, o calendário, a regra e o que ficou fora. Também é o que a busca mostra antes de confirmar. */
export function ContaNaTela({ conta: c }: { conta: ContaParaAbrir }) {
  return (
    <div className={cn("dc-conta-viva", c.aberta && !c.digitada && "dc-conta-viva--com-calendario")}>
      <div className="dc-conta-viva__data">
        <span className="dc-rotulo">{c.tipo}</span>
        <strong className="dc-conta-viva__fim dc-num">{diaCompleto(c.fim)}</strong>
        <span className="dc-nota">{diaDaSemana(c.fim)}</span>
      </div>
      {c.aberta && !c.digitada && <CalendarioDaConta linha={c.aberta.linha} fim={c.aberta.fim} interno={c.interno?.dia} />}
      <div className="dc-conta-viva__resto">
        {c.digitada ? (
          <Faixa tipo="aviso">
            <span>
              Data digitada à mão: não saiu da conta do Decreta.{" "}
              {c.pelaConta ? `Pela conta, com ${prazoEmDias(c.dias, c.contagem)}, venceria em ${diaCompleto(c.pelaConta)}.` : "A conta do Decreta chega na mesma data."}
            </span>
          </Faixa>
        ) : (
          <>
            {c.pelaConta && (
              <Faixa tipo="aviso">
                <span>O calendário mudou depois da confirmação: pela conta de hoje, vence em {diaCompleto(c.pelaConta)}. Ajuste o prazo para recontar.</span>
              </Faixa>
            )}
            <Dados
              linhas={[
                // "Dias úteis (CPC, art. 219)" vira "15 dias úteis (CPC, art. 219)".
                ["Regra", `${prazoEmDias(c.dias, c.contagem)}${c.regra.replace(/^[^(]*/, " ")}`.trim()],
                ["Calendário", c.calendario],
                ["Fora da conta", foraDaConta({ desconsiderados: c.fora }, c.contagem)],
                ...(c.prorrogadoDe ? ([["Prorrogado", `Caía em ${diaCurto(c.prorrogadoDe)}, sem expediente completo`]] as [string, string][]) : []),
              ]}
            />
            {c.calendarioCompleto === false && <AvisoSemCalendarioProprio />}
            {c.outra && (
              <Faixa tipo="nota">
                <span>{duplaIntimacao(c.pelo, c.fim, c.outra.fim)}</span>
              </Faixa>
            )}
          </>
        )}
        {c.interno && <Dados linhas={[["Prazo interno", <DataDoInterno key="interno" interno={c.interno} />]]} />}
        <MotivosParaConferir conferencia={c.conferencia} />
      </div>
    </div>
  );
}

function ConteudoDaConta({ alvo }: { alvo: AlvoDaConta }) {
  const q = useQuery(contaQuery(alvo));
  const caminhoDaTela = useRouterState({ select: (s) => s.location.pathname });
  if (q.isPending) return <Carregando linhas={3} />;
  if (!q.data) {
    return (
      <>
        <Faixa tipo="erro">Não consegui abrir a conta agora. {mensagemDoErro(q.error)}</Faixa>
        <Botao pequeno onClick={() => void q.refetch()}>
          Tentar de novo
        </Botao>
      </>
    );
  }
  return (
    <>
      <ContaNaTela conta={q.data} />
      {q.data.prazo && caminhoDaTela !== `/prazos/${q.data.prazo.id}` && (
        <Link to="/prazos/$id" params={{ id: q.data.prazo.id }} className="dc-link self-start">
          Abrir o prazo
        </Link>
      )}
    </>
  );
}

/** A data como botão. Vai em volta do selo ou do texto, que continuam iguais; `texto` sublinha a data solta numa frase. */
export function DataViva({ alvo, texto, children }: { alvo: AlvoDaConta; texto?: boolean; children: ReactNode }) {
  const celular = useCelular();
  const [aberta, setAberta] = useState(false);
  const gatilho = (
    <button
      type="button"
      className={cn("dc-data-viva", texto && "dc-data-viva--texto")}
      aria-haspopup="dialog"
      aria-expanded={aberta}
      title="Ver a conta"
      onClick={(e) => {
        e.stopPropagation();
        if (celular) setAberta(true);
      }}
    >
      {children}
    </button>
  );
  if (celular) {
    return (
      <>
        {gatilho}
        <Dialogo
          aberto={aberta}
          aoFechar={() => setAberta(false)}
          titulo="A conta"
          acoes={
            <Botao bloco onClick={() => setAberta(false)}>
              Fechar
            </Botao>
          }
        >
          <ConteudoDaConta alvo={alvo} />
        </Dialogo>
      </>
    );
  }
  return (
    <Popover.Root open={aberta} onOpenChange={setAberta}>
      <Popover.Trigger asChild>{gatilho}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className="dc-flutuante-conta" aria-label="A conta" align="start" sideOffset={6} collisionPadding={16} onClick={(e) => e.stopPropagation()}>
          <h2 className="dc-painel__titulo">A conta</h2>
          <ConteudoDaConta alvo={alvo} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
