/**
 * Variação C: tabela larga para triagem, boa para volume. Clicar abre a linha ali
 * mesmo, com teor, conta e ações, sem sair da lista. O responsável e o tipo vêm da
 * publicação de cada linha, e por isso só as primeiras buscam o detalhe.
 */
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { Fragment } from "react";
import { Rolagem } from "@/componentes/rolagem";
import { Abas, Carregando, Responsavel } from "@/componentes/ui";
import { diaCurto, diaDaSemana, prazoEmDias } from "@/lib/formato";
import type { Publicacao } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { BotoesDaDecisao, ComPublicacao, publicacaoQuery, SeloDaLista, usePublicacaoNaTela, type CaixaNaTela } from "../publicacoes";

const COM_DETALHE = 40;

export function TabelaQueAbre({ caixa }: { caixa: CaixaNaTela }) {
  const { itens, abas, situacao, irPara, aberta, escolher, proxima, vazio } = caixa;
  return (
    <section className="dc-painel dc-triagem">
      <Abas abas={abas} ativa={situacao} aoMudar={irPara} />
      {!itens ? (
        <div className="p-4">
          <Carregando linhas={4} />
        </div>
      ) : itens.length ? (
        <Rolagem id="publicacoes" className="dc-tabela-caixa">
          <table className="dc-tabela dc-tabela--fixa">
            <thead>
              <tr>
                <th className="dc-triagem__intimacao">Intimação</th>
                <th>Partes</th>
                <th className="dc-triagem__sugestao">Sugestão</th>
                <th className="dc-triagem__vence">Vence</th>
                <th className="dc-col--pessoa">Responsável</th>
                <th className="dc-triagem__recebida">Recebida</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item, n) => (
                <Fragment key={item.id}>
                  <Linha item={item} comDetalhe={n < COM_DETALHE} aberta={aberta === item.id} aoAlternar={() => escolher(aberta === item.id ? undefined : item.id)} />
                  {aberta === item.id && (
                    <tr className="dc-triagem__aberta">
                      <td colSpan={6}>
                        <ComPublicacao id={item.id}>{(pub) => <LinhaAberta pub={pub} aoTerminar={proxima} />}</ComPublicacao>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Rolagem>
      ) : (
        vazio
      )}
    </section>
  );
}

function Linha({ item, comDetalhe, aberta, aoAlternar }: { item: NonNullable<CaixaNaTela["itens"]>[number]; comDetalhe: boolean; aberta: boolean; aoAlternar: () => void }) {
  const q = useQuery({ ...publicacaoQuery(item.id), enabled: comDetalhe });
  const s = q.data?.sugestao;
  const c = s?.situacao === "pronto" ? s.conteudo : null;
  const fim = c?.audiencia?.data ?? c?.contagemCalculada?.fim;
  return (
    <tr className={cn("dc-triagem__linha", aberta && "is-on")} data-link="" onClick={aoAlternar}>
      <td>
        <button type="button" className="dc-triagem__abrir" aria-expanded={aberta} onClick={(e) => (e.stopPropagation(), aoAlternar())}>
          <ChevronRight aria-hidden />
          <span>{item.titulo}</span>
        </button>
      </td>
      <td className="dc-triagem__partes" title={item.partes}>
        {item.partes}
      </td>
      <td>
        {c?.geraPrazo && c.dias && !c.audiencia ? (
          <span className="dc-celula">
            <span className="dc-celula__1 dc-celula__1--uma">
              <span className="dc-corta" title={c.tipo}>
                {c.tipo}
              </span>
            </span>
            <span className="dc-celula__2">{prazoEmDias(c.dias, c.contagem)}</span>
          </span>
        ) : (
          <SeloDaLista selo={item.selo} />
        )}
      </td>
      <td>
        {fim ? (
          <span className="dc-celula">
            <span className="dc-celula__1 dc-num">{diaCurto(fim)}</span>
            <span className="dc-celula__2">{diaDaSemana(fim).replace("-feira", "")}</span>
          </span>
        ) : (
          <span className="text-[var(--tinta-3)]">—</span>
        )}
      </td>
      <td>{s ? <Responsavel pessoa={s.responsavel ?? q.data?.processo?.responsavel ?? null} /> : <span className="text-[var(--tinta-3)]">—</span>}</td>
      <td className="dc-num text-[var(--tinta-2)]">{diaCurto(item.disponibilizadaEm)}</td>
    </tr>
  );
}

function LinhaAberta({ pub, aoTerminar }: { pub: Publicacao; aoTerminar: () => void }) {
  const p = usePublicacaoNaTela(pub, false, aoTerminar);
  return (
    <div className="dc-triagem__corpo">
      <div className="dc-decisao__leitura">
        {p.processo}
        {p.cancelada}
        {p.feito || p.lida}
        {p.teor}
        {p.prova}
      </div>
      <aside>{p.ia}</aside>
      {p.leituraDaDecisao && <div className="dc-triagem__largo">{p.leituraDaDecisao}</div>}
      {p.acoes.length > 0 && (
        <div className="dc-triagem__largo dc-triagem__acoes">
          <BotoesDaDecisao acoes={p.acoes} ocupado={p.ocupado} />
        </div>
      )}
      {p.dialogos}
    </div>
  );
}
