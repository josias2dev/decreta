/**
 * O julgado do acervo dentro da peça. Para cada marca [JURISPRUDÊNCIA: tese], busca
 * no acervo: selo, tribunal, trecho, o papel de cada um e quantos apontam para cada
 * lado, com o que o acervo não cobre. A pessoa escolhe; o servidor monta a citação.
 */
import { marcasDeJurisprudencia } from "@decreta/core";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ExternalLink, Search } from "lucide-react";
import { useState } from "react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Carregando, Faixa, Painel } from "@/componentes/ui";
import { SELOS } from "@/componentes/verificacao-da-peca";
import { api, mensagemDoErro } from "@/lib/api";
import type { BuscaDaTese, CandidatoDaTese, JulgadoDaPeca, PapelDoJulgado } from "@/lib/tipos";

const PAPEIS: Record<PapelDoJulgado, string> = { enfrenta: "Enfrenta a questão", contraponto: "Contraponto", tangencia: "Só tangencia" };

function ladosEmTexto(b: BuscaDaTese): string {
  if (b.semLeitura) return `${b.itens.length} ${b.itens.length === 1 ? "achado" : "achados"} no acervo, sem a leitura da IA: leia e veja para que lado cada um aponta.`;
  const { aFavor, contra, tangenciam } = b.lados;
  return [aFavor && `${aFavor} a favor da tese`, contra && `${contra} contra`, tangenciam && `${tangenciam} só ${tangenciam === 1 ? "tangencia" : "tangenciam"}`].filter(Boolean).join(" · ") || "Nenhum enfrenta a tese";
}

function Candidato({ c, marcado, aoMarcar }: { c: CandidatoDaTese; marcado: boolean; aoMarcar: () => void }) {
  const { rotulo: selo, Icone } = SELOS[c.selo];
  return (
    <li className={`dc-julgado dc-citacoes__item--${c.selo}`}>
      <label className="dc-julgado__topo">
        <input type="checkbox" className="dc-checa" checked={marcado} onChange={aoMarcar} />
        <strong>{c.rotulo}</strong>
      </label>
      <p className="dc-julgado__meta">
        <span className="dc-citacoes__selo">
          <Icone aria-hidden /> {selo}
        </span>
        <span>{c.tribunal}</span>
        {c.papel && <span className={`dc-julgado__papel dc-julgado__papel--${c.papel}`}>{PAPEIS[c.papel]}</span>}
      </p>
      <q>{c.trecho}</q>
      {c.porque && <p className="dc-citacoes__nota">{c.porque}</p>}
      {c.selo !== "verificada" && <p className="dc-citacoes__nota">{c.motivo}</p>}
      <a href={c.fonte.url} target="_blank" rel="noopener noreferrer" className="dc-julgado__fonte">
        {c.fonte.nome} <ExternalLink aria-hidden />
      </a>
    </li>
  );
}

