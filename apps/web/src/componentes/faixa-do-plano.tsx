/**
 * O aviso do plano. Quando o teste vai acabar, a fatura está atrasada ou o escritório está só para leitura, a
 * publicação do DJEN deixa de chegar: por isso a faixa aparece em toda tela, no alto, com a data do próximo
 * passo, antes de acontecer e enquanto durar. Durante o teste em andamento há só um aviso discreto, no Hoje.
 */
import { Link } from "@tanstack/react-router";
import { CircleAlert, Info } from "lucide-react";
import type { AvisoDoPlano } from "@/lib/tipos";
import { cn } from "@/lib/util";
import { TextoComDatas } from "./plano";
import { Faixa } from "./ui";

/** A faixa de toda tela: só o que vai acontecer (`atencao`) ou já está acontecendo (`grave`). */
export function FaixaDoPlano({ aviso }: { aviso: AvisoDoPlano | null | undefined }) {
  if (!aviso || aviso.nivel === "info") return null;
  return (
    <div className={cn("dc-faixa-plano", aviso.nivel === "grave" && "dc-faixa-plano--grave")} role="status" data-nivel={aviso.nivel}>
      <CircleAlert aria-hidden />
      <span className="dc-faixa-plano__texto">
        <TextoComDatas texto={aviso.texto} />
      </span>
      <Link to="/configuracoes" search={{ aba: "plano" }} className="dc-link flex-none">
        Ver o plano
      </Link>
    </div>
  );
}

/** No Hoje, durante o teste: um aviso discreto. */
export function AvisoDoTeste({ aviso }: { aviso: AvisoDoPlano | null | undefined }) {
  if (!aviso || aviso.nivel !== "info") return null;
  return (
    <Faixa tipo="nota">
      <Info aria-hidden />
      <span className="flex-1">
        <TextoComDatas texto={aviso.texto} />
      </span>
      <Link to="/configuracoes" search={{ aba: "plano" }} className="dc-link flex-none">
        Ver o plano
      </Link>
    </Faixa>
  );
}
