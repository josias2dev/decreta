/**
 * Níveis de automação: o que a IA faz sozinha, o que vira sugestão e o que
 * exige confirmação. Prazo, mensagem ao cliente e valores ficam travados.
 */
import { REGRAS_DE_AUTOMACAO, ROTULO_DO_NIVEL, type NivelDeAutomacao } from "@decreta/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useAviso } from "@/componentes/avisos";
import { Painel } from "@/componentes/ui";
import { api, mensagemDoErro } from "@/lib/api";
import type { Escritorio } from "@/lib/tipos";

export function NiveisDeAutomacao({ e, socio }: { e: Escritorio; socio: boolean }) {
  const qc = useQueryClient();
  const avisar = useAviso();
  const atual = (id: (typeof REGRAS_DE_AUTOMACAO)[number]["id"]) => (e.automacao?.[id] ?? REGRAS_DE_AUTOMACAO.find((r) => r.id === id)!.padrao) as NivelDeAutomacao;
  const salvar = useMutation({
    mutationFn: (mudanca: Record<string, NivelDeAutomacao>) => {
      const configuraveis = Object.fromEntries(REGRAS_DE_AUTOMACAO.filter((r) => !r.travada).map((r) => [r.id, atual(r.id)]));
      return api("/escritorio", { method: "PUT", json: { automacao: { ...configuraveis, ...mudanca } } });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["escritorio"] });
      avisar("Automação salva.");
    },
    onError: (err) => avisar(mensagemDoErro(err), { erro: true }),
  });

  return (
    <Painel titulo="Automação da IA">
      <div className="dc-form">
        <p className="m-0 text-[14px] leading-[22px] text-[var(--tinta-2)]">Escolha o que a IA faz sozinha e o que fica esperando alguém pedir. Prazo, mensagem ao cliente e valores sempre exigem confirmação.</p>
        {REGRAS_DE_AUTOMACAO.map((r) => {
          const nivel = atual(r.id);
          return (
            <fieldset key={r.id} className="dc-automacao">
              <legend className="dc-automacao__nome">{r.nome}</legend>
              <div className="dc-chips" role="radiogroup" aria-label={r.nome}>
                {(Object.keys(r.niveis) as NivelDeAutomacao[]).map((n) => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={nivel === n}
                    className={`dc-chip${nivel === n ? " is-on" : ""}`}
                    disabled={!socio || r.travada || salvar.isPending}
                    onClick={() => nivel !== n && salvar.mutate({ [r.id]: n })}
                  >
                    {ROTULO_DO_NIVEL[n]}
                  </button>
                ))}
              </div>
              <p className="dc-automacao__ajuda">
                {r.niveis[nivel]}
                {r.travada ? " Travado." : ""}
              </p>
            </fieldset>
          );
        })}
      </div>
    </Painel>
  );
}