function DialogoDaTese({ pecaId, tese, aoFechar, aoInserir }: { pecaId: string; tese: string; aoFechar: () => void; aoInserir: () => void }) {
  const busca = useQuery({ queryKey: ["peca", pecaId, "julgados", tese], queryFn: () => api<BuscaDaTese>(`/pecas/${pecaId}/julgados/buscar`, { json: { tese } }), staleTime: 5 * 60_000, retry: false });
  const [escolhidos, setEscolhidos] = useState<string[]>([]);
  const inserir = useMutation({
    mutationFn: () => api(`/pecas/${pecaId}/julgados/inserir`, { json: { tese, escolhidos: (busca.data?.itens ?? []).filter((c) => escolhidos.includes(c.chave)).map((c) => ({ chave: c.chave, trecho: c.trecho })) } }),
    onSuccess: aoInserir,
  });
  const b = busca.data;
  return (
    <Dialogo
      aberto
      aoFechar={aoFechar}
      titulo="Julgados do acervo"
      descricao={tese}
      className="dc-dialogo--diferenca"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Fechar
          </Botao>
          <Botao variante="primaria" onClick={() => inserir.mutate()} ocupado={inserir.isPending} disabled={!escolhidos.length}>
            Pôr na peça
          </Botao>
        </>
      }
    >
      {busca.error && <Faixa tipo="erro">{mensagemDoErro(busca.error)}</Faixa>}
      {inserir.error && <Faixa tipo="erro">{mensagemDoErro(inserir.error)}</Faixa>}
      {busca.isPending && <Carregando linhas={3} />}
      {b && (
        <div className="dc-julgados">
          {b.explicacao ? <Faixa tipo="nota">{b.explicacao}</Faixa> : <p className="dc-citacoes__nota">{ladosEmTexto(b)}</p>}
          {b.itens.length > 0 && (
            <ul className="dc-julgados__lista" aria-label="Candidatos do acervo">
              {b.itens.map((c) => (
                <Candidato key={c.chave} c={c} marcado={escolhidos.includes(c.chave)} aoMarcar={() => setEscolhidos(escolhidos.includes(c.chave) ? escolhidos.filter((x) => x !== c.chave) : [...escolhidos, c.chave])} />
              ))}
            </ul>
          )}
          <div className="dc-julgados__cobertura">
            <span className="dc-rotulo">O que o acervo cobre</span>
            <p>{b.cobertura.tem.length ? `${b.cobertura.tem.join("; ")}.` : "Ainda vazio."}</p>
            <span className="dc-rotulo">O que ele não cobre</span>
            <ul>
              {b.cobertura.naoCobre.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Dialogo>
  );
}

function JulgadoInserido({ j }: { j: JulgadoDaPeca }) {
  const { rotulo, Icone } = SELOS[j.selo];
  return (
    <li className={`dc-citacoes__item dc-citacoes__item--${j.selo}`}>
      <Icone aria-hidden />
      <span className="dc-citacoes__texto">
        <strong>{j.rotulo}</strong>
        <span className="dc-citacoes__selo">{rotulo}</span>
        <span>{j.motivo}</span>
        {j.avisoDeForca && <span>{j.avisoDeForca}</span>}
        {j.fonte && (
          <a href={j.fonte.url} target="_blank" rel="noopener noreferrer">
            {j.fonte.nome} <ExternalLink aria-hidden />
          </a>
        )}
      </span>
    </li>
  );
}

export function JulgadosDaPeca({ pecaId, texto, julgados, aoInserir }: { pecaId: string; texto: string; julgados: readonly JulgadoDaPeca[]; aoInserir: () => void }) {
  const [tese, setTese] = useState<string | null>(null);
  const marcas = marcasDeJurisprudencia(texto).filter((m) => m.tese);
  const inseridos = julgados.filter((j) => texto.includes(j.citacao));
  if (!marcas.length && !inseridos.length) return null;
  return (
    <Painel titulo="Julgados" acao={<span className="dc-nota">só do acervo</span>} corpo={false}>
      <div className="dc-citacoes">
        {marcas.length > 0 && (
          <ul className="dc-julgados__teses" aria-label="Teses a pesquisar">
            {marcas.map((m) => (
              <li key={m.inicio}>
                <span>{m.tese}</span>
                <Botao variante="secundaria" pequeno onClick={() => setTese(m.tese)}>
                  <Search /> Buscar no acervo
                </Botao>
              </li>
            ))}
          </ul>
        )}
        {inseridos.length > 0 && (
          <ul className="dc-citacoes__lista" aria-label="Julgados na peça">
            {inseridos.map((j) => (
              <JulgadoInserido key={`${j.chave}-${j.em}`} j={j} />
            ))}
          </ul>
        )}
      </div>
      {tese && (
        <DialogoDaTese
          pecaId={pecaId}
          tese={tese}
          aoFechar={() => setTese(null)}
          aoInserir={() => {
            setTese(null);
            aoInserir();
          }}
        />
      )}
    </Painel>
  );
}
