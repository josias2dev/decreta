/**
 * Jeito do escritório: como o escritório faz cada peça (estilo, teses, o que
 * evitar). O gerador de peças segue o geral e o do tipo escolhido.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAviso } from "@/componentes/avisos";
import { Botao, Campo, Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import type { Catalogo, Escritorio, JeitoDaPeca } from "@/lib/tipos";

const VAZIO: JeitoDaPeca = { estilo: "", teses: "", evitar: "" };

export function JeitoDasPecas({ e, socio }: { e: Escritorio; socio: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const catalogo = useQuery({ queryKey: ["pecas", "catalogo"], queryFn: () => api<Catalogo>("/pecas/catalogo"), staleTime: Infinity });
  const [tipo, setTipo] = useState("geral");
  const [rascunho, setRascunho] = useState<Record<string, JeitoDaPeca>>({});
  const atual = rascunho[tipo] ?? e.jeito?.[tipo] ?? VAZIO;
  const mudou = !!rascunho[tipo];
  const salvar = useMutation({
    mutationFn: () => {
      const jeito = { ...(e.jeito ?? {}), [tipo]: atual };
      const comAlgo = Object.fromEntries(Object.entries(jeito).filter(([, j]) => j.estilo.trim() || j.teses.trim() || j.evitar.trim()));
      return api("/escritorio", { method: "PUT", json: { jeito: comAlgo } });
    },
    onSuccess: () => {
      setRascunho(({ [tipo]: _, ...resto }) => resto);
      void qc.invalidateQueries({ queryKey: ["escritorio"] });
      avisar("Jeito da peça salvo. As próximas peças já seguem.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });
  const mudar = (campo: keyof JeitoDaPeca, valor: string) => setRascunho({ ...rascunho, [tipo]: { ...atual, [campo]: valor } });
  const descritos = new Set(Object.keys(e.jeito ?? {}));

  return (
    <Painel titulo="Jeito do escritório">
      <div className="dc-form">
        <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">
          Conte como o escritório faz cada peça. A IA segue o geral em todas e o do tipo na peça daquele tipo. Ela não inventa fato para encaixar uma tese.
        </p>
        <Campo rotulo="Peça" htmlFor="jt-tipo">
          <select id="jt-tipo" value={tipo} onChange={(ev) => setTipo(ev.target.value)}>
            <option value="geral">Todas as peças (geral){descritos.has("geral") ? " · descrito" : ""}</option>
            {catalogo.data?.grupos.map((g) => (
              <optgroup key={g.nome} label={g.nome}>
                {g.tipos.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome}
                    {descritos.has(t.id) ? " · descrito" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Estilo" htmlFor="jt-estilo">
          <textarea id="jt-estilo" rows={3} value={atual.estilo} onChange={(ev) => mudar("estilo", ev.target.value)} disabled={!socio} placeholder="Frases curtas, sem latim. Tópicos numerados. Pedidos em lista." />
        </Campo>
        <Campo rotulo="Teses que o escritório usa" htmlFor="jt-teses">
          <textarea id="jt-teses" rows={3} value={atual.teses} onChange={(ev) => mudar("teses", ev.target.value)} disabled={!socio} placeholder="Na contestação de seguro, a prescrição vem sempre em preliminar." />
        </Campo>
        <Campo rotulo="O que evitar" htmlFor="jt-evitar">
          <textarea id="jt-evitar" rows={3} value={atual.evitar} onChange={(ev) => mudar("evitar", ev.target.value)} disabled={!socio} placeholder="Adjetivos contra o juízo. Citar doutrina sem a obra." />
        </Campo>
        {socio && (
          <div>
            <Botao variante="primaria" onClick={() => salvar.mutate()} ocupado={salvar.isPending} disabled={!mudou}>
              Salvar
            </Botao>
          </div>
        )}
      </div>
    </Painel>
  );
}
