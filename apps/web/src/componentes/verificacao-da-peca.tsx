/**
 * "Verificar peça": cada súmula, tema, artigo de lei e precedente citado ganha
 * um selo, conferido nas fontes oficiais (STJ, BNP, normas.leg.br). É a etapa
 * antes de baixar: o que não está no acervo vem como "confira antes de usar",
 * nunca como inexistente.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleHelp, ExternalLink, ShieldCheck, TriangleAlert } from "lucide-react";
import { Botao, Faixa, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { CitacaoVerificada, Peca, SeloDaCitacao, VerificacaoDaPeca } from "@/lib/tipos";

const SELOS: Record<SeloDaCitacao, { rotulo: string; Icone: typeof CircleCheck }> = {
  verificada: { rotulo: "Verificada", Icone: CircleCheck },
  com_ressalva: { rotulo: "Com ressalva", Icone: TriangleAlert },
  nao_verificada: { rotulo: "Não verificada", Icone: CircleHelp },
};

function resumoEmTexto({ verificadas, comRessalva, naoVerificadas }: VerificacaoDaPeca["resumo"]): string {
  const partes = [
    verificadas && `${verificadas} ${verificadas === 1 ? "verificada" : "verificadas"}`,
    comRessalva && `${comRessalva} com ressalva`,
    naoVerificadas && `${naoVerificadas} ${naoVerificadas === 1 ? "não verificada" : "não verificadas"}`,
  ].filter(Boolean);
  return partes.join(" · ");
}

function Citacao({ c }: { c: CitacaoVerificada }) {
  const { rotulo, Icone } = SELOS[c.selo];
  return (
    <li className={`dc-citacoes__item dc-citacoes__item--${c.selo}`}>
      <Icone aria-hidden />
      <span className="dc-citacoes__texto">
        <strong>{c.trecho}</strong>
        <span className="dc-citacoes__selo">{rotulo}</span>
        <span>{c.motivo}</span>
        {c.fonte && (
          <a href={c.fonte.url} target="_blank" rel="noopener noreferrer">
            {c.fonte.nome} <ExternalLink aria-hidden />
          </a>
        )}
      </span>
    </li>
  );
}

export function VerificacaoDaPeca({ pecaId, verificacao, hoje }: { pecaId: string; verificacao: Peca["verificacao"]; hoje?: string }) {
  const qc = useQueryClient();
  const verificar = useMutation({
    mutationFn: () => api<VerificacaoDaPeca>(`/pecas/${pecaId}/verificar`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["peca", pecaId] }),
  });
  const quando = verificacao && `${diaDoInstante(verificacao.em) === hoje ? "hoje" : diaCurto(diaDoInstante(verificacao.em))} às ${hora(verificacao.em)}`;
  const botao = (
    <Botao variante={verificacao?.atual ? "fantasma" : "secundaria"} pequeno onClick={() => verificar.mutate()} ocupado={verificar.isPending}>
      <ShieldCheck /> {verificacao ? "Verificar de novo" : "Verificar citações"}
    </Botao>
  );
  return (
    <Painel titulo="Citações" acao={botao} corpo={false}>
      <div className="dc-citacoes">
        {verificar.isError && <Faixa tipo="erro">{mensagemDoErro(verificar.error)}</Faixa>}
        {!verificacao ? (
          <p className="dc-citacoes__nota">Confira súmulas, temas e artigos de lei nas fontes oficiais antes de baixar.</p>
        ) : (
          <>
            {!verificacao.atual && <Faixa tipo="aviso">O texto mudou depois da última verificação. Verifique de novo antes de baixar.</Faixa>}
            <p className="dc-citacoes__nota">
              {verificacao.citacoes.length ? resumoEmTexto(verificacao.resumo) : "Nenhuma súmula, tema, artigo de lei ou precedente citado no texto."} · conferido {quando}
            </p>
            {verificacao.citacoes.length > 0 && (
              <ul className="dc-citacoes__lista">
                {verificacao.citacoes.map((c) => (
                  <Citacao key={`${c.inicio}-${c.chave}`} c={c} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </Painel>
  );
}
