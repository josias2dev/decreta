/**
 * O processo salvo sem o número: a marca de incompleto e não monitorado, e a
 * busca do número nas publicações que o Decreta já leu. O número também pode ser
 * digitado. Salvo o número, o monitoramento começa sozinho.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { diaCompleto, juntar } from "@/lib/formato";
import type { CandidatoAoNumero, Processo } from "@/lib/tipos";
import { useAviso } from "./avisos";
import { Dialogo } from "./dialogo";
import { Botao, Campo, Carregando, Faixa, Selo } from "./ui";

/** O selo das listas. */
export function SeloDeIncompleto() {
  return <Selo urgencia="breve">Incompleto · não monitorado</Selo>;
}

export function AvisoDeIncompleto({ processo: p }: { processo: Processo }) {
  const [aberto, setAberto] = useState(false);
  if (!p.incompleto) return null;
  return (
    <>
      <Faixa tipo="aviso">
        <CircleAlert />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-2 md:flex-row md:items-center md:gap-4">
          <span className="min-w-0 flex-1">
            <strong>Processo incompleto e não monitorado.</strong> Falta {juntar(p.incompleto.faltam)}. Sem o número, o Decreta não traz os andamentos do DataJud nem liga as publicações do DJEN a este processo.
          </span>
          <Botao pequeno className="flex-none" onClick={() => setAberto(true)}>
            Buscar o número
          </Botao>
        </span>
      </Faixa>
      <BuscarNumero processoId={p.id} aberto={aberto} aoFechar={() => setAberto(false)} />
    </>
  );
}

function BuscarNumero({ processoId, aberto, aoFechar }: { processoId: string; aberto: boolean; aoFechar: () => void }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const [digitado, setDigitado] = useState("");
  const achados = useQuery({ queryKey: ["processo", processoId, "numero"], queryFn: () => api<{ candidatos: CandidatoAoNumero[] }>(`/processos/${processoId}/numero`), enabled: aberto });
  const salvar = useMutation({
    mutationFn: (cnj: string) => api(`/processos/${processoId}`, { method: "PUT", json: { cnj } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["processo", processoId] });
      void qc.invalidateQueries({ queryKey: ["processos"] });
      void qc.invalidateQueries({ queryKey: ["publicacoes"] });
      avisar("Número salvo. O Decreta passa a acompanhar este processo.");
      setDigitado("");
      aoFechar();
    },
  });
  const candidatos = achados.data?.candidatos ?? [];
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Buscar o número"
      descricao="Procurei o nome das partes nas publicações que o Decreta já leu pelas OABs da equipe e que ainda não têm processo."
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => salvar.mutate(digitado)} ocupado={salvar.isPending} disabled={digitado.replace(/\D/g, "").length !== 20}>
            Salvar o número
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        {achados.isPending ? (
          <Carregando linhas={2} />
        ) : achados.isError ? (
          <Faixa tipo="erro">Não consegui procurar agora. {mensagemDoErro(achados.error)}</Faixa>
        ) : candidatos.length ? (
          <div className="dc-painel dc-linhas">
            {candidatos.map((c) => (
              <div key={c.cnj} className="dc-linhas__item items-center">
                <span className="dc-celula min-w-0 flex-1">
                  <span className="dc-celula__1 dc-num">{c.cnj}</span>
                  <span className="dc-celula__2">
                    {[c.orgao, c.tribunal].filter(Boolean).join(" · ")}
                    {" · "}
                    {diaCompleto(c.dia)} · cita {c.nome}
                  </span>
                </span>
                <Botao pequeno onClick={() => salvar.mutate(c.cnj)} disabled={salvar.isPending}>
                  Usar este número
                </Botao>
              </div>
            ))}
          </div>
        ) : (
          <p className="dc-nota m-0">Nenhuma publicação lida combina com este processo. O número está na capa dos autos ou no sistema do tribunal.</p>
        )}
        <Campo rotulo="Número do processo (CNJ)" htmlFor="bn-cnj">
          <input id="bn-cnj" className="dc-num" inputMode="numeric" value={digitado} onChange={(e) => setDigitado(e.target.value)} placeholder="0000000-00.0000.0.00.0000" />
        </Campo>
        {salvar.error && <Faixa tipo="erro">{mensagemDoErro(salvar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
