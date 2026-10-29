import * as D from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { useCelular } from "@/lib/celular";
import { cn } from "@/lib/util";

/** Diálogo do Decreta: no centro no computador, folha que sobe de baixo no celular. */
export function Dialogo({
  aberto,
  aoFechar,
  titulo,
  descricao,
  children,
  acoes,
  className,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  descricao?: ReactNode;
  children?: ReactNode;
  acoes?: ReactNode;
  className?: string;
}) {
  const celular = useCelular();
  return (
    <D.Root open={aberto} onOpenChange={(v) => !v && aoFechar()}>
      <D.Portal>
        <D.Overlay className="dc-veu-dialogo" />
        <D.Content className={cn("dc-dialogo", celular && "dc-celular", className)} aria-describedby={descricao ? undefined : undefined}>
          <div className="flex flex-col gap-1">
            <D.Title className="dc-dialogo__titulo">{titulo}</D.Title>
            {descricao ? <D.Description className="dc-dialogo__texto">{descricao}</D.Description> : <D.Description className="sr-only">{titulo}</D.Description>}
          </div>
          {children}
          {acoes && <div className="dc-dialogo__acoes">{acoes}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

export { D as Radix };
