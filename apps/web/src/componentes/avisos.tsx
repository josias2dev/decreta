import { CircleAlert, Check } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useCelular } from "@/lib/celular";
import { cn } from "@/lib/util";

type Aviso = { id: number; texto: string; erro?: boolean };
const Contexto = createContext<(texto: string, opcoes?: { erro?: boolean }) => void>(() => {});

/** Avisos curtos que somem sozinhos ("Prazo confirmado."). */
export function Avisos({ children }: { children: ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const celular = useCelular();
  const avisar = useCallback((texto: string, opcoes?: { erro?: boolean }) => {
    const id = Date.now() + Math.random();
    setAvisos((a) => [...a.slice(-2), { id, texto, erro: opcoes?.erro }]);
    setTimeout(() => setAvisos((a) => a.filter((x) => x.id !== id)), opcoes?.erro ? 6000 : 3500);
  }, []);
  return (
    <Contexto.Provider value={avisar}>
      {children}
      <div className={cn("dc-avisos", celular && "dc-celular")} role="status" aria-live="polite">
        {avisos.map((a) => (
          <div key={a.id} className={cn("dc-aviso", a.erro && "dc-aviso--erro")}>
            {a.erro ? <CircleAlert /> : <Check />}
            {a.texto}
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

export const useAviso = () => useContext(Contexto);
