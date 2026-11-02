/**
 * Variação D: três colunas, tudo à vista sem rolar a página: a lista, o teor no
 * meio e a decisão à direita. Aproveita as telas largas; abaixo de 1200 px a
 * decisão desce para baixo do teor.
 */
import { Rolagem } from "@/componentes/rolagem";
import { Abas, Carregando } from "@/componentes/ui";
import type { Publicacao } from "@/lib/tipos";
import { BotoesDaDecisao, ComPublicacao, ItemDaCaixa, usePublicacaoNaTela, type CaixaNaTela } from "../publicacoes";

export function TresColunas({ caixa }: { caixa: CaixaNaTela }) {
  const { itens, abas, situacao, irPara, selecionada, escolher, proxima, vazio } = caixa;
  return (
    <div className="dc-tres">
      <section className="dc-painel dc-tres__lista">
        <Abas abas={abas} ativa={situacao} aoMudar={irPara} />
        {!itens ? (
          <div className="p-4">
            <Carregando linhas={3} />
          </div>
        ) : itens.length ? (
          <Rolagem id="publicacoes" className="dc-linhas">
            {itens.map((i) => (
              <ItemDaCaixa key={i.id} item={i} celular={false} ligado={i.id === selecionada} aoEscolher={() => escolher(i.id)} />
            ))}
          </Rolagem>
        ) : (
          vazio
        )}
      </section>
      {selecionada && (
        <ComPublicacao key={selecionada} id={selecionada}>
          {(pub) => <TeorEDecisao pub={pub} aoTerminar={proxima} />}
        </ComPublicacao>
      )}
    </div>
  );
}

function TeorEDecisao({ pub, aoTerminar }: { pub: Publicacao; aoTerminar: () => void }) {
  const p = usePublicacaoNaTela(pub, false, aoTerminar);
  return (
    <>
      <section className="dc-painel dc-tres__teor">
        <div className="dc-decisao__topo">{p.processo}</div>
        <Rolagem id="publicacao" className="dc-tres__leitura">
          {p.cancelada}
          {p.teor}
          {p.prova}
          {p.leituraDaDecisao}
        </Rolagem>
      </section>
      <aside className="dc-painel dc-tres__decisao">
        <div className="dc-tres__fatos">
          {p.feito || p.lida}
          {p.ia}
        </div>
        {p.acoes.length > 0 && (
          <div className="dc-tres__botoes">
            <BotoesDaDecisao acoes={p.acoes} ocupado={p.ocupado} />
          </div>
        )}
      </aside>
      {p.dialogos}
    </>
  );
}
