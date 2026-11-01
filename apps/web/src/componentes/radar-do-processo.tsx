/**
 * Radar de precedentes (Fase 5.4): o precedente do BNP que mudou e pode afetar
 * este processo, com o motivo e o link oficial. É um "confira": o advogado lê
 * e descarta o que não serve. Sem aviso, o painel nem aparece.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Radar, X } from "lucide-react";
import { useAviso } from "@/componentes/avisos";
import { Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import type { AvisoDoRadar } from "@/lib/tipos";

export function RadarDoProcesso({ processoId }: { processoId: string }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const chave = ["radar", processoId];
  const radar = useQuery({ queryKey: chave, queryFn: () => api<{ itens: AvisoDoRadar[] }>(`/radar?processo=${processoId}`) });
  const descartar = useMutation({
    mutationFn: (id: string) => api(`/radar/${id}/descartar`, { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: chave }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const itens = radar.data?.itens ?? [];
  if (!itens.length) return null;
  return (
    <Painel titulo="Precedentes" corpo={false}>
      <div className="dc-citacoes">
        <p className="dc-citacoes__nota">O Banco Nacional de Precedentes mudou e pode afetar este processo. Confira antes de agir.</p>
        <ul className="dc-citacoes__lista">
          {itens.map((a) => (
            <li key={a.id} className="dc-citacoes__item dc-citacoes__item--com_ressalva dc-radar__item">
              <Radar aria-hidden />
              <span className="dc-citacoes__texto">
                <strong>{a.rotulo}</strong>
                <span className="dc-citacoes__selo">{a.situacao}</span>
                {a.texto && <span className="dc-radar__texto">{a.texto}</span>}
                <span>{a.motivo}</span>
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  Banco Nacional de Precedentes <ExternalLink aria-hidden />
                </a>
              </span>
              <button type="button" className="dc-btn dc-btn--fantasma dc-btn--sm" aria-label={`Descartar ${a.rotulo}`} title="Não afeta este processo" onClick={() => descartar.mutate(a.id)} disabled={descartar.isPending}>
                <X />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Painel>
  );
}
