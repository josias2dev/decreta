/**
 * Variação B: uma publicação por vez, em coluna central de leitura. A lista vira
 * um trilho estreito, e a decisão fica numa barra fixa embaixo. Ao decidir, a
 * próxima abre sozinha.
 */
import { MotivosDaConferencia, SeloDeConfianca } from "@/componentes/conta-do-prazo";
import { Rolagem } from "@/componentes/rolagem";
import { Abas, Carregando, MarcaIa } from "@/componentes/ui";
import { diaCurto } from "@/lib/formato";
import type { Publicacao } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { BotoesDaDecisao, ComPublicacao, resumoDaDecisao, usePublicacaoNaTela, type CaixaNaTela } from "../publicacoes";

export function FilaFocada({ caixa }: { caixa: CaixaNaTela }) {
  const { itens, abas, situacao, irPara, selecionada, escolher, proxima, vazio } = caixa;
  const posicao = itens?.findIndex((i) => i.id === selecionada) ?? -1;
  return (
    <>
      <Abas abas={abas} ativa={situacao} aoMudar={irPara} pagina />
      <div className="dc-fila">
        <nav className="dc-painel dc-fila__trilho" aria-label="Fila de publicações">
          {!itens ? (
            <div className="p-3">
              <Carregando linhas={3} />
            </div>
          ) : itens.length ? (
            <Rolagem id="publicacoes" className="dc-fila__lista">
              {itens.map((i) => (
                <button key={i.id} type="button" className={cn("dc-fila__item", i.id === selecionada && "is-on")} aria-current={i.id === selecionada || undefined} onClick={() => escolher(i.id)} title={i.partes}>
                  <span className="dc-fila__titulo">{i.titulo}</span>
                  <span className="dc-fila__data">{diaCurto(i.disponibilizadaEm)}</span>
                </button>
              ))}
            </Rolagem>
          ) : (
            vazio
          )}
        </nav>
        {selecionada ? (
          <div key={selecionada} className="dc-caixa__detalhe">
            <ComPublicacao id={selecionada}>{(pub) => <Foco pub={pub} aoTerminar={proxima} posicao={posicao >= 0 && itens ? `${posicao + 1} de ${itens.length}` : null} />}</ComPublicacao>
          </div>
        ) : (
          <div />
        )}
      </div>
    </>
  );
}

function Foco({ pub, aoTerminar, posicao }: { pub: Publicacao; aoTerminar: () => void; posicao: string | null }) {
  const p = usePublicacaoNaTela(pub, false, aoTerminar);
  const resumo = resumoDaDecisao(p.c, p.s?.responsavel ?? null);
  return (
    <section className="dc-painel dc-fila__foco">
      <Rolagem id="publicacao" className="dc-fila__leitura">
        <div className="dc-fila__coluna">
          {posicao && <span className="dc-lido__meta">{posicao} nesta fila</span>}
          {p.processo}
          {p.cancelada}
          {p.feito || p.lida}
          {p.teor}
          {p.blocoIa(
            p.c && (
              <div className="dc-fatos">
                <span className="dc-fatos__ato">{p.c.audiencia ? p.c.audiencia.tipo : p.c.geraPrazo ? p.c.tipo : "Não abre prazo para o escritório"}</span>
                {p.c.conferencia && (
                  <div className="dc-fila__confianca">
                    <SeloDeConfianca confianca={p.c.conferencia.confianca} />
                    <MotivosDaConferencia conferencia={p.c.conferencia} />
                  </div>
                )}
              </div>
            ),
          )}
          {p.prova}
          {p.leituraDaDecisao}
        </div>
      </Rolagem>
      {p.acoes.length > 0 && (
        <div className="dc-fila__barra">
          <span className="dc-fila__resumo">
            {resumo ? (
              <>
                <MarcaIa /> {resumo}
              </>
            ) : (
              "Confira o teor e decida"
            )}
          </span>
          <div className="dc-fila__botoes">
            <BotoesDaDecisao acoes={p.acoes} ocupado={p.ocupado} invertido />
          </div>
        </div>
      )}
      {p.dialogos}
    </section>
  );
}
