/**
 * A fonte de cada afirmação da IA vira um toque: "(evento 87, fl. 3)" abre o
 * documento do evento 87 na folha 3. A conferência leva segundos em vez de
 * minutos, e é isso que torna "a pessoa confirma" viável.
 */
import { documentoDaFonte, extrairFontes } from "@decreta/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { createContext, useContext, type ReactNode } from "react";
import { api } from "@/lib/api";
import type { Documento } from "@/lib/tipos";

const Documentos = createContext<Documento[]>([]);

/** Os documentos do processo, para as fontes das análises abaixo virarem links. */
export function FontesDoProcesso({ processoId, children }: { processoId: string; children: ReactNode }) {
  const docs = useQuery({ queryKey: ["documentos", "processo", processoId], queryFn: () => api<{ itens: Documento[] }>(`/documentos?processo=${processoId}`) });
  return <Documentos.Provider value={docs.data?.itens ?? []}>{children}</Documentos.Provider>;
}

/** O texto da IA com cada fonte que casa com um documento do processo virando link. */
export function TextoComFontes({ texto }: { texto: string }) {
  const docs = useContext(Documentos);
  const fontes = docs.length ? extrairFontes(texto) : [];
  if (!fontes.length) return <>{texto}</>;
  const partes: ReactNode[] = [];
  let desde = 0;
  for (const f of fontes) {
    const alvo = documentoDaFonte(f, docs);
    if (!alvo) continue;
    partes.push(texto.slice(desde, f.inicio));
    const rotulo = alvo.pagina ? `Abrir o documento na folha ${alvo.pagina}` : "Abrir o documento";
    partes.push(
      <Link key={f.inicio} to="/documentos" search={{ doc: alvo.id, ...(alvo.pagina ? { pagina: alvo.pagina } : {}) }} className="dc-fonte" title={rotulo} aria-label={`${f.trecho}: ${rotulo.toLowerCase()}`}>
        {f.trecho}
      </Link>,
    );
    desde = f.inicio + f.trecho.length;
  }
  partes.push(texto.slice(desde));
  return <>{partes}</>;
}
