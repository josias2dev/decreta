import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { ApiError, mensagemDoErro } from "@/lib/api";
import { Marca } from "./marca";
import { Botao, Vazio } from "./ui";

/** Endereço que não existe. */
export function NaoEncontrada() {
  return (
    <div className="dc dc-entrada">
      <div className="dc-entrada__caixa">
        <div className="dc-entrada__marca">
          <Marca />
        </div>
        <section className="dc-painel">
          <div className="dc-painel__corpo">
            <h1 className="dc-h1">Página não encontrada</h1>
            <p className="dc-sub">O endereço pode estar errado ou a página mudou de lugar.</p>
            <Link to="/hoje" className="dc-link">
              Ir para Hoje
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/** Dentro de uma tela: o item não existe (404) ou a API falhou. */
export function FalhaAoCarregar({ erro, sumiu, aoTentar }: { erro: unknown; sumiu: string; aoTentar?: () => void }) {
  if (erro instanceof ApiError && erro.status === 404) {
    return (
      <Vazio
        titulo={sumiu}
        acao={
          <Link to="/hoje" className="dc-link">
            Ir para Hoje
          </Link>
        }
      >
        Pode ter sido apagado ou o link está errado.
      </Vazio>
    );
  }
  return (
    <Vazio
      titulo="Não consegui carregar"
      acao={
        aoTentar && (
          <Botao pequeno onClick={aoTentar}>
            Tentar de novo
          </Botao>
        )
      }
    >
      {mensagemDoErro(erro)}
    </Vazio>
  );
}

/** Erro ao desenhar uma tela (o roteador mostra no lugar dela, com o menu): em português, com o caminho de volta. */
export function ErroNaTela({ reset }: ErrorComponentProps) {
  return (
    <div className="dc-erro-na-tela" role="alert">
      <Vazio
        titulo="Algo deu errado nesta tela"
        acao={
          <>
            <Botao pequeno onClick={reset}>
              Tentar de novo
            </Botao>
            <Link to="/hoje" className="dc-link">
              Ir para Hoje
            </Link>
          </>
        }
      >
        Tente de novo. Se continuar, volte para Hoje e abra a tela outra vez.
      </Vazio>
    </div>
  );
}
