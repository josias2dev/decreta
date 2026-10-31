/**
 * Registro de revisão da peça (Recomendação CFOAB 001/2024, item 3.7): cada vez
 * que alguém marcou como revisada, quem, quando e quanto o texto se afastou da
 * versão da IA, com as duas versões à mão.
 */
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Dialogo } from "@/componentes/dialogo";
import { Botao, Carregando, Faixa, Painel, Segmentos } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCurto, diaDoInstante, hora } from "@/lib/formato";
import type { RevisaoDaPeca } from "@/lib/tipos";

/** Quanto mudou da versão da IA, em palavras. */
function oQueMudou(r: RevisaoDaPeca): string {
  if (!r.geradaPorIa) return "Escrita à mão, sem IA.";
  if (r.mudaram === 0) return "Igual à versão da IA.";
  return `${r.mudaram} de ${r.paragrafos} ${r.paragrafos === 1 ? "parágrafo" : "parágrafos"} ${r.mudaram === 1 ? "mudou" : "mudaram"} em relação à versão da IA.`;
}

export function RegistroDeRevisao({ pecaId, revisoes, hoje, folha }: { pecaId: string; revisoes: RevisaoDaPeca[]; hoje?: string; folha: (texto: string) => ReactNode }) {
  const [aberta, setAberta] = useState<RevisaoDaPeca | null>(null);
  if (!revisoes.length) return null;
  const quando = (em: string) => `${diaDoInstante(em) === hoje ? "hoje" : diaCurto(diaDoInstante(em))} às ${hora(em)}`;
  const quem = (r: RevisaoDaPeca) => [r.por?.apelido ?? "Alguém da equipe", r.por?.oab].filter(Boolean).join(" · ");
  return (
    <Painel titulo="Registro de revisão" corpo={false}>
      <ul className="dc-revisoes">
        {revisoes.map((r) => (
          <li key={r.id}>
            <Check aria-hidden />
            <span className="dc-revisoes__texto">
              <strong>
                {quem(r)} · {quando(r.em)}
              </strong>
              <span>{oQueMudou(r)}</span>
            </span>
            <Botao variante="fantasma" pequeno onClick={() => setAberta(r)}>
              {r.geradaPorIa ? "Ver as versões" : "Ver o texto"}
            </Botao>
          </li>
        ))}
      </ul>
      {aberta && <VersoesDaRevisao pecaId={pecaId} revisao={aberta} titulo={`Revisão de ${quando(aberta.em)}`} quem={quem(aberta)} aoFechar={() => setAberta(null)} folha={folha} />}
    </Painel>
  );
}

function VersoesDaRevisao({ pecaId, revisao, titulo, quem, aoFechar, folha }: { pecaId: string; revisao: RevisaoDaPeca; titulo: string; quem: string; aoFechar: () => void; folha: (texto: string) => ReactNode }) {
  const [versao, setVersao] = useState<"final" | "ia">("final");
  const q = useQuery({ queryKey: ["peca", pecaId, "revisao", revisao.id], queryFn: () => api<{ textoGerado: string | null; textoFinal: string }>(`/pecas/${pecaId}/revisoes/${revisao.id}`) });
  const texto = versao === "ia" ? q.data?.textoGerado : q.data?.textoFinal;
  return (
    <Dialogo aberto aoFechar={aoFechar} titulo={titulo} descricao={`${quem}. ${oQueMudou(revisao)}`} className="dc-dialogo--versoes">
      {revisao.geradaPorIa && (
        <Segmentos
          rotulo="Versão"
          valor={versao}
          aoMudar={setVersao}
          opcoes={[
            { id: "final", rotulo: "Revisada" },
            { id: "ia", rotulo: "Gerada pela IA" },
          ]}
        />
      )}
      {texto != null ? <div className="dc-folha-fundo dc-versao">{folha(texto)}</div> : q.error ? <Faixa tipo="erro">{mensagemDoErro(q.error)}</Faixa> : <Carregando />}
    </Dialogo>
  );
}
