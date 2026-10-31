/**
 * Os limites da IA à vista: quanto resta de mensagens e do uso do dia, e o
 * aviso antes de a IA barrar (perto do limite) ou de por que barrou.
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Painel } from "@/componentes/ui";
import { api } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import type { UsoDaIa } from "@/lib/tipos";

/** Muda a cada mensagem: quem manda invalida. */
export const usoDaIaQuery = { queryKey: ["ia", "uso"], queryFn: () => api<UsoDaIa>("/ia/uso") } as const;

function useUsoDaIa() {
  const eu = useQuery(euQuery);
  return useQuery({ ...usoDaIaQuery, enabled: !!eu.data?.ia });
}

/** Em cima do campo do chat, só quando falta pouco (ou acabou). */
export function AvisoDoLimite() {
  const aviso = useUsoDaIa().data?.aviso;
  if (!aviso) return null;
  return (
    <p className="dc-aviso-limite" role="status">
      <CircleAlert aria-hidden /> {aviso}
    </p>
  );
}

/** Na Conta: o que a pessoa já usou da IA hoje. */
export function UsoDaIaHoje() {
  const uso = useUsoDaIa().data;
  if (!uso || (!uso.mensagens && uso.gasto === null)) return null;
  const { mensagens, gasto } = uso;
  return (
    <Painel titulo="IA hoje" acao={<span className="dc-nota">Renova à meia-noite</span>}>
      <div className="dc-uso-hoje">
        {mensagens && (
          <div className="dc-uso-hoje__linha">
            <span>Mensagens no chat</span>
            <strong className="dc-num">{mensagens.restam === 1 ? "Resta 1" : `Restam ${mensagens.restam}`} de {mensagens.limite}</strong>
          </div>
        )}
        {gasto !== null && (
          <div className="dc-uso-hoje__linha">
            <span>Uso da IA</span>
            <strong className="dc-num">{Math.round(gasto * 100)}% do limite do dia</strong>
            <span className="dc-uso-hoje__barra" aria-hidden>
              <span style={{ transform: `scaleX(${gasto})` }} />
            </span>
          </div>
        )}
        {uso.aviso && <p className="dc-aviso-limite">{uso.aviso}</p>}
      </div>
    </Painel>
  );
}
