/**
 * A base legal que se explica: a partir de "O que fazer", a tabela fixa preenche
 * sem IA; se ela não sabe, a IA sugere, e a sugestão só entra com o clique em Usar.
 * O texto da lei fica ao lado, e sem o texto a tela diz isso. A pessoa continua
 * podendo digitar qualquer coisa, e nada aqui confirma o prazo ou mexe na data.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { aparecer, useIaDisponivel } from "@/componentes/ia-no-campo";
import { usoDaIaQuery } from "@/componentes/limite-da-ia";
import { Botao, Campo, MarcaIa } from "@/componentes/ui";
import { api, ApiError, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCurto, diaDoInstante } from "@/lib/formato";
import type { ConsultaDaBaseLegal, LeiDaBase, RespostaDaBaseLegal } from "@/lib/tipos";
import { cn } from "@/lib/util";

/** Depois de parar de digitar: cada artigo novo pode ir buscar a lei na fonte. */
const ESPERA_AO_DIGITAR_MS = 400;

function useAtrasado<T>(valor: T): T {
  const [atrasado, setAtrasado] = useState(valor);
  useEffect(() => {
    const relogio = setTimeout(() => setAtrasado(valor), ESPERA_AO_DIGITAR_MS);
    return () => clearTimeout(relogio);
  }, [valor]);
  return atrasado;
}

const igual = (a: string, b: string) => a.replace(/\s+/g, " ").trim().toLowerCase() === b.replace(/\s+/g, " ").trim().toLowerCase();

/** A marca que diz de onde veio. Da IA, "sugerida" fica até o artigo ser achado no acervo. */
function MarcaDaBase({ origem, achada }: { origem: "tabela" | "ia"; achada: boolean }) {
  if (origem === "tabela") return <span className="dc-base-legal__marca dc-base-legal__marca--tabela">Da tabela do Decreta</span>;
  return <span className={cn("dc-base-legal__marca", achada ? "dc-base-legal__marca--achada" : "dc-base-legal__marca--sugerida")}>{achada ? "Da IA, artigo achado no acervo" : "Sugerida pela IA"}</span>;
}

const todasAchadas = (lei: LeiDaBase[] | undefined) => !!lei?.length && lei.every((l) => l.selo === "verificada");

/** O texto da lei, ou a razão de não haver texto. */
export function TextoDaLei({ lei, reconhecida, buscando, falhou }: { lei: LeiDaBase[]; reconhecida: boolean; buscando: boolean; falhou: boolean }) {
  return (
    <section className="dc-lei" role="region" aria-label="O que diz a lei" aria-busy={buscando || undefined}>
      <p className="dc-lei__titulo">O que diz a lei</p>
      {falhou ? (
        <p className="dc-lei__motivo">Não consegui buscar o texto da lei agora. O que está no campo continua valendo.</p>
      ) : buscando && !lei.length ? (
        <p className="dc-lei__motivo">Buscando o texto da lei…</p>
      ) : !reconhecida || !lei.length ? (
        <p className="dc-lei__motivo">Não reconheci um artigo de lei neste texto, então não tenho o que mostrar. Pode deixar assim. Para eu procurar, escreva como “art. 335 do CPC”.</p>
      ) : (
        lei.map((l) => (
          <div key={l.trecho} className="dc-lei__item">
            <span className="dc-lei__artigo">{l.trecho}</span>
            {l.texto ? <p className="dc-lei__texto">{l.texto}</p> : <p className="dc-lei__motivo">Não tenho o texto deste artigo aqui. {l.motivo}</p>}
            {l.texto && l.selo !== "verificada" && <p className="dc-lei__motivo">{l.motivo}</p>}
            {l.fonte && (
              <a className="dc-lei__fonte" href={l.fonte.url} target="_blank" rel="noopener noreferrer">
                {l.fonte.nome}, copiado em {diaCurto(diaDoInstante(l.fonte.capturadoEm))} <ExternalLink aria-hidden />
              </a>
            )}
            {l.texto && <p className="dc-lei__motivo">Cópia para leitura. O texto oficial é o do Diário Oficial.</p>}
          </div>
        ))
      )}
    </section>
  );
}

