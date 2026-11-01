/**
 * As citações de uma resposta do Perguntar, cada uma com o selo: as que a IA
 * pediu pelo acervo no modo Jurisprudência ([1], [2]), montadas pelo Decreta a
 * partir do banco, e as que ela escreveu direto no texto. Nenhuma citação
 * aparece sem selo; fora do acervo é "confira antes de usar", nunca
 * "inexistente".
 */
import { ExternalLink } from "lucide-react";
import { diaCurto, diaDoInstante } from "@/lib/formato";
import type { CitacaoConferida, Parte } from "@/lib/perguntar";
import type { CitacaoVerificada } from "@/lib/tipos";
import { SELOS } from "./verificacao-da-peca";

/** As citações da resposta, na ordem: primeiro as numeradas, depois as do texto. */
export function citacoesDaResposta(partes: Parte[]): { conferidas: CitacaoConferida[]; doTexto: CitacaoVerificada[] } {
  const conferidas = partes.flatMap((p) => (p.tipo === "ferramenta" && p.nome === "citar" && p.saida && typeof p.saida === "object" && !p.erro ? [p.saida as CitacaoConferida] : []));
  const doTexto = partes.flatMap((p) => (p.tipo === "citacoes" ? p.itens : []));
  return { conferidas: conferidas.sort((a, b) => a.n - b.n), doTexto };
}

function Fonte({ fonte }: { fonte: NonNullable<CitacaoConferida["fonte"]> }) {
  return (
    <a href={fonte.url} target="_blank" rel="noopener noreferrer">
      {fonte.nome}, copiado em {diaCurto(diaDoInstante(fonte.capturadoEm))} <ExternalLink aria-hidden />
    </a>
  );
}

function Conferida({ c }: { c: CitacaoConferida }) {
  const { rotulo, Icone } = SELOS[c.selo];
  return (
    <li className={`dc-citacoes__item dc-citacoes__item--${c.selo}`}>
      <Icone aria-hidden />
      <span className="dc-citacoes__texto">
        <strong>
          <span className="dc-citacoes__n dc-num">[{c.n}]</span> {c.rotulo}
        </strong>
        <span className="dc-citacoes__selo">{rotulo}</span>
        <q className="dc-citacoes__trecho">{c.trecho}</q>
        <span>{c.motivo}</span>
        {c.literal === false && c.texto && (
          <span className="dc-citacoes__guardado">
            No acervo: <q>{c.texto}</q>
          </span>
        )}
        {c.fonte && <Fonte fonte={c.fonte} />}
      </span>
    </li>
  );
}

function DoTexto({ c }: { c: CitacaoVerificada }) {
  const { rotulo, Icone } = SELOS[c.selo];
  return (
    <li className={`dc-citacoes__item dc-citacoes__item--${c.selo}`}>
      <Icone aria-hidden />
      <span className="dc-citacoes__texto">
        <strong>{c.trecho}</strong>
        <span className="dc-citacoes__selo">{rotulo}</span>
        <span>{c.motivo}</span>
        {c.fonte && <Fonte fonte={c.fonte} />}
      </span>
    </li>
  );
}

export function CitacoesDaResposta({ partes }: { partes: Parte[] }) {
  const { conferidas, doTexto } = citacoesDaResposta(partes);
  if (!conferidas.length && !doTexto.length) return null;
  return (
    <section className="dc-citacoes dc-citacoes--na-resposta" aria-label="Citações">
      <ul className="dc-citacoes__lista" aria-label="Citações da resposta">
        {conferidas.map((c) => (
          <Conferida key={`n-${c.n}`} c={c} />
        ))}
        {doTexto.map((c) => (
          <DoTexto key={`t-${c.inicio}-${c.chave}`} c={c} />
        ))}
      </ul>
      <p className="dc-citacoes__nota">Conferido no acervo do Decreta. Confira na fonte antes de levar para a peça.</p>
    </section>
  );
}
