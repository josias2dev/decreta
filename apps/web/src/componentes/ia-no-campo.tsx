/**
 * A IA num campo de texto: um botão discreto no canto, com Escrever, Melhorar e
 * Orientar. O que ela devolve fica numa prévia e só entra no campo com o clique em
 * Usar; o texto de antes continua a um clique de distância. Com a IA fora do ar ou
 * sem limite, a tela diz isso e o campo segue funcionando.
 */
import { contarACompletar, pedacosDoTexto, type CampoComIa, type ModoDoCampo } from "@decreta/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { usoDaIaQuery } from "@/componentes/limite-da-ia";
import { Botao, MarcaIa } from "@/componentes/ui";
import { api, ApiError, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import type { AlvoDoCampo, RespostaDoCampo } from "@/lib/tipos";
import { cn } from "@/lib/util";

const MODOS: { id: ModoDoCampo; rotulo: string; sobre: string; pensando: string }[] = [
  { id: "escrever", rotulo: "Escrever", sobre: "A partir do seu rascunho e do que o sistema sabe do caso.", pensando: "Escrevendo…" },
  { id: "melhorar", rotulo: "Melhorar", sobre: "Reescreve o que está no campo, sem fato novo.", pensando: "Reescrevendo…" },
  { id: "orientar", rotulo: "Orientar", sobre: "Dicas do que escrever, sem texto para colar.", pensando: "Pensando nas dicas…" },
];

/** A IA pode ser usada aqui: ligada no servidor, cliente que não recusou e escritório que pode gravar. */
export function useIaDisponivel(semIa?: boolean): boolean {
  const eu = useQuery(euQuery);
  return !!eu.data?.ia && !semIa && (eu.data.assinatura?.acesso ?? "total") === "total";
}

/** O texto com cada [a completar] destacado. */
export function ComACompletar({ texto }: { texto: string }) {
  return (
    <>
      {pedacosDoTexto(texto).map((p, i) =>
        p.marca ? (
          <mark key={i} className="dc-a-completar">
            {p.texto}
          </mark>
        ) : (
          p.texto
        ),
      )}
    </>
  );
}

const quantos = (n: number) => `${n} a completar`;

/** O painel da IA abre embaixo do campo: num diálogo ou no celular, pode nascer fora da vista. */
export const aparecer = (el: HTMLElement | null) => el?.scrollIntoView({ block: "nearest" });

export function IaNoCampo({
  campo,
  alvo = {},
  semIa,
  valor,
  aoUsar,
  children,
}: {
  campo: CampoComIa;
  alvo?: AlvoDoCampo;
  semIa?: boolean;
  valor: string;
  aoUsar: (texto: string) => void;
  /** O campo em si: um textarea. */
  children: ReactNode;
}) {
  const qc = useQueryClient();
  const disponivel = useIaDisponivel(semIa);
  const [aberto, setAberto] = useState(false);
  /** A API disse que este cliente recusou a IA (a pessoa escolheu o cliente depois de abrir a tela). */
  const [recusou, setRecusou] = useState(false);
  /** O texto de antes do Usar. Voltar troca os dois: nada que estava no campo se perde. */
  const [anterior, setAnterior] = useState<string | null>(null);
  const ultimoUsado = useRef<string | null>(null);
  const controle = useRef<AbortController | null>(null);

  const pedir = useMutation({
    mutationFn: (modo: ModoDoCampo) => {
      controle.current = new AbortController();
      return api<RespostaDoCampo>("/ia/campo", { json: { campo, modo, texto: valor, alvo }, signal: controle.current.signal });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === "cliente_sem_ia") setRecusou(true);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: usoDaIaQuery.queryKey }),
  });

  const fechar = () => {
    controle.current?.abort();
    pedir.reset();
    setAberto(false);
  };
  const usar = (id: string, texto: string) => {
    // Usar de novo sem ter mexido no campo: o de antes continua sendo o rascunho da pessoa, não a outra versão da IA.
    const semMexer = valor === ultimoUsado.current;
    setAnterior((a) => (a !== null && semMexer ? a : valor));
    ultimoUsado.current = texto;
    aoUsar(texto);
    // A marca de que foi usado é só registro: se falhar, o texto já está no campo.
    void api(`/ia/campo/${id}/usado`, { method: "POST" }).catch(() => {});
    fechar();
  };

  const modo = MODOS.find((m) => m.id === pedir.variables);
  const r = pedir.data;
  const erro = pedir.error;
  // Limite que só volta amanhã e cliente que recusou não têm "tentar de novo".
  const podeTentar = erro instanceof ApiError ? erro.status >= 500 || !!erro.passaLogo : !!erro;
  const faltam = contarACompletar(valor);
  const vazio = !valor.trim();

  return (
    <div className="dc-ia-campo">
      <div className="dc-ia-campo__caixa">
        {children}
        {disponivel && !recusou && (
          <button type="button" className={cn("dc-ia-campo__botao", aberto && "is-on")} aria-label="Pedir ajuda da IA neste campo" title="Pedir ajuda da IA" aria-expanded={aberto} onClick={() => (aberto ? fechar() : setAberto(true))}>
            IA
          </button>
        )}
      </div>
      {faltam > 0 && (
        <p className="dc-ia-campo__falta" role="status">
          {faltam === 1 ? "Falta 1 dado marcado como [a completar]." : `Faltam ${faltam} dados marcados como [a completar].`} Troque pelo dado certo.
        </p>
      )}
      {anterior !== null && (
        <button
          type="button"
          className="dc-link dc-ia-campo__voltar"
          onClick={() => {
            aoUsar(anterior);
            setAnterior(valor);
            ultimoUsado.current = anterior;
          }}
        >
          Voltar ao texto de antes
        </button>
      )}
      {aberto && (
        <section key={pedir.status} ref={aparecer} className="dc-ia dc-ia-campo__painel" role="region" aria-label={r?.situacao === "pronto" ? "Prévia da IA" : "Ajuda da IA"} aria-busy={pedir.isPending || undefined}>
          {pedir.isPending ? (
            <>
              <Topo titulo={modo?.pensando ?? "Pensando…"} />
              <div className="flex flex-col gap-2" aria-label="A IA está escrevendo">
                <div className="dc-ia__linha dc-ia__linha--1" />
                <div className="dc-ia__linha dc-ia__linha--2" />
                <div className="dc-ia__linha dc-ia__linha--3" />
              </div>
              <div className="dc-ia-campo__acoes">
                <Botao variante="fantasma" pequeno onClick={fechar}>
                  Cancelar
                </Botao>
              </div>
            </>
          ) : erro ? (
            <>
              <Topo titulo={modo?.rotulo ?? "IA"} />
              <p className="dc-ia-campo__erro" role="alert">
                {mensagemDoErro(erro)}
              </p>
              <div className="dc-ia-campo__acoes">
                {podeTentar && (
                  <Botao pequeno onClick={() => pedir.mutate(modo!.id)}>
                    Tentar de novo
                  </Botao>
                )}
                <Botao variante="fantasma" pequeno onClick={fechar}>
                  Fechar
                </Botao>
              </div>
            </>
          ) : r?.situacao === "recusa" ? (
            <>
              <Topo titulo={modo?.rotulo ?? "IA"} />
              <p className="dc-ia-campo__texto">{r.motivo}</p>
              <div className="dc-ia-campo__acoes">
                <Botao variante="fantasma" pequeno onClick={fechar}>
                  Fechar
                </Botao>
              </div>
            </>
          ) : r?.texto != null ? (
            <>
              <Topo titulo="Prévia: ainda não entrou no campo" falta={r.aCompletar} />
              <p className="dc-ia-campo__texto">
                <ComACompletar texto={r.texto} />
              </p>
              {r.aCompletar > 0 && <p className="dc-ia-campo__nota">Data, valor, nome ou número que não estava na fonte ficou como [a completar]. Quem completa é você.</p>}
              <p className="dc-ia-campo__nota">Gerado por IA. Confira nos autos.</p>
              <div className="dc-ia-campo__acoes">
                <Botao variante="ia" pequeno onClick={() => usar(r.id, r.texto!)}>
                  Usar
                </Botao>
                <Botao variante="fantasma" pequeno onClick={fechar}>
                  Descartar
                </Botao>
              </div>
            </>
          ) : r ? (
            <>
              <Topo titulo="Dicas do que escrever" falta={r.aCompletar} />
              <ul className="dc-ia-campo__dicas">
                {r.dicas.map((d) => (
                  <li key={d}>
                    <ComACompletar texto={d} />
                  </li>
                ))}
              </ul>
              <p className="dc-ia-campo__nota">Gerado por IA. Confira nos autos.</p>
              <div className="dc-ia-campo__acoes">
                <Botao variante="fantasma" pequeno onClick={fechar}>
                  Fechar
                </Botao>
              </div>
            </>
          ) : (
            <>
              <div className="dc-ia__topo">
                <MarcaIa />
                <span className="dc-ia__titulo">O que a IA faz neste campo</span>
                <button type="button" className="dc-ia-campo__fechar" aria-label="Fechar a ajuda da IA" onClick={fechar}>
                  <X aria-hidden />
                </button>
              </div>
              <div className="dc-ia-campo__modos" role="group" aria-label="Como a IA ajuda">
                {MODOS.map((m) => {
                  const desligado = m.id === "melhorar" && vazio;
                  return (
                    <button key={m.id} type="button" className="dc-ia-campo__modo" disabled={desligado} onClick={() => pedir.mutate(m.id)}>
                      <strong>{m.rotulo}</strong>
                      <span>{desligado ? "Escreva algo no campo para a IA melhorar." : m.sobre}</span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}

function Topo({ titulo, falta = 0 }: { titulo: string; falta?: number }) {
  return (
    <div className="dc-ia__topo">
      <MarcaIa />
      <span className="dc-ia__titulo">{titulo}</span>
      {falta > 0 && <span className="dc-ia-campo__quantos">{quantos(falta)}</span>}
    </div>
  );
}