export function CampoBaseLegal({
  id,
  valor,
  aoMudar,
  tipo,
  processoId,
  publicacaoId,
  semIa,
  sugeridaPelaIa,
  placeholder,
}: {
  id: string;
  valor: string;
  aoMudar: (v: string) => void;
  /** "O que fazer". */
  tipo: string;
  processoId?: string | null;
  publicacaoId?: string | null;
  semIa?: boolean;
  /** O que a IA já tinha lido da publicação: entra com a marca de sugerida. */
  sugeridaPelaIa?: string | null;
  placeholder?: string;
}) {
  const qc = useQueryClient();
  const tipoAtrasado = useAtrasado(tipo.trim());
  const valorAtrasado = useAtrasado(valor.trim());
  const consulta = useQuery({
    queryKey: ["base-legal", processoId ?? null, tipoAtrasado, valorAtrasado],
    queryFn: () => api<ConsultaDaBaseLegal>("/base-legal", { json: { tipo: tipoAtrasado, processoId: processoId ?? null, fundamento: valorAtrasado || null } }),
    enabled: tipoAtrasado.length >= 2 || valorAtrasado.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  });
  const tabela = consulta.data?.tabela ?? null;
  const iaDisponivel = useIaDisponivel(semIa || consulta.data?.semIa);
  const [daIa, setDaIa] = useState<{ fundamento: string; explicacao: string | null } | null>(sugeridaPelaIa ? { fundamento: sugeridaPelaIa, explicacao: null } : null);

  // A tabela preenche o campo vazio e troca o que ela mesma pôs. O que a pessoa digitou, apagou ou aceitou da IA fica.
  const ultimaDaTabela = useRef<string | null>(null);
  const novaDaTabela = consulta.isPlaceholderData || !consulta.data ? undefined : (consulta.data.tabela?.fundamento ?? null);
  useEffect(() => {
    if (novaDaTabela === undefined || novaDaTabela === ultimaDaTabela.current) return;
    const antiga = ultimaDaTabela.current;
    ultimaDaTabela.current = novaDaTabela;
    if (!valor.trim() || valor === antiga) aoMudar(novaDaTabela ?? "");
    // Só quando a tabela muda: `valor` entra na decisão, mas digitar não é motivo para decidir de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novaDaTabela]);

  // A sugestão vale para o ato e o processo pedidos: mudou um deles, a resposta velha sai da tela.
  const pedido = `${processoId ?? ""}|${tipo.trim()}`;
  const sugerir = useMutation({
    mutationFn: (_pedido: string) => api<RespostaDaBaseLegal>("/ia/base-legal", { json: { tipo: tipo.trim(), processoId: processoId ?? null, publicacaoId: publicacaoId ?? null } }),
    onSettled: () => void qc.invalidateQueries({ queryKey: usoDaIaQuery.queryKey }),
  });
  const deste = sugerir.variables === pedido;
  const r = deste ? sugerir.data : undefined;
  const erro = deste ? sugerir.error : null;
  const pensando = deste && sugerir.isPending;
  const podeTentar = erro instanceof ApiError ? erro.status >= 500 || !!erro.passaLogo : !!erro;

  const preenchido = !!valor.trim();
  const origem = !preenchido ? null : tabela && igual(valor, tabela.fundamento) ? ("tabela" as const) : daIa && igual(valor, daIa.fundamento) ? ("ia" as const) : null;
  // Enquanto a consulta do que está no campo não chega, a lei mostrada ainda é a de antes.
  const atual = !consulta.isPlaceholderData && igual(valorAtrasado, valor);
  const buscando = preenchido && (consulta.isFetching || !atual);
  const mostrarLei = preenchido;
  const podeSugerir = iaDisponivel && tipo.trim().length >= 2 && !tabela && !consulta.isFetching && origem !== "ia" && !r && !erro && !pensando;

  /** O texto que estava no campo antes de um clique trocar. Voltar troca os dois: nada se perde. */
  const [antes, setAntes] = useState<string | null>(null);
  const trocarPor = (novo: string) => {
    if (preenchido && !igual(valor, novo)) setAntes(valor);
    aoMudar(novo);
  };
  const usarSugestao = (resposta: Extract<RespostaDaBaseLegal, { situacao: "pronto" }>) => {
    setDaIa({ fundamento: resposta.fundamento, explicacao: resposta.explicacao });
    trocarPor(resposta.fundamento);
    void api(`/ia/campo/${resposta.id}/usado`, { method: "POST" }).catch(() => {});
    sugerir.reset();
  };

  return (
    <div className="dc-base-legal">
      <div className={cn("dc-base-legal__colunas", mostrarLei && "tem-lei")}>
        <div className="dc-base-legal__campo">
          <Campo rotulo="Base legal" htmlFor={id}>
            <input id={id} value={valor} onChange={(e) => aoMudar(e.target.value)} placeholder={placeholder} autoComplete="off" />
          </Campo>
          {origem && <MarcaDaBase origem={origem} achada={origem === "ia" && atual && todasAchadas(consulta.data?.lei)} />}
          {origem === "tabela" && tabela && (
            <>
              <p className="dc-base-legal__explica">{tabela.explicacao}</p>
              <p className="dc-base-legal__nota">A tabela indica {tabela.dias} dias para este ato; o campo Dias não muda sozinho. Ela cobre os casos mais comuns: leia o artigo e veja se vale para este caso.</p>
            </>
          )}
          {origem === "ia" && (
            <>
              {daIa?.explicacao && <p className="dc-base-legal__explica">{daIa.explicacao}</p>}
              <p className="dc-base-legal__nota">{atual && todasAchadas(consulta.data?.lei) ? "O artigo existe no acervo. Se ele é o certo para este caso, quem decide é você." : "A IA pode errar o artigo. Só conte com ele depois de ler a lei."}</p>
            </>
          )}
          {tabela && origem !== "tabela" && (
            <button type="button" className="dc-link dc-base-legal__usar" onClick={() => trocarPor(tabela.fundamento)}>
              Usar o da tabela: {tabela.fundamento}
            </button>
          )}
          {antes !== null && (
            <button
              type="button"
              className="dc-link dc-base-legal__usar"
              onClick={() => {
                aoMudar(antes);
                setAntes(valor);
              }}
            >
              Voltar ao texto de antes
            </button>
          )}
          {podeSugerir && (
            <Botao pequeno className="self-start" onClick={() => sugerir.mutate(pedido)}>
              <MarcaIa /> Sugerir com a IA
            </Botao>
          )}
        </div>
        {mostrarLei && <TextoDaLei lei={atual ? (consulta.data?.lei ?? []) : []} reconhecida={!atual || !!consulta.data?.reconhecida} buscando={buscando} falhou={!!consulta.error && !consulta.isFetching} />}
      </div>

      {(pensando || erro || r?.situacao === "pronto" || r?.situacao === "recusa") && (
        <section key={sugerir.status} ref={aparecer} className="dc-ia dc-base-legal__sugestao" role="region" aria-label="Sugestão da IA" aria-busy={pensando || undefined}>
          <div className="dc-ia__topo">
            <MarcaIa />
            <span className="dc-ia__titulo">{pensando ? "Procurando o artigo…" : "Sugestão da IA: ainda não entrou no campo"}</span>
          </div>
          {pensando ? (
            <div className="flex flex-col gap-2" aria-label="A IA está procurando o artigo">
              <div className="dc-ia__linha dc-ia__linha--1" />
              <div className="dc-ia__linha dc-ia__linha--2" />
            </div>
          ) : erro ? (
            <>
              <p className="dc-ia-campo__erro" role="alert">
                {mensagemDoErro(erro)}
              </p>
              <div className="dc-ia-campo__acoes">
                {podeTentar && (
                  <Botao pequeno onClick={() => sugerir.mutate(pedido)}>
                    Tentar de novo
                  </Botao>
                )}
                <Botao variante="fantasma" pequeno onClick={() => sugerir.reset()}>
                  Fechar
                </Botao>
              </div>
            </>
          ) : r?.situacao === "recusa" ? (
            <>
              <p className="dc-ia-campo__texto">{r.motivo}</p>
              <div className="dc-ia-campo__acoes">
                <Botao variante="fantasma" pequeno onClick={() => sugerir.reset()}>
                  Fechar
                </Botao>
              </div>
            </>
          ) : r?.situacao === "pronto" ? (
            <>
              <strong className="dc-lei__artigo">{r.fundamento}</strong>
              <p className="dc-ia-campo__texto">{r.explicacao}</p>
              <TextoDaLei lei={r.lei} reconhecida={r.reconhecida} buscando={false} falhou={false} />
              <div className="dc-ia-campo__acoes">
                <Botao variante="ia" pequeno onClick={() => usarSugestao(r)}>
                  Usar
                </Botao>
                <Botao variante="fantasma" pequeno onClick={() => sugerir.reset()}>
                  Descartar
                </Botao>
              </div>
            </>
          ) : null}
        </section>
      )}
      <p className="dc-base-legal__nota">Preencher aqui não confirma o prazo nem muda a data.</p>
    </div>
  );
}

/** A base legal que a IA leu da publicação, na coluna da decisão: com a marca, e a lei a um clique. */
export function BaseLegalLida({ fundamento, processoId }: { fundamento: string; processoId?: string | null }) {
  const eu = useQuery(euQuery);
  const [aberta, setAberta] = useState(false);
  // Só para leitura, a API não aceita a consulta: melhor não oferecer do que falhar sem explicar.
  const podeBuscar = (eu.data?.assinatura?.acesso ?? "total") === "total";
  const consulta = useQuery({
    queryKey: ["base-legal", processoId ?? null, "", fundamento],
    queryFn: () => api<ConsultaDaBaseLegal>("/base-legal", { json: { processoId: processoId ?? null, fundamento } }),
    enabled: aberta,
    staleTime: 60_000,
    retry: false,
  });
  return (
    <div className="dc-base-lida">
      <span>{fundamento}</span>
      <div className="dc-base-lida__linha">
        <MarcaDaBase origem="ia" achada={todasAchadas(consulta.data?.lei)} />
        {!aberta && podeBuscar && (
          <button type="button" className="dc-link" onClick={() => setAberta(true)}>
            Ver a lei
          </button>
        )}
      </div>
      {aberta && <TextoDaLei lei={consulta.data?.lei ?? []} reconhecida={consulta.data?.reconhecida ?? true} buscando={consulta.isFetching} falhou={!!consulta.error && !consulta.isFetching} />}
    </div>
  );
}
