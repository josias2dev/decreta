import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import * as D from "@radix-ui/react-dialog";
import { ArrowLeft, FolderOpen, Search, User } from "lucide-react";
import { useDeferredValue, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCelular } from "@/lib/celular";
import { telefone } from "@/lib/formato";
import type { Busca as Resultado } from "@/lib/tipos";
import { cn } from "@/lib/util";

/** Busca do menu: processo por número, partes ou título; cliente por nome, CPF/CNPJ ou telefone. */
export function Busca({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const celular = useCelular();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const termo = useDeferredValue(q.trim());
  useEffect(() => {
    if (!aberta) setQ("");
  }, [aberta]);
  const r = useQuery({
    queryKey: ["busca", termo],
    queryFn: () => api<Resultado>(`/busca?q=${encodeURIComponent(termo)}`),
    enabled: aberta && termo.length >= 2,
    placeholderData: (anterior) => anterior,
  });
  const ir = (destino: { to: "/processos/$id" | "/clientes/$id"; id: string }) => {
    aoFechar();
    void navigate({ to: destino.to, params: { id: destino.id } });
  };
  const nada = termo.length >= 2 && r.data && !r.data.processos.length && !r.data.clientes.length;
  return (
    <D.Root open={aberta} onOpenChange={(v) => !v && aoFechar()}>
      <D.Portal>
        <D.Overlay className="dc-veu-dialogo" />
        <D.Content className={cn("dc-dialogo dc-dialogo--busca", celular && "dc-celular")}>
          <D.Title className="sr-only">Buscar</D.Title>
          <D.Description className="sr-only">Processos e clientes do escritório</D.Description>
          <div className="dc-busca-campo">
            {celular ? (
              <button type="button" className="dc-btn dc-btn--fantasma" style={{ width: 44, padding: 0, marginLeft: -12 }} aria-label="Fechar" onClick={aoFechar}>
                <ArrowLeft />
              </button>
            ) : (
              <Search />
            )}
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número do processo, parte, cliente, CPF ou telefone" aria-label="Buscar" />
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: celular ? undefined : "60vh" }}>
            {termo.length < 2 && <p className="dc-nota" style={{ padding: "14px 16px", margin: 0 }}>Digite pelo menos 2 letras ou números.</p>}
            {nada && <p className="dc-nota" style={{ padding: "14px 16px", margin: 0 }}>Nada encontrado para “{termo}”.</p>}
            {!!r.data?.processos.length && (
              <div className="dc-busca-grupo">
                <div className="dc-busca-grupo__titulo">Processos</div>
                <div className="dc-linhas">
                  {r.data.processos.map((p) => (
                    <button key={p.id} type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => ir({ to: "/processos/$id", id: p.id })}>
                      <FolderOpen size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
                      <span className="dc-celula">
                        <span className="dc-celula__1">{p.titulo}</span>
                        <span className="dc-celula__2 dc-num">{[p.cnj, p.orgao].filter(Boolean).join(" · ")}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {!!r.data?.clientes.length && (
              <div className="dc-busca-grupo">
                <div className="dc-busca-grupo__titulo">Clientes</div>
                <div className="dc-linhas">
                  {r.data.clientes.map((c) => (
                    <button key={c.id} type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => ir({ to: "/clientes/$id", id: c.id })}>
                      <User size={16} className="mt-0.5 flex-none text-[var(--tinta-3)]" />
                      <span className="dc-celula">
                        <span className="dc-celula__1">{c.nome}</span>
                        {c.telefone && <span className="dc-celula__2 dc-num">{telefone(c.telefone)}</span>}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}
