import { CircleAlert, Check, X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useCelular } from "@/lib/celular";
import { cn } from "@/lib/util";

/** `fixo`: o que a pessoa não pode deixar de ver (o prazo que não foi confirmado) fica até ela fechar. `acao`: o caminho para resolver. */
type Opcoes = { erro?: boolean; fixo?: boolean; acao?: { rotulo: string; fazer: () => void } };
type Aviso = Opcoes & { id: number; texto: string };
const Contexto = createContext<(texto: string, opcoes?: Opcoes) => void>(() => {});

/** Avisos curtos que somem sozinhos ("Prazo confirmado."). */
export function Avisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const celular = useCelular();
  const fechar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback(
    (texto: string, opcoes?: Opcoes) => {
      const id = Date.now() + Math.random();
      // Aviso novo empurra os antigos que somem sozinhos, nunca um fixo.
      setAvisos((a) => [...a.filter((x) => x.fixo), ...a.filter((x) => !x.fixo).slice(-2), { ...opcoes, id, texto }]);
      if (!opcoes?.fixo) setTimeout(() => fechar(id), opcoes?.erro ? 6000 : 3500);
    },
    [fechar],
  );
  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className={cn("dc-avisos", celular && "dc-celular")} role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={cn("dc-aviso", a.erro && "dc-aviso--erro")} role={a.fixo ? "alert" : undefined}>
            {a.erro ? <CircleAlert /> : <Check />}
            <span className="dc-aviso__texto">{a.texto}</span>
            {a.acao && (
              <button
                type="button"
                className="dc-aviso__acao"
                onClick={() => {
                  fechar(a.id);
                  a.acao!.fazer();
                }}
              >
                {a.acao.rotulo}
              </button>
            )}
            {a.fixo && (
              <button type="button" className="dc-aviso__fechar" aria-label="Fechar o aviso" onClick={() => fechar(a.id)}>
                <X />
              </button>
            )}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export const useAviso = () => useContext(Contexto);
