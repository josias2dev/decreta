/** Variação A: lista à esquerda e, à direita, o cartão de decisão com a coluna fixa de fatos. */
import { Rolagem } from "@/componentes/rolagem";
import { Abas, Carregando } from "@/componentes/ui";
import { ComPublicacao, ItemDaCaixa, VerPublicacao, type CaixaNaTela } from "../publicacoes";

export function CaixaComCartao({ caixa }: { caixa: CaixaNaTela }) {
  const { itens, abas, situacao, irPara, selecionada, escolher, proxima, vazio } = caixa;
  return (
    <div className="dc-caixa">
      <section className="dc-painel dc-caixa__lista">
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
      {selecionada ? (
        <div key={selecionada} className="dc-caixa__detalhe">
          <ComPublicacao id={selecionada}>{(pub) => <VerPublicacao pub={pub} celular={false} aoTerminar={proxima} />}</ComPublicacao>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}
