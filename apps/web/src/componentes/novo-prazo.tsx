/** Prazo digitado à mão: o motor conta a data final enquanto a pessoa preenche. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useDeferredValue, useState } from "react";
import { api, mensagemDoErro } from "@/lib/api";
import { euQuery } from "@/lib/consultas";
import { diaCompleto, diaDaSemana } from "@/lib/formato";
import type { Contagem, ContagemNaTela, Pagina, ProcessoNaLista } from "@/lib/tipos";
import { useAviso } from "./avisos";
import { Dialogo } from "./dialogo";
import { Botao, Campo, Faixa } from "./ui";

export function EscolherProcesso({ valor, aoEscolher }: { valor: { id: string; titulo: string } | null; aoEscolher: (p: { id: string; titulo: string } | null) => void }) {
  const [q, setQ] = useState("");
  const termo = useDeferredValue(q.trim());
  const r = useQuery({ queryKey: ["processos", "escolher", termo], queryFn: () => api<Pagina<ProcessoNaLista>>(`/processos?busca=${encodeURIComponent(termo)}`), enabled: termo.length >= 2 && !valor });
  if (valor) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--borda-forte)] px-3 py-1.5">
        <span className="truncate font-medium">{valor.titulo}</span>
        <button type="button" className="dc-link" onClick={() => aoEscolher(null)}>
          Trocar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Número, parte ou cliente" aria-label="Buscar processo" autoComplete="off" />
      {termo.length >= 2 && !!r.data?.itens.length && (
        <div className="dc-painel dc-linhas" style={{ maxHeight: 200, overflowY: "auto" }}>
          {r.data.itens.slice(0, 6).map((p) => (
            <button key={p.id} type="button" className="dc-linhas__item w-full cursor-pointer border-0 bg-transparent text-left hover:bg-[var(--superficie-2)]" onClick={() => aoEscolher({ id: p.id, titulo: p.titulo })}>
              <span className="dc-celula">
                <span className="dc-celula__1">{p.titulo}</span>
                <span className="dc-celula__2 dc-num">{p.cnj ?? "Extrajudicial"}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function NovoPrazo({ aberto, aoFechar, processo }: { aberto: boolean; aoFechar: () => void; processo?: { id: string; titulo: string } | null }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const avisar = useAviso();
  const eu = useQuery(euQuery);
  const [proc, setProc] = useState(processo ?? null);
  const [f, setF] = useState({ tipo: "", fundamento: "", dias: "15", contagem: "uteis" as Contagem, publicadoEm: eu.data?.hoje ?? "", responsavelId: "" });
  const dias = Number(f.dias);
  const conta = useQuery({
    queryKey: ["calcular", proc?.id, f.publicadoEm, dias, f.contagem],
    queryFn: () => api<ContagemNaTela>("/prazos/calcular", { json: { processoId: proc?.id ?? null, publicadoEm: f.publicadoEm, dias, contagem: f.contagem } }),
    enabled: aberto && /^\d{4}-\d{2}-\d{2}$/.test(f.publicadoEm) && dias >= 1,
  });
  const criar = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/prazos", {
        json: { processoId: proc!.id, tipo: f.tipo, fundamento: f.fundamento || null, dias, contagem: f.contagem, publicadoEm: f.publicadoEm, responsavelId: f.responsavelId || undefined },
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["prazos"] });
      void qc.invalidateQueries({ queryKey: ["hoje"] });
      void qc.invalidateQueries({ queryKey: ["eu"] });
      avisar("Prazo criado.");
      aoFechar();
      void navigate({ to: "/prazos/$id", params: { id: r.id } });
    },
  });
  return (
    <Dialogo
      aberto={aberto}
      aoFechar={aoFechar}
      titulo="Novo prazo"
      acoes={
        <>
          <Botao variante="fantasma" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao variante="primaria" onClick={() => criar.mutate()} ocupado={criar.isPending} disabled={!proc || f.tipo.trim().length < 2 || !conta.data}>
            Criar prazo
          </Botao>
        </>
      }
    >
      <div className="dc-form">
        <Campo rotulo="Processo">
          <EscolherProcesso valor={proc} aoEscolher={setProc} />
        </Campo>
        <Campo rotulo="O que fazer" htmlFor="np-tipo">
          <input id="np-tipo" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} placeholder="Réplica à contestação" />
        </Campo>
        <div className="dc-grade-2">
          <Campo rotulo="Dias" htmlFor="np-dias">
            <input id="np-dias" inputMode="numeric" value={f.dias} onChange={(e) => setF({ ...f, dias: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
          </Campo>
          <Campo rotulo="Contagem" htmlFor="np-contagem">
            <select id="np-contagem" value={f.contagem} onChange={(e) => setF({ ...f, contagem: e.target.value as Contagem })}>
              <option value="uteis">Dias úteis</option>
              <option value="corridos">Dias corridos</option>
            </select>
          </Campo>
          <Campo rotulo="Publicado em" htmlFor="np-pub">
            <input id="np-pub" type="date" value={f.publicadoEm} onChange={(e) => setF({ ...f, publicadoEm: e.target.value })} />
          </Campo>
          <Campo rotulo="Base legal" htmlFor="np-fund">
            <input id="np-fund" value={f.fundamento} onChange={(e) => setF({ ...f, fundamento: e.target.value })} placeholder="art. 351, CPC" />
          </Campo>
        </div>
        <Campo rotulo="Responsável" htmlFor="np-resp">
          <select id="np-resp" value={f.responsavelId} onChange={(e) => setF({ ...f, responsavelId: e.target.value })}>
            <option value="">Quem cuida do processo</option>
            {eu.data?.equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        {conta.data && (
          <Faixa tipo="ia">
            <span>
              Vence em <strong className="dc-num">{diaCompleto(conta.data.fim)}</strong>, {diaDaSemana(conta.data.fim)}. {conta.data.explicacao}
            </span>
          </Faixa>
        )}
        {criar.error && <Faixa tipo="erro">{mensagemDoErro(criar.error)}</Faixa>}
      </div>
    </Dialogo>
  );
}
