/**
 * Cada fato da peça aponta para o trecho. A IA liga, o código confere; a pessoa vê
 * aqui e, clicando no fato, o trecho de onde ele saiu e o documento na folha.
 */
import type { FatoDaPeca, SituacaoDoFato } from "@decreta/core";
import { Link } from "@tanstack/react-router";
import { CircleCheck, CircleHelp, ExternalLink, ShieldCheck, TriangleAlert, type LucideIcon } from "lucide-react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Faixa, Painel } from "@/componentes/ui";
import type { ConferenciaDaPeca } from "@/lib/tipos";

const SITUACOES: Record<SituacaoDoFato, { rotulo: string; Icone: LucideIcon }> = {
  conferido: { rotulo: "Confere com a fonte", Icone: CircleCheck },
  com_aviso: { rotulo: "Não bate com a fonte", Icone: TriangleAlert },
  a_comprovar: { rotulo: "A comprovar", Icone: CircleHelp },
};

const SEM_LIGACAO: Record<NonNullable<ConferenciaDaPeca["semLigacao"]>, string> = {
  cliente_sem_ia: "Cliente sem IA: os fatos não foram lidos pelo modelo. Só datas, valores, eventos e julgados foram conferidos, por código.",
  ia_desligada: "A IA não está ligada: só datas, valores, eventos e julgados foram conferidos, por código.",
  ia_falhou: "A IA não respondeu: só datas, valores, eventos e julgados foram conferidos, por código. Tente de novo.",
};

function resumoDosFatos({ conferidos, comAviso, aComprovar }: ConferenciaDaPeca["resumo"]): string {
  return [conferidos && `${conferidos} ${conferidos === 1 ? "confere" : "conferem"} com a fonte`, comAviso && `${comAviso} com aviso`, aComprovar && `${aComprovar} a comprovar`].filter(Boolean).join(" · ") || "Nenhum fato listado";
}

export function FatosDaPeca({ conferencia, conferindo, iaLigada, aoConferir, aoAbrir }: { conferencia: ConferenciaDaPeca | null; conferindo: boolean; iaLigada: boolean; aoConferir: () => void; aoAbrir: (f: FatoDaPeca) => void }) {
  const rotulo = !conferencia ? (iaLigada ? "Conferir fatos" : "Conferir datas e valores") : "Conferir de novo";
  const botao = (
    <Botao variante={conferencia?.atual ? "fantasma" : "secundaria"} pequeno onClick={aoConferir} ocupado={conferindo}>
      <ShieldCheck /> {conferindo ? "Conferindo…" : rotulo}
    </Botao>
  );
  return (
    <Painel titulo="Fatos" acao={botao} corpo={false}>
      <div className="dc-citacoes">
        {!conferencia ? (
          <p className="dc-citacoes__nota">{iaLigada ? "A IA liga cada fato ao trecho dos autos, e o código confere se o trecho existe e se datas e valores batem." : "O código confere datas, valores, eventos e folhas contra os autos."}</p>
        ) : (
          <>
            {!conferencia.atual && <Faixa tipo="aviso">O texto mudou depois da conferência. Confira de novo.</Faixa>}
            {conferencia.semLigacao && <Faixa tipo="nota">{SEM_LIGACAO[conferencia.semLigacao]}</Faixa>}
            {!conferencia.semLigacao && <p className="dc-citacoes__nota">{resumoDosFatos(conferencia.resumo)}</p>}
            {conferencia.fatos.length > 0 && (
              <ul className="dc-fatos" aria-label="Fatos da peça">
                {conferencia.fatos.map((f) => {
                  const { rotulo: situacao, Icone } = SITUACOES[f.situacao];
                  return (
                    <li key={f.afirmacao}>
                      <button type="button" className={`dc-fatos__item dc-fatos__item--${f.situacao}`} onClick={() => aoAbrir(f)}>
                        <Icone aria-label={situacao} />
                        <span>{f.afirmacao}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </Painel>
  );
}

/** Ao clicar no fato: o que a peça diz, o que a fonte diz e o documento na folha. */
export function DialogoDoFato({ fato, aoFechar }: { fato: FatoDaPeca | null; aoFechar: () => void }) {
  if (!fato) return null;
  const { rotulo: situacao } = SITUACOES[fato.situacao];
  const { fonte } = fato;
  const naFolha = fonte?.folha ? `Abrir o documento na folha ${fonte.folha}` : "Abrir o documento";
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo="De onde saiu este fato" descricao={situacao} className="dc-dialogo--versoes" acoes={<Botao onClick={aoFechar}>Fechar</Botao>}>
      <div className="dc-fato-aberto">
        <div>
          <span className="dc-rotulo">A peça diz</span>
          <p>{fato.afirmacao}</p>
        </div>
        {fato.motivo && <Faixa tipo="aviso">{fato.motivo}</Faixa>}
        {fato.trecho && fonte && (
          <div>
            <span className="dc-rotulo">
              {fonte.rotulo}
              {fonte.folha ? `, fl. ${fonte.folha}` : ""}
            </span>
            <blockquote>{fato.trecho}</blockquote>
          </div>
        )}
        {!fato.trecho && <p className="dc-citacoes__nota">Sem trecho que prove este fato. No DOCX, ele sai como [COMPLETAR: ...] até alguém comprovar ou tirar.</p>}
        {fonte?.documentoId && (
          <Link to="/documentos" search={{ doc: fonte.documentoId, ...(fonte.folha ? { pagina: fonte.folha } : {}) }} target="_blank" className="dc-btn dc-btn--secundaria dc-btn--md dc-fato-aberto__abrir">
            <ExternalLink aria-hidden /> {naFolha}
          </Link>
        )}
      </div>
    </Dialogo>
  );
}
