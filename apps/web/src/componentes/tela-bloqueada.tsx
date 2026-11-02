/**
 * O que sobra quando o acesso está bloqueado (a fatura passou de 15 dias): pagar, levar os dados e encerrar,
 * e sair. Nada foi apagado. É a única tela que abre; o resto da API responde 403.
 */
import { DadosDoEscritorio } from "@/componentes/dados-do-escritorio";
import { Marca } from "@/componentes/marca";
import { useSair } from "@/componentes/menu-da-conta";
import { PlanoDoEscritorio } from "@/componentes/plano";
import { Botao, Faixa } from "@/componentes/ui";
import { ehSocio } from "@/lib/auth";
import type { Eu } from "@/lib/tipos";

export function TelaBloqueada({ eu }: { eu: Eu }) {
  const sair = useSair();
  return (
    <div className="dc dc-bloqueado">
      <div className="dc-bloqueado__caixa">
        <div className="dc-entrada__marca">
          <Marca />
        </div>
        <section className="dc-painel">
          <div className="dc-painel__corpo">
            <h1 className="dc-h1">O acesso de {eu.escritorio.nome} está bloqueado</h1>
            <p className="dc-sub">Os dados do escritório continuam guardados. Aqui dá para pagar, levar uma cópia deles ou encerrar o escritório.</p>
          </div>
        </section>
        {/* O plano e os dados são dos sócios; quem é da equipe só vê o aviso. */}
        {ehSocio(eu.usuario.papel) ? (
          <>
            <PlanoDoEscritorio celular />
            <DadosDoEscritorio nome={eu.escritorio.nome} demonstracao={!!eu.escritorio.demonstracao} />
          </>
        ) : (
          <Faixa tipo="aviso">Peça a um sócio do escritório para pagar a fatura em atraso. Assim que o pagamento for confirmado, o acesso volta.</Faixa>
        )}
        <Botao className="self-start" variante="fantasma" onClick={() => sair.mutate()} ocupado={sair.isPending}>
          Sair do Decreta
        </Botao>
      </div>
    </div>
  );
}
