/**
 * Leitura da peça contrária: a contestação ou o recurso da outra parte vira
 * pontos a rebater, ligados ao prazo. A peça gerada para o prazo leva esses
 * pontos junto.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { FontesDoProcesso, TextoComFontes } from "@/componentes/fontes";
import { BlocoIa, Botao, SecaoIa } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import type { Analise, Documento, LeituraDaPecaContraria } from "@/lib/tipos";

export function PecaContraria({ prazoId, processoId, analise, comIa }: { prazoId: string; processoId: string; analise: Analise<LeituraDaPecaContraria> | null; comIa: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const docs = useQuery({ queryKey: ["documentos", "processo", processoId], queryFn: () => api<{ itens: Documento[] }>(`/documentos?processo=${processoId}`), enabled: comIa });
  const legiveis = (docs.data?.itens ?? []).filter((d) => !d.semTexto);
  const [escolhido, setEscolhido] = useState("");
  const documentoId = escolhido || legiveis[0]?.id || "";
  const ler = useMutation({
    mutationFn: () => api(`/ia/peca-contraria/${prazoId}`, { json: { documentoId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prazo", prazoId] }),
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  if (!analise && (!comIa || legiveis.length === 0)) return null;
  const c = analise?.situacao === "pronto" ? analise.conteudo : null;

  return (
    <BlocoIa titulo="Peça da outra parte" analise={analise} avisoDesatualizada="Chegou novidade nos autos depois desta leitura.">
      {c && (
        <FontesDoProcesso processoId={processoId}>
          <SecaoIa titulo={c.peca}>
            <p>{c.pedidos}</p>
          </SecaoIa>
          <SecaoIa titulo="Pontos a rebater">
            <ol className="dc-rebater" aria-label="Pontos a rebater">
              {c.pontos.map((p, i) => (
                <li key={i}>
                  <span className="dc-rebater__tese">
                    {p.tese} <TextoComFontes texto={p.fonte} />
                  </span>
                  <span className="dc-rebater__como">Como rebater: {p.rebater}</span>
                </li>
              ))}
            </ol>
          </SecaoIa>
        </FontesDoProcesso>
      )}
      {!analise && <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">Escolha a contestação ou o recurso da outra parte: a IA lista o que precisa de resposta e como rebater, e a peça deste prazo já leva esses pontos.</p>}
      {comIa && legiveis.length > 0 && (
        <div className="dc-linha-acoes">
          <label className="dc-campo dc-rebater__escolha">
            <select value={documentoId} onChange={(e) => setEscolhido(e.target.value)} aria-label="Peça da outra parte">
              {legiveis.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.evento != null ? `Evento ${d.evento} · ${d.nome}` : d.nome}
                </option>
              ))}
            </select>
          </label>
          <Botao variante="fantasma" pequeno onClick={() => ler.mutate()} ocupado={ler.isPending} disabled={!documentoId}>
            {analise ? "Ler de novo" : "Ler a peça"}
          </Botao>
        </div>
      )}
    </BlocoIa>
  );
}
